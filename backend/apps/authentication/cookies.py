from django.conf import settings


def _cookie_attrs():
    """Attributes shared by set and clear, so they can never drift apart -
    a browser only actually clears a cookie if the clearing Set-Cookie
    uses the exact same name/path/samesite as the one that set it.
    """
    return {
        "path": settings.AUTH_REFRESH_COOKIE_PATH,
        "domain": None,
        "secure": settings.AUTH_REFRESH_COOKIE_SECURE,
        "httponly": True,
        "samesite": settings.AUTH_REFRESH_COOKIE_SAMESITE,
    }


def set_refresh_cookie(response, refresh_token, max_age_seconds):
    response.set_cookie(
        settings.AUTH_REFRESH_COOKIE_NAME,
        refresh_token,
        max_age=max_age_seconds,
        **_cookie_attrs(),
    )


def clear_refresh_cookie(response):
    # Deliberately not Django's HttpResponse.delete_cookie(): it infers
    # `secure` from the cookie name/samesite instead of taking it as a
    # parameter, which would silently drop `Secure` here in production and
    # break the "same attributes when setting and clearing" requirement.
    response.set_cookie(
        settings.AUTH_REFRESH_COOKIE_NAME,
        "",
        max_age=0,
        expires="Thu, 01 Jan 1970 00:00:00 GMT",
        **_cookie_attrs(),
    )
