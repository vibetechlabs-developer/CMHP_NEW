from django.contrib import admin

from apps.companies.admin import ReadOnlySuperuserAdminMixin
from apps.stores.models import SharedStore, StorageLocation, StoreMembership


@admin.register(SharedStore)
class SharedStoreAdmin(ReadOnlySuperuserAdminMixin, admin.ModelAdmin):
    """Read-only: create/update/activate/deactivate go through the
    audited /api/v1/stores/ API only (see docs/backend-decisions.md,
    Task 07A) - viewing here is for visibility, not administration.
    """

    list_display = ("code", "name", "is_active", "created_at")
    list_filter = ("is_active",)
    search_fields = ("code", "name")
    readonly_fields = ("created_at", "updated_at")
    ordering = ("code",)


@admin.register(StoreMembership)
class StoreMembershipAdmin(ReadOnlySuperuserAdminMixin, admin.ModelAdmin):
    list_display = ("user", "store", "is_active", "created_at")
    list_filter = ("is_active", "store")
    search_fields = ("user__username", "user__email", "store__code", "store__name")
    readonly_fields = ("created_at", "updated_at")


@admin.register(StorageLocation)
class StorageLocationAdmin(ReadOnlySuperuserAdminMixin, admin.ModelAdmin):
    """Read-only: mutations go through the audited
    /api/v1/stores/<store_id>/locations/ API only.
    """

    list_display = ("code", "name", "store", "is_active", "created_at")
    list_filter = ("is_active", "store")
    search_fields = ("code", "name", "store__code", "store__name")
    readonly_fields = ("created_at", "updated_at")
