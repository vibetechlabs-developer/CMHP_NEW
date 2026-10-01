import itertools
import json
import threading
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import connection
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
from apps.receiving.services import create_goods_receipt, delivery_progress_for_purchase_order, post_goods_receipt
from apps.stock_movements.admin import StockMovementAdmin
from apps.stock_movements.models import StockMovement
from apps.stock_movements.services import compute_stock_balances, create_receipt_in_movements
from apps.stores.models import SharedStore
from apps.stores.services import assign_store_membership, assign_store_membership_role
from apps.suppliers.models import Supplier
from apps.users.services import assign_company_membership, assign_membership_role

User = get_user_model()
PASSWORD = "a-strong-pass-1"
_unique_suffix = itertools.count()

STOCK_MOVEMENTS_ALL_PERMS = ("stock.view",)
RECEIVING_ALL_PERMS = ("receiving.view", "receiving.create", "receiving.edit", "receiving.post", "receiving.cancel")


def _unique(prefix):
    return f"{prefix}{next(_unique_suffix)}"


def stock_movements_url(store_id):
    return f"/api/v1/stores/{store_id}/stock-movements/"


def stock_balances_url(store_id):
    return f"/api/v1/stores/{store_id}/stock-balances/"


def goods_receipts_url(store_id):
    return f"/api/v1/stores/{store_id}/goods-receipts/"


def goods_receipt_post_url(store_id, receipt_id):
    return f"/api/v1/stores/{store_id}/goods-receipts/{receipt_id}/post/"


def make_user(username, password=PASSWORD, **kwargs):
    return User.objects.create_user(username=username, email=f"{username}@example.com", password=password, **kwargs)


def make_superuser(username, password=PASSWORD):
    return User.objects.create_superuser(username=username, email=f"{username}@example.com", password=password)


def make_company(code, **kwargs):
    return Company.objects.create(code=code, legal_name=f"{code} Legal Name Pvt Ltd", **kwargs)


def make_store(code, **kwargs):
    return SharedStore.objects.create(code=code, name=f"{code} Store", **kwargs)


def make_unit(code, dimension="MASS", **kwargs):
    return UnitOfMeasure.objects.create(code=code, name=code, dimension=dimension, **kwargs)


def make_category(code, **kwargs):
    return MaterialCategory.objects.create(code=code, name=code, **kwargs)


def make_material(code, base_unit, kind="RAW_MATERIAL", category=None, name=None, **kwargs):
    return Material.objects.create(code=code, name=name or code, kind=kind, base_unit=base_unit, category=category, **kwargs)


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


def grant_company_permission(actor, user, company, *permission_codes):
    membership, _ = assign_company_membership(actor=actor, user=user, company=company)
    role = create_company_role(actor=actor, company=company, code=_unique(f"CROLE{user.id}{company.id}"), name="Role")
    replace_role_permissions(actor=actor, role=role, permission_codes=list(permission_codes))
    assign_membership_role(actor=actor, membership=membership, role=role)
    return membership, role


def grant_store_permission(actor, user, store, *permission_codes):
    membership, _ = assign_store_membership(actor=actor, user=user, store=store)
    role = create_store_role(actor=actor, store=store, code=_unique(f"SROLE{user.id}{store.id}"), name="Role")
    replace_store_role_permissions(actor=actor, role=role, permission_codes=list(permission_codes))
    assign_store_membership_role(actor=actor, membership=membership, role=role)
    return membership, role


