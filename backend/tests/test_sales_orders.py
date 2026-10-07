import datetime
import itertools
import json
import threading
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import IntegrityError, connection, transaction
from django.test import Client, TestCase, TransactionTestCase
from rest_framework_simplejwt.tokens import AccessToken

from apps.audit.models import AuditLog
from apps.catalog.models import UnitOfMeasure
from apps.common.errors import Conflict
from apps.companies.models import Company
from apps.customers.models import Customer
from apps.permissions.services import create_company_role, replace_role_permissions
from apps.products.models import Product
from apps.sales_orders.admin import SalesOrderAdmin, SalesOrderLineAdmin
from apps.sales_orders.models import SalesOrder, SalesOrderLine
from apps.sales_orders.services import create_sales_order, update_sales_order
from apps.users.services import assign_company_membership, assign_membership_role

User = get_user_model()
PASSWORD = "a-strong-pass-1"
ALL_PERMS = ["sales_orders.view", "sales_orders.create", "sales_orders.edit"]
_counter = itertools.count()


def sales_orders_url(company_id):
    return f"/api/v1/companies/{company_id}/sales-orders/"


def sales_order_url(company_id, sales_order_id):
    return f"/api/v1/companies/{company_id}/sales-orders/{sales_order_id}/"


def make_user(username, **kwargs):
    return User.objects.create_user(username=username, email=f"{username}@example.com", password=PASSWORD, **kwargs)


def make_superuser(username):
    return User.objects.create_superuser(username=username, email=f"{username}@example.com", password=PASSWORD)


def make_company(code):
    return Company.objects.create(code=code, legal_name=f"{code} Legal Name Pvt Ltd")


def make_unit(code, dimension="COUNT", **kwargs):
    return UnitOfMeasure.objects.create(code=code, name=f"{code} name", dimension=dimension, **kwargs)


def make_customer(company, code, actor, name=None, **kwargs):
    return Customer.objects.create(company=company, code=code, name=name or f"{code} Customer", created_by=actor, **kwargs)


def make_product(company, code, unit, actor, name=None, **kwargs):
    return Product.objects.create(
        company=company, code=code, name=name or f"{code} Product", sales_uom=unit, created_by=actor, **kwargs
    )


def access_token_for(user):
    return str(AccessToken.for_user(user))


def bearer(token):
    return {"HTTP_AUTHORIZATION": f"Bearer {token}"}


def get_json(client, url, token):
    return client.get(url, **bearer(token))


def post_json(client, url, payload, token):
    return client.post(url, data=json.dumps(payload), content_type="application/json", **bearer(token))


def patch_json(client, url, payload, token):
    return client.patch(url, data=json.dumps(payload), content_type="application/json", **bearer(token))


def grant_company_permission(actor, user, company, *codes):
    membership, _ = assign_company_membership(actor=actor, user=user, company=company)
    role = create_company_role(actor=actor, company=company, code=f"ROLE{user.id}", name="Role")
    role, _ = replace_role_permissions(actor=actor, role=role, permission_codes=list(codes))
    assign_membership_role(actor=actor, membership=membership, role=role)


class SalesOrderBase(TestCase):
    def setUp(self):
        n = next(_counter)
        self.superuser = make_superuser(f"sadmin{n}")
        self.user = make_user(f"suser{n}")
        self.company = make_company(f"SCO{n}")
        self.other_company = make_company(f"SOT{n}")
        self.count_unit = make_unit(f"PCS{n}", "COUNT")
        self.mass_unit = make_unit(f"KG{n}", "MASS")
        self.customer = make_customer(self.company, "C1", self.superuser)
        self.other_customer = make_customer(self.other_company, "C1", self.superuser)
        self.p_count = make_product(self.company, "PC", self.count_unit, self.superuser)
        self.p_mass = make_product(self.company, "PM", self.mass_unit, self.superuser)
        self.other_product = make_product(self.other_company, "PX", self.count_unit, self.superuser)
        grant_company_permission(self.superuser, self.user, self.company, *ALL_PERMS)
        self.token = access_token_for(self.user)
        self.client_ = Client()

    def payload(self, **overrides):
        body = {
            "customer_id": self.customer.id,
            "order_date": "2026-09-01",
            "currency": "inr",
            "lines": [],
        }
        body.update(overrides)
        return body

    def line(self, product=None, quantity="2", unit_price="10.5", **extra):
        return {"product_id": (product or self.p_count).id, "quantity": quantity, "unit_price": unit_price, **extra}

    def create(self, **overrides):
        return post_json(self.client_, sales_orders_url(self.company.id), self.payload(**overrides), self.token)

    def make_sales_order(self, lines=None, **overrides):
        response = self.create(lines=lines if lines is not None else [self.line()], **overrides)
        self.assertEqual(response.status_code, 201, response.content)
        return response.json()

    def patch(self, sales_order, payload, token=None):
        return patch_json(
            self.client_, sales_order_url(self.company.id, sales_order["id"]), payload, token or self.token
        )


