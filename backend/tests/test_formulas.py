import itertools
import json
import threading
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import IntegrityError, connection, transaction
from django.test import Client, TestCase, TransactionTestCase
from rest_framework_simplejwt.tokens import AccessToken

from apps.audit.models import AuditLog
from apps.catalog.models import Material, UnitOfMeasure
from apps.common.errors import Conflict
from apps.companies.models import Company
from apps.formulas.admin import FormulaAdmin, FormulaLineAdmin, FormulaRevisionAdmin
from apps.formulas.models import Formula, FormulaLine, FormulaRevision
from apps.formulas.services import create_formula, create_formula_revision, update_formula, update_formula_revision
from apps.permissions.services import create_company_role, replace_role_permissions
from apps.products.models import Product
from apps.users.services import assign_company_membership, assign_membership_role
from decimal import Decimal

User = get_user_model()
PASSWORD = "a-strong-pass-1"
ALL_PERMS = ["formulas.view", "formulas.create", "formulas.edit"]
_counter = itertools.count()


def formulas_url(company_id):
    return f"/api/v1/companies/{company_id}/formulas/"


def formula_url(company_id, formula_id):
    return f"/api/v1/companies/{company_id}/formulas/{formula_id}/"


def revisions_url(company_id, formula_id):
    return f"/api/v1/companies/{company_id}/formulas/{formula_id}/revisions/"


def revision_url(company_id, formula_id, revision_id):
    return f"/api/v1/companies/{company_id}/formulas/{formula_id}/revisions/{revision_id}/"


def make_user(username):
    return User.objects.create_user(username=username, email=f"{username}@example.com", password=PASSWORD)


def make_superuser(username):
    return User.objects.create_superuser(username=username, email=f"{username}@example.com", password=PASSWORD)


def make_company(code):
    return Company.objects.create(code=code, legal_name=f"{code} Legal Name Pvt Ltd")


def make_unit(code, dimension):
    return UnitOfMeasure.objects.create(code=code, name=f"{code} name", dimension=dimension)


def make_product(company, code, unit, actor):
    return Product.objects.create(company=company, code=code, name=f"{code} Product", sales_uom=unit, created_by=actor)


def make_material(code, kind, unit):
    return Material.objects.create(code=code, name=f"{code} Material", kind=kind, base_unit=unit)


def token_for(user):
    return str(AccessToken.for_user(user))


def bearer(token):
    return {"HTTP_AUTHORIZATION": f"Bearer {token}"}


def get_json(client, url, token):
    return client.get(url, **bearer(token))


def post_json(client, url, payload, token):
    return client.post(url, data=json.dumps(payload), content_type="application/json", **bearer(token))


def patch_json(client, url, payload, token):
    return client.patch(url, data=json.dumps(payload), content_type="application/json", **bearer(token))


def grant(actor, user, company, *codes):
    membership, _ = assign_company_membership(actor=actor, user=user, company=company)
    role = create_company_role(actor=actor, company=company, code=f"ROLE{user.id}", name="Role")
    role, _ = replace_role_permissions(actor=actor, role=role, permission_codes=list(codes))
    assign_membership_role(actor=actor, membership=membership, role=role)


class Base(TestCase):
    def setUp(self):
        n = next(_counter)
        self.superuser = make_superuser(f"fadmin{n}")
        self.user = make_user(f"fuser{n}")
        self.company = make_company(f"FCO{n}")
        self.other_company = make_company(f"FOT{n}")
        self.count_unit = make_unit(f"BTL{n}", "COUNT")
        self.mass_unit = make_unit(f"KG{n}", "MASS")
        self.product = make_product(self.company, "P1", self.count_unit, self.superuser)
        self.other_product = make_product(self.other_company, "PX", self.count_unit, self.superuser)
        self.raw = make_material(f"RAW{n}", "RAW_MATERIAL", self.mass_unit)
        self.raw2 = make_material(f"RAWB{n}", "RAW_MATERIAL", self.mass_unit)
        self.pack = make_material(f"PCK{n}", "PACKAGING_MATERIAL", self.count_unit)
        grant(self.superuser, self.user, self.company, *ALL_PERMS)
        self.token = token_for(self.user)
        self.client_ = Client()

    def create(self, **overrides):
        body = {"product_id": self.product.id, "code": "f-001", "name": "Tonic formula", "base_output_quantity": "100"}
        body.update(overrides)
        return post_json(self.client_, formulas_url(self.company.id), body, self.token)

    def make_formula(self, **overrides):
        response = self.create(**overrides)
        self.assertEqual(response.status_code, 201, response.content)
        return response.json()

    def rev(self, formula, index=0):
        return formula["revisions"][index]

    def edit_rev(self, formula, revision, payload, token=None):
        return patch_json(
            self.client_, revision_url(self.company.id, formula["id"], revision["id"]), payload, token or self.token
        )

    def line(self, material=None, quantity="5", **extra):
        return {"material_id": (material or self.raw).id, "quantity": quantity, **extra}

    def formula_with_lines(self, lines=None):
        formula = self.make_formula()
        revision = self.rev(formula)
        response = self.edit_rev(
            formula, revision, {"expected_version": 1, "lines": lines or [self.line(), self.line(self.pack, "10")]}
        )
        self.assertEqual(response.status_code, 200, response.content)
        return formula, response.json()


