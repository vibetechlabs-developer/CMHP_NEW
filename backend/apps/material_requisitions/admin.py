from django.contrib import admin

from apps.companies.admin import ReadOnlySuperuserAdminMixin
from apps.material_requisitions.models import (
    MaterialRequisition,
    MaterialRequisitionLine,
    MaterialRequisitionRound,
    MaterialRequisitionRoundLine,
)


class MaterialRequisitionLineInline(admin.TabularInline):
    model = MaterialRequisitionLine
    extra = 0
    can_delete = False
    readonly_fields = (
        "line_number",
        "material",
        "unit",
        "material_code_snapshot",
        "material_kind_snapshot",
        "base_line_quantity_snapshot",
        "requested_quantity",
        "quantity_decision_issue",
        "quantity_remark",
        "requested_quantity_contributor",
        "requested_quantity_contributed_at",
    )


class MaterialRequisitionRoundInline(admin.TabularInline):
    """Task 15C: read-only - every round is permanent history, never
    editable through this surface (or any other - see `apps.material_
    requisitions.services`).
    """

    model = MaterialRequisitionRound
    extra = 0
    can_delete = False
    fields = (
        "round_number",
        "submitted_by",
        "submitted_at",
        "outcome",
        "decided_by",
        "decided_at",
        "rejection_reason",
        "contributor_provenance_complete",
    )
    readonly_fields = fields


@admin.register(MaterialRequisition)
class MaterialRequisitionAdmin(ReadOnlySuperuserAdminMixin, admin.ModelAdmin):
    """Read-only: create/update/approve/reject/revise all go through the
    audited /api/v1/stores/<store_id>/material-requisitions/ API only -
    Task 13A/15A/15C.
    """

    list_display = ("id", "batch_plan", "store", "company", "status", "current_round", "version", "created_at", "submitted_at")
    list_filter = ("store", "company", "status")
    search_fields = ("product_code_snapshot", "formula_code_snapshot", "source_order_reference_snapshot")
    readonly_fields = ("created_at", "updated_at", "version", "current_round", "submitted_by", "submitted_at")
    inlines = [MaterialRequisitionLineInline, MaterialRequisitionRoundInline]


@admin.register(MaterialRequisitionRound)
class MaterialRequisitionRoundAdmin(ReadOnlySuperuserAdminMixin, admin.ModelAdmin):
    """Read-only: permanent per-round history - see `apps.material_
    requisitions.services`. Also reachable inline from its own
    requisition (`MaterialRequisitionRoundInline`); registered here too
    so a round can be found/filtered/searched directly.
    """

    list_display = ("id", "requisition", "round_number", "outcome", "submitted_by", "submitted_at", "decided_by", "decided_at")
    list_filter = ("outcome", "contributor_provenance_complete")
    search_fields = ("requisition__product_code_snapshot", "requisition__formula_code_snapshot")
    readonly_fields = [f.name for f in MaterialRequisitionRound._meta.fields]


@admin.register(MaterialRequisitionRoundLine)
class MaterialRequisitionRoundLineAdmin(ReadOnlySuperuserAdminMixin, admin.ModelAdmin):
    """Read-only: permanent per-round-line history."""

    list_display = ("id", "round", "line_number", "material_code_snapshot", "requested_quantity", "requested_quantity_contributor")
    search_fields = ("material_code_snapshot",)
    readonly_fields = [f.name for f in MaterialRequisitionRoundLine._meta.fields]
