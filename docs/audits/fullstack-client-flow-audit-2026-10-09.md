# Full-Stack Client-Flow Audit — 2026-10-09

**Status: audit report only.** Read-only code inspection plus documentation. No application code was changed, no migrations were run, no database was switched, no accounts/roles/permissions/business records were modified, and no previously-completed test suite was re-run to produce this report. Where a test result is cited, it is attributed to the specific session/run that produced it, never silently treated as "current."

## 0. Methodology (binding for every section below)

For every feature, five things are reported **separately** — never collapsed into one verdict:

| Axis | What it answers |
|---|---|
| **Backend implemented** | Does a real Django model/service/view/URL exist and enforce real validation/permissions? |
| **Frontend implemented** | Does a real, reachable React component render this? |
| **Real API integration** | Does the frontend component's action actually call the real `/api/v1/...` endpoint (quoted `file:line`), or does it read/write mock/local state (Redux `erp` slice, `localStorage`, a hardcoded array)? |
| **Automated test evidence** | Name of the actual test file/class/method that exercises this — not "a test file exists." |
| **Browser verification** | Has this actually been clicked through in a real browser and confirmed working? Defaults to **Not verified** unless a specific, dated, named verification is cited. |

A model existing, a button existing, a route existing, a documentation entry asserting completion, or a green build are each **individually insufficient** to call a feature done. Old test-run counts from prior sessions/documents are cited as historical, never added to today's evidence or presented as current.

**A claim this audit itself caught and corrected before publishing**: a research agent initially reported the Quotations mock save path (§5.1) as an active false-success risk. Before accepting that into this report, it was checked directly — the trigger button is hardcoded `disabled` and no live code path can open the form that contains it, so the risk is dormant, not active. Recorded here as a demonstration of this audit's own verification discipline, not just the subagents'.

**Known, declared contradiction in the project's own documentation**, surfaced here rather than silently resolved: `docs/current-fullstack-progress-report.md` (own text, undated within the file) states *"Still mock-only (not connected to the backend): Quality, Invoicing, Supply Chain, HR, and the company departments and locations tabs."* This audit treats that sentence as an **unverified historical claim**, not fact, and checks each of those areas fresh against the current code (see §6–§7, §9). Where this audit's fresh evidence disagrees with that sentence, the disagreement is stated explicitly, not silently papered over.

---

## 1. Authentication, Workspaces, Organization Setup, Users/Access, Permissions

### 1.1 Current-user identity — a real, verified gap

`apps.authentication.serializers.CurrentUserSerializer` (`backend/apps/authentication/serializers.py:16-34`) is used by **both** `GET /api/v1/auth/me/` (`views.py:181-188`) and the login response (`views.py:90-95`). Its field list is exhaustive: `["id", "username", "email", "first_name", "last_name", "capabilities"]`. The serializer's own docstring states it explicitly: *"no password hash, no is_staff/is_superuser, no other admin flags."* `capabilities` is computed by exactly one line (`serializers.py:29-34`):
```python
def get_capabilities(self, obj):
    from apps.common.permissions import is_active_superuser
    return {"can_manage_material_catalog": is_active_superuser(obj)}
```
**The entire capability dictionary, today, is one key.** No `is_superuser`, no `can_manage_companies`, no `can_manage_stores`, no `can_manage_org_setup` is ever returned by the real backend to the frontend.

**Frontend workaround, already built and real** (`frontend/src/features/auth/authService.js`): `probeIsRealSuperuser()` (lines 103-113) calls `GET /v1/companies/?page_size=1` — an endpoint that genuinely requires `IsActiveSuperuser` server-side — and infers real superuser status from a 200 vs. 403 response. This is real evidence, not a guess, **except** it only runs when `mockMatch` (a username match against the legacy mock `erp.users` Redux slice) is absent (`loginRequest`, line 130: `isRealSuperuser = mockMatch ? false : await probeIsRealSuperuser(...)`). For a brand-new real account whose username does not coincidentally collide with a legacy mock persona, this resolves correctly to real evidence. `createSessionUser` (lines 155-204) then sets `is_superuser: role === 'SUPER_ADMIN'` (line 178) and `role = mockMatch?.role || (isRealSuperuser ? 'SUPER_ADMIN' : 'VIEWER')` (line 162).

### 1.2 A genuine mock-vs-real access-control gap — found this session, not previously documented

`frontend/src/features/companies/permissions.js` gates the entire `/companies` ("User Management") screen — `canViewCompanies`, `canManageAccess`, `canManageCompanies`, `canManageDepartments`, `canManageDesignation` — through a **hardcoded `MATRIX` object** keyed by `user.profile.role` (`'SUPER_ADMIN' | 'MANAGEMENT' | 'HR_ADMINISTRATOR' | 'HR_MANAGER'`), each OR'd with `user?.is_superuser`. This `role` value, per §1.1, is **mock-persona-derived whenever a username happens to match the legacy seed list** — the real backend has no global "MANAGEMENT"/"HR_ADMINISTRATOR" concept at all (its own closest analogue, `CompanyRole`, is a company-scoped, admin-created, arbitrary-code object, structurally unrelated to this fixed four-value matrix). **This is exactly the "business Admin equals superuser" conflation the client's access expectations explicitly warn against** — not because of this specific screen's actions (which, once inside, call real endpoints — `assignUserMembership`, `assignUserRole`, `listCompanies`, `createUser`, all confirmed hitting `/v1/users/...`/`/v1/companies/...` in `usersApiService.js`), but because of its *visibility gate*. A real account whose username happens to match a legacy mock "MANAGEMENT" persona would see this screen without being a real Django superuser or holding any real backend permission. **Risk is narrow** (depends on username collision with a fixed legacy list) but real, and worth a client/engineering decision.

### 1.3 Organization setup (company/store/role creation) — researched this session, **not implemented in code**

A prior task this session (separately logged) fully mapped the backend contracts for this (company create, store create, company/store role create + permission assignment, membership + role assignment, units) and began frontend convention research, but **no `OrganizationSetup.jsx` or equivalent component, and no route, exists anywhere in the frontend** — confirmed by a fresh `find`/`grep` across `frontend/src` for "organization"/"OrgSetup" (zero hits) immediately before writing this report. The feature was fully scoped and zero percent built.

**Exact current state, verified fresh, file:line cited:**

| Action | Backend | Django Admin | Frontend UI |
|---|---|---|---|
| Create Company | `POST /api/v1/companies/` — `IsActiveSuperuser`, `CompanyCreateSerializer` (`code,legal_name,display_name`) (`apps/companies/views.py`, `serializers.py:44-52`) | **Yes** — `CompanyAdmin(SuperuserOnlyAdminMixin)`, add allowed (`apps/companies/admin.py:68-69`) | **None.** `frontend/src/features/companies/tabs/CompaniesTab.jsx` exists on disk (242 lines) but is imported nowhere in the app — confirmed by repo-wide grep; dead code, same pattern as the earlier-found `features/inventory/Inventory.jsx`. |
| Create Shared Store | `POST /api/v1/stores/` — `IsActiveSuperuser`, `StoreCreateSerializer` (`code,name,description`, **no owning-company field by design** — `SharedStore` has no company FK at all) | **No** — `SharedStoreAdmin(ReadOnlySuperuserAdminMixin)`, add explicitly disabled (`apps/stores/admin.py:7-8`) | **None anywhere.** |
| Create Company Role + assign permissions | `POST /api/v1/companies/<id>/roles/` then `PUT .../roles/<id>/permissions/` (body `{"permission_codes":[...]}`, full replace) — both `IsActiveSuperuser` | **Yes** for role create (`CompanyRoleAdmin(SuperuserOnlyAdminMixin)`); permission assignment is API-only (no Admin UI for the M2M) | **None.** `UserAccessTab.jsx` only *picks an existing* role (`listCompanyRoles`); there is no role-creation form or permission-picker UI anywhere. |
| Create Store Role + assign permissions | Mirror of above, `/stores/<id>/roles/...` | **No** — `StoreRoleAdmin(ReadOnlySuperuserAdminMixin)` | **None.** |
| Assign a user to a Company + Role | `POST /v1/users/<id>/memberships/`, `POST /v1/users/<id>/memberships/<id>/roles/` | Yes (underlying models allow admin add) | **Yes, real** — `UserAccessTab.jsx`'s `CompanyAccessPanel`, confirmed calling the real endpoints above. |
| Assign a user to a Store + Role | `POST /v1/stores/<id>/memberships/` (body `{"user_id"}`), `.../roles/` (body `{"role_id"}`) | No | **None.** |
| Create a Unit of Measure | `POST /v1/units/` — `IsActiveSuperuser` | No — `UnitOfMeasureAdmin(ReadOnlySuperuserAdminMixin)` | **None** (Material creation form only *picks* an existing unit). |

