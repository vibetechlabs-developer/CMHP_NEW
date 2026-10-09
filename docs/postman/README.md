# CMHP Local - Postman collection (Tasks 04-11A)

Manually testing the authentication/current-user APIs (Task 04, requests
1-10), the superuser-only user-management APIs (Task 05, the "User
Management - Superuser" folder), the superuser-only company/role
management APIs (Task 06, the "Company Management", "Permission Catalog"
and "Company Role Management" folders), the superuser-only shared-
store/store-role/store-membership APIs plus current-user store-access
endpoints (Task 07A, the "Shared Store Management", "Store Roles and
Memberships" and "My Store Access" folders), the shared material
catalog plus store-specific storage locations (Task 07B, the "Units",
"Material Categories", "Materials" and "Storage Locations" folders), the
superuser-only supplier directory (Task 08A, the "Supplier Management"
folder), the company-scoped, permission-gated Purchase Request
draft/submit/cancel/approve/reject/revise APIs (Task 08B-1/08B-2, the
"Purchase Requests" folder), the Purchase Order draft-and-issue APIs
(Task 08C-1/08C-2, the "Purchase Orders" folder), and the store-scoped
physical-receiving APIs against an issued Purchase Order (Task 09A, the
"Goods Receipts" folder), the store-scoped incoming-QC inspection
DRAFT-recording APIs against a posted receipt line (Task 09B-1/09B-3A,
the "Incoming QC Inspections" folder), the global, superuser-only
material specification DRAFT/versioning foundation (Task 09B-3B, the
"Material Specifications" folder), the company-scoped customer
identity/contact directory (Task 10A, the "Customer Management" folder),
and the company-scoped saleable-product identity record (Task 10B, the
"Product Management" folder), the company-scoped quotation DRAFT
foundation (Task 10C, the "Quotation Drafts" folder), and the
company-scoped direct sales-order DRAFT foundation (Task 10D, the
"Direct Sales Order Drafts" folder), and the company-scoped
manufacturing formula DRAFT foundation (Task 11A, the "Formula Drafts"
folder) against your own
local `D:\CMHP_NEW` dev server. There is still no HR/employee, password-recovery, stock-ledger,
QC disposition/acceptance/release, specification approval/publication,
quotation, sales order, invoice, PDF/email-sending, or other
business-module API - none of that is in this collection because none
of it exists yet. **Manual Postman execution of the Task 06, 07A, 07B,
08A, 08B-1, 08B-2, 08C-1, 08C-2, 09A, 09B-1/09B-3A, 09B-3B, 10A, 10B, 10C, 10D, and 11A
folders is deferred** - they were built and JSON-validated in their
respective sessions but not run through the Postman GUI; the automated
test suites (`tests/test_company_management.py`,
`tests/test_role_management.py`, `tests/test_stores.py`,
`tests/test_store_permissions.py`, `tests/test_catalog.py`,
`tests/test_storage_locations.py`, `tests/test_suppliers.py`,
`tests/test_purchase_requests.py`, `tests/test_purchase_orders.py`,
`tests/test_receiving.py`, `tests/test_incoming_inspections.py`,
`tests/test_material_specifications.py`, `tests/test_customers.py`,
`tests/test_products.py`, `tests/test_quotations.py`, `tests/test_sales_orders.py`, `tests/test_formulas.py`) are what actually exercise this behaviour
today. A separate, real end-to-end HTTP run of the equivalent
procurement/receiving/QC-draft flow (login through cookies/CSRF/Bearer
tokens, not Postman) was executed once against a local dev server for
Task 09B-1 - see `docs/demo-runbook.md`.

## Files in this folder

- `CMHP_Local.postman_collection.json` - the 10 top-level Task 04
  requests, in order, plus twenty-two folders: "User Management -
  Superuser" (Task 05, 12 requests), "Company Management" (Task 06, 6
  requests), "Permission Catalog" (Task 06, 2 requests), "Company Role
  Management" (Task 06, 7 requests), "Shared Store Management" (Task
  07A, 6 requests), "Store Roles and Memberships" (Task 07A, 14
  requests), "My Store Access" (Task 07A, 3 requests), "Units" (Task
  07B, 6 requests), "Material Categories" (Task 07B, 6 requests),
  "Materials" (Task 07B, 6 requests), "Storage Locations" (Task 07B, 6
  requests), "Supplier Management" (Task 08A, 6 requests), "Purchase
  Requests" (Task 08B-1/08B-2, 9 requests), "Purchase Orders" (Task
  08C-1/08C-2, 7 requests), "Goods Receipts" (Task 09A, 11 requests),
  "Incoming QC Inspections" (Task 09B-1 drafting + Task 09B-3A
  submission, 12 requests), "Material Specifications" (Task 09B-3B, 10
  requests), "Customer Management" (Task 10A, 8 requests), "Product
  Management" (Task 10B, 8 requests), "Quotation Drafts" (Task 10C, 8
  requests), "Direct Sales Order Drafts" (Task 10D/10E/10F, 15 requests), "Formula Drafts" (Task 11A/11D/11C, 18 requests). 192
  requests in total (counted directly from the JSON, not
  assumed).
- `CMHP_Local.postman_environment.json` - the variables the requests use.
  Credentials and tokens are **blank** in this file - nothing is
  committed. 91 variables in total.

## 1. Import

In Postman: **Import** -> select both `.json` files in this folder (or
drag them in). This adds a collection called **CMHP Local** and an
environment called **CMHP Local**.

## 2. Select the environment and set your credentials

Top-right environment dropdown in Postman -> choose **CMHP Local**. Open
it (the eye icon, or Environments in the sidebar) and fill in, for your
own machine only, **not** in any file you commit:

- `username` - an existing local user's username (see "Preparing local
  test records" below if you don't have one yet).
- `password` - that user's password.

Leave `base_url` as `http://127.0.0.1:8001` if your dev server is running
on that port (this is the port used when this collection was last
verified against `D:\CMHP_NEW`). If your server is on a different port,
update `base_url` - keep the hostname as `127.0.0.1` throughout rather
than switching to `localhost`; the refresh cookie is scoped to whichever
exact host you request against, and Postman's cookie jar treats
`127.0.0.1` and `localhost` as different hosts even though they reach the
same machine, so mixing them will make request 7 (Refresh) fail with a
missing-cookie 401.

Leave `csrf_token`, `access_token` and `company_id` blank - the requests'
Tests scripts fill these in for you as you run them.

## 3. Run the requests in order

Run them top-to-bottom, either one at a time or via **Run collection**
(Collection Runner) with the CMHP Local environment selected:

1. **Health** - liveness check, no auth.
2. **Get CSRF token** - saves `csrf_token`; Postman's own cookie jar
   stores the `csrftoken` cookie automatically, nothing to do manually.
3. **Login** - uses `username`/`password` + `X-CSRFToken`; saves
   `access_token` from the response. The refresh token is never in the
   response body - it only arrives as an HttpOnly `Set-Cookie`, which
   Postman's cookie jar stores and will resend automatically on requests
   to the same host. Nothing in this collection ever tries to read that
   cookie's value.
4. **Current user** - `GET /auth/me/` with `Authorization: Bearer
   {{access_token}}`.
5. **My companies** - `GET /companies/mine/`. If the response's
   `companies` array is non-empty, its Tests script automatically sets
   `company_id` to the first company's id for you.
6. **My permissions for a selected company** - `GET
   /companies/{{company_id}}/my-permissions/`.
7. **Refresh** - `POST /auth/refresh/` with `X-CSRFToken`, no body
   needed. Reads the refresh token from the cookie Postman is holding,
   rotates it (a new `Set-Cookie` replaces the old one), and returns a
   new `access_token`, which this request's Tests script saves,
   overwriting the one from Login.
8. **Current user using refreshed access** - same as request 4, now using
   the rotated access token, to prove it actually works.
9. **Logout** - blacklists the current refresh token, clears the cookie,
   returns `204 No Content`. Its Tests script clears `access_token`
   locally too.
10. **Refresh after logout (expect 401)** - proves the blacklisted/cleared
    refresh token is really rejected.

Each request's **Tests** tab asserts the expected status code and checks
the important response fields; open the Postman console (bottom bar) to
see the pass/fail detail and the `console.log()` hints requests 5 and 6
print when something needs your attention (see below).

### Why the same `csrf_token` is reused for requests 3, 7, 9

Django only rotates the CSRF cookie when something calls
`django.contrib.auth.login()`/`logout()` (session-based auth). This
project's login/refresh/logout do not use Django sessions at all - only
JWTs - so the CSRF cookie/token obtained once in request 2 stays valid
for the rest of the sequence. If a future change ever makes login rotate
the CSRF cookie, rerun request 2 (or add it) before whichever POST
started failing with 403.

### No Auth on bootstrap/login/refresh/logout

Requests 1, 2, 3, 7, 9 and 10 explicitly have **Auth: No Auth** set on the
request itself (not "inherit from parent"), so a leftover or expired
`access_token` from a previous run can never get attached to them and
produce a confusing error.

## 4. Preparing local test records through Django Admin

This collection does **not** create any users, companies or passwords for
you - do that yourself first, locally:

1. `cd D:\CMHP_NEW\backend`, activate the venv, `python manage.py
   runserver 127.0.0.1:8001` (or whatever port you put in `base_url`).
