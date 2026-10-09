import itertools
import json
from decimal import Decimal
from unittest.mock import patch

from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.audit.models import AuditLog
from apps.catalog.models import Material, UnitOfMeasure
from apps.formulas import requirement_preview as rp
from apps.formulas.models import Formula, FormulaLine, FormulaRevision
from apps.formulas.services import update_formula_revision
from tests import test_formulas as tf

_n = itertools.count()
FORBIDDEN_KEYS = {"can_produce", "approved", "available_stock", "shortage", "stock", "reserved", "is_approved"}


def all_keys(value):
    if isinstance(value, dict):
        for key, inner in value.items():
            yield key
            yield from all_keys(inner)
    elif isinstance(value, list):
        for inner in value:
            yield from all_keys(inner)


class PreviewBase(tf.Base):
    def setUp(self):
        super().setUp()
        n = next(_n)
        self.raw_a = self.raw
        self.raw_b = self.raw2
        self.raw_c = tf.make_material(f"RC{n}", "RAW_MATERIAL", self.mass_unit)
        self.caps = tf.make_material(f"CAP{n}", "PACKAGING_MATERIAL", self.count_unit)
        self.labels = tf.make_material(f"LBL{n}", "PACKAGING_MATERIAL", self.count_unit)
        self.cartons = tf.make_material(f"CTN{n}", "PACKAGING_MATERIAL", self.count_unit)
        self.mass_product = tf.make_product(self.company, "PMASS", self.mass_unit, self.superuser)

    # -- fixtures (synthetic arithmetic only; not real formulations) --------
    def client_example(self, **overrides):
        """Base output 100; A=10, B=5, C=8 (RAW, kg); caps 25, labels 500, cartons 500 (PACKAGING, COUNT)."""
        formula = self.make_formula(base_output_quantity="100", **overrides)
        revision = formula["revisions"][0]
        lines = [
            self.line(self.raw_a, "10"), self.line(self.raw_b, "5"), self.line(self.raw_c, "8"),
            self.line(self.caps, "25"), self.line(self.labels, "500"), self.line(self.cartons, "500"),
        ]
        response = self.edit_rev(formula, revision, {"expected_version": 1, "lines": lines})
        self.assertEqual(response.status_code, 200, response.content)
        return formula, response.json()

    def url(self, formula, revision, query="", company_id=None):
        return (
            tf.revision_url(company_id or self.company.id, formula["id"], revision["id"])
            + "requirement-preview/" + query
        )

    def preview(self, formula, revision, target="500", token=None, company_id=None):
        query = f"?target_output_quantity={target}" if target is not None else ""
        return tf.get_json(self.client_, self.url(formula, revision, query, company_id), token or self.token)

    def by_code(self, body):
        return {row["material_code"]: row for row in body["lines"]}

    def state(self, formula, revision):
        f = Formula.objects.get(pk=formula["id"])
        r = FormulaRevision.objects.get(pk=revision["id"])
        lines = list(FormulaLine.objects.filter(revision_id=revision["id"]).order_by("id").values())
        return f.version, f.updated_at, r.version, r.updated_at, r.base_output_quantity, lines


