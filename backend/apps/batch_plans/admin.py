from django.contrib import admin

from apps.batch_plans.models import BatchNumberAllocation, BatchNumberSequenceCounter, BatchPlan
from apps.companies.admin import ReadOnlySuperuserAdminMixin


@admin.register(BatchPlan)
class BatchPlanAdmin(ReadOnlySuperuserAdminMixin, admin.ModelAdmin):
    """Read-only: Batch plans are created and modified through the audited API only."""

    list_display = (
        "id",
        "company",
        "product_code_snapshot",
        "target_output_quantity",
        "planned_manufacturing_date",
        "status",
        "version",
        "created_at",
    )
    list_filter = ("company", "status")
    search_fields = (
        "source_order_reference_snapshot",
        "product_code_snapshot",
        "product_name_snapshot",
        "formula_code_snapshot",
        "notes",
    )
    readonly_fields = (
        "created_at",
        "updated_at",
        "version",
        "source_snapshots",
        "source_order_reference_snapshot",
        "source_line_number_snapshot",
        "product_id_snapshot",
        "product_code_snapshot",
        "product_name_snapshot",
        "output_uom_id_snapshot",
        "output_uom_code_snapshot",
        "output_uom_name_snapshot",
        "pack_uom_id_snapshot",
        "pack_uom_code_snapshot",
        "pack_uom_name_snapshot",
        "formula_id_snapshot",
        "formula_code_snapshot",
        "formula_name_snapshot",
        "formula_revision_number_snapshot",
        "formula_base_output_quantity_snapshot",
    )


@admin.register(BatchNumberAllocation)
class BatchNumberAllocationAdmin(ReadOnlySuperuserAdminMixin, admin.ModelAdmin):
    """Read-only: allocated only through the audited
    /api/v1/companies/<company_id>/batch-plans/<id>/allocate-number/ API -
    Task 12D. Fully immutable once created; no admin edit/delete path
    exists (the model itself also refuses both).
    """

    list_display = ("number", "operating_company", "batch_plan", "numbered_by", "numbered_at")
    list_filter = ("operating_company",)
    search_fields = ("number", "client_code_snapshot", "batch_plan__product_code_snapshot")
    readonly_fields = (
        "batch_plan", "operating_company", "number", "client_code_snapshot", "allocation_year", "sequence_value",
        "numbered_by", "numbered_at", "allocation_timezone", "created_at",
    )


@admin.register(BatchNumberSequenceCounter)
class BatchNumberSequenceCounterAdmin(ReadOnlySuperuserAdminMixin, admin.ModelAdmin):
    """Read-only: mutated only inside the locked allocation transaction -
    Task 12D. Visible here purely for administrative diagnosis of the
    numbering namespace, never edited through this admin.
    """

    list_display = ("operating_company", "client_code_snapshot", "allocation_year", "last_sequence", "updated_at")
    list_filter = ("operating_company", "allocation_year")
    search_fields = ("client_code_snapshot",)
    readonly_fields = ("operating_company", "client_code_snapshot", "allocation_year", "last_sequence", "updated_at")
