import datetime
import itertools
import threading
from decimal import Decimal
from unittest.mock import patch

from django.db import connection
from django.test import TransactionTestCase, override_settings
from django.utils import timezone

from apps.audit.models import AuditLog
from apps.common.errors import Conflict
from apps.customers.models import Customer
from apps.customers.services import deactivate_customer
from apps.formulas.models import Formula
from apps.permissions.models import PermissionDefinition
from apps.quotations.models import Quotation
from apps.sales_orders import confirmation as confirmation_module
from apps.sales_orders import services as so_services
from apps.sales_orders.confirmation import ConfirmationBlocked, business_today
from apps.sales_orders.models import SalesOrder, SalesOrderConfirmationPolicy, SalesOrderLine
from apps.sales_orders.services import confirm_sales_order, update_confirmation_policy, update_sales_order
from tests import test_sales_orders as so

_names = itertools.count()


def confirm_url(company_id, order_id):
    return f"/api/v1/companies/{company_id}/sales-orders/{order_id}/confirm/"


def policy_url(company_id):
    return f"/api/v1/companies/{company_id}/sales-order-confirmation-policy/"


def preview_url(company_id, order_id):
    return f"/api/v1/companies/{company_id}/sales-orders/{order_id}/confirmation-preview/"


class ConfirmBase(so.SalesOrderBase):
    """`self.user` (the creator persona) holds view/create/edit only.
    `self.confirmer` holds view+confirm (an explicitly assigned 'business
    admin'), never by role name.
    """

    def setUp(self):
        super().setUp()
        self.confirmer, self.confirmer_token = self.actor("confirmer", "sales_orders.view", "sales_orders.confirm")

    def actor(self, name, *codes, company=None):
        user = so.make_user(f"{name}{next(_names)}")
        so.grant_company_permission(self.superuser, user, company or self.company, *codes)
        return user, so.access_token_for(user)

    def set_policy(self, self_confirmation=False, zero_price=False, past_date=False):
        return SalesOrderConfirmationPolicy.objects.create(
            company=self.company,
            allow_self_confirmation=self_confirmation,
            allow_zero_price_lines=zero_price,
            allow_past_requested_delivery_dates=past_date,
            created_by=self.superuser,
            updated_by=self.superuser,
        )

    def confirm(self, order, token=None, version=None, company_id=None):
        return so.post_json(
            self.client_,
            confirm_url(company_id or self.company.id, order["id"]),
            {"expected_version": order["version"] if version is None else version},
            token or self.confirmer_token,
        )

    def preview(self, order, token=None):
        return so.get_json(self.client_, preview_url(self.company.id, order["id"]), token or self.confirmer_token)

    def reasons(self, response):
        return sorted(r["code"] for r in response.json()["blocking_reasons"])

    def state(self, order_id):
        row = SalesOrder.objects.get(pk=order_id)
        return row.status, row.version, row.confirmed_by_id, row.confirmed_at, row.updated_at


