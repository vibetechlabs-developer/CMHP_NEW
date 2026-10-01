import itertools
import json
import threading
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.test import Client, TestCase, TransactionTestCase
from django.utils import timezone
from rest_framework_simplejwt.tokens import AccessToken

from apps.audit.models import AuditLog
from apps.catalog.models import Material, MaterialCategory, UnitOfMeasure
from apps.common.errors import Conflict
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
from apps.receiving.admin import GoodsReceiptAdmin
from apps.receiving.models import GoodsReceipt, GoodsReceiptLine
from apps.receiving.services import (
    cancel_goods_receipt,
    create_goods_receipt,
    delivery_progress_for_purchase_order,
    post_goods_receipt,
    update_goods_receipt,
)
from apps.stores.models import SharedStore
from apps.stores.services import assign_store_membership, assign_store_membership_role
from apps.suppliers.models import Supplier
from apps.users.services import assign_company_membership, assign_membership_role

User = get_user_model()
PASSWORD = "a-strong-pass-1"


def goods_receipts_url(store_id):
    return f"/api/v1/stores/{store_id}/goods-receipts/"


def goods_receipt_url(store_id, receipt_id):
    return f"/api/v1/stores/{store_id}/goods-receipts/{receipt_id}/"


def goods_receipt_post_url(store_id, receipt_id):
    return f"/api/v1/stores/{store_id}/goods-receipts/{receipt_id}/post/"


def goods_receipt_cancel_url(store_id, receipt_id):
    return f"/api/v1/stores/{store_id}/goods-receipts/{receipt_id}/cancel/"


def eligible_purchase_orders_url(store_id):
    return f"/api/v1/stores/{store_id}/goods-receipts/eligible-purchase-orders/"


def make_user(username, password=PASSWORD, **kwargs):
    return User.objects.create_user(
        username=username, email=f"{username}@example.com", password=password, **kwargs
    )


def make_superuser(username, password=PASSWORD):
    return User.objects.create_superuser(
        username=username, email=f"{username}@example.com", password=password
    )


def make_company(code, **kwargs):
    return Company.objects.create(code=code, legal_name=f"{code} Legal Name Pvt Ltd", **kwargs)


def make_store(code, **kwargs):
    return SharedStore.objects.create(code=code, name=f"{code} Store", **kwargs)


def make_unit(code, dimension="MASS", **kwargs):
    return UnitOfMeasure.objects.create(code=code, name=code, dimension=dimension, **kwargs)


def make_category(code, **kwargs):
    return MaterialCategory.objects.create(code=code, name=code, **kwargs)


def make_material(code, base_unit, kind="RAW_MATERIAL", category=None, name=None, **kwargs):
    return Material.objects.create(
        code=code, name=name or code, kind=kind, base_unit=base_unit, category=category, **kwargs
    )


def make_supplier(code, legal_name=None, **kwargs):
    return Supplier.objects.create(code=code, legal_name=legal_name or f"{code} Legal Name", **kwargs)


def access_token_for(user):
    return str(AccessToken.for_user(user))


def bearer(token):
    return {"HTTP_AUTHORIZATION": f"Bearer {token}"}


def get_json(client, url, token, **extra):
    return client.get(url, **bearer(token), **extra)


def post_json(client, url, payload, token):
    return client.post(url, data=json.dumps(payload), content_type="application/json", **bearer(token))


def patch_json(client, url, payload, token):
    return client.patch(url, data=json.dumps(payload), content_type="application/json", **bearer(token))


def grant_company_permission(actor, user, company, *permission_codes):
    membership, _ = assign_company_membership(actor=actor, user=user, company=company)
    role = create_company_role(actor=actor, company=company, code=f"CROLE{user.id}{company.id}", name="Role")
    role, _ = replace_role_permissions(actor=actor, role=role, permission_codes=list(permission_codes))
    assign_membership_role(actor=actor, membership=membership, role=role)
    return membership, role


def grant_store_permission(actor, user, store, *permission_codes):
    membership, _ = assign_store_membership(actor=actor, user=user, store=store)
    role = create_store_role(actor=actor, store=store, code=f"SROLE{user.id}{store.id}", name="Role")
    role, _ = replace_store_role_permissions(actor=actor, role=role, permission_codes=list(permission_codes))
    assign_store_membership_role(actor=actor, membership=membership, role=role)
    return membership, role


_unique_suffix = itertools.count()


def _unique(prefix):
    return f"{prefix}{next(_unique_suffix)}"


RECEIVING_ALL_PERMS = (
    "receiving.view",
    "receiving.create",
    "receiving.edit",
    "receiving.post",
    "receiving.cancel",
)


