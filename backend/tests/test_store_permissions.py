import json
from unittest.mock import patch

from django import forms
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models.deletion import ProtectedError
from django.test import Client, RequestFactory, TestCase
from rest_framework_simplejwt.tokens import AccessToken

from apps.audit.models import AuditLog
from apps.companies.models import Company, CompanyMembership
from apps.permissions.admin import CompanyRoleAdmin, CompanyRoleAdminForm, StoreRoleAdmin, StoreRoleAssignmentAdmin
from apps.permissions.models import CompanyRole, MembershipRole, PermissionDefinition, StoreRole, StoreRoleAssignment
from apps.permissions.services import (
    assign_role,
    assign_store_role,
    effective_permission_codes,
    effective_store_permission_codes,
    replace_role_permissions,
    replace_store_role_permissions,
)
from apps.stores.models import SharedStore, StoreMembership

User = get_user_model()
PASSWORD = "a-strong-pass-1"

COMPANY_SCOPE = PermissionDefinition.Scope.COMPANY
STORE_SCOPE = PermissionDefinition.Scope.STORE


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


def make_store(code, **kwargs):
    return SharedStore.objects.create(code=code, name=f"{code} Store", **kwargs)


def make_permission(code, module="orders", scope=COMPANY_SCOPE, **kwargs):
    return PermissionDefinition.objects.create(code=code, name=code, module=module, scope=scope, **kwargs)


def make_company_role(company, code, permissions=(), **kwargs):
    role = CompanyRole.objects.create(company=company, code=code, name=code, **kwargs)
    if permissions:
        role.permissions.set(permissions)
    return role


def make_store_role(store, code, permissions=(), **kwargs):
    role = StoreRole.objects.create(store=store, code=code, name=code, **kwargs)
    if permissions:
        role.permissions.set(permissions)
    return role


def access_token_for(user):
    return str(AccessToken.for_user(user))


def bearer(token):
    return {"HTTP_AUTHORIZATION": f"Bearer {token}"}


def get_json(client, url, token, **extra):
    return client.get(url, **bearer(token), **extra)


def post_json(client, url, payload, token):
    return client.post(url, data=json.dumps(payload), content_type="application/json", **bearer(token))


def put_json(client, url, payload, token):
    return client.put(url, data=json.dumps(payload), content_type="application/json", **bearer(token))


# ---------------------------------------------------------------------------
# PermissionDefinition.scope
# ---------------------------------------------------------------------------


class PermissionDefinitionScopeTests(TestCase):
    def test_default_scope_is_company(self):
        perm = PermissionDefinition.objects.create(code="orders.view", name="View orders", module="orders")
        self.assertEqual(perm.scope, COMPANY_SCOPE)

    def test_seeded_shared_store_view_permission_exists_with_store_scope(self):
        """Provisioned idempotently by the apps.permissions data migration -
        this asserts the migration's effect, not a factory-created row.
        """
        perm = PermissionDefinition.objects.get(code="shared_store.view")
        self.assertEqual(perm.scope, STORE_SCOPE)
        self.assertTrue(perm.is_active)

    def test_existing_permission_definitions_default_to_company_scope(self):
        """Simulates a pre-scope-field permission: created without an
        explicit scope, must land on COMPANY (the migration default),
        never STORE.
        """
        perm = make_permission("legacy.action")
        self.assertEqual(perm.scope, COMPANY_SCOPE)

    def test_scope_is_immutable_after_creation(self):
        perm = make_permission("orders.view")
        perm.scope = STORE_SCOPE
        with self.assertRaises(ValidationError):
            perm.save()

    def test_scope_immutability_survives_refetch(self):
        perm = make_permission("orders.view")
        refetched = PermissionDefinition.objects.get(pk=perm.pk)
        refetched.scope = STORE_SCOPE
        with self.assertRaises(ValidationError):
            refetched.save()

    def test_invalid_scope_value_rejected(self):
        perm = PermissionDefinition(code="orders.view", name="View", module="orders", scope="BOGUS")
        with self.assertRaises(ValidationError):
            perm.save()

    def test_code_remains_globally_unique_across_scopes(self):
        make_permission("shared.code", scope=COMPANY_SCOPE)
        with transaction.atomic():
            with self.assertRaises(IntegrityError):
                PermissionDefinition.objects.create(
                    code="shared.code", name="Dup", module="orders", scope=STORE_SCOPE
                )


