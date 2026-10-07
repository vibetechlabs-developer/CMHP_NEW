"""Confirmed workflow: Admin creates an order -> Store Manager records store
preparation on the SAME order line before any batch plan exists -> Manager
adds batch/printing later -> each department edits only its own section.

Every user here is an isolated, explicitly granted account. No superuser
bypass is used for the department journey (the setup superuser only creates
the synthetic fixtures). Services are called directly only where the test
needs a precondition a permission-gated endpoint would normally produce.
"""

import datetime
import json
from decimal import Decimal
from unittest.mock import patch

from django.test import Client

from apps.batch_plans.models import BatchNumberAllocation, BatchPlan
from apps.batch_plans.services import create_batch_plan
from apps.material_requisitions.models import MaterialRequisition
from apps.permissions.models import CompanyRole
from apps.permissions.services import replace_role_permissions
from apps.sales_orders.models import SalesOrder
from apps.sales_orders.services import create_sales_order, update_sales_order
from apps.store_preparation.models import StorePreparation
from apps.stock_movements.models import StockMovement
from django.core.exceptions import ValidationError as DjangoValidationError
from tests.test_store_preparation import (
    STORE_PREP_ALL_PERMS,
    StorePreparationTestCase,
    bearer,
    grant_company_permission,
    grant_store_permission,
    make_company,
    make_store,
    make_user,
    preparation_url,
    preparations_url,
)
from tests.test_store_preparation import make_product

def sales_order_url_for(company_id, sales_order_id):
    return f"/api/v1/companies/{company_id}/sales-orders/{sales_order_id}/"


SALES_ORDERS_VIEW = "sales_orders.view"
SALES_ORDERS_EDIT = "sales_orders.edit"
BATCH_PERMS = ("batch_plans.view", "batch_plans.create", "batch_plans.edit", "batch_plans.printing_edit", "batch_plans.allocate_number")


def extend_company_permissions(actor, user, company, *codes):
    """`grant_company_permission` creates one role per user and company, so a
    second grant for the same pair must widen that role instead.
    """
    role = CompanyRole.objects.filter(company=company, code=f"CROLE{user.id}{company.id}").first()
    if role is None:
        return grant_company_permission(actor, user, company, *codes)
    current = set(role.permissions.values_list("code", flat=True))
    replace_role_permissions(actor=actor, role=role, permission_codes=sorted(current | set(codes)))


def _side_effect_counts():
    return {
        "batch_plans": BatchPlan.objects.count(),
        "batch_numbers": BatchNumberAllocation.objects.count(),
        "requisitions": MaterialRequisition.objects.count(),
        "stock_movements": StockMovement.objects.count(),
    }


class OrderLinePreparationBase(StorePreparationTestCase):
    def setUp(self):
        super().setUp()
        superuser = self.superuser
        # Admin: order edit, batch edit, store preparation edit - all explicit.
        self.admin = make_user("admin_flow")
        grant_company_permission(superuser, self.admin, self.company, SALES_ORDERS_VIEW, SALES_ORDERS_EDIT, *BATCH_PERMS)
        grant_store_permission(superuser, self.admin, self.store, *STORE_PREP_ALL_PERMS)
        # Store Manager: order view-only, store preparation edit, batch view-only.
        self.store_manager = self.operator
        extend_company_permissions(superuser, self.store_manager, self.company, SALES_ORDERS_VIEW)
        # Manager: order view, batch edit, store preparation view-only.
        self.manager = make_user("manager_flow")
        grant_company_permission(superuser, self.manager, self.company, SALES_ORDERS_VIEW, *BATCH_PERMS)
        grant_store_permission(superuser, self.manager, self.store, "store_preparation.view")

        # A fresh order with ONE product line and NO batch plan - the
        # confirmed workflow's starting point.
        self.fresh_order = create_sales_order(
            actor=self.admin, company=self.company, customer_id=self.customer.id, currency="INR",
            order_date=datetime.date(2026, 10, 2),
            lines=[{"product_id": self.product.id, "quantity": Decimal("10"), "unit_price": Decimal("20")}],
        )
        self.fresh_line = self.fresh_order.lines.first()
        self.client_ = Client()

    def line_prep_url(self, line_id=None):
        return preparations_url(self.store.id)

    def post_line_prep(self, user, line, **overrides):
        payload = {"sales_order_line_id": line.id, "packing_type": "Amber 200ml", "insert_required": None, "label_note": "L-1", "box_note": "B-1"}
        payload.update(overrides)
        return self.client_.post(self.line_prep_url(), data=json.dumps(payload), content_type="application/json", **bearer(user))

    def list_for_line(self, user, line, store_id=None):
        return self.client_.get(preparations_url(store_id or self.store.id), {"sales_order_line": line.id}, **bearer(user))


