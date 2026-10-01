from django import forms
from django.contrib import admin

from apps.companies.admin import ReadOnlySuperuserAdminMixin, SuperuserOnlyAdminMixin
from apps.permissions.models import (
    CompanyRole,
    MembershipRole,
    PermissionDefinition,
    StoreRole,
    StoreRoleAssignment,
)


@admin.register(PermissionDefinition)
class PermissionDefinitionAdmin(SuperuserOnlyAdminMixin, admin.ModelAdmin):
    list_display = ("code", "name", "module", "scope", "is_active", "created_at")
    list_filter = ("module", "scope", "is_active")
    search_fields = ("code", "name", "module")
    readonly_fields = ("created_at", "updated_at")
    ordering = ("module", "code")
    actions = ["deactivate_selected", "reactivate_selected"]

    def get_readonly_fields(self, request, obj=None):
        # scope is immutable after creation (PermissionDefinition.clean())
        # - reflected here too, once a row exists, so the admin form
        # cannot even attempt (and fail server-side on) a scope change.
        if obj is not None:
            return (*self.readonly_fields, "scope")
        return self.readonly_fields

    @admin.action(description="Deactivate selected permission definitions")
    def deactivate_selected(self, request, queryset):
        self.deactivate_queryset(request, queryset)

    @admin.action(description="Reactivate selected permission definitions")
    def reactivate_selected(self, request, queryset):
        self.reactivate_queryset(request, queryset)


class CompanyRoleAdminForm(forms.ModelForm):
    """Restricts the `permissions` field to scope=COMPANY definitions -
    both as the widget's choices (so a well-behaved browser session never
    even offers a STORE permission) and in clean_permissions() (so a
    tampered POST naming a STORE permission id directly is still rejected
    with a normal form error, not silently accepted). This is the "Django
    Admin permission assignment" validation the scope feature requires -
    the M2M field itself has no such validation built in (Django never
    calls clean() for M2M writes), so it has to live here.
    """

    class Meta:
        model = CompanyRole
        fields = "__all__"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["permissions"].queryset = PermissionDefinition.objects.filter(
            scope=PermissionDefinition.Scope.COMPANY
        )

    def clean_permissions(self):
        selected = self.cleaned_data["permissions"]
        wrong_scope = selected.exclude(scope=PermissionDefinition.Scope.COMPANY)
        if wrong_scope.exists():
            raise forms.ValidationError(
                "Only COMPANY-scope permissions can be assigned to a company role: "
                f"{sorted(wrong_scope.values_list('code', flat=True))}."
            )
        return selected


@admin.register(CompanyRole)
class CompanyRoleAdmin(SuperuserOnlyAdminMixin, admin.ModelAdmin):
    form = CompanyRoleAdminForm
    list_display = ("code", "name", "company", "is_active", "created_at")
    list_filter = ("company", "is_active")
    search_fields = ("code", "name", "company__code", "company__legal_name")
    readonly_fields = ("created_at", "updated_at")
    autocomplete_fields = ("company",)
    filter_horizontal = ("permissions",)
    ordering = ("company__code", "code")
    actions = ["deactivate_selected", "reactivate_selected"]

    @admin.action(description="Deactivate selected company roles")
    def deactivate_selected(self, request, queryset):
        self.deactivate_queryset(request, queryset)

    @admin.action(description="Reactivate selected company roles")
    def reactivate_selected(self, request, queryset):
        self.reactivate_queryset(request, queryset)


@admin.register(StoreRole)
class StoreRoleAdmin(ReadOnlySuperuserAdminMixin, admin.ModelAdmin):
    """Read-only: create/update/activate/deactivate/permission-replacement
    go through the audited /api/v1/stores/<id>/roles/ API only. Being
    read-only, there is no add/change form here to tamper with - unlike
    CompanyRoleAdmin above (which predates the audit trail and remains
    editable), this model never had an unaudited write path to close.
    """

    list_display = ("code", "name", "store", "is_active", "created_at")
    list_filter = ("store", "is_active")
    search_fields = ("code", "name", "store__code", "store__name")
    readonly_fields = ("created_at", "updated_at")


@admin.register(StoreRoleAssignment)
class StoreRoleAssignmentAdmin(ReadOnlySuperuserAdminMixin, admin.ModelAdmin):
    list_display = ("membership", "role", "is_active", "created_at")
    list_filter = ("is_active", "role__store")
    search_fields = (
        "membership__user__username",
        "membership__user__email",
        "membership__store__code",
        "role__code",
        "role__name",
    )
    readonly_fields = ("created_at", "updated_at")


@admin.register(MembershipRole)
class MembershipRoleAdmin(SuperuserOnlyAdminMixin, admin.ModelAdmin):
    list_display = ("membership", "role", "company_display", "is_active", "created_at")
    list_filter = ("is_active", "role__company")
    search_fields = (
        "membership__user__username",
        "membership__user__email",
        "membership__company__code",
        "role__code",
        "role__name",
    )
    readonly_fields = ("created_at", "updated_at")
    autocomplete_fields = ("membership", "role")
    ordering = ("membership__company__code", "membership__user__username", "role__code")
    actions = ["deactivate_selected", "reactivate_selected"]

    @admin.display(description="Company")
    def company_display(self, obj):
        return obj.membership.company

    def get_form(self, request, obj=None, **kwargs):
        # Stashed on the request so formfield_for_foreignkey (which does
        # not receive `obj`) can see which membership is being edited, to
        # narrow the role choices to that membership's company. Only
        # possible on the change form - on the add form no membership has
        # been chosen yet, so the role list cannot be narrowed there; the
        # model's clean()/save() still rejects a cross-company choice
        # server-side regardless of what the widget offered.
        request._editing_membership_role = obj
        return super().get_form(request, obj, **kwargs)

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == "role":
            obj = getattr(request, "_editing_membership_role", None)
            if obj is not None and obj.membership_id:
                kwargs["queryset"] = CompanyRole.objects.filter(company=obj.membership.company)
        return super().formfield_for_foreignkey(db_field, request, **kwargs)

    @admin.action(description="Deactivate selected role assignments")
    def deactivate_selected(self, request, queryset):
        self.deactivate_queryset(request, queryset)

    @admin.action(description="Reactivate selected role assignments")
    def reactivate_selected(self, request, queryset):
        self.reactivate_queryset(request, queryset)