class StockMovementTestCase(TestCase):
    def setUp(self):
        self.superuser = make_superuser("stockadmin")
        self.company = make_company("STKA")
        self.other_company = make_company("STKB")
        self.store = make_store("STKWH")
        self.client_ = Client()
        self.unit = make_unit("STKKG")
        self.category = make_category("STKCAT")
        self.material = make_material("STKMAT1", base_unit=self.unit, category=self.category)
        self.supplier = make_supplier("STKSUP1")
        self.user = make_user("stockstaff")
        grant_company_permission(self.superuser, self.user, self.company, "purchase_orders.view")
        grant_store_permission(self.superuser, self.user, self.store, *STOCK_MOVEMENTS_ALL_PERMS)
        self.receiver = make_user("stockreceiver")
        grant_company_permission(self.superuser, self.receiver, self.company, "purchase_orders.view")
        grant_store_permission(self.superuser, self.receiver, self.store, *STOCK_MOVEMENTS_ALL_PERMS, *RECEIVING_ALL_PERMS)
        self.token = access_token_for(self.user)
        self.receiver_token = access_token_for(self.receiver)

    def _po_admin(self, name, company=None):
        admin = make_user(name)
        grant_company_permission(self.superuser, admin, company or self.company, "purchase_requests.view", "purchase_requests.approve")
        return admin

    def _issued_po(self, company=None, quantity=Decimal("100"), material=None, unit_price=Decimal("10.0000")):
        company = company or self.company
        material = material or self.material
        requester = make_user(_unique(f"req_{company.code}_"))
        grant_company_permission(
            self.superuser, requester, company,
            "purchase_requests.view", "purchase_requests.create", "purchase_requests.submit",
            "purchase_orders.view", "purchase_orders.create",
        )
        pr = create_purchase_request(actor=requester, company=company, lines=[{"material_id": material.id, "quantity": quantity}])
        pr = submit_purchase_request(actor=requester, purchase_request_id=pr.id, expected_version=1)
        for i in range(3):
            approver = self._po_admin(_unique(f"appr_{company.code}_"), company=company)
            pr = approve_purchase_request(
                actor=approver, purchase_request_id=pr.id, expected_version=pr.version,
                expected_round=pr.current_round, expected_step=pr.current_step,
            )
        po = create_purchase_order(
            actor=requester, company=company, source_purchase_request_id=pr.id, supplier_id=self.supplier.id,
            currency_code="INR", expected_delivery_date=timezone.now().date() + timedelta(days=14),
        )
        line = po.lines.get()
        po = update_purchase_order(actor=requester, purchase_order_id=po.id, expected_version=po.version, data={"lines": [{"id": line.id, "unit_price": unit_price}]})
        po = issue_purchase_order(actor=requester, purchase_order_id=po.id, expected_version=po.version)
        return po

    def _create_and_post_receipt(self, po, quantity=Decimal("60"), token=None, actor=None):
        arrived_at = timezone.now() - timedelta(hours=1)
        po_line_id = po.issue_snapshot.lines.get().id
        if actor is not None:
            receipt = create_goods_receipt(
                actor=actor, store=self.store, source_purchase_order_id=po.id, arrived_at=arrived_at,
                lines=[{"source_po_line_id": po_line_id, "received_quantity": quantity}],
            )
            receipt = post_goods_receipt(actor=actor, goods_receipt_id=receipt.id, expected_version=1)
            return receipt
        response = post_json(
            self.client_, goods_receipts_url(self.store.id),
            {"source_purchase_order_id": po.id, "arrived_at": arrived_at.isoformat(), "lines": [{"source_po_line_id": po_line_id, "received_quantity": str(quantity)}]},
            token or self.receiver_token,
        )
        receipt_id = response.json()["id"]
        post_json(self.client_, goods_receipt_post_url(self.store.id, receipt_id), {"expected_version": 1}, token or self.receiver_token)
        return GoodsReceipt.objects.get(pk=receipt_id)


# ---------------------------------------------------------------------------
# Posting integration
# ---------------------------------------------------------------------------