class PolicyApiTests(ConfirmBase):
    def get_policy(self, token=None):
        return so.get_json(self.client_, policy_url(self.company.id), token or so.access_token_for(self.superuser))

    def patch_policy(self, payload, token=None):
        return so.patch_json(self.client_, policy_url(self.company.id), payload, token or so.access_token_for(self.superuser))

    def test_unconfigured_policy_reads_as_not_configured_with_version_zero(self):
        body = self.get_policy().json()
        self.assertEqual((body["status"], body["version"]), ("NOT_CONFIGURED", 0))
        self.assertEqual(
            [body["allow_self_confirmation"], body["allow_zero_price_lines"], body["allow_past_requested_delivery_dates"]],
            [None, None, None],
        )
        self.assertFalse(SalesOrderConfirmationPolicy.objects.exists())

    def test_only_active_superuser_may_read_or_configure(self):
        self.assertEqual(self.client_.get(policy_url(self.company.id)).status_code, 401)
        for token in (self.token, self.confirmer_token):
            self.assertEqual(self.get_policy(token).status_code, 403)
            self.assertEqual(self.patch_policy({"expected_version": 0, "allow_zero_price_lines": True}, token).status_code, 403)
        staff = so.make_user("staffonly")
        staff.is_staff = True
        staff.save(update_fields=["is_staff"])
        self.assertEqual(self.get_policy(so.access_token_for(staff)).status_code, 403)
        self.assertFalse(SalesOrderConfirmationPolicy.objects.exists())

    def test_unknown_company_404(self):
        response = so.get_json(self.client_, policy_url(999999), so.access_token_for(self.superuser))
        self.assertEqual(response.status_code, 404)

    def test_partial_create_is_incomplete_and_records_who_and_when(self):
        response = self.patch_policy({"expected_version": 0, "allow_zero_price_lines": True})
        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        self.assertEqual((body["status"], body["version"]), ("INCOMPLETE", 1))
        self.assertTrue(body["allow_zero_price_lines"])
        self.assertIsNone(body["allow_self_confirmation"])
        self.assertEqual((body["created_by_id"], body["updated_by_id"]), (self.superuser.id, self.superuser.id))
        self.assertIsNotNone(body["updated_at"])
        entry = AuditLog.objects.get(action="sales_order_confirmation_policy.created")
        self.assertEqual((entry.company_id, entry.actor_id), (self.company.id, self.superuser.id))

    def test_update_versions_audit_and_no_op(self):
        self.patch_policy({"expected_version": 0, "allow_zero_price_lines": False})
        body = self.patch_policy(
            {"expected_version": 1, "allow_self_confirmation": False, "allow_past_requested_delivery_dates": True}
        ).json()
        self.assertEqual((body["status"], body["version"]), ("CONFIGURED", 2))  # all three answered by now
        body = self.patch_policy({"expected_version": 2, "allow_self_confirmation": True}).json()
        self.assertEqual(body["version"], 3)
        entry = AuditLog.objects.filter(action="sales_order_confirmation_policy.updated").latest("id")
        self.assertFalse(entry.before["allow_self_confirmation"])
        self.assertTrue(entry.after["allow_self_confirmation"])
        audit_count = AuditLog.objects.count()
        again = self.patch_policy({"expected_version": 3, "allow_self_confirmation": True}).json()
        self.assertEqual(again["version"], 3)
        self.assertEqual(AuditLog.objects.count(), audit_count)
        self.assertEqual(self.get_policy().json()["status"], "CONFIGURED")

    def test_stale_and_bad_versions(self):
        self.patch_policy({"expected_version": 0, "allow_zero_price_lines": True})
        self.assertEqual(self.patch_policy({"expected_version": 0, "allow_zero_price_lines": False}).status_code, 409)
        self.assertEqual(self.patch_policy({"expected_version": 5, "allow_zero_price_lines": False}).status_code, 409)
        self.assertEqual(self.patch_policy({"allow_zero_price_lines": False}).status_code, 400)
        self.assertEqual(self.patch_policy({"expected_version": -1}).status_code, 400)

    def test_values_must_be_explicit_booleans_and_fields_allow_listed(self):
        self.assertEqual(self.patch_policy({"expected_version": 0}).status_code, 400)
        self.assertEqual(self.patch_policy({"expected_version": 0, "allow_zero_price_lines": None}).status_code, 400)
        self.assertEqual(self.patch_policy({"expected_version": 0, "allow_zero_price_lines": "maybe"}).status_code, 400)
        for field in ("version", "company_id", "updated_by", "created_by_id", "can_confirm", "junk"):
            response = self.patch_policy({"expected_version": 0, "allow_zero_price_lines": True, field: 1})
            self.assertEqual(response.status_code, 400, field)
        self.assertFalse(SalesOrderConfirmationPolicy.objects.exists())

    def test_audit_failure_rolls_back_policy_changes(self):
        with patch("apps.sales_orders.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                self.patch_policy({"expected_version": 0, "allow_zero_price_lines": True})
        self.assertFalse(SalesOrderConfirmationPolicy.objects.exists())
        policy = self.set_policy()
        with patch("apps.sales_orders.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                self.patch_policy({"expected_version": 1, "allow_zero_price_lines": True})
        policy.refresh_from_db()
        self.assertEqual((policy.version, policy.allow_zero_price_lines), (1, False))

    def test_configuring_the_policy_confers_no_confirmation_authority(self):
        self.patch_policy({"expected_version": 0, "allow_self_confirmation": True, "allow_zero_price_lines": True,
                           "allow_past_requested_delivery_dates": True})
        order = self.make_sales_order()
        response = self.confirm(order, token=so.access_token_for(self.superuser))
        self.assertEqual(response.status_code, 404)  # superuser has no membership: no business bypass
        self.assertEqual(SalesOrder.objects.get(pk=order["id"]).status, "DRAFT")

    def test_read_only_policy_admin(self):
        from apps.sales_orders.admin import SalesOrderConfirmationPolicyAdmin

        instance = SalesOrderConfirmationPolicyAdmin(SalesOrderConfirmationPolicy, None)
        self.assertFalse(instance.has_add_permission(None))
        self.assertFalse(instance.has_change_permission(None))


class PolicyGateTests(ConfirmBase):
    def test_missing_policy_blocks_with_structured_error(self):
        order = self.make_sales_order()
        before = self.state(order["id"])
        audit_before = AuditLog.objects.count()
        response = self.confirm(order)
        self.assertEqual(response.status_code, 400)
        body = response.json()
        self.assertEqual(body["code"], "confirmation_policy_not_configured")
        self.assertEqual(body["detail"], "Confirmation rules are not configured. Contact your administrator.")
        self.assertEqual([r["code"] for r in body["blocking_reasons"]], ["CONFIRMATION_POLICY_NOT_CONFIGURED"])
        self.assertEqual(body["blocking_reasons"][0]["category"], "POLICY_NOT_CONFIGURED")
        self.assertEqual(self.state(order["id"]), before)
        self.assertEqual(AuditLog.objects.count(), audit_before)

    def test_incomplete_policy_blocks(self):
        policy = self.set_policy()
        SalesOrderConfirmationPolicy.objects.filter(pk=policy.pk).update(allow_past_requested_delivery_dates=None)
        response = self.confirm(self.make_sales_order())
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "confirmation_policy_not_configured")
        self.assertEqual(self.reasons(response), ["CONFIRMATION_POLICY_INCOMPLETE"])

    def test_no_default_policy_is_ever_created(self):
        self.make_sales_order()
        self.assertFalse(SalesOrderConfirmationPolicy.objects.exists())
        self.assertEqual(self.confirm(self.make_sales_order()).status_code, 400)
        self.assertFalse(SalesOrderConfirmationPolicy.objects.exists())

    def test_policy_is_per_company(self):
        other_policy = SalesOrderConfirmationPolicy.objects.create(
            company=self.other_company, allow_self_confirmation=True, allow_zero_price_lines=True,
            allow_past_requested_delivery_dates=True, created_by=self.superuser, updated_by=self.superuser,
        )
        self.assertIsNotNone(other_policy.pk)
        self.assertEqual(self.confirm(self.make_sales_order()).status_code, 400)  # own company still unconfigured

    def test_self_confirmation_choice(self):
        creator, creator_token = self.actor("creator", "sales_orders.view", "sales_orders.create", "sales_orders.confirm")
        self.set_policy(self_confirmation=False)
        order = so.post_json(
            self.client_, so.sales_orders_url(self.company.id), self.payload(lines=[self.line()]), creator_token
        ).json()
        response = self.confirm(order, token=creator_token)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.reasons(response), ["SELF_CONFIRMATION_NOT_ALLOWED"])
        self.assertEqual(self.confirm(order).status_code, 200)  # a different confirmer is fine
        SalesOrderConfirmationPolicy.objects.filter(company=self.company).update(allow_self_confirmation=True)
        second = so.post_json(
            self.client_, so.sales_orders_url(self.company.id), self.payload(lines=[self.line()]), creator_token
        ).json()
        self.assertEqual(self.confirm(second, token=creator_token).status_code, 200)

    def test_zero_price_choice(self):
        order = self.make_sales_order(lines=[self.line(unit_price="10"), self.line(self.p_mass, "1", "0")])
        self.set_policy(zero_price=False)
        response = self.confirm(order)
        self.assertEqual(response.status_code, 400)
        blocking = response.json()["blocking_reasons"]
        self.assertEqual([(r["code"], r["category"], r["line_number"]) for r in blocking], [("ZERO_PRICE_LINE", "POLICY_RULE", 2)])
        SalesOrderConfirmationPolicy.objects.filter(company=self.company).update(allow_zero_price_lines=True)
        self.assertEqual(self.confirm(order).status_code, 200)

    def test_past_requested_delivery_date_choice(self):
        today = business_today()
        order = self.make_sales_order(
            order_date=(today - datetime.timedelta(days=10)).isoformat(),
            requested_delivery_date=(today - datetime.timedelta(days=1)).isoformat(),
        )
        self.set_policy(past_date=False)
        response = self.confirm(order)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.reasons(response), ["REQUESTED_DELIVERY_DATE_PAST"])
        SalesOrderConfirmationPolicy.objects.filter(company=self.company).update(allow_past_requested_delivery_dates=True)
        self.assertEqual(self.confirm(order).status_code, 200)

    def test_today_and_future_dates_are_never_past(self):
        self.set_policy(past_date=False)
        today = business_today()
        for delta in (0, 3):
            order = self.make_sales_order(requested_delivery_date=(today + datetime.timedelta(days=delta)).isoformat(),
                                          order_date=today.isoformat())
            self.assertEqual(self.confirm(order).status_code, 200, delta)


