from django.contrib import admin

from apps.companies.admin import ReadOnlySuperuserAdminMixin
from apps.customers.models import Customer


@admin.register(Customer)
class CustomerAdmin(ReadOnlySuperuserAdminMixin, admin.ModelAdmin):
    """Read-only: create/update/activate/deactivate go through the
    audited /api/v1/companies/<company_id>/customers/ API only.
    """

    list_display = ("code", "company", "name", "is_active", "created_at")
    list_filter = ("is_active", "company")
    search_fields = ("code", "name", "contact_person", "email", "phone")
    readonly_fields = ("created_at", "updated_at", "version")
    ordering = ("company__code", "code")