**Status update (2026-10-09, same day): DONE for every row above.** `/organization-setup` now implements all seven
rows (companies, stores, company/store roles + full-replace permission editing, company/store memberships + role
assignment, units) against these exact pre-existing endpoints - no backend change. Company membership/role
assignment reuses `UserAccessTab.jsx`'s own real functions rather than duplicating them; store membership/role
assignment is newly built (the one row with no prior frontend at all). See
`docs/frontend-api-handoff.md` → "Organization Setup wired to the UI" for full detail, including the one new
current-user capability (`can_manage_organization_setup`) that gates it, and §1.4 below's navigation gap being
closed alongside it.

### 1.4 The "first user cannot reach setup" navigation gap — verified, narrow, not an authorization hole

Traced through `ProtectedRoute.jsx` and `MainLayout.jsx` directly (not assumed): a fresh superuser with zero company memberships gets `getAvailableWorkspaces(user).length === 0`, so `requiresWorkspaceSelection(user)` (`= length > 1`) is `false`, and `ProtectedRoute`'s workspace-gate block never triggers — execution falls through to `<Outlet/>` for **any** path. The `/companies` route is therefore technically reachable by typing the URL directly. The only real gap is **cosmetic**: the "User Management" sidebar link carries `companyOnly: true` (`MainLayout.jsx`), which the nav filter hides whenever no company workspace is active — so a fresh superuser sees no link to click, but nothing server-side or route-side actually blocks them. Backend authorization is unaffected either way (`IsActiveSuperuser` is re-checked on every write regardless of what the frontend shows). Given §1.3, this gap is moot in practice anyway — even if the nav link were shown, the Company/Store/Role creation screens it would lead to **do not exist**.

**Status update (2026-10-09, same day): CLOSED.** The new "Organization Setup" sidebar entry (`MainLayout.jsx`'s
`requiresOrgSetupAccess` flag) is deliberately **not** `companyOnly` - it stays visible in every workspace state,
including zero membership, gated only by the real `can_manage_organization_setup` capability. A fresh superuser
with no company yet can now both see the link and use the screens it leads to.

### 1.5 Runtime superuser ≠ operational permission (confirmed design, not a gap)

Every write endpoint audited above (`Company`, `SharedStore`, `CompanyRole`, `StoreRole`, permission replacement, catalog Units) is gated by `IsActiveSuperuser` **only** — none of them accept a company- or store-scoped permission code as an alternative. Conversely, every *operational* endpoint audited elsewhere in this report (formulas, requisitions, receiving, stock movements, BMR, etc.) is gated by explicit company/store permission codes and **never** checks `is_superuser`/`is_staff` as a bypass — confirmed repeatedly across this session's own backend reading (e.g. `apps.companies.services.active_companies_for_user` docstring: "never grants access merely from is_superuser"). This matches the client's stated expectation exactly: superuser is purely a platform-setup authority, never an operational shortcut.

---

## 2. Formula Quantity Modes / "Label Claim" — inspected, not invented

The client's own wording (*"As requisite", "As per label claim", "As per formula"*) is **not** matched 1:1 by what exists in code. Reporting exactly what's there, with no interpretation of "As requisite":

### 2.1 What exists

`FormulaLine.CalculationMode` (`backend/apps/formulas/models.py:324-327`) — **exactly two** values:
```python
AS_PER_FORMULA = "AS_PER_FORMULA", "As per formula"
AS_PER_LABEL_CLAIM = "AS_PER_LABEL_CLAIM", "As per label claim"
```
Field `calculation_mode` (default `AS_PER_FORMULA`), plus `label_claim_quantity` (`DecimalField`, nullable) and `label_claim_uom` (nullable FK to `UnitOfMeasure`, `PROTECT`) — all on `FormulaLine` (lines 351-357).

**Separately, two unrelated free-text fields also exist on the same model** and must not be confused with the calculation mode: `label_claim` (line 338, free text, e.g. "45% V/V" — explicitly documented in its own code comment as "not used in any calculation") and `special_value` (line 359, free text, e.g. "Q.S." — a display override, not a calculation input).

### 2.2 Allowed values and validation (`FormulaLine.clean()`, `models.py:376-427`)

- `AS_PER_LABEL_CLAIM` requires `label_claim_quantity > 0` **and** `label_claim_uom` set (400 otherwise, both required together); the claim unit's dimension must match the revision's own `output_uom.dimension` (mass is never converted to volume); both the claim unit and the output unit must have `canonical_factor` set (400, naming the missing conversion, if not).
- `AS_PER_FORMULA` (the default) **rejects** `label_claim_quantity`/`label_claim_uom` outright if either is supplied (400) — never silently ignored.

### 2.3 Actual calculation effect (`backend/apps/formulas/requirement_preview.py:190-393`)

- `AS_PER_FORMULA`: `required = line.quantity * target_output_quantity / base_output_quantity` — the original, proportional-scaling behavior, unchanged.
- `AS_PER_LABEL_CLAIM`: `required = target_output_quantity / (label_claim_quantity converted into the output unit via canonical_factor)` — e.g. a 5000 ml total batch where each pack's label claims "100 ml" needs 50 packs. The line's own stored `quantity`/`unit` are **not used** in this mode; they stay informational only.

Both run on exact `fractions.Fraction` arithmetic (never binary float), confirmed in the same file's module docstring and `_to_fraction`/`_display` helpers.

### 2.4 Where it appears in the UI

`frontend/src/features/formulas/FormulasPage.jsx`'s `MaterialTable` component — a per-line **"Requisite"** `<select>` with exactly the same two options ("As per formula" / "As per label claim"). When a row is switched back to "As per formula," the frontend itself clears `label_claim_quantity`/`label_claim_uom` client-side (matching the backend's rejection rule). `RequirementCalculator.jsx` shows the same two-mode label as **read-only display text** in its own "Requisite" column.

### 2.5 CSV import — does not carry this field at all (a real, concrete gap)

`apps/formula_imports/services.py`'s `SUPPORTED_COLUMNS` is exactly: `formula_code, formula_name, product_code, base_output_quantity, output_uom_code, material_code, material_quantity, formula_notes, revision_notes`. **No `calculation_mode`, `label_claim_quantity`, or `label_claim_uom_code` column exists.** Every CSV-imported formula line is therefore always `AS_PER_FORMULA` (the model default) — a label-claim-based formula cannot currently be bulk-imported; it must be set up line-by-line in the UI afterward.

### 2.6 BMR mapping

`BMRLine` (`apps/bmr/models.py`) carries `special_value`, `label_claim`, `ar_no` — seeded once, verbatim, from the source `FormulaLine` at generation time (then independently editable). **It does not carry `calculation_mode` as its own visible field** — the BMR line shows only the already-computed `required_text` result (a frozen string) and the free-text notes; a reviewer cannot tell from the BMR line alone which of the two calculation modes produced that number without checking the source formula revision separately.

### 2.7 Existing tests

`tests/test_formula_requirement_preview.py::LabelClaimCalculationTests` (5 tests, confirmed present this session) and line-level validation tests inside `tests/test_formulas.py`. Both exercise the two modes above; neither tests a third mode, because none exists.

### 2.8 Exact client questions needed to finalize this requirement

1. Is "As requisite" the client's own label for one of the two existing modes (and if so, which), or a genuinely third, unbuilt calculation rule?
2. If a third mode is needed, what exact arithmetic does it use, and does it need its own new field(s), or can it reuse `label_claim_quantity`/`label_claim_uom`?
3. Should CSV import support `calculation_mode`/label-claim fields (§2.5), given formulas are currently import-only-as-proportional?
4. Should a BMR line visibly state which calculation mode produced its number, for QA traceability?

---

## 3. Multi-Stage Formulas (ABC + PQR → MNC)

A full design document for this exact requirement was produced earlier in this session: `docs/multi-stage-formula-design.md` (556 lines, read-only inspection + proposal, explicitly labeled "nothing here is implemented"). Restating its verified-capabilities section precisely, since this audit must not call a flat line table "multi-stage manufacturing":

