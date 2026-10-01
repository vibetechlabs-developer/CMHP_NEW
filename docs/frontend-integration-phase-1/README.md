# CMHP ERP — Frontend Integration Guide (Phase 1)

A focused, interactive implementation workbook for the ONE thing Phase 1 needs: a logged-in,
permission-checked user picking a company, looking up a real customer and product, and
saving/reopening a sales-order draft. Built for two audiences at once — the project coordinator
(plain-English overview, demo script, progress tracking) and the junior React developer
(exact endpoints, request/response shapes, field mappings, error handling, a React/TypeScript
reference pattern).

This is **not** a general API reference. For that, see `docs/api-dashboard/index.html` (all 170
backend operations). This guide only covers what Phase 1 needs and explicitly marks order
confirmation, batch planning, formulas, stock and production as "Later phases."

## Files

| File | Purpose |
|---|---|
| `index.html` | The guide itself. Self-contained — HTML, CSS, JS and data are all inline. Opens by double-click, no npm/server/internet needed. |
| `build/` | The generator that produced `index.html`, kept for regeneration when the backend changes. Not needed just to view the guide. |

## Opening it

Double-click `index.html`, or open it via `File → Open...` in any modern browser.

**Absolute path**: `D:\CMHP_NEW\docs\frontend-integration-phase-1\index.html`

## What you (the coordinator) do first

1. Open the guide and read **§A Start Here** for the one-screen overview.
2. Go to **§B Backend Connection** and fill in the frontend's origin, the agreed backend URL,
   and the rest of the checklist with the junior (on a call or however you coordinate) — every
   field starts as "TO BE SUPPLIED" on purpose, since none of that was known when this was
   built. Filling it in only saves values in your own browser's local storage; it does not
   change any server configuration.
3. Once the connection details are agreed, add the resulting lines to `backend/.env` yourself
   (the guide never edits it) and start the backend the way §B describes.
4. Give the junior this file (or the whole `docs/frontend-integration-phase-1/` folder) and the
   demo account's password, through whatever private channel you already use — never write a
   password into this file or any other document.
5. Use **§J Demo Checklist** as your own script the first time you screen-share a working demo.

## What the junior does first

1. Read **§C Login and Session** through **§H Edit Order** in order — each step names exactly
   what to implement, the exact HTTP call, a representative response, and a "Done when…"
   checklist.
2. Use the React/TypeScript reference pattern in §C as a starting point for the API client and
   auth service — it is explicitly a reference, not integrated code; adapt it to whatever
   already exists in the frontend.
3. Mark each step's status (Not started / In progress / Blocked / Verified in browser) as work
   progresses, using the small control at the bottom of each step's card.
4. Export progress (**§K**) as a JSON file periodically and send it back to the coordinator —
   progress is saved only in the junior's own browser and is not automatically shared.

## Missing connection/demo setup, as of when this was built

- **Frontend origin**: unknown — not filled in.
- **Network arrangement** (same LAN vs. shared/staging backend): unknown — not filled in.
- **`CORS_ALLOWED_ORIGINS` / `CSRF_TRUSTED_ORIGINS` / `ALLOWED_HOSTS`**: confirmed live this
  session to be `[]` / `[]` / `['localhost', '127.0.0.1']` — nothing beyond this machine can
  reach the API yet. `django-cors-headers` is installed and wired into `MIDDLEWARE`, but that is
  not the same as being configured for a specific origin — see §B for why this distinction
  matters and exactly what to add once the origin is known.
- **Demo account password**: intentionally not in this document or its data files. Must be
  shared with the junior privately.

None of the above blocked building this guide — every affected section shows the pending values
as explicit "TO BE SUPPLIED" placeholders rather than an invented origin/URL.

## Documentation discrepancies found while building this

- `docs/frontend-api-handoff.md` documents CSRF failures only implicitly; direct code reading
  this session (`apps/authentication/csrf.py`) confirms a CSRF failure is a **403** (`PermissionDenied`,
  message `"CSRF Failed: <reason>"`), not a 400 — worth knowing precisely since it's easy to guess
  wrong. This guide's §I uses the code-verified value.
