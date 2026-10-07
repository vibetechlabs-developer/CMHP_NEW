import itertools
import json
import threading
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import connection
from django.test import Client, TestCase, TransactionTestCase
from rest_framework_simplejwt.tokens import AccessToken

from apps.audit.models import AuditLog
from apps.common.errors import Conflict
from apps.companies.models import Company
from apps.customers.admin import CustomerAdmin
from apps.customers.models import Customer
from apps.customers.services import (
    activate_customer,
    create_customer,
    deactivate_customer,
    update_customer,
)
from apps.permissions.services import create_company_role, replace_role_permissions
from apps.users.services import assign_company_membership, assign_membership_role

User = get_user_model()
PASSWORD = "a-strong-pass-1"

ALL_PERMS = [
    "customers.view",
    "customers.create",
    "customers.edit",
    "customers.activate",
    "customers.deactivate",
]


def customers_url(company_id):
    return f"/api/v1/companies/{company_id}/customers/"


def customer_url(company_id, customer_id):
    return f"/api/v1/companies/{company_id}/customers/{customer_id}/"


def activate_url(company_id, customer_id):
    return f"/api/v1/companies/{company_id}/customers/{customer_id}/activate/"


def deactivate_url(company_id, customer_id):
    return f"/api/v1/companies/{company_id}/customers/{customer_id}/deactivate/"


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


_creator_counter = itertools.count()


def make_customer(company, code, name=None, actor=None, **kwargs):
    if actor is None:
        actor = make_user(f"customercreator{next(_creator_counter)}")
    return Customer.objects.create(company=company, code=code, name=name or code, created_by=actor, **kwargs)


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
    role = create_company_role(actor=actor, company=company, code=f"ROLE{user.id}", name="Role")
    role, _ = replace_role_permissions(actor=actor, role=role, permission_codes=list(permission_codes))
    assign_membership_role(actor=actor, membership=membership, role=role)
    return membership, role


# ---------------------------------------------------------------------------
# Model
# ---------------------------------------------------------------------------


class CustomerModelTests(TestCase):
    def setUp(self):
        self.superuser = make_superuser("modeladmin")
        self.company_a = make_company("COMPA")
        self.company_b = make_company("COMPB")

    def test_code_is_normalized(self):
        customer = make_customer(self.company_a, "  acme ", name="Acme")
        self.assertEqual(customer.code, "ACME")

    def test_blank_code_rejected(self):
        with self.assertRaises(Exception):
            make_customer(self.company_a, "   ", name="X")

    def test_blank_name_rejected(self):
        with self.assertRaises(Exception):
            make_customer(self.company_a, "C1", name="   ")

    def test_invalid_email_rejected(self):
        with self.assertRaises(Exception):
            make_customer(self.company_a, "C1", name="X", email="not-an-email")

    def test_same_code_allowed_across_different_companies(self):
        make_customer(self.company_a, "SAME", name="A Co")
        # Must not raise - uniqueness is per-company only.
        make_customer(self.company_b, "SAME", name="B Co")
        self.assertEqual(Customer.objects.filter(code="SAME").count(), 2)

    def test_duplicate_code_within_same_company_rejected(self):
        make_customer(self.company_a, "DUP", name="First")
        with self.assertRaises(Exception):
            make_customer(self.company_a, "DUP", name="Second")

    def test_inactive_customer_still_reserves_its_code(self):
        customer = make_customer(self.company_a, "RESV", name="Original")
        customer.is_active = False
        customer.save(update_fields=["is_active"])
        with self.assertRaises(Exception):
            make_customer(self.company_a, "RESV", name="New Customer")

    def test_company_immutable_after_creation(self):
        customer = make_customer(self.company_a, "IMMC", name="X")
        customer.company = self.company_b
        with self.assertRaises(Exception):
            customer.save()

    def test_code_immutable_after_creation(self):
        customer = make_customer(self.company_a, "IMMK", name="X")
        customer.code = "CHANGED"
        with self.assertRaises(Exception):
            customer.save()

    def test_phone_preserves_international_prefix(self):
        customer = make_customer(self.company_a, "PH1", name="X", phone="+91 98765 43210")
        self.assertEqual(customer.phone, "+91 98765 43210")

    def test_shipping_address_not_defaulted_from_billing(self):
        customer = make_customer(self.company_a, "ADDR1", name="X", billing_address="123 Main St")
        self.assertEqual(customer.shipping_address, "")


