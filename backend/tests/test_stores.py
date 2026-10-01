import json
from unittest.mock import patch

from django.contrib.admin.models import LogEntry
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from django.db import IntegrityError, transaction
from django.db.models.deletion import ProtectedError
from django.test import Client, RequestFactory, TestCase

from apps.audit.models import AuditLog
from apps.companies.models import Company, CompanyMembership
from apps.companies.services import active_companies_for_user
from apps.permissions.models import CompanyRole, PermissionDefinition, StoreRole, StoreRoleAssignment
from apps.permissions.services import assign_role, assign_store_role
from apps.stores.admin import SharedStoreAdmin, StoreMembershipAdmin
from apps.stores.models import SharedStore, StoreMembership
from apps.stores.services import (
    active_stores_for_user,
    assign_store_membership,
    assign_store_membership_role,
    deactivate_store_membership,
)

User = get_user_model()
PASSWORD = "a-strong-pass-1"

STORES_URL = "/api/v1/stores/"


def store_url(store_id):
    return f"/api/v1/stores/{store_id}/"


def activate_url(store_id):
    return f"/api/v1/stores/{store_id}/activate/"


def deactivate_url(store_id):
    return f"/api/v1/stores/{store_id}/deactivate/"


def my_permissions_url(store_id):
    return f"/api/v1/stores/{store_id}/my-permissions/"


def overview_url(store_id):
    return f"/api/v1/stores/{store_id}/overview/"


def memberships_url(store_id):
    return f"/api/v1/stores/{store_id}/memberships/"


def membership_deactivate_url(store_id, membership_id):
    return f"/api/v1/stores/{store_id}/memberships/{membership_id}/deactivate/"


def membership_roles_url(store_id, membership_id):
    return f"/api/v1/stores/{store_id}/memberships/{membership_id}/roles/"


def membership_role_deactivate_url(store_id, membership_id, assignment_id):
    return f"/api/v1/stores/{store_id}/memberships/{membership_id}/roles/{assignment_id}/deactivate/"


def make_user(username, password=PASSWORD, **kwargs):
    return User.objects.create_user(
        username=username, email=f"{username}@example.com", password=password, **kwargs
    )


def make_superuser(username, password=PASSWORD):
    return User.objects.create_superuser(
        username=username, email=f"{username}@example.com", password=password
    )


def make_store(code, name=None, **kwargs):
    return SharedStore.objects.create(code=code, name=name or f"{code} Store", **kwargs)


def make_company(code, **kwargs):
    return Company.objects.create(code=code, legal_name=f"{code} Legal Name Pvt Ltd", **kwargs)


def make_permission(code, module="shared_store", scope=PermissionDefinition.Scope.STORE, **kwargs):
    return PermissionDefinition.objects.create(code=code, name=code, module=module, scope=scope, **kwargs)


def make_store_role(store, code, permissions=(), **kwargs):
    role = StoreRole.objects.create(store=store, code=code, name=code, **kwargs)
    if permissions:
        role.permissions.set(permissions)
    return role


def access_token_for(user):
    from rest_framework_simplejwt.tokens import AccessToken

    return str(AccessToken.for_user(user))


def bearer(token):
    return {"HTTP_AUTHORIZATION": f"Bearer {token}"}


def get_json(client, url, token, **extra):
    return client.get(url, **bearer(token), **extra)


def post_json(client, url, payload, token):
    return client.post(url, data=json.dumps(payload), content_type="application/json", **bearer(token))


def patch_json(client, url, payload, token):
    return client.patch(url, data=json.dumps(payload), content_type="application/json", **bearer(token))


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class SharedStoreModelTests(TestCase):
    def test_code_is_required(self):
        with self.assertRaises(Exception):
            SharedStore.objects.create(code="", name="Main Store")

    def test_name_whitespace_only_is_rejected(self):
        with self.assertRaises(Exception):
            SharedStore.objects.create(code="MAIN", name="   ")

    def test_code_is_normalised(self):
        store = SharedStore.objects.create(code="  main  ", name="Main Store")
        self.assertEqual(store.code, "MAIN")

    def test_is_active_defaults_true(self):
        store = make_store("MAIN")
        self.assertTrue(store.is_active)

    def test_code_uniqueness_enforced_in_database(self):
        make_store("MAIN")
        with transaction.atomic():
            with self.assertRaises(IntegrityError):
                SharedStore.objects.create(code="MAIN", name="Duplicate")

    def test_has_no_company_field(self):
        self.assertFalse(hasattr(SharedStore(), "company"))
        self.assertFalse(hasattr(SharedStore(), "company_id"))


