from django.contrib import admin

from apps.companies.admin import ReadOnlySuperuserAdminMixin
from apps.product_imports.models import ProductImportBatch, ProductImportRow


class ProductImportRowInline(admin.TabularInline):
    model = ProductImportRow
    extra = 0
    can_delete = False
    fields = ("row_number", "code", "name", "sales_uom_code", "is_valid", "errors")
    readonly_fields = fields


@admin.register(ProductImportBatch)
class ProductImportBatchAdmin(ReadOnlySuperuserAdminMixin, admin.ModelAdmin):
    """Read-only - every batch and its rows are created only through
    `apps.product_imports.services` (Task 14A). No add/edit/delete path
    exists here or anywhere else.
    """

    list_display = (
        "id", "company", "created_by", "status", "source_filename",
        "total_rows", "valid_rows", "invalid_rows", "eligible_for_commit", "previewed_at",
    )
    list_filter = ("status", "company")
    search_fields = ("source_filename", "source_checksum")
    readonly_fields = [f.name for f in ProductImportBatch._meta.fields]
    inlines = [ProductImportRowInline]
