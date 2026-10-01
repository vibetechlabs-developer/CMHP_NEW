# Backend Decisions — Task 01

## Framework and versions

- **Python 3.12.7** — already installed on the target machine; current
  Django releases support it.
- **Django 5.2.17 (LTS)** — chosen over the newer Django 6.1 because it is
  the longer-supported option for a system meant to run unattended on a
  client's server: Django 5.2 LTS receives security fixes until
  **April 2028**, versus Django 6.1's extended support ending
  **December 2027**. Confirmed via the official Django download page and
  release notes (docs.djangoproject.com) as of September 2026.
- **Django REST Framework 3.16.1** — its package metadata explicitly
  declares Django 5.2 support (`Framework :: Django :: 5.2` classifier,
  `Requires-Dist: django>=4.2`).
- **psycopg 3.2.13 (`psycopg[binary]`)** — modern psycopg 3 driver, used
  natively by Django's `django.db.backends.postgresql` backend since
  Django 4.2 (no separate `psycopg2` dependency needed).
- **django-environ 0.14.0** — reads configuration from environment
  variables / a `.env` file so nothing sensitive is hardcoded in settings.

All versions are pinned exactly in `backend/requirements.txt` (generated
via `pip freeze` from a clean virtual environment) for reproducible
installs.

## Project structure

A flat `apps/` package holds real Django apps, not one folder per future
ERP module. Only two apps exist for Task 01:

- **`apps.common`** — cross-cutting, non-business-specific code. Currently
  just the `/api/v1/health/` liveness endpoint. Future cross-cutting
  concerns (shared base models, pagination classes, permission helpers)
  belong here rather than being duplicated per module.
- **`apps.users`** — the custom `User` model only. Company membership,
  company-scoped permissions, and employee/HR records are explicitly
  **not** part of this app yet — they are separate concerns to be designed
  in a later task (see "Deliberately deferred" below).

`config/` holds only wiring: settings, root URLconf, WSGI/ASGI entry
points. Splitting settings into `base.py` / `local.py` / `production.py`
is the standard Django pattern for keeping development convenience
(`DEBUG=True`, permissive `ALLOWED_HOSTS`) structurally separated from
production safety (`DEBUG` hardcoded off, `ALLOWED_HOSTS` required with no
default).

`tests/` is a single top-level package for this task's focused tests
rather than per-app `tests.py` files, since there are only two apps and
the tests span both (user creation/password hashing, and the health
endpoint). This can be split per-app later if/when it becomes unwieldy.

No Redis, Celery, Docker or Tally integration is present — none of that
was in scope for Task 01.

## Custom user model

`apps.users.models.User` extends `django.contrib.auth.models.AbstractUser`
and only adds:

- `email` — made required and unique (`AbstractUser.email` is blank and
  non-unique by default; this project needs it as a real identifier even
  though `username` remains `USERNAME_FIELD` for now).
- `updated_at` — an `auto_now` timestamp, useful for auditing edits to the
  account record once more fields exist.

Deliberately **not** added to `User`, per the business context supplied
for this task:

- A single company foreign key — a user can belong to **one or both**
  companies, which a single FK cannot express. This needs an explicit
  membership model (user ↔ company, possibly with per-company role/
  permissions), designed in the next task.
- A single global role field — permissions differ **per company**, so a
  flat role on `User` would be wrong the moment a user has two companies
  with two different roles.
- Salary or other HR fields — the task brief explicitly separates
  "employee records" (an HR/business concept) from "login accounts" (an
  authentication concept). `User` is the login account only; an `Employee`
  model (or similar), linked to but distinct from `User`, belongs to a
  future HR module.

`username` remains the authentication identifier
(`USERNAME_FIELD = "username"`, inherited from `AbstractUser`). Email
login, if wanted, is explicitly deferred to the next task rather than
half-implemented here.

No default superuser or default password is created anywhere in this
project — `createsuperuser` must be run interactively, and it enforces
Django's configured password validators.

## Configuration and secrets

All secrets and connection settings are read from environment variables
via `django-environ`, loaded from `backend/.env` (see
`backend/.env.example` for the placeholder list; `.env` itself is
gitignored). There is no SQLite fallback: if `DB_NAME`/`DB_USER`/
`DB_PASSWORD` etc. are missing, Django fails to start rather than silently
using a different database.

`production.py` hardcodes `DEBUG = False` in code (not read from the
environment) so a missing or wrong environment variable can never
re-enable debug mode in production. `ALLOWED_HOSTS` in production has no
hardcoded fallback host — it must be set explicitly per deployment.

No CORS package is installed yet. There is no frontend to configure an
allowed origin for, and adding a CORS library now would mean guessing at
a policy; the business requirement to avoid "permissive CORS" is honored
by not configuring anything permissive rather than by pre-emptively
installing and half-configuring a package. This will be added explicitly
when a frontend origin actually exists.

## Timezones

`USE_TZ = True`, `TIME_ZONE = "UTC"` — all stored and processed datetimes
are UTC. The client's business display timezone (Asia/Kolkata) is a
presentation concern, handled by whatever renders data for a human
(API serializer formatting, frontend), not by changing Django's internal
timezone. This keeps stored timestamps and any future cross-service data
unambiguous regardless of where they are displayed.

## Logging

Console-only logging (`LOGGING` in `base.py`), no file handlers yet. The
format string is `[timestamp] LEVEL logger: message` — no request body,
header, or exception-locals dump is configured, so passwords, tokens and
personal data submitted in requests are not written to logs by this
configuration. This should be revisited if/when structured request
logging is added later — at that point, explicit redaction of sensitive
fields will be needed.

## Health endpoint

`GET /api/v1/health/` returns exactly `{"status": "ok"}` with no
environment, version, or configuration detail — it is a liveness probe,
not a readiness/diagnostics endpoint. It intentionally does not touch the
database, so it cannot be used as proof the database is reachable.

## Deliberately deferred (not in Task 01)

- Company model and user–company membership.
- Company-scoped permissions.
- Common-store access control.
- Employee (HR) records, separate from login accounts.
- Login/authentication endpoints (email login, tokens, sessions).
- Any business module (orders, batches, production, accounting).
- Redis, Celery, Docker, Tally integration.
- CORS configuration (no frontend exists yet).

# Backend Decisions — Task 02

## Company and company membership

A new `apps.companies` app (not folded into `apps.users` or `apps.common`)
holds `Company` and `CompanyMembership`, matching the flat `apps/`
structure decided in Task 01 — a distinct business concern gets its own
app rather than growing `apps.users` past "the login account model".

**`Company.code` normalisation and validation live in the model, not a
form/serializer.** No REST/admin-form layer exists yet for this task, so
`Company.clean()` (trim + uppercase `code`, strip `legal_name`/
`display_name`, reject blank-after-strip required fields) is called from
`Company.save()` itself — otherwise "reject blank/whitespace-only values"
would only be enforced by whichever caller happens to remember to validate
first. `code` uniqueness is still enforced by a real `unique=True` database
index rather than a pre-save Python check, so it holds even under
concurrent inserts and is a true database-level guarantee, not just an
application-level one.

**`CompanyMembership` uses a `UniqueConstraint` on `(user, company)` with
no `is_active` condition**, so the constraint also covers inactive rows —
an intentional choice so that deactivating and later restoring someone's
access reuses the same row (`CompanyMembership.objects.activate()`) rather
than accumulating duplicate historical rows for the same pair.

**Both foreign keys use `on_delete=PROTECT`.** Membership rows are the
record of who had access to which company and when; silently cascading a
delete through them (or nulling them out) would destroy that history.
Deleting a `User` or `Company` that still has membership rows is refused
at the database level — the caller must deactivate the membership first,
which is a deliberate speed bump against accidental data loss.

**No single company FK or global role field was added to `User`** — this
was already decided in Task 01 (a user can belong to one or both
companies) and `CompanyMembership` is the model that makes that concrete.
Per-company role/permission fields are explicitly not part of this task
either; `CompanyMembership` currently only answers "does this user have
active access to this company", not "what can they do there" — that is
role/permission design for a later task.

**The company-access lookup is a single function
(`apps.companies.services.active_companies_for_user`), not a manager
method or a mixin on `User`.** It needs to reason about three models'
`is_active` flags at once (`User`, `CompanyMembership`, `Company`), which
doesn't belong to any one of them individually. It deliberately never
looks at `is_staff`/`is_superuser` — Django-admin access and business
company-membership access are unrelated concerns, and conflating them
would silently give every admin/superuser account implicit access to
every company's data, which is exactly the kind of implicit trust this
task's brief ruled out.

**Django admin is superuser-only for these two models at this stage**,
via a shared mixin overriding `has_module_permission` /
`has_view_permission` / `has_add_permission` / `has_change_permission` to
require `is_active and is_superuser`. Company/membership assignment is
sensitive enough that "ordinary staff" (an admin account without
superuser) should not be able to grant themselves or others company
access through the admin, even though Django's default permission system
would otherwise allow that via assigned model permissions.

**Hard deletion is disabled in the admin (`has_delete_permission` always
`False`) in favour of a "Deactivate selected" action.** The action saves
each object individually (`is_active = False`, explicit `save()`) rather
than a bulk `.update()`, specifically so `self.log_change()` can record a
normal Django admin `LogEntry` per row — a bulk `.update()` bypasses
`save()` and would leave no admin change history. This reuses Django's
existing `LogEntry` mechanism rather than building bespoke audit
infrastructure; a full ERP audit trail (who changed what business data,
not just admin-site edits) is out of scope here and left for a dedicated
future task.

# Backend Decisions — Task 03

## Company-scoped roles and permissions

**A third app, `apps.permissions`, rather than folding roles into
`apps.companies`.** `Company`/`CompanyMembership` answer "does this user
have *any* relationship to this company"; `PermissionDefinition`/
`CompanyRole`/`MembershipRole` answer "what can they *do* there" — a
different, separable concern that Task 02 deliberately deferred
("membership alone grants no module/action permission"). Keeping it a
separate app also keeps `apps.companies` reusable if a future shared-store
permission model needs `Company`/`CompanyMembership` without dragging in
company-role machinery.

**Role codes are scoped to `(company, code)`, not globally unique.** Two
different companies each defining a `MANAGER` role is the normal case for
this business (two companies, potentially different org structures) — a
single global `CompanyRole.code` uniqueness would force artificial
per-company prefixes (`ACME_MANAGER`) for no benefit. `CompanyRole.code`
reuses `apps.companies.models.normalize_code` (trim + uppercase) rather
than redefining an equivalent function, since the normalisation rule is
identical. `PermissionDefinition.code` is normalised separately (trim +
lowercase) because it follows a different convention — a dotted
`module.action` identifier like `orders.view`, which reads oddly
upper-cased and is a global catalogue, not per-company, so it has no
scoping concern to begin with.

**Enforcing "role and membership must belong to the same company" was the
hardest correctness requirement in this task**, because Django gives no
built-in way to make one FK's value depend on another FK's related value
at the database level — a Postgres `CHECK` constraint can only see columns
in the same row, not values reached through a join. The chosen answer:
`MembershipRole.clean()` does the cross-company check, and `save()`
unconditionally calls `self.clean()` first (the same pattern already used
by `Company`, and now `CompanyRole`/`PermissionDefinition` too) — so it is
never a validation method that "normal save() never calls". Because
Django's `ModelForm` (which Django Admin's add/change views use) calls
`instance.full_clean()` — which calls `clean()` — as part of form
validation *before* `save()` runs, the admin's add/change forms reject a
cross-company pick with a normal inline form error, not a raised
exception. `apps.permissions.services.assign_role()` repeats the same
check explicitly before touching the database, so the rule is enforced
whether the caller goes through the admin, the service, or a bare
`MembershipRole.objects.create(...)` call.

**Honestly documented gap**: `MembershipRole.objects.bulk_create()` and
`MembershipRole.objects.filter(...).update(...)` never call `save()` or
`clean()` — Django does not run per-instance validation on either of
those. Nothing in this codebase currently calls `bulk_create()` on
`MembershipRole` (the only writer is `assign_role()`, which uses
`get_or_create()`), but if future code did, a cross-company row could be
inserted without any error, because no database constraint backs the rule
either, for the same "`CHECK` can't join tables" reason. This is called
out directly in `MembershipRole.save()`'s comment, and
`tests/test_permissions.py` includes a test that deliberately exercises
`bulk_create()` and asserts the mismatched row *does* get created — proof
the gap is real and known, not silently assumed away. If this ever
becomes a real risk (e.g. a future bulk-import feature), the fix is a
composite foreign key at the database level (storing a denormalised
`company` column on `MembershipRole` and adding `FOREIGN KEY
(membership_id, company_id) REFERENCES ...` / `FOREIGN KEY (role_id,
company_id) REFERENCES ...` pointing at composite-unique `(id, company)`
indexes on both parent tables) — deliberately not built now, since it adds
real schema complexity for a write path nothing currently uses.

**`effective_permission_codes(user, company)` is one query, not a Python
union of per-role querysets.** It filters `PermissionDefinition` directly
across the `company_roles`/`membership_assignments` reverse relations with
every `is_active` condition inline, so Django compiles it to a single SQL
statement with joins, regardless of how many roles or permissions a
membership has (`assertNumQueries(1)` in the test suite). This directly
serves the "avoid N+1 queries" requirement and the "no caching, so
revocation takes effect immediately" requirement at the same time: since
it is cheap enough to run on every call, there was no need to cache
anything that would then need explicit invalidation.

**`is_staff`/`is_superuser` are never consulted by these services**,
exactly continuing the Task 02 decision for
`active_companies_for_user` — Django-admin access and business-module
permissions are unrelated axes. A superuser can manage the permission
catalogue in Django Admin (that's what superuser-only admin access is
for) without that implying they can, say, create orders in a company they
have no role in; those are two different systems answering two different
questions.

**Shared-store permissions are explicitly not modeled here.** No
`CompanyRole` was attached to a synthetic "shared" company, and no
special-cased company was created to represent the shared store — doing
either would make the shared store look like a third company to every
company-scoped query in this task, which is not what it is. How
shared-store access should actually be modeled (a separate
non-company-scoped permission/membership concept) is left for its own
future task, per the business requirement's explicit instruction.

**Admin**: `PermissionDefinition`, `CompanyRole`, `MembershipRole` all
reuse `SuperuserOnlyAdminMixin` from `apps.companies.admin` by importing
it, rather than copy-pasting an equivalent class into
`apps.permissions.admin` — the access rule ("active superusers only, no
hard delete") is identical, so it should have one definition. The mixin
gained a `reactivate_queryset` method (symmetric to the existing
`deactivate_queryset`) because this task's brief explicitly asked for
admin support for "deactivating *and reactivating* records", which Task
02 never required; adding the method does not alter
`deactivate_queryset` or any existing Task 02 admin action.
`MembershipRoleAdmin` narrows the `role` field's dropdown to the
membership's company on the change form only (`get_form` stashes the
current object on `request` so `formfield_for_foreignkey`, which is not
given the object directly, can see it) — the add form cannot be narrowed
this way because no membership has been chosen yet at render time, which
is exactly why server-side validation in `clean()`/`save()` is the real
enforcement and the dropdown narrowing is only a convenience.

# Backend Decisions — Task 04

## Authentication and current-user access APIs