class AccessTests(PreviewBase):
    def test_authorized_user_gets_the_preview(self):
        formula, revision = self.client_example()
        response = self.preview(formula, revision)
        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        self.assertEqual(body["formula"]["id"], formula["id"])
        self.assertEqual(body["revision"]["id"], revision["id"])

    def test_anonymous_no_membership_missing_permission_and_no_superuser_bypass(self):
        formula, revision = self.client_example()
        self.assertEqual(self.client_.get(self.url(formula, revision, "?target_output_quantity=5")).status_code, 401)
        outsider = tf.make_user("poutsider")
        self.assertEqual(self.preview(formula, revision, token=tf.token_for(outsider)).status_code, 404)
        self.assertEqual(self.preview(formula, revision, token=tf.token_for(self.superuser)).status_code, 404)
        member = tf.make_user("pmember")
        tf.assign_company_membership(actor=self.superuser, user=member, company=self.company)
        response = self.preview(formula, revision, token=tf.token_for(member))
        self.assertEqual(response.status_code, 403)
        self.assertIn("formulas.view", response.json()["detail"])

    def test_create_and_edit_without_view_are_denied(self):
        formula, revision = self.client_example()
        other = tf.make_user("pcreateedit")
        tf.grant(self.superuser, other, self.company, "formulas.create", "formulas.edit")
        self.assertEqual(self.preview(formula, revision, token=tf.token_for(other)).status_code, 403)

    def test_view_only_is_enough(self):
        formula, revision = self.client_example()
        viewer = tf.make_user("pviewer")
        tf.grant(self.superuser, viewer, self.company, "formulas.view")
        self.assertEqual(self.preview(formula, revision, token=tf.token_for(viewer)).status_code, 200)

    def test_company_isolation_and_cross_parent_ids(self):
        formula, revision = self.client_example()
        tf.grant(self.superuser, self.user, self.other_company, *tf.ALL_PERMS)
        self.assertEqual(self.preview(formula, revision, company_id=self.other_company.id).status_code, 404)
        other_formula = self.make_formula(code="OTHER")
        cross = tf.get_json(
            self.client_,
            tf.revision_url(self.company.id, formula["id"], other_formula["revisions"][0]["id"])
            + "requirement-preview/?target_output_quantity=5",
            self.token,
        )
        self.assertEqual(cross.status_code, 404)
        missing = tf.get_json(
            self.client_,
            tf.revision_url(self.company.id, formula["id"], 999999) + "requirement-preview/?target_output_quantity=5",
            self.token,
        )
        self.assertEqual(missing.status_code, 404)
        self.company.is_active = False
        self.company.save(update_fields=["is_active"])
        self.assertEqual(self.preview(formula, revision).status_code, 404)

    def test_only_get_is_supported(self):
        formula, revision = self.client_example()
        url = self.url(formula, revision, "?target_output_quantity=5")
        self.assertEqual(tf.post_json(self.client_, url, {}, self.token).status_code, 405)
        self.assertEqual(tf.patch_json(self.client_, url, {"expected_version": 1}, self.token).status_code, 405)
        self.assertEqual(self.client_.put(url, data="{}", content_type="application/json", **tf.bearer(self.token)).status_code, 405)
        self.assertEqual(self.client_.delete(url, **tf.bearer(self.token)).status_code, 405)


