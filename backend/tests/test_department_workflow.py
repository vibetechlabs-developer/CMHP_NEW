import datetime
import json
from decimal import Decimal
from unittest.mock import patch

from django.test import Client, TestCase

from apps.batch_plans.models import BatchPlan
from apps.batch_plans.services import create_batch_plan
from apps.catalog.models import Material, ProductType, UnitOfMeasure
from apps.formulas.models import Formula, FormulaLine, FormulaRevision
from apps.products.models import Product
from apps.sales_orders.models import SalesOrder
from apps.sales_orders.services import create_sales_order, update_sales_order
from apps.stores.models import SharedStore
from tests.test_batch_plans import (
    approve_revision_directly,
    bearer,
    grant_permissions,
    make_company,
    make_customer,
    make_material,
    make_product,
    make_superuser,
    make_unit,
    make_user,
)
from tests.test_store_preparation import grant_store_permission, make_store

ORDER_EDIT = ["sales_orders.view", "sales_orders.create", "sales_orders.edit", "customers.view", "products.view"]
BATCH_PLAN = ["batch_plans.view", "batch_plans.create", "batch_plans.edit", "sales_orders.view", "formulas.view"]
PRINTING = ["batch_plans.printing_edit"]


def order_url(company_id, order_id=None):
    base = f"/api/v1/companies/{company_id}/sales-orders/"
    return base if order_id is None else f"{base}{order_id}/"


def plan_url(company_id, plan_id=None):
    base = f"/api/v1/companies/{company_id}/batch-plans/"
    return base if plan_id is None else f"{base}{plan_id}/"


def prep_url(store_id):
    return f"/api/v1/stores/{store_id}/preparations/"


def product_type_url(type_id=None):
    base = "/api/v1/product-types/"
    return base if type_id is None else f"{base}{type_id}/"


class DepartmentWorkflowBase(TestCase):
    def setUp(self):
        self.client = Client()
        self.admin = make_superuser("ops")
        self.company = make_company("DPT")
        self.other_company = make_company("OTH")
        self.unit_count = make_unit("BTL", dimension=UnitOfMeasure.Dimension.COUNT)
        self.unit_kg = make_unit("KG", dimension=UnitOfMeasure.Dimension.MASS)
        self.product = make_product(self.company, self.unit_count, self.admin, "PRD")
        self.customer = make_customer(self.company, self.admin, "CUS")
        self.order = create_sales_order(
            actor=self.admin,
            company=self.company,
            customer_id=self.customer.id,
            currency="INR",
            order_date=datetime.date(2026, 10, 1),
            lines=[{"product_id": self.product.id, "quantity": Decimal("100"), "unit_price": Decimal("15.00")}],
        )
        self.line = self.order.lines.first()

        self.formula = Formula.objects.create(
            company=self.company, product=self.product, code="F-DPT-1", name="Formula",
            latest_revision_number=1, created_by=self.admin,
        )
        raw = make_material("ACT", Material.Kind.RAW_MATERIAL, self.unit_kg)
        self.revision = FormulaRevision.objects.create(
            formula=self.formula, revision_number=1, status=FormulaRevision.Status.DRAFT,
            base_output_quantity=Decimal("100.000"), output_uom=self.unit_count, created_by=self.admin,
        )
        FormulaLine.objects.create(
            revision=self.revision, line_number=1, material=raw, quantity=Decimal("10.000"), unit=self.unit_kg,
            material_code_snapshot=raw.code, material_name_snapshot=raw.name, material_kind_snapshot=raw.kind,
            unit_code_snapshot=self.unit_kg.code, unit_name_snapshot=self.unit_kg.name,
        )
        approve_revision_directly(self.revision, self.admin)

        self.store = make_store("WH")
        self.plan = create_batch_plan(
            actor=self.admin,
            company=self.company,
            sales_order_line_id=self.line.id,
            formula_revision_id=self.revision.id,
            target_output_quantity=Decimal("76.000"),
        )

    def post(self, url, payload, user):
        return self.client.post(url, data=json.dumps(payload), content_type="application/json", **bearer(user))

    def patch(self, url, payload, user):
        return self.client.patch(url, data=json.dumps(payload), content_type="application/json", **bearer(user))


