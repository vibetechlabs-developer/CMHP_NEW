"""Manager's Batch and printing section, proven against the real endpoints.

The Manager bundle is `batch_plans.view/create/edit/printing_edit/
allocate_number` + `sales_orders.view` in the company. Lookup reads use the
narrow batch-planning endpoints, so no `formulas.view`, `shared_catalog.view`
or `sales_orders.edit` is needed. Every persona is an isolated explicit grant.
"""

import datetime
import json
from decimal import Decimal
from unittest.mock import patch

from django.test import Client

from apps.batch_plans.models import BatchPlan
from apps.catalog.models import UnitOfMeasure
from apps.formulas.models import FormulaRevision
from apps.permissions.services import replace_role_permissions
from apps.sales_orders.services import update_sales_order
from tests.test_order_line_preparation import (
    OrderLinePreparationBase,
    extend_company_permissions,
)
from tests.test_store_preparation import (
    bearer,
    grant_company_permission,
    grant_store_permission,
    make_company,
    make_user,
    preparation_url,
    preparations_url,
    STORE_PREP_ALL_PERMS,
)
from apps.permissions.models import CompanyRole
from django.core.exceptions import ValidationError as DjangoValidationError

BATCH_PLANS_VIEW = "batch_plans.view"


def plans_url(company_id):
    return f"/api/v1/companies/{company_id}/batch-plans/"


def plan_url(company_id, plan_id):
    return f"/api/v1/companies/{company_id}/batch-plans/{plan_id}/"


def allocate_url(company_id, plan_id):
    return f"/api/v1/companies/{company_id}/batch-plans/{plan_id}/allocate-number/"


def units_url(company_id):
    return f"/api/v1/companies/{company_id}/batch-plans/planning-units/"


def revisions_url(company_id):
    return f"/api/v1/companies/{company_id}/batch-plans/eligible-revisions/"