class PostingIntegrationTests(StockMovementTestCase):
    def test_posting_creates_correct_movement(self):
        po = self._issued_po(quantity=Decimal("100"))
        receipt = self._create_and_post_receipt(po, quantity=Decimal("60"), actor=self.receiver)
        line = receipt.lines.get()
        movement = StockMovement.objects.get(source_receipt_line=line)
        self.assertEqual(movement.movement_type, StockMovement.MovementType.RECEIPT_IN)
        self.assertEqual(movement.source_goods_receipt_id, receipt.id)
        self.assertEqual(movement.store_id, self.store.id)
        self.assertEqual(movement.source_company_id, self.company.id)
        self.assertEqual(movement.material_id, self.material.id)
        self.assertEqual(movement.quantity, Decimal("60.000"))
        self.assertEqual(movement.unit_id, self.unit.id)
        self.assertEqual(movement.material_code_snapshot, line.material_code_snapshot)
        self.assertEqual(movement.lot_reference, line.lot_reference)
        self.assertEqual(movement.posted_by_id, self.receiver.id)
        self.assertEqual(movement.posted_at, receipt.posted_at)

    def test_draft_receipt_creates_no_movement(self):
        po = self._issued_po(quantity=Decimal("100"))
        arrived_at = timezone.now() - timedelta(hours=1)
        po_line_id = po.issue_snapshot.lines.get().id
        receipt = create_goods_receipt(
            actor=self.receiver, store=self.store, source_purchase_order_id=po.id, arrived_at=arrived_at,
            lines=[{"source_po_line_id": po_line_id, "received_quantity": Decimal("60")}],
        )
        self.assertEqual(StockMovement.objects.filter(source_goods_receipt=receipt).count(), 0)

    def test_partial_receipt_preserves_po_delivery_calculations(self):
        po = self._issued_po(quantity=Decimal("100"))
        receipt = self._create_and_post_receipt(po, quantity=Decimal("60"), actor=self.receiver)
        progress = delivery_progress_for_purchase_order(po)
        self.assertEqual(progress[0]["received_quantity"], Decimal("60"))
        self.assertEqual(progress[0]["remaining_quantity"], Decimal("40"))
        self.assertEqual(progress[0]["delivery_status"], "PARTIALLY_RECEIVED")
        # The movement records exactly the posted amount, never the full order.
        movement = StockMovement.objects.get(source_goods_receipt=receipt)
        self.assertEqual(movement.quantity, Decimal("60.000"))

    def test_repeat_post_creates_no_duplicate_movement(self):
        po = self._issued_po(quantity=Decimal("100"))
        receipt = self._create_and_post_receipt(po, quantity=Decimal("60"), actor=self.receiver)
        # Idempotent retry at the now-current version.
        post_goods_receipt(actor=self.receiver, goods_receipt_id=receipt.id, expected_version=receipt.version)
        self.assertEqual(StockMovement.objects.filter(source_goods_receipt=receipt).count(), 1)

    def test_previously_posted_receipt_is_never_backfilled_by_a_repeat_post(self):
        """Simulates a receipt POSTED before this feature existed: status
        set directly, bypassing post_goods_receipt entirely, so no
        movement is ever created for it - then confirms a repeat POST
        call (the idempotent no-op path) still creates nothing.
        """
        po = self._issued_po(quantity=Decimal("100"))
        arrived_at = timezone.now() - timedelta(hours=1)
        po_line_id = po.issue_snapshot.lines.get().id
        receipt = create_goods_receipt(
            actor=self.receiver, store=self.store, source_purchase_order_id=po.id, arrived_at=arrived_at,
            lines=[{"source_po_line_id": po_line_id, "received_quantity": Decimal("60")}],
        )
        receipt.status = GoodsReceipt.Status.POSTED
        receipt.posted_by = self.receiver
        receipt.posted_at = timezone.now()
        receipt.save(update_fields=["status", "posted_by", "posted_at"])
        self.assertEqual(StockMovement.objects.filter(source_goods_receipt=receipt).count(), 0)

        post_goods_receipt(actor=self.receiver, goods_receipt_id=receipt.id, expected_version=receipt.version)
        self.assertEqual(StockMovement.objects.filter(source_goods_receipt=receipt).count(), 0)

    def test_movement_and_audit_failure_rolls_back_receipt_posting(self):
        po = self._issued_po(quantity=Decimal("100"))
        arrived_at = timezone.now() - timedelta(hours=1)
        po_line_id = po.issue_snapshot.lines.get().id
        receipt = create_goods_receipt(
            actor=self.receiver, store=self.store, source_purchase_order_id=po.id, arrived_at=arrived_at,
            lines=[{"source_po_line_id": po_line_id, "received_quantity": Decimal("60")}],
        )
        with patch("apps.receiving.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                post_goods_receipt(actor=self.receiver, goods_receipt_id=receipt.id, expected_version=1)
        receipt.refresh_from_db()
        self.assertEqual(receipt.status, GoodsReceipt.Status.DRAFT)
        self.assertEqual(receipt.version, 1)
        self.assertEqual(StockMovement.objects.filter(source_goods_receipt=receipt).count(), 0)

    def test_no_mutation_of_purchase_order_quantity_semantics(self):
        po = self._issued_po(quantity=Decimal("100"))
        line_before = po.lines.get()
        before = (line_before.quantity, line_before.unit_price)
        self._create_and_post_receipt(po, quantity=Decimal("60"), actor=self.receiver)
        line_after = po.lines.get()
        after = (line_after.quantity, line_after.unit_price)
        self.assertEqual(before, after)


class ConcurrentPostingMovementTests(TransactionTestCase):
    serialized_rollback = True

    def test_concurrent_posting_cannot_duplicate_movements(self):
        """Two DIFFERENT receipts (60 each against a 100-unit line),
        posted concurrently - at most one may pass the over-receipt
        check; regardless of outcome, at most one StockMovement per
        GoodsReceiptLine can ever exist (enforced at the database level
        by the OneToOneField), and the total movement count never
        exceeds the number of receipts that actually posted.
        """
        superuser = make_superuser("stkconadmin")
        company = make_company("STKCON")
        store = make_store("STKCONWH")
        unit = make_unit("STKCONKG")
        material = make_material("STKCONMAT", base_unit=unit)
        supplier = make_supplier("STKCONSUP")
        requester = make_user("stkconrequester")
        grant_company_permission(
            superuser, requester, company,
            "purchase_requests.view", "purchase_requests.create", "purchase_requests.submit",
            "purchase_orders.view", "purchase_orders.create",
        )
        pr = create_purchase_request(actor=requester, company=company, lines=[{"material_id": material.id, "quantity": Decimal("100")}])
        pr = submit_purchase_request(actor=requester, purchase_request_id=pr.id, expected_version=1)
        for i in range(3):
            approver = make_user(f"stkconapprover{i}")
            grant_company_permission(superuser, approver, company, "purchase_requests.view", "purchase_requests.approve")
            pr = approve_purchase_request(
                actor=approver, purchase_request_id=pr.id, expected_version=pr.version,
                expected_round=pr.current_round, expected_step=pr.current_step,
            )
        po = create_purchase_order(
            actor=requester, company=company, source_purchase_request_id=pr.id, supplier_id=supplier.id,
            currency_code="INR", expected_delivery_date=timezone.now().date() + timedelta(days=14),
        )
        line = po.lines.get()
        po = update_purchase_order(actor=requester, purchase_order_id=po.id, expected_version=po.version, data={"lines": [{"id": line.id, "unit_price": Decimal("5")}]})
        po = issue_purchase_order(actor=requester, purchase_order_id=po.id, expected_version=po.version)
        po_line_id = po.issue_snapshot.lines.get().id

        receiver = make_user("stkconreceiver")
        grant_store_permission(superuser, receiver, store, *RECEIVING_ALL_PERMS, *STOCK_MOVEMENTS_ALL_PERMS)
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

        threads = [threading.Thread(target=worker, args=(receipt_a.id,)), threading.Thread(target=worker, args=(receipt_b.id,))]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=10)

        self.assertEqual(results.count("ok"), 1, results)
        self.assertEqual(results.count("rejected"), 1, results)
        # Exactly one movement exists in total - for the receipt that won.
        self.assertEqual(StockMovement.objects.filter(source_receipt_line__source_po_line_id=po_line_id).count(), 1)