class StoreMembershipModelTests(TestCase):
    def setUp(self):
        self.user = make_user("jdoe")
        self.store_a = make_store("MAIN")
        self.store_b = make_store("BACKUP")

    def test_duplicate_membership_rejected_by_database(self):
        StoreMembership.objects.create(user=self.user, store=self.store_a)
        with transaction.atomic():
            with self.assertRaises(IntegrityError):
                StoreMembership.objects.create(user=self.user, store=self.store_a)

    def test_duplicate_rejected_even_when_existing_row_is_inactive(self):
        membership = StoreMembership.objects.create(user=self.user, store=self.store_a)
        membership.is_active = False
        membership.save(update_fields=["is_active", "updated_at"])
        with transaction.atomic():
            with self.assertRaises(IntegrityError):
                StoreMembership.objects.create(user=self.user, store=self.store_a)

    def test_activate_reactivates_existing_row_instead_of_duplicating(self):
        membership = StoreMembership.objects.create(user=self.user, store=self.store_a)
        membership.is_active = False
        membership.save(update_fields=["is_active", "updated_at"])

        reactivated = StoreMembership.objects.activate(user=self.user, store=self.store_a)

        self.assertEqual(reactivated.pk, membership.pk)
        self.assertTrue(reactivated.is_active)
        self.assertEqual(StoreMembership.objects.filter(user=self.user, store=self.store_a).count(), 1)

    def test_user_can_belong_to_both_stores(self):
        StoreMembership.objects.create(user=self.user, store=self.store_a)
        StoreMembership.objects.create(user=self.user, store=self.store_b)
        self.assertEqual(list(active_stores_for_user(self.user)), [self.store_b, self.store_a])

    def test_store_immutable_after_creation(self):
        membership = StoreMembership.objects.create(user=self.user, store=self.store_a)
        membership.store = self.store_b
        with self.assertRaises(Exception):
            membership.save()

    def test_store_protected_from_deletion_while_membership_exists(self):
        StoreMembership.objects.create(user=self.user, store=self.store_a)
        with transaction.atomic():
            with self.assertRaises(ProtectedError):
                self.store_a.delete()


class ActiveStoresForUserTests(TestCase):
    def setUp(self):
        self.user = make_user("jdoe")
        self.store = make_store("MAIN")

    def test_anonymous_user_gets_empty_result(self):
        self.assertEqual(list(active_stores_for_user(AnonymousUser())), [])

    def test_none_user_gets_empty_result(self):
        self.assertEqual(list(active_stores_for_user(None)), [])

    def test_user_without_membership_gets_empty_result(self):
        self.assertEqual(list(active_stores_for_user(self.user)), [])

    def test_active_membership_is_returned(self):
        StoreMembership.objects.create(user=self.user, store=self.store)
        self.assertEqual(list(active_stores_for_user(self.user)), [self.store])

    def test_inactive_store_is_excluded(self):
        StoreMembership.objects.create(user=self.user, store=self.store)
        self.store.is_active = False
        self.store.save(update_fields=["is_active", "updated_at"])
        self.assertEqual(list(active_stores_for_user(self.user)), [])

    def test_inactive_membership_is_excluded(self):
        membership = StoreMembership.objects.create(user=self.user, store=self.store)
        membership.is_active = False
        membership.save(update_fields=["is_active", "updated_at"])
        self.assertEqual(list(active_stores_for_user(self.user)), [])

    def test_inactive_user_is_excluded(self):
        StoreMembership.objects.create(user=self.user, store=self.store)
        self.user.is_active = False
        self.user.save(update_fields=["is_active"])
        self.assertEqual(list(active_stores_for_user(self.user)), [])

    def test_staff_flag_does_not_grant_implicit_access(self):
        staff_user = make_user("staffer", is_staff=True)
        self.assertEqual(list(active_stores_for_user(staff_user)), [])

    def test_superuser_flag_does_not_grant_implicit_access(self):
        superuser = make_superuser("admin")
        self.assertEqual(list(active_stores_for_user(superuser)), [])

    def test_company_membership_never_grants_store_access(self):
        """Company membership or company role must never grant store
        access - active_stores_for_user() never consults Company/
        CompanyMembership at all.
        """
        company = make_company("ACME")
        CompanyMembership.objects.create(user=self.user, company=company)
        self.assertEqual(list(active_stores_for_user(self.user)), [])

    def test_store_membership_never_grants_company_access(self):
        """The reverse of the above - store access must never imply
        company data access.
        """
        StoreMembership.objects.create(user=self.user, store=self.store)
        self.assertEqual(list(active_companies_for_user(self.user)), [])


