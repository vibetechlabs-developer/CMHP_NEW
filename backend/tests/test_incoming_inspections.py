import itertools
import json
import threading
from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, connection, transaction
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
from apps.quality.admin import IncomingInspectionAdmin
from apps.quality.models import IncomingInspection, InspectionObservation
from apps.quality.services import (
    cancel_incoming_inspection,
    create_incoming_inspection,
    eligible_receipt_lines_for_inspection,
    submit_incoming_inspection,
    update_incoming_inspection,
)
from apps.receiving.models import GoodsReceiptLine
from apps.receiving.services import create_goods_receipt, delivery_progress_for_purchase_order, post_goods_receipt
from apps.stores.models import SharedStore
from apps.stores.services import assign_store_membership, assign_store_membership_role
from apps.suppliers.models import Supplier
from apps.users.services import assign_company_membership, assign_membership_role

User = get_user_model()
PASSWORD = "a-strong-pass-1"


def inspections_url(store_id):
    return f"/api/v1/stores/{store_id}/incoming-inspections/"


def inspection_url(store_id, inspection_id):
    return f"/api/v1/stores/{store_id}/incoming-inspections/{inspection_id}/"


def inspection_cancel_url(store_id, inspection_id):
    return f"/api/v1/stores/{store_id}/incoming-inspections/{inspection_id}/cancel/"


def inspection_submit_url(store_id, inspection_id):
    return f"/api/v1/stores/{store_id}/incoming-inspections/{inspection_id}/submit/"


def eligible_receipt_lines_url(store_id):
    return f"/api/v1/stores/{store_id}/incoming-inspections/eligible-receipt-lines/"


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


QC_ALL_PERMS = (
    "incoming_qc.view", "incoming_qc.create", "incoming_qc.edit", "incoming_qc.submit", "incoming_qc.cancel"
)
RECEIVING_ALL_PERMS = ("receiving.view", "receiving.create", "receiving.edit", "receiving.post", "receiving.cancel")


class IncomingInspectionTestCase(TestCase):
    def setUp(self):
        self.superuser = make_superuser("qcadmin")
        self.company = make_company("ACME")
        self.other_company = make_company("BETA")
        self.store = make_store("MAINWH")
        self.other_store = make_store("SIDEWH")
        self.client_ = Client()
        self.unit = make_unit("KG")
        self.category = make_category("HERB")
        self.material = make_material("MAT1", base_unit=self.unit, category=self.category)
        self.supplier = make_supplier("SUP1")
        self.user = make_user("qcuser")
        # Deliberately NO purchase_orders.view granted here - bare company
        # membership only, proving QC access never needs purchasing-price
        # visibility (see apps.quality.views._check_company_membership).
        grant_company_permission(self.superuser, self.user, self.company)
        grant_store_permission(self.superuser, self.user, self.store, *QC_ALL_PERMS)
        self.token = access_token_for(self.user)

    def _po_admin(self, name, company=None):
        admin = make_user(name)
        grant_company_permission(
            self.superuser, admin, company or self.company, "purchase_requests.view", "purchase_requests.approve"
        )
        return admin

    def _issued_po(self, company=None, quantity=Decimal("100"), unit_price=Decimal("10.0000")):
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
            approver = self._po_admin(_unique(f"approver_{company.code}_"), company=company)
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

    def _posted_receipt(self, store=None, company=None, quantity=Decimal("100"), received=Decimal("60"),
                         lot_reference="", receiver=None):
        """Builds a real ISSUED PO -> DRAFT GoodsReceipt -> POSTED
        GoodsReceipt end to end, and returns (receipt, receipt_line).
        """
        store = store or self.store
        company = company or self.company
        po = self._issued_po(company=company, quantity=quantity)
        po_line_id = po.issue_snapshot.lines.get().id
        if receiver is None:
            receiver = make_user(_unique("receiver_"))
            grant_store_permission(self.superuser, receiver, store, *RECEIVING_ALL_PERMS)
            grant_company_permission(self.superuser, receiver, company, "purchase_orders.view")
        arrived_at = timezone.now() - timedelta(hours=1)
        receipt = create_goods_receipt(
            actor=receiver, store=store, source_purchase_order_id=po.id, arrived_at=arrived_at,
            lines=[{"source_po_line_id": po_line_id, "received_quantity": received, "lot_reference": lot_reference}],
        )
        receipt = post_goods_receipt(actor=receiver, goods_receipt_id=receipt.id, expected_version=1)
        return receipt, receipt.lines.get()

    def _create_inspection(self, receipt_line, token=None, **extra):
        payload = {"receipt_line_id": receipt_line.id, **extra}
        return post_json(self.client_, inspections_url(self.store.id), payload, token or self.token)


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class IncomingInspectionModelTests(IncomingInspectionTestCase):
    def test_reference_is_unique(self):
        receipt, line = self._posted_receipt()
        response = self._create_inspection(line)
        inspection = IncomingInspection.objects.get(pk=response.json()["id"])
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                IncomingInspection.objects.create(
                    receipt_line=line, store=self.store, company=self.company, material=self.material,
                    unit=self.unit, received_quantity_snapshot=Decimal("1"), reference=inspection.reference,
                    created_by=self.user,
                )

    def test_receipt_line_immutable_after_creation(self):
        receipt, line = self._posted_receipt()
        _, other_line = self._posted_receipt()
        response = self._create_inspection(line)
        inspection = IncomingInspection.objects.get(pk=response.json()["id"])
        inspection.receipt_line = other_line
        with self.assertRaises(Exception):
            inspection.save()

    def test_store_immutable_after_creation(self):
        receipt, line = self._posted_receipt()
        response = self._create_inspection(line)
        inspection = IncomingInspection.objects.get(pk=response.json()["id"])
        inspection.store = self.other_store
        with self.assertRaises(Exception):
            inspection.save()

    def test_company_immutable_after_creation(self):
        receipt, line = self._posted_receipt()
        response = self._create_inspection(line)
        inspection = IncomingInspection.objects.get(pk=response.json()["id"])
        inspection.company = self.other_company
        with self.assertRaises(Exception):
            inspection.save()

    def test_one_active_inspection_per_receipt_line_db_constraint(self):
        receipt, line = self._posted_receipt()
        IncomingInspection.objects.create(
            receipt_line=line, store=self.store, company=self.company, material=self.material, unit=self.unit,
            received_quantity_snapshot=line.received_quantity, reference=_unique("QC-DIRECT-"), created_by=self.user,
        )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                IncomingInspection.objects.create(
                    receipt_line=line, store=self.store, company=self.company, material=self.material,
                    unit=self.unit, received_quantity_snapshot=line.received_quantity,
                    reference=_unique("QC-DIRECT-"), created_by=self.user,
                )

    def test_cancelled_inspection_does_not_block_a_new_one_at_db_level(self):
        receipt, line = self._posted_receipt()
        cancelled = IncomingInspection.objects.create(
            receipt_line=line, store=self.store, company=self.company, material=self.material, unit=self.unit,
            received_quantity_snapshot=line.received_quantity, reference=_unique("QC-DIRECT-"),
            created_by=self.user, status=IncomingInspection.Status.CANCELLED,
        )
        second = IncomingInspection.objects.create(
            receipt_line=line, store=self.store, company=self.company, material=self.material, unit=self.unit,
            received_quantity_snapshot=line.received_quantity, reference=_unique("QC-DIRECT-"), created_by=self.user,
        )
        self.assertNotEqual(cancelled.pk, second.pk)

    def test_observation_requires_parameter_name(self):
        receipt, line = self._posted_receipt()
        inspection = IncomingInspection.objects.create(
            receipt_line=line, store=self.store, company=self.company, material=self.material, unit=self.unit,
            received_quantity_snapshot=line.received_quantity, reference=_unique("QC-DIRECT-"), created_by=self.user,
        )
        with self.assertRaises(DjangoValidationError):
            InspectionObservation.objects.create(inspection=inspection, line_number=1, parameter_name="")


