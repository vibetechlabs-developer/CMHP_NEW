import datetime
import itertools
import json
import threading
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import connection
from django.test import Client, TestCase, TransactionTestCase
from django.utils import timezone
from rest_framework_simplejwt.tokens import AccessToken

from apps.audit.models import AuditLog
from apps.batch_plans import services as bp_services
from apps.batch_plans.models import BatchPlan
from apps.catalog.models import Material, UnitOfMeasure
from apps.common.errors import Conflict
from apps.companies.models import Company
from apps.customers.models import Customer
from apps.formulas.models import Formula, FormulaLine, FormulaRevision
from apps.permissions.services import create_company_role, replace_role_permissions
from apps.products.models import Product
from apps.sales_orders.models import SalesOrder, SalesOrderLine
from apps.sales_orders.services import create_sales_order, update_sales_order
from apps.users.services import assign_company_membership, assign_membership_role

User = get_user_model()
PASSWORD = "a-strong-pass-1"
_counter = itertools.count()

ALL_PLAN_PERMS = [
    "batch_plans.view",
    "batch_plans.create",
    "batch_plans.edit",
    "sales_orders.view",
    "formulas.view",
]


def plan_list_url(company_id):
    return f"/api/v1/companies/{company_id}/batch-plans/"


def plan_detail_url(company_id, plan_id):
    return f"/api/v1/companies/{company_id}/batch-plans/{plan_id}/"


def sales_order_url(company_id, sales_order_id):
    return f"/api/v1/companies/{company_id}/sales-orders/{sales_order_id}/"


def plan_preview_url(company_id, plan_id):
    return f"/api/v1/companies/{company_id}/batch-plans/{plan_id}/requirement-preview/"


def make_user(prefix="user"):
    n = next(_counter)
    return User.objects.create_user(
        username=f"{prefix}_{n}", email=f"{prefix}_{n}@example.com", password=PASSWORD
    )


def make_superuser(prefix="admin"):
    n = next(_counter)
    return User.objects.create_superuser(
        username=f"{prefix}_{n}", email=f"{prefix}_{n}@example.com", password=PASSWORD
    )


def make_company(prefix="CMP"):
    n = next(_counter)
    return Company.objects.create(code=f"{prefix}{n}", legal_name=f"{prefix}{n} Pvt Ltd")


def make_unit(prefix="UOM", dimension=UnitOfMeasure.Dimension.COUNT, canonical_factor=None):
    n = next(_counter)
    return UnitOfMeasure.objects.create(
        code=f"{prefix}{n}", name=f"{prefix}{n} Name", dimension=dimension, canonical_factor=canonical_factor
    )


def make_material(prefix="MAT", kind=Material.Kind.RAW_MATERIAL, unit=None):
    n = next(_counter)
    if unit is None:
        unit = make_unit(prefix="KG", dimension=UnitOfMeasure.Dimension.MASS)
    return Material.objects.create(code=f"{prefix}{n}", name=f"{prefix}{n} Name", kind=kind, base_unit=unit)


def make_product(company, unit, actor, prefix="PRD"):
    n = next(_counter)
    return Product.objects.create(
        company=company, code=f"{prefix}{n}", name=f"{prefix}{n} Product", sales_uom=unit, created_by=actor
    )


def make_customer(company, actor, prefix="CUST"):
    n = next(_counter)
    return Customer.objects.create(
        company=company, code=f"{prefix}{n}", name=f"{prefix}{n} Customer", created_by=actor
    )


def approve_revision_directly(revision, approver):
    """Test-only shortcut: flip an already-drafted-and-lined revision to
    APPROVED without going through the full policy-gated service (Task 11C
    approval itself is exercised by tests.test_formula_approval). Lines must
    already be attached - FormulaLine.clean() forbids adding lines to a
    revision that is already APPROVED.
    """
    revision.status = FormulaRevision.Status.APPROVED
    revision.approved_by = approver
    revision.approved_at = timezone.now()
    revision.approval_policy_version = 1
    revision.approval_policy_snapshot = {"allow_self_approval": True}
    revision.save()
    return revision


def grant_permissions(company, user, permissions, actor=None):
    """Grant `user` an active membership in `company` and, if `permissions`
    is non-empty, a role holding exactly those COMPANY-scope codes. `actor`
    (default: `user` itself - membership/role assignment does not require
    the actor to be the company's superuser) is only the audited "who did
    this", matching `apps.users.services`/`apps.permissions.services`.
    """
    actor = actor or user
    membership, _ = assign_company_membership(actor=actor, user=user, company=company)
    if permissions:
        role = create_company_role(
            actor=actor, company=company, code=f"ROLE{user.id}", name=f"Role_{next(_counter)}", description="Test role"
        )
        replace_role_permissions(actor=actor, role=role, permission_codes=permissions)
        assign_membership_role(actor=actor, membership=membership, role=role)
    return membership


def bearer(user):
    token = str(AccessToken.for_user(user))
    return {"HTTP_AUTHORIZATION": f"Bearer {token}"}


class BatchPlanBase(TestCase):
    def setUp(self):
        self.client = Client()
        self.admin = make_user("admin")
        self.company = make_company("ALF")
        self.unit_count = make_unit("BTL", dimension=UnitOfMeasure.Dimension.COUNT)
        self.unit_kg = make_unit("KG", dimension=UnitOfMeasure.Dimension.MASS)
        self.product = make_product(self.company, self.unit_count, self.admin, "MED")
        self.customer = make_customer(self.company, self.admin, "CUST")

        self.order = create_sales_order(
            actor=self.admin,
            company=self.company,
            customer_id=self.customer.id,
            currency="INR",
            order_date=datetime.date(2026, 10, 1),
            lines=[
                {"product_id": self.product.id, "quantity": Decimal("100"), "unit_price": Decimal("15.00")}
            ],
        )
        self.line = self.order.lines.first()

        self.formula = Formula.objects.create(
            company=self.company,
            product=self.product,
            code="F-MED-01",
            name="Medicine Formula",
            latest_revision_number=1,
            created_by=self.admin,
        )
        self.raw_mat = make_material("ACT", Material.Kind.RAW_MATERIAL, self.unit_kg)
        self.pck_mat = make_material("CAP", Material.Kind.PACKAGING_MATERIAL, self.unit_count)
        self.revision = FormulaRevision.objects.create(
            formula=self.formula,
            revision_number=1,
            status=FormulaRevision.Status.DRAFT,
            base_output_quantity=Decimal("100.000"),
            output_uom=self.unit_count,
            created_by=self.admin,
        )
        FormulaLine.objects.create(
            revision=self.revision,
            line_number=1,
            material=self.raw_mat,
            quantity=Decimal("10.000"),
            unit=self.unit_kg,
            material_code_snapshot=self.raw_mat.code,
            material_name_snapshot=self.raw_mat.name,
            material_kind_snapshot=self.raw_mat.kind,
            unit_code_snapshot=self.unit_kg.code,
            unit_name_snapshot=self.unit_kg.name,
        )
        FormulaLine.objects.create(
            revision=self.revision,
            line_number=2,
            material=self.pck_mat,
            quantity=Decimal("100.000"),
            unit=self.unit_count,
            material_code_snapshot=self.pck_mat.code,
            material_name_snapshot=self.pck_mat.name,
            material_kind_snapshot=self.pck_mat.kind,
            unit_code_snapshot=self.unit_count.code,
            unit_name_snapshot=self.unit_count.name,
        )
        approve_revision_directly(self.revision, self.admin)

        self.operator = make_user("planner")
        grant_permissions(self.company, self.operator, ALL_PLAN_PERMS, actor=self.admin)

    def create_plan(self, user=None, **overrides):
        payload = {
            "sales_order_line_id": self.line.id,
            "formula_revision_id": self.revision.id,
            "target_output_quantity": "100",
        }
        payload.update(overrides)
        return self.client.post(
            plan_list_url(self.company.id),
            data=json.dumps(payload),
            content_type="application/json",
            **bearer(user or self.operator),
        )


