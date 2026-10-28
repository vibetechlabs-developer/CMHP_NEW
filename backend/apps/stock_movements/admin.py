from django.contrib import admin

from apps.companies.admin import ReadOnlySuperuserAdminMixin
from apps.stock_movements.models import MaterialIssue, MaterialIssueMovement, StockMovement


@admin.register(StockMovement)
class StockMovementAdmin(ReadOnlySuperuserAdminMixin, admin.ModelAdmin):
    """Read-only: every StockMovement is created only as a side effect of
    posting a goods receipt (apps.receiving.services.post_goods_receipt)
    - Task 13C. No add/edit/delete path exists here or anywhere else.
    """

    list_display = (
        "id", "movement_type", "store", "source_company", "material_code_snapshot",
        "quantity", "unit_code_snapshot", "posted_at",
    )
    list_filter = ("store", "source_company", "movement_type")
    search_fields = ("material_code_snapshot", "lot_reference", "source_goods_receipt__reference")
    readonly_fields = [f.name for f in StockMovement._meta.fields]


@admin.register(MaterialIssue)
class MaterialIssueAdmin(ReadOnlySuperuserAdminMixin, admin.ModelAdmin):
    """Read-only: create/update/post/cancel all go through the audited
    /api/v1/stores/<store_id>/material-issues/ API only - mirrors
    apps.receiving.admin.GoodsReceiptAdmin exactly.
    """

    list_display = (
        "reference", "store", "source_company", "status", "material_code_snapshot",
        "issued_quantity", "unit_code_snapshot", "issued_at", "created_by", "created_at",
    )
    list_filter = ("status", "store", "source_company")
    search_fields = ("reference", "material_code_snapshot", "batch_reference", "product_reference")
    readonly_fields = ("created_at", "updated_at")
    ordering = ("-created_at",)


@admin.register(MaterialIssueMovement)
class MaterialIssueMovementAdmin(ReadOnlySuperuserAdminMixin, admin.ModelAdmin):
    """Read-only: every MaterialIssueMovement is created only as a side
    effect of posting a MaterialIssue (apps.stock_movements.services.
    post_material_issue). No add/edit/delete path exists anywhere else.
    """

    list_display = (
        "id", "store", "source_company", "material_code_snapshot", "quantity",
        "unit_code_snapshot", "batch_reference", "posted_at",
    )
    list_filter = ("store", "source_company")
    search_fields = ("material_code_snapshot", "batch_reference", "product_reference", "source_material_issue__reference")
    readonly_fields = [f.name for f in MaterialIssueMovement._meta.fields]
