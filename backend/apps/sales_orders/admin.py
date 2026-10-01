from django.contrib import admin

from apps.companies.admin import ReadOnlySuperuserAdminMixin
from apps.sales_orders.models import SalesOrder, SalesOrderConfirmationPolicy, SalesOrderLine


@admin.register(SalesOrder)
class SalesOrderAdmin(ReadOnlySuperuserAdminMixin, admin.ModelAdmin):
    """Read-only: sales orders are created/edited through the audited
    /api/v1/companies/<company_id>/sales-orders/ API only.
    """

    list_display = ("reference", "company", "customer", "order_date", "currency", "status", "confirmed_by", "confirmed_at", "created_at")
    list_filter = ("status", "company", "currency")
    search_fields = ("reference", "customer__name", "customer__code", "customer_order_reference")
    readonly_fields = ("created_at", "updated_at", "version")
    ordering = ("-created_at",)


@admin.register(SalesOrderLine)
class SalesOrderLineAdmin(ReadOnlySuperuserAdminMixin, admin.ModelAdmin):
    list_display = ("sales_order", "line_number", "product_code_snapshot", "quantity", "unit_price", "line_amount")
    search_fields = ("sales_order__reference", "product_code_snapshot")
    ordering = ("sales_order", "line_number")


@admin.register(SalesOrderConfirmationPolicy)
class SalesOrderConfirmationPolicyAdmin(ReadOnlySuperuserAdminMixin, admin.ModelAdmin):
    """Read-only: the policy is written only through the audited
    /api/v1/companies/<id>/sales-order-confirmation-policy/ API.
    """

    list_display = (
        "company",
        "allow_self_confirmation",
        "allow_zero_price_lines",
        "allow_past_requested_delivery_dates",
        "version",
        "updated_by",
        "updated_at",
    )
    list_filter = ("company",)