class AccessTests(Base):
    def test_anonymous(self):
        self.assertEqual(self.client_.get(formulas_url(self.company.id)).status_code, 401)

    def test_no_membership_404(self):
        outsider = make_user("foutsider")
        self.assertEqual(get_json(self.client_, formulas_url(self.company.id), token_for(outsider)).status_code, 404)

    def test_missing_permission_403(self):
        member = make_user("fmember")
        assign_company_membership(actor=self.superuser, user=member, company=self.company)
        response = get_json(self.client_, formulas_url(self.company.id), token_for(member))
        self.assertEqual(response.status_code, 403)
        self.assertIn("formulas.view", response.json()["detail"])

    def test_view_only_cannot_create_or_edit(self):
        formula = self.make_formula()
        viewer = make_user("fviewer")
        grant(self.superuser, viewer, self.company, "formulas.view")
        token = token_for(viewer)
        response = post_json(self.client_, formulas_url(self.company.id), {}, token)
        self.assertEqual(response.status_code, 403)
        self.assertIn("formulas.create", response.json()["detail"])
        response = post_json(self.client_, revisions_url(self.company.id, formula["id"]), {}, token)
        self.assertEqual(response.status_code, 403)
        self.assertIn("formulas.create", response.json()["detail"])
        response = patch_json(self.client_, formula_url(self.company.id, formula["id"]), {"expected_version": 1}, token)
        self.assertEqual(response.status_code, 403)
        self.assertIn("formulas.edit", response.json()["detail"])
        response = self.edit_rev(formula, self.rev(formula), {"expected_version": 1}, token)
        self.assertEqual(response.status_code, 403)

    def test_create_only_cannot_edit_and_edit_only_cannot_create(self):
        formula = self.make_formula()
        creator = make_user("fcreator")
        grant(self.superuser, creator, self.company, "formulas.view", "formulas.create")
        response = patch_json(
            self.client_, formula_url(self.company.id, formula["id"]), {"expected_version": 1, "name": "x"}, token_for(creator)
        )
        self.assertEqual(response.status_code, 403)
        editor = make_user("feditor")
        grant(self.superuser, editor, self.company, "formulas.view", "formulas.edit")
        response = post_json(
            self.client_, revisions_url(self.company.id, formula["id"]), {"base_output_quantity": "1"}, token_for(editor)
        )
        self.assertEqual(response.status_code, 403)

    def test_superuser_no_bypass(self):
        self.assertEqual(get_json(self.client_, formulas_url(self.company.id), token_for(self.superuser)).status_code, 404)

    def test_company_isolation(self):
        formula = self.make_formula()
        grant(self.superuser, self.user, self.other_company, *ALL_PERMS)
        self.assertEqual(get_json(self.client_, formula_url(self.other_company.id, formula["id"]), self.token).status_code, 404)
        self.assertEqual(
            get_json(self.client_, revisions_url(self.other_company.id, formula["id"]), self.token).status_code, 404
        )
        response = get_json(
            self.client_, revision_url(self.other_company.id, formula["id"], self.rev(formula)["id"]), self.token
        )
        self.assertEqual(response.status_code, 404)

    def test_delete_rejected(self):
        formula = self.make_formula()
        for url in (
            formula_url(self.company.id, formula["id"]),
            revision_url(self.company.id, formula["id"], self.rev(formula)["id"]),
        ):
            self.assertEqual(self.client_.delete(url, **bearer(self.token)).status_code, 405)


