"""Delete of a DRAFT sales order: the policy, the refusals and the atomic audit.

Synthetic fixtures only, in the isolated test database. No live order is touched.
"""

import datetime
import json
from decimal import Decimal
from unittest.mock import patch

from apps.audit.models import AuditLog
from apps.sales_orders.models import SalesOrder
from apps.sales_orders.services import create_sales_order
from apps.store_preparation.services import create_store_preparation
from tests.test_store_preparation import (
    StorePreparationTestCase,
    bearer,
    grant_company_permission,
    make_company,
    make_user,
)


def order_url(company_id, order_id):
    return f"/api/v1/companies/{company_id}/sales-orders/{order_id}/"


class SalesOrderDeleteTests(StorePreparationTestCase):
    def setUp(self):
        super().setUp()
        self.admin = make_user("deladmin")
        grant_company_permission(self.superuser, self.admin, self.company, "sales_orders.view", "sales_orders.delete")

    def make_draft(self, company=None):
        company = company or self.company
        return create_sales_order(
            actor=self.superuser,
            company=company,
            customer_id=self.customer.id,
            currency="INR",
            order_date=datetime.date(2026, 10, 2),
            lines=[{"product_id": self.product.id, "quantity": Decimal("10"), "unit_price": Decimal("5")}],
        )

    def delete(self, order, user=None, version=None, company_id=None):
        return self.client_.delete(
            order_url(company_id or self.company.id, order.id) + f"?expected_version={version or order.version}",
            **bearer(user or self.admin),
        )

    # Reproduction: a draft that has a store preparation on one of its lines.
    def test_draft_with_store_preparation_is_refused_as_json_not_a_server_error(self):
        order = self.make_draft()
        create_store_preparation(
            actor=self.superuser, store=self.store, sales_order_line=order.lines.first(), packing_type="25 Gm G2"
        )
        res = self.delete(order)
        self.assertEqual(res.status_code, 400, res.content[:200])
        self.assertEqual(res["Content-Type"].split(";")[0], "application/json")
        body = res.json()
        # Real response shape: DRF wraps the translated message in a list.
        self.assertIsInstance(body["detail"], list)
        self.assertIn("store preparation records", body["detail"][0])
        self.assertNotIn("<html", res.content.decode(errors="replace").lower())
        self.assertTrue(SalesOrder.objects.filter(pk=order.id).exists())

    def test_draft_with_no_linked_records_is_deleted_and_audited(self):
        order = self.make_draft()
        res = self.delete(order)
        self.assertEqual(res.status_code, 204, res.content[:200])
        self.assertFalse(SalesOrder.objects.filter(pk=order.id).exists())
        self.assertTrue(AuditLog.objects.filter(action="sales_order.deleted", target_id=order.id).exists())

    def test_missing_delete_permission_is_refused_and_order_kept(self):
        order = self.make_draft()
        viewer = make_user("delviewer")
        grant_company_permission(self.superuser, viewer, self.company, "sales_orders.view")
        res = self.delete(order, user=viewer)
        self.assertEqual(res.status_code, 403)
        self.assertTrue(SalesOrder.objects.filter(pk=order.id).exists())

    def test_cross_company_delete_is_not_found_and_order_kept(self):
        other = make_company("DELOTHER")
        grant_company_permission(self.superuser, self.admin, other, "sales_orders.view", "sales_orders.delete")
        order = self.make_draft()
        res = self.delete(order, company_id=other.id)
        self.assertEqual(res.status_code, 404)
        self.assertTrue(SalesOrder.objects.filter(pk=order.id).exists())

    def test_confirmed_order_is_refused_as_json(self):
        order = self.make_draft()
        SalesOrder.objects.filter(pk=order.id).update(status=SalesOrder.Status.CONFIRMED)
        res = self.delete(order, version=order.version)
        self.assertEqual(res.status_code, 400, res.content[:200])
        self.assertTrue(SalesOrder.objects.filter(pk=order.id).exists())

    def test_stale_expected_version_is_a_conflict_and_order_kept(self):
        order = self.make_draft()
        res = self.delete(order, version=order.version + 5)
        self.assertEqual(res.status_code, 409, res.content[:200])
        self.assertTrue(SalesOrder.objects.filter(pk=order.id).exists())

    def test_audit_failure_rolls_back_the_deletion(self):
        order = self.make_draft()
        with patch("apps.sales_orders.services.record", side_effect=RuntimeError("audit down")):
            with self.assertRaises(RuntimeError):
                self.delete(order)
        self.assertTrue(SalesOrder.objects.filter(pk=order.id).exists())