# ---------------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------------


class StoreAdminAccessRestrictionTests(TestCase):
    def setUp(self):
        self.factory = RequestFactory()
        self.store_admin = SharedStoreAdmin(SharedStore, admin_site=None)
        self.membership_admin = StoreMembershipAdmin(StoreMembership, admin_site=None)

    def _request_as(self, user):
        request = self.factory.get("/admin/")
        request.user = user
        return request

    def test_active_superuser_can_view_but_not_add_or_change(self):
        """New access models are read-only in admin, even for an active
        superuser - mutations go through the audited API only.
        """
        superuser = make_superuser("admin")
        request = self._request_as(superuser)
        for admin_instance in (self.store_admin, self.membership_admin):
            self.assertTrue(admin_instance.has_module_permission(request))
            self.assertTrue(admin_instance.has_view_permission(request))
            self.assertFalse(admin_instance.has_add_permission(request))
            self.assertFalse(admin_instance.has_change_permission(request))
            self.assertFalse(admin_instance.has_delete_permission(request))

    def test_ordinary_staff_cannot_view(self):
        staff_user = make_user("staffer", is_staff=True)
        request = self._request_as(staff_user)
        for admin_instance in (self.store_admin, self.membership_admin):
            self.assertFalse(admin_instance.has_module_permission(request))
            self.assertFalse(admin_instance.has_view_permission(request))

    def test_inactive_superuser_cannot_view(self):
        superuser = make_superuser("admin")
        superuser.is_active = False
        superuser.save(update_fields=["is_active"])
        request = self._request_as(superuser)
        for admin_instance in (self.store_admin, self.membership_admin):
            self.assertFalse(admin_instance.has_module_permission(request))


# ---------------------------------------------------------------------------
# Store management API
# ---------------------------------------------------------------------------


class StoreManagementTestCase(TestCase):
    def setUp(self):
        self.superuser = make_superuser("admin")
        self.superuser_token = access_token_for(self.superuser)
        self.client_ = Client()


class StoreAuthorizationTests(StoreManagementTestCase):
    def test_anonymous_401(self):
        response = self.client_.get(STORES_URL)
        self.assertEqual(response.status_code, 401)

    def test_ordinary_user_403(self):
        user = make_user("plain")
        response = get_json(self.client_, STORES_URL, access_token_for(user))
        self.assertEqual(response.status_code, 403)

    def test_ordinary_staff_403(self):
        staff = make_user("staffer", is_staff=True)
        response = get_json(self.client_, STORES_URL, access_token_for(staff))
        self.assertEqual(response.status_code, 403)

    def test_active_superuser_200(self):
        response = get_json(self.client_, STORES_URL, self.superuser_token)
        self.assertEqual(response.status_code, 200)

    def test_delete_not_allowed_on_list(self):
        response = self.client_.delete(STORES_URL, **bearer(self.superuser_token))
        self.assertEqual(response.status_code, 405)

    def test_delete_not_allowed_on_detail(self):
        store = make_store("MAIN")
        response = self.client_.delete(store_url(store.id), **bearer(self.superuser_token))
        self.assertEqual(response.status_code, 405)

    def test_superuser_operational_endpoints_do_not_bypass_membership(self):
        """No implicit superuser operational bypass: a superuser with no
        StoreMembership gets 404 from /mine/-style endpoints exactly like
        an ordinary user would.
        """
        store = make_store("MAIN")
        response = get_json(self.client_, my_permissions_url(store.id), self.superuser_token)
        self.assertEqual(response.status_code, 404)
        response = get_json(self.client_, overview_url(store.id), self.superuser_token)
        self.assertEqual(response.status_code, 404)


