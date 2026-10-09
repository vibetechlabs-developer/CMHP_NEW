# Shared Store Material Register — Design Assessment and Prototype

**Status: design proposal + offline prototype only.** Nothing in this document or its companion prototype
(`docs/material-register-design/index.html`) has been implemented, migrated, staged, committed, or deployed.
No application code, model, API, permission, account, or database record was changed while producing it. All
example figures (materials, quantities, suppliers, batch numbers) are synthetic — none were copied from any
earlier conversation, file, or client-supplied document.

Companion docs this builds directly on: `docs/shared-store-inventory-plan.md` (Task 13B design), `docs/backend-tasks.md`
(Task 13C, "Physical Receipt Ledger Foundation" — the one slice of 13B actually built), `docs/erp-handoff-open-decisions.md`
(§A1, A5–A11, Task 13A/13C entries), `docs/client-register-field-mapping.md`, `docs/incoming-qc-proposal.md`,
`docs/incoming-qc-review-proposal.md`, `docs/receiving-proposal.md`, `docs/purchase-order-proposal.md`,
`docs/purchase-workflow-proposal.md`.

---

## 1. Existing capabilities (verified, with code references)

### 1.1 Catalog — materials, units, conversions

- `Material` (`backend/apps/catalog/models.py:141-224`) — shared across both companies (no company-owner FK, by design, docstring
  lines 144-149), `code`/`kind` (`RAW_MATERIAL`/`PACKAGING_MATERIAL`, lines 152-154)/`base_unit` all immutable after creation
  (`clean()`, lines 182-209). **No stock-quantity field exists on this model at all** (explicit, line 148).
- `UnitOfMeasure` (`catalog/models.py:7-94`) — `code`/`dimension` (`MASS`/`VOLUME`/`COUNT`)/`canonical_factor` all immutable once set
  (lines 33-36). `canonical_factor` exists only for same-dimension conversion (e.g. grams↔kilograms), never mass↔volume, and is
  `null` by default, never silently assigned (lines 22-26).
- `MaterialCategory` (`catalog/models.py:97-139`) — flat, optional, no hierarchy.

### 1.2 Shared stores and memberships

- `SharedStore` (`backend/apps/stores/models.py:8-48`) — one physical store, no owning-company FK (store access is a separate axis
  from company membership, docstring lines 9-16). Establishes *identity only* — explicitly, "item masters, stock quantities,
  ownership accounting... are a separate, future task and are not represented here at all" (lines 14-15).
- `StoreMembership` (`stores/models.py:67-124`) — a user's access to one store, independent of `CompanyMembership`.
- `StorageLocation` (`stores/models.py:127-181`) — a shelf/room/bin inside exactly one store, free-text identity only; "no
  company-owner FK and no stock-quantity field... a location is never itself a QC verdict" (lines 134-137).

### 1.3 Suppliers, purchase orders, goods receiving

- `Supplier` (`backend/apps/suppliers/models.py:8-96`) — shared directory, `is_active` means only "in use," **never** "qualified/
  approved to supply" (docstring lines 11-16; confirmed unchanged everywhere it's read, e.g. `purchasing/services.py:920-922`).
  No qualification/approval-status concept exists anywhere (`docs/erp-handoff-open-decisions.md` §A8, confirmed by direct
  code inspection, not just the doc).
- `PurchaseRequest` (`backend/apps/purchasing/models.py:10-125`) — `DRAFT/SUBMITTED/APPROVED/REJECTED/CANCELLED`; exactly three
  sequential approval steps, all decided by `purchase_requests.approve` holders, self-decision permanently banned
  (`services.py:539-585`). No price on a request line at all.
- `PurchaseOrder` (`purchasing/models.py:325-636`) — `DRAFT/ISSUED/CANCELLED`, **single-permission issue** (`purchase_orders.issue`),
  no multi-step approval (docstring lines 373-383). `company` always equals the source request's company — no cross-company
  purchasing (lines 332-343, PROPOSED, not client-confirmed). `currency_code` shape-checked at creation but **only INR/USD/EUR/GBP
  may actually be issued** (`services.py:1224,1388-1396`). No tax/GST/discount/freight anywhere.
- `GoodsReceipt` (`backend/apps/receiving/models.py:11-143`) — `source_purchase_order` is a **required, non-nullable FK**
  (lines 62-64): **a receipt without a PO is not supported by any code path today** — `create_goods_receipt`
  (`services.py:172-274`) requires it and requires the PO's status to already be `ISSUED`. `DRAFT/POSTED/CANCELLED`.
- **Over-delivery tolerance: none.** `post_goods_receipt` (`receiving/services.py:364-494`) sums every other `POSTED` line against
  the same PO line (across every store) and rejects any cumulative overage with a `400`, even by 0.001 of a unit (exact check at
  lines 436-457). This is a PROPOSED POLICY (`docs/erp-handoff-open-decisions.md` §A5), not client-confirmed, but it is what
  the code enforces today.