class BatchPlanTests(BatchPlanBase):
    def test_create_batch_plan_success_and_snapshots(self):
        res = self.create_plan(
            target_output_quantity="500",
            planned_manufacturing_date="2026-10-15",
            packing_size_note="100 bottles per case",
            notes="Urgent planning run",
        )
        self.assertEqual(res.status_code, 201, res.content)
        data = res.json()
        self.assertEqual(data["target_output_quantity"], "500.000")
        self.assertEqual(data["status"], "DRAFT")
        self.assertEqual(data["version"], 1)
        self.assertEqual(data["planned_manufacturing_date"], "2026-10-15")
        self.assertEqual(data["packing_size_note"], "100 bottles per case")
        self.assertEqual(data["notes"], "Urgent planning run")

        snapshots = data["source_snapshots"]
        self.assertEqual(snapshots["sales_order_reference"], self.order.reference)
        self.assertEqual(snapshots["sales_order_line_number"], self.line.line_number)
        self.assertEqual(snapshots["product_code"], self.product.code)
        self.assertEqual(snapshots["output_uom_code"], self.unit_count.code)
        self.assertEqual(snapshots["formula_code"], self.formula.code)
        self.assertEqual(snapshots["formula_revision_number"], 1)
        self.assertEqual(snapshots["formula_base_output_quantity"], "100.000")
        self.assertIn("Planning draft", data["notice"])
        self.assertIn("official batch number not assigned", data["notice"])

    def test_authentication_required(self):
        res = self.client.post(
            plan_list_url(self.company.id),
            data=json.dumps({"sales_order_line_id": self.line.id, "formula_revision_id": self.revision.id, "target_output_quantity": "1"}),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 401)
        self.assertEqual(self.client.get(plan_list_url(self.company.id)).status_code, 401)

    def test_no_membership_is_404_and_no_superuser_bypass(self):
        outsider = make_user("outsider")
        res = self.create_plan(user=outsider)
        self.assertEqual(res.status_code, 404)
        superuser = make_superuser("plainadmin")
        res = self.create_plan(user=superuser)
        self.assertEqual(res.status_code, 404)
        res = self.client.get(plan_list_url(self.company.id), **bearer(superuser))
        self.assertEqual(res.status_code, 404)

    def test_permission_enforcement_on_create(self):
        user = make_user("noperms")
        grant_permissions(self.company, user, [], actor=self.admin)
        res = self.create_plan(user=user)
        self.assertEqual(res.status_code, 403)
        self.assertIn("batch_plans.view", res.json()["detail"])

        user2 = make_user("partial")
        grant_permissions(self.company, user2, ["batch_plans.view", "batch_plans.create", "formulas.view"], actor=self.admin)
        res2 = self.create_plan(user=user2)
        self.assertEqual(res2.status_code, 403)
        self.assertIn("sales_orders.view", res2.json()["detail"])

        user3 = make_user("partial2")
        grant_permissions(self.company, user3, ["batch_plans.view", "batch_plans.create", "sales_orders.view"], actor=self.admin)
        res3 = self.create_plan(user=user3)
        self.assertEqual(res3.status_code, 403)
        self.assertIn("formulas.view", res3.json()["detail"])

    def test_view_only_cannot_create_or_edit(self):
        viewer = make_user("viewer")
        grant_permissions(self.company, viewer, ["batch_plans.view"], actor=self.admin)
        res = self.create_plan(user=viewer)
        self.assertEqual(res.status_code, 403)
        self.assertIn("batch_plans.create", res.json()["detail"])
        plan = self.create_plan().json()
        res = self.client.patch(
            plan_detail_url(self.company.id, plan["id"]),
            data=json.dumps({"expected_version": 1, "notes": "x"}),
            content_type="application/json",
            **bearer(viewer),
        )
        self.assertEqual(res.status_code, 403)
        self.assertIn("batch_plans.edit", res.json()["detail"])

    def test_company_isolation(self):
        other_company = make_company("BET")
        other_user = make_user("other")
        grant_permissions(other_company, other_user, ALL_PLAN_PERMS)
        res = self.client.post(
            plan_list_url(other_company.id),
            data=json.dumps({
                "sales_order_line_id": self.line.id,
                "formula_revision_id": self.revision.id,
                "target_output_quantity": "100",
            }),
            content_type="application/json",
            **bearer(other_user),
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("sales_order_line_id", res.json())

        # An existing plan in `self.company` is a 404 when read through `other_company`
        plan = self.create_plan().json()
        cross = self.client.get(plan_detail_url(other_company.id, plan["id"]), **bearer(other_user))
        self.assertEqual(cross.status_code, 404)

    def test_confirmed_sales_order_source(self):
        self.order.status = SalesOrder.Status.CONFIRMED
        self.order.confirmed_by = self.admin
        self.order.confirmed_at = timezone.now()
        self.order.save()

        res = self.create_plan(target_output_quantity="250")
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.json()["current_source_state"]["sales_order"]["status"], "CONFIRMED")

    def test_draft_formula_revision_rejected(self):
        draft_rev = FormulaRevision.objects.create(
            formula=self.formula,
            revision_number=2,
            status=FormulaRevision.Status.DRAFT,
            base_output_quantity=Decimal("100.000"),
            output_uom=self.unit_count,
            created_by=self.admin,
        )
        res = self.create_plan(formula_revision_id=draft_rev.id)
        self.assertEqual(res.status_code, 400)
        self.assertIn("APPROVED", str(res.json()["formula_revision_id"]))

    def test_product_mismatch_rejected(self):
        other_product = make_product(self.company, self.unit_count, self.admin, "OTH")
        other_formula = Formula.objects.create(
            company=self.company, product=other_product, code="F-OTH-01", name="Other Formula",
            latest_revision_number=1, created_by=self.admin,
        )
        other_rev = FormulaRevision.objects.create(
            formula=other_formula, revision_number=1, status=FormulaRevision.Status.APPROVED,
            base_output_quantity=Decimal("100.000"), output_uom=self.unit_count,
            approved_by=self.admin, approved_at=timezone.now(), created_by=self.admin,
        )
        res = self.create_plan(formula_revision_id=other_rev.id)
        self.assertEqual(res.status_code, 400)
        self.assertIn("Products must match", str(res.json()["formula_revision_id"]))

    def test_unit_mismatch_rejected(self):
        other_unit = make_unit("OZ", dimension=UnitOfMeasure.Dimension.MASS)
        mismatched_formula = Formula.objects.create(
            company=self.company, product=self.product, code="F-UNIT-01", name="Unit Mismatch",
            latest_revision_number=1, created_by=self.admin,
        )
        mismatched_rev = FormulaRevision.objects.create(
            formula=mismatched_formula, revision_number=1, status=FormulaRevision.Status.DRAFT,
            base_output_quantity=Decimal("10.000"), output_uom=other_unit, created_by=self.admin,
        )
        FormulaLine.objects.create(
            revision=mismatched_rev, line_number=1, material=self.raw_mat, quantity=Decimal("1.000"),
            unit=self.unit_kg, material_code_snapshot=self.raw_mat.code, material_name_snapshot=self.raw_mat.name,
            material_kind_snapshot=self.raw_mat.kind, unit_code_snapshot=self.unit_kg.code, unit_name_snapshot=self.unit_kg.name,
        )
        approve_revision_directly(mismatched_rev, self.admin)
        # No packing relationship supplied (Task 12B-2 Shape A): the line's
        # own unit must equal the formula's output unit, or the mismatch is
        # rejected naming what to supply instead.
        res = self.create_plan(formula_revision_id=mismatched_rev.id)
        self.assertEqual(res.status_code, 400)
        self.assertIn("does not match the order line's own unit", str(res.json()["packing_content_uom_id"]))

    def test_quantity_validation_rules(self):
        res1 = self.create_plan(target_output_quantity="0")
        self.assertEqual(res1.status_code, 400)
        res2 = self.create_plan(target_output_quantity="100.1234")
        self.assertEqual(res2.status_code, 400)
        res3 = self.create_plan(target_output_quantity="100.5")
        self.assertEqual(res3.status_code, 400)
        self.assertIn("Whole numbers are required", str(res3.json()["target_output_quantity"]))

    def test_wrong_company_formula_revision_rejected(self):
        other_company = make_company("WFC")
        other_admin = make_user("wfcadmin")
        other_product = make_product(other_company, self.unit_count, other_admin, "WFCP")
        other_formula = Formula.objects.create(
            company=other_company, product=other_product, code="F-WFC-01", name="Wrong Co",
            latest_revision_number=1, created_by=other_admin,
        )
        other_rev = FormulaRevision.objects.create(
            formula=other_formula, revision_number=1, status=FormulaRevision.Status.APPROVED,
            base_output_quantity=Decimal("10.000"), output_uom=self.unit_count,
            approved_by=other_admin, approved_at=timezone.now(), created_by=other_admin,
        )
        res = self.create_plan(formula_revision_id=other_rev.id)
        self.assertEqual(res.status_code, 400)
        self.assertIn("does not belong to this company", str(res.json()["formula_revision_id"]))

    def test_multiple_independent_plans_on_same_line(self):
        res1 = self.create_plan(target_output_quantity="100", notes="Plan 1")
        self.assertEqual(res1.status_code, 201)
        res2 = self.create_plan(target_output_quantity="200", notes="Plan 2")
        self.assertEqual(res2.status_code, 201)
        self.assertNotEqual(res1.json()["id"], res2.json()["id"])
        self.assertEqual(BatchPlan.objects.filter(sales_order_line=self.line).count(), 2)

    def test_update_plan_and_optimistic_concurrency(self):
        plan_id = self.create_plan().json()["id"]

        res = self.client.patch(
            plan_detail_url(self.company.id, plan_id),
            data=json.dumps({"expected_version": 1, "target_output_quantity": "300", "notes": "Updated note"}),
            content_type="application/json",
            **bearer(self.operator),
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["version"], 2)
        self.assertEqual(res.json()["target_output_quantity"], "300.000")
        self.assertEqual(res.json()["notes"], "Updated note")

        res_stale = self.client.patch(
            plan_detail_url(self.company.id, plan_id),
            data=json.dumps({"expected_version": 1, "target_output_quantity": "300"}),
            content_type="application/json",
            **bearer(self.operator),
        )
        self.assertEqual(res_stale.status_code, 409)

        audit_count = AuditLog.objects.filter(target_id=str(plan_id)).count()
        res_noop = self.client.patch(
            plan_detail_url(self.company.id, plan_id),
            data=json.dumps({"expected_version": 2, "target_output_quantity": "300"}),
            content_type="application/json",
            **bearer(self.operator),
        )
        self.assertEqual(res_noop.status_code, 200)
        self.assertEqual(res_noop.json()["version"], 2)
        self.assertEqual(AuditLog.objects.filter(target_id=str(plan_id)).count(), audit_count)

    def test_protected_fields_cannot_be_patched(self):
        plan_id = self.create_plan().json()["id"]
        for extra in ("company_id", "sales_order_line_id", "formula_revision_id", "status", "version", "created_by_id"):
            res = self.client.patch(
                plan_detail_url(self.company.id, plan_id),
                data=json.dumps({"expected_version": 1, extra: 999}),
                content_type="application/json",
                **bearer(self.operator),
            )
            self.assertEqual(res.status_code, 400, extra)
        self.assertEqual(BatchPlan.objects.get(pk=plan_id).version, 1)

    def test_source_drift_and_deletion_protection(self):
        plan_id = self.create_plan().json()["id"]

        with self.assertRaises(DjangoValidationError) as ctx:
            update_sales_order(
                actor=self.admin, sales_order_id=self.order.id, expected_version=self.order.version, data={"lines": []},
            )
        self.assertIn("referenced by existing batch plan", str(ctx.exception))
        # the whole order update rolled back - the order/line are untouched
        self.order.refresh_from_db()
        self.assertEqual(self.order.version, 1)
        self.assertTrue(SalesOrderLine.objects.filter(pk=self.line.id).exists())

        other_product = make_product(self.company, self.unit_count, self.admin, "DRFTPROD")
        update_sales_order(
            actor=self.admin, sales_order_id=self.order.id, expected_version=self.order.version,
            data={"lines": [{"id": self.line.id, "product_id": other_product.id, "quantity": Decimal("100"), "unit_price": Decimal("20.00")}]},
        )

        det_res = self.client.get(plan_detail_url(self.company.id, plan_id), **bearer(self.operator))
        self.assertEqual(det_res.status_code, 200)
        drift = det_res.json()["source_drift"]
        self.assertTrue(drift["has_drift"])
        self.assertTrue(drift["is_incompatible"])

        patch_res = self.client.patch(
            plan_detail_url(self.company.id, plan_id),
            data=json.dumps({"expected_version": 1, "target_output_quantity": "500"}),
            content_type="application/json",
            **bearer(self.operator),
        )
        self.assertEqual(patch_res.status_code, 400)
        self.assertIn("incompatible", str(patch_res.json()["target_output_quantity"]))

        safe_res = self.client.patch(
            plan_detail_url(self.company.id, plan_id),
            data=json.dumps({"expected_version": 1, "notes": "Safe note edit despite drift"}),
            content_type="application/json",
            **bearer(self.operator),
        )
        self.assertEqual(safe_res.status_code, 200)
        self.assertEqual(safe_res.json()["notes"], "Safe note edit despite drift")

        prev_res = self.client.get(plan_preview_url(self.company.id, plan_id), **bearer(self.operator))
        self.assertEqual(prev_res.status_code, 200)
        prev_data = prev_res.json()
        self.assertFalse(prev_data["calculation_complete"])
        self.assertEqual(prev_data["calculation_issues"][0]["code"], "INCOMPATIBLE_SOURCE_DRIFT")

    def test_authenticated_patch_removing_a_referenced_line_returns_400_and_rolls_back(self):
        """Task 12A closeout: the same protection as `test_source_drift_and_
        deletion_protection` above, but driven through a real authenticated
        HTTP PATCH on the sales-order endpoint (not a direct service call),
        combined with an unrelated header change in the SAME request so a
        real partial-commit would be visible if the rollback were wrong.
        """
        self.create_plan()
        grant_permissions(self.company, self.admin, ["sales_orders.view", "sales_orders.edit"], actor=self.admin)
        audit_before = list(AuditLog.objects.filter(target_type="sales_order", target_id=self.order.id).values("id"))
        order_before = (self.order.version, self.order.notes, self.order.customer_order_reference)

        res = self.client.patch(
            sales_order_url(self.company.id, self.order.id),
            data=json.dumps({
                "expected_version": self.order.version,
                "notes": "should never be saved",
                "customer_order_reference": "PO-SHOULD-NOT-STICK",
                "lines": [],
            }),
            content_type="application/json",
            **bearer(self.admin),
        )

        self.assertEqual(res.status_code, 400, res.content)
        self.assertIn("referenced by existing batch plan", str(res.json()["lines"]))

        # the referenced line still exists
        self.assertTrue(SalesOrderLine.objects.filter(pk=self.line.id).exists())
        # the unrelated header edits in the SAME request were rolled back too - not partially applied
        self.order.refresh_from_db()
        self.assertEqual((self.order.version, self.order.notes, self.order.customer_order_reference), order_before)
        # no audit record was written for the failed attempt
        audit_after = list(AuditLog.objects.filter(target_type="sales_order", target_id=self.order.id).values("id"))
        self.assertEqual(audit_before, audit_after)

    def test_list_and_detail_never_expose_formula_lines_even_with_full_access(self):
        """`batch_plans.view` (even together with `formulas.view`) must never
        surface the pinned formula's own material lines through the ordinary
        list/detail endpoints - only the requirement-preview endpoint (its
        own extra `formulas.view` check) may.
        """
        self.create_plan()
        list_res = self.client.get(plan_list_url(self.company.id), **bearer(self.operator))
        self.assertEqual(list_res.status_code, 200)
        for row in list_res.json()["results"]:
            self.assertNotIn("lines", row)
            self.assertNotIn("formula_lines", row)

        plan_id = BatchPlan.objects.filter(company=self.company).first().id
        det_res = self.client.get(plan_detail_url(self.company.id, plan_id), **bearer(self.operator))
        self.assertEqual(det_res.status_code, 200)
        self.assertNotIn("lines", det_res.json())
        self.assertNotIn("formula_lines", det_res.json())

    def test_historical_readability_after_master_deactivation(self):
        plan_id = self.create_plan().json()["id"]

        self.product.is_active = False
        self.product.save()

        det_res = self.client.get(plan_detail_url(self.company.id, plan_id), **bearer(self.operator))
        self.assertEqual(det_res.status_code, 200)

        edit_res = self.client.patch(
            plan_detail_url(self.company.id, plan_id),
            data=json.dumps({"expected_version": 1, "notes": "Historical memo"}),
            content_type="application/json",
            **bearer(self.operator),
        )
        self.assertEqual(edit_res.status_code, 200)

        target_res = self.client.patch(
            plan_detail_url(self.company.id, plan_id),
            data=json.dumps({"expected_version": 2, "target_output_quantity": "200"}),
            content_type="application/json",
            **bearer(self.operator),
        )
        self.assertEqual(target_res.status_code, 400)
        self.assertIn("inactive", str(target_res.json()["target_output_quantity"]))

    def test_requirement_preview_calculation(self):
        plan_id = self.create_plan(target_output_quantity="500").json()["id"]
        res = self.client.get(plan_preview_url(self.company.id, plan_id), **bearer(self.operator))
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data["calculation_complete"])
        self.assertEqual(data["target_output_quantity"], "500.000")
        self.assertEqual(data["scale_factor"]["value"], "5")

        self.assertEqual(len(data["lines"]), 2)
        raw_line = [l for l in data["lines"] if l["material_type"] == "RAW_MATERIAL"][0]
        self.assertEqual(raw_line["required_quantity"]["value"], "50")
        self.assertTrue(raw_line["required_quantity"]["is_exact"])
        pack_line = [l for l in data["lines"] if l["material_type"] == "PACKAGING_MATERIAL"][0]
        self.assertEqual(pack_line["required_quantity"]["value"], "500")

        self.assertIn("Planning draft", data["preview"]["notices"][0])
        self.assertIn("plan", data)
        self.assertEqual(data["plan"]["id"], plan_id)
        self.assertIn("generated_at", data["preview"])

    def test_preview_writes_nothing(self):
        plan_id = self.create_plan(target_output_quantity="500").json()["id"]
        before = (
            AuditLog.objects.count(),
            BatchPlan.objects.get(pk=plan_id).version,
            BatchPlan.objects.get(pk=plan_id).updated_at,
        )
        self.client.get(plan_preview_url(self.company.id, plan_id), **bearer(self.operator))
        after = (
            AuditLog.objects.count(),
            BatchPlan.objects.get(pk=plan_id).version,
            BatchPlan.objects.get(pk=plan_id).updated_at,
        )
        self.assertEqual(before, after)

    def test_preview_requires_formulas_view(self):
        plan_id = self.create_plan().json()["id"]
        limited_user = make_user("lim")
        grant_permissions(self.company, limited_user, ["batch_plans.view"], actor=self.admin)

        det_res = self.client.get(plan_detail_url(self.company.id, plan_id), **bearer(limited_user))
        self.assertEqual(det_res.status_code, 200)
        # the ordinary detail view never surfaces the formula's own lines
        self.assertNotIn("lines", det_res.json())

        prev_res = self.client.get(plan_preview_url(self.company.id, plan_id), **bearer(limited_user))
        self.assertEqual(prev_res.status_code, 403)
        self.assertIn("formulas.view", prev_res.json()["detail"])

    def test_unsupported_methods(self):
        plan_id = self.create_plan().json()["id"]
        self.assertEqual(self.client.delete(plan_detail_url(self.company.id, plan_id), **bearer(self.operator)).status_code, 405)
        self.assertEqual(
            self.client.put(plan_detail_url(self.company.id, plan_id), data=json.dumps({}), content_type="application/json", **bearer(self.operator)).status_code,
            405,
        )
        self.assertEqual(
            self.client.post(plan_preview_url(self.company.id, plan_id), data=json.dumps({}), content_type="application/json", **bearer(self.operator)).status_code,
            405,
        )
        self.assertEqual(self.client.delete(plan_list_url(self.company.id), **bearer(self.operator)).status_code, 405)

    def test_no_delete_or_lifecycle_route_exists(self):
        from django.urls import NoReverseMatch, reverse

        for name in ("batch-plan-approve", "batch-plan-cancel", "batch-plan-release", "batch-plan-delete"):
            with self.assertRaises(NoReverseMatch):
                reverse(name, kwargs={"company_id": self.company.id, "plan_id": 1})

    def test_model_delete_is_blocked(self):
        plan_id = self.create_plan().json()["id"]
        plan = BatchPlan.objects.get(pk=plan_id)
        with self.assertRaises(DjangoValidationError):
            plan.delete()
        self.assertTrue(BatchPlan.objects.filter(pk=plan_id).exists())

    def test_list_filtering_and_unknown_param_rejection(self):
        self.create_plan(planned_manufacturing_date="2026-11-20", notes="Alpha plan")

        res1 = self.client.get(f"{plan_list_url(self.company.id)}?order={self.order.id}", **bearer(self.operator))
        self.assertEqual(res1.status_code, 200)
        self.assertEqual(len(res1.json()["results"]), 1)

        res2 = self.client.get(f"{plan_list_url(self.company.id)}?planned_manufacturing_date=2026-11-20", **bearer(self.operator))
        self.assertEqual(res2.status_code, 200)
        self.assertEqual(len(res2.json()["results"]), 1)

        res3 = self.client.get(f"{plan_list_url(self.company.id)}?search=Alpha", **bearer(self.operator))
        self.assertEqual(res3.status_code, 200)
        self.assertEqual(len(res3.json()["results"]), 1)

        res4 = self.client.get(f"{plan_list_url(self.company.id)}?unknown_filter=123", **bearer(self.operator))
        self.assertEqual(res4.status_code, 400)
        self.assertIn("unknown_filter", res4.json())

    def test_list_ordering_is_deterministic_and_paginated(self):
        for i in range(3):
            self.create_plan(notes=f"plan {i}")
        res = self.client.get(f"{plan_list_url(self.company.id)}?page_size=2", **bearer(self.operator))
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(len(body["results"]), 2)
        self.assertIn("count", body)
        ids = [row["id"] for row in body["results"]]
        self.assertEqual(ids, sorted(ids, reverse=True))

    def test_audit_rollback_on_failure(self):
        with patch("apps.batch_plans.services.record", side_effect=RuntimeError("Audit failure")):
            with self.assertRaises(RuntimeError):
                self.create_plan()
        self.assertEqual(BatchPlan.objects.count(), 0)

    def test_update_audit_rollback_on_failure(self):
        plan_id = self.create_plan().json()["id"]
        with patch("apps.batch_plans.services.record", side_effect=RuntimeError("Audit failure")):
            with self.assertRaises(RuntimeError):
                self.client.patch(
                    plan_detail_url(self.company.id, plan_id),
                    data=json.dumps({"expected_version": 1, "notes": "should roll back"}),
                    content_type="application/json",
                    **bearer(self.operator),
                )
        plan = BatchPlan.objects.get(pk=plan_id)
        self.assertEqual((plan.version, plan.notes), (1, ""))