class StoreCreateTests(StoreManagementTestCase):
    def test_create_success(self):
        response = post_json(
            self.client_, STORES_URL, {"code": "main", "name": "Main Store"}, self.superuser_token
        )
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body["code"], "MAIN")
        self.assertTrue(body["is_active"])

    def test_duplicate_code_rejected_400(self):
        make_store("MAIN")
        response = post_json(
            self.client_, STORES_URL, {"code": "MAIN", "name": "Duplicate"}, self.superuser_token
        )
        self.assertEqual(response.status_code, 400)

    def test_missing_name_400(self):
        response = post_json(self.client_, STORES_URL, {"code": "MAIN"}, self.superuser_token)
        self.assertEqual(response.status_code, 400)

    def test_rejects_is_active(self):
        response = post_json(
            self.client_,
            STORES_URL,
            {"code": "MAIN", "name": "Main Store", "is_active": False},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 400)

    def test_create_writes_audit_entry_with_store_context(self):
        response = post_json(
            self.client_, STORES_URL, {"code": "MAIN", "name": "Main Store"}, self.superuser_token
        )
        store_id = response.json()["id"]
        entry = AuditLog.objects.filter(target_type="store", target_id=store_id).get()
        self.assertEqual(entry.action, "store.created")
        self.assertEqual(entry.store_id, store_id)
        self.assertIsNone(entry.company_id)

    def test_create_creates_no_membership_or_role(self):
        post_json(self.client_, STORES_URL, {"code": "MAIN", "name": "Main Store"}, self.superuser_token)
        self.assertEqual(StoreMembership.objects.count(), 0)
        self.assertEqual(StoreRole.objects.count(), 0)

    def test_ordinary_user_cannot_create(self):
        user = make_user("plain")
        response = post_json(
            self.client_, STORES_URL, {"code": "MAIN", "name": "Main Store"}, access_token_for(user)
        )
        self.assertEqual(response.status_code, 403)


class StoreListTests(StoreManagementTestCase):
    def setUp(self):
        super().setUp()
        make_store("MAIN", is_active=True)
        make_store("BACKUP", is_active=False)

    def test_list_includes_active_and_inactive(self):
        response = get_json(self.client_, STORES_URL, self.superuser_token)
        codes = {row["code"] for row in response.json()["results"]}
        self.assertEqual(codes, {"MAIN", "BACKUP"})

    def test_search_matches_code(self):
        response = get_json(self.client_, f"{STORES_URL}?search=main", self.superuser_token)
        codes = {row["code"] for row in response.json()["results"]}
        self.assertEqual(codes, {"MAIN"})

    def test_is_active_filter(self):
        response = get_json(self.client_, f"{STORES_URL}?is_active=false", self.superuser_token)
        codes = {row["code"] for row in response.json()["results"]}
        self.assertEqual(codes, {"BACKUP"})

    def test_is_active_filter_rejects_invalid_value(self):
        response = get_json(self.client_, f"{STORES_URL}?is_active=nope", self.superuser_token)
        self.assertEqual(response.status_code, 400)


