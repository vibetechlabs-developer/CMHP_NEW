import datetime
import json

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import Client, TestCase

from apps.companies.models import Company, CompanyMembership
from apps.permissions.models import CompanyRole, MembershipRole, PermissionDefinition
from apps.permissions.services import assign_role
from rest_framework_simplejwt.tokens import AccessToken

User = get_user_model()

LOGIN_URL = "/api/v1/auth/login/"
REFRESH_URL = "/api/v1/auth/refresh/"
LOGOUT_URL = "/api/v1/auth/logout/"
ME_URL = "/api/v1/auth/me/"
CSRF_URL = "/api/v1/auth/csrf/"
COMPANIES_MINE_URL = "/api/v1/companies/mine/"

PASSWORD = "a-strong-pass-1"


def make_user(username, password=PASSWORD, **kwargs):
    return User.objects.create_user(
        username=username, email=f"{username}@example.com", password=password, **kwargs
    )


def make_company(code, **kwargs):
    return Company.objects.create(code=code, legal_name=f"{code} Legal Name Pvt Ltd", **kwargs)


def make_permission(code, module="orders", **kwargs):
    return PermissionDefinition.objects.create(code=code, name=code, module=module, **kwargs)


def make_role(company, code, permissions=(), **kwargs):
    role = CompanyRole.objects.create(company=company, code=code, name=code, **kwargs)
    if permissions:
        role.permissions.set(permissions)
    return role


def my_permissions_url(company_id):
    return f"/api/v1/companies/{company_id}/my-permissions/"


def csrf_client():
    """A test client with real CSRF enforcement - the default django.test.Client
    silently bypasses CSRF, which would let every one of these tests pass
    even if enforce_csrf() were never called.
    """
    return Client(enforce_csrf_checks=True)


def get_csrf_token(client):
    response = client.get(CSRF_URL)
    assert response.status_code == 200
    return response.json()["csrfToken"]


def post_json(client, url, payload, csrf_token=None, **extra):
    headers = dict(extra)
    if csrf_token is not None:
        headers["HTTP_X_CSRFTOKEN"] = csrf_token
    return client.post(url, data=json.dumps(payload), content_type="application/json", **headers)


def bearer(access_token):
    return {"HTTP_AUTHORIZATION": f"Bearer {access_token}"}


def login(client, username=None, password=PASSWORD, **user_kwargs):
    """Full CSRF-correct login helper used to set up authenticated tests."""
    token = get_csrf_token(client)
    response = post_json(
        client, LOGIN_URL, {"username": username, "password": password}, csrf_token=token
    )
    assert response.status_code == 200, response.content
    return response.json()


class CsrfBootstrapTests(TestCase):
    def test_returns_token_and_is_not_cached(self):
        client = csrf_client()
        response = client.get(CSRF_URL)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["csrfToken"])
        self.assertIn("no-store", response.headers["Cache-Control"])


class LoginTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user = make_user("jdoe")

    def test_success_returns_access_and_user_sets_refresh_cookie(self):
        client = csrf_client()
        token = get_csrf_token(client)
        response = post_json(
            client, LOGIN_URL, {"username": "jdoe", "password": PASSWORD}, csrf_token=token
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn("access", body)
        self.assertEqual(body["user"]["username"], "jdoe")
        self.assertNotIn("refresh", body)
        self.assertNotIn("password", body["user"])

        cookie = response.cookies[settings.AUTH_REFRESH_COOKIE_NAME]
        self.assertTrue(cookie["httponly"])
        self.assertEqual(cookie["samesite"], "Lax")
        self.assertEqual(cookie["path"], settings.AUTH_REFRESH_COOKIE_PATH)

    def test_response_body_never_contains_refresh_token_string(self):
        client = csrf_client()
        token = get_csrf_token(client)
        response = post_json(
            client, LOGIN_URL, {"username": "jdoe", "password": PASSWORD}, csrf_token=token
        )
        self.assertNotIn(b"refresh", response.content)

    def test_wrong_password_generic_401(self):
        client = csrf_client()
        token = get_csrf_token(client)
        response = post_json(
            client, LOGIN_URL, {"username": "jdoe", "password": "wrong"}, csrf_token=token
        )
        self.assertEqual(response.status_code, 401)

    def test_unknown_username_same_generic_401(self):
        client = csrf_client()
        token = get_csrf_token(client)
        wrong_user = post_json(
            client, LOGIN_URL, {"username": "jdoe", "password": "wrong"}, csrf_token=token
        )
        unknown_user = post_json(
            client, LOGIN_URL, {"username": "nobody", "password": "wrong"}, csrf_token=token
        )
        self.assertEqual(wrong_user.status_code, unknown_user.status_code)
        self.assertEqual(wrong_user.json(), unknown_user.json())

    def test_inactive_account_same_generic_401(self):
        self.user.is_active = False
        self.user.save(update_fields=["is_active"])
        client = csrf_client()
        token = get_csrf_token(client)
        response = post_json(
            client, LOGIN_URL, {"username": "jdoe", "password": PASSWORD}, csrf_token=token
        )
        wrong_password = post_json(
            client, LOGIN_URL, {"username": "jdoe", "password": "wrong"}, csrf_token=token
        )
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json(), wrong_password.json())

    def test_missing_fields_is_400_not_401(self):
        client = csrf_client()
        token = get_csrf_token(client)
        response = post_json(client, LOGIN_URL, {"username": "jdoe"}, csrf_token=token)
        self.assertEqual(response.status_code, 400)

    def test_missing_csrf_token_rejected(self):
        client = csrf_client()
        get_csrf_token(client)  # sets the cookie but we deliberately don't send the header
        response = post_json(client, LOGIN_URL, {"username": "jdoe", "password": PASSWORD})
        self.assertEqual(response.status_code, 403)

    def test_wrong_csrf_token_rejected(self):
        client = csrf_client()
        get_csrf_token(client)
        response = post_json(
            client,
            LOGIN_URL,
            {"username": "jdoe", "password": PASSWORD},
            csrf_token="not-the-real-token",
        )
        self.assertEqual(response.status_code, 403)

    def test_active_user_with_zero_companies_can_login(self):
        client = csrf_client()
        token = get_csrf_token(client)
        response = post_json(
            client, LOGIN_URL, {"username": "jdoe", "password": PASSWORD}, csrf_token=token
        )
        self.assertEqual(response.status_code, 200)


class LoginThrottleTests(TestCase):
    def setUp(self):
        cache.clear()
        make_user("jdoe")

    def tearDown(self):
        cache.clear()

    def test_actual_429_after_configured_limit(self):
        rate = settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["login"]
        limit = int(rate.split("/")[0])

        client = csrf_client()
        token = get_csrf_token(client)
        statuses = []
        for _ in range(limit + 1):
            response = post_json(
                client, LOGIN_URL, {"username": "jdoe", "password": "wrong"}, csrf_token=token
            )
            statuses.append(response.status_code)

        self.assertEqual(statuses[:limit], [401] * limit)
        self.assertEqual(statuses[limit], 429)


class MeEndpointTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user = make_user("jdoe", first_name="Jane", last_name="Doe")

    def test_requires_bearer_token(self):
        client = Client()
        response = client.get(ME_URL)
        self.assertEqual(response.status_code, 401)

    def test_returns_safe_fields_only(self):
        client = csrf_client()
        body = login(client, "jdoe")
        response = client.get(ME_URL, **bearer(body["access"]))
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["username"], "jdoe")
        # `capabilities` is the read-only UI hint for material catalog writes (see tests.test_material_catalog_capability).
        self.assertEqual(set(data.keys()), {"id", "username", "email", "first_name", "last_name", "capabilities"})
        self.assertEqual(set(data["capabilities"].keys()), {"can_manage_material_catalog"})

    def test_invalid_token_rejected(self):
        client = Client()
        response = client.get(ME_URL, **bearer("this-is-not-a-jwt"))
        self.assertEqual(response.status_code, 401)

    def test_expired_token_rejected(self):
        access = AccessToken.for_user(self.user)
        access.set_exp(lifetime=datetime.timedelta(seconds=-1))
        client = Client()
        response = client.get(ME_URL, **bearer(str(access)))
        self.assertEqual(response.status_code, 401)


class MyCompaniesTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user = make_user("jdoe")

    def test_requires_bearer_token(self):
        client = Client()
        response = client.get(COMPANIES_MINE_URL)
        self.assertEqual(response.status_code, 401)

    def test_zero_companies_returns_empty_list(self):
        client = csrf_client()
        body = login(client, "jdoe")
        response = client.get(COMPANIES_MINE_URL, **bearer(body["access"]))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"companies": []})

    def test_one_company(self):
        company = make_company("ACME")
        CompanyMembership.objects.create(user=self.user, company=company)
        client = csrf_client()
        body = login(client, "jdoe")
        response = client.get(COMPANIES_MINE_URL, **bearer(body["access"]))
        codes = [c["code"] for c in response.json()["companies"]]
        self.assertEqual(codes, ["ACME"])

    def test_two_companies_stable_ordering(self):
        zeta = make_company("ZETA")
        alpha = make_company("ALPHA")
        CompanyMembership.objects.create(user=self.user, company=zeta)
        CompanyMembership.objects.create(user=self.user, company=alpha)
        client = csrf_client()
        body = login(client, "jdoe")
        response = client.get(COMPANIES_MINE_URL, **bearer(body["access"]))
        codes = [c["code"] for c in response.json()["companies"]]
        self.assertEqual(codes, ["ALPHA", "ZETA"])


class MyPermissionsTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user = make_user("jdoe")
        self.company_a = make_company("ACME")
        self.company_b = make_company("BETA")
        self.view_perm = make_permission("orders.view")
        self.create_perm = make_permission("orders.create")
        self.membership_a = CompanyMembership.objects.create(user=self.user, company=self.company_a)
        self.membership_b = CompanyMembership.objects.create(user=self.user, company=self.company_b)

    def _access_token(self):
        client = csrf_client()
        return login(client, "jdoe")["access"]

    def test_different_permissions_in_different_companies(self):
        role_a = make_role(self.company_a, "MANAGER", permissions=[self.view_perm, self.create_perm])
        role_b = make_role(self.company_b, "VIEWER", permissions=[self.view_perm])
        assign_role(self.membership_a, role_a)
        assign_role(self.membership_b, role_b)

        access = self._access_token()
        client = Client()
        resp_a = client.get(my_permissions_url(self.company_a.id), **bearer(access))
        resp_b = client.get(my_permissions_url(self.company_b.id), **bearer(access))

        self.assertEqual(resp_a.json()["permissions"], ["orders.create", "orders.view"])
        self.assertEqual(resp_b.json()["permissions"], ["orders.view"])

    def test_membership_with_no_roles_returns_empty_list(self):
        access = self._access_token()
        client = Client()
        response = client.get(my_permissions_url(self.company_a.id), **bearer(access))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"company_id": self.company_a.id, "permissions": []})

    def test_unknown_company_404(self):
        access = self._access_token()
        client = Client()
        response = client.get(my_permissions_url(999999), **bearer(access))
        self.assertEqual(response.status_code, 404)

    def test_company_without_membership_404(self):
        other_company = make_company("GAMMA")
        access = self._access_token()
        client = Client()
        response = client.get(my_permissions_url(other_company.id), **bearer(access))
        self.assertEqual(response.status_code, 404)

    def test_inactive_company_404(self):
        self.company_a.is_active = False
        self.company_a.save(update_fields=["is_active", "updated_at"])
        access = self._access_token()
        client = Client()
        response = client.get(my_permissions_url(self.company_a.id), **bearer(access))
        self.assertEqual(response.status_code, 404)

    def test_no_staff_or_superuser_bypass(self):
        superuser = User.objects.create_superuser(
            username="admin", email="admin@example.com", password=PASSWORD, is_staff=True
        )
        CompanyMembership.objects.create(user=superuser, company=self.company_a)
        client = csrf_client()
        body = login(client, "admin")
        response = Client().get(
            my_permissions_url(self.company_a.id), **bearer(body["access"])
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["permissions"], [])


class RefreshTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user = make_user("jdoe")

    def test_rotates_and_returns_new_access_without_refresh_in_body(self):
        client = csrf_client()
        login(client, "jdoe")
        token = get_csrf_token(client)

        response = post_json(client, REFRESH_URL, {}, csrf_token=token)

        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.json())
        self.assertNotIn(b"refresh", response.content)

    def test_old_refresh_token_rejected_after_rotation(self):
        client = csrf_client()
        login(client, "jdoe")
        old_cookie_value = client.cookies[settings.AUTH_REFRESH_COOKIE_NAME].value
        token = get_csrf_token(client)
        first = post_json(client, REFRESH_URL, {}, csrf_token=token)
        self.assertEqual(first.status_code, 200)

        # Manually replay the OLD (now-rotated-away) refresh cookie value.
        replay_client = csrf_client()
        replay_client.cookies[settings.AUTH_REFRESH_COOKIE_NAME] = old_cookie_value
        replay_token = get_csrf_token(replay_client)
        replayed = post_json(replay_client, REFRESH_URL, {}, csrf_token=replay_token)
        self.assertEqual(replayed.status_code, 401)

    def test_missing_cookie_401(self):
        client = csrf_client()
        token = get_csrf_token(client)
        response = post_json(client, REFRESH_URL, {}, csrf_token=token)
        self.assertEqual(response.status_code, 401)

    def test_invalid_cookie_401(self):
        client = csrf_client()
        client.cookies[settings.AUTH_REFRESH_COOKIE_NAME] = "garbage-not-a-jwt"
        token = get_csrf_token(client)
        response = post_json(client, REFRESH_URL, {}, csrf_token=token)
        self.assertEqual(response.status_code, 401)

    def test_requires_csrf(self):
        client = csrf_client()
        login(client, "jdoe")
        get_csrf_token(client)  # cookie set, header deliberately omitted
        response = post_json(client, REFRESH_URL, {})
        self.assertEqual(response.status_code, 403)

    def test_does_not_require_access_token(self):
        client = csrf_client()
        login(client, "jdoe")
        token = get_csrf_token(client)
        # No Authorization header sent at all.
        response = post_json(client, REFRESH_URL, {}, csrf_token=token)
        self.assertEqual(response.status_code, 200)

    def test_rejects_user_deactivated_since_login(self):
        client = csrf_client()
        login(client, "jdoe")
        self.user.is_active = False
        self.user.save(update_fields=["is_active"])
        token = get_csrf_token(client)
        response = post_json(client, REFRESH_URL, {}, csrf_token=token)
        self.assertEqual(response.status_code, 401)


class LogoutTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user = make_user("jdoe")

    def test_blacklists_clears_cookie_returns_204(self):
        client = csrf_client()
        login(client, "jdoe")
        token = get_csrf_token(client)

        response = post_json(client, LOGOUT_URL, {}, csrf_token=token)

        self.assertEqual(response.status_code, 204)
        cleared = response.cookies[settings.AUTH_REFRESH_COOKIE_NAME]
        self.assertEqual(cleared.value, "")
        self.assertTrue(cleared["httponly"])
        self.assertEqual(cleared["samesite"], "Lax")
        self.assertEqual(cleared["path"], settings.AUTH_REFRESH_COOKIE_PATH)

    def test_refresh_after_logout_401(self):
        client = csrf_client()
        login(client, "jdoe")
        token = get_csrf_token(client)
        logout_response = post_json(client, LOGOUT_URL, {}, csrf_token=token)
        self.assertEqual(logout_response.status_code, 204)

        # Client's cookie jar now holds the cleared (empty) cookie, exactly
        # as a real browser's would after obeying the Set-Cookie above.
        refresh_response = post_json(client, REFRESH_URL, {}, csrf_token=token)
        self.assertEqual(refresh_response.status_code, 401)

    def test_idempotent_with_no_cookie_present(self):
        client = csrf_client()
        token = get_csrf_token(client)
        response = post_json(client, LOGOUT_URL, {}, csrf_token=token)
        self.assertEqual(response.status_code, 204)

    def test_idempotent_when_already_blacklisted(self):
        client = csrf_client()
        login(client, "jdoe")
        token = get_csrf_token(client)
        first = post_json(client, LOGOUT_URL, {}, csrf_token=token)
        self.assertEqual(first.status_code, 204)

        second = post_json(client, LOGOUT_URL, {}, csrf_token=token)
        self.assertEqual(second.status_code, 204)

    def test_requires_csrf(self):
        client = csrf_client()
        login(client, "jdoe")
        get_csrf_token(client)
        response = post_json(client, LOGOUT_URL, {})
        self.assertEqual(response.status_code, 403)

    def test_does_not_require_access_token(self):
        client = csrf_client()
        login(client, "jdoe")
        token = get_csrf_token(client)
        response = post_json(client, LOGOUT_URL, {}, csrf_token=token)
        self.assertEqual(response.status_code, 204)


