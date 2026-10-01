from django.contrib import admin

from apps.audit.models import AuditLog
from apps.companies.admin import SuperuserOnlyAdminMixin


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    """Read-only for active superusers - an audit trail that could be
    edited or deleted from its own admin page would not be much of an
    audit trail. Unlike SuperuserOnlyAdminMixin (which still allows
    add/change for its models), has_add_permission and
    has_change_permission are unconditionally False here, not just
    superuser-gated.
    """

    list_display = ("created_at", "actor", "action", "target_type", "target_id", "company")
    list_filter = ("action", "target_type", "company")
    search_fields = ("actor__username", "action", "target_type")
    readonly_fields = [f.name for f in AuditLog._meta.fields]
    ordering = ("-created_at",)

    def has_module_permission(self, request):
        return SuperuserOnlyAdminMixin._is_active_superuser(request)

    def has_view_permission(self, request, obj=None):
        return SuperuserOnlyAdminMixin._is_active_superuser(request)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
