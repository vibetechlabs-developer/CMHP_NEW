# Demo Runbook — Procurement → Receiving → QC Draft

A short, practical guide to running the implemented flow end to end on a
local machine, for a client demo or a frontend developer's first look at
the real API. This document **links to** the detailed documents rather
than repeating them — see the reference list at the end.

> **Task 11B addition.** This runbook also covers the implemented commercial
> drafting (quotation, direct sales order) and formula drafting journeys - see
> §4.3 and `docs/demo-integration-matrix.md`. Those are **DRAFT only**: no order
> confirmation, formula approval, batch, production authorization, stock balance
> or reservation exists or is created.
>
> **Scope note.** This runbook, and the demo it describes, cover exactly
> what is implemented today: Purchase Request → 3-step Approval →
> Purchase Order → Issue → Physical Receiving → QC inspection **draft**.
> **This is not client-approved as a finished business process, and it is
> not production-ready.** See `docs/erp-client-flow.md` for the full
> business-flow picture, including everything still PLANNED.

---

## 1. Startup

```powershell
cd D:\CMHP_NEW
.\venv\Scripts\Activate.ps1
cd backend
python manage.py check                              # system checks
python manage.py makemigrations --check --dry-run    # migration consistency
python manage.py migrate                             # apply any pending migrations
python manage.py runserver 127.0.0.1:8001
```

**Health check**: `GET http://127.0.0.1:8001/api/v1/health/` → `{"status": "ok"}`.

Before starting the server, verify nothing else is already on port 8001,
and if something is, confirm via its process command line that it is
actually this project's own `manage.py runserver` before reusing or
restarting it (`Get-CimInstance Win32_Process -Filter "Name = 'python.exe'"`
in PowerShell, or `netstat -ano | findstr :8001` to find the PID first).
Never assume a listening process on that port belongs to this project.

## 2. Demo-account setup (secure, local, idempotent)

```powershell
python manage.py seed_demo_data --yes
```

This management command (`apps/common/management/commands/seed_demo_data.py`):

- **Refuses to run unless `settings.DEBUG` is `True`** — it cannot run
  against `config.settings.production` (which hardcodes `DEBUG=False`).
  It also refuses without the explicit `--yes` flag.
- Creates two synthetic companies (`DEMOA`, `DEMOB`), one shared store
  (`DEMOWH`), one material/unit/category/supplier, and eight `demo_*`
  users with the memberships/roles/permissions the flow below needs.
- **Is idempotent** — safe to re-run. It never touches an existing
  identity that doesn't already look like its own prior output (same
  email pattern for a user, same field values for a company/store/etc.);
  if it finds a genuine conflict, it stops with a clear error rather than
  overwriting anything.
- **Never hardcodes a password anywhere.** A fresh random password is
  generated only for each *newly created* user and written to a local,
  gitignored file: `backend/.demo_credentials.local.json`. **Never commit
  this file.** Re-running the command after all demo users already exist
  leaves that file untouched (an earlier bug that overwrote it with an
  empty list on a no-op rerun was found and fixed the same session it was
  introduced — see `docs/backend-decisions.md`, Task 09B-1).
- If a demo user somehow already exists **without** a recorded password
  (e.g. the credentials file was deleted), reset it locally with
  `python manage.py changepassword <username>`.

**Demo users created**: `demo_requester`, `demo_approver1`,
`demo_approver2`, `demo_approver3`, `demo_buyer`, `demo_receiver`,
`demo_qc`, `demo_companyb_user`, plus (Task 11B) `demo_sales`,
`demo_formula`, `demo_formula_nocatalog`.

**Task 11B synthetic records** (same command, same safeguards, marked
`(Synthetic demo data - Task 11B)`): unit `DEMOBTL` (COUNT), packaging
material `DEMOPACK1`, customers `DEMOCUST1` (DEMOA) and `DEMOCUSTB`
(DEMOB), products `DEMOPROD1` (sales unit DEMOBTL) and `DEMOPROD2` (sales
unit DEMOKG). A first run on an already-seeded database created 9 records
(1 unit, 1 material, 2 customers, 2 products, 3 users) and reused 15; a
second run created 0 and reused 24.

**Credentials file**: when a run creates only some new users, their
passwords are **merged** into the existing file - earlier users' entries
are kept and never overwritten (a defect where new users would have
replaced the whole file was found and fixed in Task 11B, with regression
tests in `tests/test_seed_demo_data.py`). A run that creates nothing
leaves the file byte-for-byte untouched. Credentials are never printed.