class CalculationTests(PreviewBase):
    def required(self, body):
        return {code: row["required_quantity"]["value"] for code, row in self.by_code(body).items()}

    def test_scale_up_by_five(self):
        formula, revision = self.client_example()
        body = self.preview(formula, revision, "500").json()
        got = self.required(body)
        self.assertEqual(
            [got[m.code] for m in (self.raw_a, self.raw_b, self.raw_c, self.caps, self.labels, self.cartons)],
            ["50", "25", "40", "125", "2500", "2500"],
        )
        self.assertEqual(body["scale_factor"]["value"], "5")
        self.assertTrue(body["scale_factor"]["is_exact"])
        self.assertEqual(body["target_output_quantity"], "500")
        self.assertTrue(all(r["required_quantity"]["is_exact"] and r["required_quantity"]["is_whole_number"] for r in body["lines"]))
        self.assertEqual(body["warnings"], [])
        self.assertTrue(body["calculation_complete"])

    def test_scale_down_by_half_and_fractional_count_warning(self):
        formula, revision = self.client_example()
        body = self.preview(formula, revision, "50").json()
        got = self.required(body)
        self.assertEqual(
            [got[m.code] for m in (self.raw_a, self.raw_b, self.raw_c, self.caps, self.labels, self.cartons)],
            ["5", "2.5", "4", "12.5", "250", "250"],
        )
        self.assertEqual(body["scale_factor"]["value"], "0.5")
        warnings = [w for w in body["warnings"] if w["code"] == "FRACTIONAL_COUNT_REQUIREMENT"]
        self.assertEqual(len(warnings), 1)
        self.assertEqual(warnings[0]["required_quantity"], "12.5")  # not rounded
        self.assertEqual(warnings[0]["line_number"], 4)
        caps = self.by_code(body)[self.caps.code]
        self.assertFalse(caps["required_quantity"]["is_whole_number"])
        # a fractional MASS requirement is normal and gets no warning
        self.assertNotIn(self.raw_b.code, [w.get("line_number") for w in warnings])

    def test_target_equal_to_base_is_factor_one(self):
        formula, revision = self.client_example()
        body = self.preview(formula, revision, "100").json()
        self.assertEqual(body["scale_factor"]["value"], "1")
        self.assertEqual(self.required(body)[self.raw_a.code], "10")
        self.assertEqual([r["base_line_quantity"] for r in body["lines"]][:2], ["10.000", "5.000"])

    def test_decimal_quantities_terminating(self):
        formula = self.make_formula(base_output_quantity="40", code="DEC")
        revision = formula["revisions"][0]
        self.edit_rev(formula, revision, {"expected_version": 1, "lines": [self.line(self.raw_a, "2.500")]})
        body = self.preview(formula, self.edit_rev(formula, revision, {"expected_version": 2, "notes": "x"}).json(), "10").json()
        self.assertEqual(self.by_code(body)[self.raw_a.code]["required_quantity"]["value"], "0.625")
        self.assertTrue(self.by_code(body)[self.raw_a.code]["required_quantity"]["is_exact"])

    def test_non_terminating_ratio_is_approximate_and_never_claimed_exact(self):
        formula = self.make_formula(base_output_quantity="3", code="THIRD")
        revision = formula["revisions"][0]
        self.edit_rev(formula, revision, {"expected_version": 1, "lines": [self.line(self.raw_a, "1"), self.line(self.pack, "1")]})
        body = self.preview(formula, revision, "1").json()
        self.assertEqual(body["scale_factor"]["value"], "0." + "3" * rp.DISPLAY_SIGNIFICANT_DIGITS)
        self.assertFalse(body["scale_factor"]["is_exact"])
        self.assertTrue(body["scale_factor"]["is_approximate"])
        raw = self.by_code(body)[self.raw_a.code]["required_quantity"]
        self.assertEqual(raw["value"], "0." + "3" * rp.DISPLAY_SIGNIFICANT_DIGITS)
        self.assertEqual((raw["is_exact"], raw["is_approximate"], raw["is_whole_number"]), (False, True, False))
        self.assertEqual(body["preview"]["calculation"]["display_significant_digits"], 50)
        self.assertFalse(body["preview"]["calculation"]["operational_rounding_applied"])
        self.assertEqual([w["code"] for w in body["warnings"]], ["FRACTIONAL_COUNT_REQUIREMENT"])

    def test_fractional_detection_uses_the_exact_ratio_not_a_display_value(self):
        formula = self.make_formula(product_id=self.mass_product.id, code="TINY", base_output_quantity="99999999999.999")
        revision = formula["revisions"][0]
        self.edit_rev(formula, revision, {"expected_version": 1, "lines": [self.line(self.caps, "1")]})
        body = self.preview(formula, revision, "1").json()
        row = self.by_code(body)[self.caps.code]["required_quantity"]
        self.assertFalse(row["is_whole_number"])
        self.assertGreater(Decimal(row["value"]), 0)
        self.assertTrue(row["value"].startswith("0.00000000001"))
        self.assertEqual([w["code"] for w in body["warnings"]], ["FRACTIONAL_COUNT_REQUIREMENT"])

    def test_almost_whole_count_result_is_still_flagged(self):
        formula = self.make_formula(product_id=self.mass_product.id, code="ALMOST", base_output_quantity="99999999999.999")
        revision = formula["revisions"][0]
        self.edit_rev(formula, revision, {"expected_version": 1, "lines": [self.line(self.caps, "99999999999")]})
        body = self.preview(formula, revision, "99999999999.998").json()
        row = self.by_code(body)[self.caps.code]["required_quantity"]
        self.assertFalse(row["is_whole_number"])
        self.assertNotEqual(Decimal(row["value"]) % 1, 0)
        self.assertEqual([w["code"] for w in body["warnings"]], ["FRACTIONAL_COUNT_REQUIREMENT"])

    def test_fractional_target_allowed_for_a_mass_output_and_flagged_for_count_material(self):
        formula = self.make_formula(product_id=self.mass_product.id, code="MASSOUT", base_output_quantity="10")
        revision = formula["revisions"][0]
        self.edit_rev(formula, revision, {"expected_version": 1, "lines": [self.line(self.raw_a, "3"), self.line(self.caps, "5")]})
        body = self.preview(formula, revision, "0.5").json()
        self.assertEqual(self.by_code(body)[self.raw_a.code]["required_quantity"]["value"], "0.15")
        self.assertEqual(self.by_code(body)[self.caps.code]["required_quantity"]["value"], "0.25")
        self.assertEqual([w["code"] for w in body["warnings"]], ["FRACTIONAL_COUNT_REQUIREMENT"])
        self.assertEqual(body["revision"]["output_unit"]["dimension"], "MASS")

    def test_raw_only_and_packaging_only_formulas(self):
        raw_only = self.make_formula(code="RAWONLY", base_output_quantity="10")
        self.edit_rev(raw_only, raw_only["revisions"][0], {"expected_version": 1, "lines": [self.line(self.raw_a, "2")]})
        body = self.preview(raw_only, raw_only["revisions"][0], "20").json()
        self.assertEqual((body["raw_line_count"], body["packaging_line_count"]), (1, 0))
        self.assertEqual(body["lines"][0]["material_type"], "RAW_MATERIAL")
        self.assertTrue(body["calculation_complete"])
        pack_only = self.make_formula(code="PACKONLY", base_output_quantity="10")
        self.edit_rev(pack_only, pack_only["revisions"][0], {"expected_version": 1, "lines": [self.line(self.caps, "4")]})
        body = self.preview(pack_only, pack_only["revisions"][0], "20").json()
        self.assertEqual((body["raw_line_count"], body["packaging_line_count"]), (0, 1))
        self.assertEqual(body["lines"][0]["material_type"], "PACKAGING_MATERIAL")
        self.assertTrue(body["calculation_complete"])

    def test_empty_formula_is_an_explicit_incomplete_preview(self):
        formula = self.make_formula(code="EMPTY")
        body = self.preview(formula, formula["revisions"][0], "500").json()
        self.assertEqual(body["lines"], [])
        self.assertFalse(body["calculation_complete"])
        self.assertEqual([i["code"] for i in body["calculation_issues"]], ["EMPTY_FORMULA"])
        self.assertIn("not a complete material requirement", body["calculation_issues"][0]["message"])

    def test_a_line_that_cannot_be_calculated_is_reported_never_silently_skipped(self):
        # The database forbids a non-positive stored quantity, so this defensive path is exercised
        # directly on the pure builder with an in-memory corrupted line.
        formula, revision = self.client_example()
        loaded, lines = rp.load_consistent_revision(revision["id"])
        lines[1].quantity = Decimal("0")
        body = rp.build_requirement_preview(loaded, lines, Decimal("500"))
        self.assertFalse(body["calculation_complete"])
        issue = [i for i in body["calculation_issues"] if i["code"] == "LINE_NOT_CALCULATED"]
        self.assertEqual([i["line_number"] for i in issue], [2])
        self.assertEqual(len(body["lines"]), 5)
        self.assertNotIn(lines[1].id, [row["id"] for row in body["lines"]])
        self.assertEqual(
            FormulaLine.objects.get(pk=lines[1].id).quantity, Decimal("5.000")
        )  # nothing persisted

    def test_the_database_forbids_non_positive_stored_line_quantities(self):
        from django.db import IntegrityError, transaction

        formula, revision = self.client_example()
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                FormulaLine.objects.filter(revision_id=revision["id"], line_number=2).update(quantity=Decimal("0"))

    def test_stored_lines_are_never_rescaled(self):
        formula, revision = self.client_example()
        before = self.state(formula, revision)
        self.preview(formula, revision, "500")
        self.preview(formula, revision, "50")
        self.assertEqual(self.state(formula, revision), before)
        stored = tf.get_json(self.client_, tf.revision_url(self.company.id, formula["id"], revision["id"]), self.token).json()
        self.assertEqual([l["quantity"] for l in stored["lines"]][:3], ["10.000", "5.000", "8.000"])


