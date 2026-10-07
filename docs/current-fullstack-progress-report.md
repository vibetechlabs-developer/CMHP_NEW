# CMHP ERP - current full-stack progress report

Written for: the product owner, the client-facing lead, and the engineers picking up the next tasks.
Audit date: 2026-10-06. Scope: inspection and reporting only. No application code, permissions, accounts, migrations, seed data or live business records were changed. Two read-only Django queries were run (URL resolver walk, membership and role read) and then removed from the repo.

Companion files: `client-flow-completion-checklist.md` (step-by-step client journey) and `remaining-work-priority.csv` (ranked backlog).

---

## 0. Update: department order journey made demo-ready (2026-10-06, same day)

What changed in this task:
1. **Legacy `/operations` actions no longer report success.**
   - Quotations: "+ Add quotation" is disabled with "Not connected yet". The page no longer loads or lists mock quotations. The save handler is unreachable and was left in place.
   - Batches: "+ Add batch" is replaced by a link, "Plan batch from an order", to the Orders page where batch planning really happens. "Consume common stock" is disabled with "Not connected yet". The mock batch rows are no longer listed.
   - The consume modal's own list is unchanged. Its button is disabled, so the modal cannot open.
   - Tests: `src/features/operations/Operations.legacy.test.jsx` (4 tests) prove the disabled state, the link target, no mock rows, and no success text.
2. **Store Manager sees requisition status, status only.**
   - New endpoint: `GET /api/v1/stores/<store_id>/batch-plans/<plan_id>/requisition-status/`, in `apps/material_requisitions/views.py` (`BatchPlanRequisitionStatusView`).
   - Access: active store membership, `store_preparation.view` in that store, and `batch_plans.view` in the plan's company. `formulas.view` and `material_requisitions.view` are NOT required, so no recipe, quantity or line data is reachable through it.
   - Response: `{batch_plan_id, state, status?, status_label?}`. **Superseded by the correction in 0.3:** `state` is now only `present` or `unavailable`.
   - Refusals: non-member store -> 404, missing `store_preparation.view` -> 403, missing company `batch_plans.view` -> 404. Read-only: PATCH returns 405.
   - Frontend: the order's store block uses the new endpoint. `unavailable` shows "Not available for your access", never "No requisition yet".
   - **Permission change: none.** Saloni's existing Stores Manager store role already holds `store_preparation.view`, and her company role already holds `batch_plans.view`. No role or account was changed.
   - Tests: `tests/test_requisition_status.py` (9 tests, pass). Includes a check that the response contains no lines, quantities, material codes, formula, approver or rounds.
3. **BMR inspected (not expanded).** See section 0.1 below.
4. **Browser walk-through: NOT VERIFIED.** No browser tool was available in this session. Every browser step in `client-flow-completion-checklist.md` is marked NOT VERIFIED.
5. **API contract change.** One operation added (GET requisition-status). The API dashboard was regenerated: 202 operations, 24 module rows. Resolver re-count: 141 unique paths, 202 handler-method operations. The dashboard count and the resolver count now agree.

### 0.1 BMR, as it actually exists (inspected 2026-10-06)