# ---------------------------------------------------------------------------
# StoreRole / StoreRoleAssignment models
# ---------------------------------------------------------------------------


class StoreRoleModelTests(TestCase):
    def setUp(self):
        self.store_a = make_store("MAIN")
        self.store_b = make_store("BACKUP")

    def test_code_and_name_required(self):
        with self.assertRaises(Exception):
            StoreRole.objects.create(store=self.store_a, code="", name="Viewer")

    def test_code_is_normalised(self):
        role = StoreRole.objects.create(store=self.store_a, code="  viewer  ", name="Viewer")
        self.assertEqual(role.code, "VIEWER")

    def test_same_code_allowed_across_different_stores(self):
        role_a = make_store_role(self.store_a, "VIEWER")
        role_b = make_store_role(self.store_b, "VIEWER")
        self.assertNotEqual(role_a.pk, role_b.pk)

    def test_duplicate_code_within_same_store_rejected(self):
        make_store_role(self.store_a, "VIEWER")
        with transaction.atomic():
            with self.assertRaises(IntegrityError):
                StoreRole.objects.create(store=self.store_a, code="VIEWER", name="Dup")

    def test_store_immutable_after_creation(self):
        role = make_store_role(self.store_a, "VIEWER")
        role.store = self.store_b
        with self.assertRaises(ValidationError):
            role.save()

    def test_role_protected_from_deletion_while_assigned(self):
        user = make_user("jdoe")
        membership = StoreMembership.objects.create(user=user, store=self.store_a)
        role = make_store_role(self.store_a, "VIEWER")
        StoreRoleAssignment.objects.create(membership=membership, role=role)
        with transaction.atomic():
            with self.assertRaises(ProtectedError):
                role.delete()


class StoreRoleAssignmentModelTests(TestCase):
    def setUp(self):
        self.user = make_user("jdoe")
        self.store_a = make_store("MAIN")
        self.store_b = make_store("BACKUP")
        self.membership_a = StoreMembership.objects.create(user=self.user, store=self.store_a)
        self.role_a = make_store_role(self.store_a, "VIEWER")
        self.role_b = make_store_role(self.store_b, "VIEWER")

    def test_duplicate_assignment_rejected(self):
        StoreRoleAssignment.objects.create(membership=self.membership_a, role=self.role_a)
        with transaction.atomic():
            with self.assertRaises(IntegrityError):
                StoreRoleAssignment.objects.create(membership=self.membership_a, role=self.role_a)

    def test_cross_store_assignment_rejected_on_save(self):
        with self.assertRaises(ValidationError):
            StoreRoleAssignment.objects.create(membership=self.membership_a, role=self.role_b)
        self.assertFalse(
            StoreRoleAssignment.objects.filter(membership=self.membership_a, role=self.role_b).exists()
        )

    def test_bulk_create_bypasses_check_documented_limitation(self):
        StoreRoleAssignment.objects.bulk_create(
            [StoreRoleAssignment(membership=self.membership_a, role=self.role_b)]
        )
        self.assertTrue(
            StoreRoleAssignment.objects.filter(membership=self.membership_a, role=self.role_b).exists()
        )


# ---------------------------------------------------------------------------
# Scope enforcement in resolution (effective_permission_codes / effective_
# store_permission_codes) and in write paths (replace_*_role_permissions)
# ---------------------------------------------------------------------------