class StoreDetailTests(StoreManagementTestCase):
    def test_get_nonexistent_404(self):
        response = get_json(self.client_, store_url(999999), self.superuser_token)
        self.assertEqual(response.status_code, 404)

    def test_patch_updates_name(self):
        store = make_store("MAIN")
        response = patch_json(
            self.client_, store_url(store.id), {"name": "Renamed Store"}, self.superuser_token
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["name"], "Renamed Store")

    def test_patch_rejects_code(self):
        store = make_store("MAIN")
        response = patch_json(
            self.client_, store_url(store.id), {"code": "OTHER"}, self.superuser_token
        )
        self.assertEqual(response.status_code, 400)
        store.refresh_from_db()
        self.assertEqual(store.code, "MAIN")

    def test_patch_noop_creates_no_audit_entry(self):
        store = make_store("MAIN", name="Main Store")
        AuditLog.objects.all().delete()
        response = patch_json(
            self.client_, store_url(store.id), {"name": "Main Store"}, self.superuser_token
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(AuditLog.objects.filter(target_type="store", target_id=store.id).count(), 0)

    def test_patch_allowed_even_when_store_inactive(self):
        store = make_store("MAIN", is_active=False)
        response = patch_json(
            self.client_, store_url(store.id), {"name": "Corrected Name"}, self.superuser_token
        )
        self.assertEqual(response.status_code, 200)


class StoreActivateDeactivateTests(StoreManagementTestCase):
    def test_round_trip(self):
        store = make_store("MAIN")
        response = post_json(self.client_, deactivate_url(store.id), {}, self.superuser_token)
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["is_active"])

        response = post_json(self.client_, activate_url(store.id), {}, self.superuser_token)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["is_active"])

    def test_deactivate_is_idempotent_no_duplicate_audit(self):
        store = make_store("MAIN")
        post_json(self.client_, deactivate_url(store.id), {}, self.superuser_token)
        AuditLog.objects.all().delete()
        response = post_json(self.client_, deactivate_url(store.id), {}, self.superuser_token)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(AuditLog.objects.filter(target_type="store", target_id=store.id).count(), 0)

    def test_deactivate_does_not_cascade(self):
        store = make_store("MAIN")
        user = make_user("jdoe")
        membership = StoreMembership.objects.create(user=user, store=store)
        role = StoreRole.objects.create(store=store, code="VIEWER", name="Viewer")

        post_json(self.client_, deactivate_url(store.id), {}, self.superuser_token)

        membership.refresh_from_db()
        role.refresh_from_db()
        self.assertTrue(membership.is_active)
        self.assertTrue(role.is_active)

    def test_deactivate_blocks_access_immediately(self):
        store = make_store("MAIN")
        user = make_user("jdoe")
        StoreMembership.objects.create(user=user, store=store)
        self.assertEqual(list(active_stores_for_user(user)), [store])

        post_json(self.client_, deactivate_url(store.id), {}, self.superuser_token)

        self.assertEqual(list(active_stores_for_user(user)), [])

    def test_ordinary_user_cannot_activate_or_deactivate(self):
        store = make_store("MAIN")
        user = make_user("plain")
        response = post_json(self.client_, deactivate_url(store.id), {}, access_token_for(user))
        self.assertEqual(response.status_code, 403)


class AuditRollbackTests(StoreManagementTestCase):
    def test_create_store_rolls_back_if_audit_write_fails(self):
        with patch("apps.stores.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                post_json(
                    self.client_, STORES_URL, {"code": "MAIN", "name": "Main Store"}, self.superuser_token
                )
        self.assertFalse(SharedStore.objects.filter(code="MAIN").exists())

    def test_deactivate_store_rolls_back_if_audit_write_fails(self):
        store = make_store("MAIN")
        with patch("apps.stores.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                post_json(self.client_, deactivate_url(store.id), {}, self.superuser_token)
        store.refresh_from_db()
        self.assertTrue(store.is_active)


# ---------------------------------------------------------------------------
# Current-user APIs
# ---------------------------------------------------------------------------


class MyStoresTests(StoreManagementTestCase):
    def test_zero_stores_returns_empty_list(self):
        user = make_user("plain")
        response = get_json(self.client_, "/api/v1/stores/mine/", access_token_for(user))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["stores"], [])

    def test_requires_bearer_token(self):
        response = self.client_.get("/api/v1/stores/mine/")
        self.assertEqual(response.status_code, 401)

    def test_active_membership_returned_with_no_company_id_needed(self):
        user = make_user("jdoe")
        store = make_store("MAIN")
        StoreMembership.objects.create(user=user, store=store)
        response = get_json(self.client_, "/api/v1/stores/mine/", access_token_for(user))
        self.assertEqual(response.status_code, 200)
        codes = [row["code"] for row in response.json()["stores"]]
        self.assertEqual(codes, ["MAIN"])

    def test_company_membership_alone_does_not_appear(self):
        user = make_user("jdoe")
        make_company("ACME")
        response = get_json(self.client_, "/api/v1/stores/mine/", access_token_for(user))
        self.assertEqual(response.json()["stores"], [])


