import json
from unittest.mock import patch

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import Client, TestCase
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from apps.audit.models import AuditLog
from apps.companies.models import Company, CompanyMembership
from apps.companies.services import active_companies_for_user
from apps.permissions.models import CompanyRole, MembershipRole, PermissionDefinition
from apps.permissions.services import effective_permission_codes

User = get_user_model()

PASSWORD = "a-strong-pass-1"

USERS_URL = "/api/v1/users/"


def user_url(user_id):
    return f"/api/v1/users/{user_id}/"


def activate_url(user_id):
    return f"/api/v1/users/{user_id}/activate/"


def deactivate_url(user_id):
    return f"/api/v1/users/{user_id}/deactivate/"


def memberships_url(user_id):
    return f"/api/v1/users/{user_id}/memberships/"


def membership_deactivate_url(user_id, membership_id):
    return f"/api/v1/users/{user_id}/memberships/{membership_id}/deactivate/"


def roles_url(user_id, membership_id):
    return f"/api/v1/users/{user_id}/memberships/{membership_id}/roles/"


def role_deactivate_url(user_id, membership_id, assignment_id):
    return f"/api/v1/users/{user_id}/memberships/{membership_id}/roles/{assignment_id}/deactivate/"


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


def make_permission(code, module="orders", **kwargs):
    return PermissionDefinition.objects.create(code=code, name=code, module=module, **kwargs)


def make_role(company, code, permissions=(), **kwargs):
    role = CompanyRole.objects.create(company=company, code=code, name=code, **kwargs)
    if permissions:
        role.permissions.set(permissions)
    return role


def access_token_for(user):
    return str(AccessToken.for_user(user))


def bearer(token):
    return {"HTTP_AUTHORIZATION": f"Bearer {token}"}


def get_json(client, url, token, **extra):
    return client.get(url, **bearer(token), **extra)


def post_json(client, url, payload, token=None, **extra):
    headers = dict(extra)
    if token is not None:
        headers.update(bearer(token))
    return client.post(url, data=json.dumps(payload), content_type="application/json", **headers)


def patch_json(client, url, payload, token):
    return client.patch(
        url, data=json.dumps(payload), content_type="application/json", **bearer(token)
    )


class UserManagementTestCase(TestCase):
    """Shared setup: one active superuser (the actor) plus a plain client."""

    def setUp(self):
        cache.clear()
        self.superuser = make_superuser("admin")
        self.superuser_token = access_token_for(self.superuser)
        self.client_ = Client()


class AuthorizationTests(UserManagementTestCase):
    def test_anonymous_401(self):
        response = self.client_.get(USERS_URL)
        self.assertEqual(response.status_code, 401)

    def test_invalid_token_401(self):
        response = self.client_.get(USERS_URL, **bearer("not-a-real-token"))
        self.assertEqual(response.status_code, 401)

    def test_ordinary_user_403(self):
        user = make_user("plain")
        response = get_json(self.client_, USERS_URL, access_token_for(user))
        self.assertEqual(response.status_code, 403)

    def test_ordinary_staff_403(self):
        staff = make_user("staffer", is_staff=True)
        response = get_json(self.client_, USERS_URL, access_token_for(staff))
        self.assertEqual(response.status_code, 403)

    def test_inactive_superuser_401(self):
        self.superuser.is_active = False
        self.superuser.save(update_fields=["is_active"])
        response = get_json(self.client_, USERS_URL, self.superuser_token)
        self.assertEqual(response.status_code, 401)

    def test_active_superuser_200(self):
        response = get_json(self.client_, USERS_URL, self.superuser_token)
        self.assertEqual(response.status_code, 200)

    def test_superuser_administering_users_has_no_implicit_company_access(self):
        company = make_company("ACME")
        self.assertEqual(list(active_companies_for_user(self.superuser)), [])
        self.assertEqual(effective_permission_codes(self.superuser, company), frozenset())

    def test_delete_method_not_allowed(self):
        target = make_user("target")
        response = self.client_.delete(user_url(target.id), **bearer(self.superuser_token))
        self.assertEqual(response.status_code, 405)

    def test_delete_on_list_not_allowed(self):
        response = self.client_.delete(USERS_URL, **bearer(self.superuser_token))
        self.assertEqual(response.status_code, 405)


