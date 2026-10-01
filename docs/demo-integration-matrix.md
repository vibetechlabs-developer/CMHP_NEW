# Integration Matrix — Commercial and Formula Drafting Demo (Task 11B)

Concise contract between demo personas, permissions, screens and lookups,
as actually exercised over real HTTP by
`backend/scripts/demo_http_commercial_formula.py` (see
`docs/demo-runbook.md` §4.3). No credentials appear here - passwords live
only in the gitignored `backend/.demo_credentials.local.json`.

**Everything below is DRAFT only.** Quotations, direct sales orders and
formula revisions are drafts: there is no confirmation, approval, batch,
requirement generation, reservation, material issue, production, invoice or
stock balance anywhere in the system, and none is created by this demo. A
direct sales order is **not** converted from a quotation (no linkage field
exists). No formula is "approved" and nothing authorizes production.

## 1. Personas, permissions and screens

| Persona (demo user) | Required COMPANY permissions (DEMOA) | Required STORE permissions (DEMOWH) | Screens (`docs/erp-screen-catalog.md`) | Lookup dependencies |
|---|---|---|---|---|
| Sales drafter (`demo_sales`) | `customers.view`, `products.view`, `quotations.view/create/edit`, `sales_orders.view/create/edit` | none (no store membership) | QUOT-01-03, SO-01-03 | `GET /api/v1/companies/<id>/customers/?is_active=true` (`customers.view`), `GET /api/v1/companies/<id>/products/?is_active=true` (`products.view`) |
| Formula drafter (`demo_formula`) | `products.view`, `formulas.view/create/edit` | `shared_catalog.view` (through an active store membership) | FRM-01-05 | products as above; **materials** `GET /api/v1/materials/?is_active=true&kind=RAW_MATERIAL` and `...kind=PACKAGING_MATERIAL` (`shared_catalog.view` in at least one active store) |
| Formula user without catalog access (`demo_formula_nocatalog`) | same company permissions as the formula drafter | **none** | FRM-01-05 (material picker unavailable) | material lookup is denied `403` naming `shared_catalog.view`; products still work |
| Other-company member (`demo_companyb_user`) | `purchase_requests.view` in DEMOB only | none | - | every DEMOA quotation/formula/order id is `404` |

Company and store permissions are separate systems and are granted
separately (`apps.permissions` company roles vs store roles). Nothing in
the application was broadened to make the demo pass: the demo only assigns
existing permissions to synthetic users. **Formula users currently need
`shared_catalog.view` through an active store membership to look up
materials** (the material catalog is a shared, store-permissioned read, not
company scoped) - see `docs/backend-decisions.md`, Task 11A.

## 2. Demo journeys and expected results (real HTTP, ordinary users)

| Journey | Steps (actual routes) | Expected result (observed) |
|---|---|---|
| A. Commercial drafting (`demo_sales`) | `GET /companies/mine/` -> `GET .../customers/` -> `GET .../products/` -> `POST .../quotations/` (2 lines) -> `PATCH .../quotations/<id>/` with the returned `version` -> `GET` detail -> `POST .../sales-orders/` (separate direct order) -> re-`GET` quotation | 200 / 200 / 200 / 201 / 200 / 200 / 201 / 200. Quotation DRAFT v1 subtotal `3046.83` (`546.00` + `2500.83`, Decimal ROUND_HALF_UP), v2 subtotal `2955.83`; order DRAFT with `SO-` reference and no quotation link; quotation still v2 |
| B. Formula drafting (`demo_formula`) | `GET /companies/mine/`, `/stores/mine/`, `.../products/`, `/materials/?kind=RAW_MATERIAL`, `/materials/?kind=PACKAGING_MATERIAL` -> `POST .../formulas/` -> `PATCH .../revisions/<r1>/` (raw + packaging lines) -> `POST .../revisions/` -> `GET` revision 1 -> `PATCH` revision 1 base output -> `GET` formula | 200 x5 / 201 (revision 1 empty) / 200 (lines typed RAW_MATERIAL, PACKAGING_MATERIAL from the materials, revision v2) / 201 (revision 2 empty, v1) / 200 (revision 1 unchanged) / 200 (base output 500, line quantities still `5.500` / `100.000`, no scaling) / 200 (formula `version` 1, `latest_revision_number` 2) |
| C. Access and conflicts | see below | see below |