class OrderEntryTests(DepartmentWorkflowBase):
    def setUp(self):
        super().setUp()
        self.admin_user = make_user("entry")
        grant_permissions(self.company, self.admin_user, ORDER_EDIT, actor=self.admin)
        self.active_type = ProductType.objects.create(name="Syrup")
        self.inactive_type = ProductType.objects.create(name="Retired", is_active=False)

    def test_create_order_with_planned_date_and_line_type_snapshot(self):
        response = self.post(
            order_url(self.company.id),
            {
                "customer_id": self.customer.id,
                "order_date": "2026-10-02",
                "planned_manufacturing_date": "2026-10-20",
                "currency": "INR",
                "lines": [{"product_id": self.product.id, "quantity": "5", "unit_price": "10",
                           "product_type_snapshot": "Syrup"}],
            },
            self.admin_user,
        )
        self.assertEqual(response.status_code, 201, response.content)
        body = response.json()
        self.assertEqual(body["planned_manufacturing_date"], "2026-10-20")
        self.assertEqual(body["lines"][0]["product_type_snapshot"], "Syrup")
        self.product.refresh_from_db()
        self.assertEqual(self.product.product_type, "")

    def test_inactive_or_unknown_type_is_rejected_field_level(self):
        for value in ["Retired", "Unknown"]:
            response = self.post(
                order_url(self.company.id),
                {
                    "customer_id": self.customer.id, "order_date": "2026-10-02", "currency": "INR",
                    "lines": [{"product_id": self.product.id, "quantity": "5", "unit_price": "10",
                               "product_type_snapshot": value}],
                },
                self.admin_user,
            )
            self.assertEqual(response.status_code, 400, value)

    def test_type_override_never_changes_product_master(self):
        update_sales_order(
            actor=self.admin, sales_order_id=self.order.id, expected_version=self.order.version,
            data={"lines": [{"id": self.line.id, "product_id": self.product.id, "quantity": Decimal("100"),
                             "unit_price": Decimal("15.00"), "product_type_snapshot": "Syrup"}]},
        )
        self.line.refresh_from_db()
        self.product.refresh_from_db()
        self.assertEqual(self.line.product_type_snapshot, "Syrup")
        self.assertEqual(self.product.product_type, "")

    def test_stale_version_conflicts_and_keeps_data(self):
        response = self.patch(
            order_url(self.company.id, self.order.id),
            {"expected_version": self.order.version + 5, "planned_manufacturing_date": "2026-11-01"},
            self.admin_user,
        )
        self.assertEqual(response.status_code, 409)
        self.order.refresh_from_db()
        self.assertIsNone(self.order.planned_manufacturing_date)

    def test_audit_failure_rolls_back_order_update(self):
        with patch("apps.sales_orders.services.record", side_effect=RuntimeError("audit down")):
            with self.assertRaises(RuntimeError):
                update_sales_order(
                    actor=self.admin, sales_order_id=self.order.id, expected_version=self.order.version,
                    data={"planned_manufacturing_date": datetime.date(2026, 11, 1)},
                )
        self.order.refresh_from_db()
        self.assertIsNone(self.order.planned_manufacturing_date)

    def test_product_type_lookup_is_read_only_for_non_superusers(self):
        response = self.client.post(
            product_type_url(), data=json.dumps({"name": "Gel"}), content_type="application/json",
            **bearer(self.admin_user),
        )
        self.assertEqual(response.status_code, 403)
        response = self.client.post(
            product_type_url(), data=json.dumps({"name": "gel"}), content_type="application/json",
            **bearer(self.admin),
        )
        self.assertEqual(response.status_code, 201)
        duplicate = self.client.post(
            product_type_url(), data=json.dumps({"name": "GEL"}), content_type="application/json",
            **bearer(self.admin),
        )
        self.assertEqual(duplicate.status_code, 400)


