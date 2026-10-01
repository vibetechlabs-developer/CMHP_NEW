from django.contrib import admin as django_admin
from django.contrib.admin.models import LogEntry
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models.deletion import ProtectedError
from django.forms import modelform_factory
from django.test import RequestFactory, TestCase

from apps.companies.models import Company, CompanyMembership
from apps.permissions.admin import CompanyRoleAdmin, MembershipRoleAdmin, PermissionDefinitionAdmin
from apps.permissions.models import CompanyRole, MembershipRole, PermissionDefinition
from apps.permissions.services import (
    assign_role,
    deactivate_role_assignment,
    effective_permission_codes,
    user_has_permission,
)

User = get_user_model()


def make_user(username, **kwargs):
    return User.objects.create_user(
        username=username, email=f"{username}@example.com", password="a-strong-pass-1", **kwargs
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


class PermissionDefinitionModelTests(TestCase):
    def test_code_is_required(self):
        with self.assertRaises(Exception):
            PermissionDefinition.objects.create(code="", name="View orders", module="orders")

    def test_code_is_normalised(self):
        perm = PermissionDefinition.objects.create(
            code="  Orders.View  ", name="View orders", module="orders"
        )
        self.assertEqual(perm.code, "orders.view")

    def test_code_uniqueness_enforced_in_database(self):
        make_permission("orders.view")
        with transaction.atomic():
            with self.assertRaises(IntegrityError):
                PermissionDefinition.objects.create(
                    code="orders.view", name="Duplicate", module="orders"
                )

    def test_name_and_module_required(self):
        with self.assertRaises(Exception):
            PermissionDefinition.objects.create(code="orders.view", name="", module="orders")
        with self.assertRaises(Exception):
            PermissionDefinition.objects.create(code="orders.view2", name="View", module="   ")

    def test_is_active_defaults_true(self):
        perm = make_permission("orders.view")
        self.assertTrue(perm.is_active)


class CompanyRoleModelTests(TestCase):
    def setUp(self):
        self.company_a = make_company("ACME")
        self.company_b = make_company("BETA")

    def test_code_and_name_required(self):
        with self.assertRaises(Exception):
            CompanyRole.objects.create(company=self.company_a, code="", name="Manager")

    def test_code_is_normalised(self):
        role = CompanyRole.objects.create(company=self.company_a, code="  manager  ", name="Manager")
        self.assertEqual(role.code, "MANAGER")

    def test_same_code_allowed_across_different_companies(self):
        role_a = make_role(self.company_a, "MANAGER")
        role_b = make_role(self.company_b, "MANAGER")
        self.assertNotEqual(role_a.pk, role_b.pk)

    def test_duplicate_code_within_same_company_rejected_by_database(self):
        make_role(self.company_a, "MANAGER")
        with transaction.atomic():
            with self.assertRaises(IntegrityError):
                CompanyRole.objects.create(company=self.company_a, code="MANAGER", name="Dup")

    def test_permissions_relationship(self):
        perm1 = make_permission("orders.view")
        perm2 = make_permission("orders.create")
        role = make_role(self.company_a, "MANAGER", permissions=[perm1, perm2])
        self.assertEqual(set(role.permissions.values_list("code", flat=True)), {"orders.view", "orders.create"})

    def test_role_protected_from_deletion_while_assigned(self):
        user = make_user("jdoe")
        membership = CompanyMembership.objects.create(user=user, company=self.company_a)
        role = make_role(self.company_a, "MANAGER")
        MembershipRole.objects.create(membership=membership, role=role)
        with transaction.atomic():
            with self.assertRaises(ProtectedError):
                role.delete()


class MembershipRoleModelTests(TestCase):
    def setUp(self):
        self.user = make_user("jdoe")
        self.company_a = make_company("ACME")
        self.company_b = make_company("BETA")
        self.membership_a = CompanyMembership.objects.create(user=self.user, company=self.company_a)
        self.role_a = make_role(self.company_a, "MANAGER")
        self.role_b = make_role(self.company_b, "MANAGER")

    def test_duplicate_assignment_rejected_by_database(self):
        MembershipRole.objects.create(membership=self.membership_a, role=self.role_a)
        with transaction.atomic():
            with self.assertRaises(IntegrityError):
                MembershipRole.objects.create(membership=self.membership_a, role=self.role_a)

    def test_duplicate_rejected_even_when_existing_row_is_inactive(self):
        assignment = MembershipRole.objects.create(membership=self.membership_a, role=self.role_a)
        assignment.is_active = False
        assignment.save(update_fields=["is_active", "updated_at"])
        with transaction.atomic():
            with self.assertRaises(IntegrityError):
                MembershipRole.objects.create(membership=self.membership_a, role=self.role_a)

    def test_cross_company_assignment_rejected_on_save(self):
        with self.assertRaises(ValidationError):
            MembershipRole.objects.create(membership=self.membership_a, role=self.role_b)
        self.assertFalse(
            MembershipRole.objects.filter(membership=self.membership_a, role=self.role_b).exists()
        )

    def test_bulk_create_bypasses_cross_company_check_documented_limitation(self):
        """Known, documented limitation (see apps.permissions.models.MembershipRole.save
        and docs/backend-decisions.md): bulk_create() never calls save()/clean(), so it
        is the one write path that is NOT protected against a cross-company row, and no
        database-level constraint backs the check either. Application code must always
        go through apps.permissions.services.assign_role() (or plain .save()), never
        bulk_create(), to create MembershipRole rows - this test exists to keep that
        limitation honest and visible, not to endorse using bulk_create() here.
        """
        MembershipRole.objects.bulk_create(
            [MembershipRole(membership=self.membership_a, role=self.role_b)]
        )
        self.assertTrue(
            MembershipRole.objects.filter(membership=self.membership_a, role=self.role_b).exists()
        )

    def test_membership_protected_from_deletion_while_assigned(self):
        MembershipRole.objects.create(membership=self.membership_a, role=self.role_a)
        with transaction.atomic():
            with self.assertRaises(ProtectedError):
                self.membership_a.delete()


class AssignRoleServiceTests(TestCase):
    def setUp(self):
        self.user = make_user("jdoe")
        self.company_a = make_company("ACME")
        self.company_b = make_company("BETA")
        self.membership_a = CompanyMembership.objects.create(user=self.user, company=self.company_a)
        self.role_a = make_role(self.company_a, "MANAGER")
        self.role_b = make_role(self.company_b, "MANAGER")

    def test_assign_role_creates_assignment(self):
        assignment = assign_role(self.membership_a, self.role_a)
        self.assertTrue(assignment.is_active)
        self.assertEqual(MembershipRole.objects.count(), 1)

    def test_assign_role_is_idempotent(self):
        first = assign_role(self.membership_a, self.role_a)
        second = assign_role(self.membership_a, self.role_a)
        self.assertEqual(first.pk, second.pk)
        self.assertEqual(MembershipRole.objects.count(), 1)

    def test_assign_role_reactivates_inactive_assignment(self):
        assignment = assign_role(self.membership_a, self.role_a)
        deactivate_role_assignment(self.membership_a, self.role_a)
        reactivated = assign_role(self.membership_a, self.role_a)
        self.assertEqual(reactivated.pk, assignment.pk)
        self.assertTrue(reactivated.is_active)
        self.assertEqual(MembershipRole.objects.count(), 1)

    def test_assign_role_rejects_cross_company(self):
        with self.assertRaises(ValidationError):
            assign_role(self.membership_a, self.role_b)
        self.assertEqual(MembershipRole.objects.count(), 0)

    def test_deactivate_role_assignment_deactivates_existing(self):
        assign_role(self.membership_a, self.role_a)
        result = deactivate_role_assignment(self.membership_a, self.role_a)
        self.assertFalse(result.is_active)

    def test_deactivate_role_assignment_returns_none_for_missing(self):
        result = deactivate_role_assignment(self.membership_a, self.role_a)
        self.assertIsNone(result)


class EffectivePermissionsTests(TestCase):
    def setUp(self):
        self.user = make_user("jdoe")
        self.company_a = make_company("ACME")
        self.company_b = make_company("BETA")
        self.view = make_permission("orders.view")
        self.create = make_permission("orders.create")
        self.membership_a = CompanyMembership.objects.create(user=self.user, company=self.company_a)
        self.membership_b = CompanyMembership.objects.create(user=self.user, company=self.company_b)

    def test_different_permissions_per_company_for_same_user(self):
        role_a = make_role(self.company_a, "MANAGER", permissions=[self.view, self.create])
        role_b = make_role(self.company_b, "VIEWER", permissions=[self.view])
        assign_role(self.membership_a, role_a)
        assign_role(self.membership_b, role_b)

        self.assertEqual(
            effective_permission_codes(self.user, self.company_a), {"orders.view", "orders.create"}
        )
        self.assertEqual(effective_permission_codes(self.user, self.company_b), {"orders.view"})

    def test_no_cross_company_permission_leakage(self):
        role_a = make_role(self.company_a, "MANAGER", permissions=[self.view, self.create])
        assign_role(self.membership_a, role_a)

        self.assertFalse(user_has_permission(self.user, self.company_b, "orders.create"))
        self.assertFalse(user_has_permission(self.user, self.company_b, "orders.view"))

    def test_multiple_roles_combine_permissions(self):
        role_view = make_role(self.company_a, "VIEWER", permissions=[self.view])
        role_create = make_role(self.company_a, "CREATOR", permissions=[self.create])
        assign_role(self.membership_a, role_view)
        assign_role(self.membership_a, role_create)

        self.assertEqual(
            effective_permission_codes(self.user, self.company_a), {"orders.view", "orders.create"}
        )

    def test_anonymous_user_denied(self):
        self.assertEqual(effective_permission_codes(AnonymousUser(), self.company_a), frozenset())
        self.assertFalse(user_has_permission(AnonymousUser(), self.company_a, "orders.view"))

    def test_user_without_membership_denied(self):
        other_user = make_user("other")
        self.assertEqual(effective_permission_codes(other_user, self.company_a), frozenset())

    def test_inactive_user_denied(self):
        role_a = make_role(self.company_a, "MANAGER", permissions=[self.view])
        assign_role(self.membership_a, role_a)
        self.user.is_active = False
        self.user.save(update_fields=["is_active"])
        self.assertEqual(effective_permission_codes(self.user, self.company_a), frozenset())

    def test_inactive_company_denied(self):
        role_a = make_role(self.company_a, "MANAGER", permissions=[self.view])
        assign_role(self.membership_a, role_a)
        self.company_a.is_active = False
        self.company_a.save(update_fields=["is_active", "updated_at"])
        self.assertEqual(effective_permission_codes(self.user, self.company_a), frozenset())

    def test_inactive_membership_denied(self):
        role_a = make_role(self.company_a, "MANAGER", permissions=[self.view])
        assign_role(self.membership_a, role_a)
        self.membership_a.is_active = False
        self.membership_a.save(update_fields=["is_active", "updated_at"])
        self.assertEqual(effective_permission_codes(self.user, self.company_a), frozenset())

    def test_inactive_role_assignment_denied(self):
        role_a = make_role(self.company_a, "MANAGER", permissions=[self.view])
        assign_role(self.membership_a, role_a)
        deactivate_role_assignment(self.membership_a, role_a)
        self.assertEqual(effective_permission_codes(self.user, self.company_a), frozenset())

    def test_inactive_role_denied(self):
        role_a = make_role(self.company_a, "MANAGER", permissions=[self.view])
        assign_role(self.membership_a, role_a)
        role_a.is_active = False
        role_a.save(update_fields=["is_active", "updated_at"])
        self.assertEqual(effective_permission_codes(self.user, self.company_a), frozenset())

    def test_inactive_permission_definition_denied(self):
        role_a = make_role(self.company_a, "MANAGER", permissions=[self.view])
        assign_role(self.membership_a, role_a)
        self.view.is_active = False
        self.view.save(update_fields=["is_active", "updated_at"])
        self.assertEqual(effective_permission_codes(self.user, self.company_a), frozenset())

    def test_staff_flag_does_not_bypass_permissions(self):
        staff_user = make_user("staffer", is_staff=True)
        CompanyMembership.objects.create(user=staff_user, company=self.company_a)
        self.assertEqual(effective_permission_codes(staff_user, self.company_a), frozenset())

    def test_superuser_flag_does_not_bypass_permissions(self):
        superuser = User.objects.create_superuser(
            username="admin", email="admin@example.com", password="super-strong-pass-1"
        )
        CompanyMembership.objects.create(user=superuser, company=self.company_a)
        self.assertEqual(effective_permission_codes(superuser, self.company_a), frozenset())

    def test_role_deactivation_reflected_on_next_lookup(self):
        role_a = make_role(self.company_a, "MANAGER", permissions=[self.view])
        assign_role(self.membership_a, role_a)
        self.assertTrue(user_has_permission(self.user, self.company_a, "orders.view"))

        deactivate_role_assignment(self.membership_a, role_a)

        self.assertFalse(user_has_permission(self.user, self.company_a, "orders.view"))

    def test_role_permission_set_change_reflected_on_next_lookup(self):
        role_a = make_role(self.company_a, "MANAGER", permissions=[self.view])
        assign_role(self.membership_a, role_a)
        self.assertEqual(effective_permission_codes(self.user, self.company_a), {"orders.view"})

        role_a.permissions.add(self.create)

        self.assertEqual(
            effective_permission_codes(self.user, self.company_a), {"orders.view", "orders.create"}
        )

    def test_effective_permission_codes_uses_a_single_query(self):
        role_a = make_role(self.company_a, "MANAGER", permissions=[self.view, self.create])
        assign_role(self.membership_a, role_a)
        with self.assertNumQueries(1):
            effective_permission_codes(self.user, self.company_a)


class AdminAccessRestrictionTests(TestCase):
    def setUp(self):
        self.factory = RequestFactory()
        self.company = make_company("ACME")
        self.permission_admin = PermissionDefinitionAdmin(PermissionDefinition, admin_site=django_admin.site)
        self.role_admin = CompanyRoleAdmin(CompanyRole, admin_site=django_admin.site)
        self.membership_role_admin = MembershipRoleAdmin(MembershipRole, admin_site=django_admin.site)
        self.admin_instances = (self.permission_admin, self.role_admin, self.membership_role_admin)

    def _request_as(self, user):
        request = self.factory.get("/admin/")
        request.user = user
        return request

    def test_active_superuser_can_manage(self):
        superuser = User.objects.create_superuser(
            username="admin", email="admin@example.com", password="super-strong-pass-1"
        )
        request = self._request_as(superuser)
        for admin_instance in self.admin_instances:
            self.assertTrue(admin_instance.has_module_permission(request))
            self.assertTrue(admin_instance.has_add_permission(request))
            self.assertTrue(admin_instance.has_change_permission(request))

    def test_ordinary_staff_cannot_manage_permissions(self):
        staff_user = make_user("staffer", is_staff=True)
        request = self._request_as(staff_user)
        for admin_instance in self.admin_instances:
            self.assertFalse(admin_instance.has_module_permission(request))
            self.assertFalse(admin_instance.has_add_permission(request))
            self.assertFalse(admin_instance.has_change_permission(request))

    def test_inactive_superuser_cannot_manage(self):
        superuser = User.objects.create_superuser(
            username="admin", email="admin@example.com", password="super-strong-pass-1"
        )
        superuser.is_active = False
        superuser.save(update_fields=["is_active"])
        request = self._request_as(superuser)
        for admin_instance in self.admin_instances:
            self.assertFalse(admin_instance.has_module_permission(request))

    def test_hard_delete_always_disabled(self):
        superuser = User.objects.create_superuser(
            username="admin", email="admin@example.com", password="super-strong-pass-1"
        )
        request = self._request_as(superuser)
        for admin_instance in self.admin_instances:
            self.assertFalse(admin_instance.has_delete_permission(request))


class MembershipRoleAdminBehaviourTests(TestCase):
    def setUp(self):
        self.user = make_user("jdoe")
        self.company_a = make_company("ACME")
        self.company_b = make_company("BETA")
        self.membership_a = CompanyMembership.objects.create(user=self.user, company=self.company_a)
        self.role_a = make_role(self.company_a, "MANAGER")
        self.role_b = make_role(self.company_b, "MANAGER")
        self.admin_instance = MembershipRoleAdmin(MembershipRole, admin_site=django_admin.site)
        self.superuser = User.objects.create_superuser(
            username="admin", email="admin@example.com", password="super-strong-pass-1"
        )
        self.factory = RequestFactory()

    def test_role_field_filtered_to_membership_company_on_change_form(self):
        assignment = MembershipRole.objects.create(membership=self.membership_a, role=self.role_a)
        request = self.factory.get("/admin/")
        request.user = self.superuser

        form_class = self.admin_instance.get_form(request, obj=assignment)
        role_field = form_class.base_fields["role"]

        self.assertEqual(set(role_field.queryset), {self.role_a})

    def test_admin_modelform_rejects_cross_company_assignment(self):
        form_class = modelform_factory(MembershipRole, fields=["membership", "role", "is_active"])
        form = form_class(data={
            "membership": self.membership_a.pk,
            "role": self.role_b.pk,
            "is_active": True,
        })
        self.assertFalse(form.is_valid())
        self.assertFalse(
            MembershipRole.objects.filter(membership=self.membership_a, role=self.role_b).exists()
        )


class AdminDeactivateReactivateActionTests(TestCase):
    def setUp(self):
        self.factory = RequestFactory()
        self.superuser = User.objects.create_superuser(
            username="admin", email="admin@example.com", password="super-strong-pass-1"
        )
        self.company = make_company("ACME")
        self.permission = make_permission("orders.view")

    def _request(self):
        request = self.factory.get("/admin/")
        request.user = self.superuser
        return request

    def test_deactivate_then_reactivate_permission_definition_preserves_row_and_logs(self):
        admin_instance = PermissionDefinitionAdmin(PermissionDefinition, admin_site=django_admin.site)
        request = self._request()
        log_count_before = LogEntry.objects.count()

        admin_instance.deactivate_selected(
            request, PermissionDefinition.objects.filter(pk=self.permission.pk)
        )
        self.permission.refresh_from_db()
        self.assertFalse(self.permission.is_active)

        admin_instance.reactivate_selected(
            request, PermissionDefinition.objects.filter(pk=self.permission.pk)
        )
        self.permission.refresh_from_db()
        self.assertTrue(self.permission.is_active)

        self.assertTrue(PermissionDefinition.objects.filter(pk=self.permission.pk).exists())
        self.assertGreater(LogEntry.objects.count(), log_count_before)
