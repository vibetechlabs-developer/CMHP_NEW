# Incoming QC Inspection Drafts — Policy Proposal (Task 09B-1)

**Status: implemented, but the policies below are proposals, not
client-confirmed rules.** The code (`apps.quality` - `IncomingInspection`/
`InspectionObservation`, the `/api/v1/stores/<store_id>/incoming-
inspections/` endpoints plus the eligible-receipt-line lookup) is real,
tested, and working exactly as described here. What is **not** confirmed
is whether the policy choices below - the bare-company-membership access
rule, and the one-active-inspection-per-line restriction - are the ones
the client actually wants once QC becomes a real day-to-day operation.
See `docs/backend-tasks.md`, Task 09B-1, for the full technical write-up
(models, endpoints, permissions, verification results) - this document
keeps the policy questions themselves visible and separate from the
implementation detail.

**Update (Task 09B-3A)**: real *submission* now exists — `DRAFT` may
transition to `SUBMITTED`, permanently freezing the inspection and its
observations, gated by a new dedicated `incoming_qc.submit` permission.
This does not change anything below about drafting itself; see
`docs/backend-tasks.md`, Task 09B-3A, and `docs/frontend-api-handoff.md`
§8.5 for the submission contract, and
`docs/incoming-qc-review-proposal.md` for the (still entirely
unimplemented, but now internally corrected) design of review/decision/
disposition that would come after submission.

## What this task does and does not establish

An `IncomingInspection` records that a QC inspection was started against
one already-`POSTED` `GoodsReceiptLine`, and lets a QC user log
free-text observations against it while it stays a `DRAFT`. That is the
entire scope. This task explicitly does **not**:

- Decide acceptance or rejection of the inspected material.
- Release material to production, or change any receipt's delivery
  progress, received quantity, or status.
- Create, reserve, or change any stock - no stock-ledger/stock-balance
  concept exists anywhere in this codebase yet.
- Establish legal ownership of the inspected material.
- Seed, validate against, or claim compliance with any pharmaceutical
  test specification, numerical limit, sampling formula, or regulatory
  standard. `parameter_name`/`method_reference`/`result` are free text a
  human enters; nothing in this codebase checks them against a real
  specification.

There is deliberately **no** `ACCEPTED`/`REJECTED`/`RELEASED` field or
status anywhere on `IncomingInspection` or `InspectionObservation` - an
inspection can only ever be `DRAFT`, `SUBMITTED` (Task 09B-3A), or
`CANCELLED`. `SUBMITTED` means only "the analyst is done recording
observations" - it is not itself a disposition either, and it is
permanently terminal in this codebase (no correction, no retest, no way
back to `DRAFT`).

## The inspection's company/store mean "purchasing company" and "where it physically sits" only

`IncomingInspection.company`/`store` are always copied from the source
receipt line's parent `GoodsReceipt` at creation and are never
independently settable - the same "purchasing company, not legal stock
owner" caveat `PurchaseOrder.company`/`GoodsReceipt.company` already
carry (see `docs/purchase-order-proposal.md` and
`docs/receiving-proposal.md`). Filing an inspection does not, by itself,
establish which company legally owns the material or who may authorize
its release - both questions remain **unresolved**, carried forward
unchanged from Tasks 08C-1/08C-2/09A.

## Access policy: store access and *bare* company membership are both required - deliberately narrower than receiving's own check

**Proposed policy, not yet client-confirmed**: every incoming-QC endpoint
requires **both** (a) active membership in the selected store holding the
specific `incoming_qc.*` permission the action needs, **and** (b) active
membership in the source receipt line's own purchasing company - a plain
`CompanyMembership`, with **no** particular permission required in that
company. This is a deliberate departure from `apps.receiving`'s own
company-axis check, which requires `purchase_orders.view` specifically.
The brief for this task was explicit: a QC user must never need
purchasing-price visibility just to inspect material. Requiring
`purchase_orders.view` would have quietly forced every QC user to also be
able to see supplier prices and order totals through the *purchasing*
app's own endpoints - a real, unwanted permission leak this task avoids
by checking membership alone. **A common-store operator who needs to
inspect deliveries for both companies must still be granted membership in
both**, through the existing role APIs - store membership never grants
that automatically. Every list, detail, and mutation endpoint enforces
both checks; a caller who fails the company check gets the same `404` as
a nonexistent inspection, never a `403` that would confirm it exists.

## At most one active inspection per receipt line (initial policy, not a confirmed rule)

A `GoodsReceiptLine` may have at most one non-cancelled
`IncomingInspection` at a time (a partial database `UniqueConstraint`,
backstopped by a row lock at creation). A cancelled draft may be replaced
by a new one, but this task does not model more than one inspection "in
play" against a single receipt line simultaneously. This is the simplest
starting rule, not a considered business decision about real QC
workflows - splitting one receipt line's quantity across several separate
dispositions, retesting after an initial inspection, and combining
multiple receipts into one inspection are all explicitly deferred. If the
client's real process needs any of these, that is a separate, unscheduled
design decision this task does not make on its own.

## Receipt-line identity, not supplier lot text

`IncomingInspection.receipt_line` points at the specific `GoodsReceiptLine`
row, not at the supplier's own lot-reference text. Two different receipts
that happen to carry the same (or no) supplier lot reference are never
merged into one inspection subject - a `GoodsReceiptLine`'s own primary
key is already a precise, permanent (once its parent receipt is `POSTED`)
identity for exactly this purpose. A missing supplier lot reference is
copied through and stays visibly blank (`lot_reference_snapshot=""`) -
never fabricated.

## No pharmaceutical test catalog, specification, or pass/fail logic

`InspectionObservation` rows are entirely manually entered: a parameter
name, an optional method/reference string, a result string, an optional
result-unit string, and remarks. Nothing is seeded, nothing is validated
against a real specification, and there is no pass/fail concept anywhere.
A draft's observations may legitimately be incomplete (a test logged
before its result is known). This task deliberately stops here - see
"What remains an open client decision" below for what a real disposition
workflow would still need to define.

## What remains an open client decision

- **Approved test specifications and methods**: no specification/limit
  catalog exists anywhere; `parameter_name`/`method_reference` are free
  text only.
- **Who records, reviews, and authorizes disposition**: this task only
  defines who may create/edit/cancel a *draft* inspection
  (`incoming_qc.*`) - there is no reviewer/authorizer role, and no
  disposition action of any kind exists.
- **Whether QA review is required before material release**: no release
  action exists at all yet, so this question is entirely open.
- **Whole-lot versus partial acceptance**: the one-inspection-per-line
  restriction above is a simplification, not a decision about whether a
  single receipt line's quantity may ever be partially accepted/rejected.
- **Sampling consumption and retest/correction rules**: nothing in this
  task tracks how much material a sample consumed, and there is no
  retest or draft-correction-after-cancellation workflow beyond "cancel
  and create a new draft."

All of the above are implementation-scope questions layered on top of the
still-unresolved legal-stock-ownership question inherited from Tasks
08C-1/08C-2/09A. None of them are answered by assumption anywhere in this
task's code.