class LabelClaimCalculationTests(PreviewBase):
    """calculation_mode=AS_PER_LABEL_CLAIM: required = target_output_quantity
    / label_claim_quantity, converted into the formula's own output unit via
    canonical_factor (the same conversion apps.batch_plans.validation.
    compute_expected_packed_content uses for an identical same-dimension
    conversion). This line's own stored quantity/unit are not used.
    """

    def setUp(self):
        super().setUp()
        n = next(_n)
        self.ml = UnitOfMeasure.objects.create(code=f"PML{n}", name="Millilitre", dimension="VOLUME", canonical_factor=Decimal("1"))
        self.liter = UnitOfMeasure.objects.create(code=f"PL{n}", name="Litre", dimension="VOLUME", canonical_factor=Decimal("1000"))
        self.liquid_product = tf.make_product(self.company, f"PLQ{n}", self.liter, self.superuser)
        self.bottle = tf.make_material(f"PBTL{n}", "PACKAGING_MATERIAL", self.count_unit)

    def liquid_formula(self, base="5"):
        body = self.create(product_id=self.liquid_product.id, code="LQF", name="Liquid", base_output_quantity=base)
        self.assertEqual(body.status_code, 201, body.content)
        return body.json()

    def test_same_unit_division(self):
        # Output unit is Litre (factor 1000); label claim is 100 ml/bottle
        # (same unit as the claim itself) - target 5000 ml worth of output
        # (5 L) needs 50 bottles.
        formula = self.liquid_formula(base="5")
        revision = formula["revisions"][0]
        line = self.line(
            self.bottle, "1", calculation_mode="AS_PER_LABEL_CLAIM", label_claim_quantity="100", label_claim_uom_id=self.ml.id
        )
        self.edit_rev(formula, revision, {"expected_version": 1, "lines": [line]})
        body = self.preview(formula, revision, "5").json()
        row = self.by_code(body)[self.bottle.code]
        self.assertEqual(row["required_quantity"]["value"], "50")
        self.assertTrue(row["required_quantity"]["is_exact"])
        self.assertTrue(row["required_quantity"]["is_whole_number"])
        self.assertEqual(row["calculation_mode"], "AS_PER_LABEL_CLAIM")
        self.assertEqual(row["label_claim_quantity"], "100.000")
        self.assertEqual(row["label_claim_uom_code"], self.ml.code)
        self.assertEqual(body["warnings"], [])

    def test_cross_unit_conversion_target_in_liters_claim_in_ml(self):
        # Target output quantity is ALWAYS in the formula's own output unit
        # (Litre here). The label claim is in ml - converted via
        # canonical_factor before dividing: 5 L = 5000 ml; 5000 / 100 = 50.
        formula = self.liquid_formula(base="5")
        revision = formula["revisions"][0]
        line = self.line(
            self.bottle, "1", calculation_mode="AS_PER_LABEL_CLAIM", label_claim_quantity="100", label_claim_uom_id=self.ml.id
        )
        self.edit_rev(formula, revision, {"expected_version": 1, "lines": [line]})
        body = self.preview(formula, revision, "5").json()
        self.assertEqual(self.by_code(body)[self.bottle.code]["required_quantity"]["value"], "50")

    def test_fractional_result_is_shown_unrounded_with_its_own_warning(self):
        formula = self.liquid_formula(base="5")
        revision = formula["revisions"][0]
        line = self.line(
            self.bottle, "1", calculation_mode="AS_PER_LABEL_CLAIM", label_claim_quantity="150", label_claim_uom_id=self.ml.id
        )
        self.edit_rev(formula, revision, {"expected_version": 1, "lines": [line]})
        # 5 L = 5000 ml; 5000 / 150 = 33.333...
        body = self.preview(formula, revision, "5").json()
        row = self.by_code(body)[self.bottle.code]
        self.assertFalse(row["required_quantity"]["is_exact"])
        self.assertFalse(row["required_quantity"]["is_whole_number"])
        warnings = [w for w in body["warnings"] if w["code"] == "FRACTIONAL_LABEL_CLAIM_REQUIREMENT"]
        self.assertEqual(len(warnings), 1)
        self.assertNotIn("FRACTIONAL_COUNT_REQUIREMENT", [w["code"] for w in body["warnings"]])

    def test_the_lines_own_stored_quantity_is_not_used_in_the_calculation(self):
        # The line's own quantity ("999", nonsense relative to base output 5)
        # must be completely ignored in AS_PER_LABEL_CLAIM mode.
        formula = self.liquid_formula(base="5")
        revision = formula["revisions"][0]
        line = self.line(
            self.bottle, "999", calculation_mode="AS_PER_LABEL_CLAIM", label_claim_quantity="100", label_claim_uom_id=self.ml.id
        )
        self.edit_rev(formula, revision, {"expected_version": 1, "lines": [line]})
        body = self.preview(formula, revision, "5").json()
        self.assertEqual(self.by_code(body)[self.bottle.code]["required_quantity"]["value"], "50")

    def test_mixed_formula_and_label_claim_lines_in_one_preview(self):
        formula = self.liquid_formula(base="5")
        revision = formula["revisions"][0]
        raw = tf.make_material(f"PRAW{next(_n)}", "RAW_MATERIAL", self.mass_unit)
        lines = [
            self.line(raw, "2"),  # AS_PER_FORMULA - scales with target/base = 2
            self.line(
                self.bottle, "1", calculation_mode="AS_PER_LABEL_CLAIM", label_claim_quantity="100", label_claim_uom_id=self.ml.id
            ),
        ]
        self.edit_rev(formula, revision, {"expected_version": 1, "lines": lines})
        body = self.preview(formula, revision, "5").json()
        by = self.by_code(body)
        self.assertEqual(by[raw.code]["calculation_mode"], "AS_PER_FORMULA")
        self.assertEqual(by[raw.code]["required_quantity"]["value"], "2")
        self.assertEqual(by[self.bottle.code]["calculation_mode"], "AS_PER_LABEL_CLAIM")
        self.assertEqual(by[self.bottle.code]["required_quantity"]["value"], "50")


