# Physical Material Receiving — Policy Proposal (Task 09A)

**Status: implemented, but the policies below are proposals, not
client-confirmed rules.** The code (`apps.receiving` - `GoodsReceipt`/
`GoodsReceiptLine`, the five `/api/v1/stores/<store_id>/goods-receipts/`
endpoints plus the eligible-PO lookup) is real, tested, and working
exactly as described here. What is **not** confirmed is whether the
policy choices below - no over-delivery tolerance, the dual store+company
access requirement, and the deferred posted-receipt correction path -
are the ones the client actually wants once physical receiving becomes a
real day-to-day operation. See `docs/backend-tasks.md`, Task 09A, for
the full technical write-up (models, endpoints, permissions,
verification results) - this document keeps the policy questions
themselves visible and separate from the implementation detail.

## What this task does and does not establish

A `GoodsReceipt` records that materials physically arrived at a shared
store, against an already-`ISSUED` PurchaseOrder, and how much of each.
That is the entire scope. This task explicitly does **not**:

- Create available stock - no stock-ledger or stock-balance concept
  exists anywhere in this codebase yet.
- Record any QC acceptance/rejection decision - `FULLY_RECEIVED`
  delivery progress means only "the ordered quantity has physically
  arrived, on paper," never "accepted" or "usable."
- Post any accounting/financial entry.
- Move anything between companies, or decide which company legally owns
  stock once it physically arrives at a shared store.
- Trigger a supplier payment.
- Send any external message (email, SMS, webhook) to anyone.

## The receipt's company means "purchasing company" only

`GoodsReceipt.company` is always copied from its source PurchaseOrder's
own `company` at creation and is never independently settable - the same
"purchasing company, not legal stock owner" caveat `PurchaseOrder.
company` already carries (see `docs/purchase-order-proposal.md`).
Recording a receipt at a shared physical store does not, by itself,
establish which company legally owns the stock once it arrives - that
question remains **unresolved**, carried forward unchanged from Tasks
08C-1/08C-2, not decided by this task either.

## Access policy: store access and company access are both required, deliberately

**Proposed policy, not yet client-confirmed**: every receiving endpoint
requires **both** (a) active membership in the selected store holding
the specific `receiving.*` permission the action needs, **and** (b)
active membership in the source purchase order's own company holding
`purchase_orders.view`. Neither substitutes for the other. This was
chosen explicitly because a shared physical store can receive deliveries
against purchase orders from either company using it - store membership
alone would let a receiving clerk see (or worse, act on) a company's
purchase orders they have no business visibility into, just because that
company happens to use the same warehouse. **A common-store operator who
needs to receive deliveries for both companies must be granted company
access to both, through the existing role APIs (an active
`CompanyMembership` plus a role holding `purchase_orders.view`) - store
membership never grants that automatically, and this task does not
invent a shortcut for it.** Every list, detail, and mutation endpoint
enforces both checks; a caller who fails the company check gets the same
`404` as a nonexistent receipt, never a `403` that would confirm the
receipt's existence.

## No over-delivery tolerance (initial policy, not a confirmed rule)

At posting, the cumulative posted quantity for a PO line - summed across
every `GoodsReceipt`, every store, and every lot, not just the receipt
being posted - may never exceed that line's ordered quantity (frozen on
`PurchaseOrderIssueLineSnapshot.quantity_snapshot`). Any amount over,
even a small one, is rejected outright with `400`, not merely flagged or
allowed through with a warning. This is the simplest starting rule, not
a considered business decision about real-world delivery tolerances
(a supplier rounding up a bag count, a small over-pack, etc.) - if the
client wants a tolerance (e.g. "allow up to 2% over"), that is a
separate, unscheduled policy decision this task does not make on its
own.

## Posted-receipt corrections and reversals are deferred

"Posted receipts and their lines are immutable" is enforced at the code
level (`update_goods_receipt`/`cancel_goods_receipt` both refuse any
non-`DRAFT` receipt) - there is currently **no** way to correct a
mis-keyed quantity, wrong lot reference, or genuinely mistaken posting
once it has happened. The only paths today are: get it right before
posting (a `DRAFT` can be freely edited), or leave an incorrect `POSTED`
record in place with no system-level remedy. A future task would need to
design one of: a reversing/adjustment document (a new `GoodsReceipt`-like
correction record that nets against the original), or a controlled
amendment path with its own audit trail - this task does not attempt to
guess which shape the client wants.

## Lot detail: what exists today, and what a future QC/stock task would still need

`GoodsReceiptLine.lot_reference` is optional, free-text, and
supplier-supplied only - never fabricated by this system. No
manufacturing-date or expiry-date field exists on this model. Before any
future QC or stock-ledger task could rely on lot data from receiving, it
would need, at minimum: a confirmed source for manufacturing/expiry
dates (supplier-declared on the delivery note? measured/assigned at QC
time? both, with a provenance distinction?), a decision on whether
`lot_reference` should be structured/validated against a supplier's own
lot-numbering scheme or stay free text, and a decision on whether one
physical lot can span multiple `GoodsReceiptLine` rows (e.g. the same
batch delivered in two receipts) or must always be a strict 1:1. None of
that is resolved here - this task only records what a receiving clerk
can honestly observe at the dock: quantity, and an optional reference
string.

## Client-generated idempotency key

`idempotency_key` is the first idempotent-create mechanism in this
codebase (every other document type's `POST` create is explicitly *not*
retry-safe - see `docs/backend-tasks.md`, Task 08B-1). A safe retry with
the same key and identical content returns the existing receipt; the
same key with different content is a `409 Conflict`. This is scoped
narrowly to `GoodsReceipt` creation only - it does not establish a
project-wide idempotency-key convention for every other create endpoint,
though a future task could choose to extend the same pattern.

## What remains an open client decision

Whether the no-over-delivery-tolerance rule is actually right for real
supplier deliveries; whether the dual store+company access requirement
is the correct shape once real staffing patterns are known (e.g. does a
warehouse ever need a "sees every company's receipts at this store"
role, bypassing the per-company check?); and what a posted-receipt
correction/reversal mechanism should look like. All three are
implementation-scope questions layered on top of the still-unresolved
legal-stock-ownership question inherited from Tasks 08C-1/08C-2.