class BatchManagerTests(OrderLinePreparationBase):
    def setUp(self):
        super().setUp()
        # `self.manager` (from the base) already holds the Manager bundle in
        # DEMOA. Give the Manager's store-preparation VIEW only, as the matrix says.
        self.batch_manager = self.manager

    def create_first_plan(self, user=None, **overrides):
        payload = {
            "sales_order_line_id": self.fresh_line.id,
            "formula_revision_id": self.revision.id,
            "target_output_quantity": "50",
        }
        payload.update(overrides)
        return self.client_.post(
            plans_url(self.company.id), data=json.dumps(payload), content_type="application/json",
            **bearer(user or self.batch_manager),
        )

    # --- lookups ----------------------------------------------------------

    def test_manager_reads_active_units_only(self):
        inactive = UnitOfMeasure.objects.create(code="OLDU", name="Old unit", dimension=self.unit_count.dimension, is_active=False)
        res = self.client_.get(units_url(self.company.id), **bearer(self.batch_manager))
        self.assertEqual(res.status_code, 200, res.content)
        codes = [row["code"] for row in res.json()["results"]]
        self.assertIn(self.unit_count.code, codes)
        self.assertNotIn(inactive.code, codes)

    def test_manager_reads_only_approved_revisions_without_recipe_lines(self):
        draft = FormulaRevision.objects.create(
            formula=self.formula, revision_number=99, status=FormulaRevision.Status.DRAFT,
            base_output_quantity=Decimal("7.000"), output_uom=self.unit_count, created_by=self.superuser,
        )
        res = self.client_.get(revisions_url(self.company.id), {"product": self.product.id}, **bearer(self.batch_manager))
        self.assertEqual(res.status_code, 200, res.content)
        rows = res.json()["results"]
        ids = [row["id"] for row in rows]
        self.assertIn(self.revision.id, ids)
        self.assertNotIn(draft.id, ids)
        blob = json.dumps(rows)
        for forbidden in ("lines", "material", "unit_price"):
            self.assertNotIn(forbidden, blob)

    def test_lookup_needs_batch_plans_view(self):
        no_batch = make_user("nobatchlookup")
        grant_company_permission(self.superuser, no_batch, self.company, "sales_orders.view")
        self.assertEqual(self.client_.get(units_url(self.company.id), **bearer(no_batch)).status_code, 403)
        self.assertEqual(
            self.client_.get(revisions_url(self.company.id), {"product": self.product.id}, **bearer(no_batch)).status_code,
            403,
        )

    def test_lookup_refuses_other_company(self):
        outsider_company = make_company("BATOTHER")
        outsider = make_user("batother")
        grant_company_permission(self.superuser, outsider, outsider_company, *self.manager_codes())
        res = self.client_.get(revisions_url(self.company.id), {"product": self.product.id}, **bearer(outsider))
        # Not a member of DEMOA: folded into 404 so the company is not revealed.
        self.assertIn(res.status_code, (403, 404))

    def manager_codes(self):
        return ("sales_orders.view", "batch_plans.view", "batch_plans.create", "batch_plans.edit", "batch_plans.printing_edit", "batch_plans.allocate_number")

    # --- create / edit / print / allocate --------------------------------

    def test_manager_creates_first_batch_plan_for_order_line(self):
        self.assertFalse(BatchPlan.objects.filter(sales_order_line=self.fresh_line).exists())
        res = self.create_first_plan()
        self.assertEqual(res.status_code, 201, res.content)
        plan = BatchPlan.objects.get(sales_order_line=self.fresh_line)
        self.assertEqual(plan.id, res.json()["id"])
        self.assertEqual(res.json()["status"], "DRAFT")
        self.assertIsNone(res.json()["official_batch_number"])

    def test_manager_saves_batch_and_printing_details_and_reopen_persists(self):
        plan = self.create_first_plan().json()
        res = self.client_.patch(
            plan_url(self.company.id, plan["id"]),
            data=json.dumps({
                "expected_version": plan["version"],
                "packing_size_note": "3024 bottles x 25g",
                "mrp_for_printing": "12.50",
                "printing_status_note": "Artwork approved",
            }),
            content_type="application/json", **bearer(self.batch_manager),
        )
        self.assertEqual(res.status_code, 200, res.content)
        reopened = self.client_.get(plan_url(self.company.id, plan["id"]), **bearer(self.batch_manager)).json()
        self.assertEqual(reopened["packing_size_note"], "3024 bottles x 25g")
        self.assertEqual(reopened["mrp_for_printing"], "12.50")
        self.assertEqual(reopened["printing_status_note"], "Artwork approved")

    def test_stale_version_is_refused(self):
        plan = self.create_first_plan().json()
        res = self.client_.patch(
            plan_url(self.company.id, plan["id"]),
            data=json.dumps({"expected_version": plan["version"] + 4, "notes": "stale"}),
            content_type="application/json", **bearer(self.batch_manager),
        )
        self.assertEqual(res.status_code, 409, res.content)

    def test_allocation_is_explicit_and_permanent(self):
        plan = self.create_first_plan().json()
        res = self.client_.post(
            allocate_url(self.company.id, plan["id"]),
            data=json.dumps({"expected_version": plan["version"]}),
            content_type="application/json", **bearer(self.batch_manager),
        )
        self.assertEqual(res.status_code, 200, res.content)
        number = res.json()["official_batch_number"]
        self.assertTrue(number)
        current = BatchPlan.objects.get(pk=plan["id"])
        again = self.client_.post(
            allocate_url(self.company.id, plan["id"]),
            data=json.dumps({"expected_version": current.version}),
            content_type="application/json", **bearer(self.batch_manager),
        )
        # A repeat at the current version is an idempotent no-op: same number back.
        self.assertEqual(again.status_code, 200, again.content)
        self.assertEqual(again.json()["official_batch_number"], number)
        reread = self.client_.get(plan_url(self.company.id, plan["id"]), **bearer(self.batch_manager)).json()
        self.assertEqual(reread["official_batch_number"], number)

    def test_audit_failure_rolls_back_first_plan(self):
        before = BatchPlan.objects.count()
        with patch("apps.batch_plans.services.record", side_effect=RuntimeError("audit down")):
            with self.assertRaises(RuntimeError):
                self.create_first_plan()
        self.assertEqual(BatchPlan.objects.count(), before)

    # --- isolation and separation of duties ----------------------------

    def test_store_manager_can_read_plan_but_cannot_change_it(self):
        plan = self.create_first_plan().json()
        read = self.client_.get(plan_url(self.company.id, plan["id"]), **bearer(self.store_manager))
        self.assertEqual(read.status_code, 200, read.content)
        create = self.create_first_plan(user=self.store_manager, sales_order_line_id=self.order.lines.first().id)
        self.assertEqual(create.status_code, 403, create.content)
        patch_res = self.client_.patch(
            plan_url(self.company.id, plan["id"]),
            data=json.dumps({"expected_version": plan["version"], "notes": "store edit"}),
            content_type="application/json", **bearer(self.store_manager),
        )
        self.assertEqual(patch_res.status_code, 403, patch_res.content)

    def test_manager_cannot_change_admin_order_or_store_fields(self):
        plan = self.create_first_plan().json()
        order_res = self.client_.patch(
            f"/api/v1/companies/{self.company.id}/sales-orders/{self.fresh_order.id}/",
            data=json.dumps({"expected_version": self.fresh_order.version, "notes": "manager edit"}),
            content_type="application/json", **bearer(self.batch_manager),
        )
        self.assertIn(order_res.status_code, (403, 404), order_res.content)
        self.fresh_order.refresh_from_db()
        self.assertEqual(self.fresh_order.notes, "")
        store_res = self.client_.post(
            preparations_url(self.store.id),
            data=json.dumps({"sales_order_line_id": self.fresh_line.id, "packing_type": "manager store"}),
            content_type="application/json", **bearer(self.batch_manager),
        )
        self.assertEqual(store_res.status_code, 403, store_res.content)
        self.assertEqual(plan["id"], BatchPlan.objects.get(sales_order_line=self.fresh_line).id)

    def test_plan_creation_does_not_touch_store_preparation(self):
        prep = self.post_line_prep(self.store_manager, self.fresh_line).json()
        self.create_first_plan()
        from apps.store_preparation.models import StorePreparation
        self.assertEqual(StorePreparation.objects.get(pk=prep["id"]).packing_type, "Amber 200ml")
