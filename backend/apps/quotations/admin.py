from django.contrib import admin

from apps.companies.admin import ReadOnlySuperuserAdminMixin
from apps.quotations.models import Quotation, QuotationLine


@admin.register(Quotation)
class QuotationAdmin(ReadOnlySuperuserAdminMixin, admin.ModelAdmin):
    """Read-only: quotations are created/edited through the audited
    /api/v1/companies/<company_id>/quotations/ API only.
    """

    list_display = ("reference", "company", "customer", "quotation_date", "currency", "status", "created_at")
    list_filter = ("status", "company", "currency")
    search_fields = ("reference", "customer__name", "customer__code")
    readonly_fields = ("created_at", "updated_at", "version")
    ordering = ("-created_at",)


@admin.register(QuotationLine)
class QuotationLineAdmin(ReadOnlySuperuserAdminMixin, admin.ModelAdmin):
    list_display = ("quotation", "line_number", "product_code_snapshot", "quantity", "unit_price", "line_amount")
    search_fields = ("quotation__reference", "product_code_snapshot")
    ordering = ("quotation", "line_number")
