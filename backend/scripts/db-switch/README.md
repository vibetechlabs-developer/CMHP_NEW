# Database switching (CMHP_NEW backend)

Two databases on the same PostgreSQL server:

| Name | Purpose | Contents |
|---|---|---|
| `cmhp_new_dev` | Original, preserved | Earlier data (19 users, 6 customers, 277 audit rows at last count). Never wiped. |
| `cmhp_new_clean_test` | Fresh testing | Migrations and mandatory system permissions only. 0 users, 0 business rows. |

## Helpers
- `start_clean_test_db.ps1`: starts the backend on port 8000 against `cmhp_new_clean_test`.
- `start_original_db.ps1`: starts the backend on port 8000 against `cmhp_new_dev`.

Each helper sets or clears `DB_NAME` for its own process only. `.env` is not changed.
Each one refuses to start if port 8000 is already in use. Stop the existing CMHP_NEW backend first.

## Rules
- Git rollback changes code, not database contents. Reverting a commit does not restore or remove any rows.
- Switching databases does not merge data. Each database is separate.
- Check migrations when you switch code or databases. Run `python manage.py showmigrations` for the target database before using it.
- A fresh login is required after a database switch. JWTs are bound to the database name (`SIMPLE_JWT.SIGNING_KEY`), so old tokens are rejected.
- Database backups are kept outside the repository and are never committed.

## Usage
```powershell
cd D:\CMHP_NEW\backend\scripts\db-switch
.\start_clean_test_db.ps1      # clean testing database
.\start_original_db.ps1        # original database
```

## Interpreter note
The helpers use the Python 3.12 interpreter that the running backend uses today. The project venv (`D:\CMHP_NEW\venv`) is not used here. Environment alignment is still an open follow-up.
