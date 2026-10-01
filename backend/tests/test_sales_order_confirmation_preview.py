import datetime

from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.audit.models import AuditLog
from apps.catalog.models import UnitOfMeasure
from apps.products.models import Product
from apps.sales_orders.confirmation import business_today
from apps.sales_orders.models import SalesOrder, SalesOrderConfirmationPolicy, SalesOrderLine
from tests import test_sales_orders as so

PREVIEW_KEYS = {"preview", "order", "customer", "lines", "subtotal", "confirmation"}
CONFIRMATION_KEYS = {
    "workflow_implemented", "policy", "policy_message", "blocking_reasons",
    "informational_observations", "actor_has_confirm_permission", "ready_to_attempt",
}


def preview_url(company_id, order_id):
    return f"/api/v1/companies/{company_id}/sales-orders/{order_id}/confirmation-preview/"


def json_text(value):
    import json

    return json.dumps(value)


class PreviewBase(so.SalesOrderBase):
    def preview(self, order, token=None, company_id=None):
        return so.get_json(self.client_, preview_url(company_id or self.company.id, order["id"]), token or self.token)

    def codes(self, body, key="blocking_reasons"):
        return sorted(o["code"] for o in body["confirmation"][key])

    def configure(self, self_confirmation=True, zero_price=False, past_date=False):
        return SalesOrderConfirmationPolicy.objects.create(
            company=self.company, allow_self_confirmation=self_confirmation, allow_zero_price_lines=zero_price,
            allow_past_requested_delivery_dates=past_date, created_by=self.superuser, updated_by=self.superuser,
        )

    def snapshot_state(self, order_id):
        order = SalesOrder.objects.get(pk=order_id)
        lines = list(SalesOrderLine.objects.filter(sales_order_id=order_id).order_by("id").values())
        return order.version, order.updated_at, order.status, lines


class AccessTests(PreviewBase):
    def test_authorized_user_gets_the_informational_review(self):
        order = self.make_sales_order(customer_order_reference="PO-9", requested_delivery_date="2999-12-01")
        response = self.preview(order)
        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        self.assertEqual(set(body), PREVIEW_KEYS)
        self.assertEqual(set(body["confirmation"]), CONFIRMATION_KEYS)
        self.assertEqual((body["order"]["id"], body["order"]["reference"]), (order["id"], order["reference"]))
        self.assertEqual((body["order"]["status"], body["order"]["version"], body["order"]["currency"]), ("DRAFT", 1, "INR"))
        self.assertEqual(body["customer"]["id"], self.customer.id)
        self.assertTrue(body["preview"]["informational"])
        self.assertIn("stale", body["preview"]["notice"])
        self.assertIn("does not guarantee", body["preview"]["notice"])
        self.assertRegex(body["preview"]["business_date"], r"^\d{4}-\d{2}-\d{2}$")

    def test_view_only_user_is_enough_and_needs_nothing_else(self):
        order = self.make_sales_order()
        viewer = so.make_user("pviewer")
        so.grant_company_permission(self.superuser, viewer, self.company, "sales_orders.view")
        body = self.preview(order, so.access_token_for(viewer)).json()
        self.assertFalse(body["confirmation"]["actor_has_confirm_permission"])
        self.assertFalse(body["confirmation"]["ready_to_attempt"])

    def test_create_or_edit_without_view_is_denied(self):
        order = self.make_sales_order()
        creator = so.make_user("pcreator")
        so.grant_company_permission(self.superuser, creator, self.company, "sales_orders.create", "sales_orders.edit", "sales_orders.confirm")
        response = self.preview(order, so.access_token_for(creator))
        self.assertEqual(response.status_code, 403)
        self.assertIn("sales_orders.view", response.json()["detail"])

    def test_anonymous_no_membership_and_superuser_no_bypass(self):
        order = self.make_sales_order()
        self.assertEqual(self.client_.get(preview_url(self.company.id, order["id"])).status_code, 401)
        outsider = so.make_user("poutsider")
        self.assertEqual(self.preview(order, so.access_token_for(outsider)).status_code, 404)
        self.assertEqual(self.preview(order, so.access_token_for(self.superuser)).status_code, 404)

    def test_company_isolation(self):
        order = self.make_sales_order()
        so.grant_company_permission(self.superuser, self.user, self.other_company, *so.ALL_PERMS)
        self.assertEqual(self.preview(order, company_id=self.other_company.id).status_code, 404)
        self.assertEqual(so.get_json(self.client_, preview_url(self.company.id, 999999), self.token).status_code, 404)
        self.company.is_active = False
        self.company.save(update_fields=["is_active"])
        self.assertEqual(self.preview(order).status_code, 404)

    def test_only_get_is_allowed(self):
        order = self.make_sales_order()
        url = preview_url(self.company.id, order["id"])
        self.assertEqual(so.post_json(self.client_, url, {}, self.token).status_code, 405)
        self.assertEqual(so.patch_json(self.client_, url, {"expected_version": 1}, self.token).status_code, 405)
        self.assertEqual(self.client_.put(url, data="{}", content_type="application/json", **so.bearer(self.token)).status_code, 405)
        self.assertEqual(self.client_.delete(url, **so.bearer(self.token)).status_code, 405)


