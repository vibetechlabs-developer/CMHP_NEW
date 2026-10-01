from rest_framework import exceptions
from rest_framework.authentication import CSRFCheck


def enforce_csrf(request):
    """Explicitly run Django's standard CSRF check against `request`.

    DRF's APIView.as_view() marks the whole view csrf_exempt at the
    Django-middleware level, and DRF only re-enables CSRF checking for
    views that authenticate via SessionAuthentication. None of the views
    that call this (login, refresh, logout) use SessionAuthentication -
    login is anonymous, refresh/logout authenticate via the refresh
    cookie, not a Django session - so without this explicit call, none of
    them would be CSRF-protected at all. This reuses the same
    `CSRFCheck` (a thin wrapper around Django's own CsrfViewMiddleware)
    that DRF's SessionAuthentication.enforce_csrf() uses internally, so
    it validates the standard django-issued `csrftoken` cookie against
    the standard `X-CSRFToken` header (or `csrfmiddlewaretoken` form
    field), nothing custom.
    """

    def dummy_get_response(request):
        return None

    check = CSRFCheck(dummy_get_response)
    # Populates request.META["CSRF_COOKIE"], which process_view() reads.
    check.process_request(request)
    reason = check.process_view(request, None, (), {})
    if reason:
        raise exceptions.PermissionDenied(f"CSRF Failed: {reason}")
