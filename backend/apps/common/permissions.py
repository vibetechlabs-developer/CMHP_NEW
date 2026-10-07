from rest_framework.permissions import BasePermission


class IsActiveSuperuser(BasePermission):
    """Deny by default: only an authenticated, active superuser passes.

    This is a Django-admin-style authorization check only - it says
    nothing about, and never implicitly grants, company business access.
    apps.companies.services.active_companies_for_user() and
    apps.permissions.services.effective_permission_codes() are unaffected
    by is_superuser and must stay that way; a superuser who administers
    users through this permission class still has zero company
    memberships/roles unless one is explicitly assigned, same as anyone
    else.
    """

    message = "You must be an active superuser to perform this action."

    def has_permission(self, request, view):
        return is_active_superuser(request.user)


def is_active_superuser(user):
    """The single rule behind IsActiveSuperuser. The current-user response's
    `capabilities.can_manage_material_catalog` uses this same function, so the UI
    flag can never disagree with the server's write check.
    """
    return bool(user and user.is_authenticated and user.is_active and user.is_superuser)