class MyStorePermissionsTests(StoreManagementTestCase):
    def test_unknown_store_404(self):
        user = make_user("jdoe")
        response = get_json(self.client_, my_permissions_url(999999), access_token_for(user))
        self.assertEqual(response.status_code, 404)

    def test_store_without_membership_404(self):
        user = make_user("jdoe")
        store = make_store("MAIN")
        response = get_json(self.client_, my_permissions_url(store.id), access_token_for(user))
        self.assertEqual(response.status_code, 404)

    def test_inactive_store_404(self):
        user = make_user("jdoe")
        store = make_store("MAIN", is_active=False)
        StoreMembership.objects.create(user=user, store=store)
        response = get_json(self.client_, my_permissions_url(store.id), access_token_for(user))
        self.assertEqual(response.status_code, 404)

    def test_membership_without_roles_returns_empty_list(self):
        user = make_user("jdoe")
        store = make_store("MAIN")
        StoreMembership.objects.create(user=user, store=store)
        response = get_json(self.client_, my_permissions_url(store.id), access_token_for(user))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["permissions"], [])

    def test_permissions_returned_sorted(self):
        user = make_user("jdoe")
        store = make_store("MAIN")
        membership = StoreMembership.objects.create(user=user, store=store)
        view_perm = PermissionDefinition.objects.get(code="shared_store.view")
        edit_perm = make_permission("shared_store.audit")
        role = make_store_role(store, "VIEWER", permissions=[view_perm, edit_perm])
        assign_store_role(membership, role)

        response = get_json(self.client_, my_permissions_url(store.id), access_token_for(user))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["permissions"], sorted(["shared_store.view", "shared_store.audit"]))

    def test_revocation_takes_effect_immediately(self):
        user = make_user("jdoe")
        store = make_store("MAIN")
        membership = StoreMembership.objects.create(user=user, store=store)
        perm = PermissionDefinition.objects.get(code="shared_store.view")
        role = make_store_role(store, "VIEWER", permissions=[perm])
        assignment = assign_store_role(membership, role)

        response = get_json(self.client_, my_permissions_url(store.id), access_token_for(user))
        self.assertEqual(response.json()["permissions"], ["shared_store.view"])

        assignment.is_active = False
        assignment.save(update_fields=["is_active", "updated_at"])

        response = get_json(self.client_, my_permissions_url(store.id), access_token_for(user))
        self.assertEqual(response.json()["permissions"], [])