class ConfirmedWorkflowTests(OrderLinePreparationBase):
    def test_full_journey(self):
        # A-B: order exists, no batch plan for its line.
        self.assertFalse(BatchPlan.objects.filter(sales_order_line=self.fresh_line).exists())
        before = _side_effect_counts()

        # C-D: Store Manager opens the same order. Order details are read-only
        # for them: no sales_orders.edit, so PATCH is refused.
        res = self.client_.patch(
            sales_order_url_for(self.company.id, self.fresh_order.id),
            data=json.dumps({"expected_version": self.fresh_order.version, "notes": "changed by store"}),
            content_type="application/json", **bearer(self.store_manager),
        )
        self.assertIn(res.status_code, (403, 404))
        self.fresh_order.refresh_from_db()
        self.assertEqual(self.fresh_order.notes, "")

        # E: Store Manager saves Packing Type / Label / Box / Insert on the line.
        res = self.post_line_prep(self.store_manager, self.fresh_line, insert_required=True)
        self.assertEqual(res.status_code, 201, res.content)
        prep = res.json()
        self.assertEqual(prep["sales_order_line_id"], self.fresh_line.id)
        self.assertIsNone(prep["batch_plan_id"])
        self.assertEqual(prep["plan_context"]["owner"], "order_line")
        self.assertEqual(prep["packing_type"], "Amber 200ml")
        self.assertTrue(prep["insert_required"])

        # F: close and reopen - values persist.
        reopened = self.list_for_line(self.store_manager, self.fresh_line).json()["results"]
        self.assertEqual(len(reopened), 1)
        self.assertEqual(reopened[0]["label_note"], "L-1")
        self.assertEqual(reopened[0]["box_note"], "B-1")

        # G: saving preparation created no batch plan, batch number, requisition or stock movement.
        self.assertEqual(_side_effect_counts(), before)

        # H: Manager opens the same order and sees the preparation.
        seen = self.list_for_line(self.manager, self.fresh_line).json()["results"]
        self.assertEqual([row["id"] for row in seen], [prep["id"]])

        # I: Manager creates the batch plan for the same line and saves batch fields.
        plan = create_batch_plan(
            actor=self.manager, company=self.company, sales_order_line_id=self.fresh_line.id,
            formula_revision_id=self.revision.id, target_output_quantity="50",
        )
        self.assertTrue(BatchPlan.objects.filter(pk=plan.pk, sales_order_line=self.fresh_line).exists())

        # J: Store Manager still sees the preparation but cannot alter it through
        # the manager's batch context.
        seen_after_plan = self.list_for_line(self.store_manager, self.fresh_line).json()["results"]
        self.assertEqual(seen_after_plan[0]["packing_type"], "Amber 200ml")
        res = self.client_.patch(
            preparation_url(self.store.id, prep["id"]),
            data=json.dumps({"expected_version": prep["version"], "packing_type": "Manager overwrite"}),
            content_type="application/json", **bearer(self.manager),
        )
        self.assertEqual(res.status_code, 403, res.content)

        # K: Admin sees every section and edits the store preparation.
        res = self.client_.patch(
            preparation_url(self.store.id, prep["id"]),
            data=json.dumps({"expected_version": prep["version"], "box_note": "Admin edit"}),
            content_type="application/json", **bearer(self.admin),
        )
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()["box_note"], "Admin edit")

    def test_forged_direct_api_cannot_edit_other_department_fields(self):
        prep = self.post_line_prep(self.store_manager, self.fresh_line).json()
        # Store Manager cannot write batch-plan fields through the store path.
        res = self.client_.patch(
            preparation_url(self.store.id, prep["id"]),
            data=json.dumps({"expected_version": prep["version"], "batch_plan_id": 1, "sales_order_line_id": 999}),
            content_type="application/json", **bearer(self.store_manager),
        )
        self.assertEqual(res.status_code, 400, res.content)
        self.assertEqual(StorePreparation.objects.get(pk=prep["id"]).sales_order_line_id, self.fresh_line.id)

        # Manager (no store edit) cannot alter the store fields by any PATCH.
        res = self.client_.patch(
            preparation_url(self.store.id, prep["id"]),
            data=json.dumps({"expected_version": prep["version"], "label_note": "forged"}),
            content_type="application/json", **bearer(self.manager),
        )
        self.assertEqual(res.status_code, 403)


class OwnershipAndIsolationTests(OrderLinePreparationBase):
    def test_store_manager_cannot_reach_unauthorized_store(self):
        other_store = make_store("LINEOTHER")
        res = self.client_.post(
            preparations_url(other_store.id),
            data=json.dumps({"sales_order_line_id": self.fresh_line.id, "packing_type": "x"}),
            content_type="application/json", **bearer(self.store_manager),
        )
        self.assertIn(res.status_code, (403, 404))
        self.assertFalse(StorePreparation.objects.filter(store=other_store).exists())

    def test_cross_company_order_line_is_denied(self):
        outsider_company = make_company("OUTLINE")
        outsider = make_user("outline_user")
        grant_company_permission(self.superuser, outsider, outsider_company, SALES_ORDERS_VIEW)
        grant_store_permission(self.superuser, outsider, self.store, *STORE_PREP_ALL_PERMS)
        res = self.post_line_prep(outsider, self.fresh_line)
        self.assertEqual(res.status_code, 404, res.content)
        self.assertFalse(StorePreparation.objects.filter(sales_order_line=self.fresh_line).exists())

    def test_user_without_order_view_cannot_read_line_preparation(self):
        self.post_line_prep(self.store_manager, self.fresh_line)
        no_order_view = make_user("noorderview")
        grant_company_permission(self.superuser, no_order_view, self.company, *BATCH_PERMS)
        grant_store_permission(self.superuser, no_order_view, self.store, *STORE_PREP_ALL_PERMS)
        self.assertEqual(self.list_for_line(no_order_view, self.fresh_line).json()["count"], 0)

    def test_store_permission_does_not_leak_to_other_store(self):
        self.post_line_prep(self.store_manager, self.fresh_line)
        other_store = make_store("LEAKCHECK")
        res = self.client_.get(preparations_url(other_store.id), **bearer(self.store_manager))
        self.assertIn(res.status_code, (403, 404))


