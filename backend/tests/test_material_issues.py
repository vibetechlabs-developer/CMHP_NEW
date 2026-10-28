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
from apps.stock_movements.models import MaterialIssue, MaterialIssueMovement
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


def material_issues_url(store_id):
    return f"/api/v1/stores/{store_id}/material-issues/"


def material_issue_url(store_id, issue_id):
    return f"/api/v1/stores/{store_id}/material-issues/{issue_id}/"


def material_issue_post_url(store_id, issue_id):
    return f"/api/v1/stores/{store_id}/material-issues/{issue_id}/post/"


def material_issue_cancel_url(store_id, issue_id):
    return f"/api/v1/stores/{store_id}/material-issues/{issue_id}/cancel/"


def available_to_issue_url(store_id, material_id):
    return f"/api/v1/stores/{store_id}/material-issues/available/?material={material_id}"


def register_url(store_id, material_id):
    return f"/api/v1/stores/{store_id}/materials/{material_id}/register/"


def goods_receipts_url(store_id):
    return f"/api/v1/stores/{store_id}/goods-receipts/"


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


class MaterialIssueTestCase(TestCase):
    def setUp(self):
        self.superuser = make_superuser("admin")
        self.company = Company.objects.create(code="ACME", legal_name="Acme Pvt Ltd")
        self.store = SharedStore.objects.create(code="MAINWH", name="Main Warehouse")
        self.client_ = Client()
        self.unit = UnitOfMeasure.objects.create(code="KG", name="KG", dimension="MASS")
        self.category = MaterialCategory.objects.create(code="HERB", name="HERB")
        self.material = Material.objects.create(
            code="MAT1", name="MAT1", kind="RAW_MATERIAL", base_unit=self.unit, category=self.category
        )
        self.supplier = Supplier.objects.create(code="SUP1", legal_name="Supplier One")
        self.user = make_user("staffuser")
        grant_company_permission(self.superuser, self.user, self.company, "purchase_orders.view")
        grant_store_permission(
            self.superuser, self.user, self.store, *ISSUE_ALL_PERMS, *RECEIVING_ALL_PERMS, "stock.view",
        )
        self.token = access_token_for(self.user)
        self._seed_recorded_receipt(Decimal("60"))

    def _po_admin(self, name):
        admin = make_user(name)
        grant_company_permission(
            self.superuser, admin, self.company, "purchase_requests.view", "purchase_requests.approve"
        )
        return admin

    def _seed_recorded_receipt(self, quantity):
        """Builds one real, fully-ISSUED PurchaseOrder and posts a real
        goods receipt against it, so this material actually has a
        recorded-receipt balance to issue against - mirrors
        tests.test_receiving.GoodsReceiptTestCase's own helper exactly.
        """
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
        res = post_json(self.client_, goods_receipts_url(self.store.id), payload, self.token)
        receipt_id = res.json()["id"]
        post_json(
            self.client_, f"{goods_receipts_url(self.store.id)}{receipt_id}/post/",
            {"expected_version": res.json()["version"]}, self.token,
        )

    def _create_issue(self, quantity="20", token=None, **extra):
        payload = {
            "source_company_id": self.company.id,
            "material_id": self.material.id,
            "issued_quantity": quantity,
            "issued_at": (timezone.now() - timedelta(minutes=5)).isoformat(),
            "batch_reference": "BATCH-01",
            "product_reference": "Test Product",
            **extra,
        }
        return post_json(self.client_, material_issues_url(self.store.id), payload, token or self.token)


