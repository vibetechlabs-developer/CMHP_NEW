# Purchase Order — Policy Proposal (Tasks 08C-1 draft / 08C-2 issue)

**Status: implemented, but the business policy below is a proposal, not
a client-confirmed rule.** The code across both tasks (`PurchaseOrder`/
`PurchaseOrderLine`/`PurchaseOrderIssueSnapshot`/
`PurchaseOrderIssueLineSnapshot`, the five `purchase_orders.*`
endpoints - view/create/edit/cancel/issue) is real, tested, and working
exactly as described here - what is **not** confirmed is whether the
policy choices below are the ones the client actually wants once
cross-company purchasing against a shared physical store becomes a real
operational question, and whether a single `purchase_orders.issue`
permission (Task 08C-2, no multi-step approval workflow) is the right
shape for finalizing a purchase order. Everything in this document
should be read as "this is what was built, and why," not as "this is
settled business policy." See `docs/backend-tasks.md`, Tasks 08C-1 and
08C-2, for the full technical write-up (models, endpoints, permissions,
verification results) - this document exists only to keep the policy
question itself visible and separate from the implementation detail.

## The business fact this task does not resolve

Two separate companies share one physical store. Nothing about that
shared physical location was decided by this task, or by any task
before it - `apps.stores.models.SharedStore` (Task 07A) already
established that a store is not owned by any one company, and
`apps.purchasing.models.PurchaseRequest` (Task 08B-1) already
established that a request's `company` means only "who needs the
material," not "who will legally purchase or own it." Task 08C-1
inherits that same open question at the next stage: once a request is
approved and someone wants to actually place an order with a supplier,
*which* company is the one placing it, paying for it, and legally
owning the stock once it arrives?

## The proposed policy adopted for this initial implementation

Four rules, adopted together as the simplest internally-consistent
starting point - not because they were confirmed correct, but because
building Purchase Orders at all required picking *something*, and
picking the option that changes the least once a real cross-company
answer is confirmed seemed lower-risk than inventing a cross-company
ownership model nobody asked for yet:

1. **A Purchase Order belongs to the same company as its source
   Purchase Request.** `PurchaseOrder.company` is never an independent
   choice - it is always set, and permanently fixed, to
   `source_purchase_request.company`. There is no field or endpoint
   anywhere in this task that lets a PO be created "for" a different
   company than the one that raised the original need.
2. **Cross-company purchasing is not supported in this slice.** If
   Company B needs a material Company A actually wants to purchase and
   pay for, there is currently no way to represent that - Company A
   would need to raise, approve, and own its own separate
   PurchaseRequest (and thus its own separate PurchaseOrder). Nothing
   in this task merges, reassigns, or transfers a request or order
   between companies.
