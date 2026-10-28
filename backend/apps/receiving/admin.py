from django.contrib import admin

from apps.companies.admin import ReadOnlySuperuserAdminMixin
from apps.receiving.models import ContainerType, GoodsReceipt, GoodsReceiptLine


@admin.register(ContainerType)
class ContainerTypeAdmin(ReadOnlySuperuserAdminMixin, admin.ModelAdmin):
    """Read-only: create/update/activate/deactivate go through the
    audited /api/v1/container-types/ API only - mirrors
    apps.catalog.admin's UnitOfMeasureAdmin exactly.
    """

    list_display = ("code", "name", "is_active", "created_at")
    list_filter = ("is_active",)
    search_fields = ("code", "name")
    readonly_fields = ("created_at", "updated_at")
    ordering = ("code",)


class GoodsReceiptLineInline(admin.TabularInline):
    model = GoodsReceiptLine
    extra = 0
    can_delete = False
    fields = (
        "line_number", "source_po_line", "material", "received_quantity", "unit", "unit_price", "currency_code",
        "lot_reference", "container_type", "container_quantity",
    )
    readonly_fields = fields


@admin.register(GoodsReceipt)
class GoodsReceiptAdmin(ReadOnlySuperuserAdminMixin, admin.ModelAdmin):
    """Read-only: create/update/post/cancel all go through the audited
    /api/v1/stores/<store_id>/goods-receipts/ API only - Task 09A. No
    stock/QC/accounting write path exists anywhere in this codebase for
    this model or its lines.
    """

    list_display = (
        "reference",
        "store",
        "company",
        "status",
        "source_purchase_order",
        "supplier_name",
        "arrived_at",
        "created_by",
        "created_at",
    )
    list_filter = ("status", "store", "company")
    search_fields = ("reference", "notes", "delivery_note_reference", "source_purchase_order__reference")
    readonly_fields = ("created_at", "updated_at")
    inlines = [GoodsReceiptLineInline]
    ordering = ("-created_at",)