# ---------------------------------------------------------------------------
# Balance aggregation correctness
# ---------------------------------------------------------------------------


class BalanceAggregationTests(StockMovementTestCase):
    def test_units_are_not_incorrectly_combined(self):
        """Two movements for the SAME material but different units (a
        hypothetical edge case the model itself does not forbid, since
        unit consistency is enforced upstream in the purchasing chain,
        not by StockMovement itself - see its own docstring) must appear
        as two SEPARATE balance rows, never summed into one number.
        """
        po = self._issued_po(quantity=Decimal("100"))
        receipt = self._create_and_post_receipt(po, quantity=Decimal("60"), actor=self.receiver)
        line = receipt.lines.get()

        other_unit = make_unit("STKALTUNIT", dimension="MASS")
        other_receipt = create_goods_receipt(
            actor=self.receiver, store=self.store, source_purchase_order_id=po.id, arrived_at=timezone.now() - timedelta(hours=1),
            lines=[{"source_po_line_id": po.issue_snapshot.lines.get().id, "received_quantity": Decimal("5")}],
        )
        other_line = other_receipt.lines.get()
        # Directly construct a second movement with a deliberately
        # different unit, bypassing post_goods_receipt, purely to test
        # the aggregation query's own grouping in isolation.
        StockMovement.objects.create(
            movement_type=StockMovement.MovementType.RECEIPT_IN,
            source_goods_receipt=other_receipt, source_receipt_line=other_line, store=self.store,
            source_company=self.company, material=self.material, unit=other_unit, quantity=Decimal("5.000"),
            material_code_snapshot=self.material.code, material_name_snapshot=self.material.name,
            unit_code_snapshot=other_unit.code, unit_name_snapshot=other_unit.name,
            posted_by=self.receiver, posted_at=timezone.now(),
        )

        rows = list(compute_stock_balances(store=self.store, accessible_companies=[self.company]))
        self.assertEqual(len(rows), 2)
        by_unit = {row["unit_id"]: row["recorded_receipt_quantity"] for row in rows}
        self.assertEqual(by_unit[self.unit.id], Decimal("60.000"))
        self.assertEqual(by_unit[other_unit.id], Decimal("5.000"))

    def test_balances_grouped_by_company_never_merged(self):
        po_a = self._issued_po(company=self.company, quantity=Decimal("100"))
        self._create_and_post_receipt(po_a, quantity=Decimal("60"), actor=self.receiver)

        receiver_b = make_user("stockreceiverb")
        grant_company_permission(self.superuser, receiver_b, self.other_company, "purchase_orders.view", "purchase_requests.view", "purchase_requests.create", "purchase_requests.submit", "purchase_orders.create")
        grant_store_permission(self.superuser, receiver_b, self.store, *RECEIVING_ALL_PERMS, *STOCK_MOVEMENTS_ALL_PERMS)
        po_b = self._issued_po(company=self.other_company, quantity=Decimal("50"))
        self._create_and_post_receipt(po_b, quantity=Decimal("20"), actor=receiver_b)

        rows = list(compute_stock_balances(store=self.store, accessible_companies=[self.company, self.other_company]))
        by_company = {row["source_company_id"]: row["recorded_receipt_quantity"] for row in rows}
        self.assertEqual(by_company[self.company.id], Decimal("60.000"))
        self.assertEqual(by_company[self.other_company.id], Decimal("20.000"))


