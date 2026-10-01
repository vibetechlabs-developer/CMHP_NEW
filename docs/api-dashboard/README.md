# CMHP ERP — Backend API Dashboard

A read-only, self-contained developer reference for the current backend API. Built for the
junior developer building the React frontend on a separate machine, so there is one place to
see which APIs actually exist, how to call them, what they require, which frontend screen uses
them, and what is implemented versus still planned — without needing this repository, a running
server, or a network connection.

## Files

| File | Purpose |
|---|---|
| `index.html` | The dashboard itself. Self-contained — HTML, CSS and JS (including the full API dataset) are all inline. No npm, no server, no CDN, no external fonts, no network access required. |
| `api-data.json` | The same API dataset as a standalone JSON file, for reuse (e.g. scripting, a future codegen step, or importing into another tool). |
| `scripts/` | The Python generator that produced both files above, kept for regeneration when the backend API changes (see **Regenerating** below). Not needed just to view the dashboard. |

## Opening it

`index.html` is a plain static file. Double-click it, or open it directly in any modern browser
via `File → Open...`, or drag it into a browser window. Nothing needs to be installed or running
first — it does not talk to the backend, a database, or the internet.

**Absolute path**: `D:\CMHP_NEW\docs\api-dashboard\index.html`

## Sharing with the junior developer

The entire `docs/api-dashboard/` folder is plain files with no build step. To hand it to the
junior:
- Point them at this path if they have access to the repository (e.g. after a `git pull` /
  file sync), or
- Zip the `docs/api-dashboard/` folder (or just `index.html` alone, if `api-data.json` and
  `scripts/` aren't needed) and send it directly — `index.html` works standalone once copied
  anywhere, since the data is embedded in the file itself.

There is nothing sensitive in either file: no passwords, tokens, cookies, or real captured
responses — every request/response example is clearly synthetic (see **What this is not**
below).

## What this is

- A **searchable, filterable table** of all 176 API operations, grouped by backend module,
  with a detail panel per operation covering purpose, parameters, permissions, headers,
  request/response shape, error responses, side effects, frontend usage and the exact source
  files it came from.
- A **Start Here** section walking through the real request sequence from an unauthenticated
  browser to a store-prepared, officially-numbered batch plan, linking each step to its
  endpoint(s) in the table.
- A **Special Implementation Notes** section covering cross-cutting behaviors (token/cookie
  flow, CSRF, dual-permission checks, full-list-replace semantics, decimal-as-string fields,
  409 handling, immutability after approval/confirmation, snapshot-vs-live data, and the
  distinction between planning calculations and real stock — there is no stock concept in this
  codebase at all).
- A **What Is Still Missing** section listing business functionality that does not exist yet
  (requisitions, stock ledger, issue/return, QC disposition, production/BMR, packaging,
  dispatch, invoicing, reporting), each tagged Implemented / Partially Implemented / Proposed /
  Awaiting Client Decision.
- A print stylesheet: filter/search to the subset you want, then print — the sidebar, filter
  controls and hidden (filtered-out) rows are excluded from the printed/PDF output automatically.

## What this is not

- **Not an API testing tool.** There are no "Try it" / execute buttons anywhere. Every request
  and response example is synthetic, illustrative data, explicitly labeled as such in the
  detail panel — never a captured live response.
- **Not a login form.** No credentials are collected, stored, or transmitted anywhere on this
  page.
- **Not the business/ERP dashboard.** This is developer documentation only.

## Verified counts (as of the date below)

- **120** unique API path patterns
- **176** implemented method + path operations
- **20** backend modules (Django apps) with at least one endpoint
- **176 / 176** operations are source-code verified (see **How this was verified** below) —
  0 documentation-only entries
- Last inventory verification: **2026-09-30** (updated for Task 13C, Physical Receipt Ledger —
  the original build on 2026-09-29 reported 116 patterns / 170 operations / 18 modules; the
  dashboard's own generator derives these counts dynamically from its data, so this file's own
  numbers never drift from a regeneration again — only this prose needs a manual touch-up)

These counts were produced by walking the live `django.urls.get_resolver()` output and checking,
for every resolved class-based view, which of `get`/`post`/`put`/`patch`/`delete` are genuinely
defined in that view's class hierarchy — not merely theoretically routable. `HEAD`/`OPTIONS`
(added automatically by DRF to every view) are excluded, as is Django Admin (`/admin/...`) and
any static/media route. This project has no `DELETE` endpoint anywhere — every lifecycle
transition is a paired `POST .../activate/` / `.../deactivate/` or a named action
(`submit`/`confirm`/`issue`/`approve`/`post`/`cancel`), never a hard delete.

Every one of the 176 rows was then cross-checked programmatically: the exact `(method, path)`
set produced by the dashboard's data file was diffed against the exact set produced by the live
resolver walk. The two sets matched with **zero missing and zero extra entries** before this
dashboard was built.

## Modules included

`authentication` (5), `companies` (7), `permissions` (17), `stores` (20), `catalog` (18),
`suppliers` (6), `purchasing` (15), `receiving` (7), `stock_movements` (2, added by Task 13C),
`quality` (15), `customers` (6), `products` (6), `quotations` (4), `sales_orders` (8),
`formulas` (13), `batch_plans` (6), `store_preparation` (4), `material_requisitions` (4, added
by Task 13A), `users` (12), `common` (1). Numbers are operation counts per module; they sum to
176. The dashboard's sidebar
groups a few of these together for navigation (e.g. `companies` + `permissions` under
"Companies, Roles & Permissions", matching how the frontend screens are organized) while keeping
them separately filterable underneath.

## Documentation / code discrepancies found while building this

1. **CORS configuration is now out of date in `docs/api-inventory-current.md`.** That document
   (written earlier in this project) states no CORS configuration exists anywhere in the
   codebase. That was true when it was written; it is now outdated by a later, separate task in
   this same project that installed `django-cors-headers` and wired it into
   `config/settings/base.py` / `config/settings/local.py`. Both `CORS_ALLOWED_ORIGINS` and
   `CSRF_TRUSTED_ORIGINS` default to **empty** — nothing is enabled unless a developer's own
   `.env` sets them, so this does not change behavior for a plain single-machine local run. This
   dashboard reflects the current, code-verified state.
2. **`docs/frontend-api-handoff.md` §14's own opening paragraph is stale.** It says "no
   approval... Do not render Approve" — written before formula-revision approval was added later
   in the same document (§14.8c), which is the correct, current, implemented contract. This
   dashboard follows §14.8c and the live code.
3. **Optimistic concurrency (`expected_version`) is not universal.** Every core
   business-transaction module requires `expected_version` on every mutating call — confirmed by
   searching every app's `serializers.py` for the literal field. `apps.catalog` (units,
   categories, materials), `apps.companies`, `apps.stores`, `apps.suppliers`, `apps.users` and
   `apps.permissions` (role management) have **zero** `expected_version` usage anywhere,
   confirmed the same way — these administrative/reference-data modules perform unconditional
   overwrites with no conflict detection. This is a real, current characteristic of the API, not
   a dashboard error, and is flagged per-operation in the Version Token column and filter.
