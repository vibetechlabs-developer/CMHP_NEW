from django.contrib import admin

from apps.companies.admin import ReadOnlySuperuserAdminMixin
from apps.formulas.models import (
    Formula,
    FormulaApprovalPolicy,
    FormulaLine,
    FormulaRevision,
    FormulaRevisionContributor,
)


@admin.register(Formula)
class FormulaAdmin(ReadOnlySuperuserAdminMixin, admin.ModelAdmin):
    """Read-only: formulas are edited through the audited API only."""

    list_display = ("code", "company", "product", "name", "latest_revision_number", "version")
    list_filter = ("company",)
    search_fields = ("code", "name")
    readonly_fields = ("created_at", "updated_at", "version", "latest_revision_number")


@admin.register(FormulaRevision)
class FormulaRevisionAdmin(ReadOnlySuperuserAdminMixin, admin.ModelAdmin):
    list_display = ("formula", "revision_number", "status", "base_output_quantity", "output_uom", "version")
    search_fields = ("formula__code",)


@admin.register(FormulaLine)
class FormulaLineAdmin(ReadOnlySuperuserAdminMixin, admin.ModelAdmin):
    list_display = ("revision", "line_number", "material_code_snapshot", "material_kind_snapshot", "quantity")
    search_fields = ("revision__formula__code", "material_code_snapshot")


@admin.register(FormulaRevisionContributor)
class FormulaRevisionContributorAdmin(ReadOnlySuperuserAdminMixin, admin.ModelAdmin):
    """Read-only: contributors are recorded only by the audited services."""

    list_display = ("revision", "user")


@admin.register(FormulaApprovalPolicy)
class FormulaApprovalPolicyAdmin(ReadOnlySuperuserAdminMixin, admin.ModelAdmin):
    """Read-only: configured only through the audited superuser API."""

    list_display = ("company", "allow_self_approval", "version", "updated_at")
