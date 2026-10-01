# Shared Store Inventory — Design and Implementation Readiness (Task 13B)

**This is a design document only. No model, migration, endpoint, permission, or test described below exists in the
codebase yet — nothing here is implemented, and nothing here is client-approved.** It follows directly from the
existing dependency chain already recorded in `docs/current-backend-and-client-flow-gap-report.md` §7 ("Recommended
dependency-ordered next tasks", items 6-7): item 6 (store requisition, no stock effect) shipped as Task 13A; this
document is the design step for item 7 ("Stock ledger foundation"), written so an implementation task can proceed
directly from it — the same role `docs/receiving-proposal.md` and `docs/incoming-qc-proposal.md` played before
their own tasks.

## Status legend

- **EXISTING** — real, shipped code, verified against the current repository while writing this document.
- **PROPOSED** — this document's own recommendation, offered so design work can proceed. Not a decision anyone has made.
- **OPEN** — cannot be answered by this document; the client must decide it.

## Source materials verified

`apps/stores` (`SharedStore`, `StorageLocation`), `apps/catalog` (`Material`, `UnitOfMeasure.canonical_factor`),
`apps/receiving` (`GoodsReceipt`, `GoodsReceiptLine`), `apps/quality` (`IncomingInspection`), `apps/batch_plans`,
`apps/material_requisitions`, `apps/permissions`/`apps/companies` access helpers, `apps/audit`, and
`docs/current-backend-and-client-flow-gap-report.md`, `docs/erp-handoff-open-decisions.md`,
`docs/client-register-field-mapping.md`.

---

## 1. The intended physical flow — with every transition labeled

```
Opening stock / posted receipt  →  QC hold or other confirmed disposition  →  reservation (if required)  →
material issue (to company/batch/requisition)  →  unused-material return
```

| Step | Status | What actually exists today |
|---|---|---|
| **Posted receipt** | **EXISTING**, but creates **no stock effect** | `GoodsReceipt`/`GoodsReceiptLine` (Task 09A) record physical arrival with `received_quantity`, optional free-text `lot_reference`, and no over-delivery tolerance (`docs/erp-handoff-open-decisions.md` A5). Confirmed by code search: nothing anywhere references a stock/balance/ledger table, because none exists. |
| **Opening stock** | **PROPOSED**, no concept exists | Pre-system inventory (stock the client already has that predates any receipt in this database) needs its own explicit import — see §6. Not the same thing as a posted receipt. |
| **QC hold** | **PROPOSED** default | Every unit of stock should start QC-held the instant it enters the ledger (from either a posted receipt or an opening-stock import) — matching `IncomingInspection`'s own existing scope note that QC submission decides nothing about acceptance. |
| **Confirmed disposition (release)** | **OPEN — not built** | `IncomingInspection` has exactly one real status transition today, `DRAFT → SUBMITTED` (or `→ CANCELLED`) — there is **no** ACCEPTED/REJECTED/RELEASED status anywhere (confirmed in `apps/quality/models.py`'s own docstring). **Submitting an inspection must never be read as releasing material.** A real disposition/release decision is a separate, unbuilt feature this document does not implement — see gap-report P2 item #10. |
| **Reservation** | **OPEN — not confirmed as needed at all** | Gap-report P2 item #11 asks this directly: "request to store vs reservation vs issue." This document treats reservation as an *optional* state (§3) that may turn out to be unnecessary. |
| **Material issue** | **OPEN — no policy** | Who can issue, against what (a `BatchPlan`? a `MaterialRequisitionLine`? ad hoc?), and whether issue requires a prior reservation, are all undecided. |
| **Unused-material return** | **OPEN — no policy** | What happens to returned material (goes back to the same lot? a new lot? re-inspected first?) is undecided. |

**Nothing above is confirmed except the two EXISTING rows.** Everything else is either a documented open question
(§7) or this document's own proposal (§2-§6), never presented as decided.

---

## 2. Proposed data model (smallest maintainable slice)

| Table | Purpose | Key fields |
|---|---|---|
| `MaterialLot` | The unit of stock identity. One lot per posted `GoodsReceiptLine` going forward, or one lot per opening-stock import row. | `material` (FK), `lot_code` (system-generated if the supplier gave no reference — never fabricated as if it were a real supplier lot), `source_type` (`RECEIPT` \| `OPENING_IMPORT`), `source_goods_receipt_line` (FK, **nullable** — null for opening-stock lots), `owning_company` (FK `Company`, set once at creation — see below), `created_at` |
| `StockMovement` | **Append-only**, immutable ledger row. Every quantity change is one row; balances are *derived*, never stored as a mutable counter. | `lot` (FK), `store` (FK `SharedStore`), `location` (FK `StorageLocation`, nullable), `movement_type` (enum, §3), `quantity` (signed `Decimal(14,3)`, always in `material.base_unit`), `owning_company` (FK, copied per movement — see below), `source_document_type` + `source_document_id` (generic link: `GoodsReceiptLine`, a future disposition record, `BatchPlan`, `MaterialRequisitionLine`, or another `StockMovement` for a reversal), `reversal_of` (FK self, nullable), `created_by`, `created_at`, `notes` |
| *(no separate balance table in this slice)* | Balances are `SUM(quantity)` over `StockMovement`, filtered by `lot` + a status derived from `movement_type` (§3) | — |

**Physical location vs. legal ownership — kept explicitly separate, never conflated:**
- `SharedStore`/`StorageLocation` (**EXISTING**, unchanged) carry no owner field today, by design (confirmed in
  `apps/stores/models.py`'s own docstring: "no company-owner FK... a location is never itself a QC verdict"). This
  document does not add one — a location is still purely physical identity.
- `owning_company` lives on `MaterialLot` (set once, at creation, from the source `GoodsReceipt.company` — i.e. the
  *purchasing* company, the same "purchasing company, not legal ownership" caveat `GoodsReceipt.company` already
  documents) and is copied onto every `StockMovement` for that lot. **Shared storage never implies shared
  ownership**: two companies can have material sitting in the same physical `StorageLocation`, and nothing here
  merges their balances.
- Changing which company owns a lot (a cross-company transfer) is **OPEN** (gap-report P2 #9) and, if ever needed,
  is its own explicit movement type — never an edit to the lot's `owning_company` field directly (which stays
  immutable, mirroring every other identity field in this codebase).

**Company/batch traceability**: an `ISSUE` movement's `source_document_type`/`source_document_id` can point at a
`BatchPlan` and/or a `MaterialRequisitionLine` (both optional — whether issue *requires* one is OPEN, §7 Q-block).
A `MaterialRequisitionLine.requested_quantity` is never trusted as the issued amount — an issue movement always
carries its **own** `quantity`, decided at issue time (see §9).

---

## 3. Separating stock states — no invented "available" number

Five states, derived from `movement_type`, never a client-supplied field:

| State | Meaning | Derivation |
|---|---|---|
| **Physically on hand** | Everything present at the store for this lot, not yet issued | `SUM` of all movements except `ISSUE` |
| **QC-held** | The portion still awaiting a real disposition | `SUM(RECEIPT_IN/OPENING_IMPORT) − SUM(RELEASE)` — **always equals "physically on hand" today**, because no `RELEASE` movement type can be created by any code that exists yet |
| **Released/usable** | Passed a confirmed disposition | `SUM(RELEASE) − SUM(RESERVE)` — **always zero today** (§1) |
| **Reserved** | Earmarked but not physically removed | `SUM(RESERVE) − SUM(UNRESERVE) − SUM(ISSUE against a reservation)` — **only exists if reservation is confirmed as needed at all** (OPEN, §1) |
| **Issued** | Removed from the store's pool | `SUM(ISSUE)` (cumulative) |

**"Available stock" is deliberately not one of these.** It would be `released − reserved`, but until release (§1)
and reservation (§1) are both real, confirmed features, this document does **not** propose an `available_stock`
field anywhere — the same restraint already applied to `BatchPlan`/`FormulaRevision` previews, which never invented
`can_produce`/`available_stock` either. **QC submission (`IncomingInspection.status = SUBMITTED`) must never be
read as a release decision** — nothing in this design lets it move a movement out of the QC-held bucket.

---

## 4. Integration with existing records

- **Existing posted receipts have zero stock movement today** (confirmed: no FK anywhere points at a stock table,
  because none exists). This document does not change that fact — **no backfill happens in this task.**
- **Going forward** (future implementation task, not this one): `apps.receiving.services.post_goods_receipt` would
  gain one *additive* step — create one `MaterialLot` + one `RECEIPT_IN` movement per receipt line, in the same
  transaction. This is a **PROPOSED** integration point, not a change made here.
- **Cutover boundary — PROPOSED**: a single "ledger go-live" point. Every `GoodsReceipt` **posted after** go-live
  gets a real movement (once the code above ships); every one **posted before** go-live is deliberately **not**
  individually reconstructed — this codebase cannot know how much of an old receipt's material was already
  consumed off-system before the ledger existed. Instead, pre-go-live stock is captured as a single **rolled-up**
  opening-stock import per material/store/company (§6), not a movement-by-movement replay of old receipts.
- **Preventing duplicate posting and double counting — PROPOSED**: (a) the opening-stock import explicitly
  excludes anything the client would otherwise recognize as "already a posted receipt in this system" — it is for
  genuinely pre-system stock only; (b) each import file is its own `OpeningStockImportBatch`, and a uniqueness rule
  on `(material, store, owning_company, lot_reference-or-generated-code)` scoped to opening-stock movements
  prevents the same logical line from being imported twice; (c) import is a **preview → explicit confirm** flow,
  never a silent one-click write (§6).
- **This task changes no existing row.** No backfill, no migration, no data change was made while writing this
  document.

---

## 5. Technical safeguards (kept separate from business policy)

| Safeguard | Design |
|---|---|
| **Immutable posted movements** | `StockMovement.clean()` rejects any `save()` on an existing `pk` outright (mirrors `BatchNumberAllocation`'s exact pattern); `delete()` always raises. |
| **Corrections via linked reversal/adjustment** | A `REVERSAL` movement type carries `reversal_of` pointing at the movement it corrects; an `ADJUSTMENT` type (no exact original, e.g. a physical count discrepancy) carries a required `notes` explanation. The original row is never edited or hidden — same "before/after preserved, never overwritten" convention as every audit record in this codebase. |
| **Decimal quantities and explicit units** | `Decimal(max_digits=14, decimal_places=3)` — the same precision as `SalesOrderLine.quantity`/`FormulaLine.quantity`/`MaterialRequisitionLine.requested_quantity`. Always stored in `material.base_unit`; any unit conversion at the edge reuses `UnitOfMeasure.canonical_factor` (Task 12B-2's existing mechanism) — never a second conversion engine, and never a cross-dimension (mass↔volume) conversion, exactly as `canonical_factor`'s own docstring already restricts. |
| **Concurrency protection against duplicate/over-issue** | Every balance-affecting write locks and re-reads the affected lot's current balance (via `select_for_update()` on the lot row, then a fresh `SUM` under that lock) before deciding, deadlock-ordered consistently with existing locking services (lot before any downstream reference) — the same "lock, re-read, decide, write" shape already used by `apps.batch_plans`/`apps.sales_orders`/`apps.formulas`. Insufficient balance is a clean `400`; a stale read is a clean `409` — never a negative balance, never an unhandled `500`. |
| **Atomic audit** | Every movement insert + `apps.audit.services.record()` call happens inside one `transaction.atomic()` block, exactly like every other service in this codebase; an audit failure rolls back the movement. |
| **No operational superuser bypass** | Reuses `user_has_permission`/`store_user_has_permission` exactly as-is (neither consults `is_staff`/`is_superuser`); company/store dual-access folds to 404 on the company axis, matching `apps.receiving`/`apps.material_requisitions`'s own established convention. |

---

## 6. Opening-stock import template specification

| Column | Required? | Validation |
|---|---|---|
| `material_code` | **Required** | Must exist and be active. |
| `store_code` | **Required** | Must exist and be active. |
| `owning_company_code` | **Required — never defaulted** | Must exist and be an active company. |
| `quantity` | **Required** | > 0, at most 3 decimal places (same rule as every other quantity in this codebase). |
| `unit_code` | **Required** | Must **exactly** equal `material.base_unit.code` — rejected (never silently converted) if it doesn't. Getting a unit wrong at the foundation of the ledger is the one place this design refuses to guess. |
| `location_code` | Optional | If given, must belong to the named store. |
| `lot_reference` | Optional | Free text. If blank, a system-generated placeholder lot code is used, clearly flagged as "no supplier lot reference available" — never fabricated as if it were real. |
| `as_of_date` | Optional | Defaults to the import date. |
| `notes` | Optional | Free text. |

**Preview → confirm, never a silent write**: an import call first validates every row and returns a per-row
result (valid / error-with-reason) plus a material-level summary total, with **nothing written yet** — mirroring
the informational-preview pattern already used by `batch_plans`/`formulas` requirement previews. A separate,
explicit confirm call re-validates under lock and commits. **This document does not create stock, and does not
invent missing lot/QC/ownership data** — a row missing `owning_company_code` or `store_code` is a hard validation
error, never a default.

**Duplicate handling**: one file = one `OpeningStockImportBatch`. Re-running the same file (same material + store +
owning company + lot reference) is rejected outright by the uniqueness rule in §4, not silently merged or doubled.

---

## 7. Client questions that block the FIRST slice only

Already-answered questions are **not** repeated here (over-delivery tolerance is A5, provisionally answered; "can a
requisition exist without a stock ledger" is Task 13A's own working answer, yes). Only what blocks §8's slice:

1. **Ownership at receipt time.** *Example*: "Company A raises the PO and receives 100kg of Herb X at the shared
   store — is that 100kg entirely Company A's until an explicit transfer, or does the client already split
   ownership at the moment of receipt?" Blocks `MaterialLot.owning_company`. A provisional default ("purchasing
   company, exactly like `GoodsReceipt.company` already means") can ship flagged as provisional if the client
   cannot answer immediately — see §8.
2. **Is a "released/usable" number needed in the FIRST slice at all?** *Example*: "Can the store screen simply show
   '50kg on hand, 50kg awaiting QC, 0kg released' for now, with no way to change that last number yet?" If yes, the
   first slice needs no disposition endpoint at all (§8 assumes yes).
3. **Opening-stock granularity.** *Example*: "Do you have exact supplier lot numbers for stock already sitting in
   the warehouse today, or should we record 'as of 1 March, we had 500kg of Herb X, owned by Company A' as one
   rolled-up line?" Determines whether §6's import needs per-lot detail or accepts rolled-up totals. Not blocking
   for §8 itself (the first slice doesn't touch opening stock at all), but blocks the *next* slice immediately
   after it.

---

## 8. Recommended first implementation slice — "Receipt-In Ledger Foundation"

> **IMPLEMENTED as Task 13C ("Physical Receipt Ledger Foundation"), with three deliberate differences from this
> original proposal** — kept here unmodified as the original design record, not rewritten to match after the
> fact: (1) no separate `MaterialLot` table was added — `StockMovement.source_receipt_line` (a `OneToOneField`)
> serves as the sole lot-identity concept for this slice, per the task's own instruction to keep this minimal;
> (2) the endpoints actually implemented are `GET /api/v1/stores/<store_id>/stock-movements/` and
> `GET /api/v1/stores/<store_id>/stock-balances/`, not `/material-lots/`; (3) the field this proposal called
> `owning_company` is named `source_company` in the real implementation — a deliberate wording change so nothing
> in the API even suggests an ownership answer exists yet. Every other boundary below (RECEIPT_IN only, no
> release/reservation/issue/return, no opening-stock import) was implemented exactly as proposed. See
> `docs/backend-tasks.md`, Task 13C, for the verified result.

**Exact scope**: `MaterialLot` + `StockMovement` models, append-only. The **only** `movement_type` implemented is
`RECEIPT_IN`, created automatically (one additive step inside the existing `post_goods_receipt` transaction) the
moment a `GoodsReceipt` is posted. No opening-stock import, no reservation, no issue, no return, no disposition/
release — each is a separate, later slice. Balances exposed: exactly two numbers per lot, `physically_on_hand` and
`qc_held` (always equal in this slice — `released_usable` is shown as a fixed `0`, explicitly labeled "not yet
implemented", never omitted or guessed at).

**Proposed APIs** (read-only; nothing is created except as a side effect of posting a receipt):
- `GET /api/v1/stores/<store_id>/material-lots/` — list, dual store+company access
- `GET /api/v1/stores/<store_id>/material-lots/<id>/` — detail: balances + movement history

**Permissions**: new STORE-scope `stock.view` (seeded, assigned to nobody) **plus** the existing
`purchase_orders.view` in the receipt's own company — mirrors `apps.receiving`'s own dual-access convention exactly,
since this reuses the same source data.

**Frontend screens**: one new read-only screen (`STK-01`, Material Lot / Balance viewer); optionally a small
"created N lot(s)" note added to the existing GR-03 (Goods Receipt Detail) once posted.

**Acceptance tests** (described, not written — no test code exists yet): posting a receipt creates exactly one
`MaterialLot` + one `RECEIPT_IN` movement per receipt line; an idempotent-retry post creates no duplicate; a lot's
on-hand quantity exactly equals the sum of its receipt line's `received_quantity`; no existing receiving/QC test
regresses; company/store access folds to 404 exactly like `apps.receiving`; superuser gets no bypass; no other
`GoodsReceipt`/`GoodsReceiptLine`/`IncomingInspection` field is touched.

**Dependencies/blockers**: Q1 (§7) should be answered before `owning_company` is populated with confidence, though
a flagged-provisional default (purchasing company) can unblock this slice without waiting. Needs a new migration
and a small additive change to `post_goods_receipt` — both explicitly out of scope for this design document itself.

---

## 9. Task 13A constraints this design must respect

- **Requisitions remain DRAFT** — no submit/fulfil transition exists. This ledger must not assume a
  `MaterialRequisition` ever becomes "fulfilled"; a future `ISSUE` movement needs its own status concept,
  independent of `MaterialRequisition.status`.
- **Requested-quantity remarks are not approval** — an `ISSUE` movement must never be auto-created because a
  `MaterialRequisitionLine.requested_quantity` was set. Issue is always its own explicit, separate action.
- **No stock effect today** — confirmed, and preserved: creating/editing a `MaterialRequisition` touches nothing in
  this proposed ledger. A requisition line is something a future `ISSUE` movement *can reference*, never something
  that triggers one.
- **One requisition per plan is a working limitation** — if the client later allows more than one requisition per
  plan (already flagged as open in Task 13A's own docs), this ledger's `source_document_id` linking must not assume
  a 1:1 plan-to-requisition relationship.
- **Source drift can block quantity editing** on a requisition line — this design never treats
  `requested_quantity` as a stable "reserved amount." An `ISSUE` movement always carries its own quantity, decided
  at issue time, never inherited from a requisition snapshot that may since have drifted.