class TargetValidationTests(PreviewBase):
    def setUp(self):
        super().setUp()
        self.formula, self.revision = self.client_example()

    def reject(self, value, expected_fragment=None):
        response = self.preview(self.formula, self.revision, value)
        self.assertEqual(response.status_code, 400, (value, response.content))
        self.assertIn("target_output_quantity", response.json())
        if expected_fragment:
            self.assertIn(expected_fragment, json.dumps(response.json()))

    def test_missing_and_blank(self):
        self.reject(None, "required")
        self.reject("", "required")
        self.reject("%20", "required")

    def test_malformed_and_non_finite(self):
        for value in ("abc", "5a", "1e3", "1E3", "NaN", "nan", "Infinity", "-Infinity", "inf", "1,000", "0x10", "5.", ".5", "1..2", "--5"):
            self.reject(value)

    def test_zero_and_negative(self):
        for value in ("0", "0.000", "00", "-1", "-0.5", "+5"):
            self.reject(value)

    def test_precision_and_size_limits(self):
        self.reject("1.0001", "decimal places")
        self.reject("1.5000", "decimal places")
        self.reject("100000000000", "Too large")
        self.reject("999999999999999999999", "Too large")
        ok = self.preview(self.formula, self.revision, "99999999999")
        self.assertEqual(ok.status_code, 200)

    def test_count_output_needs_a_whole_number_target(self):
        self.reject("50.5", "whole-number")
        self.reject("0.5", "whole-number")
        self.assertEqual(self.preview(self.formula, self.revision, "50.000").status_code, 200)
        self.assertEqual(self.preview(self.formula, self.revision, "50.0").status_code, 200)

    def test_unknown_and_repeated_parameters(self):
        base = self.url(self.formula, self.revision)
        unknown = tf.get_json(self.client_, base + "?target_output_quantity=5&junk=1", self.token)
        self.assertEqual(unknown.status_code, 400)
        self.assertIn("junk", unknown.json())
        alias = tf.get_json(self.client_, base + "?target=5", self.token)
        self.assertEqual(alias.status_code, 400)
        repeated = tf.get_json(self.client_, base + "?target_output_quantity=5&target_output_quantity=6", self.token)
        self.assertEqual(repeated.status_code, 400)

    def test_validation_happens_after_access_checks(self):
        outsider = tf.make_user("vout")
        response = self.preview(self.formula, self.revision, "abc", token=tf.token_for(outsider))
        self.assertEqual(response.status_code, 404)


