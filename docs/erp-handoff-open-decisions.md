# CMHP ERP — Open Decisions (Consolidated)

This document exists so the client is asked each open question **once**,
in one place, instead of re-encountering it scattered across
`docs/purchase-workflow-proposal.md`, `docs/purchase-order-proposal.md`,
`docs/receiving-proposal.md`, `docs/erp-client-flow.md`, and this session's
new documents. Every item below traces back to an explicit "proposed, not
confirmed" or "unresolved" statement in the source documents or code —
nothing here is invented for this document.

Two categories:

- **§A — Decisions affecting work already built.** The system runs today
  using a stated default/provisional answer to each of these. Production
  use, or any further extension of the purchasing/receiving flow, should
  not proceed without the client confirming, adjusting, or explicitly
  accepting each default.
- **§B — Scoping questions for modules that do not exist yet.** These have
  not been formally raised with the client in any design document found in
  this repository. They are listed so the client knows what will need to
  be answered before that future work can start — not because an answer is
  needed right now.

---

## §A — Decisions affecting work already built

### A1. Legal ownership and cross-company use of shared-store material

**Status: unresolved, carried through every purchasing/receiving task
unchanged.** Two companies purchase into and receive at one shared
physical store. Nothing in the system today decides, records, or implies
which company legally owns material once it physically arrives there, or
how one company would use or be charged for material another company
purchased. Every task that touches this (Purchase Request, Purchase Order,
Goods Receipt) explicitly states its own company-scoping is a physical/
administrative convenience only, never a claim about legal ownership.
**This is the single most consequential open question** — most of the
items below are narrower, more implementation-specific consequences of
this same root question.

### A2. Final purchasing-company policy (cross-company purchasing)

**Status: PROPOSED POLICY, not confirmed.** The current rule: a Purchase
Order's company is always fixed to its source Purchase Request's company;
Company A cannot raise a PO on Company B's behalf. If the client's real
process requires one company to purchase for the other (e.g. combined
orders for better supplier pricing), this rule — and a meaningful chunk of
the current Purchase Order data model — would need to change.

### A3. Approval-role mapping and the provisional distinct-approver rule

**Status: partially confirmed, partially provisional.** Confirmed: exactly
three sequential approval steps, all decided by holders of one shared
permission (`purchase_requests.approve`), with an absolute ban on
approving/rejecting one's own request. **Not confirmed**: whether the same
approver may legitimately decide two steps of the same round. The system
currently forbids this (a different eligible approver is required at each
step), chosen conservatively by the engineering team, not by the client.
Related, still-open: a pre-existing mismatch where the code today lets any
holder of the general `purchase_requests.cancel` permission cancel a
pending (SUBMITTED) request, which conflicts with the confirmed intent
that only an "Admin"-equivalent should be able to do that while a decision
is pending — a distinct `purchase_requests.cancel_pending` permission now
exists specifically for this, but who should actually be granted it, versus
the plain `cancel` permission, has not been mapped to real company roles by
the client.

### A4. Whether a single-permission Purchase Order issue is sufficient

**Status: PROPOSED POLICY, not confirmed.** Issuing a Purchase Order today
requires only one person holding one permission — deliberately not a
second, multi-step sign-off the way Purchase Request approval has one. The
client has not been asked whether a Purchase Order (which commits the
company to a supplier) should require the same kind of multi-person
control as a Purchase Request does.

### A5. No over-delivery tolerance when receiving

**Status: PROPOSED POLICY (simplest starting rule), not confirmed.** Any
cumulative posted delivery exceeding the ordered quantity is rejected
outright — even by a fraction of a unit. Real supplier deliveries
sometimes run slightly over (rounding, pack-size overage); whether some
tolerance (e.g. "allow up to 2% over") should be permitted has not been
decided.

### A6. Dual store+company access requirement for receiving

**Status: PROPOSED POLICY, not confirmed.** Every receiving action
currently requires both store-level receiving permission and separate
company-level purchase-order visibility, with no shortcut between them.
Whether real staffing patterns need a "sees every company's receipts at
this shared store" role that bypasses the per-company check has not been
asked.

### A7. Posted-receipt correction and reversal

**Status: no mechanism exists; unresolved.** Once a Goods Receipt is
POSTED, it is permanently immutable — there is no way today to correct a
mis-keyed quantity, a wrong lot reference, or a genuinely mistaken posting.
The two candidate shapes (a reversing/adjustment document vs. a controlled
amendment path with its own audit trail) have not been chosen, and no
attempt has been made to guess which the client wants.