**`djangorestframework-simplejwt`, not a hand-rolled JWT implementation
or DRF's own `TokenAuthentication`.** It is the maintained, standard JWT
library for DRF, ships its own refresh-token blacklist app (so rotation/
revocation didn't need to be built from scratch), and its `JWTAuthentication`
class does a real database lookup per request (`get_user()` — see
below) rather than trusting the token as the source of truth, which is
exactly what "no role/permission claims trusted from JWTs" requires.
Deliberately **not** `JWTStatelessUserAuthentication` (SimpleJWT's other
authentication class) — that one builds a fake user object from token
claims alone and never touches the database, which would make "resolve
active user, memberships and permissions from the database" impossible
and would let a deactivated user's still-unexpired access token keep
authenticating as if nothing changed.

**Why deactivating a user blocks `/me/` (and every other Bearer endpoint)
immediately, without any extra code:** `JWTAuthentication.get_user()`
re-fetches the user row from the database on *every single request* and
checks `CHECK_USER_IS_ACTIVE` (on by default) — an access token carries
only a `user_id` claim, nothing else, so there is nothing for it to get
stale. This is also why revoking a role assignment or deactivating a
membership takes effect on the very next call with the *same*
still-unexpired access token: `/companies/mine/` and `/my-permissions/`
re-run `active_companies_for_user()`/`effective_permission_codes()`
against the database every time, and those functions were already
designed (Tasks 02–03) to consult live `is_active` flags rather than
anything cached or carried in a token. No permission caching was added in
this task specifically *because* it wasn't needed to satisfy "revocation
takes effect on the next lookup" — the existing service design already
guaranteed that for free.

**Why `RefreshView` re-checks `user.is_active` explicitly, when
`JWTAuthentication` already does this for Bearer requests:** the refresh
endpoint is deliberately **not** Bearer-authenticated (`authentication_classes
= []`, matching "do not require a valid access token for this endpoint") —
it authenticates via the refresh-token cookie instead, so
`JWTAuthentication.get_user()`'s automatic active-user check never runs
for it. SimpleJWT's own rotation logic (`TokenRefreshSerializer`) also
doesn't check this — it only validates the *token's* signature/expiry/
blacklist status, never touches the `User` table. Without an explicit
`User.objects.filter(pk=user_id, is_active=True)` check in `RefreshView`
itself, a user deactivated after their refresh token was issued could
keep minting new access tokens indefinitely until the refresh token's own
1-day expiry. This is why `RefreshView` does not simply call SimpleJWT's
stock `TokenRefreshView`/`TokenRefreshSerializer` — it needed this one
extra check that the stock implementation doesn't provide.

**DRF's `APIView` is CSRF-*exempt* by default; this had to be undone
explicitly, not assumed away.** `APIView.as_view()` wraps the whole view
in Django's `csrf_exempt`, and DRF only re-enables CSRF checking for
`SessionAuthentication` (via that class's own `enforce_csrf()`). None of
login/refresh/logout authenticate via a Django session — login is
anonymous until it succeeds, refresh/logout authenticate via the refresh
cookie — so without doing something explicit, none of the three would
ever be CSRF-checked, silently. `apps.authentication.csrf.enforce_csrf()`
reuses DRF's own internal `CSRFCheck` (the exact class
`SessionAuthentication.enforce_csrf()` uses), so it validates the
standard Django `csrftoken` cookie against the standard `X-CSRFToken`
header — no custom CSRF mechanism was invented.

**A DRF quirk required an explicit fix to get `401` instead of `403`:**
`APIView.handle_exception()` silently downgrades `AuthenticationFailed`/
`NotAuthenticated` from `401` to `403` whenever the view has no
authenticator to offer a `WWW-Authenticate` challenge header — which is
exactly the case for `LoginView`/`RefreshView`/`LogoutView`, since all
three have `authentication_classes = []` (correctly — they don't
authenticate via Bearer). Discovered by writing the tests first: every
"wrong credentials" / "missing refresh cookie" / "refresh after logout"
test initially failed with "403 != 401" until
`ExplicitAuthFailure401Mixin.get_authenticate_header()` was added to
those three views specifically to restore the spec-required `401` without
making Bearer an actual (unwanted) authentication method on them.

**The refresh token lives only in an `HttpOnly` cookie, scoped to
`Path=/api/v1/auth/`, never in a JSON response body.** A JSON-body
refresh token would be readable by any JavaScript on the page (XSS
exposure) and would have to be manually stored and reattached by every
client; the cookie is invisible to JavaScript and the browser (or
Postman's cookie jar) resends it automatically only to the one path
family that needs it, nowhere else on the site. The access token, by
contrast, is short-lived (5 minutes) and low-value enough to return in
JSON and hold in memory on the client, which is what makes the
`Authorization: Bearer` pattern usable at all without a cookie for every
single API call.

**Cookie set and clear share one `_cookie_attrs()` function, and logout
does not use Django's `HttpResponse.delete_cookie()`.** `delete_cookie()`
infers `secure` from the cookie's name/`samesite` instead of accepting it
as a parameter — since this cookie is named plainly (`refresh_token`, not
`__Secure-refresh_token`) and uses `SameSite=Lax` (not `"none"`),
`delete_cookie()` would always compute `secure=False` for the *clearing*
Set-Cookie, even in production where the cookie was *set* with
`Secure=True`. That mismatch is exactly what "consistent attributes when
setting and clearing it" was written to rule out, so `clear_refresh_cookie()`
instead calls `response.set_cookie()` directly with the same
`_cookie_attrs()` the setter uses, plus `max_age=0` and an epoch
`expires`.

**Login throttling uses DRF's `AnonRateThrottle` (IP-keyed), not a custom
throttle.** Login has no authenticated user yet by definition, so
per-user throttling isn't available at that point — IP-based is the
standard, correct scope for a login endpoint, and DRF ships it already.
The rate is read from `AUTH_LOGIN_THROTTLE_RATE` (default `5/min`) so it
is configurable per environment without a code change, per the brief.

**Company/role "immutable after creation" was added as `clean()`/`save()`
guards on `CompanyMembership` and `CompanyRole`, not a database
constraint, and the docs say so plainly.** The underlying risk this
closes: `MembershipRole` only checks "role and membership belong to the
same company" *at assignment time* (Task 03); nothing previously stopped
someone from later editing an existing `CompanyRole` or
`CompanyMembership` to point at a different company, which would silently
strand every `MembershipRole` row that referenced it in a now-wrong
company pairing. A genuine database-level fix would need a composite
foreign key (a denormalised `company` column on `MembershipRole` plus
`FOREIGN KEY (membership_id, company_id) REFERENCES ...`/`FOREIGN KEY
(role_id, company_id) REFERENCES ...` against composite-unique `(id,
company)` indexes on both parent tables — the same idea already floated
and deliberately deferred in the Task 03 decisions for the same reason:
real schema complexity for a write path nothing in this codebase actually
uses. Instead: (1) the `clean()`/`save()` guard closes the normal,
supported write path (plain `.save()`, and Django Admin's `ModelForm`,
which validates through `clean()` too) at essentially no cost, and (2)
`effective_permission_codes()`'s existing double company constraint
(`company_roles__company=company` **and**
`...membership__company=company`, both Task 03) already makes the
*consequence* of a successful bypass harmless — even a `QuerySet.update()`
that slips a `company` change past `save()`/`clean()` cannot make a
stale/mismatched `MembershipRole` row satisfy both conditions for the
same queried company. Both regression tests
(`test_changing_company_role_company_after_creation_rejected` and
`test_queryset_update_bypass_of_company_change_still_fails_closed`) are
in `tests/test_auth.py`. This is deliberately documented as "fails
closed despite the gap", never as "the gap doesn't exist" or "this is a
database-level guarantee" — it is not one.

**No CORS package was added.** Postman and curl are not browsers and do
not enforce or need CORS at all; this project still has no frontend
origin to configure one for (the Task 01 decision on this is unchanged).
Adding `django-cors-headers` now would mean guessing at a policy for an
origin that doesn't exist yet, which is exactly what was ruled out
previously.

**Live HTTP verification used a dedicated, disposable user, never an
existing one.** `_task04_live_check_tmp` was created immediately before,
and deleted immediately after, exercising the full flow against the real
running dev server on `127.0.0.1:8001` — this proves the real WSGI
stack/cookie/CSRF behaviour end-to-end (something Django's in-process
test `Client` cannot fully substitute for, since it never actually opens
a socket), without touching any password or account that already existed
in `cmhp_new_dev`, and without leaving that throwaway account behind
afterward.

# Backend Decisions — Task 05

## User management APIs

**`apps.users` gained the API layer; `apps.audit` is a new, separate
app**, not folded into `apps.users`. The audit model/service needs to be
importable from `apps.users.services` (which writes to it) without
`apps.users` needing to *own* the concept of "an audit trail" — the same
"separate concern, separate app" reasoning already used for
`apps.permissions` vs `apps.companies` in Task 03. It also keeps the door
open for a future task's mutations (once any exist) to write to the same
`AuditLog` without importing `apps.users` for it.

**`IsActiveSuperuser` lives in `apps.common.permissions`, not
`apps.users`.** `apps.common`'s stated purpose since Task 01 is exactly
this: "shared base models, pagination classes, permission helpers." It
is one class, reused by every view in this task, and is the kind of thing
a later task (company CRUD, role-definition CRUD) will almost certainly
need again — defining it once, cross-cutting, avoids either duplicating
it per-app or creating an import dependency from some future app back
into `apps.users` just to reuse an authorization check that has nothing
to do with users specifically.

**Membership/role detail is not nested inside `GET /users/<id>/` (or the
list).** The brief explicitly offered either "include membership
information or a clearly documented link" — nesting would mean an extra
query (at minimum) per row in the *list* view, defeating the "avoid N+1
queries" requirement the moment anyone asked for membership data too.
`memberships_url` is a concrete, always-correct link
(`/api/v1/users/<id>/memberships/`) rather than just a sentence in a
docstring, so "clearly documented" is enforced by the response shape
itself, not only prose.

**Rejecting prohibited fields is explicit, not just "absent from
`Meta.fields`".** A DRF `ModelSerializer` silently ignores any key in the
request body that isn't one of its declared fields — so `{"is_superuser":
true, "username": "x", ...}` would, by default, just quietly create/update
`username` and say nothing about `is_superuser`. That satisfies "do not
accept" in the narrowest possible reading but not "reject... rather than
silently applying them" — an admin tool that silently drops part of what
you sent without telling you is worse than one that fails loudly. Both
`UserCreateSerializer.validate()` and `UserUpdateSerializer.validate()`
check `self.initial_data` (the raw, undeclared-fields-included input, not
`validated_data`) against an explicit prohibited-field set and return
`400` with a specific per-field message if any of them showed up in the
request at all — regardless of what value was sent, including a value
that happens to match the current state.

**Self-deactivation is checked *before* the superuser-target exclusion in
`UserDeactivateView`, not after.** Both checks are simple `if` statements
in the same method, but their order matters: every caller of this
endpoint is, by `IsActiveSuperuser`, already a superuser. If "target is a
superuser → 403" were checked first, a superuser targeting *themselves*
would always hit that branch and the dedicated "you cannot deactivate
your own account" `400` would be unreachable dead code for the one actor
who could ever trigger it. This was caught by writing the test first
(`test_self_deactivation_blocked` initially got `403`, not the expected
`400`) rather than being spotted by inspection — worth calling out
because it is exactly the kind of ordering bug that looks correct on a
read-through of either branch in isolation.

**Superuser-target exclusion is scoped to activate/deactivate only, not
to `PATCH`/membership/role endpoints.** The brief's "exclude management
of other superuser accounts" sentence appears specifically under the
activate/deactivate bullet, not under `PATCH` or the membership/role
bullets. Broadening it to every mutating endpoint would be inventing a
restriction the brief didn't ask for and would make "an active superuser
can... view and update users" (no superuser carve-out mentioned there)
self-contradictory. `GET`/`PATCH` on a superuser target still work
through this API; only the two lifecycle-state endpoints exclude
superuser targets, with `403` and a message pointing at Django Admin.

**404 for "wrong/nonexistent id", 400 for "exists but inactive/
mismatched" — a deliberate split, not laziness.** `get_object_or_404`
handles the first category everywhere a company/role/membership/
assignment id is looked up (including compound ownership checks like
`get_object_or_404(CompanyMembership, pk=membership_id, user=user)`,
which makes "belongs to a different user" 404 exactly like "doesn't
exist" in one query, with no separate existence check needed first). The
second category — inactive user/company/membership/role, or a
cross-company role — is a business-rule rejection on a resource that
demonstrably *does* exist and *is* visible to this superuser caller
elsewhere in the same API (e.g. `GET /companies/` in Django Admin), so a
misleading 404 there would be worse than the precise 400 it gets instead.
This deliberately differs from `/companies/<id>/my-permissions/`'s Task 04
behaviour (nonexistent/inactive/inaccessible company all collapse to one
404) — that endpoint's caller is an ordinary user who should not be able
to distinguish "doesn't exist" from "not yours" for a business resource;
here, the caller is by definition a superuser for whom that distinction
is not a confidentiality boundary.

**Membership/role assignment creation reuses
`CompanyMembership.objects.activate()` (Task 02) and
`apps.permissions.services.assign_role()` (Task 03) completely
unchanged**, rather than modifying either to return a `(obj, created)`
tuple. Both are already called from several existing, passing tests that
expect a single return value; changing their signature would have meant
touching every one of those call sites for a distinction (HTTP `201` vs
`200`) that only this task's view layer actually needs.
`apps.users.services.assign_company_membership`/`assign_membership_role`
instead check `.filter(...).first()` (and its `is_active`) *before*
calling the existing, reused function, entirely in the same
`@transaction.atomic` block — an intentional "wrap and observe" approach
rather than modifying a shared dependency four other test files already
lock in the shape of.

**Audit-on-no-op is avoided the same way, by comparing before-vs-after
(or checking prior state) rather than trusting the reused functions'
return value alone** — `CompanyMembership.objects.activate()` and
`assign_role()` are both already idempotent (a repeated call is a
harmless no-op that still "succeeds"), but "succeeds without error" and
"actually changed something worth auditing" are different questions; only
the latter should produce an `AuditLog` row, per the brief's "actual
no-op requests do not create duplicate change records."

**Audit-write failure rolling back the business mutation is a consequence
of placement, not special exception-handling code.** `apps.audit.services.
record()` does nothing unusual — it is `AuditLog.objects.create(...)`. The
guarantee comes entirely from calling it as the *last* statement inside
each `@transaction.atomic`-decorated service function, after the business
mutation: if `record()` raises, Django's `atomic()` context manager rolls
back everything since it opened, mutation included. The regression test
proves this by mocking `apps.users.services.record` to raise
`RuntimeError` and asserting the user (or membership) row was never
committed — not by asserting anything about the audit table specifically.

**No caching, no batching, no async task queue for audit writes.** Task
05's write volume (superuser-initiated user/membership/role management)
is inherently low-frequency — nothing here is a hot path where a
synchronous extra `INSERT` per mutation would matter. Introducing
Celery/a task queue purely to make audit writes asynchronous would add
real infrastructure (this project has none yet - see Task 01's
"deliberately deferred" list, still true) for a performance problem that
does not exist at this stage, and would also reopen exactly the
atomicity guarantee above: an async audit write can no longer roll back
its triggering transaction.

# Backend Decisions — Task 06

## Company and role management APIs

**Editing a company's own metadata is not gated by that company's own
`is_active` state; editing a role *is* gated by its parent company's
`is_active` state.** This asymmetry was the one genuinely ambiguous point
found while reviewing the pre-existing implementation, and it was resolved
by *not* inventing a restriction the brief never actually asked for
company records themselves. The reasoning: a role only has meaning in the
context of a company currently transacting business, so restricting
create/edit/activate on a role while its company is inactive prevents
building out access that would immediately be meaningless. A company has
no equivalent parent state to be restricted by — nothing "contains" a
company the way a company "contains" its roles — and correcting an
inactive company's `legal_name` (a typo, a legal-entity-name change while
the company is on hold) is a legitimate administrative action that has
nothing to do with whether the company is currently transacting business.
Both behaviours are now explicit, tested
(`test_patch_allowed_even_when_company_inactive` in
`tests/test_company_management.py`, alongside the corresponding
role-level rejection tests in `tests/test_role_management.py`), and
documented in `docs/backend-tasks.md`, rather than left as an implicit,
easily-"corrected"-by-accident quirk.

**`apps.users.admin.UserAdmin` did not enforce the project's
superuser-only admin policy before this task — this was a genuine,
concrete gap, not a stylistic choice.** Every other model admin in this
project (`Company`, `CompanyMembership`, `PermissionDefinition`,
`CompanyRole`, `MembershipRole`) is restricted via
`SuperuserOnlyAdminMixin`; `UserAdmin` alone relied on Django's own
`auth.add_user`/`change_user`/`view_user`/`delete_user` model permissions,
meaning a staff account granted those permissions by *some* superuser at
some point (through this same admin, before the fix) could manage other
users' accounts without being a superuser themselves — a materially wider
blast radius than every other admin surface in this codebase allows.
Fixed by adding `SuperuserOnlyAdminMixin` first in `UserAdmin`'s base
class list, ahead of `DjangoUserAdmin` — Python's MRO resolves the
mixin's `has_*_permission` methods first (none of them call `super()`,
so they fully replace Django's default permission checking, exactly as
they already do for the other five admins), while `DjangoUserAdmin`'s
`add_form`/`form`/password-hash-display/"change password" link machinery
is untouched, since the mixin never overrides `get_form` or anything
form-related. This was regression-tested by explicitly granting a
non-superuser staff account all four `auth.*_user` permissions and
asserting the admin still denies `has_module_permission`/
`has_view_permission`/`has_add_permission`/`has_change_permission` — proof
the fix does not merely happen to work by omission, but actively ignores
Django's permission system in favour of the `is_active`/`is_superuser`
check, consistent with every other admin here. Hard delete is now
disabled for `User` through the admin too, matching the "deactivate,
never hard-delete" policy already enforced by the REST API (no `DELETE`
route on `/api/v1/users/<id>/`) and by every other admin's
`has_delete_permission` returning `False`.

**Documented boundary, not claimed as ERP-wide**: fixing `UserAdmin`'s
authorization does not retroactively give `apps.audit.AuditLog` (the
Task 05 REST-API audit trail) any awareness of edits made through this or
any other Django Admin form — Django's own `LogEntry` remains the only
record of admin-form edits, exactly as already true and documented for
`Company`/`CompanyRole`/etc. since Tasks 02–03. This project does not
have a single, unified, ERP-wide audit trail; it has one application-level
audit trail (`apps.audit`) covering a specific, growing set of REST
service functions, and Django's separate, admin-only `LogEntry` covering
admin-form edits. Neither subsumes the other.

**No code or schema changes were made to the pre-existing Task 06
endpoint/service/serializer implementation itself.** The instruction for
this pass was to review the existing implementation against the intended
requirements and correct *concrete defects*, not to rewrite working code.
Reviewing `apps/companies/views.py`/`services.py`/`serializers.py` and
`apps/permissions/views.py`/`services.py`/`serializers.py` line-by-line
against the requirement list (superuser-only gating, company-scoped
lookup with `404` on mismatch, strict permission-code-list validation via
raw `initial_data` inspection rather than trusting DRF's lenient
`CharField` coercion, atomic `select_for_update()`-locked permission
replacement with no partial writes, inactive-company role restrictions,
no-op audit suppression, audit-inside-the-same-transaction rollback
safety) found the implementation already matched every one of them — the
gap was entirely in verification (no tests), integration surface (no
Postman entries), and record-keeping (no docs), not in the business logic
itself. `tests/test_company_management.py` and
`tests/test_role_management.py` were written to *prove* each of those
requirements against the actual running code rather than assume they held
because the code read correctly — this is the same "treat implementation
as evidence" standard the preceding read-only progress review applied
externally, now applied by writing it into the permanent test suite.

**Postman folders capture every implemented method/path, but their
create/replace bodies still often rely on environment variables the
person running them must fill in from Django Admin first** (e.g.
`new_company_code`, `new_role_code`, `permission_code`), the same
established pattern as Task 05's "Assign company"/"Assign role" requests
needing `company_id`/`role_id` set manually. "Replace role permissions"'s
`permission_code` variable is the one exception that *can* be filled in
automatically — "List permissions"' Tests script captures the first
result's code the same way "My companies" already captures `company_id` —
because a permission catalog entry is something Task 06 already exposes a
`GET` for, unlike a specific company or role you might want to target,
which still has to be chosen deliberately.

# Backend Decisions — Task 07A

## Shared store and store access foundation

**`SharedStore` has no owning-company FK — not nullable, not optional,
structurally absent.** The business requirement is explicit: two
companies use one common physical store, and the store must never be
duplicated per company. A nullable `company` FK, or a `company=NULL`
convention for "shared" stores, would have left the door open for some
future code path to attach a store to one company "just this once" and
silently reintroduce exactly the duplication problem this task exists to
prevent. Store access is deliberately a second, independent axis
(`StoreMembership`) alongside company membership, not a variant or
extension of it — an active user can hold a `StoreMembership` with zero
`CompanyMembership` rows, and the reverse, and neither table is ever
queried by the other's access-resolution function
(`active_stores_for_user()`/`active_companies_for_user()`).

**`StoreRole`/`StoreRoleAssignment` live in `apps.permissions`, not
`apps.stores`, mirroring `CompanyRole`/`MembershipRole`'s placement in
Task 03 exactly, not `apps.stores` "owning" everything under
`/api/v1/stores/...`.** The alternative — grouping strictly by URL
prefix, the way Task 05 put company-membership *management* endpoints
under `apps.users` because that URL prefix (`/users/...`) was already
owned by that app — doesn't apply here: there is no other app that
already owns "store access management" the way `apps.users` already
owned user management. Grouping by *domain concern* instead ("what can
they do" vs "do they have access") keeps the boundary that was already
established in Task 03 for companies fully symmetric for stores, and
keeps the permission-scope-filtering logic (`_replace_role_permission_set`)
next to the `PermissionDefinition` model it filters, rather than
duplicated or awkwardly imported into a second app.

**Adding `scope` to the existing `PermissionDefinition` model, rather
than introducing a second, parallel `StorePermissionDefinition` model.**
The brief explicitly offered both options ("prefer extending the existing
catalog with an explicit scope"). A second model would have meant a
second everything — a second admin registration, a second catalog
endpoint, a second serializer, and critically, no way to guarantee
`code` stays globally unique across both without an extra cross-model
check that a single `unique=True` column already gives for free. The
`scope` field is immutable after creation for the same reason `code` and
`company`/`store` FKs are elsewhere in this codebase: role-permission
relationships already resolve permissions through scope-filtered queries
(`effective_permission_codes`/`effective_store_permission_codes`), so a
permission silently changing scope after roles already reference it would
silently change what those existing role assignments grant, without any
role or role-assignment row itself having been touched.

**Scope is enforced twice — once at write time (service layer) and once
at read time (resolution query) — not once.** The write-time check
(`_replace_role_permission_set` filtering candidate rows by `scope`)
would be sufficient if every write path were guaranteed to go through it.
It is not: Django's M2M `.add()`/`.set()`/`.remove()` never call `clean()`
or run any per-item validation, so `CompanyRole.permissions.add(some_
store_scoped_permission)` succeeds silently at the ORM level regardless
of what the service layer would have rejected. Rather than trying to
close that gap at the write layer (which would require either a custom
M2M manager or giving up on Django's M2M field entirely — real
complexity for a hypothetical write path nothing in this codebase
actually uses), the resolution queries themselves independently filter by
scope, so a wrong-scope permission attached through such a bypass is
inert — never resolved by either lookup — rather than merely "not
supposed to happen." This is the same "defense in depth over closing
every theoretical gap" reasoning already used for `MembershipRole`'s
documented `bulk_create()` limitation in Task 03: `effective_permission_
codes()` stays fail-closed by construction, regardless of how an invalid
relationship was created.

**A code that exists but belongs to the wrong scope is rejected as
"unknown," not with a distinct "wrong scope" error.** Reusing the
existing unknown-code error path (rather than adding a new one) was a
deliberate choice, not a missed opportunity for a clearer message: a
company-role administrator does not need to be told that a permission
code they tried to assign exists, just not for their kind of role — from
their point of view, "not a valid company permission" and "does not
exist" are the same actionable fact ("pick a different code from the
catalog"), and a more specific message would incidentally confirm that a
given code exists somewhere in the system, which is not information this
endpoint needs to leak.

**`replace_role_permissions()` (company) and the new
`replace_store_role_permissions()` (store) share one private
implementation, `_replace_role_permission_set()`, rather than being
independently duplicated the way `CompanyRole`/`StoreRole` themselves
are.** This is the one place in Task 07A where sharing code won out over
the "mirror exactly, don't abstract" approach used everywhere else in
this task (models, most services, most views): the two functions' logic
is not merely similar but identical line-for-line except for which
`scope` to filter by, which `PermissionDefinition` relation the model
uses, and which audit `company`/`store` context applies — parameters, not
structural differences. Duplicating ~50 lines of identical
normalisation/locking/no-op logic across two functions would have meant
any future fix to one (e.g. a change to the no-op comparison) silently
not applying to the other unless someone remembered to change both.
Everywhere else — models, `create_store`/`create_company`,
`activate_store_role`/`activate_company_role`, the view classes — the
mirrored-but-separate approach was kept, because those pairs differ in
which model/FK/related-name they touch structurally, not just in a
handful of parameters.

**Audit gained a `store` FK, not a rename/repurposing of `company`, and
not a fake `Company` row created to stand in for a store.** The brief
explicitly warned against both: "do not misuse company_id" and "do not
create fake company records." A shared "context" FK (e.g. a generic
`related_object` via `ContentType`) was considered and rejected as
premature — it would add real complexity (a `GenericForeignKey`, its own
migration, and a loss of the FK-level `PROTECT` guarantee that both
`company` and `store` individually provide against deleting a row that
still has audit history) to solve a problem this task does not yet have:
there are only two context types so far, and adding a third *at that
point* would be the moment to reconsider, not now. `record()`'s new
`store=None` keyword is purely additive — no existing caller's positional
or keyword usage changes.

**Store CRUD's `PATCH` is allowed regardless of the store's own
`is_active` state, mirroring the exact same, already-documented Task 06
asymmetry for companies.** Role mutations *are* gated by their parent's
active state (a role only means something in the context of a currently-
active store/company); a store's or company's own metadata has no
parent state to be restricted by, and correcting an inactive store's
`name` is a legitimate administrative action independent of whether that
store is currently in active use. This was reused as a settled precedent
from Task 06, not re-litigated.

**`SharedStore`/`StoreMembership`/`StoreRole`/`StoreRoleAssignment` are
registered read-only in Django Admin — `has_add_permission`/`has_change_
permission` unconditionally `False`, even for an active superuser** — a
deliberate difference from `Company`/`CompanyRole`/`PermissionDefinition`/
`MembershipRole` (Tasks 02–03), which remain admin-editable. Those four
older models predate the audit trail (Task 05); making them read-only now
would be a behaviour change outside this task's scope, and Django's own
`LogEntry` was already their only change record before Task 05 existed
either way. The four *new* Task 07A models never had an unaudited write
path to begin with — introducing one now, when an audited REST API
already covers every mutation this task defines, would be adding a new
gap on day one rather than tolerating a pre-existing one. `ReadOnlySuperuserAdminMixin`
(a small addition to `apps.companies.admin`, next to
`SuperuserOnlyAdminMixin`) captures this as a second, reusable variant
rather than one-off method overrides copy-pasted onto four separate
`ModelAdmin` classes.

**Store-scoped nested routes (`/api/v1/stores/<id>/memberships/...`,
`/api/v1/stores/<id>/memberships/<mid>/roles/...`), not user-scoped ones
under `/api/v1/users/...`.** Task 05's company-membership endpoints are
nested under `/users/<id>/memberships/` because that task was framed
around *user* management, with company membership as one attribute of a
user being managed. Task 07A has no equivalent "store management for a
given user" framing — the brief explicitly calls these "store-scoped
membership management" — and there is no pre-existing app that already
owns a URL prefix this needed to nest under, the way `apps.users` already
owned `/users/...` in Task 05. Nesting everything under the store keeps
one consistent mental model for this task's entire URL surface: every
store-related concern (the store itself, its roles, its memberships, its
members' role assignments) hangs off `/stores/<id>/...`, matching how
Task 06 already nested company roles under `/companies/<id>/roles/...`
and simply extending that same pattern one level further, to memberships
too, since stores (unlike companies in Task 05) had no earlier,
narrower-scoped membership API to stay consistent with instead.

# Backend Decisions — Task 07B

## Two documentation corrections, made before any new code

Task 07B's brief explicitly asked for two inaccuracies in the existing
Task 07A write-up to be corrected first, rather than folded silently into
new material.

**"The store must never be duplicated per company" conflated two
different guarantees.** The original Task 07A text read `SharedStore`'s
missing company FK as if it were *what prevents* duplicate store rows.
It is not: omitting the FK achieves company-*independence* (no `Company`
row can claim ownership of a store), but nothing about an *absent*
column stops two present rows from both meaning "the same physical
warehouse." What actually prevents that is `SharedStore.code`'s
database-level `unique=True` constraint, combined with the administrative
discipline of creating exactly one store once (the same discipline
`shared_store.view`'s seeding migration already modelled — provisioned
once, never re-seeded). The corrected text in `docs/backend-tasks.md`
now attributes company-independence and duplicate-prevention to the two
different mechanisms that actually provide each of them, instead of
treating the second as a side effect of the first.

**Task 07A's endpoint counts never distinguished a URL pattern from an
HTTP method+path operation.** Every endpoint table in Task 07A's
write-up already listed rows like `GET,POST /roles/` — correct in
substance, one URL pattern genuinely serving two methods — but informal
summaries of the task (outside the tables themselves) stated "15 new
endpoints" without ever being explicit about which count that was. The
actual, introspected ground truth (queried directly from the live
`django.urls.get_resolver()` output and each view class's
`http_method_names`, not estimated by re-reading the URL file by eye):
**16 URL patterns**, serving **22 distinct method+path operations** (six
of the sixteen patterns each accept two methods at the same path). Both
numbers are now stated explicitly, side by side, in `docs/backend-tasks.md`'s
Task 07A section, and Task 07B's own endpoint count below follows the
same convention from the start rather than needing the same correction
later.

## Shared material catalog and storage locations

**`UnitOfMeasure`/`MaterialCategory`/`Material` got a new app,
`apps.catalog`; `StorageLocation` did not — it was added to the existing
`apps.stores`.** The deciding question, consistent with how Task 07A
itself decided `apps.stores` vs. reusing `apps.companies`, was "is this a
genuinely new domain concern, or a child of one that already has an
app?" A shared, company/store-independent material catalog is new — nothing
in `apps.companies`, `apps.stores`, or `apps.permissions` represents "an
identity any authorized store user can reference regardless of which
store or company they belong to." A storage location, by contrast, is
structurally just another FK child of `SharedStore` with no independent
concern of its own beyond "which store does this belong to" — exactly
the same shape as `StoreMembership`, which already lives in
`apps.stores`. Creating a fifth app for one model with no new concern
would have been introducing structure the brief's own "introduce an app
only where appropriate" explicitly warned against.

**`Material.category` is the one FK in this entire task that is *not*
immutable after creation - a deliberate, asymmetric exception to
"code/kind/base_unit are fixed," not an oversight.** Every other
immutable-after-creation field in this project (company/store codes,
company/store FKs on membership rows, permission scope) protects an
invariant that some *other* row already depends on once established
(e.g. changing a membership's company would strand its role
assignments). A material's category has no such downstream dependent yet
- nothing in this task, and nothing planned, keys off "which category was
this material originally filed under." Re-categorising a material (e.g.
moving it from an ad-hoc category into a newly-created, more specific
one) is an ordinary, expected administrative correction, not a
correctness hazard - so `MaterialUpdateSerializer` allows it, subject
only to the same "must not newly assign an inactive reference" rule
`create_material()` already enforces at creation time.

**The unit/category deactivation-blocked-by-active-dependents rule uses
`400`, not `409`.** REST semantics would support `409 Conflict` for "this
mutation conflicts with the current state of a resource it doesn't even
target" - a real, considered alternative. It was rejected specifically
because introducing a new HTTP status convention this late, when six
prior tasks have used exactly one status code (`400`, via `django.core.
exceptions.ValidationError` → `apps.common.errors.
translate_django_validation_error()`) for every business-rule rejection
without exception, would create an inconsistency a future task would
either have to notice and match, or accidentally diverge from further.
The brief's own wording - "a documented conflict response" - was read as
requiring the response to be *clearly documented and distinguishable by
its message*, not requiring a specific status code; `{"detail": "Cannot
deactivate a unit of measure while active materials reference it."}` at
`400` satisfies that without opening a second status-code convention.

**`apps.common.validation` gained `parse_int_filter()`, a direct sibling
of the existing `parse_strict_bool()`.** Materials' `?category=`/
`?base_unit=` filters needed the identical "reject a malformed value
clearly, don't silently return an empty/broken result" treatment
`parse_strict_bool()` already gives `?is_active=`. Adding one small,
generically-named function to the same shared module it already lives in
was the natural extension, not a new pattern - the two functions read as
one obvious family, not two unrelated additions.

**The shared-catalog read permission (`CanReadSharedCatalog`) checks "any
store," while the storage-location read permission reuses the
already-store-specific `store_user_has_permission()` unchanged.** This
is not an inconsistency - it follows directly from what each resource
*is*. The catalog has no `store_id` in its URL at all (materials, units
and categories are not nested under a store), so the only coherent
question a permission check can ask is "does this user hold
`shared_catalog.view` *somewhere*" - answered by a new selector,
`user_has_permission_in_any_store()`. A storage location, by contrast,
always has a specific store in its URL, so the existing per-store check
from Task 07A already asks exactly the right question with no
modification needed. Introducing a single "any store" selector was
sufficient; there was no reason to also generalise the already-correct
per-store one.

**The storage-location read helper's superuser branch does not check
whether the store itself is active.** Every other superuser "read
regardless of state" precedent in this project (company/store/role
*detail* GETs) already behaves this way - `CompanyDetailView.get()`,
`StoreDetailView.get()` etc. never gate on `is_active` either, since an
administrator inspecting a record is precisely the situation where
seeing an inactive one matters most. `_get_store_for_location_read()`
follows that same precedent for locations rather than inventing a new,
narrower administrative-read rule just for this one resource.

**A real bug was caught and fixed before any test was written against
it: `get_permissions()` returning `[]` for the GET branch of the
storage-location list/detail views.** The intent was "let the view
method itself decide 404 vs. 403 vs. 200, so don't gate on a static
permission class" - but an empty `permission_classes` list bypasses
DRF's `IsAuthenticated` check entirely, meaning an anonymous request
would reach `_get_store_for_location_read()`, where `active_stores_for_
user(AnonymousUser())` correctly returns an empty queryset (deny by
default, per Task 07A), producing a `404` instead of the `401` every
other endpoint in this project gives an anonymous caller. Fixed by
returning `[IsAuthenticated()]` for `GET` instead of `[]` - the
finer-grained 404/403/200 decision still happens inside the view method,
now correctly *after* confirming the caller is authenticated at all.
Caught by re-reading the permission logic before writing tests against
it, not by a failing test - worth recording so the same mistake (an
"empty permission list to defer to view logic" pattern) is not repeated
elsewhere without the same check.

**`MaterialSerializer.category_id`/`category_code` use
`SerializerMethodField`, not `source="category.id"`.** A second real bug,
also caught before tests were written: DRF's dotted-`source` attribute
traversal (`rest_framework.fields.get_attribute()`) only catches Django's
`ObjectDoesNotExist` at each hop, not a plain `AttributeError` - and
`getattr(None, "id")` raises exactly the latter once traversal reaches a
`null` `category` FK. A material with no category would have crashed
serialization (`500`) the moment any endpoint tried to return it, since
`category` is genuinely optional on this model. `SerializerMethodField`
(`get_category_id`/`get_category_code`, both checking `obj.category_id`
before touching `obj.category`) sidesteps the dotted-source traversal
entirely. `base_unit_id`/`base_unit_code` keep the simpler
`source="base_unit.id"` form unchanged, since `base_unit` is a required,
never-null FK - the traversal hazard does not apply there.

# Backend Decisions — Task 08A

## Supplier identity is a shared directory, provisionally - not a client-confirmed rule

`Supplier` has no owning-company or owning-store FK, following the same
reasoning already used twice before: `SharedStore` (Task 07A) and
`Material` (Task 07B). Both companies must be able to reference "the same
supplier" without a duplicate row, for the same structural reason a
warehouse or a raw material identity is not owned by one company. The
brief was explicit that this is a *design decision made for this phase*,
not a business rule anyone has confirmed - which company actually
purchases from a given supplier, whether "shared stock" from a purchase
is jointly owned, and what "qualified to supply" means are all left
completely open. Nothing in the model, the API, or this document treats
the shared-directory shape as more than provisional; `docs/backend-
tasks.md`'s Task 08A section says so explicitly, so a later purchasing
task inherits a clear flag that this decision may need revisiting rather
than a fact quietly baked into the schema.

## A new app, `apps.suppliers`, rather than extending an existing one

The same test Task 07B already applied twice (`apps.catalog` for the new
shared-catalog concept, `apps.stores` for `StorageLocation` as a mere FK
child) applies again here: is this a genuinely new domain concern, or a
child of something that already has an app? A supplier is not a child of
`apps.companies`, `apps.stores`, or `apps.catalog` - it shares none of
their structural shape (it is not a material, not a store, not a
company-membership row) and represents a wholly new concept: an external
party. It got its own app for the same reason `apps.catalog` did in Task
07B, not because "new model implies new app" is a rule - it explicitly
is not one, as `StorageLocation` staying in `apps.stores` already
demonstrates.

## No new permission scope, no reuse of `shared_catalog.view`

The brief was explicit on this point, and it matches how the rest of the
authorization model is shaped: `shared_catalog.view` means "can read the
shared material catalog," a specific, already-shipped concern. Reusing
that same code for an unrelated resource (suppliers) would have made the
permission's name a lie the moment anyone inspected what it actually
gated, and would have made a future "grant catalog read but not supplier
read" (or vice versa) request impossible to satisfy without ripping the
permission back apart. Since Task 08A's supplier management is
superuser-only in every direction (no read exception for any store-
permission holder, unlike the catalog), there is no STORE-scope
permission to seed at all this task - `IsActiveSuperuser` alone is
sufficient, and "operational purchasing access will be designed later"
was taken literally: nothing was invented to fill that gap early.

## Two claims from a prior progress-review report needed correction, not a code fix

Task 08A's brief asked for two specific claims in an earlier progress
report to be checked against actual code:

**"Ordinary company users can manage roles/memberships."** Checking the
actual `permission_classes` on every relevant view (`CompanyRoleListCreateView`,
`CompanyRoleDetailView`, `RolePermissionsView`,
`MembershipListCreateView`, `MembershipDeactivateView`,
`RoleAssignmentListCreateView`, `RoleAssignmentDeactivateView`) shows
every single one is `[IsActiveSuperuser]`, with no `get_permissions()`
override anywhere that would let a company role holder in. This was true
before this task and remains true - the claim was a reporting error (an
overly-loose paraphrase of "an administrator, using their assigned
company role's permissions, manages access" that accidentally implied
the assignee themselves could self-serve), not a regression. Since no
code needed to change, the correction is: (1) the sentence in the prior
report is wrong and should not be repeated, and (2) a small, targeted
regression test class (`tests.test_user_management.
MembershipAndRoleAssignmentAuthorizationTests`, 6 tests) was added
specifically to make this claim falsifiable going forward, including the
sharpest case - a user who genuinely holds an active company role in the
*target's own* company still gets `403` on that target's membership/
role-assignment endpoints, because company business roles and the
administrative management API are, and must remain, entirely separate
concerns.

**"All existing Django Admin changes pass through durable audit."** This
one *is* materially false as a blanket statement, but it describes a
**pre-existing, already-documented condition**, not something this task
introduced or is responsible for fixing. `apps/companies/admin.py`'s own
`ReadOnlySuperuserAdminMixin` docstring says outright: "Company/
CompanyRole/etc. ... predate the audit trail's introduction [Task 05]...
changing their existing admin behaviour was out of scope." Inspecting
every admin registration confirms it: `CompanyAdmin`,
`CompanyMembershipAdmin`, `PermissionDefinitionAdmin`, `CompanyRoleAdmin`,
`MembershipRoleAdmin`, and `UserAdmin` all use `SuperuserOnlyAdminMixin`
(not `ReadOnlySuperuserAdminMixin`) and allow direct `add`/`change`
through Django Admin's default `save_model()`, which never calls
`apps.audit.services.record()`. Only models introduced from Task 07A
onward are admin-read-only. The brief was explicit that this task should
"not claim older editable admin models have service-layer auditing
unless the code proves it" and should "not expand this into a complete
audit-system redesign" - so the correction here is documentation-only:
the inaccurate blanket claim is retracted and replaced with the precise,
per-model boundary above, in `docs/backend-tasks.md`'s Task 08A section.
Retrofitting `Company`/`CompanyRole`/etc. to be admin-read-only (or
audited on save) remains untouched, exactly as scoped.

## Supplier deactivation has no dependency check, deliberately

Unlike `deactivate_unit()`/`deactivate_category()` (Task 07B), which
block while an active `Material` still references them,
`deactivate_supplier()` has no equivalent guard. This is not an
oversight - the brief was explicit ("do not invent restrictions based on
purchase records that do not exist"), and it is also simply true: this
task implements no purchase order, receipt, or any other model capable
of referencing a `Supplier`. Adding a defensive check against a
reference that cannot exist yet would be exactly the kind of speculative
design-for-the-future this project's conventions reject elsewhere.

## Optional-field clearing uses the empty-string convention already established

`SupplierUpdateSerializer` treats an explicit `""` on any optional
contact/address field as "clear this field," identical to
`MaterialCategoryUpdateSerializer.description`'s existing behaviour, and
leaves the field untouched if the key is omitted entirely from the PATCH
body. This was the natural choice, not a new pattern to weigh against
alternatives (e.g. a `null` sentinel) - every optional field on
`Supplier` is a `CharField(blank=True)`, never `null=True`, so `""` is
already the model's own "empty" representation and no dual empty-state
(`""` vs. `null`) needed to be introduced or reconciled. `legal_name` is
deliberately excluded from this convention (it stays a required field
that can never be blanked through this API), matching how `code` on
every other model in this codebase remains non-blankable via its update
serializer.

# Backend Decisions — Task 08B-1

## A `PurchaseRequest`'s `company` means "who needs it," confirmed as narrowly as possible

The client confirmed exactly one thing at this stage: which company a
`PurchaseRequest` belongs to is the company that *needs* the material,
full stop. Everything downstream of that - who eventually places the
Purchase Order, who receives the supplier's bill, who legally owns the
resulting stock - was explicitly *not* confirmed alongside it, and this
task's design goes out of its way not to smuggle an answer to those in
through the back door. Concretely: `PurchaseOrder` (not designed or
built in this task) is never assumed to inherit its `company` from its
source PR's `company` - `docs/purchase-workflow-proposal.md` was updated
to say so explicitly, precisely so that a future reader does not
mistake "the PR-stage question is answered" for "the PO-stage question
is answered too." Keeping the two questions visibly separate, rather
than resolving the second by implication, was the entire point of
confirming the first this narrowly.

## Purchasing gets a stricter authorization shape than the Task 07B shared catalog, deliberately

The shared catalog and storage locations (Task 07B) both give an active
superuser a narrow, read-only administrative exception - "an admin can
look at this without a business membership, but that access grants
nothing else." Purchase Requests get no equivalent exception anywhere:
`apps.purchasing.views._get_company_for_action()` resolves company
access purely through `active_companies_for_user()` +
`user_has_permission()`, exactly the same two functions (and nothing
more) that gate every ordinary company user's own access, with zero
`is_superuser`/`is_staff` branches. This was a deliberate reading of the
brief's "No implicit staff/superuser business bypass" line as a stronger
requirement than Task 07B's "no *business* bypass, but an *admin-read*
bypass is fine" - Purchase Requests are business records belonging to a
specific company from the moment they exist (even in `DRAFT`), not a
shared reference catalog anyone administering the system might
reasonably need to inspect. A superuser who wants to see a company's
purchase requests needs an actual `CompanyMembership` and
`purchase_requests.view` there, same as anyone else - regression-tested
directly (`test_superuser_without_membership_denied`).

## `unit` is a real FK on `PurchaseRequestLine`, but never a client-writable one

Every line stores a genuine `unit_id` (not a computed/joined value at
read time) so that a submitted line's unit is a durable fact even if
`material.base_unit` is later reassigned - but a caller never supplies
it: `apps.purchasing.services._validate_lines()` always derives `unit`
from `material.base_unit` at the moment a line is created or replaced,
and both create/update serializers explicitly reject a client-supplied
`unit`/`unit_id` (`400`, not silently ignored) via the same
`_reject_prohibited_fields` convention `apps.catalog`/`apps.suppliers`
already use. This is the direct, mechanical consequence of "no unit
conversion engine exists" (Task 07B) - if a caller could pick an
arbitrary unit for a line, the system would need a way to reconcile that
unit against the material's own, which does not exist and was not asked
for.

## A DRF nested `many=True` child serializer cannot use `self.initial_data` - a real bug caught before tests were written

`PurchaseRequestLineInputSerializer` originally rejected prohibited
per-line fields (`unit_id`, `price`, etc.) from a `validate()` override
reading `self.initial_data`, mirroring every other prohibited-field
check in this codebase. This crashed (`AttributeError:
'PurchaseRequestLineInputSerializer' object has no attribute
'initial_data'`) the moment any line was submitted: `self.initial_data`
is only ever set inside `Serializer.is_valid()`, on the *outermost*
serializer a view calls directly. A `ListSerializer` (what `many=True`
actually constructs) calls `self.child.run_validation(item)` for each
item directly, bypassing `is_valid()` entirely for the child - so a
nested child instance never has `initial_data` set at all. Fixed by
overriding `to_internal_value(self, data)` instead, which *does* receive
each item's raw dict directly as its `data` argument regardless of
whether the serializer is used standalone or as a list child. Recorded
here because it is a general DRF trap, not specific to purchasing - any
future nested `many=True` input serializer in this codebase should reject
prohibited fields from `to_internal_value()`, never from `validate()`
reading `self.initial_data`.

## The N+1 query budget for the list endpoint is 8, not 1, and that is correct

The list view uses both `select_related` (company/created_by/
submitted_by/cancelled_by - single-valued FKs, joined into the main
query) and `prefetch_related("lines__material", "lines__unit")` (a
to-many relation, which Django cannot join into the main query without
duplicating rows). `prefetch_related` on a nested path issues one query
per hop: one for the lines themselves, one batched query for every
distinct `material` referenced across those lines, one batched query for
every distinct `unit` - three additional queries beyond the base five
(auth lookup, company resolution, permission check, pagination count,
main select), fixed at 8 regardless of how many requests or lines exist
in the result set. The original test asserted 4, an unverified guess
carried over from the shape of Task 07B's simpler (non-nested) materials
list; the actual, measured count is 8, confirmed stable by construction
(every prefetch is `IN (...)`-batched, never per-row) rather than by
re-guessing a smaller number.

## A genuine multi-threaded `TransactionTestCase`, not just sequential idempotency, was needed to prove the locking claim

Every other concurrency-adjacent test already in this codebase (e.g.
`apps.permissions.services.assign_role`'s race-guard) is exercised only
sequentially - call it twice in a row and check the second call behaves
correctly. That proves idempotency, not locking: it says nothing about
what happens when two callers are *actually* inside
`select_for_update()` at the same time, because Django's default
`TestCase` wraps an entire test in one uncommitted transaction, so two
"concurrent" calls in the same test never really contend for a lock at
all. Task 08B-1's brief specifically asked for "a suitable transactional
test for the locking behavior," so `ConcurrentTransitionTests` uses
`TransactionTestCase` (real, separately committed transactions) plus two
real OS threads (each opening and later closing its own DB connection,
synchronised to start together via a `threading.Barrier`) both calling
`submit_purchase_request()` against the same starting `version`. The
result confirms the actual mechanism, not just its observable output:
one thread's `select_for_update()` genuinely blocks the other until the
first commits, and the second then correctly sees the already-bumped
version and raises `Conflict` - exactly one real state transition,
never two, never a lost update.

# Backend Decisions — Task 08B-2 design update (documentation only)

No code, migration, or permission was changed for this update - it
records three newly confirmed business decisions, two still-open
questions, and one concrete mismatch found by inspecting Task 08B-1's
already-shipped code against the new rules. `docs/purchase-workflow-
proposal.md`'s Task 08B-2 section carries the full design write-up; this
entry records the reasoning behind the choices made while updating it.

## Self-approval is an identity check, not a permission - and cannot be a permission

Confirmed decision 1 ("a requester must not approve their own request")
does not fit the permission model this codebase already has.
`purchase_requests.approve` (proposed) can only ever answer "may this
user decide on requests in this company" - permissions in this system
are never scoped to "except your own resource," and inventing a
per-object permission mechanism just for this one rule would be a much
bigger change than the rule itself warrants. The proposal instead
specifies a plain identity comparison (`actor.id != purchase_request.
created_by_id`) evaluated in the service layer, after the permission
check, with **no exception for any role, permission, or Django flag** -
explicitly including `is_superuser`, since Task 08B-1 already
established that superuser status grants zero business access on this
resource, and this rule's own wording ("even if... is a superuser")
would otherwise be trivially violated by the one flag this codebase has
spent three tasks (07B, 08A, 08B-1) deliberately keeping out of business
authorization.

## "Admin" is deliberately left unmapped, not defaulted to `is_superuser`

The brief was explicit and repeated: business "Admin" is not
`is_superuser`. This is worth stating plainly because it would have been
the easy, wrong shortcut - `IsActiveSuperuser` already exists, is
already used throughout this codebase for administrative gating, and
reusing it here would have been a two-line change instead of an open
question. It was not reused, because doing so would silently answer
still-open question 1 (which company role/permission actually carries
"Admin" authority) with an answer nobody confirmed, and would conflate
two concepts this codebase has kept separate since Task 05: Django-
Admin-access administration (`is_superuser`) versus business/company
authority (permissions held via a company role). Nothing in `docs/
purchase-workflow-proposal.md` proposes a permission code for "Admin" -
the section explicitly says so, twice, so a future implementer does not
reach for `IsActiveSuperuser` as a convenient default.

## Reject-then-resubmit forced a design change: a history table, not header fields

The original Task 08B-2 proposal (before this update) suggested plain
`decided_by`/`decided_at`/`rejection_reason` fields on `PurchaseRequest`
itself, mirroring `submitted_by`/`cancelled_by`. That design assumed a
purchase request only ever gets decided once. Confirmed decision 2
(reject → revise → resubmit) breaks that assumption directly: a second
rejection would overwrite the first round's reason and actor in those
same fields, which is exactly what "preserve previous submissions,
rejection reasons, actors and timestamps; do not overwrite decision
history" forbids. The proposal was revised to an append-only
`PurchaseRequestApproval` history table (one row per decision, a
`cycle` counter to distinguish rounds) instead - the same "thin,
purpose-built table for business data a screen needs to show, distinct
from `AuditLog`" reasoning the very first version of this document
already used for approval history in section 3.1, now made necessary by
the confirmed rule rather than offered as one option among several.

## The `revise` transition reopens the same row - it does not create a new request

Confirmed decision 2 says a rejected request "may be revised and
resubmitted," not "may be resubmitted as a new request." The proposal
keeps the same `id`/`reference` through every round (`REJECTED` →
`DRAFT` via a new proposed `revise` transition, then the existing
`PATCH`/`submit` endpoints unchanged) rather than creating a fresh
`PurchaseRequest` row per attempt. This was the natural reading of
"revise" (edit the existing thing) versus "resubmit as new" (which
the brief did not say), and it is also what makes the append-only
decision-history table meaningful - one row's full history is legible
as a single timeline only if it stays one row.

## A confirmed mismatch was reported, not fixed

Re-reading `apps.purchasing.views.PurchaseRequestCancelView` and
`apps.purchasing.services.cancel_purchase_request` against confirmed
decision 3 (cancelling a `SUBMITTED` request requires Admin) found that
today's shipped code treats `DRAFT` and `SUBMITTED` cancellation
identically - `purchase_requests.cancel` alone is sufficient for either.
This is a genuine gap against the newly confirmed rule, not a
hypothetical one. It was not fixed in this update, for the same reason
"Admin" was not mapped to `is_superuser` above: closing this gap
requires knowing which company role/permission "Admin" actually is
(open question 1), and guessing an answer to fix code faster would be
exactly the "silently change permissions or assume an Admin role
mapping" this task's own instructions ruled out. The mismatch is
recorded in `docs/purchase-workflow-proposal.md`'s Task 08B-2 section
so it is not lost before the next implementation task picks it up.
Cancelling a `DRAFT` request is unaffected - that policy was never part
of the newly confirmed rule and remains exactly as Task 08B-1 shipped
it.

# Backend Decisions — Task 08B-2

The design-only update above proposed the shape; this task built it. The
client's implementation brief resolved both previously-open questions
directly (three sequential steps, "Business Admin" = holder of a new
`purchase_requests.approve` permission, neutral Step 1/2/3 labels - the
earlier Store Manager/Purchase Manager/Director illustration was not
adopted) and added one new instruction this document had not yet
considered: a provisional restriction against the same Admin deciding
more than one step per round. What follows records the decisions made
while turning that brief into code - not the business rules themselves,
which are recorded in `docs/backend-tasks.md`'s Task 08B-2 section.

## A new `Forbidden` exception, because one permission check cannot live at the view layer

Every permission check in this codebase, without exception until now,
happens at the view layer before any row is touched - see `apps.
purchasing.views._get_company_for_action` and its equivalents in every
other app. Cancellation breaks that pattern on purpose: which permission
a caller needs (`purchase_requests.cancel` for `DRAFT`, `purchase_requests
.cancel_pending` for `SUBMITTED`) depends on the request's *current*
status, and that status can change between an unlocked view-layer read
and the locked mutation moments later - a concurrent submit could move a
request from `DRAFT` to `SUBMITTED` in that window. Deciding the required
permission from the pre-lock read would silently reopen the exact
authorization gap this task exists to close: a caller holding only the
old `purchase_requests.cancel` could win the race and cancel a request
that had, by the time the transaction actually ran, become `SUBMITTED`.

The fix moves the authoritative check inside `apps.purchasing.services.
cancel_purchase_request`, after `select_for_update()` has locked the row,
where the status being checked is guaranteed not to change out from under
the decision. Since no prior service in this codebase needed to reject a
request for authorization reasons - that was always the view's job - a
new `apps.common.errors.Forbidden` (403) exception was added, mirroring
how `Conflict` (409) was added in Task 08B-1 for the one case that needed
it then. Its docstring says plainly that this is a deliberate, narrow
exception, not a precedent for moving permission checks into services
generally - every other action in this task (approve/reject/revise) has
a permission requirement that does *not* depend on mutable state, and
stays entirely at the view layer, unchanged from every prior task's
pattern. The view still does a cheap pre-check (requiring at least one of
the two cancel permissions) before ever touching the database, purely to
fail fast for a caller who holds neither - that pre-check is an
optimization, not the authorization boundary; the service's post-lock
check is.

## The self-decision ban was extended to `reject`, not just `approve` - a judgment call, flagged as one

The brief's own wording ("no requester may approve their own request")
names approval specifically. This implementation bans a requester from
*deciding* their own request at all - rejecting it too - reasoning that
the actual protected property is independent review: letting a requester
reject their own request still means the review of that request was not
independent of the person who filed it, even though rejecting confers no
direct benefit to the requester the way self-approval would. This reading
is an extension of the literal brief, not a restatement of it, and is
called out as such in three places: the docstring on `apps.purchasing.
services._reject_if_self_or_repeat_decider` (the function both approve
and reject call), the permission seed migration's description text, and
`docs/backend-tasks.md`'s Task 08B-2 section - so a reader who disagrees
with this extension can find and revisit it without re-deriving the
reasoning from the code alone.

## The provisional distinct-approver-per-step check reuses the decision history, not a new "who has decided what" table

"Require a different eligible Admin at each step... document this as a
provisional restriction" was itself part of this task's brief, not a
judgment call - but *how* to check it was an implementation decision.
Rather than add a new table or a field tracking "which admins have acted
on this round," `approve_purchase_request`/`reject_purchase_request`
query the existing `PurchaseRequestApproval` rows for the current round
directly (`round.decisions.filter(actor=actor, decision__in=[APPROVED,
REJECTED]).exists()`) - the append-only history table built for a
different reason (preserving decisions across reject/revise/resubmit
rounds) turned out to already contain exactly the fact this check needs.
This keeps the restriction easy to relax later if the client confirms
same-admin-multi-step is fine after all: the check is one filtered
`.exists()` call in two functions, not a schema change, so removing it
(or loosening it to "not the immediately preceding step" or any other
shape) touches no migration.

## Two permanent snapshot tables, not one, because a round's header and its lines have different overwrite risks

`PurchaseRequestApprovalRound` (header: `required_by_snapshot`/
`notes_snapshot`) and `PurchaseRequestApprovalRoundLine` (one row per
line) are separate models rather than one row with a JSON blob of lines,
matching this codebase's existing preference (`PurchaseRequest`/
`PurchaseRequestLine` are already two tables, not one with an embedded
line array) for the same reasons: a relational per-line row can carry its
own `UniqueConstraint`/`CheckConstraint`, is directly queryable/orderable
without unpacking JSON, and mirrors `PurchaseRequestLine`'s own shape
closely enough that copying one into the other at submit time is a
straight field-for-field copy, not a serialization step. Both are
necessary as a *separate* copy from the live `PurchaseRequest`/
`PurchaseRequestLine` rows specifically because those live rows are not
protected the way a closed round needs to be: `update_purchase_request`
deletes and recreates every `PurchaseRequestLine` on any line edit
(Task 08B-1's existing, unchanged behaviour), and a reject → revise →
edit → resubmit cycle runs exactly that deletion against content a
closed, `REJECTED` round must still be able to show verbatim. Without the
separate copy, editing a draft after rejection would silently rewrite
what the rejected round is shown to have contained.

## The round/step match on approve/reject is deliberately stricter than submit/cancel's idempotent-retry convention

Every other stateful action in this codebase (submit, cancel, and now
revise) treats "caller supplies the version the resource is already at"
as a safe idempotent no-op - see Task 08B-1's retry semantics table.
`approve_purchase_request`/`reject_purchase_request` deliberately do not
follow that convention: they have no idempotent branch at all, and treat
*any* mismatch among `expected_version`/`expected_round`/`expected_step`
as a hard `409`. This is not an oversight - it follows directly from what
"idempotent" would have to mean for a decision. Submitting is idempotent
because its target state (`SUBMITTED`) does not change on a second call;
approving is not, because its effect ("advance the currently pending
step") means something different depending on *which* step is currently
pending - a second call that happens to supply a version that now matches
(because the first call already succeeded and moved the state forward)
would, without the round/step check, silently approve a *different* step
than the caller believed they were deciding. Requiring an exact
round/step match, not just a version match, turns that silent
misapplication into an explicit `409` the caller must resolve by
refetching and looking at what actually happened - this was the brief's
own instruction ("so a retried decision cannot accidentally approve the
next step"), and the no-idempotent-branch design is what makes it hold.

## The existing-data migration was tested against the live app registry, not a historical one

`purchasing.0003_migrate_existing_submitted_requests_to_round_one`'s
`RunPython` functions are tested by importing the migration module
directly (`importlib.import_module()`, since a migration's filename
starts with a digit and cannot be reached through a normal `from ...
import` statement) and calling them with `django.apps.apps` - the live,
current model registry - rather than pulling in a third-party
migration-testing package (none was already a dependency of this
project) or hand-building a historical-app-registry harness through
`MigrationExecutor` for one small, self-contained data migration. This is
a deliberate scope decision, not an oversight: it tests the exact same
function the real migration runs, and every field that function touches
still exists, unrenamed, on the current models, so nothing about using
the live registry instead of a frozen historical one changes what the
test actually proves. It would stop being adequate if a *later* migration
ever renamed or removed one of the fields this migration touches - at
that point the live-registry shortcut would need to become a real
historical-state test, but introducing that machinery now, for a
migration with no such risk yet, would be exactly the kind of
premature-abstraction this project's own conventions argue against.

# Backend Decisions — Task 08C-1

## "PO company = PR company" was chosen because it changes the least, not because it is confirmed correct

Two companies sharing one physical store leaves a genuine open question
- which company legally places and pays for a Purchase Order - that
this task was never handed an answer to. Two shapes were available:
invent some cross-company purchasing/ownership model now, or pin a
PurchaseOrder's company to its source PurchaseRequest's company and
refuse cross-company purchasing outright until the client actually
resolves the question. The second was chosen, and written up as a
proposal requiring client review (`docs/purchase-order-proposal.md`),
for the same reason "Admin" was left unmapped in Task 08B-2 rather than
defaulted to `is_superuser`: guessing an answer that happens to look
plausible is worse than an explicit, documented "not supported yet,"
because a wrong guess would have to be silently unwound later, while an
explicit restriction only has to be relaxed. Fixing `company =
source_purchase_request.company` (enforced in `PurchaseOrder.clean()`,
not just at creation) also means that whatever the eventual answer turns
out to be, every PurchaseOrder created under this restriction remains
correctly attributed - the fix, when it comes, adds a new capability
rather than correcting a wrong one.

## Locking the source PurchaseRequest, not the PurchaseOrder table, is what makes "one active PO per request" race-safe

The naive way to enforce "at most one non-cancelled PO per request"
would be to check-then-insert without any lock, relying on the database
`UniqueConstraint` alone to reject the loser of a race with an
`IntegrityError`. That works, but surfaces as a raw, unfriendly
`IntegrityError` translated into a generic `500` unless every call site
remembers to catch it - fragile, and inconsistent with how every other
"can't do this twice" rule in this codebase is presented to a caller
(`apps.purchasing.services.cancel_purchase_request`'s idempotent-vs-
conflicting-reason handling, for one). Instead, `create_purchase_order`
locks `source_purchase_request` itself (`select_for_update()`) for the
whole transaction *before* checking whether an active PO already exists
- so the second of two concurrent callers blocks until the first's
transaction resolves, then makes its "does an active PO already exist"
check against genuinely up-to-date state and gets a clean, ordinary
`400` business-rule rejection, never a raw `IntegrityError`. The partial
`UniqueConstraint` on `PurchaseOrder.source_purchase_request` is kept
anyway, as the database-level backstop this project uses everywhere a
lock-based invariant could hypothetically be bypassed (compare
`PurchaseRequestApproval`'s `UniqueConstraint(round, step)` in Task
08B-2) - it is not what does the day-to-day race-prevention work here;
the lock is.

## `unit_price` starts at zero, not blank, and not copied from anywhere

`PurchaseRequestLine` never carries a price - Task 08B-1 established
purchasing requests as an internal-need document with no supplier, price,
or spend-authorization concept at all - so there is nothing for
`create_purchase_order` to copy a starting price from. Two options
existed: leave `unit_price` nullable until someone fills it in, or
default it to `0` (and `line_amount` to `0` alongside it) so a freshly
created PurchaseOrder is always immediately well-formed and
serializable, just not yet priced. The second was chosen - a `null`
price would need every consumer of this API (this task's own serializer
included) to handle "no price yet" as a distinct state from "priced at
zero," for a distinction that is only ever true for the few seconds
between creating a draft and editing its first line, and `0` is already
a value `unit_price`'s own `CheckConstraint(unit_price >= 0)` treats as
perfectly valid - it is not being smuggled in as a magic sentinel.

## Currency rounding: ROUND_HALF_UP was picked explicitly, not left to Python's default

Python's `Decimal.quantize()` defaults to `ROUND_HALF_EVEN` (banker's
rounding) if no `rounding` argument is given - mathematically
defensible, but not what a business user entering a unit price expects
when a line amount lands exactly halfway between two cents (they expect
"round 0.5 up," not "round to even"). Task 08C-1's brief explicitly
asked for "documented currency rounding," so `_compute_line_amount`
passes `rounding=ROUND_HALF_UP` explicitly rather than relying on
whatever Python's default happens to be - a deliberate, visible choice
in one place (this function, called from both `create_purchase_order`
and `update_purchase_order`, so every line amount in this task is
rounded identically) rather than an implicit one a future reader would
have to go look up in the standard library to even notice.

## A missing-permission `403` was chosen over folding it into the source request's `404`

Creating a PurchaseOrder requires `purchase_requests.view` in addition to
the two `purchase_orders.*` permissions, because the create call reads a
PurchaseRequest the caller must actually be allowed to see. Two ways
existed to enforce this: fold a missing `purchase_requests.view` into the
same `404` used for a nonexistent/cross-company source request (so a
caller could never distinguish "you can't see purchase requests" from
"that request doesn't exist here"), or check it explicitly at the view
layer, alongside the other two permissions, before ever touching the
database, and let it produce an ordinary `403` naming what is missing.
The second was chosen, matching every other multi-permission check in
this project (e.g. `purchase_requests.view` **and** `purchase_requests.
create` for the equivalent PurchaseRequest-create case in Task 08B-1) -
`purchase_requests.view` here plays the same "always required alongside
a mutation permission" role that pattern already established, not the
different "does this specific object exist and are you allowed to know
that" role the source-request lookup's `404` plays. Conflating the two
would have made a completely-unauthorized caller (missing all three
permissions) and a caller who legitimately cannot see one specific
request indistinguishable from each other, which is not the ambiguity
this project's `404`-folding convention exists to provide - that
convention protects the *existence* of a specific record, not a
caller's blanket lack of any purchasing-request access at all.

# Backend Decisions — Task 08C-2

## Issuing gets one permission, not a workflow, because nothing asked for a second decision-maker

Task 08B-2 built a genuine three-step approval round for PurchaseRequest
- self-decision ban, provisional distinct-approver-per-step rule,
append-only decision history. Task 08C-2's brief for issuing a
PurchaseOrder was explicit that this should **not** be copied: "a user
explicitly assigned company-scoped `purchase_orders.issue` may finalize
a PO... this is not a new multi-step commercial approval workflow." That
instruction was followed literally rather than reused-by-habit: issuing
checks exactly one permission, has no self-decision restriction (the
drafter can issue their own draft), and needs no decision-history table
- a plain `issued_by`/`issued_at` pair on the header, plus the audit
log, is the complete record of who decided and when. Building the
heavier PurchaseRequest-style machinery here anyway - because it already
existed and was easy to copy - would have quietly answered a business
question ("does issuing a PO need a second approver?") the brief
explicitly said not to answer.

## The currency allowlist exists because the rounding code cannot honestly claim more

`_compute_line_amount` was written in Task 08C-1 with a single hard-coded
rounding rule: exactly 2 decimal places, `ROUND_HALF_UP`. That rule is
correct for the overwhelming majority of real currencies, but not for
all of them - a 0-decimal currency (Japanese yen) or a 3-decimal one
(Kuwaiti dinar) would get a value that is not just imprecise but
actually wrong under that same fixed rounding. Task 08C-1 already
accepted this by only shape-checking `currency_code` (three letters) at
draft time, never claiming real-world correctness - draft amounts are
provisional anyway, always `0` until someone prices a line. Issuing is
different: it is meant to be the point a purchase order becomes real, so
letting an uncorroborated three-letter code through the same shape check
at that moment would have been a quiet, specific claim ("this amount is
right") the code cannot actually back up for every currency. The
allowlist (`_SUPPORTED_ISSUE_CURRENCIES`) makes the actual scope of that
claim explicit and small instead of implicit and total - four
currencies, chosen because they are common and because 2-decimal
rounding is unambiguously correct for all four, not because a longer
list would have looked more complete. Extending it is a one-line change
whenever a currency with the same 2-decimal shape needs to be added;
supporting a currency with a *different* decimal-place convention would
require `_compute_line_amount` itself to stop being one fixed rule,
which is out of scope for this task to invent unprompted.

## Zero-price rejection is an issue-time gate, not a schema change

`PurchaseOrderLine.unit_price` already allows `0` as a valid value (its
own `CheckConstraint` is `>= 0`, not `> 0`) and defaults to it - Task
08C-1 needed that, since a freshly copied line starts with no price
information at all. Task 08C-2's brief asked specifically to "reject
issue if any line price is zero... label free-of-charge purchasing as
deferred; do not change existing draft-price behavior." Two ways existed
to enforce a positive-price rule: tighten the model's own constraint to
`> 0`, or check it only inside `issue_purchase_order`. The model was
deliberately left alone - tightening the constraint would have made `0`
an invalid *draft* value too, breaking the very default Task 08C-1 relies
on and directly contradicting "do not change existing draft-price
behaviour." The check belongs to the transition, not the shape of the
data, the same way `expected_delivery_date`'s presence is required only
at issue and remains optional on a `DRAFT`.

## Company/Supplier snapshot fields were chosen by "what the model actually has," not by what a purchase order document would ideally contain

`PurchaseOrderIssueSnapshot` snapshots exactly three `Company` fields
(code, legal name, display name) and all twelve `Supplier` fields. Company
in particular gets far fewer snapshotted fields than a real business
would expect a purchase order to carry (no address, no tax ID, no bank
details, no signatory) - not because those facts do not matter, but
because `apps.companies.models.Company` has never had them: Task 05
defined `Company` with exactly `code`/`legal_name`/`display_name`/
`is_active`, and no later task has added to it. The brief for this task
was explicit - "do not invent unavailable company addresses, tax IDs or
business data" - so the snapshot's field list is a direct mirror of
`Company`'s own field list, not of what a printed purchase order would
ideally show a supplier. If the client needs a fuller company profile on
issued purchase orders, that is a prerequisite change to `Company`
itself, in a separate task, not something this task's snapshot model
should quietly stand in for by inventing fields with no source of truth
behind them.

## `cancel_purchase_order` needed a real code fix, not just a new docstring, once `ISSUED` existed

Before this task, `PurchaseOrder` had exactly two statuses, and
`cancel_purchase_order`'s logic exploited that directly: after handling
the "already `CANCELLED`" case, the code assumed whatever remained must
be `DRAFT`, without checking. That assumption was true when it was
written and became false the moment `ISSUED` was added as a third
status - silently, with no test failure to announce it, because nothing
before this task ever put a `PurchaseOrder` in a status other than
`DRAFT`/`CANCELLED` for that code to see. This was caught by re-reading
`cancel_purchase_order` specifically because the brief asked for issued-
PO cancellation to be rejected, not by a failing test written after the
fact - the fix (an explicit `status != DRAFT` check) was written before
the regression test that proves it, not the other way around, and the
docstring was updated at the same time to stop describing the old,
now-incorrect "only two statuses" reasoning. `update_purchase_order` was
checked too and found already safe - it always compared `status` against
`DRAFT` explicitly, never inferred it from what `status` was *not*, so
it needed no equivalent fix.

## Permission-catalog test brittleness was fixed at the pattern level, not patched again

`test_scope_filter_company` broke in Task 08B-1, was fixed by editing
its hardcoded expected set, broke again in Task 08B-2 from the exact
same cause, and was fixed the exact same way - edit the set again. It
broke a third time in this task, and this time a *second*, different
test broke alongside it (`test_search_filters_by_code_or_name`, via a
substring collision between `orders.view` and the new
`purchase_orders.view`) - a second module hitting the same root cause
was the concrete signal that patching the symptom a third time would not
be the last time either. Both tests were rewritten to check the
*property* their endpoint actually promises (a scope filter returns
exactly that scope's rows and none of the other scope's; a search
returns rows that genuinely contain the search term) by comparing
against the database's own filtered rows, instead of a hardcoded
enumeration of every code anyone has ever seeded. This means neither
test needed to be touched again as part of this same task despite four
more permission codes being added in it (`purchase_orders.issue` plus
the three from Task 08C-1 already having caused the second failure) -
the fix was verified by the fact that adding those codes did not require
also editing these two tests, which would not have been true under the
old pattern.

# Backend Decisions — Task 09A

## A receipt line points at the issue-time snapshot, not the live PurchaseOrderLine, because the snapshot is the actual fact being received against

`GoodsReceiptLine.source_po_line` is a `PROTECT` FK to
`PurchaseOrderIssueLineSnapshot` (Task 08C-2's permanent, never-updated
record of what was actually ordered and finalized), not to the live
`PurchaseOrderLine`. Both would have worked mechanically - a live
`PurchaseOrderLine` is itself already immutable once its order is
`ISSUED` (no API edits it past `DRAFT`). The snapshot was chosen anyway
because it is the *reason* that immutability exists: the issue snapshot
is the document this codebase already treats as the authoritative,
permanent record of the commercial commitment, and receiving is
fundamentally "did the thing we committed to arrive." Pointing at the
live line would have meant receiving's own source-of-truth reference
technically depended on a row this project's own conventions treat as
"already superseded by its snapshot" the moment issuing happens -
correct today only because nothing currently mutates a `PurchaseOrderLine`
after issue, not because the reference itself asserts permanence the way
pointing at the snapshot does.

## Why no uniqueness ties one PO line to one receipt line

Every other line-snapshot relationship in this codebase so far has been
exactly 1:1 - one `PurchaseRequestApprovalRoundLine` produces exactly one
`PurchaseOrderLine` (`UniqueConstraint(purchase_order, source_round_line)`,
Task 08C-1). Receiving breaks that pattern deliberately:
`GoodsReceiptLine` carries no equivalent constraint on `source_po_line`,
because the brief explicitly requires supporting multiple lots for one
PO line - two different supplier batches of the same ordered material
arriving together is a normal physical event, not an edge case to
reject. Copying the earlier 1:1 pattern here without checking whether it
still applied would have silently made a real, expected scenario
impossible.

## The over-receipt check locks the PurchaseOrder, not the PurchaseOrderLine or the GoodsReceiptLine rows being summed

`post_goods_receipt` takes `select_for_update()` on the source
`PurchaseOrder` - a coarser lock than strictly necessary for a single
line, extending Task 08C-1's own `create_purchase_order` reasoning
(locking the parent to serialize every child mutation against it) one
level further. A finer-grained lock (per PO line, or per the specific
`GoodsReceiptLine` rows being summed) was considered and rejected: this
task's own aggregation deliberately spans *every* `GoodsReceipt`, every
store, and every lot for a given PO line, so the set of rows that must
stay consistent during the check is not known in advance of running the
query - there is no single row to lock that would correctly guard "every
receipt anyone might be concurrently posting against this same line."
Locking the PurchaseOrder itself sidesteps that entirely: every posting
attempt against any of its lines must acquire the same lock first, so
the summation any winning transaction performs is always against
genuinely final state, with no separate mechanism needed to enumerate
what else to lock.

## Company and store access checks both fold failure into 404 - the same reasoning, applied twice, not a new rule

`_get_accessible_purchase_order`/`_check_receipt_company_access` return
`404` (not `403`) when a caller has store access but lacks
`purchase_orders.view` in the specific company involved - deliberately
mirroring `_get_company_for_action`'s own "membership-and-permission
absence for a specific object folds into 404, so existence is never
confirmed to someone without access" convention (Task 07B), applied here
across a second, independent axis instead of a new one. The one place
this task departs from a pure mirror: a caller with **zero store
membership at all** still gets `404` from `_get_store_for_action`
(consistent with every store-scoped view in this project), while a
caller who **has** store membership but lacks the specific
`receiving.*` permission gets an ordinary `403` naming what is missing -
membership itself is not in question there, only the permission is,
which is exactly the distinction `_get_company_for_action` already
draws for company access and this task reuses unchanged.

## `idempotency_key` is scoped to this one endpoint, not generalized project-wide

Every `create_*` function in this codebase before Task 09A is explicitly
documented as non-idempotent - two identical `POST` calls always create
two separate rows (see Task 08B-1's `create_purchase_request` docstring,
still accurate for every document type except this one). This task's
brief specifically asked for retry-safe creation for `GoodsReceipt`
alone, not for a general project-wide idempotency convention, so
`idempotency_key` was added only to `GoodsReceipt` and its own create
service - not lifted into a shared base/mixin other `create_*` functions
would inherit. Generalizing it now would mean guessing at a
project-wide idempotency policy nobody asked for (does `PurchaseRequest`
creation need retry-safety? `PurchaseOrder`? Nothing in any prior task's
brief suggested so) - narrow, task-scoped support was chosen over a
speculative shared abstraction, consistent with this project's
established preference for building exactly what was asked rather than
the most general version of it.

## The idempotency-key collision retry uses the failed constraint's name, not a string-matched error message

`_create_header_with_unique_reference` (this task's version) must tell
apart two different `IntegrityError` causes on the same `INSERT`: an
extremely unlikely `reference` collision (safe to retry with a fresh
reference, mirroring every prior `_create_header_with_unique_reference`
in this codebase) versus a genuine concurrent race on `idempotency_key`
(never safe to retry blindly - retrying with a new reference would just
exhaust the attempt budget while never resolving the actual duplicate-key
problem, since the same `idempotency_key` would collide again on every
attempt). Distinguishing them by inspecting `exc.__cause__.diag.
constraint_name` (psycopg's own structured diagnostic, naming exactly
which constraint fired) was chosen over matching the exception's string
message, which was already known to be fragile - see Task 08C-1's own
`_create_po_header_with_unique_reference`, which considered and rejected
the same string-matching approach for a similar reason, and this task
follows through on using the more robust structured lookup where the
need actually arose for real.

# Backend Decisions — Task 09B-1

## Identity is the receipt line, not the supplier's lot text

`IncomingInspection.receipt_line` is a `PROTECT` FK to `GoodsReceiptLine`
itself, not a lookup keyed by `lot_reference`. The brief was explicit:
"use the receipt-line ID as identity, not the supplier's lot text - do
not merge different receipts just because their lot references match."
A `GoodsReceiptLine`'s own primary key is already a precise, permanent
identity once its parent receipt is `POSTED` (Task 09A's own immutability
guarantee), so there was no reason to invent a second, weaker identity
scheme keyed by a free-text field two unrelated deliveries could easily
share (or both leave blank).

## Why the company-axis access check is bare membership, not `purchase_orders.view`

`apps.receiving`'s own company-axis check requires `purchase_orders.view`
specifically - a deliberate choice, documented in Task 09A, that a
receiving clerk needs to be able to see the purchase order they're
receiving against. This task's brief drew a different, explicit line:
"do not require QC users to hold purchasing-price access." Reusing
`purchase_orders.view` here would have quietly forced every QC user to
also gain visibility into supplier prices and order totals through the
*purchasing* app's own endpoints - a real permission leak, not a neutral
default. `_check_company_membership` (apps.quality.views) therefore checks
only `active_companies_for_user(user).filter(pk=company.id).exists()` -
bare membership, no permission code at all - which is a genuinely
different shape from every other company-axis check in this project, and
is called out as such in both the view's own docstring and
`docs/incoming-qc-proposal.md`, not left to look like an oversight.

## Why `store`/`company`/`material`/`unit` are stored as snapshot fields on `IncomingInspection`, not read through `receipt_line`

`GoodsReceiptLine`'s own material/unit/company/store are already
permanently immutable once its parent receipt is `POSTED` (Task 09A), so
reading them through the FK at request time would have been equally
correct. Snapshot fields were still copied onto `IncomingInspection`
itself at creation, for two concrete reasons, not just habit: (1) it
matches this codebase's one consistent convention at every other step of
the purchasing/receiving chain (`PurchaseRequestLine` -> `PurchaseRequest
ApprovalRoundLine` -> `PurchaseOrderLine` -> `PurchaseOrderIssueLineSnap
shot` -> `GoodsReceiptLine`, each one copying rather than deep-joining);
(2) it lets `?material=<id>`/`?receipt=<id>` list filters and the detail
serializer avoid a multi-level join through `receipt_line -> goods_receipt
-> source_purchase_order` on every request. `lot_reference_snapshot` in
particular is copied through exactly as found - if the source was blank,
the snapshot stays blank; nothing here ever fabricates a lot reference
the receiving clerk never actually recorded.

## The `_HEADER_PROHIBITED` bug: create and update need genuinely different prohibited-field sets

The first implementation of `apps.quality.serializers` used one shared
`_HEADER_PROHIBITED` set for both `IncomingInspectionCreateSerializer`
and `IncomingInspectionUpdateSerializer`, copying the pattern from
`apps.receiving.serializers` without checking whether it actually fit.
It did not: `receipt_line_id` is the one field `POST` genuinely requires
(how else would a caller say which receipt line this inspection is for?),
but the shared set banned it outright, so every legitimate create call
failed with a confusing "this field cannot be set" `400`. This is the
same shape of bug Task 08C-1 hit with `PurchaseOrder`'s own prohibited-
field sets (`lines` wrongly carried into both create- and update-
prohibited via a naive set union) - caught here the same way, by the
test suite actually exercising a real create call rather than only
checking the prohibition logic in isolation. Fixed by building
`_HEADER_ALWAYS_PROHIBITED` as the genuinely shared base, then deriving
`_HEADER_CREATE_PROHIBITED` (equal to the base - `receipt_line_id` is
legitimate at create) and `_HEADER_UPDATE_PROHIBITED` (the base plus
`receipt_line`/`receipt_line_id`, since the field becomes immutable the
moment an inspection exists) independently, rather than unioning one
into the other and hoping nothing included belongs on only one side.

## The demo-seed idempotency bug: a credentials file must never be overwritten with nothing

Outside this task's own backend code, but discovered and fixed the same
session while preparing the Task 09B-1 demo: `seed_demo_data`'s first
version always rewrote its credentials file on every run, including an
idempotent rerun that created zero new users - overwriting a prior run's
real, still-needed passwords with an empty list. The eight demo
passwords generated on the very first run were lost this way and had to
be recovered by resetting them directly. Fixed by only ever writing the
credentials file when there is something new to record; an idempotent
no-op run now explicitly reports that any earlier credentials file was
left untouched, rather than silently destroying it. This is recorded
here, not just fixed silently, because it is exactly the kind of "quiet
data loss disguised as a successful idempotent run" bug this project's
own testing discipline exists to catch.

# Backend Decisions — Task 09B-3A

## Why the retest quantity rule needed a per-round `assessed_quantity`, not a single inspection-level total

Task 09B-2's original design checked every `IncomingInspectionRound`'s
`accepted_quantity + rejected_quantity + retest_hold_quantity` against
the inspection's full `received_quantity_snapshot` - including a retest
round, which only ever has the prior round's held-back remainder to
actually work with. Following that rule literally would have forced a
retest round to somehow "re-find" the full original quantity, effectively
letting it re-litigate whatever the first round had already finally
accepted or rejected. The fix gives each round its own `assessed_
quantity`: round 1's is the full snapshot, a retest round's is exactly
its predecessor's `retest_hold_quantity`, copied once and never
recomputed. This is a design-document correction only (see
`docs/incoming-qc-review-proposal.md`'s own revision note) - no code for
rounds/decisions/retest exists yet in this task, so nothing in the
shipped code needed to change to fix it, only the proposal's own math.

## Why `RETURNED_FOR_CORRECTION` moved out of the disposition `outcome` enum

The same design correction also separated "returned for correction" from
`IncomingInspectionRound.outcome`'s other three values. A real
disposition (`ACCEPTED`/`PARTIALLY_ACCEPTED`/`REJECTED`) always allocates
a quantity split of `assessed_quantity`; returning a round for correction
allocates none at all - the reviewer hasn't judged the material, only
found the *data* wanting. Treating it as a fourth outcome value blurred
that distinction and was part of what made the quantity invariant
ambiguous for that case in the original draft. It is now proposed as its
own, separate action instead - again, a design-only correction; this
action is explicitly not implemented in this task.

## `cancel_incoming_inspection`'s missing status check: the same class of bug as `cancel_purchase_order`, caught the same way

`cancel_incoming_inspection` (Task 09B-1) never had an explicit "must be
`DRAFT`" branch - only a check for "already `CANCELLED`". This was
correct at the time purely because the model had exactly two statuses:
if a row wasn't `CANCELLED`, it could only be `DRAFT`, so the missing
branch was harmless by construction. Adding `SUBMITTED` in this task
broke that silently - without a fix, `SUBMITTED` would also satisfy
"not `CANCELLED`" and the function would have happily cancelled it,
directly contradicting this task's own "block cancellation after
submission" requirement. This is exactly the same shape of bug Task
08C-2 found and fixed in `cancel_purchase_order` when `ISSUED` was added
there as a third status - an implicit two-state assumption that a later,
legitimate status addition quietly invalidates. Recorded here, as that
task's fix was, because the lesson generalizes: any function whose
control flow only distinguishes "the one terminal status" from
"everything else" needs re-auditing the moment a new status is added to
the same model, not just new tests written against the new status in
isolation.

## Why `submit_incoming_inspection` gets a dedicated permission instead of reusing `incoming_qc.edit`

The brief for this task explicitly required "a dedicated STORE-scoped
`incoming_qc.submit` permission... grant to nobody automatically,"
resolving an open question the Task 09B-2 design proposal had explicitly
left open (whether submission should require a new permission or just
reuse `incoming_qc.edit`, treating submission as a continuation of
drafting). A dedicated code lets a company assign edit-only access
(someone who records observations but should never finalize them) or
submit-only access (a supervisor who reviews and finalizes but doesn't
personally type observations) independently - a distinction a shared
permission could never express. Consistent with this project's
established one-permission-per-action convention (`purchase_requests.
submit` is likewise its own code, distinct from `purchase_requests.
edit`) rather than an exception invented for this app.

## Why the retry-safety semantics mirror `submit_purchase_request` exactly, including its narrow idempotency

`submit_incoming_inspection`'s idempotent-retry branch only fires when
the caller's `expected_version` matches the inspection's *current*
(already-incremented) version while status is already `SUBMITTED` - not
when a caller blindly resends the exact same original request (whose
`expected_version` would now be stale and correctly get `409`). This
mirrors `submit_purchase_request`'s existing behavior precisely, rather
than inventing a more permissive "any resubmission with the original
body is a no-op" rule. The practical effect: a caller that follows this
project's own established pattern (refetch after a conflict or an
uncertain outcome, then retry with the fresh version) gets a clean 200
if it turns out the first attempt had actually already succeeded; a
caller that just blindly fires the same request twice without refetching
gets a normal, correct 409 either way. Choosing consistency with the
existing convention over inventing a new, more lenient one avoids adding
a second idempotency semantic to the project that a future reader would
have to learn separately.

# Backend Decisions — Task 09B-3B

## Why `MaterialSpecification` has no `version`/`expected_version`, unlike everything else this task touches

Every document-like resource added since Task 08B-1
(`PurchaseRequest`/`PurchaseOrder`/`GoodsReceipt`/`IncomingInspection`,
and this task's own `MaterialSpecificationVersion`) carries an
optimistic-concurrency `version` field. `MaterialSpecification` itself
deliberately does not. The task's own field list for it (§A) never
mentioned one, and re-reading `apps.catalog.Material`/
`apps.suppliers.Supplier` confirmed why: neither of those genuinely
comparable shared-master-data models has a `version` field either -
`update_supplier` is a plain, unversioned, last-write-wins `PATCH`.
`MaterialSpecification` is the same category of thing (a stable,
rarely-contested identity record - code/name/description), while
`MaterialSpecificationVersion` is the actively-edited draft *content*
(test rows, changed repeatedly while drafting) that genuinely needs
concurrency protection the way `IncomingInspection`'s own drafting does.
Giving both models a `version` field "to be consistent" would have
been consistent with the wrong precedent - the actual existing
convention, read carefully, already draws this exact line between
identity and content, and this task follows it rather than inventing a
new rule.

## Why `revision_number` is allocated by locking the parent, not by aggregating `MAX(revision_number)`

`create_specification_version` reads `specification.latest_revision_
number` (a counter field) while holding `select_for_update()` on the
specification row, rather than computing `MAX(revision_number) + 1`
over the version table under the same lock. Both are safe under the
lock; the counter field was chosen because it mirrors an already-proven
precedent in this exact codebase -
`apps.purchasing.services.submit_purchase_request`'s `PurchaseRequest.
current_round` - rather than introducing a second allocation pattern
(aggregate-under-lock) that would need its own justification. The
database's own `unique_specification_version_revision` constraint is
still the real backstop either way; the counter field is about matching
established style, not about safety the aggregate approach would lack.

## The `tests` prohibited-field bug: the same lesson, a second time, in a different field

The version-update serializer's prohibited-field set was first built by
copying the version-*create* serializer's own set, which correctly
prohibits `tests` (create never accepts test rows - see
`create_specification_version`'s own docstring for why). Copied
verbatim onto the *update* serializer, that same prohibition then
rejected the one legitimate use of `update_specification_version` -
adding or editing test rows - with a confusing 400. This is the exact
same class of bug Task 09B-3A hit with `receipt_line_id` (a field
prohibited everywhere it should have been, and everywhere it shouldn't
have been, from one shared set), caught here the same way: by the test
suite actually exercising the real "add tests" call, not just checking
the prohibition logic in isolation. Fixed by building
`_VERSION_ALWAYS_PROHIBITED` as the genuinely shared base and deriving
`_VERSION_CREATE_PROHIBITED` (base + `tests`) and
`_VERSION_UPDATE_PROHIBITED` (base alone) independently - the third time
this project has had to apply this exact fix shape (after Task 08C-1's
`PurchaseOrder`/`lines` and Task 09B-3A's `IncomingInspection`/
`receipt_line_id`). Recorded here, again, because a pattern that
recurs three times across three different apps is worth naming as a
standing convention this project should default to from the start on
any future create/update serializer pair, not just fixed reactively each
time it resurfaces.

## Why duplicate specification codes are a `409`, not `apps.suppliers`' own `400`

`apps.suppliers.create_supplier` lets a duplicate-`code` `IntegrityError`
propagate to the view layer, which translates it into a plain `400`.
`create_material_specification` instead catches the same kind of
`IntegrityError` inside the service itself and raises `Conflict` (409).
This is a deliberate departure from the closest structural precedent,
not an oversight: a duplicate code is a genuine identity collision whose
natural remedy is "refetch or search for the existing one" - exactly the
reasoning this project already uses `Conflict` for elsewhere (e.g. a
`GoodsReceipt` `idempotency_key` collision), and arguably a better fit
than `Supplier`'s own older `400` precedent. This task's own instruction
to "validate... duplicate IDs... consistently" was read as "signal a
real conflict as a conflict, consistently with the *general* pattern,"
not as a mandate to copy `Supplier`'s specific status code choice
unexamined.

# Backend Decisions — Task 09B-3B.1

## Why `MaterialSpecification` was wrong to model as unversioned master-data, and what that judgment call missed

Task 09B-3B's own decisions log (immediately above) argued that
`MaterialSpecification` belonged in the same category as `Material`/
`Supplier` - shared identity, edited with a simple last-write-wins
`PATCH`, no `version` field. That reasoning was internally consistent
but answered the wrong question: it compared `MaterialSpecification`
against other models' *actual shipped shape*, when the task that
introduced it had already given an explicit, specific instruction of its
own - "require `expected_version` when PATCHing specification metadata"
- that should have taken precedence over inferring a category by
analogy. Precedent is the right tool for filling in *unspecified*
details (which is what the create/update prohibited-field split,
the `Conflict`-not-`400` choice for duplicate codes, and several other
09B-3B decisions correctly used it for); it is the wrong tool for
overriding an instruction the task actually gave. This task's fix does
not change the underlying reasoning method - it corrects one instance
where that method was applied to a question it didn't actually need to
answer.

## Why the fix is a third field, not a change to either existing one

`MaterialSpecification.latest_revision_number` could not be repurposed
as a concurrency token - it has a real, different job (counting child
versions), and treating it as both an allocation counter and an
optimistic-concurrency check would need every metadata edit to also
somehow interact with revision allocation, which no requirement asked
for and which would silently create exactly the "lost update between two
operations" risk this task was asked to explicitly rule out. Reusing
`MaterialSpecificationVersion.version` was never an option - it belongs
to a specific child row, not the parent. A genuinely new, independent
`version` field was the only shape that keeps the three concerns
(specification identity edits, revision allocation, one version's own
content edits) fully decoupled, exactly as the original 09B-3B brief
asked for ("keep it distinct from `latest_revision_number` and each
specification revision's own concurrency version").

## Why no lost-update risk exists between concurrent metadata edits and concurrent revision creation

Both `update_material_specification` and `create_specification_version`
acquire `select_for_update()` on the *same* `MaterialSpecification` row,
so Postgres fully serializes them against each other - whichever
transaction's lock request is granted first runs to completion (commit
or rollback) before the other's `SELECT ... FOR UPDATE` returns, and the
second transaction's `.get()` re-reads the row's actual committed state
at that point, not a stale in-memory copy. Because the two operations
write disjoint field sets (`name`/`description`/`version` vs.
`latest_revision_number`), there is no field either operation could
silently clobber that the other cares about, and neither operation's own
correctness (the metadata edit's `expected_version` check, the revision
allocation's `+1` arithmetic) depends on knowing anything about the
other's change. This was verified, not just argued: `test_revision_
allocation_unaffected_by_metadata_updates` performs a real metadata edit
followed by a real revision creation against the same specification and
asserts each operation's own counter reflects only its own action.

# Backend Decisions — Task 10A

## Why `Customer` is company-scoped, unlike `Supplier`'s shared directory - and why that is not a policy claim

`apps.suppliers.Supplier` deliberately has no owning company at all - a
single shared directory, provisionally, because the task that introduced
it left "which company actually purchases from a given supplier" as an
unresolved business decision. Task 10A takes the opposite shape for
`Customer`: a real `company` FK, `PROTECT`, immutable, with per-company
code uniqueness. This was the task's own explicit instruction, not an
inference by analogy to Supplier or anything else - and the task itself
was equally explicit that this choice must be documented as "the working
implementation choice for this task, not a claim of client-confirmed
customer-ownership policy," so it is recorded here, and in every
docstring/handoff document this task touches, with that exact framing.
Whether the two companies sharing this physical store should someday see
a shared customer directory instead - the same open question Supplier's
own docstring already raises in the other direction - remains unresolved
and is logged in `docs/erp-handoff-open-decisions.md`, not decided here
either way.

## Why a duplicate `(company, code)` is a `409`, following the `MaterialSpecification` precedent rather than `Supplier`'s

Same reasoning `docs/backend-decisions.md`'s Task 09B-3B entry already
gives for `MaterialSpecification` (immediately above): a duplicate code
is a genuine identity collision whose natural remedy is "refetch/search
for the existing one," not "resubmit a corrected payload" - the
`Conflict`/409 shape this project already uses elsewhere for a real
collision. This task's own instruction to "handle duplicate-code races
without an unhandled 500" left the exact status code unspecified, so the
more recent, more-considered precedent was followed rather than
`Supplier`'s older, narrower `400`. Verified with both an API-level test
and a genuine concurrent-race test using real OS threads and a
`threading.Barrier`.

## Why `update_customer` normalizes in-memory before deciding "no-op," instead of following `update_company`'s save-then-compare shape literally

`apps.companies.services.update_company` calls `company.save()`
unconditionally whenever any raw field differs, *then* compares the
normalized result against `before` to decide whether to write an audit
entry - its own docstring explains this catches a whitespace-only
"change" that a naive pre-save comparison would wrongly treat as real,
at the cost of still performing a database write (just skipping the
audit log) even for that no-op case. `Company` has no `version` field, so
that trade-off costs nothing extra there. `Customer` does carry
`version`, and literally reusing `update_company`'s shape would force an
unpleasant choice: either bump `version` for an effective no-op (wrong -
a caller who only fixed whitespace would see a real version change for a
change that was never actually applied), or perform the write without
bumping `version` and only conditionally do a second save to bump it
(correct but requires two writes and leaves a moment where the row's
persisted content and its `version` are inconsistent, even if only
within the same still-open transaction). `update_customer` instead calls
`Customer.clean()` explicitly - in-memory only, nothing persisted - right
after `setattr`-ing the candidate changes, takes its "after" snapshot
from that normalized in-memory state, and only then decides whether to
touch the database at all. This reaches the same outcome
`update_company` was designed for (a whitespace-only edit is correctly
treated as a no-op) without ever writing a row that turns out not to
have really changed, and without the version-consistency problem a
literal copy of `update_company`'s shape would have introduced. Verified
by `test_whitespace_only_change_treated_as_no_op`, which asserts neither
the version nor an audit entry changes.

## Why activation/deactivation use explicit `is_active` checks, not an implicit two-state assumption

`Customer.is_active` is a plain boolean with no third state today, so an
implicit "not active means eligible to activate" check would happen to
work right now. `apps.quality.services.cancel_incoming_inspection`
already demonstrated, earlier this session, exactly how that kind of
implicit assumption breaks silently the moment a real third state is
introduced elsewhere on a similar model (there, `SUBMITTED` was added
after the fact and an "not CANCELLED means DRAFT" shortcut went stale
without warning). `activate_customer`/`deactivate_customer` both write
the explicit check (`if customer.is_active: return customer` /
`if not customer.is_active: return customer`) from the start, even
though only one other state is reachable today, so a future lifecycle
addition cannot silently invalidate either function's correctness the
way it did there.

# Backend Decisions — Task 10B

## Why `Product` is a new, separate app rather than folded into `apps.catalog` or `apps.customers`

`apps.catalog` holds `Material`/`MaterialCategory`/`UnitOfMeasure` - a
shared, company-independent, superuser-managed directory with a
read-exception permission model (`CanReadSharedCatalog`) unlike anything
`Product` needs. Folding `Product` in there would have meant either
weakening that app's access model with a special case, or leaving
`Product` in the same app but with an entirely different permission
shape - both worse than a dedicated app. `apps.customers` was
considered too, purely by proximity (same task-pair, same company-scoped
shape, same access pattern), but a product and a customer are
unrelated identities with nothing in common except that shape - putting
them in one app would only have coupled two independent future
extension paths (a customer-detail change should never risk a product
migration, and vice versa) for no real benefit. A new `apps.products`
app, mirroring `apps.customers`' own structure file-for-file, keeps
each identity's future evolution independent while reusing every
relevant convention.

## Why `sales_uom` is immutable, unlike `Product.name`/`description`

This task's own instruction was explicit: "Keep sales_uom immutable
after creation in this initial slice to prevent future transaction
quantities from changing meaning." The reasoning is mechanical, not
stylistic - no quotation/sales-order line exists yet, but when one does,
it will necessarily record a quantity *in the product's sales unit*.
Letting `sales_uom` change after creation would silently reinterpret
every quantity recorded against every transaction line created before
that change, and this task implements no unit-conversion logic that
could safely reconcile old quantities against a newly-changed unit.
Blocking the change entirely (immutable, like `code`/`company`) is the
only correct answer *given that no conversion engine exists* - once one
does, a future task could reconsider this, but only alongside whatever
conversion logic it adds, never in isolation.

## Why `deactivate_unit` was not extended to protect against an active `Product` reference, unlike `Material`

`apps.catalog.services.deactivate_unit` already refuses (400) to
deactivate a `UnitOfMeasure` while any active `Material` references it
as `base_unit`. The parallel case - refusing to deactivate a unit while
an active `Product` references it as `sales_uom` - was deliberately
**not** added. Two reasons, together: (1) this task's own instruction
was to "reuse existing conventions and helpers" and inspect before
building, not to modify unrelated existing modules, and
`apps.catalog.services` is exactly that - an existing app this task did
not otherwise need to touch at all; extending it would have imported
`apps.products` into `apps.catalog` (or required an awkward local
import to avoid a circular dependency), coupling a shared, foundational
app to a brand-new company-scoped one for a protection nobody asked
for. (2) The task's own instruction anticipated the alternative:
"Document how an inactive referenced UOM is displayed and handled;
preserve historical readability and do not silently replace it" -
wording that assumes an inactive reference is a real, expected
possibility to be *handled gracefully*, not necessarily *prevented
outright*. Given a genuine choice between the two readings, the more
conservative one (do not touch unrelated code; handle the resulting
state at the edges instead) was taken. The consequence is fully
documented, not silently accepted: `Product`'s own docstring, `apps.
products.services.activate_product`'s re-check before reactivation, and
`ProductSerializer`'s always-present `sales_uom_code`/`sales_uom_name`/
`sales_uom_is_active` fields all exist specifically to make this
possibility visible and survivable rather than a silent trap. See
`docs/erp-handoff-open-decisions.md` §A14 for the open question of
whether `deactivate_unit` should eventually be extended after all.

## Why `activate_product` re-checks `sales_uom.is_active` but `create_product` does not need a symmetric re-check

`create_product` checks `sales_uom.is_active` once, at the moment of
creation, because that is the only moment a *new* row could ever be
created against an inactive unit - there is no "re-create" operation.
`activate_product` needs its own, later check because time can pass,
and the unit itself, between a product's creation and any later
reactivation attempt: the unit could have been active when the product
was created, then deactivated later (never blocked, per the decision
above), then the product itself separately deactivated and later
resubmitted for reactivation. Skipping this second check would let a
product silently become "active" again while pointing at a unit that is
currently unusable - exactly the class of staleness
`apps.catalog.services.activate_material`'s own identical re-check of
`base_unit`/`category` already guards against, reused here for the same
reason.

## Why duplicate product codes are a `409`, consistent with `Customer` and `MaterialSpecification`, not `Supplier`'s `400`

Same reasoning as `docs/backend-decisions.md`'s Task 10A entry
(immediately above) and the original Task 09B-3B entry it was itself
based on: a duplicate `(company, code)` is a genuine identity collision
whose natural remedy is "refetch/search for the existing one," not
"resubmit a corrected payload" - the `Conflict`/409 shape this project
now consistently uses for that situation, `Supplier`'s older `400`
being the one remaining outlier precedent, not the pattern to keep
extending.


# Backend Decisions — Task 10C

## Why the line-editing pattern is a deliberate blend of two existing ones

Two nested-line patterns exist. Purchase requests, goods receipts, QC
observations and specification tests use "`lines`, when present (even `[]`),
is the authoritative final list" with no line ids. `update_purchase_order`
uses per-line `id`s with foreign/duplicate-id checks but cannot add or
remove lines. This task required both id validation *and* removal (and
adding), so quotation `lines` keeps the "present means authoritative" rule
and lets each entry carry an optional `id`: with id = existing line
(unknown/foreign/repeated -> 400), without id = new, missing = removed.
`line_number` is always server-assigned from submitted order. Renumbering
of retained lines uses a two-phase update (temporary numbers above
1,000,000) so the `(quotation, line_number)` unique constraint is never
violated by a reorder.

## Reference validation applies only to new or changed lines

"Do not allow new or changed commercial lines using inactive products/UOMs"
plus "keep historical drafts readable" are reconciled as: an existing line
whose product, quantity, unit_price and description are all unchanged is
kept without re-checking its product/sales unit (it can also always be
removed); a new line, or an existing line changed in any commercial value
(even only quantity), must reference an active company product with an
active sales unit. Snapshots are refreshed only for new lines and when a
line's product is replaced - never on quantity/price edits and never for
unchanged lines - and the unit is never swapped. The catalog UOM
deactivation policy was not touched (see Task 10B decisions).

## Currency is immutable; only shape is validated

Mirrors `PurchaseOrder.currency_code`: three letters, upper-cased,
immutable after creation so existing prices cannot silently change
currency. The INR/USD/EUR/GBP allowlist exists in purchasing only for
*issuing* (2-decimal rounding verification); quotations are never issued,
so it is not applied. Amounts are only summed within a single quotation
(single currency); no cross-currency arithmetic exists.

## Decimal rules

`quantity` max 3 dp (>0), `unit_price` max 4 dp (>=0, zero allowed),
`line_amount = quantity * unit_price` quantized to 2 dp ROUND_HALF_UP
(same as `_compute_line_amount` in purchasing), COUNT sales units accept
whole numbers only (same rule as purchase requests). The DB column for
`line_amount` holds 14 integer digits; larger products are rejected as 400
rather than surfacing a database overflow. The response `subtotal` is
derived, never stored, never client-suppliable, and named `subtotal`
(pre-tax) - no grand total.

## Reference uniqueness is per company

Task instruction: unique *within company*. Implemented as
`UniqueConstraint(company, reference)` instead of the global
`unique=True` used by PR/PO. Generation is date + 10 random hex characters
(never `count()+1`), with retry on a collision of that constraint only.
Format is a technical default, not client-confirmed numbering.

## Unknown/protected fields use allow-lists

Quotation serializers reject every key outside an explicit allow-list
(covering forged totals, reference, status, version, audit fields, company,
snapshots, line_number and unknown keys) instead of maintaining deny-lists;
create and update allow-lists are independent (`id` legal only on update
lines, `currency` only on create, `expected_version` only on update).

## Lookup access was sufficient; gap documented, no new endpoint

Selecting customers/products uses the existing list endpoints, which need
only `customers.view`/`products.view` (not edit permissions). The concrete
gap: a role with only `quotations.*` cannot populate pickers. Documented
in the handoff and screen catalog rather than adding a quotation-specific
lookup endpoint that would duplicate access control.


# Backend Decisions — Task 10D

## Reuse of quotation helpers without refactoring quotations

`apps.sales_orders` imports the proven line/amount helpers from
`apps.quotations.services` (`_compute_line_amount`, `_normalize_currency`,
`_resolve_active_customer`, `_resolve_line_product`, `_check_quantity`,
`_snapshot_fields`, `_line_snapshot_list`) and the line-input serializers/
allow-list helper from `apps.quotations.serializers`, so Decimal precision,
ROUND_HALF_UP, the COUNT whole-number rule, active-reference checks and
snapshots are one implementation. Quotation code was not modified (its 51
tests were therefore not re-run). Trade-off: importing underscore-prefixed
helpers across apps couples the two; if a third document type appears,
promote them into `apps.common` in a dedicated refactor.

## Same edit semantics, own models

`SalesOrder`/`SalesOrderLine` are separate tables (no shared base model, no
quotation FK). Nested-line semantics (omitted = unchanged, present =
complete final list, id updates/no id creates/missing removed, unknown/
foreign/duplicate ids 400, two-phase renumbering) and the "validate only
new or changed lines; snapshots only for new lines or product replacement"
rule are identical to Task 10C, so a frontend can share one line editor.

## No quotation linkage, no quantity-tracking fields

Deliberately absent: `quotation` FK, confirmation/cancel states, reserved/
produced/dispatched quantities. Adding them before the conversion and
fulfilment policies exist would invent business rules; a later migration
can add them additively. `status` is a DRAFT-only enum like
`Quotation.Status`.

## Working rules flagged for client review

`requested_delivery_date >= order_date`; `SO-` reference format;
`customer_order_reference` optional, free text, **not unique** (no business
requirement for uniqueness, so none imposed); currency immutable; company-
scoped. All recorded in `docs/erp-handoff-open-decisions.md` §A16.


# Backend Decisions — Task 11A

## Why Formula/FormulaRevision/FormulaLine mirror MaterialSpecification, not specification tests

Revision allocation, the four distinct version-like values, empty first
revision, `latest_revision_number` allocation under a parent row lock, and
disjoint-field coordination between metadata edits and allocation are the
same proven design as `MaterialSpecification`/`MaterialSpecificationVersion`
(Tasks 09B-3B/3B.1), including the lesson that the parent needs its own
`version` token from the start. Specification tests share no tables, code or
endpoints with formulas.

## One line collection for raw and packaging lines

Raw and packaging lines are stored in one `FormulaLine` table and one
`lines` collection, distinguished by a server-derived `material_kind_snapshot`
copied from `Material.kind`. This lets both frontend tables save atomically in
one PATCH with a single line-number sequence and one nested-replacement
semantics, and it makes a contradicting client-supplied type impossible
(`material_type`, `unit_id`, `line_number` are rejected as unknown fields).

## Nested-line semantics reused

Same as quotations/sales orders: omitted `lines` = unchanged, present =
complete final collection, id updates/no id creates/missing removed,
unknown/foreign/duplicate ids 400, two-phase renumbering, validation only for
new or changed lines, snapshots only for new lines or material replacement.
Formula-specific: a line's `unit` is always the material's base unit; changing
a line's quantity/notes on a since-deactivated material is rejected (documented
choice - "changing quantities on inactive references"), removal is always
allowed.

## New revisions require an active product and sales unit

`output_uom` is derived from `product.sales_uom`. Creating the formula and every
new revision newly attaches that unit, so both require the product and its
sales unit to be active; editing an existing revision's lines/base output does
not re-check them (base output changes validate the COUNT whole-number rule
against the revision's stored output unit).

## No scaling, conversion or duplicate-material restriction

Base output changes never rescale lines; no percentages, yields, waste, fixed
quantities or unit conversions exist because none have client rules. Duplicate
materials within a revision are not rejected: no requirement was stated and
inventing one could reject legitimate formulations. Both are recorded in
`docs/erp-handoff-open-decisions.md` §A17.

## Material lookup access gap: reported, not fixed

`GET /api/v1/materials/` requires an active superuser or `shared_catalog.view`
in at least one active store; it is not company scoped. Company-only formula
authors therefore cannot populate a material picker. This was reported (handoff,
screen catalog, Postman) rather than solved by broadening global material
access, per the task's instruction to report before introducing a new access
policy.


# Backend Decisions — Task 11B

## The credentials writer had to merge, not replace

`seed_demo_data` only writes its credentials file when it created new users,
but it wrote the file from scratch containing only those new users. That was
harmless while the command's user set never grew, and became a real defect
the moment Task 11B added three new demo personas to an already-seeded
database: the run would have replaced the recorded passwords of the eight
existing demo users, breaking `scripts/demo_http_flow.py`. Found while
extending the command (before running it), fixed by merging new entries into
the existing file (existing entries are never overwritten, an unreadable file
is never overwritten, a no-op run leaves it byte-identical) and covered by
`tests/test_seed_demo_data.py`, which previously did not exist.

## One seed command, a separate HTTP script

The demo setup extends the existing `seed_demo_data` (same DEBUG/`--yes`
guards, same identity-conflict checks, same marker convention with a new
`Task 11B` marker) rather than adding a second incompatible command. The new
journeys live in their own script (`scripts/demo_http_commercial_formula.py`)
reusing `Session` from `demo_http_flow.py`, so the earlier procurement demo is
untouched. Demo records are created through the ORM in the seed (as the
existing material/supplier demo rows already were), while every demonstrated
business step is real HTTP.

## Personas keep company and store permissions separate

`demo_sales` has company permissions only; `demo_formula` has company
permissions plus a separate store role carrying `shared_catalog.view`;
`demo_formula_nocatalog` has the same company permissions and no store
membership so the documented material-lookup denial is demonstrable.
Application authorization was not broadened.


# Backend Decisions — Task 10E

## Preview is a pure read model, not a dry-run of confirmation

`build_confirmation_preview` (`apps/sales_orders/preview.py`) is a pure
function over an already-loaded order: it never calls `save()`, the audit
service or anything that writes, and the view only implements `GET` (the
tests assert zero INSERT/UPDATE/DELETE queries, unchanged version/
`updated_at`/snapshots, and an unchanged audit-log count). It is not a
"validate then rollback" of a confirmation, because no confirmation exists
and inventing its rules would decide the open policy questions.

## Two observation lists, and no eligibility flag

Facts follow the rules that already exist (active references, snapshot
handling) go to `data_validity_observations` with the `existing_rule` they
come from; facts that touch unanswered client questions (empty order, zero
price, past requested delivery date) go to `policy_observations`. Every item
carries `client_confirmed_blocker: false`, and the response has no
`can_confirm`/eligibility key - only `confirmation_workflow: {implemented:
false, eligibility_finalized: false}` - so a frontend cannot mistake it for a
decision. Even inactive references are not called blockers: the existing rules
constrain draft create/edit, not a confirmation that does not exist yet.

## Access is exactly order detail; no new permission

`sales_orders.view` only, via the same company-resolution helper (404 for no
membership/other company, 403 for a missing permission, no superuser bypass).
No `sales_orders.confirm`/`cancel` permission was seeded and no such endpoint
exists; the test suite asserts the permission set is still view/create/edit.

## Snapshots vs current state

Lines return the stored snapshot values as the historical record and the live
master values/active flags separately under `current`; a rename since capture
is reported as an informational observation. Nothing is refreshed.

## Staleness

The preview is informational and stale on return. The future confirmation
command must lock the order, compare `expected_version` with the version the
user reviewed, and revalidate all rules inside the same transaction.


# Backend Decisions — Task 10F

## Policy is data with no defaults; absence blocks

Each of the three questions is a nullable boolean on a one-row-per-company table
(`SalesOrderConfirmationPolicy`). `null` = unanswered. A missing row or any `null`
yields a `POLICY_NOT_CONFIGURED` blocking reason and a structured 400
(`code: confirmation_policy_not_configured`, plain message "Confirmation rules are
not configured. Contact your administrator."). No migration or command seeds a
policy, the demo seed does not, and the API refuses an update that supplies no value
or a `null`/non-boolean value. This is a small purpose-built table, not a generic
workflow/rules engine.

## Configuration authority is not confirmation authority

The policy endpoint follows the project's existing configuration convention
(`IsActiveSuperuser`, like company/role management), is audited, versioned
(`expected_version`, 0 to create) and records `created_by`/`updated_by`/`updated_at`.
Confirming needs the separate COMPANY permission `sales_orders.confirm`, resolved through
`user_has_permission`, which never consults `is_superuser`/`is_staff`/role names; a
superuser with no membership gets 404, with a membership but no permission 403 (tested).
Order viewers see only the effective values/version through the review, not who set them.

## One assessment function for preview and command

`assess_confirmation` (`apps/sales_orders/confirmation.py`) is a pure function used by
both the read-only review and `confirm_sales_order`, so they cannot drift. It separates
`POLICY_NOT_CONFIGURED`, `ELIGIBILITY` (technical safeguards) and `POLICY_RULE`
findings plus non-blocking informational observations. Policy rules are only evaluated
when the policy is complete, so an unconfigured company sees one clear reason rather than
guesses. The preview is still informational and cannot guarantee a later success.

## Self-confirmation compares identities, nothing more

`actor.id == order.created_by_id` under the policy value. Purchasing's approval-step rules
(distinct approvers per step, rounds) were deliberately not copied.

## Concurrency: exact guarantee and lock order

`confirm_sales_order` locks the order (`SELECT ... FOR UPDATE`, the same lock draft edits
take), re-checks access, compares `expected_version` (409), treats an already-CONFIRMED
order at the current version as a silent no-op, then locks and RE-READS policy, customer,
products (by id) and sales units (by id) with `FOR NO KEY UPDATE`, assesses, writes
status/confirmed_by/confirmed_at/policy record/version and the audit event, all in one
transaction.
- **Confirm vs edit**: both serialize on the order row; whichever commits first makes the
  other fail with a 409 on `expected_version` - never partial or lost updates (tested with
  real threads).
- **Confirm vs master-data change**: `deactivate_customer`/`deactivate_product`/`update_*`
  lock only their own row with `FOR UPDATE`; `deactivate_unit` takes no explicit lock but its
  `UPDATE` blocks on any row lock. Because confirmation holds `FOR NO KEY UPDATE` on every
  referenced row until it commits, a concurrent deactivation waits and applies afterwards,
  while a deactivation that committed earlier is seen and blocks confirmation. `FOR NO KEY
  UPDATE` conflicts with those writes but not with other drafts merely referencing the same
  rows (foreign-key inserts), avoiding needless contention. **Guarantee**: confirmation
  decides against exactly the state committed with it.
- **Confirm vs policy change**: the policy row is locked the same way; a policy update waits,
  and the order records the policy version/values actually applied (tested).
- **Deadlock-freedom**: fixed lock order order -> policy -> customer -> products -> units,
  ascending ids within a type; no master-data or policy service ever locks an order, and each
  locks a single row, so no cycle exists.
- **Not changed**: master-data services were not modified.

## Timezone assumption (for client review)

The past-requested-delivery-date rule compares a stored calendar date with "today". UTC is
only the storage timezone, so the comparison uses a new `BUSINESS_TIME_ZONE` setting
(default `Asia/Kolkata`, the business timezone the settings already documented as
presentation-level) via `zoneinfo`, not UTC. It is a setting so it can be corrected
without code changes; the business date and zone used are recorded in the order's policy
snapshot and shown in the review.

## Immutability after confirmation

`update_sales_order` already rejects any non-DRAFT order under its lock: 400 at the current
version, 409 at a stale one. Lines and their snapshots are never touched by confirmation.
The model additionally requires `confirmed_by`/`confirmed_at` exactly when CONFIRMED. No
unconfirm/cancel/amend endpoint, no quotation link, no stock/batch/invoice/production effect.

## Preview contract change

The Task 10E preview shape (`data_validity_observations`, `policy_observations`,
`open_policy_questions`, `confirmation_workflow`) was replaced by a single
`confirmation` block (`workflow_implemented: true`, policy summary, `policy_message`,
categorized `blocking_reasons`, `informational_observations`, permission flag and
`ready_to_attempt`). Internal policy questions were removed from the API; they live in
`docs/erp-handoff-open-decisions.md`. The 17 preview tests were rewritten for the new
contract.


# Backend Decisions — Task 11D

## Exact rational arithmetic, string output, and what "exact" means

`required = line_quantity × target ÷ base_output` is computed with `fractions.Fraction` (inputs are
exact decimals), not floats and not a rounded Decimal division. That yields two facts independent of any
display precision: **exactness** (a result terminates iff the reduced denominator has only the factors 2
and 5) and **wholeness** (reduced denominator 1). The COUNT fractional-piece warning uses wholeness, so a
tiny fractional part (e.g. 1 ÷ 99999999999.999) cannot vanish through display rounding. Only the returned
string is rendered, at 50 significant digits (ROUND_HALF_EVEN) using a **local** Decimal context; a
terminating value is shown in full, a non-terminating one is an approximation flagged `is_approximate`.
The system never claims every result is mathematically exact. Nothing is quantized to inventory precision
and no operational rounding, wastage, yield or fixed-quantity rule is applied (all unresolved).
(A first version leaked the ambient 28-digit context through `Decimal.normalize()`, truncating the
approximation; a test asserting the full 50 digits caught it and the local context is now used explicitly.)

## Read consistency without locks: version double-read

A revision edit changes lines and header in one transaction and bumps `version` in it, so any committed
edit changes `version`. The preview reads the header (with version), then the lines, then the version
again; equal versions mean no edit committed in between, otherwise it retries (3 attempts) and finally
returns 409 - never a torn header/lines mix. Alternatives rejected: `SELECT ... FOR UPDATE/SHARE` (would
block writers or take locks for a read), a REPEATABLE READ transaction (must be set before the first
statement, which breaks inside wrapping transactions such as the test framework's, and changes isolation
for one view), and a single joined query (heavier and still needs the header/line pairing). No write,
lock, version bump or audit event is issued; tests assert zero INSERT/UPDATE/DELETE/lock statements and
prove the retry with an edit injected between the reads.

## Strict target parameter

Plain digits with an optional fraction only (no sign, exponent, NaN/Infinity, whitespace); > 0; at most 3
decimal places and 11 integer digits (the stored quantity precision, max_digits 14); whole for a COUNT
output unit; unknown or repeated parameters are 400. Access checks run before validation so a caller
without access learns nothing from validation errors.

## Deliberately not in the response

`can_produce`, `approved`, `available_stock`, `shortage`: no approval, ledger or planning rule exists.
An empty draft returns an empty preview with an `EMPTY_FORMULA` issue and `calculation_complete: false`;
a line that could not be calculated is a named `LINE_NOT_CALCULATED` issue, never a silent skip
(unreachable through the API today because the database forbids non-positive quantities - the path is
tested on the pure builder). Inactive masters are warnings, not blockers; snapshots are never refreshed.

## Not a generic engine

One function for one proportional calculation on one formula module; no rules, no plug-in scaling.
Task 11C (formula approval) was not implemented in Task 11D; it is now covered by Task 11C below.


---

# Backend Decisions — Task 11C

**Confirmed vs working.** Nothing here is client-confirmed manufacturing policy. Working implementation choices:
(1) approval is a separate COMPANY permission `formulas.approve`, assigned to nobody by seed; (2) self-approval is an
explicit per-company answer stored on `FormulaApprovalPolicy`, never defaulted (`null` = unanswered = approval
blocked); (3) "contributor" means creator or substantive content editor (base output, revision notes, material
lines) — formula-master metadata and no-op updates do not count; (4) the contributor backfill only trusts audit
history it can prove complete (creation actor matches `created_by`; `version - 1` equals the count of update events),
otherwise `contributor_history_complete = false` and approval fails closed when self-approval is prohibited;
(5) eligibility safeguards are technical only (draft, lines, positive quantities, COUNT wholeness, relationships,
active masters).

**Why the sales-order confirmation architecture was reused.** Policy table with no defaults, one shared pure
assessment for preview and command, structured 400 with `blocking_reasons`, fixed lock order, idempotent repeat at the
current version, policy values recorded on the approved record.

**Lock order** (documented in `apps/formulas/approval.py`): revision, formula, policy, product, units by ascending id,
materials by ascending id. No existing service locks a revision while holding a formula, so no cycle exists; joined
nullable-side locks are avoided. Master-data changes, policy changes and edits wait for an in-flight approval (tested
with real threads).

**Immutability and snapshots.** Approved content is immutable everywhere; the approved identity is a separate frozen
snapshot so later Formula/Product renames cannot rewrite what was approved. Approval increments the revision content
`version` and records policy version and values.

**Not built (by decision).** Unapprove, clone, retire, supersede, effective dating, default/current revision, batch
scaling, yield/potency policy, stock or production effects.


---

# Backend Decisions — Task 12A

**Confirmed vs working.** Nothing here is client-confirmed production policy. Working choices: (1) a plan references
exactly one sales-order line and several plans may reference the same line, with no cumulative-quantity allocation
enforced against the order - split-batch and overproduction rules are explicitly unresolved; (2) both DRAFT and
CONFIRMED orders may be planned against, since planning is not fulfillment; (3) the formula revision must match the
line's product AND output unit by identity (not display-name equivalence) - there is deliberately no unit conversion
in this slice; (4) `batch_plans.create` alone is not enough to create a plan - the actor must also separately hold
`sales_orders.view` and `formulas.view`, since creation reads across both modules.

**Why creation and a target-quantity update share one locking helper.** `_lock_source_context` (`apps/batch_plans/
services.py`) locks SalesOrder -> SalesOrderLine -> FormulaRevision -> Product -> UnitOfMeasure, always in that order,
for both paths. A product/unit mismatch is raised differently by each caller: on creation it is an invalid choice of
inputs (`formula_revision_id`-keyed); on an update to an already-pinned plan the identical mismatch is source drift
(`target_output_quantity`-keyed, since the plan's links themselves are immutable). Reusing one locking helper for two
different error-reporting decisions is why that split exists as `_check_create_compatibility` versus
`assess_source_drift_from_context`, rather than two separate lock sequences.

**Lock order compatibility.** Verified against the existing write paths before choosing it: `update_sales_order`
locks only the `SalesOrder` row; `update_formula_revision` locks revision+formula+output-unit together; `approve_
formula_revision` locks revision, formula, policy, product, units, materials, always product/units after the
revision; master-data deactivation locks only its own row. No path here ever locks a `SalesOrder` after a
`FormulaRevision`, or a `Product`/`UnitOfMeasure` before one, so batch-plan locking cannot cycle with any of them -
verified with real-thread races (product/unit deactivation, order-line product replacement, concurrent creations).

**Not built (by decision).** Official batch numbering/sequencing, MRP/printing/label/box/insert/requisition-status
fields, store requisitions, stock availability/reservation/issue/consumption, production/packaging/QC-release/
dispatch, any approve/cancel/release/lifecycle transition on a plan, and automatic formula-revision selection.

---

# Backend Decisions — Task 12B-1

**`product_type` is free text, deliberately not an enum.** The client supplied one example value ("Tablets"); a
`choices=` field would silently reject every other real value the client uses that has not yet been seen. This
mirrors `description`'s own treatment (optional, independently PATCH-able, cleared with `""`), not `code`'s
(immutable, validated identity).

**Why `Customer.code` was analyzed, not used, for "Company Code" = `GER`.** The field fits mechanically, but
`Customer` rows (and therefore `Customer.code`) are scoped to one operating company (Task 10A's still-provisional
choice, A13). A client who transacts with both operating companies sharing this store would need two `Customer` rows
today, with nothing forcing the same code on both - using `Customer.code` as "the" client code without resolving A13
first would be building on an assumption the client has not confirmed. No `Customer` row was created in this task.

**Why the unit-compatibility gap was documented instead of patched.** Task 12A's same-unit rule
(`apps.batch_plans.services._check_create_compatibility`) is a deliberate safeguard, not an oversight - relaxing it
to accept the client's bottles-vs-kilograms sample would silently start accepting *any* mismatched unit pair. A
conversion factor was not added either, because bottle-to-kilogram depends on a product's packing content (an
unmodeled concept) and is not a fixed ratio across products - and even the one ratio the client supplied does not
reconcile exactly against their own recorded Batch Size (75.6 kg computed vs. 76 kg recorded), so inventing a
"correct" factor now would encode a guess as if it were confirmed policy.


---

# Backend Decisions — Task 12B-2

**Why `canonical_factor` lives on `UnitOfMeasure` itself, not a separate conversion table.** Every conversion this
slice needs is "how many of this dimension's smallest unit does one of this unit equal" - a per-unit scalar, not a
per-pair rate. A dedicated `A-to-B` conversion table would let the same physical relationship be entered
inconsistently (e.g. g-to-kg = 1000 in one row, kg-to-g = 0.0009 in another, rounded differently) and would need its
own reflexivity/transitivity rules. A single canonical factor per unit makes every pair within a dimension
consistent by construction and needs no reverse-relationship bookkeeping.

**Why Shape A/B are mutually exclusive rather than "packing fields override the same-unit rule."** Letting a caller
supply packing fields on top of already-matching units would raise the question of which one governs if they ever
disagreed after a later master-data change - there is no client-confirmed answer to that. Requiring exactly one
shape (all three packing fields, or none) keeps the two paths independent and unambiguous.

**Why `target_output_quantity` was never allowed to be derived from `planned_pack_quantity x packing_content_
quantity`.** The task's own client example does not reconcile (75.6 computed vs. 76 entered) - if the system derived
the target automatically, it would either silently discard the client's own entered number or silently overwrite it,
neither of which is an acceptable substitute for asking the client why the two differ.

**Why approval's product/output-unit check was split rather than removed outright.** The original check bundled two
unrelated things - company consistency (a real invariant) and unit equality (no longer one, Task 12B-2) - into one
blocking reason. Splitting them means the company-consistency safeguard (`INCONSISTENT_PRODUCT_COMPANY`) keeps firing
exactly as before, verified by a dedicated test that forces the inconsistency directly (never reachable through the
ordinary API).

**Why `_lock_source_context` now locks every referenced unit together in one query.** Locking the pack unit, output
unit and (if supplied) packing content unit one at a time, in an order that could vary by which fields were
supplied, would risk two requests locking the same two units in opposite orders. Locking the full, deduplicated,
ascending-id set in a single statement (mirroring `apps.formulas.approval.lock_and_load_approval_context`'s existing
multi-unit lock) removes that risk entirely regardless of how many of the three units happen to coincide.


---

# Backend Decisions — Task 12C

**Why `batch_plan` is a `OneToOneField`, not a `ForeignKey`.** The task explicitly asked for "one preparation record
per BatchPlan" as a bounded initial slice, not a confirmed multi-store-routing policy. A `OneToOneField` makes that
rule a database-level guarantee (the same pattern `FormulaApprovalPolicy` already uses for "one policy per company")
rather than an application-level check that a race could defeat - and a concurrent duplicate attempt then fails as a
clean `IntegrityError` -> `Conflict`, never a lost update or a 500.

**Why company access is re-derived from the batch plan, not carried as its own field.** `StorePreparation` has no
`company` FK of its own - its operating company is always `batch_plan.company`, read live. Duplicating it as a
separate column would create a second copy that could theoretically disagree with the plan's own company (which is
itself immutable, so in practice it never would) - reading it through the relationship keeps there being exactly one
place that fact lives.

**Why the dual-access rule (store permission AND company `batch_plans.view`) was copied from Task 09A receiving
rather than invented fresh.** This module has the identical shape receiving already solved: a store-scoped record
whose source document belongs to one specific operating company. Reusing `companies_with_po_view_access`'s exact
pattern (as `companies_with_batch_plan_view_access`) means this task inherits an already-reasoned-through answer to
"does store access ever imply company access" (no) instead of re-deciding it.

**Why `insert_required` is a plain nullable `BooleanField`, not a `TextChoices` with a "NOT_APPLICABLE" value.** The
client's own confirmed rule maps cleanly onto three states a boolean-with-null already expresses: unanswered
(`null`), required (`true`), not required/N/A (`false`). Introducing a fourth textual state would imply a
distinction between "not required" and "not applicable" that the client's own register does not draw - their sample
row uses `N/A` exactly where this project would store `false`.


---

# Backend Decisions — Task 12D

**Why the client code namespace is `(operating_company, client_code_snapshot, allocation_year)` and not something
that spans companies.** `Customer` rows are already company-scoped (Task 10A, still provisional - A13), so "the
customer coded GER" is not a single, cross-company identity today; asking the sequence to be globally unique per
code would require resolving A13 first, which this task was explicitly told not to do. Scoping the counter to the
operating company as well means two different companies' customers sharing a code get independent sequences (and,
consequently, can produce the identical displayed number) - documented as an open question rather than silently
avoided by inventing a cross-company customer merge.

**Why the counter is a separate table, not a field on `BatchPlan` or `Customer`.** A sequence counter's entire
purpose is to be locked and incremented independently of the record that triggers it - putting `last_sequence` on
`Customer` would mean locking a customer row (already a busy, frequently-read row) for every allocation in every
namespace that customer participates in, and would conflate "the customer's own data" with "an internal counting
mechanism that happens to be keyed partly by the customer's code." A dedicated table with its own lock scope is the
same reasoning already applied to `BatchNumberAllocation` itself.

**Why order-then-customer is the locking sub-order, not customer-then-order.** `apps.sales_orders.confirmation`'s
`load_locked_confirmation_context` already locks (order held by caller) -> policy -> customer -> products -> units.
Reusing that exact relative order for allocation (order -> customer) means the two code paths can never deadlock
against each other even when they lock overlapping rows - verified with a real-thread test where a concurrent
`update_sales_order` customer change waits for an in-flight allocation's lock on the order, exactly as any other
order-mutating path already would.

**Why a full save-then-reject-on-existing-pk is used for immutability instead of overriding only specific fields.**
Every other model in this project that needs partial immutability (e.g. `BatchPlan.sales_order_line`) compares
individual fields against the original row. `BatchNumberAllocation` has no field that is EVER legitimately
re-saved after creation - the whole record is written once, by one code path, and never touched again - so
rejecting any `save()` on an existing row outright is simpler and strictly stronger than a field-by-field check, and
cannot be defeated by a future field addition that forgets to add itself to an allow-list.
# Backend Decisions — Task 13A

**Why the lock order is `BatchPlan -> FormulaRevision -> ... -> Materials`, not the other way round.** Two existing
paths already fix a relative order that touches these same rows: `apps.batch_plans.services.update_batch_plan`
locks `BatchPlan` first, then (for a quantity edit) works down to `FormulaRevision`/`Product`/`Unit`s; `apps.
formulas.approval.approve_formula_revision` locks `FormulaRevision` first, then `FormulaApprovalPolicy` ->
`Product` -> `Unit`s -> `Material`s. Neither path ever locks a `BatchPlan` after a `FormulaRevision`, or the
formula-side rows before a `BatchPlan`. Requisition creation needed both halves (a locked plan version check, and a
locked, consistent read of the recipe) - concatenating the two orders (`BatchPlan` then the untouched second half of
`lock_and_load_approval_context`) was the only choice that could not introduce a new deadlock cycle against either
existing path, and reusing `lock_and_load_approval_context` outright (rather than re-deriving the same multi-row
lock by hand) means this task's own lock code is exactly as correct as the already-tested approval path's.

**Why `expected_batch_plan_version` is a distinct field, not the requisition's own `expected_version`.** At create
time the requisition does not exist yet, so it cannot have its own version. Naming the field after what it actually
checks (the SOURCE plan's version, not this new record's) was chosen specifically so a frontend cannot confuse "the
plan version I reviewed" with "the requisition version I'm about to receive" - a mistake that would otherwise be
easy to make, since both are plain integers named `version` on their respective resources.

**Why `requested_quantity` auto-population checks a 3-decimal-place fit on the exact `Fraction`, not the
calculator's own `is_exact` flag.** `apps.formulas.requirement_preview`'s `is_exact` is decided at 50 significant
digits (ROUND_HALF_EVEN) - a value can be `is_exact: true` there while still needing far more than 3 decimal places
to write out in full (e.g. 1/8 = 0.125 is fine, but a value needing 6+ decimal places to terminate is `is_exact` at
50 digits yet cannot fit `DecimalField(decimal_places=3)` without rounding). Reusing `is_exact` directly would have
either silently rounded such a value (violating "never silently round") or rejected values that actually DO fit in
3 places. A separate, narrower fit-check on the same already-computed `Fraction` was the only way to get the correct
answer for THIS field's specific precision without changing the shared calculator's own, already-tested exactness
definition.

**Why source drift compares `target_output_quantity_snapshot` against the plan's live value, not `BatchPlan.
version`.** `BatchPlan.version` bumps for several reasons, not all of them quantity-related - Task 12D's official
batch number allocation is the clearest example, and the task's own instruction explicitly warned against treating
that allocation as quantity-affecting drift. Comparing the actual field that drives every line's calculation (the
target quantity itself) is the only check that is correct regardless of which OTHER reason caused a version bump;
`plan_version_changed` is still reported separately, purely as an informational "something happened" signal, never
as the basis for a blocking decision.

**Why `calculation_snapshot` is one JSON column per line, not a `DecimalField`.** The exact calculated requirement
is not always representable as a finite decimal at all (a non-terminating ratio like 1/3) - the calculator's own
established representation for that case is a formatted string plus `is_exact`/`is_approximate` flags, not a
`Decimal`. Storing anything less than that full structure would either force a premature rounding decision at
persistence time (exactly what the calculated value must NOT do) or silently drop the "this is an approximation"
signal the rest of the codebase already relies on for the identical situation.

**Why lines can only be edited, never added or removed, in this initial task.** The lines are entirely auto-fetched
from the pinned formula revision at creation - there is no concept of a requisition line that doesn't correspond to
a real recipe line. Supporting add/remove would mean deciding what a requisition line WITHOUT a recipe line even
represents (a genuinely open, unscoped question - is it a top-up request, a substitution, a manual addition outside
the formula?), which this bounded task was explicitly told not to invent an answer for. The PATCH semantics were
written to say so explicitly, rather than silently allowing something that looks like the established full-replace
convention but actually is not.

**Why the company-access check requires `formulas.view` in addition to `batch_plans.view`, applied identically to
every endpoint including list.** A material requisition's entire reason to exist is to carry recipe-derived
quantities - unlike `StorePreparation`, which never exposes the formula at all, there is no version of this
resource that omits that data. Gating only the detail endpoint and not list/create would have let a
`formulas.view`-lacking caller learn that formula-derived requisitions exist (via list) even while being denied
their content - the same reasoning `apps.batch_plans`'s own requirement-preview endpoint already applied to a single
endpoint, extended here across an entire app's surface because every endpoint in this app shows recipe-derived data.
# Backend Decisions — Task 13C

**Why `source_receipt_line` is a `OneToOneField`, and no separate `MaterialLot` table exists.** The task's own
instruction was explicit: "if `MaterialLot` is needed, use an internal identity tied to the source receipt line
for this slice." A `OneToOneField` gives two things at once with zero extra schema: it IS the lot identity (each
posted receipt line corresponds to exactly one internal identity), and it enforces "one `RECEIPT_IN` movement per
source receipt line" as a real database constraint, not an application-level check that could race. Introducing a
separate `MaterialLot` row per line would have added a table with no distinguishing field of its own in this
slice (no expiry, no separately-editable identity) - pure overhead the task's own "minimal" instruction ruled out.

**Why `source_company`, not `owning_company`.** `docs/shared-store-inventory-plan.md` (Task 13B) had used
`owning_company` for the equivalent field in its own proposal. This task's brief was explicit that legal ownership
must not be assumed or invented - keeping that field name would have silently answered a question nobody has
asked the client yet, just by existing in an API response. Renaming it to `source_company` (and writing "receiving/
purchasing company CONTEXT only" directly into the model's own docstring) means the field cannot be mistaken for
an ownership claim by a future reader who never sees this decision log.

**Why `release_status` is a computed literal string, not a model field.** A model field - even a `BooleanField`
defaulting to `False` - would need SOME default value, and any default is itself an implicit claim ("nothing is
released yet" vs "everything defaults to released"). The task's own instruction was specific: describe release as
"Not tracked," not as rejected, held, or released. Making this a `SerializerMethodField` that always returns the
literal string `"Not tracked"` means there is no default to accidentally get wrong, and no migration would be
needed later when a real release concept is designed - it simply starts appearing as a real field then, never
silently flipping from an assumed `False`.

**Why balances are computed via `SUM()` at read time, not a stored running counter.** A stored counter needs its
own concurrency protection (a second row to lock on every write) and can drift from the movement log if a bug ever
updates one without the other - two sources of truth instead of one. Since `StockMovement` rows are already
immutable and this slice has exactly one movement type, a live aggregate query is both simpler and provably
consistent with the ledger by construction; `docs/shared-store-inventory-plan.md` §2 already anticipated this
exact tradeoff and recommended starting with query-derived balances for the same reason.

**Why the balance grouping key is `(material, unit, source_company)`, never just `(material)`.** The task's own
instruction was explicit: never aggregate different units as if they were identical, and never let a total leak
quantities from an inaccessible company. Grouping by all three together satisfies both at once - two rows for the
same material can never be silently summed unless they also share a unit AND a company, which is the only
condition under which summing them is actually meaningful.

**Why movement creation happens inside `post_goods_receipt` itself, not via a signal or a separate call site.**
This project has no precedent for Django signals anywhere, and a signal would make the "movement/audit failure
rolls back receipt posting together" guarantee harder to see by reading the posting function alone - a future
maintainer would need to know a signal exists elsewhere to understand the full transaction. Adding one explicit
function call, in the same file, in the same `@transaction.atomic` block, keeps the whole guarantee visible in one
place, matching how every other cross-cutting effect in this codebase (audit `record()` calls, permission checks)
is already done: an explicit call at the point of use, never an implicit hook.

# Backend Decisions — Task 14A

**Why the raw uploaded file is never stored anywhere.** No storage backend (`MEDIA_ROOT`/`STORAGES`) is configured
in this project at all, and the task's own instruction preferred discarding raw bytes over configuring one just
for this slice. Parsing once, in memory, and persisting only the normalized `ProductImportRow`s (already exactly
what the paginated preview needs to display) means there is nothing to protect on disk, nothing to clean up later,
and no path-traversal or arbitrary-file-read surface to worry about at all - the safest option was also the
simplest one. `source_checksum` (sha256 of the bytes) is kept purely so a caller re-uploading the identical file
is recognisable later, never to reconstruct the file.

**Why `ProductImportBatch.version` never increments.** Every other versioned resource in this project bumps
`version` on every real content change, because there is always a NEXT legitimate edit to protect against a lost
update on. This resource has none: after `PREVIEWED`, the only thing that can ever happen to it is the single,
one-way `COMMITTED` transition - there is no PATCH, no second field anyone could race to change. Bumping `version`
at commit would actually break the exact repeat-safety this task requires: a caller retrying a lost response with
the SAME token it originally received would then see a version mismatch (`409`) instead of the idempotent success
the task explicitly asks for ("a repeated successful commit must return the original result"). Keeping `version`
fixed and using `status` itself (checked under the row's own lock) as the concurrency guard satisfies both this
task's literal requirement and the project's usual "always require an explicit token" convention, without the two
pulling against each other.

**Why commit builds `Product` instances directly (with an explicit `.clean()` call) plus `bulk_create()`, instead
of calling `apps.products.services.create_product` once per row.** `create_product` is correctly designed around
ONE row at a time - its own `@transaction.atomic`, its own `IntegrityError` catch, its own audit `record()` call.
Calling it 2000 times would mean 2000 nested savepoints and 2000 individual `INSERT` round-trips where one
multi-row statement suffices, and it would produce 2000 audit rows for a single logical action. Reusing
`Product.clean()` directly - the actual shared validation/normalization logic, not a second parallel copy of it -
keeps the "reuse existing validation" instruction honestly satisfied without paying `create_product`'s one-row-at-
a-time overhead; `bulk_create()` is then a deliberate, documented performance choice for the WRITE only, not a way
to skip validation (every value was already normalized identically during preview, and `.clean()` still runs, in
memory, as a real re-check).

**Why file-level and row-level errors are two separate lists (`file_errors` on the batch, `errors` on each row)
rather than one merged list.** A header problem (missing/duplicate/unsupported column, bad encoding) makes EVERY
row unparseable at once - reporting it once, at the file level, is both more useful to a caller (one clear reason,
not the same reason repeated on 2000 phantom rows) and cheaper (no need to fabricate 2000 row objects just to hold
an identical error each). A genuinely per-row problem (a duplicate code, an unknown unit) is fundamentally
different in scope and stays where a caller would look for it - on that row.

**Why ownership is folded into the SAME 404 as company access, rather than a distinct 403.** The task's own
instruction was explicit: another user, even within the same company, must never be able to read or commit a
preview they did not create. Returning a 403 would confirm the batch id exists and belongs to someone; folding it
into the same "not found" response `_get_company_for_action` already uses for an inaccessible company means a
caller genuinely cannot distinguish "this id never existed," "it's a different company's," and "it's a different
user's within my own company" - consistent with this project's "fold into 404" rule everywhere else.

**Why every endpoint requires all three of `products.view`/`products.create`/`products.import` together, rather
than splitting them across preview vs. commit.** The task listed all three without specifying a split, and a CSV
import is one bulk-creation capability end to end - a caller who can preview but not commit (or vice versa) is not
a scenario the task described. Requiring the same three permissions everywhere is the simplest reading that keeps
the new `products.import` permission meaningfully additive (someone with only `products.view`+`products.create`
still cannot use this feature at all) - documented here as a WORKING DECISION for this first slice, open to a
finer split if the client asks for one later.

# Backend Decisions — Task 14B

**Why this is a separate, freshly written implementation rather than a shared "import engine" refactor of Task
14A's `apps.product_imports`.** The task's own instruction was explicit on this point, and the actual shapes
genuinely differ enough to justify it: a product import is a flat list of independent rows; a formula import has
a genuine two-level ROW/GROUP structure (many material lines belong to one prospective formula), its own cross-
row consistency rule (group-header agreement) that has no equivalent in the product import at all, and a
materially different creation graph (four model types - `Formula`/`FormulaRevision`/`FormulaLine`/
`FormulaRevisionContributor` - versus one). Forcing both through one generic engine would have meant either
bloating it with formula-specific branches or abstracting away the very differences each app most needs to get
right. Some small pieces necessarily look similar (header/file-error parsing, the `version`-never-increments
concurrency pattern) - these are deliberately duplicated, not shared, so each app's rules can evolve
independently without one file's change silently affecting the other's validation.

**Why `shared_catalog.view` is checked via the underlying `user_has_permission_in_any_store` helper, not the
`CanReadSharedCatalog` permission class.** The task's own instruction was explicit on two points that are in
tension with each other if read literally: "reuse the current `shared_catalog.view` authorization rule" AND "no
superuser... operational bypass." `CanReadSharedCatalog` (the permission class ordinary material-catalog GET
endpoints use) satisfies the first instruction but not the second - it grants an explicit superuser bypass for
reads, which is fine for a read-only catalog lookup but not something this task can inherit for its own
formulas.view/create/import checks, which explicitly forbid any bypass. Calling the underlying store-permission-
existence check directly - the actual RULE ("holds `shared_catalog.view` in at least one active store") - reuses
exactly what was asked for while dropping the incidental superuser convenience the class also happens to bundle,
resolving the tension in favor of the more specific, more recent instruction.

**Why an existing formula code is rejected even when the existing formula is only a DRAFT.** `Formula.code` is
unique per `(company, code)` regardless of any revision's status - there is no "reserve a code provisionally"
concept, the identical reasoning `Product.code`'s own "deactivating never frees a code" rule already documents
for the same kind of identity field. The task's own instruction made this explicit rather than leaving it to be
inferred, which matters here specifically because a DRAFT formula might look "not really committed yet" to a
casual reader - it is still a real, permanent identity claim on that code.

**Why group-header consistency compares parsed `Decimal` values for `base_output_quantity`, never the raw
strings.** Two rows genuinely agreeing that a formula's base output is "100" should never be flagged as
conflicting just because one row happened to type `"100.000"` - `Decimal("100") == Decimal("100.000")` is `True`
in Python, so comparing the ALREADY-PARSED values (never the original cell text) gets this right for free, with
no extra normalization step and no risk of a false-positive conflict rejecting an otherwise perfectly good file.

**Why the `UnitOfMeasure` lock at commit discovers which ids to lock via one UNLOCKED read first, rather than
locking `Material` before `UnitOfMeasure`.** The established pairwise lock orders this task must extend without
reversing (`lock_and_load_approval_context`, `_lock_source_context`) both put `Product` before `UnitOfMeasure`
before `Material`. But which unit ids need locking depends partly on which materials are involved (their own
`base_unit`) - information not yet known before materials are locked. `lock_and_load_approval_context` resolves
the identical chicken-and-egg problem the identical way: an unlocked read purely to discover ids (there, via a
join through already-existing `FormulaLine` rows; here, via a plain `Material.objects.filter(...).values_list
("base_unit_id", ...)`query) - never trusted for `is_active` correctness on its own, only for which rows the
real, authoritative lock afterward needs to cover. This keeps the established order intact rather than
introducing a new one.

**Why `Formula`/`FormulaRevision`/`FormulaLine` are re-fetched by their natural unique key immediately after
each `bulk_create()`, instead of using the objects `bulk_create()` returns directly.** Django's `bulk_create()`
on PostgreSQL does populate primary keys via `RETURNING`, and in ordinary practice the returned list's order
matches the input `VALUES` order for one INSERT statement - but this is not a documented, contractual guarantee,
and this task's own correctness bar ("no partial formulas", "never an unhandled 500") is high enough that relying
on an unwritten implementation detail across potentially several internally-chunked INSERT statements (for a
large import) was judged not worth the risk. One extra `filter(...code__in=...)` query per model type is cheap
and removes the assumption entirely - the SAME reasoning Task 14A already applied to its own `Product` bulk-
create, extended here to two more model types.

**Why a genuine query-count bug (`group.lines.order_by("line_number")` bypassing the `prefetch_related` cache)
was caught by this task's own required performance test, not assumed away.** The representative 100-formula
test's first run showed 132 total commit queries - visibly not "a small constant" for 100 groups. Calling
`.order_by(...)` on a prefetched related manager builds a NEW queryset that Django does NOT recognize as "the
same query already prefetched," so it silently re-hits the database once per group instead of reading the
already-fetched in-memory list. Since `FormulaImportLine.Meta.ordering` already defaults to `line_number`, the
fix was simply to use the bare `.all()` call the prefetch was actually keyed on - dropping the count to 32
regardless of group count. This is exactly the kind of "avoid one query per row" regression the task asked this
performance test to be capable of catching, and it did.

# Backend Decisions — Task 14C

**Why this app has NO `company` field anywhere, unlike Tasks 14A/14B.** `apps.catalog.models.Material` itself
has no company FK - it is deliberately a shared, cross-company identity (the same reasoning `apps.stores.models.
SharedStore` already documents for the identical shape of design choice). Giving the import batch a company
would either be meaningless (which company would it be?) or would silently start treating materials as company-
owned, contradicting the very model this import exists to populate. This is the one place across all three
import tasks where "reuse the established pattern" correctly means "drop the company axis entirely," not "keep
it out of caution."

**Why authorization is `IsActiveSuperuser`, not a company/store permission check like Tasks 14A/14B.** The
task's own instruction was explicit and specific: "match the existing material-create authorization... if
current material creation is active-superuser-only, preserve that restriction; do not allow shared_catalog.view
to create materials." Direct inspection of `apps.catalog.views` confirmed exactly that - `MaterialListCreateView`
gates every non-GET method behind `IsActiveSuperuser`, with `shared_catalog.view` (`CanReadSharedCatalog`)
wired to GET only. This is the ONE place in this project's whole import-task series where reusing `IsActiveSuperuser`
is not a forbidden "operational bypass" - it IS the actual, sole, already-established gate for this specific
resource, with no parallel company/store permission this import could reuse instead. No new permission was
invented, matching the task's own "do not invent a new permission unless existing conventions require it."

**Why ownership is still enforced even though every caller is already a superuser.** Being a superuser answers
"can this person manage the catalog at all," not "did this person create this specific preview." The task's own
instruction ("other users must not retrieve or commit someone else's preview") applies even among superusers -
two different superusers are still two different people who should not see each other's in-progress import
review. `_get_owned_batch` folds a non-owning superuser's read/commit attempt into the same `404` a nonexistent
id would produce, the identical pattern Tasks 14A/14B already use for their own (company + user) ownership axis,
here reduced to (user) alone.

**Why `category_code` was NOT added as a supported column.** The task's own field list named `code`, `name`,
`material_type`, `base_unit_code`, and "optional descriptive fields already supported by material creation."
`Material.category` is a foreign key to `MaterialCategory` - a second master-data identity with its own create/
activate/deactivate lifecycle, not a plain descriptive field like `description`. Including it would add a whole
second resolution dependency (existing/unknown/inactive category codes, its own error category) the task's own
"import dependency order" section never mentions (Units → Materials → Products → Formula drafts has no Categories
step at all). `description` alone is included as the one genuinely descriptive, already-optional field
`create_material` supports beyond the required identity fields.

**Why a genuine "value too long for type character varying(32)" database crash was found and fixed here, and
then backported to Tasks 14A and 14B.** This import's own required-field-length test (`code`/`name` deliberately
too long) surfaced a real, previously-undetected bug: `_parse_data_row` correctly RECORDED a "code exceeds 32
characters" validation error, but still stored the full, untruncated, over-length string onto the staging row
object - and that staging model's own column is `CharField(max_length=32)`, the identical width as the real
`Material.code` it mirrors. `bulk_create()` sent that oversized value straight to PostgreSQL, which raised
`DataError: value too long for type character varying(32)` - an unhandled `500`, directly contradicting this
project's own "never an unhandled 500" rule that every one of these import tasks has explicitly carried. The fix
truncates the STORED value to the column's own width (using the field's own `MAX_*_LEN` constant, so it can never
mismatch the schema) strictly for safe persistence, while the VALIDATION ERROR message still reports the true,
untruncated length - the row is already correctly marked invalid on other grounds, so a truncated display value
changes nothing about the outcome, only prevents the crash. Because `apps.product_imports` (Task 14A) and `apps.
formula_imports` (Task 14B) build their own staging rows the identical way, with staging columns the identical
width as their own real target fields, they carried the exact same latent bug - never triggered by either task's
own original test suite, since neither one happened to test an input long enough to trigger it. Both were fixed
the same way, in the same session, with a regression test added to each confirming a deliberately oversized
`code` now returns a normal `201` preview with a field-level `errors` entry, never a `500`.

# Backend Decisions — Task 15A

**Why submission has no internal permission re-check, unlike `approve_formula_revision`/`allocate_batch_number`.**
This project's `apps.common.errors.Forbidden` exception class exists for exactly ONE documented shape of case:
where the REQUIRED permission itself depends on a row's current state, decided only after that row is locked
(the class's own docstring names `cancel_purchase_request` as the precedent: cancelling a `DRAFT` needs one
permission, cancelling a pending one needs another). Submission's required permission never varies by state - it
is always `material_requisitions.view` + `.submit`, exactly as the task specified. Direct inspection of both
`submit_purchase_request` and `submit_incoming_inspection` - the two existing "DRAFT -> SUBMITTED" services in
this codebase - confirmed neither re-checks permissions inside the service either; both rely entirely on the
view-layer check, which already re-runs on every call. Adding a state-dependent check here would have been
inventing a new pattern this task's own closest precedents do not use, not "matching existing conventions."

**Why `.submit` is deliberately NOT also gated behind `.edit`.** The task's own instruction was explicit, and
checking it against the SAME two precedents confirms it is not an isolated choice: `submit_purchase_request`
requires none of the request's own edit-adjacent permissions beyond `purchase_requests.submit` itself, and
`submit_incoming_inspection` requires only its own submit-shaped gate. Submitting is a distinct ACTION from
editing in every existing lifecycle transition in this codebase - never a special case of editing that happens
to also change `status`. A user may therefore hold create/edit, submit, both, or neither, independently.

**Why this is the first service to lock a `MaterialRequisition` and a `BatchPlan` together, and why the
requisition is locked first.** Neither existing path needed this combination before: `create_material_
requisition` locks the `BatchPlan` while the requisition row does not exist yet (nothing to lock), and
`update_material_requisition` never touches the `BatchPlan` at all (it reads drift unlocked, since an ordinary
edit does not need to freeze the plan against a concurrent change - only submission's one-way, irreversible
transition does). With no established relative order to extend, the requisition was chosen to lock first
because it is the actual target of this action - the same reasoning `submit_incoming_inspection` applies by
locking the `IncomingInspection` itself before anything else, even though its source `GoodsReceipt` is also read
in the same function body.

**Why `FormulaRevision` is read unlocked here, while `BatchPlan` is locked.** The distinguishing question this
task's own instruction surfaces is not "is this a source record" but "can this source record's relevant field
actually change out from under an in-flight transaction." `BatchPlan.target_output_quantity` demonstrably can
(`update_batch_plan` is a real, exposed mutation) - `FormulaRevision.status` cannot move away from `APPROVED`
once set (no unapprove path exists anywhere in this codebase, Task 11C's own confirmed one-way design). Locking
a row that nothing can actually change buys no additional correctness and only adds unnecessary contention;
`submit_incoming_inspection` already established the identical judgment call for `GoodsReceipt.status` once
`POSTED`, reused here for the identical reason rather than re-derived.

**Why the "missing explanation for an override" test manufactures its edge case via a direct `queryset.
update()`, rather than through the ordinary PATCH API.** `update_material_requisition` already prevents a
client from ever saving a `requested_quantity` that differs from the exact calculated requirement without a
`quantity_remark` - there is no supported path to create that inconsistent state through this project's own
API. Proving that SUBMISSION independently re-derives and re-checks the same exact comparison - rather than
merely trusting whatever the last successful PATCH happened to validate - requires a state the API itself would
never produce; a direct `QuerySet.update()` (the same clean()-bypassing limitation every "immutable" model in
this codebase already discloses) is the honest way to construct it, and is documented in the test itself as
exactly that, never presented as a realistic user-reachable scenario.

**Why `test_no_lifecycle_endpoints_exist` was renamed and edited, not left to fail.** That test asserted
`/submit/` itself returned `404` - true before this task, now false, since the whole point of Task 15A is that
endpoint existing. Editing a pre-existing test's expectation is normally something to flag rather than do
silently; here the change is the direct, intended consequence of the task's own stated goal (adding exactly
this endpoint), so the correct action was to update the assertion precisely (remove `submit` from the "still
doesn't exist" list, add explicit coverage for it elsewhere via the new `SubmitTests` class) and name the change
in both the test's own comment and in `docs/backend-tasks.md`, rather than leave a now-false assertion in place
or delete the test's remaining, still-valid coverage of the other lifecycle actions.

# Backend Decisions — Task 15B

**Why this app has no model, and therefore no migration at all.** The task's own instruction was explicit - "no
duplicated register table" - and there is genuinely nothing this endpoint needs to persist: every value it
returns is read fresh from `BatchPlan` and its existing relations at request time. Adding a model (even a pure
cache/denormalization table) would have been inventing storage the task specifically ruled out, purely to make
the app "look like" every other app in this project. An app with views/services/urls and no `models.py` is
unusual for this codebase but not unsupported by Django, and is the most literal, honest way to satisfy "this
is a read model over existing records" - there is no second source of truth to ever drift from the real one.

**Why the register's own `source_drift` field is a deliberately TRIMMED version of `assess_source_drift`'s
real return value, not the raw dict.** `apps.batch_plans.services.assess_source_drift` already returns
`current_source_state`, which itself includes `order.order_date` and `order.customer_id` - exactly the two
pieces of information this endpoint's own `order_context`/`customer` sections independently gate behind
`sales_orders.view`/`customers.view`. Passing the raw drift dict through unfiltered would have silently
bypassed those two gates for any caller who lacks them but still sees `source_drift` - a real leak through a
field nobody would think to audit for it, since the field's own name ("drift") gives no hint it also carries
order/customer identity. Stripping `source_drift` down to `is_incompatible` + `issues` (whose own message
strings were separately confirmed to reference only product/unit CODES - already unconditionally visible via
`BatchPlan`'s own snapshot) closes this precisely, rather than either leaking the extra fields or hiding the
drift signal entirely.

**Why a caller with partial (not zero) store access to a permission type can still distinguish "exists
somewhere else" from "does not exist at all" for one row - and why that residual gap is disclosed rather than
also closed.** Closing it completely would require treating EVERY row as `restricted` for that section unless
the caller has that permission in literally every store that could ever hold such a record - which would also
hide genuine, legitimate data from a caller who correctly has access to the ONE store this system actually
uses today, defeating the section's entire purpose for the common case to protect against a multi-store
scenario this project does not yet have. The zero-access case (no store membership for that permission at all)
IS fully closed, because it is both the realistic unauthorized case (a pure company-level planner with no
store role) and the one closeable without sacrificing real data for anyone - see `_store_preparation_context`'s
own docstring in `apps/batch_register/services.py` for the exact boundary, stated precisely rather than
claimed as airtight.

**Why `customer`/`order_date_*` filters require their own permission (403 if missing) rather than silently
being ignored or silently filtering nothing.** This project's own established convention for an unauthorized
or unknown query parameter is to reject it loudly, naming what is wrong (see e.g. `apps.batch_plans.views`'s
own "unknown query parameter" 400) - silently ignoring a filter the caller cannot legitimately use would mean
a request "succeeding" while quietly not doing what was asked, which is worse than an explicit, named refusal
and is also the one case this task's own "search/filter behavior must not leak restricted information"
instruction is most directly about: a filter that silently degrades to "no filter" on an unauthorized value
could still be used to probe whether ANY row matches a guessed date/customer, which a loud 403 prevents by
refusing the request outright rather than returning a quietly-unfiltered result.

# Backend Decisions — Task 15B.1

**Why `exists: false` requires coverage of EVERY active store, not just "the caller has the permission
somewhere."** `StorePreparation.store`/`MaterialRequisition.store` are each a free `ForeignKey` to ANY active
`SharedStore` - confirmed by reading `apps/store_preparation/models.py` and `apps/material_requisitions/
models.py` directly, not assumed. Nothing ties a particular batch plan, or its company, to a particular store
at all: any store a creator has the right permission in can hold the ONE preparation/requisition for ANY
plan whose company that same creator also has `batch_plans.view` in. That means a caller's own store access
set tells you nothing about where a record COULD exist except by elimination - the only safe moment to assert
"no record exists" is when there is no store left outside the caller's own access where one could be hiding.
Any looser rule (e.g. "safe once the caller has the permission in at least one store") is exactly the rule
Task 15B shipped with, and exactly what this task was asked to close - demonstrated, not assumed, by a test
that put a real `StorePreparation` in a second store and showed a partially-authorized caller could tell it
apart from a plan with no preparation at all, before this fix.

**Why this doesn't mean "callers need to be granted every store to see this register usefully."** The task's
own instruction was explicit: do not require access to every store. The fix only changes what is reported for
ONE field's absent-record case; the base register row, every other section the caller IS authorized for, and
full detail for a record that DOES live in an accessible store are all unaffected - a caller with access to
one store out of several still sees everything they are entitled to, in full, for every row; they only lose
the ability to assert "and nothing exists elsewhere either," which was never a safe claim for them to make in
the first place.

**Why `formulas.view` on the requisition section bypasses the store-coverage question entirely.** It is a
flat, company-level, non-existence-dependent gate - unlike the store permission, no amount of "coverage" makes
it safe to disclose requisition existence without it, because `apps.material_requisitions` itself enforces
the identical dual rule on the real resource. Full store coverage on its own must never be allowed to
substitute for a missing company-level gate - `_material_requisition_context` checks `formulas_ok` first,
unconditionally, before even looking at store coverage.

**Why `order_context`/`customer`/`product_type_current` were left untouched.** Every `BatchPlan` row has
exactly one `sales_order_line`, one `sales_order`, one `customer`, one `product` - these foreign keys are
non-nullable at the database level, confirmed by reading `apps/batch_plans/models.py`. There is no "does it
exist" question for these three sections at all, only "am I allowed to see it" - a flat permission denial via
`{"access": "restricted"}` leaks nothing, since the thing being restricted unconditionally exists for every
row by construction. Changing these to `unavailable`, or applying a coverage rule to them, would have been
scope creep against this task's own "do not redesign unrelated modules" instruction, solving a problem that
does not exist for them.

**Why the `source_drift` redaction only touches three of the eight possible issue codes.** Auditing every
`assess_source_drift` issue message (step 3 of this task) found that `INCOMPATIBLE_PRODUCT_DRIFT`/`PRODUCT_
RENAMED`/`INACTIVE_PRODUCT` are the only three that reference the sales order line's CURRENT product -
`current_product.code`/`current_product.is_active` - live state this exact endpoint already gates behind
`products.view` via `product_type_current`. The other five (`INCOMPATIBLE_UNIT_DRIFT`, `LINE_NUMBER_CHANGED`,
`UNIT_RENAMED`, `INACTIVE_OUTPUT_UNIT`, `INACTIVE_PACKING_CONTENT_UNIT`) reference only unit codes (already
unconditionally visible via the row's own ungated `output_uom_code` field - there is no `units.view` concept
anywhere in this API) or the order line's position number (not disclosed, and not gated, anywhere else in this
API either) - redacting them would hide information that was never behind a gate to begin with, for no
security benefit. Only `message` is redacted, not `code`/`blocking`, because the CODE alone ("a product-drift
issue exists") doesn't reveal the live code or active-state value itself - only the message's interpolated
text did.

# Backend Decisions — Task 15B.2

**Why the full-store-coverage exception was removed entirely rather than patched to also exclude inactive
stores.** The natural-seeming patch - compare the caller's store ids against every `SharedStore` row
regardless of `is_active`, not just active ones - was considered and rejected. `active_stores_for_user`
(reused unmodified from `apps.stores.services`) only ever returns ACTIVE stores, by design, for every other
permission check in this entire project; a caller's own access set can therefore never equal a "including
inactive stores" universe except in the degenerate case where no store has ever been deactivated. That patch
would have made the already-narrow "safe to disclose `exists: false`" case even narrower - correct, but adding
complexity to preserve a code path that would then almost never fire in any system with real operational
history (stores do get decommissioned). Given the task's own "prefer the simpler contract" instruction, and
that there was no way to make the check cheap AND complete (enumerating "every store that was ever active"
forever, rather than "every store that is active now", requires trusting that deactivation is the only way a
store's relevance ends - a stronger assumption than this module should rely on), removing the exception and
never disclosing `exists: false` for an absent record was the correct simplification: provably safe under
every store lifecycle, not merely safe under the ones this task happened to test for.

**Why `exists: true` for a genuinely accessible record was left completely unaffected.** The leak this task
closes is specifically about the ABSENCE side of the contract - claiming "nothing exists" when the truth is
unknowable. There is no analogous ambiguity on the PRESENCE side: if `preparation.store_id` is one of the
caller's own current `store_prep_store_ids`, the record definitely exists, is definitely in a store the caller
currently has `store_preparation.view` in, and showing its fields reveals nothing the caller isn't already
entitled to see in full via `apps.store_preparation`'s own existing endpoints. Removing the ability to ever say
"no record exists" does not mean also hiding a record that genuinely IS visible - that would have been an
unjustified loss of authorized detail, which the task explicitly warned against ("Preserve authorized
details").

**Why `source_drift` gained a nested `product_detail` sub-section instead of simply dropping the three
product-gated issues from the flat `issues` array.** Task 15B.1 redacted only the `message` of `INCOMPATIBLE_
PRODUCT_DRIFT`/`PRODUCT_RENAMED`/`INACTIVE_PRODUCT`, which this task found insufficient: the bare CODE already
names the protected fact (seeing `"INACTIVE_PRODUCT"` in a list is itself the disclosure, regardless of what
the message next to it says). The next-simplest fix - just omit those three issues from `issues` entirely when
`products.view` is missing - was rejected in favor of an explicit `product_detail: {"access": "unavailable"}`
sibling field, for the same reason every other optional section in this register uses an explicit marker
rather than silent omission: a caller comparing two rows must be able to tell "this register has nothing more
to say about the product here" (an empty, but EXPLICITLY gated, sub-section) apart from "there happen to be no
product-specific issues on this row" (which, with silent omission, would look identical to the gated case -
re-introducing a smaller version of the exact ambiguity this whole task line is about closing). The explicit
field makes the gating itself legible without ever naming what's behind it.

**Why `is_incompatible` stays visible even when it is entirely caused by a hidden `product_detail` issue.**
This single boolean is already part of the EXISTING, authorized `BatchPlan` contract -
`apps.batch_plans.serializers.BatchPlanDetailSerializer.get_source_drift` returns it to any `batch_plans.view`
holder today, with no `products.view` gate at all, confirmed by reading that serializer directly rather than
assuming. Using that pre-existing, shipped boundary as the reference point (as the task explicitly instructed
- "use the existing authorized BatchPlan contract as the boundary") means `is_incompatible` was never this
register's fact to newly protect: it is a plan-level operational signal ("does this batch plan need
attention"), not a specific product fact, and a `batch_plans.view` holder already has standing authorization
to see it via that other endpoint regardless of what this register does. Gating it here would have been
inventing a NEW restriction beyond what the project's own existing API already grants - scope the task warned
against ("do not change mutation validation or grant new permissions" and "do not expand into a general
audit").