class ScopeResolutionSeparationTests(TestCase):
    """Company roles accept only COMPANY permissions, store roles accept
    only STORE permissions - enforced both at write time and, separately
    (defense in depth), at resolution time even if an invalid relationship
    is inserted through an ORM bypass.
    """

    def setUp(self):
        self.user = make_user("jdoe")
        self.actor = make_superuser("admin")
        self.company = make_company("ACME")
        self.store = make_store("MAIN")
        self.company_membership = CompanyMembership.objects.create(user=self.user, company=self.company)
        self.store_membership = StoreMembership.objects.create(user=self.user, store=self.store)
        self.company_perm = make_permission("orders.view", scope=COMPANY_SCOPE)
        self.store_perm = make_permission("shared_store.audit", scope=STORE_SCOPE)

    def test_company_replace_rejects_store_scope_code(self):
        role = make_company_role(self.company, "MANAGER")
        with self.assertRaises(ValidationError):
            replace_role_permissions(actor=self.actor, role=role, permission_codes=["shared_store.audit"])
        self.assertEqual(role.permissions.count(), 0)

    def test_store_replace_rejects_company_scope_code(self):
        role = make_store_role(self.store, "MANAGER")
        with self.assertRaises(ValidationError):
            replace_store_role_permissions(actor=self.actor, role=role, permission_codes=["orders.view"])
        self.assertEqual(role.permissions.count(), 0)

    def test_company_replace_accepts_company_scope_code(self):
        role = make_company_role(self.company, "MANAGER")
        role, codes = replace_role_permissions(actor=self.actor, role=role, permission_codes=["orders.view"])
        self.assertEqual(codes, ["orders.view"])

    def test_store_replace_accepts_store_scope_code(self):
        role = make_store_role(self.store, "MANAGER")
        role, codes = replace_store_role_permissions(
            actor=self.actor, role=role, permission_codes=["shared_store.audit"]
        )
        self.assertEqual(codes, ["shared_store.audit"])

    def test_wrong_scope_permission_attached_via_bypass_grants_nothing_company_side(self):
        """Defense in depth: even if a STORE permission is force-attached
        to a CompanyRole through a direct M2M .add() (bypassing
        replace_role_permissions entirely, which Django allows since M2M
        writes run no validation), effective_permission_codes() must never
        resolve it - the query itself filters scope=COMPANY.
        """
        role = make_company_role(self.company, "MANAGER")
        role.permissions.add(self.store_perm)  # bypass - would be rejected by the service
        assign_role(self.company_membership, role)

        self.assertEqual(effective_permission_codes(self.user, self.company), frozenset())

    def test_wrong_scope_permission_attached_via_bypass_grants_nothing_store_side(self):
        role = make_store_role(self.store, "MANAGER")
        role.permissions.add(self.company_perm)  # bypass
        assign_store_role(self.store_membership, role)

        self.assertEqual(effective_store_permission_codes(self.user, self.store), frozenset())

    def test_company_lookup_never_resolves_store_scope_permission_even_if_correctly_active(self):
        """Even a fully active, correctly-flagged STORE permission must
        never surface from the COMPANY resolution path - this proves the
        scope filter, not merely is_active, is doing the exclusion.
        """
        role = make_company_role(self.company, "MANAGER", permissions=[self.store_perm])
        assign_role(self.company_membership, role)
        self.assertEqual(effective_permission_codes(self.user, self.company), frozenset())

    def test_store_lookup_never_resolves_company_scope_permission(self):
        role = make_store_role(self.store, "MANAGER", permissions=[self.company_perm])
        assign_store_role(self.store_membership, role)
        self.assertEqual(effective_store_permission_codes(self.user, self.store), frozenset())

    def test_company_membership_or_role_never_grants_store_access(self):
        role = make_company_role(self.company, "MANAGER", permissions=[self.company_perm])
        assign_role(self.company_membership, role)
        self.assertEqual(effective_store_permission_codes(self.user, self.store), frozenset())

    def test_store_membership_or_role_never_grants_company_access(self):
        role = make_store_role(self.store, "MANAGER", permissions=[self.store_perm])
        assign_store_role(self.store_membership, role)
        self.assertEqual(effective_permission_codes(self.user, self.company), frozenset())

    def test_existing_company_permission_behaviour_unchanged(self):
        """Regression: adding the scope field/filter must not change any
        existing COMPANY-only behaviour - multiple roles still combine,
        inactive states still deny, exactly as before Task 07A.
        """
        other_perm = make_permission("orders.create", scope=COMPANY_SCOPE)
        role_a = make_company_role(self.company, "VIEWER", permissions=[self.company_perm])
        role_b = make_company_role(self.company, "CREATOR", permissions=[other_perm])
        assign_role(self.company_membership, role_a)
        assign_role(self.company_membership, role_b)
        self.assertEqual(
            effective_permission_codes(self.user, self.company), {"orders.view", "orders.create"}
        )

    def test_store_permissions_combine_across_multiple_roles(self):
        other_perm = make_permission("shared_store.receive", scope=STORE_SCOPE)
        role_a = make_store_role(self.store, "VIEWER", permissions=[self.store_perm])
        role_b = make_store_role(self.store, "RECEIVER", permissions=[other_perm])
        assign_store_role(self.store_membership, role_a)
        assign_store_role(self.store_membership, role_b)
        self.assertEqual(
            effective_store_permission_codes(self.user, self.store),
            {"shared_store.audit", "shared_store.receive"},
        )