# ---------------------------------------------------------------------------
# Access, aggregate isolation, read-only surface
# ---------------------------------------------------------------------------


class AccessTests(StockMovementTestCase):
    def test_authentication_required(self):
        self.assertEqual(self.client_.get(stock_movements_url(self.store.id)).status_code, 401)
        self.assertEqual(self.client_.get(stock_balances_url(self.store.id)).status_code, 401)

    def test_no_store_membership_is_404_no_superuser_bypass(self):
        outsider = make_user("stockoutsider")
        self.assertEqual(get_json(self.client_, stock_movements_url(self.store.id), access_token_for(outsider)).status_code, 404)
        self.assertEqual(get_json(self.client_, stock_movements_url(self.store.id), access_token_for(self.superuser)).status_code, 404)

    def test_store_permission_required_named(self):
        viewer = make_user("stocknoview")
        grant_store_permission(self.superuser, viewer, self.store)  # membership, no perms
        res = get_json(self.client_, stock_movements_url(self.store.id), access_token_for(viewer))
        self.assertEqual(res.status_code, 403)
        self.assertIn("stock.view", res.json()["detail"])

    def test_missing_company_access_excludes_but_does_not_403(self):
        """Store access alone reveals nothing about a company the caller
        lacks purchase_orders.view in - the list is simply scoped empty,
        not a 403 or 404 at the list level (mirrors goods-receipts)."""
        po = self._issued_po(quantity=Decimal("100"))
        self._create_and_post_receipt(po, quantity=Decimal("60"), actor=self.receiver)
        no_company_access = make_user("stocknocompany")
        grant_store_permission(self.superuser, no_company_access, self.store, *STOCK_MOVEMENTS_ALL_PERMS)
        res = get_json(self.client_, stock_movements_url(self.store.id), access_token_for(no_company_access))
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["count"], 0)

    def test_aggregate_totals_do_not_leak_inaccessible_company_quantities(self):
        po_a = self._issued_po(company=self.company, quantity=Decimal("100"))
        self._create_and_post_receipt(po_a, quantity=Decimal("60"), actor=self.receiver)

        receiver_b = make_user("stockreceiverb2")
        grant_company_permission(self.superuser, receiver_b, self.other_company, "purchase_orders.view", "purchase_requests.view", "purchase_requests.create", "purchase_requests.submit", "purchase_orders.create")
        grant_store_permission(self.superuser, receiver_b, self.store, *RECEIVING_ALL_PERMS, *STOCK_MOVEMENTS_ALL_PERMS)
        po_b = self._issued_po(company=self.other_company, quantity=Decimal("50"))
        self._create_and_post_receipt(po_b, quantity=Decimal("20"), actor=receiver_b)

        # self.user only has purchase_orders.view in self.company, not other_company.
        res = get_json(self.client_, stock_balances_url(self.store.id), self.token)
        self.assertEqual(res.status_code, 200)
        rows = res.json()["results"]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["source_company_id"], self.company.id)
        self.assertEqual(Decimal(rows[0]["recorded_receipt_quantity"]), Decimal("60.000"))

    def test_movement_list_scoped_the_same_way(self):
        po_a = self._issued_po(company=self.company, quantity=Decimal("100"))
        self._create_and_post_receipt(po_a, quantity=Decimal("60"), actor=self.receiver)
        receiver_b = make_user("stockreceiverb3")
        grant_company_permission(self.superuser, receiver_b, self.other_company, "purchase_orders.view", "purchase_requests.view", "purchase_requests.create", "purchase_requests.submit", "purchase_orders.create")
        grant_store_permission(self.superuser, receiver_b, self.store, *RECEIVING_ALL_PERMS, *STOCK_MOVEMENTS_ALL_PERMS)
        po_b = self._issued_po(company=self.other_company, quantity=Decimal("50"))
        self._create_and_post_receipt(po_b, quantity=Decimal("20"), actor=receiver_b)

        res = get_json(self.client_, stock_movements_url(self.store.id), self.token)
        rows = res.json()["results"]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["source_company_id"], self.company.id)

    def test_unknown_query_parameter_rejected(self):
        res = get_json(self.client_, stock_movements_url(self.store.id) + "?bogus=1", self.token)
        self.assertEqual(res.status_code, 400)
        res2 = get_json(self.client_, stock_balances_url(self.store.id) + "?bogus=1", self.token)
        self.assertEqual(res2.status_code, 400)

    def test_malformed_material_filter_rejected(self):
        res = get_json(self.client_, stock_movements_url(self.store.id) + "?material=not-an-int", self.token)
        self.assertEqual(res.status_code, 400)

    def test_material_filter_works(self):
        po = self._issued_po(quantity=Decimal("100"))
        self._create_and_post_receipt(po, quantity=Decimal("60"), actor=self.receiver)
        other_unit = make_unit("STKOTHERKG")
        other_material = make_material("STKMAT2", base_unit=other_unit)
        po2 = self._issued_po(quantity=Decimal("30"), material=other_material)
        self._create_and_post_receipt(po2, quantity=Decimal("10"), actor=self.receiver)

        res = get_json(self.client_, stock_movements_url(self.store.id) + f"?material={self.material.id}", self.token)
        rows = res.json()["results"]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["material_id"], self.material.id)


