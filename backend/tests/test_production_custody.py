import json
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.utils import timezone
from rest_framework_simplejwt.tokens import AccessToken

from apps.catalog.models import Material, MaterialCategory, UnitOfMeasure
from apps.companies.models import Company
from apps.permissions.services import (
    create_company_role,
    create_store_role,
    replace_role_permissions,
    replace_store_role_permissions,
)
from apps.purchasing.services import (
    approve_purchase_request,
    create_purchase_order,
    create_purchase_request,
    issue_purchase_order,
    submit_purchase_request,
    update_purchase_order,
)
from apps.stock_movements.models import (
    CutoverStockDraft,
    MaterialIssue,
    MaterialReturn,
    PhysicalCountDraft,
    ProductionCustody,
    ProductionFloorEvent,
)
from apps.stores.models import SharedStore
from apps.stores.services import assign_store_membership, assign_store_membership_role
from apps.suppliers.models import Supplier
from apps.users.services import assign_company_membership, assign_membership_role

User = get_user_model()
PASSWORD = "a-strong-pass-1"

ISSUE_ALL_PERMS = (
    "stock_issue.view",
    "stock_issue.create",
    "stock_issue.edit",
    "stock_issue.post",
    "stock_issue.cancel",
)
RECEIVING_ALL_PERMS = (
    "receiving.view",
    "receiving.create",
    "receiving.edit",
    "receiving.post",
    "receiving.cancel",
)


def make_user(username, password=PASSWORD, **kwargs):
    return User.objects.create_user(username=username, email=f"{username}@example.com", password=password, **kwargs)


def make_superuser(username, password=PASSWORD):
    return User.objects.create_superuser(username=username, email=f"{username}@example.com", password=password)


def access_token_for(user):
    return str(AccessToken.for_user(user))


def bearer(token):
    return {"HTTP_AUTHORIZATION": f"Bearer {token}"}


def get_json(client, url, token):
    return client.get(url, **bearer(token))


def post_json(client, url, payload, token):
    return client.post(url, data=json.dumps(payload), content_type="application/json", **bearer(token))


def _ensure_permissions_seeded(codes, scope):
    from apps.permissions.models import PermissionDefinition

    for code in codes:
        PermissionDefinition.objects.get_or_create(
            code=code, defaults={"name": code, "module": code.split(".")[0], "scope": scope, "is_active": True},
        )


def grant_company_permission(actor, user, company, *permission_codes):
    from apps.permissions.models import PermissionDefinition

    _ensure_permissions_seeded(permission_codes, PermissionDefinition.Scope.COMPANY)
    membership, _ = assign_company_membership(actor=actor, user=user, company=company)
    role = create_company_role(actor=actor, company=company, code=f"CROLE{user.id}{company.id}", name="Role")
    role, _ = replace_role_permissions(actor=actor, role=role, permission_codes=list(permission_codes))
    assign_membership_role(actor=actor, membership=membership, role=role)
    return membership, role


def grant_store_permission(actor, user, store, *permission_codes):
    from apps.permissions.models import PermissionDefinition

    _ensure_permissions_seeded(permission_codes, PermissionDefinition.Scope.STORE)
    membership, _ = assign_store_membership(actor=actor, user=user, store=store)
    role = create_store_role(actor=actor, store=store, code=f"SROLE{user.id}{store.id}", name="Role")
    role, _ = replace_store_role_permissions(actor=actor, role=role, permission_codes=list(permission_codes))
    assign_store_membership_role(actor=actor, membership=membership, role=role)
    return membership, role