class AccessTests(SalesOrderBase):
    def test_anonymous(self):
        self.assertEqual(self.client_.get(sales_orders_url(self.company.id)).status_code, 401)

    def test_no_membership_404(self):
        outsider = make_user("soutsider")
        response = get_json(self.client_, sales_orders_url(self.company.id), access_token_for(outsider))
        self.assertEqual(response.status_code, 404)

    def test_missing_permission_403_names_it(self):
        member = make_user("smember")
        assign_company_membership(actor=self.superuser, user=member, company=self.company)
        response = get_json(self.client_, sales_orders_url(self.company.id), access_token_for(member))
        self.assertEqual(response.status_code, 403)
        self.assertIn("sales_orders.view", response.json()["detail"])

    def test_view_only_cannot_create_or_edit(self):
        viewer = make_user("sviewer")
        grant_company_permission(self.superuser, viewer, self.company, "sales_orders.view")
        token = access_token_for(viewer)
        response = post_json(self.client_, sales_orders_url(self.company.id), self.payload(), token)
        self.assertEqual(response.status_code, 403)
        self.assertIn("sales_orders.create", response.json()["detail"])
        created = self.make_sales_order()
        response = self.patch(created, {"expected_version": 1, "notes": "x"}, token)
        self.assertEqual(response.status_code, 403)
        self.assertIn("sales_orders.edit", response.json()["detail"])

    def test_superuser_no_bypass(self):
        response = get_json(self.client_, sales_orders_url(self.company.id), access_token_for(self.superuser))
        self.assertEqual(response.status_code, 404)

    def test_inactive_company_404(self):
        self.company.is_active = False
        self.company.save(update_fields=["is_active"])
        self.assertEqual(get_json(self.client_, sales_orders_url(self.company.id), self.token).status_code, 404)

    def test_company_isolation_detail(self):
        grant_company_permission(self.superuser, self.user, self.other_company, *ALL_PERMS)
        created = self.make_sales_order()
        response = get_json(self.client_, sales_order_url(self.other_company.id, created["id"]), self.token)
        self.assertEqual(response.status_code, 404)

    def test_delete_requires_sales_orders_delete(self):
        # DELETE exists for DRAFT orders only, behind sales_orders.delete. A user
        # without that permission is refused and the order is kept.
        created = self.make_sales_order()
        response = self.client_.delete(sales_order_url(self.company.id, created["id"]), **bearer(self.token))
        self.assertEqual(response.status_code, 403)
        self.assertTrue(SalesOrder.objects.filter(pk=created["id"]).exists())