class ReadOnlySurfaceTests(StockMovementTestCase):
    def test_no_mutation_endpoints(self):
        for url in (stock_movements_url(self.store.id), stock_balances_url(self.store.id)):
            res = self.client_.post(url, data="{}", content_type="application/json", **bearer(self.token))
            self.assertEqual(res.status_code, 405)
            res2 = self.client_.patch(url, data="{}", content_type="application/json", **bearer(self.token))
            self.assertEqual(res2.status_code, 405)
            res3 = self.client_.delete(url, **bearer(self.token))
            self.assertEqual(res3.status_code, 405)

    def test_admin_is_read_only(self):
        admin = StockMovementAdmin(StockMovement, None)
        self.assertFalse(admin.has_add_permission(None))
        self.assertFalse(admin.has_change_permission(None))
        self.assertFalse(admin.has_delete_permission(None))

    def test_no_invented_stock_claims_and_coverage_notice(self):
        po = self._issued_po(quantity=Decimal("100"))
        self._create_and_post_receipt(po, quantity=Decimal("60"), actor=self.receiver)

        for url in (stock_movements_url(self.store.id), stock_balances_url(self.store.id)):
            res = get_json(self.client_, url, self.token)
            body = res.json()
            for forbidden in ("available_stock", "usable_stock", "on_hand"):
                self.assertNotIn(forbidden, json.dumps(body))
            self.assertEqual(body["coverage"]["release_status"], "Not tracked")
            self.assertFalse(body["coverage"]["historical_receipts_backfilled"])
            self.assertFalse(body["coverage"]["opening_stock_included"])
            self.assertFalse(body["coverage"]["issues_returns_release_tracked"])

        movement_res = get_json(self.client_, stock_movements_url(self.store.id), self.token)
        self.assertEqual(movement_res.json()["results"][0]["release_status"], "Not tracked")
        balance_res = get_json(self.client_, stock_balances_url(self.store.id), self.token)
        self.assertEqual(balance_res.json()["results"][0]["release_status"], "Not tracked")

    def test_no_mutation_of_requisitions_or_inspections(self):
        """Posting a receipt (and its resulting StockMovement) touches
        nothing in apps.material_requisitions or apps.quality - there is
        no cross-reference at all in this task."""
        from apps.material_requisitions.models import MaterialRequisition
        from apps.quality.models import IncomingInspection

        before_mr = MaterialRequisition.objects.count()
        before_qc = IncomingInspection.objects.count()
        po = self._issued_po(quantity=Decimal("100"))
        self._create_and_post_receipt(po, quantity=Decimal("60"), actor=self.receiver)
        self.assertEqual(MaterialRequisition.objects.count(), before_mr)
        self.assertEqual(IncomingInspection.objects.count(), before_qc)