class GoodsReceiptTestCase(TestCase):
    def setUp(self):
        self.superuser = make_superuser("admin")
        self.company = make_company("ACME")
        self.other_company = make_company("BETA")
        self.store = make_store("MAINWH")
        self.other_store = make_store("SIDEWH")
        self.client_ = Client()
        self.unit = make_unit("KG")
        self.category = make_category("HERB")
        self.material = make_material("MAT1", base_unit=self.unit, category=self.category)
        self.supplier = make_supplier("SUP1")
        self.user = make_user("staffuser")
        grant_company_permission(self.superuser, self.user, self.company, "purchase_orders.view")
        grant_store_permission(self.superuser, self.user, self.store, *RECEIVING_ALL_PERMS)
        self.token = access_token_for(self.user)

    def _po_admin(self, name, company=None):
        admin = make_user(name)
        grant_company_permission(
            self.superuser, admin, company or self.company, "purchase_requests.view", "purchase_requests.approve"
        )
        return admin

    def _issued_po(self, company=None, quantity=Decimal("100"), unit_price=Decimal("10.0000")):
        """Builds a real, fully-ISSUED PurchaseOrder end to end: create PR
        -> submit -> approve x3 by 3 distinct admins -> create PO -> set
        a real price -> issue. Every Purchase Order/Purchase Request rule
        from Tasks 08B-1 through 08C-2 is exercised for real, not stubbed.
        """
        company = company or self.company
        requester = make_user(_unique(f"requester_{company.code}_"))
        grant_company_permission(
            self.superuser, requester, company,
            "purchase_requests.view", "purchase_requests.create", "purchase_requests.submit",
            "purchase_orders.view", "purchase_orders.create",
        )
        pr = create_purchase_request(
            actor=requester, company=company, lines=[{"material_id": self.material.id, "quantity": quantity}]
        )
        pr = submit_purchase_request(actor=requester, purchase_request_id=pr.id, expected_version=1)
        for i in range(3):
            approver = self._po_admin(f"approver_{company.code}_{pr.id}_{i}", company=company)
            pr = approve_purchase_request(
                actor=approver, purchase_request_id=pr.id, expected_version=pr.version,
                expected_round=pr.current_round, expected_step=pr.current_step,
            )
        po = create_purchase_order(
            actor=requester, company=company, source_purchase_request_id=pr.id,
            supplier_id=self.supplier.id, currency_code="INR",
            expected_delivery_date=timezone.now().date() + timedelta(days=14),
        )
        line = po.lines.get()
        po = update_purchase_order(
            actor=requester, purchase_order_id=po.id, expected_version=po.version,
            data={"lines": [{"id": line.id, "unit_price": unit_price}]},
        )
        po = issue_purchase_order(actor=requester, purchase_order_id=po.id, expected_version=po.version)
        return po

    def _create_receipt(self, po, quantity=Decimal("60"), arrived_at=None, token=None, **extra):
        arrived_at = arrived_at or (timezone.now() - timedelta(hours=1))
        po_line_id = po.issue_snapshot.lines.get().id
        payload = {
            "source_purchase_order_id": po.id,
            "arrived_at": arrived_at.isoformat(),
            "lines": [{"source_po_line_id": po_line_id, "received_quantity": str(quantity)}],
            **extra,
        }
        return post_json(self.client_, goods_receipts_url(self.store.id), payload, token or self.token)


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class GoodsReceiptModelTests(GoodsReceiptTestCase):
    def test_reference_is_unique(self):
        po = self._issued_po()
        response = self._create_receipt(po)
        receipt = GoodsReceipt.objects.get(pk=response.json()["id"])
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                GoodsReceipt.objects.create(
                    store=self.store, company=self.company, source_purchase_order=po,
                    reference=receipt.reference, arrived_at=timezone.now(), created_by=self.user,
                )

    def test_store_immutable_after_creation(self):
        po = self._issued_po()
        response = self._create_receipt(po)
        receipt = GoodsReceipt.objects.get(pk=response.json()["id"])
        receipt.store = self.other_store
        with self.assertRaises(Exception):
            receipt.save()

    def test_company_immutable_after_creation(self):
        po = self._issued_po()
        response = self._create_receipt(po)
        receipt = GoodsReceipt.objects.get(pk=response.json()["id"])
        receipt.company = self.other_company
        with self.assertRaises(Exception):
            receipt.save()

    def test_source_purchase_order_immutable_after_creation(self):
        po = self._issued_po()
        other_po = self._issued_po(quantity=Decimal("5"))
        response = self._create_receipt(po)
        receipt = GoodsReceipt.objects.get(pk=response.json()["id"])
        receipt.source_purchase_order = other_po
        with self.assertRaises(Exception):
            receipt.save()

    def test_line_quantity_positive_db_constraint_backstops_bulk_create(self):
        po = self._issued_po()
        response = self._create_receipt(po)
        receipt = GoodsReceipt.objects.get(pk=response.json()["id"])
        source_po_line = receipt.lines.get().source_po_line
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                GoodsReceiptLine.objects.bulk_create(
                    [
                        GoodsReceiptLine(
                            goods_receipt=receipt, line_number=99, source_po_line=source_po_line,
                            material=self.material, unit=self.unit, received_quantity=Decimal("0"),
                        )
                    ]
                )

    def test_idempotency_key_unique_db_constraint(self):
        po = self._issued_po()
        self._create_receipt(po, idempotency_key="dup-key-1")
        other_po = self._issued_po(quantity=Decimal("5"))
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                GoodsReceipt.objects.create(
                    store=self.store, company=self.company, source_purchase_order=other_po,
                    reference="GR-DUPTEST", idempotency_key="dup-key-1", arrived_at=timezone.now(),
                    created_by=self.user,
                )

    def test_blank_idempotency_key_not_unique_constrained(self):
        po1 = self._issued_po()
        po2 = self._issued_po(quantity=Decimal("5"))
        r1 = self._create_receipt(po1)
        r2 = self._create_receipt(po2)
        self.assertEqual(r1.status_code, 201)
        self.assertEqual(r2.status_code, 201)


# ---------------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------------


class GoodsReceiptAdminAccessRestrictionTests(TestCase):
    def setUp(self):
        from django.test import RequestFactory

        self.factory = RequestFactory()
        self.admin = GoodsReceiptAdmin(GoodsReceipt, admin_site=None)

    def _request_as(self, user):
        request = self.factory.get("/admin/")
        request.user = user
        return request

    def test_active_superuser_can_view_but_not_add_or_change(self):
        superuser = make_superuser("admin")
        request = self._request_as(superuser)
        self.assertTrue(self.admin.has_view_permission(request))
        self.assertFalse(self.admin.has_add_permission(request))
        self.assertFalse(self.admin.has_change_permission(request))
        self.assertFalse(self.admin.has_delete_permission(request))

    def test_ordinary_staff_cannot_view(self):
        staff_user = make_user("staffer", is_staff=True)
        request = self._request_as(staff_user)
        self.assertFalse(self.admin.has_view_permission(request))