# ---------------------------------------------------------------------------
# Store role management API
# ---------------------------------------------------------------------------


class StoreRoleManagementTestCase(TestCase):
    def setUp(self):
        self.superuser = make_superuser("admin")
        self.superuser_token = access_token_for(self.superuser)
        self.client_ = Client()
        self.store = make_store("MAIN")
        self.other_store = make_store("BACKUP")


def roles_url(store_id):
    return f"/api/v1/stores/{store_id}/roles/"


def role_detail_url(store_id, role_id):
    return f"/api/v1/stores/{store_id}/roles/{role_id}/"


def role_activate_url(store_id, role_id):
    return f"/api/v1/stores/{store_id}/roles/{role_id}/activate/"


def role_deactivate_url(store_id, role_id):
    return f"/api/v1/stores/{store_id}/roles/{role_id}/deactivate/"


def role_permissions_url(store_id, role_id):
    return f"/api/v1/stores/{store_id}/roles/{role_id}/permissions/"


class StoreRoleAuthorizationTests(StoreRoleManagementTestCase):
    def test_anonymous_401(self):
        response = self.client_.get(roles_url(self.store.id))
        self.assertEqual(response.status_code, 401)

    def test_ordinary_user_403(self):
        user = make_user("plain")
        response = get_json(self.client_, roles_url(self.store.id), access_token_for(user))
        self.assertEqual(response.status_code, 403)

    def test_active_superuser_200(self):
        response = get_json(self.client_, roles_url(self.store.id), self.superuser_token)
        self.assertEqual(response.status_code, 200)

    def test_delete_not_allowed(self):
        role = make_store_role(self.store, "VIEWER")
        response = self.client_.delete(role_detail_url(self.store.id, role.id), **bearer(self.superuser_token))
        self.assertEqual(response.status_code, 405)


class StoreRoleCreateTests(StoreRoleManagementTestCase):
    def test_create_success(self):
        response = post_json(
            self.client_, roles_url(self.store.id), {"code": "viewer", "name": "Viewer"}, self.superuser_token
        )
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body["code"], "VIEWER")
        self.assertEqual(body["store_id"], self.store.id)
        self.assertEqual(body["permissions"], [])

    def test_same_code_allowed_in_different_stores(self):
        post_json(self.client_, roles_url(self.store.id), {"code": "VIEWER", "name": "Viewer"}, self.superuser_token)
        response = post_json(
            self.client_, roles_url(self.other_store.id), {"code": "VIEWER", "name": "Viewer"}, self.superuser_token
        )
        self.assertEqual(response.status_code, 201)

    def test_duplicate_code_within_same_store_400(self):
        post_json(self.client_, roles_url(self.store.id), {"code": "VIEWER", "name": "Viewer"}, self.superuser_token)
        response = post_json(
            self.client_, roles_url(self.store.id), {"code": "VIEWER", "name": "Dup"}, self.superuser_token
        )
        self.assertEqual(response.status_code, 400)

    def test_rejects_store_field_in_body(self):
        response = post_json(
            self.client_,
            roles_url(self.store.id),
            {"code": "VIEWER", "name": "Viewer", "store": self.other_store.id},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 400)

    def test_create_rejected_when_store_inactive(self):
        self.store.is_active = False
        self.store.save(update_fields=["is_active", "updated_at"])
        response = post_json(
            self.client_, roles_url(self.store.id), {"code": "VIEWER", "name": "Viewer"}, self.superuser_token
        )
        self.assertEqual(response.status_code, 400)