class ModelImmutabilityTests(StockMovementTestCase):
    def test_edit_raises(self):
        po = self._issued_po(quantity=Decimal("100"))
        receipt = self._create_and_post_receipt(po, quantity=Decimal("60"), actor=self.receiver)
        movement = StockMovement.objects.get(source_goods_receipt=receipt)
        movement.quantity = Decimal("999")
        with self.assertRaises(DjangoValidationError):
            movement.save()

    def test_delete_raises(self):
        po = self._issued_po(quantity=Decimal("100"))
        receipt = self._create_and_post_receipt(po, quantity=Decimal("60"), actor=self.receiver)
        movement = StockMovement.objects.get(source_goods_receipt=receipt)
        with self.assertRaises(DjangoValidationError):
            movement.delete()

    def test_duplicate_movement_for_same_line_rejected_at_db_level(self):
        po = self._issued_po(quantity=Decimal("100"))
        receipt = self._create_and_post_receipt(po, quantity=Decimal("60"), actor=self.receiver)
        line = receipt.lines.get()
        with self.assertRaises(Exception):
            create_receipt_in_movements(goods_receipt=receipt, lines=[line], actor=self.receiver, posted_at=timezone.now())


# ---------------------------------------------------------------------------
# Task 13D — one focused, end-to-end integration test over real HTTP calls,
# for an ordinary permission-assigned user (never the superuser), on the
# isolated test database Django's own test runner creates automatically.
# ---------------------------------------------------------------------------