# ---------------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------------


class IncomingInspectionAdminAccessRestrictionTests(IncomingInspectionTestCase):
    def setUp(self):
        super().setUp()
        from django.test import RequestFactory

        self.factory = RequestFactory()
        self.admin = IncomingInspectionAdmin(IncomingInspection, admin_site=None)

    def _request_as(self, user):
        request = self.factory.get("/admin/")
        request.user = user
        return request

    def test_active_superuser_can_view_but_not_add_or_change(self):
        request = self._request_as(self.superuser)
        self.assertTrue(self.admin.has_view_permission(request))
        self.assertFalse(self.admin.has_add_permission(request))
        self.assertFalse(self.admin.has_change_permission(request))
        self.assertFalse(self.admin.has_delete_permission(request))

    def test_ordinary_user_cannot_view(self):
        request = self._request_as(self.user)
        self.assertFalse(self.admin.has_view_permission(request))


# ---------------------------------------------------------------------------
# Authorization
# ---------------------------------------------------------------------------


class IncomingInspectionAuthorizationTests(IncomingInspectionTestCase):
    def test_anonymous_401(self):
        response = self.client_.get(inspections_url(self.store.id))
        self.assertEqual(response.status_code, 401)

    def test_no_store_membership_404_on_list(self):
        outsider = make_user("outsider")
        response = get_json(self.client_, inspections_url(self.store.id), access_token_for(outsider))
        self.assertEqual(response.status_code, 404)

    def test_store_membership_without_incoming_qc_view_403(self):
        user = make_user("nopermuser")
        assign_store_membership(actor=self.superuser, user=user, store=self.store)
        response = get_json(self.client_, inspections_url(self.store.id), access_token_for(user))
        self.assertEqual(response.status_code, 403)

    def test_company_membership_alone_without_any_store_membership_404(self):
        user = make_user("companyonlyuser")
        grant_company_permission(self.superuser, user, self.company)
        response = get_json(self.client_, inspections_url(self.store.id), access_token_for(user))
        self.assertEqual(response.status_code, 404)

    def test_store_access_alone_does_not_reveal_other_companys_inspections(self):
        receipt, line = self._posted_receipt(company=self.other_company)
        response = self._create_inspection(line)
        # self.user has store access to self.store but only company
        # membership in self.company, not self.other_company.
        self.assertEqual(response.status_code, 404)

    def test_detail_404_for_inspection_in_inaccessible_company(self):
        receipt, line = self._posted_receipt(company=self.other_company)
        member_of_other = make_user("otherco_member")
        grant_company_permission(self.superuser, member_of_other, self.other_company)
        grant_store_permission(self.superuser, member_of_other, self.store, *QC_ALL_PERMS)
        response = self._create_inspection(line, token=access_token_for(member_of_other))
        self.assertEqual(response.status_code, 201)
        inspection_id = response.json()["id"]
        response = get_json(self.client_, inspection_url(self.store.id, inspection_id), self.token)
        self.assertEqual(response.status_code, 404)

    def test_no_superuser_bypass(self):
        receipt, line = self._posted_receipt()
        response = self._create_inspection(line, token=access_token_for(self.superuser))
        self.assertEqual(response.status_code, 404)

    def test_qc_user_without_purchase_orders_view_can_create_and_view(self):
        """The setUp() user deliberately never received purchase_orders.
        view - proves incoming QC access never needs purchasing-price
        visibility.
        """
        receipt, line = self._posted_receipt()
        response = self._create_inspection(line)
        self.assertEqual(response.status_code, 201, response.content)
        response = get_json(self.client_, inspection_url(self.store.id, response.json()["id"]), self.token)
        self.assertEqual(response.status_code, 200)

    def test_response_never_exposes_commercial_fields(self):
        receipt, line = self._posted_receipt()
        response = self._create_inspection(line)
        body = response.json()
        flat = json.dumps(body)
        for forbidden in ("unit_price", "line_amount", "currency_code", "subtotal", '"price"'):
            self.assertNotIn(forbidden, flat, body)


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


