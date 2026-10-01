from django.contrib.admin.models import LogEntry
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from django.db import IntegrityError, transaction
from django.db.models.deletion import ProtectedError
from django.test import RequestFactory, TestCase

from apps.companies.admin import CompanyAdmin, CompanyMembershipAdmin
from apps.companies.models import Company, CompanyMembership
from apps.companies.services import active_companies_for_user

User = get_user_model()


def make_user(username, **kwargs):
    return User.objects.create_user(
        username=username, email=f"{username}@example.com", password="a-strong-pass-1", **kwargs
    )


def make_company(code, legal_name=None, **kwargs):
    return Company.objects.create(
        code=code, legal_name=legal_name or f"{code} Legal Name Pvt Ltd", **kwargs
    )


class CompanyModelTests(TestCase):
    def test_code_is_required(self):
        with self.assertRaises(Exception):
            Company.objects.create(code="", legal_name="Acme Pharma")

    def test_code_whitespace_only_is_rejected(self):
        with self.assertRaises(Exception):
            Company.objects.create(code="   ", legal_name="Acme Pharma")

    def test_legal_name_whitespace_only_is_rejected(self):
        with self.assertRaises(Exception):
            Company.objects.create(code="ACME", legal_name="   ")

    def test_code_is_normalised(self):
        company = Company.objects.create(code="  acme  ", legal_name="Acme Pharma Pvt Ltd")
        self.assertEqual(company.code, "ACME")

    def test_display_name_is_optional(self):
        company = Company.objects.create(code="ACME", legal_name="Acme Pharma Pvt Ltd")
        self.assertEqual(company.display_name, "")

    def test_is_active_defaults_true(self):
        company = make_company("ACME")
        self.assertTrue(company.is_active)

    def test_code_uniqueness_enforced_in_database(self):
        make_company("ACME")
        with transaction.atomic():
            with self.assertRaises(IntegrityError):
                Company.objects.create(code="ACME", legal_name="Duplicate Acme Ltd")
        # Original row is untouched and still the only one.
        self.assertEqual(Company.objects.filter(code="ACME").count(), 1)

    def test_code_uniqueness_enforced_after_normalisation(self):
        make_company("ACME")
        with transaction.atomic():
            with self.assertRaises(IntegrityError):
                Company.objects.create(code=" acme ", legal_name="Duplicate Acme Ltd")


class CompanyMembershipModelTests(TestCase):
    def setUp(self):
        self.user = make_user("jdoe")
        self.company_a = make_company("ACME")
        self.company_b = make_company("BETA")

    def test_duplicate_membership_rejected_by_database(self):
        CompanyMembership.objects.create(user=self.user, company=self.company_a)
        with transaction.atomic():
            with self.assertRaises(IntegrityError):
                CompanyMembership.objects.create(user=self.user, company=self.company_a)

    def test_duplicate_rejected_even_when_existing_row_is_inactive(self):
        membership = CompanyMembership.objects.create(user=self.user, company=self.company_a)
        membership.is_active = False
        membership.save(update_fields=["is_active", "updated_at"])
        with transaction.atomic():
            with self.assertRaises(IntegrityError):
                CompanyMembership.objects.create(user=self.user, company=self.company_a)

    def test_activate_reactivates_existing_row_instead_of_duplicating(self):
        membership = CompanyMembership.objects.create(user=self.user, company=self.company_a)
        membership.is_active = False
        membership.save(update_fields=["is_active", "updated_at"])

        reactivated = CompanyMembership.objects.activate(user=self.user, company=self.company_a)

        self.assertEqual(reactivated.pk, membership.pk)
        self.assertTrue(reactivated.is_active)
        self.assertEqual(
            CompanyMembership.objects.filter(user=self.user, company=self.company_a).count(), 1
        )

    def test_activate_is_a_noop_when_already_active(self):
        membership = CompanyMembership.objects.create(user=self.user, company=self.company_a)
        reactivated = CompanyMembership.objects.activate(user=self.user, company=self.company_a)
        self.assertEqual(reactivated.pk, membership.pk)

    def test_user_can_belong_to_both_companies(self):
        CompanyMembership.objects.create(user=self.user, company=self.company_a)
        CompanyMembership.objects.create(user=self.user, company=self.company_b)

        companies = list(active_companies_for_user(self.user))

        self.assertEqual(companies, [self.company_a, self.company_b])

    def test_company_protected_from_deletion_while_membership_exists(self):
        CompanyMembership.objects.create(user=self.user, company=self.company_a)
        with transaction.atomic():
            with self.assertRaises(ProtectedError):
                self.company_a.delete()
        self.assertTrue(Company.objects.filter(pk=self.company_a.pk).exists())

    def test_user_protected_from_deletion_while_membership_exists(self):
        CompanyMembership.objects.create(user=self.user, company=self.company_a)
        with transaction.atomic():
            with self.assertRaises(ProtectedError):
                self.user.delete()
        self.assertTrue(User.objects.filter(pk=self.user.pk).exists())

    def test_membership_survives_deactivation(self):
        membership = CompanyMembership.objects.create(user=self.user, company=self.company_a)
        membership.is_active = False
        membership.save(update_fields=["is_active", "updated_at"])

        self.assertTrue(
            CompanyMembership.objects.filter(pk=membership.pk, is_active=False).exists()
        )


