# Current Backend Inventory and Client Workflow Gap Report

Report date: 2026-09-25. Read-only inspection of `D:\CMHP_NEW\backend` (models, services,
serializers, views, URL files, migrations, test files, retained logs) and the handoff documents.
**No tests, migrations, seeding or servers were run or touched for this report.** The repository
has no commits yet, so nothing here is compared against a tracked baseline.

Label vocabulary used throughout:

| Label | Meaning |
|---|---|
| **CLIENT** | A statement the client made in this task's workflow description. |
| **DEFAULT** | An existing technical/working default in the code, not client-confirmed. |
| **REC** | A recommendation from this report. |
| **OPEN** | An unanswered question. Nothing in this report answers it. |
| **IMPLEMENTED / PARTIAL / PROPOSAL / ABSENT** | Code status (see §1). |

---

## 1. Executive summary

- **Implemented and exposed through APIs** (every route is listed in §3): authentication and
  session handling; superuser administration of users/companies/stores/roles/memberships; shared
  catalog (units, categories, materials) and store locations; suppliers; purchase request → 3-step
  approval → purchase order → issue; goods receiving (posting, delivery progress); incoming-QC
  inspection **drafts and submission**; material specification **drafts**; customers; products;
  quotation **drafts**; sales orders (drafts, preview, **policy-gated DRAFT → CONFIRMED**);
  formula **drafts with revisions**.
- **Partial**: quotations (drafts only — no submit/accept/revise); receiving (physical receipt only —
  no stock effect); QC (observation drafts only — no result, disposition, acceptance or release);
  formulas (drafts only); sales-order confirmation (a confirmed order authorizes nothing downstream).
- **Partial (Task 12A, see §11): manufacturing batch PLANNING DRAFTS** connecting a sales-order line, an
  APPROVED formula revision and a target output quantity. No official batch number/sequence, no production
  authorization, and no downstream effect of any kind.
- **Absent** (no model, service or route): official batch numbers; the client's
  order/packing/printing fields; store requisitions; stock ledger or available-stock balances;
  reservation; physical material issue; production consumption; return to store; production/BMR/
  packaging status; dispatch; invoice; payment; Tally; notifications; reports; audit **viewing** API
  (audit rows are written, not readable through an endpoint); proportional formula scaling and any
  requirement calculation.
- **Task 11C (formula contributors / approval policy / approval): IMPLEMENTED (Task 11C, see §10).** Approval is
  policy-gated and permission-gated (`formulas.approve`, assigned to nobody). Batches and downstream production
  remain absent.
- **Recommended next task** (§8): a **read-only formula requirement preview** (`factor = target ÷
  base output`, exact Decimal, no persistence, no stock, no rounding decision), reusing the formula
  module unchanged — then decisions before any batch model. Its blockers are small (§8).

---

## 2. Module inventory

Conventions (verified in code): company-scoped apps resolve the company with an active membership in an
active company (unknown, inactive or not-a-member all return one indistinguishable **404**); a missing
permission on a found company is **403** naming it; **no `is_superuser`/`is_staff`/role-name bypass** in
business paths. Store-scoped apps do the same for stores. Optimistic concurrency = an
`expected_version` in the body matched under a row lock, stale → **409**. Audit rows are written inside
the same transaction as the mutation (`apps.audit.services.record`), with `company` or `store` context
(receiving and quality record both).

### 2.1 Authentication and session — IMPLEMENTED
- Models: `users.User` (Django `AbstractUser`, unique email).
- JWT (SimpleJWT): access token 5 min default, refresh 1 day, rotation + blacklist; refresh token in an
  HttpOnly cookie scoped to `/api/v1/auth/`; CSRF bootstrap required before login/refresh/logout; login
  throttled 5/min per IP by default (429). Access tokens carry no role/permission claims; permissions are
  re-resolved from the database on every request.
- Frontend needs: `GET /auth/csrf/` → `POST /auth/login/` → `GET /auth/me/`, then `/companies/mine/`,
  `/stores/mine/`. Screens AUTH-01, NAV-01–03.

### 2.2 Users, roles, memberships, permissions — IMPLEMENTED
- Models: `CompanyMembership`, `StoreMembership`, `PermissionDefinition` (code, module, **scope
  COMPANY|STORE**), `CompanyRole` (M2M permissions, per company), `MembershipRole`, `StoreRole`,
  `StoreRoleAssignment`.
- Resolution (`apps.permissions.services`): effective permissions require an active user, company (or
  store), membership, role assignment, role and permission definition; deny by default; **company and
  store permissions are separate resolvers**; superuser/staff never consulted.
- Administration (users, companies, stores, roles, memberships, role assignments, permission catalog) is
  **active-superuser only**. Operational users read only their own access: `GET
  /companies/<id>/my-permissions/`, `GET /stores/<id>/my-permissions/`.
- "Admin" is **not** a role in code. Business authority is granted only by explicit permission
  assignment (e.g. `sales_orders.confirm`, `purchase_requests.approve`).
- No concurrency version on these resources (last-write; audited). Screens ADM-01–14.

### 2.3 Shared store, catalog, units, locations — IMPLEMENTED
- Models: `SharedStore` (one physical store; both companies use it, **F**), `StorageLocation` (per
  store), `UnitOfMeasure` (dimension MASS/VOLUME/COUNT), `MaterialCategory` (flat), `Material` (kind
  RAW_MATERIAL | PACKAGING_MATERIAL, base unit, optional category).
- Access: writes = active superuser. Catalog reads (`/units/`, `/material-categories/`, `/materials/`) =
  active superuser **or** `shared_catalog.view` (STORE scope) in **at least one** active store — this is
  *not* company-scoped. Location reads = superuser or `storage_locations.view` in that store.
- Rules: no delete; `deactivate_unit`/category blocked while an active *material* references it (an
  active *product* does **not** block a unit — documented gap).
- No concurrency version. Screens CAT-01–04.
- **Frontend gap (verified)**: company-only users (e.g. formula authors) cannot list materials unless they
  also hold `shared_catalog.view` through a store membership.

