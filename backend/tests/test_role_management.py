import json
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from rest_framework_simplejwt.tokens import AccessToken

from apps.audit.models import AuditLog
from apps.companies.models import Company, CompanyMembership
from apps.permissions.models import CompanyRole, MembershipRole, PermissionDefinition
from apps.permissions.services import assign_role, effective_permission_codes

User = get_user_model()

PASSWORD = "a-strong-pass-1"


def roles_url(company_id):
    return f"/api/v1/companies/{company_id}/roles/"


def role_detail_url(company_id, role_id):
    return f"/api/v1/companies/{company_id}/roles/{role_id}/"


def role_activate_url(company_id, role_id):
    return f"/api/v1/companies/{company_id}/roles/{role_id}/activate/"


def role_deactivate_url(company_id, role_id):
    return f"/api/v1/companies/{company_id}/roles/{role_id}/deactivate/"


def role_permissions_url(company_id, role_id):
    return f"/api/v1/companies/{company_id}/roles/{role_id}/permissions/"


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


def access_token_for(user):
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


def put_json(client, url, payload, token):
    return client.put(
        url, data=json.dumps(payload), content_type="application/json", **bearer(token)
    )


class RoleManagementTestCase(TestCase):
    def setUp(self):
        self.superuser = make_superuser("admin")
        self.superuser_token = access_token_for(self.superuser)
        self.client_ = Client()
        self.company = make_company("ACME")
        self.other_company = make_company("BETA")


class RoleAuthorizationTests(RoleManagementTestCase):
    def test_anonymous_401(self):
        response = self.client_.get(roles_url(self.company.id))
        self.assertEqual(response.status_code, 401)

    def test_ordinary_user_403(self):
        user = make_user("plain")
        response = get_json(self.client_, roles_url(self.company.id), access_token_for(user))
        self.assertEqual(response.status_code, 403)

    def test_ordinary_staff_403(self):
        staff = make_user("staffer", is_staff=True)
        response = get_json(self.client_, roles_url(self.company.id), access_token_for(staff))
        self.assertEqual(response.status_code, 403)

    def test_active_superuser_200(self):
        response = get_json(self.client_, roles_url(self.company.id), self.superuser_token)
        self.assertEqual(response.status_code, 200)

    def test_delete_not_allowed(self):
        role = CompanyRole.objects.create(company=self.company, code="MANAGER", name="Manager")
        response = self.client_.delete(
            role_detail_url(self.company.id, role.id), **bearer(self.superuser_token)
        )
        self.assertEqual(response.status_code, 405)


class RoleListForNonexistentOrForeignCompanyTests(RoleManagementTestCase):
    def test_roles_under_nonexistent_company_404(self):
        response = get_json(self.client_, roles_url(999999), self.superuser_token)
        self.assertEqual(response.status_code, 404)