class UserListTests(UserManagementTestCase):
    def test_pagination_bounded(self):
        for i in range(25):
            make_user(f"user{i:03d}")
        response = get_json(self.client_, USERS_URL + "?page_size=500", self.superuser_token)
        body = response.json()
        self.assertLessEqual(len(body["results"]), 100)  # max_page_size cap
        self.assertIn("count", body)

    def test_default_page_size(self):
        for i in range(25):
            make_user(f"user{i:03d}")
        response = get_json(self.client_, USERS_URL, self.superuser_token)
        body = response.json()
        self.assertEqual(len(body["results"]), 20)
        self.assertIsNotNone(body["next"])

    def test_search_matches_username_email_first_last(self):
        make_user("jdoe", first_name="Jane", last_name="Doe")
        make_user("bsmith", first_name="Bob", last_name="Smith")
        response = get_json(self.client_, USERS_URL + "?search=doe", self.superuser_token)
        usernames = [u["username"] for u in response.json()["results"]]
        self.assertIn("jdoe", usernames)
        self.assertNotIn("bsmith", usernames)

    def test_is_active_filter_true_false(self):
        active_user = make_user("active1")
        inactive_user = make_user("inactive1", is_active=False)

        only_active = get_json(self.client_, USERS_URL + "?is_active=true", self.superuser_token)
        usernames = [u["username"] for u in only_active.json()["results"]]
        self.assertIn(active_user.username, usernames)
        self.assertNotIn(inactive_user.username, usernames)

        only_inactive = get_json(self.client_, USERS_URL + "?is_active=false", self.superuser_token)
        usernames = [u["username"] for u in only_inactive.json()["results"]]
        self.assertIn(inactive_user.username, usernames)

    def test_is_active_filter_rejects_invalid_value(self):
        response = get_json(self.client_, USERS_URL + "?is_active=maybe", self.superuser_token)
        self.assertEqual(response.status_code, 400)

    def test_ordering_allowlist_rejects_unknown_field(self):
        response = get_json(self.client_, USERS_URL + "?ordering=password", self.superuser_token)
        self.assertEqual(response.status_code, 400)

    def test_ordering_by_username_descending(self):
        make_user("aaa")
        make_user("zzz")
        response = get_json(self.client_, USERS_URL + "?ordering=-username", self.superuser_token)
        usernames = [u["username"] for u in response.json()["results"]]
        self.assertEqual(usernames, sorted(usernames, reverse=True))

    def test_list_has_no_n_plus_one_queries(self):
        for i in range(10):
            make_user(f"bulk{i:02d}")
        with self.assertNumQueries(3):  # count, page select, savepoint/txn overhead aside
            get_json(self.client_, USERS_URL, self.superuser_token)

    def test_response_never_contains_password(self):
        make_user("someone")
        response = get_json(self.client_, USERS_URL, self.superuser_token)
        self.assertNotIn(b"password", response.content)