class IncomingInspectionCreateTests(IncomingInspectionTestCase):
    def test_create_against_posted_receipt_succeeds_with_snapshots(self):
        receipt, line = self._posted_receipt(received=Decimal("60"), lot_reference="LOT-A")
        response = self._create_inspection(line)
        self.assertEqual(response.status_code, 201, response.content)
        body = response.json()
        self.assertEqual(body["status"], "DRAFT")
        self.assertEqual(body["receipt_line_id"], line.id)
        self.assertEqual(body["receipt_id"], receipt.id)
        self.assertEqual(body["receipt_reference"], receipt.reference)
        self.assertEqual(body["material_code"], self.material.code)
        self.assertEqual(body["lot_reference_snapshot"], "LOT-A")
        self.assertEqual(Decimal(body["received_quantity_snapshot"]), Decimal("60.000"))
        self.assertEqual(body["observations"], [])

    def test_missing_lot_reference_stays_blank_not_fabricated(self):
        receipt, line = self._posted_receipt(lot_reference="")
        response = self._create_inspection(line)
        self.assertEqual(response.json()["lot_reference_snapshot"], "")

    def test_create_against_draft_receipt_rejected(self):
        po = self._issued_po()
        po_line_id = po.issue_snapshot.lines.get().id
        receiver = make_user(_unique("receiver_"))
        grant_store_permission(self.superuser, receiver, self.store, *RECEIVING_ALL_PERMS)
        grant_company_permission(self.superuser, receiver, self.company, "purchase_orders.view")
        draft_receipt = create_goods_receipt(
            actor=receiver, store=self.store, source_purchase_order_id=po.id,
            arrived_at=timezone.now() - timedelta(hours=1),
            lines=[{"source_po_line_id": po_line_id, "received_quantity": Decimal("10")}],
        )
        line = draft_receipt.lines.get()
        response = self._create_inspection(line)
        self.assertEqual(response.status_code, 400)

    def test_create_against_cancelled_receipt_rejected(self):
        po = self._issued_po()
        po_line_id = po.issue_snapshot.lines.get().id
        receiver = make_user(_unique("receiver_"))
        grant_store_permission(self.superuser, receiver, self.store, *RECEIVING_ALL_PERMS)
        grant_company_permission(self.superuser, receiver, self.company, "purchase_orders.view")
        from apps.receiving.services import cancel_goods_receipt

        draft_receipt = create_goods_receipt(
            actor=receiver, store=self.store, source_purchase_order_id=po.id,
            arrived_at=timezone.now() - timedelta(hours=1),
            lines=[{"source_po_line_id": po_line_id, "received_quantity": Decimal("10")}],
        )
        line = draft_receipt.lines.get()
        cancel_goods_receipt(actor=receiver, goods_receipt_id=draft_receipt.id, expected_version=1, reason="oops")
        response = self._create_inspection(line)
        self.assertEqual(response.status_code, 400)

    def test_create_with_observations(self):
        receipt, line = self._posted_receipt()
        observations = [
            {"parameter_name": "Appearance", "method_reference": "Visual", "result": "Off-white powder"},
            {"parameter_name": "Moisture content", "result_unit": "%"},
        ]
        response = self._create_inspection(line, observations=observations)
        self.assertEqual(response.status_code, 201, response.content)
        body = response.json()["observations"]
        self.assertEqual(len(body), 2)
        self.assertEqual(body[0]["parameter_name"], "Appearance")
        self.assertEqual(body[0]["result"], "Off-white powder")
        self.assertEqual(body[1]["result"], "")

    def test_observation_missing_parameter_name_rejected(self):
        receipt, line = self._posted_receipt()
        response = self._create_inspection(line, observations=[{"parameter_name": "", "result": "x"}])
        self.assertEqual(response.status_code, 400)

    def test_create_rejects_prohibited_header_fields(self):
        receipt, line = self._posted_receipt()
        for field, value in [
            ("company_id", self.company.id), ("store_id", self.store.id), ("material_id", self.material.id),
            ("status", "CANCELLED"), ("version", 5), ("reference", "QC-FAKE"),
        ]:
            response = self._create_inspection(line, **{field: value})
            self.assertEqual(response.status_code, 400, field)

    def test_observation_prohibited_field_rejected(self):
        receipt, line = self._posted_receipt()
        response = self._create_inspection(
            line, observations=[{"parameter_name": "X", "line_number": 99}]
        )
        self.assertEqual(response.status_code, 400)

    def test_inspection_date_omitted_defaults_to_none(self):
        receipt, line = self._posted_receipt()
        response = self._create_inspection(line)
        self.assertIsNone(response.json()["inspection_date"])

    def test_inspection_date_equal_to_arrival_date_allowed(self):
        receipt, line = self._posted_receipt()
        arrival_date = receipt.arrived_at.date().isoformat()
        response = self._create_inspection(line, inspection_date=arrival_date)
        self.assertEqual(response.status_code, 201, response.content)

    def test_inspection_date_before_arrival_rejected(self):
        receipt, line = self._posted_receipt()
        before = (receipt.arrived_at.date() - timedelta(days=1)).isoformat()
        response = self._create_inspection(line, inspection_date=before)
        self.assertEqual(response.status_code, 400)

    def test_inspection_date_in_future_rejected(self):
        receipt, line = self._posted_receipt()
        future = (timezone.now().date() + timedelta(days=1)).isoformat()
        response = self._create_inspection(line, inspection_date=future)
        self.assertEqual(response.status_code, 400)

    def test_unknown_receipt_line_404(self):
        response = post_json(
            self.client_, inspections_url(self.store.id), {"receipt_line_id": 999999}, self.token
        )
        self.assertEqual(response.status_code, 404)

    def test_receipt_line_from_different_store_404(self):
        receipt, line = self._posted_receipt(store=self.other_store)
        # self.user has no incoming_qc access to self.other_store, and
        # even a matching company membership must not let the *store*
        # URL leak a line that actually belongs to a different store.
        response = self._create_inspection(line)
        self.assertEqual(response.status_code, 404)


# ---------------------------------------------------------------------------
# Duplicate / concurrency
# ---------------------------------------------------------------------------


