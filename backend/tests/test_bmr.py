"""Batch manufacturing record (BMR): creation from the existing requirement
preview, free-text line fields, refusals, permissions, company isolation,
audit rollback, and no side effects on batch, requisition or stock records.

Synthetic fixtures only. Quantities are arithmetic on the test revision
(base 100, raw 10, packaging 25, target 50), not a real recipe.
"""

import json
from decimal import Decimal
from unittest.mock import patch

from apps.batch_plans.models import BatchNumberAllocation, BatchPlan
from apps.bmr.models import BatchManufacturingRecord, BMRLine
from apps.catalog.models import Material
from apps.formulas.models import FormulaLine
from apps.material_requisitions.models import MaterialRequisition
from apps.stock_movements.models import StockMovement
from tests.test_store_preparation import (
    STORE_PREP_ALL_PERMS,
    StorePreparationTestCase,
    bearer,
    grant_company_permission,
    grant_store_permission,
    make_company,
    make_material,
    make_user,
)


def bmr_url(company_id, plan_id):
    return f"/api/v1/companies/{company_id}/batch-plans/{plan_id}/bmr/"


def line_url(company_id, bmr_id, line_id):
    return f"/api/v1/companies/{company_id}/bmr/{bmr_id}/lines/{line_id}/"


def _counts():
    return {
        "plans": BatchPlan.objects.count(),
        "allocations": BatchNumberAllocation.objects.count(),
        "requisitions": MaterialRequisition.objects.count(),
        "stock": StockMovement.objects.count(),
    }


class BMRBase(StorePreparationTestCase):
    def setUp(self):
        super().setUp()
        packaging = make_material("PKG", Material.Kind.PACKAGING_MATERIAL, self.unit_count)
        # Test-only fixture: the revision is already approved, so the model's
        # save guard would refuse this line. bulk_create writes the synthetic row
        # directly and leaves every real record untouched.
        FormulaLine.objects.bulk_create([
            FormulaLine(
                revision=self.revision, line_number=2, material=packaging, quantity=Decimal("25.000"), unit=self.unit_count,
                material_code_snapshot=packaging.code, material_name_snapshot=packaging.name,
                material_kind_snapshot=packaging.kind, unit_code_snapshot=self.unit_count.code,
                unit_name_snapshot=self.unit_count.name,
            )
        ])
        # Synthetic personas. Each gets its explicit grants only.
        self.bmr_manager = make_user("bmrmanager")
        grant_company_permission(
            self.superuser, self.bmr_manager, self.company,
            "batch_plans.view", "formulas.view", "bmr.view", "bmr.create", "bmr.edit",
        )
        self.bmr_viewer = make_user("bmrviewer")
        grant_company_permission(self.superuser, self.bmr_viewer, self.company, "batch_plans.view", "formulas.view", "bmr.view")
        self.outsider = make_user("bmroutsider")
        other = make_company("BMROTHER")
        grant_company_permission(self.superuser, self.outsider, other, "batch_plans.view", "formulas.view", "bmr.view", "bmr.create")

    def create_bmr(self, user=None):
        return self.client_.post(bmr_url(self.company.id, self.plan.id), data="{}", content_type="application/json", **bearer(user or self.bmr_manager))


class CreateBMRTests(BMRBase):
    def test_lines_come_from_the_requirement_preview_with_exact_quantities(self):
        res = self.create_bmr()
        self.assertEqual(res.status_code, 201, res.content)
        body = res.json()
        raw = [l for l in body["lines"] if l["slip"] == "RAW"]
        packing = [l for l in body["lines"] if l["slip"] == "PACKING"]
        self.assertEqual(len(raw), 1)
        self.assertEqual(len(packing), 1)
        # Target 50 on base 100: raw 10 -> 5, packaging 25 -> 12.5 (fractional count kept, not rounded).
        self.assertEqual(Decimal(raw[0]["required_text"]), Decimal("5"))
        self.assertEqual(Decimal(packing[0]["required_text"]), Decimal("12.5"))
        self.assertEqual(raw[0]["unit_code"], self.mass_unit.code)

    def test_creation_has_no_batch_number_requisition_or_stock_side_effects(self):
        before = _counts()
        self.create_bmr()
        self.assertEqual(_counts(), before)
        self.plan.refresh_from_db()
        self.assertFalse(BatchNumberAllocation.objects.filter(batch_plan=self.plan).exists())

    def test_second_bmr_for_the_same_plan_is_a_conflict(self):
        self.assertEqual(self.create_bmr().status_code, 201)
        second = self.create_bmr()
        self.assertEqual(second.status_code, 409, second.content)
        self.assertEqual(BatchManufacturingRecord.objects.filter(batch_plan=self.plan).count(), 1)