class ResponseContractTests(PreviewBase):
    def test_identity_snapshots_current_state_and_notices(self):
        formula, revision = self.client_example()
        body = self.preview(formula, revision, "500").json()
        self.assertEqual(body["formula"]["code"], "F-001")
        self.assertEqual(body["formula"]["product"]["id"], self.product.id)
        self.assertEqual(body["revision"]["revision_number"], 1)
        self.assertEqual(body["revision"]["status"], "DRAFT")
        self.assertEqual(body["revision"]["version"], 2)
        self.assertEqual(body["revision"]["base_output_quantity"], "100.000")
        self.assertEqual(body["revision"]["output_unit"]["code"], self.count_unit.code)
        row = body["lines"][0]
        for key in ("id", "line_number", "material_id", "material_code", "material_name", "material_type",
                    "unit_id", "unit_code", "unit_name", "base_line_quantity", "required_quantity", "current", "notes"):
            self.assertIn(key, row)
        self.assertEqual(row["id"], revision["lines"][0]["id"])
        text = " ".join(body["preview"]["notices"]).lower()
        for phrase in ("draft formula", "planning estimate", "not approved", "no stock availability",
                       "nothing is reserved, issued or consumed", "no unit conversion",
                       "fixed-per-batch", "yield", "losses", "packaging rounding"):
            self.assertIn(phrase, text)
        self.assertTrue(body["preview"]["informational"])
        self.assertRegex(body["preview"]["generated_at"], r"^\d{4}-\d{2}-\d{2}T")

    def test_no_forbidden_keys_anywhere(self):
        formula, revision = self.client_example()
        for target in ("500", "50"):
            body = self.preview(formula, revision, target).json()
            self.assertEqual(FORBIDDEN_KEYS & set(all_keys(body)), set())
        empty = self.make_formula(code="EMPTY2")
        self.assertEqual(FORBIDDEN_KEYS & set(all_keys(self.preview(empty, empty["revisions"][0]).json())), set())

    def test_inactive_masters_are_flagged_and_snapshots_preserved(self):
        formula, revision = self.client_example()
        Material.objects.filter(pk=self.raw_a.pk).update(is_active=False, name="Renamed A")
        UnitOfMeasure.objects.filter(pk=self.count_unit.pk).update(is_active=False)
        self.product.is_active = False
        self.product.save(update_fields=["is_active"])
        before = self.state(formula, revision)
        body = self.preview(formula, revision, "500").json()
        rows = self.by_code(body)
        a = rows[self.raw_a.code]  # snapshot code still present
        self.assertEqual(a["material_name"], f"{self.raw_a.code} Material")
        self.assertEqual(a["current"]["material_name"], "Renamed A")
        self.assertFalse(a["current"]["material_is_active"])
        self.assertFalse(rows[self.caps.code]["current"]["unit_is_active"])
        self.assertFalse(body["formula"]["product"]["is_active"])
        self.assertFalse(body["revision"]["output_unit"]["is_active"])
        codes = sorted({w["code"] for w in body["warnings"]})
        self.assertEqual(codes, ["INACTIVE_MATERIAL", "INACTIVE_OUTPUT_UNIT", "INACTIVE_PRODUCT", "INACTIVE_UNIT",
                                 "MASTER_DATA_CHANGED_SINCE_SNAPSHOT"])
        self.assertTrue(body["calculation_complete"])  # inactive references warn, they do not block
        self.assertEqual(len(body["lines"]), 6)
        self.assertEqual(self.state(formula, revision), before)  # nothing refreshed

    def test_response_can_be_used_without_the_editor_lookups(self):
        formula, revision = self.client_example()
        viewer = tf.make_user("noloookups")
        tf.grant(self.superuser, viewer, self.company, "formulas.view")  # no products.view, no store/catalog access
        self.assertEqual(self.preview(formula, revision, token=tf.token_for(viewer)).status_code, 200)


