"""Settings shared by every environment.

Environment-specific files (local.py, production.py) import * from here and
override only what needs to differ. All secrets and connection details are
read from environment variables (see .env.example) - nothing sensitive is
hardcoded in any settings file.
"""
from datetime import timedelta
from pathlib import Path

import environ

# backend/config/settings/base.py -> backend/
BASE_DIR = Path(__file__).resolve().parent.parent.parent

env = environ.Env()

# Local development / on-prem deployment reads a .env file placed next to
# manage.py (backend/.env). If it is absent (e.g. the client's server
# injects real environment variables directly), this is a silent no-op.
environ.Env.read_env(BASE_DIR / ".env")

SECRET_KEY = env("DJANGO_SECRET_KEY")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "apps.audit",
    "apps.authentication",
    "apps.batch_plans",
    "apps.batch_register",
    "apps.catalog",
    "apps.common",
    "apps.companies",
    "apps.customers",
    "apps.formula_imports",
    "apps.formulas",
    "apps.stores",
    "apps.material_imports",
    "apps.material_requisitions",
    "apps.permissions",
    "apps.product_imports",
    "apps.products",
    "apps.purchasing",
    "apps.quality",
    "apps.quotations",
    "apps.receiving",
    "apps.sales_orders",
    "apps.stock_movements",
    "apps.store_preparation",
    "apps.suppliers",
    "apps.users",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

# --- Database ---------------------------------------------------------
# PostgreSQL only. No SQLite fallback - if these variables are missing or
# the server is unreachable, startup/migrations must fail loudly rather
# than silently switching databases.
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": env("DB_NAME"),
        "USER": env("DB_USER"),
        "PASSWORD": env("DB_PASSWORD"),
        "HOST": env("DB_HOST", default="localhost"),
        "PORT": env("DB_PORT", default="5432"),
    }
}

AUTH_USER_MODEL = "users.User"

# --- REST framework / JWT authentication --------------------------------
# Deny by default: every view requires an authenticated (real, database-
# backed - see JWTAuthentication, not JWTStatelessUserAuthentication) user
# unless a view explicitly opts out (the public auth endpoints below).
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_THROTTLE_RATES": {
        # Configurable: how many login attempts per IP before HTTP 429.
        "login": env("AUTH_LOGIN_THROTTLE_RATE", default="5/min"),
    },
}

# Access tokens are short-lived and returned in the JSON body; refresh
# tokens are long-lived and only ever travel in the HttpOnly cookie
# configured below (see apps.authentication) - never in a JSON response,
# never logged. No role/permission claim on either token is ever trusted;
# apps.companies/apps.permissions services always re-resolve membership and
# permissions from the database on every request.
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=env.int("JWT_ACCESS_TOKEN_MINUTES", default=5)),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=env.int("JWT_REFRESH_TOKEN_DAYS", default=1)),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
    "CHECK_USER_IS_ACTIVE": True,
}

# --- Refresh-token cookie -------------------------------------------------
# One place both apps.authentication.cookies (set/clear) and tests read
# from, so the attributes used to set the cookie and the attributes used to
# clear it can never drift apart.
AUTH_REFRESH_COOKIE_NAME = "refresh_token"
AUTH_REFRESH_COOKIE_PATH = "/api/v1/auth/"
AUTH_REFRESH_COOKIE_SAMESITE = "Lax"
# Local HTTP-compatible default; production.py hardcodes this True (a
# browser silently drops a Secure cookie over plain HTTP, which would break
# every local http://127.0.0.1 login if this defaulted to True here).
AUTH_REFRESH_COOKIE_SECURE = False

# --- Cross-origin requests (CORS) -----------------------------------------
# No frontend runs on the same origin as this API, so browser cross-origin
# calls must be explicitly allowed per environment - never wildcarded, since
# credentialed requests (the refresh-token cookie) forbid
# CORS_ALLOW_ALL_ORIGINS/"*" together with CORS_ALLOW_CREDENTIALS anyway.
# Empty by default: an environment that needs browser access from another
# origin must list it explicitly (see DJANGO_CORS_ALLOWED_ORIGINS in
# .env.example). CSRF_TRUSTED_ORIGINS is set independently per environment
# (local.py / production.py) since Django's CSRF check is separate from CORS.
CORS_ALLOWED_ORIGINS = env.list("DJANGO_CORS_ALLOWED_ORIGINS", default=[])
CORS_ALLOW_CREDENTIALS = True

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# --- Internationalisation / timezones ----------------------------------
# All datetimes are stored and processed in UTC (USE_TZ = True). The
# business display timezone for the client (India) is Asia/Kolkata - that
# conversion happens at the presentation layer (API serializers / frontend),
# not by changing TIME_ZONE, so stored data and inter-service timestamps
# stay unambiguous.
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

# The BUSINESS timezone used wherever a rule compares a stored calendar date
# with "today" (e.g. the sales-order past-requested-delivery-date policy
# check). Distinct from TIME_ZONE (storage is always UTC). ASSUMPTION FOR
# CLIENT REVIEW: the client's business timezone is India (Asia/Kolkata), as
# noted above; it is a setting so it can be corrected without a code change.
BUSINESS_TIME_ZONE = env("BUSINESS_TIME_ZONE", default="Asia/Kolkata")

STATIC_URL = "static/"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --- Logging -------------------------------------------------------------
# Console-only, no file handlers with rotation policy yet. Log format
# deliberately excludes request bodies/headers so passwords, tokens and
# personal data are never written to logs by this configuration.
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "console": {
            "format": "[{asctime}] {levelname} {name}: {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "console",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": "INFO",
    },
    "loggers": {
        "django": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
    },
}