class BusinessDateTests(ConfirmBase):
    def test_business_date_follows_the_configured_business_timezone_not_utc(self):
        fixed = datetime.datetime(2026, 9, 24, 20, 0, tzinfo=datetime.timezone.utc)  # 01:30 on the 25th in Kolkata
        with patch.object(confirmation_module.timezone, "now", return_value=fixed):
            with override_settings(BUSINESS_TIME_ZONE="Asia/Kolkata"):
                self.assertEqual(business_today(), datetime.date(2026, 9, 25))
            with override_settings(BUSINESS_TIME_ZONE="UTC"):
                self.assertEqual(business_today(), datetime.date(2026, 9, 24))

    def test_default_setting_is_documented_assumption(self):
        from django.conf import settings

        self.assertEqual(settings.BUSINESS_TIME_ZONE, "Asia/Kolkata")

    def test_past_check_uses_business_date(self):
        self.set_policy(past_date=False)
        fixed = datetime.datetime(2026, 9, 24, 20, 0, tzinfo=datetime.timezone.utc)
        order = self.make_sales_order(order_date="2026-09-01", requested_delivery_date="2026-09-24")
        with patch.object(confirmation_module.timezone, "now", return_value=fixed):
            with override_settings(BUSINESS_TIME_ZONE="Asia/Kolkata"):
                self.assertEqual(self.confirm(order).status_code, 400)  # already the 25th in India
            with override_settings(BUSINESS_TIME_ZONE="UTC"):
                self.assertEqual(self.confirm(order).status_code, 200)  # still the 24th in UTC

    def test_confirmation_records_business_date_and_zone(self):
        self.set_policy()
        body = self.confirm(self.make_sales_order()).json()
        snapshot = body["confirmation_policy"]
        self.assertEqual(snapshot["business_time_zone"], "Asia/Kolkata")
        self.assertRegex(snapshot["business_date"], r"^\d{4}-\d{2}-\d{2}$")


class EligibilityTests(ConfirmBase):
    def setUp(self):
        super().setUp()
        self.set_policy(zero_price=True, past_date=True, self_confirmation=True)

    def test_empty_order_rejected(self):
        response = self.confirm(self.make_sales_order(lines=[]))
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.reasons(response), ["EMPTY_ORDER"])

    def test_inactive_references_rejected_with_line_reference(self):
        order = self.make_sales_order(lines=[self.line(), self.line(self.p_mass, "1", "5")])
        Customer.objects.filter(pk=self.customer.pk).update(is_active=False)
        self.p_count.is_active = False
        self.p_count.save(update_fields=["is_active"])
        self.mass_unit.is_active = False
        self.mass_unit.save(update_fields=["is_active"])
        response = self.confirm(order)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.reasons(response), ["INACTIVE_CUSTOMER", "INACTIVE_PRODUCT", "INACTIVE_SALES_UOM"])
        by_code = {r["code"]: r for r in response.json()["blocking_reasons"]}
        self.assertEqual(by_code["INACTIVE_PRODUCT"]["line_number"], 1)
        self.assertEqual(by_code["INACTIVE_SALES_UOM"]["line_number"], 2)
        self.assertIsInstance(by_code["INACTIVE_PRODUCT"]["line_id"], int)
        self.assertEqual(SalesOrder.objects.get(pk=order["id"]).status, "DRAFT")

    def test_invalid_quantity_amount_and_currency_rejected(self):
        order = self.make_sales_order(lines=[self.line(quantity="2")])
        line_id = order["lines"][0]["id"]
        SalesOrderLine.objects.filter(pk=line_id).update(quantity=Decimal("1.500"))  # fractional on a COUNT unit
        self.assertEqual(self.reasons(self.confirm(order)), ["INVALID_QUANTITY"])
        SalesOrderLine.objects.filter(pk=line_id).update(quantity=Decimal("2.000"), line_amount=Decimal("1.00"))
        self.assertEqual(self.reasons(self.confirm(order)), ["INVALID_MONETARY_VALUE"])
        SalesOrderLine.objects.filter(pk=line_id).update(line_amount=Decimal("21.00"))
        SalesOrder.objects.filter(pk=order["id"]).update(currency="12")
        self.assertEqual(self.reasons(self.confirm(order)), ["INVALID_CURRENCY"])


