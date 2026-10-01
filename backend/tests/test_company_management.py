import json
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.test import Client, TestCase

from apps.audit.models import AuditLog
from apps.common.errors import translate_django_validation_error
from apps.common.validation import parse_strict_bool
from apps.companies.models import Company, CompanyMembership
from apps.companies.services import active_companies_for_user
from rest_framework.exceptions import ValidationError as DRFValidationError

User = get_user_model()

PASSWORD = "a-strong-pass-1"

COMPANIES_URL = "/api/v1/companies/"
PERMISSIONS_URL = "/api/v1/permissions/"


def company_url(company_id):
    return f"/api/v1/companies/{company_id}/"


def activate_url(company_id):
    return f"/api/v1/companies/{company_id}/activate/"


def deactivate_url(company_id):
    return f"/api/v1/companies/{company_id}/deactivate/"


def my_permissions_url(company_id):
    return f"/api/v1/companies/{company_id}/my-permissions/"


def make_user(username, password=PASSWORD, **kwargs):
    return User.objects.create_user(
        username=username, email=f"{username}@example.com", password=password, **kwargs
    )


def make_superuser(username, password=PASSWORD):
    return User.objects.create_superuser(
        username=username, email=f"{username}@example.com", password=password
    )


def make_company(code, legal_name=None, **kwargs):
    return Company.objects.create(
        code=code, legal_name=legal_name or f"{code} Legal Name Pvt Ltd", **kwargs
    )


def access_token_for(user):
    from rest_framework_simplejwt.tokens import AccessToken

    return str(AccessToken.for_user(user))


def bearer(token):
    return {"HTTP_AUTHORIZATION": f"Bearer {token}"}


def get_json(client, url, token, **extra):
    return client.get(url, **bearer(token), **extra)


def post_json(client, url, payload, token):
    return client.post(
        url, data=json.dumps(payload), content_type="application/json", **bearer(token)
    )


def patch_json(client, url, payload, token):
    return client.patch(
        url, data=json.dumps(payload), content_type="application/json", **bearer(token)
    )


class CompanyManagementTestCase(TestCase):
    def setUp(self):
        self.superuser = make_superuser("admin")
        self.superuser_token = access_token_for(self.superuser)
        self.client_ = Client()


class CompanyAuthorizationTests(CompanyManagementTestCase):
    def test_anonymous_401(self):
        response = self.client_.get(COMPANIES_URL)
        self.assertEqual(response.status_code, 401)

    def test_ordinary_user_403(self):
        user = make_user("plain")
        response = get_json(self.client_, COMPANIES_URL, access_token_for(user))
        self.assertEqual(response.status_code, 403)

    def test_ordinary_staff_403(self):
        staff = make_user("staffer", is_staff=True)
        response = get_json(self.client_, COMPANIES_URL, access_token_for(staff))
        self.assertEqual(response.status_code, 403)

    def test_active_superuser_200(self):
        response = get_json(self.client_, COMPANIES_URL, self.superuser_token)
        self.assertEqual(response.status_code, 200)

    def test_delete_method_not_allowed(self):
        company = make_company("ACME")
        response = self.client_.delete(company_url(company.id), **bearer(self.superuser_token))
        self.assertEqual(response.status_code, 405)

    def test_delete_method_not_allowed_on_list(self):
        response = self.client_.delete(COMPANIES_URL, **bearer(self.superuser_token))
        self.assertEqual(response.status_code, 405)