class StorePreparationTests(DepartmentWorkflowBase):
    def setUp(self):
        super().setUp()
        self.manager = make_user("store")
        grant_permissions(self.company, self.manager, ["batch_plans.view"], actor=self.admin)
        grant_store_permission(self.admin, self.manager, self.store,
                               "store_preparation.view", "store_preparation.create", "store_preparation.edit")
        self.viewer = make_user("viewer")
        grant_permissions(self.company, self.viewer, ["batch_plans.view"], actor=self.admin)
        grant_store_permission(self.admin, self.viewer, self.store, "store_preparation.view")

    def test_store_manager_saves_text_fields_and_insert_tristate(self):
        response = self.post(
            prep_url(self.store.id),
            {"batch_plan_id": self.plan.id, "packing_type": "Bottle", "insert_required": False,
             "label_note": "Sample text", "box_note": "Box A"},
            self.manager,
        )
        self.assertEqual(response.status_code, 201, response.content)
        body = response.json()
        self.assertEqual(body["label_note"], "Sample text")
        self.assertIs(body["insert_required"], False)

    def test_view_only_store_user_cannot_create(self):
        response = self.post(prep_url(self.store.id), {"batch_plan_id": self.plan.id}, self.viewer)
        self.assertEqual(response.status_code, 403)

    def test_store_manager_cannot_set_printing_fields(self):
        response = self.patch(
            plan_url(self.company.id, self.plan.id),
            {"expected_version": self.plan.version, "mrp_for_printing": "10.00"},
            self.manager,
        )
        self.assertIn(response.status_code, (403, 404))
        self.plan.refresh_from_db()
        self.assertIsNone(self.plan.mrp_for_printing)

    def post(self, url, payload, user):
        return self.client.post(url, data=json.dumps(payload), content_type="application/json", **bearer(user))


class PrintingAndNumberingTests(DepartmentWorkflowBase):
    def setUp(self):
        super().setUp()
        self.planner = make_user("planner")
        grant_permissions(self.company, self.planner, BATCH_PLAN, actor=self.admin)
        self.printer = make_user("printer")
        grant_permissions(self.company, self.printer, BATCH_PLAN + PRINTING, actor=self.admin)

    def test_planner_can_edit_batch_fields_but_not_printing_fields(self):
        ok = self.patch(plan_url(self.company.id, self.plan.id),
                        {"expected_version": self.plan.version, "target_output_quantity": "80"}, self.planner)
        self.assertEqual(ok.status_code, 200, ok.content)
        self.plan.refresh_from_db()
        self.assertEqual(self.plan.version, 2)

        denied = self.patch(plan_url(self.company.id, self.plan.id),
                            {"expected_version": self.plan.version, "mrp_for_printing": "12.50"}, self.planner)
        self.assertEqual(denied.status_code, 403)

    def test_printer_saves_mrp_with_order_currency_and_status_note(self):
        response = self.patch(
            plan_url(self.company.id, self.plan.id),
            {"expected_version": self.plan.version, "mrp_for_printing": "12.50",
             "printing_status_note": "Waiting for artwork"},
            self.printer,
        )
        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        self.assertEqual(body["mrp_currency_code"], "INR")
        self.assertEqual(body["printing_status_note"], "Waiting for artwork")

    def test_negative_mrp_is_rejected(self):
        response = self.patch(
            plan_url(self.company.id, self.plan.id),
            {"expected_version": self.plan.version, "mrp_for_printing": "-1"},
            self.printer,
        )
        self.assertEqual(response.status_code, 400)

    def test_official_batch_number_cannot_be_written_directly(self):
        response = self.patch(
            plan_url(self.company.id, self.plan.id),
            {"expected_version": self.plan.version, "official_batch_number": "GER26-999"},
            self.printer,
        )
        self.assertEqual(response.status_code, 400)

    def test_company_isolation_blocks_other_company_plan(self):
        outsider = make_user("outsider")
        grant_permissions(self.other_company, outsider, BATCH_PLAN + PRINTING, actor=self.admin)
        response = self.patch(
            plan_url(self.company.id, self.plan.id),
            {"expected_version": self.plan.version, "notes": "x"},
            outsider,
        )
        self.assertIn(response.status_code, (403, 404))
        self.plan.refresh_from_db()
        self.assertEqual(self.plan.notes, "")