class EditLineTests(BMRBase):
    def setUp(self):
        super().setUp()
        self.bmr = self.create_bmr().json()
        self.raw_line = next(l for l in self.bmr["lines"] if l["slip"] == "RAW")
        self.pack_line = next(l for l in self.bmr["lines"] if l["slip"] == "PACKING")

    def patch_line(self, line, payload, user=None):
        return self.client_.patch(
            line_url(self.company.id, self.bmr["id"], line["id"]),
            data=json.dumps(payload), content_type="application/json", **bearer(user or self.bmr_manager),
        )

    def test_special_value_label_claim_and_ar_no_persist(self):
        res = self.patch_line(self.raw_line, {
            "expected_version": self.raw_line["version"],
            "special_value": "Q.S.",
            "label_claim": "0.25 mL",
            "ar_no": "AR-TEST-001",
        })
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()["display_required"], "Q.S.")
        reread = self.client_.get(bmr_url(self.company.id, self.plan.id), **bearer(self.bmr_viewer)).json()
        line = next(l for l in reread["lines"] if l["id"] == self.raw_line["id"])
        self.assertEqual(line["label_claim"], "0.25 mL")
        self.assertEqual(line["ar_no"], "AR-TEST-001")
        # The calculated requirement itself is never changed by a special value.
        self.assertEqual(Decimal(line["required_text"]), Decimal("5"))

    def test_qty_received_is_packing_only(self):
        res = self.patch_line(self.raw_line, {"expected_version": self.raw_line["version"], "qty_received": "4"})
        self.assertEqual(res.status_code, 400, res.content)

    def test_qty_received_on_packing_is_saved(self):
        res = self.patch_line(self.pack_line, {"expected_version": self.pack_line["version"], "qty_received": "12"})
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()["qty_received"], "12")

    def test_stale_version_is_refused(self):
        res = self.patch_line(self.raw_line, {"expected_version": self.raw_line["version"] + 3, "ar_no": "x"})
        self.assertEqual(res.status_code, 409, res.content)

    def test_required_quantity_cannot_be_changed_through_the_line_endpoint(self):
        res = self.patch_line(self.raw_line, {"expected_version": self.raw_line["version"], "required_text": "999"})
        self.assertEqual(res.status_code, 400, res.content)
        self.assertEqual(BMRLine.objects.get(pk=self.raw_line["id"]).required_text, "5")

    def test_audit_failure_rolls_back_the_edit(self):
        with patch("apps.bmr.services.record", side_effect=RuntimeError("audit down")):
            with self.assertRaises(RuntimeError):
                self.patch_line(self.raw_line, {"expected_version": self.raw_line["version"], "ar_no": "lost"})
        self.assertEqual(BMRLine.objects.get(pk=self.raw_line["id"]).ar_no, "")


class AccessTests(BMRBase):
    def test_viewer_can_read_but_not_create_or_edit(self):
        self.assertEqual(self.create_bmr(user=self.bmr_viewer).status_code, 403)
        self.create_bmr()
        read = self.client_.get(bmr_url(self.company.id, self.plan.id), **bearer(self.bmr_viewer))
        self.assertEqual(read.status_code, 200)
        bmr = read.json()
        line = bmr["lines"][0]
        patched = self.client_.patch(
            line_url(self.company.id, bmr["id"], line["id"]),
            data=json.dumps({"expected_version": line["version"], "ar_no": "nope"}),
            content_type="application/json", **bearer(self.bmr_viewer),
        )
        self.assertEqual(patched.status_code, 403)

    def test_outsider_company_is_denied(self):
        self.create_bmr()
        res = self.client_.get(bmr_url(self.company.id, self.plan.id), **bearer(self.outsider))
        self.assertIn(res.status_code, (403, 404))

    def test_no_bmr_yet_is_a_clear_not_found_not_an_empty_record(self):
        res = self.client_.get(bmr_url(self.company.id, self.plan.id), **bearer(self.bmr_manager))
        self.assertEqual(res.status_code, 404)

    def test_creation_audit_failure_leaves_no_bmr(self):
        with patch("apps.bmr.services.record", side_effect=RuntimeError("audit down")):
            with self.assertRaises(RuntimeError):
                self.create_bmr()
        self.assertFalse(BatchManufacturingRecord.objects.filter(batch_plan=self.plan).exists())


class AdminGrantAccessTests(BMRBase):
    """The BMR codes the confirmed Admin role now holds are real, active,
    company-scoped permissions, and users without them (Store Manager and
    Manager personas) are refused. Synthetic data only; the live role is not
    read here.
    """

    def test_bmr_codes_are_seeded_active_and_company_scoped(self):
        from apps.permissions.models import PermissionDefinition

        defs = {d.code: d for d in PermissionDefinition.objects.filter(code__in=["bmr.view", "bmr.create", "bmr.edit"])}
        self.assertEqual(set(defs), {"bmr.view", "bmr.create", "bmr.edit"})
        for definition in defs.values():
            self.assertTrue(definition.is_active)
            self.assertEqual(definition.scope, PermissionDefinition.Scope.COMPANY)

    def test_store_manager_persona_without_bmr_is_refused(self):
        # Saloni's intended access: batch plan view and store preparation, no BMR.
        store_manager = make_user("storemgr_nobmr")
        grant_company_permission(self.superuser, store_manager, self.company, "batch_plans.view")
        grant_store_permission(self.superuser, store_manager, self.store, *STORE_PREP_ALL_PERMS)
        self.assertEqual(self.client_.get(bmr_url(self.company.id, self.plan.id), **bearer(store_manager)).status_code, 403)
        self.assertEqual(self.create_bmr(user=store_manager).status_code, 403)

    def test_manager_persona_without_bmr_is_refused(self):
        # Fenil's intended access: batch planning, no BMR.
        manager = make_user("manager_nobmr")
        grant_company_permission(self.superuser, manager, self.company, "batch_plans.view", "formulas.view", "batch_plans.create")
        self.assertEqual(self.client_.get(bmr_url(self.company.id, self.plan.id), **bearer(manager)).status_code, 403)
        self.assertEqual(self.create_bmr(user=manager).status_code, 403)