class ProductionCustodyTestCase(TestCase):
    def setUp(self):
        self.superuser = make_superuser("admin")
        self.company = Company.objects.create(code="ACME", legal_name="Acme Pvt Ltd")
        self.store = SharedStore.objects.create(code="MAINWH", name="Main Warehouse")
        self.client_ = Client()
        self.unit = UnitOfMeasure.objects.create(code="CAPS", name="Capsules", dimension="COUNT")
        self.category = MaterialCategory.objects.create(code="PACK", name="Packaging")
        self.material = Material.objects.create(
            code="CAP100", name="Capsule Shells 100mg", kind="RAW_MATERIAL", base_unit=self.unit, category=self.category
        )
        self.supplier = Supplier.objects.create(code="SUP1", legal_name="Capsule Supplier")
        self.user = make_user("staffuser")
        grant_company_permission(self.superuser, self.user, self.company, "purchase_orders.view")
        grant_store_permission(
            self.superuser, self.user, self.store, *ISSUE_ALL_PERMS, *RECEIVING_ALL_PERMS, "stock.view",
        )
        self.token = access_token_for(self.user)

    def _po_admin(self, name):
        admin = make_user(name)
        grant_company_permission(
            self.superuser, admin, self.company, "purchase_requests.view", "purchase_requests.approve"
        )
        return admin

    def _seed_recorded_receipt(self, quantity):
        requester = make_user("po_requester")
        grant_company_permission(
            self.superuser, requester, self.company,
            "purchase_requests.view", "purchase_requests.create", "purchase_requests.submit",
            "purchase_orders.view", "purchase_orders.create",
        )
        pr = create_purchase_request(
            actor=requester, company=self.company, lines=[{"material_id": self.material.id, "quantity": quantity}]
        )
        pr = submit_purchase_request(actor=requester, purchase_request_id=pr.id, expected_version=1)
        for i in range(3):
            approver = self._po_admin(f"approver_{i}")
            pr = approve_purchase_request(
                actor=approver, purchase_request_id=pr.id, expected_version=pr.version,
                expected_round=pr.current_round, expected_step=pr.current_step,
            )
        from datetime import timedelta
        po = create_purchase_order(
            actor=requester, company=self.company, source_purchase_request_id=pr.id,
            supplier_id=self.supplier.id, currency_code="INR",
            expected_delivery_date=timezone.now().date() + timedelta(days=14),
        )
        line = po.lines.get()
        po = update_purchase_order(
            actor=requester, purchase_order_id=po.id, expected_version=po.version,
            data={"lines": [{"id": line.id, "unit_price": Decimal("10.0000")}]},
        )
        po = issue_purchase_order(actor=requester, purchase_order_id=po.id, expected_version=po.version)
        po_line_id = po.issue_snapshot.lines.get().id

        payload = {
            "source_purchase_order_id": po.id,
            "arrived_at": (timezone.now() - timedelta(hours=2)).isoformat(),
            "lines": [{"source_po_line_id": po_line_id, "received_quantity": str(quantity)}],
        }
        res = post_json(self.client_, f"/api/v1/stores/{self.store.id}/goods-receipts/", payload, self.token)
        self.assertEqual(res.status_code, 201)
        receipt_id = res.json()["id"]
        post_res = post_json(
            self.client_,
            f"/api/v1/stores/{self.store.id}/goods-receipts/{receipt_id}/post/",
            {"expected_version": res.json()["version"]},
            self.token,
        )
        self.assertEqual(post_res.status_code, 200)

    def test_reconciliation_workflow(self):
        """Reconciliation Test:
        Opening 120 caps -> issue 100.
        Consume 90, return 5, classify 5 damaged in production.
        Expected store 25, production-held damaged 5, consumed 90.
        Dispose those 5 under an explicit test policy.
        Expected 120 = store 25 + consumed 90 + disposed 5.
        """
        # 1. Opening receipt of 120 caps
        self._seed_recorded_receipt(Decimal("120.000"))

        # Verify net available is 120
        avail_res = get_json(
            self.client_,
            f"/api/v1/stores/{self.store.id}/material-issues/available/?material={self.material.id}",
            self.token,
        )
        self.assertEqual(avail_res.status_code, 200)
        self.assertEqual(avail_res.json()[0]["net_quantity"], "120.000")

        # 2. Issue 100 caps to production
        from datetime import timedelta
        issue_res = post_json(
            self.client_,
            f"/api/v1/stores/{self.store.id}/material-issues/",
            {
                "source_company_id": self.company.id,
                "material_id": self.material.id,
                "issued_quantity": "100.000",
                "issued_at": (timezone.now() - timedelta(minutes=5)).isoformat(),
                "batch_reference": "BATCH-CAP-001",
            },
            self.token,
        )
        self.assertEqual(issue_res.status_code, 201)
        issue_id = issue_res.json()["id"]

        post_issue_res = post_json(
            self.client_,
            f"/api/v1/stores/{self.store.id}/material-issues/{issue_id}/post/",
            {"expected_version": 1},
            self.token,
        )
        self.assertEqual(post_issue_res.status_code, 200)

        # Production custody should now exist
        custody = ProductionCustody.objects.get(source_issue_id=issue_id)
        self.assertEqual(custody.issued_quantity, Decimal("100.000"))
        self.assertEqual(custody.remaining_quantity, Decimal("100.000"))
        self.assertEqual(custody.sound_quantity, Decimal("100.000"))

        custody_id = custody.id

        # 3. Consume 90
        consume_res = post_json(
            self.client_,
            f"/api/v1/stores/{self.store.id}/production-custody/{custody_id}/consume/",
            {"quantity": "90.000", "notes": "Production run batch 001"},
            self.token,
        )
        self.assertEqual(consume_res.status_code, 200)
        custody.refresh_from_db()
        self.assertEqual(custody.consumed_quantity, Decimal("90.000"))
        self.assertEqual(custody.remaining_quantity, Decimal("10.000"))
        self.assertEqual(custody.sound_quantity, Decimal("10.000"))

        # 4. Return 5 unused
        return_res = post_json(
            self.client_,
            f"/api/v1/stores/{self.store.id}/production-custody/{custody_id}/return/",
            {"quantity": "5.000", "return_type": "UNUSED", "reason": "Surplus from encapsulation"},
            self.token,
        )
        self.assertEqual(return_res.status_code, 200)
        custody.refresh_from_db()
        self.assertEqual(custody.returned_quantity, Decimal("5.000"))
        self.assertEqual(custody.remaining_quantity, Decimal("5.000"))
        self.assertEqual(custody.sound_quantity, Decimal("5.000"))

        # Check MaterialReturn row
        mat_return = MaterialReturn.objects.get(source_custody=custody)
        self.assertEqual(mat_return.quantity, Decimal("5.000"))
        self.assertEqual(mat_return.return_type, "UNUSED")
        self.assertEqual(mat_return.disposition, "HELD_UNASSESSED")

        # 5. Classify 5 damaged in production
        defect_res = post_json(
            self.client_,
            f"/api/v1/stores/{self.store.id}/production-custody/{custody_id}/classify-defect/",
            {"quantity": "5.000", "reason": "Deformed shells during sorting"},
            self.token,
        )
        self.assertEqual(defect_res.status_code, 200)
        custody.refresh_from_db()
        self.assertEqual(custody.damaged_quantity, Decimal("5.000"))
        self.assertEqual(custody.remaining_quantity, Decimal("5.000"))
        self.assertEqual(custody.sound_quantity, Decimal("0.000"))

        # Check reconciliation state:
        # Store physical = 120 (received) - 100 (issued) + 5 (returned) = 25
        store_received = Decimal("120.000")
        store_issued = Decimal("100.000")
        store_returned = Decimal("5.000")
        store_physical = store_received - store_issued + store_returned
        self.assertEqual(store_physical, Decimal("25.000"))
        self.assertEqual(custody.damaged_quantity, Decimal("5.000"))
        self.assertEqual(custody.consumed_quantity, Decimal("90.000"))
        self.assertEqual(store_physical + custody.damaged_quantity + custody.consumed_quantity, Decimal("120.000"))

        # 6. Dispose those 5 under explicit test policy
        dispose_res = post_json(
            self.client_,
            f"/api/v1/stores/{self.store.id}/production-custody/{custody_id}/dispose/",
            {
                "quantity": "5.000",
                "disposal_policy": "TEST_POLICY_PRODUCTION_DISPOSAL",
                "reason": "Scrap deformed shells per SOP-DISP-01",
            },
            self.token,
        )
        self.assertEqual(dispose_res.status_code, 200)
        custody.refresh_from_db()
        self.assertEqual(custody.disposed_quantity, Decimal("5.000"))
        self.assertEqual(custody.damaged_quantity, Decimal("0.000"))
        self.assertEqual(custody.remaining_quantity, Decimal("0.000"))

        # Final reconciliation:
        # Expected 120 = store 25 + consumed 90 + disposed 5
        self.assertEqual(store_physical, Decimal("25.000"))
        self.assertEqual(custody.consumed_quantity, Decimal("90.000"))
        self.assertEqual(custody.disposed_quantity, Decimal("5.000"))
        total_accounted = store_physical + custody.consumed_quantity + custody.disposed_quantity
        self.assertEqual(total_accounted, Decimal("120.000"))

    def test_book_quantity_tracks_returns_without_making_them_reissuable(self):
        """Exercises the task's own required acceptance numbers end-to-end
        through the real API (never a hand-computed Python arithmetic
        check, unlike test_reconciliation_workflow above):

        Post inward 100 -> issue 30 -> post -> consume 20 -> return 5 ->
        classify 5 damaged -> dispose 5.

        At every step: `net_quantity` (issue-eligible, received minus
        issued) must stay exactly 70 once the issue is posted - a return
        must NEVER make itself re-issuable. `book_quantity` (net_quantity
        + recorded_returned_quantity) must become 75 the moment the
        return is recorded, and STAY 75 through defect classification and
        disposal - disposing material already counted as returned is not
        a second store-side deduction (it was already removed from
        `net_quantity` at issue time, and the disposal event lives on
        ProductionCustody/ProductionFloorEvent, never on a second
        MaterialReturn row).
        """
        self._seed_recorded_receipt(Decimal("100.000"))

        def available():
            res = get_json(
                self.client_,
                f"/api/v1/stores/{self.store.id}/material-issues/available/?material={self.material.id}",
                self.token,
            )
            self.assertEqual(res.status_code, 200)
            return res.json()[0]

        row = available()
        self.assertEqual(row["net_quantity"], "100.000")
        self.assertEqual(row["book_quantity"], "100.000")
        self.assertEqual(row["recorded_returned_quantity"], "0.000")

        issue_res = post_json(
            self.client_,
            f"/api/v1/stores/{self.store.id}/material-issues/",
            {
                "source_company_id": self.company.id,
                "material_id": self.material.id,
                "issued_quantity": "30.000",
                "issued_at": (timezone.now() - timedelta(minutes=5)).isoformat(),
                "batch_reference": "BATCH-ACCEPT-01",
            },
            self.token,
        )
        self.assertEqual(issue_res.status_code, 201)
        issue_id = issue_res.json()["id"]

        # Draft issue: no stock effect at all yet.
        row = available()
        self.assertEqual(row["net_quantity"], "100.000")
        self.assertEqual(row["book_quantity"], "100.000")

        post_json(
            self.client_,
            f"/api/v1/stores/{self.store.id}/material-issues/{issue_id}/post/",
            {"expected_version": 1},
            self.token,
        )
        custody = ProductionCustody.objects.get(source_issue_id=issue_id)

        row = available()
        self.assertEqual(row["net_quantity"], "70.000")
        self.assertEqual(row["book_quantity"], "70.000")

        post_json(
            self.client_,
            f"/api/v1/stores/{self.store.id}/production-custody/{custody.id}/consume/",
            {"quantity": "20.000"},
            self.token,
        )
        row = available()
        self.assertEqual(row["net_quantity"], "70.000")
        self.assertEqual(row["book_quantity"], "70.000", "Consumption must never touch the store-side ledger.")

        return_res = post_json(
            self.client_,
            f"/api/v1/stores/{self.store.id}/production-custody/{custody.id}/return/",
            {"quantity": "5.000", "return_type": "UNUSED", "reason": "Unused Excess from Production Batch"},
            self.token,
        )
        self.assertEqual(return_res.status_code, 200)

        row = available()
        self.assertEqual(row["net_quantity"], "70.000", "A return must never become automatically issue-eligible.")
        self.assertEqual(row["recorded_returned_quantity"], "5.000")
        self.assertEqual(row["book_quantity"], "75.000")

        # The new store-wide, company-access-filtered MaterialReturn list.
        returns_res = get_json(self.client_, f"/api/v1/stores/{self.store.id}/material-returns/", self.token)
        self.assertEqual(returns_res.status_code, 200)
        returns_body = returns_res.json()
        self.assertEqual(returns_body["count"], 1)
        return_row = returns_body["results"][0]
        self.assertEqual(return_row["disposition"], "HELD_UNASSESSED")
        self.assertEqual(return_row["return_type"], "UNUSED")
        self.assertEqual(return_row["quantity"], "5.000")
        self.assertEqual(return_row["source_issue_reference"], issue_res.json()["reference"])

        post_json(
            self.client_,
            f"/api/v1/stores/{self.store.id}/production-custody/{custody.id}/classify-defect/",
            {"quantity": "5.000", "reason": "Deformed during sorting"},
            self.token,
        )
        row = available()
        self.assertEqual(row["book_quantity"], "75.000", "Classification alone must never change any store-side quantity.")

        custody.refresh_from_db()
        self.assertEqual(custody.remaining_quantity, Decimal("5.000"))
        self.assertEqual(custody.damaged_quantity, Decimal("5.000"))

        dispose_res = post_json(
            self.client_,
            f"/api/v1/stores/{self.store.id}/production-custody/{custody.id}/dispose/",
            {"quantity": "5.000", "disposal_policy": "POLICY-PRODUCTION-SCRAP-AUTH", "reason": "Scrap per SOP"},
            self.token,
        )
        self.assertEqual(dispose_res.status_code, 200)

        custody.refresh_from_db()
        self.assertEqual(custody.consumed_quantity, Decimal("20.000"))
        self.assertEqual(custody.returned_quantity, Decimal("5.000"))
        self.assertEqual(custody.disposed_quantity, Decimal("5.000"))
        self.assertEqual(custody.remaining_quantity, Decimal("0.000"))

        row = available()
        self.assertEqual(row["net_quantity"], "70.000")
        self.assertEqual(
            row["book_quantity"], "75.000",
            "Disposing material already issued out of the store is not a second store-side deduction.",
        )

        # Only ONE MaterialReturn row exists for this custody - disposal of
        # material that was never returned does not fabricate a second one.
        self.assertEqual(MaterialReturn.objects.filter(source_custody=custody).count(), 1)

        # The material register's own closing_net_of_issues carries the
        # same additive fields, computed independently from the ledger.
        register_res = get_json(
            self.client_, f"/api/v1/stores/{self.store.id}/materials/{self.material.id}/register/", self.token,
        )
        self.assertEqual(register_res.status_code, 200)
        closing_row = register_res.json()["closing_net_of_issues"][0]
        self.assertEqual(closing_row["net_quantity"], "70.000")
        self.assertEqual(closing_row["book_quantity"], "75.000")
        self.assertTrue(register_res.json()["coverage"]["returns_and_disposals_tracked"])

    def test_over_consumption_and_over_return_prevention(self):
        self._seed_recorded_receipt(Decimal("100.000"))
        issue_res = post_json(
            self.client_,
            f"/api/v1/stores/{self.store.id}/material-issues/",
            {
                "source_company_id": self.company.id,
                "material_id": self.material.id,
                "issued_quantity": "50.000",
                "issued_at": (timezone.now() - timedelta(minutes=5)).isoformat(),
            },
            self.token,
        )
        issue_id = issue_res.json()["id"]
        post_json(
            self.client_,
            f"/api/v1/stores/{self.store.id}/material-issues/{issue_id}/post/",
            {"expected_version": 1},
            self.token,
        )
        custody = ProductionCustody.objects.get(source_issue_id=issue_id)

        # Attempt to consume 51 (> 50 remaining)
        res = post_json(
            self.client_,
            f"/api/v1/stores/{self.store.id}/production-custody/{custody.id}/consume/",
            {"quantity": "51.000"},
            self.token,
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("detail", res.json())

        # Attempt to return 51 (> 50 remaining)
        res_ret = post_json(
            self.client_,
            f"/api/v1/stores/{self.store.id}/production-custody/{custody.id}/return/",
            {"quantity": "51.000", "return_type": "UNUSED"},
            self.token,
        )
        self.assertEqual(res_ret.status_code, 400)

        # Attempt to dispose without policy
        res_disp = post_json(
            self.client_,
            f"/api/v1/stores/{self.store.id}/production-custody/{custody.id}/dispose/",
            {"quantity": "10.000", "disposal_policy": ""},
            self.token,
        )
        self.assertEqual(res_disp.status_code, 400)

    def test_draft_endpoints_and_posting_blockers(self):
        # Physical count draft
        p_res = post_json(
            self.client_,
            f"/api/v1/stores/{self.store.id}/physical-count-drafts/",
            {
                "material_id": self.material.id,
                "unit_id": self.unit.id,
                "book_reference_quantity": "100.000",
                "actual_count_quantity": "98.500",
                "reason": "Quarterly count discrepancy",
            },
            self.token,
        )
        self.assertEqual(p_res.status_code, 201)
        data = p_res.json()
        self.assertEqual(data["status"], "DRAFT")
        self.assertEqual(data["discrepancy_quantity"], "-1.500")
        self.assertTrue("blocked" in data["posting_blocker_reason"].lower())

        # Cutover stock draft
        c_res = post_json(
            self.client_,
            f"/api/v1/stores/{self.store.id}/cutover-stock-drafts/",
            {
                "material_id": self.material.id,
                "unit_id": self.unit.id,
                "effective_date": "2026-04-01",
                "quantity": "250.000",
                "source_reference": "CUTOVER-SIGN-OFF-2026",
                "remarks": "Historical opening baseline",
            },
            self.token,
        )
        self.assertEqual(c_res.status_code, 201)
        c_data = c_res.json()
        self.assertEqual(c_data["status"], "DRAFT")
        self.assertEqual(c_data["quantity"], "250.000")
        self.assertTrue("blocked" in c_data["posting_blocker_reason"].lower())