class ReadOnlyAndConsistencyTests(PreviewBase):
    def test_repeated_previews_cause_no_persisted_change_or_audit_write(self):
        formula, revision = self.client_example()
        before = self.state(formula, revision)
        audit_before = AuditLog.objects.count()
        counts = (Formula.objects.count(), FormulaRevision.objects.count(), FormulaLine.objects.count())
        for target in ("500", "50", "100", "3"):
            self.assertEqual(self.preview(formula, revision, target).status_code, 200)
        self.assertEqual(self.preview(formula, revision, "abc").status_code, 400)
        self.assertEqual(self.state(formula, revision), before)
        self.assertEqual(AuditLog.objects.count(), audit_before)
        self.assertEqual((Formula.objects.count(), FormulaRevision.objects.count(), FormulaLine.objects.count()), counts)

    def test_no_write_or_lock_statements_are_issued(self):
        formula, revision = self.client_example()
        with CaptureQueriesContext(connection) as queries:
            self.assertEqual(self.preview(formula, revision, "50").status_code, 200)
        statements = [q["sql"].lstrip().upper() for q in queries]
        self.assertEqual([s for s in statements if s.startswith(("INSERT", "UPDATE", "DELETE"))], [])
        self.assertEqual([s for s in statements if "FOR UPDATE" in s or "FOR NO KEY UPDATE" in s or "FOR SHARE" in s], [])

    def _edit(self, revision_id, expected_version, **data):
        return update_formula_revision(actor=self.user, revision_id=revision_id, expected_version=expected_version, data=data)

    def test_a_concurrent_edit_never_produces_a_torn_response(self):
        formula, revision = self.client_example()
        real_load_lines = rp._load_lines
        calls = {"n": 0}

        def edit_between_header_and_lines(rev):
            calls["n"] += 1
            if calls["n"] == 1:  # an edit commits after the header was read, before the lines are read
                self._edit(
                    rev.id, rev.version, base_output_quantity=Decimal("200"),
                    lines=[{"material_id": self.raw_a.id, "quantity": Decimal("7")}],
                )
            return real_load_lines(rev)

        with patch.object(rp, "_load_lines", side_effect=edit_between_header_and_lines):
            body = self.preview(formula, revision, "400").json()
        self.assertEqual(calls["n"], 2)  # the inconsistent first attempt was discarded and retried
        stored = FormulaRevision.objects.get(pk=revision["id"])
        self.assertEqual(body["revision"]["version"], stored.version)
        self.assertEqual(body["revision"]["base_output_quantity"], "200.000")
        self.assertEqual(len(body["lines"]), 1)
        self.assertEqual(body["lines"][0]["base_line_quantity"], "7.000")
        self.assertEqual(body["lines"][0]["required_quantity"]["value"], "14")  # 7 * 400 / 200: new base with new lines
        self.assertEqual(body["scale_factor"]["value"], "2")

    def test_a_revision_that_keeps_changing_gets_a_409_not_a_mixed_response(self):
        formula, revision = self.client_example()
        real_load_lines = rp._load_lines
        calls = {"n": 0}

        def always_edit(rev):
            calls["n"] += 1
            current = FormulaRevision.objects.get(pk=rev.id)
            self._edit(rev.id, current.version, notes=f"edit {calls['n']}")
            return real_load_lines(rev)

        with patch.object(rp, "_load_lines", side_effect=always_edit):
            response = self.preview(formula, revision, "400")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(calls["n"], rp._READ_ATTEMPTS)
        self.assertNotIn("lines", response.json())

    def test_a_stable_revision_is_read_exactly_once(self):
        formula, revision = self.client_example()
        real_load_lines = rp._load_lines
        calls = {"n": 0}

        def counting(rev):
            calls["n"] += 1
            return real_load_lines(rev)

        with patch.object(rp, "_load_lines", side_effect=counting):
            self.assertEqual(self.preview(formula, revision, "10").status_code, 200)
        self.assertEqual(calls["n"], 1)

    def test_editing_after_a_preview_is_unaffected_by_the_target(self):
        formula, revision = self.client_example()
        self.preview(formula, revision, "500")
        response = self.edit_rev(formula, revision, {"expected_version": 2, "notes": "still editable at the same version"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["version"], 3)