class UserCreateTests(UserManagementTestCase):
    def test_create_success_hashes_password(self):
        response = post_json(
            self.client_,
            USERS_URL,
            {
                "username": "newbie",
                "email": "newbie@example.com",
                "first_name": "New",
                "last_name": "Bie",
                "initial_password": "another-strong-pass-1",
            },
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 201)
        user = User.objects.get(username="newbie")
        self.assertNotEqual(user.password, "another-strong-pass-1")
        self.assertTrue(user.check_password("another-strong-pass-1"))
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)

    def test_create_response_has_no_password_field(self):
        response = post_json(
            self.client_,
            USERS_URL,
            {
                "username": "newbie2",
                "email": "newbie2@example.com",
                "initial_password": "another-strong-pass-1",
            },
            self.superuser_token,
        )
        self.assertNotIn(b"password", response.content)
        self.assertNotIn("initial_password", response.json())

    def test_weak_password_rejected(self):
        response = post_json(
            self.client_,
            USERS_URL,
            {"username": "weakpass", "email": "weakpass@example.com", "initial_password": "123"},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(User.objects.filter(username="weakpass").exists())

    def test_duplicate_username_rejected(self):
        make_user("dup")
        response = post_json(
            self.client_,
            USERS_URL,
            {"username": "dup", "email": "different@example.com", "initial_password": "another-strong-pass-1"},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 400)

    def test_duplicate_email_rejected(self):
        make_user("first", password=PASSWORD)
        response = post_json(
            self.client_,
            USERS_URL,
            {"username": "second", "email": "first@example.com", "initial_password": "another-strong-pass-1"},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 400)

    def test_missing_required_fields_400(self):
        response = post_json(self.client_, USERS_URL, {"username": "onlyusername"}, self.superuser_token)
        self.assertEqual(response.status_code, 400)

    def test_rejects_is_staff(self):
        response = post_json(
            self.client_,
            USERS_URL,
            {
                "username": "sneaky",
                "email": "sneaky@example.com",
                "initial_password": "another-strong-pass-1",
                "is_staff": True,
            },
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(User.objects.filter(username="sneaky").exists())

    def test_rejects_is_superuser(self):
        response = post_json(
            self.client_,
            USERS_URL,
            {
                "username": "sneaky2",
                "email": "sneaky2@example.com",
                "initial_password": "another-strong-pass-1",
                "is_superuser": True,
            },
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 400)

    def test_create_does_not_create_membership_or_role(self):
        post_json(
            self.client_,
            USERS_URL,
            {"username": "lonewolf", "email": "lonewolf@example.com", "initial_password": "another-strong-pass-1"},
            self.superuser_token,
        )
        user = User.objects.get(username="lonewolf")
        self.assertEqual(CompanyMembership.objects.filter(user=user).count(), 0)

    def test_create_writes_audit_entry_without_password(self):
        post_json(
            self.client_,
            USERS_URL,
            {"username": "audited", "email": "audited@example.com", "initial_password": "another-strong-pass-1"},
            self.superuser_token,
        )
        user = User.objects.get(username="audited")
        entry = AuditLog.objects.get(action="user.created", target_type="user", target_id=user.id)
        self.assertEqual(entry.actor_id, self.superuser.id)
        self.assertNotIn("password", json.dumps(entry.after))
        self.assertNotIn("another-strong-pass-1", json.dumps(entry.after))


class UserDetailTests(UserManagementTestCase):
    def test_get_returns_safe_fields(self):
        target = make_user("target", first_name="Tar", last_name="Get")
        response = get_json(self.client_, user_url(target.id), self.superuser_token)
        body = response.json()
        self.assertEqual(body["username"], "target")
        self.assertNotIn("password", body)
        self.assertIn("memberships_url", body)
        self.assertEqual(body["memberships_url"], memberships_url(target.id))

    def test_get_nonexistent_404(self):
        response = get_json(self.client_, user_url(999999), self.superuser_token)
        self.assertEqual(response.status_code, 404)


class UserUpdateTests(UserManagementTestCase):
    def setUp(self):
        super().setUp()
        self.target = make_user("target", first_name="Old", last_name="Name")

    def test_patch_updates_allowed_fields(self):
        response = patch_json(
            self.client_, user_url(self.target.id), {"first_name": "New"}, self.superuser_token
        )
        self.assertEqual(response.status_code, 200)
        self.target.refresh_from_db()
        self.assertEqual(self.target.first_name, "New")

    def test_patch_rejects_password(self):
        response = patch_json(
            self.client_, user_url(self.target.id), {"password": "whatever123"}, self.superuser_token
        )
        self.assertEqual(response.status_code, 400)

    def test_patch_rejects_is_active(self):
        response = patch_json(
            self.client_, user_url(self.target.id), {"is_active": False}, self.superuser_token
        )
        self.assertEqual(response.status_code, 400)
        self.target.refresh_from_db()
        self.assertTrue(self.target.is_active)

    def test_patch_rejects_is_superuser(self):
        response = patch_json(
            self.client_, user_url(self.target.id), {"is_superuser": True}, self.superuser_token
        )
        self.assertEqual(response.status_code, 400)

    def test_patch_duplicate_username_is_400_not_500(self):
        make_user("takenname")
        response = patch_json(
            self.client_, user_url(self.target.id), {"username": "takenname"}, self.superuser_token
        )
        self.assertEqual(response.status_code, 400)

    def test_patch_noop_creates_no_audit_entry(self):
        AuditLog.objects.all().delete()
        patch_json(
            self.client_,
            user_url(self.target.id),
            {"first_name": self.target.first_name},
            self.superuser_token,
        )
        self.assertEqual(AuditLog.objects.filter(target_type="user", target_id=self.target.id).count(), 0)

    def test_patch_creates_audit_entry_with_before_after(self):
        patch_json(
            self.client_, user_url(self.target.id), {"first_name": "Changed"}, self.superuser_token
        )
        entry = AuditLog.objects.get(
            action="user.updated", target_type="user", target_id=self.target.id
        )
        self.assertEqual(entry.before["first_name"], "Old")
        self.assertEqual(entry.after["first_name"], "Changed")


class ActivateDeactivateTests(UserManagementTestCase):
    def setUp(self):
        super().setUp()
        self.target = make_user("target")

    def test_deactivate_then_activate_roundtrip(self):
        response = post_json(self.client_, deactivate_url(self.target.id), {}, self.superuser_token)
        self.assertEqual(response.status_code, 200)
        self.target.refresh_from_db()
        self.assertFalse(self.target.is_active)

        response = post_json(self.client_, activate_url(self.target.id), {}, self.superuser_token)
        self.assertEqual(response.status_code, 200)
        self.target.refresh_from_db()
        self.assertTrue(self.target.is_active)

    def test_deactivate_idempotent_single_audit_entry(self):
        post_json(self.client_, deactivate_url(self.target.id), {}, self.superuser_token)
        post_json(self.client_, deactivate_url(self.target.id), {}, self.superuser_token)
        self.assertEqual(
            AuditLog.objects.filter(action="user.deactivated", target_id=self.target.id).count(), 1
        )

    def test_activate_idempotent(self):
        response = post_json(self.client_, activate_url(self.target.id), {}, self.superuser_token)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            AuditLog.objects.filter(action="user.activated", target_id=self.target.id).count(), 0
        )

    def test_self_deactivation_blocked(self):
        response = post_json(self.client_, deactivate_url(self.superuser.id), {}, self.superuser_token)
        self.assertEqual(response.status_code, 400)
        self.superuser.refresh_from_db()
        self.assertTrue(self.superuser.is_active)

    def test_other_superuser_deactivate_blocked(self):
        other_admin = make_superuser("other_admin")
        response = post_json(self.client_, deactivate_url(other_admin.id), {}, self.superuser_token)
        self.assertEqual(response.status_code, 403)
        other_admin.refresh_from_db()
        self.assertTrue(other_admin.is_active)

    def test_other_superuser_activate_blocked(self):
        other_admin = make_superuser("other_admin2")
        other_admin.is_active = False
        other_admin.save(update_fields=["is_active"])
        response = post_json(self.client_, activate_url(other_admin.id), {}, self.superuser_token)
        self.assertEqual(response.status_code, 403)

    def test_deactivate_does_not_touch_memberships_or_roles(self):
        company = make_company("ACME")
        membership = CompanyMembership.objects.create(user=self.target, company=company)
        permission = make_permission("orders.view")
        role = make_role(company, "VIEWER", permissions=[permission])
        MembershipRole.objects.create(membership=membership, role=role)

        post_json(self.client_, deactivate_url(self.target.id), {}, self.superuser_token)

        membership.refresh_from_db()
        self.assertTrue(membership.is_active)
        self.assertTrue(MembershipRole.objects.get(membership=membership, role=role).is_active)

    def test_deactivated_user_existing_access_token_rejected(self):
        old_access = access_token_for(self.target)
        post_json(self.client_, deactivate_url(self.target.id), {}, self.superuser_token)
        response = self.client_.get("/api/v1/auth/me/", **bearer(old_access))
        self.assertEqual(response.status_code, 401)

    def test_deactivated_user_existing_refresh_rejected(self):
        refresh = RefreshToken.for_user(self.target)
        post_json(self.client_, deactivate_url(self.target.id), {}, self.superuser_token)

        csrf_client = Client(enforce_csrf_checks=True)
        csrf_client.cookies[settings.AUTH_REFRESH_COOKIE_NAME] = str(refresh)
        csrf_token = csrf_client.get("/api/v1/auth/csrf/").json()["csrfToken"]
        response = csrf_client.post(
            "/api/v1/auth/refresh/",
            data=json.dumps({}),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=csrf_token,
        )
        self.assertEqual(response.status_code, 401)


class MembershipAndRoleAssignmentAuthorizationTests(UserManagementTestCase):
    """Targeted regression coverage (Task 08A, step 5): company membership
    assignment and company role assignment are, and must remain, active-
    superuser-only. Nothing about a user's own company membership or
    company role ever grants them access to manage anyone's membership or
    role assignments - this was previously described inaccurately in a
    progress report as something an "ordinary company user" could do "if
    assigned" via permissions; the actual permission_classes on
    MembershipListCreateView/MembershipDeactivateView/
    RoleAssignmentListCreateView/RoleAssignmentDeactivateView is, and
    always was, exactly [IsActiveSuperuser] - there is no permission-based
    path to these endpoints for anyone else, company role or not.
    """

    def setUp(self):
        super().setUp()
        self.target = make_user("target")
        self.company = make_company("ACME")
        self.membership = CompanyMembership.objects.create(user=self.target, company=self.company)
        self.role = CompanyRole.objects.create(company=self.company, code="MANAGER", name="Manager")

    def test_ordinary_user_cannot_list_or_assign_memberships(self):
        user = make_user("plain")
        token = access_token_for(user)
        self.assertEqual(get_json(self.client_, memberships_url(self.target.id), token).status_code, 403)
        response = post_json(
            self.client_, memberships_url(self.target.id), {"company_id": self.company.id}, token
        )
        self.assertEqual(response.status_code, 403)

    def test_ordinary_staff_cannot_list_or_assign_memberships(self):
        staff = make_user("staffer", is_staff=True)
        token = access_token_for(staff)
        self.assertEqual(get_json(self.client_, memberships_url(self.target.id), token).status_code, 403)

    def test_company_role_holder_cannot_manage_memberships(self):
        """Even a user who is themselves an active member of the target's
        own company, with a role assigned, gets no access to this
        endpoint - company membership/roles are a business concept,
        entirely separate from the administrative
        IsActiveSuperuser-gated management APIs.
        """
        from apps.permissions.services import assign_role

        holder = make_user("holder")
        holder_membership = CompanyMembership.objects.create(user=holder, company=self.company)
        assign_role(holder_membership, self.role)
        token = access_token_for(holder)
        self.assertEqual(get_json(self.client_, memberships_url(self.target.id), token).status_code, 403)

    def test_ordinary_user_cannot_deactivate_membership(self):
        user = make_user("plain")
        response = post_json(
            self.client_,
            membership_deactivate_url(self.target.id, self.membership.id),
            {},
            access_token_for(user),
        )
        self.assertEqual(response.status_code, 403)

    def test_ordinary_user_cannot_list_or_assign_role(self):
        user = make_user("plain")
        token = access_token_for(user)
        self.assertEqual(
            get_json(self.client_, roles_url(self.target.id, self.membership.id), token).status_code, 403
        )
        response = post_json(
            self.client_, roles_url(self.target.id, self.membership.id), {"role_id": self.role.id}, token
        )
        self.assertEqual(response.status_code, 403)

    def test_ordinary_user_cannot_deactivate_role_assignment(self):
        from apps.permissions.services import assign_role

        assignment = assign_role(self.membership, self.role)
        user = make_user("plain")
        response = post_json(
            self.client_,
            role_deactivate_url(self.target.id, self.membership.id, assignment.id),
            {},
            access_token_for(user),
        )
        self.assertEqual(response.status_code, 403)


class MembershipEndpointTests(UserManagementTestCase):
    def setUp(self):
        super().setUp()
        self.target = make_user("target")
        self.company = make_company("ACME")

    def test_list_shows_active_and_inactive(self):
        m1 = CompanyMembership.objects.create(user=self.target, company=self.company)
        other_company = make_company("BETA")
        m2 = CompanyMembership.objects.create(user=self.target, company=other_company, is_active=False)

        response = get_json(self.client_, memberships_url(self.target.id), self.superuser_token)
        ids = {row["id"]: row["is_active"] for row in response.json()}
        self.assertEqual(ids, {m1.id: True, m2.id: False})

    def test_assign_new_membership_201(self):
        response = post_json(
            self.client_,
            memberships_url(self.target.id),
            {"company_id": self.company.id},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(CompanyMembership.objects.filter(user=self.target, company=self.company).count(), 1)

    def test_assign_existing_active_membership_200_no_duplicate(self):
        CompanyMembership.objects.create(user=self.target, company=self.company)
        response = post_json(
            self.client_,
            memberships_url(self.target.id),
            {"company_id": self.company.id},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(CompanyMembership.objects.filter(user=self.target, company=self.company).count(), 1)

    def test_assign_reactivates_inactive_membership_200(self):
        membership = CompanyMembership.objects.create(user=self.target, company=self.company, is_active=False)
        response = post_json(
            self.client_,
            memberships_url(self.target.id),
            {"company_id": self.company.id},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 200)
        membership.refresh_from_db()
        self.assertTrue(membership.is_active)

    def test_assign_rejects_inactive_user(self):
        self.target.is_active = False
        self.target.save(update_fields=["is_active"])
        response = post_json(
            self.client_,
            memberships_url(self.target.id),
            {"company_id": self.company.id},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(CompanyMembership.objects.filter(user=self.target).count(), 0)

    def test_assign_rejects_inactive_company(self):
        self.company.is_active = False
        self.company.save(update_fields=["is_active", "updated_at"])
        response = post_json(
            self.client_,
            memberships_url(self.target.id),
            {"company_id": self.company.id},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 400)

    def test_assign_unknown_company_404(self):
        response = post_json(
            self.client_, memberships_url(self.target.id), {"company_id": 999999}, self.superuser_token
        )
        self.assertEqual(response.status_code, 404)

    def test_deactivate_idempotent(self):
        membership = CompanyMembership.objects.create(user=self.target, company=self.company)
        url = membership_deactivate_url(self.target.id, membership.id)
        first = post_json(self.client_, url, {}, self.superuser_token)
        second = post_json(self.client_, url, {}, self.superuser_token)
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(AuditLog.objects.filter(action="membership.deactivated").count(), 1)

    def test_deactivate_wrong_user_returns_404_no_mutation(self):
        other_user = make_user("other")
        membership = CompanyMembership.objects.create(user=other_user, company=self.company)
        url = membership_deactivate_url(self.target.id, membership.id)  # target != other_user
        response = post_json(self.client_, url, {}, self.superuser_token)
        self.assertEqual(response.status_code, 404)
        membership.refresh_from_db()
        self.assertTrue(membership.is_active)

    def test_deactivate_revokes_access_on_next_lookup(self):
        membership = CompanyMembership.objects.create(user=self.target, company=self.company)

        self.assertEqual(len(active_companies_for_user(self.target)), 1)

        post_json(
            self.client_, membership_deactivate_url(self.target.id, membership.id), {}, self.superuser_token
        )

        self.assertEqual(len(active_companies_for_user(self.target)), 0)

    def test_deactivate_retains_role_assignments_for_history(self):
        membership = CompanyMembership.objects.create(user=self.target, company=self.company)
        permission = make_permission("orders.view")
        role = make_role(self.company, "VIEWER", permissions=[permission])
        assignment = MembershipRole.objects.create(membership=membership, role=role)

        post_json(
            self.client_, membership_deactivate_url(self.target.id, membership.id), {}, self.superuser_token
        )

        assignment.refresh_from_db()
        self.assertTrue(assignment.is_active)
        self.assertTrue(MembershipRole.objects.filter(pk=assignment.pk).exists())

    def test_reassigning_membership_restores_still_active_roles(self):
        membership = CompanyMembership.objects.create(user=self.target, company=self.company)
        permission = make_permission("orders.view")
        role = make_role(self.company, "VIEWER", permissions=[permission])
        MembershipRole.objects.create(membership=membership, role=role)
        post_json(
            self.client_, membership_deactivate_url(self.target.id, membership.id), {}, self.superuser_token
        )
        self.assertEqual(effective_permission_codes(self.target, self.company), frozenset())

        post_json(
            self.client_,
            memberships_url(self.target.id),
            {"company_id": self.company.id},
            self.superuser_token,
        )

        self.assertEqual(effective_permission_codes(self.target, self.company), frozenset({"orders.view"}))

    def test_assign_membership_audit_entry_has_company(self):
        post_json(
            self.client_,
            memberships_url(self.target.id),
            {"company_id": self.company.id},
            self.superuser_token,
        )
        entry = AuditLog.objects.get(action="membership.created")
        self.assertEqual(entry.company_id, self.company.id)


class RoleAssignmentEndpointTests(UserManagementTestCase):
    def setUp(self):
        super().setUp()
        self.target = make_user("target")
        self.company_a = make_company("ACME")
        self.company_b = make_company("BETA")
        self.membership = CompanyMembership.objects.create(user=self.target, company=self.company_a)
        self.permission = make_permission("orders.view")
        self.role_a = make_role(self.company_a, "VIEWER", permissions=[self.permission])
        self.role_b = make_role(self.company_b, "MANAGER")

    def test_list_shows_active_and_inactive(self):
        assignment = MembershipRole.objects.create(membership=self.membership, role=self.role_a)
        response = get_json(
            self.client_, roles_url(self.target.id, self.membership.id), self.superuser_token
        )
        body = response.json()
        self.assertEqual(len(body), 1)
        self.assertEqual(body[0]["id"], assignment.id)
        self.assertEqual(body[0]["role_code"], "VIEWER")

    def test_assign_new_role_201(self):
        response = post_json(
            self.client_,
            roles_url(self.target.id, self.membership.id),
            {"role_id": self.role_a.id},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(effective_permission_codes(self.target, self.company_a), frozenset({"orders.view"}))

    def test_assign_existing_active_200_no_duplicate(self):
        MembershipRole.objects.create(membership=self.membership, role=self.role_a)
        response = post_json(
            self.client_,
            roles_url(self.target.id, self.membership.id),
            {"role_id": self.role_a.id},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            MembershipRole.objects.filter(membership=self.membership, role=self.role_a).count(), 1
        )

    def test_assign_reactivates_inactive_assignment_200(self):
        assignment = MembershipRole.objects.create(
            membership=self.membership, role=self.role_a, is_active=False
        )
        response = post_json(
            self.client_,
            roles_url(self.target.id, self.membership.id),
            {"role_id": self.role_a.id},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 200)
        assignment.refresh_from_db()
        self.assertTrue(assignment.is_active)

    def test_cross_company_role_rejected(self):
        response = post_json(
            self.client_,
            roles_url(self.target.id, self.membership.id),
            {"role_id": self.role_b.id},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(
            MembershipRole.objects.filter(membership=self.membership, role=self.role_b).exists()
        )

    def test_assign_rejects_inactive_membership(self):
        self.membership.is_active = False
        self.membership.save(update_fields=["is_active", "updated_at"])
        response = post_json(
            self.client_,
            roles_url(self.target.id, self.membership.id),
            {"role_id": self.role_a.id},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 400)

    def test_assign_rejects_inactive_role(self):
        self.role_a.is_active = False
        self.role_a.save(update_fields=["is_active", "updated_at"])
        response = post_json(
            self.client_,
            roles_url(self.target.id, self.membership.id),
            {"role_id": self.role_a.id},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 400)

    def test_assign_unknown_role_404(self):
        response = post_json(
            self.client_,
            roles_url(self.target.id, self.membership.id),
            {"role_id": 999999},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 404)

    def test_wrong_membership_id_for_user_404(self):
        other_user = make_user("other")
        other_membership = CompanyMembership.objects.create(user=other_user, company=self.company_a)
        response = post_json(
            self.client_,
            roles_url(self.target.id, other_membership.id),  # target doesn't own this membership
            {"role_id": self.role_a.id},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 404)

    def test_deactivate_idempotent(self):
        assignment = MembershipRole.objects.create(membership=self.membership, role=self.role_a)
        url = role_deactivate_url(self.target.id, self.membership.id, assignment.id)
        first = post_json(self.client_, url, {}, self.superuser_token)
        second = post_json(self.client_, url, {}, self.superuser_token)
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(AuditLog.objects.filter(action="role_assignment.deactivated").count(), 1)

    def test_deactivate_wrong_assignment_for_membership_404(self):
        other_membership = CompanyMembership.objects.create(
            user=make_user("other2"), company=self.company_a
        )
        foreign_assignment = MembershipRole.objects.create(membership=other_membership, role=self.role_a)
        url = role_deactivate_url(self.target.id, self.membership.id, foreign_assignment.id)
        response = post_json(self.client_, url, {}, self.superuser_token)
        self.assertEqual(response.status_code, 404)

    def test_deactivate_works_even_if_parents_inactive(self):
        assignment = MembershipRole.objects.create(membership=self.membership, role=self.role_a)
        self.membership.is_active = False
        self.membership.save(update_fields=["is_active", "updated_at"])
        url = role_deactivate_url(self.target.id, self.membership.id, assignment.id)
        response = post_json(self.client_, url, {}, self.superuser_token)
        self.assertEqual(response.status_code, 200)

    def test_permission_revocation_reflected_on_next_lookup(self):
        assignment = MembershipRole.objects.create(membership=self.membership, role=self.role_a)
        self.assertEqual(effective_permission_codes(self.target, self.company_a), frozenset({"orders.view"}))

        post_json(
            self.client_,
            role_deactivate_url(self.target.id, self.membership.id, assignment.id),
            {},
            self.superuser_token,
        )

        self.assertEqual(effective_permission_codes(self.target, self.company_a), frozenset())

    def test_assign_role_audit_entry_has_company(self):
        post_json(
            self.client_,
            roles_url(self.target.id, self.membership.id),
            {"role_id": self.role_a.id},
            self.superuser_token,
        )
        entry = AuditLog.objects.get(action="role_assignment.created")
        self.assertEqual(entry.company_id, self.company_a.id)


class AuditFailureRollbackTests(UserManagementTestCase):
    def test_user_creation_rolls_back_if_audit_write_fails(self):
        with patch("apps.users.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                post_json(
                    self.client_,
                    USERS_URL,
                    {
                        "username": "willnotexist",
                        "email": "willnotexist@example.com",
                        "initial_password": "another-strong-pass-1",
                    },
                    self.superuser_token,
                )
        self.assertFalse(User.objects.filter(username="willnotexist").exists())

    def test_membership_assignment_rolls_back_if_audit_write_fails(self):
        target = make_user("target")
        company = make_company("ACME")
        with patch("apps.users.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                post_json(
                    self.client_,
                    memberships_url(target.id),
                    {"company_id": company.id},
                    self.superuser_token,
                )
        self.assertFalse(CompanyMembership.objects.filter(user=target, company=company).exists())
