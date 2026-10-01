from django.contrib import admin

from apps.catalog.models import Material, MaterialCategory, UnitOfMeasure
from apps.companies.admin import ReadOnlySuperuserAdminMixin


@admin.register(UnitOfMeasure)
class UnitOfMeasureAdmin(ReadOnlySuperuserAdminMixin, admin.ModelAdmin):
    """Read-only: create/update/activate/deactivate go through the
    audited /api/v1/units/ API only.
    """

    list_display = ("code", "name", "dimension", "is_active", "created_at")
    list_filter = ("dimension", "is_active")
    search_fields = ("code", "name")
    readonly_fields = ("created_at", "updated_at")
    ordering = ("code",)


@admin.register(MaterialCategory)
class MaterialCategoryAdmin(ReadOnlySuperuserAdminMixin, admin.ModelAdmin):
    """Read-only: mutations go through the audited
    /api/v1/material-categories/ API only.
    """

    list_display = ("code", "name", "is_active", "created_at")
    list_filter = ("is_active",)
    search_fields = ("code", "name")
    readonly_fields = ("created_at", "updated_at")
    ordering = ("code",)


@admin.register(Material)
class MaterialAdmin(ReadOnlySuperuserAdminMixin, admin.ModelAdmin):
    """Read-only: mutations go through the audited /api/v1/materials/ API
    only.
    """

    list_display = ("code", "name", "kind", "category", "base_unit", "is_active", "created_at")
    list_filter = ("kind", "category", "base_unit", "is_active")
    search_fields = ("code", "name")
    readonly_fields = ("created_at", "updated_at")
    ordering = ("code",)