class MaterialIssueLifecycleTests(MaterialIssueTestCase):
    def test_create_draft_does_not_affect_recorded_balance(self):
        res = self._create_issue("20")
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.json()["status"], "DRAFT")
        self.assertEqual(MaterialIssueMovement.objects.count(), 0)

        available = get_json(self.client_, available_to_issue_url(self.store.id, self.material.id), self.token)
        self.assertEqual(Decimal(available.json()[0]["net_quantity"]), Decimal("60.000"))

    def test_post_creates_exactly_one_movement_and_reduces_net_balance(self):
        created = self._create_issue("20").json()
        res = post_json(
            self.client_, material_issue_post_url(self.store.id, created["id"]),
            {"expected_version": created["version"]}, self.token,
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["status"], "POSTED")
        self.assertEqual(MaterialIssueMovement.objects.count(), 1)

        available = get_json(self.client_, available_to_issue_url(self.store.id, self.material.id), self.token)
        self.assertEqual(Decimal(available.json()[0]["net_quantity"]), Decimal("40.000"))

    def test_posting_twice_at_the_same_version_is_an_idempotent_no_op(self):
        created = self._create_issue("20").json()
        first = post_json(
            self.client_, material_issue_post_url(self.store.id, created["id"]),
            {"expected_version": created["version"]}, self.token,
        )
        second = post_json(
            self.client_, material_issue_post_url(self.store.id, created["id"]),
            {"expected_version": first.json()["version"]}, self.token,
        )
        self.assertEqual(second.status_code, 200)
        self.assertEqual(MaterialIssueMovement.objects.count(), 1)

    def test_posting_more_than_the_recorded_net_balance_is_rejected(self):
        created = self._create_issue("999").json()
        res = post_json(
            self.client_, material_issue_post_url(self.store.id, created["id"]),
            {"expected_version": created["version"]}, self.token,
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("exceed", json.dumps(res.json()).lower())
        self.assertEqual(MaterialIssueMovement.objects.count(), 0)

    def test_two_posted_issues_cannot_together_exceed_the_recorded_balance(self):
        first = self._create_issue("40").json()
        post_json(
            self.client_, material_issue_post_url(self.store.id, first["id"]),
            {"expected_version": first["version"]}, self.token,
        )
        second = self._create_issue("30").json()
        res = post_json(
            self.client_, material_issue_post_url(self.store.id, second["id"]),
            {"expected_version": second["version"]}, self.token,
        )
        self.assertEqual(res.status_code, 400)

    def test_cancel_draft_requires_reason_and_never_touches_a_posted_issue(self):
        created = self._create_issue("20").json()
        no_reason = post_json(
            self.client_, material_issue_cancel_url(self.store.id, created["id"]),
            {"expected_version": created["version"]}, self.token,
        )
        self.assertEqual(no_reason.status_code, 400)

        posted = post_json(
            self.client_, material_issue_post_url(self.store.id, created["id"]),
            {"expected_version": created["version"]}, self.token,
        ).json()
        cannot_cancel_posted = post_json(
            self.client_, material_issue_cancel_url(self.store.id, posted["id"]),
            {"expected_version": posted["version"], "cancellation_reason": "test"}, self.token,
        )
        self.assertEqual(cannot_cancel_posted.status_code, 400)

    def test_idempotency_key_replay_returns_the_same_draft_not_a_second_one(self):
        # issued_at must be pinned and reused identically across both
        # calls - _create_issue defaults it to timezone.now() when not
        # overridden, which would make the two calls' content genuinely
        # different (by microseconds) and defeat the very thing this
        # test is checking (mirrors test_receiving.py's own fix for the
        # same trap).
        key = "test-issue-key-1"
        issued_at = (timezone.now() - timedelta(minutes=5)).isoformat()
        first = self._create_issue("20", idempotency_key=key, issued_at=issued_at)
        second = self._create_issue("20", idempotency_key=key, issued_at=issued_at)
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 201)
        self.assertEqual(first.json()["id"], second.json()["id"])
        self.assertEqual(MaterialIssue.objects.count(), 1)


class MaterialIssueAuthorizationTests(MaterialIssueTestCase):
    def test_a_user_without_stock_issue_create_cannot_create_one(self):
        viewer = make_user("viewer")
        grant_company_permission(self.superuser, viewer, self.company, "purchase_orders.view")
        grant_store_permission(self.superuser, viewer, self.store, "stock_issue.view")
        res = self._create_issue("10", token=access_token_for(viewer))
        self.assertEqual(res.status_code, 403)

    def test_a_user_without_purchase_orders_view_in_the_company_cannot_see_the_issue(self):
        outsider = make_user("outsider")
        grant_store_permission(self.superuser, outsider, self.store, *ISSUE_ALL_PERMS)
        created = self._create_issue("10").json()
        res = get_json(self.client_, material_issue_url(self.store.id, created["id"]), access_token_for(outsider))
        self.assertEqual(res.status_code, 404)


class MaterialRegisterIssueFieldsTests(MaterialIssueTestCase):
    def test_register_shows_real_period_issued_and_net_closing_additively(self):
        created = self._create_issue("20").json()
        post_json(
            self.client_, material_issue_post_url(self.store.id, created["id"]),
            {"expected_version": created["version"]}, self.token,
        )
        res = get_json(self.client_, register_url(self.store.id, self.material.id), self.token)
        body = res.json()

        # Existing receipt-only fields are completely unaffected.
        self.assertEqual(Decimal(body["closing"][0]["recorded_receipt_quantity"]), Decimal("60.000"))
        # New, additive fields carry the real issue data.
        self.assertEqual(Decimal(body["period_issued"][0]["recorded_issued_quantity"]), Decimal("20.000"))
        self.assertEqual(Decimal(body["closing_net_of_issues"][0]["net_quantity"]), Decimal("40.000"))
        self.assertTrue(body["coverage"]["issued_quantity_tracked"])
        self.assertFalse(body["coverage"]["returns_reservations_release_tracked"])