# ---------------------------------------------------------------------------
# Authorization / access separation
# ---------------------------------------------------------------------------


class GoodsReceiptAuthorizationTests(GoodsReceiptTestCase):
    def test_anonymous_401(self):
        self.assertEqual(self.client_.get(goods_receipts_url(self.store.id)).status_code, 401)

    def test_no_store_membership_404(self):
        user = make_user("nostoreaccess")
        grant_company_permission(self.superuser, user, self.company, "purchase_orders.view")
        response = get_json(self.client_, goods_receipts_url(self.store.id), access_token_for(user))
        self.assertEqual(response.status_code, 404)

    def test_store_member_without_receiving_permission_403(self):
        user = make_user("nostoreperm")
        grant_store_permission(self.superuser, user, self.store)
        grant_company_permission(self.superuser, user, self.company, "purchase_orders.view")
        response = get_json(self.client_, goods_receipts_url(self.store.id), access_token_for(user))
        self.assertEqual(response.status_code, 403)

    def test_store_access_alone_does_not_reveal_other_companys_receipts(self):
        """Store receiving.view is not enough on its own - a caller also
        needs purchase_orders.view in the specific receipt's company.
        This is the explicit access-policy this task requires.
        """
        po = self._issued_po(company=self.other_company)
        # self.user has receiving.* in self.store but NO access to
        # self.other_company - create the receipt directly via the
        # service (bypassing the view layer, which would itself already
        # reject this) to populate a receipt this user must never see.
        creator = make_user("othercompanycreator")
        grant_company_permission(self.superuser, creator, self.other_company, "purchase_orders.view")
        grant_store_permission(self.superuser, creator, self.store, *RECEIVING_ALL_PERMS)
        po_line_id = po.issue_snapshot.lines.get().id
        receipt = create_goods_receipt(
            actor=creator, store=self.store, source_purchase_order_id=po.id,
            arrived_at=timezone.now() - timedelta(hours=1),
            lines=[{"source_po_line_id": po_line_id, "received_quantity": Decimal("10")}],
        )
        # self.user has store access but not other_company access.
        response = get_json(self.client_, goods_receipt_url(self.store.id, receipt.id), self.token)
        self.assertEqual(response.status_code, 404)
        list_response = get_json(self.client_, goods_receipts_url(self.store.id), self.token)
        self.assertEqual(list_response.json()["count"], 0)

    def test_company_access_alone_without_any_store_membership_404(self):
        # No store membership at all - folds into the same 404 as a
        # nonexistent store, mirroring _get_company_for_action's own
        # "cannot distinguish doesn't-exist from no-access" convention.
        # Contrast with test_store_member_without_receiving_permission_403
        # above: a store *member* missing the specific permission gets a
        # 403 instead, since membership itself is not in question there.
        po = self._issued_po()
        user = make_user("companyonly")
        grant_company_permission(self.superuser, user, self.company, "purchase_orders.view")
        response = self._create_receipt(po, token=access_token_for(user))
        self.assertEqual(response.status_code, 404)

    def test_common_store_operator_needs_both_companies_access(self):
        """A user handling receiving for both companies at the shared
        store needs company access to both, granted the ordinary way -
        store membership alone never substitutes for it.
        """
        po_a = self._issued_po(company=self.company, quantity=Decimal("5"))
        po_b = self._issued_po(company=self.other_company, quantity=Decimal("5"))
        operator = make_user("commonoperator")
        grant_store_permission(self.superuser, operator, self.store, *RECEIVING_ALL_PERMS)
        grant_company_permission(self.superuser, operator, self.company, "purchase_orders.view")
        # No access to other_company yet.
        token = access_token_for(operator)
        ok_response = self._create_receipt(po_a, quantity=Decimal("1"), token=token)
        self.assertEqual(ok_response.status_code, 201)
        denied_response = self._create_receipt(po_b, quantity=Decimal("1"), token=token)
        self.assertEqual(denied_response.status_code, 404)
        # Grant the second company's access - now it works.
        grant_company_permission(self.superuser, operator, self.other_company, "purchase_orders.view")
        now_ok = self._create_receipt(po_b, quantity=Decimal("1"), token=access_token_for(operator))
        self.assertEqual(now_ok.status_code, 201)

    def test_cross_store_isolation(self):
        po = self._issued_po()
        response = self._create_receipt(po)
        receipt_id = response.json()["id"]
        user = make_user("otherstoreuser")
        grant_store_permission(self.superuser, user, self.other_store, *RECEIVING_ALL_PERMS)
        grant_company_permission(self.superuser, user, self.company, "purchase_orders.view")
        response = get_json(
            self.client_, goods_receipt_url(self.other_store.id, receipt_id), access_token_for(user)
        )
        self.assertEqual(response.status_code, 404)

    def test_superuser_without_store_membership_no_access(self):
        po = self._issued_po()
        response = self._create_receipt(po)
        receipt_id = response.json()["id"]
        response = get_json(
            self.client_, goods_receipt_url(self.store.id, receipt_id), access_token_for(self.superuser)
        )
        self.assertEqual(response.status_code, 404)


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


