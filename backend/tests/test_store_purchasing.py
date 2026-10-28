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
    assign_role,
    assign_store_role,
    create_company_role,
    create_store_role,
    replace_role_permissions,
    replace_store_role_permissions,
)
from apps.purchasing.models import PurchaseOrder
from apps.purchasing.services import create_purchase_order
from apps.stores.models import SharedStore
from apps.stores.services import assign_store_membership
from apps.suppliers.models import Supplier
from apps.users.services import assign_company_membership

User = get_user_model()
PASSWORD = "a-strong-pass-1"


def store_pos_url(store_id):
    return f"/api/v1/stores/{store_id}/purchase-orders/"


def store_po_detail_url(store_id, order_id):
    return f"/api/v1/stores/{store_id}/purchase-orders/{order_id}/"


def store_po_issue_url(store_id, order_id):
    return f"/api/v1/stores/{store_id}/purchase-orders/{order_id}/issue/"


def store_po_cancel_url(store_id, order_id):
    return f"/api/v1/stores/{store_id}/purchase-orders/{order_id}/cancel/"


class StorePurchasingAPITests(TestCase):
    def setUp(self):
        self.superuser = User.objects.create_superuser("admin", "admin@example.com", PASSWORD)
        self.company_a = Company.objects.create(code="COMPA", legal_name="Company A Legal")
        self.company_b = Company.objects.create(code="COMPB", legal_name="Company B Legal")
        self.store = SharedStore.objects.create(code="CENTRAL", name="Central Raw Material Store")
        self.other_store = SharedStore.objects.create(code="OTHER", name="Other Store")

        self.unit = UnitOfMeasure.objects.create(code="KG", name="Kilogram", dimension="MASS")
        self.cat = MaterialCategory.objects.create(code="RAW", name="Raw Material")
        self.mat_a = Material.objects.create(code="MAT-A", name="Material A", kind="RAW_MATERIAL", base_unit=self.unit, category=self.cat)
        self.mat_b = Material.objects.create(code="MAT-B", name="Material B", kind="RAW_MATERIAL", base_unit=self.unit, category=self.cat)
        self.supplier = Supplier.objects.create(code="SUP-1", legal_name="Apex Supplier Pvt Ltd", display_name="Apex")

        self.user = User.objects.create_user("buyer", "buyer@example.com", PASSWORD)

        # Grant store access: receiving.view
        s_mem, _ = assign_store_membership(actor=self.superuser, store=self.store, user=self.user)
        s_role = create_store_role(actor=self.superuser, store=self.store, code="ROLEBUY", name="StoreBuyer")
        replace_store_role_permissions(actor=self.superuser, role=s_role, permission_codes=["receiving.view"])
        assign_store_role(s_mem, s_role)

        # Grant company_a access: purchase_orders.*
        c_mem_a, _ = assign_company_membership(actor=self.superuser, company=self.company_a, user=self.user)
        c_role_a = create_company_role(actor=self.superuser, company=self.company_a, code="ROLEPOA", name="PurchasingAdmin")
        replace_role_permissions(
            actor=self.superuser,
            role=c_role_a,
            permission_codes=[
                "purchase_orders.view",
                "purchase_orders.create",
                "purchase_orders.edit",
                "purchase_orders.issue",
                "purchase_orders.cancel",
            ],
        )
        assign_role(c_mem_a, c_role_a)

        self.client_ = Client()
        self.token = str(AccessToken.for_user(self.user))

    def _auth(self):
        return {"HTTP_AUTHORIZATION": f"Bearer {self.token}"}

    def test_01_store_list_purchase_orders_filters_by_authorized_company(self):
        po_a = create_purchase_order(
            actor=self.superuser,
            company=self.company_a,
            supplier_id=self.supplier.id,
            currency_code="INR",
            direct_lines=[{"material_id": self.mat_a.id, "quantity": Decimal("100"), "unit_price": Decimal("25.50")}],
        )
        po_b = create_purchase_order(
            actor=self.superuser,
            company=self.company_b,
            supplier_id=self.supplier.id,
            currency_code="INR",
            direct_lines=[{"material_id": self.mat_b.id, "quantity": Decimal("50"), "unit_price": Decimal("10.00")}],
        )

        resp = self.client_.get(store_pos_url(self.store.id), **self._auth())
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        ids = [item["id"] for item in data["results"]]
        self.assertIn(po_a.id, ids)
        self.assertNotIn(po_b.id, ids)
        self.assertEqual(data["results"][0]["subtotal"], "2550.00")

    def test_02_store_create_purchase_order_multi_line_and_issue(self):
        payload = {
            "company_id": self.company_a.id,
            "supplier_id": self.supplier.id,
            "currency_code": "INR",
            "expected_delivery_date": str(timezone.now().date() + timedelta(days=7)),
            "notes": "Direct common store purchase order",
            "lines": [
                {"material_id": self.mat_a.id, "quantity": "10.0", "unit_price": "120.0"},
                {"material_id": self.mat_b.id, "quantity": "25.0", "unit_price": "80.0"},
            ],
        }
        resp = self.client_.post(
            store_pos_url(self.store.id),
            data=json.dumps(payload),
            content_type="application/json",
            **self._auth(),
        )
        self.assertEqual(resp.status_code, 201)
        data = resp.json()
        self.assertEqual(data["status"], "DRAFT")
        self.assertEqual(len(data["lines"]), 2)
        po_id = data["id"]
        version = data["version"]

        # Issue the PO through the store endpoint
        issue_resp = self.client_.post(
            store_po_issue_url(self.store.id, po_id),
            data=json.dumps({"expected_version": version}),
            content_type="application/json",
            **self._auth(),
        )
        self.assertEqual(issue_resp.status_code, 200)
        issued_data = issue_resp.json()
        self.assertEqual(issued_data["status"], "ISSUED")
        self.assertIsNotNone(issued_data["issue_snapshot"])
        self.assertEqual(len(issued_data["delivery_progress"]), 2)
        self.assertEqual(issued_data["delivery_progress"][0]["delivery_status"], "PENDING")

    def test_03_store_cancel_draft_purchase_order(self):
        po = create_purchase_order(
            actor=self.superuser,
            company=self.company_a,
            supplier_id=self.supplier.id,
            currency_code="INR",
            direct_lines=[{"material_id": self.mat_a.id, "quantity": Decimal("5"), "unit_price": Decimal("10")}],
        )
        resp = self.client_.post(
            store_po_cancel_url(self.store.id, po.id),
            data=json.dumps({"expected_version": po.version, "cancellation_reason": "Order duplicated"}),
            content_type="application/json",
            **self._auth(),
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["status"], "CANCELLED")

    def test_04_user_without_store_access_denied(self):
        resp = self.client_.get(store_pos_url(self.other_store.id), **self._auth())
        self.assertEqual(resp.status_code, 404)
