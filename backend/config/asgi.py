"""ASGI config for the CMHP backend project.

Defaults to production settings because ASGI is the deployment entrypoint;
local development uses manage.py, which defaults to local settings.
"""
import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.production")

application = get_asgi_application()