- **Frontend:** `BmrPanel` (`src/features/bmr/`), rendered inside the order modal's batch section only when the saved plan is selected and `bmr.view` is held. Print view hides everything except the BMR.
- **Backend endpoints:** `GET`/`POST /api/v1/companies/<company_id>/batch-plans/<plan_id>/bmr/` (read; create one record per plan) and `PATCH /api/v1/companies/<company_id>/bmr/<bmr_id>/lines/<line_id>/` (edit free-text fields, version-checked). Model: `BatchManufacturingRecord` (persisted, one per plan, pinned to the plan's formula revision) and `BMRLine` (persisted, RAW or PACKING slip).
- **Source of lines:** the existing requirement preview. Quantities are the backend's exact strings. Line snapshots: material code and name, unit, `formula_line_id`. Free text (special value, label claim, AR No.) is seeded from the formula line and is editable on the BMR line. `qty_received` is for packing lines only.
- **Sign-offs:** printed as blank lines (Prepared, Reviewed, Approved, Checked). No names are stored.
- **Permissions:** `bmr.view`, `bmr.create`, `bmr.edit` (company scope). **Superseded by 0.3:** these are now held by the single-holder Admin role `ADMIN_DEMOA` for Nishita in DEMOA. Before 0.3 no role held them.
- **Not in the BMR:** BMR number, effective date, version, supersedes, label-claim unit, excipient flag (per the confirmed option A).
- **Missing for a production workflow:** production execution, material issue against the BMR, packaging completion, QC release, dispatch and invoicing. A BMR document does not mean production has happened or is authorized.
- **Demo status:** the record can be created and read by a user holding `bmr.*`. No current account holds it. Granting it is a permission decision that was not made in this task.

### 0.3 Corrections (2026-10-06, second task)

**A. Requisition status disclosure, fixed.**
- Finding: the endpoint returned `none` for an absent requisition and `unavailable` for one held in another store. That difference revealed that a record existed elsewhere.
- Reproduced first: `test_absent_inaccessible_and_inactive_store_records_look_identical` failed with `{'state': 'none'}` versus `{'state': 'unavailable'}`.
- Fix: `state` is now `present` (real requisition in this active store, with status and label) or `unavailable`. Absent, held in another store, and held in a deactivated store all return the identical body `{batch_plan_id, state: "unavailable"}`.
- Access checks unchanged: store membership 404, `store_preparation.view` 403, company `batch_plans.view` 404. No lines, quantities, actors or approval history.
- Frontend: "Requisition status unavailable" for every non-present case, never "No requisition created". Helper `requisitionStatusText` has a focused test (`storePreparationService.test.js`).
- Tests: `tests/test_requisition_status.py`, 10 pass. Includes the three-case comparison for the same caller and plan.

**B. BMR enabled for the confirmed business Admin (exact change).**
- Endpoint requirements (from `apps/bmr/views.py`): read needs `bmr.view` and `batch_plans.view`; create needs `bmr.create`, `batch_plans.view` and `formulas.view`; line edit needs `bmr.view` and `bmr.edit`.
- Shared role inspected first: `Full Admin (DEMOA)`, CompanyRole id 15, code `ADMIN_DEMOA`, company id 2. Its only active holder is Nishita (user id 1). It already had `batch_plans.view` and `formulas.view`.
- Change: added `bmr.view`, `bmr.create`, `bmr.edit` to that role through the existing service `replace_role_permissions` (atomic). Codes 43 -> 46. Nothing removed.
- Affected account: Nishita only. Company: DEMOA only. `Full Admin (DEMOB)` is a different role and was not changed. No company or store membership was created. No other account, role, credential or approval policy was touched. `is_superuser` is not used as a BMR bypass.
- Saloni (Stores Manager) and Fenil (Batch Manager / Department Manager) hold no `bmr.*` codes and remain refused (`AdminGrantAccessTests`).
- Tests: `tests/test_bmr.py`, 16 pass (3 new). Synthetic test data only. No BMR record was created in the live database.

**C. Test results for this round.**
- Backend `tests.test_bmr` and `tests.test_requisition_status`: 26 tests, OK, exit 0.
- Frontend `vitest run`: 66 tests, 16 files, OK, exit 0.
- Frontend build: exit 0. Lint: exit 0, 0 errors, 53 existing warnings.
- Migrations: none. The grant is a data assignment through the existing service, not a schema change.
- API dashboard regenerated: 202 operations, 24 module rows.
- Resolver counts unchanged in this round: 141 unique paths, 202 handler-method operations.

**D. Browser verification: NOT VERIFIED.** No browser tool was available. Nishita's BMR panel visibility after a fresh login, and its absence for Saloni and Fenil, has not been observed in a browser.

### 0.4 Sales order delete failure (2026-10-06)

- **Root cause (reproduced, not assumed):** `StorePreparation.sales_order_line` is `on_delete=PROTECT`. Deleting a draft that has a store preparation on one of its lines cascades to the lines, and Django raised `ProtectedError` ("referenced through protected foreign keys: 'SalesOrderLine.sales_order'", blocked by StorePreparation for SalesOrderLine #10). That exception is not a `DjangoValidationError`, so the view did not translate it and the server returned HTTP 500. The frontend then showed the raw HTML debug page, because `getErrorMessage` returned any string body as-is.
- **Backend fix:** `delete_sales_order` refuses a draft with store preparation before deleting anything, with a structured 400 `{"detail": "..."}` in plain language. A `ProtectedError` backstop also returns 400 JSON. Nothing is cascaded, and batch plans, store preparations, requisitions and BMR records are untouched. The audit record and the deletion stay in one transaction.
- **Frontend fix:** delete errors go through `deleteOrderErrorMessage`. Only a short JSON business `detail` is shown. HTML, 5xx, 403 and network failures show the neutral message. 409 explains the change, reloads the list and needs a new explicit confirmation. Duplicate clicks are blocked while a request is in flight. The row is removed only after backend success. `getErrorMessage` also refuses HTML or long bodies.
- **Dialog:** "Delete draft order?", order reference, one-line permanent-action note, Cancel and "Delete order".
- **Tests:** `tests/test_sales_order_delete.py` (7 pass, including the reproduction); `SalesOrdersPanel.delete.test.jsx` and `utils/errors.safe.test.js` (15 pass together).
- **Screenshot:** the attached screenshot did not come through in the message, so the screen was not visually compared. The root cause above comes from the server traceback reproduced in tests.
- **Inventory:** the Inventory routes now use the same designed sample pages as the other Coming soon modules (`SHOW_DEMO_MODULES`). They read the in-memory store, not the backend.

### 0.5 Sales order delete: second round (2026-10-06)

- **Why the refusal still showed the generic message:** the server answers a business refusal as `{"detail": ["<message>"]}` (DRF list form, built by `translate_django_validation_error` from the service's `message_dict`). The frontend helper accepted only a string `detail`, so the real refusal was discarded and the generic text was shown. Fixed: the helper accepts the list form. Backend test now asserts the list shape; frontend tests use the real shape.
- **Request contract:** verified in a test that the frontend sends `DELETE /v1/companies/<company>/sales-orders/<order>/?expected_version=<n>` with no body. The backend reads `expected_version` from the query string.
- **Running server:** port 8000 (the one the Vite dev server proxies `/api` to) is listening, serves this project's newest route (`requisition-status` answers 401), and its listener started at 16:44:13, one second after the delete service was last saved. Port 8001 is not listening. An authenticated DELETE probe with a demo account against a nonexistent order id returned 403 JSON (`sales_orders.delete` required), which confirms the route and response format. No live order was touched.
- **Evidence still missing:** the failing request from your browser and the traceback in the port-8000 console were not available to me. Nishita's password is not in the demo credential file, so I could not reproduce her request. The fix above is verified by tests, not by replaying your request.
- **Browser verification: NOT VERIFIED.**

### 0.6 Customer CSV import (2026-10-06)

- **What it does:** Customers page "Import CSV" (needs `customers.create`) reads a CSV file in the browser, shows the rows, and checks them with the server. Import creates every row or none.
- **Endpoints (new):** `POST /api/v1/companies/<company_id>/customers/import-preview/` (writes nothing) and `POST /api/v1/companies/<company_id>/customers/import-commit/` (all-or-nothing, one audit record per customer). Both need `customers.view` and `customers.create`. No new permission and no migration.
- **Rules:** same validation as the create form (code and name required, email format, optional text). Duplicate codes are refused against existing customers and inside the file. Max 500 rows.
- **Existing test corrected:** `test_delete_method_not_allowed` expected 405, but the DELETE handler exists and needs `customers.delete`. The test now asserts 403 without that permission (it predates the delete feature).
- **Tests:** `tests/test_customer_import.py` (7) and `tests/test_customers.py` (full module) pass on the isolated test database. Frontend `csv.test.js` and `CustomerImportModal.test.jsx` (7 tests) pass; full frontend suite 90/90, 21 files; lint exit 0 with 0 errors; build exit 0.
- **Browser:** NOT VERIFIED.

### 0.2 Remaining blockers after this task

- Browser verification of the journey (NOT VERIFIED).
- Client decisions: planned manufacturing date or month; remark field; production, packaging, dispatch and invoice definitions; BMR access for the client's roles; demo-data labelling.
- Legacy unreachable handlers in `Operations.jsx` (`saveQuotation`, `saveBatch`, legacy `saveOrder`) should be deleted in a cleanup task.
- Quality, invoicing, supply chain, HR and inventory remain mock-only or sample-only.

---

## 1. Status vocabulary

- **Implemented and verified at the stated layer**: the named test ran in this audit (or is cited as current) and passed.
- **Connected in code; browser verification pending**: the screen calls a real endpoint in source. No browser run.
- **Partial**: some actions call the backend, others are mock or missing.
- **Mock-only**: reads and writes use the in-memory Redux store (`store/erpSlice.js` and friends), not the backend.
- **Not implemented**: no backend model or endpoint.
- **Awaiting client decision**: cannot be finished without the client's answer.
- **Unable to verify**: no evidence available in this audit.

"Connected" means the source calls a real `/v1/...` path. It does not mean the screen works end to end.

---

## 2. Evidence sources used in this audit

| Evidence | Date | Result | Notes |
|---|---|---|---|
| Django URL resolver walk (read-only, admin excluded) | 2026-10-06 | 140 unique paths, 201 handler operations | Counting rule in section 6 |
| Backend targeted tests: `test_order_line_preparation`, `test_store_manager_access`, `test_batch_manager_access`, `test_batch_number_allocation` | 2026-10-06 | 72 tests, OK | Run on the Django test database. ERROR lines in the output are the expected injected failures in rollback tests |
| Frontend `vitest run` | 2026-10-06 | 14 files, 57 tests, all passed | Includes the new HR and demo-module smoke tests |
| Frontend `vite build` | 2026-10-06 | exit 0 | |
| Frontend `oxlint` (`npm run lint`) | 2026-10-06 | exit 0, 0 errors, 53 warnings | Warnings are existing `set-state-in-effect` style warnings in order, formula and product files |
| Read-only membership and role query for Nishita, Saloni, Fenil | 2026-10-06 | see section 5 | Live database read; nothing written |
| Full backend suite | not re-run | historical only | Older saved output files in repo root (`ft.txt` 140 tests found, `batch_tests.txt` 67, `bt.txt` 13) are undated and are not cited as current |
| HTTP integration (end to end, live server) | not run | none | |
| Browser verification | not run | none | No browser tool was available to this audit. The user's own screenshots were reviewed as evidence of what renders |

Browser status: **pending for every item in this report.** The screenshots the user shared show that some screens render; they are not a journey test.

---

## 3. Executive summary

- The backend is a Django REST API with **26 apps that expose endpoints**, **140 unique URL paths** and **201 handler operations** (current count, section 6).
- The client workflow's core write path is **real and tested in the backend**: order creation, store preparation before a batch plan exists, batch planning with formula-revision pinning, explicit batch-number allocation, MRP and printing fields, and the BMR record. Frontend screens for these are connected to the real endpoints.
- **Demo-blocking defect found:** on the legacy `/operations` page, the **Quotations** and **Batches** "add" dialogs save to the in-memory mock store and then show "created successfully". Nothing reaches the backend. This must be fixed before any demo of those tabs.
- **Store Manager cannot see requisition status.** The Stores Manager store role has no `material_requisitions.view` permission, so the order screen shows the requisition status as hidden for Saloni. The client requirement says the status must reflect the real requisition workflow. This is a permission decision, not a code bug, and needs the client's answer.
- **Client register fields not in the system:** production status, packaging status, dispatch, invoice, and a separate remark. Section 7 shows where each field lives.
- Large areas are **mock-only** in the frontend even though some backend apps exist: quality, invoicing, supply chain (purchasing, receiving, stock), HR (no backend app at all), inventory, and the company departments and locations tabs.
- The designed dashboard and the Quality, Invoicing, Supply Chain and HR pages are now **enabled with sample data** (as requested). They read the mock store, so the numbers shown are not from the backend. The dashboard pill still says "Live inventory data". This is recorded in section 9 as a labelling decision.

---

## 4. Client workflow: where it stops

Workflow tested by this audit: Admin (Nishita) creates the order -> Store Manager (Saloni) saves store preparation on the order line -> Manager (Fenil) creates the batch plan, explicitly allocates the batch number, and enters MRP and printing status.

| Step | Backend | Frontend | Evidence | Status |
|---|---|---|---|---|
| Select operating company workspace | `companies/mine`, `my-permissions` | real | frontend tests (permissionsService 3, usePermissions 1) | Connected in code; browser pending |
| Create or select customer | `customers` (4 paths) | real | `test_customers` (historical) | Connected in code; browser pending |
| Select product, product type, product code | `products`, `product-types`, `units` | real | `test_products`, `test_product_imports` (historical) | Connected in code; browser pending |
| Customer code used for numbering | `Customer.code` | real | `test_batch_number_allocation` (current, pass) | Implemented and verified at backend layer |
| Order date, quantity, planned manufacturing date | `SalesOrder.order_date`, `SalesOrderLine.quantity`, `SalesOrder.planned_manufacturing_date` (a DATE, not a month) | real | `test_sales_orders` (historical) | Connected in code; browser pending |
| Save and reopen order | `sales-orders` create and detail | real | historical | Connected in code; browser pending |
| Store preparation before a batch plan exists | `store_preparation` (`sales_order_line` owner) | real | `test_order_line_preparation` (current, 13 pass) | Implemented and verified at backend layer |
| Store Manager edits only store preparation | permissions per store | real | `test_store_manager_access` (current, 11 pass) | Implemented and verified at backend layer |
| Requisition status visible to Store Manager | `material-requisitions` list needs `material_requisitions.view` | read-only, shows "hidden" for Saloni | code and permission read | **Awaiting client decision** |
| Manager selects an approved formula revision | `batch-plans/eligible-revisions` | real | `test_batch_manager_access` (current, 12 pass) | Implemented and verified at backend layer |
| Batch size, packing size, units | `BatchPlan.target_output_quantity`, `packing_content_quantity` + `packing_content_uom`, `packing_size_note` | real | `test_batch_plans` (historical) | Connected in code; browser pending |
| MRP for printing, printing status | `BatchPlan.mrp_for_printing`, `printing_status_note` | real | code | Connected in code; browser pending |
| Explicit permanent batch number | `batch-plans/<id>/allocate-number` | real | `test_batch_number_allocation` (current, pass) | Implemented and verified at backend layer |
| Repeat allocation gives same number | `BatchNumberAllocation` one-to-one with plan | real | `test_batch_number_allocation` (current, pass) | Implemented and verified at backend layer |
| BMR created from the plan | `bmr` (2 paths) | real | `test_bmr` (historical, 13) | Connected in code; browser pending |
| Production status | none | none | none | **Not implemented** |
| Packaging status | none | none | none | **Not implemented** |
| Dispatch | none | none | none | **Not implemented** |
| Invoice | none (`invoice` module is mock) | mock | none | **Not implemented** |

**The client workflow stops after the BMR.** Production, packaging, dispatch and invoicing have no backend records and no screens. Requisition status is only partly visible (section 4 row above). Purchasing, receiving, QC and stock are not connected to the order flow at all.

---

## 5. Actual permissions and memberships (read-only, 2026-10-06)

Read from the live database. Nothing was changed. Company names in the database are DEMOA and DEMOB (demo companies); the operating company used by the client's register is not present as a separate record in this data.

| User | Company memberships | Company role(s) | Store membership | Store role(s) | Notes |
|---|---|---|---|---|---|
| Nishita (id 1) | DEMOA, DEMOB (active) | Full Admin (DEMOA) (43 permissions); Full Admin (DEMOB) | DEMOWH | Full Admin (DEMOWH) (23 permissions) | `is_superuser=True`. Business endpoints do not use a superuser bypass; access comes from the role permissions above |
| Saloni (id 29) | DEMOA, DEMOB | Stores Manager (4 permissions on DEMOA: `batch_plans.view`, `customers.view`, `products.view`, `sales_orders.view`) | DEMOWH | Stores Manager (`shared_catalog.view`, `store_preparation.create`, `store_preparation.edit`, `store_preparation.view`) | Can edit store preparation only. No `material_requisitions.*` |
| Fenil (id 30) | DEMOA | Batch Manager (9 permissions: `batch_plans.create`, `.edit`, `.printing_edit`, `.allocate_number`, `.view`, `customers.view`, `formulas.view`, `products.view`, `sales_orders.view`) and Department Manager (`sales_orders.view`) | DEMOWH | Batch Manager (view preparation) (`store_preparation.view`) | Can create and edit batch plans and allocate numbers. Cannot edit store preparation or the order. Session needs sign-out and sign-in after a role change |

Other accounts seen: `demo_formula`, `demo_qc`, `demo_receiver`, `demo_store_planner` (demo roles). Their status is an owner decision (see section 9).

Permission checks are enforced in the backend (`test_store_manager_access`, `test_batch_manager_access`, both pass). The frontend reads the same permission codes from `my-permissions` and only shows edit controls when they are present.

---

## 6. API counts (current, from the Django URL resolver)

Counting rules used in this audit:
- Source: `django.urls.get_resolver()` walked recursively, read-only, settings `config.settings.local`.
- Admin routes excluded. HEAD and OPTIONS excluded (not declared handlers).
- **Unique paths**: distinct URL pattern strings.
- **Handler operations**: for each view class, the HTTP methods it declares (`get`, `post`, `put`, `patch`, `delete`). This matches routed operations for `APIView` views. For router-generated viewsets it is an approximation, because a viewset can declare a method that a route does not map. Treat 201 as the upper bound of routed operations until a router-level count is done.

| Measure | Value |
|---|---|
| Django apps with endpoints | 26 |
| Unique URL paths | 140 |
| Handler operations | 201 (GET 81, POST 86, PATCH 29, PUT 2, DELETE 3) |

Previous report (2026-10-05) said 138 paths and 198 operations. That count is superseded.

Largest modules by path: stores 14, catalog 14, permissions 13, purchasing 11, quality 9, formulas 8, users 8. Modules with no frontend screen: `formula_imports` (3), `material_imports` (3), `receiving` (5), `stock_movements` (2), `quality` (9, mock screen only), `purchasing` (11, mock screen only).

---

## 7. Frontend reachability and connection

Frontend routes (`src/routes/AppRoutes.jsx`): **24 page routes**, plus the `/` wrapper and the `*` not-found route. Sidebar (`src/Layouts/MainLayout.jsx`): **24 entries** (9 main menu, 6 inventory, 9 HR).

| Status | Routes | Count |
|---|---|---|
| Connected in code (real API) | `/login`, `/workspace-select`, `/products`, `/customer-management`, `/orders`, `/formulas` | 6 |
| Partial | `/operations` (products, customers and orders real; quotations and batches mock-only), `/companies` (user access real; companies and departments mock) | 2 |
| Mock-only or sample data | `/dashboard` (sample figures and mock store), `/profile` (mock store), `/quality`, `/invoices`, `/supply-chain`, `/inventory/*`, 10 HR routes | 16 |

Dialogs and drawers, counted once each when shared: order modal (with store, batch and BMR panels), formula drawer, new revision dialog, approval panel, customer modal, product modal, product import modal, user import modal, confirmation dialog, BMR print view. This list is not exhaustive.

Service layer:
- Real HTTP calls: `authService`, `permissionsService`, `usersApiService`, `formulasService`, `bmrService`, `batchPlansService`, `catalogLookupService`, `customersService`, `productImportService`, `productTypesService`, `productsService`, `salesOrdersService`, `storePreparationService`, `unitsLookupService`, `realDataSync`.
- In-memory mock store only: `qualityService`, `invoiceService`, `supplyChainService`, `hrService`, `inventoryService`, `operationsService`, `companyService`, `profileService`.

Backend apps with no frontend screen: `formula_imports`, `material_imports` (no import UI), `receiving`, `stock_movements`, `suppliers` (mock screen only). Quotations backend exists (2 paths); the `/operations` quotations tab does not call it.

---

## 8. Frontend action trace (selected, required actions)

| Action | Where | Real method and path | Permission | Result shown | Read back after save? | Finding |
|---|---|---|---|---|---|---|
| Create order | order modal | `POST /v1/companies/<id>/sales-orders/` | `sales_orders.create` | saved popup | yes (reopen) | Connected in code |
| Save order details | order modal | `PATCH` order with `expected_version` | `sales_orders.edit` | saved popup | yes | 409 shows conflict state |
| Save store preparation | order modal store block | `POST/PATCH /v1/stores/<id>/preparations/...` | `store_preparation.create/edit` | saved popup | yes | Connected in code |
| Save batch plan | order modal batch block | `POST/PATCH /v1/companies/<id>/batch-plans/` | `batch_plans.create/edit` | saved popup | yes | 409 shows conflict state |
| Allocate batch number | order modal | `POST .../batch-plans/<id>/allocate-number/` | `batch_plans.allocate_number` | number shown | yes | Explicit button |
| Calculate requirement | formula drawer | `GET .../revisions/<id>/requirement-preview` (draft) or batch-plan preview (saved) | `formulas.view` | exact backend strings | n/a | Scale factor object bug fixed in this session; 11 calculator tests pass |
| Create formula revision | formula drawer | `POST .../revisions/` | `formulas.edit` | notice | yes | Connected |
| Save draft lines | formula drawer | `PATCH .../revisions/<id>/` with `expected_version` | `formulas.edit` | "Draft saved." | yes | 409 reloads the latest revision and keeps rows (fixed this session) |
| Approve revision | approval panel | `POST .../approve` | `formulas.approve` plus policy | notice | yes | Policy-gated; Fenil lacks the permission |
| Save product | product modal | `PATCH` product with `expected_version` | `products.edit` | notice | yes | 409 shows conflict state |
| Import products | product import modal | `POST .../products/import-preview/`, `import-commit/` | `products.import` | preview then result | yes | Connected |
| Add quotation | `/operations` quotations tab | **none** (`operationsService.createQuotation`, mock store) | n/a | "Company quotation created successfully." | **no** | **Demo-blocking: false success** |
| Add batch | `/operations` batches tab | **none** (`operationsService.createBatch`, mock store) | n/a | "Company production batch created successfully." | **no** | **Demo-blocking: false success** |
| Add company or department | companies tab | mock (`companyService`) | n/a | local state | no | Mock-only |
| Quality, invoice, supply chain, HR forms | module screens | mock store | n/a | local state | no | Mock-only; sample data pages |

Error handling observed in code: API errors go through `getErrorMessage`; 409 is handled distinctly in order, batch, store, product, customer, formula and import screens. Raw permission codes are shown in one place (requirement preview: "You do not have formulas.view"). That message is not a user-friendly phrase; it is listed in the backlog.

---

## 9. Cross-cutting integration

| Area | Evidence | Status |
|---|---|---|
| Session restore before protected requests | `AuthProvider` restore and "Restoring your session…"; `axios.test.js` 8 tests; `AuthProvider.test.jsx` 4 tests | Verified at frontend test layer |
| Refresh and retry bounds | single shared refresh; retry once on 401 (`axios.test.js`) | Verified at frontend test layer |
| Logout ends session once; late refresh cannot restore it | session generation counter (`storage.js`), mutation-checked earlier | Verified at frontend test layer |
| Permission cache isolation (user and company) | `permissionsService.test.js` 3 tests | Verified at frontend test layer |
| Late responses from another workspace | RequirementCalculator request guard; order modal keyed by company and user | Connected in code; browser pending |
| Department-specific read and edit | backend permission tests (current pass); UI sections show "View only" or "You can edit" | Implemented and verified at backend layer |
| `expected_version` only where contract requires | formulas, products, customers, sales orders, batch plans, store preparation send it | Connected in code |
| 409 without silent overwrite | Backend `Conflict` on stale version; UI shows conflict; formula editor reloads latest and keeps unsaved rows | Connected in code; formula path has frontend test |
| Unsaved-input preservation | formula drawer preserves order-window state (`SalesOrderFormModal.test.jsx`); unsaved-change warning on tab close (`beforeunload`) and on switching formulas or revisions | Verified at frontend test layer for the drawer; in-app route change is not guarded |
| Search and pagination for 2000+ products | `productsService` sends `page`, `pageSize`, `search` to the server; `PAGE_SIZE` 20 | Connected in code; not load-tested |
| Empty, loading, error, retry | present in order, product, formula and BMR screens | Connected in code |
| Customer, product, formula, batch identity | snapshots on `BatchPlan` (product, formula revision, UOM); `Customer.code` for numbering | Implemented at backend layer |

---

## 10. Client register map

Legend for "Confirmed": a value stated by the client in the requirement, or a working choice the owner has accepted. "Unresolved": needs the client's answer.

| Client field | Owning record and field | Frontend location | Who edits | Persists | Status |
|---|---|---|---|---|---|
| Product Name | `Product.name` (snapshot on line and plan) | order line, product screen | Admin (order); Products permission | yes | Confirmed |
| Product Type | `Product.product_type` | product screen; order "Type" field | Products permission | yes | Confirmed |
| Product Code | `Product.code` (snapshot) | order screen (read-only) | Products permission | yes | Confirmed |
| Client / Company Name | `Customer.name` | order customer select | Customers permission | yes | Confirmed |
| Date of Order | `SalesOrder.order_date` | order details | Admin | yes | Confirmed |
| Customer / Company Code | `Customer.code` (used by numbering) | customers screen; order customer read-only | Customers permission | yes | Confirmed (numbering uses customer code) |
| Batch Number | `BatchNumberAllocation.number` (`CODEYY-NNN`) | batch block "Batch No." after allocate | Manager (`allocate_number`) | yes | Confirmed |
| Order Quantity and Unit | `SalesOrderLine.quantity`; unit from product sales UOM | order line | Admin | yes | Confirmed |
| Packing Size and Unit | `BatchPlan.packing_content_quantity` + `packing_content_uom`; text in `packing_size_note` | batch block "Packing Size" | Manager | yes | Confirmed (two fields, see note) |
| Batch Size and Unit | `BatchPlan.target_output_quantity` + output UOM snapshot | batch block "Batch Size" | Manager | yes | Confirmed |
| Planned Manufacturing Date/Month | `SalesOrder.planned_manufacturing_date` and `BatchPlan.planned_manufacturing_date` (both DATE) | order and batch blocks | Admin; Manager | yes | **Unresolved**: stored as an exact date, not a month. Not silently converted |
| MRP for Printing | `BatchPlan.mrp_for_printing` (decimal, currency from order) | batch block | Manager (`printing_edit`) | yes | Confirmed |
| Printing Status | `BatchPlan.printing_status_note` (free text) | batch block | Manager (`printing_edit`) | yes | Partly confirmed: free text, not a status list |
| Requisition Status | `MaterialRequisition.status` (read only from order screen) | order store block, read-only | Store Manager cannot see it (no permission) | yes | **Unresolved** (permission and display) |
| BMR Status | `BatchManufacturingRecord` per plan | BMR panel | BMR permissions | yes | Connected; the exact status label shown was not inspected in this audit |
| Production Status | none | none | n/a | n/a | **Missing** |
| Packing Type | `StorePreparation.packing_type` | store block | Store Manager | yes | Confirmed |
| Label | `StorePreparation.label_note` | store block | Store Manager | yes | Confirmed |
| Box | `StorePreparation.box_note` | store block | Store Manager | yes | Confirmed |
| Insert | `StorePreparation.insert_required` (yes/no) | store block | Store Manager | yes | Confirmed |
| Remark | `SalesOrder.notes` (2000 chars) | order "Notes" | Admin | yes | **Working choice**: shown as "Notes", not a separate Remark field |
| Packaging Status | none | none | n/a | n/a | **Missing** |
| Dispatch | none | none | n/a | n/a | **Missing** |
| Invoice | none (invoice screen is mock) | none | n/a | n/a | **Missing** |

Keep-separate rules applied: operating company (`Company`) is separate from the customer (`Customer`); order quantity (`SalesOrderLine.quantity`), formula output (`FormulaRevision.base_output_quantity`) and packing content (`BatchPlan.packing_content_quantity`) are separate fields.

---

## 11. Demo-blocking and honesty issues

1. `/operations` quotations and batches "add" dialogs show success with no backend write. (Section 8.) Fix: connect to the real endpoints, or hide the buttons, before any demo.
2. Store Manager cannot see requisition status (no `material_requisitions.view`). Fix depends on the client decision.
3. The designed dashboard shows sample figures and says "Live inventory data". Fix: change the label to "Sample data" or remove the pill. Client has not decided.
4. Quality, invoicing, supply chain, HR and dashboard screens show sample or mock-store data as demo pages. Fix: label them "Demo data" on the page, or keep the flag off for client demos. Client has not decided.
5. Demo accounts (`demo_*`, DEMOA, DEMOB) are the only accounts with memberships in this data. No operating company named CMHP exists as a separate company record here.
6. Permission message shown to users: "You do not have formulas.view." Replace with plain language.
7. Sidebar "Coming soon" and "Partly demo" badges remain on screens that now show sample data. Client has not decided.

---

## 12. Test and verification status

| Layer | Current evidence | Historical evidence | Not verified |
|---|---|---|---|
| Backend tests (targeted, 4 modules) | 72 OK on 2026-10-06 | 140, 67, 13 counts in undated saved output | Full suite not re-run (by instruction) |
| Frontend unit tests | 57 passed, 14 files, 2026-10-06 | earlier runs at 43, 44, 47, 52, 53 | |
| Frontend build | exit 0, 2026-10-06 | | |
| Frontend lint | exit 0, 0 errors, 53 warnings, 2026-10-06 | | Warnings not fixed |
| HTTP integration (live server, end to end) | none | none | Not run |
| Browser verification (user journey) | none | none | **Pending**, including the three-person journey |

Overlapping runs are not summed. The 57 frontend tests and the 72 backend tests are separate layers and are not added together.

---

## 13. Prioritized completion plan

### A. Demo-blocking defects
1. Stop false success on `/operations` quotations and batches (connect or hide). Frontend. Small. Acceptance: no success message without a backend response; a test asserts that.
2. Browser-verify the three-person journey on a synthetic order (Admin, Saloni, Fenil). Verification. Small to medium. Depends on Fenil signing out and back in after the role change.
3. Requisition status visibility decision for Store Manager (grant `material_requisitions.view` or show the status as "Requisition workflow is not connected yet"). Client decision, then small code.

### B. Existing backend features needing frontend integration
4. Material import UI (`material_imports`, 3 paths). Full-stack small to medium.
5. Formula import UI (`formula_imports`, 3 paths). Full-stack small to medium.
6. Quotations tab to real `quotations` endpoints (2 paths). Frontend medium.
7. Quality (`quality`, 9 paths) connected to `Quality.jsx` in place of the mock service. Full-stack large.
8. Stock movements and receiving read screens (`receiving` 5, `stock_movements` 2). Full-stack large.

### C. Missing backend features
9. Production status, packaging status, dispatch, invoice, separate remark. Backend and frontend large, after client definitions.
10. Purchasing (requests, orders, issue) connected to the supply chain screen (`purchasing` 11 paths). Full-stack large.
11. HR backend (no app exists). Backend large.
12. Audit log viewer and Tally integration: no endpoints. Not implemented.

### D. Client decisions and data
13. Requisition status visibility for Store Manager.
14. Planned manufacturing: exact date or month?
15. Remark: separate field, or "Notes" (current working choice)?
16. Definitions for production status, packaging status, dispatch, invoice.
17. Demo accounts: deactivate or delete (owner decision from earlier).
18. Plan-create rule without `formulas.view` (owner decision from earlier).
19. Demo-data labelling on dashboard and demo pages; keep or remove "Coming soon" badges.
20. Operating company name and its own company record (CMHP, not DEMOA).

### E. UI and usability
21. Replace raw permission-code messages with plain language.
22. Guard in-app route changes with unsaved edits (the browser prompt only covers tab close and reload).
23. Two-step flow hints on the order screen (done for formulas; not for orders).

### F. Production readiness
24. Load test product search at 2000+ rows.
25. Fix the 53 existing lint warnings in order and formula files.
26. HTTP integration tests for the three-person journey.
27. Production security review of refresh cookie, CSRF and CORS settings (not done in this audit).

---

## 14. Recommendation

- **Next single bounded task:** Stop false success on `/operations` (quotations and batches). Frontend only. Small. Done when no success message appears without a backend write, and a test proves it.
- **Next five tasks in dependency order:**
  1. Stop false success on `/operations` (above).
  2. Get the client decisions in section 13 D (requisition visibility, planned month vs date, remark, production/packaging/dispatch/invoice definitions).
  3. Browser-verify the three-person journey with the checklist.
  4. Material import UI (backend exists).
  5. Quality screen connected to the backend.
- **10-working-day plan (realistic):**
  - Days 1-2: task 1 with tests; send client decision list; sign in as Fenil again to refresh the role.
  - Days 2-3: manual three-person journey on a synthetic order; record results in the checklist.
  - Days 3-6: material import UI (frontend) with backend contract check (backend parallel: confirm import endpoints and error shapes).
  - Days 4-8: quality screen connection (frontend) with backend QC endpoints (backend parallel: confirm specification and status fields).
  - Days 9-10: lint warnings in order and formula files, documentation refresh, and a re-count of API paths.
- **What cannot honestly fit in 10 days:** purchasing, receiving and stock ledger connection; production, packaging, dispatch and invoicing; HR backend; audit viewer; Tally integration; load testing; production security review.

### Completion percentage
Not given. A percentage would need a defined denominator (for example, sections 4 and 10 of this report) and a defined numerator (rows marked "Implemented and verified at the stated layer"). Today that count is small because browser and HTTP layers are unverified.

---

## 15. Superseded findings

- The 2026-10-05 counts (138 paths, 198 operations) are superseded by section 6.
- The 2026-10-05 statement "department order flow ... has not been clicked through in a browser" still holds.
- "Store preparation can now be saved before a batch plan exists" still holds (`test_order_line_preparation`, current pass).
- The 2026-10-05 priority table is superseded by `remaining-work-priority.csv`.
- The 2026-10-05 "Partly done" status for mock-only saves is superseded: the `/operations` quotations and batches false-success path is confirmed (section 8).

---

## 16. Historical report (2026-10-05, superseded in the places noted above)

The text below is the earlier report, kept for its evidence. Where it conflicts with the audit above, the audit above wins.

_Recovered on 2026-10-06 from the session transcript after an accidental overwrite. This is the longest saved copy found (273 lines). The file had 298 lines at the start of the audit, so a few late edits may be missing._

Written for: the product owner and the engineers who pick up the next tasks.
Audit date: 2026-10-05 (evidence gathered that day). Scope: inspection only. No business records, permissions, migrations or passwords were changed for this report.

Definitions used throughout:
- **Connected in code**: the screen calls a real backend endpoint in source. Runtime behaviour not confirmed.
- **Verified through test**: a backend test covers it and passed (date and command given).
- **Verified through browser**: a person has clicked it in a browser. **No browser check has been completed for any item below.**
- **Mock-only**: the screen reads or writes local/Redux data, not the backend.
- **Partial**: some actions are real, others are missing or mock.
- **Not implemented**: no backend model or endpoint exists.
- **Blocked by client decision**: cannot proceed until the client answers.

Counts are stated as "connected / inspected" with the definition above. No overall completion percentage is given.

---

## A. Executive summary

- The backend is a Django REST API with 30 Django apps and **138 unique URL patterns / 198 method+path operations** (live resolver, admin excluded, read today).
- The frontend is a React/Vite app with **14 top-level routes** and about **21 service files**. Only about **11** of those services call the backend. The rest are mock or Redux-based.
- The **department order flow** (Admin order entry, Store Manager preparation, Manager batch planning) is implemented end to end in the backend and connected in the frontend. It is covered by backend tests. **It has not been clicked through in a browser**, so the actual user experience is unverified.
- Store preparation **can now be saved before a batch plan exists** (per order line). This was the main workflow blocker and it is implemented.
- Real account mapping exists for Admin (Nishita), Store Manager (Saloni) and Manager (Fenil). Fenil's session needs a sign-out and sign-in to pick up the new role.
- Large parts of the business are not connected: purchasing, receiving, quality, stock/ledger screens, HR, invoices and most company-setup screens are still mock-only or have no backend.
- Batch numbering follows `CODEYY-NNN`, resets per year, and is allocated only by an explicit action. This is implemented in code and tested.

---

## B. Confirmed workflow and role matrix

Workflow: Admin creates order -> Store Manager saves preparation on the same order line -> Manager creates and fills the batch plan -> each department edits only its own section.

| Section | Admin | Store Manager | Manager |
|---|---|---|---|
| Order details | Create/Edit | View | View |
| Store preparation | Create/Edit | Create/Edit | View |
| Batch and printing | Create/Edit | View | Create/Edit |

Backend enforcement (verified by tests, `tests/test_order_line_preparation.py` 13/13, `tests/test_batch_manager_access.py` 12/12, run 2026-10-05):
- Store Manager cannot PATCH the order (`sales_orders.edit` absent) and cannot create or edit a batch plan.
- Manager cannot write store preparation (`store_preparation.edit` absent) and cannot edit the order.
- Store-scoped preparation permissions are checked per store. Company-scoped order and batch permissions are checked per company. No superuser bypass is used for these.

Frontend enforcement (connected in code, runtime unverified):
- Order section: "View only" or "You can edit" label; Save order details only when `canEditOrder`.
- Store section: Save store details only when `store_preparation.create` or `edit` is present in the selected store.
- Batch section: "Access unavailable" when `batch_plans.view` is absent; "View only" when read-only; "Create batch plan" only with `batch_plans.create`.
- Each section has its own dirty state and save action. A parent global `canEditOrder` no longer disables other sections.

Actual account mapping (read from the database today):

| Username | Intended role | Company | Store | Result |
|---|---|---|---|---|
| Nishita | Admin | DEMOA | DEMOWH | Matches matrix. Superuser flag is set (pre-existing); permission checks do not rely on it. |
| Saloni | Store Manager | DEMOA | DEMOWH | Matches matrix. |
| Fenil | Manager | DEMOA | DEMOWH (view only) | Matches matrix. Needs sign-out and sign-in to refresh. |

Note on "department = Manager": in User Management, `department` is a free-text profile field on the user. It is not a role and grants no access.

Expected read-only messages versus broken access:
- Fenil sees "You do not have store_preparation.create or store_preparation.edit" in the store section. **This is the correct restriction for a Manager.**
- Access-denied states are distinct from empty lists, loading, and missing selections. Loading is not yet shown explicitly for batch permissions (see section I).

---

## C. Full module status matrix

Status values follow the definitions above. "Test evidence" uses the dates and commands below.

| Module | Backend capability | Frontend screen | Real API connection | Working actions | Missing or broken | Role/access status | Verification evidence | Next dependency |
|---|---|---|---|---|---|---|---|---|
| Authentication / session | Login, refresh, logout, CSRF (`apps/authentication`) | Login page | Yes (auth service) | Sign in, sign out | Logout now clears cached permissions; no browser test of session switching | n/a | Live login verified by user in browser, 2026-10-05 | Browser test of sign-out and sign-in as another user |
| Companies / workspace | Company list, my-companies, my-permissions, activate/deactivate (`apps/companies`) | Companies page | Partial: user/roles tabs connected; departments, locations, materials tabs use mock `companyService` | Create/edit users, company roles | Most company tabs mock-only | Real per company | Not re-run today | Replace mock company tabs |
| Shared stores | Store CRUD, memberships, store roles (`apps/stores`, `apps/permissions`) | Store selection in order form | Yes (`/v1/stores/mine/`, store permissions) | Store membership lookup | Store management UI not connected | Real per store | Used in live store probes today | Admin store-management screen (not built) |
| Users / memberships / roles | User create/edit/activate, company assignment, role assignment (`apps/users`) | User Management tab | Yes (`usersApiService`) | Create, edit, import CSV (client-side, not atomic), activate/deactivate, assign company and role | Common-inventory flag stored but not enforced; department is free text | Superuser-only endpoints | `ProfileFieldTests` 3/3 OK (after audit-date fix) | Enforce or drop common-inventory flag |
| Customers | Customer CRUD, deactivate, delete (unreferenced) (`apps/customers`) | Customers panel | Yes (`customersService`) | Create, edit, deactivate, delete (if permitted) | Import not connected | `customers.*` per company | Not re-run today | Browser test |
| Products / product types | Product CRUD, deactivate, delete, CSV import, product types (`apps/products`, `apps/product_imports`, `apps/catalog`) | Products panel, import modal | Yes (`productsService`, `productImportService`, `productTypesService`) | Create, edit, activate, delete (unreferenced), CSV preview and commit | Browser unverified | `products.*` per company | Not re-run today | Browser test |
| Units / materials / locations / suppliers | Units (catalog), materials (`apps/catalog`, `apps/material_imports`), suppliers (`apps/suppliers`) | Units: batch planning picker only. Materials, locations, suppliers: company tabs and inventory screens | Partial: units lookup connected; materials, locations, suppliers mock-only | Planning units list | Materials, locations, suppliers screens mock-only | Units read via `batch_plans.view` | Not re-run today | Connect materials/locations screens |
| CSV imports | Product, formula, material imports (`apps/product_imports`, `apps/formula_imports`, `apps/material_imports`) | Product import modal connected; formula/material imports not connected in UI | Partial | Product import preview/commit | Formula and material import UI missing | Per company | Not re-run today | Connect formula/material import UI |
| Quotations | Quotations (`apps/quotations`) | Not found in the navigation | Not connected | None | No screen | n/a | n/a | Decide if needed |
| Sales orders | Order CRUD, lines, DRAFT delete (`apps/sales_orders`) | Orders page, order form | Yes (`salesOrdersService`) | Create, edit (draft), lines, customer and product pickers, delete draft (permitted) | Order list uses mixed realDataSync + live API; browser unverified | `sales_orders.*` per company | `tests/test_sales_orders.py` (332-test affected run; one stale test updated and re-run 8/8 OK) | Browser test of order list |
| Store preparation | Order-line and legacy batch preparation, store-scoped (`apps/store_preparation`) | Order form, store section | Yes (`storePreparationService`) | Save before batch exists; update with expected_version; read back | Legacy batch-linked rows are not shown in the order UI; browser unverified | `store_preparation.*` per store + `sales_orders.view` | `test_order_line_preparation` 13/13, `test_store_preparation` 43/43, `test_store_manager_access` 11/11 (all 2026-10-05) | Show legacy rows read-only |
| Formulas / revisions / approval | Formula CRUD, revisions, approval, requirement preview (`apps/formulas`) | No formula screen in navigation; approved revisions picked inside batch section | Partial: revision list via narrow planning endpoint; formula management UI not found | Pick approved revision in batch planning | Formula authoring screen not found; requirement preview not shown in UI | `formulas.*` for authoring; planners use `batch_plans.view` for eligible revisions | `tests/test_formulas.py`, `test_formula_approval.py`, `test_formula_requirement_preview.py` run earlier (not re-run today) | Formula screen decision |
| Batch planning / numbering | Batch plan create/edit, printing fields, allocate number, numbering `CODEYY-NNN` (`apps/batch_plans`) | Batch section in order form | Yes (`batchPlansService`) | Create first plan, edit, printing fields, explicit allocation | Browser unverified; requirement preview not shown | Manager bundle + Fenil assignment; Admin printing_edit added today | `test_batch_manager_access` 12/12, `test_batch_plans` + regression 67/67 (2026-10-05) | Browser test of first-plan creation |
| Material requisitions | Requisition create, submit, approve, revise (`apps/material_requisitions`) | Requisition status shown read-only in store section | Partial: status read; lifecycle actions not in UI | Read status | Lifecycle actions missing in UI | Separate permissions | Earlier suite run (332 affected, one failure fixed) | Requisition lifecycle UI |
| Purchase requests / orders | Purchase requests, approvals, orders, issue (`apps/purchasing`) | Supply Chain screen | No (`supplyChainService` mock-only) | None real | Entire screen mock | n/a | n/a | Connect supply-chain screens |
| Goods receiving | Receipts, lines, posting (`apps/receiving`) | Inventory/supply screens (mock) | No | None real | Entire screen mock | n/a | Backend tests exist (not re-run today) | Connect receiving screens |
| QC / specifications | Incoming inspection, specifications (`apps/quality`) | Quality screen | No (`qualityService` mock-only) | None real | Entire screen mock | n/a | Backend tests exist (not re-run today) | Connect quality screens |
| Stock movements / ledger | Stock movements, balances (`apps/stock_movements`) | Inventory stock/ledger screens | No (`inventoryService` mock-only) | None real | Entire screen mock | n/a | Backend exists (not re-run today) | Connect inventory screens |
| Batch register | Register rows, disclosure rules (`apps/batch_register`) | Not connected in navigation | No | None | No screen | n/a | `tests/test_batch_register.py` (earlier run) | Decide register screen |
| Production / BMR / packaging | No backend app | No | No | None | Not implemented | n/a | n/a | Client definition needed |
| Dispatch | No backend app | No | No | None | Not implemented | n/a | n/a | Client definition needed |
| Invoicing / payment / Tally | No backend app | Invoice screen mock | No | None | Not implemented | n/a | n/a | Client definition needed |
| HR (employees, attendance, leave, payroll) | No backend app | HRMS screens (mock `hrService`) | No | None | Mock-only | n/a | n/a | Client decision: is HR in scope now? |
| Dashboard | Aggregates (partial) | Dashboard | Mixed | Display | Mostly mock | n/a | n/a | Connect after modules are real |
| Audit | Audit log (`apps/audit`) | Not in navigation | Backend only | Written by services | No viewer | n/a | Audit rollback tested in order-line and batch suites | Audit viewer for owners |

Frontend route count: 14 top-level routes, with the Inventory and HRMS sub-routes.

---

## D. Frontend action and API inventory (summary)

Static scan of `src/`: **59 call sites** (29 GET, 21 POST, 6 PATCH, 3 DELETE). Full per-button mapping is **not complete**; this is the service-level inventory.

| Service file | Real API | Notes |
|---|---|---|
| `usersApiService.js` | Yes (13 calls) | Users, memberships, roles, companies, company roles |
| `productsService.js` | Yes (7) | Products, delete via DELETE with expected_version |
| `customersService.js` | Yes (7) | Customers, delete via DELETE |
| `salesOrdersService.js` | Yes (5) | Orders; delete via DELETE for drafts |
| `batchPlansService.js` | Yes (6) | Plans, create, edit, allocate; revisions via narrow endpoint |
| `storePreparationService.js` | Yes (7) | Preparations by store and line |
| `productTypesService.js` | Yes (1) | Product types lookup |
| `unitsLookupService.js` | Yes (2) | Planning units |
| `catalogLookupService.js` | Yes (2) | Catalog lookups |
| `productImportService.js` | Yes (2) | Product CSV preview and commit |
| `authService.js` | Mixed (4 calls, 37 mock/Redux references) | Real login and logout; much of the file still uses mock user data |
| `realDataSync.js` | Mixed (2 calls, 3 mock/Redux references) | Bridges live and mock data for orders |
| `inventoryService.js` | No | Mock-only (11 references) |
| `companyService.js` | No | Mock-only (14 references) |
| `operationsService.js` | No | Mock-only (15 references) |
| `hrService.js` | No | Mock-only (21 references) |
| `supplyChainService.js` | No | Mock-only (42 references) |
| `qualityService.js` | No | Mock-only (4 references) |
| `invoiceService.js` | No | Mock-only (5 references) |
| `profileService.js` | No | Mock-only (4 references) |

Problems found by inspection:
- **Success messages without persisted writes:** mock-only services show success without a backend write. Not every handler was checked individually, so this is a risk to confirm, not a confirmed defect count.
- **Wrong resource mapping:** earlier orders were built on batch-register rows; now replaced by real sales orders.
- **Unsupported DELETE:** the three DELETE calls are on products, customers and draft orders, all with `expected_version`. Deletion of referenced records is refused by design.
- **Pagination and search:** server-side for products, customers and orders. Mock screens filter locally.
- **Stale state:** permission cache is now cleared on logout; company and store switches refetch permissions.

---

## E. Client register field mapping

| Field | Responsible | Backend model and field | API | Frontend control | Editable rule | Saved and retrieved | Status |
|---|---|---|---|---|---|---|---|
| Product Name | Admin | `Product.name` (via order line snapshot) | `/companies/<id>/products/`, order lines | Product picker | Admin, while order is DRAFT | Yes | Connected |
| Product Type | Admin | `ProductType` lookup; `SalesOrderLine.product_type_snapshot` | `/v1/product-types/` | Type select | Admin | Yes | Connected |
| Product Code | Admin | `Product.code` | Products API | Read-only on line | Read-only | Yes | Connected |
| Client / Company Name | Admin | `Customer.name` | Customers API | Company field (read-only text), customer picker | Admin | Yes | Connected |
| Date of Order | Admin | `SalesOrder.order_date` | Orders API | Date input | Admin | Yes | Connected |
| Company Code | Admin | `Customer.code` | Customers API | Read-only | Read-only | Yes | Connected |
| Batch No. | Manager (allocates) | `BatchPlan` + number allocation (`CODEYY-NNN`) | `/batch-plans/<id>/allocate-number/` | Batch No. read-only, allocate button | Explicit action only; permanent | Yes | Connected in code, browser unverified |
| Order Qty | Admin | `SalesOrderLine.quantity` | Orders API | Quantity field | Admin, DRAFT only | Yes | Connected |
| Packing Size | Manager | `packing_size_note`, `packing_content_quantity`, `packing_content_uom` | Batch plan create/patch | Packing size and unit | Manager | Yes | Connected |
| Batch Size | Manager | `target_output_quantity`; output unit from revision | Batch plan create/patch | Batch size field, output unit read-only | Manager | Yes | Connected |
| Planned Mfg Date / Month | Admin (order) and Manager (batch) | `SalesOrder.planned_manufacturing_date`, `BatchPlan.planned_manufacturing_date` | Orders and batch APIs | Date inputs | Admin/Manager | Yes. Date, not month: the client's "month" wording is **unresolved** | Connected; client decision needed |
| MRP for Printing | Manager | `BatchPlan.mrp_for_printing` (Decimal) | Batch plan API | MRP field with currency | Manager with `batch_plans.printing_edit` | Yes. Not a selling price | Connected |
| Printing Status | Manager | `BatchPlan.printing_status_note` (free text) | Batch plan API | Text field | Manager with printing_edit | Yes. **Free text, not a controlled status** | Partial: no status enum defined |
| Requisition Status | Store | `MaterialRequisition.status` | Requisitions list | Read-only text | Read-only in order form | Read only | Partial: lifecycle UI missing |
| BMR Status | Production | No model | No | No | n/a | No | Not implemented |
| Production Status | Production | No model | No | No | n/a | No | Not implemented |
| Packing Type | Store | `StorePreparation.packing_type` | Store preparation API | Text | Store Manager | Yes | Connected |
| Label | Store | `StorePreparation.label_note` | Store preparation API | Text | Store Manager | Yes. Free text; meaning not defined by client | Connected; client decision |
| Box | Store | `StorePreparation.box_note` | Store preparation API | Text | Store Manager | Yes. Free text; meaning not defined by client | Connected; client decision |
| Insert | Store | `StorePreparation.insert_required` (null/true/false) | Store preparation API | Not specified / Required / Not required | Store Manager | Yes | Connected |
| Remark | Multiple | `SalesOrder.notes`, `BatchPlan.notes` | Orders and batch APIs | Notes fields | Owner department | Yes. Which remark belongs to whom is **unresolved** | Partial |
| Packaging, Dispatch, Invoice | Later | No models | No | Invoice screen mock-only | n/a | No | Not implemented |

Distinctions the code keeps: operating company is the workspace company; the customer is the client; sales unit (order line) is separate from formula output unit; packing size is separate from batch size; MRP is not selling price; receipts are not stock availability; preparation status is separate from requisition status.

---

## F. Account and permission configuration gaps

- **Fenil (Manager):** configured. Needs sign-out and sign-in. Browser verification pending.
- **Saloni (Store Manager):** configured and matches the matrix.
- **Nishita (Admin):** configured. `batch_plans.printing_edit` added today to the DEMOA Admin role (only assignee).
- **Demo accounts (14 `demo_*`):** still active with memberships and roles in DEMOA and DEMOB. Deletion was blocked by the permission system; deactivation is the recommended option. **This is a data-hygiene decision for the owner.**
- **Batch Manager and Stores Manager bundles:** exist in DEMOA. Shared roles are not used by other accounts beyond those named.
- **Superuser flag on Nishita:** set before this work. Permission checks in these modules do not use it, but user-administration endpoints do require a superuser. Owner decision whether to keep.
- **Store role for Manager:** `BATCH_MANAGER_VIEW` (store preparation view only) in DEMOWH assigned to Fenil.

---

## G. Integration blockers and evidence

Department journey, step by step:

1. **Admin creates order** - works in code. Blocker: none in backend. Browser unverified.
2. **Store Manager saves preparation before batch** - was blocked by the batch-plan dependency. **Now implemented** (order-line owner, migration `store_preparation.0003`). Blocker: none in code; browser unverified.
3. **Manager sees same order** - works in code. Blocker was role assignment; now configured for Fenil. Browser unverified.
4. **Manager creates first batch plan** - endpoint now needs `batch_plans.create`, `sales_orders.view`, `batch_plans.view`, and an approved revision. Formula presence check removed (design change, see below). Blocker: Fenil must sign in again; approved revision must exist for the product.
5. **Units and revisions load** - now via narrow endpoints. Blocker: units must exist in the catalog; revisions must be approved. If neither exists the UI must say so (partially done).
6. **Explicit allocation** - works in code, tested.
7. **Store Manager views batch read-only** - works in code (`batch_plans.view` only).

Later operations: no backend apps for production, BMR, packaging, dispatch, invoicing or payment. Requisition lifecycle exists in backend but has no UI. Purchasing, receiving, QC and stock ledger exist in the backend but are not connected to the frontend.

Design change to flag: plan creation previously required `formulas.view`. That was removed from the create endpoint only (the response has no recipe lines; the service still requires an approved revision in the same company). The requirement preview keeps its gate. An existing test was updated accordingly. **Owner should confirm this rule.**

---

## H. Verification performed and limitations

Backend, run on 2026-10-05 in isolated test databases:

| Module or command | Result | Changed after? |
|---|---|---|
| `tests.test_user_management` profile fields (3) | OK | Audit-date serialization fixed before this run |
| `tests.test_store_preparation` | 43 OK | Model changed earlier; this run is after the change |
| `tests.test_store_manager_access` | 11 OK | No change since |
| `tests.test_order_line_preparation` | 13 OK | No change since |
| `tests.test_batch_manager_access` | 12 OK | No change since |
| `tests.test_batch_plans` + `test_order_line_preparation` | 67 OK | Includes the create-gate change |
| Affected run: store prep, batch register, requisitions, sales orders, department workflow, batch plans | 332 run, 1 failure (stale delete test), test then updated and re-run 8/8 OK | Stale test updated after the run |

Frontend: `npx vite build` passes; `npm run lint` shows no errors in changed files (existing warnings remain in `SalesOrderFormModal.jsx` about effects).

Live read-only checks today: `/api/v1/stores/<id>/my-permissions/` and `/api/v1/companies/<id>/my-permissions/` return 200 for Nishita, Saloni and Fenil. Migrations: 0 unapplied. Django system check: no issues.

Not verified:
- **Browser:** no click-through of any screen was completed. Browser verification of the three-person journey is pending.
- **Full frontend action inventory:** service-level only; per-button handlers were not all read.
- **Full backend test suite:** not run (by instruction). Known pre-existing failure: `tests.test_store_permissions` pagination (2 tests, not caused by this work, noted earlier).
- **Other modules' tests** (quality, purchasing, receiving, stock, formulas approval, batch register) were not re-run today.
- **API dashboard and Postman collection:** not regenerated. The dashboard numbers are not current.

---

## I. Remaining client decisions

1. Printing status: controlled list of values, or free text?
2. Planned manufacturing "month" versus exact date.
3. Meaning of Label and Box values, and what `0` means on the client's sample.
4. Remark ownership: which department's remark is which field.
5. Whether a Manager can create a plan from a non-approved revision (currently refused).
6. Production, BMR, packaging, dispatch and invoicing definitions (no backend yet).
7. Whether HR is in scope now.
8. Whether demo users, demo companies and demo data should be removed or kept.
9. Whether the Admin's superuser flag should be kept.
10. Whether plan creation without `formulas.view` is acceptable.

---

## J. Dependency-ordered implementation plan

**P0 - correctness and data integrity**
1. Owner decision on demo data (deactivate or delete). Prevents mixing demo and real records.
2. Verify no mock screen shows a success message without a backend write. Replace or disable those saves.
3. Confirm the plan-create permission rule (section I.10).

**P1 - department workflow blockers**
4. Browser-verify the three-person journey with Admin, Saloni and Fenil on a synthetic order. Record results.
5. Show legacy batch-linked preparation read-only in the order UI, labelled as batch-specific.
6. Add an explicit "No approved formula available for this product" message in the revision picker.
7. Add a visible "Loading" state for batch permissions.

**P2 - connect existing backend capability**
8. Requisition lifecycle actions (submit, approve, revise) in the store section, with their own permissions.
9. Batch requirement preview for planners.
10. Connect the formula screen (or decide it is not needed for the client).
11. Connect the product, formula and material CSV import screens to their backends.
12. Enforce or remove the common-inventory flag.

**P3 - missing operational modules**
13. Purchase request, order, receiving and QC: connect supply-chain and quality screens to the existing backend.
14. Stock ledger and balances: connect inventory screens.
15. Production and BMR, packaging, dispatch, invoicing: define with the client first, then build.

**P4 - polish**
16. Regenerate the API dashboard and Postman collection.
17. Replace mock company tabs (departments, locations, materials) with real APIs.
18. Audit viewer for owners.

Effort estimates are not given because the client decisions in section I change the scope of several items.

## Shared Store & Materials workspace (2026-10-06)

- **Reused, not rebuilt:** `apps.catalog` materials (list, create, patch, activate, deactivate), `apps.material_imports` (preview and commit), `apps.stores` locations and accessible stores, `apps.stock_movements` (movements and balances). No new model, catalog, import engine or quantity calculation.
- **Frontend:** `features/store/` (workspace shell, Materials tab, import dialog, Locations and Recorded Receipts tabs, `storeService.js`). The sidebar's mock Inventory items are replaced by "Store & Materials" with three entries.
- **Access:** unchanged. Catalog writes and material import are `IsActiveSuperuser` on the server. The current-user API omits `is_superuser` by design, so the UI cannot hide write controls reliably. It shows them and explains a 403.
- **Not implemented (stays out of scope):** legal ownership and cross-company transfer; opening stock and supplier-lot or expiry requirements; QC or QA release; reservation, material issue, consumption and returns; physical count and stock adjustment; placing materials in locations (the receipt model does not record it); requisition link (no requisition screen exists in the frontend, so this is a gap, not a fake table).
- **Tests:** `features/store/storeWorkspace.test.jsx` (13 tests). Full frontend suite 103/103 over 22 files, exit 0. Lint exit 0, 0 errors, 56 warnings (the same loader pattern as the rest of the project). Build exit 0. No backend code changed, so no backend tests were run. No API contract changed, so the dashboard was not regenerated.
- **Browser:** NOT VERIFIED.

## Material workspace action visibility (2026-10-06)

- **Capability source:** the current-user response now includes `capabilities.can_manage_material_catalog`, derived from `common.permissions.is_active_superuser`, the same function behind `IsActiveSuperuser`. Catalog writes and material import both use that class, so one flag covers both. The flag is read-only and never accepted from the client.
- **Not used:** the business Admin role, role labels, usernames, and the frontend's legacy `is_superuser` (derived from a mock role). Nishita, Saloni and Fenil were not hardcoded and no access was granted.
- **Frontend:** Create, Edit, Activate, Deactivate and Import are hidden unless the capability is true. Without capability information the list is read-only. A user switch or logout replaces the user object. A session restore refreshes the capability from `/auth/me/`. A 403 still shows the plain-language refusal.
- **Tests:** backend `tests.test_material_catalog_capability` (9 tests: superuser true; business Admin false; ordinary user false; anonymous 401; client cannot set it; flag equals the write rule for each account; no extra admin flags; forged UI write refused for create and import). `tests.test_auth` updated for the new field. `tests.test_material_imports` and `tests.test_catalog` pass after the predicate refactor (90 and 95 tests). Frontend workspace tests 18 pass, session-capability test passes; full frontend suite 110/110, 23 files, exit 0. Lint exit 0, 0 errors, 56 warnings. Build exit 0.
- **Contract:** the current-user response gained one additive field. The API dashboard was regenerated.
- **Browser:** NOT VERIFIED.

## Formula editor final refinement (2026-10-06)

**Changed (frontend only; no API, permission or calculation change):**
- `FormulasPage.jsx`: the revision view is split into labelled sections (formula and revision, raw materials, packaging materials, save area, requirements preview, approval). Each table cell carries a `data-label` for the small-screen layout. Removing a saved line asks for confirmation first; a new unsaved row is removed immediately.
- Save area: states are "Saving draft…", "Unsaved changes" (only when there are edits), and "All changes saved", with a "Draft revision" label, a success note after a save, and an error announced with `role="alert"`. Save stays disabled until there are changes and while a save is in flight.
- `FormulasPage.css`: 42px control height in tables and the save area, a quiet Remove action that shows colour on hover and focus, a status colour scheme, section spacing, the calculator's nested border removed inside the editor, and a small-screen layout (under 640px) where each material is a labelled card with no horizontal scrolling.

**Not done in this task (stated plainly):**
- Sticky save bar: left static, so it never covers rows or previews.
- Sidebar and main-content independent scrolling: not changed (it would touch the shared layout).
- Q.S. and %V/V validation: placeholder text only; no new rules.
- AR No.: still free text, as the business requires.
- Calculator: only its nested border was removed. Formula logic, the full-precision control and the saved/draft/preview labels already existed.
- Responsive checks at 375, 430, 768, 1024, 1280 and 1440px: NOT VERIFIED (no browser tool).

**Tests:** formula tests 19 of 19 (new save-state test); full frontend suite 111 of 111 over 23 files, exit 0; lint exit 0, 0 errors, 56 warnings; build exit 0.
**Browser:** NOT VERIFIED.

## Fresh environment switch and frontend sample-data cleanup (2026-10-07)

**Databases (originals preserved, nothing deleted):**
- Original: `cmhp_new_dev` (19 users, 6 customers, 277 audit rows at last count). Unchanged.
- Earlier test copy `cmhp_new_fresh_test`: holds the three copied super admins. Not used by the running backend.
- New clean database: `cmhp_new_clean_test`. Migrations only. Mandatory system rows: Django permissions 280, content types 70, project permission catalog 69. Users, business rows and tokens: 0.

**Running backend:** the port 8000 backend (`D:\CMHP_NEW\backend`) was restarted with `DB_NAME=cmhp_new_clean_test` set for that process only. Verified in the running process's own environment, and by behaviour: a demo account that exists only in the original database returns 401. `.env` and the Vite proxy are unchanged.

**Token isolation:** `SIMPLE_JWT.SIGNING_KEY` now includes the database name. Tokens from one database cannot be accepted by another database, even when user IDs are reused. Backend tests `test_auth` and `test_material_catalog_capability`: 54 of 54 pass.

**Frontend cleanup:**
- Removed the seeded companies, users and units from the in-memory store, and the seeded supplier sample. Those lists are now empty.
- Removed the unused dashboard sample file (`dashboardData.js`).
- Dashboard label changed from "Live inventory data" to "Local store data, not connected to the server".
- One-time reset of this app's own `localStorage` keys (user, session-expired flag, workspace, the persisted demo store, payroll adjustments) on the next load. Other browser storage is not touched, and a fresh login is required.
- Frontend suite 112 of 112, lint exit 0 with 0 errors, build exit 0.

**Still mock-only (not connected to the backend):** Quality, Invoicing, Supply Chain, HR, and the company departments and locations tabs. They now show empty states, but their data layer is still the local store.

**New super admin (run in PowerShell from `D:\CMHP_NEW\backend`; you enter the username and password):**
```powershell
$env:DB_NAME = 'cmhp_new_clean_test'
& 'C:\Users\Admin\AppData\Local\Programs\Python\Python312\python.exe' manage.py createsuperuser
Remove-Item Env:\DB_NAME
```
A new superuser has no company memberships. Business screens will stay empty for that account until memberships and roles are assigned.

**Rollback:**
1. Stop the port 8000 backend (identify it by its directory and `runserver` command line first).
2. Start it normally, with no `DB_NAME` set: `cd D:\CMHP_NEW\backend`, then `python manage.py runserver 127.0.0.1:8000`. `.env` then points to `cmhp_new_dev`.
3. Users must sign in again. Tokens are bound to the database name.

**Browser verification:** NOT VERIFIED. The browser extension is not connected.