## 3. Company/store access matrix

| User | Company A (`DEMOA`) membership/permissions | Company B (`DEMOB`) | Store `DEMOWH` membership/permissions |
|---|---|---|---|
| `demo_requester` | `purchase_requests.view/create/edit/submit/cancel` | — | — |
| `demo_approver1/2/3` | `purchase_requests.view/approve` (3 distinct people — required, see below) | — | — |
| `demo_buyer` | `purchase_requests.view`, `purchase_orders.view/create/edit/cancel/issue` | — | — |
| `demo_receiver` | `purchase_orders.view` | — | `receiving.view/create/edit/post/cancel` |
| `demo_qc` | **bare membership only — no permissions** | — | `incoming_qc.view/create/edit/cancel` |
| `demo_companyb_user` | — | `purchase_requests.view` | — |
| `demo_sales` (11B) | `customers.view`, `products.view`, `quotations.view/create/edit`, `sales_orders.view/create/edit` | — | — |
| `demo_formula` (11B) | `products.view`, `formulas.view/create/edit` | — | `shared_catalog.view` (material lookup) |
| `demo_formula_nocatalog` (11B) | `products.view`, `formulas.view/create/edit` | — | **none** (material lookup denied by design) |
| `demo_planner` (13E) | `customers.view`, `products.view`, `sales_orders.view/create`, `formulas.view`, `batch_plans.view/create/allocate_number` | — | — |
| `demo_formula_approver` (13E) | `formulas.view/approve` (setup-only — never a contributor, see below) | — | — |
| `demo_store_planner` (13E) | `batch_plans.view`, `formulas.view` (dual-access rule for requisitions, Task 13A) | — | `store_preparation.view/create/edit`, `material_requisitions.view/create/edit` |

Two access-design points this matrix is built to demonstrate directly:

- **`demo_qc` deliberately holds zero Company A permissions** (not even
  `purchase_orders.view`) — proving incoming-QC access never needs
  purchasing-price visibility (`docs/incoming-qc-proposal.md`).
- **`demo_companyb_user` has no store membership at all** — proving
  company membership never grants store access, and that Company B's
  (empty) data stays invisible to anyone without their own Company A
  access, even though both companies share the one physical store.

**The three approvers must be three distinct people.** The currently
implemented (provisional, not client-confirmed) rule forbids the same
approver from deciding two steps of one approval round — see
`docs/erp-client-flow.md` §3.2 and `docs/erp-handoff-open-decisions.md`
item A3.

## 4. Exact execution order

### 4.1 Postman

Import `docs/postman/CMHP_Local.postman_collection.json` and
`CMHP_Local.postman_environment.json` (see `docs/postman/README.md` §1–2
for the import/login steps). Manual Postman execution of most folders is
still deferred (documented, not run through the GUI) — the folder order
below is what a manual run would follow:

1. Top-level requests 1–3 (Health → CSRF → Login) as `demo_requester`.
2. Folder 18 "Purchase Requests": create → submit → (re-login as each
   approver in turn) → approve ×3.
3. Folder 19 "Purchase Orders": create (as `demo_buyer`) → update price
   → issue.
4. Folder 20 "Goods Receipts": create (as `demo_receiver`) → post → (60
   of 100) → create second receipt → post (remaining 40) → confirm
   `FULLY_RECEIVED` via "Eligible purchase orders for receiving".
5. Folder 21 "Incoming QC Inspections" (as `demo_qc`): eligible receipt
   lines → create draft → list → get → edit observations → cancel.

### 4.2 Real HTTP script (what was actually run for this task)

```powershell
python scripts/demo_http_flow.py
```

This standard-library-only Python script (no `requests` dependency — see
its own docstring) runs the **entire** flow above over real HTTP against
`127.0.0.1:8001`, using the demo credentials file from step 2, and
prints each step's result. It was executed for real as part of this
task — see §6 below for the actual outcome.

### 4.3 Commercial and formula drafting demo (Task 11B, real HTTP)

