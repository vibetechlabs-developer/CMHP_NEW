from django.contrib import admin

from apps.companies.models import Company, CompanyMembership


class SuperuserOnlyAdminMixin:
    """Restricts this ModelAdmin to active superusers only, for this
    foundation stage - ordinary staff must not be able to view or assign
    company access. Hard deletion is disabled everywhere; deactivation
    (is_active=False) is the only supported way to retire a row, so the
    row - and its admin change history - is preserved.
    """

    def has_module_permission(self, request):
        return self._is_active_superuser(request)

    def has_view_permission(self, request, obj=None):
        return self._is_active_superuser(request)

    def has_add_permission(self, request):
        return self._is_active_superuser(request)

    def has_change_permission(self, request, obj=None):
        return self._is_active_superuser(request)

    def has_delete_permission(self, request, obj=None):
        return False

    @staticmethod
    def _is_active_superuser(request):
        user = getattr(request, "user", None)
        return bool(user and user.is_active and user.is_superuser)

    def deactivate_queryset(self, request, queryset):
        for obj in queryset:
            if obj.is_active:
                obj.is_active = False
                obj.save(update_fields=["is_active", "updated_at"])
                self.log_change(request, obj, "Deactivated via admin action.")

    def reactivate_queryset(self, request, queryset):
        for obj in queryset:
            if not obj.is_active:
                obj.is_active = True
                obj.save(update_fields=["is_active", "updated_at"])
                self.log_change(request, obj, "Reactivated via admin action.")


class ReadOnlySuperuserAdminMixin(SuperuserOnlyAdminMixin):
    """Same active-superuser-only viewing rule as SuperuserOnlyAdminMixin,
    but add/change are also unconditionally disabled (not just delete) -
    used for models whose only supported write path is an audited REST
    API (Task 07A's SharedStore/StoreMembership/StoreRole/
    StoreRoleAssignment). This is a deliberate difference from
    Company/CompanyRole/etc., which still allow admin add/change: those
    predate the audit trail's introduction (Task 05) and changing their
    existing admin behaviour was out of scope for this task; introducing
    a *new* unaudited write path for newly-added models would not be.
    """

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(Company)
class CompanyAdmin(SuperuserOnlyAdminMixin, admin.ModelAdmin):
    list_display = ("code", "legal_name", "display_name", "is_active", "created_at")
    list_filter = ("is_active",)
    search_fields = ("code", "legal_name", "display_name")
    readonly_fields = ("created_at", "updated_at")
    ordering = ("code",)
    actions = ["deactivate_selected"]

    @admin.action(description="Deactivate selected companies")
    def deactivate_selected(self, request, queryset):
        self.deactivate_queryset(request, queryset)


@admin.register(CompanyMembership)
class CompanyMembershipAdmin(SuperuserOnlyAdminMixin, admin.ModelAdmin):
    list_display = ("user", "company", "is_active", "created_at")
    list_filter = ("is_active", "company")
    search_fields = (
        "user__username",
        "user__email",
        "company__code",
        "company__legal_name",
    )
    readonly_fields = ("created_at", "updated_at")
    autocomplete_fields = ("user", "company")
    actions = ["deactivate_selected"]

    @admin.action(description="Deactivate selected memberships")
    def deactivate_selected(self, request, queryset):
        self.deactivate_queryset(request, queryset)
