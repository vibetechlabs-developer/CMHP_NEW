from django.contrib import admin

from apps.companies.admin import ReadOnlySuperuserAdminMixin
from apps.quality.models import (
    IncomingInspection,
    InspectionObservation,
    MaterialSpecification,
    MaterialSpecificationVersion,
    SpecificationTest,
)


class InspectionObservationInline(admin.TabularInline):
    model = InspectionObservation
    extra = 0
    can_delete = False
    fields = ("line_number", "parameter_name", "method_reference", "result", "result_unit", "remarks")
    readonly_fields = fields


@admin.register(IncomingInspection)
class IncomingInspectionAdmin(ReadOnlySuperuserAdminMixin, admin.ModelAdmin):
    """Read-only: create/update/submit/cancel all go through the audited
    /api/v1/stores/<store_id>/incoming-inspections/ API only - Task
    09B-1, submission added Task 09B-3A. No disposition/release/stock
    write path exists anywhere in this codebase for this model or its
    observations.
    """

    list_display = (
        "reference",
        "store",
        "company",
        "status",
        "receipt_line",
        "material",
        "inspection_date",
        "created_by",
        "created_at",
        "submitted_at",
    )
    list_filter = ("status", "store", "company")
    search_fields = (
        "reference",
        "notes",
        "receipt_line__goods_receipt__reference",
        "material__code",
        "material__name",
    )
    readonly_fields = ("created_at", "updated_at", "submitted_at")
    inlines = [InspectionObservationInline]
    ordering = ("-created_at",)


class SpecificationTestInline(admin.TabularInline):
    model = SpecificationTest
    extra = 0
    can_delete = False
    fields = ("line_number", "parameter_name", "method_reference", "result_type", "unit_label", "acceptance_criteria")
    readonly_fields = fields


@admin.register(MaterialSpecificationVersion)
class MaterialSpecificationVersionAdmin(ReadOnlySuperuserAdminMixin, admin.ModelAdmin):
    """Read-only: create/update all go through the audited
    /api/v1/material-specifications/<id>/versions/ API only - Task
    09B-3B. No approval/publication write path exists anywhere in this
    codebase for this model.
    """

    list_display = ("specification", "revision_number", "status", "created_by", "created_at")
    list_filter = ("status",)
    search_fields = ("specification__code", "specification__name", "reference_document")
    readonly_fields = ("created_at", "updated_at")
    inlines = [SpecificationTestInline]
    ordering = ("specification", "revision_number")


class MaterialSpecificationVersionInline(admin.TabularInline):
    """Summary-only inline (no test rows here - see
    MaterialSpecificationVersionAdmin for the full drill-down) so a
    specification's version history is visible from its own admin page
    without duplicating the version admin's own detail.
    """

    model = MaterialSpecificationVersion
    extra = 0
    can_delete = False
    fields = ("revision_number", "status", "reference_document", "created_by", "created_at")
    readonly_fields = fields


@admin.register(MaterialSpecification)
class MaterialSpecificationAdmin(ReadOnlySuperuserAdminMixin, admin.ModelAdmin):
    """Read-only: create/update all go through the audited
    /api/v1/material-specifications/ API only - Task 09B-3B. Managing a
    specification draft here confers no QC/QA operational authority - see
    MaterialSpecification's own docstring.
    """

    list_display = ("code", "name", "material", "latest_revision_number", "created_by", "created_at")
    search_fields = ("code", "name", "material__code", "material__name")
    readonly_fields = ("created_at", "updated_at", "latest_revision_number")
    inlines = [MaterialSpecificationVersionInline]
    ordering = ("code",)