class ActiveCompaniesForUserTests(TestCase):
    def setUp(self):
        self.user = make_user("jdoe")
        self.company = make_company("ACME")

    def test_anonymous_user_gets_empty_result(self):
        self.assertEqual(list(active_companies_for_user(AnonymousUser())), [])

    def test_none_user_gets_empty_result(self):
        self.assertEqual(list(active_companies_for_user(None)), [])

    def test_user_without_membership_gets_empty_result(self):
        self.assertEqual(list(active_companies_for_user(self.user)), [])

    def test_active_membership_is_returned(self):
        CompanyMembership.objects.create(user=self.user, company=self.company)
        self.assertEqual(list(active_companies_for_user(self.user)), [self.company])

    def test_inactive_company_is_excluded(self):
        CompanyMembership.objects.create(user=self.user, company=self.company)
        self.company.is_active = False
        self.company.save(update_fields=["is_active", "updated_at"])
        self.assertEqual(list(active_companies_for_user(self.user)), [])

    def test_inactive_membership_is_excluded(self):
        membership = CompanyMembership.objects.create(user=self.user, company=self.company)
        membership.is_active = False
        membership.save(update_fields=["is_active", "updated_at"])
        self.assertEqual(list(active_companies_for_user(self.user)), [])

    def test_inactive_user_is_excluded(self):
        CompanyMembership.objects.create(user=self.user, company=self.company)
        self.user.is_active = False
        self.user.save(update_fields=["is_active"])
        self.assertEqual(list(active_companies_for_user(self.user)), [])

    def test_staff_flag_does_not_grant_implicit_access(self):
        staff_user = make_user("staffer", is_staff=True)
        self.assertEqual(list(active_companies_for_user(staff_user)), [])

    def test_superuser_flag_does_not_grant_implicit_access(self):
        superuser = User.objects.create_superuser(
            username="admin", email="admin@example.com", password="super-strong-pass-1"
        )
        self.assertEqual(list(active_companies_for_user(superuser)), [])

    def test_ordering_is_deterministic(self):
        company_z = make_company("ZETA")
        company_a = make_company("ALPHA")
        CompanyMembership.objects.create(user=self.user, company=company_z)
        CompanyMembership.objects.create(user=self.user, company=company_a)
        CompanyMembership.objects.create(user=self.user, company=self.company)

        companies = list(active_companies_for_user(self.user))

        self.assertEqual(companies, sorted(companies, key=lambda c: c.code))


class AdminAccessRestrictionTests(TestCase):
    def setUp(self):
        self.factory = RequestFactory()
        self.company_admin = CompanyAdmin(Company, admin_site=None)
        self.membership_admin = CompanyMembershipAdmin(CompanyMembership, admin_site=None)

    def _request_as(self, user):
        request = self.factory.get("/admin/")
        request.user = user
        return request

    def test_active_superuser_can_view_and_manage(self):
        superuser = User.objects.create_superuser(
            username="admin", email="admin@example.com", password="super-strong-pass-1"
        )
        request = self._request_as(superuser)
        for admin_instance in (self.company_admin, self.membership_admin):
            self.assertTrue(admin_instance.has_module_permission(request))
            self.assertTrue(admin_instance.has_view_permission(request))
            self.assertTrue(admin_instance.has_add_permission(request))
            self.assertTrue(admin_instance.has_change_permission(request))

    def test_ordinary_staff_cannot_manage_company_access(self):
        staff_user = make_user("staffer", is_staff=True)
        request = self._request_as(staff_user)
        for admin_instance in (self.company_admin, self.membership_admin):
            self.assertFalse(admin_instance.has_module_permission(request))
            self.assertFalse(admin_instance.has_view_permission(request))
            self.assertFalse(admin_instance.has_add_permission(request))
            self.assertFalse(admin_instance.has_change_permission(request))

    def test_inactive_superuser_cannot_manage(self):
        superuser = User.objects.create_superuser(
            username="admin", email="admin@example.com", password="super-strong-pass-1"
        )
        superuser.is_active = False
        superuser.save(update_fields=["is_active"])
        request = self._request_as(superuser)
        for admin_instance in (self.company_admin, self.membership_admin):
            self.assertFalse(admin_instance.has_module_permission(request))
            self.assertFalse(admin_instance.has_change_permission(request))

    def test_ordinary_user_cannot_manage(self):
        plain_user = make_user("plain")
        request = self._request_as(plain_user)
        for admin_instance in (self.company_admin, self.membership_admin):
            self.assertFalse(admin_instance.has_module_permission(request))

    def test_hard_delete_is_always_disabled(self):
        superuser = User.objects.create_superuser(
            username="admin", email="admin@example.com", password="super-strong-pass-1"
        )
        request = self._request_as(superuser)
        self.assertFalse(self.company_admin.has_delete_permission(request))
        self.assertFalse(self.membership_admin.has_delete_permission(request))


class AdminDeactivationActionTests(TestCase):
    def setUp(self):
        self.factory = RequestFactory()
        self.superuser = User.objects.create_superuser(
            username="admin", email="admin@example.com", password="super-strong-pass-1"
        )
        self.company = make_company("ACME")

    def _request(self):
        request = self.factory.get("/admin/")
        request.user = self.superuser
        return request

    def test_deactivate_action_preserves_row_and_logs_change(self):
        admin_instance = CompanyAdmin(Company, admin_site=None)
        request = self._request()
        log_count_before = LogEntry.objects.count()

        admin_instance.deactivate_selected(request, Company.objects.filter(pk=self.company.pk))

        self.company.refresh_from_db()
        self.assertFalse(self.company.is_active)
        self.assertTrue(Company.objects.filter(pk=self.company.pk).exists())
        self.assertGreater(LogEntry.objects.count(), log_count_before)
