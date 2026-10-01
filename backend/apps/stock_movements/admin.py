from django.contrib import admin

from apps.companies.admin import ReadOnlySuperuserAdminMixin
from apps.stock_movements.models import StockMovement


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
