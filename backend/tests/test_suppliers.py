import json
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import Client, RequestFactory, TestCase
from rest_framework_simplejwt.tokens import AccessToken

from apps.audit.models import AuditLog
from apps.suppliers.admin import SupplierAdmin
from apps.suppliers.models import Supplier

User = get_user_model()
PASSWORD = "a-strong-pass-1"

SUPPLIERS_URL = "/api/v1/suppliers/"


def supplier_url(supplier_id):
    return f"/api/v1/suppliers/{supplier_id}/"


def supplier_activate_url(supplier_id):
    return f"/api/v1/suppliers/{supplier_id}/activate/"


def supplier_deactivate_url(supplier_id):
    return f"/api/v1/suppliers/{supplier_id}/deactivate/"


def make_user(username, password=PASSWORD, **kwargs):
    return User.objects.create_user(
        username=username, email=f"{username}@example.com", password=password, **kwargs
    )


def make_superuser(username, password=PASSWORD):
    return User.objects.create_superuser(
        username=username, email=f"{username}@example.com", password=password
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


class SupplierTestCase(TestCase):
    def setUp(self):
        self.superuser = make_superuser("admin")
        self.superuser_token = access_token_for(self.superuser)
        self.client_ = Client()


# ---------------------------------------------------------------------------
# Model
# ---------------------------------------------------------------------------


class SupplierModelTests(TestCase):
    def test_code_is_normalized(self):
        supplier = make_supplier("  acme ", legal_name="Acme Ltd")
        self.assertEqual(supplier.code, "ACME")

    def test_code_required(self):
        with self.assertRaises(Exception):
            Supplier.objects.create(code="   ", legal_name="Acme Ltd")

    def test_legal_name_required(self):
        with self.assertRaises(Exception):
            Supplier.objects.create(code="ACME", legal_name="   ")

    def test_legal_name_whitespace_trimmed(self):
        supplier = make_supplier("ACME", legal_name="  Acme Herbs Pvt Ltd  ")
        self.assertEqual(supplier.legal_name, "Acme Herbs Pvt Ltd")

    def test_optional_fields_default_blank(self):
        supplier = make_supplier("ACME")
        self.assertEqual(supplier.display_name, "")
        self.assertEqual(supplier.contact_name, "")
        self.assertEqual(supplier.email, "")
        self.assertEqual(supplier.phone, "")
        self.assertEqual(supplier.country_code, "")

    def test_is_active_defaults_true(self):
        supplier = make_supplier("ACME")
        self.assertTrue(supplier.is_active)

    def test_code_uniqueness_enforced_in_database(self):
        make_supplier("ACME")
        from django.db import IntegrityError, transaction

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Supplier.objects.create(code="ACME", legal_name="Dup")

    def test_invalid_email_rejected(self):
        with self.assertRaises(Exception):
            Supplier.objects.create(code="ACME", legal_name="Acme", email="not-an-email")

    def test_country_code_uppercased(self):
        supplier = make_supplier("ACME", country_code="in")
        self.assertEqual(supplier.country_code, "IN")

    def test_invalid_country_code_length_rejected(self):
        with self.assertRaises(Exception):
            Supplier.objects.create(code="ACME", legal_name="Acme", country_code="IND")

    def test_phone_and_postal_code_retained_as_strings(self):
        supplier = make_supplier("ACME", phone="+91 00000 00001", postal_code="0001100")
        self.assertEqual(supplier.phone, "+91 00000 00001")
        self.assertEqual(supplier.postal_code, "0001100")

    def test_code_immutable_after_creation(self):
        supplier = make_supplier("ACME")
        supplier.code = "OTHER"
        with self.assertRaises(Exception):
            supplier.save()

    def test_no_company_or_store_field(self):
        self.assertFalse(hasattr(Supplier(), "company"))
        self.assertFalse(hasattr(Supplier(), "company_id"))
        self.assertFalse(hasattr(Supplier(), "store"))
        self.assertFalse(hasattr(Supplier(), "store_id"))

    def test_no_qualification_or_stock_field(self):
        supplier = Supplier()
        for field in ("is_qualified", "is_approved", "qualification_status", "quantity", "stock"):
            self.assertFalse(hasattr(supplier, field), field)


# ---------------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------------


class SupplierAdminAccessRestrictionTests(TestCase):
    def setUp(self):
        self.factory = RequestFactory()
        self.admin = SupplierAdmin(Supplier, admin_site=None)

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

    def test_inactive_superuser_cannot_view(self):
        superuser = make_superuser("admin")
        superuser.is_active = False
        superuser.save(update_fields=["is_active"])
        request = self._request_as(superuser)
        self.assertFalse(self.admin.has_view_permission(request))


# ---------------------------------------------------------------------------
# Authorization
# ---------------------------------------------------------------------------


class SupplierAuthorizationTests(SupplierTestCase):
    def test_anonymous_401_on_list(self):
        self.assertEqual(self.client_.get(SUPPLIERS_URL).status_code, 401)

    def test_anonymous_401_on_detail(self):
        supplier = make_supplier("ACME")
        self.assertEqual(self.client_.get(supplier_url(supplier.id)).status_code, 401)

    def test_ordinary_user_403(self):
        user = make_user("plain")
        response = get_json(self.client_, SUPPLIERS_URL, access_token_for(user))
        self.assertEqual(response.status_code, 403)

    def test_ordinary_staff_403(self):
        staff = make_user("staffer", is_staff=True)
        response = get_json(self.client_, SUPPLIERS_URL, access_token_for(staff))
        self.assertEqual(response.status_code, 403)

    def test_company_membership_never_grants_supplier_access(self):
        from apps.companies.models import Company, CompanyMembership

        user = make_user("companyuser")
        company = Company.objects.create(code="ACME", legal_name="Acme Ltd")
        CompanyMembership.objects.create(user=user, company=company)
        response = get_json(self.client_, SUPPLIERS_URL, access_token_for(user))
        self.assertEqual(response.status_code, 403)

    def test_store_membership_never_grants_supplier_access(self):
        """Even shared_catalog.view - the permission that DOES grant
        shared-catalog reads (Task 07B) - must not grant supplier access;
        this task deliberately does not reuse or extend that permission
        (see docs/backend-decisions.md, Task 08A).
        """
        from apps.stores.models import SharedStore
        from apps.stores.services import assign_store_membership
        from apps.permissions.services import assign_store_role, create_store_role, replace_store_role_permissions

        user = make_user("storeuser")
        store = SharedStore.objects.create(code="MAIN", name="Main Store")
        membership, _ = assign_store_membership(actor=self.superuser, user=user, store=store)
        role = create_store_role(actor=self.superuser, store=store, code="ROLE1", name="Role")
        role, _ = replace_store_role_permissions(
            actor=self.superuser, role=role, permission_codes=["shared_catalog.view"]
        )
        assign_store_role(membership, role)
        response = get_json(self.client_, SUPPLIERS_URL, access_token_for(user))
        self.assertEqual(response.status_code, 403)

    def test_superuser_200(self):
        response = get_json(self.client_, SUPPLIERS_URL, self.superuser_token)
        self.assertEqual(response.status_code, 200)

    def test_write_endpoints_require_superuser(self):
        user = make_user("plain")
        response = post_json(
            self.client_, SUPPLIERS_URL, {"code": "ACME", "legal_name": "Acme"}, access_token_for(user)
        )
        self.assertEqual(response.status_code, 403)

    def test_delete_not_allowed_on_list(self):
        response = self.client_.delete(SUPPLIERS_URL, **bearer(self.superuser_token))
        self.assertEqual(response.status_code, 405)

    def test_delete_not_allowed_on_detail(self):
        supplier = make_supplier("ACME")
        response = self.client_.delete(supplier_url(supplier.id), **bearer(self.superuser_token))
        self.assertEqual(response.status_code, 405)

    def test_missing_supplier_returns_404(self):
        response = get_json(self.client_, supplier_url(999999), self.superuser_token)
        self.assertEqual(response.status_code, 404)


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


class SupplierCreateTests(SupplierTestCase):
    def test_create_success_starts_active(self):
        response = post_json(
            self.client_,
            SUPPLIERS_URL,
            {"code": "acme", "legal_name": "Acme Herbs Pvt Ltd"},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body["code"], "ACME")
        self.assertTrue(body["is_active"])

    def test_create_with_full_contact_fields(self):
        payload = {
            "code": "ACME",
            "legal_name": "Acme Herbs Pvt Ltd",
            "display_name": "Acme Herbs",
            "contact_name": "Jane Doe",
            "email": "jane@example.com",
            "phone": "+91 00000 00001",
            "address_line_1": "1 Market Road",
            "address_line_2": "Suite 4",
            "city": "Mumbai",
            "state_region": "MH",
            "postal_code": "400001",
            "country_code": "in",
        }
        response = post_json(self.client_, SUPPLIERS_URL, payload, self.superuser_token)
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body["country_code"], "IN")
        self.assertEqual(body["postal_code"], "400001")

    def test_missing_legal_name_400(self):
        response = post_json(self.client_, SUPPLIERS_URL, {"code": "ACME"}, self.superuser_token)
        self.assertEqual(response.status_code, 400)

    def test_missing_code_400(self):
        response = post_json(self.client_, SUPPLIERS_URL, {"legal_name": "Acme"}, self.superuser_token)
        self.assertEqual(response.status_code, 400)

    def test_whitespace_only_legal_name_400(self):
        response = post_json(
            self.client_, SUPPLIERS_URL, {"code": "ACME", "legal_name": "   "}, self.superuser_token
        )
        self.assertEqual(response.status_code, 400)

    def test_code_length_limit_400(self):
        response = post_json(
            self.client_, SUPPLIERS_URL, {"code": "X" * 33, "legal_name": "Acme"}, self.superuser_token
        )
        self.assertEqual(response.status_code, 400)

    def test_invalid_email_400(self):
        response = post_json(
            self.client_,
            SUPPLIERS_URL,
            {"code": "ACME", "legal_name": "Acme", "email": "not-an-email"},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 400)

    def test_invalid_country_code_400(self):
        response = post_json(
            self.client_,
            SUPPLIERS_URL,
            {"code": "ACME", "legal_name": "Acme", "country_code": "IND"},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 400)

    def test_duplicate_normalized_code_400(self):
        make_supplier("ACME")
        response = post_json(
            self.client_, SUPPLIERS_URL, {"code": "acme", "legal_name": "Dup"}, self.superuser_token
        )
        self.assertEqual(response.status_code, 400)

    def test_create_rejects_is_active(self):
        response = post_json(
            self.client_,
            SUPPLIERS_URL,
            {"code": "ACME", "legal_name": "Acme", "is_active": False},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 400)

    def test_create_rejects_timestamps(self):
        for field in ("created_at", "updated_at"):
            response = post_json(
                self.client_,
                SUPPLIERS_URL,
                {"code": "ACME", "legal_name": "Acme", field: "2020-01-01T00:00:00Z"},
                self.superuser_token,
            )
            self.assertEqual(response.status_code, 400, field)

    def test_create_rejects_unknown_and_ownership_fields(self):
        for field in ("quantity", "stock", "company_id", "owner_id"):
            response = post_json(
                self.client_,
                SUPPLIERS_URL,
                {"code": "ACME", "legal_name": "Acme", field: "x"},
                self.superuser_token,
            )
            self.assertEqual(response.status_code, 400, field)

    def test_duplicate_code_race_is_400_not_500(self):
        """Simulates a uniqueness race by making the model-level check
        pass (different in-memory codes are never compared against each
        other) while the database still enforces the constraint: two
        successive creates racing for the same normalized code must
        surface as a documented 4xx, never an unhandled 500.
        """
        make_supplier("ACME")
        response = post_json(
            self.client_, SUPPLIERS_URL, {"code": " ACME ", "legal_name": "Race"}, self.superuser_token
        )
        self.assertEqual(response.status_code, 400)


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------


