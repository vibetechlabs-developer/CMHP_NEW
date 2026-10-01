# CMHP Pharmaceutical ERP + HRMS — Backend

Backend for a single application serving two pharmaceutical companies,
built with Django, Django REST Framework and PostgreSQL.

Status: **Task 01 — project foundation and custom user model** only.
No business modules, no authentication endpoints, no company model yet.
See [docs/backend-tasks.md](docs/backend-tasks.md) for scope and status.

## Requirements

- Python 3.12 (installed: 3.12.7)
- PostgreSQL running locally (verified against PostgreSQL 18)
- Windows PowerShell

## Project layout

```
CMHP_NEW/
  backend/
    manage.py
    config/
      settings/
        base.py         # shared settings, reads env vars
        local.py         # DEBUG on by default, used by manage.py
        production.py    # DEBUG hardcoded off, used by wsgi.py/asgi.py
      urls.py
      asgi.py
      wsgi.py
    apps/
      common/            # cross-cutting: health check endpoint
      users/              # custom User model
    tests/                # focused tests (user creation, health endpoint)
    requirements.txt
    .env.example
  docs/
    backend-decisions.md
    backend-tasks.md
  venv/                   # local virtual environment (gitignored)
```

## First-time setup (PowerShell)

```powershell
cd D:\CMHP_NEW

# Create the virtual environment only if it doesn't already exist
# (re-running this against an existing venv can fail with "Permission
# denied" on python.exe if it's in use, and is never necessary)
if (-not (Test-Path venv)) { python -m venv venv }
.\venv\Scripts\Activate.ps1

# Install pinned dependencies
pip install -r backend\requirements.txt

# Configure environment variables (only copy if .env doesn't already exist,
# so a local setup already filled in is never overwritten)
if (-not (Test-Path backend\.env)) { Copy-Item backend\.env.example backend\.env }
notepad backend\.env   # fill in DJANGO_SECRET_KEY and DB_* values
```

### PostgreSQL setup

This project does not fall back to SQLite. Create a **dedicated** role and
database before running migrations — do not reuse another project's
database or role:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -c "CREATE ROLE cmhp_new_user LOGIN PASSWORD 'choose-a-strong-password';"
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -c "CREATE DATABASE cmhp_new_dev OWNER cmhp_new_user;"
```

The role also needs `CREATEDB` so Django can create/drop its own test
database when running the test suite:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -c "ALTER ROLE cmhp_new_user CREATEDB;"
```

Put the matching `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`
values in `backend\.env`.

## Running

```powershell
cd D:\CMHP_NEW
.\venv\Scripts\Activate.ps1
cd backend

python manage.py check                 # system checks
python manage.py makemigrations --check --dry-run   # migration consistency
python manage.py migrate                # apply migrations
python manage.py test tests             # focused tests, isolated test DB
python manage.py createsuperuser        # optional, no default superuser exists
python manage.py runserver
```

Health check: `GET http://127.0.0.1:8000/api/v1/health/` → `{"status": "ok"}`

Admin site: `http://127.0.0.1:8000/admin/`

## Settings modules

- `manage.py` defaults to `config.settings.local` (development convenience).
- `wsgi.py` / `asgi.py` default to `config.settings.production` (safe
  deployment default — DEBUG cannot accidentally stay on).
- Override explicitly by setting `DJANGO_SETTINGS_MODULE` in the environment.

## Timezones

Datetimes are stored and processed in UTC (`USE_TZ = True`,
`TIME_ZONE = "UTC"`). The client's business display timezone is
**Asia/Kolkata** — that conversion belongs at the presentation layer
(API serializers / frontend), not in Django's `TIME_ZONE` setting.

## Environment variables

See [backend/.env.example](backend/.env.example) for the full list. Loaded
from `backend/.env` via `django-environ`; if that file is absent, real
process environment variables are used instead (e.g. on the client's
server, injected by the deployment platform rather than a checked-in file).
