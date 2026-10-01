from django.contrib import admin

from apps.companies.admin import ReadOnlySuperuserAdminMixin
from apps.purchasing.models import (
    PurchaseOrder,
    PurchaseOrderIssueLineSnapshot,
    PurchaseOrderIssueSnapshot,
    PurchaseOrderLine,
    PurchaseRequest,
    PurchaseRequestApproval,
    PurchaseRequestApprovalRound,
    PurchaseRequestApprovalRoundLine,
    PurchaseRequestLine,
)


class PurchaseRequestLineInline(admin.TabularInline):
    model = PurchaseRequestLine
    extra = 0
    can_delete = False
    fields = ("line_number", "material", "quantity", "unit", "notes")
    readonly_fields = fields


@admin.register(PurchaseRequest)
class PurchaseRequestAdmin(ReadOnlySuperuserAdminMixin, admin.ModelAdmin):
    """Read-only: create/update/submit/cancel/approve/reject/revise all go
    through the audited /api/v1/companies/<company_id>/purchase-requests/
    API only.
    """

    list_display = (
        "reference",
        "company",
        "status",
        "current_round",
        "current_step",
        "required_by",
        "created_by",
        "created_at",
    )
    list_filter = ("status", "company")
    search_fields = ("reference", "notes")
    readonly_fields = ("created_at", "updated_at")
    inlines = [PurchaseRequestLineInline]
    ordering = ("-created_at",)


class PurchaseRequestApprovalRoundLineInline(admin.TabularInline):
    model = PurchaseRequestApprovalRoundLine
    extra = 0
    can_delete = False
    fields = (
        "line_number",
        "material",
        "quantity",
        "unit",
        "notes",
        "material_code_snapshot",
        "material_name_snapshot",
        "unit_code_snapshot",
        "unit_name_snapshot",
    )
    readonly_fields = fields


class PurchaseRequestApprovalInline(admin.TabularInline):
    model = PurchaseRequestApproval
    extra = 0
    can_delete = False
    fields = ("step", "decision", "actor", "decided_at", "reason")
    readonly_fields = fields


@admin.register(PurchaseRequestApprovalRound)
class PurchaseRequestApprovalRoundAdmin(ReadOnlySuperuserAdminMixin, admin.ModelAdmin):
    """Read-only history: every round is created only by
    apps.purchasing.services.submit_purchase_request and closed only by
    approve_purchase_request/reject_purchase_request/cancel_purchase_
    request - no admin write path exists or should exist for this model.
    """

    list_display = ("purchase_request", "round_number", "outcome", "submitted_by", "submitted_at", "closed_at")
    list_filter = ("outcome",)
    search_fields = ("purchase_request__reference",)
    readonly_fields = [field.name for field in PurchaseRequestApprovalRound._meta.fields]
    inlines = [PurchaseRequestApprovalRoundLineInline, PurchaseRequestApprovalInline]
    ordering = ("-submitted_at",)


@admin.register(PurchaseRequestApproval)
class PurchaseRequestApprovalAdmin(ReadOnlySuperuserAdminMixin, admin.ModelAdmin):
    """Read-only append-only decision log - see PurchaseRequestApproval's
    model docstring.
    """

    list_display = ("round", "step", "decision", "actor", "decided_at")
    list_filter = ("decision",)
    search_fields = ("round__purchase_request__reference",)
    readonly_fields = [field.name for field in PurchaseRequestApproval._meta.fields]
    ordering = ("-decided_at",)


class PurchaseOrderLineInline(admin.TabularInline):
    model = PurchaseOrderLine
    extra = 0
    can_delete = False
    fields = ("line_number", "material", "quantity", "unit", "unit_price", "line_amount")
    readonly_fields = fields


@admin.register(PurchaseOrder)
class PurchaseOrderAdmin(ReadOnlySuperuserAdminMixin, admin.ModelAdmin):
    """Read-only: create/update/cancel/issue all go through the audited
    /api/v1/companies/<company_id>/purchase-orders/ API only - Task
    08C-1/08C-2 (no send/receipt/QC/stock/invoice action exists anywhere
    in this codebase; `ISSUED` is internal finalization only).
    """

    list_display = (
        "reference",
        "company",
        "status",
        "source_purchase_request",
        "supplier",
        "currency_code",
        "created_by",
        "created_at",
        "issued_at",
    )
    list_filter = ("status", "company")
    search_fields = ("reference", "notes", "source_purchase_request__reference")
    readonly_fields = ("created_at", "updated_at")
    inlines = [PurchaseOrderLineInline]
    ordering = ("-created_at",)


class PurchaseOrderIssueLineSnapshotInline(admin.TabularInline):
    model = PurchaseOrderIssueLineSnapshot
    extra = 0
    can_delete = False
    fields = (
        "line_number",
        "material_code_snapshot",
        "material_name_snapshot",
        "unit_code_snapshot",
        "unit_name_snapshot",
        "quantity_snapshot",
        "unit_price_snapshot",
        "line_amount_snapshot",
    )
    readonly_fields = fields


@admin.register(PurchaseOrderIssueSnapshot)
class PurchaseOrderIssueSnapshotAdmin(ReadOnlySuperuserAdminMixin, admin.ModelAdmin):
    """Read-only permanent issue-time record - created only by
    apps.purchasing.services.issue_purchase_order, never updated
    afterwards. See that model's docstring for why company/supplier
    identity is copied here rather than read live off current masters.
    """

    list_display = ("purchase_order", "issued_by", "issued_at", "supplier_legal_name_snapshot", "subtotal_snapshot")
    search_fields = ("purchase_order__reference", "supplier_legal_name_snapshot", "supplier_code_snapshot")
    readonly_fields = [field.name for field in PurchaseOrderIssueSnapshot._meta.fields]
    inlines = [PurchaseOrderIssueLineSnapshotInline]
    ordering = ("-issued_at",)
