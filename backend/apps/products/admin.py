from django.contrib import admin

from apps.companies.admin import ReadOnlySuperuserAdminMixin
from apps.products.models import Product


@admin.register(Product)
class ProductAdmin(ReadOnlySuperuserAdminMixin, admin.ModelAdmin):
    """Read-only: create/update/activate/deactivate go through the
    audited /api/v1/companies/<company_id>/products/ API only.
    """

    list_display = ("code", "company", "name", "product_type", "pack_size", "sales_uom", "is_active", "created_at")
    list_filter = ("is_active", "company")
    search_fields = ("code", "name", "product_type", "pack_size")
    readonly_fields = ("created_at", "updated_at", "version")
    ordering = ("company__code", "code")
