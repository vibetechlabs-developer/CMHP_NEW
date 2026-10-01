from django.contrib import admin

from apps.companies.admin import ReadOnlySuperuserAdminMixin
from apps.formula_imports.models import FormulaImportBatch, FormulaImportGroup, FormulaImportLine


class FormulaImportLineInline(admin.TabularInline):
    model = FormulaImportLine
    extra = 0
    can_delete = False
    fields = ("line_number", "file_row_number", "material_code", "material_quantity", "is_valid", "errors")
    readonly_fields = fields


class FormulaImportGroupInline(admin.StackedInline):
    model = FormulaImportGroup
    extra = 0
    can_delete = False
    fields = ("group_number", "formula_code", "formula_name", "product_code", "output_uom_code", "is_valid", "errors")
    readonly_fields = fields
    show_change_link = True


@admin.register(FormulaImportBatch)
class FormulaImportBatchAdmin(ReadOnlySuperuserAdminMixin, admin.ModelAdmin):
    """Read-only - every batch, group and line is created only through
    `apps.formula_imports.services` (Task 14B). No add/edit/delete path
    exists here or anywhere else.
    """

    list_display = (
        "id", "company", "created_by", "status", "source_filename",
        "total_groups", "valid_groups", "invalid_groups", "eligible_for_commit", "previewed_at",
    )
    list_filter = ("status", "company")
    search_fields = ("source_filename", "source_checksum")
    readonly_fields = [f.name for f in FormulaImportBatch._meta.fields]
    inlines = [FormulaImportGroupInline]


@admin.register(FormulaImportGroup)
class FormulaImportGroupAdmin(ReadOnlySuperuserAdminMixin, admin.ModelAdmin):
    list_display = ("id", "batch", "group_number", "formula_code", "formula_name", "product_code", "is_valid")
    list_filter = ("is_valid",)
    search_fields = ("formula_code", "formula_name", "product_code")
    readonly_fields = [f.name for f in FormulaImportGroup._meta.fields]
    inlines = [FormulaImportLineInline]
