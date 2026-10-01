from django.contrib import admin

from apps.companies.admin import ReadOnlySuperuserAdminMixin
from apps.material_imports.models import MaterialImportBatch, MaterialImportRow


class MaterialImportRowInline(admin.TabularInline):
    model = MaterialImportRow
    extra = 0
    can_delete = False
    fields = ("row_number", "code", "name", "material_type", "base_unit_code", "is_valid", "errors")
    readonly_fields = fields


@admin.register(MaterialImportBatch)
class MaterialImportBatchAdmin(ReadOnlySuperuserAdminMixin, admin.ModelAdmin):
    """Read-only - every batch and its rows are created only through
    `apps.material_imports.services` (Task 14C). No add/edit/delete path
    exists here or anywhere else.
    """

    list_display = (
        "id", "created_by", "status", "source_filename",
        "total_rows", "valid_rows", "invalid_rows", "eligible_for_commit", "previewed_at",
    )
    list_filter = ("status",)
    search_fields = ("source_filename", "source_checksum")
    readonly_fields = [f.name for f in MaterialImportBatch._meta.fields]
    inlines = [MaterialImportRowInline]