- The general API dashboard (`docs/api-dashboard/index.html`) and `docs/frontend-api-handoff.md`
  are both accurate for the fields checked directly again this session (login/CSRF/refresh
  shapes, customer/product list filters, sales-order create/edit semantics, pagination
  defaults) — no correction was needed there, only confirmation against the live serializer/view
  code rather than trusting the documents alone.
- `docs/junior-frontend-connection-handoff.md` (from an earlier session) assumed a specific LAN
  IP and origin that were never actually written into the real `backend/.env` — confirmed this
  session via a live settings check (`CORS_ALLOWED_ORIGINS`/`CSRF_TRUSTED_ORIGINS` still empty,
  `ALLOWED_HOSTS` still just localhost). Do not assume that document's specific IP/origin values
  are still the live configuration; §B of this guide treats the connection details as unknown
  again rather than reusing them.

## Checks actually completed

- Every endpoint, field name, required/optional/immutable rule, status code, and error message
  quoted in this guide was read directly from the current backend code this session
  (`apps/authentication/*.py`, `apps/companies/views.py`, `apps/stores/views.py`,
  `apps/permissions/views.py`, `apps/customers/*.py`, `apps/products/*.py`,
  `apps/sales_orders/*.py`, `apps/quotations/serializers.py` and `services.py` for the shared
  line-validation rules, `apps/common/pagination.py`) — not copied from the API dashboard or the
  handoff doc without re-checking.
- `demo_sales`'s exact permissions, company membership, and available sample data (1 active
  customer, 2 active products in company `DEMOA`) were re-verified with a fresh read-only
  database query this session, not assumed from an earlier session's notes.
- The live `CORS_ALLOWED_ORIGINS`/`CSRF_TRUSTED_ORIGINS`/`ALLOWED_HOSTS` values were read from
  the running settings this session (all still at their safe defaults — nothing enabled).
- The embedded step/error/demo dataset was validated as parseable JSON, both standalone
  (`build/steps-data.json`) and as embedded in `index.html`.
- The page's JavaScript was extracted and checked with `node --check` — no syntax errors.
- Confirmed zero external `http(s)://` references anywhere in `index.html`.
- The full generator pipeline (`build_steps.py` → `assemble.py`) was run end-to-end from its
  real location in `build/` to prove regeneration works in place, not just in a scratch copy.
- **No runtime/browser verification was performed** — everything above is code-inspection and
  file-level validation, not a live click-through in an actual browser (no browser-automation
  tool was available this session, and installing one was out of scope). Per the task's own
  constraint, this is stated explicitly rather than implied. Open the file yourself once, click
  through a step's status control, try Export/Import, and Ctrl+P before relying on it in a real
  handoff.
- No dependencies were installed, no ERP test suite or migration was run, no seed command was
  run, and no backend business logic or the (unseen) frontend was changed. `.env`, the venv,
  business data, and unrelated servers/ports were all left untouched.

## Regenerating this guide

The guide is generated from four files in `build/`:

- `build/build_steps.py` — the step/error/demo-script data (`op`-style builder, writes
  `steps-data.json`).
- `build/index_shell.html` — the page shell: CSS, navigation, and three placeholders
  (`<!--SECTIONS-->`, `__STEPS_JSON__`, `__APP_JS__`).
- `build/sections.html` — the static prose for §A, §B, §I, §J, §K and the field-mapping/
  concept notes inside §D–§H (the step cards themselves are rendered by JS from
  `steps-data.json` into empty containers this file defines).
- `build/app.js` — rendering, the localStorage-backed checklist, export/import, and the
  connection-form fill-ins.
- `build/assemble.py` — combines the four files above into `../index.html`.

To regenerate after a backend change:

```
cd docs/frontend-integration-phase-1/build
python build_steps.py
python assemble.py
```

Both write their output relative to `build/`, so `../index.html` (the real guide) is updated in
place — no manual copying needed. Re-open `index.html` afterward to confirm.

No server, database, migration, or npm install is needed anywhere in this process.