class DraftDeleteTests(DepartmentWorkflowBase):
    def setUp(self):
        super().setUp()
        self.deleter = make_user("deleter")
        grant_permissions(self.company, self.deleter, ORDER_EDIT + ["sales_orders.delete"], actor=self.admin)
        self.editor = make_user("editor")
        grant_permissions(self.company, self.editor, ORDER_EDIT, actor=self.admin)
        self.draft = create_sales_order(
            actor=self.admin,
            company=self.company,
            customer_id=self.customer.id,
            currency="INR",
            order_date=datetime.date(2026, 10, 3),
            lines=[{"product_id": self.product.id, "quantity": Decimal("3"), "unit_price": Decimal("2")}],
        )

    def delete(self, order, user, version=None):
        version = order.version if version is None else version
        return self.client.delete(
            f"{order_url(self.company.id, order.id)}?expected_version={version}", **bearer(user)
        )

    def test_permitted_user_deletes_draft_without_batch_plans_and_audit_is_written(self):
        draft_id = self.draft.id
        response = self.delete(self.draft, self.deleter)
        self.assertEqual(response.status_code, 204, response.content)
        self.assertFalse(SalesOrder.objects.filter(pk=draft_id).exists())
        from apps.audit.models import AuditLog

        self.assertTrue(AuditLog.objects.filter(action="sales_order.deleted", target_id=draft_id).exists())

    def test_user_without_delete_permission_is_refused_and_order_remains(self):
        response = self.delete(self.draft, self.editor)
        self.assertEqual(response.status_code, 403)
        self.assertTrue(SalesOrder.objects.filter(pk=self.draft.id).exists())

    def test_order_with_batch_plans_is_refused(self):
        response = self.delete(self.order, self.deleter)
        self.assertEqual(response.status_code, 400)
        self.assertTrue(SalesOrder.objects.filter(pk=self.order.id).exists())

    def test_stale_version_conflicts_and_keeps_order(self):
        response = self.delete(self.draft, self.deleter, version=self.draft.version + 9)
        self.assertEqual(response.status_code, 409)
        self.assertTrue(SalesOrder.objects.filter(pk=self.draft.id).exists())

    def test_audit_failure_rolls_back_deletion(self):
        from apps.sales_orders.services import delete_sales_order

        with patch("apps.sales_orders.services.record", side_effect=RuntimeError("audit down")):
            with self.assertRaises(RuntimeError):
                delete_sales_order(
                    actor=self.admin, company=self.company, sales_order_id=self.draft.id,
                    expected_version=self.draft.version,
                )
        self.assertTrue(SalesOrder.objects.filter(pk=self.draft.id).exists())