class ContentTests(PreviewBase):
    def test_lines_totals_and_workflow_reported_as_implemented(self):
        order = self.make_sales_order(lines=[self.line(quantity="12", unit_price="45.5"), self.line(self.p_mass, "2.5", "1000.3333")])
        body = self.preview(order).json()
        self.assertEqual([l["line_number"] for l in body["lines"]], [1, 2])
        self.assertEqual([l["line_amount"] for l in body["lines"]], ["546.00", "2500.83"])
        self.assertEqual(body["lines"][0]["sales_uom_code"], self.count_unit.code)
        self.assertEqual((body["subtotal"], body["subtotal"] == order["subtotal"]), ("3046.83", True))
        confirmation = body["confirmation"]
        self.assertTrue(confirmation["workflow_implemented"])
        self.assertNotIn("grand_total", body)
        for gone in ("open_policy_questions", "policy_observations", "data_validity_observations", "confirmation_workflow", "can_confirm"):
            self.assertNotIn(gone, body)
            self.assertNotIn(gone, confirmation)

    def test_unconfigured_policy_uses_plain_guidance_not_internal_questions(self):
        body = self.preview(self.make_sales_order()).json()["confirmation"]
        self.assertEqual(body["policy"]["status"], "NOT_CONFIGURED")
        self.assertIsNone(body["policy"]["version"])
        self.assertEqual(body["policy_message"], "Confirmation rules are not configured. Contact your administrator.")
        self.assertEqual([(r["code"], r["category"]) for r in body["blocking_reasons"]],
                         [("CONFIRMATION_POLICY_NOT_CONFIGURED", "POLICY_NOT_CONFIGURED")])
        self.assertFalse(body["ready_to_attempt"])
        text = json_text(body).lower()
        for internal in ("who_may_confirm", "open policy question", "client decision", "unresolved"):
            self.assertNotIn(internal, text)

    def test_incomplete_policy_is_reported(self):
        policy = self.configure()
        SalesOrderConfirmationPolicy.objects.filter(pk=policy.pk).update(allow_zero_price_lines=None)
        body = self.preview(self.make_sales_order()).json()["confirmation"]
        self.assertEqual(body["policy"]["status"], "INCOMPLETE")
        self.assertEqual(sorted(r["code"] for r in body["blocking_reasons"]), ["CONFIRMATION_POLICY_INCOMPLETE"])

    def test_configured_policy_values_are_exposed_without_administrative_detail(self):
        self.configure(self_confirmation=False, zero_price=True, past_date=False)
        policy = self.preview(self.make_sales_order()).json()["confirmation"]["policy"]
        self.assertEqual(
            policy,
            {"status": "CONFIGURED", "version": 1, "allow_self_confirmation": False, "allow_zero_price_lines": True,
             "allow_past_requested_delivery_dates": False},
        )
        self.assertNotIn("created_by_id", policy)
        self.assertNotIn("updated_by_id", policy)

    def test_clean_configured_order_has_no_blocking_reasons_and_readiness_needs_the_permission(self):
        self.configure()
        order = self.make_sales_order(requested_delivery_date="2999-01-01")
        body = self.preview(order).json()["confirmation"]
        self.assertEqual(body["blocking_reasons"], [])
        self.assertFalse(body["actor_has_confirm_permission"])
        self.assertFalse(body["ready_to_attempt"])
        confirmer = so.make_user("pconfirmer")
        so.grant_company_permission(self.superuser, confirmer, self.company, "sales_orders.view", "sales_orders.confirm")
        body = self.preview(order, so.access_token_for(confirmer)).json()["confirmation"]
        self.assertTrue(body["actor_has_confirm_permission"])
        self.assertTrue(body["ready_to_attempt"])

    def test_eligibility_issues_are_separate_from_policy_missing(self):
        self.configure()
        order = self.make_sales_order(lines=[self.line(), self.line(self.p_mass, "1", "5")])
        self.customer.is_active = False
        self.customer.save(update_fields=["is_active"])
        self.p_count.is_active = False
        self.p_count.save(update_fields=["is_active"])
        self.mass_unit.is_active = False
        self.mass_unit.save(update_fields=["is_active"])
        body = self.preview(order).json()
        reasons = body["confirmation"]["blocking_reasons"]
        self.assertEqual({r["category"] for r in reasons}, {"ELIGIBILITY"})
        self.assertEqual(sorted(r["code"] for r in reasons), ["INACTIVE_CUSTOMER", "INACTIVE_PRODUCT", "INACTIVE_SALES_UOM"])
        self.assertFalse(body["customer"]["is_active"])
        self.assertFalse(body["lines"][0]["current"]["product_is_active"])
        self.assertFalse(body["lines"][1]["current"]["sales_uom_is_active"])
        self.assertIsNone(body["confirmation"]["policy_message"])

    def test_empty_order_zero_price_and_past_date_follow_the_explicit_policy(self):
        today = business_today()
        empty = self.make_sales_order(lines=[])
        zero = self.make_sales_order(lines=[self.line(unit_price="10"), self.line(self.p_mass, "1", "0")])
        past = self.make_sales_order(
            order_date=(today - datetime.timedelta(days=9)).isoformat(),
            requested_delivery_date=(today - datetime.timedelta(days=1)).isoformat(),
        )
        self.configure(zero_price=False, past_date=False)
        self.assertEqual(self.codes(self.preview(empty).json()), ["EMPTY_ORDER"])
        zero_body = self.preview(zero).json()
        self.assertEqual(self.codes(zero_body), ["ZERO_PRICE_LINE"])
        zero_reason = zero_body["confirmation"]["blocking_reasons"][0]
        self.assertEqual((zero_reason["category"], zero_reason["line_number"]), ("POLICY_RULE", 2))
        self.assertEqual(self.codes(self.preview(past).json()), ["REQUESTED_DELIVERY_DATE_PAST"])
        SalesOrderConfirmationPolicy.objects.update(allow_zero_price_lines=True, allow_past_requested_delivery_dates=True)
        self.assertEqual(self.codes(self.preview(zero).json()), [])
        self.assertEqual(self.codes(self.preview(past).json()), [])
        self.assertEqual(self.codes(self.preview(zero).json(), "informational_observations"), ["ZERO_PRICE_LINES_ALLOWED_BY_POLICY"])
        self.assertEqual(self.codes(self.preview(past).json(), "informational_observations"), ["PAST_DELIVERY_DATE_ALLOWED_BY_POLICY"])

    def test_today_and_future_dates_are_not_past(self):
        self.configure(past_date=False)
        today = business_today()
        for delta in (0, 4):
            order = self.make_sales_order(order_date=today.isoformat(), requested_delivery_date=(today + datetime.timedelta(days=delta)).isoformat())
            self.assertEqual(self.codes(self.preview(order).json()), [], delta)

    def test_snapshots_are_returned_and_never_refreshed(self):
        self.configure()
        order = self.make_sales_order(lines=[self.line()])
        Product.objects.filter(pk=self.p_count.pk).update(name="Renamed Product", code="RENAMED")
        UnitOfMeasure.objects.filter(pk=self.count_unit.pk).update(name="Renamed Unit")
        before = self.snapshot_state(order["id"])
        body = self.preview(order).json()
        line = body["lines"][0]
        self.assertEqual((line["product_code"], line["product_name"]), ("PC", "PC Product"))
        self.assertEqual(line["sales_uom_name"], f"{self.count_unit.code} name")
        self.assertEqual((line["current"]["product_name"], line["current"]["product_code"], line["current"]["sales_uom_name"]),
                         ("Renamed Product", "RENAMED", "Renamed Unit"))
        info = body["confirmation"]["informational_observations"]
        self.assertEqual([o["code"] for o in info], ["MASTER_DATA_CHANGED_SINCE_SNAPSHOT"])
        self.assertEqual(body["confirmation"]["blocking_reasons"], [])  # a rename is informational, never blocking
        self.assertEqual(self.snapshot_state(order["id"]), before)

    def test_preview_reflects_the_current_version_after_edits(self):
        order = self.make_sales_order()
        self.assertEqual(self.patch(order, {"expected_version": 1, "notes": "changed"}).status_code, 200)
        self.assertEqual(self.preview(order).json()["order"]["version"], 2)