class CompanyCreateTests(CompanyManagementTestCase):
    def test_create_success(self):
        response = post_json(
            self.client_,
            COMPANIES_URL,
            {"code": "acme", "legal_name": "Acme Pharma Pvt Ltd"},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body["code"], "ACME")
        self.assertTrue(body["is_active"])

    def test_code_is_normalised(self):
        response = post_json(
            self.client_,
            COMPANIES_URL,
            {"code": "  acme  ", "legal_name": "Acme Pharma Pvt Ltd"},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["code"], "ACME")

    def test_duplicate_code_rejected_with_400_not_500(self):
        make_company("ACME")
        response = post_json(
            self.client_,
            COMPANIES_URL,
            {"code": "ACME", "legal_name": "Duplicate Acme Ltd"},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 400)

    def test_duplicate_code_after_normalisation_rejected(self):
        make_company("ACME")
        response = post_json(
            self.client_,
            COMPANIES_URL,
            {"code": " acme ", "legal_name": "Duplicate Acme Ltd"},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 400)

    def test_missing_legal_name_400(self):
        response = post_json(
            self.client_, COMPANIES_URL, {"code": "ACME"}, self.superuser_token
        )
        self.assertEqual(response.status_code, 400)

    def test_blank_legal_name_rejected_via_model_clean(self):
        response = post_json(
            self.client_,
            COMPANIES_URL,
            {"code": "ACME", "legal_name": "   "},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 400)

    def test_rejects_is_active(self):
        response = post_json(
            self.client_,
            COMPANIES_URL,
            {"code": "ACME", "legal_name": "Acme Ltd", "is_active": False},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("is_active", response.json())

    def test_create_creates_no_membership_or_role(self):
        post_json(
            self.client_,
            COMPANIES_URL,
            {"code": "ACME", "legal_name": "Acme Ltd"},
            self.superuser_token,
        )
        self.assertEqual(CompanyMembership.objects.count(), 0)

    def test_create_writes_audit_entry(self):
        response = post_json(
            self.client_,
            COMPANIES_URL,
            {"code": "ACME", "legal_name": "Acme Ltd"},
            self.superuser_token,
        )
        company_id = response.json()["id"]
        entry = AuditLog.objects.filter(target_type="company", target_id=company_id).get()
        self.assertEqual(entry.action, "company.created")
        self.assertEqual(entry.actor_id, self.superuser.id)
        self.assertEqual(entry.after["code"], "ACME")

    def test_ordinary_user_cannot_create(self):
        user = make_user("plain")
        response = post_json(
            self.client_,
            COMPANIES_URL,
            {"code": "ACME", "legal_name": "Acme Ltd"},
            access_token_for(user),
        )
        self.assertEqual(response.status_code, 403)


class CompanyListTests(CompanyManagementTestCase):
    def setUp(self):
        super().setUp()
        make_company("ACME", legal_name="Acme Pharma", is_active=True)
        make_company("BETA", legal_name="Beta Traders", is_active=False)

    def test_list_includes_active_and_inactive(self):
        response = get_json(self.client_, COMPANIES_URL, self.superuser_token)
        codes = {row["code"] for row in response.json()["results"]}
        self.assertEqual(codes, {"ACME", "BETA"})

    def test_search_matches_code(self):
        response = get_json(self.client_, f"{COMPANIES_URL}?search=acme", self.superuser_token)
        codes = {row["code"] for row in response.json()["results"]}
        self.assertEqual(codes, {"ACME"})

    def test_search_matches_legal_name(self):
        response = get_json(self.client_, f"{COMPANIES_URL}?search=Traders", self.superuser_token)
        codes = {row["code"] for row in response.json()["results"]}
        self.assertEqual(codes, {"BETA"})

    def test_is_active_filter_true(self):
        response = get_json(
            self.client_, f"{COMPANIES_URL}?is_active=true", self.superuser_token
        )
        codes = {row["code"] for row in response.json()["results"]}
        self.assertEqual(codes, {"ACME"})

    def test_is_active_filter_false(self):
        response = get_json(
            self.client_, f"{COMPANIES_URL}?is_active=false", self.superuser_token
        )
        codes = {row["code"] for row in response.json()["results"]}
        self.assertEqual(codes, {"BETA"})

    def test_is_active_filter_rejects_invalid_value(self):
        response = get_json(
            self.client_, f"{COMPANIES_URL}?is_active=maybe", self.superuser_token
        )
        self.assertEqual(response.status_code, 400)

    def test_pagination_bounded(self):
        response = get_json(
            self.client_, f"{COMPANIES_URL}?page_size=1000", self.superuser_token
        )
        # BoundedPageNumberPagination caps at 100; with only 2 rows this
        # just confirms the endpoint honours page_size without erroring
        # and returns a paginated envelope, not an unbounded raw list.
        body = response.json()
        self.assertIn("results", body)
        self.assertIn("count", body)


class CompanyDetailTests(CompanyManagementTestCase):
    def test_get_nonexistent_404(self):
        response = get_json(self.client_, company_url(999999), self.superuser_token)
        self.assertEqual(response.status_code, 404)

    def test_get_returns_management_fields(self):
        company = make_company("ACME")
        response = get_json(self.client_, company_url(company.id), self.superuser_token)
        body = response.json()
        self.assertEqual(body["code"], "ACME")
        self.assertIn("is_active", body)
        self.assertIn("created_at", body)
        self.assertIn("updated_at", body)

    def test_patch_updates_legal_name(self):
        company = make_company("ACME")
        response = patch_json(
            self.client_,
            company_url(company.id),
            {"legal_name": "Acme Renamed Ltd"},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["legal_name"], "Acme Renamed Ltd")

    def test_patch_rejects_code(self):
        company = make_company("ACME")
        response = patch_json(
            self.client_, company_url(company.id), {"code": "OTHER"}, self.superuser_token
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("code", response.json())
        company.refresh_from_db()
        self.assertEqual(company.code, "ACME")

    def test_patch_rejects_is_active(self):
        company = make_company("ACME")
        response = patch_json(
            self.client_, company_url(company.id), {"is_active": False}, self.superuser_token
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("is_active", response.json())

    def test_patch_noop_creates_no_audit_entry(self):
        company = make_company("ACME", legal_name="Acme Ltd")
        AuditLog.objects.all().delete()
        response = patch_json(
            self.client_,
            company_url(company.id),
            {"legal_name": "Acme Ltd"},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            AuditLog.objects.filter(target_type="company", target_id=company.id).count(), 0
        )

    def test_patch_whitespace_only_change_creates_no_audit_entry(self):
        company = make_company("ACME", legal_name="Acme Ltd")
        AuditLog.objects.all().delete()
        response = patch_json(
            self.client_,
            company_url(company.id),
            {"legal_name": "  Acme Ltd  "},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            AuditLog.objects.filter(target_type="company", target_id=company.id).count(), 0
        )

    def test_patch_creates_audit_entry_with_before_after(self):
        company = make_company("ACME", legal_name="Acme Ltd")
        AuditLog.objects.all().delete()
        patch_json(
            self.client_,
            company_url(company.id),
            {"legal_name": "New Name Ltd"},
            self.superuser_token,
        )
        entry = AuditLog.objects.filter(target_type="company", target_id=company.id).get()
        self.assertEqual(entry.action, "company.updated")
        self.assertEqual(entry.before["legal_name"], "Acme Ltd")
        self.assertEqual(entry.after["legal_name"], "New Name Ltd")

    def test_patch_allowed_even_when_company_inactive(self):
        """Documented, intentional behaviour (docs/backend-decisions.md,
        Task 06): unlike role mutations, editing a company's own metadata
        is not gated by that company's own is_active state - there is no
        parent-level state a company's own record could be restricted by,
        and correcting an inactive company's legal_name is a legitimate
        administrative action.
        """
        company = make_company("ACME", is_active=False)
        response = patch_json(
            self.client_,
            company_url(company.id),
            {"legal_name": "Corrected Name Ltd"},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 200)


class CompanyActivateDeactivateTests(CompanyManagementTestCase):
    def test_deactivate_then_activate_round_trip(self):
        company = make_company("ACME")
        response = post_json(self.client_, deactivate_url(company.id), {}, self.superuser_token)
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["is_active"])

        response = post_json(self.client_, activate_url(company.id), {}, self.superuser_token)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["is_active"])

    def test_deactivate_is_idempotent_no_duplicate_audit(self):
        company = make_company("ACME")
        post_json(self.client_, deactivate_url(company.id), {}, self.superuser_token)
        AuditLog.objects.all().delete()
        response = post_json(self.client_, deactivate_url(company.id), {}, self.superuser_token)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            AuditLog.objects.filter(target_type="company", target_id=company.id).count(), 0
        )

    def test_activate_is_idempotent_no_duplicate_audit(self):
        company = make_company("ACME")
        AuditLog.objects.all().delete()
        response = post_json(self.client_, activate_url(company.id), {}, self.superuser_token)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            AuditLog.objects.filter(target_type="company", target_id=company.id).count(), 0
        )

    def test_deactivate_does_not_cascade_to_membership_or_role(self):
        from apps.permissions.models import CompanyRole

        company = make_company("ACME")
        user = make_user("jdoe")
        membership = CompanyMembership.objects.create(user=user, company=company)
        role = CompanyRole.objects.create(company=company, code="MANAGER", name="Manager")

        post_json(self.client_, deactivate_url(company.id), {}, self.superuser_token)

        membership.refresh_from_db()
        role.refresh_from_db()
        self.assertTrue(membership.is_active)
        self.assertTrue(role.is_active)

    def test_deactivate_blocks_business_access_on_next_lookup(self):
        company = make_company("ACME")
        user = make_user("jdoe")
        CompanyMembership.objects.create(user=user, company=company)
        self.assertEqual(list(active_companies_for_user(user)), [company])

        post_json(self.client_, deactivate_url(company.id), {}, self.superuser_token)

        self.assertEqual(list(active_companies_for_user(user)), [])

    def test_reactivate_restores_business_access_immediately(self):
        company = make_company("ACME", is_active=False)
        user = make_user("jdoe")
        CompanyMembership.objects.create(user=user, company=company)
        self.assertEqual(list(active_companies_for_user(user)), [])

        post_json(self.client_, activate_url(company.id), {}, self.superuser_token)

        self.assertEqual(list(active_companies_for_user(user)), [company])

    def test_deactivate_blocks_my_permissions_lookup(self):
        from apps.permissions.models import CompanyRole, PermissionDefinition
        from apps.permissions.services import assign_role

        company = make_company("ACME")
        user = make_user("jdoe")
        membership = CompanyMembership.objects.create(user=user, company=company)
        perm = PermissionDefinition.objects.create(code="orders.view", name="View", module="orders")
        role = CompanyRole.objects.create(company=company, code="VIEWER", name="Viewer")
        role.permissions.set([perm])
        assign_role(membership, role)

        response = get_json(self.client_, my_permissions_url(company.id), access_token_for(user))
        self.assertEqual(response.status_code, 200)
        self.assertIn("orders.view", response.json()["permissions"])

        post_json(self.client_, deactivate_url(company.id), {}, self.superuser_token)

        response = get_json(self.client_, my_permissions_url(company.id), access_token_for(user))
        self.assertEqual(response.status_code, 404)

    def test_ordinary_user_cannot_activate_or_deactivate(self):
        company = make_company("ACME")
        user = make_user("plain")
        response = post_json(
            self.client_, deactivate_url(company.id), {}, access_token_for(user)
        )
        self.assertEqual(response.status_code, 403)