class CustomerDeleteTests(DepartmentWorkflowBase):
    def setUp(self):
        super().setUp()
        from tests.test_batch_plans import make_customer as _make_customer

        self.deleter = make_user("cust_deleter")
        grant_permissions(self.company, self.deleter, ["customers.view", "customers.delete"], actor=self.admin)
        self.viewer = make_user("cust_viewer")
        grant_permissions(self.company, self.viewer, ["customers.view", "customers.edit"], actor=self.admin)
        self.unused = _make_customer(self.company, self.admin, "UNUSED")

    def delete(self, customer, user, version=None):
        version = customer.version if version is None else version
        return self.client.delete(
            f"/api/v1/companies/{self.company.id}/customers/{customer.id}/?expected_version={version}",
            **bearer(user),
        )

    def test_permitted_user_deletes_unreferenced_customer_with_audit(self):
        cid = self.unused.id
        response = self.delete(self.unused, self.deleter)
        self.assertEqual(response.status_code, 204, response.content)
        from apps.customers.models import Customer
        from apps.audit.models import AuditLog

        self.assertFalse(Customer.objects.filter(pk=cid).exists())
        self.assertTrue(AuditLog.objects.filter(action="customer.deleted", target_id=cid).exists())

    def test_user_without_delete_permission_is_refused(self):
        response = self.delete(self.unused, self.viewer)
        self.assertEqual(response.status_code, 403)

    def test_customer_with_sales_orders_is_refused(self):
        response = self.delete(self.customer, self.deleter)
        self.assertEqual(response.status_code, 400)
        from apps.customers.models import Customer

        self.assertTrue(Customer.objects.filter(pk=self.customer.id).exists())

    def test_stale_version_conflicts(self):
        response = self.delete(self.unused, self.deleter, version=self.unused.version + 4)
        self.assertEqual(response.status_code, 409)

    def test_audit_failure_rolls_back_customer_deletion(self):
        from apps.customers.models import Customer
        from apps.customers.services import delete_customer

        with patch("apps.customers.services.record", side_effect=RuntimeError("audit down")):
            with self.assertRaises(RuntimeError):
                delete_customer(actor=self.admin, company=self.company, customer_id=self.unused.id,
                                expected_version=self.unused.version)
        self.assertTrue(Customer.objects.filter(pk=self.unused.id).exists())


class ProductDeleteTests(DepartmentWorkflowBase):
    def setUp(self):
        super().setUp()
        from tests.test_batch_plans import make_product as _make_product

        self.deleter = make_user("prod_deleter")
        grant_permissions(self.company, self.deleter, ["products.view", "products.delete"], actor=self.admin)
        self.viewer = make_user("prod_viewer")
        grant_permissions(self.company, self.viewer, ["products.view", "products.edit"], actor=self.admin)
        self.unused = _make_product(self.company, self.unit_count, self.admin, "FREE")

    def delete(self, product, user, version=None):
        version = product.version if version is None else version
        return self.client.delete(
            f"/api/v1/companies/{self.company.id}/products/{product.id}/?expected_version={version}",
            **bearer(user),
        )

    def test_permitted_user_deletes_unused_product_with_audit(self):
        pid = self.unused.id
        response = self.delete(self.unused, self.deleter)
        self.assertEqual(response.status_code, 204, response.content)
        from apps.products.models import Product
        from apps.audit.models import AuditLog

        self.assertFalse(Product.objects.filter(pk=pid).exists())
        self.assertTrue(AuditLog.objects.filter(action="product.deleted", target_id=pid).exists())

    def test_user_without_delete_permission_is_refused(self):
        response = self.delete(self.unused, self.viewer)
        self.assertEqual(response.status_code, 403)

    def test_product_used_on_an_order_is_refused(self):
        response = self.delete(self.product, self.deleter)
        self.assertEqual(response.status_code, 400)
        from apps.products.models import Product

        self.assertTrue(Product.objects.filter(pk=self.product.id).exists())

    def test_stale_version_conflicts(self):
        response = self.delete(self.unused, self.deleter, version=self.unused.version + 3)
        self.assertEqual(response.status_code, 409)

    def test_audit_failure_rolls_back_product_deletion(self):
        from apps.products.models import Product
        from apps.products.services import delete_product

        with patch("apps.products.services.record", side_effect=RuntimeError("audit down")):
            with self.assertRaises(RuntimeError):
                delete_product(actor=self.admin, company=self.company, product_id=self.unused.id,
                               expected_version=self.unused.version)
        self.assertTrue(Product.objects.filter(pk=self.unused.id).exists())
