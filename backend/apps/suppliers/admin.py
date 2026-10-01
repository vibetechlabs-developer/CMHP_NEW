from django.contrib import admin

from apps.companies.admin import ReadOnlySuperuserAdminMixin
from apps.suppliers.models import Supplier


@admin.register(Supplier)
class SupplierAdmin(ReadOnlySuperuserAdminMixin, admin.ModelAdmin):
    """Read-only: create/update/activate/deactivate go through the
    audited /api/v1/suppliers/ API only.
    """

    list_display = ("code", "legal_name", "display_name", "is_active", "created_at")
    list_filter = ("is_active", "country_code")
    search_fields = ("code", "legal_name", "display_name", "contact_name", "email")
    readonly_fields = ("created_at", "updated_at")
    ordering = ("code",)
