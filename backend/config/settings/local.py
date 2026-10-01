"""Local development settings.

Used by manage.py by default. Loads backend/.env (see .env.example).
"""
from config.settings.base import *  # noqa: F401,F403
from config.settings.base import env

DEBUG = env.bool("DJANGO_DEBUG", default=True)

ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])

# Cross-origin browser access (e.g. a frontend on another LAN machine) is
# opt-in per developer via .env - empty by default so a plain local run
# (frontend and backend on the same machine) needs no change at all.
CSRF_TRUSTED_ORIGINS = env.list("DJANGO_CSRF_TRUSTED_ORIGINS", default=[])