class GoodsReceiptCreateTests(GoodsReceiptTestCase):
    def test_create_success(self):
        po = self._issued_po(quantity=Decimal("100"))
        response = self._create_receipt(po, quantity=Decimal("60"))
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body["status"], "DRAFT")
        self.assertEqual(body["company_id"], self.company.id)
        self.assertEqual(body["store_id"], self.store.id)
        self.assertEqual(len(body["lines"]), 1)
        self.assertEqual(body["lines"][0]["received_quantity"], "60.000")
        self.assertEqual(body["lines"][0]["material_code"], "MAT1")

    def test_only_issued_source_draft_rejected(self):
        pr = create_purchase_request(
            actor=self.user, company=self.company, lines=[{"material_id": self.material.id, "quantity": Decimal("1")}]
        )
        response = post_json(
            self.client_, goods_receipts_url(self.store.id),
            {
                "source_purchase_order_id": pr.id,  # not even a PO id, but any nonexistent/wrong-status id 400s
                "arrived_at": timezone.now().isoformat(),
                "lines": [],
            },
            self.token,
        )
        self.assertIn(response.status_code, (400, 404))

    def test_only_issued_source_draft_po_rejected(self):
        po = self._issued_po()
        # Force the PO back to a non-ISSUED status directly to prove the
        # service-level guard, since no real API can un-issue a PO.
        from apps.purchasing.models import PurchaseOrder as POModel

        POModel.objects.filter(pk=po.id).update(status="CANCELLED")
        response = self._create_receipt(po)
        self.assertEqual(response.status_code, 400)

    def test_empty_draft_allowed(self):
        po = self._issued_po()
        response = post_json(
            self.client_, goods_receipts_url(self.store.id),
            {"source_purchase_order_id": po.id, "arrived_at": timezone.now().isoformat(), "lines": []},
            self.token,
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["lines"], [])

    def test_multiple_lots_for_one_po_line(self):
        po = self._issued_po(quantity=Decimal("100"))
        po_line_id = po.issue_snapshot.lines.get().id
        response = post_json(
            self.client_, goods_receipts_url(self.store.id),
            {
                "source_purchase_order_id": po.id,
                "arrived_at": (timezone.now() - timedelta(hours=1)).isoformat(),
                "lines": [
                    {"source_po_line_id": po_line_id, "received_quantity": "30", "lot_reference": "LOT-A"},
                    {"source_po_line_id": po_line_id, "received_quantity": "20", "lot_reference": "LOT-B"},
                ],
            },
            self.token,
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(len(response.json()["lines"]), 2)

    def test_unknown_source_po_line_rejected(self):
        po = self._issued_po()
        response = post_json(
            self.client_, goods_receipts_url(self.store.id),
            {
                "source_purchase_order_id": po.id,
                "arrived_at": timezone.now().isoformat(),
                "lines": [{"source_po_line_id": 999999, "received_quantity": "1"}],
            },
            self.token,
        )
        self.assertEqual(response.status_code, 400)

    def test_source_po_line_from_different_po_rejected(self):
        po1 = self._issued_po(quantity=Decimal("10"))
        po2 = self._issued_po(quantity=Decimal("10"))
        po2_line_id = po2.issue_snapshot.lines.get().id
        response = post_json(
            self.client_, goods_receipts_url(self.store.id),
            {
                "source_purchase_order_id": po1.id,
                "arrived_at": timezone.now().isoformat(),
                "lines": [{"source_po_line_id": po2_line_id, "received_quantity": "1"}],
            },
            self.token,
        )
        self.assertEqual(response.status_code, 400)

    def test_zero_quantity_line_rejected(self):
        po = self._issued_po()
        po_line_id = po.issue_snapshot.lines.get().id
        response = post_json(
            self.client_, goods_receipts_url(self.store.id),
            {
                "source_purchase_order_id": po.id,
                "arrived_at": timezone.now().isoformat(),
                "lines": [{"source_po_line_id": po_line_id, "received_quantity": "0"}],
            },
            self.token,
        )
        self.assertEqual(response.status_code, 400)

    def test_prohibited_fields_rejected(self):
        po = self._issued_po()
        response = post_json(
            self.client_, goods_receipts_url(self.store.id),
            {
                "source_purchase_order_id": po.id, "arrived_at": timezone.now().isoformat(), "lines": [],
                "status": "POSTED",
            },
            self.token,
        )
        self.assertEqual(response.status_code, 400)

    def test_line_material_override_rejected(self):
        po = self._issued_po()
        po_line_id = po.issue_snapshot.lines.get().id
        response = post_json(
            self.client_, goods_receipts_url(self.store.id),
            {
                "source_purchase_order_id": po.id, "arrived_at": timezone.now().isoformat(),
                "lines": [{"source_po_line_id": po_line_id, "received_quantity": "1", "material_id": self.material.id}],
            },
            self.token,
        )
        self.assertEqual(response.status_code, 400)

    def test_idempotency_key_retry_same_content_returns_existing(self):
        # arrived_at must be pinned and reused identically across both
        # calls - _create_receipt defaults it to timezone.now() when
        # omitted, which would make the two calls' content genuinely
        # different (by microseconds) and defeat the very thing this
        # test is checking.
        po = self._issued_po(quantity=Decimal("100"))
        arrived_at = timezone.now() - timedelta(hours=1)
        first = self._create_receipt(po, quantity=Decimal("40"), arrived_at=arrived_at, idempotency_key="retry-key-1")
        self.assertEqual(first.status_code, 201)
        second = self._create_receipt(po, quantity=Decimal("40"), arrived_at=arrived_at, idempotency_key="retry-key-1")
        self.assertEqual(second.status_code, 201)
        self.assertEqual(first.json()["id"], second.json()["id"])
        self.assertEqual(GoodsReceipt.objects.filter(source_purchase_order=po).count(), 1)

    def test_idempotency_key_retry_different_content_conflict(self):
        po = self._issued_po(quantity=Decimal("100"))
        first = self._create_receipt(po, quantity=Decimal("40"), idempotency_key="retry-key-2")
        self.assertEqual(first.status_code, 201)
        second = self._create_receipt(po, quantity=Decimal("41"), idempotency_key="retry-key-2")
        self.assertEqual(second.status_code, 409)

    def test_does_not_mutate_source_purchase_order(self):
        po = self._issued_po()
        before_version = po.version
        self._create_receipt(po)
        po.refresh_from_db()
        self.assertEqual(po.status, "ISSUED")
        self.assertEqual(po.version, before_version)


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------


class GoodsReceiptUpdateTests(GoodsReceiptTestCase):
    def setUp(self):
        super().setUp()
        self.po = self._issued_po(quantity=Decimal("100"))
        response = self._create_receipt(self.po, quantity=Decimal("30"))
        self.receipt_id = response.json()["id"]

    def test_update_notes_and_delivery_note_reference(self):
        response = patch_json(
            self.client_, goods_receipt_url(self.store.id, self.receipt_id),
            {"expected_version": 1, "notes": "arrived slightly late", "delivery_note_reference": "DN-100"},
            self.token,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["notes"], "arrived slightly late")
        self.assertEqual(response.json()["delivery_note_reference"], "DN-100")

    def test_update_replaces_lines(self):
        po_line_id = self.po.issue_snapshot.lines.get().id
        response = patch_json(
            self.client_, goods_receipt_url(self.store.id, self.receipt_id),
            {
                "expected_version": 1,
                "lines": [{"source_po_line_id": po_line_id, "received_quantity": "45", "lot_reference": "LOT-X"}],
            },
            self.token,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()["lines"]), 1)
        self.assertEqual(response.json()["lines"][0]["received_quantity"], "45.000")

    def test_no_op_patch_does_not_bump_version(self):
        response = patch_json(
            self.client_, goods_receipt_url(self.store.id, self.receipt_id),
            {"expected_version": 1, "notes": ""}, self.token,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["version"], 1)

    def test_stale_version_409(self):
        response = patch_json(
            self.client_, goods_receipt_url(self.store.id, self.receipt_id),
            {"expected_version": 999, "notes": "x"}, self.token,
        )
        self.assertEqual(response.status_code, 409)

    def test_posted_cannot_be_edited(self):
        post_json(
            self.client_, goods_receipt_post_url(self.store.id, self.receipt_id), {"expected_version": 1}, self.token
        )
        response = patch_json(
            self.client_, goods_receipt_url(self.store.id, self.receipt_id),
            {"expected_version": 2, "notes": "too late"}, self.token,
        )
        self.assertEqual(response.status_code, 400)

    def test_update_requires_permission_403(self):
        user = make_user("noeditreceiving")
        grant_store_permission(self.superuser, user, self.store, "receiving.view")
        grant_company_permission(self.superuser, user, self.company, "purchase_orders.view")
        response = patch_json(
            self.client_, goods_receipt_url(self.store.id, self.receipt_id),
            {"expected_version": 1, "notes": "x"}, access_token_for(user),
        )
        self.assertEqual(response.status_code, 403)


