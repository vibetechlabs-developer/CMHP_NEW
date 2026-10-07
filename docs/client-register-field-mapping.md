# Client Register Field Mapping — Task 12B

**Status: Task 12B-1 aligned the ADMIN-section labels and product-type metadata against the client's actual Excel
header row and sample record below; everything else in this document is still the Task 12B analysis against the
client's plain-English field list, not yet checked against a real sample.** This document maps the client's fields
against the code that exists today (`apps/sales_orders`, `apps/products`, `apps/customers`, `apps/companies`,
`apps/batch_plans`), and against `docs/erp-client-flow.md` and `docs/erp-handoff-open-decisions.md`. Where a client
label could plausibly mean more than one thing, every plausible reading is listed — none is picked silently. Where a
field has no existing home anywhere in the codebase, that is stated as a fact, not softened.

## Task 15B — read-only Order–Batch Register (combines existing fields, adds none)

A new, READ-ONLY endpoint (`GET /api/v1/companies/<company_id>/batch-register/`, `apps.batch_register`) now
joins several of the EXISTING records this document already maps - one row per `BatchPlan` - into a single
paginated view closer to the shape of the client's own register. **It adds no new field, status, or business
meaning anywhere** - every value it returns already exists in `apps.sales_orders`/`apps.customers`/`apps.
products`/`apps.batch_plans`/`apps.store_preparation`/`apps.material_requisitions`, exactly as this document
already describes them. See `docs/backend-tasks.md`, Task 15B, for the full endpoint contract, and `docs/
frontend-api-handoff.md` §20 for the field-by-field response shape.

What this DOES let a caller see in one place, each exactly as already mapped above: `Product Name`/`Product
Code` (frozen plan-creation snapshots, §ADMIN), `Product Type` (explicitly labeled CURRENT/live, never frozen -
§ADMIN), `Client/Company Name`/`Company Code` (the customer, §ADMIN - still scoped to one operating company,
A13 unresolved), `Date of Order` (§ADMIN), `Order Qty`+its unit (from `SalesOrderLine`), `Packing Size`'s two
structured numbers - `planned_pack_quantity`/`packing_content_quantity`+unit (§MANAGER, Task 12B-2), `Batch
Size` as `target_output_quantity`+its output unit (§MANAGER - still not Manager-locked, see that row's own open
question, unchanged by this task), `Batch No.` if allocated (§MANAGER, Task 12D), `Packing Type`+`Insert`
(§STORE MANAGER, Task 12C), and `Requisition Status` as the real `DRAFT`/`SUBMITTED` value (§STORE MANAGER,
Tasks 13A/15A - see the explicit caveat immediately below).

What this endpoint deliberately does NOT do, and does not claim to do: it does **not** answer any of this
document's own still-open questions (the `Customer.code` cross-company question, the Batch Size/packed-content
unit-compatibility gap, Planned Mfg. Month's missing month-granularity field, Label/Box/MRP/Printing/BMR/
Production/Packaging/Dispatch/Invoice - none of these gained a representation here that did not already exist
elsewhere in this codebase). It does **not** assume `MaterialRequisition.status` (`DRAFT`/`SUBMITTED`) is the
same multi-state lifecycle the client's own "Requisition Status" column implies - that mapping is still
explicitly unconfirmed (see the STORE MANAGER row above and `docs/erp-handoff-open-decisions.md`, Task 15A). It
never maps an unimplemented client column to `"Pending"`, `"0"`, or `"No"` - an unimplemented field simply has
no key in the response at all, rather than a manufactured placeholder value.

## Confirmed field labels and one real sample record (Task 12B-1)