class IncomingInspectionDuplicateTests(IncomingInspectionTestCase):
    def test_duplicate_active_inspection_returns_409(self):
        receipt, line = self._posted_receipt()
        first = self._create_inspection(line)
        self.assertEqual(first.status_code, 201)
        second = self._create_inspection(line)
        self.assertEqual(second.status_code, 409)

    def test_new_inspection_allowed_after_cancelling_previous(self):
        receipt, line = self._posted_receipt()
        first = self._create_inspection(line)
        first_id = first.json()["id"]
        response = post_json(
            self.client_, inspection_cancel_url(self.store.id, first_id),
            {"expected_version": 1, "cancellation_reason": "wrong line"}, self.token,
        )
        self.assertEqual(response.status_code, 200)
        second = self._create_inspection(line)
        self.assertEqual(second.status_code, 201, second.content)
        self.assertNotEqual(second.json()["id"], first_id)


class ConcurrentInspectionCreationTests(TransactionTestCase):
    serialized_rollback = True

    def test_concurrent_creation_allows_only_one_active_inspection(self):
        superuser = make_superuser("concurrentqcadmin")
        company = make_company("CONCURQC")
        store = make_store("CONCURQCWH")
        requester = make_user("concurrentqcrequester")
        grant_company_permission(
            superuser, requester, company,
            "purchase_requests.view", "purchase_requests.create", "purchase_requests.submit",
            "purchase_orders.view", "purchase_orders.create",
        )
        unit = make_unit("KGQC")
        material = make_material("MATQC", base_unit=unit)
        supplier = make_supplier("SUPQC")

        pr = create_purchase_request(
            actor=requester, company=company, lines=[{"material_id": material.id, "quantity": Decimal("100")}]
        )
        pr = submit_purchase_request(actor=requester, purchase_request_id=pr.id, expected_version=1)
        for i in range(3):
            approver = make_user(f"concurrentqcapprover{i}")
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

        receiver = make_user("concurrentqcreceiver")
        grant_store_permission(superuser, receiver, store, *RECEIVING_ALL_PERMS)
        grant_company_permission(superuser, receiver, company, "purchase_orders.view")
        receipt = create_goods_receipt(
            actor=receiver, store=store, source_purchase_order_id=po.id,
            arrived_at=timezone.now() - timedelta(hours=1),
            lines=[{"source_po_line_id": po_line_id, "received_quantity": Decimal("100")}],
        )
        receipt = post_goods_receipt(actor=receiver, goods_receipt_id=receipt.id, expected_version=1)
        receipt_line = receipt.lines.get()

        qc_user = make_user("concurrentqcuser")
        grant_company_permission(superuser, qc_user, company)
        grant_store_permission(superuser, qc_user, store, *QC_ALL_PERMS)

        results = []
        barrier = threading.Barrier(2)

        def worker():
            try:
                barrier.wait(timeout=5)
                create_incoming_inspection(actor=qc_user, receipt_line_id=receipt_line.id)
                results.append("ok")
            except Conflict:
                results.append("conflict")
            except DjangoValidationError:
                results.append("rejected")
            finally:
                connection.close()

        threads = [threading.Thread(target=worker), threading.Thread(target=worker)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=10)

        self.assertEqual(results.count("ok"), 1, results)
        self.assertEqual(results.count("conflict"), 1, results)
        active_count = IncomingInspection.objects.filter(receipt_line=receipt_line).exclude(
            status=IncomingInspection.Status.CANCELLED
        ).count()
        self.assertEqual(active_count, 1)


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------


class IncomingInspectionUpdateTests(IncomingInspectionTestCase):
    def _create(self, **extra):
        receipt, line = self._posted_receipt()
        response = self._create_inspection(line, **extra)
        return receipt, line, response.json()

    def test_update_notes_and_date(self):
        receipt, line, body = self._create()
        arrival_date = receipt.arrived_at.date().isoformat()
        response = patch_json(
            self.client_, inspection_url(self.store.id, body["id"]),
            {"expected_version": body["version"], "notes": "Looks fine", "inspection_date": arrival_date},
            self.token,
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["notes"], "Looks fine")
        self.assertEqual(response.json()["version"], body["version"] + 1)

    def test_update_observations_full_replace(self):
        receipt, line, body = self._create(observations=[{"parameter_name": "A", "result": "1"}])
        response = patch_json(
            self.client_, inspection_url(self.store.id, body["id"]),
            {"expected_version": body["version"], "observations": [{"parameter_name": "B", "result": "2"}]},
            self.token,
        )
        self.assertEqual(response.status_code, 200, response.content)
        observations = response.json()["observations"]
        self.assertEqual(len(observations), 1)
        self.assertEqual(observations[0]["parameter_name"], "B")

    def test_update_observations_omitted_leaves_unchanged(self):
        receipt, line, body = self._create(observations=[{"parameter_name": "A", "result": "1"}])
        response = patch_json(
            self.client_, inspection_url(self.store.id, body["id"]),
            {"expected_version": body["version"], "notes": "unchanged-observations"},
            self.token,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()["observations"]), 1)

    def test_update_observations_empty_list_clears(self):
        receipt, line, body = self._create(observations=[{"parameter_name": "A", "result": "1"}])
        response = patch_json(
            self.client_, inspection_url(self.store.id, body["id"]),
            {"expected_version": body["version"], "observations": []},
            self.token,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["observations"], [])

    def test_update_receipt_line_prohibited(self):
        receipt, line, body = self._create()
        response = patch_json(
            self.client_, inspection_url(self.store.id, body["id"]),
            {"expected_version": body["version"], "receipt_line_id": 999999},
            self.token,
        )
        self.assertEqual(response.status_code, 400)

    def test_update_stale_version_conflict(self):
        receipt, line, body = self._create()
        response = patch_json(
            self.client_, inspection_url(self.store.id, body["id"]),
            {"expected_version": body["version"] + 5, "notes": "x"},
            self.token,
        )
        self.assertEqual(response.status_code, 409)

    def test_cancelled_inspection_is_read_only(self):
        receipt, line, body = self._create()
        post_json(
            self.client_, inspection_cancel_url(self.store.id, body["id"]),
            {"expected_version": body["version"], "cancellation_reason": "test"}, self.token,
        )
        response = patch_json(
            self.client_, inspection_url(self.store.id, body["id"]),
            {"expected_version": body["version"] + 1, "notes": "should fail"}, self.token,
        )
        self.assertEqual(response.status_code, 400)

    def test_noop_update_does_not_bump_version_or_audit(self):
        receipt, line, body = self._create(notes="same")
        audit_before = AuditLog.objects.filter(target_type="incoming_inspection", target_id=body["id"]).count()
        response = patch_json(
            self.client_, inspection_url(self.store.id, body["id"]),
            {"expected_version": body["version"], "notes": "same"}, self.token,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["version"], body["version"])
        audit_after = AuditLog.objects.filter(target_type="incoming_inspection", target_id=body["id"]).count()
        self.assertEqual(audit_before, audit_after)

    def test_out_of_date_date_validation_reapplied_on_update(self):
        receipt, line, body = self._create()
        bad_date = (receipt.arrived_at.date() - timedelta(days=1)).isoformat()
        response = patch_json(
            self.client_, inspection_url(self.store.id, body["id"]),
            {"expected_version": body["version"], "inspection_date": bad_date}, self.token,
        )
        self.assertEqual(response.status_code, 400)