class AuthorizationTests(ConfirmBase):
    def setUp(self):
        super().setUp()
        self.set_policy()

    def test_anonymous_and_no_membership(self):
        order = self.make_sales_order()
        self.assertEqual(self.client_.post(confirm_url(self.company.id, order["id"])).status_code, 401)
        outsider = so.make_user("coutsider")
        self.assertEqual(self.confirm(order, token=so.access_token_for(outsider)).status_code, 404)

    def test_view_alone_and_confirm_alone_are_not_enough(self):
        order = self.make_sales_order()
        _, view_token = self.actor("viewonly", "sales_orders.view")
        response = self.confirm(order, token=view_token)
        self.assertEqual(response.status_code, 403)
        self.assertIn("sales_orders.confirm", response.json()["detail"])
        _, confirm_token = self.actor("confirmonly", "sales_orders.confirm")
        response = self.confirm(order, token=confirm_token)
        self.assertEqual(response.status_code, 403)
        self.assertIn("sales_orders.view", response.json()["detail"])
        _, edit_token = self.actor("editor", "sales_orders.view", "sales_orders.create", "sales_orders.edit")
        self.assertEqual(self.confirm(order, token=edit_token).status_code, 403)
        self.assertEqual(self.state(order["id"])[0], "DRAFT")

    def test_no_superuser_staff_or_role_name_bypass(self):
        order = self.make_sales_order()
        self.assertEqual(self.confirm(order, token=so.access_token_for(self.superuser)).status_code, 404)
        member_super = so.make_superuser("membersuper")
        so.assign_company_membership(actor=self.superuser, user=member_super, company=self.company)
        self.assertEqual(self.confirm(order, token=so.access_token_for(member_super)).status_code, 403)
        staff = so.make_user("staffmember")
        staff.is_staff = True
        staff.save(update_fields=["is_staff"])
        so.assign_company_membership(actor=self.superuser, user=staff, company=self.company)
        self.assertEqual(self.confirm(order, token=so.access_token_for(staff)).status_code, 403)
        admin_named, _ = self.actor("adminnamed", "sales_orders.view")
        from apps.permissions.models import CompanyRole

        CompanyRole.objects.filter(code=f"ROLE{admin_named.id}").update(name="Admin", code="ADMIN")
        self.assertEqual(self.confirm(order, token=so.access_token_for(admin_named)).status_code, 403)

    def test_company_isolation(self):
        order = self.make_sales_order()
        so.grant_company_permission(self.superuser, self.confirmer, self.other_company, "sales_orders.view", "sales_orders.confirm")
        self.assertEqual(self.confirm(order, company_id=self.other_company.id).status_code, 404)
        self.company.is_active = False
        self.company.save(update_fields=["is_active"])
        self.assertEqual(self.confirm(order).status_code, 404)

    def test_permission_is_seeded_company_scoped_and_assigned_to_nobody(self):
        definition = PermissionDefinition.objects.get(code="sales_orders.confirm")
        self.assertEqual(definition.scope, "COMPANY")
        self.assertTrue(definition.is_active)
        fresh = PermissionDefinition.objects.filter(code__startswith="sales_orders.").values_list("code", flat=True)
        self.assertEqual(set(fresh), {"sales_orders.view", "sales_orders.create", "sales_orders.edit", "sales_orders.confirm"})

    def test_body_allow_list(self):
        order = self.make_sales_order()
        url = confirm_url(self.company.id, order["id"])
        self.assertEqual(so.post_json(self.client_, url, {}, self.confirmer_token).status_code, 400)
        for extra in ({"status": "CONFIRMED"}, {"confirmed_by": 1}, {"policy": {}}, {"junk": 1}):
            response = so.post_json(self.client_, url, {"expected_version": 1, **extra}, self.confirmer_token)
            self.assertEqual(response.status_code, 400, extra)
        self.assertEqual(self.client_.get(url, **so.bearer(self.confirmer_token)).status_code, 405)