# ---------------------------------------------------------------------------
# Post (partial delivery / over-receipt prevention)
# ---------------------------------------------------------------------------


class GoodsReceiptPostTests(GoodsReceiptTestCase):
    def test_post_success(self):
        po = self._issued_po(quantity=Decimal("100"))
        response = self._create_receipt(po, quantity=Decimal("60"))
        receipt_id = response.json()["id"]
        post_response = post_json(
            self.client_, goods_receipt_post_url(self.store.id, receipt_id), {"expected_version": 1}, self.token
        )
        self.assertEqual(post_response.status_code, 200)
        self.assertEqual(post_response.json()["status"], "POSTED")
        self.assertIsNotNone(post_response.json()["posted_at"])

    def test_partial_then_remaining_delivery_reaches_fully_received(self):
        po = self._issued_po(quantity=Decimal("100"))
        po_line_id = po.issue_snapshot.lines.get().id

        first = self._create_receipt(po, quantity=Decimal("60"))
        post_json(
            self.client_, goods_receipt_post_url(self.store.id, first.json()["id"]), {"expected_version": 1},
            self.token,
        )
        progress = delivery_progress_for_purchase_order(po)
        self.assertEqual(progress[0]["delivery_status"], "PARTIALLY_RECEIVED")
        self.assertEqual(progress[0]["received_quantity"], Decimal("60"))
        self.assertEqual(progress[0]["remaining_quantity"], Decimal("40"))

        second = self._create_receipt(po, quantity=Decimal("40"))
        post_json(
            self.client_, goods_receipt_post_url(self.store.id, second.json()["id"]), {"expected_version": 1},
            self.token,
        )
        progress = delivery_progress_for_purchase_order(po)
        self.assertEqual(progress[0]["delivery_status"], "FULLY_RECEIVED")
        self.assertEqual(progress[0]["received_quantity"], Decimal("100"))
        self.assertEqual(progress[0]["remaining_quantity"], Decimal("0"))

    def test_not_received_before_any_post(self):
        po = self._issued_po(quantity=Decimal("100"))
        self._create_receipt(po, quantity=Decimal("60"))  # DRAFT only, never posted
        progress = delivery_progress_for_purchase_order(po)
        self.assertEqual(progress[0]["delivery_status"], "NOT_RECEIVED")
        self.assertEqual(progress[0]["received_quantity"], Decimal("0"))

    def test_draft_receipt_does_not_affect_received_totals(self):
        po = self._issued_po(quantity=Decimal("100"))
        self._create_receipt(po, quantity=Decimal("60"))
        self._create_receipt(po, quantity=Decimal("35"))
        progress = delivery_progress_for_purchase_order(po)
        # Neither receipt was posted - totals must stay at zero.
        self.assertEqual(progress[0]["received_quantity"], Decimal("0"))

    def test_over_receipt_rejected(self):
        po = self._issued_po(quantity=Decimal("100"))
        response = self._create_receipt(po, quantity=Decimal("150"))
        receipt_id = response.json()["id"]
        post_response = post_json(
            self.client_, goods_receipt_post_url(self.store.id, receipt_id), {"expected_version": 1}, self.token
        )
        self.assertEqual(post_response.status_code, 400)

    def test_cumulative_over_receipt_across_receipts_rejected(self):
        po = self._issued_po(quantity=Decimal("100"))
        first = self._create_receipt(po, quantity=Decimal("60"))
        post_json(
            self.client_, goods_receipt_post_url(self.store.id, first.json()["id"]), {"expected_version": 1},
            self.token,
        )
        second = self._create_receipt(po, quantity=Decimal("50"))  # 60+50 = 110 > 100
        post_response = post_json(
            self.client_, goods_receipt_post_url(self.store.id, second.json()["id"]), {"expected_version": 1},
            self.token,
        )
        self.assertEqual(post_response.status_code, 400)
        # First posting's totals remain intact - no partial application.
        progress = delivery_progress_for_purchase_order(po)
        self.assertEqual(progress[0]["received_quantity"], Decimal("60"))

    def test_requires_at_least_one_line(self):
        po = self._issued_po()
        response = post_json(
            self.client_, goods_receipts_url(self.store.id),
            {"source_purchase_order_id": po.id, "arrived_at": timezone.now().isoformat(), "lines": []},
            self.token,
        )
        receipt_id = response.json()["id"]
        post_response = post_json(
            self.client_, goods_receipt_post_url(self.store.id, receipt_id), {"expected_version": 1}, self.token
        )
        self.assertEqual(post_response.status_code, 400)

    def test_future_arrival_time_rejected_at_post(self):
        po = self._issued_po(quantity=Decimal("100"))
        future = timezone.now() + timedelta(days=1)
        response = self._create_receipt(po, quantity=Decimal("10"), arrived_at=future)
        receipt_id = response.json()["id"]
        post_response = post_json(
            self.client_, goods_receipt_post_url(self.store.id, receipt_id), {"expected_version": 1}, self.token
        )
        self.assertEqual(post_response.status_code, 400)

    def test_repeat_post_idempotent_no_double_count(self):
        po = self._issued_po(quantity=Decimal("100"))
        response = self._create_receipt(po, quantity=Decimal("60"))
        receipt_id = response.json()["id"]
        first = post_json(
            self.client_, goods_receipt_post_url(self.store.id, receipt_id), {"expected_version": 1}, self.token
        )
        new_version = first.json()["version"]
        AuditLog.objects.filter(target_type="goods_receipt", action="goods_receipt.posted").delete()
        second = post_json(
            self.client_, goods_receipt_post_url(self.store.id, receipt_id), {"expected_version": new_version},
            self.token,
        )
        self.assertEqual(second.status_code, 200)
        self.assertEqual(
            AuditLog.objects.filter(target_type="goods_receipt", action="goods_receipt.posted").count(), 0
        )
        progress = delivery_progress_for_purchase_order(po)
        self.assertEqual(progress[0]["received_quantity"], Decimal("60"))  # not 120

    def test_stale_version_409(self):
        po = self._issued_po()
        response = self._create_receipt(po, quantity=Decimal("10"))
        receipt_id = response.json()["id"]
        post_response = post_json(
            self.client_, goods_receipt_post_url(self.store.id, receipt_id), {"expected_version": 999}, self.token
        )
        self.assertEqual(post_response.status_code, 409)

    def test_posted_cannot_be_cancelled(self):
        po = self._issued_po(quantity=Decimal("100"))
        response = self._create_receipt(po, quantity=Decimal("60"))
        receipt_id = response.json()["id"]
        post_json(
            self.client_, goods_receipt_post_url(self.store.id, receipt_id), {"expected_version": 1}, self.token
        )
        cancel_response = post_json(
            self.client_, goods_receipt_cancel_url(self.store.id, receipt_id),
            {"expected_version": 2, "cancellation_reason": "too late"}, self.token,
        )
        self.assertEqual(cancel_response.status_code, 400)

    def test_post_requires_permission_403(self):
        po = self._issued_po()
        response = self._create_receipt(po, quantity=Decimal("10"))
        receipt_id = response.json()["id"]
        user = make_user("nopostperm")
        grant_store_permission(self.superuser, user, self.store, "receiving.view")
        grant_company_permission(self.superuser, user, self.company, "purchase_orders.view")
        post_response = post_json(
            self.client_, goods_receipt_post_url(self.store.id, receipt_id), {"expected_version": 1},
            access_token_for(user),
        )
        self.assertEqual(post_response.status_code, 403)

    def test_no_stock_qc_or_accounting_side_effect(self):
        # No stock/QC/accounting model exists anywhere in this codebase -
        # this documents that posting mutates only the one GoodsReceipt
        # and its own lines, nothing else.
        po = self._issued_po(quantity=Decimal("100"))
        response = self._create_receipt(po, quantity=Decimal("60"))
        receipt_id = response.json()["id"]
        post_json(
            self.client_, goods_receipt_post_url(self.store.id, receipt_id), {"expected_version": 1}, self.token
        )
        self.assertEqual(GoodsReceipt.objects.count(), 1)
        po.refresh_from_db()
        self.assertEqual(po.status, "ISSUED")  # unaffected