Journey C checks: material lookup without `shared_catalog.view` -> `403`;
products still readable -> `200`; Company B user reading a Company A
quotation/formula -> `404` (and Company A user listing Company B
quotations -> `404`); stale `expected_version` on a quotation and on a
formula revision -> `409`; sales user creating a formula -> `403`, formula
user creating a quotation -> `403`, sales user reading the material
catalog -> `403`; Company B user creating in Company A -> `404`;
unauthenticated -> `401`; `DELETE` quotation -> `405`; no approve endpoint
for quotations or formula revisions -> `404`; sales order confirm by `demo_sales` (no
`sales_orders.confirm`) -> `403`. (Task 10F added DRAFT -> CONFIRMED; the demo seed assigns
the confirm permission to nobody and configures no policy, so the demo never confirms.)

## 3. Reset and repeat

Rerunning the script creates a new quotation, sales order and formula (a
new formula code each run); the seeded customers/products/materials/users
are reused. Nothing is deleted or reset.

## 4. Task 13E — Connected planning demo (real HTTP)

Exercised by `backend/scripts/demo_http_planning_journey.py` (see
`docs/demo-runbook.md` §4.4). Unlike §§1-3 above, this journey ends at an
already-**approved** formula revision, a numbered batch plan, a store
preparation and a material requisition **draft** - no quotation is
involved.

| Persona | Required COMPANY permissions (DEMOA) | Required STORE permissions (DEMOWH) | Screens | Lookup dependencies |
|---|---|---|---|---|
| Planner (`demo_planner`) | `customers.view`, `products.view`, `sales_orders.view/create`, `formulas.view`, `batch_plans.view/create/allocate_number` | none | SO-01–03, FRM-04 (view only), BATCH-01–04, BATCH-05 | customers/products as in §1; `GET .../formulas/<id>/revisions/<id>/` (`formulas.view`) |
| Formula approver (`demo_formula_approver`, **setup-only** - never called by the HTTP script itself) | `formulas.view/approve` | none | FRM-07 (approval) | none - never a contributor, so it can approve under a self-approval-disabled policy |
| Store planner (`demo_store_planner`) | `batch_plans.view`, `formulas.view` (Task 13A's dual-access rule - store access alone is never enough for a requisition) | `store_preparation.view/create/edit`, `material_requisitions.view/create/edit` | PREP-01, MREQ-01–03 | none beyond the batch plan the caller is already given |

**Setup, not part of the HTTP journey**: `seed_demo_data`'s Task 13E
extension creates formula `DEMOFPACK13E` (2 minimal, purely arithmetic
lines - not a real formula), two new mass units (`DEMOMKG`/`DEMOMG`, each
carrying a Task 12B-2 `canonical_factor` - `DEMOKG`/`DEMOBTL` are never
touched), configures company `DEMOA`'s `FormulaApprovalPolicy` to
`allow_self_approval: false` (demonstration-only, on the already-synthetic
`DEMOA` company - never a real client policy), and approves the revision
with `demo_formula_approver` (a non-contributor). All of this is
idempotent; a second `seed_demo_data` run changes nothing here.

**The journey** (steps, actual routes, as run against `127.0.0.1:8001`):
`GET /auth/me/` -> `GET /companies/mine/` -> `GET .../my-permissions/` ->
customer/product lookup -> `POST .../sales-orders/` (3024-bottle draft) ->
`GET .../formulas/<id>/revisions/<id>/` (already APPROVED) ->
`POST .../batch-plans/` (explicit packing relationship: 3024 bottles x
25 g, output unit `DEMOMKG`) -> `GET .../requirement-preview/` (packing
assessment included) -> `POST .../allocate-number/` -> (login as
`demo_store_planner`) `GET /stores/mine/`, `.../my-permissions/` ->
`POST /stores/<id>/preparations/` -> `POST /stores/<id>/material-requisitions/`.

**Expected result (observed, 3 real runs in this session)**: 48, then 48,
then 49 checks passed, exit code 0 every time. Expected packed content
`3024 x 25g / 1000 = 75.6` kg-equivalent against a 76 kg-equivalent
target - a `+0.4` "Planning quantity difference" (never called waste,
loss or allowance). The official batch number uses the synthetic
`DEMOCUST1` customer code (e.g. `DEMOCUST126-001`) - never a real client
sequence. Every requisition line's `requested_quantity` matched its own
saved `calculated_quantity` exactly (factor 1, no rounding decision
needed). No `StockMovement` was created by any step (this journey never
posts a goods receipt).

**Reset and repeat**: the sales order and batch plan are tracked in
`backend/.demo_planning_journey_result.local.json` and reused (after
re-validating their context over HTTP) rather than re-created. The store
preparation and material requisition are each protected by a database
uniqueness constraint (one per batch plan) - a repeat `POST` returns
`409`, which the script reads as confirmation the existing record is
correct, never as a new creation, then retrieves that record. Batch
number allocation is itself idempotent at the plan's current version and
was confirmed to return the identical permanent number on every repeat.