class ConfirmSuccessTests(ConfirmBase):
    def setUp(self):
        super().setUp()
        self.policy = self.set_policy(zero_price=True)

    def test_successful_confirmation_records_context(self):
        order = self.make_sales_order(lines=[self.line(), self.line(self.p_mass, "1", "0")])
        lines_before = list(SalesOrderLine.objects.filter(sales_order_id=order["id"]).order_by("id").values())
        response = self.confirm(order)
        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        self.assertEqual((body["status"], body["version"]), ("CONFIRMED", 2))
        self.assertEqual(body["confirmed_by_id"], self.confirmer.id)
        self.assertIsNotNone(body["confirmed_at"])
        self.assertEqual(body["confirmation_policy_version"], 1)
        snapshot = body["confirmation_policy"]
        self.assertEqual(
            (snapshot["allow_self_confirmation"], snapshot["allow_zero_price_lines"], snapshot["allow_past_requested_delivery_dates"]),
            (False, True, False),
        )
        self.assertIn("at least one line", snapshot["eligibility_safeguards"])
        self.assertEqual(list(SalesOrderLine.objects.filter(sales_order_id=order["id"]).order_by("id").values()), lines_before)
        entry = AuditLog.objects.get(action="sales_order.confirmed", target_id=order["id"])
        self.assertEqual((entry.company_id, entry.actor_id, entry.before), (self.company.id, self.confirmer.id, {"status": "DRAFT"}))
        self.assertEqual(entry.after["policy"]["version"], 1)
        self.assertEqual(entry.after["status"], "CONFIRMED")

    def test_recorded_policy_survives_later_policy_changes(self):
        order = self.make_sales_order()
        self.confirm(order)
        update_confirmation_policy(
            actor=self.superuser, company=self.company, expected_version=1, data={"allow_zero_price_lines": False}
        )
        stored = SalesOrder.objects.get(pk=order["id"])
        self.assertEqual(stored.confirmation_policy_version, 1)
        self.assertTrue(stored.confirmation_policy_snapshot["allow_zero_price_lines"])
        self.assertEqual(SalesOrderConfirmationPolicy.objects.get().version, 2)

    def test_no_stock_production_or_conversion_side_effects(self):
        order = self.make_sales_order()
        tables = (Quotation.objects.count(), Formula.objects.count(), SalesOrder.objects.count(), SalesOrderLine.objects.count())
        audit_before = AuditLog.objects.count()
        self.assertEqual(self.confirm(order).status_code, 200)
        self.assertEqual((Quotation.objects.count(), Formula.objects.count(), SalesOrder.objects.count(), SalesOrderLine.objects.count()), tables)
        self.assertEqual(AuditLog.objects.count(), audit_before + 1)
        detail = so.get_json(self.client_, so.sales_order_url(self.company.id, order["id"]), self.confirmer_token).json()
        for absent in ("reserved_quantity", "dispatched_quantity", "stock", "invoice_id", "quotation_id", "batch_id"):
            self.assertNotIn(absent, detail)

    def test_audit_failure_rolls_back_everything(self):
        order = self.make_sales_order()
        before = self.state(order["id"])
        with patch("apps.sales_orders.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                self.confirm(order)
        self.assertEqual(self.state(order["id"]), before)
        stored = SalesOrder.objects.get(pk=order["id"])
        self.assertIsNone(stored.confirmation_policy_snapshot)
        self.assertIsNone(stored.confirmed_by_id)


class RetryAndConflictTests(ConfirmBase):
    def setUp(self):
        super().setUp()
        self.set_policy()

    def test_stale_expected_version_is_409(self):
        order = self.make_sales_order()
        self.assertEqual(self.patch(order, {"expected_version": 1, "notes": "changed"}).status_code, 200)
        response = self.confirm(order, version=1)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(SalesOrder.objects.get(pk=order["id"]).status, "DRAFT")

    def test_repeat_at_current_version_is_a_silent_no_op_for_an_authorized_user(self):
        order = self.make_sales_order()
        confirmed = self.confirm(order).json()
        state = self.state(order["id"])
        audit_count = AuditLog.objects.count()
        again = self.confirm(order, version=confirmed["version"])
        self.assertEqual(again.status_code, 200)
        self.assertEqual(again.json()["confirmed_at"], confirmed["confirmed_at"])
        self.assertEqual(again.json()["version"], confirmed["version"])
        self.assertEqual(self.state(order["id"]), state)
        self.assertEqual(AuditLog.objects.count(), audit_count)
        # a repeat carrying the OLD (pre-confirm) version is a normal conflict, not a silent no-op
        self.assertEqual(self.confirm(order, version=1).status_code, 409)

    def test_repeat_by_a_user_who_lost_authority_is_denied(self):
        order = self.make_sales_order()
        confirmed = self.confirm(order).json()
        from apps.permissions.services import replace_role_permissions
        from apps.permissions.models import CompanyRole

        role = CompanyRole.objects.get(code=f"ROLE{self.confirmer.id}")
        replace_role_permissions(actor=self.superuser, role=role, permission_codes=["sales_orders.view"])
        response = self.confirm(order, version=confirmed["version"])
        self.assertEqual(response.status_code, 403)

    def test_access_is_rechecked_inside_the_service(self):
        order = self.make_sales_order()
        from apps.permissions.models import CompanyRole
        from apps.permissions.services import replace_role_permissions

        role = CompanyRole.objects.get(code=f"ROLE{self.confirmer.id}")
        replace_role_permissions(actor=self.superuser, role=role, permission_codes=["sales_orders.view"])
        from apps.common.errors import Forbidden

        with self.assertRaises(Forbidden):
            confirm_sales_order(
                actor=self.confirmer, company_id=self.company.id, sales_order_id=order["id"], expected_version=1
            )
        self.assertEqual(SalesOrder.objects.get(pk=order["id"]).status, "DRAFT")


class ImmutabilityTests(ConfirmBase):
    def setUp(self):
        super().setUp()
        self.set_policy()
        self.order = self.make_sales_order(lines=[self.line(), self.line(self.p_mass, "1", "5")])
        self.confirmed = self.confirm(self.order).json()

    def test_header_and_line_edits_rejected_after_confirmation(self):
        version = self.confirmed["version"]
        line = self.confirmed["lines"][0]
        header = self.patch(self.order, {"expected_version": version, "notes": "sneaky"})
        self.assertEqual(header.status_code, 400)
        lines = self.patch(
            self.order,
            {"expected_version": version, "lines": [{"id": line["id"], "product_id": self.p_count.id, "quantity": "99", "unit_price": "1"}]},
        )
        self.assertEqual(lines.status_code, 400)
        self.assertEqual(self.patch(self.order, {"expected_version": 1, "notes": "stale"}).status_code, 409)
        clear = self.patch(self.order, {"expected_version": version, "lines": []})
        self.assertEqual(clear.status_code, 400)
        stored = SalesOrder.objects.get(pk=self.order["id"])
        self.assertEqual((stored.notes, stored.version, stored.lines.count()), ("", version, 2))

    def test_service_layer_also_rejects_edits(self):
        from django.core.exceptions import ValidationError

        with self.assertRaises(ValidationError):
            update_sales_order(
                actor=self.user, sales_order_id=self.order["id"], expected_version=self.confirmed["version"], data={"notes": "x"}
            )

    def test_no_unconfirm_cancel_or_amend_endpoints(self):
        base = f"/api/v1/companies/{self.company.id}/sales-orders/{self.order['id']}"
        for action in ("unconfirm", "cancel", "amend", "reopen"):
            response = so.post_json(self.client_, f"{base}/{action}/", {"expected_version": 2}, self.confirmer_token)
            self.assertEqual(response.status_code, 404, action)
        self.assertEqual(self.client_.delete(f"{base}/", **so.bearer(self.confirmer_token)).status_code, 405)

    def test_confirmed_order_stays_readable_after_masters_deactivate(self):
        snapshots = [(l["product_code"], l["product_name"], l["sales_uom_code"], l["sales_uom_name"]) for l in self.confirmed["lines"]]
        Customer.objects.filter(pk=self.customer.pk).update(is_active=False)
        self.p_count.is_active = False
        self.p_count.save(update_fields=["is_active"])
        self.mass_unit.is_active = False
        self.mass_unit.save(update_fields=["is_active"])
        detail = so.get_json(self.client_, so.sales_order_url(self.company.id, self.order["id"]), self.confirmer_token).json()
        self.assertEqual(detail["status"], "CONFIRMED")
        self.assertEqual([(l["product_code"], l["product_name"], l["sales_uom_code"], l["sales_uom_name"]) for l in detail["lines"]], snapshots)
        self.assertFalse(detail["customer_is_active"])
        self.assertFalse(detail["lines"][0]["product_is_active"])
        preview = self.preview(self.confirmed).json()
        self.assertEqual(preview["order"]["status"], "CONFIRMED")
        self.assertIn("ORDER_NOT_DRAFT", [r["code"] for r in preview["confirmation"]["blocking_reasons"]])
        self.assertFalse(preview["confirmation"]["ready_to_attempt"])

    def test_confirmed_orders_remain_listable_and_filterable(self):
        response = so.get_json(self.client_, so.sales_orders_url(self.company.id), self.confirmer_token)
        self.assertEqual([row["status"] for row in response.json()["results"]], ["CONFIRMED"])


class PreviewConsistencyTests(ConfirmBase):
    """The preview and the command call the same assessment, so for every
    scenario the preview's blocking codes equal the command's rejection.
    A preview is still never a guarantee (see the stale test below).
    """

    def codes_of_preview(self, order, token=None):
        body = self.preview(order, token).json()["confirmation"]
        return sorted(r["code"] for r in body["blocking_reasons"]), body

    def scenario_orders(self):
        today = business_today()
        return {
            "empty": self.make_sales_order(lines=[]),
            "zero": self.make_sales_order(lines=[self.line(unit_price="0")]),
            "past": self.make_sales_order(
                order_date=(today - datetime.timedelta(days=5)).isoformat(),
                requested_delivery_date=(today - datetime.timedelta(days=1)).isoformat(),
            ),
            "clean": self.make_sales_order(),
        }

    def test_same_blocking_codes_when_policy_is_restrictive(self):
        self.set_policy(self_confirmation=False, zero_price=False, past_date=False)
        for name, order in self.scenario_orders().items():
            preview_codes, body = self.codes_of_preview(order)
            response = self.confirm(order)
            if preview_codes:
                self.assertEqual(response.status_code, 400, name)
                self.assertEqual(self.reasons(response), preview_codes, name)
                self.assertFalse(body["ready_to_attempt"], name)
            else:
                self.assertEqual(response.status_code, 200, name)
                self.assertTrue(body["ready_to_attempt"], name)

    def test_same_outcome_when_policy_is_missing_or_permissive(self):
        orders = self.scenario_orders()
        for name, order in orders.items():  # missing policy
            preview_codes, body = self.codes_of_preview(order)
            self.assertIn("CONFIRMATION_POLICY_NOT_CONFIGURED", preview_codes, name)
            self.assertEqual(body["policy"]["status"], "NOT_CONFIGURED")
            self.assertEqual(self.reasons(self.confirm(order)), preview_codes, name)
        self.set_policy(self_confirmation=True, zero_price=True, past_date=True)
        for name, order in orders.items():
            preview_codes, _ = self.codes_of_preview(order)
            response = self.confirm(order)
            if name == "empty":
                self.assertEqual(preview_codes, ["EMPTY_ORDER"])
                self.assertEqual(self.reasons(response), ["EMPTY_ORDER"])
            else:
                self.assertEqual((preview_codes, response.status_code), ([], 200), name)

    def test_preview_never_guarantees_later_success(self):
        self.set_policy()
        order = self.make_sales_order()
        codes, body = self.codes_of_preview(order)
        self.assertEqual(codes, [])
        self.assertTrue(body["ready_to_attempt"])
        Customer.objects.filter(pk=self.customer.pk).update(is_active=False)  # changes after the review
        response = self.confirm(order)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.reasons(response), ["INACTIVE_CUSTOMER"])
        self.assertIn("does not guarantee", self.preview(order).json()["preview"]["notice"])

    def test_self_confirmation_appears_in_the_preview_for_the_creator(self):
        self.set_policy(self_confirmation=False)
        creator, creator_token = self.actor("creator2", "sales_orders.view", "sales_orders.create", "sales_orders.confirm")
        order = so.post_json(self.client_, so.sales_orders_url(self.company.id), self.payload(lines=[self.line()]), creator_token).json()
        self.assertEqual(self.codes_of_preview(order, creator_token)[0], ["SELF_CONFIRMATION_NOT_ALLOWED"])
        self.assertEqual(self.codes_of_preview(order, self.confirmer_token)[0], [])