class StoreRoleDetailAndLifecycleTests(StoreRoleManagementTestCase):
    def test_cross_store_role_lookup_returns_404(self):
        role = make_store_role(self.other_store, "VIEWER")
        response = get_json(self.client_, role_detail_url(self.store.id, role.id), self.superuser_token)
        self.assertEqual(response.status_code, 404)

    def test_patch_rejects_code(self):
        role = make_store_role(self.store, "VIEWER")
        response = self.client_.patch(
            role_detail_url(self.store.id, role.id),
            data=json.dumps({"code": "OTHER"}),
            content_type="application/json",
            **bearer(self.superuser_token),
        )
        self.assertEqual(response.status_code, 400)

    def test_activate_rejected_when_store_inactive(self):
        role = make_store_role(self.store, "VIEWER", is_active=False)
        self.store.is_active = False
        self.store.save(update_fields=["is_active", "updated_at"])
        response = post_json(self.client_, role_activate_url(self.store.id, role.id), {}, self.superuser_token)
        self.assertEqual(response.status_code, 400)

    def test_deactivate_allowed_even_when_store_inactive(self):
        role = make_store_role(self.store, "VIEWER")
        self.store.is_active = False
        self.store.save(update_fields=["is_active", "updated_at"])
        response = post_json(self.client_, role_deactivate_url(self.store.id, role.id), {}, self.superuser_token)
        self.assertEqual(response.status_code, 200)


