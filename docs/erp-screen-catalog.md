# CMHP ERP — Screen Catalog

Screen inventory for the frontend, grouped by module, with stable screen
IDs for cross-referencing in tickets, designs, and the API handoff
document (`docs/frontend-api-handoff.md`).

**Legend**: `Type` distinguishes a full navigable page from a **Modal**
(overlay, own close/cancel, does not change the URL), a **Tab** (a section
within a parent detail page), or a **Confirm** dialog (single yes/no
action with no independent content, e.g. "Cancel this order?"). Backend
status uses the same tags as `docs/erp-client-flow.md`: **IMPLEMENTED**,
**PROPOSED POLICY**, **NOT IMPLEMENTED**, **PLANNED**.

Every implemented screen below is backed by real, tested API endpoints —
see `docs/frontend-api-handoff.md` for exact request/response shapes.
Endpoints listed here are for cross-reference only, not full contracts.

---

## Module: Auth & Session

### AUTH-01 — Login
- **Type**: Full page
- **Purpose**: Authenticate a user; establish the session (access token in memory, refresh token as an HttpOnly cookie).
- **Backend status**: IMPLEMENTED
- **Context**: Public (no company/store yet)
- **Permissions**: None (anonymous)
- **Key fields**: username, password
- **Actions**: "Log in"
- **Validation**: Required fields; on failure, a single generic "invalid username or password" message (the API deliberately does not distinguish wrong-username from wrong-password from inactive-account)
- **States**: Loading (submit in flight); validation-error (401, generic message); forbidden n/a
- **Navigates to**: NAV-01 (company/store picker) or directly to the last-used company/store context
- **APIs**: `GET /api/v1/auth/csrf/` (on page load), `POST /api/v1/auth/login/`

### NAV-01 — Company & Store Switcher
- **Type**: Modal (or persistent header dropdown)
- **Purpose**: Let the signed-in user pick which company and/or store they're currently working in. Nothing in this app is usable without an active company or store context.
- **Backend status**: IMPLEMENTED
- **Context**: Self-service — shows only companies/stores the user actually has active membership in
- **Permissions**: None beyond being authenticated
- **Key fields**: Company list (code, legal name, display name), Store list (code, name, description)
- **Actions**: Select company; select store
- **States**: Empty (user has no active company/store membership at all — a real, valid state, not an error)
- **APIs**: `GET /api/v1/companies/mine/`, `GET /api/v1/stores/mine/`

### NAV-02 — My Permissions Panel
- **Type**: Tab / panel (usually inside account settings, or a debug/help panel)
- **Purpose**: Show the current user exactly which permission codes they hold in the selected company and/or store — useful for support and self-diagnosis of "why can't I do X."
- **Backend status**: IMPLEMENTED
- **Context**: Company-scoped and Store-scoped (two separate calls)
- **Permissions**: None beyond active membership
- **Key fields**: Flat list of permission code strings
- **States**: 404 if the company/store no longer has an active membership for this user
- **APIs**: `GET /api/v1/companies/<id>/my-permissions/`, `GET /api/v1/stores/<id>/my-permissions/`

### NAV-03 — Store Overview
- **Type**: Full page (lightweight)
- **Purpose**: Confirm store identity for a member with the stricter `shared_store.view` permission (not just any active membership).
- **Backend status**: IMPLEMENTED
- **Context**: Store-scoped
- **Permissions**: `shared_store.view` (STORE)
- **Key fields**: id, code, name — deliberately no stock/quantity data (none exists in the system)
- **States**: 404 (not a member / store inactive); 403 (member but lacks `shared_store.view`)
- **APIs**: `GET /api/v1/stores/<id>/overview/`

---

## Module: Superuser Administration

All screens in this module require `IsActiveSuperuser` (Django-admin-style
superuser gate — unrelated to any company/store permission). There is no
non-superuser path to any of these screens.

### ADM-01 — Users List
- **Type**: Full page
- **Purpose**: Browse/search all user accounts in the system.
- **Backend status**: IMPLEMENTED
- **Context**: Global (superuser only)
- **Permissions**: Superuser
- **Columns**: username, email, full name, is_active, date_joined
- **Filters/search/pagination**: `?search=` (username/email/name), `?is_active=`, `?ordering=` (allowlisted fields only), paginated (default page size 20, max 100)
- **Actions**: "New user" → ADM-02 (create modal); row click → ADM-03
- **States**: Empty (no matches); loading; forbidden (403, non-superuser reaching this route directly)
- **Navigates from**: App admin menu
- **APIs**: `GET /api/v1/users/`