# ---------------------------------------------------------------------------
# Cancel
# ---------------------------------------------------------------------------


class IncomingInspectionCancelTests(IncomingInspectionTestCase):
    def _create(self):
        receipt, line = self._posted_receipt()
        response = self._create_inspection(line)
        return response.json()

    def test_cancel_requires_reason(self):
        body = self._create()
        response = post_json(
            self.client_, inspection_cancel_url(self.store.id, body["id"]),
            {"expected_version": body["version"], "cancellation_reason": ""}, self.token,
        )
        self.assertEqual(response.status_code, 400)

    def test_cancel_success(self):
        body = self._create()
        response = post_json(
            self.client_, inspection_cancel_url(self.store.id, body["id"]),
            {"expected_version": body["version"], "cancellation_reason": "wrong line"}, self.token,
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["status"], "CANCELLED")
        self.assertEqual(response.json()["cancellation_reason"], "wrong line")

    def test_cancel_idempotent_same_reason(self):
        body = self._create()
        url = inspection_cancel_url(self.store.id, body["id"])
        first = post_json(self.client_, url, {"expected_version": body["version"], "cancellation_reason": "x"}, self.token)
        second = post_json(
            self.client_, url, {"expected_version": first.json()["version"], "cancellation_reason": "x"}, self.token
        )
        self.assertEqual(second.status_code, 200)

    def test_cancel_conflict_different_reason(self):
        body = self._create()
        url = inspection_cancel_url(self.store.id, body["id"])
        first = post_json(self.client_, url, {"expected_version": body["version"], "cancellation_reason": "x"}, self.token)
        second = post_json(
            self.client_, url, {"expected_version": first.json()["version"], "cancellation_reason": "y"}, self.token
        )
        self.assertEqual(second.status_code, 409)

    def test_cancel_requires_incoming_qc_cancel_permission(self):
        body = self._create()
        limited_user = make_user("limitedcanceluser")
        grant_company_permission(self.superuser, limited_user, self.company)
        grant_store_permission(self.superuser, limited_user, self.store, "incoming_qc.view")
        response = post_json(
            self.client_, inspection_cancel_url(self.store.id, body["id"]),
            {"expected_version": body["version"], "cancellation_reason": "x"}, access_token_for(limited_user),
        )
        self.assertEqual(response.status_code, 403)


# ---------------------------------------------------------------------------
# No side effects on the source receipt
# ---------------------------------------------------------------------------


class IncomingInspectionSideEffectTests(IncomingInspectionTestCase):
    def test_creating_inspection_does_not_change_delivery_progress(self):
        po = self._issued_po(quantity=Decimal("100"))
        po_line_id = po.issue_snapshot.lines.get().id
        receiver = make_user(_unique("receiver_"))
        grant_store_permission(self.superuser, receiver, self.store, *RECEIVING_ALL_PERMS)
        grant_company_permission(self.superuser, receiver, self.company, "purchase_orders.view")
        receipt = create_goods_receipt(
            actor=receiver, store=self.store, source_purchase_order_id=po.id,
            arrived_at=timezone.now() - timedelta(hours=1),
            lines=[{"source_po_line_id": po_line_id, "received_quantity": Decimal("60")}],
        )
        receipt = post_goods_receipt(actor=receiver, goods_receipt_id=receipt.id, expected_version=1)
        before = delivery_progress_for_purchase_order(po)

        line = receipt.lines.get()
        self._create_inspection(line)

        po.refresh_from_db()
        after = delivery_progress_for_purchase_order(po)
        self.assertEqual(before, after)

    def test_creating_inspection_does_not_change_receipt_line_quantity(self):
        receipt, line = self._posted_receipt(received=Decimal("42"))
        before_quantity = line.received_quantity
        self._create_inspection(line)
        line.refresh_from_db()
        self.assertEqual(line.received_quantity, before_quantity)

    def test_no_disposition_fields_exist_on_the_model(self):
        field_names = {f.name for f in IncomingInspection._meta.get_fields()}
        for forbidden in ("accepted", "rejected", "released", "disposition", "pass_fail"):
            self.assertNotIn(forbidden, field_names)
        observation_field_names = {f.name for f in InspectionObservation._meta.get_fields()}
        for forbidden in ("accepted", "rejected", "pass_fail", "specification"):
            self.assertNotIn(forbidden, observation_field_names)


# ---------------------------------------------------------------------------
# Audit
# ---------------------------------------------------------------------------