class ConcurrencyTests(TransactionTestCase):
    serialized_rollback = True

    def _setup(self, suffix, policy=True):
        superuser = so.make_superuser(f"ccadmin{suffix}")
        creator = so.make_user(f"cccreator{suffix}")
        confirmer = so.make_user(f"ccconfirmer{suffix}")
        company = so.make_company(f"CC{suffix}")
        unit = so.make_unit(f"CCU{suffix}", "COUNT")
        customer = so.make_customer(company, "C1", superuser)
        product = so.make_product(company, "P1", unit, superuser)
        so.grant_company_permission(superuser, creator, company, "sales_orders.view", "sales_orders.create", "sales_orders.edit")
        so.grant_company_permission(superuser, confirmer, company, "sales_orders.view", "sales_orders.confirm")
        if policy:
            SalesOrderConfirmationPolicy.objects.create(
                company=company, allow_self_confirmation=False, allow_zero_price_lines=False,
                allow_past_requested_delivery_dates=False, created_by=superuser, updated_by=superuser,
            )
        order = so_services.create_sales_order(
            actor=creator, company=company, customer_id=customer.id, order_date=datetime.date.today(), currency="INR",
            lines=[{"product_id": product.id, "quantity": Decimal("2"), "unit_price": Decimal("5")}],
        )
        return dict(superuser=superuser, creator=creator, confirmer=confirmer, company=company, customer=customer,
                    product=product, unit=unit, order=order)

    def _run(self, workers):
        threads = [threading.Thread(target=w) for w in workers]
        for t in threads:
            t.start()
        return threads

    def test_confirm_versus_edit_race_has_exactly_one_winner_and_no_partial_update(self):
        ctx = self._setup("A")
        outcomes = {}
        barrier = threading.Barrier(2)

        def confirm():
            try:
                barrier.wait(timeout=5)
                confirm_sales_order(actor=ctx["confirmer"], company_id=ctx["company"].id,
                                    sales_order_id=ctx["order"].id, expected_version=1)
                outcomes["confirm"] = "ok"
            except Conflict:
                outcomes["confirm"] = "conflict"
            finally:
                connection.close()

        def edit():
            try:
                barrier.wait(timeout=5)
                update_sales_order(actor=ctx["creator"], sales_order_id=ctx["order"].id, expected_version=1,
                                   data={"notes": "edited"})
                outcomes["edit"] = "ok"
            except Conflict:
                outcomes["edit"] = "conflict"
            finally:
                connection.close()

        for t in self._run([confirm, edit]):
            t.join(timeout=30)
        self.assertEqual(sorted(outcomes.values()), ["conflict", "ok"], outcomes)
        stored = SalesOrder.objects.get(pk=ctx["order"].id)
        self.assertEqual(stored.version, 2)
        if outcomes["confirm"] == "ok":
            self.assertEqual((stored.status, stored.notes), ("CONFIRMED", ""))
        else:
            self.assertEqual((stored.status, stored.notes), ("DRAFT", "edited"))
            self.assertIsNone(stored.confirmed_by_id)

    def test_concurrent_confirmations_produce_one_transition(self):
        ctx = self._setup("B")
        outcomes = []
        barrier = threading.Barrier(2)

        def confirm():
            try:
                barrier.wait(timeout=5)
                confirm_sales_order(actor=ctx["confirmer"], company_id=ctx["company"].id,
                                    sales_order_id=ctx["order"].id, expected_version=1)
                outcomes.append("ok")
            except Conflict:
                outcomes.append("conflict")
            finally:
                connection.close()

        for t in self._run([confirm, confirm]):
            t.join(timeout=30)
        self.assertEqual(sorted(outcomes), ["conflict", "ok"])
        self.assertEqual(AuditLog.objects.filter(action="sales_order.confirmed").count(), 1)
        self.assertEqual(SalesOrder.objects.get(pk=ctx["order"].id).version, 2)

    def _paused_confirm(self, ctx, inside, release, results):
        """Runs a confirmation whose assessment pauses AFTER all locks are
        held, so another transaction can be started against the same rows.
        """
        original = so_services.assess_confirmation

        def slow_assess(*args, **kwargs):
            inside.set()
            release.wait(timeout=20)
            return original(*args, **kwargs)

        def run():
            try:
                with patch.object(so_services, "assess_confirmation", side_effect=slow_assess):
                    confirm_sales_order(actor=ctx["confirmer"], company_id=ctx["company"].id,
                                        sales_order_id=ctx["order"].id, expected_version=1)
                results["confirm"] = "ok"
            except Exception as exc:  # noqa: BLE001 - reported through the assertion
                results["confirm"] = exc
            finally:
                connection.close()

        return run

    def test_deactivation_waits_for_an_in_flight_confirmation_and_applies_afterwards(self):
        ctx = self._setup("C")
        inside, release = threading.Event(), threading.Event()
        results = {}
        confirm_thread = threading.Thread(target=self._paused_confirm(ctx, inside, release, results))
        confirm_thread.start()
        self.assertTrue(inside.wait(timeout=20))

        def deactivate():
            try:
                deactivate_customer(actor=ctx["superuser"], customer_id=ctx["customer"].id, expected_version=1)
                results["deactivate"] = "ok"
            except Exception as exc:  # noqa: BLE001
                results["deactivate"] = exc
            finally:
                connection.close()

        deactivate_thread = threading.Thread(target=deactivate)
        deactivate_thread.start()
        deactivate_thread.join(timeout=1.5)
        self.assertTrue(deactivate_thread.is_alive(), "deactivation must wait for the confirming transaction's lock")
        self.assertTrue(Customer.objects.get(pk=ctx["customer"].id).is_active)
        release.set()
        confirm_thread.join(timeout=30)
        deactivate_thread.join(timeout=30)
        self.assertEqual(results, {"confirm": "ok", "deactivate": "ok"})
        self.assertEqual(SalesOrder.objects.get(pk=ctx["order"].id).status, "CONFIRMED")
        self.assertFalse(Customer.objects.get(pk=ctx["customer"].id).is_active)

    def test_a_committed_deactivation_is_seen_by_the_next_confirmation(self):
        ctx = self._setup("D")
        deactivate_customer(actor=ctx["superuser"], customer_id=ctx["customer"].id, expected_version=1)
        with self.assertRaises(ConfirmationBlocked) as raised:
            confirm_sales_order(actor=ctx["confirmer"], company_id=ctx["company"].id,
                                sales_order_id=ctx["order"].id, expected_version=1)
        self.assertEqual([r["code"] for r in raised.exception.detail["blocking_reasons"]], ["INACTIVE_CUSTOMER"])

    def test_unit_deactivation_without_its_own_lock_still_waits_for_confirmation(self):
        ctx = self._setup("E")
        inside, release = threading.Event(), threading.Event()
        results = {}
        confirm_thread = threading.Thread(target=self._paused_confirm(ctx, inside, release, results))
        confirm_thread.start()
        self.assertTrue(inside.wait(timeout=20))
        # the demo unit is referenced by an active product, so deactivate_unit itself would only be
        # blocked for materials; here we deactivate the unit row directly through the same UPDATE path
        from apps.catalog.models import UnitOfMeasure

        def deactivate():
            try:
                UnitOfMeasure.objects.filter(pk=ctx["unit"].id).update(is_active=False)
                results["unit"] = "ok"
            finally:
                connection.close()

        thread = threading.Thread(target=deactivate)
        thread.start()
        thread.join(timeout=1.5)
        self.assertTrue(thread.is_alive(), "a unit UPDATE must block on the confirming transaction's row lock")
        release.set()
        confirm_thread.join(timeout=30)
        thread.join(timeout=30)
        self.assertEqual(results.get("confirm"), "ok")
        self.assertEqual(SalesOrder.objects.get(pk=ctx["order"].id).status, "CONFIRMED")
        self.assertFalse(UnitOfMeasure.objects.get(pk=ctx["unit"].id).is_active)

    def test_policy_change_waits_and_the_order_records_the_policy_version_it_used(self):
        ctx = self._setup("F")
        inside, release = threading.Event(), threading.Event()
        results = {}
        confirm_thread = threading.Thread(target=self._paused_confirm(ctx, inside, release, results))
        confirm_thread.start()
        self.assertTrue(inside.wait(timeout=20))

        def change_policy():
            try:
                update_confirmation_policy(actor=ctx["superuser"], company=ctx["company"], expected_version=1,
                                           data={"allow_zero_price_lines": True})
                results["policy"] = "ok"
            except Exception as exc:  # noqa: BLE001
                results["policy"] = exc
            finally:
                connection.close()

        thread = threading.Thread(target=change_policy)
        thread.start()
        thread.join(timeout=1.5)
        self.assertTrue(thread.is_alive(), "a policy update must wait for the in-flight confirmation")
        release.set()
        confirm_thread.join(timeout=30)
        thread.join(timeout=30)
        self.assertEqual(results, {"confirm": "ok", "policy": "ok"})
        order = SalesOrder.objects.get(pk=ctx["order"].id)
        self.assertEqual(order.confirmation_policy_version, 1)
        self.assertFalse(order.confirmation_policy_snapshot["allow_zero_price_lines"])
        self.assertEqual(SalesOrderConfirmationPolicy.objects.get(company=ctx["company"]).version, 2)

    def test_concurrent_policy_creation_has_one_winner(self):
        ctx = self._setup("G", policy=False)
        outcomes = []
        barrier = threading.Barrier(2)

        def create():
            try:
                barrier.wait(timeout=5)
                update_confirmation_policy(actor=ctx["superuser"], company=ctx["company"], expected_version=0,
                                           data={"allow_zero_price_lines": True})
                outcomes.append("ok")
            except Conflict:
                outcomes.append("conflict")
            finally:
                connection.close()

        for t in self._run([create, create]):
            t.join(timeout=30)
        self.assertEqual(sorted(outcomes), ["conflict", "ok"])
        self.assertEqual(SalesOrderConfirmationPolicy.objects.filter(company=ctx["company"]).count(), 1)
