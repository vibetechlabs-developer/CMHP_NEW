from django.contrib import admin

from apps.companies.admin import ReadOnlySuperuserAdminMixin
from apps.store_preparation.models import StorePreparation


@admin.register(StorePreparation)
class StorePreparationAdmin(ReadOnlySuperuserAdminMixin, admin.ModelAdmin):
    """Read-only: create/update all go through the audited
    /api/v1/stores/<store_id>/preparations/ API only - Task 12C.
    """

    list_display = ("batch_plan", "store", "packing_type", "insert_required", "version", "created_at")
    list_filter = ("store",)
    search_fields = ("packing_type", "batch_plan__product_code_snapshot", "batch_plan__source_order_reference_snapshot")
    readonly_fields = ("created_at", "updated_at", "version")