class StoreRolePermissionsReplaceApiTests(StoreRoleManagementTestCase):
    def setUp(self):
        super().setUp()
        self.view_perm = PermissionDefinition.objects.get(code="shared_store.view")
        self.other_perm = make_permission("shared_store.audit", scope=STORE_SCOPE)
        self.company_perm = make_permission("orders.view", scope=COMPANY_SCOPE)
        self.role = make_store_role(self.store, "VIEWER")

    def test_replace_sets_permissions(self):
        response = put_json(
            self.client_,
            role_permissions_url(self.store.id, self.role.id),
            {"permission_codes": ["shared_store.view", "shared_store.audit"]},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            set(response.json()["permission_codes"]), {"shared_store.view", "shared_store.audit"}
        )

    def test_replace_rejects_company_scope_code(self):
        response = put_json(
            self.client_,
            role_permissions_url(self.store.id, self.role.id),
            {"permission_codes": ["orders.view"]},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.role.permissions.count(), 0)

    def test_replace_with_empty_list_clears(self):
        self.role.permissions.set([self.view_perm])
        response = put_json(
            self.client_, role_permissions_url(self.store.id, self.role.id), {"permission_codes": []}, self.superuser_token
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.role.permissions.count(), 0)

    def test_replace_identical_is_noop_no_audit(self):
        self.role.permissions.set([self.view_perm])
        AuditLog.objects.all().delete()
        response = put_json(
            self.client_,
            role_permissions_url(self.store.id, self.role.id),
            {"permission_codes": ["shared_store.view"]},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            AuditLog.objects.filter(
                target_type="store_role", target_id=self.role.id, action="store_role.permissions_replaced"
            ).count(),
            0,
        )

    def test_replace_writes_audit_with_store_context(self):
        put_json(
            self.client_,
            role_permissions_url(self.store.id, self.role.id),
            {"permission_codes": ["shared_store.view"]},
            self.superuser_token,
        )
        entry = AuditLog.objects.filter(
            target_type="store_role", target_id=self.role.id, action="store_role.permissions_replaced"
        ).get()
        self.assertEqual(entry.store_id, self.store.id)
        self.assertIsNone(entry.company_id)

    def test_unknown_code_no_partial_write(self):
        self.role.permissions.set([self.view_perm])
        response = put_json(
            self.client_,
            role_permissions_url(self.store.id, self.role.id),
            {"permission_codes": ["shared_store.audit", "no.such.code"]},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(set(self.role.permissions.values_list("code", flat=True)), {"shared_store.view"})

    def test_rejected_when_store_inactive(self):
        self.store.is_active = False
        self.store.save(update_fields=["is_active", "updated_at"])
        response = put_json(
            self.client_,
            role_permissions_url(self.store.id, self.role.id),
            {"permission_codes": ["shared_store.view"]},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 400)

    def test_rejected_when_role_inactive(self):
        self.role.is_active = False
        self.role.save(update_fields=["is_active", "updated_at"])
        response = put_json(
            self.client_,
            role_permissions_url(self.store.id, self.role.id),
            {"permission_codes": ["shared_store.view"]},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 400)

    def test_cross_store_role_404(self):
        foreign_role = make_store_role(self.other_store, "VIEWER")
        response = put_json(
            self.client_,
            role_permissions_url(self.store.id, foreign_role.id),
            {"permission_codes": ["shared_store.view"]},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 404)

    def test_ordinary_user_403(self):
        user = make_user("plain")
        response = put_json(
            self.client_,
            role_permissions_url(self.store.id, self.role.id),
            {"permission_codes": ["shared_store.view"]},
            access_token_for(user),
        )
        self.assertEqual(response.status_code, 403)

    def test_audit_rollback_on_failure(self):
        with patch("apps.permissions.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                put_json(
                    self.client_,
                    role_permissions_url(self.store.id, self.role.id),
                    {"permission_codes": ["shared_store.view"]},
                    self.superuser_token,
                )
        self.assertEqual(self.role.permissions.count(), 0)


# ---------------------------------------------------------------------------
# Permission catalog scope filter
# ---------------------------------------------------------------------------


class PermissionCatalogScopeFilterTests(TestCase):
    def setUp(self):
        self.superuser = make_superuser("admin")
        self.superuser_token = access_token_for(self.superuser)
        self.client_ = Client()
        make_permission("orders.view", scope=COMPANY_SCOPE)
        make_permission("orders.create", scope=COMPANY_SCOPE)

    def test_scope_filter_store(self):
        # Compared against the database's own STORE-scope rows, not a
        # hardcoded exact set - a hardcoded set breaks every time any
        # task seeds a new STORE-scope permission, even though nothing
        # about the *filtering behaviour* this test exists to check has
        # changed. See test_scope_filter_company below for the same
        # reasoning applied to COMPANY scope.
        response = get_json(self.client_, "/api/v1/permissions/?scope=STORE", self.superuser_token)
        codes = {row["code"] for row in response.json()["results"]}
        expected_codes = set(PermissionDefinition.objects.filter(scope="STORE").values_list("code", flat=True))
        self.assertEqual(codes, expected_codes)
        self.assertTrue(codes)  # sanity: the STORE scope is not accidentally empty in this test's own setup
        # Negative: scope=STORE must never leak a COMPANY-scope row.
        company_codes = set(PermissionDefinition.objects.filter(scope="COMPANY").values_list("code", flat=True))
        self.assertFalse(codes & company_codes)

    def test_scope_filter_company(self):
        # Deliberately NOT a hardcoded exact set of codes: every task
        # that seeds a new COMPANY-scope permission (there have now been
        # several - Task 08B-1, 08B-2, 08C-1, 08C-2) would otherwise
        # break this exact same assertion, even though the endpoint's
        # actual scope-filtering behaviour never changed. Comparing
        # against the database's own COMPANY-scope rows instead tests
        # the behaviour this endpoint is actually responsible for -
        # "does ?scope=COMPANY return exactly the COMPANY-scope rows,
        # and nothing from STORE" - without needing to be told about
        # every individual permission code that will ever exist.
        response = get_json(self.client_, "/api/v1/permissions/?scope=COMPANY", self.superuser_token)
        codes = {row["code"] for row in response.json()["results"]}
        expected_codes = set(PermissionDefinition.objects.filter(scope="COMPANY").values_list("code", flat=True))
        self.assertEqual(codes, expected_codes)
        self.assertTrue(codes)  # sanity: not accidentally empty
        # Negative: scope=COMPANY must never leak a STORE-scope row.
        store_codes = set(PermissionDefinition.objects.filter(scope="STORE").values_list("code", flat=True))
        self.assertFalse(codes & store_codes)

    def test_scope_filter_rejects_invalid_value(self):
        response = get_json(self.client_, "/api/v1/permissions/?scope=BOGUS", self.superuser_token)
        self.assertEqual(response.status_code, 400)

    def test_catalog_exposes_scope_field(self):
        # Filters to the exact row by code, not results[0] - a search
        # for the substring "orders.view" now also matches any
        # `*_orders.view`-shaped code (e.g. purchase_orders.view, Task
        # 08C-1); indexing [0] happened to still work only because of
        # alphabetical ordering luck, which is not a property this test
        # should depend on.
        response = get_json(self.client_, "/api/v1/permissions/?search=orders.view", self.superuser_token)
        matches = [row for row in response.json()["results"] if row["code"] == "orders.view"]
        self.assertEqual(len(matches), 1)
        self.assertEqual(matches[0]["scope"], "COMPANY")


# ---------------------------------------------------------------------------
# Django Admin scope validation
# ---------------------------------------------------------------------------


class CompanyRoleAdminScopeValidationTests(TestCase):
    def setUp(self):
        self.company = make_company("ACME")
        self.company_perm = make_permission("orders.view", scope=COMPANY_SCOPE)
        self.store_perm = make_permission("shared_store.audit", scope=STORE_SCOPE)
        self.role = make_company_role(self.company, "MANAGER")

    def test_form_queryset_excludes_store_scope_permissions(self):
        form = CompanyRoleAdminForm(instance=self.role)
        self.assertIn(self.company_perm, form.fields["permissions"].queryset)
        self.assertNotIn(self.store_perm, form.fields["permissions"].queryset)

    def test_form_rejects_store_scope_permission_via_tampered_post(self):
        """Simulates a tampered POST naming a STORE permission id directly
        - even though the widget wouldn't normally offer it, the form's
        clean_permissions() must still reject it, not silently accept it.
        """
        form = CompanyRoleAdminForm(
            data={
                "company": self.company.pk,
                "code": self.role.code,
                "name": self.role.name,
                "description": "",
                "is_active": True,
                "permissions": [self.store_perm.pk],
            },
            instance=self.role,
        )
        # Widen the queryset back to "all" to simulate a bypass of the
        # widget-level filtering (e.g. a raw POST), proving clean_
        # permissions() - not just the queryset - is what actually blocks it.
        form.fields["permissions"].queryset = PermissionDefinition.objects.all()
        self.assertFalse(form.is_valid())
        self.assertIn("permissions", form.errors)

    def test_form_accepts_company_scope_permission(self):
        form = CompanyRoleAdminForm(
            data={
                "company": self.company.pk,
                "code": self.role.code,
                "name": self.role.name,
                "description": "",
                "is_active": True,
                "permissions": [self.company_perm.pk],
            },
            instance=self.role,
        )
        self.assertTrue(form.is_valid(), form.errors)


class StoreRoleAdminReadOnlyTests(TestCase):
    def setUp(self):
        self.factory = RequestFactory()
        self.role_admin = StoreRoleAdmin(StoreRole, admin_site=None)
        self.assignment_admin = StoreRoleAssignmentAdmin(StoreRoleAssignment, admin_site=None)

    def _request_as(self, user):
        request = self.factory.get("/admin/")
        request.user = user
        return request

    def test_superuser_can_view_but_not_add_or_change(self):
        superuser = make_superuser("admin")
        request = self._request_as(superuser)
        for admin_instance in (self.role_admin, self.assignment_admin):
            self.assertTrue(admin_instance.has_view_permission(request))
            self.assertFalse(admin_instance.has_add_permission(request))
            self.assertFalse(admin_instance.has_change_permission(request))
            self.assertFalse(admin_instance.has_delete_permission(request))