class SupplierListTests(SupplierTestCase):
    def test_search_matches_code_legal_name_display_name_contact_name(self):
        make_supplier("ACME", legal_name="Acme Herbs", display_name="Acme", contact_name="Jane")
        make_supplier("BETA", legal_name="Beta Packaging", display_name="Beta", contact_name="John")

        for term in ("ACME", "Herbs", "Jane"):
            response = get_json(self.client_, f"{SUPPLIERS_URL}?search={term}", self.superuser_token)
            codes = {row["code"] for row in response.json()["results"]}
            self.assertEqual(codes, {"ACME"}, term)

    def test_is_active_filter(self):
        make_supplier("ACME")
        make_supplier("BETA", is_active=False)

        response = get_json(self.client_, f"{SUPPLIERS_URL}?is_active=true", self.superuser_token)
        codes = {row["code"] for row in response.json()["results"]}
        self.assertEqual(codes, {"ACME"})

        response = get_json(self.client_, f"{SUPPLIERS_URL}?is_active=false", self.superuser_token)
        codes = {row["code"] for row in response.json()["results"]}
        self.assertEqual(codes, {"BETA"})

    def test_is_active_filter_rejects_invalid_value(self):
        response = get_json(self.client_, f"{SUPPLIERS_URL}?is_active=maybe", self.superuser_token)
        self.assertEqual(response.status_code, 400)

    def test_pagination_bounded(self):
        for i in range(5):
            make_supplier(f"S{i:03d}")
        response = get_json(self.client_, f"{SUPPLIERS_URL}?page_size=2", self.superuser_token)
        body = response.json()
        self.assertEqual(len(body["results"]), 2)

    def test_stable_ordering_by_code(self):
        make_supplier("BETA")
        make_supplier("ACME")
        response = get_json(self.client_, SUPPLIERS_URL, self.superuser_token)
        codes = [row["code"] for row in response.json()["results"]]
        self.assertEqual(codes, sorted(codes))