# ---------------------------------------------------------------------------
# Access control
# ---------------------------------------------------------------------------


class CustomerAccessTestCase(TestCase):
    def setUp(self):
        self.superuser = make_superuser("accessadmin")
        self.company = make_company("ACCESSCO")
        self.other_company = make_company("OTHERCO")
        self.user = make_user("accessuser")
        self.client_ = Client()


class CustomerAccessTests(CustomerAccessTestCase):
    def test_anonymous_request_is_rejected(self):
        response = self.client_.get(customers_url(self.company.id))
        self.assertEqual(response.status_code, 401)

    def test_inactive_user_is_rejected(self):
        self.user.is_active = False
        self.user.save(update_fields=["is_active"])
        token = access_token_for(self.user)
        response = get_json(self.client_, customers_url(self.company.id), token)
        self.assertEqual(response.status_code, 401)

    def test_user_without_membership_gets_404(self):
        token = access_token_for(self.user)
        response = get_json(self.client_, customers_url(self.company.id), token)
        self.assertEqual(response.status_code, 404)

    def test_membership_in_inactive_company_gets_404(self):
        grant_company_permission(self.superuser, self.user, self.company, "customers.view")
        self.company.is_active = False
        self.company.save(update_fields=["is_active"])
        token = access_token_for(self.user)
        response = get_json(self.client_, customers_url(self.company.id), token)
        self.assertEqual(response.status_code, 404)

    def test_nonexistent_company_gets_404(self):
        grant_company_permission(self.superuser, self.user, self.company, "customers.view")
        token = access_token_for(self.user)
        response = get_json(self.client_, customers_url(999999), token)
        self.assertEqual(response.status_code, 404)

    def test_membership_without_permission_gets_403_naming_missing_permission(self):
        assign_company_membership(actor=self.superuser, user=self.user, company=self.company)
        token = access_token_for(self.user)
        response = get_json(self.client_, customers_url(self.company.id), token)
        self.assertEqual(response.status_code, 403)
        self.assertIn("customers.view", response.json()["detail"])

    def test_view_permission_does_not_grant_create(self):
        grant_company_permission(self.superuser, self.user, self.company, "customers.view")
        token = access_token_for(self.user)
        response = post_json(
            self.client_, customers_url(self.company.id), {"code": "C1", "name": "X"}, token
        )
        self.assertEqual(response.status_code, 403)
        self.assertIn("customers.create", response.json()["detail"])

    def test_superuser_has_no_implicit_bypass(self):
        token = access_token_for(self.superuser)
        response = get_json(self.client_, customers_url(self.company.id), token)
        self.assertEqual(response.status_code, 404)

    def test_company_isolation_on_detail_endpoint(self):
        grant_company_permission(self.superuser, self.user, self.company, "customers.view")
        grant_company_permission(self.superuser, self.user, self.other_company, "customers.view")
        customer = make_customer(self.other_company, "ISOL", name="X")
        token = access_token_for(self.user)
        response = get_json(self.client_, customer_url(self.company.id, customer.id), token)
        self.assertEqual(response.status_code, 404)

    def test_delete_requires_customers_delete(self):
        # DELETE is implemented and gated by customers.delete. ALL_PERMS does not
        # include it, so the request is refused and the customer is kept.
        grant_company_permission(self.superuser, self.user, self.company, *ALL_PERMS)
        customer = make_customer(self.company, "NODEL", name="X")
        token = access_token_for(self.user)
        response = self.client_.delete(customer_url(self.company.id, customer.id), **bearer(token))
        self.assertEqual(response.status_code, 403)
        self.assertTrue(Customer.objects.filter(pk=customer.id).exists())


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