- **`FormulaLine` is a flat list** — one `line_number` sequence across both raw and packaging lines, with **no stage, grouping, or sub-mixture concept anywhere** (confirmed by direct code read, `apps/formulas/models.py:314-439`). No field or model expresses that one line "produces" an intermediate, or that a line belongs to a stage.
- **No stage dependency concept exists.** No model anywhere in `apps/formulas`, `apps/batch_plans`, `apps/material_requisitions`, or `apps/bmr` has a "depends on" relationship between any two rows.
- **The requirement calculator (`build_requirement_preview`) iterates the flat line list only** — there is no aggregation-without-double-counting concept today because there is nothing to double-count yet (every line is already summed exactly once, by construction).
- **Approved-revision immutability already applies to the whole line set** (`FormulaRevision.clean()` blocks any content change once `APPROVED`) — this mechanism would extend to a future stage model for free, with no new code, since a stage would be ordinary revision-child content subject to the same existing check.
- **BMR has no stage concept** — `BMRLine`'s only grouping today is `slip` (`RAW`/`PACKING`), confirmed in `apps/bmr/models.py`.

**Correction to this audit's own earlier framing**: in a prior task this session, I tentatively described `/supply-chain` as plausibly real-API-backed without confirming it. Fresh, dedicated verification (§6 below) found the opposite — it is a mock Redux module. This is recorded here as a correction, not silently dropped.

The design doc proposes an additive `FormulaStage` model + a nullable `FormulaLine.stage` FK (so existing flat formulas are entirely unaffected), with the smallest safe first implementation slice being exactly those two schema additions, proven non-breaking against the existing test suite before any service/API/UI work begins. See that document for the full data model, calculation-impact analysis (no arithmetic changes needed — the existing calculator already handles this correctly once lines carry an optional stage tag), and the six exact open client questions it lists (yield/evaporation on intermediate stages, partial vs. whole-output transfer, BMR stage-execution gating, Requisition-vs-BMR ordering, approval-snapshot depth, and CSV import extension).

---

## 4. Customers, Suppliers, Catalog (Units/Categories/Materials), Products, CSV Imports

*Fresh agent research, 2026-10-09, read directly from the working tree — no server run, no browser used (all "browser verification" below is Not verified).*

### 4.1 Customers (`apps/customers`) — the most mature domain audited

**Backend**: company-scoped `Customer` model with optimistic concurrency (`version`), immutable `company`/`code`, independent billing/shipping addresses. Every action individually permission-gated (`_get_company_for_action`, `apps/customers/views.py:40-64`), no superuser bypass: list/`customers.view`; create/`+.create`; edit/`+.edit`; delete/`+.delete` (DELETE verb, requires `expected_version`); activate/deactivate their own codes; CSV import preview+commit/`+.create`. Admin is read-only (`ReadOnlySuperuserAdminMixin`).