### 2.4 Suppliers — IMPLEMENTED
- Model `Supplier` (shared directory, not company-scoped, **DEFAULT**). All routes active-superuser only,
  both read and write. `is_active` means "in use", never "qualified". No version field. Screens SUP-01/02.

### 2.5 Purchase requests and approvals — IMPLEMENTED
- Models: `PurchaseRequest` (+lines, approval rounds, round lines, per-step decisions). Company scoped.
- Statuses: `DRAFT`, `SUBMITTED`, `APPROVED`, `REJECTED`, `CANCELLED`. Transitions: DRAFT→SUBMITTED
  (`submit`), SUBMITTED→APPROVED (third step approved), SUBMITTED→REJECTED, REJECTED→DRAFT (`revise`),
  DRAFT/SUBMITTED→CANCELLED. Exactly **three sequential approval steps**, decided by holders of
  `purchase_requests.approve`; own-request ban; distinct-approver-per-step rule (**DEFAULT/provisional**).
- Permissions (COMPANY): `purchase_requests.view/create/edit/submit/cancel/cancel_pending/approve`.
  Mutations = view + action. Cancelling a submitted request needs `cancel_pending` (checked after the row
  lock).
- Concurrency: every PATCH/submit/cancel/approve/reject/revise needs `expected_version`; approve/reject
  also `expected_round`/`expected_step`. Snapshots: line material/unit captured at submit; per-round
  immutable copies. Audit on every transition.
- Lookup: materials (catalog gap above). Screens PR-01–05. Note: no link from a shortage/batch to a
  request exists (no shortage concept).

### 2.6 Purchase orders — IMPLEMENTED
- Models `PurchaseOrder`, `PurchaseOrderLine`, `PurchaseOrderIssueSnapshot`(+lines). Company scoped; one
  active PO per approved request (**DEFAULT**); supplier from the shared directory.
- Statuses: `DRAFT`, `ISSUED`, `CANCELLED`. DRAFT→ISSUED (`issue`), DRAFT→CANCELLED. ISSUED is terminal.
  Currency shape-checked at draft; issue allowlist INR/USD/EUR/GBP; line amount = qty × price, 2 dp
  ROUND_HALF_UP; `unit_price` may be edited on existing lines only (no add/remove lines).
- Permissions (COMPANY): `purchase_orders.view/create/edit/cancel/issue`; create also needs
  `purchase_requests.view`. `expected_version` on patch/cancel/issue. Issue-time snapshot of company/
  supplier/lines. Screens PO-01–05.

### 2.7 Goods receiving — PARTIAL
- Models `GoodsReceipt` (+lines: received quantity, supplier lot **text**, snapshots). Statuses `DRAFT`,
  `POSTED`, `CANCELLED`; DRAFT→POSTED (`post`), DRAFT→CANCELLED; POSTED is terminal, no correction/
  reversal mechanism.
- Access: **store permission** `receiving.view/create/edit/post/cancel` (STORE scope) **and**
  `purchase_orders.view` in the receipt's company (dual-axis, **DEFAULT**; a missing company axis folds
  to 404). Idempotency key on create; over-delivery rejected; delivery progress (ordered/received/
  remaining, `FULLY_RECEIVED` etc.) is computed and returned inside purchase-order-for-receiving payloads
  (a service function exposed only through serializers).
- **Posting creates no stock record.** `expected_version` on patch/post/cancel. Screens GR-01–07.

### 2.8 Incoming QC and material specifications — PARTIAL
- `IncomingInspection` (+observations): store-scoped to a posted receipt line; statuses `DRAFT`,
  `SUBMITTED`, `CANCELLED`; DRAFT→SUBMITTED (needs ≥1 observation; then frozen), DRAFT→CANCELLED. Store
  permissions `incoming_qc.view/create/edit/submit/cancel` plus bare company membership (deliberately
  **not** `purchase_orders.view`). **No pass/fail, acceptance, rejection, release, disposition, retest or
  stock effect.** `incoming-qc-review-proposal.md` is a **proposal only**.
- `MaterialSpecification` → `MaterialSpecificationVersion` (DRAFT only) → `SpecificationTest`: active
  superuser only, global; not linked to any inspection. Three distinct version-like values documented.
  Screens QC-01–05, SPEC-01–05.

### 2.9 Customers and products — IMPLEMENTED
- `Customer` (COMPANY scoped, unique `(company, code)`, includes inactive), permissions
  `customers.view/create/edit/activate/deactivate`. `Product` (COMPANY scoped, `sales_uom` immutable,
  must be active at creation), `products.view/create/edit/activate/deactivate`. `expected_version` on
  patch and both lifecycle calls; 409 on duplicate code. No delete. Company scoping is **DEFAULT**.
  Screens CUST-01–04, PROD-01–04.

### 2.10 Quotations — PARTIAL (drafts only)
- `Quotation`/`QuotationLine`: company scoped; status enum has **only `DRAFT`**; reference `QT-…`
  (**DEFAULT**); currency immutable; line snapshots; Decimal amounts; nested-line replace semantics.
  Permissions `quotations.view/create/edit`. **No submit, accept, reject, revise, expiry, conversion or PDF**
  in code. Screens QUOT-01–03.

### 2.11 Sales orders and confirmation policy — IMPLEMENTED (draft + confirm), nothing downstream
- `SalesOrder`/`SalesOrderLine`; header fields: company, `reference` (`SO-…`, **DEFAULT**), customer,
  `order_date`, `requested_delivery_date`, `customer_order_reference`, `currency`, `notes`, status,
  `version`, `created_by`, confirmation fields. Statuses `DRAFT`, `CONFIRMED`; only transition
  DRAFT→CONFIRMED. Edits rejected once confirmed (400 current / 409 stale). No cancel/unconfirm/amend.
- `SalesOrderConfirmationPolicy` (per company; three nullable booleans — self-confirmation, zero-price
  lines, past requested delivery dates; **no defaults; absent/incomplete blocks confirmation**). Policy
  management = active superuser; confirmation = COMPANY `sales_orders.view` + `sales_orders.confirm`
  (seeded, assigned to nobody). Confirmation re-checks access and eligibility under locks, records the
  policy values/version/business date used, and audits atomically. Past-date checks use
  `BUSINESS_TIME_ZONE` (default Asia/Kolkata — **assumption**). Preview endpoint reuses the same
  assessment and can be stale.
