"""Store Manager access to store preparation - the rule the Store preparation
section depends on, proven against the real endpoints.

Covers: a store-scoped preparation editor with only batch_plans.view at
company level (no sales_orders.edit, no batch_plans.create, no formula or
printing rights) can create and update their preparation; the order and the
batch plan are not modified by saving it; other stores, companies and users
without store permissions stay refused.
"""

import json

from django.contrib.auth import get_user_model
from django.test import Client

from apps.permissions.services import effective_permission_codes, effective_store_permission_codes
from apps.sales_orders.models import SalesOrder
from apps.batch_plans.models import BatchPlan
from apps.store_preparation.models import StorePreparation
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

User = get_user_model()


class StoreManagerAccessTests(StorePreparationTestCase):
    def setUp(self):
        super().setUp()
        # The operator from the base class is the Store Manager under test.
        # Pin down exactly what that account holds so the assertions below
        # cannot pass because of an unrelated grant.
        self.manager = self.operator

    def test_manager_holds_only_the_intended_company_permissions(self):
        codes = effective_permission_codes(self.manager, self.company)
        self.assertIn("batch_plans.view", codes)
        for forbidden in ("sales_orders.edit", "batch_plans.create", "batch_plans.edit", "batch_plans.printing_edit", "formulas.view"):
            self.assertNotIn(forbidden, codes)

    def test_manager_creates_preparation_without_sales_orders_edit(self):
        res = self.create_preparation(user=self.manager)
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(res.json()["packing_type"], "25 Gm G2")

    def test_manager_updates_existing_preparation_with_expected_version(self):
        created = self.create_preparation(user=self.manager).json()
        res = self.client_.patch(
            preparation_url(self.store.id, created["id"]),
            data=json.dumps({"expected_version": created["version"], "packing_type": "Amber 200ml", "label_note": "L-12", "box_note": "B-3", "insert_required": True}),
            content_type="application/json",
            **bearer(self.manager),
        )
        self.assertEqual(res.status_code, 200, res.content)
        body = res.json()
        self.assertEqual(body["packing_type"], "Amber 200ml")
        self.assertEqual(body["label_note"], "L-12")
        self.assertEqual(body["box_note"], "B-3")
        self.assertTrue(body["insert_required"])
        self.assertEqual(body["version"], created["version"] + 1)

    def test_reopen_returns_persisted_values(self):
        created = self.create_preparation(user=self.manager).json()
        self.client_.patch(
            preparation_url(self.store.id, created["id"]),
            data=json.dumps({"expected_version": created["version"], "packing_type": "Saved value"}),
            content_type="application/json",
            **bearer(self.manager),
        )
        res = self.client_.get(preparations_url(self.store.id), {"batch_plan": self.plan.id}, **bearer(self.manager))
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()["results"][0]["packing_type"], "Saved value")

    def test_stale_version_is_refused_not_overwritten(self):
        created = self.create_preparation(user=self.manager).json()
        res = self.client_.patch(
            preparation_url(self.store.id, created["id"]),
            data=json.dumps({"expected_version": created["version"] + 5, "packing_type": "Overwrite attempt"}),
            content_type="application/json",
            **bearer(self.manager),
        )
        self.assertEqual(res.status_code, 409, res.content)
        self.assertEqual(StorePreparation.objects.get(pk=created["id"]).packing_type, "25 Gm G2")

    def test_saving_preparation_does_not_modify_order_or_batch_plan(self):
        order_before = SalesOrder.objects.values("version", "status", "updated_at").get(pk=self.order.pk)
        plan_before = BatchPlan.objects.values("version", "status", "target_output_quantity").get(pk=self.plan.pk)
        self.create_preparation(user=self.manager)
        self.assertEqual(SalesOrder.objects.values("version", "status", "updated_at").get(pk=self.order.pk), order_before)
        self.assertEqual(BatchPlan.objects.values("version", "status", "target_output_quantity").get(pk=self.plan.pk), plan_before)

    def test_store_without_grant_is_refused(self):
        other_store = make_store("NOGRANT")
        res = self.create_preparation(user=self.manager, store_id=other_store.id)
        self.assertIn(res.status_code, (403, 404), res.content)
        self.assertFalse(StorePreparation.objects.filter(store=other_store).exists())

    def test_user_without_batch_plan_view_cannot_prepare_for_plan(self):
        no_plan_view = make_user("nobatchview")
        grant_store_permission(self.superuser, no_plan_view, self.store, *STORE_PREP_ALL_PERMS)
        res = self.create_preparation(user=no_plan_view)
        self.assertIn(res.status_code, (403, 404), res.content)

    def test_store_permissions_do_not_leak_to_other_store(self):
        codes = effective_store_permission_codes(self.manager, self.other_store)
        self.assertEqual(codes, set())

    def test_company_without_membership_is_refused(self):
        outsider_company = make_company("OUTSIDE")
        outsider = make_user("outsider")
        grant_company_permission(self.superuser, outsider, outsider_company, "batch_plans.view")
        grant_store_permission(self.superuser, outsider, self.store, *STORE_PREP_ALL_PERMS)
        res = self.create_preparation(user=outsider)
        self.assertIn(res.status_code, (403, 404), res.content)
        self.assertFalse(StorePreparation.objects.filter(batch_plan=self.plan, store=self.store, packing_type="25 Gm G2", created_by=outsider).exists())

    def test_manager_cannot_change_batch_plan_fields(self):
        created = self.create_preparation(user=self.manager).json()
        res = self.client_.patch(
            preparation_url(self.store.id, created["id"]),
            data=json.dumps({"expected_version": created["version"], "batch_plan_id": self.plan.id + 999}),
            content_type="application/json",
            **bearer(self.manager),
        )
        self.assertEqual(res.status_code, 400, res.content)
        self.assertEqual(StorePreparation.objects.get(pk=created["id"]).batch_plan_id, self.plan.id)
