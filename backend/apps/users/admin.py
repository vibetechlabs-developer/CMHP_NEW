from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from apps.companies.admin import SuperuserOnlyAdminMixin
from apps.users.models import User


@admin.register(User)
class UserAdmin(SuperuserOnlyAdminMixin, DjangoUserAdmin):
    """Restricted to active superusers only, same as every other
    administrative surface in this project (Company/CompanyMembership/
    PermissionDefinition/CompanyRole/MembershipRole admins) - see
    apps.companies.admin.SuperuserOnlyAdminMixin. Deliberately does not
    consult Django's own `auth.*_user` model permissions: a staff account
    explicitly granted `add_user`/`change_user`/`view_user`/`delete_user`
    permissions still gets denied here, because those permissions are
    themselves only grantable by a superuser through this exact admin -
    consulting them would make the restriction circular. Mixed in before
    DjangoUserAdmin (not after) so SuperuserOnlyAdminMixin's permission
    checks take priority while DjangoUserAdmin's forms (add_form/form,
    including its password-hash/"change password" handling) are inherited
    unchanged - this mixin never overrides get_form/add_form/change_form.

    Known limitation, not solved here: this only restricts *this* User
    admin. It does not, by itself, give REST-API-created audit records
    (apps.audit.AuditLog, Task 05) any awareness of edits made through
    this admin form - see apps.audit docs for that coverage boundary.
    """

    fieldsets = DjangoUserAdmin.fieldsets + (
        ("Timestamps", {"fields": ("updated_at",)}),
    )
    readonly_fields = DjangoUserAdmin.readonly_fields + ("updated_at",)
    list_display = ("username", "email", "first_name", "last_name", "is_staff", "is_active")
    search_fields = ("username", "email", "first_name", "last_name")