class IncomingInspectionAuditTests(IncomingInspectionTestCase):
    def test_create_audit_entry_has_company_and_store(self):
        receipt, line = self._posted_receipt()
        response = self._create_inspection(line)
        entry = AuditLog.objects.get(
            target_type="incoming_inspection", target_id=response.json()["id"], action="incoming_inspection.created"
        )
        self.assertEqual(entry.company_id, self.company.id)
        self.assertEqual(entry.store_id, self.store.id)

    def test_audit_rollback_on_failure_leaves_no_orphan_inspection(self):
        receipt, line = self._posted_receipt()
        with patch("apps.quality.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                create_incoming_inspection(actor=self.user, receipt_line_id=line.id)
        self.assertEqual(IncomingInspection.objects.filter(receipt_line=line).count(), 0)


# ---------------------------------------------------------------------------
# Eligible receipt lines
# ---------------------------------------------------------------------------


class EligibleReceiptLinesTests(IncomingInspectionTestCase):
    def test_lists_posted_line_without_active_inspection(self):
        receipt, line = self._posted_receipt()
        response = get_json(self.client_, eligible_receipt_lines_url(self.store.id), self.token)
        self.assertEqual(response.status_code, 200)
        ids = [row["id"] for row in response.json()["results"]]
        self.assertIn(line.id, ids)

    def test_excludes_line_with_active_inspection(self):
        receipt, line = self._posted_receipt()
        self._create_inspection(line)
        response = get_json(self.client_, eligible_receipt_lines_url(self.store.id), self.token)
        ids = [row["id"] for row in response.json()["results"]]
        self.assertNotIn(line.id, ids)

    def test_line_reappears_after_cancelling_its_inspection(self):
        receipt, line = self._posted_receipt()
        created = self._create_inspection(line).json()
        post_json(
            self.client_, inspection_cancel_url(self.store.id, created["id"]),
            {"expected_version": created["version"], "cancellation_reason": "redo"}, self.token,
        )
        response = get_json(self.client_, eligible_receipt_lines_url(self.store.id), self.token)
        ids = [row["id"] for row in response.json()["results"]]
        self.assertIn(line.id, ids)

    def test_excludes_draft_receipt_lines(self):
        po = self._issued_po()
        po_line_id = po.issue_snapshot.lines.get().id
        receiver = make_user(_unique("receiver_"))
        grant_store_permission(self.superuser, receiver, self.store, *RECEIVING_ALL_PERMS)
        grant_company_permission(self.superuser, receiver, self.company, "purchase_orders.view")
        draft_receipt = create_goods_receipt(
            actor=receiver, store=self.store, source_purchase_order_id=po.id,
            arrived_at=timezone.now() - timedelta(hours=1),
            lines=[{"source_po_line_id": po_line_id, "received_quantity": Decimal("10")}],
        )
        response = get_json(self.client_, eligible_receipt_lines_url(self.store.id), self.token)
        ids = [row["id"] for row in response.json()["results"]]
        self.assertNotIn(draft_receipt.lines.get().id, ids)

    def test_no_commercial_fields_in_response(self):
        receipt, line = self._posted_receipt()
        response = get_json(self.client_, eligible_receipt_lines_url(self.store.id), self.token)
        flat = json.dumps(response.json())
        for forbidden in ("unit_price", "line_amount", "currency_code", "subtotal"):
            self.assertNotIn(forbidden, flat)

    def test_store_access_alone_does_not_reveal_other_companys_lines(self):
        receipt, line = self._posted_receipt(company=self.other_company)
        response = get_json(self.client_, eligible_receipt_lines_url(self.store.id), self.token)
        ids = [row["id"] for row in response.json()["results"]]
        self.assertNotIn(line.id, ids)


# ---------------------------------------------------------------------------
# Submission (Task 09B-3A)
# ---------------------------------------------------------------------------


class IncomingInspectionSubmitTests(IncomingInspectionTestCase):
    def _create(self, observations=None):
        receipt, line = self._posted_receipt()
        kwargs = {} if observations is None else {"observations": observations}
        response = self._create_inspection(line, **kwargs)
        self.assertEqual(response.status_code, 201, response.content)
        return receipt, line, response.json()

    def test_submit_success_records_actor_and_timestamp(self):
        receipt, line, body = self._create(observations=[{"parameter_name": "Appearance", "result": "OK"}])
        response = post_json(
            self.client_, inspection_submit_url(self.store.id, body["id"]),
            {"expected_version": body["version"]}, self.token,
        )
        self.assertEqual(response.status_code, 200, response.content)
        submitted = response.json()
        self.assertEqual(submitted["status"], "SUBMITTED")
        self.assertEqual(submitted["submitted_by_id"], self.user.id)
        self.assertIsNotNone(submitted["submitted_at"])
        self.assertEqual(submitted["version"], body["version"] + 1)

        inspection = IncomingInspection.objects.get(pk=body["id"])
        self.assertEqual(inspection.status, IncomingInspection.Status.SUBMITTED)
        self.assertEqual(inspection.submitted_by_id, self.user.id)
        self.assertIsNotNone(inspection.submitted_at)

    def test_submit_requires_at_least_one_observation(self):
        receipt, line, body = self._create(observations=[])
        response = post_json(
            self.client_, inspection_submit_url(self.store.id, body["id"]),
            {"expected_version": body["version"]}, self.token,
        )
        self.assertEqual(response.status_code, 400)
        inspection = IncomingInspection.objects.get(pk=body["id"])
        self.assertEqual(inspection.status, IncomingInspection.Status.DRAFT)

    def test_submit_anonymous_401(self):
        receipt, line, body = self._create(observations=[{"parameter_name": "Appearance", "result": "OK"}])
        response = self.client_.post(
            inspection_submit_url(self.store.id, body["id"]),
            data=json.dumps({"expected_version": body["version"]}), content_type="application/json",
        )
        self.assertEqual(response.status_code, 401)

    def test_submit_no_store_membership_404(self):
        receipt, line, body = self._create(observations=[{"parameter_name": "Appearance", "result": "OK"}])
        outsider = make_user("submitoutsider")
        response = post_json(
            self.client_, inspection_submit_url(self.store.id, body["id"]),
            {"expected_version": body["version"]}, access_token_for(outsider),
        )
        self.assertEqual(response.status_code, 404)

    def test_submit_store_membership_without_submit_permission_403(self):
        receipt, line, body = self._create(observations=[{"parameter_name": "Appearance", "result": "OK"}])
        limited_user = make_user("nosubmituser")
        grant_company_permission(self.superuser, limited_user, self.company)
        grant_store_permission(self.superuser, limited_user, self.store, "incoming_qc.view", "incoming_qc.edit")
        response = post_json(
            self.client_, inspection_submit_url(self.store.id, body["id"]),
            {"expected_version": body["version"]}, access_token_for(limited_user),
        )
        self.assertEqual(response.status_code, 403)

    def test_submit_company_access_isolation_404(self):
        receipt, line = self._posted_receipt(company=self.other_company)
        member_of_other = make_user("submit_otherco_member")
        grant_company_permission(self.superuser, member_of_other, self.other_company)
        grant_store_permission(self.superuser, member_of_other, self.store, *QC_ALL_PERMS)
        created = self._create_inspection(
            line, token=access_token_for(member_of_other),
            observations=[{"parameter_name": "Appearance", "result": "OK"}],
        ).json()
        # self.user has store access but only company membership in
        # self.company, not self.other_company.
        response = post_json(
            self.client_, inspection_submit_url(self.store.id, created["id"]),
            {"expected_version": created["version"]}, self.token,
        )
        self.assertEqual(response.status_code, 404)

    def test_submit_stale_version_conflict(self):
        receipt, line, body = self._create(observations=[{"parameter_name": "Appearance", "result": "OK"}])
        response = post_json(
            self.client_, inspection_submit_url(self.store.id, body["id"]),
            {"expected_version": body["version"] + 5}, self.token,
        )
        self.assertEqual(response.status_code, 409)
        inspection = IncomingInspection.objects.get(pk=body["id"])
        self.assertEqual(inspection.status, IncomingInspection.Status.DRAFT)

    def test_submit_idempotent_retry_with_current_version(self):
        receipt, line, body = self._create(observations=[{"parameter_name": "Appearance", "result": "OK"}])
        url = inspection_submit_url(self.store.id, body["id"])
        first = post_json(self.client_, url, {"expected_version": body["version"]}, self.token)
        self.assertEqual(first.status_code, 200)
        current_version = first.json()["version"]
        audit_count_before = AuditLog.objects.filter(
            target_type="incoming_inspection", target_id=body["id"], action="incoming_inspection.submitted"
        ).count()
        second = post_json(self.client_, url, {"expected_version": current_version}, self.token)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(second.json()["version"], current_version)
        audit_count_after = AuditLog.objects.filter(
            target_type="incoming_inspection", target_id=body["id"], action="incoming_inspection.submitted"
        ).count()
        self.assertEqual(audit_count_before, audit_count_after, "repeated submit must not write a duplicate audit event")

    def test_submit_repeated_with_original_stale_version_is_conflict_not_noop(self):
        """A retry that reuses the *original* pre-submit version once the
        inspection has already advanced past it must still 409 - only a
        retry at the *current* version is treated as an idempotent no-op.
        """
        receipt, line, body = self._create(observations=[{"parameter_name": "Appearance", "result": "OK"}])
        url = inspection_submit_url(self.store.id, body["id"])
        first = post_json(self.client_, url, {"expected_version": body["version"]}, self.token)
        self.assertEqual(first.status_code, 200)
        retry_with_stale_version = post_json(self.client_, url, {"expected_version": body["version"]}, self.token)
        self.assertEqual(retry_with_stale_version.status_code, 409)

    def test_submitted_inspection_cannot_be_edited(self):
        receipt, line, body = self._create(observations=[{"parameter_name": "Appearance", "result": "OK"}])
        submitted = post_json(
            self.client_, inspection_submit_url(self.store.id, body["id"]),
            {"expected_version": body["version"]}, self.token,
        ).json()
        response = patch_json(
            self.client_, inspection_url(self.store.id, body["id"]),
            {"expected_version": submitted["version"], "notes": "should be rejected"}, self.token,
        )
        self.assertEqual(response.status_code, 400)
        inspection = IncomingInspection.objects.get(pk=body["id"])
        self.assertEqual(inspection.notes, "")

    def test_submitted_inspection_observations_cannot_be_modified(self):
        receipt, line, body = self._create(observations=[{"parameter_name": "Appearance", "result": "Off-white"}])
        submitted = post_json(
            self.client_, inspection_submit_url(self.store.id, body["id"]),
            {"expected_version": body["version"]}, self.token,
        ).json()
        response = patch_json(
            self.client_, inspection_url(self.store.id, body["id"]),
            {
                "expected_version": submitted["version"],
                "observations": [{"parameter_name": "Different", "result": "Changed"}],
            },
            self.token,
        )
        self.assertEqual(response.status_code, 400)
        inspection = IncomingInspection.objects.get(pk=body["id"])
        self.assertEqual(inspection.observations.count(), 1)
        self.assertEqual(inspection.observations.get().parameter_name, "Appearance")

    def test_submitted_inspection_cannot_be_cancelled(self):
        receipt, line, body = self._create(observations=[{"parameter_name": "Appearance", "result": "OK"}])
        submitted = post_json(
            self.client_, inspection_submit_url(self.store.id, body["id"]),
            {"expected_version": body["version"]}, self.token,
        ).json()
        response = post_json(
            self.client_, inspection_cancel_url(self.store.id, body["id"]),
            {"expected_version": submitted["version"], "cancellation_reason": "should be rejected"}, self.token,
        )
        self.assertEqual(response.status_code, 400)
        inspection = IncomingInspection.objects.get(pk=body["id"])
        self.assertEqual(inspection.status, IncomingInspection.Status.SUBMITTED)

    def test_submitted_observations_preserved_exactly(self):
        observations = [
            {"parameter_name": "Appearance", "method_reference": "Visual", "result": "Off-white powder"},
            {"parameter_name": "Moisture", "result_unit": "%", "result": "4.1"},
        ]
        receipt, line, body = self._create(observations=observations)
        response = post_json(
            self.client_, inspection_submit_url(self.store.id, body["id"]),
            {"expected_version": body["version"]}, self.token,
        )
        submitted_observations = response.json()["observations"]
        self.assertEqual(len(submitted_observations), 2)
        self.assertEqual(submitted_observations[0]["parameter_name"], "Appearance")
        self.assertEqual(submitted_observations[0]["result"], "Off-white powder")
        self.assertEqual(submitted_observations[1]["parameter_name"], "Moisture")
        self.assertEqual(submitted_observations[1]["result"], "4.1")

    def test_submit_revalidates_receipt_still_posted(self):
        """Service-level defensive check: even though there is no reachable
        API path today that un-posts a receipt after an inspection draft
        was created against it, submit_incoming_inspection revalidates
        this directly rather than trusting creation-time state.
        """
        receipt, line = self._posted_receipt()
        inspection = create_incoming_inspection(
            actor=self.user, receipt_line_id=line.id,
            observations=[{"parameter_name": "Appearance", "result": "OK"}],
        )
        receipt.status = "DRAFT"
        receipt.save(update_fields=["status"])
        with self.assertRaises(DjangoValidationError):
            submit_incoming_inspection(actor=self.user, inspection_id=inspection.id, expected_version=1)

    def test_submit_audit_rollback_on_failure(self):
        receipt, line, body = self._create(observations=[{"parameter_name": "Appearance", "result": "OK"}])
        with patch("apps.quality.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                submit_incoming_inspection(actor=self.user, inspection_id=body["id"], expected_version=body["version"])
        inspection = IncomingInspection.objects.get(pk=body["id"])
        self.assertEqual(inspection.status, IncomingInspection.Status.DRAFT)
        self.assertIsNone(inspection.submitted_by)
        self.assertIsNone(inspection.submitted_at)
        self.assertEqual(inspection.version, body["version"])

    def test_existing_draft_create_edit_cancel_behavior_intact(self):
        """Regression: a never-submitted inspection's ordinary DRAFT
        lifecycle (create, edit, cancel) is entirely unaffected by adding
        SUBMITTED as a third status.
        """
        receipt, line, body = self._create()
        response = patch_json(
            self.client_, inspection_url(self.store.id, body["id"]),
            {"expected_version": body["version"], "notes": "still editable"}, self.token,
        )
        self.assertEqual(response.status_code, 200)
        response = post_json(
            self.client_, inspection_cancel_url(self.store.id, body["id"]),
            {"expected_version": response.json()["version"], "cancellation_reason": "no longer needed"}, self.token,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "CANCELLED")


class ConcurrentSubmitEditTests(TransactionTestCase):
    serialized_rollback = True

    def test_concurrent_submit_and_edit_never_produce_a_torn_state(self):
        """Two racing calls on the same fresh (version=1) inspection - one
        submit, one edit - both reading version=1 before the race begins.
        Whichever transaction's select_for_update() lock is granted first
        commits and bumps the version to 2; the other, once unblocked,
        re-reads the row and finds its own expected_version=1 stale
        against the now-current version=2, so it always gets a clean 409 -
        never a torn state where an edit lands on an already-submitted row
        or a submission proceeds past a concurrent edit unaccounted for.
        """
        superuser = make_superuser("concurrentsubmitadmin")
        company = make_company("CONCURSUBMIT")
        store = make_store("CONCURSUBMITWH")
        requester = make_user("concurrentsubmitrequester")
        grant_company_permission(
            superuser, requester, company,
            "purchase_requests.view", "purchase_requests.create", "purchase_requests.submit",
            "purchase_orders.view", "purchase_orders.create",
        )
        unit = make_unit("KGSUBMIT")
        material = make_material("MATSUBMIT", base_unit=unit)
        supplier = make_supplier("SUPSUBMIT")

        pr = create_purchase_request(
            actor=requester, company=company, lines=[{"material_id": material.id, "quantity": Decimal("100")}]
        )
        pr = submit_purchase_request(actor=requester, purchase_request_id=pr.id, expected_version=1)
        for i in range(3):
            approver = make_user(f"concurrentsubmitapprover{i}")
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

        receiver = make_user("concurrentsubmitreceiver")
        grant_store_permission(superuser, receiver, store, *RECEIVING_ALL_PERMS)
        grant_company_permission(superuser, receiver, company, "purchase_orders.view")
        receipt = create_goods_receipt(
            actor=receiver, store=store, source_purchase_order_id=po.id,
            arrived_at=timezone.now() - timedelta(hours=1),
            lines=[{"source_po_line_id": po_line_id, "received_quantity": Decimal("100")}],
        )
        receipt = post_goods_receipt(actor=receiver, goods_receipt_id=receipt.id, expected_version=1)
        receipt_line = receipt.lines.get()

        qc_user = make_user("concurrentsubmitqc")
        grant_company_permission(superuser, qc_user, company)
        grant_store_permission(superuser, qc_user, store, *QC_ALL_PERMS)

        inspection = create_incoming_inspection(
            actor=qc_user, receipt_line_id=receipt_line.id,
            observations=[{"parameter_name": "Appearance", "result": "OK"}],
        )
        self.assertEqual(inspection.version, 1)

        results = []
        barrier = threading.Barrier(2)

        def submit_worker():
            try:
                barrier.wait(timeout=5)
                submit_incoming_inspection(actor=qc_user, inspection_id=inspection.id, expected_version=1)
                results.append("submit_ok")
            except Conflict:
                results.append("submit_conflict")
            except DjangoValidationError:
                results.append("submit_rejected")
            finally:
                connection.close()

        def edit_worker():
            try:
                barrier.wait(timeout=5)
                update_incoming_inspection(
                    actor=qc_user, inspection_id=inspection.id, expected_version=1,
                    data={"notes": "edited concurrently"},
                )
                results.append("edit_ok")
            except Conflict:
                results.append("edit_conflict")
            except DjangoValidationError:
                results.append("edit_rejected")
            finally:
                connection.close()

        threads = [threading.Thread(target=submit_worker), threading.Thread(target=edit_worker)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=10)

        self.assertEqual(len(results), 2, results)
        successes = [r for r in results if r.endswith("_ok")]
        self.assertEqual(len(successes), 1, results)
        losers = [r for r in results if not r.endswith("_ok")]
        self.assertEqual(len(losers), 1, results)
        self.assertTrue(losers[0].endswith("_conflict"), results)

        final = IncomingInspection.objects.get(pk=inspection.id)
        self.assertEqual(final.version, 2)
        if successes[0] == "submit_ok":
            self.assertEqual(final.status, IncomingInspection.Status.SUBMITTED)
            self.assertEqual(final.notes, "")
        else:
            self.assertEqual(final.status, IncomingInspection.Status.DRAFT)
            self.assertEqual(final.notes, "edited concurrently")