class RevocationReflectedWithExistingJwtTests(TestCase):
    """An access token carries no role/permission/company claims (only
    user_id) - every protected endpoint re-resolves membership and
    permissions from the database on every request, so revoking access
    takes effect on the very next call using the *same*, still-unexpired
    access token, with no server-side token revocation needed for this.
    """

    def setUp(self):
        cache.clear()
        self.user = make_user("jdoe")
        self.company = make_company("ACME")
        self.membership = CompanyMembership.objects.create(user=self.user, company=self.company)
        self.permission = make_permission("orders.view")
        self.role = make_role(self.company, "VIEWER", permissions=[self.permission])

    def test_membership_deactivation_reflected(self):
        client = csrf_client()
        access = login(client, "jdoe")["access"]

        before = Client().get(COMPANIES_MINE_URL, **bearer(access))
        self.assertEqual([c["code"] for c in before.json()["companies"]], ["ACME"])

        self.membership.is_active = False
        self.membership.save(update_fields=["is_active", "updated_at"])

        after = Client().get(COMPANIES_MINE_URL, **bearer(access))
        self.assertEqual(after.json()["companies"], [])

    def test_role_assignment_revocation_reflected(self):
        assignment = assign_role(self.membership, self.role)
        client = csrf_client()
        access = login(client, "jdoe")["access"]

        before = Client().get(my_permissions_url(self.company.id), **bearer(access))
        self.assertEqual(before.json()["permissions"], ["orders.view"])

        assignment.is_active = False
        assignment.save(update_fields=["is_active", "updated_at"])

        after = Client().get(my_permissions_url(self.company.id), **bearer(access))
        self.assertEqual(after.json()["permissions"], [])

    def test_user_deactivation_blocks_me_with_existing_access_token(self):
        client = csrf_client()
        access = login(client, "jdoe")["access"]

        before = Client().get(ME_URL, **bearer(access))
        self.assertEqual(before.status_code, 200)

        self.user.is_active = False
        self.user.save(update_fields=["is_active"])

        after = Client().get(ME_URL, **bearer(access))
        self.assertEqual(after.status_code, 401)


class CompanyIsolationBypassRegressionTests(TestCase):
    """Task 04 hardening: proves permission resolution fails closed even if
    an invalid cross-company MembershipRole row exists (the documented
    MembershipRole.save()/clean() bulk-write limitation from Task 03 -
    see docs/backend-decisions.md), and that the same-company invariant on
    CompanyRole/CompanyMembership cannot be broken through save().
    """

    def setUp(self):
        cache.clear()
        self.user = make_user("jdoe")
        self.company_a = make_company("ACME")
        self.company_b = make_company("BETA")
        self.membership_a = CompanyMembership.objects.create(user=self.user, company=self.company_a)
        self.permission = make_permission("orders.view")
        self.role_b = make_role(self.company_b, "MANAGER", permissions=[self.permission])

    def test_bulk_create_bypass_grants_no_access_via_api(self):
        # membership_a belongs to company_a, role_b belongs to company_b -
        # an invalid pairing that save()/clean() would reject, created here
        # only via bulk_create() to reproduce the documented bypass.
        MembershipRole.objects.bulk_create(
            [MembershipRole(membership=self.membership_a, role=self.role_b)]
        )

        client = csrf_client()
        access = login(client, "jdoe")["access"]

        response_a = Client().get(my_permissions_url(self.company_a.id), **bearer(access))
        self.assertEqual(response_a.json()["permissions"], [])

        # The user has no membership in company_b at all, so this must 404,
        # not leak company_b's role permissions either.
        response_b = Client().get(my_permissions_url(self.company_b.id), **bearer(access))
        self.assertEqual(response_b.status_code, 404)

    def test_changing_company_role_company_after_creation_rejected(self):
        self.role_b.company = self.company_a
        with self.assertRaises(Exception):
            self.role_b.save()

    def test_changing_company_membership_company_after_creation_rejected(self):
        self.membership_a.company = self.company_b
        with self.assertRaises(Exception):
            self.membership_a.save()

    def test_queryset_update_bypass_of_company_change_still_fails_closed(self):
        """Documented limitation: QuerySet.update() bypasses save()/clean(),
        so it CAN still reassign a role's company underneath existing
        assignments. This proves that even then, effective_permission_codes
        stays fail-closed rather than granting cross-company access - see
        docs/backend-decisions.md (Task 04) for why the double company
        constraint in that query makes this hold regardless.
        """
        role_a = make_role(self.company_a, "VIEWER", permissions=[self.permission])
        assign_role(self.membership_a, role_a)

        CompanyRole.objects.filter(pk=role_a.pk).update(company=self.company_b)

        client = csrf_client()
        access = login(client, "jdoe")["access"]
        response_a = Client().get(my_permissions_url(self.company_a.id), **bearer(access))
        self.assertEqual(response_a.json()["permissions"], [])