- **Not** linked to quotations, batches, formulas, stock, invoices or dispatch. Screens SO-01–06.

### 2.12 Formulas — PARTIAL (drafts)
- `Formula` (company, product, code; `version` metadata token; `latest_revision_number` allocation
  counter), `FormulaRevision` (revision_number; status **DRAFT only**; `base_output_quantity`; `output_uom`
  derived from the product's sales unit; content `version`), `FormulaLine` (material, quantity, unit =
  material base unit, material kind snapshot RAW/PACKAGING). Permissions `formulas.view/create/edit`.
  Nested-line replace semantics; COUNT units need whole quantities; **no scaling of any kind**.
  Several formulas per product allowed; none is default. Screens FRM-01–05.

### 2.13 Task 11C — formula contributors, approval policy, approval — IMPLEMENTED (see §10)
`FormulaApprovalPolicy`, `FormulaRevisionContributor`, revision status `APPROVED`, `formulas.approve`, the
`approve` and `approval-preview` endpoints and the policy endpoint. Earlier text saying this was absent is
historical (pre-11C).

### 2.14 Explicitly ABSENT (grep-verified for model/service names)
Batches; batch number generation; MRP/packing size/label/box/insert/printing fields; requisitions; stock
ledger/balances; reservation; material issue; production consumption; returns to store; production, BMR,
packaging or dispatch status; invoices, payments, Tally; notification and report APIs; an audit-log read API.

---

## 3. Exact API inventory

All paths are under `/api/v1/`. `SU` = active superuser only. Concurrency column: **V** = `expected_version`
required; **—** = none. Pagination = the standard bounded page (20, max 100) on list endpoints.

**Public/auth** (AllowAny except `me`)

| Method | Path | Notes |
|---|---|---|
| GET | `health/` | liveness |
| GET | `auth/csrf/` | sets csrftoken, returns token |
| POST | `auth/login/` | throttled; sets refresh cookie |
| POST | `auth/refresh/` | cookie + CSRF |
| POST | `auth/logout/` | cookie + CSRF |
| GET | `auth/me/` | Bearer |

**Users and memberships (SU)**

| Method | Path |
|---|---|
| GET, POST | `users/` |
| GET, PATCH | `users/<user_id>/` |
| POST | `users/<user_id>/activate/`, `.../deactivate/` |
| GET, POST | `users/<user_id>/memberships/` |
| POST | `users/<user_id>/memberships/<membership_id>/deactivate/` |
| GET, POST | `users/<user_id>/memberships/<membership_id>/roles/` |
| POST | `users/<user_id>/memberships/<membership_id>/roles/<assignment_id>/deactivate/` |

**Companies, roles, permissions**

| Method | Path | Access |
|---|---|---|
| GET | `companies/mine/` | any authenticated |
| GET, POST | `companies/` | SU |
| GET, PATCH | `companies/<id>/` | SU |
| POST | `companies/<id>/activate/`, `.../deactivate/` | SU |
| GET | `companies/<id>/my-permissions/` | member |
| GET, POST | `companies/<id>/roles/` | SU |
| GET, PATCH | `companies/<id>/roles/<role_id>/` | SU |
| POST | `companies/<id>/roles/<role_id>/activate/`, `.../deactivate/` | SU |
| PUT | `companies/<id>/roles/<role_id>/permissions/` | SU |
| GET | `permissions/` | SU (catalog; `scope` filter) |

**Stores, store roles/memberships, locations**

| Method | Path | Access |
|---|---|---|
| GET | `stores/mine/` | authenticated |
| GET, POST | `stores/` | SU |
| GET, PATCH | `stores/<id>/` | SU |
| POST | `stores/<id>/activate/`, `.../deactivate/` | SU |
| GET | `stores/<id>/my-permissions/`, `stores/<id>/overview/` | store member |
| GET, POST | `stores/<id>/roles/` | SU |
| GET, PATCH | `stores/<id>/roles/<role_id>/` | SU |
| POST | `stores/<id>/roles/<role_id>/activate/`, `.../deactivate/` | SU |
| PUT | `stores/<id>/roles/<role_id>/permissions/` | SU |
| GET, POST | `stores/<id>/memberships/` | SU |
| POST | `stores/<id>/memberships/<mid>/deactivate/` | SU |
| GET, POST | `stores/<id>/memberships/<mid>/roles/` | SU |
| POST | `stores/<id>/memberships/<mid>/roles/<aid>/deactivate/` | SU |
| GET | `stores/<id>/locations/`, `.../locations/<lid>/` | SU or `storage_locations.view` in that store |
| POST | `stores/<id>/locations/` | SU |
| PATCH | `stores/<id>/locations/<lid>/` | SU |
| POST | `stores/<id>/locations/<lid>/activate/`, `.../deactivate/` | SU |

**Shared catalog and suppliers**

| Method | Path | Access |
|---|---|---|
| GET | `units/`, `units/<id>/`, `material-categories/`, `material-categories/<id>/`, `materials/`, `materials/<id>/` | SU or `shared_catalog.view` (any store) |
| POST | `units/`, `material-categories/`, `materials/` | SU |
| PATCH | `units/<id>/`, `material-categories/<id>/`, `materials/<id>/` | SU |
| POST | `<resource>/<id>/activate/`, `.../deactivate/` (units, material-categories, materials) | SU |
| GET, POST | `suppliers/` | SU |
| GET, PATCH | `suppliers/<id>/` | SU |
| POST | `suppliers/<id>/activate/`, `.../deactivate/` | SU |

**Company-scoped business modules** (`companies/<company_id>/…`; every route needs `<mod>.view`; mutation = view + action)