class ReadOnlyTests(PreviewBase):
    def test_repeated_previews_change_nothing(self):
        self.configure()
        order = self.make_sales_order(lines=[self.line(), self.line(self.p_mass, "1", "0")], requested_delivery_date="2026-09-01")
        before_state = self.snapshot_state(order["id"])
        audit_before = AuditLog.objects.count()
        orders_before = SalesOrder.objects.count()
        for _ in range(3):
            self.assertEqual(self.preview(order).status_code, 200)
        self.assertEqual(self.snapshot_state(order["id"]), before_state)
        self.assertEqual(AuditLog.objects.count(), audit_before)
        self.assertEqual(SalesOrder.objects.count(), orders_before)
        detail = so.get_json(self.client_, so.sales_order_url(self.company.id, order["id"]), self.token).json()
        self.assertEqual((detail["version"], detail["status"], detail["confirmed_by_id"]), (1, "DRAFT", None))

    def test_preview_issues_no_writes_or_locks(self):
        order = self.make_sales_order(lines=[self.line() for _ in range(4)])
        with CaptureQueriesContext(connection) as queries:
            self.assertEqual(self.preview(order).status_code, 200)
        statements = [q["sql"].lstrip().upper() for q in queries]
        self.assertEqual([s for s in statements if s.startswith(("INSERT", "UPDATE", "DELETE"))], [])
        self.assertEqual([s for s in statements if "FOR UPDATE" in s or "FOR NO KEY UPDATE" in s], [])