# ---------------------------------------------------------------------------
# Detail / PATCH
# ---------------------------------------------------------------------------


class SupplierDetailTests(SupplierTestCase):
    def test_patch_updates_allowed_fields(self):
        supplier = make_supplier("ACME")
        response = patch_json(
            self.client_,
            supplier_url(supplier.id),
            {"legal_name": "New Legal Name", "city": "Pune"},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["legal_name"], "New Legal Name")
        self.assertEqual(body["city"], "Pune")

    def test_patch_omitted_fields_unchanged(self):
        supplier = make_supplier("ACME", city="Mumbai", contact_name="Jane")
        response = patch_json(
            self.client_, supplier_url(supplier.id), {"city": "Pune"}, self.superuser_token
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["contact_name"], "Jane")

    def test_patch_clears_optional_field_with_empty_string(self):
        supplier = make_supplier("ACME", display_name="Acme Co")
        response = patch_json(
            self.client_, supplier_url(supplier.id), {"display_name": ""}, self.superuser_token
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["display_name"], "")

    def test_patch_rejects_code(self):
        supplier = make_supplier("ACME")
        response = patch_json(
            self.client_, supplier_url(supplier.id), {"code": "OTHER"}, self.superuser_token
        )
        self.assertEqual(response.status_code, 400)

    def test_patch_rejects_is_active(self):
        supplier = make_supplier("ACME")
        response = patch_json(
            self.client_, supplier_url(supplier.id), {"is_active": False}, self.superuser_token
        )
        self.assertEqual(response.status_code, 400)

    def test_patch_rejects_timestamps(self):
        supplier = make_supplier("ACME")
        response = patch_json(
            self.client_,
            supplier_url(supplier.id),
            {"updated_at": "2020-01-01T00:00:00Z"},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 400)

    def test_patch_rejects_blank_legal_name(self):
        supplier = make_supplier("ACME")
        response = patch_json(
            self.client_, supplier_url(supplier.id), {"legal_name": ""}, self.superuser_token
        )
        self.assertEqual(response.status_code, 400)

    def test_patch_invalid_email_400(self):
        supplier = make_supplier("ACME")
        response = patch_json(
            self.client_, supplier_url(supplier.id), {"email": "bad-email"}, self.superuser_token
        )
        self.assertEqual(response.status_code, 400)

    def test_patch_allowed_while_inactive(self):
        supplier = make_supplier("ACME", is_active=False)
        response = patch_json(
            self.client_, supplier_url(supplier.id), {"city": "Pune"}, self.superuser_token
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["city"], "Pune")
        self.assertFalse(response.json()["is_active"])

    def test_patch_noop_creates_no_audit_entry(self):
        supplier = make_supplier("ACME", city="Mumbai")
        AuditLog.objects.all().delete()
        response = patch_json(
            self.client_, supplier_url(supplier.id), {"city": "Mumbai"}, self.superuser_token
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(AuditLog.objects.filter(target_type="supplier").count(), 0)


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------


class SupplierActivateDeactivateTests(SupplierTestCase):
    def test_deactivate_then_activate_round_trip(self):
        supplier = make_supplier("ACME")
        response = post_json(self.client_, supplier_deactivate_url(supplier.id), {}, self.superuser_token)
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["is_active"])

        response = post_json(self.client_, supplier_activate_url(supplier.id), {}, self.superuser_token)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["is_active"])

    def test_deactivate_idempotent_no_duplicate_audit(self):
        supplier = make_supplier("ACME")
        post_json(self.client_, supplier_deactivate_url(supplier.id), {}, self.superuser_token)
        AuditLog.objects.filter(target_type="supplier", action="supplier.deactivated").delete()
        response = post_json(self.client_, supplier_deactivate_url(supplier.id), {}, self.superuser_token)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            AuditLog.objects.filter(target_type="supplier", action="supplier.deactivated").count(), 0
        )

    def test_activate_idempotent(self):
        supplier = make_supplier("ACME")
        response = post_json(self.client_, supplier_activate_url(supplier.id), {}, self.superuser_token)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["is_active"])

    def test_deactivate_preserves_record(self):
        supplier = make_supplier("ACME")
        post_json(self.client_, supplier_deactivate_url(supplier.id), {}, self.superuser_token)
        self.assertTrue(Supplier.objects.filter(pk=supplier.id).exists())