class CreateFormulaTests(Base):
    def test_create_with_empty_revision_one(self):
        body = self.make_formula()
        self.assertEqual(body["code"], "F-001")
        self.assertEqual(body["version"], 1)
        self.assertEqual(body["latest_revision_number"], 1)
        self.assertEqual(len(body["revisions"]), 1)
        revision = self.rev(body)
        self.assertEqual((revision["revision_number"], revision["status"], revision["version"]), (1, "DRAFT", 1))
        self.assertEqual(revision["base_output_quantity"], "100.000")
        self.assertEqual(revision["output_uom_id"], self.count_unit.id)
        self.assertEqual(revision["line_count"], 0)
        self.assertEqual(FormulaLine.objects.count(), 0)

    def test_audit(self):
        body = self.make_formula()
        entry = AuditLog.objects.get(target_type="formula", target_id=body["id"], action="formula.created")
        self.assertEqual(entry.company_id, self.company.id)
        self.assertIsNone(entry.store_id)
        self.assertEqual(entry.after["first_revision"]["revision_number"], 1)

    def test_explicit_output_uom_id(self):
        """Task 12B-2: a NEW formula's first revision may pick ANY active
        unit as its output, independent of the product's own sales unit
        (self.product's sales unit is `self.count_unit`, COUNT/bottles) -
        e.g. a bottle-sold product manufactured in kilograms.
        """
        body = self.make_formula(code="OU1", output_uom_id=self.mass_unit.id)
        self.assertEqual(self.rev(body)["output_uom_id"], self.mass_unit.id)
        self.assertNotEqual(self.mass_unit.id, self.count_unit.id)

        # Omitted: unchanged default (product.sales_uom).
        default_body = self.make_formula(code="OU2")
        self.assertEqual(self.rev(default_body)["output_uom_id"], self.count_unit.id)

        # Inactive unit rejected.
        inactive_unit = make_unit("INACTOU", "MASS")
        inactive_unit.is_active = False
        inactive_unit.save(update_fields=["is_active"])
        response = self.create(code="OU3", output_uom_id=inactive_unit.id)
        self.assertEqual(response.status_code, 400)
        self.assertIn("output_uom_id", response.json())

        # Unknown unit -> 404.
        self.assertEqual(self.create(code="OU4", output_uom_id=999999).status_code, 404)

        # COUNT wholeness rule applies to the SELECTED unit, not the product's.
        self.assertEqual(
            self.create(code="OU5", output_uom_id=self.count_unit.id, base_output_quantity="1.5").status_code, 400
        )
        ok = self.create(code="OU6", output_uom_id=self.mass_unit.id, base_output_quantity="1.5")
        self.assertEqual(ok.status_code, 201, ok.content)

    def test_duplicate_code_and_cross_company_code(self):
        self.make_formula()
        self.assertEqual(self.create(code="F-001").status_code, 409)
        grant(self.superuser, self.user, self.other_company, *ALL_PERMS)
        response = post_json(
            self.client_,
            formulas_url(self.other_company.id),
            {"product_id": self.other_product.id, "code": "F-001", "name": "x", "base_output_quantity": "1"},
            self.token,
        )
        self.assertEqual(response.status_code, 201)

    def test_multiple_formulas_per_product(self):
        self.make_formula(code="A")
        self.make_formula(code="B")
        self.assertEqual(Formula.objects.filter(product=self.product).count(), 2)

    def test_product_rules(self):
        self.assertEqual(self.create(product_id=self.other_product.id).status_code, 404)
        self.assertEqual(self.create(product_id=999999).status_code, 404)
        self.product.is_active = False
        self.product.save(update_fields=["is_active"])
        self.assertEqual(self.create().status_code, 400)
        self.product.is_active = True
        self.product.save(update_fields=["is_active"])
        self.count_unit.is_active = False
        self.count_unit.save(update_fields=["is_active"])
        self.assertEqual(self.create().status_code, 400)

    def test_base_output_rules(self):
        for value in ("0", "-1", "abc"):
            self.assertEqual(self.create(base_output_quantity=value).status_code, 400, value)
        self.assertEqual(self.create(base_output_quantity="1.0001").status_code, 400)
        self.assertEqual(self.create(base_output_quantity="1.5").status_code, 400)  # COUNT sales unit
        self.assertEqual(self.create(code="OK", base_output_quantity="12.000").status_code, 201)
        self.assertEqual(self.create(code="MISSING", base_output_quantity=None).status_code, 400)

    def test_blank_code_or_name(self):
        self.assertEqual(self.create(code="   ").status_code, 400)
        self.assertEqual(self.create(name="   ").status_code, 400)

    def test_forged_and_unknown_fields(self):
        # `output_uom_id` is deliberately NOT in this list (Task 12B-2): it is
        # a legitimate, optional create-only field - see
        # CreateFormulaTests.test_explicit_output_uom_id below.
        for field, value in [
            ("company_id", self.company.id),
            ("latest_revision_number", 9),
            ("version", 5),
            ("status", "APPROVED"),
            ("revision_number", 3),
            ("lines", []),
            ("is_default", True),
            ("junk", 1),
        ]:
            response = self.create(**{field: value})
            self.assertEqual(response.status_code, 400, field)
            self.assertIn(field, response.json())
        self.assertEqual(Formula.objects.count(), 0)

    def test_audit_failure_rolls_back_formula_and_revision(self):
        with patch("apps.formulas.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                self.create()
        self.assertEqual((Formula.objects.count(), FormulaRevision.objects.count()), (0, 0))

    def test_list_search_filter_pagination(self):
        other_product = make_product(self.company, "P2", self.count_unit, self.superuser)
        a = self.make_formula(code="ALPHA", name="Alpha syrup")
        b = self.make_formula(code="BETA", name="Beta tonic", product_id=other_product.id)
        url = formulas_url(self.company.id)

        def ids(query=""):
            response = get_json(self.client_, url + query, self.token)
            self.assertEqual(response.status_code, 200)
            return [row["id"] for row in response.json()["results"]]

        self.assertEqual(ids(), [a["id"], b["id"]])
        self.assertEqual(ids("?search=beta"), [b["id"]])
        self.assertEqual(ids("?search=syrup"), [a["id"]])
        self.assertEqual(ids(f"?product={other_product.id}"), [b["id"]])
        self.assertEqual(get_json(self.client_, url + "?product=abc", self.token).status_code, 400)
        self.assertIn("count", get_json(self.client_, url, self.token).json())


class MetadataTests(Base):
    def test_requires_expected_version_and_stale(self):
        formula = self.make_formula()
        url = formula_url(self.company.id, formula["id"])
        self.assertEqual(patch_json(self.client_, url, {"name": "x"}, self.token).status_code, 400)
        self.assertEqual(patch_json(self.client_, url, {"expected_version": 1, "name": "New"}, self.token).status_code, 200)
        self.assertEqual(patch_json(self.client_, url, {"expected_version": 1, "name": "Newer"}, self.token).status_code, 409)

    def test_edit_bumps_only_formula_version(self):
        formula = self.make_formula()
        response = patch_json(
            self.client_, formula_url(self.company.id, formula["id"]),
            {"expected_version": 1, "name": "Renamed", "notes": "n"}, self.token,
        )
        body = response.json()
        self.assertEqual((body["version"], body["latest_revision_number"], body["name"]), (2, 1, "Renamed"))
        self.assertEqual(self.rev(body)["version"], 1)
        entry = AuditLog.objects.get(action="formula.updated", target_id=formula["id"])
        self.assertEqual(entry.before["name"], "Tonic formula")

    def test_immutable_and_protected_fields(self):
        formula = self.make_formula()
        url = formula_url(self.company.id, formula["id"])
        for field, value in [
            ("product_id", self.product.id),
            ("code", "NEW"),
            ("company_id", self.other_company.id),
            ("latest_revision_number", 9),
            ("version", 3),
            ("junk", 1),
        ]:
            response = patch_json(self.client_, url, {"expected_version": 1, field: value}, self.token)
            self.assertEqual(response.status_code, 400, field)
            self.assertIn(field, response.json())

    def test_no_op_and_blank_name(self):
        formula = self.make_formula()
        url = formula_url(self.company.id, formula["id"])
        AuditLog.objects.filter(action="formula.updated").delete()
        response = patch_json(self.client_, url, {"expected_version": 1, "name": "  Tonic formula ", "notes": ""}, self.token)
        self.assertEqual(response.json()["version"], 1)
        self.assertEqual(AuditLog.objects.filter(action="formula.updated").count(), 0)
        self.assertEqual(patch_json(self.client_, url, {"expected_version": 1, "name": "  "}, self.token).status_code, 400)

    def test_audit_failure_rolls_back(self):
        formula = self.make_formula()
        with patch("apps.formulas.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                patch_json(
                    self.client_, formula_url(self.company.id, formula["id"]),
                    {"expected_version": 1, "name": "Nope"}, self.token,
                )
        stored = Formula.objects.get(pk=formula["id"])
        self.assertEqual((stored.name, stored.version), ("Tonic formula", 1))


class RevisionTests(Base):
    def test_create_revisions_sequential_and_independent_counters(self):
        formula = self.make_formula()
        url = revisions_url(self.company.id, formula["id"])
        second = post_json(self.client_, url, {"base_output_quantity": "50", "notes": "smaller"}, self.token)
        self.assertEqual(second.status_code, 201, second.content)
        body = second.json()
        self.assertEqual((body["revision_number"], body["version"], body["lines"]), (2, 1, []))
        self.assertEqual(body["output_uom_id"], self.count_unit.id)
        third = post_json(self.client_, url, {"base_output_quantity": "10"}, self.token).json()
        self.assertEqual(third["revision_number"], 3)
        stored = Formula.objects.get(pk=formula["id"])
        self.assertEqual((stored.latest_revision_number, stored.version), (3, 1))
        listing = get_json(self.client_, url, self.token).json()
        self.assertEqual([r["revision_number"] for r in listing], [1, 2, 3])
        self.assertNotIn("lines", listing[0])
        # metadata edit does not touch the allocation counter or revisions' versions
        patch_json(self.client_, formula_url(self.company.id, formula["id"]), {"expected_version": 1, "name": "N"}, self.token)
        stored.refresh_from_db()
        self.assertEqual((stored.latest_revision_number, stored.version), (3, 2))
        self.assertEqual(FormulaRevision.objects.get(pk=body["id"]).version, 1)

    def test_revision_create_rules(self):
        formula = self.make_formula()
        url = revisions_url(self.company.id, formula["id"])
        self.assertEqual(post_json(self.client_, url, {}, self.token).status_code, 400)
        self.assertEqual(post_json(self.client_, url, {"base_output_quantity": "0"}, self.token).status_code, 400)
        self.assertEqual(post_json(self.client_, url, {"base_output_quantity": "1.5"}, self.token).status_code, 400)
        # `output_uom_id` is deliberately NOT in this list (Task 12B-2): it is
        # a legitimate, optional create-only field - see RevisionTests.
        # test_explicit_output_uom_id below.
        for field in ("revision_number", "status", "lines", "version", "latest_revision_number"):
            response = post_json(self.client_, url, {"base_output_quantity": "1", field: 1}, self.token)
            self.assertEqual(response.status_code, 400, field)
        self.product.is_active = False
        self.product.save(update_fields=["is_active"])
        self.assertEqual(post_json(self.client_, url, {"base_output_quantity": "1"}, self.token).status_code, 400)
        self.assertEqual(FormulaRevision.objects.filter(formula_id=formula["id"]).count(), 1)

    def test_explicit_output_uom_id_on_a_later_revision(self):
        """Task 12B-2: a later revision behaves identically to the first -
        omitted defaults to product.sales_uom, given picks any active unit,
        independent of the formula's OWN first revision's output unit too
        (this formula's revision 1 already output `self.count_unit`).
        """
        formula = self.make_formula()
        url = revisions_url(self.company.id, formula["id"])
        response = post_json(
            self.client_, url, {"base_output_quantity": "5", "output_uom_id": self.mass_unit.id}, self.token
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["output_uom_id"], self.mass_unit.id)

        inactive_unit = make_unit("INACTREV", "MASS")
        inactive_unit.is_active = False
        inactive_unit.save(update_fields=["is_active"])
        blocked = post_json(
            self.client_, url, {"base_output_quantity": "5", "output_uom_id": inactive_unit.id}, self.token
        )
        self.assertEqual(blocked.status_code, 400)
        self.assertIn("output_uom_id", blocked.json())

    def test_approved_revision_output_uom_unaffected_by_later_defaults(self):
        """Existing/approved revisions are never touched by this feature -
        only NEW revisions can pick an output unit."""
        formula, revision = self.formula_with_lines()
        stored = FormulaRevision.objects.get(pk=revision["id"])
        original_output_uom_id = stored.output_uom_id
        # creating an unrelated later revision with a different unit must not
        # change the first revision's own, already-fixed output unit
        post_json(
            self.client_, revisions_url(self.company.id, formula["id"]),
            {"base_output_quantity": "5", "output_uom_id": self.mass_unit.id}, self.token,
        )
        stored.refresh_from_db()
        self.assertEqual(stored.output_uom_id, original_output_uom_id)

    def test_revision_create_audit_and_rollback(self):
        formula = self.make_formula()
        url = revisions_url(self.company.id, formula["id"])
        body = post_json(self.client_, url, {"base_output_quantity": "5"}, self.token).json()
        entry = AuditLog.objects.get(action="formula_revision.created", target_id=body["id"])
        self.assertEqual(entry.after["revision_number"], 2)
        with patch("apps.formulas.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                post_json(self.client_, url, {"base_output_quantity": "5"}, self.token)
        stored = Formula.objects.get(pk=formula["id"])
        self.assertEqual(stored.latest_revision_number, 2)
        self.assertEqual(stored.revisions.count(), 2)

    def test_cross_parent_revision_id_404(self):
        first = self.make_formula(code="A")
        second = self.make_formula(code="B")
        response = get_json(
            self.client_, revision_url(self.company.id, first["id"], self.rev(second)["id"]), self.token
        )
        self.assertEqual(response.status_code, 404)
        response = patch_json(
            self.client_,
            revision_url(self.company.id, first["id"], self.rev(second)["id"]),
            {"expected_version": 1},
            self.token,
        )
        self.assertEqual(response.status_code, 404)

    def test_model_constraints(self):
        formula = self.make_formula()
        stored = Formula.objects.get(pk=formula["id"])
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                FormulaRevision.objects.bulk_create(
                    [FormulaRevision(formula=stored, revision_number=1, base_output_quantity=1,
                                     output_uom=self.count_unit, created_by=self.superuser)]
                )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                FormulaRevision.objects.bulk_create(
                    [FormulaRevision(formula=stored, revision_number=9, base_output_quantity=0,
                                     output_uom=self.count_unit, created_by=self.superuser)]
                )
        revision = stored.revisions.get()
        revision.output_uom = self.mass_unit
        with self.assertRaises(Exception):
            revision.save()


class RevisionEditTests(Base):
    def test_save_draft_raw_and_packaging_together(self):
        formula, revision = self.formula_with_lines()
        self.assertEqual(revision["version"], 2)
        self.assertEqual([(l["line_number"], l["material_type"]) for l in revision["lines"]],
                         [(1, "RAW_MATERIAL"), (2, "PACKAGING_MATERIAL")])
        raw_line, pack_line = revision["lines"]
        self.assertEqual(raw_line["unit_code"], self.mass_unit.code)
        self.assertEqual(pack_line["unit_code"], self.count_unit.code)
        self.assertEqual(raw_line["material_code"], self.raw.code)
        self.assertTrue(raw_line["material_is_active"] and raw_line["unit_is_active"])
        entry = AuditLog.objects.get(action="formula_revision.updated", target_id=revision["id"])
        self.assertEqual(entry.before["lines"], [])
        self.assertEqual(len(entry.after["lines"]), 2)
        self.assertEqual(entry.company_id, self.company.id)

    def test_type_and_unit_cannot_be_client_supplied(self):
        formula = self.make_formula()
        revision = self.rev(formula)
        for extra in ({"material_type": "RAW_MATERIAL"}, {"type": "PACKAGING_MATERIAL"}, {"unit_id": self.count_unit.id},
                      {"unit": 1}, {"line_number": 5}, {"material_kind_snapshot": "X"}, {"junk": 1}):
            response = self.edit_rev(formula, revision, {"expected_version": 1, "lines": [self.line(**extra)]})
            self.assertEqual(response.status_code, 400, extra)
        self.assertEqual(FormulaLine.objects.count(), 0)

    def test_header_field_rules(self):
        formula = self.make_formula()
        revision = self.rev(formula)
        for field, value in [("output_uom_id", 1), ("revision_number", 4), ("status", "APPROVED"),
                             ("version", 3), ("formula_id", 1), ("junk", 1)]:
            response = self.edit_rev(formula, revision, {"expected_version": 1, field: value})
            self.assertEqual(response.status_code, 400, field)
        self.assertEqual(self.edit_rev(formula, revision, {"base_output_quantity": "1"}).status_code, 400)
        self.assertEqual(self.edit_rev(formula, revision, {"expected_version": 1, "base_output_quantity": "0"}).status_code, 400)
        self.assertEqual(self.edit_rev(formula, revision, {"expected_version": 1, "base_output_quantity": "2.5"}).status_code, 400)

    def test_quantity_and_material_validation(self):
        formula = self.make_formula()
        revision = self.rev(formula)

        def attempt(line):
            return self.edit_rev(formula, revision, {"expected_version": 1, "lines": [line]}).status_code

        self.assertEqual(attempt(self.line(quantity="0")), 400)
        self.assertEqual(attempt(self.line(quantity="-2")), 400)
        self.assertEqual(attempt(self.line(quantity="1.0001")), 400)
        self.assertEqual(attempt(self.line(self.pack, "1.5")), 400)  # COUNT base unit
        self.assertEqual(attempt({"material_id": 999999, "quantity": "1"}), 404)
        self.assertEqual(attempt(self.line(self.raw, "1.500")), 200)  # MASS allows fractions (last: bumps version)

    def test_inactive_material_or_unit_rejected_for_new_lines(self):
        formula = self.make_formula()
        revision = self.rev(formula)
        self.raw2.is_active = False
        self.raw2.save(update_fields=["is_active"])
        response = self.edit_rev(formula, revision, {"expected_version": 1, "lines": [self.line(self.raw2)]})
        self.assertEqual(response.status_code, 400)
        self.mass_unit.is_active = False
        self.mass_unit.save(update_fields=["is_active"])
        response = self.edit_rev(formula, revision, {"expected_version": 1, "lines": [self.line(self.raw)]})
        self.assertEqual(response.status_code, 400)

    def test_replace_add_remove_with_audit(self):
        formula, revision = self.formula_with_lines()
        raw_line, pack_line = revision["lines"]
        response = self.edit_rev(
            formula, revision,
            {"expected_version": 2, "lines": [
                {"id": raw_line["id"], "material_id": self.raw.id, "quantity": "7"},
                self.line(self.raw2, "2"),
            ]},
        )
        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        self.assertEqual([l["line_number"] for l in body["lines"]], [1, 2])
        self.assertEqual(body["lines"][0]["id"], raw_line["id"])
        self.assertEqual(body["lines"][0]["quantity"], "7.000")
        self.assertNotIn(pack_line["id"], [l["id"] for l in body["lines"]])
        entry = AuditLog.objects.filter(action="formula_revision.updated", target_id=revision["id"]).latest("id")
        self.assertIn(pack_line["id"], [l["id"] for l in entry.before["lines"]])
        self.assertNotIn(pack_line["id"], [l["id"] for l in entry.after["lines"]])

    def test_omitted_leaves_and_empty_clears(self):
        formula, revision = self.formula_with_lines()
        body = self.edit_rev(formula, revision, {"expected_version": 2, "notes": "n"}).json()
        self.assertEqual(len(body["lines"]), 2)
        cleared = self.edit_rev(formula, revision, {"expected_version": 3, "lines": []}).json()
        self.assertEqual((cleared["lines"], cleared["version"]), ([], 4))

    def test_base_output_change_does_not_rescale_lines(self):
        formula, revision = self.formula_with_lines()
        body = self.edit_rev(formula, revision, {"expected_version": 2, "base_output_quantity": "500"}).json()
        self.assertEqual(body["base_output_quantity"], "500.000")
        self.assertEqual([l["quantity"] for l in body["lines"]], ["5.000", "10.000"])

    def test_reorder_renumbers_safely(self):
        formula, revision = self.formula_with_lines()
        raw_line, pack_line = revision["lines"]
        response = self.edit_rev(
            formula, revision,
            {"expected_version": 2, "lines": [
                {"id": pack_line["id"], "material_id": self.pack.id, "quantity": "10"},
                {"id": raw_line["id"], "material_id": self.raw.id, "quantity": "5"},
            ]},
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual([(l["id"], l["line_number"]) for l in response.json()["lines"]],
                         [(pack_line["id"], 1), (raw_line["id"], 2)])

    def test_foreign_unknown_and_duplicate_line_ids(self):
        formula, revision = self.formula_with_lines()
        other_formula, other_revision = self.formula_with_lines_for("OTHER")
        foreign_id = other_revision["lines"][0]["id"]
        own_id = revision["lines"][0]["id"]

        def entry(line_id):
            return {"id": line_id, "material_id": self.raw.id, "quantity": "5"}

        for lines in ([entry(foreign_id)], [entry(999999)], [entry(own_id), entry(own_id)]):
            response = self.edit_rev(formula, revision, {"expected_version": 2, "lines": lines})
            self.assertEqual(response.status_code, 400)
        self.assertEqual(FormulaRevision.objects.get(pk=revision["id"]).version, 2)
        self.assertEqual(FormulaLine.objects.filter(revision_id=other_revision["id"]).count(), 2)

    def formula_with_lines_for(self, code):
        formula = self.make_formula(code=code)
        revision = self.rev(formula)
        response = self.edit_rev(formula, revision, {"expected_version": 1, "lines": [self.line(), self.line(self.pack, "10")]})
        return formula, response.json()

    def test_unchanged_inactive_references_preserved_changes_rejected_removal_allowed(self):
        formula, revision = self.formula_with_lines()
        raw_line, pack_line = revision["lines"]
        Material.objects.filter(pk=self.raw.pk).update(is_active=False)
        UnitOfMeasure.objects.filter(pk=self.count_unit.pk).update(is_active=False)

        def as_entry(line, **changes):
            return {"id": line["id"], "material_id": line["material_id"], "quantity": line["quantity"],
                    "notes": line["notes"], **changes}

        response = self.edit_rev(
            formula, revision, {"expected_version": 2, "notes": "n", "lines": [as_entry(raw_line), as_entry(pack_line)]}
        )
        self.assertEqual(response.status_code, 200, response.content)
        lines = response.json()["lines"]
        self.assertFalse(lines[0]["material_is_active"])
        self.assertFalse(lines[1]["unit_is_active"])
        response = self.edit_rev(
            formula, revision, {"expected_version": 3, "lines": [as_entry(raw_line, quantity="9"), as_entry(pack_line)]}
        )
        self.assertEqual(response.status_code, 400)
        response = self.edit_rev(
            formula, revision, {"expected_version": 3, "lines": [as_entry(raw_line), as_entry(pack_line, quantity="20")]}
        )
        self.assertEqual(response.status_code, 400)
        response = self.edit_rev(formula, revision, {"expected_version": 3, "lines": []})
        self.assertEqual(response.status_code, 200)

    def test_snapshots_preserved_and_refreshed_only_on_material_replacement(self):
        formula, revision = self.formula_with_lines([self.line()])
        line = revision["lines"][0]
        Material.objects.filter(pk=self.raw.pk).update(name="Renamed Material")
        UnitOfMeasure.objects.filter(pk=self.mass_unit.pk).update(name="Renamed Unit")
        entry = {"id": line["id"], "material_id": self.raw.id, "quantity": "6"}
        body = self.edit_rev(formula, revision, {"expected_version": 2, "lines": [entry]}).json()
        self.assertEqual(body["lines"][0]["material_name"], f"{self.raw.code} Material")
        self.assertEqual(body["lines"][0]["unit_name"], f"{self.mass_unit.code} name")
        replaced = self.edit_rev(
            formula, revision, {"expected_version": 3, "lines": [{**entry, "material_id": self.pack.id, "quantity": "6"}]}
        ).json()
        self.assertEqual(replaced["lines"][0]["material_type"], "PACKAGING_MATERIAL")
        self.assertEqual(replaced["lines"][0]["unit_code"], self.count_unit.code)
        self.assertEqual(replaced["lines"][0]["id"], line["id"])

    def test_stale_and_no_op(self):
        formula, revision = self.formula_with_lines()
        self.assertEqual(self.edit_rev(formula, revision, {"expected_version": 1, "notes": "x"}).status_code, 409)
        AuditLog.objects.filter(action="formula_revision.updated").delete()
        line_entries = [
            {"id": l["id"], "material_id": l["material_id"], "quantity": l["quantity"], "notes": l["notes"]}
            for l in revision["lines"]
        ]
        response = self.edit_rev(
            formula, revision, {"expected_version": 2, "notes": "", "base_output_quantity": "100.000", "lines": line_entries}
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["version"], 2)
        self.assertEqual(AuditLog.objects.filter(action="formula_revision.updated").count(), 0)

    def test_revision_version_independent_of_formula_version(self):
        formula, revision = self.formula_with_lines()
        patch_json(self.client_, formula_url(self.company.id, formula["id"]), {"expected_version": 1, "name": "N"}, self.token)
        self.assertEqual(self.edit_rev(formula, revision, {"expected_version": 2, "notes": "ok"}).status_code, 200)

    def test_audit_failure_and_validation_failure_atomic(self):
        formula, revision = self.formula_with_lines()
        with patch("apps.formulas.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                self.edit_rev(formula, revision, {"expected_version": 2, "notes": "changed", "lines": []})
        stored = FormulaRevision.objects.get(pk=revision["id"])
        self.assertEqual((stored.version, stored.notes, stored.lines.count()), (2, "", 2))
        response = self.edit_rev(
            formula, revision, {"expected_version": 2, "notes": "no", "lines": [self.line(), self.line(self.pack, "1.5")]}
        )
        self.assertEqual(response.status_code, 400)
        stored.refresh_from_db()
        self.assertEqual((stored.version, stored.notes, stored.lines.count()), (2, "", 2))


class AdminTests(TestCase):
    def test_read_only(self):
        for admin_class, model in ((FormulaAdmin, Formula), (FormulaRevisionAdmin, FormulaRevision), (FormulaLineAdmin, FormulaLine)):
            instance = admin_class(model, None)
            self.assertFalse(instance.has_add_permission(None))
            self.assertFalse(instance.has_change_permission(None))


class ConcurrencyTests(TransactionTestCase):
    serialized_rollback = True

    def _setup(self, suffix):
        superuser = make_superuser(f"cfadmin{suffix}")
        user = make_user(f"cfuser{suffix}")
        company = make_company(f"CF{suffix}")
        unit = make_unit(f"CU{suffix}", "COUNT")
        product = make_product(company, "P1", unit, superuser)
        grant(superuser, user, company, *ALL_PERMS)
        formula = create_formula(
            actor=user, company=company, product_id=product.id, code="F1", name="F", base_output_quantity=Decimal("10")
        )
        return user, company, formula

    def _run(self, workers):
        threads = [threading.Thread(target=w) for w in workers]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30)

    def test_concurrent_revision_allocation_is_sequential(self):
        user, company, formula = self._setup("A")
        numbers, errors = [], []
        barrier = threading.Barrier(4)

        def worker():
            try:
                barrier.wait(timeout=5)
                numbers.append(create_formula_revision(actor=user, formula_id=formula.id, base_output_quantity=Decimal("1")).revision_number)
            except Exception as exc:  # surfaced by assertion
                errors.append(exc)
            finally:
                connection.close()

        self._run([worker] * 4)
        self.assertEqual(errors, [])
        self.assertEqual(sorted(numbers), [2, 3, 4, 5])
        formula.refresh_from_db()
        self.assertEqual(formula.latest_revision_number, 5)
        self.assertEqual(formula.version, 1)

    def test_metadata_edit_and_revision_allocation_do_not_lose_updates(self):
        user, company, formula = self._setup("B")
        results = []
        barrier = threading.Barrier(2)

        def edit():
            try:
                barrier.wait(timeout=5)
                update_formula(actor=user, formula_id=formula.id, expected_version=1, data={"name": "Edited"})
                results.append("edit")
            finally:
                connection.close()

        def allocate():
            try:
                barrier.wait(timeout=5)
                create_formula_revision(actor=user, formula_id=formula.id, base_output_quantity=Decimal("1"))
                results.append("alloc")
            finally:
                connection.close()

        self._run([edit, allocate])
        self.assertEqual(sorted(results), ["alloc", "edit"])
        formula.refresh_from_db()
        self.assertEqual((formula.name, formula.version, formula.latest_revision_number), ("Edited", 2, 2))

    def test_concurrent_revision_update_exactly_one_winner(self):
        user, company, formula = self._setup("C")
        revision = formula.revisions.get()
        outcomes = []
        barrier = threading.Barrier(2)

        def worker():
            try:
                barrier.wait(timeout=5)
                update_formula_revision(actor=user, revision_id=revision.id, expected_version=1, data={"notes": "x"})
                outcomes.append("ok")
            except Conflict:
                outcomes.append("conflict")
            finally:
                connection.close()

        self._run([worker, worker])
        self.assertEqual(sorted(outcomes), ["conflict", "ok"])
        revision.refresh_from_db()
        self.assertEqual(revision.version, 2)