class EndToEndReceiptLedgerIntegrationTest(StockMovementTestCase):
    def test_full_receipt_to_ledger_flow_via_real_http_calls(self):
        po = self._issued_po(quantity=Decimal("100"))

        # 1. Create a valid goods receipt using the existing service (an
        # ordinary permission-assigned user, self.receiver - never the
        # superuser). Draft only, not yet posted.
        arrived_at = timezone.now() - timedelta(hours=1)
        po_line_id = po.issue_snapshot.lines.get().id
        receipt = create_goods_receipt(
            actor=self.receiver, store=self.store, source_purchase_order_id=po.id, arrived_at=arrived_at,
            lines=[{"source_po_line_id": po_line_id, "received_quantity": Decimal("60")}],
        )

        # 2. Confirm the DRAFT has no stock movement - real API call.
        draft_movements = get_json(self.client_, stock_movements_url(self.store.id), self.receiver_token)
        self.assertEqual(draft_movements.status_code, 200)
        self.assertEqual(draft_movements.json()["count"], 0)

        # 3. Post it - real API call.
        post_res = post_json(
            self.client_, goods_receipt_post_url(self.store.id, receipt.id), {"expected_version": 1}, self.receiver_token
        )
        self.assertEqual(post_res.status_code, 200)
        self.assertEqual(post_res.json()["status"], "POSTED")
        posted_version = post_res.json()["version"]

        # 4. Retrieve stock movements and stock balances - real API calls.
        movements_res = get_json(self.client_, stock_movements_url(self.store.id), self.receiver_token)
        self.assertEqual(movements_res.status_code, 200)
        movements_body = movements_res.json()
        self.assertEqual(movements_body["count"], 1)
        movement = movements_body["results"][0]

        balances_res = get_json(self.client_, stock_balances_url(self.store.id), self.receiver_token)
        self.assertEqual(balances_res.status_code, 200)
        balances_body = balances_res.json()
        self.assertEqual(balances_body["count"], 1)
        balance = balances_body["results"][0]

        # 5. Verify quantity, material, unit and source-company context on both.
        self.assertEqual(movement["quantity"], "60.000")
        self.assertEqual(movement["material_id"], self.material.id)
        self.assertEqual(movement["unit_code_snapshot"], self.unit.code)
        self.assertEqual(movement["source_company_id"], self.company.id)
        self.assertEqual(movement["release_status"], "Not tracked")

        self.assertEqual(balance["recorded_receipt_quantity"], "60.000")
        self.assertEqual(balance["material_id"], self.material.id)
        self.assertEqual(balance["unit_id"], self.unit.id)
        self.assertEqual(balance["source_company_id"], self.company.id)

        # 6. Repeat the post using the documented current-version contract
        # (§7.3 of the receiving handoff: an idempotent no-op at the CURRENT
        # version of an already-POSTED receipt) - real API call.
        repeat_res = post_json(
            self.client_, goods_receipt_post_url(self.store.id, receipt.id), {"expected_version": posted_version},
            self.receiver_token,
        )
        self.assertEqual(repeat_res.status_code, 200)
        self.assertEqual(repeat_res.json()["status"], "POSTED")

        # 7. No duplicate movement, no quantity increase.
        movements_after_repeat = get_json(self.client_, stock_movements_url(self.store.id), self.receiver_token)
        self.assertEqual(movements_after_repeat.json()["count"], 1)
        balances_after_repeat = get_json(self.client_, stock_balances_url(self.store.id), self.receiver_token)
        self.assertEqual(balances_after_repeat.json()["results"][0]["recorded_receipt_quantity"], "60.000")

        # 8. Another, INACCESSIBLE company posts its own receipt at the same
        # shared store - its quantities must be absent from both this
        # caller's list AND its aggregate, never silently blended in.
        other_receiver = make_user("stockotherreceiver")
        grant_company_permission(
            self.superuser, other_receiver, self.other_company,
            "purchase_orders.view", "purchase_requests.view", "purchase_requests.create",
            "purchase_requests.submit", "purchase_orders.create",
        )
        grant_store_permission(self.superuser, other_receiver, self.store, *RECEIVING_ALL_PERMS, *STOCK_MOVEMENTS_ALL_PERMS)
        po_other = self._issued_po(company=self.other_company, quantity=Decimal("50"))
        self._create_and_post_receipt(po_other, quantity=Decimal("20"), actor=other_receiver)

        # self.receiver was never granted any permission in self.other_company.
        movements_final = get_json(self.client_, stock_movements_url(self.store.id), self.receiver_token)
        self.assertEqual(movements_final.json()["count"], 1)
        for row in movements_final.json()["results"]:
            self.assertEqual(row["source_company_id"], self.company.id)

        balances_final = get_json(self.client_, stock_balances_url(self.store.id), self.receiver_token)
        self.assertEqual(balances_final.json()["count"], 1)
        self.assertEqual(balances_final.json()["results"][0]["source_company_id"], self.company.id)
        self.assertEqual(balances_final.json()["results"][0]["recorded_receipt_quantity"], "60.000")
