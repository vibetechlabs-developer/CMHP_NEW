from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.db import IntegrityError
from django.test import RequestFactory, TestCase

from apps.users.admin import UserAdmin
from apps.users.models import User


class UserModelTests(TestCase):
    def test_create_user_hashes_password(self):
        user = get_user_model().objects.create_user(
            username="jdoe",
            email="jdoe@example.com",
            password="a-strong-password-123",
        )
        self.assertNotEqual(user.password, "a-strong-password-123")
        self.assertTrue(user.check_password("a-strong-password-123"))

    def test_create_user_sets_required_fields(self):
        user = get_user_model().objects.create_user(
            username="asmith",
            email="asmith@example.com",
            password="another-strong-pass-1",
            first_name="Alex",
            last_name="Smith",
        )
        self.assertEqual(user.first_name, "Alex")
        self.assertEqual(user.last_name, "Smith")
        self.assertTrue(user.is_active)
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)
        self.assertIsNotNone(user.date_joined)
        self.assertIsNotNone(user.updated_at)

    def test_create_superuser(self):
        admin = get_user_model().objects.create_superuser(
            username="admin",
            email="admin@example.com",
            password="super-strong-pass-1",
        )
        self.assertTrue(admin.is_staff)
        self.assertTrue(admin.is_superuser)

    def test_email_is_unique(self):
        get_user_model().objects.create_user(
            username="first", email="dup@example.com", password="pass-strong-1"
        )
        with self.assertRaises(IntegrityError):
            get_user_model().objects.create_user(
                username="second", email="dup@example.com", password="pass-strong-2"
            )


class UserAdminAccessRestrictionTests(TestCase):
    """UserAdmin must follow the same active-superuser-only policy as
    every other admin in this project (apps.companies.admin.
    SuperuserOnlyAdminMixin) - explicit Django `auth.*_user` model
    permissions granted to a non-superuser staff account must not be
    able to bypass it, since those permissions only mean anything through
    this exact admin (Django's own permission system is not the
    authorization boundary here; is_active + is_superuser is).
    """

    def setUp(self):
        self.factory = RequestFactory()
        self.admin_instance = UserAdmin(User, admin_site=None)

    def _request_as(self, user):
        request = self.factory.get("/admin/")
        request.user = user
        return request

    def test_active_superuser_retains_access(self):
        superuser = User.objects.create_superuser(
            username="admin", email="admin@example.com", password="super-strong-pass-1"
        )
        request = self._request_as(superuser)
        self.assertTrue(self.admin_instance.has_module_permission(request))
        self.assertTrue(self.admin_instance.has_view_permission(request))
        self.assertTrue(self.admin_instance.has_add_permission(request))
        self.assertTrue(self.admin_instance.has_change_permission(request))

    def test_inactive_superuser_denied(self):
        superuser = User.objects.create_superuser(
            username="admin", email="admin@example.com", password="super-strong-pass-1"
        )
        superuser.is_active = False
        superuser.save(update_fields=["is_active"])
        request = self._request_as(superuser)
        self.assertFalse(self.admin_instance.has_module_permission(request))
        self.assertFalse(self.admin_instance.has_change_permission(request))

    def test_ordinary_user_denied(self):
        plain = User.objects.create_user(
            username="plain", email="plain@example.com", password="a-strong-pass-1"
        )
        request = self._request_as(plain)
        self.assertFalse(self.admin_instance.has_module_permission(request))

    def test_staff_with_explicit_user_management_permissions_still_denied(self):
        staff = User.objects.create_user(
            username="staffer",
            email="staffer@example.com",
            password="a-strong-pass-1",
            is_staff=True,
        )
        staff.user_permissions.add(
            *Permission.objects.filter(
                content_type__app_label="users",
                codename__in=["add_user", "change_user", "view_user", "delete_user"],
            )
        )
        request = self._request_as(staff)
        request.user = staff
        # Confirm the permissions really were granted, at the Django level,
        # before proving the admin ignores them anyway.
        self.assertTrue(staff.has_perm("users.change_user"))
        self.assertTrue(staff.has_perm("users.add_user"))

        self.assertFalse(self.admin_instance.has_module_permission(request))
        self.assertFalse(self.admin_instance.has_view_permission(request))
        self.assertFalse(self.admin_instance.has_add_permission(request))
        self.assertFalse(self.admin_instance.has_change_permission(request))

    def test_hard_delete_is_always_disabled(self):
        superuser = User.objects.create_superuser(
            username="admin", email="admin@example.com", password="super-strong-pass-1"
        )
        request = self._request_as(superuser)
        self.assertFalse(self.admin_instance.has_delete_permission(request))