class MultipleLinesAndLegacyTests(OrderLinePreparationBase):
    def test_multiple_lines_have_independent_preparation(self):
        second_line = create_sales_order(
            actor=self.admin, company=self.company, customer_id=self.customer.id, currency="INR",
            order_date=datetime.date(2026, 10, 3),
            lines=[
                {"product_id": self.product.id, "quantity": Decimal("5"), "unit_price": Decimal("20")},
                {"product_id": self.product.id, "quantity": Decimal("6"), "unit_price": Decimal("20")},
            ],
        ).lines.order_by("line_number")
        first, other = list(second_line)
        a = self.post_line_prep(self.store_manager, first, packing_type="Line one").json()
        b = self.post_line_prep(self.store_manager, other, packing_type="Line two").json()
        self.assertNotEqual(a["id"], b["id"])
        self.assertEqual(self.list_for_line(self.store_manager, first).json()["results"][0]["packing_type"], "Line one")
        self.assertEqual(self.list_for_line(self.store_manager, other).json()["results"][0]["packing_type"], "Line two")

    def test_duplicate_creation_for_same_line_and_store_is_a_conflict(self):
        self.assertEqual(self.post_line_prep(self.store_manager, self.fresh_line).status_code, 201)
        second = self.post_line_prep(self.store_manager, self.fresh_line)
        self.assertEqual(second.status_code, 409, second.content)
        self.assertEqual(StorePreparation.objects.filter(sales_order_line=self.fresh_line).count(), 1)

    def test_stale_version_is_refused(self):
        prep = self.post_line_prep(self.store_manager, self.fresh_line).json()
        res = self.client_.patch(
            preparation_url(self.store.id, prep["id"]),
            data=json.dumps({"expected_version": prep["version"] + 3, "packing_type": "stale"}),
            content_type="application/json", **bearer(self.store_manager),
        )
        self.assertEqual(res.status_code, 409)

    def test_legacy_batch_preparation_remains_intact(self):
        legacy = self.create_preparation(user=self.operator).json()
        self.assertIsNotNone(legacy["batch_plan_id"])
        self.assertIsNone(legacy["sales_order_line_id"])
        before = StorePreparation.objects.values("id", "batch_plan_id", "packing_type", "version").get(pk=legacy["id"])
        self.post_line_prep(self.store_manager, self.fresh_line)
        after = StorePreparation.objects.values("id", "batch_plan_id", "packing_type", "version").get(pk=legacy["id"])
        self.assertEqual(before, after)

    def test_order_line_removal_with_preparation_is_an_explicit_conflict(self):
        self.post_line_prep(self.store_manager, self.fresh_line)
        with self.assertRaises(DjangoValidationError) as ctx:
            update_sales_order(
                actor=self.admin, sales_order_id=self.fresh_order.id,
                expected_version=self.fresh_order.version, data={"lines": []},
            )
        self.assertIn("store preparation", str(ctx.exception).lower())
        self.assertTrue(SalesOrder.objects.filter(pk=self.fresh_order.pk).exists())
        self.assertTrue(StorePreparation.objects.filter(sales_order_line=self.fresh_line).exists())

    def test_product_change_with_preparation_is_an_explicit_conflict(self):
        self.post_line_prep(self.store_manager, self.fresh_line)
        other_product = make_product(self.company, self.unit_count, self.superuser, prefix="ALT")
        with self.assertRaises(DjangoValidationError) as ctx:
            update_sales_order(
                actor=self.admin, sales_order_id=self.fresh_order.id, expected_version=self.fresh_order.version,
                data={"lines": [{
                    "id": self.fresh_line.id, "product_id": other_product.id,
                    "quantity": Decimal("10"), "unit_price": Decimal("20"),
                }]},
            )
        self.assertIn("product cannot be changed", str(ctx.exception).lower())
        self.fresh_line.refresh_from_db()
        self.assertEqual(self.fresh_line.product_id, self.product.id)


class AuditRollbackTests(OrderLinePreparationBase):
    def test_audit_failure_rolls_back_order_line_preparation(self):
        before = StorePreparation.objects.count()
        with patch("apps.store_preparation.services.record", side_effect=RuntimeError("audit down")):
            with self.assertRaises(RuntimeError):
                self.post_line_prep(self.store_manager, self.fresh_line)
        self.assertEqual(StorePreparation.objects.count(), before)