class AuditRollbackTests(CompanyManagementTestCase):
    """Audit-write failure must roll back the business mutation - proven
    by mocking apps.companies.services.record to raise, same technique
    Task 05's own tests use for apps.users.services.
    """

    def test_create_company_rolls_back_if_audit_write_fails(self):
        with patch("apps.companies.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                post_json(
                    self.client_,
                    COMPANIES_URL,
                    {"code": "ACME", "legal_name": "Acme Ltd"},
                    self.superuser_token,
                )
        self.assertFalse(Company.objects.filter(code="ACME").exists())

    def test_deactivate_company_rolls_back_if_audit_write_fails(self):
        company = make_company("ACME")
        with patch("apps.companies.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                post_json(self.client_, deactivate_url(company.id), {}, self.superuser_token)
        company.refresh_from_db()
        self.assertTrue(company.is_active)


class PermissionCatalogTests(CompanyManagementTestCase):
    def setUp(self):
        super().setUp()
        from apps.permissions.models import PermissionDefinition

        self.view_perm = PermissionDefinition.objects.create(
            code="orders.view", name="View orders", module="orders"
        )
        self.create_perm = PermissionDefinition.objects.create(
            code="orders.create", name="Create orders", module="orders"
        )
        self.inactive_perm = PermissionDefinition.objects.create(
            code="orders.delete", name="Delete orders", module="orders", is_active=False
        )
        self.hr_perm = PermissionDefinition.objects.create(
            code="hr.view", name="View HR", module="hr"
        )

    def test_anonymous_401(self):
        response = self.client_.get(PERMISSIONS_URL)
        self.assertEqual(response.status_code, 401)

    def test_ordinary_user_403(self):
        user = make_user("plain")
        response = get_json(self.client_, PERMISSIONS_URL, access_token_for(user))
        self.assertEqual(response.status_code, 403)

    def test_superuser_lists_all(self):
        # A subset check, not exact-set equality: the catalog also always
        # contains `shared_store.view` (Task 07A's idempotently-seeded
        # STORE-scope permission, provisioned by a data migration - see
        # apps/permissions/migrations/0003_seed_shared_store_view_permission.py),
        # independent of whatever this test's own setUp() creates.
        #
        # The catalog has grown past the endpoint's default page_size=20
        # (BoundedPageNumberPagination) as later tasks seed more real
        # permissions, so this test must not rely on the default page
        # happening to contain everything - it requests the endpoint's own
        # documented max_page_size=100 instead, which "lists all" actually
        # requires without hardcoding a specific catalog size.
        response = get_json(
            self.client_, f"{PERMISSIONS_URL}?page_size=100", self.superuser_token
        )
        self.assertEqual(response.status_code, 200)
        codes = {row["code"] for row in response.json()["results"]}
        self.assertTrue({"orders.view", "orders.create", "orders.delete", "hr.view"}.issubset(codes))
        self.assertIn("shared_store.view", codes)

    def test_search_filters_by_code_or_name(self):
        # A substring search for "orders.view" also matches any
        # `*_orders.view`-shaped code seeded by a later task (e.g.
        # purchase_orders.view, Task 08C-1) - exact-set equality here
        # would break every time such a code is added, even though
        # nothing about search *filtering* changed. This checks the
        # actual property the endpoint promises instead: this specific
        # permission is included, and every result genuinely contains
        # the search term (case-insensitively) in its code or name - see
        # apps.permissions.views' `Q(code__icontains=search) |
        # Q(name__icontains=search)`.
        response = get_json(self.client_, f"{PERMISSIONS_URL}?search=orders.view", self.superuser_token)
        results = response.json()["results"]
        codes = {row["code"] for row in results}
        self.assertIn("orders.view", codes)
        for row in results:
            self.assertTrue(
                "orders.view" in row["code"].lower() or "orders.view" in row["name"].lower(), row
            )

    def test_module_filter(self):
        response = get_json(self.client_, f"{PERMISSIONS_URL}?module=hr", self.superuser_token)
        codes = {row["code"] for row in response.json()["results"]}
        self.assertEqual(codes, {"hr.view"})

    def test_is_active_filter(self):
        response = get_json(
            self.client_, f"{PERMISSIONS_URL}?is_active=false", self.superuser_token
        )
        codes = {row["code"] for row in response.json()["results"]}
        self.assertEqual(codes, {"orders.delete"})

    def test_is_active_filter_rejects_invalid_value(self):
        response = get_json(
            self.client_, f"{PERMISSIONS_URL}?is_active=nope", self.superuser_token
        )
        self.assertEqual(response.status_code, 400)

    def test_post_not_allowed(self):
        response = post_json(
            self.client_,
            PERMISSIONS_URL,
            {"code": "new.perm", "name": "New", "module": "new"},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 405)

    def test_delete_not_allowed(self):
        response = self.client_.delete(PERMISSIONS_URL, **bearer(self.superuser_token))
        self.assertEqual(response.status_code, 405)


class SharedValidationHelperTests(TestCase):
    """Direct unit tests for apps.common.validation.parse_strict_bool and
    apps.common.errors.translate_django_validation_error - shared by both
    Task 05 and Task 06 endpoints, so their edge cases are worth locking
    down independently of any one view.
    """

    def test_parse_strict_bool_accepts_true_variants(self):
        self.assertTrue(parse_strict_bool("true"))
        self.assertTrue(parse_strict_bool("True"))
        self.assertTrue(parse_strict_bool("1"))
        self.assertTrue(parse_strict_bool("  true  "))

    def test_parse_strict_bool_accepts_false_variants(self):
        self.assertFalse(parse_strict_bool("false"))
        self.assertFalse(parse_strict_bool("False"))
        self.assertFalse(parse_strict_bool("0"))

    def test_parse_strict_bool_rejects_anything_else(self):
        for bad_value in ("yes", "no", "maybe", "2", ""):
            with self.assertRaises(DRFValidationError):
                parse_strict_bool(bad_value)

    def test_parse_strict_bool_error_uses_given_field_name(self):
        try:
            parse_strict_bool("nonsense", field="my_field")
            self.fail("expected ValidationError")
        except DRFValidationError as exc:
            self.assertIn("my_field", exc.detail)

    def test_translate_validation_error_with_message_dict(self):
        django_exc = DjangoValidationError({"code": "Code is required."})
        drf_exc = translate_django_validation_error(django_exc)
        self.assertIsInstance(drf_exc, DRFValidationError)
        self.assertIn("code", drf_exc.detail)

    def test_translate_validation_error_with_plain_messages(self):
        django_exc = DjangoValidationError("Something went wrong.")
        drf_exc = translate_django_validation_error(django_exc)
        self.assertIsInstance(drf_exc, DRFValidationError)
        self.assertIn("detail", drf_exc.detail)
        self.assertIn("Something went wrong.", drf_exc.detail["detail"])