2. If you don't already have one, create a superuser:
   `python manage.py createsuperuser` (interactive - it will ask for a
   password, enforced by Django's password validators).
3. Log in to `http://127.0.0.1:8001/admin/` with that superuser.
4. **Users**: create (or reuse) an ordinary user for `username`/`password`
   in your Postman environment - it does not need to be a superuser.
5. **Companies -> Companies**: create at least one company if none exist.
6. **Companies -> Company memberships**: give your test user an active
   membership in that company, if you want request 5 to return a
   non-empty list.
7. **Permissions -> Permission definitions** / **Company roles** /
   **Membership role assignments**: optionally set up a role with some
   permissions and assign it to that membership, if you want request 6 to
   return a non-empty `permissions` list rather than `[]`.

An **empty** `companies` array from request 5 is expected and correct
behaviour for a user with no memberships yet - it is not an error. In
that case, set `company_id` manually (or create a membership per step 6
above and log in again) before running request 6.

## 5. Common responses and what they mean

| Status | Where you'll see it | Likely cause |
|---|---|---|
| `400` | Login | Missing `username`/`password` in the request body - check the environment values are filled in. |
| `401` | Login | Wrong username, wrong password, or an inactive account - deliberately the same response for all three, so it never reveals which. |
| `401` | Me / My companies / My permissions | `access_token` is empty, wrong, or expired (access tokens last 5 minutes by default) - rerun Login (or Refresh if you still have a valid refresh cookie). |
| `401` | Refresh | No refresh cookie present, or it's invalid/expired/already blacklisted (e.g. you already logged out, or ran Refresh twice with a stale saved cookie from another tool). Rerun Login. |
| `403` | Login / Refresh / Logout | CSRF check failed - `csrf_token` is empty/stale, or you're mixing `127.0.0.1` and `localhost` so the CSRF cookie from request 2 never reached this request. Rerun request 2, then retry. |
| `404` | My permissions | `company_id` is empty/wrong, or this user has no active membership in that company (or the company is inactive) - deliberately the same 404 for all three, so it never reveals which. Check request 5's response for a real id. |
| `429` | Login | Login is rate-limited per IP (`5/min` by default, configurable via `AUTH_LOGIN_THROTTLE_RATE`) - wait a minute, or you were testing the throttle on purpose. |
| `401` | Any User Management request | `access_token` is empty (often because Logout ran earlier), wrong, or expired - rerun requests 2 and 3 (CSRF + Login) as the superuser. |
| `403` | Any User Management request | `access_token` belongs to a non-superuser, or is empty after Logout (see above), or the target of Deactivate/Activate is another superuser account (deliberately excluded - manage those in Django Admin) - see "Testing denial" in section 6. |
| `400` | Assign company / Assign role | `company_id`/`role_id` is empty, or the target user/company/membership/role is inactive, or (Assign role) the role belongs to a different company than the membership - fill in real, active ids from Django Admin. |
| `400` | Create ordinary user | `new_user_username`/`new_user_email` already exist, `new_user_password` fails a password validator, or a required field is blank - fill in the environment values, use a stronger password. |
| `404` | Get user / Update user / Assign company / Assign role / Revoke role / Revoke membership | `managed_user_id`/`membership_id`/`role_assignment_id` is empty/wrong, or doesn't actually belong to the user/membership in the URL - rerun "Create ordinary user" (and the assign requests) to get fresh ids. |
| Could not send request / `ECONNREFUSED` | Any request | The dev server isn't running, or `base_url`'s host/port doesn't match it. Start it (step 1 above) and confirm the port. |

## 6. User Management - Superuser folder (Task 05)

A separate, clearly named folder holding 12 requests for the
superuser-only user-management APIs: list/create/get/update users,
assign/revoke company membership, assign/revoke roles, and
deactivate/reactivate a user. **Every request in this folder requires
`{{access_token}}` to belong to an active superuser** - it does not log
in on its own.

### Before running this folder

1. **Log in as an existing superuser first**, using requests 2 (CSRF) and
   3 (Login) from the main sequence above, with `username`/`password` set
   to a real superuser's credentials in the environment. This is the same
   `access_token` variable the whole collection shares - the folder does
   not have its own separate login.
2. **Prepare an existing company and an existing company role through
   Django Admin first** (Companies -> Companies, and Permissions ->
   Company roles) - "Assign company" and "Assign role" only *assign*
   existing records; neither request creates a company or a role. Set
   `company_id` (reused from the main sequence) and `role_id` to real ids
   from Django Admin.
3. **Fill in `new_user_username`, `new_user_email`, `new_user_password`**
   in the environment - a username/email that don't already exist, and a
   password that passes Django's configured password validators (e.g. not
   too short, not all-numeric, not a common password). Left blank, "Create
   ordinary user" will fail validation.

### What running it actually does

**Running "Create ordinary user" through "Reactivate user" creates and
mutates a real row in whatever database your dev server is pointed at**
(`cmhp_new_dev` by default) - a new `User`, a new `CompanyMembership`, and
a new `MembershipRole`, each of which is then deactivated and reactivated
in turn by the later requests in the folder. This is a real, persistent
development record, not a sandboxed/throwaway one - it is still there
after the run finishes (the last two requests leave the created user
**active** again). If you don't want that, don't run this folder against
a database you care about, or delete the created user afterward through
Django Admin.

**Do not point Collection Runner at "Run entire collection" and walk
away.** Run the main 1-10 sequence and this folder as deliberate, separate
runs, reviewing what each does - not as one unattended pass through the
whole collection.

### Testing denial (ordinary user gets 403) without confusing tokens

To confirm an ordinary (non-superuser) user gets `403` from these
endpoints: temporarily swap `username`/`password` in the environment for
an ordinary user's credentials, rerun requests 2 and 3 (CSRF + Login) to
get that user's `access_token`, then try e.g. "List users" - expect
`403`. **Afterwards, swap `username`/`password` back to the superuser and
rerun requests 2 and 3 again** before continuing with the rest of the
folder - otherwise every later request in the folder will also 403, using
the ordinary user's leftover token, which looks identical to "the
permission check is broken" but is really just a stale variable. Using a
second Postman environment (a duplicate with different credentials) for
this, rather than editing the same one back and forth, avoids the mix-up
entirely.

### If an earlier run ended with Logout

Request 9 (Logout) clears `access_token` in the environment (it sets it
to an empty string). If your last collection run reached Logout, rerun
requests 2 and 3 (CSRF + Login) before running the User Management folder
- otherwise every request in it will send an empty `Authorization: Bearer`
header and get `401`, not `403`, which is a different, unrelated failure
mode from what this folder is meant to test.

### Sequence

1. **List users** - `GET /users/`.
2. **Create ordinary user** - saves `managed_user_id`.
3. **Get user** - by `managed_user_id`.
4. **Update user** - PATCHes `first_name`.
5. **Assign company** - by `company_id`; saves `membership_id`.
6. **List memberships** - for `managed_user_id`.
7. **Assign role** - by `role_id`; saves `role_assignment_id`.
8. **List role assignments** - for that membership.
9. **Revoke role** - deactivates the assignment from request 7.
10. **Revoke membership** - deactivates the membership from request 5.
11. **Deactivate user** - `managed_user_id` becomes inactive.
12. **Reactivate user** - `managed_user_id` becomes active again.

## 7. Company Management folder (Task 06)

Six requests for the superuser-only company CRUD/lifecycle APIs. Requires
`{{access_token}}` to belong to an active superuser (same as section 6).

1. **List companies** - `GET /companies/`.
2. **Create company** - uses `new_company_code`/`new_company_legal_name`
   from the environment; saves `managed_company_id`.
3. **Get company** - by `managed_company_id`.
4. **Update company** - PATCHes `legal_name` to a fixed string.
5. **Deactivate company** - `managed_company_id` becomes inactive.
6. **Activate company** - `managed_company_id` becomes active again.

Fill in `new_company_code`/`new_company_legal_name` in the environment
before running "Create company" - a code that doesn't already exist. The
`managed_company_id` this folder creates is a separate record from
`company_id` (the one you may already use in the main 1-10 sequence for
your own membership) - the two are unrelated on purpose, so running this
folder never disturbs whatever `company_id` you were already using.

## 8. Permission Catalog folder (Task 06)

Two read-only requests. Requires `{{access_token}}` to belong to an
active superuser. There is no create/update/delete request for this
folder because no such route exists - permission definitions are seeded
through Django Admin (Permissions -> Permission definitions) only.

1. **List permissions** - `GET /permissions/`. Its Tests script
   automatically sets `permission_code` to the first result's code, for
   use later in "Replace role permissions" (folder 9) - if the catalog is
   empty, create at least one `PermissionDefinition` in Django Admin
   first.
2. **Search permissions by module** - `GET /permissions/?module={{permission_module}}`.
   Set `permission_module` to an existing module name (e.g. `orders`) to
   see it filter; left blank, it matches nothing, which is also correct
   behaviour to observe.

## 9. Company Role Management folder (Task 06)

Seven requests for the superuser-only, company-scoped role CRUD/lifecycle
and permission-replacement APIs. Requires `{{access_token}}` to belong to
an active superuser, and runs against `{{managed_company_id}}` - run
folder 7's "Create company" first (or set `managed_company_id` manually to
an existing company id).

