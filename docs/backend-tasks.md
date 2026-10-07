# Backend Tasks

## Task 01 — Project foundation and custom user model

**Status: Complete.**

Scope: Django/DRF/PostgreSQL project scaffold, environment-based
configuration, a custom `User` model (no company/role/HR fields), a
liveness health endpoint, and documentation. No company model, no
authentication endpoints, no ERP business modules — all explicitly out of
scope and not started.

Verification actually run for this task, on this machine, against a
dedicated PostgreSQL database (`cmhp_new_dev`, role `cmhp_new_user`) — not
any other project's database:

| Check | Command | Result |
|---|---|---|
| System checks | `python manage.py check` | Passed — no issues |
| Migration consistency | `python manage.py makemigrations --check --dry-run` | Passed — no changes detected |
| Migrations applied | `python manage.py migrate` | Passed — all migrations applied to `cmhp_new_dev` |
| Focused tests | `python manage.py test tests -v 2` | Passed — 6/6 tests, isolated `test_cmhp_new_dev` database created and destroyed automatically |
| Manual smoke test | `GET /api/v1/health/` via running dev server | Passed — returned `{"status": "ok"}` |
| Manual smoke test | `GET /admin/login/` via running dev server | Passed — HTTP 200 |

Blocked steps: none. PostgreSQL 18 was available locally; a dedicated role
and database were created for this project (see README for the exact
commands) rather than reusing any existing database.

## Task 02 — Company and company membership

**Status: Complete.**

Scope: `apps.companies` app — `Company` and `CompanyMembership` models,
additive migrations, Django admin (superuser-only, no hard delete), a
reusable active-company-access lookup, and tests. No REST endpoints, no
login/authentication APIs, no module/action permission system, no frontend
— all explicitly out of scope and not started.

Models:

- `Company` — `code` (required, unique, normalised via trim + uppercase),
  `legal_name` (required), `display_name` (optional), `is_active`
  (default `True`), `created_at`/`updated_at`. `Company.save()` always
  normalises and rejects blank/whitespace-only `code`/`legal_name` before
  writing, since no serializer/form layer exists yet to do this instead.
  Code uniqueness is enforced by a real database unique index
  (`unique=True`), not just Python-level validation.
- `CompanyMembership` — `user` (FK to `AUTH_USER_MODEL`, `PROTECT`),
  `company` (FK to `Company`, `PROTECT`), `is_active` (default `True`),
  `created_at`/`updated_at`. A `UniqueConstraint` on `(user, company)`
  covers inactive rows too, so a deactivated membership still blocks a
  second row for the same pair — `CompanyMembership.objects.activate(user=,
  company=)` reactivates the existing row instead. No global/single
  company or role field was added to `User`, per the Task 01 decision that
  a user can belong to multiple companies with different access per
  company.
- `apps.companies.services.active_companies_for_user(user)` — the one
  reusable place that answers "which companies can this account currently
  access". Returns a company only when the user, the membership row, and
  the company are all active, deterministically ordered by `code`.
  Anonymous users, inactive users, and users with no membership rows get
  an empty queryset. `is_staff`/`is_superuser` are never consulted —
  membership access and Django-admin/staff access are unrelated, and
  membership alone grants no module/action permission (that is a separate,
  later concern).

Django admin: both models are registered but restricted to active
superusers only (`has_module_permission`/`has_view_permission`/
`has_add_permission`/`has_change_permission` all check
`is_active and is_superuser`) — ordinary staff cannot see or assign
company access. `has_delete_permission` always returns `False`; a
"Deactivate selected" admin action sets `is_active = False` via
`save()` (not a bulk `.update()`) and calls `self.log_change(...)` per
row, so the row and its Django admin change history survive deactivation
instead of being destroyed. Full ERP audit history remains a separate,
later task.

Verification actually run for this task, on this machine, against the
dedicated `cmhp_new_dev` database:

| Check | Command | Result |
|---|---|---|
| System checks | `python manage.py check` | Passed — no issues |
| Migration consistency | `python manage.py makemigrations --check --dry-run` | Passed — no changes detected |
| Migrations applied | `python manage.py migrate` | Passed — `companies.0001_initial` applied (additive only) to `cmhp_new_dev` |
| Full test suite | `python manage.py test tests -v 2` | Passed — 38/38 (6 from Task 01 + 32 new), isolated `test_cmhp_new_dev` database created and destroyed automatically; test command discovered `tests.test_health`, `tests.test_users` and `tests.test_companies` together |

Blocked steps: none.

## Task 03 — Company-scoped roles and permissions

**Status: Complete.**

Scope: `apps.permissions` app — `PermissionDefinition`, `CompanyRole`,
`MembershipRole` models, additive migrations, reusable permission-resolution
services, Django admin (superuser-only, no hard delete), and tests. No REST
endpoints were added in this task — `effective_permission_codes()` /
`user_has_permission()` are plain Python functions with no URL wired to
them yet. No JWT/login endpoints, business-module APIs, inventory models,
or shared-store permissions — all explicitly out of scope and not started.

Models:

- `PermissionDefinition` — `code` (required, unique, normalised via trim +
  lowercase, dotted `module.action` convention e.g. `orders.view`), `name`
  (required), `module` (required), `description` (optional), `is_active`
  (default `True`), timestamps. Same save()-enforces-clean() pattern as
  `Company`/`CompanyRole` below, for the same reason: no serializer/form
  layer exists yet to validate every write path.
- `CompanyRole` — `company` (FK to `Company`, `PROTECT`), `code` (required,
  normalised via `apps.companies.models.normalize_code`, reused rather than
  duplicated), `name` (required), `description` (optional), `is_active`
  (default `True`), `permissions` (M2M to `PermissionDefinition`),
  timestamps. `UniqueConstraint(company, code)` — the same code (e.g.
  `MANAGER`) can exist independently in two different companies without
  colliding, because uniqueness is scoped to the company, not global.
- `MembershipRole` — `membership` (FK to `CompanyMembership`, `PROTECT`),
  `role` (FK to `CompanyRole`, `PROTECT`), `is_active` (default `True`),
  timestamps. `UniqueConstraint(membership, role)` covers inactive rows
  too. A membership can hold several active roles at once; effective
  permissions are the union of all of them.
- **Same-company enforcement**: `MembershipRole.clean()` rejects a role and
  membership that belong to different companies; `save()` always calls
  `self.clean()` first (mirrors `Company`/`CompanyRole`/`PermissionDefinition`),
  and Django Admin's `ModelForm` independently calls `full_clean()` (which
  calls `clean()`) before `save()` — so both the plain ORM path and the
  admin form path reject a cross-company assignment. **Documented
  limitation**: `MembershipRole.objects.bulk_create()` and
  `QuerySet.update()` never call `save()`/`clean()`, so they bypass this
  check entirely, and there is no database-level constraint backing it
  either — a Postgres `CHECK` constraint cannot reference columns on
  another table. Application code must always create `MembershipRole` rows
  through `apps.permissions.services.assign_role()` (or plain `.save()`),
  never `bulk_create()`. `tests/test_permissions.py::MembershipRoleModelTests::test_bulk_create_bypasses_cross_company_check_documented_limitation`
  demonstrates this gap deliberately, so it stays visible rather than
  silently assumed-safe.
- No global business-role field was added to `User`, and the existing
  `CompanyMembership` model was not changed or replaced — `MembershipRole`
  is an additive link on top of it.

Services (`apps.permissions.services`), matching the reusable-function
pattern already used by `apps.companies.services.active_companies_for_user`:

- `effective_permission_codes(user, company)` — the set of permission
  codes the user currently holds in that company. Deny by default: empty
  unless the user, company, membership, role assignment, role, *and*
  permission definition are all active. Anonymous/no-membership users get
  an empty result. `is_staff`/`is_superuser` are never consulted — an
  admin/superuser account has no implicit business permission in any
  company. One query total (verified by
  `test_effective_permission_codes_uses_a_single_query` via
  `assertNumQueries(1)`) — no N+1 regardless of how many roles/permissions
  are involved.
- `user_has_permission(user, company, permission_code)` — convenience
  wrapper around the above.
- `assign_role(membership, role)` — rejects a cross-company pair; reuses
  an existing (even inactive) assignment row via `select_for_update()` +
  `get_or_create()` inside `transaction.atomic()` instead of creating a
  duplicate, so repeated calls are idempotent and race-safe.
- `deactivate_role_assignment(membership, role)` — deactivates an existing
  assignment (never deletes it); returns `None` if no such assignment
  exists at all.
- No permission caching anywhere — every lookup queries the database
  fresh, so revoking a role or deactivating anything takes effect on the
  very next call. Confirmed by
  `test_role_deactivation_reflected_on_next_lookup` and
  `test_role_permission_set_change_reflected_on_next_lookup`.

Django admin: `PermissionDefinition`, `CompanyRole`, `MembershipRole` are
all registered using the *same* `SuperuserOnlyAdminMixin` from
`apps.companies.admin` (imported, not duplicated) — active-superuser-only,
hard delete always disabled. The mixin gained one small additive method,
`reactivate_queryset` (alongside the existing `deactivate_queryset`),
since this task explicitly needed a "Reactivate selected" admin action
that Task 02 never required; this does not change any Task 02 admin
behaviour. `MembershipRoleAdmin` narrows the `role` dropdown to the
membership's own company on the **change** form (via
`get_form`/`formfield_for_foreignkey`); on the **add** form no membership
has been chosen yet, so the dropdown cannot be narrowed client-side — the
model's `clean()`/`save()` still rejects a mismatched choice server-side
either way (`test_admin_modelform_rejects_cross_company_assignment`).

Verification actually run for this task, on this machine, against the
dedicated `cmhp_new_dev` database:

| Check | Command | Result |
|---|---|---|
| System checks | `python manage.py check` | Passed — no issues |
| Migration consistency | `python manage.py makemigrations --check --dry-run` | Passed — no changes detected |
| Migrations applied | `python manage.py migrate` | Passed — `permissions.0001_initial` applied (additive only: 3× `CreateModel`, 1× `AddConstraint`) to `cmhp_new_dev` |
| Full test suite | `python manage.py test tests -v 2` | Passed — **83/83** (38 from Tasks 01–02 + 45 new), isolated `test_cmhp_new_dev` database created and destroyed automatically; verbose output confirms `tests.test_health`, `tests.test_users`, `tests.test_companies` and `tests.test_permissions` were all discovered and run together |

Blocked steps: none. No development users, companies, or memberships were
created or altered outside the isolated test database; no roles or
permissions were seeded into the dev database.

### Manually creating and assigning a role (Django Admin)

1. Log in to `/admin/` as an active superuser.
2. **Permissions → Permission definitions → Add**: create a code such as
   `orders.view` (module `orders`, a name, save).
3. **Companies → Companies**: note the company you want to grant access
   in (must already exist — Task 03 does not seed companies).
4. **Permissions → Company roles → Add**: pick that company, give the role
   a code (e.g. `MANAGER`) and name, select one or more permission
   definitions in the permissions widget, save.
5. **Companies → Company memberships**: confirm the target user already
   has an active membership in that same company (create one first if not
   — Task 02's admin).
6. **Permissions → Membership role assignments → Add**: pick the
   membership, then pick a role — on the change form (after the first
   save) the role dropdown is narrowed to that membership's company; on
   the add form, picking a role from a different company is rejected on
   save with a validation error.
7. To revoke, select the assignment row in the list and use the
   "Deactivate selected role assignments" action (does not delete the
   row); "Reactivate selected role assignments" restores it.

## Task 04 — Authentication and current-user access APIs

**Status: Complete.**

Scope: `apps.authentication` app (JWT login/refresh/logout/CSRF/me) plus
read-only APIs for the signed-in user's own companies and effective
company permissions. No frontend, public signup, company CRUD,
role-management APIs, or ERP business modules — all explicitly out of
scope and not started. **This task adds no other REST endpoints beyond
the ones listed below.**

New dependency: `djangorestframework-simplejwt==5.5.1` (+ its `pyjwt`
dependency) — the only maintained JWT library for DRF; `rest_framework`,
`rest_framework_simplejwt`, and `rest_framework_simplejwt.token_blacklist`
are all in `INSTALLED_APPS` now (the blacklist app's own 13 migrations
were applied — they are the library's, not ours).

### Endpoints

All under `/api/v1/`. None trust any role/permission claim from a JWT —
`apps.companies`/`apps.permissions` services always re-resolve membership
and permissions from the database on every request. Company IDs in URLs
are plain integers (`Company`'s actual `BigAutoField` primary key type).

| Method & path | Auth | Notes |
|---|---|---|
| `GET /auth/csrf/` | Public | Sets the `csrftoken` cookie, returns `{"csrfToken": "..."}`. Never cached (`never_cache`). |
| `POST /auth/login/` | Public, CSRF, rate-limited | `{"username", "password"}` → `{"access": "...", "user": {...}}`. Sets the refresh cookie. Wrong username, wrong password, and a correct-password-but-inactive account all return the *same* `401` (Django's `ModelBackend.authenticate()` already collapses these three cases into one). |
| `POST /auth/refresh/` | Public (no Bearer needed), CSRF | Reads the refresh token only from the cookie, never the body. Rotates it (old blacklisted, new issued) and returns `{"access": "..."}`. Explicitly re-checks `user.is_active` against the database (SimpleJWT's own rotation does not do this by itself) — a user deactivated after the refresh token was issued gets `401`. |
| `POST /auth/logout/` | Public (no Bearer needed), CSRF | Blacklists the submitted refresh cookie if present/valid, clears the cookie, returns `204`. Idempotent: missing/expired/already-blacklisted cookie still returns `204`. **Does not revoke already-issued access tokens** — those remain valid until their own short expiry; there is no server-side access-token revocation list (a deliberate tradeoff for cheap, no-DB-hit access-token verification). |
| `GET /auth/me/` | Bearer | `{"id", "username", "email", "first_name", "last_name"}` only — no password hash, no `is_staff`/`is_superuser`/other admin flags. |
| `GET /companies/mine/` | Bearer | `{"companies": [{"id", "code", "legal_name", "display_name"}, ...]}`, via `apps.companies.services.active_companies_for_user()` unchanged — ordered by `code`, empty list for zero memberships. |
| `GET /companies/<int:company_id>/my-permissions/` | Bearer | `{"company_id": <int>, "permissions": ["orders.create", "orders.view", ...]}` (sorted). A nonexistent company, a company with no active membership, and an inactive company all return the *same* `404`. No `is_staff`/`is_superuser` bypass. |

### CSRF

DRF's `APIView` is CSRF-*exempt* at the Django-middleware level by
default, and only re-enables CSRF checking for `SessionAuthentication` —
none of login/refresh/logout use sessions, so without explicit handling
none of them would be CSRF-protected at all. `apps.authentication.csrf.
enforce_csrf()` runs Django's standard `CsrfViewMiddleware` check manually
(the same mechanism DRF's own `SessionAuthentication.enforce_csrf()` uses
internally) in all three POST views. Standard Django CSRF facilities
throughout: `csrftoken` cookie, `X-CSRFToken` request header, nothing
custom.

### Refresh-token cookie

`refresh_token`, `HttpOnly`, `Path=/api/v1/auth/`, `SameSite=Lax`,
`Secure` in production only (`AUTH_REFRESH_COOKIE_SECURE`, hardcoded
`True` in `production.py`, `False` in `base.py` so local `http://` login
doesn't silently get its cookie dropped by the browser). Set and cleared
through the exact same `apps.authentication.cookies._cookie_attrs()`, so
the two can never drift apart — logout does **not** use Django's
`HttpResponse.delete_cookie()`, which infers `Secure` from the cookie name
instead of taking it as a parameter and would have broken that guarantee
in production.

### Configurable lifetimes and throttling

`JWT_ACCESS_TOKEN_MINUTES` (default `5`), `JWT_REFRESH_TOKEN_DAYS`
(default `1`), `AUTH_LOGIN_THROTTLE_RATE` (default `5/min`, DRF's
`AnonRateThrottle` keyed by client IP) — all optional env vars, documented
in `.env.example`, `backend/.env` left untouched (the defaults apply).

### Company isolation hardening

- `apps.permissions.services.effective_permission_codes()` (Task 03,
  unchanged) already constrains **both** `company_roles__company=company`
  and `...membership__company=company` in one query — so even a
  bulk-write-inserted `MembershipRole` row pairing a membership in one
  company with a role in another can never satisfy both conditions for
  either company. Regression-tested by deliberately inserting such a row
  via `bulk_create()` (the documented Task 03 limitation) and asserting it
  grants nothing, at both the service and the `/my-permissions/` HTTP
  layer.
- New: `CompanyMembership.company` and `CompanyRole.company` are now
  immutable after creation — `clean()`/`save()` reject changing either on
  an existing row, because either change would silently strand that row's
  `MembershipRole` assignments in what is now the wrong company. Same
  established pattern as the rest of this codebase (`clean()` used by
  Django Admin's `ModelForm.full_clean()` too, not just a method nobody
  calls). **Not a database-level guarantee**: `QuerySet.update()` still
  bypasses `save()`/`clean()` entirely and could still reassign `company`
  on an existing row — a regression test proves that even then,
  `effective_permission_codes()` stays fail-closed (see above; the double
  constraint holds regardless of *how* the mismatch was created). No
  migration was needed for this — it is pure Python validation, no schema
  change.

### Verification

Live HTTP check performed against the actual running dev server
(`127.0.0.1:8001`, our venv — not the unrelated server already on
`:8000`, which was left untouched) using a dedicated throwaway user
(`_task04_live_check_tmp`) created and then deleted afterward — no
existing user's password was touched, nothing permanent was left in
`cmhp_new_dev`. All 10 steps (health → csrf → login → me → mine →
my-permissions → refresh → me again → logout → refresh-after-logout)
matched the automated tests: `200` → `200` → `200` (access + user, no
`refresh` key, `Set-Cookie` with `HttpOnly`/`Path=/api/v1/auth/`/
`SameSite=Lax`) → `200` → `{"companies": []}` → n/a → `200` (rotated
cookie, no `refresh` key in body) → `200` → `204` (cookie cleared) →
`401`. A CSRF-missing login also returned `403` live, and a second logout
returned `204` (idempotent), both live-verified.

Automated tests, isolated `test_cmhp_new_dev` database:

| Check | Command | Result |
|---|---|---|
| System checks | `python manage.py check` | Passed — no issues |
| Migration consistency | `python manage.py makemigrations --check --dry-run` | Passed — no changes detected |
| Migrations applied | `python manage.py migrate` | Passed — 13 `token_blacklist` migrations applied (library's own); no new migration needed from `apps.companies`/`apps.permissions` (pure Python validation, no schema change) |
| Full test suite | `python manage.py test tests -v 2` | Passed — **128/128** (83 from Tasks 01–03 + 45 new), isolated `test_cmhp_new_dev` database created and destroyed automatically; verbose output confirms `tests.test_health`, `tests.test_users`, `tests.test_companies`, `tests.test_permissions` and `tests.test_auth` were all discovered and run together |

Postman JSON files (`docs/postman/*.json`) parsed successfully with
Python's `json` module (10 collection items, 6 environment variables) —
this confirms the files are syntactically valid importable Postman v2.1
JSON. **Actually importing them into the Postman GUI and clicking through
was not performed in this session** — that step is left for you to do
locally per `docs/postman/README.md`.

### Known limitations (documented, not solved here)

- Logout blacklists the refresh token only — an already-issued access
  token remains valid until its own expiry (5 minutes by default). There
  is no immediate access-token revocation.
- `OutstandingToken`/`BlacklistedToken` rows (from
  `rest_framework_simplejwt.token_blacklist`) accumulate forever unless
  pruned. The library ships a `python manage.py flushexpiredtokens`
  management command for this; nothing schedules it yet (no Celery/cron in
  this project) — running it periodically (or after it's wired into a
  future scheduler) is a deployment-operations task, not application code.
- `CompanyMembership.company`/`CompanyRole.company` immutability is
  enforced at the `save()`/`clean()` layer, not the database — see
  "Company isolation hardening" above for why permission resolution stays
  safe regardless.
- The local `DJANGO_SECRET_KEY` in `backend/.env` is short (a placeholder
  value), which SimpleJWT uses as the default JWT signing key and which
  Django/PyJWT report as `InsecureKeyLengthWarning` in local test output.
  Not fixed here — `.env` is intentionally left untouched by this task;
  replacing it with a properly generated key (per the comment already in
  `.env.example`) is a local action for you to take before anything
  beyond local development.

## Task 05 — User management APIs

**Status: Complete.**

Scope: superuser-only backend APIs to list/create/view/update users,
activate/deactivate them, assign/revoke company membership, and
assign/revoke roles within a membership — plus a small reusable audit
foundation (`apps.audit`) recording these mutations. No frontend, public
signup, company CRUD, role-*definition* CRUD, HR/employee models,
password recovery, or business modules — all explicitly out of scope and
not started.

New app `apps.users` gained `serializers.py`/`views.py`/`urls.py`/
`services.py` (models unchanged from Task 01); new app `apps.audit`
(`AuditLog` model, `services.record()`, read-only admin). New reusable
pieces in `apps.common`: `permissions.IsActiveSuperuser`,
`pagination.BoundedPageNumberPagination`.

### Endpoints

All under `/api/v1/users/`, all requiring `IsActiveSuperuser` (a valid
Bearer token, `is_active=True`, `is_superuser=True` — anonymous/invalid
token → `401`; authenticated non-superuser → `403`). None of these
accept or need the refresh cookie/CSRF — Bearer-only, consistent with
Task 04's existing `/auth/me/`, `/companies/mine/`, etc.

| Method & path | Notes |
|---|---|
| `GET /` | Paginated (`page_size`, capped at 100), `?search=` across username/email/first/last name, `?is_active=true\|false` (strict — anything else is `400`), `?ordering=` from an explicit allowlist (`username`, `-username`, `email`, `-email`, `date_joined`, `-date_joined`; anything else is `400`), always a deterministic secondary `id` sort. |
| `POST /` | `{"username","email","first_name","last_name","initial_password"}` → `201`. Hashes via `User.objects.create_user()` (the normal path — `set_password()` under the hood). `is_staff`/`is_superuser`/`is_active`/`groups`/`user_permissions`/`password` in the request body are explicitly rejected (`400`), not silently dropped. Creates no membership/role. |
| `GET /<id>/` | Safe fields only (no password/hash) + `memberships_url` linking to the dedicated endpoint below (deliberately not nesting membership data — avoids an N+1 per row on the list view). |
| `PATCH /<id>/` | `username`/`email`/`first_name`/`last_name` only; the same prohibited-field rejection as create, plus `initial_password`. Uniqueness/validation failures are `400`, never `500`. |
| `POST /<id>/activate/`, `POST /<id>/deactivate/` | Idempotent. Deactivate rejects the caller's own id (`400`) — checked *before* the superuser exclusion below, since the caller is always a superuser, so "target is a superuser" would otherwise always mask "that's yourself" for this specific case. Both reject a superuser target (`403`, "manage those in Django Admin"). Neither touches membership/role rows. |
| `GET /<id>/memberships/` | Active and inactive rows, with company id/code/legal name/display name and membership id/active state. |
| `POST /<id>/memberships/` | `{"company_id"}` → `201` new, `200` existing-or-reactivated (never a duplicate row — reuses `CompanyMembership.objects.activate()` from Task 02 unchanged). Rejects an inactive target user or inactive company (`400`); rejects an unknown company (`404`). |
| `POST /<id>/memberships/<mid>/deactivate/` | Idempotent; works even if the user/company is already inactive (revoking is always allowed). `mid` not belonging to `<id>` → `404`, nothing changed. Role assignments on that membership are left untouched (still there, still active) for history — reassigning the membership later (`POST .../memberships/`) makes `effective_permission_codes()` see them again immediately, with no need to reassign the roles. |
| `GET /<id>/memberships/<mid>/roles/` | Active and inactive assignments, with role id/code/name and status. |
| `POST /<id>/memberships/<mid>/roles/` | `{"role_id"}` → `201`/`200` (same create-vs-reactivate-vs-no-op split as memberships). Requires active user/company/membership/role and same-company role (`400` otherwise); reuses `apps.permissions.services.assign_role()` unchanged. Unknown role → `404`. |
| `POST /<id>/memberships/<mid>/roles/<aid>/deactivate/` | Idempotent; works even if user/company/membership/role is already inactive. `aid` not belonging to `mid` → `404`, nothing changed. Reuses `apps.permissions.services.deactivate_role_assignment()`. |

No hard-delete endpoint anywhere in this task. Unsupported methods (e.g.
`DELETE`) return `405` (default DRF `APIView` behaviour — nothing extra
needed).

### Audit trail (`apps.audit`)

`AuditLog` — `actor` (FK `User`, `PROTECT`), `action` (stable code, e.g.
`user.created`, `membership.reactivated`, `role_assignment.deactivated`),
`target_type`/`target_id`, `company` (FK `Company`, `PROTECT`, nullable —
only set when the mutation is company-scoped), `before`/`after`
(`JSONField`, allowlisted fields only — see `apps.users.services.
_user_snapshot`, which only ever includes `username`/`email`/`first_name`/
`last_name`), `created_at`. Append-only: `apps.audit.admin.AuditLogAdmin`
is read-only even for active superusers (`has_add_permission`/
`has_change_permission`/`has_delete_permission` all unconditionally
`False` — stronger than the `SuperuserOnlyAdminMixin` pattern used
elsewhere, which still allows add/change).

Every `apps.users.services` mutation function is `@transaction.atomic`
and calls `apps.audit.services.record()` *inside* that same block, so an
audit-write failure rolls back the business mutation too (regression-
tested by mocking `record()` to raise and asserting the user/membership
row was never created). Each function compares before-vs-after (or
checks `existing`/`was_active` before acting) and skips the audit call
entirely on a true no-op — a PATCH resubmitting identical values, or
assigning a membership/role that's already active, creates no audit row;
repeating an idempotent call twice creates exactly one.

**Coverage boundary (documented, not overstated)**: this audit trail
covers only mutations made *through Task 05's own service functions*
(`apps.users.services.*`). It does **not** retroactively cover changes
made directly through Django Admin's forms for `User`/`Company`/
`CompanyMembership`/`CompanyRole`/`MembershipRole` (those still only have
Django's own admin `LogEntry`, as documented in Tasks 02–03) or any
future write path that doesn't go through these services. It is an
**application-level**, append-only record — not a database-level
tamper-proofing mechanism; nothing prevents direct SQL access from
editing or deleting a row below the ORM.

### Company isolation

`IsActiveSuperuser` is purely a Django-admin-style authorization gate —
it does not touch, weaken, or bypass `apps.companies.services.
active_companies_for_user()` or `apps.permissions.services.
effective_permission_codes()`. A superuser administering users through
this API has zero company access unless a membership/role is separately
and explicitly assigned to *their own* account, same as anyone else
(regression-tested).

### Verification

Automated tests, isolated `test_cmhp_new_dev` database:

| Check | Command | Result |
|---|---|---|
| System checks | `python manage.py check` | Passed — no issues |
| Migration consistency | `python manage.py makemigrations --check --dry-run` | Passed — no changes detected |
| Migrations applied | `python manage.py migrate` | Passed — `audit.0001_initial` applied (additive: 1× `CreateModel` + 2 indexes) |
| Full test suite | `python manage.py test tests -v 2` | Passed — **203/203** (128 from Tasks 01–04 + 75 new), isolated database created/destroyed automatically; verbose output confirms `tests.test_user_management` discovered alongside all prior test modules |

Live HTTP check (distinct from the automated tests above) performed
against the actual running dev server on `127.0.0.1:8001` — confirmed the
autoreloader had picked up the new code first (`GET /api/v1/users/` with
no token → `401` live, before touching anything else). Created a fully
disposable fixture set (a throwaway superuser, a throwaway ordinary user,
one company, one permission, one role) via the Django shell, then curled
the entire flow in order — list (`200`) → create user (`201`, no password
in the body) → get (`200`) → patch (`200`) → patch-reject `is_staff`
(`400`) → assign membership (`201`) → reassign same membership
(`200`, idempotent, no duplicate row) → list memberships (`200`) →
assign role (`201`) → list role assignments (`200`) → revoke role
(`200`, `is_active:false`) → revoke membership (`200`, `is_active:false`)
→ deactivate user (`200`) → reactivate user (`200`) — then, with a second
throwaway ordinary user, confirmed `403` for a non-superuser and `401`
for anonymous, and confirmed self-deactivation returns `400`. Every
throwaway record (users, company, permission, role, memberships, role
assignments, audit log rows, outstanding/blacklisted tokens) was deleted
afterward in FK-safe order; the dev database's row counts for all of
these were verified back at zero (companies/permissions/roles/
memberships/audit logs) and exactly the 2 pre-existing superusers
remaining, matching the state before this check started. No existing
user's password was read or changed.

Postman JSON files (`docs/postman/*.json`) parsed successfully with
Python's `json` module after being extended (11 top-level items: the 10
from Task 04 plus the new "User Management - Superuser" folder containing
12 requests; 13 environment variables, the original 6 plus 7 new ones) —
confirms syntactic validity only. **Actually importing them into the
Postman GUI was not performed in this session** — the live HTTP check
above exercised the same endpoints via curl instead, which confirms the
API behaviour the Postman requests describe, but is not a substitute for
actually running the Postman collection yourself per
`docs/postman/README.md`.

### Known limitations (documented, not solved here)

- The audit trail's coverage boundary (see above): Task 05 API mutations
  only, not Django Admin edits or any other future write path.
- Application-level append-only, not database-level tamper-proof — see
  above.
- No bulk/mass user-management operations (e.g. bulk deactivate) — one
  user/membership/role-assignment per request, matching what was asked.
- `ordering`/`is_active`/`search` are query-string only; there is no
  separate "advanced filter" API.

## Task 06 — Company and role management APIs

**Status: Complete.**

Scope: superuser-only backend APIs to list/create/view/update companies,
activate/deactivate them; a read-only permission catalog; superuser-only
company-scoped role CRUD, activate/deactivate; and atomic role-permission
set replacement. No frontend, HR/employee models, shared-store access, or
business modules — all explicitly out of scope and not started.

The view/serializer/service code for this task already existed from an
earlier, interrupted session (all endpoints were implemented and wired
into `urls.py`, `manage.py check` and `makemigrations --check --dry-run`
were both clean, and the existing 203-test suite still passed against it).
What did **not** exist yet — and is what this pass actually completed —
was any dedicated automated test coverage, any Postman collection entries,
and any documentation for it; see "Verification" below for what running
those tests against the pre-existing code actually found.

New app usage: `apps.companies` gained `CompanyListCreateView`,
`CompanyDetailView`, `CompanyActivateView`, `CompanyDeactivateView`,
`CompanyCreateSerializer`/`CompanyUpdateSerializer`/`CompanyDetailSerializer`,
and `create_company`/`update_company`/`activate_company`/
`deactivate_company` in `services.py`. `apps.permissions` gained
`PermissionCatalogView`, `CompanyRoleListCreateView`, `CompanyRoleDetailView`,
`CompanyRoleActivateView`/`CompanyRoleDeactivateView`, `RolePermissionsView`,
matching serializers, and `create_company_role`/`update_company_role`/
`activate_company_role`/`deactivate_company_role`/`replace_role_permissions`
in `services.py`. New reusable pieces in `apps.common`:
`errors.translate_django_validation_error` (converts a model's raised
`django.core.exceptions.ValidationError` into DRF's `ValidationError`, so
it becomes a `400`, not an unhandled `500`) and `validation.parse_strict_bool`
(moved here from `apps.users.views` so both apps' query-string `?is_active=`
filters share one implementation). No new models and no new migration —
Task 06 is pure API surface over the `Company`/`CompanyRole`/
`PermissionDefinition` models Tasks 02–03 already created.

### Endpoints — Company Management

All under `/api/v1/companies/`, all requiring `IsActiveSuperuser`.

| Method & path | Notes |
|---|---|
| `GET /` | Paginated (`page_size`, capped at 100), `?search=` across code/legal_name/display_name, `?is_active=true\|false` (strict — anything else `400`). Returns active *and* inactive companies — the superuser-only administrative view, distinct from `/mine/`. |
| `POST /` | `{"code","legal_name","display_name"}` (`display_name` optional) → `201`. `code` normalised (trim+upper) and duplicate-checked (`400`, not `500`, on either a raw or a normalised collision). `is_active` in the body is rejected (`400`), not silently dropped. Creates no membership/role. |
| `GET /<id>/` | Full management detail, including `is_active`/timestamps (unlike `/mine/`'s minimal `CompanySerializer`). Unknown id → `404`. |
| `PATCH /<id>/` | `legal_name`/`display_name` only. `code` and `is_active` are rejected (`400`) if present in the body — immutable/lifecycle-endpoint-only respectively. **Allowed even when the company itself is inactive** (see "Inactive-company rules" below for why this is a deliberate asymmetry with role mutations, not an oversight). |
| `POST /<id>/activate/`, `POST /<id>/deactivate/` | Idempotent (repeating either is a no-op, no duplicate audit entry). Deactivating a company **never cascades** — its memberships, roles, and role assignments keep whatever `is_active` state they already had; `active_companies_for_user()`/`effective_permission_codes()` already require `company.is_active`, so deactivation alone blocks business access on the very next lookup with no cascade write needed. |

### Endpoints — Permission Catalog

| Method & path | Notes |
|---|---|
| `GET /api/v1/permissions/` | `IsActiveSuperuser`, paginated, `?search=` across code/name, `?module=` (exact match), `?is_active=true\|false` (strict). Read-only — no `POST`/`PATCH`/`DELETE` route exists anywhere for `PermissionDefinition`; permission codes are introduced deliberately through Django Admin, alongside the module that needs them, never speculatively seeded through this API. |

### Endpoints — Company Role Management

All under `/api/v1/companies/<company_id>/roles/`, all requiring
`IsActiveSuperuser`. Every lookup is scoped to the `company_id` in the
URL: a role id belonging to a *different* company than the one in the URL
is a `404`, identical to a role id that does not exist at all
(`get_object_or_404(CompanyRole, pk=role_id, company=company)` in one
query — no separate existence check, no way to distinguish "wrong
company" from "doesn't exist" from the response).

| Method & path | Notes |
|---|---|
| `GET /` | Active and inactive roles in this company, `?search=` across code/name, `?is_active=`. Viewable even if the company itself is inactive. |
| `POST /` | `{"code","name","description"}` (`description` optional) → `201`, permissions always empty on creation (assigning any is the separate `PUT .../permissions/` call below). `company`, `is_active`, `permissions` in the body are all rejected (`400`) — `company` comes from the URL only, never the request body. Same code allowed in two different companies (`(company, code)` uniqueness, not global); duplicate within the same company → `400`. **Rejected (`400`) if the company is inactive.** |
| `GET /<role_id>/` | As above — cross-company or unknown id → `404`. |
| `PATCH /<role_id>/` | `name`/`description` only; `code` and `company` rejected (`400`) — both immutable through this API. **Rejected (`400`) if the company is inactive.** |
| `POST /<role_id>/activate/` | Idempotent. **Rejected (`400`) if the company is inactive** — a role cannot become a source of business access again while its own company is still inactive. |
| `POST /<role_id>/deactivate/` | Idempotent. **Allowed even if the company is inactive** — revoking is always possible. Deactivating a role removes its contribution to `effective_permission_codes()` on the very next lookup; the `MembershipRole` assignment rows themselves are left untouched (still there, still active), so reactivating the role later restores them immediately with no need to reassign. |
| `PUT /<role_id>/permissions/` | `{"permission_codes": [...]}` → atomically replaces the role's *entire* permission set. **Rejected (`400`) if the company or the role itself is inactive.** See "Permission replacement" below. |

### Inactive-company rules (documented explicitly, not left implicit)

A company's own **metadata** (`PATCH /<id>/`) can be edited regardless of
its `is_active` state — there is no parent-level state a company's own
record could be restricted by, and correcting an inactive company's
`legal_name` is a legitimate administrative action. This is a deliberate
asymmetry, not an inconsistency: **role** mutations *are* gated by their
parent company's `is_active` state, because a role only has meaning in the
context of a company that is currently transacting business —
create/edit/activate a role under an inactive company are all rejected,
while deactivating a role (revoking access) is always allowed regardless
of the company's state, matching the same "revocation is always safe,
creation/expansion is not" principle already used for company
activate/deactivate.

### Permission replacement (`PUT .../roles/<role_id>/permissions/`)

`apps.permissions.services.replace_role_permissions()`:

- Each submitted code is normalised via `normalize_permission_code()`
  (trim+lower) before comparison — `"Orders.View"` and `"orders.view"`
  refer to the same permission.
- Duplicate codes in the request (after normalisation) collapse to one;
  membership in the final set is all that matters.
- Every normalised code must match an existing, **active**
  `PermissionDefinition`, or the entire request is rejected (`400`) and
  **nothing is written** — unknown and inactive codes are validated and
  reported *separately*, both before any write happens, so a request
  mixing a valid code with one unknown code changes nothing, not just the
  unknown one.
- `CompanyRole.objects.select_for_update().get(pk=role.pk)` locks the role
  row for the duration of the transaction, so two concurrent `PUT`s to the
  same role's permission set serialise rather than interleave their
  `.set()` calls.
- A request that would produce the exact same final set the role already
  has is a true no-op: no audit entry (the transaction/lock still runs —
  this is not a hot-path endpoint).
- Permission changes take effect for every already-assigned user on their
  *next* `effective_permission_codes()`/`/my-permissions/` lookup — no
  caching, nothing to invalidate.

### Audit trail extension

`apps.companies.services.*` and `apps.permissions.services.*`'s
company/role mutation functions all follow the exact same pattern Task 05
established: `@transaction.atomic`, call `apps.audit.services.record()` as
the last statement (so a `record()` failure rolls back the business
mutation too — regression-tested by mocking `record` to raise and
asserting the company/role row was never created/changed), and skip the
audit call entirely on a true no-op (idempotent activate/deactivate,
whitespace-only `PATCH`, identical permission-set replacement). New
actions: `company.created`, `company.updated`, `company.activated`,
`company.deactivated`, `role.created`, `role.updated`, `role.activated`,
`role.deactivated`, `role.permissions_replaced` (the last one's
`before`/`after` are `{"permission_codes": [...]}`, sorted lists of codes,
not permission ids). Same coverage boundary as Task 05: this only covers
mutations through these service functions, not any direct Django Admin
edit to `Company`/`CompanyRole`/`PermissionDefinition`.

### Django Admin authorization fix

`apps.users.admin.UserAdmin` did not previously apply the project's
active-superuser-only admin policy — it relied on Django's own
`auth.*_user` model permissions, unlike every other admin in this project
(`Company`/`CompanyMembership`/`PermissionDefinition`/`CompanyRole`/
`MembershipRole`, all via `SuperuserOnlyAdminMixin`). Fixed by mixing
`SuperuserOnlyAdminMixin` into `UserAdmin` (before `DjangoUserAdmin` in the
MRO, so its permission checks take priority while `DjangoUserAdmin`'s
forms — including password hashing/"change password" handling — are
inherited unchanged). Regression-tested that a non-superuser staff account
explicitly granted `add_user`/`change_user`/`view_user`/`delete_user`
Django permissions is **still denied** by this admin (the mixin never
consults `has_perm()`), and that an active superuser retains full access.
Hard delete is now disabled here too, consistent with the rest of the
project's "deactivate, never hard-delete" policy and the REST API's own
lack of a `DELETE /users/<id>/` route.

**Documented, not overstated**: this only restricts the `User` admin
surface itself. It does not give `apps.audit.AuditLog` (Task 05's REST-API
audit trail) any visibility into edits made through this admin form —
Django Admin's own `LogEntry` is the only record of those, exactly as
already documented for `Company`/`CompanyRole`/etc. in Tasks 02–03. This
project does not have, and this change does not create, ERP-wide audit
coverage of every write path — only of the specific REST service
functions listed above.

### Verification

Automated tests, isolated `test_cmhp_new_dev` database:

| Check | Command | Result |
|---|---|---|
| System checks | `python manage.py check` | Passed — no issues |
| Migration consistency | `python manage.py makemigrations --check --dry-run` | Passed — no changes detected (Task 06 added no models) |
| Full test suite | `python manage.py test tests -v 2` | Passed — **313/313** (203 from Tasks 01–05 + 105 new in `tests/test_company_management.py`/`tests/test_role_management.py` + 5 new `UserAdmin` restriction tests in `tests/test_users.py`), isolated database created/destroyed automatically |

New tests cover: authorization (superuser/staff/ordinary/anonymous) on
every new endpoint; company create/normalise/duplicate/update/protected-
field-rejection; pagination/search/`is_active`-filter validity; company
activate/deactivate affecting `/mine/`, `/my-permissions/`, and
`active_companies_for_user()` immediately, without cascading to
memberships/roles; the permission catalog's filters; role create with
same-code-different-company and duplicate-code-same-company; cross-company
nested role lookups returning `404`; role/company immutability; every
inactive-company restriction listed above; permission replacement's
empty-list/duplicate/identical-request/unknown-code/inactive-code/no-
partial-write/company-or-role-inactive/cross-company-404 cases, and that a
replaced permission set is reflected for an already-assigned user on the
very next `effective_permission_codes()` call; audit before/after values
and no-op suppression for every new mutation; audit-write-failure rollback
for company create/deactivate and role create/deactivate/permission-
replace; `DELETE` returning `405` (never implemented) on both the company
and role endpoints; `apps.common.validation.parse_strict_bool` and
`apps.common.errors.translate_django_validation_error` unit-tested
directly; and the new `UserAdmin` restriction (superuser access retained,
inactive-superuser/staff-with-explicit-permissions/ordinary-user all
denied, hard delete disabled).

Postman JSON files (`docs/postman/*.json`) parsed successfully with
Python's `json` module after being extended (14 top-level items: the 10
Task 04 requests, the Task 05 "User Management - Superuser" folder, and
three new Task 06 folders — "Company Management" (6 requests), "Permission
Catalog" (2 requests), "Company Role Management" (7 requests); 37 requests
total; 21 environment variables, the previous 13 plus 8 new ones).
**Actually importing them into the Postman GUI and clicking through was
not performed in this session — manual Postman testing remains deferred**,
per this task's own instructions; the automated test suite above is what
actually exercises these endpoints' behaviour.

### Known limitations (documented, not solved here)

- Same audit coverage boundary as Task 05: only mutations through
  `apps.companies.services.*`/`apps.permissions.services.*` are recorded;
  direct Django Admin edits to these models are not (Django's own
  `LogEntry` is the only record of those).
- `Company.code`/`CompanyRole.code`/`CompanyRole.company` immutability is
  enforced at the `save()`/`clean()` layer, not the database — the same
  documented, pre-existing limitation from Tasks 02–03 (`QuerySet.update()`
  bypasses it).
- No bulk/mass company or role operations — one company/role per request.
- `PermissionCatalogView`'s `?module=` filter is an exact match, not a
  substring search — deliberate, since module is a small, fixed
  categorical value, not free text.
- Manual Postman GUI testing was not performed — see "Verification" above.

## Task 07A — Shared store and store access foundation

**Status: Complete.**

Scope: store *identity and authorization* only — `SharedStore`,
`StoreMembership`, `StoreRole`, `StoreRoleAssignment`; a `scope`
(`COMPANY`/`STORE`) field on `PermissionDefinition`; the one operational
permission needed now (`shared_store.view`); superuser-only store/store-
role/store-membership management APIs; current-user store-access APIs;
audit coverage with a new `store` context field. Explicitly **not**
implemented: item masters, stock quantities, purchases, receipts, QC,
stock movements, ownership/allocation accounting, production — none of
that exists yet, and this task does not model or approximate any of it.

### Why a new `apps.stores` app, not a `Company` reuse

Two companies use one common physical store, and store access must be
independent of company membership entirely. `SharedStore` therefore has
**no owning-company FK at all** — not nullable, not optional, simply
absent from the model. This achieves company-*independence*: no
`Company` row can claim ownership of a store, and no query anywhere ties
store identity to a specific company. **It does not, by itself, prevent
duplicate store records** — nothing about omitting a `company` FK stops
two rows both meaning "the same physical warehouse" from being created
(e.g. `MAIN` and `MAIN-2` both created by mistake to represent the same
place). What actually prevents that is `SharedStore.code`'s database-level
`unique=True` constraint plus the "create exactly one store, once" data
migration precedent already established in Task 07A (`shared_store.view`
was seeded exactly once, never re-seeded) — administrative discipline
backed by a uniqueness constraint on a single, deliberately-chosen code,
not an emergent property of the missing FK. A new app (`apps.stores`)
holds `SharedStore`/`StoreMembership`, mirroring
`apps.companies`'s `Company`/`CompanyMembership` exactly (same
normalisation, same `Manager.activate()` reactivate-not-duplicate
pattern, same company-immutability-style store-immutability check).
`StoreRole`/`StoreRoleAssignment` live in `apps.permissions` instead,
mirroring `CompanyRole`/`MembershipRole` — the existing app boundary
("`apps.companies`/`apps.stores` answer *do they have access*,
`apps.permissions` answers *what can they do*") extends unchanged; this
is the same reasoning already documented for Task 03.

### Models

| Model | App | Notes |
|---|---|---|
| `SharedStore` | `apps.stores` | `code` (unique, normalised trim+upper via `apps.companies.models.normalize_code`, reused not reimplemented), `name`, `description`, `is_active`, timestamps. No `company` field. |
| `StoreMembership` | `apps.stores` | `user`+`store` (`PROTECT` both ways), `UniqueConstraint(user, store)` — covers inactive rows too, so `StoreMembership.objects.activate()` reactivates rather than duplicates, mirroring `CompanyMembershipManager.activate()`. `store` immutable after creation (`clean()`/`save()`, same documented `QuerySet.update()`/`bulk_create()` bypass limitation as `CompanyMembership.company`). |
| `StoreRole` | `apps.permissions` | `store`+`code` (`UniqueConstraint`, scoped per store — the same code is allowed in two different stores), `name`, `description`, `is_active`, `permissions` (M2M to `PermissionDefinition`). `store` immutable after creation. |
| `StoreRoleAssignment` | `apps.permissions` | `membership`+`role` (`UniqueConstraint`, covers inactive rows), `is_active`. `clean()` rejects a membership/role pair from different stores. |

`PermissionDefinition` gained `scope` (`PermissionDefinition.Scope`:
`COMPANY`/`STORE`, default `COMPANY`) — an additive `AddField` migration
(`apps/permissions/migrations/0002_...py`) sets every pre-existing row to
`COMPANY` via the field default, with no separate data migration needed
for that part. `scope` is immutable after creation (`clean()`, same
pattern as `code`/`company`). `code` stays globally unique across both
scopes — a `COMPANY` code and a `STORE` code can never collide, by the
same single `unique=True` constraint that already existed.

A second, genuinely data migration
(`apps/permissions/migrations/0003_seed_shared_store_view_permission.py`)
idempotently provisions exactly one row —
`shared_store.view`/`module="shared_store"`/`scope=STORE` — via
`get_or_create` (safe to re-run; a reverse migration removes it only if
nothing already references it). No other permission is seeded; no
stock/QC/purchase permission codes are guessed at.

### Scope enforcement

**Write time**: `apps.permissions.services.replace_role_permissions()`
(company) and the new `replace_store_role_permissions()` (store) share
one private implementation, `_replace_role_permission_set()`, that
additionally filters candidate `PermissionDefinition` rows by `scope`. A
code that exists but belongs to the *other* scope is indistinguishable
from a code that does not exist at all — both land in "unknown permission
code(s)", `400`, no partial write. This is what makes "company services
must reject STORE permissions" (and the reverse) true without a second
error path that would leak which scope a foreign code actually belongs
to.

**Resolution time (defense in depth)**: `effective_permission_codes()`
now also filters `scope=COMPANY`, and the new
`effective_store_permission_codes()` filters `scope=STORE` — so even if a
wrong-scope permission were force-attached to the wrong role type through
a direct `.add()`/`.set()` M2M call (Django never runs `clean()` for M2M
writes — a documented, honest limitation, not a solved one), neither
resolution query would ever surface it: the company path only ever
traverses `company_roles`, the store path only ever traverses
`store_roles`, and each additionally requires the matching `scope` value.
Regression-tested directly (`tests/test_store_permissions.py`,
`ScopeResolutionSeparationTests`) by force-attaching a wrong-scope
permission via `.add()` and asserting the resolution query still returns
nothing.

**Django Admin**: `CompanyRoleAdmin` (pre-existing, still editable —
unlike the new models below) gained `CompanyRoleAdminForm`, which both
narrows the `permissions` widget's queryset to `scope=COMPANY` and
rejects a `scope=STORE` id in `clean_permissions()` even if it arrives
through a tampered POST that bypassed the widget entirely — this is what
"Django Admin permission assignment" enforcement means here: a browser
using the real widget can't select the wrong scope, and a raw POST that
tries anyway is still rejected server-side.

### Endpoints — Shared Store Management

All under `/api/v1/stores/`, all requiring `IsActiveSuperuser`. Structure
mirrors Task 06's `/api/v1/companies/` exactly.

| Method & path | Notes |
|---|---|
| `GET /` | Paginated, `?search=` across code/name, `?is_active=`. Active and inactive stores. |
| `POST /` | `{"code","name","description"}` → `201`. `code` normalised+duplicate-checked (`400`, never `500`). `is_active` rejected in body. |
| `GET /<id>/` | Full management detail. |
| `PATCH /<id>/` | `name`/`description` only; `code`/`is_active` rejected. **Allowed even when the store is inactive** — same documented, deliberate asymmetry as Task 06's company `PATCH` (metadata correction has no parent state to be restricted by; only *role* mutations are gated by a parent's active state). |
| `POST /<id>/activate/`, `POST /<id>/deactivate/` | Idempotent. Deactivation never cascades to memberships/roles/assignments. |

### Endpoints — Store Roles and Memberships

All under `/api/v1/stores/<store_id>/...`, all requiring
`IsActiveSuperuser`. Chosen as fully store-scoped nesting (not
user-scoped, unlike Task 05's company-membership endpoints under
`/users/<id>/memberships/`) — there is no store-owning "user management"
API surface here to nest under instead, and the brief explicitly framed
these as "store-scoped" management.

| Method & path | Notes |
|---|---|
| `GET,POST /<store_id>/roles/` | Mirrors `/companies/<id>/roles/` exactly — list (active+inactive, viewable under an inactive store) / create (rejected under an inactive store; `company`→`store` naming swap in the prohibited-fields set). |
| `GET,PATCH /<store_id>/roles/<role_id>/` | Cross-store role id → `404` (`get_object_or_404(StoreRole, pk=role_id, store=store)`, one query). `PATCH` rejected under an inactive store. |
| `POST /<store_id>/roles/<role_id>/activate/` | Rejected under an inactive store. |
| `POST /<store_id>/roles/<role_id>/deactivate/` | Idempotent, allowed even under an inactive store. |
| `PUT /<store_id>/roles/<role_id>/permissions/` | Atomic replacement, `STORE`-scope only (see above). Rejected if store or role inactive. |
| `GET,POST /<store_id>/memberships/` | List (active+inactive) / assign-or-reactivate an existing, active user (`{"user_id"}` → `201`/`200`, mirrors `apps.users.services.assign_company_membership`'s create-vs-reactivate-vs-no-op split exactly, now audited via `apps.stores.services.assign_store_membership`). Rejects inactive user/store (`400`); unknown user → `404`. |
| `POST /<store_id>/memberships/<mid>/deactivate/` | Idempotent; works even if user/store already inactive. Wrong `mid` for `store_id` → `404`. |
| `GET,POST /<store_id>/memberships/<mid>/roles/` | List / assign-or-reactivate an existing `StoreRole` belonging to the *same* store as the membership (`400` otherwise, `404` for unknown role). Rejects inactive user/store/membership/role. Audited via `apps.stores.services.assign_store_membership_role` (a thin audited wrapper around `apps.permissions.services.assign_store_role`, exactly mirroring `apps.users.services.assign_membership_role`'s wrap-and-observe pattern from Task 05). |
| `POST /<store_id>/memberships/<mid>/roles/<aid>/deactivate/` | Idempotent; works even if any parent is inactive. Wrong `aid` for `mid` → `404`. |

### Endpoints — Current-user store access

| Method & path | Auth | Notes |
|---|---|---|
| `GET /api/v1/stores/mine/` | Bearer | `{"stores": [...]}` via `active_stores_for_user()` — active user + active membership + active store, deny by default. **No company id involved anywhere** — company membership is never consulted. |
| `GET /api/v1/stores/<id>/my-permissions/` | Bearer | `{"store_id", "permissions": [...]}` (sorted `STORE`-scope codes). Nonexistent/no-membership/inactive store all → the same `404`, mirroring `/companies/<id>/my-permissions/`. |
| `GET /api/v1/stores/<id>/overview/` | Bearer | Requires active membership **and** the `shared_store.view` permission — a deliberately *stricter and separate* check from `/my-permissions/` (which only requires membership, so a caller can always discover their own — possibly empty — permission list). No membership → `404`; membership without the permission → `403`; both → `200` with `{"id","code","name"}` only, no invented stock/quantity fields. |

No `is_staff`/`is_superuser` bypass anywhere in this list — a superuser
with no `StoreMembership` gets the exact same `404` from `/mine/`-derived
endpoints as anyone else (regression-tested).

**Endpoint count, reconciled**: the three tables above list **16
distinct URL patterns** registered in `apps/stores/urls.py`. That is not
the same number as the count of actual HTTP method+path operations they
serve, since six of those sixteen patterns each accept two methods at the
same path (`GET,POST /roles/`, `GET,PATCH /<role_id>/`, etc., each shown
as one table row) — confirmed by introspecting the live URL resolver
(`django.urls.get_resolver()`) and each view's `http_method_names`, not
estimated by hand: **22 distinct method+path operations** in total.
Earlier informal reporting for this task stated "15 new endpoints"
without this distinction, which was imprecise on both counts (the actual
figure is 16 URL patterns / 22 operations) — corrected here against the
introspected ground truth.

### Access rules and selectors

`apps.stores.services.active_stores_for_user()` and
`apps.permissions.services.effective_store_permission_codes()` mirror
`active_companies_for_user()`/`effective_permission_codes()` exactly:
single query each (no N+1), deny-by-default (require active
user+store+membership, and for permissions also active
assignment+role+permission-definition), no caching (revocation visible on
the very next call), `is_staff`/`is_superuser` never consulted. Neither
function, nor their company-side counterparts, ever references the
other's models — company membership/role can never grant store access,
and store membership/role can never grant company access
(regression-tested both directions).

### Audit

`AuditLog` gained a `store` FK (`PROTECT`, nullable, additive migration
`apps/audit/migrations/0002_auditlog_store.py`) — a **separate** field
from `company`, not a shared "context" FK and not a fake `Company` row
standing in for a store. `apps.audit.services.record()` gained a matching
`store=None` keyword; every Task 07A mutation function passes at most one
of `company`/`store`. New actions: `store.created`/`updated`/`activated`/
`deactivated`, `store_role.created`/`updated`/`activated`/`deactivated`/
`permissions_replaced`, `store_membership.created`/`reactivated`/
`deactivated`, `store_role_assignment.created`/`reactivated`/
`deactivated`. Same atomicity/no-op-suppression pattern as every prior
task: `@transaction.atomic`, `record()` called last so its failure rolls
back the mutation (regression-tested by mocking `record` to raise), and a
before/after (or prior-state) comparison skips the audit call entirely on
a true no-op.

### Django Admin

`SharedStore`, `StoreMembership`, `StoreRole`, `StoreRoleAssignment` are
all registered **read-only** (`ReadOnlySuperuserAdminMixin`, a new
variant of `SuperuserOnlyAdminMixin` that also disables `has_add_permission`/
`has_change_permission`, not just delete) — viewing only, for an active
superuser. All mutations go through the audited REST API; this
deliberately avoids introducing a *new* unaudited write path for models
that didn't have Django Admin history before this task. This is
different from `CompanyRole`/`PermissionDefinition`/etc. (Task 03), which
remain editable in admin — those predate the audit trail's introduction
(Task 05) and changing their existing behaviour was out of scope here.

### Verification

Automated tests, isolated `test_cmhp_new_dev` database:

| Check | Command | Result |
|---|---|---|
| System checks | `python manage.py check` | Passed — no issues |
| Migration consistency | `python manage.py makemigrations --check --dry-run` | Passed — no changes detected after all Task 07A migrations applied |
| Migrations applied | `python manage.py migrate` | Passed — `stores.0001_initial` (additive: 2 `CreateModel`), `audit.0002_auditlog_store` (additive: 1 `AddField`), `permissions.0002_...` (additive: 1 `AddField` + 2 `CreateModel` + 2 constraints), `permissions.0003_seed_shared_store_view_permission` (data migration, idempotent `get_or_create`) |
| Full test suite | `python manage.py test tests -v 2` | Passed — **463/463** (313 from Tasks 01–06 + 150 new in `tests/test_stores.py` (90) and `tests/test_store_permissions.py` (60)), isolated database created/destroyed automatically |

New tests cover: management authorization on every new endpoint;
membership/role-assignment uniqueness/idempotency/reactivation; nested-ID
validation (cross-store role/membership/assignment → `404`); company
access never granting store access and vice versa (both directions,
regression-tested at the selector level); no implicit superuser
operational bypass; `COMPANY`/`STORE` permission-assignment separation at
both write and resolution time; a wrong-scope permission force-attached
via an ORM `.add()` bypass still granting nothing; every inactive-state
denial listed above; permission changes and revocation taking effect
immediately; `shared_store.view` enforcement on `/overview/`; existing
company-permission behaviour unchanged (explicit regression test); audit
correctness/no-op-suppression/rollback for every new mutation; no
hard-delete anywhere (`405` on `DELETE`, and the new models' admin has no
add/change/delete at all); `CompanyRoleAdminForm`'s scope validation,
including a simulated tampered-POST bypass of the widget-level filter.

Postman JSON files parsed successfully with Python's `json` module after
being extended (17 top-level items: the 10 Task 04 requests plus six
folders — Task 05's "User Management - Superuser" (12), Task 06's
"Company Management" (6)/"Permission Catalog" (2)/"Company Role
Management" (7), and three new Task 07A folders — "Shared Store
Management" (6), "Store Roles and Memberships" (14), "My Store Access"
(3); 60 requests total; 31 environment variables, the previous 21 plus 10
new ones). **Actually importing them into the Postman GUI was not
performed in this session — manual Postman testing remains deferred**;
the automated test suite above is what actually exercises this behaviour.

### Known limitations (documented, not solved here)

- Same audit coverage boundary as Tasks 05–06: only mutations through the
  service-layer functions are recorded, not direct Django Admin edits
  (though for the four new models, Django Admin cannot mutate them at
  all — see above — so this boundary is moot for them specifically; it
  still applies to `CompanyRole`'s admin-editable `permissions` field).
- `StoreMembership.store`/`StoreRole.store`/`StoreRoleAssignment`
  cross-store validation is enforced at the `save()`/`clean()` layer, not
  the database — the same documented, pre-existing limitation as
  `CompanyMembership.company`/`MembershipRole` (`QuerySet.update()`/
  `bulk_create()` bypass it; resolution stays fail-closed regardless, per
  "Scope enforcement" above).
- No bulk/mass store or store-role operations.
- The current deployment needs exactly one store; nothing in this task
  hardcodes a singleton or seeds a guessed store code/name — an
  administrator creates it explicitly through the API once this task is
  deployed.
- Physical storage (this task) and legal stock ownership/company
  allocation are explicitly not equated anywhere here — no such concept
  exists yet; it is left for the inventory/item-master task to design.
- Manual Postman GUI testing was not performed — see "Verification"
  above.

## Task 07B — Item masters, units of measure and storage locations

**Status: Complete.**

Scope: a shared material catalog (`UnitOfMeasure`, `MaterialCategory`,
`Material`) usable by any store-authorized user regardless of company,
and per-store `StorageLocation` identity. Two new STORE-scope
permissions (`shared_catalog.view`, `storage_locations.view`). Explicitly
**not** implemented: stock balances, opening stock, purchases, receipts,
QC results, production formulas, finished-product ownership, valuation,
material movements, or a unit-conversion engine — none of that exists
yet, and this task does not model or approximate any of it.

### Models

| Model | App | Notes |
|---|---|---|
| `UnitOfMeasure` | `apps.catalog` | `code` (unique, normalised), `name`, `dimension` (`MASS`/`VOLUME`/`COUNT`), `is_active`, timestamps. `code` **and** `dimension` immutable after creation. No conversion engine — a `base_unit` reference is a fixed identity, not a convertible quantity. |
| `MaterialCategory` | `apps.catalog` | `code` (unique, normalised), `name`, `description`, `is_active`, timestamps. `code` immutable. Flat — no parent/child field exists on the model at all; herbs, mother tinctures, or any other grouping are just rows an administrator creates, none seeded. |
| `Material` | `apps.catalog` | `code` (unique across the whole shared catalog), `name`, `description`, `kind` (`RAW_MATERIAL`/`PACKAGING_MATERIAL`), `category` (FK `MaterialCategory`, `PROTECT`, nullable), `base_unit` (FK `UnitOfMeasure`, `PROTECT`, required), `is_active`, timestamps. `code`, `kind`, `base_unit` immutable after creation; `category` may be reassigned (including cleared to `null`). No company FK, no stock-quantity field, no default-supplier/tax/specification field. |
| `StorageLocation` | `apps.stores` | `store` (FK `SharedStore`, `PROTECT`), `code` (unique **within that store**, including inactive rows), `name`, `description`, `is_active`, timestamps. `store` and `code` immutable after creation. No company FK, no stock-quantity field, no QC-approval field — `name` is arbitrary free text; nothing anywhere reads it to infer quality status (a location literally named "Approved" carries no special meaning — see "Lifecycle rules" below and the model's own docstring). |

`StorageLocation` was added to the existing `apps.stores` app (an FK
child of `SharedStore`, mirroring `StoreMembership`'s placement there in
Task 07A) rather than a new app — "introduce an app only where
appropriate" did not apply to it. `UnitOfMeasure`/`MaterialCategory`/
`Material` are a genuinely new domain concern (a company/store-independent
shared catalog), so they got a new app, `apps.catalog`, mirroring how
`apps.permissions` was split out in Task 03 and `apps.stores` in Task
07A.

Two new STORE-scope permissions, seeded idempotently by an additive data
migration (`apps/permissions/migrations/0004_seed_catalog_and_location_
permissions.py`, `get_or_create`, mirroring Task 07A's
`0003_seed_shared_store_view_permission.py` exactly):
`shared_catalog.view` (`module="catalog"`) and `storage_locations.view`
(`module="stores"`). Neither is granted to any role or user automatically
— provisioning the catalog entry and granting access remain two separate
actions, as in Task 07A. No `GLOBAL` permission scope was introduced —
only the existing `COMPANY`/`STORE` choices are used; both new
permissions are `STORE`-scope, consulted the same way `shared_store.view`
already is.

### Authorization

| Concern | Rule |
|---|---|
| Catalog (units/categories/materials) writes | Active superuser only — create, update, activate, deactivate. |
| Catalog reads | An active user with active `StoreMembership` in **at least one** active store whose effective STORE permissions include `shared_catalog.view` — **or** an active superuser, as an explicit, documented administrative exception (read-only; grants nothing else). Company membership/role is never consulted. |
| Storage-location writes | Active superuser only, per store. |
| Storage-location reads | An active user with active membership in **the specific requested store** (from the URL) and `storage_locations.view` there — **or** an active superuser, who may read regardless of membership or the store's own active state. |
| Ordinary staff (`is_staff`, not superuser) | No bypass anywhere in this task — only `is_superuser` is ever consulted, never `is_staff`. |

The catalog's read check (`apps.catalog.permissions.CanReadSharedCatalog`)
is deliberately **not** store-specific — the catalog itself has no
`store_id` in its URLs, so "does this user hold `shared_catalog.view`
*anywhere*" is the right question, answered by a new selector,
`apps.permissions.services.user_has_permission_in_any_store()` (a single
`.exists()` query, deny-by-default, STORE-scope only, never consulting
company membership). The storage-location read check reuses the
existing, already-store-specific `store_user_has_permission()` from Task
07A unchanged.

The superuser read exception is scoped narrowly on purpose: it lives only
in the two read-permission checks above, is never reused for a write
`permission_classes`, and reading the catalog or a store's locations as a
superuser creates **no** `StoreMembership` row and grants **no** further
store access — regression-tested directly (a superuser who has just read
the catalog or a store's locations still has an empty
`active_stores_for_user()` result).

### Endpoints

Registered under `/api/v1/units/`, `/api/v1/material-categories/`,
`/api/v1/materials/` (each its own flat top-level prefix, all defined in
one `apps/catalog/urls.py` and included once at `/api/v1/`, the same
`apps.common.urls` pattern already used for the health endpoint), and
`/api/v1/stores/<store_id>/locations/` (nested, since a location is
inherently store-scoped).

| Resource | `GET` list | `POST` create | `GET` detail | `PATCH` | `POST activate/` | `POST deactivate/` |
|---|---|---|---|---|---|---|
| Units | ✓ | ✓ | ✓ | `name` only | ✓ | ✓ (see conflict rule) |
| Material categories | ✓ | ✓ | ✓ | `name`/`description` | ✓ | ✓ (see conflict rule) |
| Materials | ✓ | ✓ | ✓ | `name`/`description`/`category_id` | ✓ (see conflict rule) | ✓ (always) |
| Storage locations | ✓ | ✓ | ✓ | `name`/`description` | ✓ (rejected if store inactive) | ✓ (always) |

**Endpoint count, precisely**: 4 resources × 4 URL patterns each = **16
URL patterns**; each of the 4 resources serves `GET+POST` on its list
path and `GET+PATCH` on its detail path (2 operations each) plus one
`POST` each for activate/deactivate — **6 method+path operations per
resource, 24 in total** — confirmed by the same live URL-resolver
introspection technique used to reconcile Task 07A's counts above, not
estimated by hand.

List behaviour, all four resources: paginated
(`BoundedPageNumberPagination`), `?search=` across code/name,
`?is_active=` (strict — `parse_strict_bool`, `400` on anything else),
stable secondary `id` ordering. Materials additionally support
`?kind=RAW_MATERIAL|PACKAGING_MATERIAL` (validated against
`Material.Kind.values`, `400` otherwise), `?category=<id>` and
`?base_unit=<id>` (both validated as integers via the new
`apps.common.validation.parse_int_filter()` — a non-integer value is
`400`, not a silently-empty result, mirroring `parse_strict_bool`'s own
"reject clearly" rule). The materials list uses
`.select_related("category", "base_unit")` — confirmed via
`assertNumQueries` that listing multiple materials costs the same 3
queries (auth lookup, pagination count, one JOIN select) regardless of
row count.

Validation: every create/update serializer uses an explicit field
allowlist and explicitly rejects (`400`, not a silent drop)
`is_active`/immutable fields **and** `quantity`/`stock`/`company_id`/
`owner_id`/`company`/`owner` — none of these exist on any Task 07B model,
and rejecting them explicitly (rather than relying on them being absent
from `Meta.fields`, which DRF would just silently ignore) gives a caller
testing for that behaviour a clear answer. Duplicate-code races are
caught as `IntegrityError` and translated to `400`, never `500`, same
pattern as every prior task. Cross-store nested location IDs (a location
id that belongs to a different store than the one in the URL) return
`404` with no mutation, via the same
`get_object_or_404(StorageLocation, pk=location_id, store=store)`
compound-filter-in-one-query technique used for `StoreRole` in Task 07A.

For ordinary (non-superuser) callers specifically: no qualifying store
access to the catalog is `403` (an authenticated user with no
`shared_catalog.view` anywhere is a real, known account being denied a
real, existing resource — `403` is correct, not `404`). For storage
locations, an inaccessible, inactive, or nonexistent store is folded into
one `404` (mirroring `/companies/<id>/my-permissions/` and
`/stores/<id>/my-permissions/` from Tasks 04/07A — this endpoint's caller
should not be able to distinguish "store doesn't exist" from "not
yours"), while active membership in the *correct* store without
`storage_locations.view` is a `403` (at that point the store itself is
not in question, only the permission is). Administrative mutations never
depend on business membership — every write endpoint in this task is
gated by `IsActiveSuperuser` alone, regardless of whether that superuser
happens to also hold a `StoreMembership` anywhere.

### Lifecycle rules

- No hard-delete endpoint anywhere in this task (`405` on `DELETE`,
  consistent with every prior task).
- **Create/reactivate a material** is rejected (`400`) if the selected
  `base_unit` or `category` is inactive — a material must never end up
  pointing at a reference it cannot currently use. Reactivation
  specifically **re-checks** both references at the moment of
  reactivation (not just at original creation), since either could have
  been deactivated while the material itself was inactive.
- **`PATCH` a material** is rejected (`400`) only if it would **newly**
  assign an inactive category — re-submitting the *same* category the
  material already has is never rejected, even if that category has
  since become inactive by other means, because it is not a new
  assignment. Clearing the category (`category_id: null`) is always
  allowed.
- **Deactivating a unit or category** is rejected (`400`, a documented
  conflict — not a silent cascade, not a `500`) while any *active*
  `Material` still references it. Once every referencing material is
  itself inactive (or none exist), deactivation is allowed. This check
  lives in `apps.catalog.services.deactivate_unit()`/
  `deactivate_category()`, using the same `django.core.exceptions.
  ValidationError` → `translate_django_validation_error` → `400` pipeline
  as every other business-rule rejection in this project, kept
  deliberately consistent rather than introducing a new HTTP status
  convention (e.g. `409`) that no other endpoint in six prior tasks has
  ever used.
- **Deactivating a material** always succeeds once the material exists —
  nothing references a `Material` yet (stock/lot models are a future
  task), and it preserves the row's identity/history untouched (code,
  kind, base unit, category are all left exactly as they were).
- **Storage locations**: create/update/reactivate are rejected (`400`)
  while the parent store is inactive (mirroring `StoreRole`'s identical
  rule from Task 07A); deactivation is always allowed, for cleanup/
  revocation; rows are preserved untouched when the store itself is
  deactivated (regression-tested).
- Every lifecycle action (activate/deactivate on all four resources) is
  idempotent — a repeated call is a no-op, no duplicate audit entry.
- **No stock-related deactivation rule exists for locations** — this task
  implements no stock model at all, so there is nothing yet that could
  reference a location the way a `Material` references a unit/category.
  A later inventory task that adds stock balances per location will need
  to add an equivalent "does active stock still reference this location"
  guard at that point; it is explicitly **not** assumed or stubbed out
  here.

### Audit

Every catalog and location mutation is audited via the existing
`apps.audit.services.record()`, `@transaction.atomic`, called last so its
failure rolls back the business mutation (regression-tested for create
and deactivate on both apps). Before/after snapshots use the same
allowlisted-fields pattern as every prior task
(`name`/`description`/`category_id` for materials, `name` for units,
`name`/`description` for categories and locations). No-op requests
(identical `PATCH`, already-active/-inactive lifecycle calls) create no
audit entry.

**Catalog changes set neither `company` nor `store`** on the audit
entry — the catalog is shared, not owned by either, so `record()` is
called with both left at their `None` defaults rather than an arbitrary
company/store standing in as a fake "owner" (verified directly:
`entry.company_id is None and entry.store_id is None` for every catalog
action). **Storage-location changes set `store`** (never `company`),
consistent with every store-scoped action since Task 07A.

New audit actions: `unit.created`/`updated`/`activated`/`deactivated`,
`material_category.created`/`updated`/`activated`/`deactivated`,
`material.created`/`updated`/`activated`/`deactivated`,
`storage_location.created`/`updated`/`activated`/`deactivated`.

### Django Admin

`UnitOfMeasure`, `MaterialCategory`, `Material`, `StorageLocation` are
all registered **read-only** (`ReadOnlySuperuserAdminMixin`, reused
unchanged from Task 07A — no add/change/delete, even for an active
superuser). All mutations go through the audited REST API only,
consistent with every model Task 07A introduced.

### Verification

Automated tests, isolated `test_cmhp_new_dev` database:

| Check | Command | Result |
|---|---|---|
| System checks | `python manage.py check` | Passed — no issues |
| Migration consistency | `python manage.py makemigrations --check --dry-run` | Passed — no changes detected after all Task 07B migrations applied |
| Migrations applied | `python manage.py migrate` | Passed — `catalog.0001_initial` (additive: 3 `CreateModel`), `stores.0002_storagelocation` (additive: 1 `CreateModel`), `permissions.0004_seed_catalog_and_location_permissions` (data migration, idempotent `get_or_create`) |
| Full test suite | `python manage.py test tests -v 2` | Passed — **599/599** (463 from Tasks 01–07A + 136 new in `tests/test_catalog.py` and `tests/test_storage_locations.py`), isolated database created/destroyed automatically |

New tests cover: model uniqueness/normalisation/immutability (code,
dimension, kind, base_unit, store) for all four resources; admin
read-only restriction; full authorization matrix (anonymous `401`,
ordinary user/staff `403`/`404` as appropriate, store-permission-holder
`200`, superuser-without-membership `200` for reads and `403` for
writes, superuser read never granting operational access, company
membership/role never granting catalog or location access even when a
same-named `COMPANY`-scope permission exists, membership/role/store
deactivation revoking access on the very next lookup); required
fields/invalid kind-dimension/protected-field rejection;
search/pagination/`is_active`/`kind`/`category`/`base_unit` filter
validity (including malformed-value rejection); same location code
allowed in different stores; cross-store nested location `404` with no
mutation; inactive-unit/-category creation and reactivation rejection;
unit/category deactivation blocked by an active dependent material, then
allowed once it is inactive; every lifecycle action's idempotency; audit
snapshot accuracy (including the catalog's null-company/null-store
context) and rollback-on-failure; explicit rejection of
`quantity`/`stock`/`company_id`/`owner_id`; no hard deletion anywhere;
and that the existing 463 Tasks 01–07A tests still pass unchanged.

Postman JSON files parsed successfully with Python's `json` module after
being extended (21 top-level items: the 10 Task 04 requests plus ten
folders — the seven from Tasks 05–07A plus four new Task 07B folders,
"Units"/"Material Categories"/"Materials"/"Storage Locations" (6 requests
each); 84 requests total; 45 environment variables, the previous 31 plus
14 new ones). A manual flow document (superuser login → catalog/location
creation → assign read permissions to an existing store role →
ordinary-user login → permitted-vs-denied reads) was written into
`docs/postman/README.md` rather than automated end-to-end, since it
requires switching credentials mid-run, the same limitation already
documented for Task 05's "Testing denial" section. **Actually importing
the collection into the Postman GUI was not performed in this session —
manual Postman testing remains deferred**; the automated test suite above
is what actually exercises this behaviour.

### Known limitations (documented, not solved here)

- Same audit coverage boundary as Tasks 05–07A: only mutations through
  the service-layer functions are recorded. Not relevant to direct Django
  Admin edits here specifically, since all four new models are
  admin-read-only (see above) — there is no unaudited admin write path to
  bound.
- No unit-conversion engine — `base_unit` is a fixed identity reference;
  converting between units (e.g. grams to kilograms) is explicitly out of
  scope and not approximated.
- No bulk/mass catalog or location operations.
- `Material.category`'s reassignment is not audited as "was X, is now Y"
  beyond the plain `category_id` before/after snapshot already recorded —
  no separate "category history" is kept beyond the audit log itself.
- Physical/QC status of what is stored in a location is not modelled at
  all — `StorageLocation.name` is free text with no special meaning; lot/
  QC status is explicitly left for a future task to design on its own
  terms, per the brief's own instruction.
- Manual Postman GUI testing was not performed — see "Verification"
  above.

### Documentation corrections made in this task

Two inaccuracies in the existing Task 07A write-up were corrected as part
of this task (see `docs/backend-decisions.md`, Task 07B, for the full
reasoning):

1. The claim that omitting `SharedStore`'s company FK "must never be
   duplicated per company" conflated company-independence with
   duplicate-prevention — corrected to attribute duplicate-prevention to
   `SharedStore.code`'s `unique=True` constraint instead.
2. Task 07A's endpoint counts did not distinguish URL patterns from
   HTTP method+path operations — corrected, with the actual figures (16
   URL patterns / 22 operations for Task 07A) confirmed by introspecting
   the live URL resolver rather than re-counting by hand.

## Task 08A — Supplier Master

**Status: Complete.**

Scope: a basic, superuser-managed supplier directory — identity and
contact details only. Explicitly **not** implemented: purchase orders,
goods receipts, stock, supplier qualification/approval, bank details,
payments, pricing, tax calculation, document uploads or any frontend.
`Supplier.is_active` means "this record is in use", nothing more — an
active supplier is **not** automatically a qualified/approved supplier;
qualification/approval is an unmodelled future concept.

### Model

| Model | App | Notes |
|---|---|---|
| `Supplier` | `apps.suppliers` (new) | `code` (unique, normalised, immutable after creation), `legal_name` (required), `display_name`/`contact_name`/`email`/`phone`/`address_line_1`/`address_line_2`/`city`/`state_region`/`postal_code`/`country_code` (all optional, bounded-length, trimmed), `is_active`, timestamps. `email` validated (Django's `validate_email`) when supplied; `country_code` uppercased and, if supplied, must be exactly two letters. No unique constraint on `legal_name`/`phone`/`email`. No company/store-owner FK, no stock/qualification field. |

A new app, `apps.suppliers`, was created — a supplier is a genuinely new
domain concern, not a natural child of any existing app (unlike
`StorageLocation`, which is an FK child of `SharedStore` and stayed in
`apps.stores`). Mirrors the `apps.catalog` precedent from Task 07B.

**Provisional design decision, not a client-confirmed rule**: supplier
identity is modelled as a single shared directory, independent of which
company purchases from it — the same reasoning already used for
`SharedStore` (Task 07A) and `Material` (Task 07B). Which company
actually purchases from a given supplier, how that is recorded, and what
"qualified to supply" means are unresolved business decisions left
entirely to a later purchasing/qualification task; nothing here assumes
an answer.

**Known validation limitation** (same class of limitation already
documented for `Company`/every other `clean()`-based model in this
codebase): normalisation and the blank/whitespace/email/country-code
rules only run through `Supplier.save()`/`.full_clean()`. A direct
`QuerySet.update()` or `bulk_create()`/`bulk_update()` bypasses `clean()`
entirely. No endpoint in this task's API uses either path.

### Authorization

| Concern | Rule |
|---|---|
| All supplier endpoints (list/create/detail/PATCH/activate/deactivate) | Active superuser only (`IsActiveSuperuser`) — no read exception, unlike the Task 07B shared catalog. |
| Anonymous requests | `401`. |
| Ordinary users, ordinary staff (`is_staff`, not superuser) | `403` — no bypass. |
| Company or store membership/role, of any kind, including a role holding `shared_catalog.view` | Grants **nothing** here — regression-tested directly. |

No new permission scope and no reuse of `shared_catalog.view` — supplier
management is a distinct administrative concern from the shared material
catalog; the brief was explicit that "operational purchasing access will
be designed later," so no attempt was made to guess that design now.

### Endpoints

Registered under `/api/v1/suppliers/` (own top-level prefix, included
directly in `config/urls.py`, the same pattern as `/api/v1/companies/`,
`/api/v1/stores/`, `/api/v1/users/`).

| `GET` list | `POST` create | `GET` detail | `PATCH` | `POST activate/` | `POST deactivate/` |
|---|---|---|---|---|---|
| ✓ | ✓ | ✓ | all fields except `code` | ✓ | ✓ |

**Endpoint count, precisely**: **4 URL patterns**, **6 method+path
operations** (`GET`+`POST` on the list path, `GET`+`PATCH` on the detail
path, one `POST` each for activate/deactivate) — confirmed by the same
live URL-resolver introspection technique used for Tasks 07A/07B, not
estimated.

List: paginated (`BoundedPageNumberPagination`), `?search=` across
`code`/`legal_name`/`display_name`/`contact_name`, `?is_active=` (strict
— `400` on anything but `true`/`false`), stable `code`/`id` ordering.

Create: explicit writable-field allowlist (`code`, `legal_name`, plus the
ten optional contact/address fields); new suppliers always start active;
`is_active`, `created_at`, `updated_at`, and the established junk-field
set (`quantity`/`stock`/`company_id`/`owner_id`/`company`/`owner`) are all
explicitly rejected (`400`), not silently dropped. Duplicate normalised
codes are caught as `IntegrityError` and translated to `400`, never
`500` — including the uniqueness-race scenario (two creates racing for
the same normalised code).

PATCH: everything except `code` is updatable (`legal_name` plus the ten
optional fields); `code`, `is_active`, and the timestamps are rejected
(`400`). Omitted fields are left unchanged (`partial=True`). **Clearing
convention**: send an optional field as an empty string (`""`) to clear
it — the same convention `apps.catalog.serializers.
MaterialCategoryUpdateSerializer.description` already uses; `legal_name`
cannot be cleared this way (it stays required if present at all, same
rule as on create). Profile corrections are allowed while a supplier is
inactive.

No restrictions were invented based on purchase records, since none
exist yet — deactivation always succeeds once the supplier itself
exists (mirrors `Material`'s deactivation rule from Task 07B, for the
same reason: nothing references a `Supplier` yet).

### Lifecycle rules

- No hard-delete endpoint (`405` on `DELETE`, list and detail).
- Activate/deactivate are idempotent — a repeated call is a no-op, no
  duplicate audit entry.
- Deactivating a supplier preserves its row and history untouched.

### Audit

Every mutation (`supplier.created`/`updated`/`activated`/`deactivated`)
goes through the existing `apps.audit.services.record()`, wrapped in the
same `@transaction.atomic` service function as the business write, called
last so its failure rolls back the mutation (regression-tested for
create, update, and deactivate). Before/after snapshots use an explicit
allowlist (`apps.suppliers.services.SUPPLIER_TRACKED_FIELDS` — the eleven
identity/contact/address fields only). `company` and `store` are left at
their `None` defaults — the directory is shared, not owned by either.
No-op `PATCH`/lifecycle requests create no audit entry.

### Django Admin

`Supplier` is registered **read-only** (`ReadOnlySuperuserAdminMixin`,
reused unchanged from Tasks 07A/07B) — no add/change/delete, even for an
active superuser. All mutations go through the audited REST API only.

### Two documentation/authorization checks requested for this task

1. **"Ordinary company users can manage roles/memberships"** — this
   sentence appeared in a prior progress-review report and was
   inaccurate. Inspecting the actual `permission_classes` on
   `CompanyRoleListCreateView`/`RolePermissionsView`/
   `MembershipListCreateView`/`MembershipDeactivateView`/
   `RoleAssignmentListCreateView`/`RoleAssignmentDeactivateView` shows
   every one of them is `[IsActiveSuperuser]` — there never was a
   permission-based path for an ordinary company user to manage anyone's
   membership or role assignment, company role of their own or not. No
   authorization regression exists; nothing needed fixing in the
   authorization code itself. A new targeted regression test class,
   `tests.test_user_management.
   MembershipAndRoleAssignmentAuthorizationTests` (6 tests), was added to
   lock this in with direct evidence, including a case where the calling
   user genuinely holds an active company role in the target's own
   company and is still denied.
2. **"All existing Django Admin changes pass through durable audit"** —
   also inaccurate as a blanket claim. `Company`, `CompanyMembership`,
   `PermissionDefinition`, `CompanyRole`, `MembershipRole`, and `User` are
   all registered with `SuperuserOnlyAdminMixin` (not
   `ReadOnlySuperuserAdminMixin`) and allow direct `add`/`change` through
   Django Admin's default `ModelAdmin.save_model()`, which calls
   `obj.save()` directly and never calls `apps.audit.services.record()`.
   This is a real, pre-existing gap — but not a new regression and not
   this task's to fix: `apps/companies/admin.py`'s own
   `ReadOnlySuperuserAdminMixin` docstring already documents it explicitly
   ("Company/CompanyRole/etc. ... predate the audit trail's introduction
   ... changing their existing admin behaviour was out of scope"). Only
   models introduced from Task 07A onward (`SharedStore`,
   `StoreMembership`, `StoreRole`, `StoreRoleAssignment`,
   `UnitOfMeasure`, `MaterialCategory`, `Material`, `StorageLocation`, and
   now `Supplier`) are admin-read-only. This report corrects the
   inaccurate blanket claim; it does not redesign the audit system or
   retrofit the older models, which was explicitly out of scope.

### Verification

Automated tests, isolated `test_cmhp_new_dev` database:

| Check | Command | Result |
|---|---|---|
| System checks | `python manage.py check` | Passed — no issues |
| Migration consistency | `python manage.py makemigrations --check --dry-run` | Passed — no changes detected after the Task 08A migration was applied |
| Migrations applied | `python manage.py migrate` | Passed — `suppliers.0001_initial` (additive: 1 `CreateModel`) |
| Full test suite | `python manage.py test tests -v 2` | Passed — **671/671** (599 from Tasks 01–07B + 66 new in `tests/test_suppliers.py` + 6 new in `tests/test_user_management.py`'s `MembershipAndRoleAssignmentAuthorizationTests`), isolated database created/destroyed automatically, 814.6s |

New tests (`tests/test_suppliers.py`, 66 tests, plus 6 new regression
tests appended to `tests/test_user_management.py`) cover: model
uniqueness/normalisation/immutability, required-field and
whitespace-only rejection, invalid email/country-code rejection,
phone/postal-code strings retained verbatim, no company/store/
qualification/stock field; full authorization matrix (anonymous `401`,
ordinary user/staff `403`, company membership `403`, store membership
holding `shared_catalog.view` still `403`, superuser `200`/`403`
appropriately); admin read-only restriction; search/pagination/
`is_active`-filter validity; duplicate normalised code (including the
race scenario) as `400` not `500`; protected/unknown-field rejection on
create and update; `PATCH` field omission and empty-string clearing;
profile correction while inactive; missing supplier `404`; idempotent
activate/deactivate; audit snapshot accuracy and rollback-on-failure for
create/update/deactivate; no-op suppression; no hard deletion; and the
step-5 authorization regression check described above.

### Postman and documentation

New "Supplier Management" folder: 6 requests (List, Create, Get, Update,
Deactivate, Activate), synthetic example data, `managed_supplier_id`
environment variable (captured only on a successful create), credentials
left blank. Existing requests/folders untouched. `base_url` unchanged
(`http://127.0.0.1:8001`). Manual Postman GUI execution remains
deferred, per every prior task.

### Known limitations (documented, not solved here)

- Supplier identity is a **provisional** shared-directory design, not a
  client-confirmed purchasing/ownership rule (see "Model" above).
- No purchasing-company, shared-stock-ownership, or supplier
  qualification/approval concept exists anywhere in this task —
  `is_active` is purely a directory-membership flag.
- No purchase orders, receipts, stock, pricing, tax, bank details, or
  document uploads.
- Same admin-audit boundary already documented for Tasks 05–07B:
  `Company`/`CompanyMembership`/`PermissionDefinition`/`CompanyRole`/
  `MembershipRole`/`User` remain editable, unaudited, via Django Admin —
  a pre-existing gap from before the audit trail existed, not
  reintroduced or expanded by this task, and not fixed here (see the
  "documentation/authorization checks" section above).
- Manual Postman GUI testing was not performed.

## Task 08B-1 — Company-scoped Purchase Requests

**Status: Complete.**

Scope: the internal-need stage of purchasing only — `PurchaseRequest`
header and lines, draft creation/editing, submission, cancellation,
list/detail, COMPANY-scoped permissions, optimistic concurrency, and
audit. Explicitly **not** implemented in this task: approval/rejection,
Purchase Orders, suppliers on a request, prices, taxes, receipts,
reservations, or any stock movement. `SUBMITTED` means "sent for
review" only — it is never treated as approved and never authorizes a
purchase.

### Confirmed business decision

A `PurchaseRequest`'s `company` is the company that **needs** the
material — not necessarily the company that will place the resulting
Purchase Order, receive the supplier's bill, or legally own the stock
once it arrives. Example: Company B requests 100 bottles; which company
actually purchases/bills for those bottles is a separate decision made
later, at PO stage. See `docs/purchase-workflow-proposal.md` (updated
alongside this task) for the full context — the PO-stage
purchasing/billing-company question, stock ownership, cross-company
material use, and approval-level questions all remain **unresolved**;
this task answers only the PR-stage question above.

### Models

| Model | App | Notes |
|---|---|---|
| `PurchaseRequest` | `apps.purchasing` (new) | `company` (FK `Company`, `PROTECT`, immutable), `reference` (unique, server-generated, immutable, collision-safe — never `count()+1`), `status` (`DRAFT`/`SUBMITTED`/`CANCELLED`), `required_by` (optional date), `notes` (bounded, optional), `created_by` (FK user, `PROTECT`), `submitted_by`/`submitted_at`/`cancelled_by`/`cancelled_at` (nullable, server-managed), `cancellation_reason` (bounded, blank until cancellation), timestamps, `version` (optimistic-concurrency counter, starts at 1). No supplier, price, store, or stock field anywhere on this model. |
| `PurchaseRequestLine` | `apps.purchasing` | `purchase_request` (FK, `CASCADE` — a line is a composition child of its request, not an independent shared reference, unlike every `PROTECT`ed master-data FK elsewhere in this codebase), `line_number` (fixes display order across draft-line replacement), `material` (FK `Material`, `PROTECT`), `quantity` (`DecimalField(max_digits=14, decimal_places=3)`, DB `CheckConstraint > 0`), `unit` (FK `UnitOfMeasure`, `PROTECT`, always server-derived from `material.base_unit` — never client-supplied), `notes` (bounded, optional), plus four snapshot fields (`material_code_snapshot`/`material_name_snapshot`/`unit_code_snapshot`/`unit_name_snapshot`) populated only at submission. DB `UniqueConstraint(purchase_request, material)` — a material may appear at most once per request. |

`apps.purchasing` is a new app — purchasing is a genuinely new domain
concern, not a child of `apps.catalog`, `apps.suppliers`,
`apps.companies`, or `apps.stores`, mirroring the same test already
applied when `apps.catalog` (Task 07B) and `apps.suppliers` (Task 08A)
were created.

**Reference generation**: `PR-<YYYYMMDD>-<10 hex chars>`, the hex suffix
from `secrets.token_hex(5)` (cryptographically random, ~40 bits) — never
`count() + 1`, which breaks under concurrent creation or after any row
is ever removed from the sequence. A bounded retry loop (5 attempts, each
in its own savepoint) handles the astronomically unlikely case of a
collision; this is explicitly an internal identifier, not a finalised
statutory/business numbering scheme.

**Validation limitation for direct ORM/bulk writes**: `PurchaseRequestLine.
clean()` (called from `save()`) rejects a non-positive `quantity` before
the DB constraint is ever reached through the normal `.objects.create()`/
`.save()` path; the DB `CheckConstraint` exists specifically as a
backstop for `bulk_create()`/`bulk_update()`, which bypass `clean()`
entirely — the same documented limitation already noted on `Company`,
`Supplier`, and every other `clean()`-based model in this codebase.

**Unit handling**: a request always uses the material's existing
`base_unit` — there is no unit override field anywhere, and no
unit-conversion engine exists (unchanged since Task 07B). A `COUNT`-
dimension unit's quantity must be a whole number in this phase; a
fractional `COUNT` quantity is rejected (`400`) as an explicit,
documented implementation rule to revisit only if a future need for
fractional count units is confirmed.

### Authorization

Five new **COMPANY**-scope permission definitions, seeded idempotently
(`apps/permissions/migrations/0005_seed_purchase_request_permissions.py`,
`get_or_create`, same pattern as every prior permission-seeding
migration — none assigned to any role/user automatically):
`purchase_requests.view`, `purchase_requests.create`,
`purchase_requests.edit`, `purchase_requests.submit`,
`purchase_requests.cancel`.

| Concern | Rule |
|---|---|
| Every endpoint | Bearer authentication, plus active `CompanyMembership` in the URL's active `company`, plus the specific permission(s) that action requires. |
| List/detail (`GET`) | `purchase_requests.view`. |
| Create (`POST` list) | `purchase_requests.view` **and** `purchase_requests.create` — view is always required alongside a mutation permission, so no one can create a request they could not then also see. |
| Edit (`PATCH`) | `purchase_requests.view` **and** `purchase_requests.edit`. |
| Submit | `purchase_requests.view` **and** `purchase_requests.submit`. |
| Cancel | `purchase_requests.view` **and** `purchase_requests.cancel`. |
| Anonymous | `401`. |
| Nonexistent/inactive/inaccessible company, or a request belonging to a different company than the URL's | `404` — folded together deliberately, so a caller with no access to a company can never learn which of those is true. |
| Active company membership lacking a required permission | `403`, naming what is missing. |
| Superuser with no membership in the company, `is_staff` alone, store membership/permissions of any kind | **No access at all** — `404` (superuser/store-permission holders are resolved via `active_companies_for_user()`/`user_has_permission()`, neither of which ever consults `is_superuser`/`is_staff`, and neither of which is affected by any `StoreMembership`). **This is deliberately stricter than Task 07B's shared-catalog/storage-location administrative-read exception** — no equivalent superuser bypass exists anywhere in this task; see `docs/backend-decisions.md`, Task 08B-1. |
| Existing administrative APIs (companies, users, roles, catalog, suppliers, storage locations) | Unchanged by this task. |

### Endpoints

Registered under `/api/v1/companies/<company_id>/purchase-requests/`
(a second `include()` alongside `apps.companies.urls` under the same
`api/v1/companies/` prefix, mirroring how `apps.catalog`/`apps.stores`
already share URL space with other apps).

| Method | Path | Purpose |
|---|---|---|
| `GET` | `.../purchase-requests/` | List, company-scoped, paginated |
| `POST` | `.../purchase-requests/` | Create a `DRAFT` |
| `GET` | `.../purchase-requests/<id>/` | Detail, with lines |
| `PATCH` | `.../purchase-requests/<id>/` | Edit a `DRAFT` |
| `POST` | `.../purchase-requests/<id>/submit/` | `DRAFT` → `SUBMITTED` |
| `POST` | `.../purchase-requests/<id>/cancel/` | `DRAFT`/`SUBMITTED` → `CANCELLED` |

**4 URL patterns, 6 method+path operations** — confirmed by the same
live URL-resolver introspection technique used for every prior task.

**Example request bodies** (all against
`/api/v1/companies/<company_id>/purchase-requests/...`):

```json
// POST .../purchase-requests/  (create - company/created_by/status/reference/version never in the body)
{
  "required_by": "2026-12-01",
  "notes": "Running low on packaging film",
  "lines": [
    {"material_id": 42, "quantity": "150.000", "notes": "for line 3"}
  ]
}
```

```json
// PATCH .../purchase-requests/<id>/  (draft only; expected_version always required)
{
  "expected_version": 1,
  "notes": "Updated quantity after checking stock",
  "lines": [
    {"material_id": 42, "quantity": "200.000"}
  ]
}
```

```json
// POST .../purchase-requests/<id>/submit/
{"expected_version": 2}
```

```json
// POST .../purchase-requests/<id>/cancel/  (cancellation_reason always required, even on a retry)
{"expected_version": 3, "cancellation_reason": "Shortage resolved from existing stock"}
```

**List**: `BoundedPageNumberPagination`, `?search=` against `reference`
only, strict `?status=` (`400` on anything outside
`DRAFT`/`SUBMITTED`/`CANCELLED`), stable `-created_at`/`-id` ordering,
always filtered to the URL's authorized company before any other filter
is applied. `select_related`+`prefetch_related` keep the list at a fixed
8-query budget regardless of row/line count (auth lookup, company
resolution, permission check, pagination count, main joined select, and
one batched prefetch each for lines/materials/units).

**Create**: always `DRAFT`; `company` comes exclusively from the URL,
never the body; `created_by` is always the authenticated caller. Accepts
`required_by`, `notes`, and `lines` (an empty list is explicitly
allowed — an empty draft is valid). Returns `201` with `reference`,
`version`, and `lines`. Explicitly rejects (`400`) client-supplied
`status`, every actor/timestamp field, `reference`, `company`/
`company_id`, `version`, and, per line, any `unit`/`unit_id`/price/
supplier field — none of these have a writable path through this
endpoint. Duplicate materials within one request (including a DB-level
race) are `400`, never `500`.

**PATCH**: `DRAFT` only (`400` otherwise); always requires
`expected_version` (see "Concurrency" below); editable fields are
`required_by`/`notes`/`lines`, each independently omittable — an omitted
field is left unchanged, and `lines` (if present at all, even as `[]`)
is a **complete replacement** of the existing line set, fully validated
before a single row is touched (an invalid replacement changes nothing —
regression-tested). A `PATCH` that would not actually change anything is
a no-op: no version increment, no audit entry.

**Submit**: requires `expected_version`; `DRAFT` → `SUBMITTED` only;
requires at least one line (`400` on an empty request); revalidates every
line's material, base unit, and (if assigned) category are still active,
and rejects a `required_by` date that has since fallen into the past —
any of these could have changed since the line was added to the draft.
Freezes each line's material/unit code+name into its snapshot fields at
this exact moment (regression-tested to survive a later rename of the
live material/unit). No stock, Purchase Order, or approval side effect
of any kind.

**Cancel**: requires `expected_version` and a non-blank, bounded
`cancellation_reason` every time, including on a retry; `DRAFT` or
`SUBMITTED` → `CANCELLED`; records the acting user/time/reason; preserves
every line and any submitted snapshot; a cancelled request can never be
edited or submitted again (`400`) — no reopening exists in this slice.

`DELETE` returns `405` on both the list and detail path — there is no
hard-delete API for a request header, consistent with every resource in
this project.

### Concurrency and retry semantics

Every mutation locks the parent row (`select_for_update()`) and checks
`expected_version` against the current `version` while holding that
lock, before reading anything else for comparison:

| Situation | Result |
|---|---|
| `expected_version` does not match the current `version` | `409`, no changes applied. |
| `PATCH` that changes nothing (every supplied value already matches) | No-op — version unchanged, no audit entry. |
| `PATCH`/submit/cancel that does change something | Version increments by exactly 1, one audit entry. |
| Submit at the *current* version, request already `SUBMITTED` | Idempotent no-op — unchanged resource returned, no further mutation, no new audit entry. |
| Submit against a `CANCELLED` request | `400` regardless of version — no transition exists back from `CANCELLED`. |
| Cancel at the *current* version, request already `CANCELLED`, *same* reason supplied | Idempotent no-op. |
| Cancel at the *current* version, request already `CANCELLED`, a *different* reason supplied | `409` — the caller's local copy does not match what actually happened; refetch and review rather than silently overwrite cancellation history. |

This provides **state-transition retry safety only** — a caller who
already has a resource's current `version` can safely retry a
submit/cancel call and get a consistent, non-duplicating result. **This
is explicitly not create-request deduplication**: `POST` to create a new
`PurchaseRequest` is not idempotent, and two identical `POST` calls will
always create two separate requests with two separate references.

Real concurrent-transition behaviour (not just sequential idempotency)
is regression-tested with a genuine multi-threaded `TransactionTestCase`:
two threads submit the same request at the same starting version
simultaneously; exactly one succeeds and the other receives `409` after
blocking on the row lock and finding the version already moved.

### Audit

Every mutation (`purchase_request.created`/`updated`/`submitted`/
`cancelled`) goes through the existing `apps.audit.services.record()`,
inside the same `@transaction.atomic` service function as the business
write, called last so its failure rolls back the entire change —
including the header, every line, and the `version` increment
(regression-tested for all four actions). Before/after snapshots use an
explicit allowlist; a `lines`-replacing update's audit entry carries the
full before/after line lists (material/quantity/notes only — never a raw
request body, never a password or token). `company` is always set on the
audit entry; `store` is always left `None` — this is a company-scoped
resource with no store dimension at all.

### Django Admin

`PurchaseRequest` is registered **read-only**
(`ReadOnlySuperuserAdminMixin`, reused unchanged) with its lines shown
as a read-only inline — no add/change/delete, even for an active
superuser. All mutations go through the audited REST API only.

### Two focused checks from the prior progress review (see also
`docs/backend-decisions.md`, Task 08B-1, for the full reasoning)

1. **"Ordinary company users can manage roles/memberships"** was an
   inaccurate sentence in an earlier report. Every relevant view
   (`CompanyRoleListCreateView`, `MembershipListCreateView`,
   `RoleAssignmentListCreateView`, etc.) has always been
   `[IsActiveSuperuser]`-only — no regression exists. This was already
   corrected once (Task 08A); Task 08B-1 does not reopen it, but its own
   authorization design (real permission-gated, non-superuser business
   access) is intentionally not confused with that superuser-only
   administrative tier.
2. Purchase Requests deliberately do **not** get the Task 07B-style
   "active superuser may read without membership" administrative
   exception — every endpoint, read or write, requires the exact same
   active-membership-plus-permission check, with zero `is_superuser`/
   `is_staff` special-casing anywhere in `apps.purchasing.views`. This is
   a stricter authorization shape than the shared catalog/storage
   locations, by design (see decisions doc).

### Verification

| Check | Command | Result |
|---|---|---|
| System checks | `python manage.py check` | Passed — no issues |
| Migration consistency | `python manage.py makemigrations --check --dry-run` | Passed — no changes detected after all Task 08B-1 migrations applied |
| Migrations applied | `python manage.py migrate` | Passed — `purchasing.0001_initial` (additive: 2 `CreateModel`), `permissions.0005_seed_purchase_request_permissions` (data migration, idempotent `get_or_create`) |
| Full test suite, first run | `python manage.py test tests -v 2` | **753 tests, FAILED (failures=1)** — `tests.test_store_permissions.PermissionCatalogScopeFilterTests.test_scope_filter_company` asserted the live `?scope=COMPANY` permission catalog was exactly `{"orders.view", "orders.create"}` (a pre-existing test predating this task); it did not account for this task's own five new seeded COMPANY-scope permissions and was therefore stale, not a defect in the new Purchase Request code. This first run is **not** reported as a pass. |
| Test fix | — | `test_scope_filter_company` updated to expect `{"orders.view", "orders.create", "purchase_requests.view", "purchase_requests.create", "purchase_requests.edit", "purchase_requests.submit", "purchase_requests.cancel"}` — the same class of fix already applied once before to its STORE-scope sibling, `test_scope_filter_store`, in Task 07B. |
| Full test suite, corrected run | `python manage.py test tests -v 2` | **Passed — 753/753, OK, exit code 0**, 1003.2s. Captured from an actual second full run after the fix, not assumed from the fix alone. |

New tests (`tests/test_purchase_requests.py`) cover: model
uniqueness/immutability/constraints (including the `bulk_create`-only DB
backstop for the positive-quantity check); admin read-only restriction;
full authorization matrix (anonymous `401`, no-permission member `403`,
non-member/inactive-company/deactivated-membership `404`, superuser
without membership `404`, store-permission holder `404`, cross-company
list/detail isolation); empty-draft-allowed vs. empty-submission-rejected;
valid/zero/negative/excessive-precision/fractional-`COUNT` quantities;
duplicate-material rejection; active material/unit/category
revalidation at submit; protected/unknown field rejection (header and
line level); atomic full-line-replacement (including "invalid
replacement changes nothing"); `PATCH` field-omission vs.
empty-line-list; submitted-snapshot preservation after a later
master-data rename; every lifecycle restriction and cancellation-reason
rule above; stale-version `409`s; genuine concurrent-transition locking
via `TransactionTestCase`; every retry/no-op rule above; audit
correctness and full rollback (header+lines+version) on injected audit
failure for all four mutating actions; no unrelated row is ever created
by submit; pagination/search/status-filter validation; and `405` on
`DELETE`.

Postman: new "Purchase Requests" folder, six requests, in the exact
order they are meant to be run: **1. Create purchase request draft**
(saves `purchase_request_id`/`purchase_request_version`), **2. List
purchase requests**, **3. Get purchase request** (refreshes
`purchase_request_version`), **4. Update purchase request draft**
(requires and refreshes `purchase_request_version`), **5. Submit
purchase request** (requires and refreshes `purchase_request_version`),
**6. Cancel purchase request** (requires `purchase_request_version` and
a `cancellation_reason`). `purchase_request_id`/`purchase_request_version`
are new environment variables, captured on every successful response.
`docs/postman/README.md` documents that an administrator must first
create/assign a company role holding all five new permissions to the
member who will run this folder — **a superuser login alone is
insufficient**, since every endpoint requires active `CompanyMembership`
plus the specific permission, with no administrative-read exception
anywhere in this resource.

### Known limitations (documented, not solved here)

- No approval/rejection workflow — `SUBMITTED` is not `APPROVED` and
  authorizes nothing. This is the very next open question (approval
  levels, who approves) and remains entirely unanswered.
- No Purchase Order, no supplier on a request, no price, no tax, no
  stock reservation, no stock movement of any kind.
- The purchasing/billing company for a resulting PO, legal stock
  ownership, and cross-company material use are all still open — see
  `docs/purchase-workflow-proposal.md`.
- `POST` create is not idempotent; only state *transitions*
  (submit/cancel) have retry-safe semantics.
- `reference` is an internal identifier only, not a finalised
  statutory/business numbering scheme.

## Task 08B-2 — Purchase Request Approval

**Status: Complete.**

Scope: a three-step approval workflow on top of Task 08B-1's
`PurchaseRequest`/`PurchaseRequestLine` — `approve`/`reject`/`revise`
actions, append-only round/step decision history, a fix to an
authorization gap Task 08B-1 left in `cancel`, and nothing else.
Explicitly **not** implemented: Purchase Orders, suppliers on a request,
prices, taxes, receipts, reservations, or any stock movement — approval
still authorizes nothing beyond itself. The three-step sequence and the
"Business Admin" permission-based role model are the client's own
confirmed decisions for this task (see the request that opened it); the
illustrative Store Manager/Purchase Manager/Director labels used in
`docs/purchase-workflow-proposal.md`'s earlier proposal were **not**
adopted — every step is decided by whoever holds
`purchase_requests.approve`, using neutral "step 1/2/3" numbering only.

### Confirmed business decisions (this task)

- Exactly three sequential approval steps, each decided by a company
  member holding `purchase_requests.approve` — not three different
  permissions or three different roles, one permission used at every
  step.
- `purchase_requests.approve` is what makes someone a "Business Admin"
  for this workflow. It is a normal COMPANY-scope permission, assigned
  through the existing role APIs (`CompanyRole`/`MembershipRole`) like
  any other — **not** Django `is_superuser`, `is_staff`, or shared-store
  access, and not automatically granted to anyone.
- The requester can never decide (approve **or** reject) their own
  request — no exception exists for this, including for a superuser who
  also happens to hold `purchase_requests.approve`.
- A rejected request can be revised (`REJECTED` → `DRAFT`, an explicit
  action) and resubmitted; resubmission always starts a **new** round at
  step 1 — it never resumes from whichever step rejected the previous
  round.
- `created_by` (the original requester) is preserved through every
  revision — revising never reassigns who a request belongs to.
- Approval produces no Purchase Order and no stock movement — this task
  changes `PurchaseRequest.status` and its own history rows only.

### Provisional (client-unconfirmed) restriction adopted for this build

The client has not confirmed whether the same Admin may decide more than
one step of the same approval round. Rather than silently allow it, this
implementation conservatively **requires a different eligible approver
at each step within one round** — the same user who decided step 1
cannot also decide step 2 or 3 of that same round (a later round, after
a reject/revise/resubmit, is unaffected — the restriction resets per
round). This is documented as **provisional, not confirmed policy** in
both `docs/purchase-workflow-proposal.md` and inline in
`apps.purchasing.services._reject_if_self_or_repeat_decider`. There is no
automatic fallback if this leaves a step with no further eligible
decider — the request simply stays pending until an administrator grants
`purchase_requests.approve` to another eligible person; nothing in this
task invents a bypass of either the self-decision ban or this
restriction.

### Models

| Model | App | Notes |
|---|---|---|
| `PurchaseRequest` (extended) | `apps.purchasing` | `status` gains `APPROVED`/`REJECTED` alongside the existing `DRAFT`/`SUBMITTED`/`CANCELLED`. New `current_round` (0 until first submit, then increments by 1 on every actual DRAFT→SUBMITTED transition — never decremented) and `current_step` (1–3 while `SUBMITTED`, else `null`). |
| `PurchaseRequestApprovalRound` | `apps.purchasing` (new) | One row per approval round. `purchase_request` (FK, `CASCADE`), `round_number`, `required_by_snapshot`/`notes_snapshot` (frozen at that round's submit — never touched again once written, unlike `PurchaseRequestLine`'s own snapshot fields, which the *next* submit is free to overwrite), `submitted_by`/`submitted_at`, `outcome` (`PENDING`/`APPROVED`/`REJECTED`/`CANCELLED`), `closed_at`. `UniqueConstraint(purchase_request, round_number)`. |
| `PurchaseRequestApprovalRoundLine` | `apps.purchasing` (new) | A permanent, structurally-identical copy of each line as it stood when its round was submitted — this is what lets a reject→revise→resubmit cycle keep every earlier round's submitted material/quantity forever even though the live `PurchaseRequestLine` rows get replaced wholesale by the next edit. `UniqueConstraint(round, line_number)`, DB `CheckConstraint(quantity > 0)`. |
| `PurchaseRequestApproval` | `apps.purchasing` (new) | One **append-only** row per decision: `round` (FK, `CASCADE`), `step`, `decision` (`APPROVED`/`REJECTED`/`CANCELLED`), `actor` (FK user, `PROTECT`), `decided_at`, `reason` (required non-blank for `REJECTED`/`CANCELLED`, always blank for `APPROVED`). `UniqueConstraint(round, step)` — the database-level backstop against ever recording two decisions for the same step of the same round, on top of the row-locking that already prevents it. |

Migrations: `purchasing.0002_approval_workflow` (additive — 2 `AddField`,
1 `AlterField` for the new status choices, 3 `CreateModel`, 4
`AddConstraint`) and `purchasing.0003_migrate_existing_submitted_
requests_to_round_one` (data migration — see "Existing-data migration
compatibility" below). `permissions.0006_seed_purchase_request_approval_
permissions` (data migration, idempotent `get_or_create`, same pattern as
0005).

### Authorization

Two new **COMPANY**-scope permissions, seeded idempotently and assigned
to nobody automatically, same convention as every prior permission
migration: `purchase_requests.approve` (decide any pending step — approve
or reject), `purchase_requests.cancel_pending` (cancel a `SUBMITTED`
request at any step).

| Concern | Rule |
|---|---|
| Approve | `purchase_requests.view` **and** `purchase_requests.approve`. |
| Reject | Same as approve — one permission decides *and* rejects; there is no separate reject-only permission. |
| Revise | `purchase_requests.view` **and** `purchase_requests.edit` — revising reopens the request for editing, so it is gated exactly like `PATCH`. |
| Cancel, `DRAFT` | `purchase_requests.view` **and** `purchase_requests.cancel` — **unchanged from Task 08B-1**. |
| Cancel, `SUBMITTED` (pending) | `purchase_requests.view` **and** `purchase_requests.cancel_pending` — **new in this task**; holding `purchase_requests.cancel` alone is no longer sufficient (see "Cancellation authorization fix" below). |

**Where the state-dependent cancel check actually runs**: which
permission cancel needs depends on the request's *current* status
(`DRAFT` vs `SUBMITTED`), and that status can change between an unlocked
view-layer read and a locked mutation (e.g. a concurrent submit). Deciding
the required permission from a pre-lock read would silently reopen the
exact gap this task closes, so the authoritative check happens inside
`apps.purchasing.services.cancel_purchase_request`, after the row is
locked — the one deliberate exception to this project's rule that every
permission check lives at the view layer (see `apps.common.errors.
Forbidden`, new this task, and `docs/backend-decisions.md`). The view
still does a cheap pre-check (at least one of the two permissions must be
held) purely to fail fast for an obviously unauthorized caller.

### Endpoints

Three new actions under the same `/api/v1/companies/<company_id>/
purchase-requests/<id>/` resource — no per-step URL; approve/reject
always act on whichever step is currently pending.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `.../purchase-requests/<id>/approve/` | Approve the pending step; advances it by one, or → `APPROVED` on the final step |
| `POST` | `.../purchase-requests/<id>/reject/` | Reject the pending step; → `REJECTED`, closes the round |
| `POST` | `.../purchase-requests/<id>/revise/` | `REJECTED` → `DRAFT`; the sole way back to an editable draft |

**7 URL patterns, 9 method+path operations** total for this resource now
(4 from Task 08B-1 plus these 3), confirmed by the same live
URL-resolver introspection technique used throughout this project.

**Example request bodies**:

```json
// POST .../purchase-requests/<id>/approve/
{"expected_version": 4, "expected_round": 1, "expected_step": 2}
```

```json
// POST .../purchase-requests/<id>/reject/  (rejection_reason always required)
{"expected_version": 4, "expected_round": 1, "expected_step": 2, "rejection_reason": "Quantity exceeds this quarter's budget"}
```

```json
// POST .../purchase-requests/<id>/revise/  (REJECTED only)
{"expected_version": 5}
```

**Approve**: only from `SUBMITTED`; `expected_version` **and**
`expected_round` **and** `expected_step` must all match the request's
current state exactly, or `409` — a plain version match is not enough by
itself, since a retried call could otherwise land on the *next* step's
approval by accident once an earlier call already advanced
`current_step`. Rejects (`400`) the requester deciding their own request,
and (`400`, provisional) the same approver deciding a second step within
the same round. Only the third step's approval sets `status=APPROVED` and
closes the round (`outcome=APPROVED`); every earlier step only advances
`current_step` and leaves the request `SUBMITTED`. No idempotent-retry
branch exists here (unlike submit/cancel) — every mismatch is a hard
`409`, by design.

**Reject**: same round/step-match and eligibility rules as approve, plus
a required non-blank `rejection_reason`. Moves straight to `REJECTED` and
closes the round (`outcome=REJECTED`) regardless of which step rejected
it — there is no "reject just this step, continue the round" outcome.

**Revise**: `REJECTED` → `DRAFT` only. Idempotent no-op (`200`) if already
`DRAFT` **and** `current_round > 0` — that combination can only mean this
`DRAFT` was genuinely reached via a prior `REJECTED` → `DRAFT` revise
(nothing else ever leaves a request in `DRAFT` except creation, which
starts at `current_round=0`). A fresh, never-submitted `DRAFT`
(`current_round == 0`) is deliberately **not** treated the same way —
`400`, "nothing to revise" — since collapsing every already-`DRAFT`
request into one idempotent branch would silently accept `revise` called
on something that was never even submitted, let alone rejected, as a
harmless retry. Any other non-`REJECTED` status is also `400`. Does not
itself touch `lines`/`notes`/`required_by` — use the existing `PATCH`
afterwards, same as any other draft edit. Never touches `created_by`,
`current_round`, or `current_step` — the next submit increments
`current_round` and resets `current_step` to 1 regardless of their value
at the time of revision.

**Cancellation authorization fix**: `cancel_purchase_request` now refuses
(`400`) to act on `APPROVED`/`REJECTED` (only `DRAFT`/`SUBMITTED` can be
cancelled), and a `SUBMITTED` cancellation now additionally records a
`CANCELLED` `PurchaseRequestApproval` row against whichever step was
pending and closes that round (`outcome=CANCELLED`) — exactly like a
rejection closes it, just without ending in `REJECTED`.

### Detail response additions

`PurchaseRequestSerializer` (used by list/detail/every mutating
endpoint's response) now also returns `current_round`, `current_step`,
and `approval_rounds` — every round this request has ever had, each with
its frozen header snapshot, its own permanent line snapshot, and every
decision recorded against it (step, decision, acting user, timestamp,
reason). All of it read-only; subject to the same `purchase_requests.
view` check as everything else on this resource — no separate history
permission exists.

### Concurrency and retry semantics (extending Task 08B-1's table)

| Situation | Result |
|---|---|
| Approve/reject: `expected_version` matches but `expected_round`/`expected_step` does not (or vice versa) | `409` — refetch and retry, exactly like a version mismatch. |
| Approve/reject against a request that is not `SUBMITTED` | `400`. |
| Two admins race to approve/reject the same pending step | Exactly one succeeds (locks `PurchaseRequest` **and** the current `PurchaseRequestApprovalRound` row); the other's retry sees the already-advanced round/step and gets `409` — regression-tested with a genuine multi-threaded `TransactionTestCase`, mirroring Task 08B-1's own concurrent-submit test. |
| Cancel a `SUBMITTED` request without `purchase_requests.cancel_pending` (holding only `purchase_requests.cancel`) | `403`, decided post-lock (see "Authorization" above) — this is the fixed gap, not a new one. |
| Revise at the *current* version, request already `DRAFT` with `current_round > 0` (genuinely reached via a prior revise) | Idempotent no-op, mirroring submit/cancel's existing convention. |
| Revise against a `DRAFT` with `current_round == 0` (never submitted at all) | `400` — deliberately **not** idempotent; see "Revise" above. |

### Audit

Every new mutation (`purchase_request.approved`/`rejected`/`revised`,
plus the extended `purchase_request.cancelled` for the pending case) goes
through `apps.audit.services.record()` inside the same
`@transaction.atomic` service function as the business write and the
round/decision-row writes, called last so its failure rolls back
everything — regression-tested for all four actions, including that a
failed pending-cancel leaves the round `PENDING` and writes no
`PurchaseRequestApproval` row.

### Django Admin

`PurchaseRequestApprovalRound` (with its lines and decisions as
read-only inlines) and `PurchaseRequestApproval` are both registered
**read-only** (`ReadOnlySuperuserAdminMixin`, reused unchanged) — no
admin write path exists or should exist for this history; every write
goes through the audited REST API only.

### Existing-data migration compatibility

Any `PurchaseRequest` that reached `SUBMITTED` under Task 08B-1, before
this task's tables existed, has `current_round=0`/`current_step=null` and
no `PurchaseRequestApprovalRound` row — to the new approval code that
looks identical to a `DRAFT` never submitted, and approve/reject would
refuse to act on it. `purchasing.0003_migrate_existing_submitted_
requests_to_round_one` additively backfills exactly what
`submit_purchase_request` would have written had this task existed at the
time: one `round_number=1`, `outcome=PENDING` round (using the request's
own `submitted_by`/`submitted_at`/`required_by`/`notes`), one
`PurchaseRequestApprovalRoundLine` per existing line (copying the
`*_snapshot` fields Task 08B-1's submit had already frozen), and sets
`current_round=1`/`current_step=1` — so a pre-existing `SUBMITTED`
request starts approval at round 1, step 1, exactly like one submitted
for the first time after this migration. `DRAFT`/`CANCELLED` requests are
untouched. Regression-tested directly against the migration's own
`RunPython` functions (forward backfill, reverse, "a `DRAFT` is
untouched," "an already-migrated row is not touched twice").

### Verification

| Check | Command | Result |
|---|---|---|
| System checks | `python manage.py check` | Passed — no issues |
| Migration consistency | `python manage.py makemigrations --check --dry-run` | Passed — no changes detected after all Task 08B-2 migrations applied |
| Targeted app tests, first run | `python manage.py test tests.test_purchase_requests -v 1` | **127 tests, FAILED (failures=1, errors=2)** - not reported as passing; see "Test fix" below |
| Test fix | — | Three test-only bugs, none a defect in the shipped code: (1) `ConcurrentTransitionTests` gained a second test method and needed `serialized_rollback = True` added - `TransactionTestCase` flushes the whole database (including migration-seeded `purchase_requests.*` permissions) after every test method by default, and without that flag the second method saw an empty permission catalog; (2) `test_approved_cannot_be_cancelled` reused one admin for all three approvals, tripping the provisional distinct-approver-per-step restriction it was not testing - fixed to use three distinct admins; (3) the original `test_revise_only_from_rejected` assumed calling `revise` on any already-`DRAFT` request was an error - on review this exposed a real gap in the *contract itself*, not just the test: a fresh, never-submitted `DRAFT` and a `DRAFT` genuinely reached via `REJECTED` → `DRAFT` are different situations that a single "already `DRAFT` = idempotent" rule was conflating. `revise_purchase_request` was tightened to distinguish them via `current_round` (see "Revise" above), and the test was split into `test_revise_never_submitted_draft_400` (fresh draft, real `400`) and `test_revise_idempotent_on_already_draft` (genuine post-reject retry, real `200`) - both asserting `current_round` directly so the distinction is checked, not assumed. |
| Targeted app tests, corrected run | `python manage.py test tests.test_purchase_requests -v 1` | **Passed — 127/127, OK**, 239.6s |
| Full regression suite, first run | `python manage.py test tests -v 1` | **798 tests, FAILED (failures=1)**, 1009.97s — not reported as passing. `tests.test_store_permissions.PermissionCatalogScopeFilterTests.test_scope_filter_company` asserted the live `?scope=COMPANY` permission catalog was exactly the seven Task 08B-1 codes; it did not account for this task's own two new seeded codes (`purchase_requests.approve`, `purchase_requests.cancel_pending`) and was therefore stale - the same class of fix already applied once before to this exact test in Task 08B-1, when its own five new codes caused the identical failure. Not a defect in Task 08B-2's own code. |
| Test fix | — | `test_scope_filter_company` updated to also expect `purchase_requests.approve`/`purchase_requests.cancel_pending` in the COMPANY-scope set. |
| Full regression suite, corrected run | `python manage.py test tests -v 1` | **Passed — 798/798, OK**, 1103.97s. Captured from an actual second full run after both this fix and the revise-contract refinement above, not assumed from either fix alone. 798 = the pre-existing 753 (which already counted Task 08B-1's 82 purchasing tests) minus those 82, plus this task's 127 — confirmed against the run's own "Ran 798 tests" line, not computed and assumed. |

New tests (`tests/test_purchase_requests.py`, +45 vs. Task 08B-1's 82)
cover: step-by-step advancement and the final-step-only `APPROVED`
transition; requester-cannot-decide-own-request (including a superuser
who also holds `purchase_requests.approve`); an alternate admin
approving when the requester is themselves an admin; the provisional
same-admin-cannot-decide-two-steps restriction; stale
version/round/step `409`s; rejection's required reason and immediate
round closure; revise's `REJECTED`-only guard, idempotency, and
`created_by` preservation; round/line snapshot preservation across a
reject→revise→edit→resubmit cycle (including that an earlier round's
history is provably untouched by a later round's decisions); the
cancellation authorization fix in both directions (`cancel`-only cannot
cancel `SUBMITTED`, `cancel_pending`-only cannot cancel `DRAFT`, holding
neither is `403` at the view layer); `APPROVED` cannot be cancelled;
company isolation on the new endpoints; genuine concurrent-approval
locking via `TransactionTestCase`; audit rollback for all four new/
changed mutations; and the existing-`SUBMITTED`-request migration
backfill (forward, reverse, untouched-`DRAFT`, not-touched-twice).

Postman: three new requests added to the existing "Purchase Requests"
folder — **7. Approve purchase request**, **8. Reject purchase request**,
**9. Revise purchase request** — plus a documented setup addendum
(granting `purchase_requests.approve`/`purchase_requests.cancel_pending`
to a *second* ordinary member, since the requester can never decide their
own request and Postman only holds one active session's tokens at a
time). See `docs/postman/README.md` §18 for the exact run order.

### Known limitations (documented, not solved here)

- The same-admin-per-step restriction is **provisional** — conservative
  by design, not a confirmed client decision. See "Provisional
  restriction" above.
- No automatic escalation/reassignment/notification if a step has no
  eligible decider (self-excluded requester, or every otherwise-eligible
  admin already decided an earlier step this round) — the request simply
  stays pending indefinitely until an administrator intervenes outside
  this system.
- Still no Purchase Order, supplier, price, tax, stock reservation, or
  stock movement anywhere — approval authorizes nothing beyond itself.
- The illustrative Store Manager/Purchase Manager/Director role mapping
  from the earlier design proposal was **not** implemented — every step
  uses the same `purchase_requests.approve` permission. If the client
  later wants distinct per-step roles/permissions, that is a new,
  unscheduled task.
- `revise` does not itself let the caller edit lines/notes/required_by in
  the same call — a separate `PATCH` is required, same two-step shape as
  any other draft edit.

## Task 08C-1 — Purchase Order Draft APIs

**Status: Complete.**

Scope: draft-only Purchase Orders generated from an already-`APPROVED`
PurchaseRequest — `PurchaseOrder`/`PurchaseOrderLine` models, create/
list/detail/edit/cancel, COMPANY-scoped permissions, optimistic
concurrency, and audit. Explicitly **not** implemented: issue/send, a
separate PO-level approval workflow, goods receipt, QC, stock balances
or movements, invoicing, or any Tally/accounting integration. See
`docs/purchase-order-proposal.md` for the full policy write-up this
section only summarises.

### Proposed policy, not yet client-confirmed

Two separate companies share one physical store — this task does not
resolve how that relates to legal stock ownership, and adopts the
simplest internally-consistent starting point instead of inventing a
cross-company financial model nobody asked for: **a PurchaseOrder's
`company` is always fixed to its source PurchaseRequest's own `company`
— cross-company purchasing is not supported in this slice, and a shared
delivery/storage location never by itself establishes which company
legally owns stock that arrives there.** This is a proposal requiring
client review before production use, not a confirmed rule — see
`docs/purchase-order-proposal.md` for the full reasoning and the
four-rule policy statement.

### Initial-scope restrictions (documented prominently, all enforced)

- At most one non-`CANCELLED` PurchaseOrder per PurchaseRequest — a
  partial DB `UniqueConstraint` plus a transaction lock on the source
  request (see "Concurrency" below); split orders/partial procurement
  are deferred.
- Exactly one supplier per PurchaseOrder — no multi-supplier split.
- Every line from the request's approved round is copied verbatim — no
  extra materials, no omitted lines, no quantity changes; only
  `unit_price` is ever editable, and only while `DRAFT`.
- A cancelled PurchaseOrder frees its source PurchaseRequest for a
  replacement PurchaseOrder — the only supported "replace this order"
  path; there is no separate reopen/amend action.

### Models

| Model | App | Notes |
|---|---|---|
| `PurchaseOrder` | `apps.purchasing` (extended, not a new app) | `company` (FK `Company`, `PROTECT`, immutable, always equal to `source_purchase_request.company` — enforced in `clean()`), `reference` (unique, server-generated, immutable, same `PO-<date>-<hex>` collision-safe convention as `PurchaseRequest.reference`), `source_purchase_request` (FK `PurchaseRequest`, `PROTECT`, immutable), `supplier` (FK `Supplier`, `PROTECT`, editable while `DRAFT`), `status` (`DRAFT`/`CANCELLED` only — no issue/approve/receive state exists in this task), `expected_delivery_date` (optional, editable), `notes` (bounded, editable), `currency_code` (`CharField(max_length=3)`, required at creation, immutable afterwards, shape-validated only — three letters, not checked against a real ISO 4217 list), `created_by`/`created_at`/`updated_at`, `cancelled_by`/`cancelled_at`/`cancellation_reason` (mirrors `PurchaseRequest`'s own cancellation fields exactly), `version` (optimistic-concurrency counter, starts at 1). Partial `UniqueConstraint(source_purchase_request, condition=~Q(status="CANCELLED"))` — the one-active-PO-per-request rule, at the database level. |
| `PurchaseOrderLine` | `apps.purchasing` | `purchase_order` (FK, `CASCADE`), `line_number`, `source_round_line` (FK `PurchaseRequestApprovalRoundLine`, `PROTECT` — the immutable link back to exactly which approved-round snapshot line this was copied from), `material`/`unit` (FK, `PROTECT`, copied once from the source round line, never editable afterwards), `quantity` (`DecimalField(14,3)`, copied once, immutable, DB `CheckConstraint > 0`), `unit_price` (`DecimalField(14,4)`, default `0`, the *only* editable field on a line, DB `CheckConstraint >= 0`), `line_amount` (`DecimalField(16,2)`, always server-calculated — `quantity * unit_price` quantized to 2dp with `ROUND_HALF_UP`, never client-writable), plus the same four `*_snapshot` fields as `PurchaseRequestApprovalRoundLine`. `UniqueConstraint(purchase_order, line_number)` and `UniqueConstraint(purchase_order, source_round_line)` — a given approved line can be copied onto a given order at most once. |

Migrations: `purchasing.0004_purchase_orders` (additive — 2 `CreateModel`,
5 `AddConstraint`, depends on `catalog`/`companies`/`suppliers`/
`purchasing.0003`). `permissions.0007_seed_purchase_order_permissions`
(data migration, idempotent `get_or_create`, same pattern as 0005/0006).

**Currency rounding convention**: `quantity` (3dp) × `unit_price` (4dp)
is quantized to 2 decimal places using `ROUND_HALF_UP` — the
conventional "round 0.5 up" rule, deliberately not Python's default
banker's rounding — documented once, in
`apps.purchasing.services._compute_line_amount`, and applied identically
at creation (all lines start at `unit_price=0`, so `line_amount=0`) and
on every subsequent price edit. `PurchaseOrderSerializer.subtotal` is a
computed (not stored) sum of every line's `line_amount` — a pre-tax
subtotal only; no GST/discount/freight/invoice-total concept exists
anywhere in this task.

### Authorization

Four new **COMPANY**-scope permissions, seeded idempotently
(`apps/permissions/migrations/0007_seed_purchase_order_permissions.py`,
`get_or_create`, none assigned to any role/user automatically):
`purchase_orders.view`, `purchase_orders.create`, `purchase_orders.edit`,
`purchase_orders.cancel`.

| Concern | Rule |
|---|---|
| List/detail (`GET`) | `purchase_orders.view`. |
| Create (`POST` list) | `purchase_orders.view`, `purchase_orders.create`, **and** `purchase_requests.view` — creating a PO always reads from a source PurchaseRequest, so the caller must be allowed to see that request too. |
| Edit (`PATCH`) | `purchase_orders.view` **and** `purchase_orders.edit`. |
| Cancel | `purchase_orders.view` **and** `purchase_orders.cancel`. |
| Source request in a different company, or nonexistent | `404` either way — folded together deliberately, mirroring `_get_company_for_action`'s own company-resolution convention; a caller can never learn which case applies. |
| Anonymous / no membership / lacking a required permission | `401` / `404` / `403` (naming what is missing) — same rules as every other resource in this project; no superuser or shared-store bypass exists anywhere in `apps.purchasing`. |

### Endpoints

Registered alongside the existing Purchase Request routes under
`/api/v1/companies/<company_id>/purchase-orders/`.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `.../purchase-orders/` | List, company-scoped, paginated |
| `POST` | `.../purchase-orders/` | Create a `DRAFT` from an `APPROVED` source request |
| `GET` | `.../purchase-orders/<id>/` | Detail, with lines and computed `subtotal` |
| `PATCH` | `.../purchase-orders/<id>/` | Edit a `DRAFT` (supplier/prices/delivery date/notes only) |
| `POST` | `.../purchase-orders/<id>/cancel/` | `DRAFT` → `CANCELLED` |

**3 URL patterns, 5 method+path operations** — confirmed by the same
live URL-resolver introspection technique used for every prior task.

**Example request bodies**:

```json
// POST .../purchase-orders/  (source_purchase_request_id/supplier_id/currency_code required; lines never accepted - always derived)
{
  "source_purchase_request_id": 42,
  "supplier_id": 7,
  "currency_code": "INR",
  "expected_delivery_date": "2026-12-01",
  "notes": "Confirm lead time with supplier before dispatch"
}
```

```json
// PATCH .../purchase-orders/<id>/  (draft only; expected_version always required; lines only ever carry {id, unit_price})
{
  "expected_version": 1,
  "supplier_id": 9,
  "lines": [
    {"id": 101, "unit_price": "12.5000"}
  ]
}
```

```json
// POST .../purchase-orders/<id>/cancel/  (cancellation_reason always required, even on a retry)
{"expected_version": 2, "cancellation_reason": "Supplier could not confirm lead time"}
```

**Create**: only from an `APPROVED` PurchaseRequest (`400` for
`DRAFT`/`SUBMITTED`/`REJECTED`/`CANCELLED`); rejects a second active PO
for the same request (`400`, unless the existing one is already
`CANCELLED`); revalidates the approved round's materials/units/category
are still active *now* (they were already checked once, at the original
submit — more time may have passed since approval) and that the chosen
supplier is active (`is_active` means only "in use," never
"QC-qualified" — no such concept exists on `Supplier`, see Task 08A);
copies every approved-round line verbatim, each starting at
`unit_price=0`/`line_amount=0`. `source_purchase_request` is looked up
scoped to the URL's company and locked (`select_for_update()`) for the
whole transaction — see "Concurrency" below.

**PATCH**: `DRAFT` only (`400` otherwise); always requires
`expected_version`; editable fields are `supplier_id`/
`expected_delivery_date`/`notes`, each independently omittable, plus an
optional `lines` list that may only ever update `unit_price` on an
*existing* line by its own `id` — an unknown or duplicated line `id` is
`400`, and `quantity`/`material`/`unit`/`line_amount`/`currency_code`
are all explicitly rejected fields, never a writable path through this
endpoint. `line_amount` is recomputed server-side for every changed
line. A `PATCH` that would not actually change anything is a no-op: no
version increment, no audit entry.

**Cancel**: requires `expected_version` and a non-blank, bounded
`cancellation_reason` every time, including on a retry; `DRAFT` →
`CANCELLED`; never touches the source PurchaseRequest, never touches
stock; frees the source request for a replacement PurchaseOrder.

`DELETE` returns `405` — no hard-delete API, consistent with every
resource in this project.

### Concurrency and retry semantics

Mirrors Task 08B-1's table exactly for update/cancel (version-mismatch
`409`, no-op `PATCH` detection, idempotent-same-reason cancel retry,
conflicting-reason `409`), plus one new rule specific to creation:

| Situation | Result |
|---|---|
| Two callers race to create a PO for the same PurchaseRequest | Exactly one succeeds; the source request is locked (`select_for_update()`) for the entire create transaction, so the second caller blocks until the first commits or rolls back, then sees the already-created active PO and is rejected (`400`, a business-rule rejection, not a version conflict — there was no `expected_version` for the caller to have gotten stale). The partial `UniqueConstraint` on `source_purchase_request` is the database-level backstop behind that lock, not a substitute for it. Regression-tested with a genuine multi-threaded `TransactionTestCase`. |

### Audit

Every mutation (`purchase_order.created`/`updated`/`cancelled`) goes
through `apps.audit.services.record()` inside the same
`@transaction.atomic` service function as the business write, called
last so its failure rolls back everything — regression-tested for all
three actions, including that a failed create leaves zero `PurchaseOrder`
rows behind.

### Django Admin

`PurchaseOrder` is registered **read-only**
(`ReadOnlySuperuserAdminMixin`, reused unchanged) with its lines shown
as a read-only inline — no add/change/delete, even for an active
superuser. All mutations go through the audited REST API only.

### Verification

First read the actual result of Task 08B-2's own final verification run
(`bnpcuwiq3`) before starting this task, per instruction — its own
Django-printed summary line (not the piped shell's exit code) read
`Ran 798 tests in 1103.969s` / `OK`, so no pre-existing failure needed
resolving before this task began.

| Check | Command | Result |
|---|---|---|
| System checks | `python manage.py check` | Passed — no issues |
| Migration consistency | `python manage.py makemigrations --check --dry-run` | Passed — no changes detected after all Task 08C-1 migrations applied |
| Targeted app tests, first run | `python manage.py test tests.test_purchase_orders -v 1` | **71 tests, FAILED (failures=2)** — not reported as passing; see "Test fix" below |
| Test fix | — | One real bug in the new serializer code, not a test bug: `_PO_HEADER_UPDATE_PROHIBITED` was built as `_PO_HEADER_CREATE_PROHIBITED \| {...}` (set union), which silently carried `"lines"` over from the create-prohibited set into the update-prohibited set — but `lines` is exactly what a `PATCH` must accept to edit a line's `unit_price`; the union made every `PATCH` supplying `lines` fail with `400`. Fixed by building the create- and update-prohibited sets independently from a shared `_PO_HEADER_ALWAYS_PROHIBITED` base, instead of deriving one from the other. |
| Targeted app tests, corrected run | `python manage.py test tests.test_purchase_orders -v 1` | **Passed — 71/71, OK**, 276.1s |
| Full regression suite, run `b99uq7vnk` | `python manage.py test tests -v 1` | **869 tests, FAILED (failures=2)**, 1393.86s — not reported as passing. Both failures were pre-existing, brittle exact-code-set assertions in *other* test modules that had nothing to do with Task 08C-1's own correctness: `tests.test_company_management.PermissionCatalogTests.test_search_filters_by_code_or_name` (a `?search=orders.view` substring search now also matches `purchase_orders.view`) and `tests.test_store_permissions.PermissionCatalogScopeFilterTests.test_scope_filter_company` (an exact-set assertion that did not know about this task's four new seeded codes) — the same recurring class of staleness first hit in Task 08B-1 and Task 08B-2. Both were fixed in Task 08C-2 (see that section) by redesigning the assertions to compare against the database's own filtered rows instead of a hardcoded set, so they do not need editing again for future tasks. The corrected full-suite result is reported in Task 08C-2's own verification section, since fixing these two tests was folded into that task's work before its own new code/tests were added. |

New tests (`tests/test_purchase_orders.py`, 71 tests) cover: reference/
company/source-request/currency-code immutability; the DB
`CheckConstraint` backstops for quantity/unit_price via direct
`bulk_create()`/`.update()` bypass; the partial one-active-PO-per-request
`UniqueConstraint`; admin read-only restriction; the full authorization
matrix including the three-permission create requirement and
cross-company/nonexistent source-request `404`; approved-source
requirement (rejecting `DRAFT`/`SUBMITTED`); duplicate-active-PO
rejection and cancel-then-replace; inactive supplier/material/unit/
category rejection at creation; missing/malformed/lowercase currency
code handling; prohibited-field rejection at both create and update
(including the `lines`-at-create-only distinction the bug fix above
exists because of); multi-line copy-through; server-computed
`line_amount` and `ROUND_HALF_UP` rounding verified against an
independently-computed expected value; unknown/duplicate line-id
rejection on update; version-conflict `409`s; cancellation idempotency/
conflict rules; company isolation; audit correctness and full rollback
on injected failure for create/update/cancel; explicit "source
PurchaseRequest is never mutated by PO create/cancel" assertions; and
genuine concurrent-creation locking via `TransactionTestCase`.

Postman: three new requests added — **"Create purchase order"**,
**"Get/List purchase orders"**, **"Update purchase order draft"**,
**"Cancel purchase order"** — see `docs/postman/README.md` for the exact
run order and the second-admin setup notes carried over from Task 08B-2.

### Known limitations (documented, not solved here)

- The cross-company purchasing policy (see `docs/purchase-order-
  proposal.md`) is a proposal, not a confirmed rule — production use
  requires client review.
- No issue/send, no PO-level approval workflow, no receipt, QC, stock,
  invoice, or Tally integration anywhere in this task.
- Split orders, partial procurement, and multi-supplier orders for one
  request are all deferred — exactly one supplier, exactly the approved
  quantities, every time.
- `currency_code` is shape-validated only (three letters), never checked
  against a real ISO 4217 reference list — none exists in this project.
- `reference` is an internal identifier only, not a finalised
  statutory/business numbering scheme (same limitation as
  `PurchaseRequest.reference`).

## Task 08C-2 — Purchase Order Issue

**Status: Complete.**

Before starting, the existing full regression run `b99uq7vnk` (launched
at the end of Task 08C-1) was read to completion rather than duplicated
or interrupted — its own printed summary (not the piped shell's exit
code) read `Ran 869 tests in 1393.860s` / `FAILED (failures=2)`; see the
row added to Task 08C-1's own verification table above for the full
explanation. Both failures were pre-existing test staleness unrelated to
Task 08C-1's own code, fixed here before any purchasing code was
touched further (see "Permission-catalog test staleness, fixed
properly this time" below).

Scope: an explicit `ISSUED` state for `PurchaseOrder` — internal
finalization of a `DRAFT`, not proof of supplier delivery, email
transmission, supplier acceptance, or material receipt. Explicitly
**not** implemented: PDF/email sending, taxes, payments, receipts, QC,
stock ownership/ledger, Tally integration, or any frontend.

### Proposed policy, not yet client-confirmed

A user explicitly holding company-scoped `purchase_orders.issue` may
finalize any `DRAFT` purchase order in that company — **not** a new
multi-step commercial approval workflow the way PurchaseRequest has one
(Task 08B-2's three-step round, self-decision ban, distinct-approver
rule). One permission, one decision, nobody excluded from issuing their
own draft. See `docs/purchase-order-proposal.md` for the full write-up,
including the deliberately narrow, explicit currency-support allowlist
and the zero-price issue restriction (both below).

### Models

| Model | App | Notes |
|---|---|---|
| `PurchaseOrder` (extended) | `apps.purchasing` | `status` gains `ISSUED` alongside `DRAFT`/`CANCELLED`. New `issued_by` (FK user, `PROTECT`, nullable) and `issued_at` (nullable) — mirror `cancelled_by`/`cancelled_at`'s existing shape exactly. |
| `PurchaseOrderIssueSnapshot` | `apps.purchasing` (new) | Created exactly once, by `issue_purchase_order`, never updated again (`OneToOneField` to `PurchaseOrder`). `issued_by`/`issued_at`; three `company_*_snapshot` fields (code/legal_name/display_name — the only fields `Company` actually has); twelve `supplier_*_snapshot` fields (every field `Supplier` actually has — identity, contact, full address); `currency_code_snapshot`, `subtotal_snapshot`, `expected_delivery_date_snapshot`, `notes_snapshot`; `source_purchase_request_reference_snapshot`, `approved_round_number_snapshot`. Nothing invented — `Company` has no address/tax-ID/bank-details field at all, so none is snapshotted. |
| `PurchaseOrderIssueLineSnapshot` | `apps.purchasing` (new) | One permanent row per `PurchaseOrderLine`, copied at the same moment — material/unit descriptions, quantity, unit price, line amount, all as they stood at issue. `UniqueConstraint(issue_snapshot, line_number)`. |

Migrations: `purchasing.0005_purchase_order_issue` (additive — 2
`AddField`, 1 `AlterField` for the new status choice, 2 `CreateModel`,
depends on `purchasing.0004`). `permissions.0008_seed_purchase_order_
issue_permission` (data migration, idempotent `get_or_create`, same
pattern as every prior permission-seeding migration). Existing
`DRAFT`/`CANCELLED` purchase orders are untouched by either migration —
no historical issue event is fabricated for any of them; a genuinely
new `PurchaseOrder` row is unaffected until someone actually calls
`issue`.

**The one-active-PO-per-request `UniqueConstraint` needed no migration
change.** Its condition, `~Q(status="CANCELLED")` ("not cancelled"), was
already written the negative way around rather than enumerating `DRAFT`
specifically — it therefore already covers `ISSUED` correctly, with zero
schema change required. Confirmed by inspection before writing any new
migration, not assumed.

### Authorization

One new **COMPANY**-scope permission, seeded idempotently and assigned
to nobody automatically: `purchase_orders.issue`.

| Concern | Rule |
|---|---|
| Issue | `purchase_orders.view` **and** `purchase_orders.issue`. |
| Cross-company / nonexistent order | `404`, same folding convention as every other resource in this project. |
| Anonymous / no membership / lacking a required permission | `401` / `404` / `403` — no superuser or shared-store bypass anywhere in `apps.purchasing`, and the role name an administrator gives the role holding this permission carries no meaning to the code — only the permission code itself is checked, never inferred from a role's name string. |

**Assigning this permission** uses the same existing role APIs as every
other permission in this project — no new mechanism: `CompanyRole`
create, `replace_role_permissions(..., permission_codes=["purchase_orders.issue", ...])`,
then `assign_membership_role` for the member who should be able to
issue. See `docs/postman/README.md` for the exact Postman steps.

### Endpoint

One new action under the existing PurchaseOrder resource.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `.../purchase-orders/<id>/issue/` | `DRAFT` → `ISSUED` |

**4 URL patterns, 6 method+path operations** total for this resource now
(3 from Task 08C-1 plus this one), confirmed by the same live
URL-resolver introspection technique used throughout this project.

```json
// POST .../purchase-orders/<id>/issue/
{"expected_version": 3}
```

**Issue**: only from `DRAFT` (`400` for `CANCELLED`; idempotent `200`
no-op if already `ISSUED` at the *current* version — no re-validation,
no new snapshot, no `issued_at`/`issued_by` replacement, no new audit
entry, mirroring `submit_purchase_request`'s own retry convention). A
stale `expected_version` is always `409`. Revalidates, inside the same
locked transaction:

- The source PurchaseRequest still belongs to this order's `company`
  and is still `APPROVED` (terminal once reached — see
  `approve_purchase_request` — so this can only fail if something is
  deeply wrong, but the check runs regardless of that expectation).
- Every line still matches its approved-round source line's
  material/unit/quantity exactly (both already immutable after
  creation — defense-in-depth, not an expected failure path;
  regression-tested by deliberately corrupting a line directly at the
  DB layer, since no real API can otherwise produce this drift).
- At least one line exists.
- Every line's material/unit/category and the supplier are still active
  *now* (more time may have passed since drafting) — `is_active` means
  only "in use," never "QC-qualified"; no supplier-qualification concept
  is added by this task or exists anywhere in this codebase.
- `expected_delivery_date` is present (optional on a `DRAFT`) and not in
  the past.
- `currency_code` is one of `_SUPPORTED_ISSUE_CURRENCIES` (`INR`, `USD`,
  `EUR`, `GBP` today) — see "Currency support scope" below.
- Every line's `unit_price` is strictly greater than zero — see
  "Zero-price restriction" below.

On success: creates the permanent `PurchaseOrderIssueSnapshot`(+lines)
row, sets `status=ISSUED`/`issued_by`/`issued_at`, increments `version`
once, records one audit entry — snapshot, header mutation, and audit all
commit or roll back together (regression-tested).

### Currency support scope (read this before assuming any currency "works")

A `DRAFT` still accepts any shape-valid three-letter `currency_code`
(unchanged Task 08C-1 behaviour — draft creation/editing was not
touched). **Issuing** is gated on a separate, small, explicit allowlist:
`apps.purchasing.services._SUPPORTED_ISSUE_CURRENCIES = {"INR", "USD",
"EUR", "GBP"}`. This exists because `_compute_line_amount`'s rounding is
hard-coded to exactly 2 decimal places (`ROUND_HALF_UP`) — correct for a
currency whose own minor unit genuinely has 2 decimal places, silently
*wrong* for one that has 0 (e.g. JPY) or 3 (e.g. KWD). This is **not** a
real ISO 4217 reference list and **not** a claim these are the only
real-world 2-decimal currencies — it is exactly "the currencies this
task's fixed rounding was actually verified correct for." An
unsupported-but-shape-valid currency can still be drafted; it is
rejected (`400`) only at issue, with the supported list named in the
error message.

### Zero-price restriction

A `DRAFT` line may sit at its Task 08C-1 default `unit_price=0`
indefinitely — unchanged. `issue_purchase_order` rejects (`400`) any
line still priced at zero, with a message naming which line and stating
that free-of-charge purchasing is deferred. This does not change
draft-price behaviour at all — it is a precondition of `issue` only.

### Immutable issued record

`PurchaseOrderIssueSnapshot`/`PurchaseOrderIssueLineSnapshot` are the
permanent record — see "Models" above. Exposed on the detail/list
response as a nested `issue_snapshot` object (`null` until issued).
Verified by regression test that renaming the live `Supplier`/`Company`
row *after* issue does not change what the snapshot reports, while the
order's own live `supplier_code`/`company_code` fields (unchanged
identity, just a renamed `legal_name`/`display_name`) still resolve
normally — only the issue-time facts are frozen, not the live FK
relationships themselves.

**Issued POs cannot be edited or cancelled through any API or Django
Admin surface** — `update_purchase_order`/`cancel_purchase_order` both
already gate on `status == DRAFT` explicitly (see "A required fix to
`cancel_purchase_order`" below for why this needed a real code change,
not just documentation, for the cancel path specifically).
`PurchaseOrderIssueSnapshot`/`PurchaseOrderIssueLineSnapshot` are
registered **read-only** in Django Admin
(`ReadOnlySuperuserAdminMixin`) — no add/change/delete anywhere.

### A required fix to `cancel_purchase_order`

Before this task, `cancel_purchase_order` only ever guarded against
re-cancelling an already-`CANCELLED` order; because `DRAFT`/`CANCELLED`
were the *only* two statuses that existed, "not `CANCELLED`" already
implied "`DRAFT`," so no separate status check was needed. Adding
`ISSUED` broke that assumption silently: without a code change, an
`ISSUED` order reaching this function would have been cancelled by
mistake. Fixed by adding an explicit `status != DRAFT` guard (`400`
otherwise) — regression-tested (`test_issued_cannot_be_cancelled`) to
confirm this is a real, enforced rejection, not just a comment.
`update_purchase_order` already used an explicit `== DRAFT` check
(never an implicit "not-X" assumption), so it needed no change — noted,
not assumed, by reading it before writing any new code.

### List/detail responses

`status=ISSUED` is already supported by the existing `?status=` filter
with no code change — it validates against `PurchaseOrder.Status.values`
dynamically, which now includes `ISSUED` automatically. No expected-
delivery-date filter was added: no list endpoint anywhere in this
project has a date-range filter today, so there is no existing
convention to be consistent with, and inventing one specifically for
this task's own list endpoint would be a new pattern, not a documented
one — deliberately not added, rather than silently added as a one-off.

Deliberately **not** exposed anywhere: any received-quantity, receipt
status, or "delivered" field — receiving is not implemented, and this
task does not invent placeholder fields for a feature that does not
exist. Issuing also does not set any "emailed"/"sent" flag — no such
concept or mechanism exists anywhere in this codebase.

### Permission-catalog test staleness, fixed properly this time

The same class of failure that hit Task 08B-1 (`test_scope_filter_
company`, fixed by editing the expected set) and, again, Task 08B-2
(same test, same fix, same set edited again) recurred a third time in
this task's own full-suite run, plus a *new* test in a *different* file
(`test_search_filters_by_code_or_name`, broken by a substring collision
between `orders.view` and `purchase_orders.view`). Both were redesigned
this time, not just patched: `test_scope_filter_company`/
`test_scope_filter_store` now compare the endpoint's `?scope=` result
against the database's own rows for that scope (`set(PermissionDefinition.
objects.filter(scope=...).values_list("code", flat=True))`) instead of a
hardcoded exact set, plus an explicit negative check that no row from
the *other* scope ever leaks through; `test_search_filters_by_code_or_
name` now asserts the specific expected code is present and that every
result genuinely contains the search term, instead of asserting the
complete result set. None of these three tests will need editing again
just because a future task seeds another permission — they test the
actual filtering/search *behaviour*, not an ever-growing enumeration
that has nothing to do with it.

### Verification

| Check | Command | Result |
|---|---|---|
| System checks | `python manage.py check` | Passed — no issues |
| Migration consistency | `python manage.py makemigrations --check --dry-run` | Passed — no changes detected after all Task 08C-2 migrations applied |
| Stale-test fix verification | `python manage.py test tests.test_company_management.PermissionCatalogTests tests.test_store_permissions.PermissionCatalogScopeFilterTests -v 1` | **Passed — 13/13, OK**, 10.4s — confirmed before any Task 08C-2 code was written |
| Targeted app tests, first run | `python manage.py test tests.test_purchase_orders -v 1` | **96 tests, FAILED (failures=1)** — not reported as passing; see "Test fix" below |
| Test fix | — | One test-only bug, not a defect in the shipped code: `test_issue_audit_rollback_on_failure` asserted `version == 1` after a rolled-back issue attempt, but the fixture (`_issue_ready_po`) already performs one price-setting `PATCH` before returning, which itself bumps the version to `2` — the assertion just used the wrong baseline. Fixed to compare against the version actually observed immediately before the issue attempt, not a hardcoded `1`. |
| Targeted app tests, corrected run | `python manage.py test tests.test_purchase_orders -v 1` | **Passed — 96/96, OK**, 418.1s |
| Full regression suite (`bvk9498rx`) | `python manage.py test tests -v 1` | **Passed — 894/894, OK**, 1442.29s. Captured by redirecting output to a file and echoing `$?` immediately afterward (not through `tail`), so the exit code reported is Python's own, not a pipe's - `PYTHON_EXIT_CODE=0`, matching Django's own printed `OK`. 894 = 798 (Task 08B-2 baseline) + 96 (this task's own final test count, which had grown from 71 during this same task - see "Test fix" above; do not add 71 separately, it is already superseded by 96). |

New tests (`tests/test_purchase_orders.py`, +25 vs. Task 08C-1's 71)
cover: issue authorization (view+issue required) and cross-company `404`
isolation; successful issue and the exact snapshot content (company/
supplier/currency/subtotal/every line field); `DRAFT`-only guard
(`CANCELLED` rejected, and the new explicit `cancel_purchase_order`
`DRAFT`-only fix verified in the other direction too); idempotent
repeat-issue at the current version (no new audit entry, no new
snapshot); stale-version `409`; zero-price rejection; missing/past
expected-delivery-date rejection; unsupported-currency rejection
(`JPY`) alongside a positive sweep proving every currently-supported
currency really is issuable; inactive supplier/material/unit/category
rejection at issue; source-request-no-longer-`APPROVED` and
line-drifted-from-approved-round rejection (both via deliberate direct
DB corruption, since no real API can otherwise reach either state);
issued-cannot-be-edited; master-data-rename-after-issue leaves the
snapshot unchanged while the live, non-snapshotted fields still resolve
normally; the one-active-PO rule still holding for an `ISSUED` order
(no replacement PO can ever be created against its source request in
this task); audit rollback leaving zero snapshot rows behind; and
genuine concurrent issue-versus-cancel locking via `TransactionTestCase`
(exactly one winner, no torn/partial result).

Postman: two new requests added to the existing "Purchase Orders"
folder — **"Issue purchase order"** and a subsequent **"Get purchase
order"** to show the resulting `ISSUED` status and snapshot - plus two
documented scenarios (A: create → set prices/details → issue → get; B:
create another draft → cancel) — see `docs/postman/README.md` for the
exact run order and permission-assignment steps.

### Known limitations (documented, not solved here)

- The `purchase_orders.issue` single-permission policy is a proposal,
  not a confirmed rule — see `docs/purchase-order-proposal.md`.
- Currency support for issuing is limited to four currencies
  (`INR`/`USD`/`EUR`/`GBP`) whose rounding this task actually verified —
  extending it to a currency with a different minor-unit precision needs
  the rounding logic itself to become currency-aware first.
- Free-of-charge (zero-price) purchasing is deferred, not supported.
- Still no PDF/email sending, taxes, payments, receipts, QC, stock
  ownership/ledger, or Tally integration anywhere in this codebase.
- No expected-delivery-date list filter — no existing convention in
  this project to be consistent with yet.

## Task 09A — Physical Material Receiving against Issued POs

**Status: Complete.**

Before starting, the existing full regression run `bvk9498rx` (launched
at the end of Task 08C-2) was read to completion rather than duplicated
or interrupted. Its actual result, captured without masking the exit
code through `tail` (output redirected to a file, `$?` echoed
immediately afterward): `PYTHON_EXIT_CODE=0`, and the file's own tail
read `Ran 894 tests in 1442.293s` / `OK` - both agree, no pre-existing
failure needed resolving before this task began.

Scope: a new, focused `apps.receiving` app recording physical material
arrival against an already-`ISSUED` PurchaseOrder, at one shared
physical store. Explicitly **not** implemented: available stock, QC
acceptance, accounting entries, intercompany transfers, supplier
payments, stock ledger, or any frontend/external messaging.

### Proposed policies, not yet client-confirmed

See `docs/receiving-proposal.md` for the full write-up. In summary: (1)
every receiving endpoint requires **both** active store membership with
the specific `receiving.*` permission **and** active company membership
with `purchase_orders.view` in the source PO's own company - neither
substitutes for the other, and a common-store operator handling both
companies needs company access to both, granted the ordinary way; (2) no
over-delivery tolerance - any cumulative posted quantity exceeding the
ordered quantity is rejected outright, not flagged; (3) posted-receipt
corrections/reversals are deferred entirely - a `POSTED` receipt has no
system-level remedy today beyond leaving it as-is.

### Models

| Model | App | Notes |
|---|---|---|
| `GoodsReceipt` | `apps.receiving` (new) | `reference` (unique, server-generated, `GR-<date>-<hex>`, immutable), `idempotency_key` (optional, client-generated, unique when non-blank - partial `UniqueConstraint`), `store` (FK `SharedStore`, `PROTECT`, immutable), `company` (FK `Company`, `PROTECT`, immutable, always `source_purchase_order.company` - enforced in `clean()`), `source_purchase_order` (FK `PurchaseOrder`, `PROTECT`, immutable), `status` (`DRAFT`/`POSTED`/`CANCELLED`), `arrived_at` (required `DateTimeField`), `delivery_note_reference`/`notes` (optional), `created_by`/`created_at`/`updated_at`, `posted_by`/`posted_at` (nullable), `cancelled_by`/`cancelled_at`/`cancellation_reason` (nullable/blank, mirrors `PurchaseOrder`'s own cancellation fields), `version`. |
| `GoodsReceiptLine` | `apps.receiving` | `goods_receipt` (FK, `CASCADE`), `line_number`, `source_po_line` (FK `PurchaseOrderIssueLineSnapshot` - the Task 08C-2 permanent issue-time record, **not** the live `PurchaseOrderLine` - `PROTECT`), `material`/`unit` (FK, `PROTECT`, copied once from the source snapshot's own `purchase_order_line`), `received_quantity` (`DecimalField(14,3)`, DB `CheckConstraint > 0`), `lot_reference` (optional, free-text, supplier-supplied only - never fabricated), plus the same four `*_snapshot` code/name fields as every other line-snapshot model in this project. `UniqueConstraint(goods_receipt, line_number)` only - deliberately **no** constraint tying one `source_po_line` to at most one line, since "support multiple lots for one PO line" means several lines (in the same or different receipts) may legitimately reference the same source PO line. |

Migrations: `receiving.0001_initial` (new app - 2 `CreateModel`, 3
`AddConstraint`). `permissions.0009_seed_receiving_permissions` (data
migration, idempotent `get_or_create`, same pattern as every prior
permission-seeding migration, `scope="STORE"`). Both purely additive -
no existing table altered, no existing row touched.

### A new, deliberate exception to "audit sets at most one of company/store"

Every audit entry before this task set at most one of `AuditLog.
company`/`store` (Task 07A's own documented convention). A `GoodsReceipt`
mutation is genuinely scoped to **both** at once - a purchasing company
(derived from its PO) and a physical store (where it was received) -
so `apps.receiving.services` deliberately passes both to `record()`.
`apps.audit.services.record`'s and `apps.audit.models.AuditLog`'s own
docstrings were updated to document this as the first, deliberate
exception, not silently left describing a rule this task now breaks.

### Authorization

Five new **STORE**-scope permissions, seeded idempotently
(`apps/permissions/migrations/0009_seed_receiving_permissions.py`,
`get_or_create`, none assigned to any role/user automatically):
`receiving.view`, `receiving.create`, `receiving.edit`, `receiving.post`,
`receiving.cancel`.

| Concern | Rule |
|---|---|
| List/detail (`GET`) | Store `receiving.view`, **and** the result is further filtered to receipts whose company the caller also holds `purchase_orders.view` in. |
| Create (`POST` list) | Store `receiving.view` **and** `receiving.create`, **and** `purchase_orders.view` in the source PO's own company (resolved and checked before the service ever runs). |
| Edit (`PATCH`) | Store `receiving.view`/`receiving.edit`, plus the same per-receipt company check. |
| Post | Store `receiving.view`/`receiving.post`, plus the same per-receipt company check. |
| Cancel | Store `receiving.view`/`receiving.cancel`, plus the same per-receipt company check. |
| Eligible-PO lookup | Store `receiving.view` only - results are already scoped to accessible companies by construction (see "Eligible purchase order lookup" below). |
| No store membership at all, nonexistent/inactive store | `404` - folded together, same convention as `_get_company_for_action`. |
| Store member lacking a required `receiving.*` permission | `403`, naming what is missing. |
| Store access present but lacking `purchase_orders.view` in the receipt's/PO's company | `404`, **not** `403` - a caller must never learn a receipt or PO exists in a company they cannot see, even if their store access would otherwise let them find its id. |
| No implicit superuser/shared-store bypass | None exists anywhere in `apps.receiving.views` - every check is real active membership plus a real permission, both axes. |

### Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `.../stores/<store_id>/goods-receipts/` | List, scoped to store + accessible companies, paginated |
| `POST` | `.../stores/<store_id>/goods-receipts/` | Create a `DRAFT` against an `ISSUED` source PO |
| `GET` | `.../stores/<store_id>/goods-receipts/eligible-purchase-orders/` | Minimal eligible-PO lookup with delivery progress |
| `GET` | `.../stores/<store_id>/goods-receipts/<id>/` | Detail, with lines |
| `PATCH` | `.../stores/<store_id>/goods-receipts/<id>/` | Edit a `DRAFT` |
| `POST` | `.../stores/<store_id>/goods-receipts/<id>/post/` | `DRAFT` → `POSTED` |
| `POST` | `.../stores/<store_id>/goods-receipts/<id>/cancel/` | `DRAFT` → `CANCELLED` |

**5 URL patterns, 7 method+path operations** - confirmed by the same
live URL-resolver introspection technique used throughout this project.

```json
// POST .../goods-receipts/  (source_purchase_order_id/arrived_at required; company/store never accepted)
{
  "source_purchase_order_id": 42,
  "arrived_at": "2026-09-20T10:30:00Z",
  "delivery_note_reference": "DN-8891",
  "idempotency_key": "clerk-scan-8891",
  "lines": [
    {"source_po_line_id": 101, "received_quantity": "60.000", "lot_reference": "LOT-A"}
  ]
}
```

```json
// POST .../goods-receipts/<id>/post/
{"expected_version": 1}
```

```json
// POST .../goods-receipts/<id>/cancel/  (cancellation_reason always required)
{"expected_version": 1, "cancellation_reason": "Wrong store - re-entering at the correct one"}
```

**Create**: only against an `ISSUED` source PO (`400` otherwise); `lines`
may be empty (an empty `DRAFT` is valid, matching every other document
type in this project) - completeness is enforced only at posting. Every
`source_po_line_id` must belong to the source PO's own issue-time line
snapshot (`400` if unknown or from a different PO). `idempotency_key` is
optional; a retry with the same key and identical content returns the
existing receipt unchanged (no duplicate row); the same key with
different content is `409`.

**PATCH**: `DRAFT` only; `lines`, if present at all (even `[]`), fully
replaces the existing line set (mirrors `update_purchase_request`'s
convention, not `PurchaseOrderLine`'s narrower single-field-edit
convention - a `GoodsReceipt`'s lines are still being composed at
`DRAFT` stage). No-op detection (no version bump / audit entry) when
nothing actually changed.

**Post**: requires at least one line and a non-future `arrived_at`
(checked here, not at draft create/edit). Locks the source `PurchaseOrder`
for the whole transaction, re-checks it is still `ISSUED`, then for every
line sums that line's `received_quantity` plus every other
already-`POSTED` line referencing the same source PO line - across every
store, every other receipt, every lot - and rejects (`400`) if the total
would exceed the ordered quantity. Idempotent (`200`, no-op, no
re-summation) on a repeat call at the *current* version against an
already-`POSTED` receipt - this is what guarantees "posting retries
never count quantities twice." `400` against `CANCELLED`.

**Cancel**: `DRAFT` only (`400` for `POSTED`/already-differently-
`CANCELLED`); requires a non-blank reason every time, idempotent on a
same-reason retry, `409` on a different-reason retry against an
already-`CANCELLED` receipt - mirrors `cancel_purchase_order` exactly.

### Physical delivery progress

`apps.receiving.services.delivery_progress_for_purchase_order(po)`
computes, per PO line, purely from already-`POSTED` `GoodsReceiptLine`
rows: `ordered_quantity`, `received_quantity`, `remaining_quantity`, and
a `NOT_RECEIVED`/`PARTIALLY_RECEIVED`/`FULLY_RECEIVED` status.
Deliberately independent of `PurchaseOrder.status` and of any future QC
concept - `FULLY_RECEIVED` means only "the ordered quantity has
physically arrived, on paper," never "accepted, usable, or financially
closed." Exposed through the eligible-PO lookup response, not bolted
onto `apps.purchasing`'s own serializers - `apps.receiving` computes and
owns this concept entirely on its own side of the app boundary.

### Eligible purchase order lookup

`GET .../goods-receipts/eligible-purchase-orders/` - `ISSUED` purchase
orders from companies the caller holds `purchase_orders.view` in, each
with its delivery progress, gated by the same store `receiving.view`
requirement as every other endpoint here. Grants no broader purchasing
access of its own - it returns exactly what the same permission check
already lets the caller see through `apps.purchasing`'s own endpoints,
nothing more. Never exposes supplier price, line amount, currency, or
subtotal - identity and physical quantities only (see "Receiving
responses" below).

### Receiving responses expose no commercial data

No `GoodsReceiptSerializer`/`EligiblePurchaseOrderSerializer` field
anywhere in this app carries a supplier price, a line amount, a
currency code, or any commercial total - by construction, not by
filtering: those fields are never selected onto the serializer at all.
A receiving clerk sees material identity and quantities only.

### Concurrency and consistency

| Situation | Result |
|---|---|
| Two postings race for overlapping quantity on the same PO line | Exactly one succeeds; the source `PurchaseOrder` row lock serializes every posting attempt against it, across every `GoodsReceipt`/store, so the loser's re-summation (after unblocking) sees genuinely up-to-date totals and is correctly rejected as an over-receipt. Regression-tested with a genuine multi-threaded `TransactionTestCase`. |
| A create-retry reuses an `idempotency_key` concurrently with another insert of the same key | The database's own partial `UniqueConstraint` is the backstop behind the pre-check; a genuine race is caught by inspecting the failed constraint's name and surfaced as `Conflict` (`409`), never silently retried with a fresh reference (which would only exhaust the retry budget without resolving the actual collision). |
| `PATCH`/post/cancel version mismatch | `409`, same convention as every other mutation in this project. |

### Audit

Every mutation (`goods_receipt.created`/`updated`/`posted`/`cancelled`)
goes through `apps.audit.services.record()` inside the same
`@transaction.atomic` service function as the business write, called
last so its failure rolls back everything - snapshot, header mutation,
line writes, and posting totals all commit or roll back together
(regression-tested for all four actions, including that a failed post
leaves delivery progress at zero received).

### Django Admin

`GoodsReceipt` is registered **read-only** (`ReadOnlySuperuserAdminMixin`,
reused unchanged) with its lines shown as a read-only inline - no
add/change/delete, even for an active superuser. All mutations go
through the audited REST API only.

### Verification

| Check | Command | Result |
|---|---|---|
| System checks | `python manage.py check` | Passed — no issues |
| Migration consistency | `python manage.py makemigrations --check --dry-run` | Passed — no changes detected after all Task 09A migrations applied |
| Targeted app tests, first run | `python manage.py test tests.test_receiving -v 1` | **64 tests, FAILED (failures=2, errors=1)** — not reported as passing; see "Test fixes" below |
| Test fixes | — | Three test-only bugs, no defect in the shipped code: (1) `_issued_po()`'s helper generated a username from `company.code`/`quantity`/`unit_price` only, colliding whenever a test called it twice with the same arguments (`IntegrityError` on `users_user_username_key`) - fixed with a monotonic per-test-run counter. (2) `test_company_access_alone_without_store_access_403` expected `403` for a user with **zero** store membership, but the established convention (mirroring `_get_company_for_action`) folds "no membership at all" into `404`, not `403` - `403` is reserved for a caller who *has* membership but lacks the specific permission; the test's own expectation was wrong, fixed and renamed. (3) `test_idempotency_key_retry_same_content_returns_existing` let its own test helper default `arrived_at` to a fresh `timezone.now()` on each call, so the two "identical" retries were never actually identical - fixed by pinning one shared `arrived_at` value across both calls. |
| Targeted app tests, corrected run | `python manage.py test tests.test_receiving -v 1` | **Passed — 64/64, OK**, 341.7s |
| Full regression suite, first run | `python manage.py test tests -v 1` | **958 tests, FAILED (failures=1)** — `PermissionCatalogTests.test_superuser_lists_all` (`tests/test_company_management.py`) — a stale test, not a Task 09A defect: it assumed the whole permission catalog fit on the endpoint's default page (`page_size=20`), which stopped holding once this task's own five `receiving.*` permissions pushed the real catalog past 20 rows |
| Test fix | — | The test now requests `?page_size=100` (the endpoint's own documented `max_page_size`) instead of relying on the default page happening to contain everything — a non-brittle fix consistent with the permission-catalog test-robustness work from Task 08C-2, not a weakened assertion |
| Full regression suite, corrected run | `python manage.py test tests -v 1` | **Passed — 958/958, OK**, 1775.8s, Python exit code 0 (958 = 894 prior baseline + 64 this task's own tests) |
| Migrations applied to the live dev database | `python manage.py migrate` | Nine migrations (`permissions.0006`–`0009`, `purchasing.0002`–`0005`, `receiving.0001`) were confirmed applied to the isolated test database throughout this task's own development, but had never actually been run against the real project database (`cmhp_new_dev`) until this verification pass — `showmigrations` had them all listed `[ ]`. Applied cleanly, no data loss; confirmed `[X]` afterward |

New tests (`tests/test_receiving.py`, 64 tests) cover: reference/store/
company/source-PO immutability; the `idempotency_key` partial
`UniqueConstraint` (including that a blank key is never
uniqueness-constrained); admin read-only restriction; the full dual
store+company access matrix (no store membership `404`, store member
missing permission `403`, store access without company access `404`,
company access without store access `404`, a common-store operator
gaining access to a second company mid-test); issued-only source
(`DRAFT`/`CANCELLED` PO rejected); empty-draft-allowed; multiple lots
for one PO line; unknown/cross-PO `source_po_line_id` rejection; zero-
quantity rejection; prohibited-field rejection (including a line-level
`material_id` override attempt); idempotency-key safe-retry and
conflicting-content `409`; full line replacement on update; partial
delivery reaching `FULLY_RECEIVED` across two posts with correct
progress at each step; draft receipts never affecting received totals;
single-post and cumulative-across-receipts over-receipt rejection (with
the first posting's totals proven intact afterward - no partial
application); at-least-one-line and non-future-arrival-time requirements
at posting; idempotent repeat-post with no double-counting; posted
receipts immutable to edit/cancel; audit correctness and full rollback
for all four actions; the eligible-PO lookup's company scoping and its
commercial-data-free response shape; and genuine concurrent-posting
over-receipt prevention via `TransactionTestCase`.

Postman: new "Goods Receipts" folder — see `docs/postman/README.md` for
the exact scenario (issue a 100-unit PO → post 60 → remaining 40 → post
40 → fully received, plus over-receipt rejection and draft cancellation)
and run order.

### Known limitations (documented, not solved here)

- Legal stock ownership at a shared physical store remains unresolved -
  inherited from Tasks 08C-1/08C-2, not decided here either.
- No over-delivery tolerance - a proposed initial policy, not confirmed.
- Posted-receipt corrections/reversals are entirely deferred - see
  `docs/receiving-proposal.md`.
- No manufacturing-date/expiry-date field on a receipt line - only an
  optional, free-text, supplier-supplied `lot_reference`.
- Still no stock ledger, QC, accounting entries, intercompany transfers,
  supplier payments, or external messaging anywhere in this codebase.

## Task 09B-1 — Incoming QC Inspection Draft APIs

**Status: Complete (draft-recording scope only).**

Before starting, Task 09A's own full-regression-suite result (958/958,
`OK`, exit code 0) was confirmed already recorded (see that task's row
above, filled in as part of this task's own verification work, since it
had been left as an unfilled placeholder). No full-suite rerun was
performed to "re-verify" an already-captured result.

Scope: a new, focused `apps.quality` app letting an authorized QC user
create and edit a **draft** inspection record against one already-
`POSTED` `GoodsReceiptLine`, and log free-text observations against it.
Explicitly **not** implemented: any accept/reject/release decision,
material release to production, any stock effect, or any change to the
source receipt's quantities/status. There is deliberately no
`ACCEPTED`/`REJECTED`/`RELEASED` field or status anywhere in this task.

### Proposed policies, not yet client-confirmed

See `docs/incoming-qc-proposal.md` for the full write-up. In summary:
(1) every incoming-QC endpoint requires **both** active store membership
with the specific `incoming_qc.*` permission **and** active company
membership - **bare membership only, no `purchase_orders.view`** -
deliberately narrower than Goods Receiving's own company-axis check, so
a QC user never needs purchasing-price visibility; (2) at most one active
(non-cancelled) inspection may exist per receipt line at a time - a
cancelled draft may be replaced by a new one.

### Models

| Model | App | Notes |
|---|---|---|
| `IncomingInspection` | `apps.quality` (new) | `reference` (unique, server-generated, `QC-<date>-<hex>`, immutable), `receipt_line` (FK `GoodsReceiptLine`, `PROTECT`, immutable - identity is the receipt *line*, not the supplier's lot text, so two receipts sharing a lot reference are never merged), `store`/`company` (FK, `PROTECT`, immutable, always copied from `receipt_line.goods_receipt` - enforced in `clean()`), `material`/`unit` (FK, `PROTECT`, copied once from the receipt line) plus the same four `*_snapshot` code/name fields every other line-snapshot model in this project carries, `lot_reference_snapshot` (copied through - stays blank if the source was blank, never fabricated), `received_quantity_snapshot` (informational context only, never a stock claim), `status` (`DRAFT`/`CANCELLED` only - no third state), `inspection_date` (optional, validated against the receipt's own arrival date and today, both compared in UTC), `notes`, `created_by`/`created_at`/`updated_at`, `cancelled_by`/`cancelled_at`/`cancellation_reason`, `version`. |
| `InspectionObservation` | `apps.quality` | `inspection` (FK, `CASCADE`), `line_number` (server-assigned display order), `parameter_name` (required, the only required field), `method_reference`/`result`/`result_unit`/`remarks` (all optional - a draft's observations may be incomplete). No pass/fail field, no seeded test catalog, no specification/limit of any kind. `UniqueConstraint(inspection, line_number)`. |

Migrations: `quality.0001_initial` (new app - 2 `CreateModel`, 2
`AddConstraint`, including the partial `one_active_incoming_inspection_
per_receipt_line` constraint). `permissions.0010_seed_incoming_qc_
permissions` (data migration, idempotent `get_or_create`, same pattern as
every prior permission-seeding migration, `scope="STORE"`). Both purely
additive - no existing table altered, no existing row touched. Both
confirmed applied to the live project database (`cmhp_new_dev`), not just
the isolated test database, via `python manage.py migrate` during this
task's own verification pass.

### A second, deliberate exception to "audit sets at most one of company/store"

Task 09A's `apps.receiving.services` was the first call site to
deliberately pass both `company` and `store` to `record()`. Task 09B-1's
`apps.quality.services` is the second, for the same underlying reason one
level further downstream: an `IncomingInspection` is simultaneously
scoped to a purchasing company and a physical store, both inherited
directly from its source `GoodsReceiptLine`. `apps.audit.services.record`'s
docstring was updated again to document this second exception explicitly.

### Authorization

Four new **STORE**-scope permissions, seeded idempotently
(`apps/permissions/migrations/0010_seed_incoming_qc_permissions.py`,
`get_or_create`, none assigned to any role/user automatically):
`incoming_qc.view`, `incoming_qc.create`, `incoming_qc.edit`,
`incoming_qc.cancel`.

| Concern | Rule |
|---|---|
| List/detail (`GET`) | Store `incoming_qc.view`, **and** the result is further filtered to inspections whose company the caller has active membership in (bare membership, no permission check). |
| Create (`POST` list) | Store `incoming_qc.view` **and** `incoming_qc.create`, **and** active membership in the source receipt line's own company (resolved and checked before the service ever runs); the source receipt must be `POSTED`. |
| Edit (`PATCH`) | Store `incoming_qc.view`/`incoming_qc.edit`, plus the same company-membership check, `DRAFT` only. |
| Cancel | Store `incoming_qc.view`/`incoming_qc.cancel`, plus the same company-membership check, `DRAFT` only. |
| Eligible-receipt-line lookup | Store `incoming_qc.view` only - results are already scoped to accessible companies by construction, and exclude any line that already has an active inspection. |
| No store membership at all, nonexistent/inactive store | `404` - folded together, same convention as every other app. |
| Store member lacking a required `incoming_qc.*` permission | `403`, naming what is missing. |
| Store access present but no membership at all in the receipt line's own company | `404`, **not** `403` - a caller must never learn an inspection/receipt line exists in a company they don't belong to. |
| No implicit superuser bypass | None exists anywhere in `apps.quality.views` - every check is real active membership plus (on the store axis) a real permission. |

### Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET`/`POST` | `/api/v1/stores/<store_id>/incoming-inspections/` | List / create a draft inspection. |
| `GET` | `.../incoming-inspections/eligible-receipt-lines/` | Minimal lookup: `POSTED` lines with no active inspection, in accessible companies. |
| `GET`/`PATCH` | `.../incoming-inspections/<id>/` | Detail / edit a draft (`inspection_date`/`notes`/`observations`, each independently optional - `observations` is a full replace when present). |
| `POST` | `.../incoming-inspections/<id>/cancel/` | `DRAFT` -> `CANCELLED`, requires a non-blank reason. |

5 URL patterns, 6 method+path operations (confirmed via `get_resolver()`
introspection during this task's own testing).

### Mutation rules

Every mutating call requires `expected_version`, matching the same
optimistic-concurrency pattern used everywhere else in this project
(`select_for_update()`, compare-before-mutate, `Conflict` on mismatch,
no version bump on a genuine no-op). Create additionally locks the
source `GoodsReceiptLine` and pre-checks for an existing active
inspection before inserting - the DB's own partial `UniqueConstraint` is
the backstop for a genuine concurrent race that slips past the pre-check
(distinguished from a reference collision by inspecting the failed
constraint's name, exactly mirroring `apps.receiving.services`'s own
`idempotency_key`-collision handling), never silently retried with a
fresh reference. `receipt_line_id` is immutable after creation. A
cancellation requires a non-blank reason every time, including on an
idempotent retry (same reason -> `200` no-op; different reason -> `409`).
Cancelled inspections are permanently read-only. No hard-delete endpoint
exists.

### Admin

`IncomingInspection` is registered **read-only**
(`ReadOnlySuperuserAdminMixin`, reused unchanged) with its observations
shown as a read-only inline - no add/change/delete, even for an active
superuser. All mutations go through the audited REST API only.

### Verification

| Check | Command | Result |
|---|---|---|
| System checks | `python manage.py check` | Passed — no issues |
| Migration consistency | `python manage.py makemigrations --check --dry-run` | Passed — no changes detected |
| Migrations applied to the live dev database | `python manage.py migrate` | Passed — `permissions.0010_seed_incoming_qc_permissions`, `quality.0001_initial` both applied cleanly |
| Targeted app tests, first run | `python manage.py test tests.test_incoming_inspections -v 2` | **60 tests, FAILED (failures=10, errors=23)** — not reported as passing; see "Test fixes" below |
| Test fix | — | One real bug in the shipped code, not a test-only issue: the create serializer's prohibited-field set (`_HEADER_PROHIBITED`) wrongly included `receipt_line_id` - the one field `POST` genuinely requires - rejecting every legitimate create call with a confusing 400 and cascading into most of the other failures/errors in the same run. Fixed by splitting the set into `_HEADER_CREATE_PROHIBITED`/`_HEADER_UPDATE_PROHIBITED` (create omits `receipt_line`/`receipt_line_id`, update includes them, since the field becomes immutable once an inspection exists) - the same class of fix Task 08C-1 made for `PurchaseOrder`'s own prohibited-field sets. Not a weakened assertion; the test expectations were correct, the shipped serializer was wrong. |
| Targeted app tests, corrected run | `python manage.py test tests.test_incoming_inspections -v 2` | **Passed — 60/60, OK**, 348.5s |
| Focused regression run | `python manage.py test tests.test_incoming_inspections tests.test_receiving tests.test_permissions tests.test_store_permissions tests.test_company_management tests.test_stores -v 1` | **Passed — 376/376, OK**, 1277.5s, Python exit code 0. Per this task's own instruction, the full 958-test suite was **not** re-run automatically - this targeted set covers the new module plus every app whose permission/access conventions this task's code directly reuses or extends. |

New tests (`tests/test_incoming_inspections.py`, 60 tests) cover:
reference/receipt-line/store/company immutability; the
`one_active_incoming_inspection_per_receipt_line` partial constraint at
both the DB level and via the service's pre-check (including that a
cancelled inspection does not block a new one); admin read-only
restriction; the full access matrix (no store membership `404`, store
member missing permission `403`, store access without company membership
`404`, a QC user holding **no** `purchase_orders.view` still succeeding -
proving the bare-membership design point directly); posted-only source
(`DRAFT`/`CANCELLED` receipt rejected); prohibited-field rejection on
both create and update; observation full-replacement (omitted/`[]`/
replaced) and the required-`parameter_name` validation; inspection-date
validation against both the receipt's arrival date and today; version
conflicts and idempotent cancel-retry; no-op edits never bumping version
or writing audit entries; audit rollback leaving no orphan row; that
creating/editing/cancelling an inspection never changes the source
receipt's delivery progress or received quantity; and genuine
concurrent-creation duplicate prevention via `TransactionTestCase` with
real OS threads and a `threading.Barrier`.

Postman: new "Incoming QC Inspections" folder — see
`docs/postman/README.md` for the exact scenario (eligible receipt lines
→ create draft → list → get → edit observations → cancel) and run order.
A separate, real end-to-end HTTP demo (login through cookies/CSRF/Bearer
tokens against a running dev server, not Postman) was also executed once
for this task - see `docs/demo-runbook.md`.

### Known limitations (documented, not solved here)

- No accept/reject/release decision, no disposition workflow, no QA
  reviewer/authorizer role - see `docs/erp-handoff-open-decisions.md`,
  item B1.
- No pharmaceutical test specification, numerical limit, sampling
  formula, or claim of regulatory compliance anywhere - observations are
  entirely manually entered free text.
- No retest, sample-consumption tracking, or posted-inspection
  correction workflow (there is no "posted" state for an inspection at
  all beyond `DRAFT`/`CANCELLED`).
- Legal stock ownership at a shared physical store remains unresolved -
  inherited unchanged from Tasks 08C-1/08C-2/09A.
- Still no stock ledger, accounting entries, intercompany transfers,
  supplier payments, or external messaging anywhere in this codebase.

## Task 09B-2 — Incoming QC Review and Disposition Design

**Status: Complete (design/documentation only — no code, migration, or
permission was implemented).**

Produced an implementation-ready design proposal for QC submission,
review, and disposition (accept/partially accept/reject/return for
correction/retest), building on Task 09B-1's drafting-only scope. Full
write-up: `docs/incoming-qc-review-proposal.md` — proposed
`IncomingInspection.status` extension (`SUBMITTED`/`UNDER_REVIEW`/
`DECIDED`), new `IncomingInspectionRound`/`...RoundObservation`/
`MaterialSpecification`/`SpecificationTest` models, new endpoints
(`submit`/`start-review`/`decide`/`retest`), and new screens (QC-06–09).
Explicitly does **not** carry `PurchaseRequest`'s approval business
rules (self-decision ban, distinct-approver-per-round, three-step
structure) into QC by assumption - each is called out and left open
instead. No stock-ledger/usability effect is proposed for any QC
decision - that boundary is treated as fixed, not a gap to close later
in the same design. Links added from `docs/erp-handoff-open-decisions.md`
(item B1), `docs/frontend-api-handoff.md` (§8), and
`docs/erp-screen-catalog.md` (QC module) rather than duplicating content.

No verification section - this task performed no code changes, so there
is nothing to test. The existing Task 09B-1 verification (60/60 module
tests, 376/376 focused regression, real HTTP demo) stands unchanged and
was not re-run.

## Task 09B-3A — Correct QC Design and Implement Submission Only

**Status: Complete.**

### Part 1 — design correction

`docs/incoming-qc-review-proposal.md` (Task 09B-2) had a genuine
contradiction in its retest/quantity rules: every round's `accepted_
quantity + rejected_quantity + retest_hold_quantity` was checked against
the inspection's **full** `received_quantity_snapshot`, including a
retest round, which only ever has the prior round's held-back remainder
to work with. Corrected by giving each `IncomingInspectionRound` its own
`assessed_quantity` (round 1's is the full received quantity; a retest
round's is exactly the immediately preceding round's own `retest_hold_
quantity`, never the original total again). Worked through the task's
own example (received 60 → round 1 accepts 50, holds 10 → round 2
accepts 8, rejects 2 → final totals: accepted 58, rejected 2, unresolved
0) in the document itself. Also corrected: `RETURNED_FOR_CORRECTION` is
no longer one of `IncomingInspectionRound.outcome`'s values (it
allocates no quantity, so treating it as a fourth disposition value
alongside three real ones was itself part of the same confusion) - it is
now proposed as its own, separate action; and a new paragraph makes
explicit that `MaterialSpecification`/`SpecificationTest`'s *structure*
can be designed (and even implemented as empty containers) before any
real client test data exists - client data is needed only to validate
the shape and populate real rows, not to begin the schema design. None
of Part 1's corrections change this task's actual code scope (submission
only, below) - they only fix the design document itself.

### Part 2 — submission implementation

Scope: `IncomingInspection` gains a third status, `SUBMITTED`, reachable
only from `DRAFT`. A submitted inspection (and its observations) is
permanently frozen - no further edit, no cancel, no correction/retest
(that remains entirely unimplemented, per Task 09B-2's design,
corrected by Part 1 above). No review, decision, disposition, QA
release, or stock-ledger effect of any kind is implemented in this task.

**Real bug found and fixed while implementing this**: `cancel_incoming_
inspection` had no explicit "must be DRAFT" check - it only checked
"already CANCELLED", implicitly relying on the two-status world (DRAFT/
CANCELLED) where "not CANCELLED" could only ever mean "DRAFT". Adding
`SUBMITTED` as a third status broke that assumption silently: without a
fix, a `SUBMITTED` inspection could have been cancelled through the
existing endpoint. This is the same class of bug Task 08C-2 fixed in
`cancel_purchase_order` once `ISSUED` was added there. Fixed by adding an
explicit `status != DRAFT` guard, mirroring that precedent exactly.
`update_incoming_inspection` already had an explicit `DRAFT`-only check
from Task 09B-1, so it needed no code change - only a docstring note
confirming it already blocks `SUBMITTED` correctly.

### Models

`IncomingInspection` (`apps.quality`) gains: `submitted_by` (FK User,
`PROTECT`, nullable), `submitted_at` (nullable `DateTimeField`), and
`SUBMITTED` added to the `Status` choices between `DRAFT` and
`CANCELLED`.

Migrations: `quality.0002_incominginspection_submitted_at_and_more` (2
`AddField`, 1 `AlterField` on `status`'s choices metadata only - no
column type change, fully additive, no existing row touched).
`permissions.0011_seed_incoming_qc_submit_permission` (data migration,
idempotent `get_or_create`, same pattern as every prior permission-
seeding migration, `scope="STORE"`). Both confirmed applied to the live
project database (`cmhp_new_dev`), not just the isolated test database.

### Authorization

One new **STORE**-scope permission, seeded idempotently
(`apps/permissions/migrations/0011_seed_incoming_qc_submit_permission.py`,
`get_or_create`, granted to nobody automatically): `incoming_qc.submit` -
deliberately a dedicated code, not folded into the existing
`incoming_qc.edit`, so a role can grant edit access without submit
authority or vice versa. Submit requires `incoming_qc.view` +
`incoming_qc.submit` (store) plus the existing bare company-membership
rule (unchanged) - no `purchase_orders.view` needed, same as every other
action in this app. No implicit superuser bypass exists anywhere in
`apps.quality.views` - unchanged from Task 09B-1.

### Endpoint

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/v1/stores/<store_id>/incoming-inspections/<id>/submit/` | `DRAFT` -> `SUBMITTED`, requires `expected_version` and ≥1 observation. |

Request: `{"expected_version": 1}`. Response (200): full inspection
detail with `status: "SUBMITTED"`, `submitted_by_id`/`submitted_at`
populated, `version` incremented by 1.

### Mutation rules

Locks the inspection row (`select_for_update()`) for the whole
transaction, same as every mutation in this app. Revalidates the source
receipt is still `POSTED` (defensive - no reachable path un-posts a
receipt after inspection creation today, but this project's convention
is to revalidate at each real transition rather than trust creation-time
state, e.g. `issue_purchase_order`'s own revalidation). Retry semantics
mirror `submit_purchase_request` exactly: a call at the **current**
(post-submit) version against an already-`SUBMITTED` inspection is an
idempotent no-op (200, unchanged, no new audit entry) - this does **not**
protect a literal same-stale-version duplicate send, which still raises
`Conflict` (409), only a well-behaved caller that refetches after its
first submit succeeded and calls submit again with the now-current
version. Audited atomically (`incoming_inspection.submitted`, company +
store context, the established dual-scope pattern from Task 09B-1/09A)
inside the same transaction as the state change - a mocked audit-write
failure was tested to confirm the whole transaction rolls back, leaving
the inspection unchanged at `DRAFT`.

### Verification

| Check | Command | Result |
|---|---|---|
| System checks | `python manage.py check` | Passed — no issues |
| Migration consistency | `python manage.py makemigrations --check --dry-run` | Passed — no changes detected |
| Migrations applied to the live dev database | `python manage.py migrate` | Passed — `permissions.0011_seed_incoming_qc_submit_permission`, `quality.0002_incominginspection_submitted_at_and_more` both applied cleanly |
| Targeted app tests | `python manage.py test tests.test_incoming_inspections -v 1` | **Passed — 77/77, OK**, 519.7s (60 from Task 09B-1 + 17 new submission/concurrency tests) |
| Focused regression run | `python manage.py test tests.test_incoming_inspections tests.test_receiving tests.test_permissions tests.test_store_permissions tests.test_company_management -v 1` | **Passed — 303/303, OK**, 1182.8s, Python exit code 0 |

New tests (17 added to `tests/test_incoming_inspections.py`, now 77
total) cover: successful submission recording actor/timestamp; the
at-least-one-observation requirement; anonymous (401), no-store-
membership (404), missing-`incoming_qc.submit`-permission (403), and
cross-company (404) access denial; stale-version conflict (409);
idempotent retry at the current version versus a genuine 409 on a retry
at the original stale version; a submitted inspection rejecting further
edits (header and observations) and cancellation attempts, with the
underlying data proven unchanged; exact preservation of submitted
observation content; a service-level defensive test confirming
`submit_incoming_inspection` revalidates the source receipt is still
`POSTED`; audit-write-failure transaction rollback; a real-thread
`TransactionTestCase` racing a concurrent submit against a concurrent
edit on the same fresh inspection, proving the row lock always yields
exactly one winner and a clean 409 for the loser, never a torn state;
and a regression check that an ordinary never-submitted `DRAFT`'s
create/edit/cancel lifecycle is entirely unaffected by adding the third
status.

Postman: the existing "Incoming QC Inspections" folder extended from 6
to 12 requests - the new ones create a second draft (reusing the receipt
line freed by the folder's existing cancel request), demonstrate the
zero-observation submit rejection, add an observation, submit
successfully, then demonstrate that both edit and cancel are rejected
afterward. See `docs/postman/README.md` §21 for the full walkthrough.

### Known limitations (documented, not solved here)

- No review, decision, disposition, or QA release of any kind - see
  `docs/incoming-qc-review-proposal.md` for the corrected design of that
  work, none of which is implemented.
- No correction or retest path - a `SUBMITTED` inspection has no route
  back to `DRAFT` in this task.
- Everything Task 09B-1's own "Known limitations" already listed
  (no pharmaceutical specification/pass-fail concept, no legal stock
  ownership resolution, no stock ledger) remains unchanged and
  unresolved.

## Task 09B-3B — Material Specification Drafts and Versioning Foundation

**Status: Complete (drafting/versioning foundation only — no approval,
publication, or QC integration).**

Scope: a new, focused material-specification foundation inside
`apps.quality` — `MaterialSpecification` (a shared, superuser-only
identity: which material, a stable code/name/description) and
`MaterialSpecificationVersion` (its own sequentially-numbered draft
revisions, each carrying free-text `SpecificationTest` rows). This
explicitly does **not** implement approval, publication, effective
dates, superseding, retirement, cloning, any operational QC read access
to a specification, or any link from an `IncomingInspection` to a
specification version — see "Known limitations" below.

### Models

| Model | App | Notes |
|---|---|---|
| `MaterialSpecification` | `apps.quality` | `material` (FK `Material`, `PROTECT`, immutable), `code` (unique, normalized via the shared `normalize_code` helper, immutable), `name`, `description` (optional), `latest_revision_number` (allocation counter for child versions - mirrors `PurchaseRequest.current_round`'s exact role), `created_by`/`created_at`/`updated_at`. **No `version`/`expected_version` field** - this is unversioned shared master-data identity, the same category as `Material`/`Supplier` (see "Consistency" below). |
| `MaterialSpecificationVersion` | `apps.quality` | `specification` (FK, `CASCADE`, immutable), `revision_number` (sequential per specification, immutable, unique with `specification`), `status` (`DRAFT` only - the choices class anticipates future values without a schema migration, but nothing today reaches anything but `DRAFT`), `reference_document`/`notes` (optional), `created_by`/`created_at`/`updated_at`, `version` (the ordinary optimistic-concurrency token - **deliberately distinct from `revision_number`**, see "Two different 'version' concepts" below). |
| `SpecificationTest` | `apps.quality` | `version` (FK, `CASCADE`), `line_number` (server-assigned display order), `parameter_name` (required), `method_reference`/`unit_label`/`acceptance_criteria` (all optional - a draft's tests may be incomplete), `result_type` (`NUMERIC`/`TEXT`, required, no default). No numeric-limit operator, no automatic evaluation, no sampling calculation, no seeded pharmaceutical test catalog anywhere. |

Migrations: `quality.0003_materialspecification_materialspecificationversion_and_more`
(3 `CreateModel`, 2 `AddConstraint` - purely additive, no existing table
altered). No new permission migration - this task uses `IsActiveSuperuser`
exclusively (see "Access"), which consults no `PermissionDefinition` row
at all. Both confirmed applied to the live project database
(`cmhp_new_dev`), not just the isolated test database.

### Two different "version" concepts, kept deliberately distinct (this task's own explicit instruction)

`revision_number` is the specification's own sequential draft numbering
(1, 2, 3, ... - allocated under the parent `MaterialSpecification`'s own
row lock, `select_for_update()`, the same "lock the parent, read-modify-
write its counter" shape `submit_purchase_request` already uses for
`PurchaseRequest.current_round`). `version` is the ordinary optimistic-
concurrency token every mutable document in this project carries
(`expected_version` on every `PATCH` to a specific version, incremented
only on a real change to *that* version's own content). Editing revision
3's notes twice moves *its own* `version` from 1 to 3 while
`revision_number` stays `3` throughout; creating revision 4 later never
touches revision 3's `version`.

### A deliberate departure: `MaterialSpecification` itself has no concurrency version

Every other document-like resource in this project (`PurchaseRequest`,
`PurchaseOrder`, `GoodsReceipt`, `IncomingInspection`, and this task's
own `MaterialSpecificationVersion`) carries `version`/`expected_version`.
`MaterialSpecification` deliberately does **not** - it is shared
master-data identity, the same category as `apps.catalog.Material` and
`apps.suppliers.Supplier` (neither of which has a `version` field
either), edited with a simple last-write-wins `PATCH`, mirroring
`update_supplier` exactly. See `docs/backend-decisions.md`, Task 09B-3B,
for the full reasoning behind drawing this line here rather than adding
`expected_version` everywhere "to be safe."

### Access

Active-superuser-only, **both directions** - the same "no read
exception, unlike the shared catalog" shape `apps.suppliers` already
uses (`IsActiveSuperuser` on every endpoint, no new
`PermissionDefinition` codes introduced at all). Managing a specification
draft confers **no** QC/QA operational authority - it is entirely
separate from, and does not widen, `incoming_qc.*` access. No implicit
bypass of any kind exists anywhere in `apps.quality`'s specification
views.

### Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET`/`POST` | `/api/v1/material-specifications/` | List (`?search=`, `?material=<id>`) / create specification + atomic empty revision-1 draft. |
| `GET`/`PATCH` | `/api/v1/material-specifications/<id>/` | Detail (with nested `versions`, each with nested `tests`) / edit `name`/`description`. |
| `GET`/`POST` | `/api/v1/material-specifications/<id>/versions/` | List versions / create a new, empty `DRAFT` version. |
| `GET`/`PATCH` | `/api/v1/material-specifications/<id>/versions/<vid>/` | Version detail / edit `reference_document`/`notes`/`tests` (full-replace). |

Mounted directly at `/api/v1/` (a new `apps.quality.specification_urls`
module, alongside `apps.catalog.urls`'s identical mounting shape) - **not**
under `/stores/...`, since no store or company scoping exists for a
specification at all, unlike the rest of `apps.quality`'s existing
store-scoped `IncomingInspection` endpoints.

### Mutation rules

`create_material_specification` creates the specification and its
strictly-empty revision-1 draft atomically, in one transaction - a
duplicate `code` (the database's own unique constraint) is translated to
`Conflict` (409), not a plain 400, since the natural remedy is
"refetch/search for the existing one." `create_specification_version`
locks the parent specification (`select_for_update()`) to allocate the
next `revision_number` safely under concurrency - a real-thread
`TransactionTestCase` confirms two concurrent creates always land on
distinct, correctly-incremented numbers (2 and 3), never a duplicate.
`update_specification_version` locks the version itself (not the
specification - editing one version's tests never needs to serialize
against another version being created), requires `expected_version`, and
explicitly checks `status == DRAFT` before allowing an edit - even
though no other status is reachable today, this check is written now,
proactively, following the exact lesson Task 09B-3A had to apply
retroactively to `cancel_incoming_inspection` once `SUBMITTED` was added
there. No-op edits skip the version bump and audit entry, same
convention as everywhere else in this project. Audit-write failure was
tested to roll back the whole transaction for both creation and version
editing.

### A real bug found and fixed during this task, the same shape as Task 09B-3A's

The version-update serializer's prohibited-field set initially, wrongly,
still included `tests` (copied from the version-*create* serializer's
own, correctly test-prohibiting set) - rejecting every legitimate
"add/edit test rows" call with a confusing 400. Caught by this task's own
test suite before shipping. Fixed the same way Task 09B-3A's
`receipt_line_id` bug was fixed: independent `_VERSION_CREATE_PROHIBITED`/
`_VERSION_UPDATE_PROHIBITED` sets, never one unioned into or copied onto
the other.

### Admin

Both new models registered **read-only** (`ReadOnlySuperuserAdminMixin`,
reused unchanged), with `SpecificationTest`/`MaterialSpecificationVersion`
shown as read-only inlines on their parent's admin page. All mutations
go through the audited REST API only.

### Verification

| Check | Command | Result |
|---|---|---|
| System checks | `python manage.py check` | Passed — no issues |
| Migration consistency | `python manage.py makemigrations --check --dry-run` | Passed — no changes detected |
| Migrations applied to the live dev database | `python manage.py migrate` | Passed — `quality.0003_materialspecification_materialspecificationversion_and_more` applied cleanly |
| Targeted app tests, first run | `python manage.py test tests.test_material_specifications -v 1` | **48 tests, FAILED (failures=3, errors=2)** — not reported as passing; see "A real bug found" above and "Test fixes" below |
| Test fixes | — | The version-update `tests` prohibited-field bug (above) accounted for 3 of the 5 failures/errors directly, and the remaining 2 were downstream `KeyError`s in tests that depended on that same call succeeding first - all five resolved by the one serializer fix, not five separate patches. |
| Targeted app tests, corrected run | `python manage.py test tests.test_material_specifications -v 1` | **Passed — 48/48, OK**, 87.0s |
| Focused regression run | `python manage.py test tests.test_material_specifications tests.test_incoming_inspections tests.test_catalog -v 1` | **Passed — 215/215, OK**, 819.0s, Python exit code 0 |

New tests (`tests/test_material_specifications.py`, 48 tests) cover:
code uniqueness and normalization; material/code/specification/
revision_number immutability after creation; the
`unique_specification_version_revision` DB constraint; superuser-only
authorization on every endpoint (anonymous 401, ordinary user 403);
atomic create-with-empty-first-version (verified at the DB row-count
level, not just the response shape); duplicate-code 409; inactive-
material rejection; prohibited-field rejection on both create and update
for specifications, versions, and test rows (including the exact
`tests`-field regression this task's own bug produced); multiple
coexisting draft versions on one specification; unknown-specification
404; genuine concurrent revision-number allocation via real OS threads
and a `threading.Barrier`; full test-row replacement (add/clear/leave-
unchanged); required-field validation per test row while allowing
incomplete method/criteria text; stale-`expected_version` conflict;
cross-specification version-id 404; a defensive non-`DRAFT`-status
rejection test; no-op-update audit suppression; and audit-write-failure
transaction rollback for both specification creation and version
editing. A lightweight compatibility check also confirms
`IncomingInspection` carries no specification-related field - the
authoritative regression evidence for "existing QC behavior remains
unaffected" is the full, unmodified `tests/test_incoming_inspections.py`
suite passing in the same focused regression run above.

Postman: new "Material Specifications" folder (10 requests) - create
(atomic empty version) → list → get → edit metadata → create second
version → list versions → get version → edit version (add synthetic
tests) → stale-version-conflict example → unauthorized-access example.
See `docs/postman/README.md` §22 for the full walkthrough.

### Known limitations (documented, not solved here)

- No approval, publication, effective date, superseding, retirement, or
  cloning of a specification or any version - every version created is
  permanently `DRAFT`.
- No operational QC read access to a specification - superuser-only
  drafting confers no `incoming_qc.*`-equivalent visibility for ordinary
  QC users, and none is proposed here either.
- No link from any `IncomingInspection` to a `MaterialSpecificationVersion`
  - this is a preparation record only; see `docs/incoming-qc-review-
  proposal.md` for the future integration point, not designed further
  here.
- No real pharmaceutical test names, methods, result types, units, or
  acceptance criteria are seeded anywhere - every field is an empty
  container until a client supplies real specification sheets.
- Future operational read access (which store/company roles, if any,
  should ever see an approved specification) and approval authority
  remain entirely unresolved - see `docs/erp-handoff-open-decisions.md`.

## Task 09B-3B.1 — Protect Specification Metadata Updates

**Status: Complete.**

Closes a real gap in Task 09B-3B's own handoff: the original 09B-3B task
explicitly required `expected_version` for updates using existing
project conventions, but the shipped implementation exempted
`MaterialSpecification`'s `name`/`description` `PATCH` from this,
reasoning (incorrectly, relative to the task's own explicit instruction)
that it was unversioned shared master-data like `Material`/`Supplier`.
This task adds the missing concurrency protection without changing
anything else about the model or API shape.

### Change

`MaterialSpecification` gains `version` (`PositiveIntegerField`,
default `1`) - a **third**, fully independent version-shaped field
alongside the two that already existed:

| Field | Model | Meaning |
|---|---|---|
| `MaterialSpecification.version` | `MaterialSpecification` | **New.** Optimistic-concurrency token for this row's own `name`/`description`. |
| `MaterialSpecification.latest_revision_number` | `MaterialSpecification` | Unchanged. Allocation counter for how many `MaterialSpecificationVersion` children exist - not a concurrency token, never sent as `expected_version`. |
| `MaterialSpecificationVersion.version` | `MaterialSpecificationVersion` | Unchanged. Optimistic-concurrency token for one specific draft revision's own content. |

`update_material_specification` now locks the row
(`select_for_update()`), compares `expected_version`, applies the
change, increments `version`, and writes the audit entry - all inside
the same transaction, the identical shape every other mutation in this
project already uses. A no-op `PATCH` still skips the version bump and
audit entry, unchanged from before.

### Whether allocating a new revision affects the metadata concurrency version - documented, per this task's own requirement

**No.** `create_specification_version` and `update_material_specification`
both take `select_for_update()` on the *same* `MaterialSpecification`
row, so Postgres serializes them against each other - but they read and
write entirely disjoint field sets (`latest_revision_number` only, vs.
`name`/`description`/`version` only). Neither operation's own
`expected_version`/allocation logic depends on the other's outcome, so a
concurrent revision-creation never invalidates an in-flight metadata
edit's `expected_version`, and a concurrent metadata edit never disrupts
revision-number allocation. No lost-update risk exists between the two
for exactly that reason - see `docs/backend-decisions.md`, Task
09B-3B.1, and the two functions' own updated docstrings for the full
reasoning.

### Migration

`quality.0004_materialspecification_version` (1 `AddField`, purely
additive, default `1` backfills every existing row - no existing
specification's `name`/`description` value is touched). Confirmed
applied to the live project database (`cmhp_new_dev`).

### Endpoint contract change

`PATCH /api/v1/material-specifications/<id>/` now **requires**
`expected_version` in the request body (`400` if omitted - it has no
`default=`, same convention as every other `expected_version` field in
this project). Response now includes a top-level `"version"` field.
`409` on a stale value, with the same "refetch and retry" message shape
every other versioned resource in this API uses.

```json
// PATCH /api/v1/material-specifications/12/
{"expected_version": 1, "name": "Updated name"}
// -> 200: {..., "name": "Updated name", "version": 2, ...}
```

### Verification

| Check | Command | Result |
|---|---|---|
| System checks | `python manage.py check` | Passed — no issues |
| Migration consistency | `python manage.py makemigrations --check --dry-run` | Passed — no changes detected |
| Migrations applied to the live dev database | `python manage.py migrate` | Passed — `quality.0004_materialspecification_version` applied cleanly |
| Targeted app tests | `python manage.py test tests.test_material_specifications -v 1` | **Passed — 52/52, OK**, 105.0s, Python exit code 0 (48 existing + 4 new) - clean on first run, no fix cycle needed |

New/updated tests in `tests/test_material_specifications.py`:
successful metadata update (with `version` bump confirmed);
missing-`expected_version` rejection (400); stale-`expected_version`
conflict (409, with the row's actual `name`/`version` confirmed
unchanged afterward); the pre-existing material/code-immutability tests
updated to supply a valid `expected_version` so their `400` genuinely
exercises the immutable-field rejection, not an incidental missing-field
error; no-op update writes neither a version bump nor an audit entry
(strengthened from the prior "no audit entry" assertion to also check
`version`); a metadata-update audit-failure rollback test (mocked
`record()`, confirms `name`/`version` both remain untouched); and a
revision-allocation-still-correct test proving a metadata edit and a new
revision each bump only their own counter, never the other's.

Per this task's own instruction, the full 215-test regression was **not**
repeated - this change is confined to `MaterialSpecification`'s own
metadata-update path, with no dependency any other app's tests exercise
differently.

### Documentation updated

`docs/frontend-api-handoff.md` §9.2 (corrected from "two version
concepts" to "three," with the earlier "no `expected_version` at all"
claim explicitly flagged and fixed) and a new §9.4; `docs/erp-screen-
catalog.md` SPEC-02; the Postman "Material Specifications" folder's
"Edit specification metadata" request (now sends `expected_version`,
saves the refreshed `material_specification_version` env var) and
`docs/postman/README.md` §22's walkthrough.

## Task 10A — Company-Scoped Customer Master

**Status: Complete.**

New `apps.customers` app: a company-scoped customer identity/contact
directory, built as the foundation for a future quotations/sales-order
chain that does not exist yet anywhere in this codebase. **Company-
scoping here is the working implementation choice for this task, not a
claim of client-confirmed customer-ownership policy** — see
`docs/backend-decisions.md`, Task 10A, and `docs/erp-handoff-open-
decisions.md` for the open question of whether the two companies
sharing this store should ever see a shared customer directory instead
(the opposite of how `apps.suppliers.Supplier` is shared today).

### Model

`Customer` (`apps/customers/models.py`):

| Field | Notes |
|---|---|
| `company` | Required FK to `Company`, `PROTECT`, immutable after creation |
| `code` | Required, normalized (trim + upper via `apps.companies.models.normalize_code`), immutable after creation |
| `name` | Required, trimmed, rejected if blank |
| `contact_person` | Optional, max 150 chars |
| `email` | Optional; validated as a well-formed address only when supplied |
| `phone` | Optional, free text, max 32 chars — no country-specific format validation, preserved exactly as entered (including any "+" prefix) |
| `billing_address` | Optional plain text (`TextField`), no max length |
| `shipping_address` | Optional plain text, independent of `billing_address` — never defaulted from it |
| `notes` | Optional plain text |
| `is_active` | Default `True` |
| `version` | `PositiveIntegerField`, default `1` — optimistic-concurrency token, required as `expected_version` on every `PATCH` and both lifecycle endpoints |
| `created_by`/`created_at`/`updated_at` | Standard audit-adjacent fields |

**Database constraint**: `unique_customer_company_code` —
`UniqueConstraint(fields=["company", "code"])`, **no** `condition=`. The
same code may exist under two different companies, but never twice
under the same company — and, deliberately, this applies regardless of
`is_active`: deactivating a customer does **not** free its code for
reuse within that company. Only one contact person and two address
fields exist — no separate contact/address-book model. Explicitly
excluded, per this task's own scope: GST/PAN, credit limits, opening
balances, payment terms, tax calculations, customer qualification.

### Access

Five new COMPANY-scope permissions, seeded idempotently by
`permissions.0012_seed_customer_permissions` and assigned to no
role/user automatically: `customers.view`, `customers.create`,
`customers.edit`, `customers.activate`, `customers.deactivate`. Every
endpoint requires an active user, an active company, and an active
company membership — resolved by a locally-defined
`_get_company_for_action` helper in `apps/customers/views.py` (mirrors
`apps.purchasing.views._get_company_for_action` exactly; not imported
across apps, per this project's established convention). A nonexistent
company, an inactive one, or one the caller has no membership in are
all folded into the same `404`; a present-but-insufficient permission
set is a `403` naming what is missing. No superuser/`is_staff` bypass
exists anywhere in this path. `customers.view` is required for every
read; `customers.view` plus the relevant action permission for every
mutation (e.g. activation requires both `customers.view` and
`customers.activate` — holding `customers.edit` alone is insufficient).

### Endpoints

| Method | Path | Permissions |
|---|---|---|
| GET | `/api/v1/companies/<company_id>/customers/` | `customers.view` |
| POST | `/api/v1/companies/<company_id>/customers/` | `customers.view` + `customers.create` |
| GET | `/api/v1/companies/<company_id>/customers/<id>/` | `customers.view` |
| PATCH | `/api/v1/companies/<company_id>/customers/<id>/` | `customers.view` + `customers.edit` |
| POST | `/api/v1/companies/<company_id>/customers/<id>/activate/` | `customers.view` + `customers.activate` |
| POST | `/api/v1/companies/<company_id>/customers/<id>/deactivate/` | `customers.view` + `customers.deactivate` |

No `DELETE` exists anywhere in this module. List supports
`?search=` (code/name/contact_person/email/phone, case-insensitive
substring), a strict `?is_active=` filter (`true`/`1`/`false`/`0` only —
`400` on anything else, via the existing
`apps.common.validation.parse_strict_bool`), and the project's standard
pagination (`apps.common.pagination.BoundedPageNumberPagination` — 20
per page, `?page_size=` up to 100). Default ordering is `code`, then
`id` — deterministic, not user-configurable in this task. `company` is
always derived from the URL and rejected (`400`) if present in any
request body; `is_active`/`version`/`created_at`/`updated_at`/
`created_by` are likewise rejected if supplied. `PATCH` cannot change
`code` or `company` (`400` if present, checked independently of the
create-time prohibited-field set — not by unioning one into the other,
the exact bug class this project hit three times earlier this session
on `receipt_line_id`/`tests`/similar fields). Every `PATCH` and both
lifecycle actions require `expected_version` in the body (`400` if
omitted, `409` with the project's standard "refetch and retry" message
on a stale value). Omitting an optional field from a `PATCH` body
leaves it unchanged; sending it as an explicit empty string (`""`)
clears it. Metadata corrections remain available on an inactive
customer as long as the company itself is active — deactivation is not
a record lock. Activation/deactivation are idempotent no-ops (no version
bump, no audit entry) when the customer is already in the requested
state at the caller's current version; a call against a stale version
still raises `409` regardless of target state. A duplicate `(company,
code)` returns `409` (not an unhandled `500`), following the more
recent `apps.quality.services.create_material_specification` precedent
rather than `apps.suppliers.services.create_supplier`'s older `400` —
see `docs/backend-decisions.md`, Task 10A, for this explicit choice.

### Transactions and audit

Thin views, transactional service-layer mutations
(`apps/customers/services.py`) — `create_customer`, `update_customer`,
`activate_customer`, `deactivate_customer`, each `@transaction.atomic`.
Every mutation locks the row (`select_for_update()`) before comparing
`expected_version`, matching every other versioned resource in this
project. A no-op `update_customer` call (every value already matches,
**after** in-memory normalization via an explicit `Customer.clean()`
call — so a whitespace-only "change" is also treated as a no-op, not
just an exact-value match) skips both the version bump and the audit
entry; this differs slightly in mechanism from
`apps.companies.services.update_company`'s own no-op handling (which
saves once unconditionally, then decides whether to audit) because
`Customer` also carries a `version` counter, and an unconditional save
there would either wrongly bump `version` for an effective no-op or
leave a first write's version undercounted — see the service's own
docstring for the full reasoning. `apps.audit.services.record()` is
called with `company=customer.company` only (never `store`, since a
customer is never store-scoped). If `record()` raises, the whole
transaction — including the row's own `is_active`/field/`version`
changes — rolls back, verified by dedicated tests for create, update,
and deactivate. Django Admin registration is read-only
(`ReadOnlySuperuserAdminMixin`) — every write path goes through the
audited API only.

### Migrations

- `customers.0001_initial` — creates the `Customer` table with the
  `unique_customer_company_code` constraint.
- `permissions.0012_seed_customer_permissions` — idempotently seeds the
  five `customers.*` COMPANY-scope permission definitions, assigned to
  no role/user.

Both confirmed applied to the live project database (`cmhp_new_dev`),
not just the test database.

### Verification

| Check | Command | Result |
|---|---|---|
| System checks | `python manage.py check` | Passed — no issues |
| Migration consistency | `python manage.py makemigrations --check --dry-run` | Passed — no changes detected |
| Migrations applied to the live dev database | `python manage.py migrate` | Passed — `customers.0001_initial` and `permissions.0012_seed_customer_permissions` both applied cleanly |
| Targeted app tests | `python manage.py test tests.test_customers -v 2` | **Passed — 63/63, OK**, 197.905s, Python exit code 0 — clean on first run after one local test-helper fixture fix (a missing `created_by` on the module's own `make_customer` test helper, not a bug in the app code itself) |

New tests (`tests/test_customers.py`, 63 tests) cover: code
normalization and per-company uniqueness; the same code allowed across
different companies; an inactive customer still reserving its code;
company/code immutability after creation; blank-code/blank-name/
invalid-email rejection; anonymous (`401`), inactive-user (`401`),
no-membership (`404`), inactive-company (`404`), and unknown-company
(`404`) access; membership-without-permission (`403`, naming the
missing code); no superuser bypass; company isolation on the detail
endpoint; `DELETE` rejected (`405`); prohibited-field rejection on
create (`company_id`/`is_active`/`version`) and on update (`code`/
`company_id`), built as independent sets; duplicate-code `409` on both
create and a genuine concurrent race (real OS threads + a
`threading.Barrier`); search across code/name/contact_person/email/
phone; a strict `is_active` filter (and `400` on a non-strict value);
deterministic list ordering; `expected_version` required on update and
both lifecycle actions; stale-version `409`; no-op update (exact match
and whitespace-only) skipping both the version bump and the audit
entry; clearing an optional field with `""`; metadata edits permitted
on an inactive customer while its company is active; audit before/after
content; audit-write-failure transaction rollback on create, update,
and deactivate; lifecycle idempotent no-op behavior and its interaction
with the `activate`-vs-`edit` permission distinction; a genuine
concurrent update race (real OS threads); and a read-only Django Admin
check.

Postman: new "Customer Management" folder — Create, List/search/filter,
Detail, Edit, Deactivate, Activate, Stale-version example,
Cross-company access-denial example. See `docs/postman/README.md` for
the full walkthrough.

### Known limitations / open decisions (documented, not solved here)

- Company-scoping is this task's working implementation choice, not a
  confirmed policy — whether the two companies sharing this store
  should instead see one shared customer directory (the opposite
  convention from `Supplier`) is unresolved; see `docs/erp-handoff-
  open-decisions.md`.
- No quotation, sales order, invoice, customer portal, or any other
  record that could reference a `Customer` exists yet — a future task
  that adds one must check `is_active` itself, at the time it actually
  needs to; nothing here enforces that in advance.
- No GST/PAN, credit limit, opening balance, payment terms, tax
  calculation, or customer-qualification concept — all explicitly out of
  scope for this task.
- `QuerySet.update()`/`bulk_create()`/`bulk_update()` bypass
  `Customer.clean()` entirely, the same documented limitation every
  other normalizing model in this codebase carries — not a risk for any
  endpoint this task exposes, since every supported write path goes
  through `Customer.save()`.

## Task 10B — Product Master Foundation

**Status: Complete.**

New `apps.products` app: a company-scoped saleable-product identity
record, built as the foundation for a future quotation/sales-order line
item that does not exist yet anywhere in this codebase — mirroring
`apps.customers` (Task 10A) file-for-file in structure, with the same
"company-scoping is a provisional implementation choice, not confirmed
policy" caveat. A search of the codebase before starting confirmed no
`Product` model already existed anywhere (`apps.catalog.Material` is a
purchasable/stockable *material*, an entirely separate identity that
this task deliberately never creates or links to).

### Model

`Product` (`apps/products/models.py`):

| Field | Notes |
|---|---|
| `company` | Required FK to `Company`, `PROTECT`, immutable after creation |
| `code` | Required, normalized (trim + upper), immutable after creation |
| `name` | Required, trimmed, rejected if blank |
| `description` | Optional plain text (`TextField`) |
| `sales_uom` | Required FK to the existing, shared `apps.catalog.UnitOfMeasure`, `PROTECT`, **must be active at creation**, **immutable after creation** |
| `is_active` | Default `True` |
| `version` | `PositiveIntegerField`, default `1` — optimistic-concurrency token, required as `expected_version` on every `PATCH` and both lifecycle endpoints |
| `created_by`/`created_at`/`updated_at` | Standard audit-adjacent fields |

**Database constraint**: `unique_product_company_code` —
`UniqueConstraint(fields=["company", "code"])`, **no** `condition=`, the
identical shape `Customer.code` already uses: the same code may exist
under two different companies, but never twice under the same company,
and this applies regardless of `is_active` — deactivating a product
does not free its code for reuse within that company. No formula/BOM,
dosage/potency/medical-claim field, pack-size calculation, batch
numbering, default price/tax/HSN/GST rule, shelf-life calculation, or
opening-stock/stock-ownership concept exists anywhere — all explicitly
out of this task's scope.

`sales_uom` is deliberately immutable, per this task's own explicit
instruction: letting it change later would silently reinterpret every
past and future transaction quantity recorded against a product, and no
unit-conversion engine exists anywhere in this codebase to safely
reconcile that. **Known, documented gap**: unlike `Material.base_unit`
(protected from deactivation by `apps.catalog.services.deactivate_unit`
while any active material references it), a `UnitOfMeasure` referenced
by an active `Product`'s `sales_uom` is **not** currently protected the
same way — `deactivate_unit` was deliberately left unmodified rather
than coupling an existing, unrelated app to a brand-new one (see
`docs/backend-decisions.md`, Task 10B, for the full reasoning). The
consequence is handled, not ignored: `ProductSerializer` always
includes the unit's joined `sales_uom_code`/`sales_uom_name` plus an
explicit `sales_uom_is_active` flag (never hidden or silently
substituted), and `activate_product` re-checks the unit's active state
before allowing a deactivated product to be reactivated.

### Access

Five new COMPANY-scope permissions, seeded idempotently by
`permissions.0013_seed_product_permissions` and assigned to no
role/user automatically: `products.view`, `products.create`,
`products.edit`, `products.activate`, `products.deactivate`. Same
`_get_company_for_action` fold-into-404 pattern as every other
company-scoped app in this project (locally defined in
`apps/products/views.py`, not imported across apps). No superuser/
`is_staff` bypass exists anywhere in this path.

### Endpoints

| Method | Path | Permissions |
|---|---|---|
| GET | `/api/v1/companies/<company_id>/products/` | `products.view` |
| POST | `/api/v1/companies/<company_id>/products/` | `products.view` + `products.create` |
| GET | `/api/v1/companies/<company_id>/products/<id>/` | `products.view` |
| PATCH | `/api/v1/companies/<company_id>/products/<id>/` | `products.view` + `products.edit` |
| POST | `/api/v1/companies/<company_id>/products/<id>/activate/` | `products.view` + `products.activate` |
| POST | `/api/v1/companies/<company_id>/products/<id>/deactivate/` | `products.view` + `products.deactivate` |

No `DELETE` exists anywhere in this module. List supports `?search=`
(code/name only, case-insensitive substring), a strict `?is_active=`
filter, and the project's standard pagination (20/page, up to 100).
Default ordering is `code`, then `id`. `company` is always derived
from the URL and rejected (`400`) if present in any request body;
`is_active`/`version`/`created_at`/`updated_at`/`created_by` are
likewise rejected. `PATCH` cannot change `code`, `company`, or
`sales_uom` (`400` if present, built as an independent prohibited-field
set from create's, never by unioning one into the other). `sales_uom_id`
resolves to a `UnitOfMeasure` (`404` if unknown) and is rejected (`400`)
if inactive, at both create and reactivate. A duplicate `(company,
code)` returns `409` (not an unhandled `500`), consistent with
`Customer`/`MaterialSpecification`, not `Supplier`'s older `400`.
Metadata edits (`name`/`description`) are permitted on an inactive
product as long as the company is active.

### Transactions and audit

Thin views, transactional service-layer mutations
(`apps/products/services.py`) — `create_product`, `update_product`,
`activate_product`, `deactivate_product`, each `@transaction.atomic`,
each locking the row (`select_for_update()`) before comparing
`expected_version`. `update_product`'s no-op detection normalizes
in-memory (an explicit `Product.clean()` call) before deciding whether
anything really changed, the identical mechanism `update_customer`
already uses and documents, for the identical reason (`Product` also
carries `version`, so `update_company`'s save-then-compare shape would
either wrongly bump `version` for a whitespace-only no-op or require an
inconsistent two-write sequence). `apps.audit.services.record()` is
called with `company=product.company` only. If `record()` raises, the
whole transaction — including the row's own field/`version` changes —
rolls back, verified by dedicated tests for create, update, and
deactivate. Django Admin registration is read-only
(`ReadOnlySuperuserAdminMixin`).

### Migrations

- `products.0001_initial` — creates the `Product` table with the
  `unique_product_company_code` constraint.
- `permissions.0013_seed_product_permissions` — idempotently seeds the
  five `products.*` COMPANY-scope permission definitions, assigned to
  no role/user.

Both confirmed applied to the live project database (`cmhp_new_dev`),
not just the test database.

### Verification

| Check | Command | Result |
|---|---|---|
| System checks | `python manage.py check` | Passed — no issues |
| Migration consistency | `python manage.py makemigrations --check --dry-run` | Passed — no changes detected |
| Migrations applied to the live dev database | `python manage.py migrate` | Passed — `products.0001_initial` and `permissions.0013_seed_product_permissions` both applied cleanly |
| Targeted app tests | `python manage.py test tests.test_products -v 2` | **Passed — 65/65, OK**, 191.636s, Python exit code 0 — clean on first run, no fix cycle needed |

New tests (`tests/test_products.py`, 65 tests) cover: code
normalization and per-company uniqueness; the same code allowed across
different companies; an inactive product still reserving its code;
company/code/sales_uom immutability after creation; blank-code/
blank-name/missing-sales_uom rejection; anonymous (`401`), inactive-user
(`401`), no-membership (`404`), inactive-company (`404`), and
unknown-company (`404`) access; membership-without-permission (`403`,
naming the missing code); no superuser bypass; company isolation on the
detail endpoint; `DELETE` rejected (`405`); prohibited-field rejection
on create (`company_id`/`is_active`/`version`) and on update (`code`/
`company_id`/`sales_uom_id`), built as independent sets; unknown-UOM
(`404`) and inactive-UOM (`400`) rejection at create; duplicate-code
`409` on both create and a genuine concurrent race (real OS threads +
a `threading.Barrier`); search across code/name; a strict `is_active`
filter; deterministic list ordering; `expected_version` required on
update and both lifecycle actions; stale-version `409`; no-op update
(exact match and whitespace-only) skipping both the version bump and
the audit entry; clearing `description` with `""`; metadata edits
permitted on an inactive product while its company is active; audit
before/after content; audit-write-failure transaction rollback on
create, update, and deactivate; lifecycle idempotent no-op behavior and
its interaction with the `activate`-vs-`edit` permission distinction;
reactivation correctly rejected when the sales unit has itself become
inactive since creation; the inactive sales unit still fully displayed
(code/name/flag) on the detail response, never hidden; a genuine
concurrent update race (real OS threads); and a read-only Django Admin
check.

No directly-affected permission regression was run beyond the targeted
suite above — a search of `tests/` found no test anywhere asserting a
fixed total `PermissionDefinition` count that a new seeded permission
set could break (same conclusion already reached and recorded for Task
10A).

Postman: new "Product Management" folder — Create, List/search/filter,
Detail, Edit, Deactivate, Activate, Stale-version example,
Cross-company access-denial example. See `docs/postman/README.md` for
the full walkthrough.

### Known limitations / open decisions (documented, not solved here)

- Company-scoping is this task's provisional implementation choice, not
  a confirmed policy — a shared product directory with company-specific
  offerings (a middle ground between `Supplier`'s fully-shared shape and
  today's fully per-company one) remains an open alternative; see
  `docs/erp-handoff-open-decisions.md` §A14.
- `apps.catalog.services.deactivate_unit` was not extended to check for
  an active `Product` reference, unlike its existing `Material` check —
  a unit of measure can be deactivated out from under an active
  product today, blocking that product's own future reactivation until
  the unit is reactivated again. See §A14 for the open question of
  whether this should be extended later.
- No quotation, sales order, invoice, or any other record that could
  reference a `Product` exists yet — a future task that adds one must
  check `is_active` itself, at the time it actually needs to.
- No formula/BOM, dosage/potency/medical-claim, pack-size, batch
  numbering, price/tax/HSN/GST, shelf-life, or stock concept — all
  explicitly out of scope for this task.
- `QuerySet.update()`/`bulk_create()`/`bulk_update()` bypass
  `Product.clean()` entirely, the same documented limitation every
  other normalizing model in this codebase carries.

## Task 10C — Company-Scoped Quotation Draft Foundation

**Status: Complete.**

New `apps.quotations` app: quotation **drafting only** (Customer -> Product
lines -> quantity/price -> save draft -> detail/edit). No approval, sending,
acceptance, revision, sales-order conversion, tax, discount, grand total,
PDF or stock effect. A search confirmed no quotation model existed before.

### Models and constraints

`Quotation`: `company` (FK `PROTECT`, immutable), `reference` (server-generated
`QT-YYYYMMDD-<10 hex>`, **technical working default, not client-confirmed
numbering**, never `count()+1`), `customer` (FK `PROTECT`, same company, active,
changeable while DRAFT), `quotation_date` (required), `valid_until` (optional,
not before `quotation_date`), `currency` (3 letters, upper-cased, immutable),
`notes`, `status` (enum with only `DRAFT`), `version`, `created_by`/`created_at`/
`updated_at`. Constraint `unique_quotation_company_reference` (reference unique
**within company**, not globally).

`QuotationLine`: `quotation` (CASCADE), `line_number` (server-assigned 1..N),
`product` (FK `PROTECT`, same company), `quantity` (>0, 14/3), `unit_price`
(>=0, 14/4, zero allowed), `description`, `line_amount` (server-calculated,
16/2), product code/name and sales-UOM code/name snapshots. Constraints:
`unique_quotation_line_number`, `quotation_line_quantity_positive`,
`quotation_line_unit_price_nonnegative`.

### Decimal, rounding and snapshots

`line_amount = quantity * unit_price` in `Decimal`, quantized to 2 dp
ROUND_HALF_UP (same as purchase orders); COUNT sales units accept whole
quantities only; oversized amounts are a 400, not a DB error. Response
`subtotal` is the derived pre-tax sum in the quotation's single currency
(never stored, never client-suppliable, never summed across currencies).
Snapshots are captured for new lines and when a line's product is replaced, and
never refreshed otherwise; the sales unit is never silently replaced.

### Access and endpoints

Permissions seeded by `permissions.0014_seed_quotation_permissions`, COMPANY
scope, assigned to nobody: `quotations.view/create/edit`. Same fold-into-404
helper as other company apps; no superuser/staff bypass.

| Method | Path | Permissions |
|---|---|---|
| GET/POST | `/api/v1/companies/<id>/quotations/` | view / view+create |
| GET/PATCH | `/api/v1/companies/<id>/quotations/<qid>/` | view / view+edit |

No DELETE or lifecycle endpoint. List: standard pagination, `search`
(reference/customer name), `customer`, `quotation_date_from`/`_to`
(inclusive), newest-first ordering, strict parameter validation (400 on bad
ids/dates/inverted range). Customer and product lookups reuse the existing
`customers.view`/`products.view` list endpoints (view, not edit, permissions);
the only gap (a `quotations.*`-only role cannot fill the pickers) is
documented, no new endpoint added.

### Editing rules

PATCH requires `expected_version`. `lines`, when present (even `[]`), is the
authoritative final list; entries with `id` update existing lines (unknown/
foreign/duplicate id -> 400), entries without `id` are new, missing lines are
removed; omitted `lines` leaves them untouched. New/changed lines need an
active same-company product with an active sales unit; unchanged lines that
reference now-inactive products/units are kept (and can always be removed).
Allow-list serializers reject forged totals, reference, status, version, audit
fields, company, snapshots, `line_number` and unknown keys. The row is locked;
header, lines, amounts, version and audit commit atomically; a no-op PATCH
writes nothing; an audit failure rolls back everything. Audit keeps full
before/after line lists (including removed lines). Django Admin is read-only
for both models.

### Migrations (applied to live `cmhp_new_dev`)

`quotations.0001_initial`, `permissions.0014_seed_quotation_permissions`.

### Verification

| Check | Command | Result |
|---|---|---|
| System checks | `python manage.py check` | Passed — no issues |
| Migration consistency | `python manage.py makemigrations --check --dry-run` | Passed — no changes detected |
| Migrations applied | `python manage.py migrate` | `permissions.0014` and `quotations.0001` applied |
| First quotation run | `manage.py test tests.test_quotations` | 51 run, 2 failed (both my own concurrency tests passing date strings instead of `date` objects to the service — a test bug, not an app bug), Python exit 1 |
| Concurrency class re-run | `manage.py test tests.test_quotations.ConcurrencyTests` | 2/2 OK, exit 0 |
| Final full quotation run | `manage.py test tests.test_quotations -v 1` | **Ran 51 tests in 88.763s — OK, Python exit code 0** |

No other regression suite was run: no existing app code was modified apart from
registering the app in settings/urls, and `tests/` contains no fixed permission-
count assertions. The full ERP suite was not run.

Tests cover: authorization, company isolation, no superuser bypass, DELETE 405;
customer/product/UOM validation (active, same company, inactive sales unit);
empty and zero-price drafts; Decimal rounding, COUNT whole numbers and
overflow; forged totals/protected/unknown fields on create and update; foreign
and duplicate line ids; stale versions; snapshot preservation and refresh
rules; unchanged inactive references; reorder renumbering; no-op and
whitespace-only PATCH; audit content (removed lines) and full rollback on audit
failure or validation failure; per-company reference uniqueness; concurrent
reference allocation and concurrent update (real threads); list search/filters
and strict validation; read-only Admin.

Postman: new "Quotation Drafts" folder (8 requests) with dedicated
`managed_quotation_id`/`quotation_version`/`quotation_line_id` variables; see
`docs/postman/README.md` §25.

### Remaining client policy questions

See `docs/erp-handoff-open-decisions.md` §A15 (reference numbering, currency
policy, tax/discount, validity semantics, lifecycle, scoping with A13/A14).

## Task 10D — Direct Sales Order Draft Foundation

**Status: Complete.**

New `apps.sales_orders` app: company-scoped **direct** sales-order drafts. A
draft authorizes nothing - no manufacturing, stock reservation, invoice,
dispatch or customer confirmation; no confirm/cancel lifecycle, no quotation
linkage/conversion, no tax/discount/freight, no reserved/produced/dispatched
quantity fields. No sales-order model existed before.

### Models and constraints

`SalesOrder`: `company` (PROTECT, immutable), `reference` (`SO-YYYYMMDD-<10 hex>`,
technical default, never `count()+1`), `customer` (PROTECT, same company,
active, changeable while DRAFT), `order_date`, `requested_delivery_date`
(optional, not before `order_date` - working rule for client review),
`customer_order_reference` (optional text, **not unique**), `currency`
(3 letters, immutable), `notes`, `status` (DRAFT only), `version`,
`created_by`/`created_at`/`updated_at`. `SalesOrderLine`: `line_number`,
`product` (PROTECT, same company), `quantity` (>0, 14/3), `unit_price` (>=0,
14/4), `description`, product/sales-UOM snapshots, server-calculated
`line_amount` (16/2). Constraints: `unique_sales_order_company_reference`,
`unique_sales_order_line_number`, `sales_order_line_quantity_positive`,
`sales_order_line_unit_price_nonnegative`.

### Behaviour

Decimal precision, ROUND_HALF_UP amounts, COUNT whole-number rule, active
customer/product/sales-unit checks, snapshot rules (new line or product
replacement only), nested-line semantics (omitted = unchanged, present =
complete final list, id updates, missing removed, foreign/unknown/duplicate
ids 400), unchanged-inactive-reference preservation, allow-list rejection of
forged totals/reference/status/version/audit/unknown fields, row lock,
atomic header+lines+version+audit, no-op suppression and audit rollback are
identical to Task 10C - implemented by importing the quotation helpers
unchanged (quotations were not modified). Response has a pre-tax `subtotal`,
never a grand total. Read-only Django Admin for both models.

### Access and endpoints

`permissions.0015_seed_sales_order_permissions`: COMPANY scope,
assigned to nobody: `sales_orders.view/create/edit`. Fold-into-404 helper, no
superuser/staff bypass. The operational role also needs `customers.view` and
`products.view` for the selectors.

| Method | Path | Permissions |
|---|---|---|
| GET/POST | `/api/v1/companies/<id>/sales-orders/` | view / view+create |
| GET/PATCH | `/api/v1/companies/<id>/sales-orders/<oid>/` | view / view+edit |

List: pagination, `search` (order reference, customer name or customer order
reference), `customer`, inclusive `order_date_from`/`order_date_to`,
newest-first, strict validation. No DELETE or lifecycle endpoint.

### Migrations (applied to live `cmhp_new_dev`)

`sales_orders.0001_initial`, `permissions.0015_seed_sales_order_permissions`.

### Verification

| Check | Command | Result |
|---|---|---|
| System checks | `python manage.py check` | Passed - no issues |
| Migration consistency | `python manage.py makemigrations --check --dry-run` | Passed - no changes detected |
| Migrations applied | `python manage.py migrate` | Both applied |
| Sales-order tests | `python manage.py test tests.test_sales_orders -v 1` | **Ran 56 tests in 140.430s - OK, Python exit code 0** (first run, no fixes) |

No other suite was run: quotation and other existing app code was not
modified (only settings/urls registration and imports of existing helpers),
so no shared-code regression was warranted; the full ERP suite was not run.
`tests/test_sales_orders.py` was generated from the quotation test module by
systematic renaming plus five sales-order-specific tests (customer order
reference trim/non-uniqueness/search/edit, delivery-date rule, absence of
quotation/stock/confirmation fields) - so it covers authorization, company
isolation, DELETE 405, customer/product/UOM validation, empty/zero-price
drafts, Decimal/COUNT rules, forged fields, foreign/duplicate line ids, stale
versions, snapshot and inactive-reference behaviour, no-op, audit rollback,
per-company reference uniqueness, concurrent creation/update (real threads),
list filters and read-only Admin.

Postman: "Direct Sales Order Drafts" folder (8 requests, variables
`managed_sales_order_id`/`sales_order_version`/`sales_order_line_id`), see
`docs/postman/README.md` section 26.

### Working defaults vs confirmed rules

Nothing here is client-confirmed. Working defaults: company scoping,
`SO-` numbering, delivery-date-not-before-order-date, non-unique customer
order reference, immutable currency, no quotation linkage. See
`docs/erp-handoff-open-decisions.md` section A16.

## Task 11A — Manufacturing Formula Draft Foundation

**Status: Complete.**

New `apps.formulas` app: versioned DRAFT manufacturing formulas linked to
Products, using existing Materials and Units of Measure. Preparation only: no
approval, batch creation, requirement generation, reservation, material
issue, production, scaling, unit conversion or percentage/yield/waste logic.
No formula/BOM model existed before; specification tests (`apps.quality`) are
untouched and separate.

### Models and constraints

- `Formula`: `company` (PROTECT, immutable), `product` (PROTECT, same company,
  immutable), `code` (normalized, immutable), `name`, `notes`,
  `latest_revision_number` (server allocation counter), `version` (metadata
  token), audit fields. Unique `unique_formula_company_code`. Several formulas
  per product allowed; none implied default/approved.
- `FormulaRevision`: `formula` (immutable), `revision_number` (server-assigned,
  immutable), `status` (DRAFT only), `base_output_quantity` (>0), `output_uom`
  (derived from `product.sales_uom`, immutable), `notes`, `version` (content
  token). Constraints `unique_formula_revision_number`,
  `formula_revision_base_output_positive`.
- `FormulaLine`: `line_number`, `material` (PROTECT), `quantity` (>0), `unit`
  (derived from `material.base_unit`), `notes`, material code/name/kind and unit
  code/name snapshots. Constraints `unique_formula_line_number`,
  `formula_line_quantity_positive`. Raw vs packaging is the material's own
  `Material.kind`; a client-supplied type is rejected.

### Behaviour

Create formula makes the formula and an empty revision 1 atomically (product
and sales unit active; base output positive; COUNT sales unit needs whole
numbers). New revisions are empty, numbered under a formula row lock. Revision
PATCH follows the established nested-line semantics (omitted = unchanged,
present = complete final list, id update / none new / missing removed,
unknown/foreign/duplicate ids 400); new or changed lines need an active
material and base unit, COUNT units need whole quantities; unchanged
references to since-deactivated masters are preserved and removable, changing
them is rejected; snapshots only for new lines or material replacement; base
output edits never rescale lines. Four distinct version-like values (formula
`version`, `latest_revision_number`, `revision_number`, revision `version`) are
documented in the handoff. Row locks, atomic mutation+version+audit (before/
after incl. removed lines), no-op suppression, audit rollback, allow-list
rejection of unknown/protected fields, read-only Admin for all three models.

### Access and endpoints

`permissions.0016_seed_formula_permissions`: COMPANY scope, assigned to nobody:
`formulas.view/create/edit`. Create (formula, revision) needs create; metadata
and revision edits need edit; all need view; no superuser/staff bypass.

| Method | Path |
|---|---|
| GET/POST | `/api/v1/companies/<id>/formulas/` |
| GET/PATCH | `/api/v1/companies/<id>/formulas/<fid>/` |
| GET/POST | `/api/v1/companies/<id>/formulas/<fid>/revisions/` |
| GET/PATCH | `/api/v1/companies/<id>/formulas/<fid>/revisions/<rid>/` |

No DELETE or approval/lifecycle endpoint. List: pagination, code/name search,
`product` filter, ordering code/id.

### Lookup access verification (concrete gap reported)

Products: `products.view` (company scoped) - sufficient. Materials: the shared
catalog list requires an active superuser or `shared_catalog.view` in at least
one active store (not company scoped). Company-only formula users therefore
cannot populate the material picker; this is documented and no new access
policy or global broadening was introduced. See `docs/backend-decisions.md`,
Task 11A.

### Migrations (applied to live `cmhp_new_dev`)

`formulas.0001_initial`, `permissions.0016_seed_formula_permissions`.

### Verification

| Check | Command | Result |
|---|---|---|
| System checks | `python manage.py check` | Passed - no issues |
| Migration consistency | `python manage.py makemigrations --check --dry-run` | Passed - no changes detected |
| Migrations applied | `python manage.py migrate` | Both applied |
| First formula run | `manage.py test tests.test_formulas` | 47 run, 1 failed (my own test asserted an unknown-material 404 after an earlier step in the same test had already bumped the revision version, giving 409 - test-ordering bug, not an app bug), Python exit 1 |
| Final formula run | `manage.py test tests.test_formulas -v 1` | **Ran 47 tests in 86.825s - OK, Python exit code 0** |

No other regression suite was run: no shared code changed (only settings/urls
registration; the existing catalog/product code was only read). The full ERP
suite was not run. Tests cover authorization (view/create/edit split), company
isolation, no superuser bypass, DELETE 405, product/company integrity,
material/UOM validation, positive Decimal and COUNT rules, immutable fields,
snapshot preservation/refresh, nested-line replacement, foreign/duplicate/
unknown ids, cross-parent revision ids (404), stale versions, four-counter
independence, audit before/after and rollback, no-op behavior, model
constraints, concurrent revision allocation (4 threads -> 2..5), concurrent
metadata edit + allocation, concurrent revision update, read-only Admin.

Postman: "Formula Drafts" folder (11 requests) with dedicated
`managed_formula_id`/`formula_version`/`formula_revision_id`/
`formula_revision_version`/`formula_line_id`/`formula_raw_material_id`/
`formula_packaging_material_id`/`new_formula_code` variables, see
`docs/postman/README.md` section 27.

### Working choices vs client-approved policy

Company scoping and simple quantity-based drafting are working implementation
choices, not client-approved manufacturing policy. Open questions:
`docs/erp-handoff-open-decisions.md` section A17.

## Task 11B — Current Backend Integration Demo and Handoff

**Status: Complete.** No business module was added.

- **Seed extension** (`seed_demo_data`, same command and safeguards): unit
  `DEMOBTL`, packaging material `DEMOPACK1`, customers `DEMOCUST1`/`DEMOCUSTB`,
  products `DEMOPROD1`/`DEMOPROD2`, users `demo_sales`, `demo_formula`,
  `demo_formula_nocatalog` with explicit company/store role assignments.
  First run on the live dev database: 9 created, 15 reused; second run: 0
  created, 24 reused; credentials file preserved byte-for-byte on the no-op
  run and merged (old entries kept) on the first.
- **Defect found and fixed**: the credentials writer replaced the whole file,
  which would have erased the eight existing demo users' recorded passwords
  once new personas were added. Fixed to merge; regression tests added in
  `tests/test_seed_demo_data.py` (8 tests).
- **Real HTTP demo** (`scripts/demo_http_commercial_formula.py`) against the
  existing project server on `127.0.0.1:8001` (process ownership confirmed as
  this project's `manage.py runserver`; no server started or stopped): **52/52
  checks passed** - 35 HTTP status checks (200 x16, 201 x4, 403 x4, 404 x7,
  409 x2, 401 x1, 405 x1 - counted by expected status) and 17 assertions.
- **Docs**: `docs/demo-integration-matrix.md` (new), `docs/demo-runbook.md`
  updated (§2, §3, new §4.3, §6, troubleshooting, references).

### Verification

| Check | Result |
|---|---|
| `python manage.py check` | Passed - no issues |
| `python manage.py test tests.test_seed_demo_data -v 1` | **Ran 8 tests in 52.676s - OK, Python exit code 0** |
| Real HTTP demo | 52/52 passed |
| Full ERP suite / formula suite / other regressions | Not run (no application code changed; only the demo seed command and demo script) |

### Remaining business blockers for production work

Order confirmation/cancellation lifecycle and quotation acceptance/conversion
policy; formula approval and who may approve; batch scaling rules (packaging
rounding, fixed quantities, process losses, yield/waste); potency/percentage
and unit-conversion rules; stock ledger/balances and reservation policy;
QC disposition and material release; taxes/discount/freight and numbering
schemes; shared-vs-company ownership of customers/products/formulas; material
lookup access for company-only formula users. See
`docs/erp-handoff-open-decisions.md` (A13-A17 and section B).

## Task 10E — Sales Order Confirmation Preview

**Status: Complete.** Read-only preview only; no confirmation, cancellation,
permission, model or migration was added.

`GET /api/v1/companies/<company_id>/sales-orders/<order_id>/confirmation-preview/`
(`apps/sales_orders/preview.py`, view in `views.py`). Same access as order
detail (`sales_orders.view`, fold-into-404, no superuser bypass); `GET` only.
Returns order id/reference/version/DRAFT status, customer and currency, line
summaries (stored snapshots, quantities, unit prices, line amounts) with the
current master active/inactive state under `current`, the pre-tax subtotal, and
structured observations: `data_validity_observations` (inactive customer/
product/sales unit, renamed-since-snapshot) versus `policy_observations` (empty
order, zero-price line, past requested delivery date) plus static
`open_policy_questions`. Every observation has `client_confirmed_blocker:
false`; there is no `can_confirm` and `confirmation_workflow.eligibility_
finalized` is false. Strictly read-only (no version/status change, no audit
event, no stock/batch/production effect). Documented as informational and
potentially stale; a future confirmation command must revalidate in a
transaction against the reviewed version.

### Verification

| Check | Command | Result |
|---|---|---|
| System checks | `python manage.py check` | Passed - no issues |
| Migration consistency | `python manage.py makemigrations --check --dry-run` | Passed - no changes detected (no migration needed) |
| New preview tests | `python manage.py test tests.test_sales_order_confirmation_preview -v 1` | **Ran 17 tests in 30.720s - OK, Python exit code 0** |
| Affected existing module (sales-order views/urls changed) | `python manage.py test tests.test_sales_orders -v 1` | **Ran 56 tests in 103.352s - OK, Python exit code 0** |

Preview tests cover: authorized access and response shape, view-only sufficiency,
create/edit-without-view denied, anonymous/no-membership/no superuser bypass,
company isolation, non-GET 405, empty/zero-price/past-date (boundary: today and
future are not flagged)/inactive customer-product-unit observations,
snapshot preservation (renames reported, DB unchanged), version reflection,
repeated previews changing nothing (version, `updated_at`, status, lines, audit
count, order count), zero write queries, and no confirm/cancel permission or
endpoint. The full ERP suite and the integration demo were not re-run.

Docs: `docs/frontend-api-handoff.md` §13.6, `docs/erp-screen-catalog.md`
SO-04 (Order Review panel; no enabled Confirm button), Postman request 9 in
"Direct Sales Order Drafts", `docs/erp-handoff-open-decisions.md`,
`docs/backend-decisions.md`.

## Task 10F — Policy-Gated Sales Order Confirmation

**Status: Complete.** DRAFT -> CONFIRMED only. No cancellation, unconfirm, amendment,
quotation conversion, stock reservation, batch, invoice or production effect.

### Policy schema and configuration API

`SalesOrderConfirmationPolicy` (one row per company, `OneToOne`, PROTECT):
`allow_self_confirmation`, `allow_zero_price_lines`, `allow_past_requested_delivery_dates`
(nullable booleans, **no defaults**, `null` = unanswered), `version`,
`created_by`/`created_at`/`updated_by`/`updated_at`. A missing or incomplete policy blocks
confirmation with the structured error `confirmation_policy_not_configured` /
"Confirmation rules are not configured. Contact your administrator." No live company is
configured automatically. Read-only Django Admin.

`GET|PATCH /api/v1/companies/<id>/sales-order-confirmation-policy/` - active superuser only
(existing configuration convention); `expected_version` (0 to create); audited
(`sales_order_confirmation_policy.created/updated`, before/after); explicit booleans only;
no-op writes nothing; stale/duplicate creation 409. Configuration authority is not
confirmation authority.

### Confirmation contract

`permissions.0017_seed_sales_order_confirm_permission` seeds COMPANY `sales_orders.confirm`,
assigned to nobody. `POST /api/v1/companies/<id>/sales-orders/<oid>/confirm/`
`{"expected_version": n}` needs `sales_orders.view` + `sales_orders.confirm` (never role
names/`is_staff`/`is_superuser`), re-checked under the lock. `SalesOrder` gained status
`CONFIRMED`, `confirmed_by`, `confirmed_at`, `confirmation_policy_version` and
`confirmation_policy_snapshot` (policy values, business date/timezone, safeguards). One
transaction: lock order -> access re-check -> `expected_version` (409; repeat at the current
version of a CONFIRMED order is a silent no-op) -> lock/re-read policy, customer, products,
units -> shared assessment -> write status/version/audit atomically (audit failure rolls
back). Blocking -> 400 with `blocking_reasons` (categories `POLICY_NOT_CONFIGURED`,
`ELIGIBILITY`, `POLICY_RULE`). Technical eligibility (implementation safeguards for client
review, not confirmed policy): at least one line; active customer/products/sales units;
positive, COUNT-valid quantities; valid currency, non-negative prices, consistent amounts.
After confirmation header/line edits are rejected (400 current / 409 stale) and no
unconfirm/cancel/amend endpoint exists.

The preview (`.../confirmation-preview/`) now reuses the same assessment and reports
`workflow_implemented: true`; contract change documented in `docs/frontend-api-handoff.md`
§13.6. Past-date checks use `settings.BUSINESS_TIME_ZONE` (default Asia/Kolkata, an
assumption for client review) instead of UTC.

### Migrations (applied to live `cmhp_new_dev`)

`permissions.0017_seed_sales_order_confirm_permission`,
`sales_orders.0002_salesorder_confirmation_policy_snapshot_and_more`.

### Verification

| Check | Command | Result |
|---|---|---|
| System checks | `python manage.py check` | Passed - no issues |
| Migration consistency | `python manage.py makemigrations --check --dry-run` | Passed - no changes detected |
| Migrations applied | `python manage.py migrate` | `permissions.0017` and `sales_orders.0002` applied |
| First run of the two new/rewritten modules | `manage.py test tests.test_sales_order_confirmation tests.test_sales_order_confirmation_preview` | 73 run, 1 failed (my own test expected `INCOMPLETE` after all three policy values had been answered; `CONFIGURED` is correct - a test bug, not an app bug), Python exit 1 |
| **Final combined run** | `manage.py test tests.test_sales_order_confirmation tests.test_sales_order_confirmation_preview tests.test_sales_orders -v 1` | **Ran 129 tests in 398.079s - OK, Python exit code 0** (73 new/rewritten confirmation + preview tests, plus the 56 existing sales-order tests re-run because the create/edit/serializer/preview paths changed) |

The new confirmation module covers: policy API (superuser-only, versioning, no-op, audit,
rollback, allow-lists, explicit booleans, no authority granted), missing/incomplete policy
blocking with the structured error, each explicit policy choice, business-date/timezone
handling, technical eligibility (empty, inactive customer/product/unit, invalid quantity,
amount and currency), authorization (view+confirm both needed, no superuser/staff/role-name
bypass, company isolation), successful confirmation with recorded policy context, policy
snapshot surviving later policy changes, no stock/production/conversion side effects, audit
rollback, stale/repeat behavior (silent no-op only for a still-authorized user), edit
rejection after confirmation (API and service), no unconfirm/cancel/amend endpoints,
historical readability after master deactivation, preview/command consistency, and real-thread
concurrency (confirm vs edit, concurrent confirms, deactivation waiting on an in-flight
confirmation, a committed deactivation being seen, unit UPDATE blocking, policy change waiting
and the order recording the version it used, concurrent policy creation). The full ERP suite and the
integration demo were not re-run; the demo script's one now-stale expectation (a confirm
endpoint "does not exist") was corrected to the real `403` for a user without `sales_orders.confirm`,
without running it.

### Documentation

`docs/frontend-api-handoff.md` §13.6-13.8, `docs/erp-screen-catalog.md` SO-04/SO-05/SO-06,
Postman "Direct Sales Order Drafts" (15 requests, `sales_order_policy_version` variable),
`docs/backend-decisions.md` (Task 10F: exact concurrency guarantee, lock order, timezone),
`docs/erp-handoff-open-decisions.md`, and the demo script/matrix wording (the demo's
`demo_sales` user has no confirm permission, so its confirm attempt is expected to be `403`).

## Task 11D — Read-Only Formula Material Requirement Preview

**Status: Complete.** No model, migration, permission seed or data change. Formula approval (Task 11C) is
still **not implemented** and is not implied.

`GET /api/v1/companies/<company_id>/formulas/<formula_id>/revisions/<revision_id>/requirement-preview/?target_output_quantity=<n>`
(`apps/formulas/requirement_preview.py`, view in `views.py`). `formulas.view` only, existing company
isolation and 403/404 conventions, no superuser/role-name bypass, `GET` only. The target is in the revision's
output unit (no conversion) and is strictly validated (positive, max 3 decimals, max 11 integer digits, whole
number for COUNT outputs, unknown/repeated parameters rejected). Each line: `stored quantity × target ÷ base
output`, exact rational arithmetic, returned as decimal strings with `is_exact`/`is_approximate`/
`is_whole_number` (display precision 50 significant digits, ROUND_HALF_EVEN; no operational rounding).
Response: formula/revision/product identity, DRAFT status and content version, base output and output unit,
target, scale factor with precision info, lines with stored snapshots and derived RAW/PACKAGING type, current
master state separately, structured `calculation_issues` and `warnings`, `calculation_complete`,
`generated_at`, and the required planning-only notices. No `can_produce`/`approved`/`available_stock`/
`shortage`. Read-consistent by a version double-read with bounded retry (409 if still changing).

### Verification

| Check | Command | Result |
|---|---|---|
| System checks | `python manage.py check` | Passed - no issues |
| Migration consistency | `python manage.py makemigrations --check --dry-run` | Passed - no changes detected (none needed) |
| First combined run | `manage.py test tests.test_formula_requirement_preview tests.test_formulas` | 82 run, 2 failed: (1) a real defect - `Decimal.normalize()` used the ambient 28-digit context and truncated the 50-digit approximation (fixed with an explicit local context); (2) a wrong test - it tried to store a zero line quantity, which the database constraint forbids (the defensive path is now tested on the pure builder), Python exit 1 |
| **Final combined run** | `manage.py test tests.test_formula_requirement_preview tests.test_formulas -v 1` | **Ran 83 tests in 196.327s - OK, Python exit code 0** (47 existing formula tests + 36 new preview tests, one run) |

New tests cover: authentication/permission/company isolation, no superuser bypass, view-only sufficiency,
create/edit-without-view denial, cross-parent revision ids; target 500 and 50 from base 100 using the
synthetic client example (A 10 kg, B 5 kg, C 8 kg, caps 25, labels 500, cartons 500 - illustrative
arithmetic, not real formulations); target equal to base; terminating and non-terminating ratios
(`1/3` shown as 50 digits, not exact); fractional COUNT output target rejection; fractional COUNT material
warning without rounding; exact detection of tiny and almost-whole fractions; mass output with fractional
target; RAW-only and PACKAGING-only formulas; empty formula; a non-calculable line reported not skipped;
inactive masters with preserved snapshots; missing/blank/malformed/non-finite/zero/negative/over-precise/
oversized targets, unknown and repeated parameters; no forbidden response keys; required notices; repeated
previews causing no persisted change or audit write; zero write/lock statements; a concurrent edit injected
between the header and line reads (retried, never torn) and a permanently-changing revision returning 409;
POST/PATCH/PUT/DELETE unsupported. Not run: the full ERP suite, the demo scripts.

### Documentation corrections

`docs/frontend-api-handoff.md` §0.5 and §14 discrepancy note, and `docs/frontend-build-sequence.md`
claimed the 958-test full suite verified the current code. It is now labelled **historical Task 09A
evidence**; no full-suite result exists for the current codebase and no new total is invented.

### Still unresolved (client decisions)

Actual output-unit vs packing-unit relationships; rounding of fractional pieces; fixed-per-batch inputs;
yield and losses; formula approval (Task 11C, including contributors and approvers); batch and stock
workflows (batch record, requisition, ledger, reservation, issue, consumption, return).

## Next task (not started)

Not yet specified. Task 10A implemented a company-scoped customer
*identity/contact directory*; Task 10B implemented a company-scoped
*saleable-product identity record*. Neither task implements any
quotation, sales order, invoice, customer portal, or other transaction
that could reference either model — that is the natural next slice, but
it needs the client to resolve the shared-vs-per-company scoping
question for both `Customer` and `Product` first (see
`docs/erp-handoff-open-decisions.md` §A13/§A14), plus define what a
quotation/sales-order line actually needs to carry (pricing, tax,
discount, and unit-of-measure-conversion rules do not exist anywhere in
this codebase yet). QC review/disposition/acceptance/rejection/release,
retesting, correction, specification approval/publication, stock
ledger/balances, posted-receipt corrections, supplier
qualification/approval, purchasing-company/shared-stock-ownership rules,
taxes, and payments all remain unimplemented and unscheduled. Do not
begin implementing any further slice of `docs/incoming-qc-review-
proposal.md`, any approval/publication workflow for
`MaterialSpecification`, or any quotation/sales-order feature against
`Customer`/`Product`, until the client has answered the relevant open
questions and implementation is explicitly requested.


## Task 11C — Policy-Gated Formula Revision Approval

**Status: Complete (approval only).** Additive schema, one permission seed, a contributor backfill; no data deleted
or rewritten. Stopped after approval and its compatibility updates: no unapprove, clone, retire, supersede,
effective dating, "current revision" selection, batch scaling, requisition, stock or production lifecycle.

**Schema (`formulas.0002`, `formulas.0003`, `permissions.0018`).** `FormulaApprovalPolicy` (one per company,
nullable `allow_self_approval`, `version`, actor/timestamps); `FormulaRevisionContributor` (unique per revision+user);
`FormulaRevision` gains status `APPROVED`, `contributor_history_complete`, `approved_by`, `approved_at`,
`approval_policy_version`, `approval_policy_snapshot`, `approved_identity_snapshot`. COMPANY permission
`formulas.approve` is seeded and **assigned to nobody**.

**Endpoints.** `GET/PATCH /companies/<id>/formula-approval-policy/` (active superuser; `expected_version`, 0 = create;
no-op writes nothing; audited). `GET .../revisions/<rid>/approval-preview/` (`formulas.view`, read-only).
`POST .../revisions/<rid>/approve/` `{"expected_version": n}` (`formulas.view` + `formulas.approve`, company
membership, no superuser/role-name bypass). A missing or unanswered policy blocks with 400
`formula_approval_policy_not_configured`. Other blocks return 400 `formula_approval_blocked` with structured
`blocking_reasons` (`category` POLICY_NOT_CONFIGURED / ELIGIBILITY / POLICY_RULE).

**Contributors (working definition, for client review).** Creator, or anyone who made a *substantive content* change
(base output, revision notes, material lines). Formula-master metadata edits do not count; a no-op update adds nobody.
Rows are written in the same transaction as the creation/edit. Legacy revisions are backfilled only from reliable
history: `contributor_history_complete` is set only when the creation audit event's actor equals `created_by` and
`version - 1` equals the number of `formula_revision.updated` events; otherwise it stays false. If self-approval is
prohibited and history is incomplete, approval fails closed (`CONTRIBUTOR_HISTORY_INCOMPLETE`). There is no manual
"mark complete".

**Eligibility safeguards (technical, not business policy).** DRAFT status; at least one line; positive base output
and line quantities (whole for COUNT); consistent product/output unit/material/line-unit relationships; active
product, output unit, materials and line units. RAW-only and PACKAGING-only revisions are fine. No yield, potency or
scaling policy exists.

**Atomicity and locks.** Lock order: revision, formula, company policy, product, units (ascending id), materials
(ascending id); all single-table `FOR NO KEY UPDATE`/`FOR UPDATE`, compatible with the existing write paths. Rows are
re-read after locking; the same `assess_approval` function powers the preview and the command. Stale
`expected_version` is 409. A repeat at the current version of an already-approved revision is a no-op (no rewrite, no
audit, not reassessed). The audit event is in the same transaction, so an audit failure rolls back everything.

**Immutability.** An approved revision cannot be edited or deleted through services, the API, model `save`/`delete`
or admin (all read-only); Formula master metadata stays editable. The identity shown at approval
(`approved_identity_snapshot`) is frozen separately from current formula/product metadata. New revisions stay empty
DRAFTs; several approved revisions can coexist; nothing is auto-selected.

**Requirement preview (Task 11D) compatibility.** Notices are now status-aware (draft vs approved); an `approval`
block carries the approved identity snapshot. Arithmetic, validation, COUNT warnings and read consistency are
unchanged.

**Verification.** one combined run of tests.test_formula_approval (52) + tests.test_formula_requirement_preview + tests.test_formulas, 135 tests, OK, Python exit 0, 464.206s; manage.py check clean; makemigrations --check --dry-run: no changes; migrations formulas 0002/0003 and permissions 0018 applied to the dev DB

**Unresolved client decisions.** Who holds `formulas.approve`; the per-company self-approval answer; whether the
contributor definition matches expectations; revision selection/defaults; effective dating and superseding; batch
scaling and production authorization. See `docs/erp-handoff-open-decisions.md`.


## Task 12A — Manufacturing Batch Planning Drafts

**Status: Complete (planning drafts only).** A `BatchPlan` is a planning record only: it does not authorize
production, allocate an official batch number, reserve stock, issue material or create a store requisition. Stopped
after this slice, as instructed.

**Model (`apps/batch_plans`, migration `0001_initial`).** `BatchPlan`: immutable `company`, `sales_order_line`
(PROTECT) and `formula_revision` (PROTECT) FKs, `target_output_quantity`, optional `planned_manufacturing_date` and
`packing_size_note` (descriptive text only - no conversions), `notes`, `status` (`DRAFT` only in this slice),
`version`, `created_by`/timestamps, and server-generated source snapshots (order reference/line number, product,
output unit, formula code/name/revision/base output). The internal plan id is its identifier; it is never called an
official Batch No. Model `delete()` always raises - there is no delete path anywhere.

**Endpoints.** `GET/POST /companies/<id>/batch-plans/`, `GET/PATCH /companies/<id>/batch-plans/<id>/`,
`GET /companies/<id>/batch-plans/<id>/requirement-preview/`. COMPANY permissions `batch_plans.view/create/edit` are
seeded and **assigned to nobody**. POST additionally needs `sales_orders.view` and `formulas.view` (source-access
lookups); the requirement preview additionally needs `formulas.view`. No DELETE or lifecycle route exists. Ordinary
list/detail responses never include the formula's own lines - only its code/name/revision number - so
`batch_plans.view` alone cannot be used to read a full recipe.

**Creation rule.** One plan references one sales-order line (DRAFT or CONFIRMED); several plans may reference the
same line with no quantity allocation implied. The selected formula revision must be `APPROVED`, belong to the same
company, and its product/output unit must match the line's product/sales unit exactly (no unit conversion - identity,
not equivalence). Target quantity follows the existing precision (3 decimal places) and COUNT-wholeness rules.

**Locking.** A fixed, documented order - SalesOrder, then its SalesOrderLine (re-read), then FormulaRevision, then
Product, then UnitOfMeasure, all single-row locks - shared by creation and by a target-quantity update, so a
mismatched or since-deactivated combination can never be created or accepted, verified with real-thread races
against product/unit deactivation and against a concurrent order-line product replacement.

**Source drift.** A `source_drift` block on the detail/preview responses reports product/unit incompatibility
(blocking), line renumbering, product/unit renaming and inactive-master warnings (informational), computed live
against current data - it is never silently used to refresh the plan's own snapshots or relink it. An incompatible
drift blocks a target-quantity change and blocks the requirement-preview calculation, but descriptive edits (notes,
packing note, planned date) remain allowed on a drifted or historically-deactivated plan.

**Deletion protection.** `SalesOrderLine.product`/`sales_order` FKs already used PROTECT; `apps.sales_orders.services.
update_sales_order`'s existing `ProtectedError` handler now also recognises a referencing `BatchPlan` and returns a
clear field-keyed 400 naming the blocked line, rolling back the whole order update - never a 500.

**Requirement preview.** Reuses `apps.formulas.requirement_preview`'s exact-fraction calculator and its read-
consistency approach unchanged, applied to the plan's saved target and pinned revision; adds a `plan`/`source_context`/
`source_drift` block and planning-specific notices ("official batch number not assigned"; no stock check; nothing
reserved/issued/consumed). Read-only: no writes, locks, version bumps or audit rows.

**Verification.** one run of tests.test_batch_plans, 33 tests, OK, Python exit 0, 214.355s (includes real-thread concurrency races); manage.py check clean; makemigrations --check --dry-run: no changes; migrations batch_plans 0001 and permissions 0019 already applied to the dev DB

**Unresolved client decisions.** Which company/customer/brand code supplies official batch numbering and which date
determines its year; whether the yearly sequence resets; order-to-production batch split/merge rules; planned-
quantity allocation limits against the ordered quantity; packing conversions and rounding; MRP, currency and printing
fields; store requisitions, stock ownership and QC/QA release; production authorization. See
`docs/erp-handoff-open-decisions.md`.

## Task 12A closeout — integration gap review

A follow-up review found and corrected an inaccuracy in Task 12A's own closeout: it had said sales_orders app code
was not changed. It was — the `ProtectedError` -> 400 handler for a sales-order line referenced by a `BatchPlan`
(`apps/sales_orders/services.py:262-278`, inside `update_sales_order`) is part of the same earlier, unlogged pass
that built `apps/batch_plans` (file mtimes: `apps/sales_orders/services.py` 2026-09-29 11:46:56, one minute before
`apps/batch_plans/models.py` 11:47:40; `apps/sales_orders/views.py`/`models.py` are untouched, from 2026-09-24). It
is a local `try/except ProtectedError` in one function, not a shared/generic handler; it reads `e.protected_objects`
for a `sales_order_line_id` attribute (true only for `BatchPlan` rows) and raises a field-keyed `DjangoValidationError`,
converted to HTTP 400 by the view's existing, shared `translate_django_validation_error`. Because `update_sales_
order` is `@transaction.atomic`, the raise rolls back everything else attempted in the same call.

Two test gaps were closed in `tests/test_batch_plans.py` (the prior coverage called `update_sales_order` directly,
bypassing HTTP/auth): `test_authenticated_patch_removing_a_referenced_line_returns_400_and_rolls_back` (a real
authenticated `PATCH`, combined with an unrelated header change in the same request, asserting 400, the line still
exists, the header changes were not partially applied, and no audit row was written) and `test_list_and_detail_
never_expose_formula_lines_even_with_full_access` (list and detail never carry a `lines`/`formula_lines` key even
with both `batch_plans.view` and `formulas.view`). `test_preview_requires_formulas_view` already covered the preview
endpoint's own 403. Verification: 2 new tests, OK, Python exit 0, 6.3s; no app code was changed, so the existing
33-test file run was not repeated.

## Task 12B — Client register field mapping (read-only)

Mapped the client's plain-English register fields (Admin/Store Manager/Manager/Production/Packaging/Dispatch/
Invoice) against the actual `Product`/`Customer`/`SalesOrder`/`BatchPlan` code, without inventing meanings for
ambiguous labels ("Name", "Type", "Company", "Company Code", Label/Box/Insert, "Planned Mfg Date" vs. the two
existing date fields). No model, migration or schema change was made. See `docs/client-register-field-mapping.md`
and its "recommendation" section (small, permission-scoped child records per department, not one shared model).

## Task 12B-1 — Align Product and client register fields with the actual Excel

**Status: Complete.** The client supplied real Excel headers and one sample row, confirming several Task 12B
guesses and correcting others ("Name" = Product Name; "Type" = Product Type; `GER/06` = Product Code, not Batch No.;
"Client/Company Name" = the customer, kept separate from the operating company; order quantity is in bottles;
Packing Size and Batch Size are separate numbers; the planning field is a month, not a full date).

**Schema change (additive only).** `Product.product_type` (`CharField(max_length=100, blank=True, default="")`,
`apps/products/migrations/0002_product_product_type.py`) - free text, deliberately **no fixed choice list** ("Tablets"
is the client's one example value, not a complete enumeration); existing rows default to `""` and remain valid with
no data migration. Exposed and editable through the existing Product API only, using its existing conventions:
`ProductSerializer`/`ProductCreateSerializer`/`ProductUpdateSerializer`, `products.view`/`products.create`/
`products.edit`, `expected_version` optimistic concurrency, and the existing `product.created`/`product.updated`
audit trail (`PRODUCT_TRACKED_FIELDS` now includes it). No new endpoint or permission.

**Verified not to silently affect historical records.** Every snapshot that captures a `Product` into another record
(`apps.quotations.services._snapshot_fields`, reused by sales orders; `apps.batch_plans.services.create_batch_plan`'s
`snapshots` dict; `apps.formulas.approval.approved_identity`) builds from an explicit, hand-written field list, never
a generic serialize-the-whole-product call - `product_type` appears in none of them, so it cannot retroactively alter
any existing quotation line, sales-order line, formula-approval snapshot, or batch-plan snapshot. Confirmed by
reading those functions; none of that shared code was changed.

**Customer.code as the client code candidate (analysis only - nothing created or rewritten).** `Customer.code`
(`max_length=32`, normalised, unique per `(company, code)`, `company` here being the *operating* company) can hold a
value like `"GER"` trivially. Not yet resolved: if the same client transacts with either operating company, today's
schema needs two separate `Customer` rows with nothing enforcing the same code on both - the same A13 open question
from `docs/erp-handoff-open-decisions.md`, now grounded in a real client code. No `Customer` row was created and no
existing code was renamed, per the task's own instruction.

**Batch-planning unit-compatibility gap documented, not fixed.** Task 12A's same-unit rule correctly rejects the
client's own sample (order in bottles, formula/batch output in kilograms) - this is recorded as the reason a
packing-content/conversion concept is needed, not a bug. The arithmetic does not even close on the one sample given:
`3024 x 25 g = 75.6 kg`, but the client recorded `76 Kgs` - a 0.4 kg (~0.53%) difference whose cause is recorded as
**unresolved**, not guessed at. No unit safeguard was removed and no conversion was implemented, per the task's
explicit instruction.

**Verification.** `manage.py check`: clean. `makemigrations --check --dry-run`: no changes (the one migration was
already generated and applied). One run of `tests.test_products` (existing 69 + the new `product_type`-focused
tests): 69 tests, OK, Python exit 0, 272.627s. No other app's code changed, so no other suite was run.

**Pending for the next slice (see `docs/client-register-field-mapping.md`).** Packing content quantity/unit;
manufacturing batch quantity/unit; planned manufacturing year/month; Packing Type; Label/Box/Insert meanings;
printing/BMR/production/requisition status choices; MRP currency and per-pack basis; official batch numbering - none
added as generic text columns, each recorded as its own open structural question.


## Task 12B-2 — Structured Packing Content and Manufacturing Quantity

**Status: Complete (this bounded slice only).** Batch plans can now represent the client's own bottles-vs-kilograms
case correctly, without weakening the same-unit safeguard Task 12A built.

**Two supported source-unit shapes (`apps/batch_plans/validation.py`), mutually exclusive, never inferred:**
- **Shape A (unchanged Task 12A default):** no packing fields at all - the source line's product sales unit must
  still equal the formula revision's own output unit.
- **Shape B (new):** an explicit packing relationship - `planned_pack_quantity` (a whole COUNT quantity of the
  line's own pack unit, e.g. bottles) + `packing_content_quantity` + `packing_content_uom` (how much MASS/VOLUME
  content one pack holds, e.g. grams) - always supplied together, never partially. The line's own unit must be
  COUNT; the content unit must share the formula output unit's dimension (MASS-MASS or VOLUME-VOLUME, never
  MASS-VOLUME); both units must carry an explicit `UnitOfMeasure.canonical_factor` (below) or the combination is
  rejected as an unknown conversion. `target_output_quantity` keeps its Task 12A meaning exactly - an explicit,
  separately-entered manufacturing target in the formula's output unit, never derived from the packing fields.

**`UnitOfMeasure.canonical_factor` (`apps/catalog/migrations/0002_unitofmeasure_canonical_factor_and_more.py`).**
The smallest explicit, documented conversion representation this project has: "1 of this unit equals
`canonical_factor` of this dimension's own canonical base" - nullable for every unit, always (never silently
assigned to an existing unit); required `null` for COUNT; optional, positive, **immutable once set**, for
MASS/VOLUME. Set only through the existing superuser-only unit-creation API. Used ONLY to convert a packing-content
quantity into a formula's output unit - never MASS to VOLUME, never inferred from unit names/codes.

**Formula revision output unit (Task 12B-2, `apps/formulas/services.py`).** `create_formula`/`create_formula_
revision` accept an optional `output_uom_id`: omitted, the original default (`product.sales_uom`) is unchanged;
given, any active unit is accepted, independent of the product's own sales unit - this is what makes a
bottle-sold/kilogram-manufactured product plannable at all. Existing and approved revisions are untouched; the
field remains immutable once a revision is created. `apps.formulas.approval.assess_approval` no longer requires
`output_uom == product.sales_uom` (that equality was the actual blocker for this case) - it still requires
`product.company_id == formula.company_id` (renamed `INCONSISTENT_PRODUCT_COMPANY`) and every other eligibility
safeguard unchanged.

**Read-only quantity assessment.** `packing_assessment` (in the batch-plan detail response AND the requirement-
preview response) reports, using the same exact-fraction engine and display rendering as the material calculator:
`planned_pack_quantity`/pack unit, `packing_content_quantity`/unit, `expected_packed_content` (converted into the
formula's output unit), the explicit `manufacturing_target_quantity`, and a signed `difference` labeled
**"Planning quantity difference"** - never waste/yield/allowance/shortage, and never auto-corrected in either
direction. For the client's own sample (3024 bottles x 25 g = 75.6 kg computed vs. 76 kg entered), the response shows
exactly `expected_packed_content: 75.6`, `difference: +0.4`.

**Material requirement calculation is unchanged in principle:** it scales by `target_output_quantity` (76 kg in the
example) - never by the pack count or the computed 75.6 kg - exactly as Task 11D/12A already did; verified with a
case where base output, target and the computed content are all different numbers, so a wrong substitution would be
visible.

**Editing.** Any of `target_output_quantity`/`planned_pack_quantity`/`packing_content_quantity`/
`packing_content_uom_id` is a substantive quantity edit: it re-locks the source (same fixed order as creation - see
`_lock_source_context`, now locking every referenced unit together in one ascending-id query) and re-validates the
COMPLETE merged state, never just the changed field in isolation; a no-op (all resulting values identical) still
writes nothing. Source drift (`assess_source_drift`) now branches correctly: a Shape-B plan is drift-incompatible
only if the line's own unit no longer matches what its packing relationship was computed against - it does NOT
flag a legitimate bottle-vs-kilogram pairing as incompatible merely because the units differ.

**Verification.** one combined run of tests.test_batch_plans (52) + tests.test_formulas + tests.test_formula_requirement_preview + tests.test_formula_approval + tests.test_catalog + tests.test_products, 358 tests, OK, Python exit 0, 733.727s; manage.py check clean; makemigrations --check --dry-run: no changes; migrations catalog 0002 and batch_plans 0002 applied to the dev DB

**Unresolved (unchanged or newly confirmed as still open).** Why the client's own numbers do not reconcile exactly
(75.6 vs 76 kg) remains unexplained - no wastage/yield/rounding factor was introduced to close that gap. Whether
packing specifications should become reusable product-level variants (today a packing relationship is plan-specific
only). Permitted batch sizes and any operational rounding policy. Fixed materials and loss/yield policy. Official
batch numbering and production authorization (unchanged since Task 12A).


## Task 12C — Store Preparation Foundation

**Status: Complete (bounded slice).** Store Managers can now record the confirmed preparation information for an
existing `BatchPlan` - Packing Type and whether an insert is required - without touching the plan itself.

**Model (new app `apps/store_preparation`, migration `0001_initial`).** `StorePreparation`: immutable
`batch_plan` (`OneToOneField`, `PROTECT` - enforces **exactly one preparation per plan at the database level**) and
`store` (`PROTECT`) FKs, `packing_type` (optional free text - the client's own confirmed rule: manually entered, no
fixed list, e.g. `"25 Gm G2"`), `insert_required` (nullable boolean - `null` = not specified, `false` = not
required/N/A per the client's own confirmed meaning, `true` = required and **only** required, never available/
printed/issued/ready), `version`, `created_by`/`updated_by`/timestamps. Model `delete()` always raises, matching
`BatchPlan`'s own convention - no lifecycle exists to remove one.

**Endpoints.** `GET/POST /stores/<store_id>/preparations/`, `GET/PATCH /stores/<store_id>/preparations/<id>/`.
STORE permissions `store_preparation.view/create/edit` are seeded and **assigned to nobody**. Creation and every
read additionally require `batch_plans.view` in the source plan's own OPERATING COMPANY - store access alone never
reveals a company's batch plans, mirroring Task 09A receiving's identical dual-context rule
(`companies_with_po_view_access`, replicated here as `companies_with_batch_plan_view_access`). No DELETE or
lifecycle route exists. The response exposes only a minimal `plan_context` (planning id, order reference, product
code/name) - never the formula's material lines, recipe quantities, or prices.

**Creation.** `batch_plan_id` is always explicit in the request body - nothing is auto-selected, and a `GET` never
creates a record. A concurrent duplicate for the same plan is a clear 409 (the database's own `OneToOneField`
uniqueness, translated the same way every other genuine identity collision in this project is), never a 500.
`BatchPlan.packing_size_note` (Packing Size, Task 12A) and `StorePreparation.packing_type` (Packing Type) are
deliberately separate fields - creating or editing one never touches the other, and neither this record nor any
service it calls ever mutates the source `BatchPlan`.

**Editing.** `expected_version` required; only `packing_type`/`insert_required` are writable; `batch_plan`/`store`
are immutable (rejected by the serializer, and defended again in `StorePreparation.clean()`). `insert_required`
accepts `true`/`false`/an explicit `null` (to reset to "not specified") at any time. No-op writes nothing; a real
edit bumps `version` and writes one audit event (with both `company` and `store` context, mirroring
`apps.receiving.services`), atomically; an audit failure rolls back everything.

**Verification.** one run of tests.test_store_preparation, 43 tests, OK, Python exit 0, 112.160s (includes a real-thread concurrent-duplicate-creation race); manage.py check clean; makemigrations --check --dry-run: no changes; migrations permissions 0020 and store_preparation 0001 applied to the dev DB; no shared app code changed, so the prior 358-test baseline was not repeated

**Working choices requiring client review (not confirmed policy).** Exactly one preparation record per batch plan -
if the client later needs multi-store routing or several preparation attempts per plan, this needs to become a
`ForeignKey`, a schema change. The dual-access rule (store permission AND separately `batch_plans.view` in the
plan's own company) - store membership is never treated as implying company access.

**Deliberately NOT implemented (see docs/client-register-field-mapping.md).** Label/Box values and what `0` means on
the client's own sample row; insert quantity, readiness, or artwork/reference tracking; any requisition lifecycle;
official batch numbering/year/reset rules. No placeholder field was added for any of these.


## Task 12D — Official Batch Number Allocation

**Status: Complete.** An explicit, audited `POST .../allocate-number/` command on an already-existing `BatchPlan`
records its one permanent official batch number. Allocation authorizes nothing: it does not touch the source
order's confirmation state, the formula's approval state, or the plan's own `DRAFT` status.

**Confirmed client numbering rules, implemented exactly as stated.** Format `CODEYY-NNN` (e.g. `GER26-001`); `CODE`
is the SOURCE ORDER's CUSTOMER's own code, never the operating company's code; the year is the year the number is
ALLOCATED (server time in `settings.BUSINESS_TIME_ZONE`), never the order date or the plan's planned manufacturing
date/month; the sequence restarts at `001` for each `(operating company, client code)` pair every new allocation
year; displayed with a minimum of 3 digits.

**Model (`apps/batch_plans`, migration `0003`).** `BatchNumberAllocation` - a protected `OneToOneField` to
`BatchPlan`, and (unlike every other record in this project) FULLY IMMUTABLE once created: its own `clean()` rejects
any save on an already-existing row outright, and `delete()` always raises - there is no edit/clear/regenerate/
cancel/unnumber/reuse path anywhere. `BatchNumberSequenceCounter` - the one per-namespace counter, keyed
`(operating_company, client_code_snapshot, allocation_year)` with a database `UniqueConstraint`, never read with an
unlocked `MAX(...)+1`.

**Endpoint.** `POST /companies/<company_id>/batch-plans/<id>/allocate-number/` `{"expected_version": n}` - `code`/
`year`/`sequence`/`number` are never accepted from the client. COMPANY permission `batch_plans.allocate_number` is
seeded and **assigned to nobody**; required alongside `batch_plans.view`, deliberately **not** `formulas.approve` -
allocation is a separate action. List/detail now show `official_batch_number` (nullable), `numbered_by_id`,
`numbered_at` alongside the existing planning ID, which is never overloaded with the official number.

**Locking and concurrency.** Lock order: plan -> source `SalesOrder` -> its `Customer` (mirrors
`apps.sales_orders.confirmation`'s own order-then-customer sub-order, so this can never deadlock against a
concurrent order edit/confirmation) -> a fresh, order-protected re-read of the line's product/unit identity -> the
namespace counter (locked directly if it exists, or created inside a SAVEPOINT and re-read if a concurrent
first-creation race is caught as `IntegrityError` - never an unexplained 500, never a poisoned outer transaction).
Two different plans in the same namespace, allocated concurrently, always receive distinct sequential numbers
(verified with real threads). A stale `expected_version` is 409; an authorized repeat at the CURRENT version of an
already-numbered plan returns the existing number completely unchanged - no new sequence, version bump, or audit
event. An audit failure rolls back the counter increment and the allocation together.

**Overflow.** After `999` the sequence continues `1000`, `1001`, ... - never wraps, never truncates. A documented
technical working choice about display format, not a claim about realistic batch volume.

**Verification.** one combined run of tests.test_batch_number_allocation (36) + tests.test_batch_plans, 90 tests, OK, Python exit 0, 221.615s (includes real-thread races: distinct sequential numbers for two concurrent plans, safe first-counter-row creation, two callers racing one plan, an order-customer change waiting for an in-flight allocation); manage.py check clean; makemigrations --check --dry-run: no changes; migrations batch_plans 0003 and permissions 0021 applied to the dev DB; no other app's code changed, so the prior 358-test baseline was not repeated

**Confirmed vs working choices, kept explicitly separate.** CONFIRMED (client-stated): the `CODEYY-NNN` format, that
the year is the allocation year (not the order date or planned manufacturing date), and that the sequence restarts
annually per code. WORKING CHOICES requiring client review: the `(operating_company, client_code_snapshot, year)`
namespace (two different operating companies whose customers share a code get the identical displayed number for
their respective Nth allocation - documented, not a bug); the `Asia/Kolkata` `BUSINESS_TIME_ZONE` default; the
minimum-3-digit/never-wrap overflow behaviour past 999; and permanent non-reuse of an allocated number. See
`docs/erp-handoff-open-decisions.md`.
## Task 13A — Material Requisition Draft Foundation

**Status: Complete.** A DRAFT planning document (`MaterialRequisition` + `MaterialRequisitionLine`, new app
`apps.material_requisitions`) requesting materials from a shared store for an existing `BatchPlan`, auto-fetched
from the plan's pinned APPROVED formula revision using `apps.formulas.requirement_preview`'s exact-fraction
calculator, reused unchanged - no second scaling formula was implemented. This record REQUESTS materials; it does
not reserve, issue, consume or otherwise change any stock (no stock-balance/stock-ledger concept exists anywhere in
this codebase), is not itself a stock transaction, and creating it authorizes no manufacturing. It is never called
approved or submitted - DRAFT is the only status implemented.

**Endpoints.** `GET/POST /api/v1/stores/<store_id>/material-requisitions/`, `GET/PATCH
/api/v1/stores/<store_id>/material-requisitions/<id>/`. No `DELETE`, and no submit/approve/reject/cancel/issue
endpoint exists anywhere in this slice.

**Access - three permissions, not two.** STORE-scope `material_requisitions.view/create/edit` (seeded, assigned to
nobody), each requiring active store membership, exactly like `apps.store_preparation`'s own dual-access shape.
Additionally - and this is the one genuinely new access rule this task adds - every endpoint ALSO requires active
COMPANY membership holding BOTH `batch_plans.view` AND `formulas.view` in the source plan's own operating company,
applied consistently across create/list/detail/edit and folded into 404 (never 403) on that axis, exactly matching
`apps.store_preparation`'s own company-axis convention. `formulas.view` is required because this resource
inherently exposes recipe-derived line quantities - a store user with only `batch_plans.view` can see that a plan
exists but never its material lines through this app. **Documented as a working rule requiring client review**
(see `docs/erp-handoff-open-decisions.md`): whether store users should receive formula visibility at all is not a
settled question.

**One requisition per plan.** `MaterialRequisition.batch_plan` is a protected `OneToOneField`, mirroring
`StorePreparation`'s own one-per-plan shape exactly, including the same IntegrityError -> `Conflict` (409)
translation on a concurrent duplicate create (verified with real threads) rather than an unhandled 500. **A
WORKING STRUCTURAL CHOICE for this initial slice, not a confirmed rule that a supplementary/second requisition
against the same plan is forbidden** - if the client wants more than one requisition per plan later, this becomes a
`ForeignKey`, a schema change, deliberately deferred.

**Creation - locking and calculation.** Lock order: `BatchPlan` (first, extending `apps.batch_plans.services.
update_batch_plan`'s own order) -> `FormulaRevision` -> its company's `FormulaApprovalPolicy` -> `Product` ->
`UnitOfMeasure`s -> `Material`s (this second half is `apps.formulas.approval.lock_and_load_approval_context`, reused
unchanged, the exact order `approve_formula_revision` already locks in) - the two existing orders concatenated,
never reversed, so no new deadlock cycle exists. The caller supplies `batch_plan_id` and
`expected_batch_plan_version` (a field deliberately named and documented as distinct from this requisition's OWN
`expected_version`, which only exists once the record itself does) - a mismatch is 409, the same convention as
every other version-gated command. `apps.batch_plans.services.assess_source_drift` is reused unchanged to reject
(400) creation against an incompatible source. `apps.formulas.requirement_preview.build_requirement_preview` is
then run, unchanged, against the plan's current `target_output_quantity`, and its `lines`/`warnings` become each
line's frozen `calculation_snapshot` (the same `{value, is_exact, is_approximate, is_whole_number}` shape used
everywhere else in this codebase for an exact rational result - never recomputed on a later read).

**`requested_quantity` auto-population - never a silent rounding.** `MaterialRequisitionLine.requested_quantity`
uses the SAME operational precision as `SalesOrderLine.quantity`/`FormulaLine.quantity`/`BatchPlan.
target_output_quantity` (`max_digits=14, decimal_places=3`). It is populated automatically ONLY when the EXACT
calculated requirement (the same `fractions.Fraction` the calculator computed, re-examined at this specific
precision - not the calculator's own 50-significant-digit display exactness, which is far more permissive) fits
without rounding: terminates at <=3 decimal places, is <=11 integer digits, and - for a COUNT unit - is already a
whole number. Otherwise `requested_quantity` stays `null` and `quantity_decision_issue` names why
(`QUANTITY_REQUIRES_ROUNDING`/`FRACTIONAL_COUNT_QUANTITY`/`QUANTITY_OUT_OF_RANGE`) - the exact value itself is
always preserved in `calculation_snapshot` regardless.

**Editing - deliberately not the full-replace line convention.** `PATCH` requires `expected_version`. `notes` is
independently optional. `lines`, when present, is a list of PARTIAL edits identified by `id` - every entry MUST
reference an EXISTING line (no `id`, an unknown/foreign `id`, or a duplicate `id`, is 400) - lines can never be
added or removed through this endpoint in this initial task, unlike every other line-bearing resource in this
project. A manually entered `requested_quantity` differing from the line's own exact calculated requirement
(recomputed from this requisition's own header/line snapshots, never by re-reading the source `FormulaRevision`
again) requires a non-blank `quantity_remark` in the same request, or 400 - and is only ever a proposed request,
never an approved rounding/loss/wastage rule. A true no-op writes nothing (no version bump, no audit entry).

**Source drift - quantity-affecting vs cosmetic, and the number-allocation exception.** `apps.material_
requisitions.services.assess_requisition_drift` reuses `assess_source_drift` unchanged for product/unit
compatibility, and adds exactly one new signal: whether the plan's CURRENT `target_output_quantity` differs from
this requisition's own `target_output_quantity_snapshot` - the one thing that actually drives every line's
calculated requirement. **Deliberately NOT** decided from a bare `BatchPlan.version` comparison, because `version`
also bumps for reasons that never touch a quantity - most notably Task 12D's official batch number allocation, which
is explicitly verified (by test) to never be treated as quantity-affecting drift on its own. When quantity-affecting
drift exists, quantity edits on this requisition are blocked (400); header `notes`-only edits remain possible.
Detail responses keep three things clearly separate: the saved `*_snapshot` fields, `source_drift` (computed fresh,
unlocked, every read), and `current_plan_context` (the plan's live `official_batch_number`, shown as current context
only, never rewriting any historical snapshot). A material that later becomes inactive never changes a historical
read - confirmed by test.

**Response never invents.** No `available_stock`, `shortage`, `reserved_quantity`, `issued_quantity`, `can_produce`,
`approved`, or `ready_to_issue` field exists anywhere in this response - none of these concepts exist in this
codebase. No price or customer field appears either - this resource has no connection to pricing/commercial data.

**Verification.** `tests.test_material_requisitions`, 41 tests, OK, Python exit 0, ~79s (includes real-thread
concurrency: duplicate-creation race with one clean winner, and a concurrent plan-edit-vs-draft-creation race
resolved without a torn read); `manage.py check` clean; `makemigrations --check --dry-run`: no changes; migrations
`material_requisitions 0001` and `permissions 0022` applied to the dev DB. No existing app's own code was modified
(only imported from, as a new consumer) - `apps.batch_plans`, `apps.formulas` and `apps.store_preparation`'s own
test suites were re-run once as a regression check (not repeated as part of routine verification) and remained
green.

**Confirmed vs working choices, kept explicitly separate.** WORKING CHOICES requiring client review (see
`docs/erp-handoff-open-decisions.md`): one requisition per plan; the dual `batch_plans.view` + `formulas.view`
company-access rule and whether store users should see formula-recipe data at all; the `requested_quantity`
auto-population precision (3 decimal places / 11 integer digits, matching every other operational quantity field);
that a manual quantity override requires only a free-text remark, never a second approval step. UNIMPLEMENTED,
deliberately: submission, approval, amendment, supplemental/follow-up requests, stock ownership, reservation, and
material issue - none of these has a placeholder field anywhere in this task.
## Task 13C — Physical Receipt Ledger Foundation

**Status: Complete.** A minimal, append-only `StockMovement` (new app `apps.stock_movements`) records physical
material entering a shared store the moment an existing `GoodsReceipt` is posted. Exactly ONE movement type
exists - `RECEIPT_IN`. This is the narrowest possible slice of `docs/shared-store-inventory-plan.md` (Task 13B):
legal ownership allocation, QC hold/acceptance/release, reservation, issue, consumption, return, and requisition
fulfilment are all explicitly **not** implemented - not even a placeholder field for any of them exists anywhere
in this task's schema.

**Policy boundary, enforced in the model and every response.** `GoodsReceipt.company` (copied onto
`StockMovement.source_company`) is documented, exactly as before, as receiving/purchasing company CONTEXT only -
never a legal-ownership claim. Release status is never computed as a zero, never implied as held or rejected: the
API always returns the literal string `"Not tracked"` for `release_status`, because no release concept exists yet.

**Model (`apps/stock_movements`, migration `0001`).** `StockMovement`: `movement_type` (enum, only `RECEIPT_IN`
usable today), `source_goods_receipt` (FK) + `source_receipt_line` (**`OneToOneField`** - this is what enforces
"one `RECEIPT_IN` movement per source receipt line" at the database level, and doubles as this slice's entire
"lot identity" concept, per its own instruction: no separate `MaterialLot` table exists), `store`, `source_company`,
`material`/`unit` + their own snapshot fields (mirroring `GoodsReceiptLine`'s own snapshot convention exactly),
`quantity` (`Decimal(14,3)`, always in the line's own unit), `lot_reference` (copied verbatim, never invented,
never merged across receipts that happen to share the same supplier-lot text - documented as an explicit,
unresolved limitation), `posted_by`/`posted_at` (copied from the receipt's own posting event), `created_at`.
Immutable exactly like `BatchNumberAllocation`: `clean()` rejects any save on an existing row, `delete()` always
raises. No `location` field - confirmed by direct code inspection that `GoodsReceiptLine` does not capture one.

**Integration - one additive step inside the existing transaction.** `apps.receiving.services.post_goods_receipt`
gained exactly one new step, after the receipt's own status/version are set and before its own audit `record()`
call: `apps.stock_movements.services.create_receipt_in_movements` creates one `RECEIPT_IN` row per line, in the
SAME `@transaction.atomic` block. Runs only on the genuine `DRAFT` -> `POSTED` transition - never on the existing
idempotent-repost-at-current-version no-op path, so repeating `POST .../post/` never duplicates a movement, and a
receipt that was already `POSTED` before this feature existed is never backfilled by a later repeat call (verified
by test: a receipt's status is set directly to `POSTED`, bypassing the service entirely, to simulate pre-existing
data - a subsequent `post_goods_receipt` call against it still creates nothing). Ordered/received/undelivered
quantity semantics (`delivery_progress_for_purchase_order`, the over-receipt check) are completely unchanged - the
ledger is purely additive and reads nothing back into the purchasing chain.

**Balances are computed, never stored as a mutable counter.** `apps.stock_movements.services.
compute_stock_balances` sums `StockMovement.quantity` grouped by `(material, unit, source_company)` - **never**
just `(material)`, so two recorded quantities for the same material in different units, or belonging to different
companies, are never summed into one number (verified by test, including a deliberately-crafted mismatched-unit
row to exercise the grouping in isolation). Every response is labeled `"recorded_receipt_quantity"` - never
`available_stock`/`usable_stock`/`on_hand` - and carries a `coverage` block stating plainly that historical
receipts are not backfilled, opening stock is not included, and issues/returns/release are not tracked.

**Endpoints - read-only, no mutation path anywhere.** `GET /api/v1/stores/<store_id>/stock-movements/`,
`GET /api/v1/stores/<store_id>/stock-balances/`. STORE permission `stock.view` (seeded, assigned to nobody) plus
the SAME company-access rule `apps.receiving` already uses (`purchase_orders.view` in the movement's own
`source_company`, filtering BEFORE both listing and aggregation - a total can never include a company the caller
cannot see) - deliberately **not** extended with `formulas.view`, since receipt quantities are not formula-derived
data. `?material=` filter; unknown query parameters are rejected (400), not silently ignored. Read-only admin
(`ReadOnlySuperuserAdminMixin`); no operational superuser bypass anywhere in the access path.

**Verification.** `tests.test_stock_movements`, 26 tests, OK, Python exit 0, 190.679s (includes real-thread
concurrency: two receipts racing to post against the same over-subscribed PO line, confirming exactly one
`StockMovement` ever exists for that line regardless of which receipt wins). `tests.test_receiving`,
64 tests, OK, Python exit 0, 548.129s (re-run in full since `post_goods_receipt`'s own
transaction changed - zero regressions). `manage.py check` clean; `makemigrations --check --dry-run`: no changes;
migrations `stock_movements 0001` and `permissions 0023` applied to the dev DB.

**Confirmed vs working choices, kept explicitly separate.** Nothing about this task's own design was client-
confirmed beforehand - see `docs/shared-store-inventory-plan.md`'s own status legend, still fully open: legal
ownership allocation, QC release, reservation, issue, return, and requisition fulfilment. WORKING CHOICE requiring
review: `source_receipt_line`'s `OneToOneField` as the sole lot-identity concept for this slice - it does **not**
resolve whether two receipts carrying the same physical supplier lot should ever be recognized as the same lot.

## Task 14A — Company-Scoped Product CSV Import

**Status: Complete.** A validated preview, followed by an explicit, all-or-nothing commit, for bulk-creating
`Product` rows (`apps.products.models.Product`) from a CSV file - new app `apps.product_imports`. **Create-only**:
committing never updates, reactivates or overwrites an existing product; a code already reserved by ANY product
in the company (active or inactive) blocks that row, always. No formula/material requirement, packing default,
stock quantity, customer mapping, pricing, tax or batch data is imported - only the plain identity fields
`Product` already has (`code`, `name`, `product_type`, `description`, `sales_uom`).

**Two endpoints, both under `/api/v1/companies/<company_id>/products/`:**
- `POST import-preview/` - multipart, one field `file`. Parses and validates completely, in memory; **never
  writes a `Product`**. The raw uploaded bytes are never persisted anywhere - parsed once, then discarded (only a
  sha256 `source_checksum` is kept). Always returns `201`, even for a file this task cannot parse at all
  (`file_errors` explains why, `eligible_for_commit` is `false`) - every attempt gets a stable identifier and an
  audit trail, not only successful ones.
- `GET import-preview/<id>/` - the same batch summary plus the normalized rows, paginated
  (`BoundedPageNumberPagination`, same convention as every other list in this project).
- `POST import-commit/` - body is only `{"preview_id", "expected_version"}`, **never a replacement product or row
  list** (this task's own explicit instruction). All-or-nothing: any invalid row, or any row whose validity
  changed since the preview (a code taken, or a unit deactivated, in the meantime), blocks the entire commit.

**Access.** Every endpoint requires COMPANY-scoped `products.view` + `products.create` + the new `products.import`
(seeded via `permissions.0024`, COMPANY scope, assigned to nobody) - all three together, on both preview and
commit, a WORKING DECISION for this first slice rather than a finer per-endpoint split. Ownership is enforced
independently of company access: a preview's `company` AND `created_by` must both match the caller, or the batch
folds into the SAME `404` "Import preview not found" - a different user in the SAME company, and a caller in a
different company, are both refused identically (verified by test). No superuser/`is_staff` bypass exists
anywhere in this path (`user_has_permission` never consults either flag; verified by test that an otherwise-bare
superuser gets an ordinary `403`).

**Validation (`apps.product_imports.services.parse_csv`/`_apply_file_wide_checks`), exactly two DB queries
regardless of row count - never one query per row (measured: 2000 rows -> 14 queries for preview, 21 for
commit).** File-level checks (encoding, empty file, header duplicate/unsupported/missing-required column, too
many columns, too many rows) short-circuit before any row is parsed. Field-level checks (required, length, COUNT/
mass code shape) run in Python, no queries. Then exactly two queries resolve every row at once: existing `Product`
codes for this company (`code__in=`), and matching `UnitOfMeasure` rows (`code__in=`) - never inferred from a
unit's name, never auto-created. Duplicate codes WITHIN the file are also detected in Python (no query) and mark
every occurrence invalid, naming the other row numbers.

**Bounded limits, WORKING CHOICES not client-confirmed policy:** 5 MiB file size, 5000 data rows, 20 header
columns, and Product's own field lengths (`code` 32, `name` 255, `sales_uom_code` 20) plus a 2000-character cap on
`description` (mirroring `BatchPlan.notes`/`Formula.notes`'s own free-text cap). A 1-hour preview `expires_at`
(`PREVIEW_TTL`) - a commit attempted after that window is rejected with a clear, retryable error (create a new
preview), never silently extended.

**Commit safety.** Locks the batch row (`select_for_update()`), then re-derives current state: revalidates every
row's code against the CURRENT `Product` table and every referenced `UnitOfMeasure`'s CURRENT `is_active`
(locked, ascending id) before creating anything - verified by test that a code taken, or a unit deactivated, in
the window between preview and commit blocks the WHOLE commit (zero products created, batch stays `PREVIEWED`).
Products are built via `Product(...)` + an explicit `.clean()` call (reusing `Product`'s own normalization/
validation in memory, no query) then `bulk_create()` - a justified use, not "bulk_create merely to bypass
validation": every value was already normalized identically at preview time, and `.clean()` is a real, cheap
defensive re-check, not skipped. A same-transaction `IntegrityError` (a race at the exact instant of commit) is
caught and translated to a clean `409`, never an unhandled `500`. Product creation, the batch's `PREVIEWED` ->
`COMMITTED` transition, and the audit `record()` call are all in ONE `transaction.atomic()` block - an audit
failure rolls back every product just created together with the status change (verified by test: `record` mocked
to raise, zero products persisted, batch still `PREVIEWED`).

**Repeat-safety, without a second version counter.** `ProductImportBatch.version` never increments (documented on
the model as the one deliberate exception to this project's usual "bump on every real change" rule) - the
concurrency guard is the row lock plus `status` itself. Whichever concurrent commit acquires the lock first does
the work and flips `status` to `COMMITTED`; the other, once it acquires the lock afterward, sees `COMMITTED` and
takes an idempotent-repeat branch - returning the SAME `created_product_ids`, never creating anything twice
(verified by test: two real threads committing the identical batch concurrently, both receive `200`, exactly one
set of products exists). A genuinely wrong `expected_version` (anything but the one the preview response reported)
is a `409`, distinct from the idempotent-repeat path.

**Immutability, disclosed the same way every other "immutable" model in this codebase discloses it.**
`ProductImportBatch.clean()` rejects any further save once `status` is `COMMITTED` (the one legitimate transition
is `PREVIEWED -> COMMITTED`, made exactly once, under the row lock); `delete()` always raises. `ProductImportRow`
is deliberately NOT immutability-enforced - disposable staging data, not a durable business record like
`StockMovement`; no scheduler was installed to clean it up (this task's own explicit instruction), so a bounded
number of stale `PREVIEWED` batches/rows can accumulate over time - a documented retention POLICY, not a job.

**Deliverables.** `docs/templates/product-import-template.csv` (a 3-row sample); Postman folder "Product CSV
Import (Task 14A)" (`docs/postman/README.md` §34); `docs/frontend-api-handoff.md` new section; API dashboard
regenerated.

**Verification.** `tests.test_product_imports` (new), 33 tests, OK, Python exit 0, ~55-60s - covers valid import,
UTF-8 BOM, every file-level error (encoding/empty/missing-required/unsupported/duplicate header/too many columns/
too many rows/too large), duplicate codes (within file, and against active AND inactive existing products),
unknown/inactive units, company/user isolation (including same-company-different-user), no superuser bypass,
preview-creates-no-products, stale-preview-at-commit (code taken / unit deactivated), atomic audit rollback,
repeated commit (sequential and two real concurrent threads), wrong concurrency token, a rejected replacement-
product-list commit body, and one 2000-row end-to-end preview+commit test asserting a bounded query count (< 30
each) and printing measured duration (14/21 queries, ~0.2s each, this session's own dev machine - not a general
performance claim). `tests.test_products` (existing, unchanged implementation, re-run because it shares the
`Product` model): 69 tests, OK, Python exit 0, 153.731s - zero regressions. `manage.py check` clean;
`makemigrations --check --dry-run`: no changes; migrations `product_imports 0001` and `permissions 0024` applied
to the dev DB. No client data was imported and no live products were seeded during verification - every test runs
against the isolated Django test database only.

## Task 14B — Formula Draft CSV Import

**Status: Complete.** A validated preview, followed by an explicit, all-or-nothing commit, for bulk-creating
brand-new `Formula` identities - each with its own `DRAFT` revision 1 and material lines - from a CSV file. New
app `apps.formula_imports`, a deliberately SEPARATE implementation from `apps.product_imports` (Task 14A) - the
task's own instruction was explicit that a shared "import engine" refactor was out of scope, and the actual rules
genuinely differ (a two-level ROW/GROUP structure here; formula-specific validation; contributor tracking).
**Never adds a revision to an existing formula, never approves anything, never touches stock.**

**CSV shape: one row per material line.** Columns: `formula_code`, `formula_name`, `product_code`,
`base_output_quantity`, `output_uom_code` (all required), `material_code`, `material_quantity` (required),
`formula_notes`, `revision_notes` (both optional). Repeated `formula_code` values group rows into one formula -
order-preserving even when a code's rows are interleaved with another's in the file; the group's header fields
(`formula_name`/`product_code`/`base_output_quantity`/`output_uom_code`/`formula_notes`/`revision_notes`) must
agree, after normalization, across every row in the group, or the conflict is reported naming the field and up
to 5 differing values (`Decimal` comparison, so `"100"` and `"100.000"` are correctly the SAME value, never a
false conflict). Material type (RAW/PACKAGING) and line unit are ALWAYS derived from the resolved `Material` -
never client-supplied. A material repeated within one group produces two separate lines, never merged (mirrors
`apps.formulas.services.update_formula_revision`'s own existing behavior: no uniqueness constraint on
`(revision, material)`).

**Three endpoints, all under `/api/v1/companies/<company_id>/formulas/`:**
- `POST import-preview/` (multipart `file`) - validates completely, never creates a `Formula`/`FormulaRevision`/
  `FormulaLine`, raw bytes discarded after parsing (only a sha256 checksum kept).
- `GET import-preview/<id>/` - paginated GROUPS (one per prospective formula, each with its own nested lines,
  never separately paginated), ownership+company-scoped.
- `POST import-commit/` (`{"preview_id", "expected_version"}`) - all-or-nothing create, revalidates products/
  units/materials/formula-codes under lock, repeat-safe.

**Access.** New COMPANY permission `formulas.import` (migration `permissions.0025`, seeded to nobody), required
together with `formulas.view`+`formulas.create` on every endpoint - **and** `shared_catalog.view` in at least one
active store, reusing `apps.permissions.services.user_has_permission_in_any_store` (the SAME underlying rule
`apps.catalog.permissions.CanReadSharedCatalog` already enforces for ordinary material lookups) rather than the
permission class itself, since that class also grants a superuser bypass this task explicitly forbids for every
permission checked here (verified by test: an otherwise-bare superuser gets an ordinary `403`, and a user with
every company permission but no store access is also `403`, naming `shared_catalog.view`). Ownership folds into
the same `404` as company access, identical to Task 14A's own rule.

**Existing code rejected outright.** An `(company, code)` already used by ANY existing `Formula` - approved or
DRAFT - marks that group invalid at preview time and blocks the whole commit (this task's own explicit
instruction: "reject the import group, even if the existing formula is a draft"). Multiple distinct formula
codes for one product remain allowed, exactly as the existing model already permits; nothing here selects a
"default" formula.

**Validation, exactly FOUR batch lookup queries regardless of row/group count - never one per row** (measured
in the representative 500-row/100-group performance test: 20 total queries for preview overall, including the
lookups). File-level checks mirror Task 14A's own (encoding, empty file, header duplicate/unsupported/missing-
required, too many columns/rows). TWO INDEPENDENT bounds address this task's own explicit warning ("do not
assume a 5000-row file fits 2000 complete formulas"): 5000 total rows AND a separate 1000-group cap, plus a
200-lines-per-group cap (mirroring `apps.quotations.serializers._MAX_LINES`'s own bounded-line-count
convention). A catalog needing more than these bounds in one go is documented as needing several sequential
files, each its own preview + commit - there is no chunking within one request.

**Commit safety and lock order.** Extends - never reverses - the two pairwise orders every existing formula-
related lock already establishes (`apps.formulas.approval.lock_and_load_approval_context`: product before units
before materials; `apps.batch_plans.services._lock_source_context`: product before units): `Product` (ascending
id) -> `UnitOfMeasure` (every output unit AND every material's own base unit, together, ascending id) ->
`Material` (ascending id). Which unit ids need locking depends on which materials are involved, so those ids are
discovered via one UNLOCKED read first (mirroring `lock_and_load_approval_context`'s own identical technique -
never trusted for correctness, only for which ids to lock) before the real, authoritative lock is taken. Formulas
are built via `Formula(...)`/`FormulaRevision(...)`/`FormulaLine(...)` + an explicit `.clean()` call on each
(reusing the real model validation/normalization in memory, no query) then `bulk_create()` per model - a
justified performance choice for the WRITE only, never a way to skip validation, contributor tracking or
snapshots (verified by test: material/unit snapshots, `material_kind_snapshot`, and exactly one
`FormulaRevisionContributor` row per created revision - the importing user - are all present after commit).
`contributor_history_complete=True` is set explicitly: this import IS the complete, sole authorship of the
revision, never marked incomplete when authorship is actually fully known (this task's own explicit instruction).
A same-transaction `IntegrityError` (a race at the exact instant of commit, including between two DIFFERENT
import batches racing on the SAME new code) is caught and translated to a clean `409`, never an unhandled `500`
(verified by test with two real concurrent threads committing two different batches that both target the code
`RACE001` - exactly one formula is created; the other gets `409` or the pre-check's `400`, never a duplicate and
never a crash). Product creation, revision/line/contributor creation, the batch's `PREVIEWED` -> `COMMITTED`
transition, and the audit `record()` call are all in ONE `transaction.atomic()` block (verified: mocked audit
failure -> zero formulas persisted, batch still `PREVIEWED`).

**Repeat-safety** - identical design to Task 14A's `ProductImportBatch.version` (fixed at 1 for the row's whole
life; the concurrency guard is the row lock plus `status`, not a counter) - verified by test with two real
concurrent threads committing the SAME batch: both receive `200`, exactly one set of formulas exists.

**Verified against the real requirement calculator and approval assessment - not merely asserted.** A committed
import's revision was fed directly into `apps.formulas.requirement_preview.build_requirement_preview` (produced
a correct, exact scaled requirement) and `apps.formulas.approval.assess_approval` (blocked only on the expected
`APPROVAL_POLICY_NOT_CONFIGURED` reason - never `EMPTY_REVISION`/`INVALID_BASE_OUTPUT`/`INCONSISTENT_LINE`,
confirming the imported revision is indistinguishable from one built through the ordinary UI for every purpose
downstream code cares about). Approval rules themselves were not touched or weakened anywhere.

**Deliverables.** `docs/templates/formula-import-template.csv` (a 2-formula, 3-row sample); Postman folder
"Formula Draft CSV Import (Task 14B)" (`docs/postman/README.md` §35); API dashboard regenerated.

**Verification.** `tests.test_formula_imports` (new), 48 tests, OK, Python exit 0, ~80-83s - covers valid RAW+
PACKAGING import, RAW-only/PACKAGING-only formulas, multiple formulas for one product, group/line order under
interleaving, every file-level error, group-header conflicts (string fields and `Decimal`-aware quantity
comparison), existing-formula-code rejection, unknown/cross-company/inactive product, unknown/inactive material,
unknown/inactive output unit, COUNT wholeness (output quantity and line quantity), output unit independence from
the product's own sales unit, repeated-material-not-merged, every bound (file size, rows, groups, lines-per-
group, header columns), missing company permission, missing `shared_catalog.view`, no superuser bypass, cross-
company and same-company-different-user isolation, preview-creates-no-records, four distinct commit-time
revalidation failures (code taken, product/material/unit deactivated), audit rollback, a rejected replacement-
formula-list commit body, sequential repeated commit, two real-thread concurrency scenarios (same-batch and
different-batches-racing-on-one-code), and one 500-row/100-formula representative performance test reporting
actual total queries separately from the lookup-only claim (measured: preview 20 queries/0.07s, commit 32
queries/0.17s after fixing one genuine per-group query bug this test caught during development - `group.lines.
order_by(...)` was rebuilding the queryset and bypassing the `prefetch_related` cache, costing one extra query
per group; fixed to `group.lines.all()`, which both uses the cache and already returns lines in the model's own
default `line_number` ordering - this session's own dev machine, not a general performance claim). `manage.py
check` clean; `makemigrations --check --dry-run`: no changes; migrations `formula_imports 0001` and
`permissions 0025` applied to the dev DB. No shared file in `apps.formulas`/`apps.catalog`/`apps.products` was
modified, so no existing formula/approval test suite was re-run (nothing shared changed to regress). No client
data was imported during verification - every test runs against the isolated Django test database only.

## Task 14C — Shared Material Master CSV Import

**Status: Complete.** A validated preview, followed by an explicit, all-or-nothing commit, for bulk-creating
brand-new `Material` identities (raw or packaging) into the SHARED catalog from a CSV file. New app
`apps.material_imports` - a third, deliberately SEPARATE implementation from Tasks 14A/14B (no shared "import
engine"). **Master data only**: no opening stock, receipt, lot, QC status, ownership, location, pricing, tax or
quantity concept anywhere. Create-only - never updates, reactivates or overwrites an existing `Material`.

**No company anywhere in this app - the one design point that genuinely differs from Tasks 14A/14B.**
`apps.catalog.models.Material` has no company FK at all (a shared, cross-company identity, the same reasoning
`SharedStore` already documents); `MaterialImportBatch` correspondingly has no `company` field, and every
endpoint lives at a bare `/api/v1/materials/...` path, never `/companies/<id>/...`.

**Access: `IsActiveSuperuser`, not a company/store permission check - and this is NOT a "bypass."** Direct
inspection of `apps.catalog.views` confirmed material/unit/category creation is ALREADY, exclusively,
superuser-administered (`_read_write_permissions` gates every non-GET method behind `IsActiveSuperuser`, with
`shared_catalog.view` wired to GET only) - preserved here unchanged, per this task's own explicit instruction,
rather than relaxed to the read-only catalog permission. No new permission was invented. Ownership is still
enforced independently of superuser status: `_get_owned_batch` folds a non-owning superuser's read/commit
attempt into the same `404` a nonexistent id would produce (verified by test).

**CSV shape** (flat, one row per material, like Task 14A - no grouping needed): `code`, `name`, `material_type`
(the REAL `RAW_MATERIAL`/`PACKAGING_MATERIAL` enum values, case-normalized but never inferred from the name),
`base_unit_code` (all required), `description` (optional - the one genuinely descriptive field `create_material`
already supports beyond the required identity fields; `category_code` was deliberately NOT added - see
`docs/backend-decisions.md`). Unsupported columns (stock/lot/expiry/ownership/location/QC/pricing/quantity-
shaped or otherwise) are rejected, never silently dropped.

**Three endpoints**: `POST /api/v1/materials/import-preview/`, `GET .../import-preview/<id>/` (paginated rows),
`POST /api/v1/materials/import-commit/` (`{"preview_id", "expected_version"}`) - same shapes, same repeat-safety
design (`version` fixed at 1; the concurrency guard is the row lock plus `status`), and the same 1-hour
`PREVIEW_TTL`/5 MiB/5000-row/20-column bounds as Tasks 14A/14B.

**Commit safety**: locks the batch, re-checks existing `Material` codes (no company filter - the catalog is
shared), locks every referenced `UnitOfMeasure` (ascending id, matching `apps.catalog.services.deactivate_unit`'s
own reasoning for why an active-material check matters, extended here to import-time), re-checks `is_active`.
Materials are built via `Material(...)` + an explicit `.clean()` call (reusing the real model validation) then
`bulk_create()` - a justified performance choice for the WRITE only, never a way to skip validation or audit.
ONE audit record per commit (`company=None`, `store=None` - never fabricated ownership context, matching
`create_material`'s own call shape exactly), bounded sample of created ids. An `IntegrityError` race (including
two DIFFERENT previews racing on the SAME new code) is caught and translated to a clean `409`, never an unhandled
`500` (verified by test with two real concurrent threads: one succeeds, the other gets either the pre-check's
`400` or the database race's `409` - both are correct outcomes, and which one wins is a genuine timing race the
test deliberately does not assume either way).

**A real cross-cutting bug was found here and backported to Tasks 14A and 14B.** This task's own required
field-length test (`code`/`name` deliberately too long) surfaced a genuine, previously undetected defect:
`_parse_data_row` correctly recorded a "too long" validation error but still stored the full, untruncated,
over-length string onto the staging row - whose own column is the SAME width as the real target field it
mirrors - and `bulk_create()` sent that oversized value straight to PostgreSQL, raising an unhandled `DataError`
(`value too long for type character varying(32)`), a `500`. Fixed by truncating the STORED value to the
column's own width (the error message still reports the true, untruncated length) in all three import apps -
`apps.material_imports` (this task), `apps.product_imports` (Task 14A), and `apps.formula_imports` (Task 14B),
which shared the identical latent defect, never triggered by either of THEIR own original test suites. A
regression test was added to each of the three suites. See `docs/backend-decisions.md`, Task 14C, for the full
account.

**Compatibility, verified against the real Task 14B pipeline, not merely asserted.** One focused scenario:
import a synthetic material through this task's own real HTTP endpoints, then use its exact code in a REAL
Formula CSV preview + commit (Task 14B) as a separate company/store-permissioned user. The resulting
`FormulaLine` was confirmed to carry the correct `material_id`, `material_code_snapshot`,
`material_kind_snapshot` (`RAW_MATERIAL`), `unit_id`/`unit_code_snapshot` (the material's own base unit), and
quantity - i.e. an imported material is completely indistinguishable from a hand-created one to every downstream
consumer. The existing `tests.test_formula_imports` suite was deliberately NOT re-run for this (nothing shared
changed) - only this one new, focused test.

**Deliverables.** `docs/templates/material-import-template.csv` (a 3-material sample: 2 raw, 1 packaging);
Postman folder "Material Master CSV Import (Task 14C)" (`docs/postman/README.md` §36, which also documents the
recommended Units → Materials → Products → Formula drafts import order); API dashboard regenerated.

**Verification.** `tests.test_material_imports` (new), 36 tests, OK - covers valid RAW/PACKAGING import,
material-type case-normalization without inference, unsupported type, BOM, malformed/invalid encoding,
header errors, unsupported/stock-shaped columns, duplicate codes (within file, and against active AND inactive
existing materials), unknown/inactive units, field-length limits (the bug above), every bound, no-superuser-
access-denial, `shared_catalog.view` explicitly NOT sufficient to create materials, unauthenticated `401`,
cross-superuser ownership isolation, preview-creates-no-materials, four commit-time revalidation scenarios,
audit rollback, a rejected replacement-material-list body, sequential repeated commit, two real-thread
concurrency scenarios (same-batch idempotency; two different previews racing on one code), the Task 14B
compatibility scenario, and one 2000-row performance test (measured: 10 queries/0.18s preview, 18 queries/0.22s
commit, this session's own dev machine). Combined confirmation run - `tests.test_material_imports` +
`tests.test_product_imports` (35, +1 regression test) + `tests.test_formula_imports` (50, +1 regression test):
**119 tests, OK, Python exit 0, 300.073s** (an earlier run of the same 119 surfaced the field-length bug above
as a real `DataError`, and, after fixing it, one more flaky race-assertion issue in this task's own and Task
14B's "two previews racing" tests - both fixed before this final, clean, all-passing run). `manage.py check`
clean; `makemigrations --check --dry-run`: no changes; migration `material_imports 0001` applied to the dev DB
(no new permission - `IsActiveSuperuser` was already sufficient). No client data was imported during
verification - every test runs against the isolated Django test database only.

## Task 15A — Material Requisition Submission

**Status: Complete.** Extends `MaterialRequisition` with a second status - `DRAFT` (editable) -> `SUBMITTED`
(frozen, awaiting a future processing workflow this task does not define). Submission does **not** approve
quantities, reserve stock, issue materials, authorize production, or release anything from QC - none of those
concepts exist anywhere in this codebase, and this task adds none of them. This is a documented WORKING
implementation choice: the client has not finalized the submitting role or the approval chain beyond it.

**Model**: `MaterialRequisition.Status.SUBMITTED` added; `submitted_by`/`submitted_at` added (both `null` until
set, mirroring `apps.quality.models.IncomingInspection`'s identical fields exactly). Migration
`material_requisitions.0002` - purely additive (2 new nullable fields + a `choices=` metadata change on
`status`, no column type change).

**Endpoint**: `POST /api/v1/stores/<store_id>/material-requisitions/<id>/submit/`, body `{"expected_version": n}`
only (unknown/protected fields rejected, 400). Access: `material_requisitions.view` + the NEW STORE-scoped
`material_requisitions.submit` (migration `permissions.0026`, seeded to nobody) + the SAME existing dual
`batch_plans.view`+`formulas.view` company check every other endpoint in this app already requires.
**Deliberately NOT also gated behind `.edit`** - the task's own explicit instruction, confirmed against existing
convention (neither `submit_purchase_request` nor `submit_incoming_inspection` requires a second, unrelated
mutation permission either). No superuser/staff/role-name bypass anywhere (verified by test).

**Validation, all inside one transaction, under lock - never trusted from a stale read:** at least one line;
every line has a resolved, positive `requested_quantity` already satisfying its precision/range/COUNT rule
against the material's CURRENT unit; every line whose `requested_quantity` differs from the EXACT calculated
requirement (compared as a `fractions.Fraction`, reusing the identical comparison `update_material_requisition`
already uses - never recomputed from `calculation_snapshot`'s approximate display string) carries a non-blank
`quantity_remark`; no quantity-affecting source drift (re-running `apps.batch_plans.services.
assess_source_drift` plus this app's own target-quantity comparison, under lock); the pinned formula revision is
still `APPROVED`; every referenced material/unit is still active. **Deliberately NOT required** (none of these
gates are confirmed for requisition submission): available stock, QC release, an official batch number, a
confirmed sales order, or purchasing's three-step approval - verified by test that a plain submission succeeds
with no `BatchNumberAllocation`, no `StockMovement`, and no `BatchPlan` status change of any kind.

**Lock order - the first path in this app to lock a `MaterialRequisition` and a `BatchPlan` together, since
none existed before:** requisition (locked first - the primary target of this action) -> `BatchPlan` (locked,
because `target_output_quantity` CAN change via `update_batch_plan` - this is the actual mechanism preventing a
concurrent plan quantity edit from escaping submission's checks, verified by a real two-thread test) ->
`FormulaRevision` (read `select_related`, deliberately UNLOCKED - its `status` can never move away from
`APPROVED`, mirroring `apps.quality.services.submit_incoming_inspection`'s identical choice for `GoodsReceipt.
status`) -> `UnitOfMeasure`s then `Material`s referenced by the requisition's OWN lines (ascending id in each
set, mirroring `lock_and_load_approval_context`'s own sub-order).

**Repeat-safety and freeze, both mirroring `apps.quality.services.submit_incoming_inspection`/`apps.purchasing.
services.submit_purchase_request` exactly:** a call at the requisition's CURRENT version against an
already-`SUBMITTED` record is an idempotent no-op - returns unchanged, no version bump, no new audit entry, and
critically does **not** re-run the eligibility checks as if this were a new submission. `update_material_
requisition` now rejects (400) every header/line edit once `status != DRAFT` - the ONLY freeze enforcement point
(the admin surface was already fully read-only); there is no reopen/amend/cancel/approve/reject/fulfil/issue
action anywhere, and a later `BatchPlan` change after submission is still shown as current `source_drift`,
never rewriting the frozen record (verified by test: snapshots/lines byte-for-byte identical before/after a
post-submission plan edit, while `source_drift.quantity_affecting` correctly flips to `true`).

**Verification.** `tests.test_material_requisitions` (extended, not replaced), 59 tests, OK, Python exit 0,
160.535s - covers successful submission, missing submit permission with no superuser bypass, company/store
isolation, an unresolved (including fractional-COUNT) `requested_quantity` blocking submission, a simulated
unexplained-override edge case (via a direct `queryset.update()`, proving submission independently re-derives
the exact comparison rather than trusting a stored flag) blocking submission, quantity-affecting source drift,
an inactive material blocking submission, no batch-number/stock/sales-order/approval requirement, stale-version
409, current-version idempotent repeat, edit rejection after submission, two real-thread concurrency scenarios
(submit-vs-edit; submit-vs-source-plan-edit), audit rollback, and historical snapshot preservation across a
post-submission drift. One existing test (`test_no_lifecycle_endpoints_exist`, which asserted `/submit/` itself
returned 404) was renamed and updated to drop `submit` from its list - the one legitimate behavior change this
task makes to an existing assertion, documented here rather than silently edited. `manage.py check` clean;
`makemigrations --check --dry-run`: no changes; migrations `material_requisitions.0002` and `permissions.0026`
applied to the dev DB. No existing business requisition was submitted or had permissions granted during
verification - every test runs against the isolated Django test database only.

## Task 15B — Read-Only Order–Batch Register

**Status: Complete.** A read-only, paginated operational register - `GET /api/v1/companies/<company_id>/
batch-register/` - joining EXISTING sales-order, batch-plan, store-preparation and material-requisition
records into one view, closer to the shape of the client's own Excel register. New app `apps.batch_register`
with **no model and no migration at all** - the task's own explicit "no duplicated register table" instruction
taken literally: there is nothing to migrate because nothing is stored here that doesn't already exist
elsewhere. No mutation endpoint anywhere; `POST`/`PATCH`/`PUT`/`DELETE` are all `405` (verified by test).

**Row identity: exactly one row per `BatchPlan`**, never per order or order line - one order line with several
`BatchPlan`s (unchanged since Task 12A placed no limit) produces that many rows, each carrying the SAME
`sales_order_line_id` (verified by test). An order with no batch plan has no row - this is explicitly NOT a
complete order list.

**Field mapping - exactly the task's own list, nothing invented.** `batch_plan_id`; `sales_order_id`/
`sales_order_reference`/`sales_order_line_id`; `product_code_snapshot`/`product_name_snapshot` (frozen at plan
creation, from `BatchPlan`'s own existing snapshot fields - zero extra queries); `product_type_current`
(explicitly labeled LIVE/current, since `Product.product_type` is NOT part of `BatchPlan`'s own snapshot - the
task's own "clearly identified as current data if not snapshotted" instruction taken literally); `customer`
(id/name/code); `order_context` (order date/status, line quantity, line sales unit - from `SalesOrderLine`'s own
`sales_uom_code_snapshot`, not re-derived from the live product); `planned_pack_quantity`/`packing_content_
quantity`+unit/`target_output_quantity`+unit (`BatchPlan`'s own existing Task-12B-2 fields, verbatim);
`official_batch_number` (nullable, via the existing `number_allocation` reverse one-to-one); `store_preparation`
(packing_type/insert_required); `material_requisition` (id/status/version ONLY - never a line, quantity, or
price); `source_drift` (`is_incompatible` + `issues`, reusing `apps.batch_plans.services.assess_source_drift`
unchanged). Nothing maps an unimplemented client column (MRP, Printing/BMR/Production/Packaging/Dispatch
status, approval status, stock availability) to a placeholder `"Pending"`/`"0"`/`"No"` - those keys simply do
not appear in the response at all.

**Access: one required permission, three optional, two store-scoped sub-sections - never broadening the
existing batch-plan contract.** `batch_plans.view` (company) is the ONLY requirement to reach the endpoint at
all. `sales_orders.view`/`customers.view`/`products.view` (company, each independently optional) gate exactly
one cluster of LIVE fields each - `order_context`/`customer`/`product_type_current` respectively - missing one
replaces only that section, on every row, with `{"access": "restricted"}`, never the whole request (verified by
test: a bare `batch_plans.view`-only caller still gets `200` with every optional section `restricted`).
`store_preparation`/`material_requisition` reuse their OWN existing, unmodified permission systems exactly -
including material requisition's own dual store+`formulas.view` company rule (§18) - computed ONCE per request
(which stores the caller can see each resource type in, via `active_stores_for_user`+`store_user_has_permission`
- a handful of rows, not one query per `BatchPlan` row) and consulted per row with no further query.

**No existence leak, precisely scoped and precisely disclosed - not claimed perfect.** A caller with ZERO
`store_preparation.view` (or `material_requisitions.view`+`formulas.view`) anywhere sees `{"access":
"restricted"}` on EVERY row for that section, uniformly, whether or not a record actually exists for that
specific plan - verified by test with two rows side by side (one with a real `StorePreparation`, one without)
producing byte-identical restricted output for such a caller. The disclosed residual: a caller who holds the
permission in SOME store but not the specific one a given row's record happens to live in will still see
`restricted` for that row rather than `exists: false` for a genuinely empty one - a narrower distinction this
function cannot close without also hiding real data from every other row that same caller legitimately can
see, documented as a known limitation rather than silently left unexamined (see `docs/backend-decisions.md`,
Task 15B).

**Performance**: one base query (joined via `select_related` across `sales_order_line__sales_order__customer`,
`sales_order_line__product__sales_uom`, `formula_revision__formula__product`, `formula_revision__output_uom`,
`packing_content_uom`, `number_allocation`, and the two REVERSE one-to-ones `store_preparation`/`material_
requisition` - the exact chain `apps.batch_plans.services.assess_source_drift` itself touches, reused, not
re-derived) plus the handful of fixed, row-count-independent queries in `compute_access_context`. Verified by
test: capturing actual queries across 10 rows (each with both a `StorePreparation` AND a `MaterialRequisition`
attached) stays under 30 total - never "one query per row."

**Filters/search/ordering**: `product`/`customer`/`order_date_from`/`_to`/`planned_manufacturing_date_from`/
`_to`/`has_batch_number`/`search` (matches only already-unconditionally-visible snapshot fields and the
official batch number - never needs an extra permission) - `customer`/`order_date_*` each additionally require
their own gating permission or `403`, checked BEFORE the query runs. `order` is a small, fixed allow-list
(`created_at`/`-created_at`/`planned_manufacturing_date`/`-planned_manufacturing_date`) - never an arbitrary
field name. Every unknown query parameter is `400`, naming it.

**Verification.** `tests.test_batch_register` (new), 28 tests, OK, Python exit 0, ~95-102s - covers company
isolation and no superuser bypass, multiple plans for one order line, snapshot-vs-current product fields
(verified against a real post-creation product rename), packing quantity/unit mapping (a real Task-12B-2
packing relationship with explicit `canonical_factor`s), optional batch number absent then present, every
restricted-section combination (bare user, formulas-view-without-store-access, store-access-without-formulas-
view), the no-existence-leak scenario, missing vs. present related records, DRAFT-vs-SUBMITTED requisition
status (a real submission via `apps.material_requisitions.services.submit_material_requisition`), absence of
any recipe/price/invented-status field, every filter's permission gate, search by batch number, invalid
`order` rejection, deterministic ordering across repeated calls, bounded pagination, bounded query count across
10 fully-populated rows, and read-only behavior (`405` on every other HTTP method) plus zero audit/version
side effects from a `GET`. `manage.py check` clean; `makemigrations --check --dry-run`: no changes - no
migration exists for this app at all, by design. No shared file in `apps.sales_orders`/`apps.customers`/`apps.
products`/`apps.batch_plans`/`apps.store_preparation`/`apps.material_requisitions` was modified, so no existing
suite for any of them was re-run (nothing shared changed to regress).

## Task 15B.1 — Close Batch Register Related-Record Disclosure

**What was wrong, demonstrated by direct code inspection rather than assumed from documentation.** Task 15B's
own handoff had already disclosed, in prose, that a caller holding `store_preparation.view`/`material_
requisitions.view` in SOME but not ALL stores could distinguish "a record exists in a store I can't see" from
"no record exists" by comparing two rows. Reading `apps/store_preparation/models.py` and `apps/material_
requisitions/models.py` directly confirmed WHY: `store` on both models is a free `ForeignKey` to ANY active
`SharedStore`, with no constraint tying it to the plan's own company - so a hidden record really could be in
any store the caller cannot see, and "no record" could never be told apart from "hidden record" for such a
caller. Before this fix: `_store_preparation_context`/`_material_requisition_context` returned `{"access":
"restricted"}` only when the caller had ZERO relevant store permission anywhere, but `{"access": "accessible",
"exists": false}` for ANY absent record once the caller held the permission in at least one store - including
one that had nothing to do with where a hidden record might actually live. A new, pre-fix-reproducing test
(`PartialStoreAccessDisclosureTests`, added to `tests/test_batch_register.py`) confirmed the exact leak: a
user with `store_preparation.view` in store A only saw `exists: false` for a plan with no preparation, and
`restricted` for a different plan whose preparation lived in store B - two different, comparable shapes, from
which existence could be inferred.

**The fix.** `apps/batch_register/services.py` gained `UNAVAILABLE = {"access": "unavailable"}` and
`_full_store_coverage(store_ids)` (true only when `store_ids` equals every active `SharedStore` id in the
system). `compute_access_context` now also returns `store_prep_full_coverage`/`requisition_full_coverage`.
`_store_preparation_context`/`_material_requisition_context` were rewritten so that `{"access": "accessible",
"exists": false}` is reported ONLY when the caller's permission covers every active store (no store left to
hide a record in); every other "cannot tell" state - a record in an inaccessible store, an absent record
without full coverage, or missing `formulas.view` for the requisition section - now returns the SAME
`UNAVAILABLE` shape. `order_context`/`customer`/`product_type_current` were left untouched - every `BatchPlan`
row has exactly one order/customer/product, so there is no existence question for those three sections and no
leak was possible there.

**Secondary disclosure path found and fixed while auditing `source_drift` (step 3 of this task).**
`assess_source_drift`'s `INCOMPATIBLE_PRODUCT_DRIFT`/`PRODUCT_RENAMED`/`INACTIVE_PRODUCT` issue messages
reference the sales order line's CURRENT product code/active-state - the same live fact `product_type_current`
already gates behind `products.view`, but `source_drift` itself carried NO permission gate at all. A caller
lacking `products.view` could therefore read the live product's code or active status straight out of an
otherwise-ungated section, bypassing an existing gate on the exact same endpoint. Fixed by redacting just the
`message` of those three issue codes to a fixed string (`"Detail requires products.view."`) when `products.
view` is missing, while keeping `code` and `blocking` intact (a `batch_plans.view` holder still learns THAT a
blocking drift exists, never the live product detail). Every other issue code (unit/line-position related)
references nothing this register gates anywhere, so none of them were touched - "only fix concrete disclosure
paths found," not a redesign of `assess_source_drift` itself. Filtering/searching by `customer`/`order_date_*`
and pagination/result counts were also re-checked against the same question (can a restricted-section caller
learn anything by varying a filter or watching the count change) - no further path was found: no filter exists
on store-preparation/requisition existence, and `test_filters_and_counts_do_not_reveal_hidden_related_records`
pins that the row count and id set returned to a full-access caller and a partial-access caller are identical
for the same underlying data.

**Verification.** `tests.test_batch_register` (extended with a new `PartialStoreAccessDisclosureTests` class,
8 new tests, plus 4 existing `RestrictedSectionTests` assertions updated for the renamed contract), 36 tests
total, OK, Python exit 0, ~142s. New coverage: no related record (unavailable, not `exists: false`), a related
record in an inaccessible store (unavailable), the core side-by-side assertion that an absent record and a
record hidden in another store render byte-identically, a related record in an ACCESSIBLE store still showing
full detail (partial access never degrades authorized data), a revoked store membership flipping a
previously-accessible row to unavailable, missing `formulas.view` staying unavailable even with full store
coverage on the store side, filters/counts not revealing hidden data, and `source_drift`'s redaction holding
for a caller without `products.view` while remaining intact for one who has it. `manage.py check` clean;
`makemigrations --check --dry-run`: no changes (no model change was needed - this is a pure response-shape
fix in `apps/batch_register/services.py`). No other app's file was touched, so no other app's suite was
re-run. Updated `docs/frontend-api-handoff.md` §21.1/§21.2 (new §21.2a) and the API dashboard's `batch_register`
operation notes/response example (`docs/api-dashboard/scripts/module_manufacturing.py`, rebuilt into
`api-data.json`) to describe the corrected `unavailable` contract and the `source_drift` redaction; see
`docs/backend-decisions.md`, Task 15B.1 for the full access-boundary reasoning.

## Task 15B.2 — Final Narrow Register Disclosure Check

**Case 1: inactive-store related records.** `_full_store_coverage` (Task 15B.1) compared a caller's store
permission set against every ACTIVE `SharedStore` id. Reading `apps/stores/services.deactivate_store` directly
confirmed deactivating a store is a plain flag flip - it never cascades to, or detaches, any `StorePreparation`/
`MaterialRequisition` row that already references it (`store`'s FK is `PROTECT`, not `CASCADE`). That meant a
caller holding the permission in every currently-ACTIVE store would be treated as having "full coverage" and
shown `{"access": "accessible", "exists": false}` for an absent record - even though a record could still be
sitting, invisibly, in a store that was deactivated AFTER it was created. A new test built exactly this
scenario (a `StorePreparation` created in a store, then that store deactivated) and confirmed the absent-record
row and the hidden-in-now-inactive-store row rendered as two DIFFERENT shapes - the same class of leak Task
15B.1 closed for active stores, re-opened for inactive ones. Rather than patch the coverage check again (e.g.
comparing against ALL stores including inactive ones - rejected; see `docs/backend-decisions.md` for why that
is both overly conservative and still not provably complete), the full-coverage exception and `_full_store_
coverage` were removed ENTIRELY. `{"access": "accessible", "exists": false}` no longer exists as a response
shape at all - `_store_preparation_context`/`_material_requisition_context` now return `UNAVAILABLE` for every
case where a real, currently-accessible record cannot be shown (absent, hidden in an inaccessible active store,
or hidden in a now-inactive store), and full detail only for a record the caller can actually see. This is a
real contract change even for a FULLY-authorized caller in a single-store deployment: the previously-returned
`exists: false` for a genuinely absent record is now `unavailable` too, in every case, with no exception.

**Case 2: source-drift codes.** Task 15B.1 redacted only the `message` of `INCOMPATIBLE_PRODUCT_DRIFT`/
`PRODUCT_RENAMED`/`INACTIVE_PRODUCT` when `products.view` was missing, keeping `code` and `blocking` visible.
This task found that insufficient: the bare CODE already names the protected live fact (seeing
`"INACTIVE_PRODUCT"` in the list already tells an unauthorized caller the product is currently inactive,
regardless of the message text next to it). Using the EXISTING, already-shipped `apps.batch_plans.
BatchPlanDetailSerializer.get_source_drift` as the boundary (confirmed by reading it directly: it returns
`is_incompatible` to any `batch_plans.view` holder, with no `products.view` gate at all - that boolean is
already part of the project's authorized contract), `_source_drift_context` was restructured: `is_incompatible`
stays visible unconditionally (the generic, already-authorized signal); the three product-gated codes move
into a new nested `product_detail` sub-section, `{"access": "unavailable"}` - with no code, message, or other
metadata about them appearing anywhere in the response - when `products.view` is missing, and
`{"access": "accessible", "issues": [...]}` (full detail, unredacted) when it is present. Every other issue
code (unit/line-position related) stays in the flat `issues` array unconditionally, unchanged - none of them
reference anything this register gates anywhere.

**Verification.** `tests.test_batch_register` - 3 new tests (absent-vs-hidden-inactive-store equivalence, a
three-way absent/inaccessible-active/inactive-store equivalence check for one caller, and `is_incompatible`
remaining visible while `product_detail` is unavailable), plus 2 existing tests rewritten for the simplified
contract (the Task 15B `exists: false` assertion now expects `unavailable`; the Task 15B.1 source-drift
redaction test now expects the code absent entirely and a nested `product_detail: unavailable`). 39 tests
total, OK, Python exit 0, 138.5s. `manage.py check` clean; `makemigrations --check --dry-run`: no changes (pure response-shape fix, no
model touched). No other app's file was modified, so no other app's suite was re-run. Updated `docs/frontend-
api-handoff.md` §21.1/§21.2/§21.2a and the API dashboard's `batch_register` operation notes/response example
(rebuilt into `api-data.json`, cross-checked against the live URL resolver with zero mismatch - no route
changed, only response-shape documentation). See `docs/backend-decisions.md`, Task 15B.2 for the full
reasoning behind removing the coverage exception rather than patching it, and for why `is_incompatible`
remains ungated.

## Task 15C — Material Requisition Approval and Revision

**Status note (added during the frontend sales-order integration task, 2026-10-01): this entry was written
retroactively.** Task 15C's code was implemented and fully tested in an earlier turn of this same session, but
the documentation pass was never completed before a separate frontend integration task began - this is that
missed documentation, written from direct inspection of the actual current code (routes/serializers/services/
permissions/migrations), not from memory of having planned it.

**What exists, confirmed by inspection today:** extends `MaterialRequisition.Status` with `APPROVED`/
`REJECTED` (`DRAFT -> SUBMITTED -> APPROVED` / `-> REJECTED -> DRAFT -> SUBMITTED`). Three new store-scoped
actions under the existing requisition detail URL:

| Method | Path | Required permissions |
|---|---|---|
| POST | `/stores/<store_id>/material-requisitions/<id>/approve/` | `material_requisitions.view` + `.approve` (store) + `batch_plans.view` + `formulas.view` (company) |
| POST | `/stores/<store_id>/material-requisitions/<id>/reject/` | Same as approve - **"Approve and reject require view + approve"**, the task's own explicit instruction; there is no separate `.reject` permission |
| POST | `/stores/<store_id>/material-requisitions/<id>/revise/` | `material_requisitions.view` + `.edit` + `.revise` (store) + the same dual company check - revising reopens editable data, so `.edit` is additionally required, unlike approve/reject/submit which each stand alone |

New request serializers: `MaterialRequisitionApproveSerializer` (`expected_version` only), `MaterialRequisitionRejectSerializer` (`expected_version` + required non-blank `rejection_reason`), `MaterialRequisitionReviseSerializer` (`expected_version` + optional `refresh_from_source`/`expected_batch_plan_version`, required together only when the source has actually drifted). New services in `apps/material_requisitions/services.py`: `approve_material_requisition`, `reject_material_requisition`, `revise_material_requisition`, plus the shared eligibility gate `_reject_if_self_or_unprovable` (creator/submitter/contributor self-decision ban, fail-closed on incomplete legacy contributor provenance).

**New history structure**: `MaterialRequisitionRound` (one row per submission, folds the single decision directly onto the round - no separate per-step decision table, since this workflow has exactly one approval step, unlike `apps.purchasing`'s three-step round) and `MaterialRequisitionRoundLine` (permanent per-round line snapshot, including `requested_quantity_contributor` provenance). Contributor tracking lives on `MaterialRequisitionLine.requested_quantity_contributor`/`_contributed_at`, updated only on a genuine value change (never a no-op or remark-only edit).

**New permissions** (migration `apps/permissions/migrations/0027_seed_material_requisitions_approve_revise_permissions.py`): `material_requisitions.approve`, `material_requisitions.revise` - both STORE scope, seeded idempotently, assigned to no role/user by the migration itself (matches every other permission-seeding migration in this project).

**Migrations applied to the real dev database** (confirmed today, re-checking actual effect rather than assuming it from an earlier description): `material_requisitions.0003` (schema, purely additive) and `0004` (data backfill - reconstructs `current_round`/`MaterialRequisitionRound` history for any pre-existing `SUBMITTED` requisition from this app's own complete audit trail, honestly marking `contributor_provenance_complete=False` wherever reconstruction cannot be proven reliable, never fabricating a contributor). At application time the real dev database held exactly **one** pre-existing requisition, status `DRAFT` - the backfill migration therefore created zero `MaterialRequisitionRound` rows and changed no existing data beyond confirming `current_round` stayed at its default `0`. `permissions.0027` seeded the two new permission codes, assigned to nobody.

**Test evidence (current, not historical):** `tests/test_material_requisitions.py` - **87 tests, OK, Python exit code 0**, confirmed by a fresh run today, 2026-10-01 (~380s). This is the full file (Tasks 13A/15A/15B's own requisition tests plus 15C's new `ApproveRejectTests`/`ReviseTests` classes and extended `ConcurrencyTests`), not a partial or cumulative count. `manage.py check` and `makemigrations --check --dry-run` both clean against the current model state. `tests/test_batch_register.py` (39 tests) was also re-run today as a shared-surface regression check, since `apps.batch_register` reads `MaterialRequisition.status`/the new round data indirectly - still 39/39, OK, exit 0 (`apps.batch_register` needed no code change; it already read `.status` generically, with no hardcoded status enum).

**Deliberately not done in Task 15C** (unchanged scope boundary, restated here since it was never written down before): no cancel, unapprove, issue, fulfil, stock reservation, or automatic production action; no multi-step approval chain (the task's own explicit "one approval step... not client-validated" framing); no new business status beyond `APPROVED`/`REJECTED`. See the model's own docstring in `apps/material_requisitions/models.py` for the full, already-written design rationale this entry is documenting the existence of, not repeating.

## Department order workflow — delivered (2026-10-05)

- Schema: `sales_orders.0003`, `store_preparation.0002`, `batch_plans.0004`, `catalog.0003`, data `catalog.0004`, seed `permissions.0028`. All additive; existing rows keep null/blank.
- API: sales-order create/update/detail carry `planned_manufacturing_date` and line `product_type_snapshot`; store preparation carries `label_note`/`box_note`; batch plan carries `mrp_for_printing`/`printing_status_note`/`mrp_currency_code`; new `/api/v1/product-types/` (list/create, PATCH detail).
- Tests: `tests/test_department_workflow.py` (14 tests). Affected existing modules re-run: batch plans, sales orders, store preparation, catalog, batch-number allocation, store permissions.
- Known pre-existing failure: `tests.test_store_permissions` scope-filter tests compare one page (default size 20) against the full COMPANY-scope set (39 rows). Not caused by this change.
- Not done in this pass: draft-order delete; requisition submit/approve/reject/revise UI; batch register display of the new fields; Postman collection and API dashboard regeneration; browser verification.