| Method | Path suffix | Action permission | Conc. |
|---|---|---|---|
| GET, POST | `purchase-requests/` | — / `purchase_requests.create` | — |
| GET, PATCH | `purchase-requests/<id>/` | — / `.edit` | V |
| POST | `purchase-requests/<id>/submit/` | `.submit` | V |
| POST | `purchase-requests/<id>/cancel/` | `.cancel` or `.cancel_pending` (state-dependent) | V |
| POST | `purchase-requests/<id>/approve/`, `.../reject/` | `.approve` | V + round + step |
| POST | `purchase-requests/<id>/revise/` | `.edit` | V |
| GET, POST | `purchase-orders/` | — / `purchase_orders.create` (+`purchase_requests.view`) | — |
| GET, PATCH | `purchase-orders/<id>/` | — / `.edit` | V |
| POST | `purchase-orders/<id>/cancel/` | `.cancel` | V |
| POST | `purchase-orders/<id>/issue/` | `.issue` | V |
| GET, POST | `customers/` | — / `customers.create` | — |
| GET, PATCH | `customers/<id>/` | — / `.edit` | V |
| POST | `customers/<id>/activate/`, `.../deactivate/` | `.activate` / `.deactivate` | V |
| GET, POST | `products/` | — / `products.create` | — |
| GET, PATCH | `products/<id>/` | — / `.edit` | V |
| POST | `products/<id>/activate/`, `.../deactivate/` | `.activate` / `.deactivate` | V |
| GET, POST | `quotations/` | — / `quotations.create` | — |
| GET, PATCH | `quotations/<id>/` | — / `.edit` (DRAFT only) | V |
| GET, POST | `sales-orders/` | — / `sales_orders.create` | — |
| GET, PATCH | `sales-orders/<id>/` | — / `.edit` (DRAFT only) | V |
| GET | `sales-orders/<id>/confirmation-preview/` | `sales_orders.view` only | — |
| POST | `sales-orders/<id>/confirm/` | `sales_orders.confirm` | V |
| GET, PATCH | `sales-order-confirmation-policy/` | **SU** (not a company permission) | V (0 = create) |
| GET, POST | `formulas/` | — / `formulas.create` | — |
| GET, PATCH | `formulas/<id>/` | — / `.edit` (name/notes) | V (formula version) |
| GET, POST | `formulas/<id>/revisions/` | — / `.create` (new empty revision) | — |
| GET, PATCH | `formulas/<id>/revisions/<rid>/` | — / `.edit` | V (revision version) |

**Store-scoped business modules** (`stores/<store_id>/…`; store permissions; receiving also needs company `purchase_orders.view`)

| Method | Path suffix | Store permission | Conc. |
|---|---|---|---|
| GET, POST | `goods-receipts/` | `receiving.view` / `.create` | — |
| GET | `goods-receipts/eligible-purchase-orders/` | `receiving.view` | — |
| GET, PATCH | `goods-receipts/<id>/` | `receiving.view` / `.edit` | V |
| POST | `goods-receipts/<id>/post/`, `.../cancel/` | `.post` / `.cancel` | V |
| GET, POST | `incoming-inspections/` | `incoming_qc.view` / `.create` | — |
| GET | `incoming-inspections/eligible-receipt-lines/` | `incoming_qc.view` | — |
| GET, PATCH | `incoming-inspections/<id>/` | `.view` / `.edit` | V |
| POST | `incoming-inspections/<id>/submit/`, `.../cancel/` | `.submit` / `.cancel` | V |