**Frontend — real, confirmed, no mock fallback**: `customersService.js` (every function is a genuine `api.get/post/patch/delete` to `/v1/companies/<id>/customers/...` — the file's own top comment states "Nothing here falls back to mock/local data on failure"). `CustomersPanel.jsx` wires list/delete/import through it; permission gating via `usePermissions()` → `hasPermission(...)`, not hardcoded.

**Tests**: `tests/test_customers.py` — real classes covering model rules, access boundaries (incl. `test_superuser_has_no_implicit_bypass`), create/list/update/lifecycle, admin read-only, and a `ConcurrentCustomerTests` (`TransactionTestCase`) race test. **Gap found**: no dedicated backend test class for the CSV import path specifically (unlike Products/Materials, which do have one) — the import code is real but its own test coverage wasn't located.

**Verdict**: list/create/edit/activate/deactivate/delete/import all **real backend + real frontend wiring**, no false-success risk found.

### 4.2 Suppliers (`apps/suppliers`) — backend-complete, **no real frontend screen exists**

**Backend**: confirmed directly (not assumed) — every endpoint, GET included, is `IsActiveSuperuser`-only (`apps/suppliers/views.py:42,80,99,109`), with **no company/store-scoped read exception at all** (unlike Catalog, which allows `CanReadSharedCatalog` on reads). No DELETE route exists anywhere. Admin is also read-only. Backend tests (`tests/test_suppliers.py`) explicitly assert this: `test_company_membership_never_grants_supplier_access`, `test_store_membership_never_grants_supplier_access`.

**Frontend — mock only**: the only "Suppliers" UI anywhere in the app is a tab inside `frontend/src/features/supplyChain/SupplyChain.jsx`, backed entirely by a local Redux slice (`erpSlice.js`) via `supplyChainService.js` — confirmed **zero** `axios`/`api.*` calls in that file (grep-verified). On create, the UI itself discloses this: `setSuccess('Supplier created in demo data only (not saved to the server).')` (`SupplyChain.jsx:521`) — not deceptive, but confirms no backend wiring. The equivalent disclosure was **not** confirmed present on edit/status-change actions in the same file (flagged, not fully checked). The UI also offers a "Delete" action for a resource whose real API has **no delete endpoint at all** — a misleading affordance regardless of mock status.

**Verdict**: real supplier management today is **API/Postman-only** for superusers; the client-visible "Suppliers" screen is demo data with no path to the real backend.

### 4.3 Catalog — Units of Measure, Material Categories, Materials, Material CSV Import

**Write access is `IsActiveSuperuser`-only** for Units/Categories/Materials alike (read is shared via `CanReadSharedCatalog`). Confirmed: `ProductType` (`apps/catalog`) is a **separate, currently-unused** shared lookup — zero references from `apps.products`/`apps.product_imports` (grep-confirmed) — it is not wired to `Product.product_type` (which stays free text).

**Material CSV import (`apps/material_imports`) is real and thorough**: pure-function parser, two-query file-wide duplicate/unit checks, preview never creates a `Material`, commit is lock-based, re-validates against current DB state (not stale preview state), idempotent-repeat-safe, atomic, audited. **Frontend is real**: `MaterialImportModal.jsx` → `storeService.js`'s `previewMaterialImport`/`getMaterialImportPreview`/`commitMaterialImport`, all genuine `/v1/materials/import-*` calls, gated by the server-derived `can_manage_material_catalog` capability (not a client guess).

**No frontend screen exists to create Units or Material Categories themselves** (only consumed as read-only dropdown lookups) — consistent with low admin-surface-area design, not a gap the client is likely to notice operationally.

**Tests**: `tests/test_material_imports.py` — extensive (preview validation, commit happy-path + 4 distinct conflict scenarios, access boundaries, concurrency race test, a 2000-row performance test). No frontend test specifically confirmed for `MaterialImportModal.jsx`.

### 4.4 Products, Product Types, Product CSV Import — **no variant/brand/size modeling (confirmed gap)**

**`Product` is a flat identity** (`apps/products/models.py:9-171`): company-scoped, immutable code, free-text `product_type`/`bmr_no` (no identity meaning), required immutable `sales_uom`. The model's own docstring is explicit: no formula/BOM, no dosage/potency, no pack-size calc, no price/tax/HSN/GST, no shelf-life calc, no opening stock. **Confirmed directly: no brand field, no size/variant field, no parent-product/variant-group relationship exists anywhere in this model or `apps/product_imports`.** For the client's stated "4,000+ products including brand/size variations," each brand+size combination today would need its own fully independent `Product` row with no shared grouping, parent identity, or brand/size-specific query field — a real, structural gap against that stated need, not a documentation oversight.

**Backend/frontend otherwise mirror the Customers pattern closely** — real company-scoped permission gating (incl. a `resolve_default_sales_uom` convenience on create), real `productsService.js` wiring (no mock fallback), real CSV import (`apps/product_imports`, three permissions required together, atomic, lock-revalidated, explicitly rejects a "replacement product list" body shape).

**Tests**: `tests/test_products.py` and `tests/test_product_imports.py` — both extensive and real (access boundaries, default-sales-uom logic specifically covered by 5 tests, concurrency, audit rollback, cross-company isolation). **Frontend test caveat, applies project-wide**: `ProductsPanel.real.test.jsx` (and the equivalent pattern elsewhere) mocks the service layer (`vi.mock(...)`) — these are legitimate component tests, but **not** evidence the deployed frontend and backend actually interoperate; only the backend's own Django `TestCase`s exercise the real views/DB, in isolation from the frontend.

---

## 5. Quotations, Direct Sales Orders, Store Preparation, Batch Planning & Numbering, Material Requisitions

*Fresh agent research, 2026-10-09, read directly — not executed, not browser-verified.*

### 5.1 Quotations (`apps/quotations`) — backend real and tested; **frontend is mock and intentionally disabled, not a live false-success risk**

Backend: `Status` has exactly **one** reachable value, `DRAFT` (`models.py:43-45`) — the model's own docstring: "no approval, sending, acceptance, rejection, expiry, revision workflow, sales-order conversion, tax, discount, freight, grand total, PDF, or stock effect anywhere... nothing can reach any other value today." Server-generated reference, server-computed pre-tax line amounts, row-locked/`expected_version`-checked full-replace edits. No DELETE, no lifecycle route exists at all (`views.py:118`). Permissions: `quotations.view/.create/.edit` only.

**Frontend: no real integration, and the dormant mock path is confirmed unreachable — correcting an over-statement I caught in my own synthesis.** A research agent first reported this as an active false-success risk, citing `saveQuotation` (`Operations.jsx:1384-1407`, calls `operationsService.createQuotation(...)` → local Redux `erpSlice` only, then shows `'Company quotation created successfully.'`). **I verified this claim myself before accepting it, and it does not hold as stated**: the "+ Add quotation" button that used to open the quotation modal is now hardcoded `disabled` with the label "Not connected yet" (`Operations.jsx:1940-1943`), the list explicitly states *"Quotations are not saved to the server yet, so none are listed here"* (line 1950), and — confirmed by grep — **there is no remaining `setModal('quotation')` call anywhere in the file**, so the modal containing `saveQuotation`'s form can never actually open through any UI interaction today. `saveQuotation` is real, unreachable dead code, "left in place" exactly as `docs/current-fullstack-progress-report.md` (2026-10-06) already documented — that older doc's claim is **accurate**, not stale, on this specific point. The practical risk is therefore **dormant, not active**: if a future edit re-enables that button without also fixing the save path, the false-success message would immediately resurface — worth a code comment or removal, not an urgent fix.

Tests: `tests/test_quotations.py` — real classes (`CreateTests`, `UpdateTests`, `ListTests`, `ConcurrencyTests`), not executed this session.

### 5.2 Direct Sales Orders (`apps/sales_orders`) — backend real and heavily tested; **list/create/edit/delete real in frontend, confirm has zero UI**

Backend: `Status` = `DRAFT`, `CONFIRMED` (two real states, confirmed by direct read). A per-company `SalesOrderConfirmationPolicy` (three explicit tri-state booleans, `null` = "not configured" = blocks confirmation) gates a real, business-rule-checked `confirm_sales_order` transition (`services.py:504+`) — locks order/policy/customer/products/units in a fixed deadlock-free order, re-checks permissions under lock. **But confirmation's only effect is the status flag + audit trail** — the same docstring states explicitly: "Confirmation creates no stock reservation, batch, invoice or production record." Delete is real (DRAFT + no batch plans only).

**Frontend — real for everything except confirm.** `SalesOrdersPanel.jsx`/`SalesOrderFormModal.jsx` → `salesOrdersService.js` are genuinely wired (list/create/edit/delete all real `api.*` calls, file's own header comment: "nothing here falls back to mock/local data"). **`confirm` has zero frontend path** — a repo-wide grep for `confirmSalesOrder`/`sales_orders.confirm`/`confirmation-preview` across the whole frontend returns **zero matches**. There is no "Confirm" button anywhere; the heavily-tested backend confirmation workflow is simply unreachable from the UI today (not falsely claimed — just absent).

**Dead code flagged**: `SalesOrdersTab.jsx` (1763 lines) is unreferenced anywhere, uses the mock Redux path, and fabricates a `DRAFT/CONFIRMED/IN_PROGRESS/COMPLETED/CANCELLED` status enum that **does not match** the real backend's two-value enum — a real risk if ever resurrected or demoed.

Tests: `tests/test_sales_orders.py`, `tests/test_sales_order_confirmation.py` (~45 methods, incl. `test_no_stock_production_or_conversion_side_effects`, `test_no_unconfirm_cancel_or_amend_endpoints`), `tests/test_sales_order_confirmation_preview.py`, `tests/test_sales_order_delete.py` — all real, not executed this session.

### 5.3 Store Preparation (`apps/store_preparation`) — real backend and real frontend, confirmed

Model exactly as previously found: `packing_type` free text, `insert_required` tri-state (`null`=not specified/`False`=not required/`True`=required only, never availability/readiness), owner is exactly one of `batch_plan` (legacy) or `sales_order_line` (current), DB-enforced via `CheckConstraint`. `delete()` always raises. Two-axis permission model: store-scoped `store_preparation.view/.create/.edit` **plus** access to the owning order/plan (`sales_orders.view` or `batch_plans.view`).

**Frontend is real**, living inside `SalesOrderFormModal.jsx`'s section explicitly labelled *"Store preparation — Store Manager"* (`SalesOrderFormModal.jsx:1119`) — matching the client's stated role assignment exactly. `storePreparationService.js`'s own header comment: real reads/writes, no mock fallback. Create/update both confirmed wired to the real endpoints.

Tests: `tests/test_store_preparation.py` — real, covers both the legacy and current owner paths, plus a concurrency test for duplicate-creation races.

### 5.4 Batch Planning & Numbering (`apps/batch_plans`) — confirmed DRAFT-only; numbering real, explicit, and non-authorizing; "printing status" is free text only

`BatchPlan.Status` has exactly one value, `DRAFT` (`models.py:46-47`) — no service function anywhere changes it. `delete()` always raises.

**Batch numbering is a real, separate, explicit, audited action** (`numbering.py:144-289`, `POST .../allocate-number/`, `batch_plans.allocate_number` permission) — never automatic. Format: `<customer code><2-digit year>-<3+-digit sequence>`, sequence scoped per `(operating_company, client_code, allocation_year)`, never wrapping. The allocation record is fully immutable once created and **explicitly never changes `BatchPlan.status`** — confirmed in the module's own docstring: "authorizes NOTHING: not production, not stock reservation, not material issue."

**"Printing details"**: `mrp_for_printing` is a real typed `DecimalField`; **`printing_status_note` is a plain free-text `CharField`, with no enum, no state machine, no workflow** — directly answering the client's "Manager enters batch planning and printing details" step: only the MRP number is structured data, printing status itself is just a note.

**Frontend is real** — `SalesOrderFormModal.jsx`'s *"Batch and printing — Manager"* section (line 1210), wired to `batchPlansService.js` (own header comment: no mock fallback) for create/update/allocate-number, correctly gating the two printing fields on the distinct `batch_plans.printing_edit` permission.

Tests: `tests/test_batch_plans.py`, `tests/test_batch_number_allocation.py` (incl. `test_uses_customer_code_not_operating_company_code`, `test_no_stock_order_or_formula_side_effects`, a concurrency test for simultaneous allocation) — real, not executed this session.

### 5.5 Material Requisitions (`apps/material_requisitions`) — the most heavily-tested backend of these five domains; **zero workflow UI**

Status lifecycle confirmed exactly: `DRAFT → SUBMITTED → APPROVED/REJECTED`, `REJECTED → DRAFT` (revise) is the only way back, each transition its own named service function. `MaterialRequisitionRound`/`RoundLine` confirmed as an immutable per-submission snapshot, never updated/deleted after creation. **Confirmed independently (fresh grep): `apps/material_requisitions/services.py` has no import of `apps.stock_movements` anywhere** — no stock effect at any stage, corroborating the earlier stock_movements-side finding from the opposite direction. Reject reuses the `.approve` permission code (no separate `.reject` code).

**Frontend: the entire create/edit/submit/approve/reject/revise workflow has no screen anywhere** — confirmed by grep (only unrelated hits: BMR's own "requisition slip" label, and a disconnected mock field in dead code). **The one real, intentionally narrow exception**: `getRequisitionStatus(storeId, batchPlanId)` → `GET .../requisition-status/`, a read-only status badge inside `SalesOrderFormModal.jsx`, whose own code comment states "never edited here." This is the most heavily backend-tested of all five domains in this section (~65+ test methods in `tests/test_material_requisitions.py`) with the least frontend reach.

### 5.6 Verdict tables, §5

| Action | Backend real? | Frontend wired to real API? | Test evidence | False-success risk |
|---|---|---|---|---|
| Quotation create/edit | Yes | **No — mock Redux; the save path exists but its trigger button is disabled, so it's unreachable today** | test_quotations.py | Low (dormant, not active — would resurface if the disabled button were re-enabled without fixing the save path) |
| Sales order list/create/edit/delete | Yes | Yes | test_sales_orders.py, test_sales_order_delete.py | Low |
| Sales order confirm | Yes, real policy-gated | **No UI at all** | test_sales_order_confirmation.py (~45 methods) | N/A, absent |
| Store preparation create/edit | Yes | Yes (Store Manager section) | test_store_preparation.py | Low |
| Batch plan create/edit | Yes | Yes | test_batch_plans.py | Low |
| Batch number allocation | Yes, explicit+audited | Yes | test_batch_number_allocation.py | Low |
| Printing status | No workflow (free text only) | Plain text input | None applicable | Medium — easy to assume it's a tracked state when it isn't |
| Requisition create/submit/approve/reject/revise | Yes, most-tested domain here | **No UI at all** (only a read-only status badge) | test_material_requisitions.py (~65+ methods) | N/A, absent |

Browser verification for all of §5: **Not verified.**

---

## 6. Purchasing, Receiving, Quality (QC)

*Fresh agent research, 2026-10-09. This section includes a direct correction to this audit's own earlier (unverified) assumption from a prior task — see below.*

### 6.1 Purchasing (`apps/purchasing`) — backend real and tested; **frontend is 100% mock, and it is NOT the "real API-backed" sections an earlier task in this session assumed**

Backend: `PurchaseRequest.Status` = DRAFT, SUBMITTED, APPROVED, REJECTED, CANCELLED, with a real 3-step neutral approval round (`current_round`/`current_step`, each step decided by anyone holding `purchase_requests.approve`, 3rd approval → APPROVED, a reject at any step → REJECTED immediately), full audit-trail models surviving reject→revise→resubmit cycles. `PurchaseOrder.Status` = DRAFT, ISSUED, CANCELLED — DRAFT created from an APPROVED request, ISSUED is one-way/terminal with a permanent snapshot, CANCELLED only reachable from DRAFT. All permission codes backed by real seeding migrations.

**Correction, stated plainly**: an earlier task this session described `/supply-chain` as plausibly real-API-backed. **Fresh, direct code reading shows the opposite.** `SupplyChain.jsx` imports only `supplyChainService.js`, which imports the local Redux `store` and a `delay()` mock helper whose own docstring says: *"Mimics an axios-style response so existing components... keep working without any change."* Every Purchasing function (`getPurchaseOrders`, `createPurchaseOrder`, `approvePurchaseOrder`, `cancelPurchaseOrder`) reads/writes Redux state only — **zero `api.get/post` calls anywhere in the file**. There is also no "Purchase Request" concept in the frontend at all — only a single flat mock "Purchase Order" entity created directly in DRAFT with no sourcing request, no 3-step round, no issue action. A repo-wide grep for `purchase-request|purchase-order|goods-receipt|incoming-inspection` across the entire frontend returns **zero matches**.

Tests: `tests/test_purchase_requests.py`, `tests/test_purchase_orders.py` — extensive, real (3-step approval state machine, snapshot-on-issue, `test_issue_does_not_create_stock_or_send_anything`).

### 6.2 Receiving (`apps/receiving`) — backend real, tested, **and confirmed still wired to Stock Movements**; frontend is mock

`GoodsReceipt.Status` = DRAFT, POSTED, CANCELLED, confirmed. `idempotency_key` create-retry mechanism confirmed. **Re-confirmed fresh, directly in `services.py:467-475`**: the real DRAFT→POSTED transition calls `apps.stock_movements.services.create_receipt_in_movements` inside the same transaction — the Material Register/Stock Movements work built earlier this session is still correctly wired, not a one-off.

**Frontend is mock, and does not even mirror the real lifecycle**: `createGoodsReceipt` in `supplyChainService.js` dispatches a hardcoded `status: 'RECEIVED'` — a value that doesn't exist anywhere in the real backend's DRAFT/POSTED/CANCELLED enum — and there is **no post or cancel action in the frontend service at all**, so even as a mock it cannot simulate posting.

Tests: `tests/test_receiving.py` — extensive, real. One staleness flag found: `test_no_stock_qc_or_accounting_side_effect`'s own comment still says "No stock... model exists anywhere" even though Stock Movements now exists — the test itself still passes (it doesn't assert zero movements, just doesn't check for them), but the comment is now stale documentation, not a code defect.

### 6.3 Quality (`apps/quality`) — Incoming QC Inspections confirmed narrow and non-release; Material Specifications is a separate, unconnected, superuser-only thing; **the only frontend "Quality" screen is an unrelated mock concept**

**`IncomingInspection.Status` re-verified directly (not trusted from an older design doc): exactly DRAFT, SUBMITTED, CANCELLED — no ACCEPTED/REJECTED/RELEASED anywhere**, confirmed by the model's own docstring: "does **not** decide acceptance or rejection, does **not** release material to production... There is deliberately no ACCEPTED/REJECTED/RELEASED status anywhere." It records free-text observations (`parameter_name`, `method_reference`, `result`, `remarks`) — **no pass/fail flag, no numerical limit, no specification check**.

**Confirmed zero relationship to BMR**: a fresh grep both directions (`apps.quality`↔`apps.bmr`) found no FK or import either way. This existing QC concept is purely about incoming raw-material receipt lines — it is **not** the "QA reviews BMR" touchpoint the client's order journey describes; that would be an entirely separate, currently unbuilt QA step.

**Material Specifications is a different, separate thing**, confirmed to live inside `apps/quality` (not its own app): an identity + draft-only versioned spec/test catalog (only `DRAFT` is a reachable status), **superuser-only access with no read exception**, and its own docstring confirms "does not attach any specification to an `IncomingInspection` — that integration is intentionally deferred." It has no operational effect today and should not be described as "QC approved" anything.

**Frontend**: `frontend/src/features/quality/Quality.jsx` exists but is **not** the real feature — it records a mock `decision`/`remarks` against a production "batch" concept via local Redux (`qcDecision`/`qaDecision` in `qualityService.js`), structurally unrelated to `IncomingInspection` or `MaterialSpecification`. No frontend screen anywhere calls the real `/incoming-inspections/` or `/material-specifications/` endpoints (zero matches, repo-wide grep).

Tests: `tests/test_incoming_inspections.py` — extensive, real, including `test_response_never_exposes_commercial_fields` and a concurrency test for simultaneous submit/edit. `tests/test_material_specifications.py` exists, confirmed present, not fully enumerated.

### 6.4 Verdict tables, §6

| Action | Backend real? | Frontend wired to real API? | Test evidence | False-success risk |
|---|---|---|---|---|
| PR create/submit/approve/reject/cancel/revise | Yes | **No — concept doesn't exist in frontend** | test_purchase_requests.py | N/A, absent |
| PO create/update/cancel/issue | Yes | **No — Redux mock only** | test_purchase_orders.py | **High** — a PO that "looks created" only ever existed in browser state |
| GR create (idempotent) | Yes | **No — mock with a non-matching status string** | test_receiving.py | **High** |
| GR post → creates StockMovement | Yes, confirmed wired | **No post action exists in the frontend at all** | test_receiving.py, test_stock_movements.py (EndToEnd test) | N/A, absent |
| GR cancel | Yes | **No cancel action in frontend** | test_receiving.py | N/A, absent |
| IncomingInspection create/submit/cancel | Yes | **No frontend screen at all** | test_incoming_inspections.py | N/A — but risk that "Quality.jsx" is mistaken for this feature |
| MaterialSpecification draft CRUD | Yes, superuser-only, no workflow | No frontend | test_material_specifications.py | Low (inert) |
| Batch QC/QA decision (`Quality.jsx`) | **No matching backend endpoint found** | Mock only | None found | **High** — a recorded QC/QA decision here never reaches any backend table |

Browser verification for all of §6: **Not verified.**

---

## 7. BMR (resolving the conflicting reports), Production, Packaging, Dispatch, Invoicing, Reporting, Audit Access

*Fresh agent research, 2026-10-09 — this directly resolves the "did BMR work start" conflict with first-hand code evidence.*

### 7.1 BMR — the conflict resolved: **a real, tested scaffold exists; zero workflow/approval logic exists**

`BatchManufacturingRecord`/`BMRLine` confirmed to have **no status/workflow field of any kind** — the model's own docstring: "does not allocate a batch number, create stock movements, or authorise production." Creation (`create_bmr`) is an explicit, separate `POST` (never automatic), locks the batch plan, refuses a duplicate (409), pulls lines from the **existing**, already-computed requirement preview (never recomputes), snapshots free-text fields once, and is **not regenerable**. Editing afterward touches only four free-text fields (`special_value`, `label_claim`, `ar_no`, `qty_received`), version-checked, audited; `required_text` itself can never be changed through the edit endpoint. **Confirmed zero import from `apps.quality` or `apps.material_requisitions` anywhere in `apps/bmr`** — creation requires only that the batch plan's requirement preview be calculation-complete, no QC or requisition gate of any kind.

**Frontend is real and confirmed live** (not orphaned) — `BmrPanel` is imported and mounted inside `SalesOrderFormModal.jsx`, gated by a real permission flag. `bmrService.js` makes genuine `GET/POST/PATCH` calls to the real `/batch-plans/<id>/bmr/` and `/bmr/<id>/lines/<id>/` endpoints — confirmed, no mock layer.

**The signoff block — confirmed precisely what it is**: four `<span>` labels ("Prepared by / Production Chemist," "Reviewed by / Production In-Charge," "Approved by / QA Manager," "Checked by / Warehouse") with **no input, no state, no click handler, no API call** — a print layout for physical pen signatures on a paper printout (the panel also has a plain `window.print()` button), confirmed by reading the component source directly. **This is not a digital approval workflow in any sense.**

**Resolution of the owner-vs-report conflict, stated plainly**: *"BMR work had not started"* is **incorrect** as a blanket statement — a real, tested, end-to-end scaffold exists (model, locking/transaction/audit service layer, permission-checked views, genuinely-wired frontend, real automated tests on both sides). It is also **not** a stub. But if "had not started" meant *BMR workflow/QA sign-off/production authorization*, that reading is accurate — **none of that exists anywhere**, confirmed independently across models, services, views, and the frontend component. Older reports describing "BMR screens" are accurate for the read/create/edit scaffold; they would be wrong only if they implied a digital approval step exists.

Tests: `tests/test_bmr.py` (real classes covering creation-from-preview, duplicate-conflict, free-text line edits with optimistic versioning, packing-only `qty_received`, immutability of the required-quantity text, audit rollback on both create and edit, permission/company isolation) and `BmrPanel.test.jsx` (4 tests, confirms real API-call arguments including version propagation, though the service layer is mocked at the component-test level — a legitimate component test, not a backend-integration proof).

### 7.2 Production, Packaging, Dispatch, Finished Goods, Invoicing, Reporting, Audit Access

**Confirmed via a fresh full listing of `backend/apps/` (26 apps)**: no `production`, `packaging`, `dispatch`, `shipment`, `invoice`/`invoicing`, or `finished_goods` app exists anywhere. `apps/batch_register` is **not** production execution — its own docstring: "a READ-ONLY operational register... No new model, no new table, no new business status... There is no mutation endpoint anywhere in this app" — it is a reporting view over existing apps' data, nothing more.

**Invoicing — confirmed entirely mock, and self-disclosed as such**: `frontend/src/features/invoice/Invoice.jsx`/`invoiceService.js` import the same Redux/`mockApi` pattern as every other mock module. The component itself tells the user: *"Invoice created in demo data only (not saved to the server)"* and the same for mark-paid. A full-looking invoice UI (KPIs, line items, tax computation, print-style document, mark-paid) sits entirely on local state with no backend app behind it at all.

**`docs/erp-screen-catalog.md`'s "Planned/Not Implemented" list re-checked fresh against the actual `apps/` directory**: accurate for every item **except one stale entry** — PLAN-08 "Production / BMR" is still listed as NOT IMPLEMENTED, but `apps/bmr` demonstrably exists (§7.1). This is a genuine, concrete doc/code mismatch (git history shows BMR landed in a squashed checkpoint commit, so the catalog was simply never updated afterward) — worth correcting as part of this audit's handoff.

**Audit log (`apps/audit`)**: real, broad coverage — `record()` is called from essentially every mutating service app-wide (confirmed call sites across ~20 apps). **But there is no REST API for it at all** — `apps/audit/` has no `views.py`/`urls.py`. The only way to see an audit entry is Django Admin, **read-only, active-superuser-only**. No frontend screen references "audit" anywhere (zero grep matches). So: logging itself is real and thorough; *viewing* it is Admin-only, with zero client-facing path.

**Dashboard and HRMS — confirmed mock, not just assumed**: `Dashboard.jsx` imports `inventoryService`, which imports the same Redux/`mockApi` pair — demo data, not live. `hrService.js` likewise. Independently corroborated by `demoModules.smoke.test.jsx`'s own grouping comment ("every designed page enabled for the 'Coming soon' sidebar modules") and by `Operations.legacy.test.jsx`/`Operations.jsx`'s **deliberate, labeled** `disabled` buttons reading "Not connected yet" on the legacy Quotations/Batches tabs — confirmed as intentional, documented placeholders, not accidental breakage.

### 7.3 Table, §7.2

| Module | Exists in `apps/`? | Exists in frontend? | Verdict |
|---|---|---|---|
| Production execution | No | No | **Missing** |
| Packaging / filling | No | No | **Missing** |
| Finished-goods tracking | No | No | **Missing** |
| Dispatch / shipment | No | No | **Missing** |
| Invoicing | No | Yes, fully built | **Mock** — self-disclosed "demo data only" |
| Reporting / analytics | No dedicated app (only the read-only `batch_register`) | Dashboard exists, mock-backed | **Missing/Mock** |
| Audit-log viewing | Logging is real and broad; no API | No frontend screen | **Partial** — write path real, read path Admin-only |
| HRMS | No backend | Yes, full UI | **Mock** |
| Dashboard | No | Yes | **Mock** |

Browser verification for all of §7: **Not verified.**

---

## 8. Store and Inventory — Material Register, Stock, and Everything Beyond It

*Own direct work earlier this session (`apps/stock_movements`, the Material Register screen), plus fresh verification grep for this report.*

### 8.1 What's real today

- **Material master, import**: covered in §4.3 — real, atomic CSV import with a real frontend UI.
- **Goods receipt creation and posting**: covered in §6.2 — real, and confirmed (fresh this turn) still wired to create `StockMovement` rows on posting.
- **Recorded receipt quantities / Material Register**: real backend (`apps/stock_movements` — `StockMovement` model, `GET .../stock-movements/`, `GET .../stock-balances/`, both with `?material=`/`?posted_from=`/`?posted_to=` filters, grouped by `(material, unit, source_company)`, never merging units or companies) and a real frontend screen (`MaterialRegisterPage.jsx`, reached from the Materials catalog list). Both built, tested (34 backend + 128 frontend tests, this session), and redesigned for presentation earlier today. **Every response explicitly labels its number `recorded_receipt_quantity`, never `available_stock`/`usable_stock`/`on_hand`**, and carries a `coverage` block stating plainly what is and isn't included.
- **Storage locations**: `StorageLocation` (`apps/stores`) is real identity tracking (a shelf/room/bin inside a store) — but it is **not** quantity-at-location tracking; nothing records how much of a material sits in which location.
- **Audit log**: real and broad (§7.2) — Admin-viewable only.

### 8.2 What is confirmed NOT to exist (verified by fresh grep this turn, not assumed)

- **Opening stock**: no `OpeningStock` model or concept anywhere in `backend/apps` (grep-confirmed).
- **Supplier lot/expiry tracking**: `lot_reference` is free text, copied verbatim from the goods-receipt line, never structured or validated as a real lot identity; **no expiry-date field exists anywhere** — `apps/receiving/models.py:170` states this explicitly in its own docstring ("inventing one without real source data would be worse than not having it").
- **QC hold/release**: per §6.3, `IncomingInspection` has no ACCEPTED/REJECTED/RELEASED concept at all — there is no "released to production" state anywhere in the codebase.
- **Reservation, material issue (full or partial), actual consumption, unused/defective returns, supplier returns, disposal, physical counts/adjustments**: `StockMovement.MovementType` has **exactly one** usable value, `RECEIPT_IN` (confirmed by direct read of `apps/stock_movements/models.py` this session, both when building the feature and again fresh for this audit) — the enum's own docstring names `REVERSAL`/`ADJUSTMENT` as a *possible future* addition specifically so a later migration wouldn't need to rename the field, but **no code anywhere creates anything but `RECEIPT_IN` today**. None of issue, reservation, consumption, return, or physical-count adjustment exist in any form, mock or real.
- **Company-wise material usage and legal ownership**: `StockMovement.source_company` (and `GoodsReceipt.company`) is documented, in the model's own words, as "the receipt's own company — the receiving/purchasing company — **NOT a legal-ownership claim**." No ownership-allocation or transfer-of-ownership concept exists.

### 8.3 What "Physical" quantities can actually represent today — stated precisely

A number from the Material Register represents **exactly**: the sum of `RECEIPT_IN` movements recorded since this feature was installed, for one material, in one unit, attributed to one receiving company, at one store — **nothing else**. It is explicitly:
- **Not** proof of available or usable stock (no release/QC-hold concept exists to subtract).
- **Not** reduced by any issue, consumption, or return (none of those exist).
- **Not** inclusive of pre-system (opening) stock.
- **Not** a legal-ownership statement.

This matches the task's own framing precisely: recorded receipts are not proof of available/usable stock, and (per §5.5) requisition approval is not proof of material issue — there is, today, no code path anywhere that could make either claim true even if a screen wanted to.

### 8.4 Verdict table, §8

| Action | Backend real? | Frontend wired? | Test evidence | False-success risk |
|---|---|---|---|---|
| Material register — list/filter by date | Yes | Yes (`MaterialRegisterPage.jsx`) | `tests/test_stock_movements.py` (34 tests this session) | None — coverage notice shown prominently |
| Goods receipt → stock movement on post | Yes, confirmed wired | N/A (backend-triggered) | `test_stock_movements.py`, `test_receiving.py` | None |
| Opening stock, QC hold/release, reservation, issue, consumption, returns, disposal, physical count/adjustment | **No — none exist** | No | N/A | N/A — nothing claims these work anywhere |

Browser verification: the Material Register screen specifically **was** exercised live in-browser this session (visible in the user's own screenshots during this conversation, including after a visual redesign) — the one genuine browser-verified screen in this entire audit. Everything else in §8 remains Not verified.

---

## 9. Clean-Environment / Runtime Setup — verified fresh, this turn, read-only

Re-checked live, immediately before writing this section (not carried over from an earlier task in this session):

- **Frontend's actual API target**: Vite's dev-server proxy (`frontend/vite.config.js`) forwards `/api` → `http://127.0.0.1:8000`, fixed in config.
- **Backend process identity**: exactly one `manage.py runserver` reloader/listener pair currently bound to `127.0.0.1:8000`, confirmed via live process enumeration (`Get-NetTCPConnection` + `Get-CimInstance Win32_Process`) — not assumed from any earlier check in this conversation.
- **Actual runtime database**: `cmhp_new_dev`, confirmed by reading the live process's own environment block directly (a read-only ctypes probe reading only `cwd`/`cmdline`/`DB_NAME` — no credentials), not inferred from `.env` alone. (This project maintains a second database, `cmhp_new_clean_test`, migrations-only with zero business rows, via `backend/scripts/db-switch/`'s two helper scripts — switching between them is a deliberate, session-scoped `$env:DB_NAME` override, never a `.env` edit.)
- **Pending migrations on the live database**: **zero** — `manage.py showmigrations --plan` shows no unapplied migrations against `cmhp_new_dev` right now.
- **Setup data present** on this live database (read-only count, no records disclosed): 21 users, 2 companies, 1 shared store — consistent with the client's stated "two operating companies, one shared physical store" setup, already populated on this particular database.
- **First-user onboarding through the website**: per §1.3, **not possible today** on a genuinely empty database — Company creation has no frontend UI (Django-Admin-only), Shared Store creation has **neither** a frontend UI **nor** a Django Admin path (API-only), and Company/Store Role creation + permission assignment likewise have no frontend UI. The backend API contracts for all of this were fully mapped in an earlier task this session, but **no code implementing the screens was written** — confirmed by a fresh, explicit `find`/`grep` across the frontend for "organization"/"OrgSetup" returning zero results, done specifically for this report.
- **Navigation/membership bootstrap problem, precisely**: a fresh superuser with zero company memberships is not blocked by `ProtectedRoute` from reaching `/companies` directly by URL (§1.4) — but, per the point above, reaching that screen would not actually let them create a Company or Store, since no UI exists for either. The only real bootstrap paths today are the Django Admin (Company only) and direct API calls (both Company and Store).

No credentials, tokens, hashes, or connection secrets are reproduced anywhere in this report.

---

## 10. The Full Matrix

Labels used exactly as specified: **Implemented / Partial / Mock / Missing / Not verified / Decision pending**. No overall completion percentage is given — each row's own evidence is the measure. Full detail and file:line citations for every row are in §1–§8 above; this table is a navigable summary, not a replacement for them.

| Module / client requirement | Backend | Frontend | API integration | Permission enforcement | Automated evidence | Browser evidence | Missing work | Client decision needed | Priority | Evidence file/function |
|---|---|---|---|---|---|---|---|---|---|---|
| Auth / workspaces | Implemented | Implemented (with mock role bridge) | Partial | Implemented | Historical only, not re-run | **Verified** (live this session) | `is_superuser` never returned by `/auth/me/`; frontend infers it via a probe | No | Medium | `authentication/serializers.py:16-34`; `authService.js:103-204` |
| Organization setup | Implemented | **Missing** | N/A | Implemented | Not verified this audit | Not verified | All 5 setup screens (Company, Store, 2× Role, permission assignment) | No | **High** | `companies/views.py`, `stores/views.py`, `permissions/views.py` |
| Users / access (membership+role) | Implemented | Implemented, real actions | Implemented | Partial (frontend visibility gate is mock-role-driven) | Not itemized this audit | Not verified | Replace `permissions.js` mock `MATRIX` gate | No | Medium | `features/companies/permissions.js`; `UserAccessTab.jsx` |
| Customers | Implemented | Implemented | Implemented | Implemented | Implemented (`test_customers.py`) | Not verified | CSV import lacks dedicated test file | No | Low | `customers/views.py`; `customersService.js` |
| Suppliers | Implemented | **Mock** | Mock | Implemented (superuser-only) | Implemented (`test_suppliers.py`) | Not verified | Real frontend screen entirely | **Decision pending** — company/store-scoped access, or stay superuser-only? | Medium | `suppliers/views.py`; `supplyChainService.js` |
| Units / Materials | Implemented | Partial (materials yes; units/categories no) | Implemented (materials) | Implemented | Implemented | Partial (register verified live) | Unit/category creation UI | No | Low | `catalog/views.py`; `MaterialsTab.jsx` |
| Products / Types | Implemented (flat identity) | Implemented | Implemented | Implemented | Implemented | Not verified | No variant/brand/size model | **Decision pending** — how to represent brand/size variants? | **High** | `products/models.py:9-171` |
| CSV Imports (product/material/formula) | Implemented | Implemented (product/material) | Implemented | Implemented | Implemented | Not verified | Formula import lacks calculation_mode/label-claim columns | No | Low | `product_imports`, `material_imports`, `formula_imports` |
| Formulas (core + QA approval) | Implemented | Implemented | Implemented | Implemented | Implemented (160/160, this session) | Not verified (post-change) | None major | No | Low | `formulas/approval.py`, `models.py` |
| Quantity modes / label claims | Implemented (2 of ~3 client-named options) | Implemented | Partial (absent from CSV import) | Implemented | Implemented | Not verified | CSV import support; BMR doesn't show which mode produced a number | **Decision pending** — see §2.8 | **High** | `formulas/models.py:324-427`; `requirement_preview.py:190-393` |
| Multi-stage formulas | **Missing** | **Missing** | N/A | N/A | N/A | N/A | Everything — design-only | **Decision pending** — 6 questions, see design doc | Medium | `docs/multi-stage-formula-design.md` |
| Orders — Quotations | Implemented | **Mock** (save path dormant/unreachable — trigger button disabled) | Mock | Implemented (backend) | Implemented | Not verified | Real frontend wiring, if ever reactivated | No | Low | `Operations.jsx:1384-1407,1940-1950` |
| Orders — Direct Sales Orders | Implemented | Partial (confirm missing) | Partial | Implemented | Implemented | Not verified | "Confirm" UI | No | **High** | `SalesOrdersPanel.jsx`; `sales_orders/services.py:504` |
| Store preparation | Implemented | Implemented | Implemented | Implemented | Implemented | Not verified | None major | No | Low | `store_preparation`; `SalesOrderFormModal.jsx:1119` |
| Batch planning / numbering | Implemented | Implemented | Implemented | Implemented | Implemented | Not verified | "Printing status" is free text, no workflow | **Decision pending** — does printing need a real status? | Medium | `batch_plans/numbering.py`; `SalesOrderFormModal.jsx:1210` |
| Material requisitions | Implemented (most-tested domain) | **Missing** (workflow); read-only status badge only | Partial | Implemented | Implemented (~65+ tests) | Not verified | Entire workflow UI | No | **High** | `material_requisitions/services.py`; `storePreparationService.js:52` |
| Purchasing (PR/PO) | Implemented | **Mock** | Mock | Implemented | Implemented | Not verified | Entire real frontend | No | **High** | `purchasing/views.py`; `supplyChainService.js` |
| Receiving | Implemented (incl. stock-movement trigger) | **Mock** | Mock | Implemented | Implemented | Not verified | Entire real frontend | No | **High** | `receiving/services.py:467-475` |
| Register / Stock | Implemented | Implemented | Implemented | Implemented | Implemented (34+128 tests, this session) | **Verified** (live, this session) | Issue/reservation/returns/opening-stock/QC-hold — none exist, by deliberate scope | **Decision pending** — ownership/lot/QC/reservation/issue policy (`docs/shared-store-inventory-plan.md` §7) | Medium | `stock_movements`; `MaterialRegisterPage.jsx` |
| QC / QA (Incoming Inspection) | Implemented (narrow scope) | **Missing** (real); Mock (`Quality.jsx`, unrelated concept) | Missing | Implemented | Implemented | Not verified | Real frontend; "QA reviews BMR" is entirely unbuilt | **Decision pending** — QC disposition + BMR-review rules | **High** | `quality/models.py:79-82` |
| BMR | Implemented (scaffold, zero workflow) | Implemented (scaffold, zero workflow) | Implemented | Implemented | Implemented (`test_bmr.py`, `BmrPanel.test.jsx`) | Not verified | QA sign-off is paper-only; no production-status gate | **Decision pending** — digital approval workflow wanted? | **High** | `bmr/services.py`; `BmrPanel.jsx:188-203` |
| Production | **Missing** | **Missing** | N/A | N/A | N/A | N/A | Entire module | **Decision pending** | **High** | — |
| Packaging | **Missing** | **Missing** | N/A | N/A | N/A | N/A | Entire module | **Decision pending** | Medium | — |
| Finished goods | **Missing** | **Missing** | N/A | N/A | N/A | N/A | Entire module | **Decision pending** | Medium | — |
| Dispatch | **Missing** | **Missing** | N/A | N/A | N/A | N/A | Entire module | **Decision pending** | Medium | — |
| Invoicing | **Missing** | Mock (fully built, self-disclosed demo) | Mock | N/A | N/A | Not verified | Real backend + tax/numbering decisions | **Decision pending** | Medium | `invoice/Invoice.jsx` |
| Reporting | **Missing** (only read-only `batch_register`) | Mock (Dashboard) | Mock | N/A | N/A | Not verified | Real reporting backend | No (scope, not policy) | Low | `batch_register/services.py` |
| Audit access | Implemented (logging); **Missing** (API) | **Missing** | Missing | Implemented (Admin, superuser-only) | Not itemized | Not verified | REST endpoint + a screen | No | Low | `apps/audit/` |

---

## 11. Next Work Plan

### 11.1 What can be tested now (no client input needed)
- Organization setup screens (§1.3) — backend contracts are fully mapped; this is pure frontend build-and-test work.
- Direct Sales Order "Confirm" UI — backend is fully built and tested; this is wiring a button to an existing endpoint.
- Material Requisition workflow UI — same: backend is the most-tested domain in this audit, frontend is simply absent.
- Removing or clearly commenting the dormant Quotations save path (§5.1) so it can't silently resurface if the disabled button is ever re-enabled.
- Correcting `docs/erp-screen-catalog.md`'s stale PLAN-08 entry (§7.2) — a documentation fix, no code change.
- Replacing `features/companies/permissions.js`'s mock-role visibility gate with a real server-derived capability (§1.2) — a scoped, well-understood fix.

### 11.2 What can be demonstrated honestly today
- The Formula QA approval workflow (Draft→Submitted→Approved/Rejected), end to end, backend-tested.
- The Material Register (§8) — the one screen in this entire audit with live browser use this session.
- Store Preparation and Batch Planning/Numbering inside the Sales Order modal — both real, both tested.
- BMR creation and line-editing (not sign-off — that part is still paper-only, and should be presented as such).

### 11.3 Concrete blockers
- **Purchasing, Receiving, and Quality (incoming QC) have no real frontend at all** — this breaks the client's stated order journey well before BMR is even reached, since goods can't really be received through the UI today (the mock "Goods Receipt" screen doesn't even post, so it can't trigger the real Stock Movement it's supposed to).
- **Products has no variant/brand/size model** — blocks accurately representing the client's stated 4,000+ product catalog as anything other than flat, ungrouped rows.
- **The "As requisite" formula option is unresolved** (§2.8) — blocks finalizing the quantity-mode UI with confidence.

### 11.4 Tasks that can proceed without further client answers
Everything in §11.1 — these are wiring/build tasks against already-decided, already-tested backend behavior.

### 11.5 Tasks that need business decisions first
Every row marked **Decision pending** in §10: Suppliers' access model, product variants, the exact "As requisite" meaning, multi-stage formula policy (6 questions), printing-status workflow need, stock ledger's next slice (ownership/lot/QC/reservation/issue — `docs/shared-store-inventory-plan.md` §7), QC disposition + BMR-review rules, BMR digital sign-off, and the entire Production/Packaging/Dispatch/Invoicing scope.

### 11.6 Dependency-ordered implementation plan

1. Organization setup screens (unblocks real onboarding of any new environment).
2. Purchasing + Receiving + Incoming QC real frontend (the order journey is structurally broken without these — a goods receipt can't reach the real Stock Movement ledger through the UI today).
3. Sales Order "Confirm" UI + Material Requisition workflow UI (both pure wiring against tested backends).
4. Resolve the quantity-mode/"As requisite" client question, then extend CSV import to carry it.
5. Decide and build the stock ledger's next slice (QC release at minimum, since nothing downstream can honestly claim "usable stock" without it).
6. Decide and build BMR's QA sign-off/production-authorization step.
7. Multi-stage formulas (per the existing design doc's own recommended first slice) — independent of the above, can run in parallel once prioritized.
8. Production → Packaging → Finished Goods → Dispatch → Invoicing, in that order, once the client has answered the scope questions for each.

### 11.7 ONE recommended next bounded task

**Wire the Direct Sales Order "Confirm" action into the UI.** Rationale: the backend (`confirm_sales_order`, `assess_confirmation`, the confirmation-policy gate) is fully built, policy-protected, and covered by ~45 real tests — this is the single highest-leverage, zero-ambiguity, no-client-decision-needed task in this entire audit, and it directly unblocks the client's stated order journey's very first real transition (an order must be confirmed before anything downstream makes sense).

**Acceptance criteria**:
- A "Confirm" action appears on a DRAFT sales order, gated on the real `sales_orders.confirm` permission (not a mock role).
- Clicking it calls the real `confirmation-preview` endpoint first and shows any blocking reason verbatim (never invents its own wording).
- On confirm, calls the real `confirm` endpoint with `expected_version`; a 409 reloads and shows the current state rather than silently retrying.
- A confirmed order's status updates in the list/detail view without a page reload.
- No change to any other screen; no backend code change (the endpoint already exists and is already tested).
- New frontend test(s) covering: permission-gated visibility, the blocking-reason display, the success path, and the 409 path — run alongside the existing Sales Order frontend test suite (not the unrelated suites).

**Status update (2026-10-09, same day): DONE.** Implemented exactly as scoped above, no backend changes. See `docs/frontend-api-handoff.md` → "Sales Order review and confirmation wired to the UI (2026-10-09)" and `docs/erp-screen-catalog.md`'s updated SO-04/SO-05/SO-06 entries for the full detail. Summary: "Review order" (not just "Confirm") calls the real `confirmation-preview` endpoint and renders its `blocking_reasons`/`informational_observations` verbatim; "Confirm order" appears only with real `sales_orders.confirm`, posts the reviewed preview's own `order.version`, and a `409` clears the stale preview and requires an explicit re-review rather than retrying. The one gap this task surfaced and reported rather than silently worked around: the confirmation policy (§13.8 in the handoff doc) has no administration screen in the frontend at all — the review section shows the backend's own refusal message and says so plainly. 21/21 new+existing tests pass in `SalesOrderFormModal.test.jsx`; full frontend suite 141/141; `vite build` and lint clean. Browser verification: NOT VERIFIED — no browser/screenshot tool was available in this session.