### A8. Supplier qualification / "approved to supply" status

**Status: unresolved.** `Supplier.is_active` currently means only "this
directory entry is in use," never "qualified" or "approved to supply." No
qualification workflow, expiry, or approval-status concept exists. This
matters directly for a pharmaceutical supply chain and should not be left
unresolved indefinitely.

### A9. Lot/batch and expiry-date data model for goods receiving

**Status: unresolved, explicitly deferred.** A goods receipt line today
carries only an optional, free-text, supplier-supplied lot reference — no
manufacturing date, no expiry date, no structured validation. Before any
future QC or stock module could rely on this data, the client needs to
decide: where manufacturing/expiry dates come from (supplier-declared on
the delivery note vs. measured/assigned at QC time, or both with a
provenance distinction), whether `lot_reference` should be validated
against a supplier's own numbering scheme or stay free text, and whether
one physical lot may legitimately span multiple receipt records.

### A10. Purchase units, currency, taxes, and document numbering

**Status: unresolved.** No real ISO 4217 currency reference list exists
anywhere in the system (currency codes are shape-validated only, three
letters); issuing is further restricted to a short, explicitly-verified
allowlist (INR/USD/EUR/GBP) purely because the rounding logic has only
been checked for 2-decimal currencies. No tax handling exists anywhere.
Purchase Request/Order reference numbers are internal system identifiers
only (`PR-YYYYMMDD-<random>`), not a finalized statutory/business numbering
scheme the client's process may require.

### A11. Incoming QC inspection access rule and one-active-draft-per-line restriction

