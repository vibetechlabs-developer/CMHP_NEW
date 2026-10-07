"""Store-scoped requisition STATUS for the order's store block.

Proves, against the real endpoint:
- A store user with store_preparation.view and batch_plans.view (Saloni's
  intended access) sees the workflow status only - no lines, quantities,
  material, formula, approver or rounds.
- A requisition in another store is reported as `unavailable`, never as
  `none` and never with its status.
- Refusals: no store membership -> 404; no store_preparation.view -> 403;
  no company batch_plans.view -> 404. Formula visibility is not required.
"""

import json

from apps.material_requisitions.services import create_material_requisition
from apps.permissions.services import effective_permission_codes
from tests.test_store_preparation import (
    StorePreparationTestCase,
    bearer,
    grant_company_permission,
    grant_store_permission,
    make_user,
)

STATUS_URL = "/api/v1/stores/{store}/batch-plans/{plan}/requisition-status/"


class RequisitionStatusTests(StorePreparationTestCase):
    def url(self, store_id=None, plan_id=None):
        return STATUS_URL.format(store=store_id or self.store.id, plan=plan_id or self.plan.id)

    def get_status(self, user=None, store_id=None, plan_id=None):
        return self.client_.get(self.url(store_id, plan_id), **bearer(user or self.operator))

    def make_requisition(self, store):
        return create_material_requisition(
            actor=self.superuser,
            store=store,
            batch_plan_id=self.plan.id,
            expected_batch_plan_version=self.plan.version,
            notes="",
        )

    def test_operator_has_intended_access_and_no_formula_visibility(self):
        codes = effective_permission_codes(self.operator, self.company)
        self.assertIn("batch_plans.view", codes)
        self.assertNotIn("formulas.view", codes)
        self.assertNotIn("material_requisitions.view", codes)

    def test_absent_inaccessible_and_inactive_store_records_look_identical(self):
        # Same caller, same plan, three states in sequence (a plan has at most
        # one requisition). The response must not reveal which one applies.
        absent = self.get_status().json()

        self.make_requisition(self.other_store)
        inaccessible_active = self.get_status().json()

        self.other_store.is_active = False
        self.other_store.save(update_fields=["is_active"])
        inaccessible_inactive = self.get_status().json()

        self.assertEqual(absent, {"batch_plan_id": self.plan.id, "state": "unavailable"})
        self.assertEqual(inaccessible_active, absent)
        self.assertEqual(inaccessible_inactive, absent)

    def test_no_requisition_is_not_reported_as_none(self):
        res = self.get_status()
        self.assertEqual(res.status_code, 200, res.content)
        self.assertNotEqual(res.json()["state"], "none")

    def test_requisition_in_this_store_returns_status_only(self):
        requisition = self.make_requisition(self.store)
        res = self.get_status()
        self.assertEqual(res.status_code, 200, res.content)
        body = res.json()
        self.assertEqual(set(body.keys()), {"batch_plan_id", "state", "status", "status_label"})
        self.assertEqual(body["state"], "present")
        self.assertEqual(body["status"], requisition.status)
        self.assertEqual(body["status_label"], requisition.get_status_display())

    def test_response_discloses_no_recipe_quantity_or_material(self):
        self.make_requisition(self.store)
        raw = self.get_status().content.decode()
        for forbidden in ('"lines"', '"quantity"', '"required', '"material', '"formula', '"approver', '"rounds"', self.raw.code, "10.000"):
            self.assertNotIn(forbidden, raw)

    def test_requisition_in_another_store_returns_the_same_neutral_body(self):
        self.make_requisition(self.other_store)
        res = self.get_status()
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json(), {"batch_plan_id": self.plan.id, "state": "unavailable"})

    def test_user_without_store_preparation_view_is_refused(self):
        outsider = make_user("nostorepv")
        grant_company_permission(self.superuser, outsider, self.company, "batch_plans.view")
        grant_store_permission(self.superuser, outsider, self.store, "shared_catalog.view")
        res = self.get_status(user=outsider)
        self.assertEqual(res.status_code, 403, res.content)

    def test_user_who_is_not_a_store_member_gets_not_found(self):
        stranger = make_user("notmember")
        grant_company_permission(self.superuser, stranger, self.company, "batch_plans.view")
        res = self.get_status(user=stranger)
        self.assertEqual(res.status_code, 404, res.content)

    def test_user_without_company_batch_plans_view_gets_not_found(self):
        no_company_access = make_user("nocompany")
        grant_store_permission(self.superuser, no_company_access, self.store, "store_preparation.view")
        res = self.get_status(user=no_company_access)
        self.assertEqual(res.status_code, 404, res.content)

    def test_status_endpoint_is_read_only(self):
        self.make_requisition(self.store)
        res = self.client_.patch(
            self.url(), data=json.dumps({"status": "APPROVED"}), content_type="application/json", **bearer(self.operator)
        )
        self.assertEqual(res.status_code, 405, res.content)