4. **Three distinct "version" concepts exist on Material Specifications and Formulas** (a row's
   own concurrency token, a plain allocation counter never sent as `expected_version`, and a
   child record's own separate concurrency token) — see `docs/frontend-api-handoff.md` §9.2/§14.3
   for the full history, including a real bug (Task 09B-3B.1) where the first implementation
   shipped with no concurrency token at all and was corrected the same session. Kept visually
   separate in this dashboard's detail panels for the affected operations.

## How this was verified

- **Path/operation existence**: live `django.urls.get_resolver()` walk against the current
  codebase (see **Verified counts** above), cross-checked programmatically against every row in
  `api-data.json` — exact match, zero discrepancies.
- **Permission codes**: read directly from `apps/customers/views.py`, `apps/purchasing/views.py`,
  `apps/quality/views.py` and `apps/receiving/views.py` in this session; the remaining modules'
  permission codes were carried over from `docs/frontend-api-handoff.md` and
  `docs/api-inventory-current.md`, both themselves built from direct code reading in earlier
  tasks of this same project.
- **`expected_version` requirement**: verified by searching every app's `serializers.py` for the
  literal `expected_version` field and confirming which serializer each view actually
  instantiates (not assumed from naming convention alone — e.g. `PurchaseRequestRejectSerializer`
  was confirmed to subclass the version-bearing `PurchaseRequestApprovalDecisionSerializer`
  rather than guessed).
- **`api-data.json` validity**: parsed successfully with Python's `json` module; the embedded
  copy inside `index.html` was separately extracted and re-parsed to confirm it matches.
- **Duplicate detection**: a full `(method, path)` uniqueness pass over all 176 rows found zero
  duplicates.
- **JavaScript syntax**: the dashboard's script block was extracted and checked with
  `node --check` — no syntax errors.
- **No network dependency**: confirmed no `http://`/`https://` `href`/`src` references exist
  anywhere in `index.html`.
- **Visual/browser verification was NOT performed.** No browser-automation tool was available in
  this session (and installing one was out of scope — "do not install new dependencies just for
  this dashboard"). The filtering, search, detail-panel and print-stylesheet logic were verified
  by code review and Node.js syntax checking only, not by rendering the page in an actual
  browser. Before relying on this for a live handoff, open `index.html` once yourself and click
  through a few rows, a filter, and Ctrl+P to confirm the layout renders as intended on your
  actual screen.

## Regenerating this dashboard

The dashboard is generated, not hand-written, from a small set of Python files under `scripts/`:

- `scripts/common.py` — the shared `op(...)` helper that builds one operation record.
- `scripts/module_admin.py` — authentication, companies, permissions, stores, catalog, suppliers.
- `scripts/module_purchasing.py` — purchasing (requests + orders), receiving, quality.
- `scripts/module_sales.py` — customers, products, quotations, sales orders.
- `scripts/module_manufacturing.py` — formulas, batch plans, store preparation, users, health.
- `scripts/build.py` — combines all `module_*.py` files into `../api-data.json`, plus the
  module list, "not implemented" list, and discrepancy notes.
- `scripts/index_template.html` — the dashboard shell (HTML/CSS/JS) with an
  `__API_DATA_JSON__` placeholder.
- `scripts/assemble.py` — injects `../api-data.json` into `index_template.html` and writes
  `../index.html`.

When backend endpoints change:

1. Re-run a resolver walk against the live codebase (the same technique
   `docs/api-inventory-current.md`'s own "Reproduction" section documents: walk
   `django.urls.get_resolver()`, and for every resolved class-based view check which of
   `get`/`post`/`put`/`patch`/`delete` are actually defined) to get the current path/operation
   list.
2. Diff that list against `api-data.json`'s `operations` array (same `(method, path)` pairs) to
   see what was added, removed, or changed.
3. Update the corresponding `module_*.py` file(s) — add/remove/edit the relevant `op(...)` calls.
4. From `docs/api-dashboard/scripts/`, run:
   ```
   python build.py
   python assemble.py
   ```
   Both scripts write their output one directory up (`../api-data.json`, `../index.html`), so
   they regenerate the real dashboard files in place — no manual copying needed.
5. Re-open `index.html` and confirm the Overview cards' path/operation counts match your new
   resolver walk.

No server, database, migration, or npm install is needed anywhere in this process — the
generator is plain Python against files already on disk.