class StoreOverviewTests(StoreManagementTestCase):
    def setUp(self):
        super().setUp()
        self.user = make_user("jdoe")
        self.store = make_store("MAIN")
        self.membership = StoreMembership.objects.create(user=self.user, store=self.store)
        self.view_perm = PermissionDefinition.objects.get(code="shared_store.view")

    def test_unknown_store_404(self):
        response = get_json(self.client_, overview_url(999999), access_token_for(self.user))
        self.assertEqual(response.status_code, 404)

    def test_no_membership_404(self):
        other_user = make_user("other")
        response = get_json(self.client_, overview_url(self.store.id), access_token_for(other_user))
        self.assertEqual(response.status_code, 404)

    def test_membership_without_permission_403(self):
        response = get_json(self.client_, overview_url(self.store.id), access_token_for(self.user))
        self.assertEqual(response.status_code, 403)

    def test_membership_with_permission_200_identity_only(self):
        role = make_store_role(self.store, "VIEWER", permissions=[self.view_perm])
        assign_store_role(self.membership, role)

        response = get_json(self.client_, overview_url(self.store.id), access_token_for(self.user))
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(set(body.keys()), {"id", "code", "name"})

    def test_revoking_permission_blocks_overview_immediately(self):
        role = make_store_role(self.store, "VIEWER", permissions=[self.view_perm])
        assignment = assign_store_role(self.membership, role)
        self.assertEqual(
            get_json(self.client_, overview_url(self.store.id), access_token_for(self.user)).status_code, 200
        )

        assignment.is_active = False
        assignment.save(update_fields=["is_active", "updated_at"])

        self.assertEqual(
            get_json(self.client_, overview_url(self.store.id), access_token_for(self.user)).status_code, 403
        )

    def test_inactive_store_404_even_with_permission(self):
        role = make_store_role(self.store, "VIEWER", permissions=[self.view_perm])
        assign_store_role(self.membership, role)
        self.store.is_active = False
        self.store.save(update_fields=["is_active", "updated_at"])

        response = get_json(self.client_, overview_url(self.store.id), access_token_for(self.user))
        self.assertEqual(response.status_code, 404)


# ---------------------------------------------------------------------------
# Membership + role-assignment management API
# ---------------------------------------------------------------------------