class ConcurrencyTests(TransactionTestCase):
    serialized_rollback = True

    def _setup(self, suffix):
        admin = make_user(f"cadmin{suffix}")
        operator = make_user(f"coperator{suffix}")
        company = make_company(f"CC{suffix}")
        grant_permissions(company, operator, ALL_PLAN_PERMS)
        unit_count = make_unit(f"CCU{suffix}", UnitOfMeasure.Dimension.COUNT)
        unit_kg = make_unit(f"CCK{suffix}", UnitOfMeasure.Dimension.MASS)
        product = make_product(company, unit_count, admin, f"CCP{suffix}")
        customer = make_customer(company, admin, f"CCC{suffix}")
        order = create_sales_order(
            actor=admin, company=company, customer_id=customer.id, currency="INR",
            order_date=datetime.date(2026, 10, 1),
            lines=[{"product_id": product.id, "quantity": Decimal("10"), "unit_price": Decimal("1")}],
        )
        line = order.lines.first()
        formula = Formula.objects.create(
            company=company, product=product, code=f"F{suffix}", name="F", latest_revision_number=1, created_by=admin,
        )
        raw = make_material(f"RAW{suffix}", Material.Kind.RAW_MATERIAL, unit_kg)
        revision = FormulaRevision.objects.create(
            formula=formula, revision_number=1, status=FormulaRevision.Status.DRAFT,
            base_output_quantity=Decimal("10.000"), output_uom=unit_count, created_by=admin,
        )
        FormulaLine.objects.create(
            revision=revision, line_number=1, material=raw, quantity=Decimal("1.000"), unit=unit_kg,
            material_code_snapshot=raw.code, material_name_snapshot=raw.name, material_kind_snapshot=raw.kind,
            unit_code_snapshot=unit_kg.code, unit_name_snapshot=unit_kg.name,
        )
        approve_revision_directly(revision, admin)
        return dict(
            admin=admin, operator=operator, company=company, product=product, unit_count=unit_count,
            customer=customer, order=order, line=line, formula=formula, revision=revision,
        )

    def _create_call(self, ctx, results, key="create", target="5"):
        def run():
            try:
                bp_services.create_batch_plan(
                    actor=ctx["operator"], company=ctx["company"], sales_order_line_id=ctx["line"].id,
                    formula_revision_id=ctx["revision"].id, target_output_quantity=target,
                )
                results[key] = "ok"
            except Conflict:
                results[key] = "conflict"
            except DjangoValidationError as exc:
                results[key] = exc
            except Exception as exc:  # noqa: BLE001 - reported through the assertion
                results[key] = exc
            finally:
                connection.close()

        return run

    def _paused_create(self, ctx, inside, release, results, target="5"):
        original = bp_services._check_target_quantity

        def slow(*args, **kwargs):
            inside.set()
            release.wait(timeout=20)
            return original(*args, **kwargs)

        inner = self._create_call(ctx, results, target=target)

        def run():
            with patch.object(bp_services, "_check_target_quantity", side_effect=slow):
                inner()

        return run

    def test_product_deactivation_waits_for_an_in_flight_creation(self):
        ctx = self._setup("A")
        inside, release, results = threading.Event(), threading.Event(), {}
        creating = threading.Thread(target=self._paused_create(ctx, inside, release, results))
        creating.start()
        self.assertTrue(inside.wait(timeout=20))

        def deactivate():
            try:
                Product.objects.filter(pk=ctx["product"].id).update(is_active=False)
                results["deactivate"] = "ok"
            finally:
                connection.close()

        thread = threading.Thread(target=deactivate)
        thread.start()
        thread.join(timeout=1.5)
        self.assertTrue(thread.is_alive(), "a product UPDATE must wait for the creating transaction's lock")
        release.set()
        creating.join(timeout=30)
        thread.join(timeout=30)
        self.assertEqual(results, {"create": "ok", "deactivate": "ok"})
        self.assertEqual(BatchPlan.objects.filter(company=ctx["company"]).count(), 1)

    def test_a_committed_deactivation_is_seen_by_the_next_creation_attempt(self):
        ctx = self._setup("B")
        Product.objects.filter(pk=ctx["product"].id).update(is_active=False)
        with self.assertRaises(DjangoValidationError) as raised:
            bp_services.create_batch_plan(
                actor=ctx["operator"], company=ctx["company"], sales_order_line_id=ctx["line"].id,
                formula_revision_id=ctx["revision"].id, target_output_quantity="5",
            )
        self.assertIn("inactive", str(raised.exception))
        self.assertEqual(BatchPlan.objects.filter(company=ctx["company"]).count(), 0)

    def test_two_concurrent_creations_on_the_same_line_both_succeed_independently(self):
        ctx = self._setup("C")
        results = {}
        barrier = threading.Barrier(2)

        def caller(key, target):
            body = self._create_call(ctx, results, key, target)

            def run():
                barrier.wait(timeout=5)
                body()

            return run

        threads = [threading.Thread(target=caller("a", "3")), threading.Thread(target=caller("b", "4"))]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30)
        self.assertEqual(results, {"a": "ok", "b": "ok"})
        self.assertEqual(BatchPlan.objects.filter(sales_order_line=ctx["line"]).count(), 2)

    def test_line_product_replacement_waits_for_an_in_flight_creation_and_is_seen_afterwards(self):
        ctx = self._setup("D")
        other_product = make_product(ctx["company"], ctx["unit_count"], ctx["admin"], "SWAPD")
        inside, release, results = threading.Event(), threading.Event(), {}
        creating = threading.Thread(target=self._paused_create(ctx, inside, release, results))
        creating.start()
        self.assertTrue(inside.wait(timeout=20))

        def replace_line():
            try:
                update_sales_order(
                    actor=ctx["admin"], sales_order_id=ctx["order"].id, expected_version=1,
                    data={"lines": [{"id": ctx["line"].id, "product_id": other_product.id, "quantity": Decimal("10"), "unit_price": Decimal("1")}]},
                )
                results["replace"] = "ok"
            except Exception as exc:  # noqa: BLE001
                results["replace"] = exc
            finally:
                connection.close()

        thread = threading.Thread(target=replace_line)
        thread.start()
        thread.join(timeout=1.5)
        self.assertTrue(thread.is_alive(), "the order-line replacement must wait for the creating transaction's lock on the order")
        release.set()
        creating.join(timeout=30)
        thread.join(timeout=30)
        self.assertEqual(results, {"create": "ok", "replace": "ok"})
        plan = BatchPlan.objects.get(company=ctx["company"])
        # the plan committed against the product that was locked and active at that time
        self.assertEqual(plan.product_id_snapshot, ctx["product"].id)

    def test_update_target_change_races_with_unit_deactivation(self):
        ctx = self._setup("E")
        plan = bp_services.create_batch_plan(
            actor=ctx["operator"], company=ctx["company"], sales_order_line_id=ctx["line"].id,
            formula_revision_id=ctx["revision"].id, target_output_quantity="5",
        )
        inside, release, results = threading.Event(), threading.Event(), {}
        original = bp_services._check_target_quantity

        def slow(*args, **kwargs):
            inside.set()
            release.wait(timeout=20)
            return original(*args, **kwargs)

        def update():
            try:
                with patch.object(bp_services, "_check_target_quantity", side_effect=slow):
                    bp_services.update_batch_plan(
                        actor=ctx["operator"], plan_id=plan.id, expected_version=1,
                        data={"target_output_quantity": "7"},
                    )
                results["update"] = "ok"
            except Exception as exc:  # noqa: BLE001
                results["update"] = exc
            finally:
                connection.close()

        updating = threading.Thread(target=update)
        updating.start()
        self.assertTrue(inside.wait(timeout=20))

        def deactivate():
            try:
                UnitOfMeasure.objects.filter(pk=ctx["unit_count"].id).update(is_active=False)
                results["deactivate"] = "ok"
            finally:
                connection.close()

        thread = threading.Thread(target=deactivate)
        thread.start()
        thread.join(timeout=1.5)
        self.assertTrue(thread.is_alive(), "a unit UPDATE must wait for the updating transaction's lock")
        release.set()
        updating.join(timeout=30)
        thread.join(timeout=30)
        self.assertEqual(results, {"update": "ok", "deactivate": "ok"})
        self.assertEqual(BatchPlan.objects.get(pk=plan.id).target_output_quantity, Decimal("7.000"))

    def test_update_versus_deletion_attempt_race_leaves_no_partial_state(self):
        ctx = self._setup("F")
        plan = bp_services.create_batch_plan(
            actor=ctx["operator"], company=ctx["company"], sales_order_line_id=ctx["line"].id,
            formula_revision_id=ctx["revision"].id, target_output_quantity="5",
        )
        inside, release, results = threading.Event(), threading.Event(), {}
        original = bp_services._check_target_quantity

        def slow(*args, **kwargs):
            inside.set()
            release.wait(timeout=20)
            return original(*args, **kwargs)

        def do_update():
            try:
                with patch.object(bp_services, "_check_target_quantity", side_effect=slow):
                    bp_services.update_batch_plan(
                        actor=ctx["operator"], plan_id=plan.id, expected_version=1,
                        data={"target_output_quantity": "9"},
                    )
                results["update"] = "ok"
            except Exception as exc:  # noqa: BLE001
                results["update"] = exc
            finally:
                connection.close()

        updating = threading.Thread(target=do_update)
        updating.start()
        self.assertTrue(inside.wait(timeout=20))

        def try_delete_line():
            try:
                update_sales_order(
                    actor=ctx["admin"], sales_order_id=ctx["order"].id, expected_version=1, data={"lines": []},
                )
                results["delete"] = "ok"
            except Exception as exc:  # noqa: BLE001
                results["delete"] = exc
            finally:
                connection.close()

        thread = threading.Thread(target=try_delete_line)
        thread.start()
        thread.join(timeout=1.5)
        self.assertTrue(thread.is_alive(), "the order edit must wait for the updating transaction's lock on the order")
        release.set()
        updating.join(timeout=30)
        thread.join(timeout=30)
        self.assertEqual(results["update"], "ok")
        self.assertIsInstance(results["delete"], DjangoValidationError)
        self.assertIn("referenced by existing batch plan", str(results["delete"]))
        self.assertTrue(SalesOrderLine.objects.filter(pk=ctx["line"].id).exists())
        self.assertEqual(BatchPlan.objects.get(pk=plan.id).target_output_quantity, Decimal("9.000"))