**Status: PROPOSED POLICY, not confirmed.** A QC user may create/edit/
submit/cancel an inspection draft with only bare company membership in
the receipt's own company — deliberately not the same `purchase_orders.
view` permission Goods Receiving requires, so QC access never implies
purchasing-price visibility. Separately, at most one active (non-
cancelled) inspection may exist per receipt line at a time — this now
also covers a `SUBMITTED` inspection (Task 09B-3A), which occupies that
slot permanently since there is no way to cancel or free it. None of
this has been put to the client; it was chosen so drafting/submission
could be built without inventing an access or workflow model nobody
asked for. See `docs/incoming-qc-proposal.md`.

**Also PROPOSED POLICY, not confirmed (Task 09B-3A)**: submission uses a
*dedicated* `incoming_qc.submit` permission rather than reusing
`incoming_qc.edit` — this technical choice was authorized as part of
implementing the task, not confirmed as client business policy. Whether
the client actually wants drafting and submission authority separable
(vs. one person always doing both) remains genuinely open — see also
review-proposal question C.1, the closely related question of whether
the *same* person may submit and later decide disposition.

### A12. Material specification access — superuser-only drafting, and everything after it

**Status: PROPOSED POLICY, not confirmed (Task 09B-3B).** Only an active
superuser may create or edit a `MaterialSpecification`/
`MaterialSpecificationVersion` draft — the same "no read exception, no
store/company scoping at all" shape `apps.suppliers.Supplier` already
uses, chosen because no client requirement named who else should have
access. This is a deliberately narrow, technical starting point, not a
business decision: **two genuinely open questions sit on top of it**,
neither answered here: (1) once a specification could be considered
"approved" (a concept that does not exist yet - see B1), who should get
*operational*, non-superuser read access to it, and through which
scope (store? company? a shared read-only role like `shared_catalog.
view`?); (2) whether drafting authority itself should ever be delegated
below superuser level (e.g. to a dedicated QA-authoring role) once real
usage patterns are known. Neither question can be answered until the
approval/publication workflow B1 already flags as unresolved is
designed - this item exists so the *access* half of that future
decision is tracked explicitly, not folded silently into whatever the
workflow decision eventually assumes.

### A13. Customer master company-scoping policy

**Status: PROPOSED POLICY (working implementation choice), not
confirmed (Task 10A).** Each `Customer` row belongs to exactly one
`Company` — the opposite convention from `apps.suppliers.Supplier`,
which is a single directory shared across both companies at this store.
This was Task 10A's own explicit instruction, so it was built exactly
that way, but the task itself was equally explicit that this must not
be read as a confirmed customer-ownership policy. The client has not
been asked whether the two companies sharing this physical store should
instead see one shared customer directory (mirroring `Supplier`'s
shape) — or whether per-company customer records are in fact correct,
e.g. because the two companies genuinely sell to different, non-
overlapping customer bases. Nothing built on top of `Customer` yet
depends on this being resolved, but any future quotation/sales-order
module will need an answer before it can safely assume either shape.
`apps.products.Product` (Task 10B, see A14 below) makes the identical
provisional choice for the same stated reason — the two items should be
resolved together, since a future quotation/sales-order line joins both.

### A14. Product master company-scoping policy

**Status: PROPOSED POLICY (provisional implementation choice), not
confirmed (Task 10B).** Each `Product` row belongs to exactly one
`Company`, the same shape — and the same open question — as `Customer`
(A13 above), for the identical reason: this was Task 10B's own explicit
instruction, built exactly that way, but explicitly not to be read as
confirmed product-ownership policy. The client has not been asked
whether the two companies sharing this store should instead see a
shared product directory with company-specific offerings (a middle
ground between `Supplier`'s fully-shared shape and today's fully
per-company one), or whether per-company product records are in fact
correct. A future quotation/sales-order module needs an answer for
*both* `Customer` and `Product` before it can safely assume either
shape for either model — see A13.

**Also unresolved (Task 10B)**: `apps.catalog.services.deactivate_unit`
was not extended to check for an active `Product` referencing a unit as
its `sales_uom`, unlike the existing check it already performs for an
active `Material` referencing the same unit as its `base_unit`. This
means a unit of measure can be deactivated out from under an active
product today, silently making that product's own future reactivation
impossible (see `apps.products.services.activate_product`'s re-check)
until someone notices and reactivates the unit again. Whether
`deactivate_unit` should be extended to also protect against this is an
open, low-urgency question — deliberately not decided in this task, to
avoid modifying an existing, unrelated app's behavior without being
asked.

### A15. Quotation scoping, numbering and commercial rules

**Status: PROPOSED POLICY / working defaults, not confirmed (Task 10C).**
Quotation drafts are company-scoped (same provisional choice as
`Customer`/`Product`, A13/A14 — resolve the three together). The client
has not confirmed: (1) the quotation **reference format** — the current
`QT-YYYYMMDD-<10 hex>` (unique per company) is a technical default, and a
statutory/sequential scheme may be required; (2) whether **currency** should be
limited to an allowlist (purchase orders restrict issuing to INR/USD/EUR/GBP;
quotations only shape-check three letters because nothing is issued) and
whether currency should stay immutable after creation; (3) **tax, discount,
freight, rounding of multi-line totals** — only a pre-tax `subtotal` exists;
(4) **validity/expiry semantics** — `valid_until` is informational, nothing
expires; (5) the whole **quotation lifecycle** (send, approve, accept,
reject, revise, convert to sales order) and who may perform each step;
(6) whether a customer/product deactivated after drafting should block edits
beyond what is implemented (unchanged references are kept, changed/new lines
need active references); (7) **unit-price precision** (4 places, mirroring
purchase orders) and whether prices may differ per customer/currency (no price
list exists). Also still open from A14: `deactivate_unit` does not protect
against active `Product` references, so a quotation line's sales unit can be
inactive at edit time — handled by the rules above, not prevented.

### A16. Direct sales-order draft rules

**Status: WORKING DEFAULTS, not confirmed by the client (Task 10D).**
Direct sales-order drafts are company-scoped (same provisional choice as
`Customer`/`Product`/`Quotation`, A13-A15 - resolve together). Not
confirmed: (1) the **`SO-YYYYMMDD-<10 hex>` reference format** - a technical
default, not approved numbering; (2) the working rule that
**`requested_delivery_date` cannot precede `order_date`**; (3) whether the
customer's own order reference (`customer_order_reference`) should ever be
unique (deliberately not unique, no requirement stated); (4) currency
policy (shape-checked three letters, immutable in this slice) and tax/
discount/freight (none exist; only a pre-tax subtotal); (5) the entire
order lifecycle - confirmation, cancellation, who may confirm, when a
draft may authorize production or reserve stock, invoicing and dispatch;
(6) the **quotation acceptance and quotation-to-order conversion policy**
(no linkage field exists on purpose until this is defined); (7) whether an
order may reference a customer/product that is later deactivated beyond the
rules implemented (unchanged references kept, new/changed lines need active
references).

### A17. Manufacturing formula drafting rules

**Status: WORKING IMPLEMENTATION CHOICES, not client-approved
manufacturing policy (Task 11A).** Formulas are company-scoped (same
provisional choice as Customer/Product/Quotation/Sales Order, A13-A16) and
drafting is simple and quantity-based: a revision states a base output
quantity in the product's sales unit plus plain material quantities in each
material's base unit. Nothing implies a default or approved formula per
product (several are allowed). Not decided by the client, and deliberately
not implemented: (1) formula approval, who approves, and effective/retired
states; (2) how a batch size scales a formula - packaging rounding, fixed
(non-scaling) quantities, process losses, yield allowances, waste factors,
overage; (3) percentage/potency/density/assay-based composition and any unit
conversion between a material's base unit and a formulation unit; (4)
whether one product may have several concurrently usable formulas and how
one is chosen for a batch; (5) whether raw and packaging materials need
different rules (today they share one line list distinguished only by the
material's own type, with no duplicate-material restriction); (6) whether a
revision may be cloned from another; (7) who may see or edit formulas -
formulas are commercially sensitive and access is only the three
`formulas.*` company permissions, with material lookup additionally
requiring `shared_catalog.view` in some store (a gap documented in the
handoff, not resolved by changing material access policy); (8) whether
`Product`/sales-unit or `Material`/base-unit deactivation should be blocked
while a draft formula references them (today it is not).

**Task 10E (confirmation preview) - still unresolved, surfaced by the
read-only `confirmation-preview` endpoint as `open_policy_questions`, not
decided by it:** who may confirm (Admin is the likely confirmer, but no role
mapping is finalized and nothing is inferred from `is_superuser` or role
names); whether the creator/last editor may self-confirm; cancellation
policy; whether an empty order, a zero-price line or an already-past
requested delivery date may be confirmed (none is a confirmed blocker);
whether references must be active at confirmation time; what confirmation
authorizes. No confirm/cancel permission or endpoint exists. A future
confirmation command must revalidate under a transaction against the version
the user reviewed.

**Task 10F (policy-gated confirmation) - what changed and what is still open.**
DRAFT -> CONFIRMED now exists, controlled by an explicit per-company policy
(`SalesOrderConfirmationPolicy`: allow self-confirmation, allow zero-price lines,
allow past requested delivery dates) and the separate COMPANY permission
`sales_orders.confirm`, seeded and assigned to nobody. **No company is configured
automatically and nothing is defaulted**: a missing or incomplete policy blocks
confirmation ("Confirmation rules are not configured. Contact your administrator.").
The answers to the three policy questions remain **client decisions**; the values
anyone enters through the policy API are theirs, not previously approved business rules.
Still open: (1) the actual answers per company (a superuser may configure them, but
that authority is not business approval); (2) **who holds `sales_orders.confirm`** -
Admin is the likely confirmer, but the role mapping is not finalized and is done only
by explicit permission assignment (never role names, `is_staff` or `is_superuser`);
(3) **cancellation and any unconfirm/amend/reopen** - none exists, a confirmed order is
immutable; (4) whether the **technical eligibility safeguards** (at least one line;
active customer, products and sales units; positive/COUNT-valid quantities; valid
currency and consistent amounts) are the right ones - they are implementation
safeguards to be reviewed, not confirmed policy; in particular whether a customer/
product/unit deactivated after drafting should block confirmation; (5) the
**business timezone** used for the "past requested delivery date" check
(`BUSINESS_TIME_ZONE`, default **Asia/Kolkata** - an assumption noted in the
settings, not confirmed with the client); (6) what confirmation should authorize later
(stock reservation, manufacturing, invoicing - none is triggered today); (7) quotation
acceptance/conversion and any customer-facing confirmation.

**Task 11D (requirement preview) - what changed and what is still open.**
A read-only planning estimate now exists (`.../revisions/<id>/requirement-preview/`): proportional
scaling of a draft formula to a target output, in exact arithmetic, with no rounding. It settles none of
the following, which remain client decisions: (1) the real relationship between a formula's output unit and
the packing/sales units (e.g. strips vs cartons); (2) rounding of fractional pieces (12.5 caps) - up, down,
nearest, per material or per pack type, or rejection; (3) fixed-per-batch inputs that must not scale; (4)
yield, losses, wastage and overage; (5) formula approval, approvers and contributors (Task 11C - not built)
and whether a DRAFT revision may be used for a batch; (6) batch and stock workflows (batch record and
numbering, requisition, stock ledger, reservation, issue, consumption, return). The preview is not an
approved requirement and authorizes nothing.

---

## §B — Scoping questions for modules that do not exist yet

None of the items in this section have been raised in any design document
in this repository. They are listed here only so the client is aware they
will eventually need to be answered — not as blockers on current work.

### B1. QC/QA disposition, specifications, and release authority

**Status update (Task 09B-1, extended Task 09B-3A): a QC inspection
*draft*, and now its *submission*, exist** — a QC user may log free-text
observations (test/parameter name, method reference, result, remarks)
against a physically-received delivery line, then submit it, permanently
freezing it. Nothing about drafting or submission decides acceptance,
rejection, or release; no disposition action, and no `ACCEPTED`/
`REJECTED`/`RELEASED` status, exists anywhere. Before a real disposition
workflow can be designed, the client still needs to define, none of
which this task answers by assumption:

- **Approved test specifications and methods** — a draft-only
  *container* for a specification now exists (Task 09B-3B:
  `MaterialSpecification`/`MaterialSpecificationVersion`/
  `SpecificationTest`, superuser-managed, permanently `DRAFT`, never
  linked to any inspection) — but it holds no real client data, no
  approval/publication concept, and no operational QC read access. The
  underlying question — real test names, methods, result types, units,
  and acceptance criteria — remains exactly as open as before; only the
  place to eventually put the answer now exists. `parameter_name`/
  `method_reference` on an actual inspection observation are still free
  text only, never validated against anything.
- **Who records, reviews, and authorizes disposition** — this task only
  defines who may create/edit/cancel a *draft* (`incoming_qc.*`); there
  is no reviewer/authorizer role and no disposition action of any kind.
- **Whether QA review is required before material release** — no release
  action exists at all yet, so this question is entirely open.
- **Whole-lot versus partial acceptance** — the one-active-draft-per-line
  restriction (A11) is a drafting-scope simplification, not a decision
  about whether a single receipt line's quantity may ever be partially
  accepted/rejected.
- **Sampling consumption and retest/correction rules** — nothing tracks
  how much material a sample consumed, and there is no retest or
  draft-correction-after-cancellation workflow beyond "cancel and create
  a new draft."

See `docs/incoming-qc-proposal.md` for the full technical detail behind
each of these. **A full implementation-ready design for all five items
above — proposed workflow, models, API contracts, and screens (all
PLANNED, none built) — is now written up in
`docs/incoming-qc-review-proposal.md` (Task 09B-2, corrected Task
09B-3A). That document does not answer any of these questions either;
it proposes a shape each answer would fit into, and ends with the same
five open questions, restated concretely against that shape.**

**Also unresolved (Task 09B-3B)**: who, if anyone, should ever get
*operational* (non-superuser) read access to an approved specification
once one exists, and what "approved" would even mean for a
specification given no approval workflow is built — restated as a
distinct item in §A12 below, since it is now grounded in a real (if
empty) model rather than a purely hypothetical future concept.

### B2. BMR timing and access requirements

No batch manufacturing record concept exists. When a BMR is created
relative to production, who may view/edit it at each stage, and what
regulatory record-keeping requirements apply, are all unscoped.

### B3. Exact company-specific manufacturing/packing processes

No production, packaging, or filling workflow exists. Each company may
have different manufacturing/packing processes — these have not been
described in any document available to this project.

### B4. Financial and Tally integration scope

No accounting entries, invoicing, or Tally (or any accounting system)
integration exists anywhere. The scope of what should sync with Tally —
purchase orders, goods receipts, supplier invoices, customer invoices, some
subset — has not been discussed.

### B5. Meaning of "reference book access for everyone"

No reference/document library module exists. If the client's process
includes a shared reference-book concept accessible to "everyone," it is
unclear from any available document whether "everyone" means every
authenticated user regardless of company/store membership (a genuine
exception to this system's consistent company/store-scoped access model),
or every member of a specific company/store, or something else.

### B6. Exact TQM scope

No Total Quality Management concept exists in any document available to
this project. The term does not appear anywhere in the codebase or its
documentation prior to this handoff. A scoping conversation with the
client is needed before any design work can start.

---

## How to use this document

When next meeting with the client, work through §A first — these are
decisions the system has already made a provisional choice about, so the
conversation is "confirm or change this," which is faster than an open
question. §B items are genuinely open scoping conversations for future
work and should be scheduled separately, not rushed alongside §A.


**Task 11C (formula approval) - what is decided provisionally and what is still open.**
Formula approval now exists behind `formulas.approve` (assigned to nobody), a per-company self-approval answer that
must be configured before any approval, and a working contributor definition. Still needed from the client:
(1) **who holds `formulas.approve`** in each company; (2) **the self-approval answer per company** (may a person who
created or changed a revision approve it?); (3) **whether the contributor definition matches expectations** (creator
plus substantive content editors; master metadata and no-op edits excluded) and how legacy revisions with incomplete
history should be treated; (4) **revision selection and defaults** (which approved revision is used when several
exist); (5) **effective dating and superseding** approved revisions; (6) **batch scaling and production
authorization** (approval authorizes nothing downstream).


**Task 12A (batch planning drafts) - what is decided provisionally and what is still open.**
Planning drafts now connect a sales-order line to an explicitly chosen APPROVED formula revision and a target output
quantity, behind `batch_plans.create`/`batch_plans.edit` (both assigned to nobody by seed). Still needed from the
client: (1) **who holds `batch_plans.create`/`edit`/`view`** in each company; (2) **which company/customer/brand code
supplies the official manufacturing batch number**, and which date determines its numbering year; (3) **whether the
batch-number sequence resets annually**; (4) **order-to-production batch split/merge rules** (today several plans may
freely reference the same line, with nothing enforcing that planned quantities add up to, or stay within, the ordered
quantity); (5) **packing-size conversions and rounding** (today `packing_size_note` is descriptive text only); (6)
**MRP, currency and printing fields** for a batch document; (7) **store requisitions, stock ownership and QC/QA
release**; (8) **production authorization** - a batch plan, like formula approval, authorizes nothing downstream.

**Task 12B-2 (structured packing content) - what is decided and what is still open.** A batch plan can now record an
explicit packing relationship (planned pack quantity, packing content quantity/unit) alongside its manufacturing
target, and a formula revision's output unit can now be independent of its product's sales unit. Still needed from
the client: (1) **why the client's own Batch Size (76 Kgs) does not match the computed packed content (75.6 Kgs)**
for the Flexicare example - shown exactly, not explained; (2) **whether a packing relationship should become a
reusable, product-level default** instead of being re-entered on every plan; (3) **permitted batch sizes and any
operational rounding policy** once the reason for (1) is known; (4) **fixed materials and loss/yield policy** for
packaging lines (caps/labels/cartons are still never derived from bottle count).

**Task 12C (store preparation) - what is confirmed and what is still open.** The client confirmed Packing Type is
manually entered text and that Insert "N/A" means not required/applicable - both implemented exactly as stated.
Still needed from the client: (1) **Label/Box values**, including what `0` means on the sample row (a quantity? a
status flag?); (2) **Insert quantity, readiness, and artwork/reference tracking** beyond the required/not-required/
not-specified tri-state; (3) **the requisition lifecycle** (what triggers one, who fulfils it, what states it has);
(4) **whether one preparation record per batch plan is correct**, or whether multi-store routing / several
preparation attempts per plan need to be supported later (today's `OneToOneField` would need to become a
`ForeignKey`); (5) **official batch numbering year/reset rules** (unchanged since Task 12A).

**Task 12D (official batch numbering) - what is confirmed and what is still open.** The client confirmed the
`CODEYY-NNN` format, that the year is the allocation year (not order date or planned manufacturing date), and
annual restart of the sequence - all implemented exactly as stated. Still needed from the client: (1) **the
operating-company namespace** - is it acceptable that two different operating companies whose customers share a
client code produce the identical displayed number for their Nth allocation that year, or does the client expect a
cross-company-unique scheme (which would first need A13, customer company-scoping, resolved)?; (2) **the
`Asia/Kolkata` `BUSINESS_TIME_ZONE` default** - confirm this is the correct zone for "the year the number is
allocated"; (3) **overflow past 999** - is "never wrap, continue to 1000+" the right behaviour, or does the client
expect a fixed-width field that would need a different rule entirely; (4) **permanent non-reuse** - confirm an
allocated number is never expected to be reclaimed, edited, or reassigned even if the plan it was allocated to is
later found to be wrong.

**Task 13A (material requisition draft foundation) - what is confirmed and what is still open.** Nothing about this
task's own design was confirmed by the client beforehand - it is a bounded, working-design-only slice, explicitly
built to be reviewed rather than assumed final. A `MaterialRequisition` now exists (DRAFT only, one per batch plan,
auto-fetched from the plan's approved formula) but the following remain open: (1) **whether one requisition per
plan is correct**, or whether supplementary/follow-up requisitions against the same plan need to be supported
(today's `OneToOneField` would need to become a `ForeignKey`, the same class of change already flagged for Task
12C's `StorePreparation`); (2) **whether store users should receive formula-recipe visibility at all** - this task
gates every endpoint on `formulas.view` in addition to `batch_plans.view`, which may be broader or narrower access
than the client actually wants store-side staff to have; (3) **the requisition lifecycle** (unchanged since Task
12C's own note) - what triggers a requisition being "fulfilled," who does it, and whether fulfilment ever touches a
stock concept that does not exist anywhere in this codebase yet; (4) **whether a manual `requested_quantity`
override needs an approval step** beyond the free-text remark this task implements - today it is a proposed request
only, with no second party required to sign off on it; (5) **the client's own "Requisition Status" column** (see
`docs/client-register-field-mapping.md`) is still not represented by any field - `MaterialRequisition.status` today
has exactly one value (`DRAFT`), not the multi-state lifecycle the client's register implies exists.

**Task 13C (physical receipt ledger foundation) - what is confirmed and what is still open.** Nothing about this
task's own design was confirmed by the client beforehand - `docs/shared-store-inventory-plan.md`'s own status
legend applies in full, and this task deliberately implements only the narrowest possible slice of it (`RECEIPT_IN`
only). Everything that document leaves open remains open: (1) **legal ownership of material in the shared store**
- `StockMovement.source_company` is explicitly documented as receiving/purchasing context only, never an ownership
answer; (2) **whether QC acceptance is required before material counts as available** - no release/hold field
exists anywhere in this task, and `release_status` is always the literal "Not tracked"; (3) **reservation, issue,
consumption and return semantics** - none exist; (4) **whether identifying the same physical lot across multiple
receipts matters to the client** - this task's own lot identity (`StockMovement.source_receipt_line`, a
`OneToOneField`) does not resolve this at all: two receipts carrying the identical supplier `lot_reference` text
produce two unrelated internal identities, by design, not oversight; (5) **whether/when a broader stock ledger
(reservation, issue, opening-stock import, ownership transfer) should be built** - this task's own recommended
"first slice" scope (`docs/shared-store-inventory-plan.md` §8) is now implemented; the next slice (opening-stock
import) still needs the ownership question above answered first.

**Task 14A (company-scoped product CSV import) - what is confirmed and what is still open.** Nothing about this
task's own design was confirmed by the client beforehand. (1) **The permission split** - every endpoint requires
`products.view` + `products.create` + `products.import` together; the client has not confirmed whether a caller
should ever be able to preview without also holding create/import authority, or commit without holding plain
`products.create` too. (2) **The 1-hour preview expiry** (`PREVIEW_TTL`) - an arbitrary working choice, not sized
against how long a real 2000-row review actually takes a human reviewer. (3) **The 5 MiB / 5000-row / 20-column
bounds** - sized generously above "at least 2000 rows" but never confirmed against the client's actual product
register size or CSV export tooling. (4) **The 2000-character `description` cap** - `Product.description` itself
has no database limit; this import invents one for response-size safety, which the client has not seen or
approved. (5) **All-or-nothing commit** - the task's own explicit instruction for this first slice; a partial-
commit-with-per-row-result mode (create every valid row, report the rest as skipped) was deliberately not built,
and may be what the client actually wants once import volume grows. (6) **Column scope** - only the plain identity
fields already on `Product` are supported; no pricing, tax, HSN/GST, batch, or company-specific offering data is
imported, matching `Product`'s own still-open company-scoping question (`docs/erp-handoff-open-decisions.md`,
Task 10B / A13) rather than resolving it.

**Task 14B (formula draft CSV import) - what is confirmed and what is still open.** Nothing about this task's own
design was confirmed by the client beforehand. (1) **The permission split** - every endpoint requires
`formulas.view` + `formulas.create` + `formulas.import` + `shared_catalog.view` (any store) together; whether a
caller should ever be able to preview without full commit authority is unconfirmed, same open question as Task
14A's identical choice. (2) **The 1-hour preview expiry, and the 5 MiB / 5000-row / 1000-group / 200-lines-per-
group / 20-column bounds** - all arbitrary working choices, not sized against the client's actual formula
register or CSV export tooling; a catalog needing more than these bounds must be split into several sequential
files, which the client has not been asked whether that is acceptable. (3) **All-or-nothing commit** - a
partial-commit mode (create every valid formula, report the rest as skipped) was deliberately not built for this
first slice. (4) **Existing-code rejection is absolute** - an existing `(company, code)` formula, even a DRAFT
one nobody has touched in months, permanently blocks that code from ever being used by an import; whether the
client would instead want an import to be able to ADD a new revision to an existing DRAFT formula it recognizes
is unanswered - this task's own instruction was explicit that this is out of scope for this slice, not that the
question is resolved. (5) **No formula approval happens here, by design** - every imported revision is an
ordinary DRAFT, subject to the same still-unconfirmed self-approval policy question Task 11C already raised
(`docs/erp-handoff-open-decisions.md`, Task 11C); importing many formulas at once does not, and should not,
imply any of them are pre-approved. (6) **Column scope** - only `base_output_quantity`/`output_uom_code`/
material lines are supported; no yield, waste, potency, packaging-content relationship (Task 12B-2), or scaling
concept is imported, matching Formula's own existing scope boundary rather than expanding it.

**Task 14C (shared material master CSV import) - what is confirmed and what is still open.** Nothing about this
task's own design was confirmed by the client beforehand. (1) **Superuser-only import** - this preserves the
existing, already-confirmed-by-code (not by the client) rule that ordinary material creation is active-superuser
administered; the client has never been asked whether a less-privileged "import materials" role should exist
separately from full catalog administration. (2) **The 1-hour preview expiry and the 5 MiB / 5000-row / 20-
column bounds** - arbitrary working choices, not sized against the client's actual material register. (3)
**All-or-nothing commit** - a partial-commit mode was deliberately not built for this first slice, matching
Tasks 14A/14B's identical choice. (4) **No `category_code` column** - `Material.category` is entirely
unaddressed by this import; every imported material is created with no category, which the client has not been
asked whether that is acceptable for materials it actually wants categorized. (5) **No `canonical_factor`/unit-
conversion column** - this import creates materials only, never units, and never touches a unit's conversion
factor; a material's own base unit must already exist and already be exactly what the client wants (Task 12B-2's
own still-open "who sets this and when" question is untouched by this task). (6) **Import dependency order**
(Units → Materials → Products → Formula drafts) is a recommended WORKING SEQUENCE for a fresh catalog, not a
system-enforced one - nothing prevents running these out of order, it would simply produce more "unknown
code" row errors at each later step.

**Task 15A (material requisition submission) - what is confirmed and what is still open.** Nothing about this
task's own design was confirmed by the client beforehand - this is explicitly a limited, working submission
step, not a finished approval chain. Still needed from the client: (1) **who receives `material_requisitions.
submit`** - no role/persona has been assigned it anywhere in this codebase; this task seeds the permission to
nobody. (2) **Review/approval authority and sequence after submission** - nothing reads, approves, rejects, or
acts on a `SUBMITTED` requisition anywhere; it simply sits frozen. (3) **Correction/cancellation of an
already-submitted request** - not yet supported; there is no reopen/amend/cancel action, and a mistaken
submission currently has no remedy within this system. (4) **Partial issue** - whether a requisition can be
partially fulfilled against several physical issues, or must be all-or-nothing, is unanswered (no issue concept
exists at all yet). (5) **QC/QA gates** - whether a requisition (or the material it requests) must pass any
quality check before or after submission is unanswered; submission deliberately does not check QC release,
since no such concept exists yet. (6) **Stock ownership and issue policy** - submission does not reserve,
issue, or consume anything, and the underlying stock-ownership/issue-policy questions `docs/shared-store-
inventory-plan.md` already raised (Task 13B) remain fully open, untouched by this task. (7) **Whether
`SUBMITTED` corresponds to the client's own Excel "Requisition Status" column** - explicitly NOT assumed by
this task (see `docs/client-register-field-mapping.md`); that column's multi-state lifecycle may mean something
different from this binary DRAFT/SUBMITTED distinction.