**Global specifications (SU)**: `GET, POST material-specifications/`; `GET, PATCH
material-specifications/<id>/` (V = specification version); `GET, POST .../versions/`; `GET, PATCH
.../versions/<version_id>/` (V = that version's own version).

**Seeded permission codes (0003–0017)**: STORE — `shared_store.view`, `shared_catalog.view`,
`storage_locations.view`, `receiving.*` (view/create/edit/post/cancel), `incoming_qc.*`
(view/create/edit/cancel/submit). COMPANY — `purchase_requests.*` (incl. approve, cancel_pending),
`purchase_orders.*` (incl. issue), `customers.*`, `products.*`, `quotations.view/create/edit`,
`sales_orders.view/create/edit/confirm`, `formulas.view/create/edit`.

### 3.1 Service functionality vs API exposure
Every state-changing service function found has a corresponding route. Differences: (a)
`delivery_progress_for_purchase_order` is exposed only inside serializers of receiving payloads, not as a
route; (b) `load_locked_confirmation_context` (sales orders) and the permission-resolution functions are
internal, by design; (c) `effective_permission_codes`/`store_user_has_permission` back the `my-permissions`
routes; (d) audit rows are **written** by every service but there is **no read/list API** for them.
No service exists for any absent capability in §2.14.

---

## 4. Client-flow mapping

### 4.1 Statement classification

| ID | Statement | Class | Notes |
|---|---|---|---|
| A | Admin enters a new order: name, type, company, company code, order date, planned manufacturing date | **CLIENT** (fields) / **OPEN** (meanings) | "Admin" is not a role in code (see 2.2); who enters is a permission assignment, not decided |
| B | Store Manager updates packing type, label, box, insert, requisition status | **CLIENT** / **OPEN** (meaning of label/box/insert) | |
| C | Manager handles batch number, packing size, batch size, MRP for printing, printing status | **CLIENT** / **OPEN** | |
| D | Batch number from company code + year + sequence, e.g. `ABC-26-01` | **CLIENT** (format example) / **OPEN** (which date, reset rule) | |
| E | Production (BMR status, production status, remarks), packaging (Pending/In Process/Completed), dispatch (Yes/No), invoice (client's pending format) | **CLIENT** | invoice format pending |
| F | One shared physical store serves both operating companies | **CLIENT** (and matches `SharedStore`) | ownership/consumption rules **OPEN** |
| G | Requirements scale with target output; example base 100, target 500 → ×5, 50 → ×0.5 | **CLIENT** (scaling intent; quantities illustrative) | rounding/fixed/loss **OPEN** |
| — | QC/QA documents and invoice formats pending | **CLIENT** | |
| — | Existing defaults: company-scoped masters/orders, `SO-`/`QT-`/`PO-` random-suffix references, `requested_delivery ≥ order_date`, currency immutable, sales-order policy per company with no defaults, single-permission PO issue, dual store+company receiving | **DEFAULT** | none client-confirmed |

### 4.2 Existing structures relevant to the client fields (facts)
- `Company` has only `code` (unique, ≤32), `legal_name`, `display_name`. No brand, no "type".
- `Customer`/`Product` belong to one company; `Product` has no "type"; `Material.kind` is RAW vs PACKAGING.
- `SalesOrder` has: company, customer, order_date, requested_delivery_date, customer_order_reference, notes,
  currency, lines (product + quantity + price). It has **no** name, type, company code, planned manufacturing
  date, packing type, label/box/insert, requisition status, batch fields, MRP, printing, BMR/production/
  packaging/dispatch/invoice status.
- Reference/sequence patterns: business references are random-suffix (never a sequence). A safe
  **sequence allocator pattern exists** (parent-row lock + counter: `Formula.latest_revision_number`,
  `PurchaseRequest.current_round`) that could be reused for `(company, year)` counters; nothing generates
  `ABC-26-01` today.

### 4.3 Requirement → reuse / extension / new / decision

| Client requirement | Existing code to reuse | Required extension | New module? | Decision needed first |
|---|---|---|---|---|
| A. Order entry (name, type, company, code, order date, planned mfg date) | `SalesOrder` (company, order_date, customer, permissions, policy, audit, locking) | Possibly additive nullable header fields (planned manufacturing date; name/type only once meaning known) | Not necessarily — **REC: reuse `SalesOrder`, do not add a duplicate order module** unless the client says these are *manufacturing* orders distinct from customer orders | What "name"/"type"/"company" identify; is this the same document as a customer sales order |
| B. Packing type/label/box/insert/requisition status | none (formula packaging lines are materials, not statuses) | New fields or a packaging-spec record on a batch/order | Likely inside the batch/requisition slice, not standalone | Are label/box/insert quantities, readiness statuses, artwork references or a mix; who edits (Store Manager permission) |
| C. Batch number, packing size, batch size, MRP, printing status | `Formula` base output pattern; counter pattern; `Product` | New batch record | **Yes — no batch concept exists** | Cardinality (order↔product↔batch), what packing size vs batch size mean, MRP source, printing workflow |
| D. Batch number `CODE-YY-NN` | `Company.code`; counter-under-lock pattern; `business_today()` + `BUSINESS_TIME_ZONE` | A dedicated per-(company, year) counter | With the batch record | Which company code (operating company vs customer/brand); which date sets the year (order/planned/registration); reset each year? zero-padding/overflow past 99; manual override |
| E. Production/BMR/packaging/dispatch/invoice status | none | Status fields on batch (production/packaging) ; dispatch and invoice are later modules | Dispatch/invoice/BMR: new later | Allowed transitions, who may set, remarks rules; invoice format pending; whether "dispatch Yes/No" is a flag or a document |
| F. Shared store, two companies | `SharedStore`, store vs company permission separation, receiving dual access | none for the shared location itself | Stock ledger is new | Legal ownership of stock; cross-company consumption/allocation |
| G. Scaling with target output | `FormulaRevision.base_output_quantity` + lines (exact Decimal) | Requirement computation (factor = target ÷ base) | Not necessarily — a read-only computation on the formula module | Rounding of fractional COUNT results (e.g. 12.5 caps), packaging rounding, fixed-per-batch materials, loss/yield/waste, which revision status may be used |

### 4.4 Concepts kept separate (nothing here equates them)

| Concept | Status in code | Note |
|---|---|---|
| Sales order | IMPLEMENTED (draft, confirmed) | Confirmation authorizes nothing downstream |
| Manufacturing batch | ABSENT | Not derived from an order today |
| Formula-based material requirement | ABSENT (only formula drafts exist) | Scaling is documented as not implemented |
| Store requisition for production | ABSENT | Client's "requisition status" has no home yet |
| Purchase request to procure material | IMPLEMENTED | Not linked to any requirement/shortage |
| Reservation | ABSENT | No stock to reserve |
| Physical material issue | ABSENT | |
| Production consumption | ABSENT | |
| Return to store | ABSENT | |

**Do not conflate**: a *posted goods receipt* is a physical-arrival record, **not** usable stock; an incoming
QC *submission* is an observation record, **not** acceptance; formula drafts are **not** approved and
would not authorize production even if approved; **no available-stock balance exists** anywhere, so none may
be shown or computed.

---

## 5. Frontend readiness

Existing screen IDs are preserved from `docs/erp-screen-catalog.md`. (The separate UX blueprint under
`docs/ux/` proposes additional IDs for design-only areas; they are not catalog IDs.) Common states for all
API screens: loading skeleton; empty list; field-keyed 400 validation; **403** naming the missing
permission; **404** (no access/unknown, indistinguishable); **409** stale version → show and refetch, never
auto-retry; 401 → refresh once then login. No dashboard statistics endpoint exists — **do not invent one**.

### A. Ready for API integration (contract exists in `docs/frontend-api-handoff.md`)

| Module | Screen IDs | Pages / dialogs | Key behavior and dependencies |
|---|---|---|---|
| Auth/session | AUTH-01, NAV-01, NAV-02, NAV-03 | login; company/store switcher; my-permissions; store overview | CSRF→login→me→mine lists; permissions re-fetched per company/store |
| Administration (SU) | ADM-01–14 | users, memberships, companies, permission catalog, roles, stores, store roles/memberships | superuser only; role permissions replaced by PUT |
| Catalog/locations | CAT-01–04 | units, categories, materials, locations | reads need catalog/location permissions; writes SU |
| Suppliers | SUP-01, SUP-02 | list, detail | SU only |
| Purchase requests | PR-01–05 | list, create, detail (+approval history tab), decision dialog | material lookup; 3-step approval; V + round + step |
| Purchase orders | PO-01–05 | list, create from approved PR, detail, issue snapshot, issue dialog | supplier lookup; V |
| Goods receiving | GR-01–07 | list, create, detail, eligible-PO picker, post/cancel dialogs | store + company dual access; idempotency key; delivery progress |
| Incoming QC drafts | QC-01–05 | list, create, detail, eligible-lines picker, cancel dialog | store QC permissions; freeze on submit |
| Specifications (SU) | SPEC-01–05 | list, detail, version editor, dialogs | three version-like values must not be conflated |
| Customers | CUST-01–04 | list, create, detail/edit, activate dialog | V; code immutable |
| Products | PROD-01–04 | list, create, detail/edit, activate dialog | `sales_uom_id` lookup; inactive-unit badge |
| Quotation drafts | QUOT-01–03 | list, create/edit, detail | customer + product pickers (`customers.view`, `products.view`); **no accept/convert** |
| Sales orders | SO-01, SO-02, SO-03, SO-04, SO-05, SO-06 | list, editor, detail, Order Review panel, confirm dialog, policy page (SU) | preview is informational; confirm needs `sales_orders.confirm` and a configured policy; expected_version held in state |
| Formula drafts | FRM-01–05 | list, detail (+revisions), create, revision editor (raw + packaging tables, one atomic save), new revision | **material picker needs `shared_catalog.view` via a store**; four version-like values |

### B. Can be designed now with clearly marked mock data (no backend)
Batch registration and batch list; formula-requirement view (mock factor arithmetic labelled as mock);
store requisition; packing/label/box/insert/printing fields; production and packaging status boards;
BMR; QC results/QA release; dispatch/invoice; dashboards/KPIs; notifications; audit viewer; traceability.
Mock data must be labelled "Design preview — no backend".

### C. Screens whose behavior depends on client decisions
Order-entry form (meaning of name/type/company); packing/label/box/insert inputs (type of each field);
batch number/sequence display and edit rules; requirement view rounding and fixed-quantity handling;
whether a draft/approved formula may be pinned; who may confirm orders and per-company policy answers;
quotation accept/convert; anything QC/QA-gated; invoice screens.

---

## 6. Open decisions, prioritized

**P0 — blocks the recommended next slices**
1. Rounding for fractional COUNT results (e.g. 12.5 caps at ×0.5): round up/down/nearest, per material or
   per packaging type; or reject fractional targets? (blocks any persisted requirement; the preview can show
   the exact value and a flag instead).
2. Fixed-per-batch materials, process loss, yield, waste, overage: none applied today; must be stated per
   material or globally before requirements are trusted.
3. What "company" means in the order and in the batch number: operating company (existing `Company`),
   customer, or brand — and therefore which `code` feeds `ABC-26-01`.
4. Order ↔ product ↔ batch cardinality: one order many products? one product many batches? one batch many
   orders? (also decides whether batch registration hangs off the sales order line or the order).
5. Whether the client's "order" is the existing customer `SalesOrder` or a distinct internal
   manufacturing/production order (decides reuse vs a new module).

**P1 — needed for the batch record**
6. Which date sets the batch year and whether the sequence resets yearly (order date, planned manufacturing
   date, registration date); padding/overflow beyond 99; manual correction rights; gaps on cancelled batches.
7. Meaning and type of each of: name, type, packing type, label, box, insert, packing size, batch size, MRP
   (quantities vs statuses vs artwork references vs text), and who edits each (Admin / Store Manager /
   Manager are not permission mappings yet).
8. Whether a DRAFT formula revision may be used at all for a batch, or an approval is required first — and
   what "formula approval" requires (approvers, contributors, tests; nothing exists).

**P2 — needed for stock-touching work**
9. Legal ownership of material in the shared store and cross-company consumption/allocation rules.
10. Whether QC acceptance is required before material counts as available; QC/QA release gates; production
    and dispatch authorization; QC/QA document formats (pending).
11. Requisition semantics: request to store vs reservation vs issue; whether a requisition can exist without
    a stock ledger.
12. Order confirmation policy answers per company; who receives `sales_orders.confirm` (Admin is only the
    "likely confirmer"); cancellation policy.

**P3 — later**
13. Dispatch Yes/No meaning and authorization; invoice format and whether it precedes dispatch; Tally.
14. Quotation acceptance/conversion policy; company-scoped vs shared masters; business timezone (assumed
    Asia/Kolkata).

---

## 7. Recommended dependency-ordered next tasks

1. **Formula requirement preview (smallest slice; no migration).** A read-only endpoint on the formula
   module: given a formula revision and a target output quantity (same unit as the revision's output),
   return each line's exact Decimal quantity = `line.quantity × target ÷ base_output_quantity`, the factor,
   the stored snapshots, and a per-line flag `whole_number` (false when a COUNT-unit result is fractional).
   No persistence, no stock, no reservation, no rounding, no fixed/loss/yield logic; the response states
   "proportional scaling only — fixed quantities, losses and rounding rules not applied". Permission
   `formulas.view`; works for DRAFT revisions and is labelled as a preview. Reuses formulas unchanged.
   *Decisions that affect it*: only #1 and #2 (both handled by *not* deciding: it flags rather than
   rounds), plus how to word the client's illustrative example (kept as test data, not as specification).
2. **Client decisions workshop** on P0/P1 items 3–7 (a short written questionnaire drawn from §6).
3. **Formula approval (the actual Task 11C, after a real brief exists).** Needs decision #8 and contributor/
   approver rules; add a status transition and an explicit permission, never inferred from Admin.
4. **Manufacturing batch draft** linked to a sales order line (or order) and a pinned formula revision, with
   the counter-based batch number (`CODE-YY-NN`) generator; additive to `SalesOrder`, no duplicate order
   module. Needs #3, #4, #5, #6 (and #8 for pinning rules).
5. **Order/packaging header fields** (planned manufacturing date, packing type, label/box/insert,
   printing status) — only after #7 defines their types.
6. **Store requisition document (no stock effect)** and status. Needs #11.
7. **Stock ledger foundation** (receipt-to-stock via QC acceptance, statuses, locations, ownership). Needs
   #9, #10. Then reservation → physical issue → consumption → return-to-store as separate steps.
8. Production/packaging/BMR status, then QC/QA release, dispatch, invoice, Tally — each behind its own
   client decisions.

Rejected shortcuts: duplicating `SalesOrder` as a second order module; computing "available stock" from
receipts; treating QC submission or formula existence as authorization.

---

## 8. Evidence and limitations

**Method**: static reading of models, services, serializers, view classes, URL files, migration file names
and permission seeds; `find -newer` comparison of file times against retained logs. Nothing was executed.

**Test evidence** (categories: *test code exists* / *previous run reportedly passed* / *captured completed run passed* / *unavailable*). Counts below are **per module and are not additive**; the only combined total is quoted from its own single run.

| Module (test file) | Test methods in file | Evidence category | Source |
|---|---|---|---|
| Sales-order confirmation + preview + sales orders | 55 + 18 + 56 | **Captured completed run passed**: 129 tests, OK, exit 0 (one combined run) | `/tmp/final_10f.log`, 2026-09-24 ~11:59 (code unchanged since: no `.py` newer than the log) |
| Formulas | 47 | **Captured completed run passed**: 47 OK | `/tmp/formula_final.log`, 2026-09-24 11:03 |
| Quotations | 51 | **Captured completed run passed**: 51 OK | `/tmp/quotation_final.log`, 2026-09-24 10:42 |
| Seed demo data | 8 | **Captured completed run passed**: 8 OK | `/tmp/seed_test.log`, 2026-09-24 11:11 |
| Customers 63, products 65 | 63, 65 | Previous run reportedly passed | `docs/backend-tasks.md` (63/63, 65/65, exit 0) — log not retained |
| Purchase requests, purchase orders, receiving, incoming inspections, material specs, catalog, auth, users, companies, roles, stores, permissions, suppliers, storage locations | see the counts in `tests/` (purchase requests 127, purchase orders 96, receiving 64, incoming inspections 77, material specs 52, catalog 90, auth 45, users 9+81, companies 32+57, roles 48, stores 90, permissions 45, store permissions 60, suppliers 66, storage locations 46) | Previous runs reportedly passed (per task docs, e.g. 127/127, 96/96, 64/64, 77/77, 52/52) | `docs/backend-tasks.md`; logs not retained |
| Older full suite | — | *(Updated by Task 11D: the stale 958 claim in `frontend-api-handoff.md` §0.5/§14 and `frontend-build-sequence.md` was corrected to historical Task 09A evidence.)* **Last full suite reportedly passed 958/958 at Task 09A**; **no full-suite result exists for the current code** (many later modules were verified only in separate, per-module runs). `frontend-api-handoff.md` §0.5 still quotes 958 — stale as a statement about today's code | `docs/backend-tasks.md` |
| Superseded logs | — | `/tmp/conf_test.log` (73 tests, **1 failure**, first run before a test fix) and `/tmp/preview_test.log` (17 tests for the **pre-10F preview contract**) are **historical, not evidence for current code**; `/tmp/pr_test_run1.log` is a partial log with no summary → **verification result unavailable** | logs |
| Task 11C | 0 | **No code, so no tests exist** | grep of `tests/` |

**Limitations**
- Tests were not re-run; a "reportedly passed" row is a recorded claim, not fresh proof, and later shared-code
  changes (e.g. permission seeds, settings, sales-order services) have not been re-verified against the older
  modules' suites.
- Route/permission tables were built from URL files and view classes; per-field request shapes are in
  `docs/frontend-api-handoff.md` and were not re-audited line by line here.
- Concurrency and audit behavior are described from service code and task documents; the retained logs prove
  test outcomes only for the modules listed as captured.
- A frontend dev server log exists in `/tmp` but no frontend source is in this repository, so frontend
  progress could not be assessed.
- No Task 11C brief could be found; if one exists outside this repository it was not considered.


---

## 9. Update - Task 11D (2026-09-25)

The recommended first slice was implemented: `GET .../formulas/<id>/revisions/<rid>/requirement-preview/?target_output_quantity=`
(read-only, `formulas.view`, no migration). Approval (Task 11C) is still **absent**; batches, requisitions,
ledger, reservation, issue, consumption and return remain **absent**. Evidence: one combined run of
`tests.test_formula_requirement_preview` + `tests.test_formulas`, **83 tests, OK, exit 0, 196.327s**
(`/tmp/preview11d_final.log`). See `docs/backend-tasks.md` (Task 11D) for the details and remaining decisions.

## 10. Update - Task 11C (2026-09-25)

Formula revision approval was implemented: policy `GET/PATCH /companies/<id>/formula-approval-policy/` (active
superuser), `GET .../revisions/<rid>/approval-preview/` (`formulas.view`), `POST .../revisions/<rid>/approve/`
(`formulas.view` + `formulas.approve`). Contributor tracking with a provable-history backfill; approved revisions are
immutable; the requirement preview is status-aware. Batches, requisitions, ledger, reservation, issue, consumption and
return remain **absent**. Verification: one combined run of tests.test_formula_approval (52) + tests.test_formula_requirement_preview + tests.test_formulas, 135 tests, OK, Python exit 0, 464.206s; manage.py check clean; makemigrations --check --dry-run: no changes; migrations formulas 0002/0003 and permissions 0018 applied to the dev DB. Open client decisions are listed in
`docs/erp-handoff-open-decisions.md` (Task 11C block).

## 11. Update - Task 12A (2026-09-29)

Manufacturing batch PLANNING DRAFTS were implemented: `GET/POST /companies/<id>/batch-plans/`,
`GET/PATCH .../batch-plans/<id>/`, `GET .../batch-plans/<id>/requirement-preview/` (`batch_plans.view/create/edit`,
seeded, assigned to nobody). A plan pins one sales-order line to one APPROVED formula revision (product/output unit
must match by identity) and a target output quantity; source drift is detected and reported, never silently applied;
`SalesOrderLine` deletion is protected with a clear 400, never a 500. No official batch number, MRP, stock effect,
requisition or production authorization exists. Verification: one run of tests.test_batch_plans, 33 tests, OK, Python exit 0, 214.355s (includes real-thread concurrency races); manage.py check clean; makemigrations --check --dry-run: no changes; migrations batch_plans 0001 and permissions 0019 already applied to the dev DB. Open client decisions are listed in
`docs/erp-handoff-open-decisions.md` (Task 12A block).

## 12. Update - Task 12A closeout + Task 12B/12B-1 (2026-09-29)

**Correction:** Task 12A's own closeout wrongly said `sales_orders` app code was not changed. It was -
`apps/sales_orders/services.py`'s `ProtectedError` -> 400 handler for a `BatchPlan`-referenced line is part of the
same earlier, unlogged pass that built `apps/batch_plans` (confirmed by file mtimes). Two HTTP-level test gaps were
closed in `tests.test_batch_plans` (an authenticated PATCH removing a referenced line: 400, line intact, other
edits rolled back, no audit row; list/detail never expose formula lines). 2 new tests, OK, exit 0, 6.3s; no app code
changed, so the 33-test file run was not repeated.

**Task 12B** mapped the client's plain-English register fields against the real code, read-only, no schema change -
see `docs/client-register-field-mapping.md`.

**Task 12B-1**, given the client's actual Excel headers and one sample row, added `Product.product_type` (free
text, no enum; `apps/products/migrations/0002_product_product_type.py`), exposed through the existing Product API
and confirmed not to silently affect any historical quotation/order/formula/batch-plan snapshot. Documented, without
fixing or relaxing: Task 12A's same-unit rule correctly rejects the client's own sample (bottles vs. kilograms), and
the client's own numbers do not reconcile exactly (3024 x 25 g = 75.6 kg computed vs. 76 kg recorded) - both recorded
as unresolved. Verification: `manage.py check` clean, `makemigrations --check --dry-run` no changes, one run of
`tests.test_products` (69 tests, OK, exit 0, 272.627s). See `docs/backend-tasks.md` Task 12B-1 and
`docs/client-register-field-mapping.md` for the full field-by-field mapping and pending-fields list.


## 13. Update - Task 12B-2 (2026-09-29)

Batch plans can now represent a bottle-sold product manufactured in kilograms: `UnitOfMeasure.canonical_factor`
(explicit, optional, immutable, never silently assigned) lets `apps.batch_plans` convert an explicit packing
relationship (`planned_pack_quantity` + `packing_content_quantity` + `packing_content_uom`) into the formula's own
output unit; `apps.formulas` formula revisions can now be given an explicit output unit independent of the product's
sales unit; formula approval no longer wrongly requires the two to match. A read-only `packing_assessment` (plan
detail and requirement preview) reports the computed expected packed content and a signed, clearly-labeled
"Planning quantity difference" against the explicit manufacturing target - never derived, never auto-corrected.
Material requirement calculation is unchanged in principle: it still scales by the explicit target only. Verification:
one combined run of tests.test_batch_plans (52) + tests.test_formulas + tests.test_formula_requirement_preview + tests.test_formula_approval + tests.test_catalog + tests.test_products, 358 tests, OK, Python exit 0, 733.727s; manage.py check clean; makemigrations --check --dry-run: no changes; migrations catalog 0002 and batch_plans 0002 applied to the dev DB. Batches, requisitions, ledger, reservation, issue, consumption, return, official batch numbering and
production authorization remain **absent**. Open client decisions are listed in `docs/erp-handoff-open-decisions.md`
(Task 12B-2 block) and `docs/client-register-field-mapping.md`.


## 14. Update - Task 12C (2026-09-29)

Store Managers can now record confirmed preparation information (Packing Type, insert-required) against an existing
`BatchPlan`, at a shared store, via `GET/POST /stores/<store_id>/preparations/` and `GET/PATCH .../preparations/<id>/`
(`store_preparation.view/create/edit`, seeded, assigned to nobody, plus `batch_plans.view` in the plan's own
operating company - store access alone never reveals a company's plans). Exactly one preparation record per plan is
enforced at the database level (a working structural choice, not a confirmed multi-store policy). The API exposes
only minimal plan/order/product context - never formula lines, recipe quantities or prices - and never mutates the
source `BatchPlan`. Verification: one run of tests.test_store_preparation, 43 tests, OK, Python exit 0, 112.160s (includes a real-thread concurrent-duplicate-creation race); manage.py check clean; makemigrations --check --dry-run: no changes; migrations permissions 0020 and store_preparation 0001 applied to the dev DB; no shared app code changed, so the prior 358-test baseline was not repeated. Label/Box values, insert quantity/readiness/artwork tracking, requisition
lifecycle, and official batch numbering remain **absent**. Open client decisions are listed in
`docs/erp-handoff-open-decisions.md` (Task 12C block) and `docs/client-register-field-mapping.md`.


## 15. Update - Task 12D (2026-09-29)

Batch plans can now receive an explicit, audited official batch number: `POST /companies/<id>/batch-plans/<pid>/
allocate-number/` (`batch_plans.view` + `batch_plans.allocate_number`, seeded, assigned to nobody). Format
`CODEYY-NNN` using the SOURCE ORDER's customer code (never the operating company's own code) and the allocation
year (never the order date or planned manufacturing date) - both client-confirmed rules. The sequence is namespaced
per `(operating company, client code, year)` - a working choice, not a confirmed cross-company uniqueness claim -
and is allocated under a real, deadlock-safe lock, never an unlocked `MAX()+1`. Once allocated, a number is
permanently immutable: no edit, clear, regenerate, cancel, or reuse path exists anywhere. Verification: one combined run of tests.test_batch_number_allocation (36) + tests.test_batch_plans, 90 tests, OK, Python exit 0, 221.615s (includes real-thread races: distinct sequential numbers for two concurrent plans, safe first-counter-row creation, two callers racing one plan, an order-customer change waiting for an in-flight allocation); manage.py check clean; makemigrations --check --dry-run: no changes; migrations batch_plans 0003 and permissions 0021 applied to the dev DB; no other app's code changed, so the prior 358-test baseline was not repeated.
Stock issue, production, QC release, packaging, dispatch and invoicing remain **absent**. Open client decisions are
listed in `docs/erp-handoff-open-decisions.md` (Task 12D block) and `docs/client-register-field-mapping.md`.