1. **List roles** - `GET /companies/{{managed_company_id}}/roles/`.
2. **Create role** - uses `new_role_code`/`new_role_name`; saves
   `managed_role_id`. Fails with `400` if `managed_company_id` refers to
   an inactive company - reactivate it first (folder 7, "Activate
   company").
3. **Get role** - by `managed_role_id`.
4. **Update role** - PATCHes `name` to a fixed string.
5. **Replace role permissions** - `PUT .../permissions/` with
   `{"permission_codes": ["{{permission_code}}"]}`. Run folder 8's "List
   permissions" first so `permission_code` is populated with a real,
   active code - an empty or unknown code makes this request fail with
   `400` by design (see `docs/backend-tasks.md`, Task 06, "Permission
   replacement").
6. **Deactivate role** - `managed_role_id` becomes inactive.
7. **Activate role** - `managed_role_id` becomes active again.

## 10. Shared Store Management folder (Task 07A)

Six requests for the superuser-only shared-store CRUD/lifecycle APIs -
structurally identical to folder 7 (Company Management), for
`SharedStore` instead of `Company`. A shared store has **no owning
company** - the same physical store can serve multiple companies, so
this folder never references `company_id`/`managed_company_id` at all.

1. **List stores** - `GET /stores/`.
2. **Create store** - uses `new_store_code`/`new_store_name`; saves
   `store_id`.
3. **Get store** - by `store_id`.
4. **Update store** - PATCHes `name` to a fixed string.
5. **Deactivate store** - `store_id` becomes inactive.
6. **Activate store** - `store_id` becomes active again.

Fill in `new_store_code`/`new_store_name` before running "Create store" -
a code that doesn't already exist.

## 11. Store Roles and Memberships folder (Task 07A)

Fourteen requests for the superuser-only store-scoped role CRUD/
lifecycle/permission-replacement APIs, plus store membership and
role-assignment management - runs against `{{store_id}}` (folder 10) and
`{{store_user_id}}` (an existing user id from Django Admin or folder 6's
`managed_user_id`).

1. **List STORE permissions** - `GET /permissions/?scope=STORE`. Saves
   `store_permission_code` from the first result - `shared_store.view`
   always exists (seeded by an additive data migration), so this should
   never come back empty on a normally-migrated database.
2. **List store roles** - `GET /stores/{{store_id}}/roles/`.
3. **Create store role** - uses `new_store_role_code`/
   `new_store_role_name`; saves `store_role_id`. Fails `400` if
   `store_id` refers to an inactive store.
4. **Get store role** - by `store_role_id`.
5. **Update store role** - PATCHes `name` to a fixed string.
6. **Replace store role permissions** - `PUT .../permissions/` with
   `{"permission_codes": ["{{store_permission_code}}"]}`. Run request 1
   first. A COMPANY-scope code here is rejected the same way an unknown
   code is (see `docs/backend-tasks.md`, Task 07A).
7. **Deactivate store role** - `store_role_id` becomes inactive.
8. **Activate store role** - `store_role_id` becomes active again.
9. **Assign store membership** - `{"user_id": {{store_user_id}}}`; saves
   `store_membership_id`. `200`/`201` (create-vs-reactivate split, same
   as company membership assignment).
10. **List store memberships** - for `store_id`.
11. **Assign store role to membership** - `{"role_id": {{store_role_id}}}`;
    saves `store_role_assignment_id`.
12. **List membership role assignments** - for `store_membership_id`.
13. **Revoke store role assignment** - deactivates the assignment from
    request 11.
14. **Deactivate store membership** - deactivates the membership from
    request 9.

## 12. My Store Access folder (Task 07A)

Three requests mirroring the main sequence's "My companies"/"My
permissions" - for stores. Requires only `{{access_token}}` for **any**
logged-in user, not a superuser - company membership is never required or
consulted for any of these.

1. **My stores** - `GET /stores/mine/`. An empty `stores` array is
   expected and correct for a user with no `StoreMembership` yet.
2. **My permissions for a store** - `GET /stores/{{store_id}}/my-permissions/`.
   `404` for a nonexistent store, a store with no active membership, or
   an inactive store - deliberately the same response for all three.
3. **Store overview** - `GET /stores/{{store_id}}/overview/`. Requires
   active membership **and** the `shared_store.view` permission - `404`
   without membership, `403` with membership but not that permission,
   `200` with both. Returns identity fields only (`id`/`code`/`name`) -
   no stock/quantity data exists yet.

Run folder 11 first (as the superuser) to give the user identified by
`store_user_id` a store membership and, if you want request 3 to return
`200`, a role with `shared_store.view` assigned - then switch
`username`/`password` to that user's own credentials and rerun requests 2
(CSRF) and 3 (Login) before running this folder, the same "swap
credentials" pattern described in section 6's "Testing denial".

## 13. Units folder (Task 07B)

Six requests for the superuser-only unit-of-measure CRUD/lifecycle APIs.
**Write requests require an active superuser**; the two `GET` requests
(List/Get) additionally work for any active user who holds
`shared_catalog.view` in at least one active store (see section 15's
manual flow below) - or for an active superuser, administratively,
without any store membership at all.

1. **List units** - `GET /units/`.
2. **Create unit** - uses `new_unit_code`/`new_unit_name`/
   `new_unit_dimension` (`MASS`, `VOLUME` or `COUNT`); saves `unit_id`.
2b. **Create unit with canonical_factor (Task 12B-2)** - optional, immutable once set, required `null`/absent
    for a COUNT unit; used later by the Batch Planning Drafts folder's packing-relationship request.
3. **Get unit** - by `unit_id`.
4. **Update unit** - PATCHes `name` to a fixed string. `code`/`dimension`
   are immutable through this API.
5. **Deactivate unit** - `unit_id` becomes inactive, **unless an active
   material still references it as its base unit** (`400` - deactivate or
   reassign that material first; the Tests script logs this case rather
   than failing the request outright, since it is expected, documented
   behaviour, not a bug).
6. **Activate unit** - `unit_id` becomes active again.

## 14. Material Categories folder (Task 07B)

Six requests, structurally identical to Units (same read exception, same
superuser-only writes), for `MaterialCategory` instead of `UnitOfMeasure`.
"Deactivate material category" has the same active-material-dependency
`400` as Units' deactivate.

1. **List material categories** - `GET /material-categories/`.
2. **Create material category** - uses `new_material_category_code`/
   `new_material_category_name`; saves `material_category_id`.
3. **Get material category** - by `material_category_id`.
4. **Update material category** - PATCHes `name`. `code` is immutable.
5. **Deactivate material category** - `400` while an active material
   references it, otherwise `200`.
6. **Activate material category** - `material_category_id` becomes
   active again.

## 15. Materials folder (Task 07B)

Six requests for the superuser-only material CRUD/lifecycle APIs. Run
folders 13 and 14 first - "Create material" uses `{{unit_id}}` (required)
and `{{material_category_id}}` (optional; the JSON body includes it
unconditionally in this collection, so leave `material_category_id`
blank in the environment if you want to test the "no category" case, or
remove that line from the request body yourself).

1. **List materials** - `GET /materials/`.
2. **Create material** - uses `new_material_code`/`new_material_name`/
   `new_material_kind` (`RAW_MATERIAL` or `PACKAGING_MATERIAL`),
   `{{unit_id}}`, `{{material_category_id}}`; saves `material_id`. Fails
   `400` if the unit or category is inactive.
3. **Get material** - by `material_id`.
4. **Update material** - PATCHes `name`. `code`/`kind`/`base_unit_id` are
   immutable; `category_id` can be changed via a separate manual request
   (not included here - PATCH with `{"category_id": <id>}` or
   `{"category_id": null}`) but fails `400` if newly assigning an
   inactive category.
5. **Deactivate material** - always allowed; preserves identity/history.
6. **Activate material** - `400` if the unit or category has since become
   inactive while this material was deactivated.

## 16. Storage Locations folder (Task 07B)

Six requests for the superuser-only storage-location CRUD/lifecycle APIs,
scoped to `{{store_id}}` (Task 07A - run "Shared Store Management" first
to get one). **Write requests require an active superuser**; the two
`GET` requests additionally work for any active user with active
membership in *this specific* store and `storage_locations.view` there -
or for an active superuser, administratively, regardless of membership or
the store's own active state.

1. **List storage locations** - `GET /stores/{{store_id}}/locations/`.
2. **Create storage location** - uses `new_storage_location_code`/
   `new_storage_location_name`; saves `storage_location_id`. Fails `400`
   if the store is inactive.
3. **Get storage location** - by `storage_location_id`.
4. **Update storage location** - PATCHes `name`. `store`/`code` are
   immutable; rejected while the store is inactive.
5. **Deactivate storage location** - always allowed, even if the store is
   inactive.
6. **Activate storage location** - rejected while the store is inactive.

## 17. Supplier Management folder (Task 08A)

Six requests for the superuser-only supplier-directory CRUD/lifecycle
APIs. Unlike every Task 07B folder above, **there is no read exception
here at all** - `List suppliers`/`Get supplier` also require an active
superuser; no store or company permission (including
`shared_catalog.view`) grants any access to this folder's endpoints.

1. **List suppliers** - `GET /suppliers/`.
2. **Create supplier** - uses `new_supplier_code`/
   `new_supplier_legal_name` plus synthetic example contact/address
   fields (display name, contact name, email, phone, address, city,
   state/region, postal code, country code); saves `managed_supplier_id`
   only on a successful `201`. Starts active.
3. **Get supplier** - by `managed_supplier_id`.
4. **Update supplier** - PATCHes `city`. `code` is immutable; `is_active`
   and the timestamps are rejected.
5. **Deactivate supplier** - always allowed (no purchase/receipt model
   exists yet to block it).
6. **Activate supplier** - idempotent, same as every other lifecycle
   endpoint in this collection.

## 18. Purchase Requests folder (Task 08B-1 / 08B-2)

Nine requests for the company-scoped Purchase Request draft/submit/
cancel/approve/reject/revise APIs, run against `{{company_id}}`. **A
superuser login alone does not work here** - unlike every folder above
(which are either fully superuser-gated or, for the Task 07B catalog,
have a superuser administrative-read exception), Purchase Requests have
**no superuser exception of any kind**. Every request needs
`{{access_token}}` to belong to a real member of `{{company_id}}` who
additionally holds the specific `purchase_requests.*` permission each
action needs.

**Before running requests 1-6, an administrator must set that up** (all
via requests already in this collection):

1. Log in as a superuser (requests 2-3).
2. Folder 9 ("Company Role Management") - "Create role" against
   `{{company_id}}` (sets `managed_company_id` to `{{company_id}}`
   first, or just reuse whichever company `managed_company_id` already
   points at if it's the same one). This is the **requester's** role.
3. Folder 9 - "Replace role permissions" with `{"permission_codes":
   ["purchase_requests.view", "purchase_requests.create",
   "purchase_requests.edit", "purchase_requests.submit",
   "purchase_requests.cancel"]}` - all five codes are seeded and always
   exist (an idempotent data migration, never assigned automatically).
4. Folder 6 ("User Management - Superuser") - "Assign company" (sets
   the ordinary member's `CompanyMembership` in `{{company_id}}`), then
   "Assign role" with `managed_role_id` from step 2.
5. Log out and log back in (requests 2-3) as that ordinary member -
   **not** the superuser - before running requests 1-6 below.

Run folder 15's "Create material" first so `{{material_id}}` refers to a
real, active material - the create request below adds one line
referencing it.

1. **Create purchase request draft** - `required_by`/`notes`/one line
   (`{{material_id}}`, quantity `5`); saves `purchase_request_id` and
   `purchase_request_version`. Starts `DRAFT` at version 1.
2. **List purchase requests** - `GET .../purchase-requests/`, scoped to
   `{{company_id}}`.
3. **Get purchase request** - by `purchase_request_id`; refreshes
   `purchase_request_version` (useful if it drifted).
4. **Update purchase request draft** - PATCHes `notes`; requires the
   current `purchase_request_version` in the body (`expected_version`) -
   a stale value returns `409` (rerun "Get purchase request" first, the
   test script says so). Updates `purchase_request_version` on success.
5. **Submit purchase request** - `DRAFT` → `SUBMITTED`, and starts
   approval round 1 at step 1; same `expected_version` requirement.
   **This does not by itself mean the request is approved** - it takes
   three approvals (requests 7, run three times by three different
   eligible admins) to reach `APPROVED`. Saves `purchase_request_round`/
   `purchase_request_step` (both `1`) alongside the refreshed
   `purchase_request_version`.
6. **Cancel purchase request** - `DRAFT`/`SUBMITTED` → `CANCELLED`, with
   a required `cancellation_reason`; same `expected_version`
   requirement. Terminal - no reopening. **As of Task 08B-2, cancelling
   a `SUBMITTED` request needs `purchase_requests.cancel_pending`, not
   `purchase_requests.cancel`** - the requester's role from step 3 above
   does not hold it, so running this against an already-`SUBMITTED`
   request with the requester still logged in now correctly returns
   `403` (this is the fixed authorization gap, not a bug in this
   collection) unless you also grant `purchase_requests.cancel_pending`
   to that role. Running this consumes the request - see the note before
   request 7 if you want to try approve/reject/revise instead of cancel.

**Requests 7-9 need a SECOND ordinary member, logged in separately** -
the requester can never decide their own request, with no exception, so
step 5's user cannot run request 7 or 8 against their own request. Set
this up once, still as the superuser:

6. Folder 6 - "Create ordinary user" for a second user (or reuse one you
   already have), then "Assign company" for `{{company_id}}`.
7. Folder 9 - "Create role" (a second role, e.g. an "Admin" role in
   name only - the role's *name* carries no meaning to the code, only
   the permissions attached to it do), "Replace role permissions" with
   `{"permission_codes": ["purchase_requests.view",
   "purchase_requests.approve"]}`, then "Assign role" to that second
   user's membership.
8. Log out and log back in (requests 2-3) as that **second** user before
   running request 7 or 8. Repeat with a *third*, *fourth* distinct
   admin (same setup) if you want to reach a full `APPROVED` via request
   7 three times - the provisional "different approver per step"
   restriction means the same second user can only make one decision
   per round (see `docs/purchase-workflow-proposal.md`).
9. Log back in as the original requester (requests 2-3) before running
   request 9 - `revise` is gated the same way `PATCH` is
   (`purchase_requests.edit`), which the requester's own role already
   holds from step 3.

7. **Approve purchase request** - approves whichever step is currently
   pending; requires `expected_version` **and** `expected_round` **and**
   `expected_step` to all match exactly (`409` otherwise, e.g. after a
   different admin already approved the step you expected to decide -
   rerun "Get purchase request" first). `400` if the logged-in user is
   the original requester, or if that same admin already decided an
   earlier step of this round. The third distinct admin's approval turns
   the response `status` to `APPROVED` and stops updating
   `purchase_request_step` (it becomes `null`) - still no Purchase Order
   or stock movement is created anywhere.
8. **Reject purchase request** - same round/step-match requirement as
   approve, plus a required `rejection_reason`. Moves straight to
   `REJECTED` and closes the round, regardless of which step rejected
   it. Run this instead of a second/third "Approve" if you want to
   exercise "Revise purchase request" next.
9. **Revise purchase request** - `REJECTED` → `DRAFT` only (`400`
   otherwise); requires `expected_version`. Log back in as the original
   requester first (see the setup note above). After this, "Update
   purchase request draft" (request 4) and "Submit purchase request"
   (request 5) both work again - resubmitting starts a **new** round at
   step 1, never resuming from whichever step rejected the previous one.

## 19. Purchase Orders folder (Task 08C-1 draft / 08C-2 issue)

Seven requests for the Purchase Order draft **and issue** APIs, run
against `{{company_id}}`. Same "no superuser exception" rule as folder
18: every request needs `{{access_token}}` to belong to a real member
holding the specific `purchase_orders.*` permission each action needs,
and creating a PO **also** needs `purchase_requests.view` (creation
reads the source request). **PROPOSED POLICY, NOT CLIENT-CONFIRMED** (see
`docs/purchase-order-proposal.md`): a Purchase Order's company is always
fixed to its source Purchase Request's own company - cross-company
purchasing is not supported in this slice - and issuing needs only the
one `purchase_orders.issue` permission, not a second approval step.

**Before running this folder**:

1. Complete folder 18 in full, through "Approve purchase request" run
   **three times by three distinct admins**, so `{{purchase_request_id}}`
   refers to a request that is genuinely `APPROVED` (a PO can only be
   created from an `APPROVED` source - `DRAFT`/`SUBMITTED`/`REJECTED`/
   `CANCELLED` are all rejected with `400`).
2. Folder 9 ("Company Role Management") - "Create role", "Replace role
   permissions" with `{"permission_codes": ["purchase_orders.view",
   "purchase_orders.create", "purchase_orders.edit",
   "purchase_orders.cancel", "purchase_orders.issue",
   "purchase_requests.view"]}`, then Folder 6 - "Assign company"/"Assign
   role" for the member who will run this folder (can be the same
   member folder 18 used, or a different one - there is no self-decision
   restriction on Purchase Orders the way Task 08B-2's approval has one,
   and issuing does not require a different person than the one who
   drafted it either).
3. The Supplier Management folder (Task 08A) - "Create supplier" as a
   superuser, so `{{managed_supplier_id}}` refers to a real, active
   supplier.
4. Log back in (requests 2-3) as the member from step 2 before running
   the requests below.

1. **Create purchase order** - `source_purchase_request_id`
   (`{{purchase_request_id}}`), `supplier_id` (`{{managed_supplier_id}}`),
   `currency_code` (required, three letters - never assumed; the sample
   body uses `INR`, one of the four currencies actually **issuable**
   today - see "Currency support" below), `expected_delivery_date`
   (the sample body sets a future date - required later, at issue)/
   `notes` optional; saves `purchase_order_id`, `purchase_order_version`,
   and `purchase_order_line_id` (the first copied line's own id, needed
   for request 4). Starts `DRAFT` at version 1, with every line copied
   from the request's approved round verbatim - same quantities, same
   materials, `unit_price` starting at `0`. `404` if the source request
   isn't visible in this company (folds "doesn't exist" and "wrong
   company" together, same convention as everywhere else in this
   project); `400` if it isn't `APPROVED` yet, or already has an active
   (non-cancelled) Purchase Order.
2. **List purchase orders** - `GET .../purchase-orders/`, scoped to
   `{{company_id}}`. `?status=ISSUED` also works once request 6 below has
   run - the `?status=` filter accepts `ISSUED` with no special setup.
3. **Get purchase order** - by `purchase_order_id`; refreshes
   `purchase_order_version` and shows the computed `subtotal` (a pre-tax
   sum of every line's `line_amount` - no GST/discount/freight/invoice
   total exists anywhere in this task) and `issue_snapshot` (`null` until
   request 6 has run).
4. **Update purchase order draft** - PATCHes `notes` and one line's
   `unit_price` (by `purchase_order_line_id`) in the same call; requires
   the current `purchase_order_version`. `line_amount` and `subtotal`
   are recomputed server-side (`quantity * unit_price`, rounded
   `ROUND_HALF_UP` to 2 decimal places) - never sent by the client.
   `quantity`/`material`/`unit`/`currency_code` are all immutable after
   creation and rejected (`400`) if present in the body. **Run this
   before request 6** - a line still priced at `0` cannot be issued (see
   "Zero-price restriction" below).
5. **Cancel purchase order** - `DRAFT` → `CANCELLED`, with a required
   `cancellation_reason`; same `expected_version` requirement. Terminal
   for that specific order - but unlike Purchase Requests, cancelling a
   Purchase Order frees its source Purchase Request for a **replacement**
   order (rerun request 1 with the same `purchase_request_id`). Only
   works on a `DRAFT` - `400` against an already-`ISSUED` order (see
   scenario A vs. B below; run one or the other, not both, against the
   same order).
6. **Issue purchase order** - `DRAFT` → `ISSUED`; requires the current
   `purchase_order_version` only. `400` if: any line is still priced at
   `0`; `expected_delivery_date` is missing or in the past; the currency
   isn't one of the four currently-issuable ones; the supplier or any
   line's material/unit/category is inactive; or the order is already
   `CANCELLED`. `403` if the logged-in user lacks `purchase_orders.issue`
   specifically (holding only `view`/`create`/`edit`/`cancel` is not
   enough). Idempotent (`200`, no-op) on a repeat call at the *current*
   version against an already-`ISSUED` order. Terminal - no reopen,
   amendment, or cancellation of an `ISSUED` order exists anywhere in
   this API.
7. **Get purchase order (after issue)** - same endpoint as request 3,
   run again to show the populated `issue_snapshot` (company/supplier
   identity as they stood at issue, every line's frozen quantity/price/
   amount, `issued_by_id`/`issued_at`) - this is the permanent record; a
   later rename of the supplier or company in this collection's other
   folders will not change what this snapshot reports.

**Two scenarios this folder is meant to be run as** (pick one per
purchase request - request 1 enforces at most one non-cancelled PO per
source request):

- **Scenario A - issue a real order**: 1 (create) → 4 (set a real price
  on the line) → 6 (issue) → 7 (get, see the frozen snapshot). Do not run
  request 5 against this same order afterwards - it will `400`.
- **Scenario B - draft, then abandon it**: 1 (create another draft
  against a *different* `{{purchase_request_id}}`, or after cancelling
  the first) → 5 (cancel, with a reason) → optionally rerun request 1
  again to create a replacement, since cancelling frees the source
  request. Do not run request 6 against this order afterwards - it will
  `400`.

**Currency support**: a `DRAFT` accepts any shape-valid three-letter
`currency_code`, but only `INR`/`USD`/`EUR`/`GBP` can actually be
**issued** today - this project's fixed 2-decimal-place rounding is only
verified correct for those; see `docs/purchase-order-proposal.md` for
why. Creating a PO with, say, `"currency_code": "JPY"` succeeds as a
`DRAFT`; issuing it fails with `400` naming the supported list.

**Zero-price restriction**: a line may sit at its `0` default
indefinitely as a `DRAFT`, but issuing rejects any line still priced at
`0` with a clear message. Free-of-charge/no-cost purchasing is
explicitly deferred, not supported.

**Immutable issued details**: `issue_snapshot` (company identification,
full supplier identity/contact/address, every line's material/unit/
quantity/price/amount, currency, pre-tax subtotal, expected delivery
date, notes, and the source request/approved-round reference) is written
once, at issue, and never changes again - not even if the Supplier
Management or Company folders are later used to rename the same supplier
or company.

**Deferred in this task** (documented, not built): PDF/email sending
(issuing is not "sending" - no email or document is ever generated or
transmitted by this API), any second-person approval step for issuing, a
wider currency list, free-of-charge (zero-price) purchasing, goods
receipt, QC, stock balances/movements, invoicing, and Tally/accounting
integration.

## 20. Goods Receipts folder (Task 09A)

Eleven requests for physical material receiving against an already-
`ISSUED` Purchase Order, run against `{{store_id}}` - a **store**-scoped
folder (`/api/v1/stores/...`), unlike folders 18/19 which are
company-scoped. Every request needs `{{access_token}}` to belong to a
user holding **both** an active `StoreMembership` in `{{store_id}}` with
the specific `receiving.*` permission each action needs, **and** an
active `CompanyMembership` in the source PO's own company with
`purchase_orders.view` - store access alone never reveals every
company's receipts. **PROPOSED POLICY, NOT CLIENT-CONFIRMED** (see
`docs/receiving-proposal.md`): no over-delivery tolerance exists in this
initial slice, and posted-receipt corrections/reversals are entirely
deferred. This does not create available stock, QC acceptance,
accounting entries, intercompany transfers, or supplier payments.

**Before running this folder**:

1. Complete folder 19 through **"Issue purchase order"** and **"Get
   purchase order (after issue)"**, against a Purchase Order created for
   **exactly 100 units** (the sample bodies below assume this) - the
   second request saves `source_po_line_id` from the response's
   `issue_snapshot.lines[0].id`. This is a different id from
   `purchase_order_line_id` (the live line, saved by folder 19's own
   "Create purchase order") - receiving always derives material/unit
   from the immutable issue-time snapshot, not the live line.
2. Folder 11 ("Store Roles and Memberships") - "Create store role",
   "Replace store role permissions" with `{"permission_codes":
   ["receiving.view", "receiving.create", "receiving.edit",
   "receiving.post", "receiving.cancel"]}`, then "Assign store
   membership"/"Assign store role to membership" for `{{store_id}}`, for
   the member who will run this folder.
3. That same member also needs `purchase_orders.view` in the PO's
   company - folder 9, same as folder 19's own setup (can reuse an
   existing role/assignment if one already grants it).
4. Log back in (requests 2-3) as that member before running the requests
   below.

1. **Create goods receipt (draft, 60 of 100)** - `source_purchase_
   order_id`/`arrived_at` required; `idempotency_key` optional but shown
   here (a repeat call with the same key and identical body is a safe
   no-op retry, not a duplicate - same key with *different* content is
   `409`); saves `goods_receipt_id`/`goods_receipt_version`. Starts
   `DRAFT` at version 1 - creating a receipt never checks remaining
   quantity, only posting does.
2. **List goods receipts** - scoped to `{{store_id}}` and further
   filtered to companies you hold `purchase_orders.view` in.
3. **Eligible purchase orders for receiving** - the minimal lookup used
   to find a PO to receive against; shows `delivery_progress` per line
   (ordered/received/remaining quantities and `NOT_RECEIVED`/
   `PARTIALLY_RECEIVED`/`FULLY_RECEIVED`) and confirms no price/currency/
   subtotal is exposed.
4. **Get goods receipt** - refreshes `goods_receipt_version`.
5. **Update goods receipt draft** - PATCHes `notes` and fully replaces
   `lines` in the same call (unlike a Purchase Order line, a receipt
   line's full replace convention matches `PurchaseRequest`'s own, not
   `PurchaseOrderLine`'s narrower single-field edit).
6. **Post goods receipt (confirms 60 of 100 - PARTIALLY_RECEIVED)** -
   `DRAFT` → `POSTED`; run "Eligible purchase orders for receiving"
   again afterward to see `delivery_progress` move to
   `PARTIALLY_RECEIVED`, `60`/`100`, `40` remaining.
7. **Create second goods receipt (remaining 40)** - a *second* receipt
   against the *same* PO line, a different lot (`LOT-B`) - demonstrates
   "support multiple lots for one PO line." Saves a new
   `goods_receipt_id`/`goods_receipt_version`, overwriting the first
   receipt's.
8. **Post second receipt (completes 100 of 100 - FULLY_RECEIVED)** - run
   "Eligible purchase orders for receiving" again afterward:
   `delivery_progress` should now read `FULLY_RECEIVED`, `100`/`100`, `0`
   remaining. This means only that the ordered quantity has physically
   arrived on paper - never "accepted," "usable," or "financially
   closed"; no QC/stock/accounting concept exists anywhere in this task.
9. **Over-receipt example (rejected - do not run after fully received
   above)** - creating the draft always succeeds (`201`, creation never
   checks remaining quantity); **posting** it (a separate manual call
   you make using the `goods_receipt_id` this request just saved,
   against `.../post/`) returns `400`, since the PO already has zero
   quantity remaining after step 8. No over-delivery tolerance exists in
   this initial policy.
10. **Create draft to cancel (separate PO)** - an empty-line draft
    (empty lines are allowed, same as every other document type in this
    project), set up purely to be cancelled next.
11. **Cancel goods receipt** - `DRAFT` → `CANCELLED`, with a required
    `cancellation_reason`. Terminal - a `POSTED` receipt can never reach
    this endpoint successfully (`400`); there is no reopen, amendment,
    or reversal of a posted receipt anywhere in this task (see
    `docs/receiving-proposal.md`).

## 21. Incoming QC Inspections folder (Task 09B-1 drafting + Task 09B-3A submission)

Twelve requests for manually-entered QC inspection **drafts**, now
including real **submission**, against an already-`POSTED` goods-receipt
line, run against `{{store_id}}` - another store-scoped folder,
immediately following folder 20 in the same purchasing→receiving→QC
chain. Every request needs `{{access_token}}` to belong to a user holding
**both** an active `StoreMembership` in `{{store_id}}` with the specific
`incoming_qc.*` permission each action needs, **and** active
`CompanyMembership` in the receipt line's own purchasing company - but,
deliberately unlike folder 20, **bare membership is enough here: no
`purchase_orders.view` is required**, so a QC user never needs
purchasing-price visibility (see `docs/incoming-qc-proposal.md`). This
folder only records that observations were taken, and now that
submission has happened - it never decides acceptance/rejection, never
releases material, never creates stock, and never changes the source
receipt's quantities. There is still no `ACCEPTED`/`REJECTED`/`RELEASED`
status anywhere - see `docs/incoming-qc-review-proposal.md` for the
full, corrected design of that later work, none of which is implemented
yet.

**Before running this folder**: complete folder 20 through **"Post goods
receipt"** (or "Post second receipt"), so `{{goods_receipt_id}}` refers
to a real `POSTED` receipt with at least one line. The QC user also needs
a store role granting `incoming_qc.view`/`create`/`edit`/`submit`/`cancel`
(folder 11's "Create store role"/"Replace store role permissions"
pattern - note the dedicated `incoming_qc.submit` code, deliberately not
folded into `incoming_qc.edit`) and a company membership with **no
particular permission required** in the receipt's own company (folder 9's
"Assign company" alone is enough - no role/permission assignment needed
for that membership).

1. **Eligible receipt lines for QC inspection** - the minimal lookup used
   to find a receipt line to inspect; excludes any line that already has
   an active (non-cancelled) inspection. Finds the line belonging to
   `{{goods_receipt_id}}` and saves `receipt_line_id`; confirms no
   `unit_price`/`currency_code` is exposed.
2. **Create incoming QC inspection draft** - `receipt_line_id` required;
   `inspection_date`/`notes`/`observations` all optional. Starts `DRAFT`
   at version 1. Rejected `400` if the source receipt is not `POSTED`;
   `409` if an active inspection already exists for this line (at most
   one non-cancelled inspection per receipt line - see
   `docs/incoming-qc-proposal.md`).
3. **List incoming QC inspections** - scoped to `{{store_id}}` and
   further filtered to companies you have membership in.
4. **Get incoming QC inspection** - refreshes `incoming_inspection_version`.
5. **Edit inspection observations** - PATCHes `observations` as a **full
   replacement** (omitted = unchanged, `[]` clears them - same convention
   as a Goods Receipt's `lines`), demonstrating that a draft's
   observations may be incomplete and can be added to over multiple
   edits. The sample body's `result` values are clearly synthetic
   placeholders, not real pharmaceutical test limits.
6. **Cancel incoming QC inspection draft** - `DRAFT` → `CANCELLED`, with
   a required `cancellation_reason`. A cancelled draft may be replaced by
   a new one - which is exactly what request 7 does next, reusing the
   same `{{receipt_line_id}}` now that request 6 freed it.
7. **Create a second inspection draft with no observations (for submit
   validation)** - deliberately created with zero observations, to set up
   request 8's negative example.
8. **Attempt to submit with no observations (expect 400)** - confirms
   `submit_incoming_inspection`'s "at least one observation is required"
   rule; the inspection stays `DRAFT`.
9. **Add an observation via edit** - the same full-replacement `PATCH`
   pattern as request 5, fixing what request 8 was missing.
10. **Submit incoming QC inspection** - `DRAFT` → `SUBMITTED`. Confirms
    `submitted_by_id`/`submitted_at` are recorded. **Once submitted, this
    inspection is permanently frozen** - there is no correction/retest
    action in this task (see `docs/incoming-qc-review-proposal.md` for
    the design of that later work).
11. **Attempt to edit after submission (expect 400)** - confirms a
    `SUBMITTED` inspection can never be edited through the same `PATCH`
    endpoint that worked fine on the `DRAFT` in requests 5/9.
12. **Attempt to cancel after submission (expect 400)** - confirms a
    `SUBMITTED` inspection can never be cancelled either - unlike a
    `DRAFT`, there is no path back for it in this task.

**Deferred in this task** (documented, not built): any review, disposition/
acceptance/rejection/release action, any QC specification or pass/fail
concept, any reviewer/authorizer role beyond the drafting/submitting
`incoming_qc.*` permissions, retesting, and correction of a submitted
inspection. See `docs/incoming-qc-review-proposal.md` (design, corrected
but not implemented) and `docs/erp-handoff-open-decisions.md` for the
consolidated list of what a future QC disposition task would still need
to decide.

## 22. Material Specifications folder (Task 09B-3B)

Ten requests for the material specification **DRAFT-and-versioning
foundation** - a global, superuser-only resource, deliberately **not**
mounted under `/stores/...` or `/companies/...` (no store/company
ownership exists for a specification). Every request needs
`{{access_token}}` to belong to an **active superuser** - there is no
read exception here, unlike the shared catalog (Units/Material
Categories/Materials, folders 13-15): this mirrors folder 16's own
"Supplier Management" access shape exactly. **Managing a specification
draft here confers no QC/QA operational authority whatsoever** - it is
entirely separate from `incoming_qc.*` access (folder 21), and nothing
created here is ever attached to an `IncomingInspection`. Every version
is permanently `DRAFT` - there is no approval, publication, effective
date, superseding, or retirement action anywhere in this folder.

**Before running this folder**: log in as an active superuser (top-level
request 3). No other setup is required beyond the shared demo material
(`{{material_id}}`, from folder 14's "Create material" or any existing
active material).

1. **Create material specification (with atomic empty version 1)** -
   `material_id`/`code`/`name` required, `description` optional. Creates
   the specification **and** its revision-1 `DRAFT` version in one
   atomic call - the version starts completely empty (no tests, no
   reference document); saves `material_specification_id`,
   `material_specification_version`, `specification_version_id`,
   `specification_version_version`. `409` if the code already exists (a
   real identity conflict, not a plain `400` - see
   `docs/backend-decisions.md`, Task 09B-3B).
2. **List material specifications** - supports `?search=` (code/name)
   and `?material=<id>`.
3. **Get material specification** - shows `latest_revision_number` and
   the full `versions` array (each with its own nested `tests`).
4. **Edit specification metadata** - `name`/`description`, **now
   requiring `expected_version`** (Task 09B-3B.1 - the original 09B-3B
   implementation wrongly shipped this as unversioned; corrected the
   same session it shipped). Saves the refreshed
   `material_specification_version`. This is a **separate concurrency
   token from `specification_version_version`** (request 8's own token,
   for one specific draft revision's content) - the two never interact;
   see `docs/frontend-api-handoff.md` §9.2 for the full "three different
   version-shaped fields" explanation.
5. **Create a new empty draft version** - `reference_document`/`notes`
   optional, no `tests` field (test rows are only ever added via request
   8, never at version-creation time). `revision_number` is allocated
   safely under the specification's own row lock and is guaranteed to
   increment (`2`, then `3`, ...) even under concurrent creation.
6. **List specification versions** - confirms both revisions now exist.
7. **Get specification version** - refreshes `specification_version_version`.
8. **Edit draft version - add tests** - PATCHes `reference_document`/
   `notes`/`tests` (full replacement, same convention as every other
   nested-line resource in this project). The sample `acceptance_
   criteria` values are explicitly labeled synthetic placeholders - not
   real pharmaceutical test limits.
9. **Stale version conflict example (expect 409)** - sends a
   deliberately wrong `expected_version` (`1`), demonstrating the same
   refetch-and-retry pattern every other versioned resource in this
   project requires.
10. **Unauthorized access example (expect 401)** - no `access_token`
    sent at all; a non-superuser token would instead get `403` (not
    demonstrated as a separate request here - same pattern as every
    other superuser-only folder in this collection).

**Deferred in this task** (documented, not built): approval, publication,
effective dates, superseding, retirement, cloning, any operational QC
read access to a specification, any link from an `IncomingInspection` to
a specification version, and any pharmaceutical test catalog/numeric
limit/sampling calculation. See `docs/incoming-qc-review-proposal.md` for
the still-unimplemented review/decision workflow this data would
eventually support, and `docs/erp-handoff-open-decisions.md` for the
open questions around future operational access and approval authority.

## 23. Customer Management folder (Task 10A)

Eight requests for the company-scoped customer identity/contact
directory. **Company-scoping here is this task's working implementation
choice, not a confirmed client policy** — unlike Supplier Management
(folder 17), which is one directory shared across both companies, each
`Customer` belongs to exactly one company, and its `code` is unique per
company only (see `docs/erp-handoff-open-decisions.md` §A13). Every
request needs `{{access_token}}` to belong to a user with an active
membership in `{{company_id}}` holding the relevant `customers.*`
permission (`customers.view` for every read; `customers.view` plus the
specific action permission for every mutation) — these are seeded but
assigned to nobody automatically, so grant them first via folder 9's
"Company Role Management" if you get `403`. No `DELETE` exists anywhere
in this module.

**Before running this folder**: log in (top-level request 3) as a user
with `customers.*` permissions in `{{company_id}}` (see folder 6's
"Create ordinary user" and "Assign company" to create the user and grant
company membership, and folder 9's "Company Role Management" to create a
role holding the `customers.*` permissions and assign it via folder 6's
"Assign role"). For the last request, also set `{{second_company_id}}`
to a **different**, existing company id (any company works — the point
is only that it differs from `{{company_id}}`).

1. **Create customer** — `code`/`name` required, the rest optional.
   `code` is normalized (trimmed, upper-cased) and immutable afterward.
   Saves `managed_customer_id`, `customer_version`. `409` if the code
   already exists **within this company** (a real identity conflict —
   see `docs/backend-decisions.md`, Task 10A); the same code under a
   *different* company would succeed (not demonstrated as a separate
   request here — see the model's own uniqueness constraint instead).
2. **List/search/filter customers** — `?search=` matches code/name/
   contact_person/email/phone at once; `?is_active=true` is a strict
   boolean filter (anything other than `true`/`1`/`false`/`0` is `400`,
   not demonstrated here).
3. **Get customer** — refreshes `customer_version`.
4. **Edit customer** — PATCHes `name`/`notes` (and, independently,
   `contact_person`/`email`/`phone`/`billing_address`/
   `shipping_address`), requiring `expected_version`. `code`/`company`
   remain immutable (`400` if present in the body at all — not
   demonstrated as a separate request here). Refreshes `customer_version`.
5. **Deactivate customer** — requires `expected_version` only, **no**
   `cancellation_reason` field (unlike Purchase Order/Request
   cancellation). Never deletes the record. Refreshes `customer_version`.
6. **Activate customer** — same shape as deactivate, in reverse.
   Refreshes `customer_version`.
7. **Stale version conflict example (expect 409)** — sends a
   deliberately wrong `expected_version` (`1`), demonstrating the same
   refetch-and-retry pattern every other versioned resource in this
   project requires.
8. **Cross-company access-denial example (expect 404)** — looks up
   `managed_customer_id` under `second_company_id` instead of the
   company it actually belongs to. Returns `404`, the same "folded into
   not-found" treatment this project's `_get_company_for_action`
   convention already uses for a caller with no access to a company at
   all (`docs/frontend-api-handoff.md` §0.8 documents the general
   pattern) — here demonstrating that even a *real* customer id 404s
   when looked up under the wrong company, not just an unknown id.

**Deferred in this task** (documented, not built): any quotation, sales
order, invoice, customer portal, GST/PAN, credit limit, payment terms,
or customer-qualification feature. See `docs/erp-handoff-open-
decisions.md` §A13 for the still-open company-scoping-policy question.

## 24. Product Management folder (Task 10B)

Eight requests for the company-scoped saleable-product identity record —
the foundation for a future quotation/sales-order line item that does
not exist yet anywhere in this project. **Company-scoping here is a
provisional implementation choice, not a confirmed client policy** — the
same caveat folder 23's Customer Management already carries (see
`docs/erp-handoff-open-decisions.md` §A14). Every request needs
`{{access_token}}` to belong to a user with an active membership in
`{{company_id}}` holding the relevant `products.*` permission —
seeded but assigned to nobody automatically, so grant them first via
folder 9's "Company Role Management" if you get `403`. No `DELETE`
exists anywhere in this module.

**Before running this folder**: log in (top-level request 3) as a user
with `products.*` permissions in `{{company_id}}` (see folder 6's
"Create ordinary user" and "Assign company", and folder 9's "Company
Role Management" plus folder 6's "Assign role"). Also make sure
`{{unit_id}}` refers to an **active** unit of measure — folder 13's
"List units" or "Create unit" — since `sales_uom_id` is required and
rejected if inactive. For the last request, also set
`{{second_company_id}}` to a **different**, existing company id.

1. **Create product** — `code`/`name`/`sales_uom_id` required,
   `product_type` (Task 12B-1, free text - the request sends `"Tablets"` as
   one example value, not the only valid one)/`description` optional. `code` is normalized and immutable
   afterward; `sales_uom_id` is resolved against `{{unit_id}}` and is
   **also immutable afterward** — there is no unit-conversion feature
   in this project, so a wrong choice cannot be fixed later. Saves
   `managed_product_id`, `product_version`. `404` if `unit_id` doesn't
   exist, `400` if it is inactive, `409` if the code already exists
   **within this company** (a real identity conflict — see
   `docs/backend-decisions.md`, Task 10B).
2. **List/search/filter products** — `?search=` matches code/name only
   (unlike Customer Management's five-field search); `?is_active=true`
   is a strict boolean filter.
3. **Get product** — refreshes `product_version`; confirms the response
   always joins `sales_uom_code`/`sales_uom_name`/`sales_uom_is_active`,
   never just a bare id.
4. **Edit product** — PATCHes `name`/`description`, requiring
   `expected_version`. `code`/`company`/`sales_uom_id` remain immutable
   (`400` if present in the body at all — not demonstrated as a
   separate request here). Refreshes `product_version`.
5. **Deactivate product** — requires `expected_version` only, no reason
   field. Never deletes the record. Refreshes `product_version`.
6. **Activate product** — same shape as deactivate, in reverse. **Can
   return `400`** if the product's `sales_uom` has itself become
   inactive since creation (see `docs/frontend-api-handoff.md` §11.5/
   11.6) — unlike a `Material`'s `base_unit`, a `Product`'s `sales_uom`
   is not protected from deactivation by an active product referencing
   it, so this is a real, reachable case, not just a defensive check.
7. **Stale version conflict example (expect 409)** — sends a
   deliberately wrong `expected_version` (`1`).
8. **Cross-company access-denial example (expect 404)** — looks up
   `managed_product_id` under `second_company_id` instead of the
   company it actually belongs to, the same demonstration folder 23's
   own request 8 already documents for customers.

**Deferred in this task** (documented, not built): any formula/BOM,
dosage/potency/medical-claim field, pack-size calculation, batch
numbering, default price/tax/HSN/GST rule, shelf-life calculation, or
opening-stock/stock-ownership feature. See `docs/erp-handoff-open-
decisions.md` §A14 for the still-open company-scoping-policy question
and the `deactivate_unit`/`Product` interaction it also documents.

## 25. Quotation Drafts folder (Task 10C)

Eight requests for the company-scoped quotation **draft** foundation.
Drafting only: there is no approval, sending, acceptance, revision,
sales-order conversion, tax, discount, grand total, PDF or stock effect,
and no DELETE or lifecycle endpoint. Needs `quotations.view/create/edit`
(seeded, assigned to nobody) plus `customers.view` and `products.view`
to pick data in the UI. Run folders 23 (Customer Management) and 24
(Product Management) first so `{{managed_customer_id}}` and
`{{managed_product_id}}` are **active** records of `{{company_id}}`
(the product's sales unit must be active too). The quotation reference
format is a technical working default, not client-confirmed numbering.

1. **Create quotation draft** - saves `managed_quotation_id`,
   `quotation_version`, `quotation_line_id`. Response has a `subtotal`
   (pre-tax, single currency) and never a grand total.
2. **List/search/filter quotations** - `search` (reference or customer
   name), `customer`, `quotation_date_from`, `quotation_date_to`.
3. **Get quotation detail** - refreshes `quotation_version`.
4. **Edit quotation draft (replace lines by id)** - `lines`, when
   present, is the authoritative final list: entries with `id` keep/
   change that line, entries without `id` are new, missing ids are
   removed. Requires `expected_version`.
5. **Stale version conflict example (expect 409)**.
6. **Forged total rejected example (expect 400)** - `subtotal`,
   `line_amount`, `reference`, `status` etc. are rejected, not ignored.
7. **Foreign line id rejected example (expect 400)**.
8. **Cross-company access-denial example (expect 404)** - uses
   `{{second_company_id}}`.

## 26. Direct Sales Order Drafts folder (Task 10D/10E/10F)

Fifteen requests for the company-scoped **direct sales-order draft**
foundation. A draft authorizes nothing: no manufacturing, stock
reservation, invoice, dispatch or customer confirmation; no confirm/
cancel lifecycle, no quotation linkage or conversion, no tax/discount/
freight, no DELETE or lifecycle endpoint. Needs `sales_orders.view/
create/edit` (seeded, assigned to nobody) plus `customers.view` and
`products.view` to pick data. Run folders 23 and 24 first so
`{{managed_customer_id}}`/`{{managed_product_id}}` are **active** records
of `{{company_id}}`. The `SO-` reference format is a technical working
default, not client-approved numbering.

1. **Create direct sales order draft** - saves `managed_sales_order_id`,
   `sales_order_version`, `sales_order_line_id`.
2. **List/search/filter sales orders** - `search` (reference, customer
   name or customer order reference), `customer`, `order_date_from`,
   `order_date_to`.
3. **Get sales order detail** - refreshes the version and line id.
4. **Edit sales order draft (replace lines by id)** - `lines`, when
   present, is the complete final list (id = update, no id = new,
   missing = removed). Requires `expected_version`.
5. **Stale version conflict example (expect 409)**.
6. **Forged total rejected example (expect 400)**.
7. **Foreign line id rejected example (expect 400)**.
8. **Cross-company access-denial example (expect 404)** - uses
   `{{second_company_id}}`.
9. **Order review / confirmation preview (read-only, informational)** -
   `GET .../sales-orders/<id>/confirmation-preview/`, needs only
   `sales_orders.view`. Changes nothing and can be stale the moment it
   returns; it shows the company policy state, blocking reasons and
   informational observations, and never guarantees a later confirmation.
   Saves the reviewed `sales_order_version`. (Contract changed in Task 10F.)
10. **Get confirmation policy** (Task 10F) - requires an **active superuser**
    login. `version` 0 means never configured; saves
    `sales_order_policy_version`.
11. **Set confirmation policy** (Task 10F, superuser) - `expected_version` +
    explicit true/false answers. The example values are synthetic; the real
    answers are a client decision and nothing is defaulted. Do not configure a
    real company without that decision. Configuring grants no confirmation
    authority.
12. **Confirm sales order** - a user holding `sales_orders.view` +
    `sales_orders.confirm` (assigned explicitly; seeded to nobody). `200`
    (CONFIRMED) or a structured `400` with `blocking_reasons`
    (`confirmation_policy_not_configured` when the rules are not set). Sends
    the reviewed version; reserves no stock and starts no production.
13. **Confirm again at the current version** - `200` no-op for a still-authorized
    user (same `confirmed_at`, no new audit event).
14. **Confirm with a stale version (expect 409)**.
15. **Edit a confirmed order is rejected (expect 400)** - a CONFIRMED order is
    immutable; there is no unconfirm/cancel/amend request.

## 27. Formula Drafts folder (Task 11A/11D)

Eighteen requests for the company-scoped manufacturing **formula draft**
foundation. Preparation only: no approval, batch creation, requirement
generation, reservation, material issue, production, scaling, unit
conversion, percentages, yield or waste. Company scoping and simple
quantity-based drafting are working implementation choices, not
client-approved manufacturing policy. Needs `formulas.view/create/edit`
(seeded, assigned to nobody), `products.view` to pick a product and -
for the material picker - `shared_catalog.view` in at least one store
(the material catalog is a shared, store-permissioned lookup, not
company-scoped). Run folder 24 (Product Management) first and set
`{{formula_raw_material_id}}` / `{{formula_packaging_material_id}}` to
**active** RAW_MATERIAL / PACKAGING_MATERIAL materials.

Four version-like values exist and must not be confused:
`Formula.version` (`{{formula_version}}`, metadata), `latest_revision_number`
(server allocation counter, never sent), `revision_number` (the draft
number) and the revision content `version` (`{{formula_revision_version}}`).

1. **Create formula (with empty revision 1)** - saves formula and
   revision ids/versions.
2. **List/search/filter formulas** - `search` (code/name), `product`.
3. **Get formula (metadata + revision summaries)**.
4. **Edit formula metadata** - `expected_version` = formula version.
5. **Create new empty draft revision** - number allocated under the
   formula row lock; does not change the formula version.
6. **List revisions (summaries)**.
7. **Get revision (with lines)**.
8. **Save draft revision (raw + packaging lines, one atomic save)** -
   `lines`, when present, is the complete final collection; type and unit
   are derived from the material.
9. **Stale revision version conflict example (expect 409)**.
10. **Client-supplied material_type rejected example (expect 400)**.
11. **Cross-company access-denial example (expect 404)**.
12. **Requirement preview - scale up** (Task 11D) - read-only `GET .../revisions/<id>/requirement-preview/?target_output_quantity=`,
    `formulas.view` only. A planning estimate for a DRAFT or APPROVED revision; no stock check, reservation or issue; no
    rounding, fixed-quantity, yield or loss rules. Uses `{{requirement_target_up}}`.
13. **Requirement preview - scale down with a fractional COUNT requirement** - uses `{{requirement_target_down}}`; fractional
    piece results are shown unrounded with a warning.
14. **Requirement preview - invalid target (expect 400)**.
15. **Get formula approval policy (active SUPERUSER login required)** (Task 11C) - `NOT_CONFIGURED` shell with version 0
    until an administrator answers it.
16. **Set formula approval policy (active SUPERUSER login required)** - `expected_version` = `{{formula_approval_policy_version}}`
    (0 creates). Configuring the policy grants no approval authority.
17. **Approval preview** - read-only `GET .../approval-preview/`, `formulas.view`. `ready_to_attempt` is eligibility, not permission.
18. **Approve revision** - `POST .../approve/` with `expected_version` = `{{formula_revision_version}}`; needs `formulas.view` +
    `formulas.approve` (seeded, assigned to nobody). A missing/unanswered policy returns 400 `formula_approval_policy_not_configured`;
    after approval the revision is immutable. Approval does not create batches or authorize production.

## 29. Batch Planning Drafts folder (Task 12A)

Nine requests for company-scoped manufacturing **batch planning drafts** - a plan is not an official batch
number, MRP record, stock reservation or production authorization. Needs `batch_plans.view/create/edit`
(seeded, assigned to nobody); creating a plan also needs `sales_orders.view` and `formulas.view`. Run
"Direct Sales Order Drafts" and "Formula Drafts" first and set `{{sales_order_line_id}}` (an
existing line) and `{{formula_revision_id}}` to an **APPROVED** revision for the same company/product.

1. **Get batch approval-source formulas** - see the "Formula Drafts" folder's requests 1–9 to reach an APPROVED
   revision first; batch planning needs one that already exists for the same company and product.
2. **List/search/filter batch plans** - `order` (sales-order id), `planned_manufacturing_date`, `search`.
3. **Create batch planning draft** - `sales_order_line_id` + an APPROVED `formula_revision_id` whose product/output
   unit match the line; optional `planned_manufacturing_date`/`packing_size_note`/`notes`.
4. **Get batch plan detail** - includes `source_snapshots` (captured at creation), `current_source_state` and
   `source_drift` (both computed live).
5. **Edit batch plan** - only target/date/packing-note/notes; `expected_version` required.
6. **Batch plan requirement preview** - read-only, reuses the formula calculator; blocked when source drift is
   incompatible.
7. **Mismatched product/unit example (expect 400)** - formula revision's product or output unit does not match the
   sales-order line.
8. **Stale batch plan version conflict example (expect 409)**.
9. **Cross-company access-denial example (expect 404)**.

## 28. Manual flow: catalog + location access via a store role

This collection does not automate the full authorization walkthrough end
to end (it would require switching `username`/`password` mid-run - see
section 6's "Testing denial" for the general pattern), but here is the
order to run it by hand, combining folders already in this collection:

1. **Superuser login** - requests 2 (CSRF) and 3 (Login) with a
   superuser's credentials.
2. **Create catalog data** - folder 13 ("Create unit"), folder 14
   ("Create material category"), folder 15 ("Create material") - in that
   order, since Materials needs `unit_id`/`material_category_id` already
   set.
3. **Create a storage location** - folder 10 ("Create store", if you
   don't already have `store_id`), then folder 16 ("Create storage
   location").
4. **Assign read permissions to an existing store role** - folder 11
   ("Store Roles and Memberships"): "Create store role", then "Replace
   store role permissions" with
   `{"permission_codes": ["shared_catalog.view", "storage_locations.view"]}`
   (both are STORE-scope and always exist - seeded by an additive data
   migration, same convention as Task 07A's `shared_store.view`). Then
   "Assign store membership" for the user you want to test with (set
   `store_user_id` to an existing ordinary user - see folder 6's "Create
   ordinary user" if you need one), and "Assign store role to membership"
   with that role.
5. **Ordinary-user login** - swap `username`/`password` to that ordinary
   user's credentials, rerun requests 2 and 3.
6. **Permitted reads** - folder 13's "List units"/"Get unit", folder 14's
   equivalents, folder 15's equivalents, and folder 16's "List storage
   locations"/"Get storage location" should now all return `200`.
7. **Denied reads** - any write request in folders 13-16 (e.g. "Create
   unit") should return `403` for this ordinary user - only an active
   superuser can mutate catalog or location data. A `GET` against a
   *different* store's locations (one this user has no membership in)
   should return `404`, not `403` - see docs/backend-tasks.md, Task 07B,
   for why that distinction is deliberate (membership-and-permission
   absence for locations is folded into "not found", to avoid confirming
   whether a store exists to a caller with no access to it at all).
8. **Afterwards**, swap `username`/`password` back to the superuser and
   rerun requests 2 and 3 before continuing with any other folder - same
   caution as section 6.

## What this collection does not do

- It does not create, seed, or assume any specific username, password,
  company, store, role, unit, category, material, location, supplier,
  purchase request, purchase order, goods receipt, incoming QC
  inspection, material specification, or permission definition beyond
  what you explicitly set up - see sections 4, 6, 7, 8, 9, 10, 11, 12,
  13, 14, 15, 16, 17, 18, 19, 20, 21 and 22.
- It does not cover any endpoint beyond Tasks 04-09B-3B's scope: no
  HR/employee models, no password recovery, no stock ledger/balances, no
  unit conversions, no QC review/disposition/acceptance/rejection/release
  (a manually-entered inspection *draft*, and its *submission*, are the
  only things that exist - see section 21,
  `docs/incoming-qc-proposal.md`, and `docs/incoming-qc-review-
  proposal.md` for the corrected-but-unimplemented design of the rest),
  no specification approval/publication/effective-date/superseding/
  retirement/cloning, no operational QC read access to a specification,
  and no link from any `IncomingInspection` to a specification version
  (section 22, `docs/incoming-qc-review-proposal.md`),
  no pharmaceutical test specification or pass/fail catalog, no PDF/email
  sending
  (neither issuing a PO nor posting a goods receipt is proof of
  delivery, supplier acceptance, or transmission - no email or document
  is ever generated or sent by this API), no second-approval step for
  issuing a PO or posting a receipt, no supplier qualification/approval,
  no invoicing, no accounting entries, no intercompany transfers, no
  supplier payments, no Tally/accounting integration, no cross-company
  purchasing (a PO's company is always its source Purchase Request's own
  company; a goods receipt's company is always its source PO's own
  company - see `docs/purchase-order-proposal.md`/`docs/receiving-
  proposal.md` for why these are proposals, not confirmed rules), no
  currency support beyond `INR`/`USD`/`EUR`/`GBP` for issuing a PO, no
  free-of-charge (zero-price) purchasing, no over-delivery tolerance when
  receiving, no correction/reversal of a posted goods receipt, no
  pricing/tax/bank-details/payments beyond a PO line's own pre-tax
  `unit_price`/`line_amount` (a goods receipt exposes no price/currency/
  total at all), no other business modules, no frontend. `SUBMITTED` on a
  purchase request only starts a three-step approval round - it is never
  itself approval, and approval itself creates no Purchase Order
  automatically (a PO must be explicitly created from an `APPROVED`
  request) or stock movement. `ISSUED` on a purchase order is a terminal
  state - no reopen, amendment, or cancellation of an issued order exists
  anywhere in this codebase. `FULLY_RECEIVED` delivery progress on a
  purchase order means only that the ordered quantity has physically
  arrived, on paper - never "accepted," "usable," or "financially
  closed," and it creates no available stock anywhere in this codebase.
  An `IncomingInspection` can only ever be `DRAFT`, `SUBMITTED`, or
  `CANCELLED` - there is no "released"/"accepted"/"rejected" state for
  one anywhere in this codebase, and once `SUBMITTED` it is permanently
  frozen (no edit, no cancel, no correction/retest - all deferred, see
  `docs/incoming-qc-review-proposal.md`).
- It cannot, and does not try to, read the HttpOnly refresh cookie's
  value - only Postman's cookie jar handles it, exactly as a real
  browser's cookie jar would for a frontend that used this API.

## 30. Store Preparation folder (Task 12C)

Company access here is dual: `store_preparation.*` permissions live at the STORE, but every request additionally
needs `batch_plans.view` in the source batch plan's own operating company - grant both before running this folder.
Run "Batch Planning Drafts" first and set `{{managed_batch_plan_id}}` to an existing plan's id.

1. **Create store preparation** — `batch_plan_id` required; `packing_type` (free text) and `insert_required`
   (`true`/`false`/omit) optional. `409` if this plan already has a preparation record.
2. **List/filter store preparations** — `?batch_plan=<id>`.
3. **Get store preparation** — includes `plan_context` only (no formula lines/prices).
4. **Edit store preparation** — `packing_type`/`insert_required` only, `expected_version` required.
5. **Duplicate preparation conflict example (expect 409)**.
6. **Stale version conflict example (expect 409)**.

## 31. Official Batch Number Allocation (Task 12D, added to the Batch Planning Drafts folder)

7. **Allocate official batch number** - `POST .../allocate-number/` with `expected_version` = `{{batch_plan_version}}`;
   needs `batch_plans.view` + `batch_plans.allocate_number` (seeded, assigned to nobody). Format `CODEYY-NNN` using
   the source order's CUSTOMER code (never the operating company's own code) and the current business year. A
   repeat at the returned `version` is a harmless no-op; a stale `expected_version` is `409`.

## 32. Material Requisitions folder (Task 13A)

Company access here is dual, like Store Preparation, **plus one more permission**: `material_requisitions.*`
permissions live at the STORE, but every request additionally needs BOTH `batch_plans.view` **and** `formulas.view`
in the source batch plan's own operating company - a material requisition inherently exposes recipe-derived
quantities, so `formulas.view` is required everywhere in this folder, not just on the detail request. Grant all
four permissions (the store-scoped `material_requisitions.view/create/edit` plus the two company-scoped ones)
before running this folder. Run "Batch Planning Drafts" first, set `{{managed_batch_plan_id}}` to an existing
APPROVED-revision plan's id, and `{{managed_batch_plan_version}}` to that plan's current `version`.

1. **Create material requisition** — `batch_plan_id` + `expected_batch_plan_version` required (a field distinct
   from this requisition's own `expected_version`, which does not exist until the record itself does). Every line
   and calculated quantity is auto-fetched server-side from the plan's pinned APPROVED formula revision - nothing
   about the lines is ever supplied in this request. `409` if this plan already has a requisition, or if
   `expected_batch_plan_version` is stale.
2. **List/filter material requisitions** — `?batch_plan=<id>`.
3. **Get material requisition** — response splits lines into `raw_lines`/`packaging_lines`, each showing the
   calculated requirement (exact, possibly approximate) separately from the editable `requested_quantity`; never
   `available_stock`/`shortage`/`reserved_quantity`/`issued_quantity`/`can_produce`/`approved`/`ready_to_issue`.
4. **Edit material requisition (requested_quantity override with remark)** — `expected_version` required; `lines`,
   when present, is a list of PARTIAL edits identified by an EXISTING line `id` only (lines can never be added or
   removed here). A `requested_quantity` differing from the exact calculated requirement needs a non-blank
   `quantity_remark` in the same request, or `400`.
5. **Submit material requisition (Task 15A)** — requires STORE-scoped `material_requisitions.submit`
   (**not** `.edit` — the two are independent) plus the same dual company check. `DRAFT` → `SUBMITTED`, frozen
   from then on (every later `PATCH` returns `400`). Never approves quantities, reserves stock, issues
   materials, or requires an official batch number/confirmed sales order/stock availability. A repeat call at
   the current `version` is an idempotent no-op, not a new submission.
6. **Duplicate requisition conflict example (expect 409)**.
7. **Stale version conflict example (expect 409)**.

## 33. Stock Movements (Recorded Receipts) folder (Task 13C)

Read-only. Requires STORE-scoped `stock.view` plus the SAME company-access rule as "Goods Receipts"
(`purchase_orders.view` in each movement's own source/receiving company) - there is no `formulas.view`
requirement here, since receipt quantities are not formula data. Run the "Goods Receipts" folder first and post at
least one receipt so a movement exists to list.

1. **List recorded stock movements (RECEIPT_IN only)** — every response includes a `coverage` block confirming
   historical receipts are not backfilled, opening stock is not included, and issues/returns/release are not
   tracked; `release_status` is always the literal string `"Not tracked"`.
2. **Filter recorded stock movements by material** — `?material=<id>`. Material Register task (additive):
   each row's request description now also documents `supplier_id`/`supplier_code`/`supplier_name` (the
   receipt's purchase order's supplier — identity only, never price) and `source_goods_receipt_arrived_at`
   (the receipt's own physical arrival date — distinct from `posted_at`, the posting event; they can differ
   by days). Every response also carries a `period` block (see request 5 below).
3. **Recorded receipt quantity balances (not available stock)** — grouped by `(material, unit, source_company)`;
   never merges different units or companies into one number; labeled `recorded_receipt_quantity`, never
   `available_stock`/`usable_stock`/`on_hand`. Material Register task (additive): also accepts
   `posted_from`/`posted_to` (applied before the `SUM`) and returns the same `period` block as the movements
   list; **never** carries a supplier field — a balance row can sum movements from several receipts/suppliers,
   so a single supplier value would mislead, not just be incomplete.
4. **Unknown query parameter rejected (expect 400)**.
5. **Posted-date range on stock movements (posted_from/posted_to)** *(added, Material Register task)* —
   `?posted_from=2026-01-01&posted_to=2026-01-31` (synthetic placeholder dates; replace with a real window to
   see non-empty results against your own data). The response's `period` block always echoes back exactly the
   window applied (`null`/`null` means "all recorded history") — a period subtotal can never be mistaken for
   the all-time total.
6. **Invalid posted_from format (expect 400)** *(added, Material Register task)* — `?posted_from=not-a-date`,
   strict `YYYY-MM-DD` only, same convention as `order_date_from`/`quotation_date_from` elsewhere in this
   collection.
7. **posted_from after posted_to (expect 400)** *(added, Material Register task)* — a reversed range is a
   structured 400 (field `posted_from`), never silently swapped or ignored.

No create/edit/delete request exists in this folder - there is no mutation endpoint anywhere in this app.

## 34. Product CSV Import folder (Task 14A)

Requires COMPANY-scoped `products.view` + `products.create` + `products.import` together on every request - all
three, never a subset. Never updates, reactivates or overwrites an existing `Product` - create-only.

1. **Preview product CSV import** — `multipart/form-data`, one field: `file`. Postman cannot embed a portable file
   reference in an exported collection, so the request body's `file` field starts empty - attach
   `docs/templates/product-import-template.csv` (or your own file) manually before sending. Never creates a
   `Product`; always returns `201`, even for a file this task cannot parse at all (`file_errors` explains why,
   `eligible_for_commit` is `false`). The test script saves `product_import_preview_id`/`product_import_preview_
   version` from a successful response.
2. **Get preview detail (paginated rows)** — `?page=`/`?page_size=` over the normalized row list; ownership- and
   company-scoped (a different user or company gets `404`, never someone else's preview).
3. **Commit product CSV import** — body is only `{"preview_id", "expected_version"}`, never a replacement product
   list. All-or-nothing: any invalid row, or any code/unit that changed since the preview, blocks the ENTIRE
   commit. A repeat call with the same `expected_version` after a successful commit returns the ORIGINAL result
   (same `created_product_ids`) - never a second import.

## 35. Formula Draft CSV Import folder (Task 14B)

Requires COMPANY-scoped `formulas.view` + `formulas.create` + `formulas.import` together, **AND**
`shared_catalog.view` in at least one active store (the SAME rule ordinary material lookups already use - no new
catalog permission, no store access granted by this feature itself). Only creates brand-new `Formula` identities,
each with its own `DRAFT` revision 1 - never adds a revision to an existing formula, never approves anything.

1. **Preview formula CSV import** — `multipart/form-data`, one field: `file`. Attach
   `docs/templates/formula-import-template.csv` (or your own file) manually before sending — Postman cannot embed
   a portable file reference in an exported collection. One row per material line; repeated `formula_code` values
   group rows into one formula (order-preserving, even if a code's rows are interleaved with another's). Never
   creates a `Formula`; always returns `201`. The test script saves `formula_import_preview_id`/`formula_import_
   preview_version` from a successful response.
2. **Get preview detail (paginated groups + nested lines)** — `?page=`/`?page_size=` paginate GROUPS (one per
   prospective formula); each group's own material lines are nested underneath, never separately paginated.
   Ownership- and company-scoped, same as the product import folder.
3. **Commit formula CSV import** — body is only `{"preview_id", "expected_version"}`, never a replacement
   formula/line list. All-or-nothing: any invalid row/group, or an existing formula code, or a product/material/
   unit that changed since the preview, blocks the ENTIRE commit. The importing user is recorded as the sole
   contributor of every created revision. A repeat call with the same `expected_version` after a successful
   commit returns the ORIGINAL result (same `created_formulas`) - never a second import.

## 36. Material Master CSV Import folder (Task 14C)

**Active superuser only** — the SAME, sole authorization every other catalog-mutating endpoint already requires
(`apps.catalog.views`'s own convention for `Material`/`UnitOfMeasure`), never relaxed to `shared_catalog.view`
(a read-only permission). No `company_id` anywhere in the URL — materials are a SHARED catalog identity, never
company-scoped, never duplicated per operating company. Create-only: never updates, reactivates or overwrites
an existing `Material`.

1. **Preview material CSV import** — `multipart/form-data`, one field: `file`. Attach
   `docs/templates/material-import-template.csv` (or your own file) manually before sending. Never creates a
   `Material`; always returns `201`. The test script saves `material_import_preview_id`/`material_import_preview_
   version` from a successful response.
2. **Get preview detail (paginated rows)** — `?page=`/`?page_size=` over the normalized row list; ownership-
   scoped only (no company axis) — a different superuser gets `404`, never someone else's preview.
3. **Commit material CSV import** — body is only `{"preview_id", "expected_version"}`, never a replacement
   material list. All-or-nothing: any invalid row, or a code/unit that changed since the preview, blocks the
   ENTIRE commit. A repeat call with the same `expected_version` after a successful commit returns the ORIGINAL
   result (same `created_material_ids`) - never a second import.

**Import dependency order** for a fresh catalog: Units (superuser-administered, no import built for this yet) →
**Materials (this folder)** → Products (Task 14A) → Formula drafts (Task 14B, resolves `material_code` against
whatever this folder already committed).

Run "Preview product CSV import" first, then "Commit product CSV import" - both reuse `{{company_id}}`.