class StoreMembershipManagementTests(StoreManagementTestCase):
    def setUp(self):
        super().setUp()
        self.store = make_store("MAIN")
        self.target = make_user("target")

    def test_assign_creates_membership_201(self):
        response = post_json(
            self.client_, memberships_url(self.store.id), {"user_id": self.target.id}, self.superuser_token
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.json()["is_active"])

    def test_assign_again_is_200_idempotent(self):
        post_json(self.client_, memberships_url(self.store.id), {"user_id": self.target.id}, self.superuser_token)
        response = post_json(
            self.client_, memberships_url(self.store.id), {"user_id": self.target.id}, self.superuser_token
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(StoreMembership.objects.filter(user=self.target, store=self.store).count(), 1)

    def test_assign_reactivates_inactive_membership(self):
        membership, _ = assign_store_membership(actor=self.superuser, user=self.target, store=self.store)
        deactivate_store_membership(actor=self.superuser, membership=membership)
        response = post_json(
            self.client_, memberships_url(self.store.id), {"user_id": self.target.id}, self.superuser_token
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["is_active"])

    def test_assign_rejects_inactive_user(self):
        self.target.is_active = False
        self.target.save(update_fields=["is_active"])
        response = post_json(
            self.client_, memberships_url(self.store.id), {"user_id": self.target.id}, self.superuser_token
        )
        self.assertEqual(response.status_code, 400)

    def test_assign_rejects_inactive_store(self):
        self.store.is_active = False
        self.store.save(update_fields=["is_active", "updated_at"])
        response = post_json(
            self.client_, memberships_url(self.store.id), {"user_id": self.target.id}, self.superuser_token
        )
        self.assertEqual(response.status_code, 400)

    def test_assign_unknown_user_404(self):
        response = post_json(
            self.client_, memberships_url(self.store.id), {"user_id": 999999}, self.superuser_token
        )
        self.assertEqual(response.status_code, 404)

    def test_deactivate_idempotent_even_if_parents_inactive(self):
        membership, _ = assign_store_membership(actor=self.superuser, user=self.target, store=self.store)
        self.store.is_active = False
        self.store.save(update_fields=["is_active", "updated_at"])
        response = post_json(
            self.client_, membership_deactivate_url(self.store.id, membership.id), {}, self.superuser_token
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["is_active"])

    def test_deactivate_wrong_store_404(self):
        other_store = make_store("BACKUP")
        membership, _ = assign_store_membership(actor=self.superuser, user=self.target, store=self.store)
        response = post_json(
            self.client_, membership_deactivate_url(other_store.id, membership.id), {}, self.superuser_token
        )
        self.assertEqual(response.status_code, 404)

    def test_list_shows_active_and_inactive(self):
        membership, _ = assign_store_membership(actor=self.superuser, user=self.target, store=self.store)
        deactivate_store_membership(actor=self.superuser, membership=membership)
        response = get_json(self.client_, memberships_url(self.store.id), self.superuser_token)
        self.assertEqual(len(response.json()), 1)
        self.assertFalse(response.json()[0]["is_active"])

    def test_ordinary_user_403(self):
        user = make_user("plain")
        response = get_json(self.client_, memberships_url(self.store.id), access_token_for(user))
        self.assertEqual(response.status_code, 403)


class StoreRoleAssignmentManagementTests(StoreManagementTestCase):
    def setUp(self):
        super().setUp()
        self.store = make_store("MAIN")
        self.other_store = make_store("BACKUP")
        self.target = make_user("target")
        self.membership, _ = assign_store_membership(actor=self.superuser, user=self.target, store=self.store)
        self.role = make_store_role(self.store, "VIEWER")
        self.foreign_role = make_store_role(self.other_store, "VIEWER")

    def test_assign_role_creates_201(self):
        response = post_json(
            self.client_,
            membership_roles_url(self.store.id, self.membership.id),
            {"role_id": self.role.id},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 201)

    def test_assign_again_idempotent_200(self):
        post_json(
            self.client_,
            membership_roles_url(self.store.id, self.membership.id),
            {"role_id": self.role.id},
            self.superuser_token,
        )
        response = post_json(
            self.client_,
            membership_roles_url(self.store.id, self.membership.id),
            {"role_id": self.role.id},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(StoreRoleAssignment.objects.filter(membership=self.membership, role=self.role).count(), 1)

    def test_assign_cross_store_role_rejected_400(self):
        response = post_json(
            self.client_,
            membership_roles_url(self.store.id, self.membership.id),
            {"role_id": self.foreign_role.id},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 400)

    def test_assign_unknown_role_404(self):
        response = post_json(
            self.client_,
            membership_roles_url(self.store.id, self.membership.id),
            {"role_id": 999999},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 404)

    def test_assign_rejects_inactive_role(self):
        self.role.is_active = False
        self.role.save(update_fields=["is_active", "updated_at"])
        response = post_json(
            self.client_,
            membership_roles_url(self.store.id, self.membership.id),
            {"role_id": self.role.id},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 400)

    def test_deactivate_wrong_assignment_for_membership_404(self):
        other_membership, _ = assign_store_membership(
            actor=self.superuser, user=make_user("other"), store=self.store
        )
        assignment, _ = assign_store_membership_role(actor=self.superuser, membership=self.membership, role=self.role)
        response = post_json(
            self.client_,
            membership_role_deactivate_url(self.store.id, other_membership.id, assignment.id),
            {},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 404)

    def test_deactivate_works_even_if_parents_inactive(self):
        assignment, _ = assign_store_membership_role(actor=self.superuser, membership=self.membership, role=self.role)
        self.store.is_active = False
        self.store.save(update_fields=["is_active", "updated_at"])
        response = post_json(
            self.client_,
            membership_role_deactivate_url(self.store.id, self.membership.id, assignment.id),
            {},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["is_active"])

    def test_audit_entries_recorded_for_assignment_lifecycle(self):
        response = post_json(
            self.client_,
            membership_roles_url(self.store.id, self.membership.id),
            {"role_id": self.role.id},
            self.superuser_token,
        )
        assignment_id = response.json()["id"]
        entry = AuditLog.objects.filter(target_type="store_role_assignment", target_id=assignment_id).get()
        self.assertEqual(entry.action, "store_role_assignment.created")
        self.assertEqual(entry.store_id, self.store.id)

        post_json(
            self.client_,
            membership_role_deactivate_url(self.store.id, self.membership.id, assignment_id),
            {},
            self.superuser_token,
        )
        entry2 = AuditLog.objects.filter(
            target_type="store_role_assignment", target_id=assignment_id, action="store_role_assignment.deactivated"
        ).get()
        self.assertEqual(entry2.store_id, self.store.id)