### ADM-02 — Create User
- **Type**: Modal
- **Purpose**: Create a new login account.
- **Backend status**: IMPLEMENTED
- **Fields**: username, email, first_name, last_name, initial_password (write-only; validated by Django's password rules)
- **Validation**: `is_staff`/`is_superuser`/`is_active`/`groups`/`user_permissions`/`password` are rejected outright (400) if sent — this form must never expose those controls
- **States**: validation-error (400, field-keyed)
- **APIs**: `POST /api/v1/users/`

### ADM-03 — User Detail
- **Type**: Full page, with tabs
- **Purpose**: View/edit one user's identity, and manage their company memberships and roles.
- **Backend status**: IMPLEMENTED
- **Tabs**: Profile (edit username/email/first/last name), Company Memberships (ADM-04), deactivate/activate/reactivate buttons
- **Buttons**: Deactivate (blocked for a superuser target — 403 "manage in Django Admin"), self-deactivation blocked (400)
- **States**: 404 (unknown id); conflict n/a (no version field on User)
- **Navigates to**: ADM-04 tab
- **APIs**: `GET/PATCH /api/v1/users/<id>/`, `POST .../activate/`, `POST .../deactivate/`

### ADM-04 — User's Company Memberships (Tab)
- **Type**: Tab within ADM-03
- **Purpose**: Grant/revoke this user's membership in companies, and assign company roles within each membership.
- **Columns**: company code/legal name, is_active
- **Actions**: "Assign company" (picks a company_id), "Revoke" (deactivate), per-membership "Manage roles" → nested role-assignment list
- **Note**: these list endpoints are **not paginated** — a plain array — unlike almost every other list in this system
- **APIs**: `GET/POST /api/v1/users/<id>/memberships/`, `POST .../<mid>/deactivate/`, `GET/POST .../<mid>/roles/`, `POST .../roles/<aid>/deactivate/`

### ADM-05 — Companies List
- **Type**: Full page
- **Purpose**: Browse/manage the (small, fixed) set of companies.
- **Columns**: code, legal_name, display_name, is_active
- **Filters**: `?search=`, `?is_active=`, paginated
- **Actions**: "New company" (modal, ADM-06), row click → ADM-07
- **APIs**: `GET /api/v1/companies/`

### ADM-06 — Create Company (Modal)
- **Fields**: code (immutable after create), legal_name, display_name (optional)
- **APIs**: `POST /api/v1/companies/`

### ADM-07 — Company Detail
- **Type**: Full page
- **Purpose**: Edit legal_name/display_name; activate/deactivate. `code` is permanently immutable.
- **Buttons**: Activate/Deactivate (idempotent, never cascades to memberships or roles — deactivating a company does not touch who belongs to it)
- **Navigates to**: ADM-10 (company's role list)
- **APIs**: `GET/PATCH /api/v1/companies/<id>/`, `POST .../activate/`, `POST .../deactivate/`

### ADM-08 — Permission Catalog
- **Type**: Full page, read-only
- **Purpose**: Browse every permission code that exists in the system (both COMPANY-scope and STORE-scope), for reference while building roles.
- **Columns**: code, name, module, scope, description, is_active
- **Filters/search/pagination**: `?search=` (code/name), `?module=`, `?scope=` (COMPANY/STORE), `?is_active=`. **Default page size is 20; max is 100.** There is no create/update/delete route for this resource anywhere — new permission codes are only ever introduced by the backend team alongside new features.
- **States**: Empty n/a in practice (catalog always has entries once seeded)
- **APIs**: `GET /api/v1/permissions/`

### ADM-09 — Company Roles List (per company)
- **Type**: Tab/section within ADM-07 (or its own page reached from there)
- **Purpose**: Manage the named, permission-bundled roles a company can assign to its members.
- **Columns**: code, name, description, is_active
- **Actions**: "New role" (modal), row click → ADM-10
- **APIs**: `GET/POST /api/v1/companies/<id>/roles/`

### ADM-10 — Company Role Detail
- **Type**: Full page
- **Purpose**: Edit a role's name/description, and set its exact permission set.
- **Fields**: code (immutable), name, description
- **Sub-section**: "Permissions" — a picker against ADM-08's catalog, filtered to `scope=COMPANY`; **saving replaces the entire permission set atomically** (not additive) — a full `PUT`, not incremental add/remove calls
- **Buttons**: Activate/Deactivate (activate blocked with 400 if the parent company is itself inactive)
- **Validation**: role/company inactive blocks the permissions save (400)
- **APIs**: `GET/PATCH /api/v1/companies/<id>/roles/<rid>/`, `PUT .../permissions/`, `POST .../activate/`, `POST .../deactivate/`

### ADM-11 — Shared Stores List
- **Type**: Full page
- **Purpose**: Manage the shared physical store(s). A store has no owning company — it is explicitly shared.
- **Columns**: code, name, description, is_active
- **Actions**: "New store" (modal), row click → ADM-12
- **APIs**: `GET /api/v1/stores/`

### ADM-12 — Store Detail
- **Same pattern as ADM-07**, for `SharedStore`. `code` immutable; `name`/`description` editable.
- **APIs**: `GET/PATCH /api/v1/stores/<id>/`, `POST .../activate/`, `POST .../deactivate/`

### ADM-13 — Store Roles List / Detail
- **Same pattern as ADM-09/ADM-10**, scope `STORE` instead of `COMPANY`, mounted under a store rather than a company.
- **APIs**: `GET/POST /api/v1/stores/<id>/roles/`, `GET/PATCH .../roles/<rid>/`, `PUT .../roles/<rid>/permissions/`, activate/deactivate

### ADM-14 — Store Memberships & Role Assignments
- **Same pattern as ADM-04**, for store membership instead of company membership. **Also not paginated.**
- **APIs**: `GET/POST /api/v1/stores/<id>/memberships/`, `POST .../<mid>/deactivate/`, `GET/POST .../<mid>/roles/`, `POST .../roles/<aid>/deactivate/`

---

## Module: Shared Catalog

Read access for these three screens is **wider than superuser-only**: any
active superuser, or any user holding `shared_catalog.view` in at least one
store they belong to. Write access is superuser-only.

### CAT-01 — Units of Measure List / Detail
- **Type**: Full page + edit modal
- **Purpose**: Manage the fixed set of measurement units (mass/volume/count) materials are expressed in.
- **Columns**: code, name, dimension, is_active
- **Fields editable**: `name` only (code and dimension are immutable after creation)
- **Validation**: cannot deactivate a unit still used as a material's base unit (400)
- **APIs**: `GET/POST /api/v1/units/`, `GET/PATCH /api/v1/units/<id>/`, activate/deactivate

### CAT-02 — Material Categories List / Detail
- **Same pattern as CAT-01**. Flat list, no parent/child hierarchy. Cannot deactivate a category still referenced by an active material.
- **APIs**: `GET/POST /api/v1/material-categories/`, `GET/PATCH /api/v1/material-categories/<id>/`, activate/deactivate

### CAT-03 — Materials List / Detail
- **Type**: Full page + edit modal
- **Purpose**: The material master — raw materials and packaging materials.
- **Columns**: code, name, kind (RAW_MATERIAL/PACKAGING_MATERIAL), category, base_unit, is_active
- **Filters**: `?search=`, `?is_active=`, `?kind=`, `?category=`, `?base_unit=`
- **Fields editable**: name, description, category (nullable — clearing it is allowed); `code`/`kind`/`base_unit` are permanently immutable after creation
- **Validation**: reactivating a material is blocked (400) if its base unit or category has since become inactive
- **Explicitly not present anywhere on this screen**: quantity, stock, any owning company — the material master carries no stock-balance concept
- **APIs**: `GET/POST /api/v1/materials/`, `GET/PATCH /api/v1/materials/<id>/`, activate/deactivate

### CAT-04 — Storage Locations List / Detail (per store)
- **Type**: Full page + edit modal, nested under a store
- **Purpose**: Named sub-locations within the shared store (e.g. "Rack 3", "Cold Room").
- **Read permission**: superuser, OR active store membership + `storage_locations.view` (folds to 404 if the store itself is inaccessible, 403 if a member but missing the permission)
- **Fields editable**: name, description (code immutable)
- **Explicitly rejected fields**: is_active, quantity, stock, company_id, owner — a location has no stock or company-ownership concept
- **APIs**: `GET/POST /api/v1/stores/<id>/locations/`, `GET/PATCH .../locations/<lid>/`, activate/deactivate

---

## Module: Suppliers

### SUP-01 — Suppliers List
- **Type**: Full page
- **Purpose**: The shared supplier directory (one directory, not per-company — see open decisions).
- **Backend status**: IMPLEMENTED
- **Permissions**: Superuser only, in **both** read and write directions — no read exception like the catalog module has
- **Columns**: code, legal_name, display_name, contact_name, is_active
- **Filters**: `?search=` (code/legal_name/display_name/contact_name), `?is_active=`, paginated
- **APIs**: `GET /api/v1/suppliers/`

### SUP-02 — Supplier Detail
- **Type**: Full page
- **Fields editable**: everything except `code` (legal_name, display_name, contact_name, email, phone, full address fields, country_code)
- **Important caveat to show in the UI**: `is_active` means only "this directory entry is currently in use." It is **not** a QC/quality qualification or "approved to supply" status — no such concept exists yet.
- **APIs**: `GET/PATCH /api/v1/suppliers/<id>/`, activate/deactivate

---

## Module: Purchase Requests

Company-scoped throughout. Every screen requires active company membership
with `purchase_requests.view` at minimum.

### PR-01 — Purchase Requests List
- **Type**: Full page
- **Purpose**: Browse a company's purchase requests across all statuses.
- **Backend status**: IMPLEMENTED
- **Columns**: reference, status, required_by, current_round, current_step, created_by, created_at
- **Filters**: `?search=` (reference), `?status=`, paginated
- **Status badges**: DRAFT / SUBMITTED / APPROVED / REJECTED / CANCELLED
- **Actions**: "New request" → PR-02 (create), row click → PR-03
- **States**: 404 if the company itself is inaccessible (no membership); empty (no requests yet)
- **APIs**: `GET /api/v1/companies/<id>/purchase-requests/`

### PR-02 — Create Purchase Request
- **Type**: Full page (line-item editor)
- **Fields**: required_by (optional), notes (optional), lines (material + quantity + notes; one line per material, quantity > 0)
- **Permissions**: `purchase_requests.view` + `purchase_requests.create`
- **Validation**: duplicate material in two lines → 400; unknown material → 404
- **States**: validation-error (field-keyed 400)
- **Navigates to**: PR-03 on success
- **APIs**: `POST /api/v1/companies/<id>/purchase-requests/`

### PR-03 — Purchase Request Detail
- **Type**: Full page, with tabs
- **Purpose**: The central screen for a request's whole lifecycle — view, edit while draft, submit, cancel, approve/reject, revise.
- **Tabs**: Lines (editable while DRAFT only — becomes read-only once SUBMITTED), Approval History (PR-04)
- **Buttons, by status**:
  - DRAFT: Edit (inline/PATCH), Submit, Cancel — requires `purchase_requests.cancel`
  - SUBMITTED: read-only content; Approve/Reject (only visible to a user holding `purchase_requests.approve`, and never to the request's own creator), Cancel — requires the **different** permission `purchase_requests.cancel_pending`
  - REJECTED: Revise (re-opens editing, returns to DRAFT)
  - APPROVED / CANCELLED: fully read-only, terminal
- **Version handling**: every mutating button must send the `version` last read from this screen as `expected_version` — see `docs/frontend-api-handoff.md` §"Handling 409" for the required refetch-and-show-conflict behavior
- **States**: 404 (no company access); 403 (has access, missing the specific action's permission); validation-error 400 (wrong-status transition, self-approval attempt, duplicate-decider attempt); conflict 409 (stale version, or approving a step that has since moved on)
- **APIs**: `GET/PATCH /api/v1/companies/<id>/purchase-requests/<rid>/`, `POST .../submit/`, `POST .../cancel/`, `POST .../approve/`, `POST .../reject/`, `POST .../revise/`

### PR-04 — Approval History (Tab)
- **Type**: Tab within PR-03, read-only
- **Purpose**: Every past and current approval round, every step's decision, actor, and reason — permanently preserved, including earlier rejected rounds.
- **Columns**: round_number, per-round: submitted_by/at, outcome, and a per-step decision list (step, decision, actor, decided_at, reason)
- **APIs**: nested in the same `GET` response as PR-03 (`approval_rounds` field) — no separate endpoint

### PR-05 — Approve / Reject Decision Dialog
- **Type**: Confirm dialog (with a required text field for reject)
- **Purpose**: Capture the decision and, for reject, a mandatory non-blank reason.
- **Fields**: Approve — none beyond confirmation; Reject — rejection_reason (required)
- **Hidden system fields sent automatically**: expected_version, expected_round, expected_step (all read from the currently-open PR-03 screen, never user-entered)
- **Error states surfaced in this dialog**: 400 "cannot decide your own request"; 400 "already decided a step this round" (provisional rule); 409 "round/step has moved on, refetch"

---

## Module: Purchase Orders

Company-scoped. Every screen requires active company membership with
`purchase_orders.view` at minimum.

### PO-01 — Purchase Orders List
- **Type**: Full page
- **Columns**: reference, status (DRAFT/ISSUED/CANCELLED), supplier, currency_code, subtotal, expected_delivery_date
- **Filters**: `?search=`, `?status=`, paginated
- **Actions**: row click → PO-02
- **APIs**: `GET /api/v1/companies/<id>/purchase-orders/`

### PO-02 — Create Purchase Order
- **Type**: Full page
- **Entry point**: only reachable from an **APPROVED** Purchase Request (PR-03) — "Create Purchase Order" button appears there once approved, and only if no other active (non-cancelled) order already exists for it
- **Fields**: supplier (picker, SUP-01 data), currency_code (required, 3-letter code — not validated against a real currency list), expected_delivery_date (optional at draft), notes
- **Note**: line items are **not** entered here — they are copied automatically, verbatim, from the approved request's final round; only unit price is editable, and only after creation
- **Permissions**: `purchase_orders.view` + `purchase_orders.create`, plus `purchase_requests.view` on the source request
- **APIs**: `POST /api/v1/companies/<id>/purchase-orders/`

### PO-03 — Purchase Order Detail
- **Type**: Full page, with tabs
- **Tabs**: Lines (unit price editable while DRAFT only), Issue Snapshot (PO-04, appears only once ISSUED)
- **Buttons, by status**:
  - DRAFT: Edit (supplier/delivery date/notes/line prices), Issue (PO-05), Cancel
  - ISSUED: fully read-only — no edit, no cancel, no reopen exists for an issued order anywhere in this system
  - CANCELLED: read-only; a **new** order can be created against the same source request instead (there is no "reopen a cancelled order" action)
- **Computed field shown**: subtotal (pre-tax only — sum of line amounts, ROUND_HALF_UP to 2 decimals; no tax/discount/freight/invoice total anywhere)
- **States**: 404/403/400/409 — same pattern as PR-03
- **APIs**: `GET/PATCH /api/v1/companies/<id>/purchase-orders/<oid>/`, `POST .../cancel/`, `POST .../issue/`

### PO-04 — Issue Snapshot (Tab)
- **Type**: Tab within PO-03, read-only, appears only after issuing
- **Purpose**: The permanent, immutable record captured at the moment of issuing — company/supplier identity and contact details, every line's material/unit/quantity/price/amount, currency, subtotal, delivery date, notes — frozen even if the live supplier or material record changes later.
- **APIs**: nested in the same `GET` response (`issue_snapshot` field, `null` until issued) — no separate endpoint

### PO-05 — Issue Confirmation Dialog
- **Type**: Confirm dialog
- **Purpose**: Explain, before the irreversible action, that issuing is final (no edit/reopen after) and is not proof of supplier contact or acceptance.
- **Error states surfaced here**: 400 for any of — a line still priced at zero, an unsupported currency, an expected delivery date in the past, a supplier/material/unit/category that has since become inactive, or the source request no longer being APPROVED/same-company; 409 for a stale version
- **APIs**: `POST .../issue/`

---

## Module: Goods Receiving

Store-scoped. Every screen requires **both** active store membership with
the relevant `receiving.*` permission **and** active company membership
with `purchase_orders.view` in the source order's own company — neither
substitutes for the other (see `docs/erp-handoff-open-decisions.md`).

### GR-01 — Goods Receipts List
- **Type**: Full page
- **Columns**: reference, status (DRAFT/POSTED/CANCELLED), source PO reference, arrived_at, delivery_note_reference
- **Filters**: paginated (no dedicated search/status filter param beyond what the view supports — confirm against the live endpoint before building one)
- **Explicitly never shown here**: price, currency, or any commercial total — this module carries no commercial data at all
- **APIs**: `GET /api/v1/stores/<sid>/goods-receipts/`

### GR-02 — Create Goods Receipt
- **Type**: Full page
- **Purpose**: Record a physical delivery against an issued Purchase Order.
- **Step 1 (embedded picker, not a separate top-level screen)**: choose an eligible Purchase Order — see GR-06 below
- **Fields**: arrived_at (required, must not be in the future at posting time), delivery_note_reference (optional), notes (optional), idempotency_key (optional — a client-generated key that makes a repeated "Submit" click on a flaky connection safe; same key + identical content returns the original receipt instead of creating a duplicate; same key + different content is a conflict), lines (source PO line, received_quantity, optional lot_reference — multiple lines may reference the same PO line, supporting multiple lots)
- **Permissions**: `receiving.view` + `receiving.create` (store) + `purchase_orders.view` (company)
- **APIs**: `POST /api/v1/stores/<sid>/goods-receipts/`

### GR-03 — Goods Receipt Detail
- **Type**: Full page
- **Buttons, by status**:
  - DRAFT: Edit (full line replace, same convention as create), Post (GR-05), Cancel (GR-07)
  - POSTED: fully read-only, permanently — **there is no correction, reversal, or amendment path for a posted receipt anywhere in this system today** (a real limitation, not a UI omission — see open decisions)
  - CANCELLED: read-only, terminal
- **States**: 404 (fails either the store or the company access check — the two are indistinguishable in the response, by design, so a caller can never learn a receipt exists in a company they can't see), 403 (has store membership but lacks the specific store-level permission), 400/409 as elsewhere
- **APIs**: `GET/PATCH /api/v1/stores/<sid>/goods-receipts/<rid>/`, `POST .../post/`, `POST .../cancel/`

### GR-04 — Delivery Progress (embedded, not a standalone screen)
- **Type**: Data embedded within GR-06's picker (per eligible order line)
- **Purpose**: Shows ordered / received / remaining quantity and a NOT_RECEIVED / PARTIALLY_RECEIVED / FULLY_RECEIVED badge per order line, computed fresh from posted receipts only — never a stored field, never implies QC acceptance.

### GR-05 — Post Confirmation Dialog
- **Type**: Confirm dialog
- **Purpose**: Warn that posting is (a) permanent — a posted receipt cannot later be edited or cancelled, and (b) checked against the remaining ordered quantity across **every** store and every other receipt for that line — even a 1-unit over-delivery is rejected outright, with no tolerance.
- **Error states surfaced here**: 400 (over-receipt, no lines, future arrival date), 409 (stale version)
- **APIs**: `POST .../post/`

### GR-06 — Eligible Purchase Orders Picker
- **Type**: Modal (or an embedded step inside GR-02)
- **Purpose**: Show only ISSUED purchase orders the current user may receive against (both access checks applied), each annotated with its per-line delivery progress (GR-04). **Deliberately excludes price, currency, and subtotal** — a receiving clerk never sees commercial terms here.
- **APIs**: `GET /api/v1/stores/<sid>/goods-receipts/eligible-purchase-orders/`

### GR-07 — Cancel Confirmation Dialog
- **Type**: Confirm dialog
- **Fields**: cancellation_reason (required)
- **Restriction**: only ever offered for a DRAFT receipt — the button must not appear once POSTED
- **APIs**: `POST .../cancel/`

---

## Module: Incoming QC Inspection (Draft-Only)

Store-scoped, same as Goods Receiving, but with a narrower company-access
rule: every screen requires **both** active store membership with the
relevant `incoming_qc.*` permission **and** active company membership
(bare membership only — **no** `purchase_orders.view` required, unlike
Goods Receiving) in the receipt line's own company. This module records
manually-entered inspection observations only — it has **no**
accept/reject/release action anywhere; see `docs/incoming-qc-proposal.md`.

### QC-01 — Incoming QC Inspections List
- **Type**: Full page
- **Purpose**: Browse a store's QC inspection drafts.
- **Backend status**: IMPLEMENTED
- **Columns**: reference, status (DRAFT/CANCELLED), source receipt reference, material, inspection_date
- **Filters**: paginated; supports `?status=`, `?receipt=<goods_receipt_id>`, `?material=<material_id>`
- **Actions**: "New inspection" → QC-03, row click → QC-02
- **States**: 404 if store/company access fails; empty (no inspections yet)
- **APIs**: `GET /api/v1/stores/<sid>/incoming-inspections/`

### QC-02 — Incoming QC Inspection Detail
- **Type**: Full page, with tabs
- **Tabs**: Observations (editable while DRAFT only)
- **Buttons, by status**: DRAFT — Edit observations, Submit (requires `incoming_qc.submit`, confirm dialog warning submission is permanent and requires ≥1 observation), Cancel (QC-05); SUBMITTED — fully read-only, terminal for this task (no edit, no cancel, no correction/retest exist yet — hide, don't just disable, the Edit/Cancel affordances); CANCELLED — fully read-only, terminal (a new draft may be created against the same line instead)
- **Explicitly absent from this screen**: any Accept/Reject/Release button — no such action exists anywhere in this system today; see `docs/incoming-qc-review-proposal.md` for the design of that later, unimplemented work
- **States**: 404 (fails either the store or the company access check, indistinguishably — mirrors Goods Receiving's own company-axis behavior); 403 (store member missing the specific permission); 400 (submitting with zero observations, or any write attempt on a non-DRAFT inspection); 409 as elsewhere
- **APIs**: `GET/PATCH /api/v1/stores/<sid>/incoming-inspections/<iid>/`, `POST .../submit/`, `POST .../cancel/`

### QC-03 — Create Incoming QC Inspection Draft
- **Type**: Full page
- **Entry point**: only reachable by picking a line from QC-04's eligible-lines picker
- **Fields**: inspection_date (optional; must not predate the receipt's own arrival date, and not be in the future), notes (optional), observations (optional list: parameter_name required per row, method_reference/result/result_unit/remarks all optional)
- **Permissions**: `incoming_qc.view` + `incoming_qc.create` (store) + bare company membership
- **Validation**: 400 if the source receipt is not POSTED; 409 if an active inspection already exists for that line
- **APIs**: `POST /api/v1/stores/<sid>/incoming-inspections/`

### QC-04 — Eligible Receipt Lines Picker
- **Type**: Modal (or an embedded step inside QC-03)
- **Purpose**: Show only POSTED receipt lines, in accessible companies, that do not already have an active inspection. **Deliberately excludes price, currency, and any commercial field** — same promise as GR-06.
- **APIs**: `GET /api/v1/stores/<sid>/incoming-inspections/eligible-receipt-lines/`

### QC-05 — Cancel Confirmation Dialog
- **Type**: Confirm dialog
- **Fields**: cancellation_reason (required)
- **Restriction**: only ever offered for a DRAFT inspection
- **APIs**: `POST .../cancel/`

> **Planned extension (not implemented — Task 09B-2 design only):**
> QC-06 (Work Queue), QC-07 (Review tab additions), QC-08 (Review and
> Quantity Decision), QC-09 (History & Retest Rounds) are proposed in
> full in `docs/incoming-qc-review-proposal.md` §6. None of these
> screens or their APIs exist yet.

---

## Module: Material Specifications (Draft/Versioning Foundation)

Global, active-superuser-only, in both directions — no read exception
like the shared catalog has, no store/company scoping at all. Managing a
draft here confers **no** QC/QA operational authority — this module is
entirely separate from the Incoming QC Inspection module above, and
nothing created here is ever attached to an `IncomingInspection`. Every
version is permanently `DRAFT` — there is no approve/publish/release
action anywhere in this module; see `docs/incoming-qc-review-
proposal.md` for the still-unimplemented workflow that would eventually
use this data, and `docs/erp-handoff-open-decisions.md` for the
unresolved future-access/approval-authority questions.

### SPEC-01 — Material Specifications List
- **Type**: Full page
- **Purpose**: Browse the material specification directory.
- **Backend status**: IMPLEMENTED
- **Columns**: code, name, material, latest_revision_number, created_by, created_at
- **Filters**: `?search=` (code/name), `?material=<id>`, paginated
- **Actions**: "New specification" → SPEC-04 (create modal), row click → SPEC-02
- **States**: 403 (non-superuser); empty (no specifications yet)
- **APIs**: `GET /api/v1/material-specifications/`

### SPEC-02 — Specification Detail
- **Type**: Full page, with tabs
- **Tabs**: Metadata (name/description, editable), Versions (list of this specification's revisions, each showing status/reference_document/created_at — row click → SPEC-03)
- **Buttons**: Edit metadata (uses the specification's own `version` field for `expected_version`, **corrected in Task 09B-3B.1** — the original implementation shipped this unversioned, which was a real gap relative to the task's own requirement; this token is entirely separate from any `MaterialSpecificationVersion.version` shown on the Versions tab — never send one where the other belongs), "New draft version" (SPEC-05 confirm, → creates and opens SPEC-03)
- **Explicitly absent**: any Approve/Publish/Release button, any "current active version" indicator — no such concept exists
- **States**: 403 (non-superuser); 404 (unknown id); 409 (stale `expected_version` on metadata edit — refetch and show, never silently retry, per the same rule every other versioned resource in this system follows)
- **APIs**: `GET/PATCH /api/v1/material-specifications/<id>/`, `GET /api/v1/material-specifications/<id>/versions/`

### SPEC-03 — Draft Version Editor
- **Type**: Full page
- **Purpose**: Edit one draft revision's reference document, notes, and test rows.
- **Fields**: reference_document (optional), notes (optional), tests (table: parameter_name required per row, method_reference/unit_label/acceptance_criteria all optional — full-replace on save, same convention as QC-02's observations)
- **Permissions**: active superuser
- **Validation**: parameter_name and result_type (NUMERIC/TEXT) required per test row; only a DRAFT-status version can be edited (structurally always true today)
- **Explicitly absent from this screen**: any pass/fail indicator, any numeric-limit operator input, any "this test currently has no approved specification" warning tied to QC — `acceptance_criteria` is plain descriptive text only
- **Version handling**: uses the version's own `version` field for `expected_version` — **not** `revision_number`, which never changes for this row
- **States**: 404 (version doesn't belong to this specification, or specification unknown); 400 (validation); 409 (stale `expected_version` — refetch and show, never silently retry)
- **APIs**: `GET/PATCH /api/v1/material-specifications/<sid>/versions/<vid>/`

### SPEC-04 — Create Specification (Modal)
- **Type**: Modal
- **Fields**: material (picker, from the existing Materials list), code, name, description (optional)
- **Behavior**: creates the specification and its empty revision-1 draft atomically; the material must be active
- **APIs**: `POST /api/v1/material-specifications/`

### SPEC-05 — New Draft Version Confirmation
- **Type**: Confirm dialog (optionally with reference_document/notes fields)
- **Purpose**: Start a new, empty draft revision on an existing specification.
- **Behavior**: `revision_number` is server-allocated (next in sequence); test rows are never entered here — the dialog closes into SPEC-03 to add them
- **APIs**: `POST /api/v1/material-specifications/<sid>/versions/`

---

## Module: Customers (Task 10A — Company-Scoped Customer Master)

Company-scoped throughout. Every screen requires active company
membership with `customers.view` at minimum. **This is an identity/
contact directory only** — no quotation, sales order, invoice, customer
portal, GST/PAN, credit limit, payment terms, or customer-qualification
concept exists anywhere in this module, and none of those screens exist
yet (see PLAN-01, which still refers to a future order-capture screen
this module does not implement). Company-scoping itself is a working
implementation choice for this task, not a claim of client-confirmed
customer-ownership policy — see `docs/erp-handoff-open-decisions.md`.

### CUST-01 — Customers List
- **Type**: Full page
- **Purpose**: Browse a company's customer directory.
- **Backend status**: IMPLEMENTED
- **Columns**: code, name, contact_person, email, phone, is_active
- **Filters**: `?search=` (code/name/contact_person/email/phone), `?is_active=` (strict `true`/`1`/`false`/`0`, 400 on anything else), paginated (20/page, `?page_size=` up to 100)
- **Default ordering**: code ascending, then id — deterministic, not user-configurable in this task
- **Row appearance**: an inactive customer's row is visually muted/badged "Inactive" but still shown by default (no default `is_active` filter is applied — the list shows both active and inactive unless the user explicitly filters)
- **Actions**: "New customer" → CUST-02 (create modal, requires `customers.create`), row click → CUST-03
- **States**: 404 (no company access); empty (no customers yet, or none matching the current filter)
- **APIs**: `GET /api/v1/companies/<id>/customers/`

### CUST-02 — Create Customer (Modal)
- **Type**: Modal
- **Fields**: code (required, normalized to trimmed/upper-case, immutable after creation), name (required), contact_person (optional), email (optional, validated only when supplied), phone (optional, free text — no country-specific format validation, preserve exactly as typed including any "+" prefix), billing_address (optional, plain text), shipping_address (optional, plain text — **never pre-filled from billing_address**, the two are independent), notes (optional)
- **Permissions**: `customers.view` + `customers.create`
- **Validation**: code/name required (400 if blank); malformed email (400); a duplicate code within this company (**409**, not 400 — same "refetch/search for the existing one" reasoning used for `/api/v1/material-specifications/`); a code already used by a different company is fine and creates successfully (uniqueness is per-company only)
- **Important caveat to show in the UI**: a customer's code is reserved permanently once assigned, even after that customer is deactivated — deactivating a customer does **not** free its code for reuse within the same company
- **Navigates to**: CUST-03 on success
- **APIs**: `POST /api/v1/companies/<id>/customers/`

### CUST-03 — Customer Detail / Edit
- **Type**: Full page
- **Fields editable**: name, contact_person, email, phone, billing_address, shipping_address, notes — **not** code or company (both permanently immutable after creation, 400 if either is present in a PATCH body at all)
- **Permissions**: `customers.view` to open, + `customers.edit` to save
- **Important caveat to show in the UI**: metadata (name/contact/addresses/notes) can still be corrected here even while the customer itself is inactive, as long as the company is active — deactivation is not a lock on the record, only on future business use (which this task does not implement)
- **Version handling**: every `PATCH` must send the `version` last read from this screen as `expected_version` — see `docs/frontend-api-handoff.md` §"Handling 409" for the required refetch-and-show-conflict behavior; omitting `expected_version` is a 400, not a silent default
- **Clearing an optional field**: send it as an explicit empty string (`""`) — omitting a field entirely leaves it unchanged, sending `""` clears it
- **Actions**: Deactivate button (if active, requires `customers.deactivate`) / Activate button (if inactive, requires `customers.activate`) → CUST-04
- **States**: 404 (no company access, or customer not found/belongs to a different company); 400 (validation, or an attempt to change code/company); 409 (stale `expected_version` — refetch and show, never silently retry)
- **APIs**: `GET/PATCH /api/v1/companies/<id>/customers/<cid>/`

### CUST-04 — Activate / Deactivate Confirmation
- **Type**: Confirm dialog
- **Purpose**: Confirm the lifecycle change before submitting it.
- **Fields**: none beyond confirmation — **no reason/comment field**, unlike purchase order/request cancellation, which do require one
- **Hidden system field sent automatically**: `expected_version`, read from the currently-open CUST-03 screen, never user-entered
- **Behavior**: deactivating never deletes the record or any of its data, and never cascades to anything else — there is no `DELETE` endpoint anywhere in this module; a repeat deactivate/activate call at the customer's current version is treated as a no-op success (idempotent retry), not an error
- **Error states surfaced in this dialog**: 409 "this customer has changed since it was last read — refetch and retry" (stale `expected_version`)
- **APIs**: `POST /api/v1/companies/<id>/customers/<cid>/activate/`, `POST /api/v1/companies/<id>/customers/<cid>/deactivate/`

---

## Module: Products (Task 10B — Company-Scoped Product Master)

Company-scoped throughout. Every screen requires active company
membership with `products.view` at minimum. **This is a minimal
saleable-product identity record only** — no formula/BOM, dosage/
potency/medical-claim field, pack-size calculation, batch numbering,
default price/tax/HSN/GST rule, shelf-life calculation, or
opening-stock/stock-ownership concept exists anywhere in this module,
and creating a product never creates or links a `Material` or any
inventory record — a saleable product and a purchasable/stockable
material are two entirely separate identities in this codebase.
Company-scoping itself is a provisional implementation choice for this
task, not a client-confirmed policy — see `docs/erp-handoff-open-
decisions.md`.

### PROD-01 — Products List
- **Type**: Full page
- **Purpose**: Browse a company's saleable product directory.
- **Backend status**: IMPLEMENTED
- **Columns**: code, name, product_type, sales_uom_code, is_active
- **Filters**: `?search=` (code/name), `?is_active=` (strict `true`/`1`/`false`/`0`, 400 on anything else), paginated
- **Actions**: "New product" → PROD-02 (create modal), row click → PROD-03
- **States**: 404 if the company itself is inaccessible (no membership); empty (no products yet)
- **APIs**: `GET /api/v1/companies/<id>/products/`

### PROD-02 — Create Product (Modal)
- **Type**: Modal
- **Fields**: code (required, normalized to trimmed/upper-case, immutable after creation), name (required), product_type (optional, free text — Task 12B-1, e.g. "Tablets"; not a fixed choice list, do not hard-code options), description (optional), sales_uom (required picker from the existing shared Units list — `apps.catalog.UnitOfMeasure` — **must be active**, and is **immutable after creation**)
- **Permissions**: `products.view` + `products.create`
- **Validation**: code/name/sales_uom_id required (400 if missing); an inactive sales_uom is rejected (400, "Sales unit of measure is inactive"); an unknown sales_uom_id is 404; a duplicate code within this company is **409**, not 400 (same "refetch/search for the existing one" reasoning used for Customers and Material Specifications); a code already used by a different company is fine and creates successfully (uniqueness is per-company only)
- **Important caveat to show in the UI**: a product's code is reserved permanently once assigned, even after that product is deactivated — deactivating a product does **not** free its code for reuse within the same company. The sales unit chosen here can never be changed later — pick carefully, since there is no unit-conversion feature to fix a wrong choice.
- **Navigates to**: PROD-03 on success
- **APIs**: `POST /api/v1/companies/<id>/products/`

### PROD-03 — Product Detail / Edit
- **Type**: Full page
- **Fields editable**: name, product_type (free text, Task 12B-1), description — **not** code, company, or sales_uom (all three permanently immutable after creation, 400 if any is present in a PATCH body at all)
- **Permissions**: `products.view` to open, + `products.edit` to save
- **Important caveat to show in the UI**: metadata (name/description) can still be corrected here even while the product itself is inactive, as long as the company is active — deactivation is not a lock on the record. **If the product's sales unit has since become inactive** (a real possibility — deactivating a `UnitOfMeasure` is not currently blocked by an active product referencing it, unlike how it is blocked for an active `Material`), the screen must still show the unit's own code/name exactly as before (never hidden or replaced) with a visible "inactive unit" indicator — the API always returns `sales_uom_is_active` for exactly this purpose.
- **Version handling**: every `PATCH` must send the `version` last read from this screen as `expected_version` — see `docs/frontend-api-handoff.md` §"Handling 409" for the required refetch-and-show-conflict behavior; omitting `expected_version` is a 400, not a silent default
- **Clearing description**: send it as an explicit empty string (`""`) — omitting the field leaves it unchanged
- **Actions**: Deactivate button (if active, requires `products.deactivate`) / Activate button (if inactive, requires `products.activate`) → PROD-04
- **States**: 404 (no company access, or product not found/belongs to a different company); 400 (validation, or an attempt to change code/company/sales_uom); 409 (stale `expected_version` — refetch and show, never silently retry)
- **APIs**: `GET/PATCH /api/v1/companies/<id>/products/<pid>/`

### PROD-04 — Activate / Deactivate Confirmation
- **Type**: Confirm dialog
- **Purpose**: Confirm the lifecycle change before submitting it.
- **Fields**: none beyond confirmation — no reason/comment field
- **Hidden system field sent automatically**: `expected_version`, read from the currently-open PROD-03 screen, never user-entered
- **Behavior**: deactivating never deletes the record or any of its data, and never cascades — there is no `DELETE` endpoint anywhere in this module; a repeat deactivate/activate call at the product's current version is treated as a no-op success (idempotent retry), not an error. **Reactivating a product whose sales unit has since become inactive is rejected (400)** — the unit must itself be reactivated first (a separate action, elsewhere in the Units screens), since a product cannot be made active again while pointing at a currently-unusable sales unit.
- **Error states surfaced in this dialog**: 409 "this product has changed since it was last read — refetch and retry" (stale `expected_version`); 400 "Sales unit of measure is inactive" (reactivation blocked)
- **APIs**: `POST /api/v1/companies/<id>/products/<pid>/activate/`, `POST /api/v1/companies/<id>/products/<pid>/deactivate/`

---

## Module: Quotations (Task 10C — Company-Scoped Quotation Drafts)

Company-scoped. Every screen requires active company membership with
`quotations.view` at minimum. **Drafting only**: there is no Send,
Approve, Accept, Reject, Revise, Convert-to-Sales-Order or PDF action
anywhere — do not render any such button. No tax, discount, freight or
grand total exists; the only total is a pre-tax `subtotal` in the
quotation's single currency. Company-scoping and the reference format
are provisional working choices — see `docs/erp-handoff-open-decisions.md`
§A15.

**Lookup dependencies** (selecting data): the customer picker uses
`GET /api/v1/companies/<id>/customers/?is_active=true` (needs
`customers.view`) and the product picker uses
`GET /api/v1/companies/<id>/products/?is_active=true` (needs
`products.view`, and each product already carries `sales_uom_code`/
`sales_uom_is_active`). These are **view** permissions, not edit
permissions; no master-edit permission is needed to select data. A user
holding `quotations.create` but neither view permission cannot populate
the pickers — grant them together in the role.

### QUOT-01 — Quotations List
- **Type**: Full page
- **Backend status**: IMPLEMENTED
- **Columns**: reference, customer_name, quotation_date, valid_until, currency, subtotal, status (always DRAFT)
- **Filters**: `?search=` (reference or customer name), `?customer=<id>`, `?quotation_date_from=YYYY-MM-DD`, `?quotation_date_to=YYYY-MM-DD` (inclusive; invalid values and from-after-to are 400), paginated (20/page, up to 100)
- **Ordering**: newest first (`-created_at`, `-id`), fixed
- **Actions**: "New quotation" → QUOT-02 (requires `quotations.create`), row click → QUOT-03
- **States**: 404 (no company access); 403 (no `quotations.view`); empty
- **APIs**: `GET /api/v1/companies/<id>/quotations/`

### QUOT-02 — Create / Edit Draft
- **Type**: Full page (line editor)
- **Header fields**: customer (required, active, same company), quotation_date (required), valid_until (optional, not before quotation_date; send `null` to clear), currency (required 3-letter code, **immutable after creation**), notes (optional)
- **Line fields**: product (active, same company, active sales unit), quantity (positive, max 3 decimals; whole numbers only for COUNT units), unit_price (≥ 0, max 4 decimals; zero allowed), description (optional). Read-only, server-calculated: line_number, sales unit (code/name snapshot), line_amount, subtotal
- **Permissions**: create = `quotations.view` + `quotations.create`; edit = `quotations.view` + `quotations.edit`
- **Edit semantics**: PATCH must send `expected_version`. If `lines` is sent it is the **complete final list** (entries with `id` keep/change that line, entries without `id` are new, missing lines are removed, `[]` removes all; omit `lines` to leave them). Line order = submitted order. An unchanged line whose product/unit has since been deactivated may stay or be removed but cannot be changed; new/changed lines need active product and unit
- **Inactive references**: show `product_is_active`/`sales_uom_is_active`/`customer_is_active` flags as "inactive" badges; never hide or replace the stored code/name
- **States**: 400 field-keyed validation; 404 unknown/cross-company customer or product; 409 stale version (refetch, show, never silently retry)
- **APIs**: `POST /api/v1/companies/<id>/quotations/`, `PATCH /api/v1/companies/<id>/quotations/<qid>/`

### QUOT-03 — Quotation Detail
- **Type**: Full page, read-only view with an "Edit draft" action (requires `quotations.edit`)
- **Shows**: reference, status DRAFT, customer, dates, currency, notes, lines table (product code/name, sales unit, quantity, unit price, line amount), `subtotal` (labelled "Subtotal", never "Total"), version
- **Explicitly absent**: Send/Approve/Accept/Convert buttons, tax lines, PDF/print
- **APIs**: `GET /api/v1/companies/<id>/quotations/<qid>/`

---

## Module: Direct Sales Orders (Task 10D — Company-Scoped Draft Foundation)

Company-scoped. Every screen requires active company membership with
`sales_orders.view` at minimum. **A draft authorizes nothing, and a CONFIRMED order (Task 10F) authorizes no manufacturing, stock
reservation or invoice either.** Do **not** show Confirm, Cancel, Manufacture,
Reserve, Invoice, Dispatch, Convert-from-Quotation or PDF actions - none
exist. Only a pre-tax `subtotal` is returned; no tax-inclusive total.
Scoping, reference format and the delivery-date rule are working defaults
for client review (`docs/erp-handoff-open-decisions.md` §A16).

**Lookup dependencies**: customer picker = `GET /api/v1/companies/<id>/
customers/?is_active=true` (`customers.view`); product picker =
`GET /api/v1/companies/<id>/products/?is_active=true` (`products.view`).
The operational role needs `customers.view` and `products.view` alongside
`sales_orders.*`; permissions are never granted automatically.

### SO-01 — Sales Orders List
- **Type**: Full page
- **Backend status**: IMPLEMENTED
- **Columns**: reference, customer_name, customer_order_reference, order_date, requested_delivery_date, currency, subtotal, status (always DRAFT)
- **Filters**: `?search=` (order reference, customer name or customer order reference), `?customer=<id>`, `?order_date_from=` / `?order_date_to=` (YYYY-MM-DD, inclusive; bad values or from > to are 400), paginated (20/page, up to 100)
- **Ordering**: newest first (`-created_at`, `-id`), fixed
- **Actions**: "New order" → SO-02 (`sales_orders.create`), row → SO-03
- **APIs**: `GET /api/v1/companies/<id>/sales-orders/`

### SO-02 — Create / Edit Direct Order Draft
- **Type**: Full page (line editor)
- **Header**: customer (required, active), order_date (required), requested_delivery_date (optional, not before order_date - working rule; `null` clears), customer_order_reference (optional text, **not unique**), currency (required 3 letters, **immutable after creation**), notes
- **Lines**: product (active, same company, active sales unit), quantity (>0, max 3 decimals, whole numbers for COUNT units), unit_price (≥0, max 4 decimals, zero allowed), description. Read-only: line_number, sales unit snapshot, line_amount, subtotal, reference, status, version
- **Edit semantics**: `expected_version` required; `lines` present = complete final list (id = update, none = new, missing = removed, `[]` = none); omit `lines` to leave unchanged. Unchanged lines whose product/unit is now inactive may stay or be removed but not changed
- **States**: 400 field-keyed; 404 unknown/cross-company customer or product; 409 stale version (refetch, show, never silently retry)
- **APIs**: `POST` / `PATCH /api/v1/companies/<id>/sales-orders/[<oid>/]`

### SO-03 — Sales Order Detail
- **Type**: Full page, read-only with "Edit draft" (`sales_orders.edit`)
- **Shows**: all header fields, lines with snapshots and `product_is_active`/`sales_uom_is_active`/`customer_is_active` "inactive" badges, `subtotal` labelled "Subtotal"
- **APIs**: `GET /api/v1/companies/<id>/sales-orders/<oid>/`

### SO-04 — Order Review Panel (Task 10E, updated Task 10F)
- **Type**: Panel/drawer opened from SO-03
- **Backend status**: IMPLEMENTED (`GET .../confirmation-preview/`, `POST .../confirm/`)
- **Layout**: (1) **Order / customer summary** - reference, status badge, `order.version` kept in **frontend state** (never an editable field), customer with an "inactive" badge, currency, dates, customer order reference; (2) **Line totals** - stored snapshot code/name/unit, quantity, unit price, line amount (live master state from `lines[].current` only as badges such as "product now inactive"), pre-tax **Subtotal**; (3) **Items needing attention** - `confirmation.blocking_reasons` grouped by `category` in plain words, line-level items linking to the line; `informational_observations` as subtle notes; (4) **Actions** - "Edit draft" → SO-02 (`sales_orders.edit`), "Refresh review", and **Confirm** (below)
- **States**:
  - *Policy not configured / incomplete* (`policy.status` != CONFIGURED): show `policy_message` ("Confirmation rules are not configured. Contact your administrator.") - never internal policy questions; Confirm disabled
  - *Blocked*: list the blocking reasons; Confirm disabled
  - *Ready*: `ready_to_attempt` true (draft, viewer holds `sales_orders.confirm`, no blocking reason found now) → Confirm enabled. A viewer without `sales_orders.confirm` sees the review but **no Confirm button**
  - *Already confirmed*: read-only (see SO-03), Confirm hidden
  - loading, 403/404 with retry
- **Not a guarantee**: show `generated_at` and a "may be out of date" note; the server re-checks on confirm
- **APIs**: `GET /api/v1/companies/<id>/sales-orders/<oid>/confirmation-preview/`

### SO-05 — Confirm Order Dialog (Task 10F)
- **Type**: Confirm dialog from SO-04
- **Content**: order reference, customer, subtotal, and the text "Confirming records the order as confirmed. It does not reserve stock, start production or create an invoice." No extra fields; `expected_version` is sent from state, never typed
- **Result**: `200` → SO-03 confirmed (read-only); repeat clicks at the new version are harmless
- **Failure states**: `409` "This order changed since you reviewed it" → refetch order and review, show what changed, do not auto-retry; `400` with `blocking_reasons` → show the reasons (policy-not-configured shows the plain administrator message); `403` "You no longer have permission to confirm"; `404`
- **APIs**: `POST /api/v1/companies/<id>/sales-orders/<oid>/confirm/` `{"expected_version": n}`

### SO-06 — Sales Order Confirmation Policy (superuser administration, Task 10F)
- **Type**: Full page in Superuser Administration, per company
- **Fields**: three explicit yes/no answers - allow self-confirmation, allow zero-price lines, allow past requested delivery dates - each shown as Yes / No / **Not answered**; status badge (Not configured / Incomplete / Configured), version, last changed by/at
- **Behavior**: Save sends only changed answers with `expected_version` (0 when never configured); no default answers; `409` → refetch and show. A note that configuring the rules does not grant confirmation authority (that is the separate `sales_orders.confirm` permission)
- **Permissions**: active superuser only
- **APIs**: `GET/PATCH /api/v1/companies/<id>/sales-order-confirmation-policy/`

SO-03 (Sales Order Detail) when `status` is CONFIRMED: read-only - no Edit draft; show confirmed by/at and the recorded policy values/version; inactive-master badges never hide the stored snapshots.

---

## Module: Manufacturing Formulas (Task 11A — Company-Scoped Draft Foundation)

Company-scoped. Every screen requires active company membership with
`formulas.view` at minimum. **Preparation only**: do not show Approve,
Create Batch, Issue Material, Reserve, Produce, Scale or Convert actions -
none exist. There is no approval, default-formula selection, proportional
scaling, unit conversion, percentage, yield or waste logic. Company
scoping and simple quantity-based drafting are working implementation
choices, not client-approved manufacturing policy
(`docs/erp-handoff-open-decisions.md` §A17).

**Lookup dependencies**: product picker = `GET /api/v1/companies/<id>/
products/?is_active=true` (`products.view`). Material picker = the
existing shared catalog `GET /api/v1/materials/?is_active=true&kind=RAW_MATERIAL`
(or `PACKAGING_MATERIAL`), which requires **`shared_catalog.view` in at
least one active store** (or an active superuser) - it is *not* company
scoped. **Concrete gap**: a user with only company-level `formulas.*` and
`products.view` cannot populate the material picker; a store role
holding `shared_catalog.view` must also be granted. The global material
access policy was not broadened; the server itself validates material ids
on save.

### FRM-01 — Formulas List
- **Type**: Full page
- **Columns**: code, name, product_code/product_name, latest_revision_number
- **Filters**: `?search=` (code/name), `?product=<id>`, paginated; ordering code, id
- **Actions**: "New formula" → FRM-03 (`formulas.create`), row → FRM-02
- **APIs**: `GET /api/v1/companies/<id>/formulas/`

### FRM-02 — Formula Detail (with Revisions tab)
- **Type**: Full page, two tabs
- **Metadata tab**: code, product (read-only, immutable), name and notes editable (`formulas.edit`, `expected_version` = **formula `version`**)
- **Revisions tab**: revision_number, status (always DRAFT), base output + unit, line_count, updated_at; row → FRM-04; "New draft revision" → FRM-05. Show `latest_revision_number` read-only; it is a server counter, never sent
- **APIs**: `GET/PATCH /api/v1/companies/<id>/formulas/<fid>/`, `GET .../revisions/`

### FRM-03 — Create Formula (Modal)
- **Fields**: product (active, active sales unit), code (normalized, immutable), name, base_output_quantity (>0, max 3 decimals; whole number if the product's sales unit is COUNT), notes, revision_notes. The output unit is shown read-only (= product's sales unit)
- **Result**: formula + empty revision 1, then open FRM-04. Duplicate code in the company → 409. Multiple formulas per product are allowed; none is implied to be the default
- **APIs**: `POST /api/v1/companies/<id>/formulas/`

### FRM-04 — Draft Revision Editor
- **Type**: Full page
- **Layout**: (1) summary: product and base output quantity + read-only output unit; (2) **Raw Materials** table; (3) **Packaging Materials** table; (4) Notes; (5) **Save Draft**
- **Both tables belong to one revision and are saved atomically** with a single `PATCH` whose `lines` is the complete final collection of both tables together (split client-side by `material_type`; do not send `material_type`, unit, or line_number - all derived/rejected). Entry with `id` = update, without = new, missing = removed; `[]` clears; omit `lines` to leave unchanged
- **Line fields**: material (active, active base unit; raw table lists RAW_MATERIAL, packaging table PACKAGING_MATERIAL), quantity (>0, max 3 decimals, whole numbers for COUNT base units), notes. Unit, code/name/type snapshots and live `material_is_active`/`unit_is_active` flags are read-only; show inactive badges and never hide the stored snapshot
- **Editing inactive references**: unchanged lines with a since-deactivated material/unit stay and can be removed; changing their material, quantity or notes is rejected (400)
- **Base output**: editable; changing it never rescales lines
- **Version**: `expected_version` = **revision content `version`** (not formula version, not revision_number). 409 → refetch and show, never silently retry
- **Absent**: Approve, Create Batch, Issue Material
- **APIs**: `GET/PATCH /api/v1/companies/<id>/formulas/<fid>/revisions/<rid>/`

### FRM-05 — New Draft Revision (Modal)
- **Fields**: base_output_quantity, notes. Creates an empty revision; number allocated by the server. Requires `formulas.create`; product and its sales unit must still be active
- **APIs**: `POST /api/v1/companies/<id>/formulas/<fid>/revisions/`

### FRM-06 — Calculate Requirements (Task 11D, read-only panel on the revision editor)
- **Type**: Panel/tab on FRM-04 (formula revision). **Planning estimate only - never an approved requirement.**
- **Always-visible notice**: "Draft formula - planning estimate only. Formula approval is not implemented. No stock is checked; nothing is reserved, issued or consumed. No unit conversion. Fixed quantities, yield, losses and packaging rounding are not applied." (from `preview.notices`)
- **Layout**: (1) header summary - formula code/name, product, **Source: revision N (DRAFT), version V**, **Base output** with unit; (2) **Target output** number input with the revision's **output unit as a fixed, non-editable label**, and **Calculate** button; (3) **Scale factor** line (e.g. "× 5", "× 0.5") with an "approximate" marker when `scale_factor.is_approximate`; (4) **Raw materials** table and **Packaging materials** table (either may be empty; a formula need not contain both): material (stored snapshot code/name), unit (snapshot), base quantity, **required quantity**; an "≈ approximate" marker when `required_quantity.is_approximate` with a tooltip "non-terminating result shown to 50 significant digits"; (5) **Issues and warnings** list
- **Warnings/issues**: fractional-piece (`FRACTIONAL_COUNT_REQUIREMENT`: "requires 12.5 PCS exactly - shown unrounded; no rounding rule decided"); inactive product/material/unit/output unit badges (from `lines[].current` - never hide the snapshot); renamed-since-snapshot (informational); `EMPTY_FORMULA` shown as "No lines - this is not a complete requirement" with no totals; `LINE_NOT_CALCULATED` naming the line; if `calculation_complete` is false show "Incomplete estimate"
- **Behavior**: changing the target only re-calls the GET; it never edits the formula, and unsaved editor changes are unaffected. Concurrency tokens (`version`) stay in frontend state. Recalculate after saving the revision
- **Validation (400)**: target required, positive, max 3 decimals, max 11 integer digits, whole number for COUNT outputs - show field-level
- **States**: loading skeleton; 403 (no `formulas.view`), 404, `409` "revision is being edited - retry"; empty formula state
- **Not available (backends do not exist)**: no enabled *Create batch*, *Issue stock*, *Reserve* or *Submit requisition* actions; if placeholders are shown they must be disabled with "Not available yet". Never show `approved`, available stock, shortage or "can produce"
- **Permissions**: `formulas.view`; no other lookup permission needed
- **APIs**: `GET /api/v1/companies/<id>/formulas/<fid>/revisions/<rid>/requirement-preview/?target_output_quantity=<n>`


---

### FRM-07 — Approve Formula Revision (Task 11C)

Button on a saved DRAFT revision, visible only when the user holds `formulas.approve`. Opens a review panel fed by
`GET .../approval-preview/`: policy status, blocking reasons (by category), the requester's contributor flag, and the
lines. The action is enabled only when `ready_to_attempt` is true *and* the user has permission (eligibility is not
permission). Confirm with `POST .../approve/` sending the revision's current `version`; 409 = reload; 400
`formula_approval_policy_not_configured` = show the administrator message. After success the editor turns read-only and
shows approver, time and the frozen identity. Admin-only sub-screen: per-company self-approval policy
(`GET/PATCH .../formula-approval-policy/`, active superuser). Not built: unapprove, clone, retire, supersede,
default-revision selection.

### Manufacturing Batch Planning (Task 12A) — screens BATCH-01–04

Planning drafts only - not an official manufacturing batch, batch number, production approval, stock reservation or
requisition. `batch_plans.view/create/edit` (seeded, assigned to nobody); creating also needs `sales_orders.view` and
`formulas.view`; the requirement preview also needs `formulas.view`.

- **BATCH-01 Batch Planning list** — company-scoped list of planning drafts; filter by order, planned-manufacturing-
  date; search by plan id/order reference/product; shows the "Planning draft — official batch number not assigned"
  notice on every row.
- **BATCH-02 Create Planning Draft** — pick an existing sales-order line (DRAFT or CONFIRMED order), then an
  explicitly APPROVED formula revision belonging to the same product; if its output unit differs from the line's
  own sales unit (Task 12B-2), the form must collect the full packing relationship (planned pack quantity,
  packing content quantity + unit) - never just the target - alongside the target output quantity and optional
  planned date/packing note/notes.
- **BATCH-03 Planning Draft Detail/Edit** — read-only source links (order, line, formula, revision - never re-
  pointed); editable target/date/packing-note/notes AND (Task 12B-2) the packing relationship fields, all under
  `expected_version`; shows order quantity, planned pack quantity, packing content, manufacturing target,
  calculated packed content and the signed "Planning quantity difference" as six separate values (see
  frontend handoff §15.1); a `source_drift` panel surfaces incompatible/renamed/inactive master data and
  disables quantity edits (not date/note edits) when incompatible.
- **BATCH-04 Material Requirement Preview** — read-only, reuses the Task 11D calculator against the plan's saved
  target and pinned revision; blocked with a structured notice when the source has drifted incompatibly; never shows
  stock, shortage or a can-produce result.

Not built: an official batch number, MRP/label/box/insert/printing fields, store requisitions, stock/reservation/
issue/consumption, production/packaging/QC-release/dispatch, or any approve/cancel/release transition on a plan.

### BATCH-05 — Assign Batch Number (Task 12D)

Action button on the Planning Draft Detail screen (BATCH-03), visible only when `official_batch_number` is `null`
AND the user holds `batch_plans.allocate_number` (separate from `batch_plans.view`/`edit`/`create`, and deliberately
NOT gated by `formulas.approve`). Shows **"Not assigned"** in place of a number until allocated.

- **Confirmation dialog**: explains that allocation uses the current business year and that the number cannot be
  changed once assigned - no other fields; `expected_version` is sent from state, never typed. Never displays a
  predicted next sequence as if it were already reserved.
- **Result**: `200` → the plan now shows its real `official_batch_number`, `numbered_by`, `numbered_at`. A repeat
  click at the now-current version is a harmless no-op (same number returned).
- **Failure states**: `409` "this plan changed since you last read it" → refetch and show, never silently retry;
  `400` naming why the source is incompatible → show the message, keep the action disabled until resolved; `403`
  "you do not have permission to assign a batch number"; `404`.
- **Not built here**: any way to edit, clear, regenerate, cancel, or reuse an assigned number - none exists.
- **APIs**: `POST /api/v1/companies/<company_id>/batch-plans/<id>/allocate-number/`

## Module: Store Preparation (Task 12C — Confirmed Store-Side Preparation Info)

Store-scoped. Every screen requires active store membership with `store_preparation.view` at minimum, **and**
separately an active company membership with `batch_plans.view` in the specific plan's own operating company (store
access never implies company access - see `docs/frontend-api-handoff.md` §16). This is a confirmed-information
panel for an existing planning draft, not a requisition, status board, or production step.

### PREP-01 — Store Preparation Panel/Drawer (attached to a Planning Draft)
- **Type**: Panel/drawer opened from an existing Batch Planning Draft detail screen (BATCH-03)
- **Read-only context**: operating company, order reference, product, Planning ID (never labeled an official batch
  number)
- **Editable fields**: Packing Type (manual free-text input, e.g. `"25 Gm G2"` - no fixed choice list); Insert
  (three-way choice: **Not specified** / **Required** / **Not required (N/A)** - show "N/A" only when the stored
  value is `false`; never render `null` as "N/A")
- **Actions**: Save, Cancel
- **Permissions**: viewing needs `store_preparation.view` + `batch_plans.view` (plan's company); creating needs
  `store_preparation.create` in addition; editing an existing record needs `store_preparation.edit` in addition -
  document these as three separately grantable capabilities, not one
- **Empty state**: no preparation record yet for this plan - show a "Create preparation" action (POST) instead of an
  edit form; a `GET` on the collection never creates one
- **Validation/conflict states**: `400` on an unknown/protected field or an invalid Insert value; `409` "this
  record has changed since it was last read - refetch and retry" on a stale `expected_version`, handled the same
  refetch-and-show pattern as every other conflict in this API (§16 of the handoff, "Handling 409")
- **Explicitly NOT present in this slice, and must not appear as functioning controls**: Label, Box, any
  requisition-status field - these remain pending client decisions (see `docs/client-register-field-mapping.md`)
- **APIs**: `GET/POST /api/v1/stores/<store_id>/preparations/`, `GET/PATCH /api/v1/stores/<store_id>/preparations/<id>/`

## Module: Material Requisitions (Task 13A — Draft Foundation)

Store-scoped. Every screen requires active store membership with `material_requisitions.view` at minimum, **and**
separately an active company membership holding BOTH `batch_plans.view` **and** `formulas.view` in the specific
plan's own operating company (store access never implies company access, and this app additionally requires formula
visibility everywhere, unlike Store Preparation - see `docs/frontend-api-handoff.md` §18). A `MaterialRequisition`
is a DRAFT planning document requesting materials for an existing Batch Planning Draft, auto-fetched from its
pinned approved formula - it is not a stock transaction, reservation, or issue, and it does not authorize
manufacturing.

**Important distinction from Store Preparation's own unresolved "Requisition Status" field**: this module is a
separate, richer concept (an actual requisition record with material lines and quantities) - it does **not**
resolve or implement the simple "Requisition Status" flag the client's own register still shows on Store
Preparation (PREP-01), which remains an open, unimplemented question (see
`docs/client-register-field-mapping.md`). Do not conflate the two, and do not treat creating a `MaterialRequisition`
as answering what value that separate status field should show.

### MREQ-01 — Material Requisitions List
- **Type**: Full page, store-scoped
- Filter by source batch plan (`?batch_plan=`); search is not supported on this list in this task
- Each row shows: product/order context (via the plan), formula code/revision, target output quantity, line count,
  created date - never a price, customer name, or stock figure
- Standard pagination
- **APIs**: `GET /api/v1/stores/<store_id>/material-requisitions/`

### MREQ-02 — Create Material Requisition
- **Type**: Action/dialog opened from an existing Planning Draft detail screen (BATCH-03) - mirrors PREP-01's own
  "opened from the plan" pattern
- The ONLY input is a confirmation of which plan to create against (`batch_plan_id`) and the plan's `version` as
  last displayed (`expected_batch_plan_version`, sent from state, never typed) - everything else (every material
  line and its calculated quantity) is auto-fetched server-side; there is no manual line-entry form anywhere in this
  screen
- **Confirmation copy**: explain that this creates ONE requisition for this plan (a second attempt for the same
  plan is rejected), and that quantities are calculated from the plan's currently pinned formula revision - not
  editable at creation time
- **Result**: `201` → navigate to MREQ-03 for the new record
- **Failure states**: `409` "this plan changed since you last reviewed it" → refetch the plan and show what changed,
  never silently resubmit; `400` naming why the source is incompatible (mirrors BATCH-05's own drift-blocking
  copy); `404` (folded - no distinction between "plan doesn't exist" and "you lack `batch_plans.view`/`formulas.
  view` here")
- **APIs**: `POST /api/v1/stores/<store_id>/material-requisitions/`

### MREQ-03 — Material Requisition Detail / Edit
- **Type**: Full page
- **Read-only source context**: source plan (link back to BATCH-03), order reference, product, formula
  code/revision, target output quantity - all frozen snapshots, never re-pointed
- **Raw Materials / Packaging Materials sections** (split by `material_type`, never invented client-side): each line
  shows the recipe's base quantity, the exact calculated requirement (with an "approximate" badge when
  `calculation_is_exact` is false - never hide this), and the editable **Requested Quantity** field
- **Requested Quantity editing**: shows "Not yet decided" when `null` alongside `quantity_decision_issue`'s plain-
  language reason (a repeating decimal, a fractional result for a whole-units material, or an out-of-range value) -
  never auto-fill a rounded guess. Entering a value that differs from the exact calculated requirement requires a
  non-blank remark in the same save (400 otherwise) - render the remark field as required only in that specific
  case, not always
- **No add/remove line control anywhere on this screen** - lines are fixed to what the formula recipe produced at
  creation time
- **Source drift banner**: shown when `source_drift.quantity_affecting` is true (the plan's target quantity changed,
  or its source became incompatible) - disables Requested Quantity edits specifically, while notes remain editable;
  a plain product/unit-compatibility banner (reused wording from BATCH-03's own drift panel) when `is_incompatible`
  is true
- **Current plan context**: shows the plan's live official batch number if one has been allocated (BATCH-05),
  labeled as current context, never implying it changes anything already saved here
- **Validation/conflict states**: `400` on an unknown/protected field, a foreign/duplicate line id, an invalid
  requested quantity (not positive, wrong precision, fractional for a whole-units material), or a missing remark
  when required; `409` "this requisition has changed since it was last read - refetch and retry" on a stale
  `expected_version`, same pattern as every other conflict in this API
- **Explicitly NOT present in this task, and must not appear as functioning controls**: submit/approve/reject/
  cancel/issue actions, an add-line or remove-line control, any stock/reservation/availability indicator
- **APIs**: `GET/POST /api/v1/stores/<store_id>/material-requisitions/`, `GET/PATCH
  /api/v1/stores/<store_id>/material-requisitions/<id>/`

## Module: Physical Receipt Ledger (Task 13C — Recorded Receipts, Read-Only)

Store-scoped. Requires active store membership with `stock.view`, **and** separately an active company
membership holding `purchase_orders.view` in the specific movement's own source (receiving) company - mirrors
Goods Receiving's own company-access rule exactly (store access never implies company access). This is a
read-only record of physical material entering the store when a Goods Receipt is posted - it is **not** a stock-
availability, ownership, QC-release, reservation, issue, or return system. None of those concepts exist here.

### STK-01 — Recorded Receipts
- **Type**: Full page, store-scoped, read-only (no create/edit/delete action anywhere on this screen)
- **Columns**: Material; Store/location where recorded (location is never shown - it is not captured anywhere in
  this system yet); Source receipt reference and source (receiving) company; Lot reference where recorded (blank
  when the supplier gave none - never fabricated); Recorded receipt quantity and unit; a **release status** column
  always reading "Not tracked"
- **Coverage notice** (must be shown prominently, not buried in a tooltip): historical receipts posted before
  this feature existed are not backfilled; opening stock is not included; issues, returns, reservations and QC
  release are not tracked. This is never labeled "Available Stock," "Usable Stock," or "On Hand" anywhere on this
  screen.
- **Filters**: material; standard pagination. No search on lot reference or receipt in this initial slice.
- **Explicitly NOT present, and must not appear as functioning controls**: any create/adjust/reverse/correct
  action, any ownership field, any QC-disposition control, any reservation/issue/return action, any
  "available"/"usable" quantity
- **APIs**: `GET /api/v1/stores/<store_id>/stock-movements/`, `GET /api/v1/stores/<store_id>/stock-balances/`

## Module: Planned (no backend work started — proposed screens only)

These are listed so frontend architecture can leave room for them, **not**
as a commitment to build them next. Every API path below is illustrative
only — **none of these endpoints exist**, and none should be hard-coded
anywhere in the frontend yet.

| ID | Proposed screen | Business purpose | Backend status |
|---|---|---|---|
| PLAN-01 | Customer Orders | Capture a customer's order | NOT IMPLEMENTED — a company-scoped customer master (CUST-01–04), a company-scoped product master (PROD-01–04) and company-scoped quotation drafts (QUOT-01–03) and direct sales-order drafts (SO-01–03) are now implemented; quotation conversion/confirmation/production are not |
| PLAN-02 | Batch Planning | Plan a production batch against a customer order | **Planning drafts implemented (Task 12A, see BATCH-01–04 above)** - no official batch number, MRP, stock effect or production authorization |
| PLAN-03 | Formula / BOM | Define what materials a batch consumes | NOT IMPLEMENTED |
| PLAN-04 | Stock Check / Ledger | Show on-hand stock and reserve/consume it | NOT IMPLEMENTED — no stock-balance concept exists anywhere yet |
| PLAN-05 | Incoming QC Disposition | Accept/reject a physically received delivery and release it to production | NOT IMPLEMENTED — a separate draft-observation-recording slice (QC-01–05) is now implemented; see the "Incoming QC Inspection" module above |
| PLAN-06 | Material Release | Release QC-accepted material to production | NOT IMPLEMENTED |
| PLAN-07 | Production Planning | Schedule batches against capacity | NOT IMPLEMENTED |
| PLAN-08 | Production / BMR | Record a batch manufacturing record | NOT IMPLEMENTED |
| PLAN-09 | Packaging / Filling | Track packaging/filling operations | NOT IMPLEMENTED |
| PLAN-10 | Final QC/QA | Release a finished batch | NOT IMPLEMENTED |
| PLAN-11 | Invoicing | Bill a customer | NOT IMPLEMENTED |
| PLAN-12 | Dispatch | Ship a finished order | NOT IMPLEMENTED |
| PLAN-13 | Reference Books | Shared document/reference library | NOT IMPLEMENTED |
| PLAN-14 | TQM | Total Quality Management workflows | NOT IMPLEMENTED |
| PLAN-15 | Reports / Analytics | Cross-module reporting | NOT IMPLEMENTED |
| PLAN-16 | Tally Integration | Accounting system sync | NOT IMPLEMENTED |

---

## Screen count summary

- **Full pages backed by implemented APIs**: 44 (AUTH-01, NAV-01–03, ADM-01, ADM-03, ADM-05, ADM-07–09, ADM-11–12, CAT-01–04, SUP-01–02, PR-01–03, PO-01–03, GR-01–03, QC-01–03, SPEC-01–03, CUST-01, CUST-03, PROD-01, PROD-03, QUOT-01–03, SO-01–03, FRM-01, FRM-02, FRM-04, FRM-06 panel) plus SO-06 (Task 10F) and the SO-04 panel (Task 10E/10F) — corrected from the earlier count of 30, which had omitted CUST-01/CUST-03 (Task 10A); now also includes PROD-01/PROD-03 (Task 10B) QUOT-01–03 (Task 10C) SO-01–03 (Task 10D) and FRM-01–05 (Task 11A) Now also includes BATCH-01–04 (Task 12A), PREP-01 (Task 12C) and MREQ-01/MREQ-03 (Task 13A) — total **48**. Now also includes STK-01 (Task 13C) — total **49**.
- **Modals/tabs/confirm dialogs backed by implemented APIs**: 26 (ADM-02, ADM-04, ADM-06, ADM-10, ADM-13–14, PR-04–05, PO-04–05, GR-04–07, QC-04–05, SPEC-04–05, CUST-02, CUST-04, PROD-02, PROD-04, FRM-03, FRM-05, SO-05) — corrected from the earlier count of 19, which had omitted CUST-02/CUST-04 (Task 10A); now also includes PROD-02/PROD-04 (Task 10B) Now also includes BATCH-05 (Task 12D) and MREQ-02 (Task 13A) — total **28**.
- **Proposed screens for planned, unbuilt modules**: 16 (PLAN-01–16, with PLAN-05 narrowed to disposition/release only now that drafting is implemented)

## Store & Materials (2026-10-06)

| Screen | Route | Real data | Writes | Status |
|---|---|---|---|---|
| Materials (shared catalog) | `/inventory/materials` | yes (`/api/v1/materials/`) | create/edit/activate/deactivate and import: active superuser only (server) | Connected in code; browser pending |
| Locations (store) | `/inventory/locations` | yes (`/api/v1/stores/<id>/locations/`) | none in this screen | Connected in code; browser pending |
| Recorded Receipts | `/inventory/receipts` | yes (stock-movements, stock-balances) | none (read-only) | Connected in code; browser pending |

Mock inventory screens (Overview, Stock & Lots, Issue / Return, Consumption Ledger) are removed from the sidebar. The old `features/inventory/Inventory.jsx` is no longer routed.
