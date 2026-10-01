from django.contrib import admin

from apps.companies.admin import ReadOnlySuperuserAdminMixin
from apps.receiving.models import GoodsReceipt, GoodsReceiptLine


class GoodsReceiptLineInline(admin.TabularInline):
    model = GoodsReceiptLine
    extra = 0
    can_delete = False
    fields = ("line_number", "material", "received_quantity", "unit", "lot_reference")
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
        "arrived_at",
        "created_by",
        "created_at",
    )
    list_filter = ("status", "store", "company")
    search_fields = ("reference", "notes", "delivery_note_reference", "source_purchase_order__reference")
    readonly_fields = ("created_at", "updated_at")
    inlines = [GoodsReceiptLineInline]
    ordering = ("-created_at",)