# ---------------------------------------------------------------------------
# Cancel
# ---------------------------------------------------------------------------


class GoodsReceiptCancelTests(GoodsReceiptTestCase):
    def setUp(self):
        super().setUp()
        self.po = self._issued_po()
        response = self._create_receipt(self.po, quantity=Decimal("10"))
        self.receipt_id = response.json()["id"]

    def test_cancel_success(self):
        response = post_json(
            self.client_, goods_receipt_cancel_url(self.store.id, self.receipt_id),
            {"expected_version": 1, "cancellation_reason": "wrong store"}, self.token,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "CANCELLED")

    def test_cancel_requires_nonblank_reason(self):
        response = post_json(
            self.client_, goods_receipt_cancel_url(self.store.id, self.receipt_id),
            {"expected_version": 1, "cancellation_reason": "   "}, self.token,
        )
        self.assertEqual(response.status_code, 400)

    def test_cancel_idempotent_same_reason(self):
        first = post_json(
            self.client_, goods_receipt_cancel_url(self.store.id, self.receipt_id),
            {"expected_version": 1, "cancellation_reason": "dup"}, self.token,
        )
        new_version = first.json()["version"]
        AuditLog.objects.filter(target_type="goods_receipt", action="goods_receipt.cancelled").delete()
        second = post_json(
            self.client_, goods_receipt_cancel_url(self.store.id, self.receipt_id),
            {"expected_version": new_version, "cancellation_reason": "dup"}, self.token,
        )
        self.assertEqual(second.status_code, 200)
        self.assertEqual(
            AuditLog.objects.filter(target_type="goods_receipt", action="goods_receipt.cancelled").count(), 0
        )

    def test_cancel_different_reason_while_cancelled_409(self):
        first = post_json(
            self.client_, goods_receipt_cancel_url(self.store.id, self.receipt_id),
            {"expected_version": 1, "cancellation_reason": "reason A"}, self.token,
        )
        new_version = first.json()["version"]
        response = post_json(
            self.client_, goods_receipt_cancel_url(self.store.id, self.receipt_id),
            {"expected_version": new_version, "cancellation_reason": "reason B"}, self.token,
        )
        self.assertEqual(response.status_code, 409)

    def test_cancel_stale_version_409(self):
        response = post_json(
            self.client_, goods_receipt_cancel_url(self.store.id, self.receipt_id),
            {"expected_version": 999, "cancellation_reason": "x"}, self.token,
        )
        self.assertEqual(response.status_code, 409)

    def test_cancel_requires_permission_403(self):
        user = make_user("nocancelperm")
        grant_store_permission(self.superuser, user, self.store, "receiving.view")
        grant_company_permission(self.superuser, user, self.company, "purchase_orders.view")
        response = post_json(
            self.client_, goods_receipt_cancel_url(self.store.id, self.receipt_id),
            {"expected_version": 1, "cancellation_reason": "x"}, access_token_for(user),
        )
        self.assertEqual(response.status_code, 403)