- `GoodsReceiptLine` (`receiving/models.py:145-213`) — `received_quantity` (positive, 3dp), `lot_reference` (optional free text,
  supplier-supplied only, **never fabricated** — docstring 168-173), no manufacturing/expiry date field at all.

### 1.4 Incoming QC

- `IncomingInspection` (`backend/apps/quality/models.py:11-167`) — status is **exactly** `DRAFT`/`SUBMITTED`/`CANCELLED`
  (lines 79-82, confirmed in code, not just docstring). **No ACCEPTED/REJECTED/RELEASED status exists anywhere.** Linked to one
  `GoodsReceiptLine`; one active (non-cancelled) inspection per line, enforced by a database constraint
  (`UniqueConstraint(..., name="one_active_incoming_inspection_per_receipt_line")`, lines 127-133). Submission (`DRAFT→SUBMITTED`,
  `services.py:307-397`) freezes the record permanently — **it decides nothing about acceptance, rejection, or release.** A grep
  for "release"/"disposition"/"accept"/"reject" as actual status values across the whole app returns zero hits — every
  occurrence is prose explicitly *disclaiming* such a concept exists (e.g. `models.py:19-25,174,240`).
- A full disposition/release design exists only as an **unbuilt proposal**: `docs/incoming-qc-review-proposal.md` describes an
  extended `DRAFT→SUBMITTED→UNDER_REVIEW→DECIDED` status plus a new `IncomingInspectionRound` model with
  `ACCEPTED`/`PARTIALLY_ACCEPTED`/`REJECTED` outcomes — **none of this is implemented.** This document does not assume any part
  of it exists.

### 1.5 The physical receipt ledger (Task 13C) — what is actually live today

- `StockMovement` (`backend/apps/stock_movements/models.py:6-135`) — append-only, immutable (`clean()` rejects any save on an
  existing `pk`, `delete()` always raises, lines 120-134). **Exactly one movement type exists: `RECEIPT_IN`** (lines 73-74) — the
  enum has room for `REVERSAL`/`ADJUSTMENT` later, but no code creates them today. **No `MaterialLot` table** — `source_receipt_line`
  (a `OneToOneField` to `GoodsReceiptLine`, line 81-83) is the *only* lot-identity concept, and it does not resolve "are these two
  receipts the same physical supplier lot" at all (two receipts with identical supplier lot text produce two unrelated internal
  identities, by design — docstring lines 32-38). **No QC/release/hold field anywhere on this model** (lines 23-26). **No
  reservation, issue, consumption, return, or requisition-fulfilment concept** (line 27-28). **No location field** (lines 29-31,
  confirmed `GoodsReceiptLine` itself never captures one). `source_company` is documented, explicitly, as receiving/purchasing
  context only — never a legal-ownership claim (lines 19-21).
- Creation (`backend/apps/stock_movements/services.py:14-52`, `create_receipt_in_movements`) is called from inside
  `post_goods_receipt`'s own transaction (`receiving/services.py:467-475`), exactly once per line, only on the real DRAFT→POSTED
  transition — never on an idempotent repost retry, never backfilled for a receipt posted before this feature existed.
- Balances (`stock_movements/services.py:81-108`, `compute_stock_balances`) are a `Sum(quantity)` grouped by
  **`(material, unit, source_company)`** — never collapsed across unit or company — and are labeled, everywhere, strictly as
  `"recorded_receipt_quantity"`. **Never `available_stock`/`usable_stock`/`on_hand`.** This document follows that same
  discipline throughout.
- Read-only API: `GET /api/v1/stores/<store_id>/stock-movements/`, `GET /api/v1/stores/<store_id>/stock-balances/`. Gated by the
  **store-scoped** permission `stock.view` (`stock_movements/views.py:17`, checked via `store_user_has_permission`) **plus** the
  **company-scoped** `purchase_orders.view` on each movement's own `source_company`, filtered before aggregation
  (`companies_with_receipt_view_access`, `services.py:55-66`) — a caller never sees, or sums into a total, a company's receipts
  they cannot see.

### 1.6 Material requisitions and batch numbering (verified earlier this project; summarized here for completeness)

- `MaterialRequisition` (`apps/material_requisitions`) — currently `DRAFT`/`SUBMITTED`/`APPROVED`/`REJECTED` lifecycle exists at
  the model level (Tasks 13A/15A), but **creating or submitting a requisition causes zero stock movement** — confirmed: no code
  in `apps.material_requisitions` imports or references `apps.stock_movements` at all. One requisition per `BatchPlan`
  (`OneToOneField`, a working limitation flagged for client review).
- `BatchNumberAllocation` (`apps/batch_plans`) — official batch number, one-way, immutable, **never changes `BatchPlan.status`**
  and authorizes nothing.

### 1.7 Existing frontend