class CustomerCreateTests(CustomerAccessTestCase):
    def setUp(self):
        super().setUp()
        grant_company_permission(self.superuser, self.user, self.company, *ALL_PERMS)
        self.token = access_token_for(self.user)

    def test_create_success(self):
        response = post_json(
            self.client_,
            customers_url(self.company.id),
            {"code": "cust1", "name": "Acme Pharma", "email": "buyer@acme.test"},
            self.token,
        )
        self.assertEqual(response.status_code, 201, response.content)
        body = response.json()
        self.assertEqual(body["code"], "CUST1")
        self.assertEqual(body["company_id"], self.company.id)
        self.assertTrue(body["is_active"])
        self.assertEqual(body["version"], 1)

    def test_create_records_audit_entry(self):
        response = post_json(
            self.client_, customers_url(self.company.id), {"code": "AUD1", "name": "X"}, self.token
        )
        customer_id = response.json()["id"]
        entry = AuditLog.objects.get(target_type="customer", target_id=customer_id, action="customer.created")
        self.assertEqual(entry.company_id, self.company.id)
        self.assertEqual(entry.after["code"], "AUD1")

    def test_create_rejects_company_id_in_body(self):
        response = post_json(
            self.client_,
            customers_url(self.company.id),
            {"code": "REJ1", "name": "X", "company_id": self.company.id},
            self.token,
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("company_id", response.json())

    def test_create_rejects_is_active_in_body(self):
        response = post_json(
            self.client_, customers_url(self.company.id), {"code": "REJ2", "name": "X", "is_active": False}, self.token
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("is_active", response.json())

    def test_create_rejects_version_in_body(self):
        response = post_json(
            self.client_, customers_url(self.company.id), {"code": "REJ3", "name": "X", "version": 5}, self.token
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("version", response.json())

    def test_create_rejects_invalid_email(self):
        response = post_json(
            self.client_, customers_url(self.company.id), {"code": "REJ4", "name": "X", "email": "bad"}, self.token
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("email", response.json())

    def test_create_requires_name(self):
        response = post_json(self.client_, customers_url(self.company.id), {"code": "REJ5"}, self.token)
        self.assertEqual(response.status_code, 400)

    def test_duplicate_code_same_company_returns_409(self):
        post_json(self.client_, customers_url(self.company.id), {"code": "DUP1", "name": "First"}, self.token)
        response = post_json(
            self.client_, customers_url(self.company.id), {"code": "dup1", "name": "Second"}, self.token
        )
        self.assertEqual(response.status_code, 409)

    def test_same_code_allowed_in_different_company(self):
        grant_company_permission(self.superuser, self.user, self.other_company, *ALL_PERMS)
        post_json(self.client_, customers_url(self.company.id), {"code": "XC", "name": "A Co"}, self.token)
        response = post_json(
            self.client_, customers_url(self.other_company.id), {"code": "XC", "name": "B Co"}, self.token
        )
        self.assertEqual(response.status_code, 201, response.content)

    def test_create_audit_rollback_on_failure(self):
        with patch("apps.customers.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                post_json(self.client_, customers_url(self.company.id), {"code": "RB1", "name": "X"}, self.token)
        self.assertEqual(Customer.objects.filter(company=self.company, code="RB1").count(), 0)


# ---------------------------------------------------------------------------
# List / search / filter
# ---------------------------------------------------------------------------


class CustomerListTests(CustomerAccessTestCase):
    def setUp(self):
        super().setUp()
        grant_company_permission(self.superuser, self.user, self.company, "customers.view")
        self.token = access_token_for(self.user)
        self.c1 = make_customer(self.company, "ALPHA", name="Alpha Traders", contact_person="Ravi")
        self.c2 = make_customer(self.company, "BETA", name="Beta Pharma", email="beta@example.com")
        self.c3 = make_customer(self.company, "GAMMA", name="Gamma Ltd", phone="+91 9000000000")
        self.c3.is_active = False
        self.c3.save(update_fields=["is_active"])

    def test_list_default_ordering_and_pagination_envelope(self):
        response = get_json(self.client_, customers_url(self.company.id), self.token)
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn("results", body)
        self.assertIn("count", body)
        codes = [row["code"] for row in body["results"]]
        self.assertEqual(codes, sorted(codes))

    def test_search_by_code(self):
        response = get_json(self.client_, customers_url(self.company.id) + "?search=ALPHA", self.token)
        codes = [row["code"] for row in response.json()["results"]]
        self.assertEqual(codes, ["ALPHA"])

    def test_search_by_contact_person(self):
        response = get_json(self.client_, customers_url(self.company.id) + "?search=Ravi", self.token)
        codes = [row["code"] for row in response.json()["results"]]
        self.assertEqual(codes, ["ALPHA"])

    def test_search_by_email(self):
        response = get_json(self.client_, customers_url(self.company.id) + "?search=beta@example.com", self.token)
        codes = [row["code"] for row in response.json()["results"]]
        self.assertEqual(codes, ["BETA"])

    def test_search_by_phone(self):
        response = get_json(self.client_, customers_url(self.company.id) + "?search=9000000000", self.token)
        codes = [row["code"] for row in response.json()["results"]]
        self.assertEqual(codes, ["GAMMA"])

    def test_is_active_filter_true(self):
        response = get_json(self.client_, customers_url(self.company.id) + "?is_active=true", self.token)
        codes = {row["code"] for row in response.json()["results"]}
        self.assertEqual(codes, {"ALPHA", "BETA"})

    def test_is_active_filter_false(self):
        response = get_json(self.client_, customers_url(self.company.id) + "?is_active=false", self.token)
        codes = {row["code"] for row in response.json()["results"]}
        self.assertEqual(codes, {"GAMMA"})

    def test_is_active_filter_rejects_non_strict_value(self):
        response = get_json(self.client_, customers_url(self.company.id) + "?is_active=yes", self.token)
        self.assertEqual(response.status_code, 400)


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------


class CustomerUpdateTests(CustomerAccessTestCase):
    def setUp(self):
        super().setUp()
        grant_company_permission(self.superuser, self.user, self.company, *ALL_PERMS)
        self.token = access_token_for(self.user)
        self.customer = make_customer(self.company, "UPD1", name="Original Name")

    def test_update_requires_expected_version(self):
        response = patch_json(
            self.client_, customer_url(self.company.id, self.customer.id), {"name": "New Name"}, self.token
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("expected_version", response.json())

    def test_update_success_bumps_version(self):
        response = patch_json(
            self.client_,
            customer_url(self.company.id, self.customer.id),
            {"expected_version": 1, "name": "New Name"},
            self.token,
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["name"], "New Name")
        self.assertEqual(response.json()["version"], 2)

    def test_stale_version_returns_409(self):
        patch_json(
            self.client_,
            customer_url(self.company.id, self.customer.id),
            {"expected_version": 1, "name": "First Change"},
            self.token,
        )
        response = patch_json(
            self.client_,
            customer_url(self.company.id, self.customer.id),
            {"expected_version": 1, "name": "Second Change"},
            self.token,
        )
        self.assertEqual(response.status_code, 409)

    def test_update_rejects_code(self):
        response = patch_json(
            self.client_,
            customer_url(self.company.id, self.customer.id),
            {"expected_version": 1, "code": "NEWCODE"},
            self.token,
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("code", response.json())

    def test_update_rejects_company_id(self):
        response = patch_json(
            self.client_,
            customer_url(self.company.id, self.customer.id),
            {"expected_version": 1, "company_id": self.other_company.id},
            self.token,
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("company_id", response.json())

    def test_no_op_update_does_not_bump_version_or_audit(self):
        AuditLog.objects.all().delete()
        response = patch_json(
            self.client_,
            customer_url(self.company.id, self.customer.id),
            {"expected_version": 1, "name": "Original Name"},
            self.token,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["version"], 1)
        self.assertEqual(AuditLog.objects.filter(target_type="customer", action="customer.updated").count(), 0)

    def test_whitespace_only_change_treated_as_no_op(self):
        AuditLog.objects.all().delete()
        response = patch_json(
            self.client_,
            customer_url(self.company.id, self.customer.id),
            {"expected_version": 1, "name": "  Original Name  "},
            self.token,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["version"], 1)
        self.assertEqual(AuditLog.objects.filter(target_type="customer", action="customer.updated").count(), 0)

    def test_can_clear_optional_field_with_empty_string(self):
        customer = make_customer(self.company, "CLR1", name="X", notes="some notes")
        response = patch_json(
            self.client_, customer_url(self.company.id, customer.id), {"expected_version": 1, "notes": ""}, self.token
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["notes"], "")

    def test_metadata_update_allowed_on_inactive_customer_when_company_active(self):
        deactivate_customer(actor=self.user, customer_id=self.customer.id, expected_version=1)
        response = patch_json(
            self.client_,
            customer_url(self.company.id, self.customer.id),
            {"expected_version": 2, "name": "Updated While Inactive"},
            self.token,
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["name"], "Updated While Inactive")
        self.assertFalse(response.json()["is_active"])

    def test_update_audit_before_after(self):
        patch_json(
            self.client_,
            customer_url(self.company.id, self.customer.id),
            {"expected_version": 1, "name": "Changed", "phone": "+91 1111111111"},
            self.token,
        )
        entry = AuditLog.objects.filter(target_type="customer", action="customer.updated").latest("id")
        self.assertEqual(entry.before["name"], "Original Name")
        self.assertEqual(entry.after["name"], "Changed")
        self.assertEqual(entry.after["phone"], "+91 1111111111")

    def test_update_audit_rollback_on_failure(self):
        with patch("apps.customers.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                patch_json(
                    self.client_,
                    customer_url(self.company.id, self.customer.id),
                    {"expected_version": 1, "name": "Should Not Persist"},
                    self.token,
                )
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.name, "Original Name")
        self.assertEqual(self.customer.version, 1)


# ---------------------------------------------------------------------------
# Lifecycle (activate / deactivate)
# ---------------------------------------------------------------------------


class CustomerLifecycleTests(CustomerAccessTestCase):
    def setUp(self):
        super().setUp()
        grant_company_permission(self.superuser, self.user, self.company, *ALL_PERMS)
        self.token = access_token_for(self.user)
        self.customer = make_customer(self.company, "LIFE1", name="X")

    def test_deactivate_requires_expected_version(self):
        response = post_json(self.client_, deactivate_url(self.company.id, self.customer.id), {}, self.token)
        self.assertEqual(response.status_code, 400)

    def test_deactivate_success(self):
        response = post_json(
            self.client_, deactivate_url(self.company.id, self.customer.id), {"expected_version": 1}, self.token
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertFalse(response.json()["is_active"])
        self.assertEqual(response.json()["version"], 2)

    def test_deactivate_never_deletes_the_row(self):
        post_json(
            self.client_, deactivate_url(self.company.id, self.customer.id), {"expected_version": 1}, self.token
        )
        self.assertTrue(Customer.objects.filter(pk=self.customer.id).exists())

    def test_deactivate_idempotent_no_op_on_current_version(self):
        deactivate_customer(actor=self.user, customer_id=self.customer.id, expected_version=1)
        AuditLog.objects.all().delete()
        self.customer.refresh_from_db()
        response = post_json(
            self.client_,
            deactivate_url(self.company.id, self.customer.id),
            {"expected_version": self.customer.version},
            self.token,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["version"], self.customer.version)
        self.assertEqual(AuditLog.objects.filter(action="customer.deactivated").count(), 0)

    def test_deactivate_stale_version_returns_409(self):
        deactivate_customer(actor=self.user, customer_id=self.customer.id, expected_version=1)
        response = post_json(
            self.client_, deactivate_url(self.company.id, self.customer.id), {"expected_version": 1}, self.token
        )
        self.assertEqual(response.status_code, 409)

    def test_activate_success(self):
        deactivate_customer(actor=self.user, customer_id=self.customer.id, expected_version=1)
        self.customer.refresh_from_db()
        response = post_json(
            self.client_,
            activate_url(self.company.id, self.customer.id),
            {"expected_version": self.customer.version},
            self.token,
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertTrue(response.json()["is_active"])

    def test_activate_idempotent_no_op_when_already_active(self):
        response = post_json(
            self.client_, activate_url(self.company.id, self.customer.id), {"expected_version": 1}, self.token
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["version"], 1)

    def test_deactivate_audit_before_after(self):
        post_json(
            self.client_, deactivate_url(self.company.id, self.customer.id), {"expected_version": 1}, self.token
        )
        entry = AuditLog.objects.get(target_type="customer", target_id=self.customer.id, action="customer.deactivated")
        self.assertEqual(entry.before, {"is_active": True})
        self.assertEqual(entry.after, {"is_active": False})
        self.assertEqual(entry.company_id, self.company.id)

    def test_deactivate_audit_rollback_on_failure(self):
        with patch("apps.customers.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                post_json(
                    self.client_, deactivate_url(self.company.id, self.customer.id), {"expected_version": 1}, self.token
                )
        self.customer.refresh_from_db()
        self.assertTrue(self.customer.is_active)
        self.assertEqual(self.customer.version, 1)

    def test_activate_requires_activate_permission_not_just_edit(self):
        limited_user = make_user("limitededituser")
        grant_company_permission(self.superuser, limited_user, self.company, "customers.view", "customers.edit")
        token = access_token_for(limited_user)
        deactivate_customer(actor=self.user, customer_id=self.customer.id, expected_version=1)
        self.customer.refresh_from_db()
        response = post_json(
            self.client_,
            activate_url(self.company.id, self.customer.id),
            {"expected_version": self.customer.version},
            token,
        )
        self.assertEqual(response.status_code, 403)
        self.assertIn("customers.activate", response.json()["detail"])


# ---------------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------------


class CustomerAdminTests(TestCase):
    def test_admin_is_read_only(self):
        admin_instance = CustomerAdmin(Customer, None)
        self.assertFalse(admin_instance.has_add_permission(None))
        self.assertFalse(admin_instance.has_change_permission(None))


# ---------------------------------------------------------------------------
# Concurrency
# ---------------------------------------------------------------------------


class ConcurrentCustomerTests(TransactionTestCase):
    serialized_rollback = True

    def test_concurrent_update_produces_exactly_one_winner(self):
        superuser = make_superuser("concurrentcustadmin")
        company = make_company("CONCURCUST")
        user = make_user("concurrentcustuser")
        grant_company_permission(superuser, user, company, *ALL_PERMS)
        customer = create_customer(actor=user, company=company, code="CONC1", name="Original")

        results = []
        barrier = threading.Barrier(2)

        def worker():
            try:
                barrier.wait(timeout=5)
                result = update_customer(
                    actor=user, customer_id=customer.id, expected_version=1, data={"name": "Changed"}
                )
                results.append(("ok", result.version))
            except Conflict:
                results.append(("conflict", None))
            finally:
                connection.close()

        threads = [threading.Thread(target=worker) for _ in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=10)

        outcomes = [r[0] for r in results]
        self.assertEqual(outcomes.count("ok"), 1, outcomes)
        self.assertEqual(outcomes.count("conflict"), 1, outcomes)

        customer.refresh_from_db()
        self.assertEqual(customer.version, 2)

    def test_concurrent_create_with_same_code_produces_exactly_one_winner(self):
        superuser = make_superuser("concurrentcreateadmin")
        company = make_company("CONCURCREATE")
        user = make_user("concurrentcreateuser")
        grant_company_permission(superuser, user, company, *ALL_PERMS)

        results = []
        barrier = threading.Barrier(2)

        def worker():
            try:
                barrier.wait(timeout=5)
                create_customer(actor=user, company=company, code="RACE1", name="Racer")
                results.append(("ok", None))
            except Conflict:
                results.append(("conflict", None))
            finally:
                connection.close()

        threads = [threading.Thread(target=worker) for _ in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=10)

        outcomes = [r[0] for r in results]
        self.assertEqual(outcomes.count("ok"), 1, outcomes)
        self.assertEqual(outcomes.count("conflict"), 1, outcomes)
        self.assertEqual(Customer.objects.filter(company=company, code="RACE1").count(), 1)
