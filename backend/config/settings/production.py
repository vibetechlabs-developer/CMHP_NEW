"""Production settings.

Used explicitly by wsgi.py/asgi.py. DEBUG is hardcoded off (never taken from
the environment) so a missing/misconfigured variable can never re-enable it.
ALLOWED_HOSTS has no hardcoded fallback - deployment must set it explicitly.
"""
from config.settings.base import *  # noqa: F401,F403
from config.settings.base import BASE_DIR, env

DEBUG = False

ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS")

# CSRF trusted origins default to empty - a deployment that serves a
# browser frontend from another origin must set DJANGO_CSRF_TRUSTED_ORIGINS
# explicitly rather than defaulting to a wildcard/permissive value.
# CORS_ALLOWED_ORIGINS (DJANGO_CORS_ALLOWED_ORIGINS) is read in base.py and
# applies here unchanged.
CSRF_TRUSTED_ORIGINS = env.list("DJANGO_CSRF_TRUSTED_ORIGINS", default=[])

STATIC_ROOT = BASE_DIR / "staticfiles"

SECURE_SSL_REDIRECT = env.bool("DJANGO_SECURE_SSL_REDIRECT", default=True)
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = env.int("DJANGO_SECURE_HSTS_SECONDS", default=0)

# The refresh-token cookie must never travel over plain HTTP in production.
AUTH_REFRESH_COOKIE_SECURE = True