# ---------------------------------------------------------------------------
# Eligible purchase order lookup
# ---------------------------------------------------------------------------


class EligiblePurchaseOrdersTests(GoodsReceiptTestCase):
    def test_lookup_returns_issued_po_with_progress(self):
        po = self._issued_po(quantity=Decimal("100"))
        response = get_json(self.client_, eligible_purchase_orders_url(self.store.id), self.token)
        self.assertEqual(response.status_code, 200)
        ids = [row["id"] for row in response.json()["results"]]
        self.assertIn(po.id, ids)
        matched = next(row for row in response.json()["results"] if row["id"] == po.id)
        self.assertEqual(matched["delivery_progress"][0]["delivery_status"], "NOT_RECEIVED")
        self.assertNotIn("currency_code", matched)
        self.assertNotIn("subtotal", matched)

    def test_lookup_excludes_inaccessible_company(self):
        self._issued_po(company=self.other_company)
        response = get_json(self.client_, eligible_purchase_orders_url(self.store.id), self.token)
        for row in response.json()["results"]:
            self.assertNotEqual(row["company_id"], self.other_company.id)

    def test_lookup_requires_store_permission(self):
        user = make_user("nolookupperm")
        grant_company_permission(self.superuser, user, self.company, "purchase_orders.view")
        response = get_json(self.client_, eligible_purchase_orders_url(self.store.id), access_token_for(user))
        self.assertEqual(response.status_code, 404)


# ---------------------------------------------------------------------------
# Audit
# ---------------------------------------------------------------------------