class CreateTests(SalesOrderBase):
    def test_create_success_with_lines_and_subtotal(self):
        body = self.make_sales_order(
            lines=[self.line(quantity="2", unit_price="10.5"), self.line(self.p_mass, "1.5", "3.3333")]
        )
        self.assertTrue(body["reference"].startswith("SO-"))
        self.assertEqual(body["status"], "DRAFT")
        self.assertEqual(body["version"], 1)
        self.assertEqual(body["currency"], "INR")
        self.assertEqual([l["line_number"] for l in body["lines"]], [1, 2])
        self.assertEqual(body["lines"][0]["line_amount"], "21.00")
        self.assertEqual(body["lines"][1]["line_amount"], "5.00")
        self.assertEqual(body["subtotal"], "26.00")
        self.assertNotIn("grand_total", body)
        self.assertEqual(body["lines"][0]["product_code"], "PC")
        self.assertEqual(body["lines"][0]["sales_uom_code"], self.count_unit.code)

    def test_empty_draft_and_zero_price(self):
        empty = self.make_sales_order(lines=[])
        self.assertEqual(empty["lines"], [])
        self.assertEqual(empty["subtotal"], "0.00")
        zero = self.make_sales_order(lines=[self.line(unit_price="0")])
        self.assertEqual(zero["lines"][0]["line_amount"], "0.00")
        self.assertEqual(zero["subtotal"], "0.00")

    def test_lines_omitted(self):
        body = post_json(
            self.client_,
            sales_orders_url(self.company.id),
            {"customer_id": self.customer.id, "order_date": "2026-09-01", "currency": "USD"},
            self.token,
        ).json()
        self.assertEqual(body["lines"], [])

    def test_rounding_half_up(self):
        body = self.make_sales_order(lines=[self.line(self.p_mass, "3", "0.1250"), self.line(self.p_mass, "1", "0.0050")])
        self.assertEqual(body["lines"][0]["line_amount"], "0.38")
        self.assertEqual(body["lines"][1]["line_amount"], "0.01")

    def test_count_unit_rejects_fraction_but_mass_allows(self):
        self.assertEqual(self.create(lines=[self.line(self.p_count, "1.5")]).status_code, 400)
        self.assertEqual(self.create(lines=[self.line(self.p_count, "3.000")]).status_code, 201)
        self.assertEqual(self.create(lines=[self.line(self.p_mass, "1.5")]).status_code, 201)

    def test_quantity_and_price_validation(self):
        self.assertEqual(self.create(lines=[self.line(quantity="0")]).status_code, 400)
        self.assertEqual(self.create(lines=[self.line(quantity="-1")]).status_code, 400)
        self.assertEqual(self.create(lines=[self.line(unit_price="-0.01")]).status_code, 400)
        self.assertEqual(self.create(lines=[self.line(self.p_mass, quantity="1.0001")]).status_code, 400)
        self.assertEqual(self.create(lines=[self.line(unit_price="1.00001")]).status_code, 400)

    def test_huge_amount_is_400_not_500(self):
        response = self.create(lines=[self.line(self.p_mass, "99999999999.999", "9999999999.9999")])
        self.assertEqual(response.status_code, 400)

    def test_customer_rules(self):
        self.assertEqual(self.create(customer_id=self.other_customer.id).status_code, 404)
        self.assertEqual(self.create(customer_id=999999).status_code, 404)
        self.customer.is_active = False
        self.customer.save(update_fields=["is_active"])
        response = self.create()
        self.assertEqual(response.status_code, 400)
        self.assertIn("customer_id", response.json())

    def test_product_rules(self):
        self.assertEqual(self.create(lines=[self.line(self.other_product)]).status_code, 404)
        self.p_count.is_active = False
        self.p_count.save(update_fields=["is_active"])
        self.assertEqual(self.create(lines=[self.line(self.p_count)]).status_code, 400)
        self.p_count.is_active = True
        self.p_count.save(update_fields=["is_active"])
        self.count_unit.is_active = False
        self.count_unit.save(update_fields=["is_active"])
        self.assertEqual(self.create(lines=[self.line(self.p_count)]).status_code, 400)

    def test_dates_and_currency(self):
        self.assertEqual(self.create(requested_delivery_date="2026-08-31").status_code, 400)
        self.assertEqual(self.create(requested_delivery_date="2026-09-01").status_code, 201)
        self.assertEqual(self.create(requested_delivery_date=None).status_code, 201)
        self.assertEqual(self.create(currency="RUPEE").status_code, 400)
        self.assertEqual(self.create(currency="1N2").status_code, 400)
        response = post_json(
            self.client_,
            sales_orders_url(self.company.id),
            {"customer_id": self.customer.id, "currency": "INR"},
            self.token,
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("order_date", response.json())

    def test_forged_and_unknown_fields_rejected(self):
        for field, value in [
            ("subtotal", "1.00"),
            ("total", "1.00"),
            ("grand_total", "1.00"),
            ("reference", "SO-FORGED"),
            ("status", "APPROVED"),
            ("version", 9),
            ("company_id", self.company.id),
            ("company", self.company.id),
            ("created_by", self.user.id),
            ("created_at", "2026-01-01T00:00:00Z"),
            ("tax", "5"),
            ("nonsense", 1),
        ]:
            response = self.create(**{field: value})
            self.assertEqual(response.status_code, 400, field)
            self.assertIn(field, response.json())
        self.assertEqual(SalesOrder.objects.count(), 0)

    def test_forged_line_fields_rejected(self):
        for field, value in [
            ("line_amount", "1.00"),
            ("amount", "1.00"),
            ("line_number", 7),
            ("id", 1),
            ("product_code_snapshot", "X"),
            ("sales_uom_id", 1),
            ("unit_id", 1),
            ("bogus", 1),
        ]:
            response = self.create(lines=[self.line(**{field: value})])
            self.assertEqual(response.status_code, 400, field)
        self.assertEqual(SalesOrderLine.objects.count(), 0)

    def test_snapshots_captured(self):
        body = self.make_sales_order()
        line = SalesOrderLine.objects.get(pk=body["lines"][0]["id"])
        self.assertEqual(line.product_code_snapshot, "PC")
        self.assertEqual(line.product_name_snapshot, "PC Product")
        self.assertEqual(line.sales_uom_code_snapshot, self.count_unit.code)
        self.assertEqual(line.sales_uom_name_snapshot, self.count_unit.name)

    def test_audit_recorded_company_only(self):
        body = self.make_sales_order()
        entry = AuditLog.objects.get(target_type="sales_order", target_id=body["id"], action="sales_order.created")
        self.assertEqual(entry.company_id, self.company.id)
        self.assertIsNone(entry.store_id)
        self.assertEqual(len(entry.after["lines"]), 1)

    def test_audit_failure_rolls_back_everything(self):
        with patch("apps.sales_orders.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                self.create(lines=[self.line()])
        self.assertEqual(SalesOrder.objects.count(), 0)
        self.assertEqual(SalesOrderLine.objects.count(), 0)

    def test_reference_unique_per_company_constraint(self):
        body = self.make_sales_order()
        original = SalesOrder.objects.get(pk=body["id"])
        # Same reference under a different company is allowed.
        SalesOrder.objects.create(
            company=self.other_company,
            reference=original.reference,
            customer=self.other_customer,
            order_date="2026-09-01",
            currency="INR",
            created_by=self.superuser,
        )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                SalesOrder.objects.create(
                    company=self.company,
                    reference=original.reference,
                    customer=self.customer,
                    order_date="2026-09-01",
                    currency="INR",
                    created_by=self.superuser,
                )

    def test_model_immutability(self):
        original = SalesOrder.objects.get(pk=self.make_sales_order()["id"])
        original.company = self.other_company
        with self.assertRaises(Exception):
            original.save()
        original = SalesOrder.objects.get(pk=original.pk)
        original.currency = "USD"
        with self.assertRaises(Exception):
            original.save()
        original = SalesOrder.objects.get(pk=original.pk)
        original.customer = self.other_customer
        with self.assertRaises(Exception):
            original.save()


class UpdateTests(SalesOrderBase):
    def test_requires_expected_version(self):
        created = self.make_sales_order()
        response = self.patch(created, {"notes": "x"})
        self.assertEqual(response.status_code, 400)
        self.assertIn("expected_version", response.json())

    def test_header_edit_bumps_version_and_audits(self):
        created = self.make_sales_order()
        response = self.patch(
            created, {"expected_version": 1, "notes": "  hello  ", "order_date": "2026-09-02", "requested_delivery_date": "2026-10-01"}
        )
        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        self.assertEqual(body["version"], 2)
        self.assertEqual(body["notes"], "hello")
        self.assertEqual(body["order_date"], "2026-09-02")
        entry = AuditLog.objects.filter(action="sales_order.updated", target_id=created["id"]).get()
        self.assertEqual(entry.before["order_date"], "2026-09-01")
        self.assertEqual(entry.after["requested_delivery_date"], "2026-10-01")
        self.assertNotIn("lines", entry.after)

    def test_clear_requested_delivery_date_and_date_ordering(self):
        created = self.make_sales_order(requested_delivery_date="2026-10-01")
        self.assertEqual(self.patch(created, {"expected_version": 1, "requested_delivery_date": "2026-08-01"}).status_code, 400)
        self.assertEqual(self.patch(created, {"expected_version": 1, "order_date": "2026-11-01"}).status_code, 400)
        response = self.patch(created, {"expected_version": 1, "requested_delivery_date": None})
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.json()["requested_delivery_date"])

    def test_stale_version_409(self):
        created = self.make_sales_order()
        self.assertEqual(self.patch(created, {"expected_version": 1, "notes": "a"}).status_code, 200)
        self.assertEqual(self.patch(created, {"expected_version": 1, "notes": "b"}).status_code, 409)

    def test_protected_and_unknown_fields_rejected(self):
        created = self.make_sales_order()
        for field, value in [
            ("currency", "USD"),
            ("company_id", self.other_company.id),
            ("reference", "X"),
            ("status", "SENT"),
            ("version", 3),
            ("subtotal", "1.00"),
            ("grand_total", "1.00"),
            ("created_by", 1),
            ("junk", 1),
        ]:
            response = self.patch(created, {"expected_version": 1, field: value})
            self.assertEqual(response.status_code, 400, field)
            self.assertIn(field, response.json())

    def test_change_customer(self):
        created = self.make_sales_order()
        second = make_customer(self.company, "C2", self.superuser)
        response = self.patch(created, {"expected_version": 1, "customer_id": second.id})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["customer_id"], second.id)
        self.assertEqual(self.patch(created, {"expected_version": 2, "customer_id": self.other_customer.id}).status_code, 404)
        second.is_active = False
        second.save(update_fields=["is_active"])
        third = make_customer(self.company, "C3", self.superuser, is_active=False)
        self.assertEqual(self.patch(created, {"expected_version": 2, "customer_id": third.id}).status_code, 400)

    def test_inactive_current_customer_does_not_block_other_edits(self):
        created = self.make_sales_order()
        self.customer.is_active = False
        self.customer.save(update_fields=["is_active"])
        response = self.patch(created, {"expected_version": 1, "notes": "still editable"})
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["customer_is_active"])

    def test_add_change_remove_lines_with_audit(self):
        created = self.make_sales_order(lines=[self.line(), self.line(self.p_mass, "1", "5")])
        first, second = created["lines"]
        response = self.patch(
            created,
            {
                "expected_version": 1,
                "lines": [
                    {"id": first["id"], "product_id": self.p_count.id, "quantity": "4", "unit_price": "10.5"},
                    self.line(self.p_mass, "2", "1"),
                ],
            },
        )
        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        self.assertEqual([l["line_number"] for l in body["lines"]], [1, 2])
        self.assertEqual(body["lines"][0]["id"], first["id"])
        self.assertEqual(body["lines"][0]["line_amount"], "42.00")
        self.assertNotIn(second["id"], [l["id"] for l in body["lines"]])
        self.assertEqual(body["subtotal"], "44.00")
        entry = AuditLog.objects.filter(action="sales_order.updated", target_id=created["id"]).get()
        self.assertIn(second["id"], [l["id"] for l in entry.before["lines"]])
        self.assertNotIn(second["id"], [l["id"] for l in entry.after["lines"]])
        self.assertEqual(len(entry.after["lines"]), 2)

    def test_empty_list_replaces_collection_and_omitted_leaves_it(self):
        created = self.make_sales_order(lines=[self.line(), self.line(self.p_mass)])
        untouched = self.patch(created, {"expected_version": 1, "notes": "n"}).json()
        self.assertEqual(len(untouched["lines"]), 2)
        cleared = self.patch(created, {"expected_version": 2, "lines": []}).json()
        self.assertEqual(cleared["lines"], [])
        self.assertEqual(cleared["subtotal"], "0.00")
        self.assertEqual(cleared["version"], 3)

    def test_reorder_renumbers_without_violating_unique_constraint(self):
        created = self.make_sales_order(lines=[self.line(description="a"), self.line(self.p_mass, description="b")])
        a, b = created["lines"]
        response = self.patch(
            created,
            {
                "expected_version": 1,
                "lines": [
                    {"id": b["id"], "product_id": self.p_mass.id, "quantity": b["quantity"], "unit_price": b["unit_price"], "description": "b"},
                    {"id": a["id"], "product_id": self.p_count.id, "quantity": a["quantity"], "unit_price": a["unit_price"], "description": "a"},
                ],
            },
        )
        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        self.assertEqual([(l["id"], l["line_number"]) for l in body["lines"]], [(b["id"], 1), (a["id"], 2)])

    def test_foreign_and_duplicate_line_ids(self):
        created = self.make_sales_order()
        other = self.make_sales_order()
        foreign_id = other["lines"][0]["id"]
        own = created["lines"][0]
        entry = lambda line_id: {"id": line_id, "product_id": self.p_count.id, "quantity": "2", "unit_price": "10.5"}
        self.assertEqual(self.patch(created, {"expected_version": 1, "lines": [entry(foreign_id)]}).status_code, 400)
        self.assertEqual(self.patch(created, {"expected_version": 1, "lines": [entry(999999)]}).status_code, 400)
        response = self.patch(created, {"expected_version": 1, "lines": [entry(own["id"]), entry(own["id"])]})
        self.assertEqual(response.status_code, 400)
        self.assertIn("more than once", json.dumps(response.json()))
        self.assertEqual(SalesOrderLine.objects.filter(sales_order_id=other["id"]).count(), 1)
        self.assertEqual(SalesOrder.objects.get(pk=created["id"]).version, 1)

    def test_cross_company_product_in_update_404(self):
        created = self.make_sales_order()
        response = self.patch(created, {"expected_version": 1, "lines": [self.line(self.other_product)]})
        self.assertEqual(response.status_code, 404)

    def test_forged_line_fields_on_update_rejected(self):
        created = self.make_sales_order()
        line = created["lines"][0]
        for field in ("line_amount", "line_number", "product_code_snapshot", "sales_uom_id", "bogus"):
            response = self.patch(
                created,
                {"expected_version": 1, "lines": [{"id": line["id"], **self.line(), field: 1}]},
            )
            self.assertEqual(response.status_code, 400, field)

    def test_unchanged_inactive_references_kept_and_editing_rules(self):
        created = self.make_sales_order(lines=[self.line(), self.line(self.p_mass, "1", "5")])
        keep, other = created["lines"]
        self.p_count.is_active = False
        self.p_count.save(update_fields=["is_active"])
        self.mass_unit.is_active = False
        self.mass_unit.save(update_fields=["is_active"])

        def as_entry(line, product, **changes):
            return {"id": line["id"], "product_id": product.id, "quantity": line["quantity"], "unit_price": line["unit_price"], "description": line["description"], **changes}

        # Untouched inactive lines + header edit: fine, and lines are not rewritten.
        response = self.patch(
            created,
            {"expected_version": 1, "notes": "n", "lines": [as_entry(keep, self.p_count), as_entry(other, self.p_mass)]},
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["version"], 2)
        self.assertFalse(response.json()["lines"][0]["product_is_active"])
        self.assertFalse(response.json()["lines"][1]["sales_uom_is_active"])
        # Changing a commercial value on an inactive-product line is rejected.
        response = self.patch(
            created,
            {"expected_version": 2, "lines": [as_entry(keep, self.p_count, quantity="9"), as_entry(other, self.p_mass)]},
        )
        self.assertEqual(response.status_code, 400)
        # ... as is a line on an inactive sales unit.
        response = self.patch(
            created,
            {"expected_version": 2, "lines": [as_entry(keep, self.p_count), as_entry(other, self.p_mass, unit_price="6")]},
        )
        self.assertEqual(response.status_code, 400)
        # A new line with an inactive product is rejected.
        response = self.patch(
            created,
            {"expected_version": 2, "lines": [as_entry(keep, self.p_count), as_entry(other, self.p_mass), self.line(self.p_count)]},
        )
        self.assertEqual(response.status_code, 400)
        # Removing the inactive-reference lines is always allowed.
        response = self.patch(created, {"expected_version": 2, "lines": []})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["lines"], [])

    def test_snapshots_preserved_and_refreshed_only_on_product_replacement(self):
        created = self.make_sales_order(lines=[self.line()])
        line = created["lines"][0]
        Product.objects.filter(pk=self.p_count.pk).update(name="Renamed Product")
        UnitOfMeasure.objects.filter(pk=self.count_unit.pk).update(name="Renamed Unit")
        entry = {"id": line["id"], "product_id": self.p_count.id, "quantity": "3", "unit_price": "10.5"}
        body = self.patch(created, {"expected_version": 1, "lines": [entry]}).json()
        self.assertEqual(body["lines"][0]["product_name"], "PC Product")
        self.assertEqual(body["lines"][0]["sales_uom_name"], self.count_unit.name)
        replaced = self.patch(
            created, {"expected_version": 2, "lines": [{**entry, "product_id": self.p_mass.id}]}
        ).json()
        self.assertEqual(replaced["lines"][0]["product_code"], "PM")
        self.assertEqual(replaced["lines"][0]["sales_uom_code"], self.mass_unit.code)

    def test_no_op_patch_does_not_bump_or_audit(self):
        created = self.make_sales_order()
        line = created["lines"][0]
        AuditLog.objects.filter(action="sales_order.updated").delete()
        response = self.patch(
            created,
            {
                "expected_version": 1,
                "notes": created["notes"],
                "order_date": created["order_date"],
                "customer_id": self.customer.id,
                "lines": [{"id": line["id"], "product_id": self.p_count.id, "quantity": "2.000", "unit_price": "10.50"}],
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["version"], 1)
        self.assertEqual(AuditLog.objects.filter(action="sales_order.updated").count(), 0)
        whitespace = self.patch(created, {"expected_version": 1, "notes": "   "})
        self.assertEqual(whitespace.json()["version"], 1)

    def test_audit_failure_rolls_back_header_and_lines(self):
        created = self.make_sales_order()
        line = created["lines"][0]
        with patch("apps.sales_orders.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                self.patch(
                    created,
                    {
                        "expected_version": 1,
                        "notes": "changed",
                        "lines": [{"id": line["id"], "product_id": self.p_count.id, "quantity": "9", "unit_price": "1"}, self.line()],
                    },
                )
        sales_order = SalesOrder.objects.get(pk=created["id"])
        self.assertEqual(sales_order.version, 1)
        self.assertEqual(sales_order.notes, "")
        stored = list(sales_order.lines.all())
        self.assertEqual(len(stored), 1)
        self.assertEqual(stored[0].quantity, Decimal("2.000"))

    def test_validation_failure_leaves_no_partial_write(self):
        created = self.make_sales_order()
        response = self.patch(
            created,
            {"expected_version": 1, "notes": "should not persist", "lines": [self.line(), self.line(self.p_count, "1.5")]},
        )
        self.assertEqual(response.status_code, 400)
        sales_order = SalesOrder.objects.get(pk=created["id"])
        self.assertEqual((sales_order.version, sales_order.notes, sales_order.lines.count()), (1, "", 1))


class ListTests(SalesOrderBase):
    def setUp(self):
        super().setUp()
        self.second_customer = make_customer(self.company, "C2", self.superuser, name="Zeta Traders")
        self.q1 = self.make_sales_order(order_date="2026-01-10")
        self.q2 = self.make_sales_order(customer_id=self.second_customer.id, order_date="2026-02-10")
        self.q3 = self.make_sales_order(order_date="2026-03-10")

    def ids(self, query=""):
        response = get_json(self.client_, sales_orders_url(self.company.id) + query, self.token)
        self.assertEqual(response.status_code, 200, response.content)
        return [row["id"] for row in response.json()["results"]]

    def test_default_order_newest_first_and_envelope(self):
        self.assertEqual(self.ids(), [self.q3["id"], self.q2["id"], self.q1["id"]])
        body = get_json(self.client_, sales_orders_url(self.company.id), self.token).json()
        self.assertEqual(body["count"], 3)

    def test_search_reference_and_customer_name(self):
        self.assertEqual(self.ids(f"?search={self.q1['reference']}"), [self.q1["id"]])
        self.assertEqual(self.ids("?search=zeta"), [self.q2["id"]])

    def test_customer_and_date_filters(self):
        self.assertEqual(self.ids(f"?customer={self.second_customer.id}"), [self.q2["id"]])
        self.assertEqual(self.ids("?order_date_from=2026-02-01"), [self.q3["id"], self.q2["id"]])
        self.assertEqual(self.ids("?order_date_to=2026-02-10"), [self.q2["id"], self.q1["id"]])
        self.assertEqual(self.ids("?order_date_from=2026-02-10&order_date_to=2026-02-10"), [self.q2["id"]])

    def test_strict_parameter_validation(self):
        for query in (
            "?customer=abc",
            "?order_date_from=10-01-2026",
            "?order_date_to=notadate",
            "?order_date_from=2026-03-01&order_date_to=2026-01-01",
        ):
            response = get_json(self.client_, sales_orders_url(self.company.id) + query, self.token)
            self.assertEqual(response.status_code, 400, query)

    def test_other_company_rows_not_listed(self):
        grant_company_permission(self.superuser, self.user, self.other_company, *ALL_PERMS)
        response = post_json(
            self.client_,
            sales_orders_url(self.other_company.id),
            {"customer_id": self.other_customer.id, "order_date": "2026-01-01", "currency": "INR"},
            self.token,
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(len(self.ids()), 3)


class AdminTests(TestCase):
    def test_read_only(self):
        for admin_class, model in ((SalesOrderAdmin, SalesOrder), (SalesOrderLineAdmin, SalesOrderLine)):
            instance = admin_class(model, None)
            self.assertFalse(instance.has_add_permission(None))
            self.assertFalse(instance.has_change_permission(None))


class ConcurrencyTests(TransactionTestCase):
    serialized_rollback = True

    def _setup(self, suffix):
        superuser = make_superuser(f"csadmin{suffix}")
        user = make_user(f"csuser{suffix}")
        company = make_company(f"CS{suffix}")
        unit = make_unit(f"CU{suffix}")
        customer = make_customer(company, "C1", superuser)
        product = make_product(company, "P1", unit, superuser)
        grant_company_permission(superuser, user, company, *ALL_PERMS)
        return user, company, customer, product

    def test_concurrent_creates_allocate_distinct_references(self):
        user, company, customer, product = self._setup("A")
        results, errors = [], []
        barrier = threading.Barrier(4)

        def worker():
            try:
                barrier.wait(timeout=5)
                sales_order = create_sales_order(
                    actor=user,
                    company=company,
                    customer_id=customer.id,
                    order_date=datetime.date(2026, 9, 1),
                    currency="INR",
                    lines=[{"product_id": product.id, "quantity": Decimal("1"), "unit_price": Decimal("1")}],
                )
                results.append(sales_order.reference)
            except Exception as exc:  # pragma: no cover - surfaced by assertion below
                errors.append(exc)
            finally:
                connection.close()

        threads = [threading.Thread(target=worker) for _ in range(4)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=20)
        self.assertEqual(errors, [])
        self.assertEqual(len(results), 4)
        self.assertEqual(len(set(results)), 4)
        self.assertEqual(SalesOrder.objects.filter(company=company).count(), 4)

    def test_concurrent_update_exactly_one_winner(self):
        user, company, customer, product = self._setup("B")
        sales_order = create_sales_order(
            actor=user, company=company, customer_id=customer.id, order_date=datetime.date(2026, 9, 1), currency="INR"
        )
        outcomes = []
        barrier = threading.Barrier(2)

        def worker():
            try:
                barrier.wait(timeout=5)
                update_sales_order(actor=user, sales_order_id=sales_order.id, expected_version=1, data={"notes": "x"})
                outcomes.append("ok")
            except Conflict:
                outcomes.append("conflict")
            finally:
                connection.close()

        threads = [threading.Thread(target=worker) for _ in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=20)
        self.assertEqual(sorted(outcomes), ["conflict", "ok"])
        sales_order.refresh_from_db()
        self.assertEqual(sales_order.version, 2)


class SalesOrderSpecificTests(SalesOrderBase):
    def test_reference_prefix_and_customer_order_reference(self):
        body = self.make_sales_order(customer_order_reference="  PO-778  ")
        self.assertTrue(body["reference"].startswith("SO-"))
        self.assertEqual(body["customer_order_reference"], "PO-778")

    def test_customer_order_reference_not_unique(self):
        first = self.make_sales_order(customer_order_reference="DUP-1")
        second = self.make_sales_order(customer_order_reference="DUP-1")
        self.assertNotEqual(first["id"], second["id"])

    def test_search_by_customer_order_reference(self):
        wanted = self.make_sales_order(customer_order_reference="ZZ-UNIQUE-42")
        self.make_sales_order()
        response = get_json(self.client_, sales_orders_url(self.company.id) + "?search=zz-unique", self.token)
        self.assertEqual([row["id"] for row in response.json()["results"]], [wanted["id"]])

    def test_edit_customer_order_reference_and_delivery_date_rules(self):
        created = self.make_sales_order(requested_delivery_date="2026-09-10")
        response = self.patch(created, {"expected_version": 1, "customer_order_reference": "NEW-REF"})
        self.assertEqual(response.json()["customer_order_reference"], "NEW-REF")
        self.assertEqual(response.json()["version"], 2)
        self.assertEqual(self.patch(created, {"expected_version": 2, "requested_delivery_date": "2026-08-01"}).status_code, 400)
        self.assertEqual(self.patch(created, {"expected_version": 2, "customer_order_reference": "NEW-REF"}).json()["version"], 2)

    def test_no_quotation_or_stock_fields(self):
        body = self.make_sales_order()
        for absent in ("quotation_id", "reserved_quantity", "dispatched_quantity", "grand_total", "tax"):
            self.assertNotIn(absent, body)
        for field in ("quotation_id", "reserved_quantity", "confirmed"):
            self.assertEqual(self.create(**{field: 1}).status_code, 400, field)