class PackingRelationshipTests(BatchPlanBase):
    """Task 12B-2: structured packing content (Shape B) - a product sold in
    a COUNT unit (bottles) with a formula manufactured in a MASS/VOLUME
    unit (kilograms), connected by an explicit, plan-specific packing
    relationship.
    """

    def setUp(self):
        super().setUp()
        # Canonical factors relative to their own dimension's smallest unit
        # used here (grams for MASS, millilitres for VOLUME) - explicit,
        # never inferred - see apps.catalog.models.UnitOfMeasure.
        self.unit_g = make_unit("GRM", dimension=UnitOfMeasure.Dimension.MASS, canonical_factor=Decimal("1"))
        self.unit_kg2 = make_unit("KG2", dimension=UnitOfMeasure.Dimension.MASS, canonical_factor=Decimal("1000"))
        self.unit_ml = make_unit("MLT", dimension=UnitOfMeasure.Dimension.VOLUME, canonical_factor=Decimal("1"))
        self.unit_mass_no_factor = make_unit("NOFAC", dimension=UnitOfMeasure.Dimension.MASS)  # no canonical_factor

        self.mass_formula = Formula.objects.create(
            company=self.company, product=self.product, code="F-MASS-01", name="Flexicare Mass Output",
            latest_revision_number=1, created_by=self.admin,
        )
        self.mass_revision = FormulaRevision.objects.create(
            formula=self.mass_formula, revision_number=1, status=FormulaRevision.Status.DRAFT,
            base_output_quantity=Decimal("100.000"), output_uom=self.unit_kg2, created_by=self.admin,
        )
        FormulaLine.objects.create(
            revision=self.mass_revision, line_number=1, material=self.raw_mat, quantity=Decimal("50.000"),
            unit=self.unit_kg, material_code_snapshot=self.raw_mat.code, material_name_snapshot=self.raw_mat.name,
            material_kind_snapshot=self.raw_mat.kind, unit_code_snapshot=self.unit_kg.code, unit_name_snapshot=self.unit_kg.name,
        )
        approve_revision_directly(self.mass_revision, self.admin)

    def create_packing_plan(self, **overrides):
        payload = {
            "sales_order_line_id": self.line.id,
            "formula_revision_id": self.mass_revision.id,
            "target_output_quantity": "76",
            "planned_pack_quantity": "3024",
            "packing_content_quantity": "25",
            "packing_content_uom_id": self.unit_g.id,
        }
        payload.update(overrides)
        return self.client.post(
            plan_list_url(self.company.id), data=json.dumps(payload), content_type="application/json",
            **bearer(self.operator),
        )

    def test_flexicare_example_matches_spec_numbers(self):
        res = self.create_packing_plan()
        self.assertEqual(res.status_code, 201, res.content)
        body = res.json()
        self.assertEqual(body["planned_pack_quantity"], "3024.000")
        self.assertEqual(body["packing_content_quantity"], "25.000")
        self.assertEqual(body["packing_content_uom_id"], self.unit_g.id)
        self.assertEqual(body["target_output_quantity"], "76.000")

        assessment = body["packing_assessment"]
        self.assertEqual(assessment["expected_packed_content"]["value"], "75.6")
        self.assertTrue(assessment["expected_packed_content"]["is_exact"])
        self.assertEqual(assessment["expected_packed_content"]["unit_code"], self.unit_kg2.code)
        self.assertEqual(assessment["manufacturing_target_quantity"], "76.000")
        self.assertEqual(assessment["difference"]["value"], "0.4")
        self.assertEqual(assessment["difference"]["label"], "Planning quantity difference")
        text = " ".join(assessment["notices"]).lower()
        self.assertNotIn("waste", text)
        self.assertNotIn("yield", text)
        self.assertNotIn("allowance", text)
        self.assertNotIn("shortage", text)

    def test_negative_difference_is_shown_not_corrected(self):
        res = self.create_packing_plan(target_output_quantity="70")  # less than the 75.6 expected
        self.assertEqual(res.status_code, 201, res.content)
        assessment = res.json()["packing_assessment"]
        self.assertEqual(assessment["difference"]["value"], "-5.6")
        self.assertEqual(res.json()["target_output_quantity"], "70.000")  # unchanged, not auto-corrected
        text = " ".join(assessment["notices"]).lower()
        self.assertIn("planning quantity difference", text)
        self.assertNotIn("shortage", text)

    def test_partial_planned_pack_quantity_no_allocation_enforced(self):
        """The source order line's own quantity is 100 (BatchPlanBase); a
        packing relationship's planned_pack_quantity is never compared
        against it - nothing here implies the plan covers the whole order.
        """
        res = self.create_packing_plan(planned_pack_quantity="10", packing_content_quantity="25", target_output_quantity="1")
        self.assertEqual(res.status_code, 201, res.content)
        assessment = res.json()["packing_assessment"]
        self.assertEqual(assessment["expected_packed_content"]["value"], "0.25")
        self.assertEqual(assessment["difference"]["value"], "0.75")
        self.assertEqual(SalesOrderLine.objects.get(pk=self.line.id).quantity, Decimal("100.000"))

    def test_missing_or_incomplete_packing_fields_rejected(self):
        for kwargs in (
            {"planned_pack_quantity": "3024"},
            {"packing_content_quantity": "25"},
            {"packing_content_uom_id": self.unit_g.id},
            {"planned_pack_quantity": "3024", "packing_content_quantity": "25"},
        ):
            payload = {
                "sales_order_line_id": self.line.id, "formula_revision_id": self.mass_revision.id,
                "target_output_quantity": "76", **kwargs,
            }
            res = self.client.post(
                plan_list_url(self.company.id), data=json.dumps(payload), content_type="application/json",
                **bearer(self.operator),
            )
            self.assertEqual(res.status_code, 400, kwargs)
            body = res.json()
            missing = {"planned_pack_quantity", "packing_content_quantity", "packing_content_uom_id"} - set(kwargs)
            for field in missing:
                self.assertIn(field, body, kwargs)

    def test_unknown_conversion_relationship_rejected(self):
        res = self.create_packing_plan(packing_content_uom_id=self.unit_mass_no_factor.id)
        self.assertEqual(res.status_code, 400)
        self.assertIn("No conversion is defined", str(res.json()["packing_content_uom_id"]))

    def test_mass_volume_mismatch_rejected(self):
        res = self.create_packing_plan(packing_content_uom_id=self.unit_ml.id)
        self.assertEqual(res.status_code, 400)
        self.assertIn("Mass is never converted to volume", str(res.json()["packing_content_uom_id"]))

    def test_pack_unit_must_be_count(self):
        # A product sold directly in a MASS unit (not COUNT), with its OWN
        # formula (product identity must still match) whose output unit is a
        # different MASS unit - a packing relationship is meaningless when
        # the source line is not already a COUNT of packs.
        mass_product = make_product(self.company, self.unit_kg, self.admin, "MASSPRD")
        mass_formula = Formula.objects.create(
            company=self.company, product=mass_product, code="F-MASSPRD-01", name="Mass Product Formula",
            latest_revision_number=1, created_by=self.admin,
        )
        mass_product_revision = FormulaRevision.objects.create(
            formula=mass_formula, revision_number=1, status=FormulaRevision.Status.DRAFT,
            base_output_quantity=Decimal("10.000"), output_uom=self.unit_kg2, created_by=self.admin,
        )
        FormulaLine.objects.create(
            revision=mass_product_revision, line_number=1, material=self.raw_mat, quantity=Decimal("1.000"),
            unit=self.unit_kg, material_code_snapshot=self.raw_mat.code, material_name_snapshot=self.raw_mat.name,
            material_kind_snapshot=self.raw_mat.kind, unit_code_snapshot=self.unit_kg.code, unit_name_snapshot=self.unit_kg.name,
        )
        approve_revision_directly(mass_product_revision, self.admin)
        mass_order = create_sales_order(
            actor=self.admin, company=self.company, customer_id=self.customer.id, currency="INR",
            order_date=datetime.date(2026, 10, 1),
            lines=[{"product_id": mass_product.id, "quantity": Decimal("500"), "unit_price": Decimal("1")}],
        )
        mass_line = mass_order.lines.first()
        res = self.create_packing_plan(sales_order_line_id=mass_line.id, formula_revision_id=mass_product_revision.id)
        self.assertEqual(res.status_code, 400, res.content)
        self.assertIn("COUNT unit", str(res.json()["planned_pack_quantity"]))

    def test_zero_negative_and_excess_precision_values_rejected(self):
        for field, value in (
            ("planned_pack_quantity", "0"), ("planned_pack_quantity", "-1"), ("planned_pack_quantity", "10.5"),
            ("packing_content_quantity", "0"), ("packing_content_quantity", "-1"),
            ("packing_content_quantity", "25.12345"),
        ):
            res = self.create_packing_plan(**{field: value})
            self.assertEqual(res.status_code, 400, (field, value))
            self.assertIn(field, res.json(), (field, value))

    def test_inactive_packing_content_unit_rejected(self):
        self.unit_g.is_active = False
        self.unit_g.save(update_fields=["is_active"])
        res = self.create_packing_plan()
        self.assertEqual(res.status_code, 400)
        self.assertIn("inactive", str(res.json()["packing_content_uom_id"]))

    def test_material_scaling_uses_explicit_manufacturing_target_not_computed_content(self):
        """base_output_quantity=100kg, line=50kg raw material, target=76kg
        (NOT the computed 75.6kg) -> factor = 76/100 = 0.76 -> required =
        50 * 0.76 = 38 EXACTLY. If the calculator had wrongly used 75.6 the
        factor would be 0.756 and required would be 37.8, not 38.
        """
        plan_id = self.create_packing_plan().json()["id"]
        res = self.client.get(plan_preview_url(self.company.id, plan_id), **bearer(self.operator))
        self.assertEqual(res.status_code, 200, res.content)
        body = res.json()
        self.assertEqual(body["scale_factor"]["value"], "0.76")
        self.assertTrue(body["calculation_complete"])
        raw_line = body["lines"][0]
        self.assertEqual(raw_line["required_quantity"]["value"], "38")
        self.assertTrue(raw_line["required_quantity"]["is_exact"])
        self.assertIn("packing_assessment", body)
        self.assertEqual(body["packing_assessment"]["expected_packed_content"]["value"], "75.6")

    def test_source_drift_accepts_legitimate_bottle_to_kg_relationship(self):
        plan_id = self.create_packing_plan().json()["id"]
        det = self.client.get(plan_detail_url(self.company.id, plan_id), **bearer(self.operator))
        self.assertEqual(det.status_code, 200)
        drift = det.json()["source_drift"]
        self.assertFalse(drift["is_incompatible"])
        self.assertFalse(drift["has_drift"])

    def test_source_drift_blocks_on_a_subsequent_incompatible_product_change(self):
        plan_id = self.create_packing_plan().json()["id"]
        other_product = make_product(self.company, self.unit_count, self.admin, "SWAPPED")
        update_sales_order(
            actor=self.admin, sales_order_id=self.order.id, expected_version=self.order.version,
            data={"lines": [{"id": self.line.id, "product_id": other_product.id, "quantity": Decimal("100"), "unit_price": Decimal("1")}]},
        )
        det = self.client.get(plan_detail_url(self.company.id, plan_id), **bearer(self.operator))
        self.assertTrue(det.json()["source_drift"]["is_incompatible"])

        patch_res = self.client.patch(
            plan_detail_url(self.company.id, plan_id),
            data=json.dumps({"expected_version": 1, "target_output_quantity": "80"}),
            content_type="application/json", **bearer(self.operator),
        )
        self.assertEqual(patch_res.status_code, 400)

        prev = self.client.get(plan_preview_url(self.company.id, plan_id), **bearer(self.operator))
        self.assertFalse(prev.json()["calculation_complete"])

    def test_source_drift_blocks_when_pack_unit_itself_changes(self):
        """A product change is not the only drift - the LINE's own unit
        changing (even to a different COUNT unit) invalidates a Shape-B
        packing relationship computed against the old one.
        """
        plan_id = self.create_packing_plan().json()["id"]
        other_count_unit = make_unit("BTL2", dimension=UnitOfMeasure.Dimension.COUNT)
        differently_packed_product = make_product(self.company, other_count_unit, self.admin, "REPACK")
        update_sales_order(
            actor=self.admin, sales_order_id=self.order.id, expected_version=self.order.version,
            data={"lines": [{"id": self.line.id, "product_id": differently_packed_product.id, "quantity": Decimal("100"), "unit_price": Decimal("1")}]},
        )
        det = self.client.get(plan_detail_url(self.company.id, plan_id), **bearer(self.operator))
        self.assertTrue(det.json()["source_drift"]["is_incompatible"])

    def test_update_packing_fields_is_a_substantive_audited_edit(self):
        plan_id = self.create_packing_plan().json()["id"]
        before_audit = AuditLog.objects.filter(target_id=str(plan_id)).count()
        res = self.client.patch(
            plan_detail_url(self.company.id, plan_id),
            data=json.dumps({
                "expected_version": 1, "planned_pack_quantity": "4000", "packing_content_quantity": "25",
                "packing_content_uom_id": self.unit_g.id, "target_output_quantity": "100",
            }),
            content_type="application/json", **bearer(self.operator),
        )
        self.assertEqual(res.status_code, 200, res.content)
        body = res.json()
        self.assertEqual(body["version"], 2)
        self.assertEqual(body["planned_pack_quantity"], "4000.000")
        self.assertEqual(body["packing_assessment"]["expected_packed_content"]["value"], "100")
        self.assertEqual(body["packing_assessment"]["difference"]["value"], "0")

        entry = AuditLog.objects.filter(target_id=str(plan_id), action="batch_plan.updated").latest("id")
        self.assertEqual(entry.before["planned_pack_quantity"], "3024.000")
        self.assertEqual(entry.after["planned_pack_quantity"], "4000.000")
        self.assertEqual(AuditLog.objects.filter(target_id=str(plan_id)).count(), before_audit + 1)

    def test_update_noop_same_packing_values_does_not_bump_version(self):
        plan_id = self.create_packing_plan().json()["id"]
        before_audit = AuditLog.objects.filter(target_id=str(plan_id)).count()
        res = self.client.patch(
            plan_detail_url(self.company.id, plan_id),
            data=json.dumps({
                "expected_version": 1, "planned_pack_quantity": "3024", "packing_content_quantity": "25",
                "packing_content_uom_id": self.unit_g.id, "target_output_quantity": "76",
            }),
            content_type="application/json", **bearer(self.operator),
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["version"], 1)
        self.assertEqual(AuditLog.objects.filter(target_id=str(plan_id)).count(), before_audit)

    def test_clearing_packing_fields_without_matching_units_is_rejected(self):
        plan_id = self.create_packing_plan().json()["id"]
        res = self.client.patch(
            plan_detail_url(self.company.id, plan_id),
            data=json.dumps({
                "expected_version": 1, "planned_pack_quantity": None, "packing_content_quantity": None,
                "packing_content_uom_id": None,
            }),
            content_type="application/json", **bearer(self.operator),
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("does not match the order line's own unit", str(res.json()["packing_content_uom_id"]))
        self.assertEqual(BatchPlan.objects.get(pk=plan_id).version, 1)

    def test_update_audit_rollback_on_failure(self):
        plan_id = self.create_packing_plan().json()["id"]
        with patch("apps.batch_plans.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                self.client.patch(
                    plan_detail_url(self.company.id, plan_id),
                    data=json.dumps({"expected_version": 1, "planned_pack_quantity": "5000", "packing_content_quantity": "25",
                                     "packing_content_uom_id": self.unit_g.id, "target_output_quantity": "100"}),
                    content_type="application/json", **bearer(self.operator),
                )
        stored = BatchPlan.objects.get(pk=plan_id)
        self.assertEqual((stored.version, stored.planned_pack_quantity), (1, Decimal("3024.000")))

    def test_approved_identity_snapshot_unaffected_by_packing_feature(self):
        """Existing approved-revision snapshots (Task 11C) carry no packing
        information and are not changed by anything in this task.
        """
        self.create_packing_plan()
        self.mass_revision.refresh_from_db()
        # approve_revision_directly is a test-only shortcut that bypasses the
        # real approval service, so approved_identity_snapshot is never
        # populated by it (see apps.formulas.approval.approve_formula_revision,
        # exercised for real in tests.test_formula_approval) - the point here
        # is only that creating a batch plan against this revision never
        # writes to it.
        self.assertIsNone(self.mass_revision.approved_identity_snapshot)

    def test_preview_and_detail_require_only_existing_permissions(self):
        """The packing assessment exposes only this plan's own quantities -
        `batch_plans.view` alone is enough for the detail view; the
        formula's material lines still require `formulas.view` separately
        (unchanged Task 12A rule).
        """
        plan_id = self.create_packing_plan().json()["id"]
        limited = make_user("packlimited")
        grant_permissions(self.company, limited, ["batch_plans.view"], actor=self.admin)
        det = self.client.get(plan_detail_url(self.company.id, plan_id), **bearer(limited))
        self.assertEqual(det.status_code, 200)
        self.assertIsNotNone(det.json()["packing_assessment"])
        self.assertNotIn("lines", det.json())

        prev = self.client.get(plan_preview_url(self.company.id, plan_id), **bearer(limited))
        self.assertEqual(prev.status_code, 403)