- `frontend/src/features/store/StoreMaterialsWorkspace.jsx` is the **real, backend-wired** register-adjacent screen — three tabs:
  **Materials** (full catalog CRUD, search/kind/active filters, server-side pagination — `MaterialsTab.jsx:111-213`),
  **Locations** (read-only list), and **Recorded Receipts** (`ReceiptsTab`, `StoreMaterialsWorkspace.jsx:172-270`), which already
  calls the two Task 13C endpoints via `storeService.js` (`listRecordedReceipts`/`listRecordedReceiptBalances`,
  `storeService.js:72-84`) and shows a prominent coverage banner: *"Recorded receipts only. Opening stock, issues, returns and
  QC release are not included."* This is the **one and only** frontend surface currently calling the real stock-movement
  endpoints, and it explicitly does not claim to be a full register.
- `frontend/src/features/inventory/`, `frontend/src/features/supplyChain/`, and `frontend/src/features/quality/` are **mock-data
  prototypes**, not connected to the real API — `inventory` is not even routed into the app (`AppRoutes.jsx` routes `/inventory/*`
  to the real `StoreMaterialsWorkspace`, not to this module); `supplyChain`/`quality` are routed only behind a hardcoded
  `SHOW_DEMO_MODULES = true` flag. None of the three should be read as existing implementation — they are useful *visual*
  references only (see §4's reuse notes).
- Shared theme: `frontend/src/cmhp-reference.css` (`--ref-blue #1478c9`, `--ref-navy #163b59`, `--ref-text #405b70`,
  `--ref-border #dce7ee`, Inter/Segoe UI font stack). Shared layout classes: `Inventory.css`'s `.inv-*` vocabulary
  (`.inv-panel`, `.inv-tabs`, `.inv-table`, `.inv-chip*`, `.inv-kpi`), already used by both the real `StoreMaterialsWorkspace` and
  the mock `Quality.jsx`. The only existing print pattern in the whole frontend is `BmrPanel.jsx`/`BmrPanel.css`'s
  `window.print()` + a scoped `@media print` block.

### 1.8 Summary — implemented / partial / absent

| Capability | Status |
|---|---|
| Material/unit master, same-dimension conversion | **Implemented** |
| Shared store identity, membership, storage locations | **Implemented** (locations have no stock concept) |
| Supplier directory | **Implemented** (no qualification workflow) |
| Purchase request → purchase order (3-step approval, single-permission issue) | **Implemented** |
| Goods receipt posting, PO-bound, zero over-delivery tolerance | **Implemented** |
| Incoming QC inspection drafting + one-time submission | **Implemented** (freezes nothing beyond itself) |
| QC disposition / release / accept / reject | **Absent** (proposal only, `incoming-qc-review-proposal.md`) |
| `RECEIPT_IN` stock movement, created automatically on posting | **Implemented** |
| Recorded-receipt balance (by material/unit/company) | **Implemented**, explicitly not "available stock" |
| Opening-stock import | **Absent** |
| Outward issue movement | **Absent** |
| Returns / defective-material movement | **Absent** |
| Physical count / adjustment movement | **Absent** |
| Reservation | **Absent** |
| Cross-company ownership / transfer | **Absent** (open question, §A1) |
| Material requisition lifecycle | **Partial** (status exists; zero stock effect) |
| Frontend: recorded-receipts read view | **Implemented** (`ReceiptsTab`) |
| Frontend: full register (inward+outward+returns+counts+history+balance) | **Absent** |

**Per the task's own instruction: the existing recorded-receipt figure is not treated as usable stock anywhere in this document.**
It is one input into a *proposed* book balance (§3), clearly distinguished from a QC-released/usable quantity that does not exist
in this codebase today.

**BMR is explicitly out of scope for this document** and is not claimed complete or referenced as a dependency anywhere below.

---

## 2. Manual register structure (anonymized, as supplied)

| Section | Fields |
|---|---|
| **Header** | Material code, Material name, Container/pack description (meaning to be confirmed) |
| **Inward** | Receipt date, Supplier invoice/other reference, Supplier/source, Received quantity, Container count and size, Price (basis unresolved) |
| **Outward** | Issue date, Manufacturing batch number, Product, Issued quantity, Remark |
| **Physical** | Manually written quantities/notes — exact meaning and count dates not yet confirmed |

**Important, explicitly preserved in every proposal below**: inward and outward entries shown side-by-side on the client's
spreadsheet are **two independent lists**, not linked rows. This document never infers a lot allocation from row alignment,
and never treats a manufacturing batch number as if it were a supplier lot number — those are different identities tracked
by different parts of this system (`BatchNumberAllocation` vs. a supplier's own `lot_reference` text) and nothing here merges
them.

---

## 3. Proposed Material Register screen

### 3.A Material list

- Search by code/name (reuses `features/store/MaterialsTab.jsx`'s existing search box and `GET /v1/materials/?search=`).
- RM/PM filter (existing `kind` query param).
- Active/inactive filter (existing `is_active` query param).
- Server-side pagination (existing `page`/`page_size` params — already built for the future integrated screen, per the task's
  own instruction).
- Optional A–Z ordering — **optional only**, never a compulsory grouping; the manual register's alphabetical filing was
  convenience, not a business rule, and this design does not reintroduce it as one.
- **No duplicate material master per product.** `Material` is already shared/company-independent (§1.1) — this screen reads
  that one existing catalog, it does not propose a second one.

### 3.B Material detail header

- Code, name, type (RM/PM), base unit — straight from `Material`.
- Selected store — a register is always "this material, at this store" (a shared material can exist at more than one
  `SharedStore`, though today only one store is seeded in this project's data).
- Date range — scopes which movements/counts the detail view shows.
- **Physical location vs. legal ownership, kept visibly distinct** (same separation `docs/shared-store-inventory-plan.md` §2
  already established and this document inherits unchanged): the header shows the physical store/location; it never shows or
  implies an "owner" field, because none exists anywhere in this codebase (§1.2, §A1).

### 3.C Register sections and summary figures

Five sections, matching the manual register's own structure plus the one addition the client explicitly asked for
(movement history):

1. **Inward** — proposed fields in §4.
2. **Outward** — proposed fields in §5 (not built as an API in this task, per instruction).
3. **Returns and defective material** — proposed, no backing model exists yet (§6).
4. **Physical counts and adjustments** — proposed, no backing model exists yet (§6, §7).
5. **Movement history** — a single dated, unified view merging 1–4 once they exist; today it would show only `RECEIPT_IN` rows
   (the one real movement type), which is exactly what the existing `ReceiptsTab` already renders.

**Proposed summary figures** — shown as *proposed features*, never claimed to be backed by data that doesn't exist yet:

| Figure | Source today | Status |
|---|---|---|
| Opening book balance for the period | A migration/import entry (not yet built) | **Proposed, not computable yet** |
| Receipts | `SUM(RECEIPT_IN)` in the period | **Computable today** (§1.5) |
| Issues | A future `ISSUE` movement type | **Proposed, not computable yet** |
| Returns | A future `RETURN` movement type | **Proposed, not computable yet** |
| Other posted adjustments/movements | A future `ADJUSTMENT`/`REVERSAL` movement type | **Proposed, not computable yet** |
| Closing book balance | Opening + Receipts − Issues + Returns ± Adjustments | **Proposed, not computable yet** (depends on all of the above) |
| Latest physical count and count date | A future physical-count record | **Proposed, not computable yet** |
| Difference at the count's cutoff | Closing book balance (at that date) − physical count | **Proposed, not computable yet** |

**Explicit restraint, matching `docs/shared-store-inventory-plan.md` §3's own precedent**: this design does **not** propose a
"usable"/"held"/"reserved" quantity anywhere, because none of QC release, reservation, or issue exists in this codebase (§1.4,
§1.5). Where the prototype (§9) shows such a figure, it is clearly synthetic and labeled "not yet implemented," never a
plausible-looking zero.

**Arithmetic safety rules, carried through every section above:**
- Never sum incompatible units — every aggregation in this design groups by `(material, unit)` at minimum, mirroring
  `compute_stock_balances`'s own existing `(material, unit, source_company)` grouping (§1.5).
- Never combine physical counts taken on different dates into one number — each count is its own dated snapshot; a "latest"
  count is a pointer to one specific dated row, never an average or roll-forward of several.
- A migration-created **opening-stock entry** and a report's **calculated opening balance** are different things and are
  never conflated: the former is one explicit, dated row a human entered once; the latter is whatever the book-balance formula
  above computes for a chosen period start, which could legitimately differ from the opening-stock entry if later movements
  fall before the report's own window.

---

## 4. Inward design

Proposed fields for a future inward posting view (which **reuses** the existing goods-receipt posting path — see §4's closing
note — rather than creating a second one):

| Field | Source |
|---|---|
| Store | `GoodsReceipt.store` (existing) |
| Receipt date | `GoodsReceipt.arrived_at` / `StockMovement.posted_at` (existing) |
| Source document/reference | `GoodsReceipt.reference` / the linked `PurchaseOrder` reference (existing) |
| Supplier/source | `PurchaseOrder.supplier` (existing) |
| Material | `GoodsReceiptLine.material` (existing) |
| Received quantity and unit | `GoodsReceiptLine.received_quantity`/`unit` (existing) |
| Container count and individual size | **Not implemented anywhere today** — `GoodsReceiptLine` has no container-count/size field; new fields, if confirmed needed (§8) |
| Receiving/purchasing company context | `GoodsReceipt.company` (existing — documented as context only, never ownership, §A1) |
| Notes | `GoodsReceipt.notes` (existing) |
| Supplier lot/expiry/location | **Decisions required, not assumed** — see §8 |

**Reuse, not duplication — stated explicitly per the task's instruction**: this design does **not** propose a second,
independent "receive material" action. `apps.receiving.services.post_goods_receipt` is the one existing posting path that
already creates the one real stock movement type (`RECEIPT_IN`, §1.5); any future inward-register feature should read from it
and, where a genuinely new inward scenario is needed (below), extend it additively — never bypass it with a parallel write
path that could double-count the same physical delivery.

**Non-PO receipts, opening stock, and invoice-less receipts — separate, currently unsupported workflows, listed and not
invented:**

- **Non-PO ("free") receipts.** `GoodsReceipt.source_purchase_order` is a required, non-nullable FK (§1.3) — the system cannot
  record a receipt without an `ISSUED` PurchaseOrder behind it today. Whether the client ever receives material with no PO at
  all (e.g. a donated sample, a goodwill replacement) is unanswered; this document does not propose relaxing the FK without
  that answer, since doing so would also need its own access/audit story.
- **Opening stock** (material already in the warehouse before this system's ledger existed). This is explicitly **not** the
  same thing as a posted receipt (§1.5 — the Task 13C model has zero concept of it). `docs/shared-store-inventory-plan.md` §6
  already specifies a column-level import template for this (`material_code`/`store_code`/`owning_company_code`/`quantity`/
  `unit_code`/`location_code`/`lot_reference`/`as_of_date`/`notes`) — this document defers to that specification rather than
  re-designing it, and notes it is still unbuilt.
- **Receipts without a supplier invoice** (e.g. the delivery note is the only paper that exists at the time of receiving). Today
  `GoodsReceipt` has no required invoice-number field at all (only an optional `delivery_note_reference` and the PO itself) — so
  this scenario is already partially accommodated structurally, but whether the client's own process requires a specific
  invoice-reference field to exist and be filled in later is unanswered (§8).

**Price — deliberately kept out of the quantity design.** The manual register's inward "Price" field basis (per kg? per
container? total for the line?) is explicitly **not** assumed by this document (§8). `PurchaseOrderLine`/`PurchaseOrderIssueLineSnapshot`
already carry a `unit_price` (purchasing currency, §1.3) — but that is a *commercial* figure tied to the purchase order, not
automatically the same number the client hand-writes on the physical register, and this document does not conflate the two.
Inventory *quantity* tracking (this whole document) and *valuation* (costing, landed cost, moving average, etc.) are kept as
separate concerns; nothing here proposes a valuation model.

---

## 5. Outward design

**No issue API is built in this task, as instructed.** This is the proposed shape for a future one:

A future **Issue document** (header) with one or more **lines**, each line linked to:

| Field | Notes |
|---|---|
| Store | Existing `SharedStore` |
| Operating company | Existing `Company` |
| Batch plan | Existing `BatchPlan` |
| Product | Existing `Product` (via the batch plan) |
| Requisition | **Where required by the eventual policy** — `MaterialRequisition`/`MaterialRequisitionLine` already exist (§1.6) but have zero stock effect today; whether an issue must reference one, may optionally reference one, or is entirely independent of one is an open policy question (§8), not assumed here |
| Material and unit | Existing `Material`/`UnitOfMeasure` |
| Actual issued quantity | New — the issue's own number, **never** inherited from `MaterialRequisitionLine.requested_quantity` (that figure can drift after a requisition is drafted — see `docs/shared-store-inventory-plan.md` §9's own explicit warning, carried through unchanged here) |
| Issue date | New |
| Issuer/receiver information | Per whatever the client's eventual policy requires (§8) — not assumed |

**One issue document, many lines — each line needs an unambiguous destination.** A single issue event (one piece of paper, one
act of handing material to production) may legitimately cover several materials or several batches at once; this design keeps
that as one header with several lines, each line individually and unambiguously tied to one destination batch allocation —
never a header-level "this whole document is for Batch X" assumption that would make a multi-batch issue ambiguous.

**Legacy entries naming multiple batches on one line — flagged, never guessed.** If a historical paper entry names two or more
batch numbers against one issued quantity, this design does **not** propose splitting that quantity equally or by any other
inferred rule. Such an entry is flagged for manual clarification before it could ever be imported or reconciled — the same
"never guess, never silently apportion" discipline this project applies everywhere else (e.g. `UnitOfMeasure.canonical_factor`
never inferred from unit names).

**Entries with no batch at all — not fabricated, asked about.** A legacy or future entry issued with no batch reference is not
assumed to be an error; it may be a delayed logging entry, a QC/testing sample, a maintenance use, or another authorized
purpose the client simply didn't capture a batch number for. This document proposes asking the client which of these apply
(§8) rather than inventing a placeholder batch or silently dropping the entry.

---

## 6. Stock rules — documented as proposed, none implemented

Restated exactly as instructed, each explicitly a **proposed rule**, not existing code behaviour (only "Receipt posting"
below is actually implemented — §1.5):

| Event | Physical store quantity | Implemented? |
|---|---|---|
| Order creation | No movement | N/A (true by construction — `SalesOrder` has no stock code path at all) |
| Requisition creation/approval | No movement | **True today** (§1.6 — confirmed zero stock effect) |
| Receipt posting | **Increases** | **Implemented** (`RECEIPT_IN`, §1.5) |
| Reservation, if adopted | No physical movement (an earmark only) | Not implemented |
| Material issue | Store quantity **decreases**, production custody increases | Not implemented |
| Production consumption | Never deducts from store a second time (consumption is a production-side event downstream of issue, not a second store deduction) | Not implemented (no production-execution model exists at all, confirmed — out of scope, consistent with BMR being out of scope) |
| Physical return (unused material back to store) | Store quantity **increases**; usability on return requires an agreed rule (§8) | Not implemented |
| Defective classification | Does **not** itself remove physical stock — classifying material as defective is a QC/record-keeping decision, not a movement | Not implemented (no defective-classification concept exists anywhere) |
| Supplier return / disposal | Physical quantity **decreases** when posted | Not implemented |
| Adjustment | A controlled movement, requiring a reason and an authorized actor — never a free-form balance edit | Not implemented |

**Balances must always come from traceable posted movements — never a directly-editable number.** This mirrors
`StockMovement`'s own existing immutability design exactly (§1.5: no `save()` on an existing row, no `delete()`, ever) and is
proposed to extend unchanged to every future movement type above: a mistaken posting is always corrected by a new, linked
`REVERSAL`/`ADJUSTMENT` row, never by editing or deleting the original.

**Preserve existing receipt history; no invented history.** Every `RECEIPT_IN` movement already created by Task 13C stays
exactly as it is. This document does not propose backfilling historical `GoodsReceipt`s that predate the ledger, and does not
invent an opening balance for them — pre-ledger stock is, if ever needed, captured as an explicit, separately-approved
opening-stock import (§4, deferring to `docs/shared-store-inventory-plan.md` §6), never silently synthesized from old receipts.

**Legal ownership and cross-company use remain unresolved (§A1) — restated as its own rule, not softened**: the receiving/
purchasing company recorded on a movement (`source_company`, §1.5) must never silently become read, anywhere in this design,
as the *owning* company. Every figure in §3's summary table that groups by company does so for *display/traceability*, not to
assert ownership.

---

## 7. Synthetic example

Material **RM-DEMO-01** (synthetic code/name), base unit **kg**. All figures below are fabricated for illustration only and
are never presented as live ERP data anywhere in this document or the prototype.

| Event | Quantity | Running book balance |
|---|---|---|
| Opening | 5 kg | 5 kg |
| Receipt | +2 kg | 7 kg |
| Issue to Batch DEMO-001 | −3 kg | **4 kg** |

**Physical count at the same cutoff: 3.9 kg.**

```
Difference = physical count − book balance = 3.9 − 4 = −0.1 kg
```

Shown as: **"Difference awaiting review."** This document and the prototype never automatically relabel this as wastage,
theft, or process loss — those are conclusions a human reviewer reaches, not a classification the system assigns from a
number alone. Recording the physical count by itself **never** alters the book balance.

**Optional, clearly-labelled simulation** (prototype only, never a real write): an authorized **"Simulate adjustment"** action
posts a −0.1 kg adjustment with a reason, producing a new book balance of **3.9 kg**, while the original physical count and
the adjustment itself both remain visible in the movement history — nothing is overwritten, matching §6's "corrections are
always a new linked row" rule.

---

## 8. Client questions

| Question | Why it matters | Answer | Decision status |
|---|---|---|---|
| What units are receipts and issues recorded in, and which conversions are permitted? | Determines whether `canonical_factor` conversions are ever needed inside the register itself, or only at batch-planning time as today | — | **Open** |
| Are there material grades/specifications needing their own unique codes, or does one `Material` code always mean one grade? | Affects whether the material master needs splitting for some items | — | **Open** |
| What does the "Container/pack description" field mean (e.g. "25 Gm G2")? | Needed before it can be structured as anything beyond free text (same open question already raised for `StorePreparation.packing_type`, Task 12C) | — | **Open** |
| What do the manually written "Physical" quantities mean, and on what date were they counted? | Required before any historical physical-count data can be imported or trusted | — | **Open** |
| What does the abbreviation "T.W." (or any other unexplained shorthand on the register) mean? | Cannot be mapped to any field without a definition; must not be guessed | — | **Open** |
| What is the Price field's basis — per kg, per container, or a line total? | Required before any valuation feature could be designed; kept entirely separate from quantity tracking until answered | — | **Open** |
| When one issue covers more than one batch, how should the quantity be allocated? | This document refuses to guess (equal split or otherwise) — see §5 | — | **Open** |
| Why do some historical issue entries have no batch number at all — delayed entry, sample, testing, maintenance, or something else? | Determines whether these are legitimate exceptions needing their own category, or data-entry gaps | — | **Open** |
| Can a receipt exist without a purchase order or without a supplier invoice? | `GoodsReceipt.source_purchase_order` is required today (§1.3/§4) — relaxing this is a real schema change, not a UI tweak | — | **Open** |
| What exact opening-stock detail is available (per-lot vs. one rolled-up figure per material/store), and how will it be verified? | Determines whether `docs/shared-store-inventory-plan.md` §6's import needs per-lot columns or accepts totals | — | **Open** |
| Does the client need supplier lot numbers and expiry dates tracked, and if so, from where (supplier declaration vs. QC measurement)? | `GoodsReceiptLine.lot_reference` is optional free text only today (§1.3/§A9); a real lot/expiry model is a separate build | — | **Open** |
| Does stock location need to be tracked at the shelf/bin level, or is store-level sufficient? | `StorageLocation` exists (§1.2) but nothing populates it from a receipt today | — | **Open** |
| How should material ownership and cross-company use be handled at this shared store? | The single most consequential open question (§A1) — almost every proposed field/rule above that mentions "company" is affected by the answer | — | **Open** |
| Who has authority to decide QC release, and at what point in the flow? | No release/disposition action exists anywhere yet (§1.4); this gates whether a "released/usable" figure can ever be shown | — | **Open** |
| What are the rules for partial issues and for issuing more than was requisitioned? | No issue model exists yet; needed before one can be designed | — | **Open** |
| What inspection and release process applies to returned material? | Determines whether a return should ever be counted as usable automatically, or always re-enters a QC-held state | — | **Open** |
| Who approves classifying material as defective, a supplier return, or a disposal? | No defective/return/disposal workflow exists yet; authority is unassigned | — | **Open** |
| What is the authorized cutoff and adjustment-approval process for physical counts? | Needed before any count-driven adjustment can be posted for real (§6, §7) | — | **Open** |

**Every row above is left explicitly unanswered, as instructed** — this document does not infer, default, or silently resolve
any of them.

---

## 9. Offline prototype

`docs/material-register-design/index.html` — a self-contained, dependency-free HTML/CSS/JavaScript page (no CDN, no build
step, no network calls). It demonstrates, with synthetic data only:

- A synthetic material list (search/RM-PM/active filters, client-side only — this is a static demonstration, not a live
  paginated API consumer).
- A full inward/outward/returns/physical-count register for one material (**RM-DEMO-01**), matching §7's worked example
  exactly.
- A unified, dated movement history merging every section.
- The book-balance-vs-physical-count example from §7, including the optional, clearly-labelled **"Simulate adjustment"**
  action (idempotent — a second click is a no-op once applied, so repeated clicks never duplicate the movement).
- Plain-English explanations of every quantity shown (opening/closing book balance, recorded receipt quantity, physical
  count, difference-awaiting-review).
- The §8 client-question checklist, rendered as its own tab.
- Print / Save-as-PDF support (browser print dialog), reusing the one existing print pattern in this codebase
  (`BmrPanel.jsx`/`BmrPanel.css`'s `window.print()` + scoped `@media print` block).
- A persistent banner: **"Proposed interface — synthetic demonstration data."**
- Every interactive posting-style action is labelled **"Simulate"** — nothing in this file calls any real API.

---

## 10. Compatibility with the current receipt ledger

- **No change to `StockMovement`, `GoodsReceipt`, or any existing table is proposed in this document.** Every figure described
  above as "computable today" reads the *existing* `compute_stock_balances`/`stock_movements_queryset` functions unchanged
  (§1.5).
- **Additive-only path forward.** A future register implementation would extend `StockMovement.MovementType` with new values
  (`ISSUE`, `RETURN`, `ADJUSTMENT`, `REVERSAL`, and whatever opening-stock mechanism is chosen) rather than replacing the model
  — exactly the extensibility the model's own docstring already anticipates (§1.5, "the enum exists so a future task can add
  `REVERSAL`/`ADJUSTMENT`... without a second migration renaming this field").
- **No double-counting risk from reusing the existing receipt path.** Because §4 explicitly reuses `post_goods_receipt` rather
  than proposing a parallel "receive material" action, there is no scenario in this design where the same physical delivery
  could ever produce two `RECEIPT_IN`-equivalent rows.
- **The existing `ReceiptsTab` frontend is not duplicated.** §9's prototype is a separate, standalone, offline file — it does
  not call any real endpoint, and a future real implementation should extend `StoreMaterialsWorkspace.jsx` with new tabs
  (Outward/Returns/Physical/History) alongside the existing Materials/Locations/Recorded Receipts tabs, reusing
  `storeService.js`'s existing two calls rather than introducing a second data-fetching layer (§1.7).

---

## 11. Missing backend capabilities (explicit list)

Everything in this list is **absent today** — named here so none of it is mistaken for already existing:

1. Opening-stock import (model, preview/confirm flow, uniqueness guard).
2. `ISSUE` movement type, and the issue document/line model described in §5.
3. `RETURN` movement type (unused-material return and supplier return/disposal), and whatever inspection/release step gates its
   usability.
4. `ADJUSTMENT`/`REVERSAL` movement types and the authorization/reason-capture rule around them.
5. A QC disposition/release action (proposed only, `incoming-qc-review-proposal.md`; not built).
6. Reservation (explicitly optional — may not be needed at all, per `docs/shared-store-inventory-plan.md` §1).
7. Legal ownership / cross-company transfer of material at the shared store (§A1 — the most consequential open item).
8. Container count/individual-size fields on a receipt line.
9. Supplier lot/expiry structured tracking (today: optional free text only).
10. Storage-location capture on a receipt (today: `GoodsReceiptLine` never records one).
11. A non-PO / invoice-less receipt path (today: `GoodsReceipt.source_purchase_order` is required).
12. Any valuation/price-basis model (explicitly kept separate from this document's quantity-only scope).

---

## 12. Confirmed requirements versus open decisions

**Confirmed (from the task's own brief, treated as settled for this document):**
- ABC/PQR-style double-booking is not a concern here (that was the separate multi-stage-formula task); this document's own
  double-counting concern is purely "the same physical delivery never produces two receipt movements," addressed in §10.
- Inward and outward rows on the manual register are independent lists, never linked by spreadsheet position (§2).
- A manufacturing batch number is never a supplier lot number (§2, §5).
- The manual register's alphabetical filing is a convenience, not a business rule (§3.A).

**Open (every item in §8, plus the missing-capability list in §11) — none of these are answered by this document.**

---

## 13. Recommended implementation sequence

1. **Resolve §A1 (legal ownership) at least provisionally** — almost every later step's data model depends on whether
   `source_company` can keep meaning "purchasing context only" or needs an explicit ownership field. `docs/shared-store-inventory-plan.md`
   §7 already proposes a flagged-provisional default (purchasing company) that could unblock the next step without waiting
   indefinitely.
2. **Opening-stock import** (§11.1) — needed before any "book balance since a chosen date" figure can ever be shown honestly for
   material that predates the ledger.
3. **`ISSUE` movement type + the issue document/line model** (§5, §11.2) — the single highest-value addition, since it's the
   other half of "receipts in, issues out" the client's manual register already captures.
4. **Physical count + `ADJUSTMENT` movement type** (§6, §7, §11.4) — enables the exact worked example in §7 to become real,
   including the "difference awaiting review" state.
5. **`RETURN` movement type** (§11.3) — lower urgency than issue, since returns are typically a smaller volume than outbound
   issues in most manufacturing operations (not confirmed by the client — a working assumption only).
6. **Frontend: extend `StoreMaterialsWorkspace.jsx`** with Outward/Physical/History tabs as each backend piece above lands,
   reusing the existing tab/service pattern (§10).
7. **QC disposition/release** (§11.5) and **reservation** (§11.6) — deliberately last, since both are explicitly open questions
   about whether they're needed at all (§8), not just how to build them.

## 14. The smallest next task that can be built without inventing policy

**Read-only "Book balance so far" view, receipts only, no new movement type, no policy decision required.**

Specifically: a new, purely additive, read-only endpoint/screen that takes the *existing* `compute_stock_balances` output
(§1.5, unchanged) and simply relabels/re-presents it as a "register" view — material header, store, date range, and a running
total of `RECEIPT_IN` movements only — **without** adding an opening balance, issues, returns, or adjustments, and without
inventing a released/usable figure. This requires:

- Zero new models or migrations.
- Zero new policy decisions (no ownership, no QC release, no issue rule needed — it only ever reads what already exists).
- A frontend change only: add a "Register" tab to `StoreMaterialsWorkspace.jsx` that reads the same data `ReceiptsTab` already
  fetches, re-grouped by material with a running total and the exact same coverage disclaimer `ReceiptsTab` already shows.

This is smaller than implementation-sequence step 2 above and can ship immediately, as a pure presentation change over data
that is already fully computed and already access-controlled correctly (§1.5, §1.7) — it answers none of §8's open questions
and invents no new business rule, while giving the Store Manager something closer to the shape of their paper register today.

---

## Final explanation

**1. What the Store Manager would do.** Open the Material Register, search or filter for a material, and see — for a chosen
store and date range — its code/name/type, a running record of everything posted against it. Today that's limited to
recorded receipts (§1.5/§1.7); once the implementation sequence above lands, it would also show issues, returns, physical
counts, and a computed book balance, exactly mirroring the sections of their current paper register, plus one thing the paper
register doesn't have: a single, dated, unified movement history across all of them.

**2. When quantities increase/decrease.** Only receipt posting increases a recorded figure today (§1.5/§6). Nothing else in
this codebase moves a quantity yet — creating or approving an order, a requisition, or a batch plan touches nothing (§6).
Every future increase/decrease (issue, return, adjustment) is proposed, not built, and is listed exactly as such in §6/§11.

**3. What already exists.** The material/unit catalog, shared stores and locations, the full purchase-request → purchase-order
→ goods-receipt chain with a zero-tolerance over-delivery rule, incoming QC drafting/submission (with no disposition), and the
Task 13C receipt ledger with its two read-only endpoints and one real frontend consumer (`ReceiptsTab`) — all verified directly
against the code, with file/line references, in §1.

**4. What cannot be implemented until the client answers.** Everything in §8 — most consequentially, legal ownership of
material at the shared store (§A1), which almost every "by company" figure in this design depends on; also QC release
authority, batch-allocation rules for multi-batch issues, the meaning of several manual-register fields (Container/pack
description, Label/Box, "T.W.", Price basis), and whether non-PO/invoice-less receipts need to be supported at all.

**5. Exact deliverable paths.**
- `docs/material-register-design.md` (this document)
- `docs/material-register-design/index.html` (offline prototype)