# ---------------------------------------------------------------------------
# Audit
# ---------------------------------------------------------------------------


class SupplierAuditTests(SupplierTestCase):
    def test_create_writes_audit_with_no_company_or_store(self):
        response = post_json(
            self.client_, SUPPLIERS_URL, {"code": "ACME", "legal_name": "Acme"}, self.superuser_token
        )
        supplier_id = response.json()["id"]
        entry = AuditLog.objects.filter(target_type="supplier", target_id=supplier_id).get()
        self.assertEqual(entry.action, "supplier.created")
        self.assertIsNone(entry.company_id)
        self.assertIsNone(entry.store_id)
        self.assertEqual(entry.actor_id, self.superuser.id)

    def test_update_audit_has_before_after(self):
        supplier = make_supplier("ACME", city="Mumbai")
        AuditLog.objects.all().delete()
        patch_json(self.client_, supplier_url(supplier.id), {"city": "Pune"}, self.superuser_token)
        entry = AuditLog.objects.filter(target_type="supplier", action="supplier.updated").get()
        self.assertEqual(entry.before["city"], "Mumbai")
        self.assertEqual(entry.after["city"], "Pune")

    def test_audit_never_contains_raw_request_body_marker(self):
        """Not a claim that every possible secret is scrubbed - just that
        the audit snapshot is built from an explicit tracked-field
        allowlist (apps.suppliers.services.SUPPLIER_TRACKED_FIELDS), not
        a dump of request.data, so a field never on that list (or on this
        model at all) cannot leak into an audit row.
        """
        response = post_json(
            self.client_, SUPPLIERS_URL, {"code": "ACME", "legal_name": "Acme"}, self.superuser_token
        )
        entry = AuditLog.objects.filter(target_type="supplier", target_id=response.json()["id"]).get()
        self.assertNotIn("password", entry.after)

    def test_create_audit_rollback_on_failure(self):
        with patch("apps.suppliers.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                post_json(
                    self.client_, SUPPLIERS_URL, {"code": "ACME", "legal_name": "Acme"}, self.superuser_token
                )
        self.assertFalse(Supplier.objects.filter(code="ACME").exists())

    def test_update_audit_rollback_on_failure(self):
        supplier = make_supplier("ACME", city="Mumbai")
        with patch("apps.suppliers.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                patch_json(self.client_, supplier_url(supplier.id), {"city": "Pune"}, self.superuser_token)
        supplier.refresh_from_db()
        self.assertEqual(supplier.city, "Mumbai")

    def test_deactivate_audit_rollback_on_failure(self):
        supplier = make_supplier("ACME")
        with patch("apps.suppliers.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                post_json(self.client_, supplier_deactivate_url(supplier.id), {}, self.superuser_token)
        supplier.refresh_from_db()
        self.assertTrue(supplier.is_active)