class RoleCreateTests(RoleManagementTestCase):
    def test_create_success(self):
        response = post_json(
            self.client_,
            roles_url(self.company.id),
            {"code": "manager", "name": "Manager"},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body["code"], "MANAGER")
        self.assertEqual(body["company_id"], self.company.id)
        self.assertEqual(body["permissions"], [])

    def test_same_code_allowed_in_different_companies(self):
        post_json(
            self.client_, roles_url(self.company.id), {"code": "MANAGER", "name": "Manager"}, self.superuser_token
        )
        response = post_json(
            self.client_,
            roles_url(self.other_company.id),
            {"code": "MANAGER", "name": "Manager"},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 201)

    def test_duplicate_code_within_same_company_rejected_400(self):
        post_json(
            self.client_, roles_url(self.company.id), {"code": "MANAGER", "name": "Manager"}, self.superuser_token
        )
        response = post_json(
            self.client_,
            roles_url(self.company.id),
            {"code": "MANAGER", "name": "Duplicate"},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 400)

    def test_rejects_company_field_in_body(self):
        response = post_json(
            self.client_,
            roles_url(self.company.id),
            {"code": "MANAGER", "name": "Manager", "company": self.other_company.id},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("company", response.json())

    def test_rejects_is_active_in_body(self):
        response = post_json(
            self.client_,
            roles_url(self.company.id),
            {"code": "MANAGER", "name": "Manager", "is_active": False},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 400)

    def test_rejects_permissions_in_body(self):
        perm = make_permission("orders.view")
        response = post_json(
            self.client_,
            roles_url(self.company.id),
            {"code": "MANAGER", "name": "Manager", "permissions": [perm.code]},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 400)

    def test_create_rejected_when_company_inactive(self):
        self.company.is_active = False
        self.company.save(update_fields=["is_active", "updated_at"])
        response = post_json(
            self.client_,
            roles_url(self.company.id),
            {"code": "MANAGER", "name": "Manager"},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(CompanyRole.objects.filter(company=self.company, code="MANAGER").exists())

    def test_create_writes_audit_entry(self):
        response = post_json(
            self.client_,
            roles_url(self.company.id),
            {"code": "MANAGER", "name": "Manager"},
            self.superuser_token,
        )
        role_id = response.json()["id"]
        entry = AuditLog.objects.filter(target_type="company_role", target_id=role_id).get()
        self.assertEqual(entry.action, "role.created")
        self.assertEqual(entry.company_id, self.company.id)


class RoleDetailTests(RoleManagementTestCase):
    def test_get_role_by_correct_company_200(self):
        role = CompanyRole.objects.create(company=self.company, code="MANAGER", name="Manager")
        response = get_json(
            self.client_, role_detail_url(self.company.id, role.id), self.superuser_token
        )
        self.assertEqual(response.status_code, 200)

    def test_cross_company_role_lookup_returns_404(self):
        role = CompanyRole.objects.create(company=self.other_company, code="MANAGER", name="Manager")
        response = get_json(
            self.client_, role_detail_url(self.company.id, role.id), self.superuser_token
        )
        self.assertEqual(response.status_code, 404)

    def test_nonexistent_role_returns_404(self):
        response = get_json(
            self.client_, role_detail_url(self.company.id, 999999), self.superuser_token
        )
        self.assertEqual(response.status_code, 404)

    def test_patch_updates_name_and_description(self):
        role = CompanyRole.objects.create(company=self.company, code="MANAGER", name="Manager")
        response = patch_json(
            self.client_,
            role_detail_url(self.company.id, role.id),
            {"name": "Senior Manager", "description": "Updated"},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["name"], "Senior Manager")
        self.assertEqual(body["description"], "Updated")

    def test_patch_rejects_code(self):
        role = CompanyRole.objects.create(company=self.company, code="MANAGER", name="Manager")
        response = patch_json(
            self.client_,
            role_detail_url(self.company.id, role.id),
            {"code": "OTHER"},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("code", response.json())

    def test_patch_rejects_company(self):
        role = CompanyRole.objects.create(company=self.company, code="MANAGER", name="Manager")
        response = patch_json(
            self.client_,
            role_detail_url(self.company.id, role.id),
            {"company": self.other_company.id},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 400)

    def test_patch_cross_company_role_returns_404(self):
        role = CompanyRole.objects.create(company=self.other_company, code="MANAGER", name="Manager")
        response = patch_json(
            self.client_,
            role_detail_url(self.company.id, role.id),
            {"name": "New name"},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 404)

    def test_patch_rejected_when_company_inactive(self):
        self.company.is_active = False
        self.company.save(update_fields=["is_active", "updated_at"])
        role = CompanyRole.objects.create(company=self.company, code="MANAGER", name="Manager")
        response = patch_json(
            self.client_,
            role_detail_url(self.company.id, role.id),
            {"name": "New name"},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 400)

    def test_patch_noop_creates_no_audit_entry(self):
        role = CompanyRole.objects.create(company=self.company, code="MANAGER", name="Manager")
        AuditLog.objects.all().delete()
        response = patch_json(
            self.client_,
            role_detail_url(self.company.id, role.id),
            {"name": "Manager"},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            AuditLog.objects.filter(target_type="company_role", target_id=role.id).count(), 0
        )


class RoleActivateDeactivateTests(RoleManagementTestCase):
    def test_deactivate_then_activate_round_trip(self):
        role = CompanyRole.objects.create(company=self.company, code="MANAGER", name="Manager")
        response = post_json(
            self.client_, role_deactivate_url(self.company.id, role.id), {}, self.superuser_token
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["is_active"])

        response = post_json(
            self.client_, role_activate_url(self.company.id, role.id), {}, self.superuser_token
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["is_active"])

    def test_activate_rejected_when_company_inactive(self):
        role = CompanyRole.objects.create(company=self.company, code="MANAGER", name="Manager", is_active=False)
        self.company.is_active = False
        self.company.save(update_fields=["is_active", "updated_at"])
        response = post_json(
            self.client_, role_activate_url(self.company.id, role.id), {}, self.superuser_token
        )
        self.assertEqual(response.status_code, 400)
        role.refresh_from_db()
        self.assertFalse(role.is_active)

    def test_deactivate_allowed_even_when_company_inactive(self):
        role = CompanyRole.objects.create(company=self.company, code="MANAGER", name="Manager")
        self.company.is_active = False
        self.company.save(update_fields=["is_active", "updated_at"])
        response = post_json(
            self.client_, role_deactivate_url(self.company.id, role.id), {}, self.superuser_token
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["is_active"])

    def test_deactivate_is_idempotent_no_duplicate_audit(self):
        role = CompanyRole.objects.create(company=self.company, code="MANAGER", name="Manager")
        post_json(self.client_, role_deactivate_url(self.company.id, role.id), {}, self.superuser_token)
        AuditLog.objects.all().delete()
        response = post_json(
            self.client_, role_deactivate_url(self.company.id, role.id), {}, self.superuser_token
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            AuditLog.objects.filter(target_type="company_role", target_id=role.id).count(), 0
        )

    def test_deactivate_role_removes_effective_permissions_immediately(self):
        perm = make_permission("orders.view")
        role = CompanyRole.objects.create(company=self.company, code="VIEWER", name="Viewer")
        role.permissions.set([perm])
        user = make_user("jdoe")
        membership = CompanyMembership.objects.create(user=user, company=self.company)
        assign_role(membership, role)
        self.assertEqual(effective_permission_codes(user, self.company), {"orders.view"})

        post_json(self.client_, role_deactivate_url(self.company.id, role.id), {}, self.superuser_token)

        self.assertEqual(effective_permission_codes(user, self.company), frozenset())

    def test_deactivate_leaves_membership_role_assignment_untouched(self):
        role = CompanyRole.objects.create(company=self.company, code="MANAGER", name="Manager")
        user = make_user("jdoe")
        membership = CompanyMembership.objects.create(user=user, company=self.company)
        assignment = assign_role(membership, role)

        post_json(self.client_, role_deactivate_url(self.company.id, role.id), {}, self.superuser_token)

        assignment.refresh_from_db()
        self.assertTrue(assignment.is_active)


class RolePermissionsReplaceTests(RoleManagementTestCase):
    def setUp(self):
        super().setUp()
        self.view_perm = make_permission("orders.view")
        self.create_perm = make_permission("orders.create")
        self.inactive_perm = make_permission("orders.delete", is_active=False)
        self.role = CompanyRole.objects.create(company=self.company, code="MANAGER", name="Manager")

    def test_replace_sets_permissions(self):
        response = put_json(
            self.client_,
            role_permissions_url(self.company.id, self.role.id),
            {"permission_codes": ["orders.view", "orders.create"]},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(set(body["permission_codes"]), {"orders.view", "orders.create"})
        self.assertEqual(
            set(self.role.permissions.values_list("code", flat=True)),
            {"orders.view", "orders.create"},
        )

    def test_replace_with_empty_list_clears_permissions(self):
        self.role.permissions.set([self.view_perm])
        response = put_json(
            self.client_,
            role_permissions_url(self.company.id, self.role.id),
            {"permission_codes": []},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.role.permissions.count(), 0)

    def test_replace_collapses_duplicate_codes(self):
        response = put_json(
            self.client_,
            role_permissions_url(self.company.id, self.role.id),
            {"permission_codes": ["orders.view", "orders.view", "ORDERS.VIEW"]},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.role.permissions.count(), 1)

    def test_replace_with_identical_set_is_noop_no_audit(self):
        self.role.permissions.set([self.view_perm])
        AuditLog.objects.all().delete()
        response = put_json(
            self.client_,
            role_permissions_url(self.company.id, self.role.id),
            {"permission_codes": ["orders.view"]},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            AuditLog.objects.filter(
                target_type="company_role", target_id=self.role.id, action="role.permissions_replaced"
            ).count(),
            0,
        )

    def test_replace_writes_audit_with_before_after(self):
        self.role.permissions.set([self.view_perm])
        AuditLog.objects.all().delete()
        put_json(
            self.client_,
            role_permissions_url(self.company.id, self.role.id),
            {"permission_codes": ["orders.create"]},
            self.superuser_token,
        )
        entry = AuditLog.objects.filter(
            target_type="company_role", target_id=self.role.id, action="role.permissions_replaced"
        ).get()
        self.assertEqual(entry.before["permission_codes"], ["orders.view"])
        self.assertEqual(entry.after["permission_codes"], ["orders.create"])

    def test_unknown_code_rejected_with_no_partial_write(self):
        self.role.permissions.set([self.view_perm])
        response = put_json(
            self.client_,
            role_permissions_url(self.company.id, self.role.id),
            {"permission_codes": ["orders.create", "no.such.permission"]},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            set(self.role.permissions.values_list("code", flat=True)), {"orders.view"}
        )

    def test_inactive_code_rejected_with_no_partial_write(self):
        self.role.permissions.set([self.view_perm])
        response = put_json(
            self.client_,
            role_permissions_url(self.company.id, self.role.id),
            {"permission_codes": ["orders.create", "orders.delete"]},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            set(self.role.permissions.values_list("code", flat=True)), {"orders.view"}
        )

    def test_non_string_item_rejected(self):
        response = put_json(
            self.client_,
            role_permissions_url(self.company.id, self.role.id),
            {"permission_codes": ["orders.view", 123]},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 400)

    def test_non_list_value_rejected(self):
        response = put_json(
            self.client_,
            role_permissions_url(self.company.id, self.role.id),
            {"permission_codes": "orders.view"},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 400)

    def test_blank_string_item_rejected(self):
        response = put_json(
            self.client_,
            role_permissions_url(self.company.id, self.role.id),
            {"permission_codes": [""]},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 400)

    def test_rejected_when_company_inactive(self):
        self.company.is_active = False
        self.company.save(update_fields=["is_active", "updated_at"])
        response = put_json(
            self.client_,
            role_permissions_url(self.company.id, self.role.id),
            {"permission_codes": ["orders.view"]},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 400)

    def test_rejected_when_role_inactive(self):
        self.role.is_active = False
        self.role.save(update_fields=["is_active", "updated_at"])
        response = put_json(
            self.client_,
            role_permissions_url(self.company.id, self.role.id),
            {"permission_codes": ["orders.view"]},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 400)

    def test_cross_company_role_returns_404(self):
        other_role = CompanyRole.objects.create(company=self.other_company, code="MANAGER", name="Manager")
        response = put_json(
            self.client_,
            role_permissions_url(self.company.id, other_role.id),
            {"permission_codes": ["orders.view"]},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 404)

    def test_permission_change_affects_existing_user_on_next_lookup(self):
        user = make_user("jdoe")
        membership = CompanyMembership.objects.create(user=user, company=self.company)
        assign_role(membership, self.role)
        self.assertEqual(effective_permission_codes(user, self.company), frozenset())

        put_json(
            self.client_,
            role_permissions_url(self.company.id, self.role.id),
            {"permission_codes": ["orders.view"]},
            self.superuser_token,
        )

        self.assertEqual(effective_permission_codes(user, self.company), {"orders.view"})

    def test_permission_revocation_affects_existing_user_on_next_lookup(self):
        self.role.permissions.set([self.view_perm])
        user = make_user("jdoe")
        membership = CompanyMembership.objects.create(user=user, company=self.company)
        assign_role(membership, self.role)
        self.assertEqual(effective_permission_codes(user, self.company), {"orders.view"})

        put_json(
            self.client_,
            role_permissions_url(self.company.id, self.role.id),
            {"permission_codes": []},
            self.superuser_token,
        )

        self.assertEqual(effective_permission_codes(user, self.company), frozenset())

    def test_ordinary_user_cannot_replace_permissions(self):
        user = make_user("plain")
        response = put_json(
            self.client_,
            role_permissions_url(self.company.id, self.role.id),
            {"permission_codes": ["orders.view"]},
            access_token_for(user),
        )
        self.assertEqual(response.status_code, 403)


class RoleAuditRollbackTests(RoleManagementTestCase):
    def test_create_role_rolls_back_if_audit_write_fails(self):
        with patch("apps.permissions.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                post_json(
                    self.client_,
                    roles_url(self.company.id),
                    {"code": "MANAGER", "name": "Manager"},
                    self.superuser_token,
                )
        self.assertFalse(CompanyRole.objects.filter(company=self.company, code="MANAGER").exists())

    def test_replace_permissions_rolls_back_if_audit_write_fails(self):
        perm = make_permission("orders.view")
        role = CompanyRole.objects.create(company=self.company, code="MANAGER", name="Manager")
        with patch("apps.permissions.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                put_json(
                    self.client_,
                    role_permissions_url(self.company.id, role.id),
                    {"permission_codes": ["orders.view"]},
                    self.superuser_token,
                )
        self.assertEqual(role.permissions.count(), 0)

    def test_deactivate_role_rolls_back_if_audit_write_fails(self):
        role = CompanyRole.objects.create(company=self.company, code="MANAGER", name="Manager")
        with patch("apps.permissions.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                post_json(
                    self.client_, role_deactivate_url(self.company.id, role.id), {}, self.superuser_token
                )
        role.refresh_from_db()
        self.assertTrue(role.is_active)
