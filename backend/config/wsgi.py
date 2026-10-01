"""WSGI config for the CMHP backend project.

Defaults to production settings because WSGI is the deployment entrypoint;
local development uses manage.py, which defaults to local settings.
"""
import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.production")

application = get_wsgi_application()