Execution order (server already running on `127.0.0.1:8001`; confirm it is
this project's own `manage.py runserver` before reusing it):

```powershell
cd D:\CMHP_NEW\backend
python manage.py seed_demo_data --yes          # idempotent; adds the 11B records/users
python scripts/demo_http_commercial_formula.py # 52 checks: 35 HTTP status checks + 17 assertions
```

The script logs in as `demo_sales`, `demo_formula`, `demo_formula_nocatalog`
and `demo_companyb_user` (ordinary users, no superuser bypass) and runs
journey A (commercial drafting), B (formula drafting) and C (access and
conflict checks). Routes, permissions, screens and expected results are in
`docs/demo-integration-matrix.md`. It writes ids (no secrets) to
`backend/.demo_commercial_formula_result.local.json` (gitignored).

**Results and limits**: quotations, direct sales orders and formula
revisions are **DRAFT only**. A direct sales order is not converted from a
quotation. No approved formula or production authorization exists, and no
stock balance or reservation is created. **Formula users need
`shared_catalog.view` through an active store membership to look up
materials.**

**A note on the login throttle**: the backend rate-limits login attempts
(5/minute per client IP by default). Logging in as seven different demo
users in quick succession genuinely triggers this — it is real,
intentional backend behavior, not a script bug. `demo_http_flow.py`
handles it by waiting out the server's own hinted retry time and trying
again; it never bypasses the limit or changes any setting.

### 4.4 Connected planning demo (Task 13E, real HTTP)

The Phase 1 frontend build order (§8 below) stops at order drafting.
This is the **next** connected journey — Login → Company → Customer/
Product → Sales-order draft → an already-**approved** formula → Batch
plan (with an explicit packing relationship) → Requirement preview and
packing assessment → official Batch number → Store Preparation →
Material Requisition draft — using only endpoints that already exist
(Tasks 10F, 11C, 12A–12D, 13A). No new business module or lifecycle rule
was added to build this.

**One-time setup (idempotent, part of `seed_demo_data` itself — no
separate command)**:

```powershell
cd D:\CMHP_NEW\backend
python manage.py seed_demo_data --yes
```

Because no APPROVED demo formula existed yet, this run also creates,
approves and reuses on every later run:

- Two **new** mass units with an explicit Task 12B-2 `canonical_factor` —
  `DEMOMKG` (=1000, a kilogram-equivalent) and `DEMOMG` (=1, a gram-
  equivalent). `DEMOKG`/`DEMOBTL` are never touched — `canonical_factor`
  is immutable once a unit is first saved, and `DEMOKG` was already saved
  with `None` before this task existed.
- A formula `DEMOFPACK13E` on product `DEMOPROD1`, created and given two
  **minimal, purely arithmetic** lines (`DEMOMAT1` raw, `DEMOPACK1`
  packaging — not a real pharmaceutical formula) by `demo_planner`.
- Company `DEMOA`'s `FormulaApprovalPolicy` set to
  `allow_self_approval: false` — a **demonstration-only** setup on the
  already-synthetic `DEMOA` company, configured by the same superuser this
  command already uses for every other membership/role assignment, never
  a real client policy decision.
- Revision 1 approved by `demo_formula_approver` — a separate persona who
  never creates or edits any content, so the disabled-self-approval rule
  is satisfied without a superuser bypass or a direct status edit.

```powershell
python scripts/demo_http_planning_journey.py   # 49 checks, all real HTTP
```

Logs in as `demo_planner` (order/formula/batch-plan preparation access)
and, partway through, `demo_store_planner` (store preparation and
requisition access only — see §3's access matrix for exactly why each
needs the permissions it has, including the dual `batch_plans.view` +
`formulas.view` company check material requisitions require). Ids are
written to `backend/.demo_planning_journey_result.local.json`
(gitignored, no secrets).

**The packing scenario** (client's packing example, entirely synthetic):
product sold in `DEMOBTL` bottles; formula output in the new `DEMOMKG`
unit; planned pack quantity 3024 bottles; packing content 25 g/bottle;
manufacturing target 76 kg-equivalent. Expected packed content
(`3024 × 25 g ÷ 1000`) is **75.6**; the difference against the target
(`76 − 75.6`) is **+0.4**, always labeled "Planning quantity difference"
— never waste, loss or allowance. The batch number uses customer
`DEMOCUST1`'s own code (clearly synthetic — never a real client sequence),
e.g. `DEMOCUST126-001`.

**Repeat safety, actually demonstrated by running the script three
times in this session**: the sales order and batch plan (no database
uniqueness of their own) are tracked in the run-state file and reused
after re-validating their context over HTTP — never re-created on a
clean rerun. Store Preparation and Material Requisition (each
database-uniqueness-protected, one per batch plan) are always POSTed
again; a `409` is treated as confirmation the existing record is correct
— **never** as a successful new creation — and the existing record is
then read back. Batch number allocation is itself idempotent at the
plan's current version (Task 12D) and was confirmed to return the exact
same permanent number on every repeat.

## 5. Irreversible actions and starting a fresh scenario

**Irreversible within this demo, exactly as in production use**:

- Issuing a Purchase Order (`ISSUED` is terminal — no edit/reopen/cancel).
- Posting a Goods Receipt (`POSTED` is terminal — no edit/cancel; no
  correction/reversal mechanism exists at all yet).
- Approving/rejecting a Purchase Request step (a decision, not reversible
  — though a rejected request can be revised and resubmitted, starting a
  new round).

**To run a second, independent scenario without resetting anything**:
simply run `python scripts/demo_http_flow.py` again. It creates a **new**
Purchase Request/Purchase Order/Goods Receipts/Inspection chain each
time (new reference numbers) rather than reusing the first run's records
— nothing needs to be deleted or reset first. The demo company/store/
material/supplier are reused (that's the point of `seed_demo_data`'s
idempotency); only the transactional documents (PR/PO/GR/QC) accumulate.
Reference IDs from the most recent run are written to
`backend/.demo_flow_result.local.json` (also gitignored — no secrets in
it, just ids and reference strings) for a frontend developer to look up
real records to click through in the admin or via the API.

**This never touches real business data.** Every demo record is
namespaced (`DEMOA`/`DEMOB`/`DEMOWH`/`DEMOMAT1`/`DEMOSUP`/`demo_*`
usernames) and `seed_demo_data` stops with an error rather than reusing
any identity that doesn't already look like its own output.

## 6. Actual verification results (from this session, not assumed)

| Check | Result |
|---|---|
| `python manage.py test tests.test_incoming_inspections` | **60/60, OK** (after fixing a real `receipt_line_id` prohibited-field bug — see `docs/backend-decisions.md`, Task 09B-1) |
| Focused regression (`test_incoming_inspections` + `test_receiving` + `test_permissions` + `test_store_permissions` + `test_company_management` + `test_stores`) | **376/376, OK**, 1277.5s, exit code 0 — zero failures/errors |
| `python manage.py check` | Passed — no issues |
| `python manage.py makemigrations --check --dry-run` | Passed — no changes detected |
| `python manage.py migrate` (live dev database) | Passed — `permissions.0010_seed_incoming_qc_permissions`, `quality.0001_initial` applied cleanly |
| Real HTTP demo (`scripts/demo_http_flow.py`) against `127.0.0.1:8001` | **All stages passed**: PR created → submitted → approved ×3 (`APPROVED`) → PO created → priced → issued (`ISSUED`) → 60 units received (`PARTIALLY_RECEIVED`, 40 remaining confirmed) → 40 units received (`FULLY_RECEIVED` confirmed) → QC inspection draft created against the first receipt's line → one observation recorded and retrieved back correctly |
| Task 11B seed regression tests (`tests.test_seed_demo_data`) | **8/8, OK**, Python exit code 0 |
| Task 11B real HTTP demo (`scripts/demo_http_commercial_formula.py`) | **52/52 checks passed** (35 HTTP status checks, 17 assertions) - see `docs/demo-integration-matrix.md` |
| Prior full regression suite (Task 09A, last full run) | 958/958, `OK`, exit code 0 — see `docs/backend-tasks.md`, Task 09A row (this session's task explicitly said not to duplicate a full-suite run without cause) |
| Task 13E seed regression tests (`tests.test_seed_demo_data`, 3 new + 8 existing) | **11/11, OK**, exit code 0 |
| Task 13E real HTTP demo (`scripts/demo_http_planning_journey.py`), run three times in this session | **48/48, then 48/48, then 49/49 checks passed**, exit code 0 each time — the 3rd run's extra check (`no duplicate requisition id was created on rerun`) only applies once a prior run's id exists to compare against; reused the same sales order (id 3) and batch plan (id 1) across all three runs, allocated the SAME batch number (`DEMOCUST126-001`) every time, and confirmed the store preparation and material requisition each `409`'d (not re-created) on runs 2 and 3 |

This demonstrates **physical receipt and QC draft recording only**. No
material was, or could be, labeled accepted, released, or counted as
available stock anywhere in this flow — those concepts do not exist in
the system yet.

## 7. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `401` on any authenticated call | Access token missing/expired (5-minute default lifetime) | Call `POST /api/v1/auth/refresh/` (cookie-based, needs the CSRF header too), or log in again |
| `403` with "You must be an active superuser..." | Calling a superuser-only endpoint (Users/Companies/Stores/Catalog/Suppliers management) as a non-superuser | Use one of the project's real superusers for admin screens, not a demo user |
| `403` naming a missing permission code | The user has store/company membership but lacks that specific permission | Check the access matrix in §3, or `GET .../my-permissions/` for that user |
| `404` where you expected `403` | This project's consistent "fold into 404" rule: no membership at all looks identical to "doesn't exist" | Confirm the user actually has the required membership, not just the permission — see `docs/frontend-api-handoff.md` §0.8 |
| `409 Conflict` | Stale `expected_version` (or, for Goods Receipts, an `idempotency_key` reused with different content) | Re-fetch the resource, read its current `version`, retry with that — **never** silently resubmit the same decision with a refreshed version without showing the user what changed, see `docs/frontend-api-handoff.md` §9 |
| `429 Request was throttled` on login | The real login rate limit (5/min per IP) | Wait the hinted number of seconds and retry once — see §4.2 above |
| `403` naming `shared_catalog.view` on `GET /api/v1/materials/` | A formula user without a store membership holding `shared_catalog.view` (by design - see `demo_formula_nocatalog`) | Grant a store role containing `shared_catalog.view` in an active store; do not expect company permissions to satisfy it |
| Demo script exits with "No recorded password for '...'" | The credentials file doesn't have that user (it already existed before `seed_demo_data` last ran) | `python manage.py changepassword <username>` locally, or re-check `.demo_credentials.local.json` |

## 8. Frontend developer: first assignment

Build in this order — each step only needs what's already implemented
and documented:

1. **React project setup** — scaffold the app, HTTP client wrapper.
2. **Login / session / logout** — implement exactly the flow in
   `docs/frontend-api-handoff.md` §0.2–0.4 (CSRF bootstrap → login →
   `/me/` → refresh-on-401 → logout). This is the foundation everything
   else depends on.
3. **Company/store selection** — `NAV-01` in `docs/erp-screen-catalog.md`,
   backed by `GET /companies/mine/` and `GET /stores/mine/`
   (`docs/frontend-api-handoff.md` §2, §4). Remember: this selection is a
   **UI convenience only** — the backend independently re-authorizes
   every request regardless of what's selected (§0.8).
4. **App layout/shell** — the header/nav/company-store switcher that
   every later screen sits inside.

This assignment's own scope stops at order drafting — login, workspace
selection, customer/product lookups, and sales-order draft create/list/
detail/edit (see `docs/frontend-integration-phase-1/index.html`). The
connected planning journey in §4.4 (formula selection, batch planning,
batch numbering, store preparation, material requisition) is a **later
phase**, not part of this first assignment.

**Every later screen you build must link back to its exact contract**:
`docs/erp-screen-catalog.md` gives each screen a stable ID (e.g. `PR-03`,
`GR-02`, `QC-02`); `docs/frontend-api-handoff.md` documents that same ID's
real request/response shape, permissions, and error cases;
`docs/frontend-build-sequence.md` gives the phase order to build them in.

**Two habits to build in from day one, not bolt on later**:

- **Always use the `version` you last loaded for a record when editing
  it** — never a cached/guessed value from earlier in the session. Every
  PATCH/transition endpoint requires `expected_version`.
- **On a `409`, show the conflict — never silently refetch-and-retry the
  same mutation.** A stale version means someone else acted on the
  record first; the fresh state may mean the user's intended action no
  longer makes sense (see `docs/frontend-api-handoff.md` §9 for the
  exact required pattern).

---

## Reference documents

| Document | What it covers |
|---|---|
| `docs/erp-client-flow.md` | The full business flow in plain language, with CONFIRMED/PROPOSED/PLANNED status tags for every stage |
| `docs/erp-screen-catalog.md` | Every screen, its stable ID, and implementation status |
| `docs/frontend-api-handoff.md` | The exact, code-verified API contract for every implemented endpoint |
| `docs/frontend-build-sequence.md` | Recommended build order and reusable component list |
| `docs/erp-handoff-open-decisions.md` | Every open business decision, asked once, consolidated |
| `docs/backend-tasks.md` | Full technical build log, task by task, with verification results |
| `docs/backend-decisions.md` | Why specific implementation choices were made |
| `docs/receiving-proposal.md`, `docs/incoming-qc-proposal.md`, `docs/purchase-order-proposal.md`, `docs/purchase-workflow-proposal.md` | The policy proposals behind each PROPOSED item above |
| `docs/postman/README.md` | Full Postman folder-by-folder walkthrough |
| `docs/demo-integration-matrix.md` | Persona / permission / screen / lookup matrix for the commercial and formula drafting demo (Task 11B) |