class GoodsReceiptAuditTests(GoodsReceiptTestCase):
    def test_create_audit_has_company_and_store_context(self):
        po = self._issued_po()
        response = self._create_receipt(po, quantity=Decimal("10"))
        receipt_id = response.json()["id"]
        entry = AuditLog.objects.filter(
            target_type="goods_receipt", target_id=receipt_id, action="goods_receipt.created"
        ).get()
        self.assertEqual(entry.company_id, self.company.id)
        self.assertEqual(entry.store_id, self.store.id)

    def test_create_audit_rollback_on_failure(self):
        po = self._issued_po()
        with patch("apps.receiving.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                self._create_receipt(po, quantity=Decimal("10"))
        self.assertEqual(GoodsReceipt.objects.count(), 0)

    def test_update_audit_rollback_on_failure(self):
        po = self._issued_po()
        response = self._create_receipt(po, quantity=Decimal("10"))
        receipt_id = response.json()["id"]
        with patch("apps.receiving.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                patch_json(
                    self.client_, goods_receipt_url(self.store.id, receipt_id),
                    {"expected_version": 1, "notes": "changed"}, self.token,
                )
        receipt = GoodsReceipt.objects.get(pk=receipt_id)
        self.assertEqual(receipt.notes, "")
        self.assertEqual(receipt.version, 1)

    def test_post_audit_rollback_on_failure_leaves_totals_unposted(self):
        po = self._issued_po(quantity=Decimal("100"))
        response = self._create_receipt(po, quantity=Decimal("60"))
        receipt_id = response.json()["id"]
        with patch("apps.receiving.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                post_json(
                    self.client_, goods_receipt_post_url(self.store.id, receipt_id), {"expected_version": 1},
                    self.token,
                )
        receipt = GoodsReceipt.objects.get(pk=receipt_id)
        self.assertEqual(receipt.status, "DRAFT")
        self.assertEqual(receipt.version, 1)
        progress = delivery_progress_for_purchase_order(po)
        self.assertEqual(progress[0]["received_quantity"], Decimal("0"))

    def test_cancel_audit_rollback_on_failure(self):
        po = self._issued_po()
        response = self._create_receipt(po, quantity=Decimal("10"))
        receipt_id = response.json()["id"]
        with patch("apps.receiving.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                post_json(
                    self.client_, goods_receipt_cancel_url(self.store.id, receipt_id),
                    {"expected_version": 1, "cancellation_reason": "x"}, self.token,
                )
        receipt = GoodsReceipt.objects.get(pk=receipt_id)
        self.assertEqual(receipt.status, "DRAFT")
        self.assertEqual(receipt.version, 1)


# ---------------------------------------------------------------------------
# Concurrency
# ---------------------------------------------------------------------------


class ConcurrentPostingTests(TransactionTestCase):
    serialized_rollback = True

    def test_concurrent_posting_prevents_over_receipt(self):
        """Two receipts, each for 60 units against a 100-unit ordered
        line, posted concurrently - at most one may succeed (60), the
        other must be rejected as an over-receipt (60+60=120 > 100),
        never both, and never a torn/partial result.
        """
        from django.db import connection

        superuser = make_superuser("concurrentreceivingadmin")
        company = make_company("CONCURRECV")
        store = make_store("CONCURWH")
        requester = make_user("concurrentreceivingrequester")
        grant_company_permission(
            superuser, requester, company,
            "purchase_requests.view", "purchase_requests.create", "purchase_requests.submit",
            "purchase_orders.view", "purchase_orders.create",
        )
        unit = make_unit("KGRECV")
        material = make_material("MATRECV", base_unit=unit)
        supplier = make_supplier("SUPRECV")

        pr = create_purchase_request(
            actor=requester, company=company, lines=[{"material_id": material.id, "quantity": Decimal("100")}]
        )
        pr = submit_purchase_request(actor=requester, purchase_request_id=pr.id, expected_version=1)
        for i in range(3):
            approver = make_user(f"concurrentreceivingapprover{i}")
            grant_company_permission(
                superuser, approver, company, "purchase_requests.view", "purchase_requests.approve"
            )
            pr = approve_purchase_request(
                actor=approver, purchase_request_id=pr.id, expected_version=pr.version,
                expected_round=pr.current_round, expected_step=pr.current_step,
            )
        po = create_purchase_order(
            actor=requester, company=company, source_purchase_request_id=pr.id, supplier_id=supplier.id,
            currency_code="INR", expected_delivery_date=timezone.now().date() + timedelta(days=14),
        )
        line = po.lines.get()
        po = update_purchase_order(
            actor=requester, purchase_order_id=po.id, expected_version=po.version,
            data={"lines": [{"id": line.id, "unit_price": Decimal("5")}]},
        )
        po = issue_purchase_order(actor=requester, purchase_order_id=po.id, expected_version=po.version)
        po_line_id = po.issue_snapshot.lines.get().id

        receiver = make_user("concurrentreceiver")
        grant_store_permission(superuser, receiver, store, *RECEIVING_ALL_PERMS)
        grant_company_permission(superuser, receiver, company, "purchase_orders.view")

        arrived_at = timezone.now() - timedelta(hours=1)
        receipt_a = create_goods_receipt(
            actor=receiver, store=store, source_purchase_order_id=po.id, arrived_at=arrived_at,
            lines=[{"source_po_line_id": po_line_id, "received_quantity": Decimal("60")}],
        )
        receipt_b = create_goods_receipt(
            actor=receiver, store=store, source_purchase_order_id=po.id, arrived_at=arrived_at,
            lines=[{"source_po_line_id": po_line_id, "received_quantity": Decimal("60")}],
        )

        results = []
        barrier = threading.Barrier(2)

        def worker(receipt_id):
            try:
                barrier.wait(timeout=5)
                post_goods_receipt(actor=receiver, goods_receipt_id=receipt_id, expected_version=1)
                results.append("ok")
            except DjangoValidationError:
                results.append("rejected")
            except Conflict:
                results.append("conflict")
            finally:
                connection.close()

        threads = [
            threading.Thread(target=worker, args=(receipt_a.id,)),
            threading.Thread(target=worker, args=(receipt_b.id,)),
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=10)

        self.assertEqual(results.count("ok"), 1, results)
        self.assertEqual(results.count("rejected"), 1, results)

        total_posted = GoodsReceiptLine.objects.filter(
            source_po_line_id=po_line_id, goods_receipt__status="POSTED"
        ).count()
        self.assertEqual(total_posted, 1)
