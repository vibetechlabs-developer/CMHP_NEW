from rest_framework.permissions import BasePermission

from apps.permissions.services import user_has_permission_in_any_store

CATALOG_VIEW_PERMISSION = "shared_catalog.view"


class CanReadSharedCatalog(BasePermission):
    """Deny by default: an active, authenticated user passes only if they
    are an active superuser (an explicit, documented administrative
    exception - see apps.common.permissions.IsActiveSuperuser's own
    "Django-admin-style authorization" reasoning, applied here to reads
    only) or hold `shared_catalog.view` in at least one store they have
    active membership in. This is a read-only exception: it is used for
    catalog GET endpoints alone and must never be reused for a write
    permission_classes, and being a superuser here grants nothing beyond
    reading the catalog - no store operational access, no business data
    access, exactly like every other superuser exception in this project.
    Company membership/role is never consulted - only store access can
    ever satisfy this check for a non-superuser.
    """

    message = f"The '{CATALOG_VIEW_PERMISSION}' permission (in at least one active store) is required."

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated and user.is_active):
            return False
        if user.is_superuser:
            return True
        return user_has_permission_in_any_store(user, CATALOG_VIEW_PERMISSION)