3. **A shared physical delivery/storage location does not establish
   legal stock ownership.** This task does not implement receipts,
   stock balances, or any goods-in concept at all (see "Not
   implemented" below), so it makes no ownership claim about anything
   that physically arrives at the shared store - it only tracks which
   company's *paperwork* (the PurchaseRequest → PurchaseOrder chain)
   the order belongs to. Two companies sharing a warehouse floor is a
   physical/operational fact this task does not attempt to encode as a
   legal one.
4. **This policy requires client review before production use.** None
   of the three rules above were given to this task as a confirmed
   client decision - they were chosen so that Purchase Order drafting
   could be built at all without inventing a cross-company financial
   model nobody has asked for. If the client's actual intent is that
   one company (e.g. a designated "purchasing company") should be able
   to place and pay for orders on behalf of the other, none of rules
   1-3 above support that today, and implementing it would be a new,
   separately-scoped task - not a small extension of this one.

## Initial-scope restrictions (deliberately conservative, all documented, all enforced)

These are implementation-scope decisions, not the cross-company policy
question above, but they are listed here too because they were made
alongside it and share the same "simplest correct starting point, not a
confirmed final shape" status:

- **At most one non-`CANCELLED` PurchaseOrder per PurchaseRequest.**
  Enforced by a partial `UniqueConstraint` on `PurchaseOrder.
  source_purchase_request` (`condition=~Q(status="CANCELLED")`) plus a
  `select_for_update()` lock on the source request for the whole create
  transaction - see `docs/backend-tasks.md`, Task 08C-1, "Concurrency."
  Split orders and partial procurement across several POs for one
  request are explicitly deferred.
- **Exactly one supplier per PurchaseOrder.** No multi-supplier split
  exists anywhere in this task.
- **Every line from the request's approved round is copied verbatim -
  no extra materials, no omitted lines, no quantity changes.** A
  PurchaseOrder's lines are never client-supplied; they are always
  derived, 1:1, from `PurchaseRequestApprovalRoundLine` rows belonging
  to whichever round was `APPROVED` (see Task 08B-2). Only `unit_price`
  is ever editable on a line, and only while the order is still `DRAFT`.
- **A cancelled PurchaseOrder is not a dead end.** Cancelling frees its
  source PurchaseRequest (the partial unique constraint above only
  counts non-`CANCELLED` rows), so creating a new PurchaseOrder against
  the same PurchaseRequest is the (only) supported "replace this order"
  path - there is no separate "reopen" or "amend a cancelled order"
  action.
- **Amounts are pre-tax subtotals only.** `PurchaseOrderLine.line_amount`
  (`quantity * unit_price`, quantized to 2 decimal places with
  ROUND_HALF_UP) and the order's `subtotal` (the sum of its lines) are
  the only computed monetary figures anywhere in this task. No GST,
  discount, freight, or invoice-total concept is invented here.
- **`currency_code` is always required at creation, never assumed.**
  A caller must state a currency explicitly (three-letter shape only -
  not validated against a real ISO 4217 list, since no such reference
  data exists in this project); it is then immutable for the life of
  the order.

## Task 08C-2 — the issue policy

Issuing is **internal finalization only** - a `DRAFT` PurchaseOrder
becomes `ISSUED`, permanently. It is explicitly **not** proof of
supplier delivery, not proof of email/PDF transmission to the supplier,
not proof the supplier accepted the order, and not proof any material
was received - none of those concepts exist anywhere in this codebase,
and issuing does not fabricate any of them.

**Proposed policy, not yet client-confirmed**: a user explicitly holding
the company-scoped `purchase_orders.issue` permission may issue any
`DRAFT` purchase order in that company. This is deliberately **not** a
new multi-step commercial approval workflow the way PurchaseRequest has
one (Task 08B-2's three-step round, self-decision ban, distinct-approver
rule) - one permission, one decision, nobody excluded from issuing their
own draft. If the client wants issuing to require a second person's
sign-off, or to exclude the drafter, that is a different, unscheduled
policy decision - this task does not guess at one.

**Revalidated at issue time, inside one locked transaction** (all
documented in full in `docs/backend-tasks.md`, Task 08C-2): the source
request is still `APPROVED` and still belongs to this order's company;
every line still matches its approved-round source exactly; every
material/unit/category and the supplier are still active now (`is_active`
still means only "in use," never "QC-qualified" - no qualification
concept is added here either); an expected delivery date is present and
not in the past; every line's price is strictly greater than zero; and
the currency is one this task actually supports issuing (see next).

**Currency support is deliberately narrow and explicit, not silently
"every three-letter code."** A `DRAFT` PurchaseOrder still accepts any
shape-valid three-letter `currency_code` (unchanged from Task 08C-1 -
draft behaviour was not touched). But this project's line-amount
rounding is hard-coded to exactly 2 decimal places
(`_compute_line_amount`, `ROUND_HALF_UP`) - correct for a currency whose
own minor unit genuinely has 2 decimal places, silently *wrong* for one
that has 0 (e.g. JPY) or 3 (e.g. KWD). Rather than claim that fixed
rounding is correct for every currency anyone might type in, **issuing**
is gated on a small, explicit allowlist -
`apps.purchasing.services._SUPPORTED_ISSUE_CURRENCIES` = `INR`, `USD`,
`EUR`, `GBP` today. This is not a real ISO 4217 list and not a claim
that these are the only real-world 2-decimal currencies - it is exactly
"the currencies this task actually verified its rounding is correct
for." Extending it to another 2-decimal currency is a one-line change;
supporting a currency with a different minor-unit precision would need
the rounding logic itself to become currency-aware first, which this
task does not attempt.

**Zero-price purchase orders cannot be issued.** A `DRAFT` may sit at
its default `unit_price=0` indefinitely (unchanged Task 08C-1
behaviour), but `issue_purchase_order` rejects any line still priced at
zero with a clear message. Free-of-charge/no-cost purchasing (donated
materials, internal transfers, etc.) is a real scenario this task does
not attempt to support - it is explicitly deferred, not silently allowed
through a zero price.

**An immutable issue-time record is created, once, alongside the status
change.** `PurchaseOrderIssueSnapshot`/`PurchaseOrderIssueLineSnapshot`
permanently copy company identification, supplier identity/contact/
address, material/unit descriptions, quantities/prices/line amounts,
currency, pre-tax subtotal, expected delivery date, notes, and the
source request/approved-round reference - all as they stood at the
moment of issue. A later rename of the Company or Supplier master-data
row does not rewrite this record; only fields that actually exist on
those models today are captured (`apps.companies.models.Company` has no
address/tax-ID/bank-details field at all, so none is invented here).

## Not implemented in this task (unchanged from the original brief, minus what Task 08C-2 added)

Still no email/PDF transmission of any kind (issuing is not "sending"),
no separate multi-step approval workflow for the order itself beyond the
single `purchase_orders.issue` permission above, no goods receipt, no
QC, no stock balance or stock movement of any kind, no invoice or
payment concept, and no Tally or other external accounting integration.
`Supplier.is_active` continues to mean only "in use," never
"QC-qualified" or "approved to supply" - neither Task 08C-1 nor Task
08C-2 adds a qualification concept that does not already exist on
`apps.suppliers.models.Supplier` (see Task 08A). No reopen, amendment,
or cancellation of an `ISSUED` order exists anywhere in this codebase -
it is a deliberate terminal state.

## What remains an open client decision

The four numbered policy rules under "The proposed policy adopted for
this initial implementation" above, as a set - specifically: is "PO
company = PR company, no cross-company purchasing" actually the right
rule for a two-company/one-shared-store business, or does the client
need a genuine cross-company purchasing/ownership model before Purchase
Orders can be used in production? Separately, **whether a single
`purchase_orders.issue` permission (Task 08C-2) is the right shape for
finalizing a purchase order**, or whether the client wants a second
person's sign-off/a formal approval step the way PurchaseRequest has
one. Everything else in this document (the initial-scope restrictions,
the currency allowlist, the zero-price restriction) is a separate,
narrower question about *how much* of Purchase Order functionality to
build first, not *who* a Purchase Order legally belongs to or *who* may
finalize one.