The client supplied the actual Excel header row and one sample row, reproduced here exactly (column order as
supplied; "blank" and "0"/"N/A" are the client's own literal entries, not placeholders inserted by this project):

| Excel header (exact) | Sample value |
|---|---|
| Product Name | Flexicare |
| Product Type | Tablets |
| Product Code | GER/06 |
| Client/Company Name | German Homeopathic - Gaya |
| Date of Order | 15/07/2026 |
| Company Code | GER |
| Batch No. | *(blank)* |
| Order Qty (Bottles) | 3024 |
| Packing Size | 25 Gms |
| Batch Size | 76 Kgs |
| Planned Mfg. Month | *(blank)* |
| MRP (for Printing) | *(blank)* |
| Printing Status | *(blank)* |
| Requisition Status | *(blank)* |
| BMR Status | *(blank)* |
| Production Status | *(blank)* |
| Packing Type | 25 Gm G2 |
| Label | 0 |
| Box | 0 |
| Insert | N/A |
| Remark | *(blank)* |
| Invoice | *(format pending, per the client)* |

**Confirmed semantic corrections from the client, now reflected below (superseding the earlier Task 12B guesses):**
"Name" means **Product Name**; "Type" means **Product Type**; `GER/06` is the **Product Code**, not a batch number;
"Client/Company Name" identifies the **customer**, kept separate from the operating-company workspace; the order
quantity is **in bottles**; packing content and manufacturing batch quantity are **separate** numbers; the planning
field is a **Planned Mfg. Month**, not a full date.

## How to read the table

- **Existing model/field** — an exact `Model.field` if one already exists with a directly matching meaning. "None"
  means nothing in the codebase captures this today, even approximately.
- **Proposed owning record** — where the field would live if built next, following the existing pattern of small,
  purpose-specific records (e.g. `SalesOrderConfirmationPolicy`, `FormulaApprovalPolicy`) rather than one large
  mutable object every department writes into.
- **Who edits it** — the department the client named, carried through unchanged.
- **Confirmed?** — whether the field's *meaning and data type* are settled, not whether the client mentioned it.
- **Decision required** — the exact question that has to be answered before this field can be built, if any.

---

## ADMIN

*(Superseded by Task 12B-1's confirmed semantics below — the ambiguous "Name"/"Type"/"Company"/"Company Code" rows
from the first pass of this document have been replaced, not merely annotated, so this table reflects only the
current, client-confirmed reading.)*

| Client label (exact) | Existing model/field | Proposed owning record | Who edits | Confirmed? | Decision required |
|---|---|---|---|---|---|
| Product Name | `Product.name` (existing) | `Product` (existing) | Admin | **Yes** (Task 12B-1) | None. |
| Product Type | `Product.product_type` — **added in Task 12B-1** (`apps/products/migrations/0002_product_product_type.py`), free text, no fixed choice list; "Tablets" is the client's example value, not the only one | `Product` (existing, extended) | Admin | **Yes**, as a free-text field. The *set of values the client actually uses* is still unknown — only "Tablets" has been seen. | None to build; if the client later wants a controlled list instead of free text, that is a separate, explicit decision. |
| Product Code | `Product.code` (existing) — the sample `GER/06` fits the field (`max_length=32`, uppercased/trimmed by `normalize_code`) but contains a `/`, which `normalize_code` does **not** strip, so it would be stored verbatim as `GER/06` | `Product` (existing) | Admin | **Yes**, for the mapping. **No**, for whether `/` inside a code is intentional client structure (e.g. `<company-code>/<sequence>`) that the system should ever parse, versus simply an opaque string it never interprets | Should `Product.code` values like `GER/06` ever be decomposed (e.g. to auto-derive a company/client code), or always treated as one opaque string, as `Product.code` is today? |
| Client/Company Name | `Customer.name` (existing) — the client's own confirmation: this is the **customer**, explicitly *not* the operating company (`SalesOrder.company`/`apps.companies.Company`) | `Customer` (existing) | Admin | **Yes** | None for the mapping itself. Still open (from Task 12B, A13 in `erp-handoff-open-decisions.md`): whether `Customer` should stay per-operating-company-scoped as it is today, given a customer like "German Homeopathic - Gaya" may transact with either or both operating companies. |
| Date of Order | `SalesOrder.order_date` (existing); the sample `15/07/2026` is `DD/MM/YYYY` — Excel display formatting only, not a stored format; the API already takes an ISO date | `SalesOrder` (existing) | Admin | **Yes** | None. |
| Company Code | `Customer.code` is the strongest candidate — **not** `apps.companies.Company.code`. See the dedicated analysis below (§ Customer.code as the client code). | `Customer` (existing) | Admin | **Partially.** The client confirmed this is the *client's* code, not the operating company's — but whether the existing `Customer.code` field (company-scoped, `max_length=32`) is the right long-term home, or whether "GER" is meant to also feed a future official numbering scheme (see Batch No., unresolved since Task 12A), is still open. | Should `Customer.code` be used as-is for this, or does the client expect a code that is visible/consistent across both operating companies (today `Customer` — and its `code` — is scoped to one operating company only, A13)? |
| Batch No. | None. `BatchPlan.id` is an internal planning identifier only and is never labeled Batch No. (Task 12A) | New — see Task 12A's own unresolved numbering questions | Manager (per the Task 12B register) | **No** | Unchanged from Task 12A: which company/customer/brand code feeds the number, which date determines its year, whether the sequence resets annually — the sample row's blank `Batch No.` alongside a filled `Product Code`/`Company Code` is consistent with numbering happening later, at/after planning, not at order entry. |
| Planned Mfg. Month | None. **Confirmed by the client to be a month, not a full date** — distinct from both `SalesOrder.requested_delivery_date` and the existing `BatchPlan.planned_manufacturing_date` (a full `DateField`, Task 12A) | New — a month-granularity field, not a reuse of `BatchPlan.planned_manufacturing_date` as-is | Admin (per the client's own list) | **No** | Is this stored as a year+month pair (e.g. `2026-07`), or as a full date the UI merely *displays* at month granularity? Is it order-level (one per order) or batch-level (one per `BatchPlan`, alongside the existing full-date field, meaning the two would coexist and could disagree)? |

## STORE MANAGER

| Client label | Existing model/field | Proposed owning record | Who edits | Confirmed? | Decision required |
|---|---|---|---|---|---|
| Packing Type | `StorePreparation.packing_type` — **added in Task 12C** (`apps/store_preparation`), free text, no fixed choice list | `StorePreparation` (new, Task 12C) | Store Manager | **Yes** — client confirmed: manually entered text, e.g. `"25 Gm G2"`; no parsing or structure imposed | None for the mapping. Still open: what `G2` itself means to the client, if anything beyond free text. |
| Label | `0` in the sample | New | Store Manager | **No** — explicitly not to be assumed | The sample value `0` is consistent with **a quantity** (none needed/none yet prepared) but is equally consistent with a **status/flag encoded as 0/1**. One sample of `0` cannot distinguish these. |
| Box | `0` in the sample | New | Store Manager | **No** — explicitly not to be assumed | Same ambiguity as Label: `0` could be a quantity or a 0/1 status flag. |
| Insert | `StorePreparation.insert_required` — **added in Task 12C**, nullable boolean (`null` = not specified, `false` = not required/N/A, `true` = required only — never available/printed/issued/ready) | `StorePreparation` (new, Task 12C) | Store Manager | **Partially** — client confirmed `N/A` means not required/applicable, now `false`. Quantity, readiness, and artwork/reference tracking remain unconfirmed and are NOT implemented. | Does the client ever need a quantity or a readiness state for Insert, beyond required/not-required/not-specified? |
| Requisition Status | **Partially addressed by Task 13A** (`apps/material_requisitions`) — a real `MaterialRequisition` record now exists, auto-fetched from a batch plan's approved formula. It carries only ONE status value (`DRAFT`) — there is still no submit/approve/fulfil workflow, so the client's own "Requisition Status" column (which implies a multi-state lifecycle) is still **not** represented by any field | `MaterialRequisition.status` (new, Task 13A) — currently a single fixed value, not yet the multi-state field the client's column implies | Store Manager (create/edit; no separate approval role exists) | **No** — the underlying document now exists as a working design choice requiring client review, but the STATUS lifecycle itself (what states beyond "drafted" exist, who fulfils it, what triggers a transition) remains exactly as open as before Task 13A | What states does "Requisition Status" actually need beyond a DRAFT planning document — submitted/fulfilled/partially-fulfilled? Who is authorized to change it, and does fulfilling a requisition ever touch a stock concept that also does not exist yet? |

## MANAGER

| Client label | Existing model/field | Proposed owning record | Who edits | Confirmed? | Decision required |
|---|---|---|---|---|---|
| Batch No. | `BatchNumberAllocation.number` — **added in Task 12D** (`apps/batch_plans`), format `CODEYY-NNN` | `BatchNumberAllocation` (new, Task 12D, one-to-one with `BatchPlan`) | Manager | **Yes** for the format/year-basis/annual-restart (client confirmed) — **partially** for the namespace: which company/customer code feeds it is answered (the source order's customer code), but whether that namespace should ever span operating companies is still open. | See the Task 12D open-decisions block: cross-company namespace, timezone default, overflow past 999, permanent non-reuse. |
| Packing Size | `BatchPlan.packing_size_note` exists, but is **free text with no structure and no calculation**, editable today by anyone with `batch_plans.edit` (not Manager-specific) | Either restructure `packing_size_note` into a real field, or a new Manager-owned field alongside it | Manager | **No** | The sample value is `25 Gms` — a **quantity + mass unit describing the content of one pack**, confirmed by the client to be a *different number* from Batch Size (see the unit-compatibility gap below). Is it structured (a decimal quantity + a `UnitOfMeasure` reference, matching how every other quantity in this codebase is stored) or kept as text? Today's `packing_size_note` has no permission boundary that would stop a Store user from editing what is meant to be a Manager-only value. |
| Batch Size | `BatchPlan.target_output_quantity` already exists and means "planned target output for this draft" — but it is editable by anyone with `batch_plans.edit`, with no distinction between an initial planning number and a Manager-confirmed final figure | Depends on the answer | Manager | **No** | The sample value is `76 Kgs` — a **mass**, while `BatchPlan.target_output_quantity` today is expressed **in the formula revision's output unit**, which must equal the order line's product sales unit (Task 12A's same-unit rule) — in this sample the order is in **bottles**, not kilograms. So "Batch Size" cannot be a direct rename of `target_output_quantity` without resolving the unit mismatch — see the unit-compatibility gap below. Is "Batch Size" a Manager-confirmed, separately-locked figure once Production begins (today's model has no such locked state — a `DRAFT` batch plan's target can be edited indefinitely)? |
| MRP for Printing | None. No product anywhere in the codebase carries a price of any kind — `Product` has no price field, and `SalesOrderLine.unit_price` is a transactional selling price entered per order line, not a regulatory MRP printed on packaging | New | Manager | **No** | Is this the product's statutory MRP (a master-data attribute of `Product`, changing rarely) or a per-batch value (could legitimately differ batch to batch, e.g. a price revision mid-year)? Does it need to match `SalesOrderLine.unit_price` in any way, or are they intentionally unrelated (a price printed on the pack vs. a price charged to this customer)? |
| Printing Status | None. No printing/label-production workflow exists | New | Manager | **No** | What are the actual status values, and what does each one require to be true (e.g. can "Printing Status" move forward before "Packing Size"/"MRP for Printing" are both set)? |

## PRODUCTION

| Client label | Existing model/field | Proposed owning record | Who edits | Confirmed? | Decision required |
|---|---|---|---|---|---|
| BMR Status | None. A Batch Manufacturing Record concept is design-only (`docs/ux/02-screen-specifications.md` §9, screens `BMR-01`–`BMR-03`), explicitly marked "permissions are not decided" and never backed by a model | New — and a large one; a BMR is not a status field, it is a compiled record with its own sections | Production (creation/editing); the UX design notes review/approval as a separate, undecided step | **No** | This is not a small field to add — it is an entire BMR data model (sections, review/approval workflow) that has not been scoped for backend work at all. Treat "BMR Status" as a placeholder for that whole undesigned feature, not a one-column addition. |
| Production Status | None. No production-execution model exists; nothing records that manufacturing has started, paused, or finished for a batch | New | Production | **No** | What are the actual states, and what (if anything) is required to move between them — e.g. does it require BMR to exist first, or Store's Requisition Status to be fulfilled first? |
| Remark | `BatchPlan.notes` exists, but is a single shared free-text field visible and editable by anyone with `batch_plans.edit` — there is no department-scoped note today | Depends on the answer | Production | **No** | Is Production's "Remark" the same shared `BatchPlan.notes` (meaning Admin/Store/Manager/Production would all read and write the same box), or does each department need its **own** remark field, kept separate so one department's note is never silently overwritten by another's edit? |

## PACKAGING

| Client label | Existing model/field | Proposed owning record | Who edits | Confirmed? | Decision required |
|---|---|---|---|---|---|
| Pending / In Process / Completed | None. No packaging-execution model exists | New | Packaging | **No** | Is this a single status field with exactly these three values, or does it need per-line/per-sub-operation tracking (e.g. filling vs. labeling vs. boxing, each with its own progress)? |

## DISPATCH

| Client label | Existing model/field | Proposed owning record | Who edits | Confirmed? | Decision required |
|---|---|---|---|---|---|
| Yes / No | None. No dispatch model exists; a `SalesOrder` can be `DRAFT` or `CONFIRMED` only, and **`SalesOrder.status == CONFIRMED` does not authorize production, packaging, QC release, or dispatch of anything** (documented scope boundary, Task 10F) | New | Dispatch | **No** | Is "Yes/No" dispatch-*readiness* (may this batch now be dispatched) or dispatch-*completion* (has it actually been shipped)? These are different questions with different owners and different prerequisites (e.g. does it require Packaging's status to be Completed first?). |

## INVOICE

| Client label | Existing model/field | Proposed owning record | Who edits | Confirmed? | Decision required |
|---|---|---|---|---|---|
| *(client format pending)* | None | Not proposed — the client has not supplied the format | — | **No — client said so directly** | Nothing to design against yet. Do not invent an invoice shape ahead of the client's own format. |

---

## What NOT to assume

**Resolved by the client in Task 12B-1** (kept here for the record, not because they are still open): "Name" means
Product Name, not Customer or a free-text order title. "Type" means Product Type, not order type or customer type.
`GER/06` is a Product Code, not a Batch No. "Client/Company Name" is the customer, explicitly separate from the
operating company. Order quantity is in bottles. Packing content (Packing Size) and manufacturing Batch Size are
confirmed to be two separate numbers. The planning field is a month, not a full date.

**Still open, restated against the actual code:**

- **Label/Box/Insert are not assumed to be quantities or statuses.** The sample values (`0`, `0`, `N/A`) narrow the
  possibilities (see the STORE MANAGER table above) but do not settle them — `N/A` in particular implies a state a
  plain quantity/boolean field cannot represent on its own.
- **An order-level Planned Mfg. Month is not assumed to equal the existing batch-level `BatchPlan.planned_
  manufacturing_date`.** One order can have zero, one, or several `BatchPlan`s today (Task 12A places no limit and
  implies no allocation), so an order-level month and a batch-level full date cannot simply be treated as the same
  value without saying what happens when they disagree or when several batches exist.
- **Not every order is assumed to have exactly one line or one batch.** `SalesOrder` already supports multiple
  `SalesOrderLine`s, and Task 12A already allows multiple `BatchPlan`s against the same line with no allocation
  enforced. Any field proposed as "per order" must say whether it really means per-order, per-line, or per-batch.
- **Sales-order confirmation is not assumed to grant production authority.** This is already an explicit, documented
  scope boundary (Task 10F): `CONFIRMED` status authorizes nothing downstream. None of the Store/Manager/Production/
  Packaging/Dispatch fields above should be modeled as unlocked "because the order is confirmed" without the client
  saying so.
- **Bottle-to-kilogram is not assumed to be a universal, product-independent unit conversion.** See the dedicated
  section below — the ratio in the one sample row provided does not even match a plain `quantity × packing size`
  calculation, and different products will have different packing contents regardless.

## Customer.code as the client code candidate

The client confirmed "Company Code" (`GER` in the sample) identifies the **client**, not the operating company. The
existing `Customer.code` field is a plausible home for it:

- `Customer.code`: `CharField(max_length=32)`, normalised via `apps.companies.models.normalize_code` (trim + upper-
  case) on every save, unique per `(company, code)` — **`company` here is the *operating* company** (`apps.companies.
  Company`), i.e. `Customer` rows, and therefore `Customer.code` values, are scoped underneath one operating company
  today (Task 10A, still a provisional choice — see A13 in `erp-handoff-open-decisions.md`).
- `"GER"` fits the field trivially (3 characters, well inside the 32-character limit, no special characters to
  normalise).
- **No `Customer` record was created and no existing `Customer.code` value was renamed or rewritten in this task**,
  per the task's own instruction. This is analysis only.
- **What is *not* yet answered:** if the same client ("German Homeopathic - Gaya", code `GER`) legitimately places
  orders against *either* operating company sharing this store, today's schema would need **two separate `Customer`
  rows** (one per operating company), each free to be given a *different* code, with nothing enforcing that both use
  `GER`. Whether that is acceptable, or whether the client's code needs to be a single, cross-company-consistent
  value (which `Customer.code` cannot currently guarantee), is exactly the A13 question, now made concrete by a real
  client code.
- Do **not** confuse this with `apps.companies.Company.code` (e.g. the operating company's own short code) — that
  field was not renamed, repurposed, or touched in this task, per the explicit instruction.

## Batch-planning unit compatibility gap — RESOLVED at a technical level (Task 12B-2)

Task 12A's `create_batch_plan` originally required the pinned formula revision's **output unit** to equal the source
sales-order line's product **sales unit**, by identity, always. The client's own sample record showed exactly the
combination that rule rejected: **Order Qty (Bottles): 3024** (a COUNT-dimension quantity), **Packing Size: 25 Gms**
(the content of one bottle, MASS-dimension), **Batch Size: 76 Kgs** (the manufacturing batch quantity, also
MASS-dimension) — a product sold in bottles and manufactured in kilograms.

**Task 12B-2 added a second, explicit path** (`apps/batch_plans/validation.py`): alongside the original same-unit
rule (now "Shape A", unchanged for every plan that doesn't need it), a `BatchPlan` may instead carry an explicit,
plan-specific packing relationship — `planned_pack_quantity` (3024) + `packing_content_quantity` (25) +
`packing_content_uom` (grams) — validated against the formula's output unit (kilograms) via an explicit,
administrator-set `UnitOfMeasure.canonical_factor` (never inferred from unit names/codes; MASS is never converted to
VOLUME). The formula revision's own output unit is now independently selectable at creation
(`apps.formulas.services`'s `output_uom_id`), so a bottle-sold product's formula can be approved with a kilogram
output unit in the first place — that was the actual blocker, not batch planning's own rule.

**The arithmetic still does not close on the one sample given, and that is reported, not hidden:**

```
3024 bottles × 25 g/bottle = 75,600 g = 75.6 kg
```

but the client recorded **Batch Size = 76 Kgs**, a difference of **0.4 kg (≈0.53%)**. The system now computes and
displays this exactly — `packing_assessment.expected_packed_content = 75.6`,
`packing_assessment.difference = +0.4`, labeled **"Planning quantity difference"** — but it does **not** explain the
difference, does **not** treat either number as more correct than the other, and does **not** apply any wastage,
rounding, or yield factor to make them agree. **Why the client's own two numbers differ is still recorded here as
unresolved** — Task 12B-2 made the discrepancy visible and precise; it did not resolve it.

What remains explicitly out of scope, per the task's own instructions: this ratio (bottles-to-grams-to-kilograms) is
**never** treated as a universal, product-independent conversion — a different product's packing content is a
different number, entered explicitly per plan, every time; there is no reusable "packing spec" yet (see below).

## Product API extended: `product_type` (Task 12B-1)

`Product.product_type` (`CharField(max_length=100, blank=True, default="")`) was added —
`apps/products/migrations/0002_product_product_type.py`, additive only, existing rows default to `""` and remain
valid without any data migration. It is exposed and editable through the existing Product API using the existing
conventions, with no new endpoint, permission, or workflow:

- `GET`/list responses (`ProductSerializer`) now include `product_type`.
- `POST .../products/` (`ProductCreateSerializer`) accepts an optional `product_type` at creation.
- `PATCH .../products/<id>/` (`ProductUpdateSerializer`) accepts `product_type` like `description` — omitting the
  key leaves it unchanged, sending `""` clears it, sending a value sets it, all under the existing `products.edit`
  permission, `expected_version` optimistic concurrency, and `product.updated` audit trail (`before`/`after` now
  include `product_type`, verified by `tests.test_products.ProductUpdateTests.test_update_audit_before_after`).
- **Deliberately free text, no fixed choice list.** "Tablets" is the one example value seen so far; a second,
  different sample value (`"Homeopathic Globules"`) is accepted equally in the added tests, confirming no enum was
  silently introduced.
- **Verified not to silently reach historical snapshots.** Every place a `Product` is captured into another record —
  `apps.quotations.services._snapshot_fields` (reused by `apps.sales_orders.services`), `apps.batch_plans.services.
  create_batch_plan`'s `snapshots` dict, and `apps.formulas.approval.approved_identity` — builds its snapshot from an
  explicit, hand-written field list (`product_code_snapshot`, `product_name_snapshot`, etc.), never a generic
  "serialize the whole product" call. `product_type` appears in none of those lists, so adding it to `Product` does
  not, and cannot, retroactively alter any existing quotation line, sales-order line, formula-approval snapshot, or
  batch-plan snapshot. No shared code in those modules was touched to reach this conclusion or to make it true — it
  was already true by how those snapshot functions are written, confirmed by reading them, not by adding new tests
  there.

## Product API extended: independent formula output unit (Task 12B-2)

`apps.formulas.services.create_formula`/`create_formula_revision` accept an optional `output_uom_id` at creation
(omitted: unchanged default, `product.sales_uom`; given: any active unit, independent of the product's own sales
unit). `apps.formulas.approval.assess_approval` no longer requires the two to match — that equality was the actual
reason a bottle-sold, kilogram-manufactured product could never be approved before this task. See
`docs/backend-decisions.md`, Task 12B-2, for the full reasoning.

## Pending fields for the next slice — not to be added as generic text columns

**Addressed at a technical level by Task 12B-2** (moved out of this list): Packing content quantity/unit and
manufacturing batch quantity/unit now exist as real, structured `BatchPlan` fields
(`planned_pack_quantity`/`packing_content_quantity`/`packing_content_uom`, plus the unchanged
`target_output_quantity` for the manufacturing target) — see the resolved section above. This did **not** answer
*why* the client's own Batch Size doesn't match the computed packed content, and it did **not** make a packing
relationship reusable across plans (see below) — both remain open.

The remaining client fields are recorded here as named, still-undesigned gaps, each requiring its own structural
decision before it becomes a field — not a placeholder text/status column added now "to have something":

- **Planned manufacturing year/month** (Planned Mfg. Month) — needs a month-granularity representation (not reusing
  `BatchPlan.planned_manufacturing_date`'s full-date field as-is) and a decision on order-level vs. batch-level.
- **Packing Type** (`25 Gm G2`) — needs to be understood first (see the STORE MANAGER table above) before it is
  structured as anything.
- **Label/Box meanings** — quantity vs. status vs. "not applicable" is unresolved, including what `0` means on the
  client's own sample row; Insert's required/not-required/not-specified tri-state is now implemented (Task 12C), but
  quantity, readiness, and artwork/reference tracking for Insert are not.
- **Printing/BMR/production/requisition status choices** — none of these have a defined set of states yet; each is a
  separate, currently-nonexistent workflow (see the MANAGER/PRODUCTION/STORE MANAGER tables above), not a single
  enum field.
- **MRP currency and per-pack basis** — no product or batch anywhere carries a price today; whether MRP is a rarely-
  changing product attribute or a per-batch value, and in what currency, is unresolved.
- **Official batch numbering** — unchanged from Task 12A: which company/customer/brand code feeds it, which date
  determines its year, whether the sequence resets annually.
- **Reusable packing specifications** — today's packing relationship (Task 12B-2) is deliberately plan-specific
  only; whether "25 Gms per bottle, Packing Type 25 Gm G2" should become a reusable, product-level default (so it
  isn't re-entered on every plan) is an open question, explicitly deferred so this slice did not invent a shared
  product-packaging-variant concept.
- **Why the client's Batch Size (76 Kgs) differs from the computed packed content (75.6 Kgs)** — now shown exactly,
  still not explained; see the resolved section above.

## Recommendation: how to extend the schema, when the client answers

**Do not add every department's fields to one model.** `BatchPlan` (Task 12A) is deliberately a narrow planning
record — company, source line, formula revision, target quantity, a few descriptive fields — editable under one
permission (`batch_plans.edit`) by whoever holds it. Folding Store's Label/Box/Insert/Requisition Status, Manager's
Batch No./Packing Size/Batch Size/MRP/Printing Status, and Production's BMR/Production Status/Remark into that same
model and permission would mean **anyone who can edit a plan's target quantity could also edit the official batch
number and the MRP printed on packaging** — almost certainly not what "who edits it" in the client's own register is
asking for.

The pattern already used twice in this codebase (`SalesOrderConfirmationPolicy` next to `SalesOrder`;
`FormulaApprovalPolicy`/`FormulaRevisionContributor` next to `FormulaRevision`) is a **separate, purpose-specific
record per department, linked to `BatchPlan` by an immutable one-to-one (or one-to-many, where the client confirms
more than one of something is possible) reference, each behind its own COMPANY permission**:

- **Admin order-entry fields** (Name/Type/Company/Company Code, once disambiguated, and Date of Order) belong on
  `SalesOrder`/`SalesOrderLine`/`Customer`/`Product` — the existing admin-facing records — not on `BatchPlan` at all,
  since they describe the order or the party, not a specific manufacturing plan.
- **Store preparation information** (Packing Type, Label, Box, Insert, Requisition Status) would be its own record,
  something like a `BatchStorePreparation`, one per `BatchPlan`, behind a new `batch_store_prep.edit`-style
  permission distinct from `batch_plans.edit`.
- **Batch-specific information** (Batch No., Packing Size, Batch Size, MRP for Printing, Printing Status) would be
  its own record, something like `BatchManagerDetails`, one per `BatchPlan`, behind its own Manager-only permission —
  and, notably, Batch No. likely needs to be assigned **once and then frozen** (mirroring how `FormulaRevision`
  becomes immutable on approval), which argues for its own dedicated field and assignment step rather than a plain
  editable text box.
- **Calculated values** — none of the client's fields are unambiguously calculated today (e.g. "Batch Size" could be
  manually entered by the Manager, or could be intended to come from `BatchPlan.target_output_quantity`, or could be
  scaled from the formula's `base_output_quantity` — see the open question above). Until the client confirms which,
  no field should be silently derived instead of stored, or silently stored instead of derived.
- **Future stock/production events** (BMR Status, Production Status, Packaging progress, Dispatch Yes/No) describe a
  full execution lifecycle that does not exist yet in any form — these are not single fields to bolt onto `BatchPlan`
  but a genuinely new set of models (batch execution, BMR, packaging run, dispatch record), each with its own states
  and transitions, matching the "PLANNED" stages already listed in `docs/erp-client-flow.md` and the design-only BMR
  screens in `docs/ux/02-screen-specifications.md`. None of this should be scoped until the smaller, upstream
  questions above are answered, since several of these events likely gate on each other (e.g. Dispatch probably
  cannot be "Yes" before Packaging is "Completed").

## Department workflow mapping (2026-10-05)

| Register field | Source | Edited by (permission) | Status |
|---|---|---|---|
| Client / Company | Sales order customer (name) | sales_orders.edit | Connected |
| Company code | Customer code (derived) | read-only | Connected |
| Product name / code | Order line product | sales_orders.edit | Connected |
| Type | Order line `product_type_snapshot` from ProductType lookup | sales_orders.edit | Connected; does not change the product master |
| Date of order | Sales order `order_date` | sales_orders.edit | Connected |
| Planned Mfg Date (order) | Sales order `planned_manufacturing_date` | sales_orders.edit | Connected; default for a new batch plan (review pending) |
| Batch planned date | BatchPlan `planned_manufacturing_date` | batch_plans.edit | Connected |
| Packing Type | StorePreparation `packing_type` | store_preparation.edit | Connected |
| Insert | StorePreparation `insert_required` (null/true/false) | store_preparation.edit | Connected |
| Label / Box | StorePreparation `label_note` / `box_note` | store_preparation.edit | Interim unstructured text; meaning awaits client |
| Requisition Status | MaterialRequisition status | material_requisitions.* workflow | Read-only in UI; lifecycle actions not built |
| Batch No. | BatchPlan official number | batch_plans.allocate_number | Connected; never editable after allocation |
| Packing Size / Batch Size | BatchPlan packing + target quantities | batch_plans.edit | Connected |
| MRP for Printing | BatchPlan `mrp_for_printing` (sales order currency) | batch_plans.printing_edit | Connected; working default |
| Printing Status | BatchPlan `printing_status_note` | batch_plans.printing_edit | Interim free text; no confirmed status list |
