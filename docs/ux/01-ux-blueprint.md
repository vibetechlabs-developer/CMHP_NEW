# CMHP ERP — UX Blueprint (Part 1 of 3)

Design only. No backend code, frontend code, APIs or data models are defined here.
Companion documents: `02-screen-specifications.md` (every screen) and
`03-figma-structure-and-design-system.md` (Figma pages, design system, components,
prototype wiring). Screen IDs in the existing `docs/erp-screen-catalog.md` are reused
where a screen already exists.

**How to read the status tags used throughout**

| Tag | Meaning |
|---|---|
| **BUILT** | A backend contract exists today (see `docs/frontend-api-handoff.md`). |
| **PARTIAL** | Part of the screen is backed today (e.g. drafts only); the rest is design-only. |
| **DESIGN-ONLY** | No backend exists. Designed so the prototype is complete; behavior is a proposal. |
| **TBC** | A business rule the client has not confirmed. Shown in the UI as a *Pending Client Confirmation* marker. Nothing here invents the answer. |

Honest baseline (so the demo never over-claims): today's backend covers auth, users/
companies/roles, shared catalog, suppliers, customers, products, quotation **drafts**,
direct sales-order **drafts + policy-gated confirmation**, purchase request → approval →
purchase order → issue → goods receiving, incoming QC inspection **drafts**, material
specification **drafts**, and formula **drafts**. Everything else (batches, material
planning, stock/inventory, production, BMR, QC results, QA release, invoice, dispatch,
traceability, recall, accounts, Tally, documents, notifications, audit viewer, reports)
is **DESIGN-ONLY** and must be presented in the client demo as a designed prototype, not
as working software.

---

## A. Complete Information Architecture

Two-level sidebar (module → screen). Top bar carries global context. The sidebar shows
only modules/screens the user can at least *view*; a screen a user may see but not act on
shows disabled actions with a reason (see permission behavior in Part 3).

```
DASHBOARD                       (role-aware landing, §C)
MASTER DATA        Companies · Customers · Suppliers · Products · Materials · Units ·
                   Storage Locations · Product Codes · Material Codes · Formulas ·
                   Quality Specifications
SALES              Quotations · Quotation Revisions · Sales Orders · Order Tracking
PLANNING           Batch Registration · Material Planning · Material Requests ·
                   Material Shortages
PURCHASE           Purchase Requests · Purchase Orders · Delivery Tracking ·
                   Supplier Bills · Purchase Returns
STORES             Material Receiving · Inventory · Stock Transfers · Production Issues ·
                   Material Consumption · Unused Material Returns · Stock Adjustments ·
                   Stock Count · Rejected Materials · Expiry Management
PRODUCTION         Production Planning · Production Batches · Manufacturing · Packaging ·
                   Production Progress · BMR
QUALITY            QC Dashboard · Incoming Material QC · In-Process QC · Finished Goods QC ·
                   QC Reports · Certificates of Analysis · QA Review · QA Batch Release ·
                   TQM / Quality Issues · Deviations · Corrective Actions · Controlled Changes
TRACEABILITY       Batch Traceability · Material Traceability ·
                   Customer Shipment Traceability · Product Recall
INVOICE & DISPATCH Invoices · Dispatch · Dispatch Eligibility · Customer Returns
ACCOUNTS           Customer Receipts · Supplier Payments · Expenses ·
                   Credit/Debit Adjustments · Tally Posting
DOCUMENTS          Reference Books · Documents · Document Versions
REPORTS            Management Dashboard · Sales · Purchase · Inventory · Production ·
                   QC/QA · Financial Tracking
SYSTEM             Users · Roles · Permissions · Notifications · Audit Trail · Settings
```

**Global chrome (every screen)**

- **Top bar**: company switcher (+ store switcher when the module is store-scoped), global
  search (record reference / batch / lot), notification bell with unread count, help,
  user menu (my permissions, sign out).
- **Sidebar**: module groups collapsible; the active screen highlighted; a small
  *DESIGN-ONLY* dot is **not** shown to end users — it exists only in the Figma
  annotation layer (Part 3) so reviewers can tell prototype from built.
- **Breadcrumb + record header**: `Module › Screen › Reference` with the record status
  badge and the primary action to the right.
- **Two-company / shared-store rule (existing product truth, keep visible)**: company is a
  *business* scope, store is a *physical* scope; the two permission systems are separate
  and the UI must never imply one grants the other.

**Cross-module principles that shape every screen**

1. **Linked records, not re-typing.** Every downstream screen shows its upstream
   record as a chip (`SO-… › Batch B-… › PO-…`) that navigates back; fields inherited
   from upstream are read-only with an "inherited from" tooltip.
2. **Status ≠ location.** Stock has a *quality/availability status* (Available, Reserved,
   Quarantine, Rejected, Blocked, Expired, Awaiting Inspection). Received material is never
   shown as usable until QC-approved (§C, stores flow).
3. **Approval ≠ administration.** Admin manages users, roles, master data and
   configuration. **Admin never implies QA release authority**: the *Release / Hold /
   Reject* actions render only for a user holding the explicit QA-release permission
   (§B, §I, screen QA-02). An Admin without it sees the record read-only with the
   message "QA release requires the QA Release permission".
4. **Drafts are drafts.** A draft (quotation, order, formula revision, BMR draft) is never
   styled as authorization for manufacturing, stock reservation or invoicing.
5. **Everything is traceable and auditable.** Each record has an *Activity* tab (audit
   timeline) and each status change captures a reason where policy requires (TBC).
6. **Unresolved rules are visible, not hidden.** A rule the client has not confirmed is
   shown with a *Pending Client Confirmation* marker (§L) rather than a silent default.

---

## B. Complete User Journey (primary client-demo backbone)

Actors: **Sales, Purchase, Stores, Production, QC, QA, Accounts, Admin.** Each step lists
*who acts*, *the screen*, and *the state the record ends in*. Rules marked **TBC** are not
decided by the client; the prototype shows them as configurable placeholders.

| # | Step | Actor | Screen | Resulting state / rule |
|---|---|---|---|---|
| 1 | Login | any | AUTH-01 | Session opens; lands on role dashboard |
| 2 | Dashboard | any | DASH-01 / role dashboard | KPI + alerts; deep links into work queues |
| 3 | Customer | Sales | MD-CUST | Active customer selected/created |
| 4 | Quotation | Sales | SAL-Q02 | Quotation **Draft** (PARTIAL: drafts built) |
| 5 | Quotation accepted | Sales (approval roles **TBC**) | SAL-Q03 | **Accepted** → *Convert to Sales Order* enabled (DESIGN-ONLY; conversion policy **TBC**) |
| 6 | Sales order | Sales | SAL-O03 | Order **Draft → Confirmed** (BUILT; confirmation policy explicit per company) |
| 7 | Batch registration | Production/Planning | PLN-B02 | Batch **Registered** against an order line; order-to-batch relationship **TBC**; batch numbering **TBC** |
| 8 | Formula selection | Planning | PLN-B02 | Formula **version** pinned to the batch and shown permanently |
| 9 | Material requirement calculation | Planning | PLN-M01 | Required raw + packaging quantities (calculation rules **TBC**; simple quantity-based today) |
| 10 | Stock availability check | Planning/Stores | PLN-M01 | Available vs required per material (stock is DESIGN-ONLY) |
| 11 | Material shortage | Planning | PLN-S01 | Shortage rows; **Create Purchase Request** offered per shortage |
| 12 | Purchase request | Purchase/Planning | PUR-R02 | PR **Draft → Submitted → Approved** (BUILT; 3-step approval) |
| 13 | Purchase order | Purchase | PUR-O02 | PO **Draft → Issued** (BUILT) |
| 14 | Material receiving | Stores | STO-R02 | Receipt **Posted**; lot status **Awaiting Inspection** — *not* usable stock |
| 15 | QC inspection | QC | QC-I02 | Inspection **Draft → Submitted** (BUILT); decision/disposition DESIGN-ONLY, tests/specs **TBC** |
| 16 | Approved material stock | QC → Stores | STO-I01 | QC-approved lot becomes **Available**; rejected → **Quarantine / Supplier Return** |
| 17 | Production planning | Production | PRD-P01 | Weekly plan; material readiness per batch |
| 18 | Material issue | Stores | STO-P01 | Lot-level issue to the batch (only Available stock selectable) |
| 19 | Manufacturing | Production | PRD-E01 | Stage progress, actual consumption, wastage |
| 20 | Packaging | Production | PRD-K01 | Packaging material usage, finished quantity |
| 21 | BMR | Production (permissions **TBC**) | BMR-01 | Record compiled; review → approval (states configurable, **TBC**) |
| 22 | Finished goods QC | QC | QC-F01 | Result **Passed / Failed**; retests traceable |
| 23 | QA review | QA | QA-01 | Review of QC + BMR + records + deviations |
| 24 | QA batch release | **QA-release permission holder only** | QA-02 | **Released / Hold / Rejected**. Only *Released* makes stock normally dispatchable |
| 25 | Invoice | Accounts/Sales (**TBC**: invoice-before-dispatch) | INV-I02 | Invoice **Draft → Approved** |
| 26 | Dispatch eligibility check | Stores/Dispatch | INV-E01 | Checklist: **QA Release ✓ · Expiry ✓ · Stock ✓** → *Eligible for Dispatch* |
| 27 | Dispatch | Stores | INV-D02 | Packed qty, transporter; **partial dispatch** supported |
| 28 | Payment tracking | Accounts | ACC-R01 | Receipts matched to invoices; outstanding updates |
| 29 | Tally posting | Accounts | ACC-T01 | Draft → Verification → Approval → **Posted** (idempotent retry) |
| 30 | Reports / dashboard | Management | RPT-01 / DASH-01 | Cycle visible end to end |

**Reverse / exception journeys (must be prototyped too)**

- *Shortage → PR → late delivery → notification → re-plan* (Purchase Delay alert).
- *QC reject → Quarantine → Supplier Return / Purchase Return* (material never reaches Available).
- *Finished-goods QC fail → authorized retest → traceable history → QA hold* (no dispatch).
- *QA Hold → dispatch eligibility fails → blocked banner with reason* (never silently hidden).
- *Customer return → Returned-stock (separate bucket) → assessment → Credit / Replacement.*
- *Recall: select batch → affected stock → customers → dispatches → recovery tracking.*
- *Tally posting failed → Retry → single accounting entry (idempotency key visible).*

---

## C. Department-wise Workflow

Each department owns a **work queue** (its dashboard) and a **hand-off** to the next.

| Department | Owns | Receives from | Hands off to | Work-queue cards |
|---|---|---|---|---|
| **Sales** | Customers, quotations, sales orders, order tracking | — | Planning (confirmed orders), Accounts (dispatched orders) | Pending orders · quotations awaiting acceptance · dispatch status |
| **Planning** (usually Production/Purchase roles; ownership **TBC**) | Batch registration, material planning, shortages | Sales orders | Purchase (shortages), Production | Unplanned orders · shortages · material readiness |
| **Purchase** | PR, PO, delivery tracking, supplier bills, purchase returns | Shortages | Stores (deliveries), Accounts (bills) | PRs pending approval · POs open · pending/late deliveries |
| **Stores** | Receiving, inventory, transfers, issues, consumption, returns, adjustments, counts, expiry | Purchase, QC (approved lots) | Production (issued material), Dispatch | Awaiting inspection · low stock · near-expiry · rejected material · receipts today |
| **Production** | Planning, batches, manufacturing, packaging, BMR | Planning, Stores (issues) | QC (finished goods), Stores (finished goods) | Batch status · material readiness · planned vs actual |
| **QC** | Incoming/in-process/finished QC, COA, retests | Stores (received lots), Production | Stores (approved/rejected lots), QA | Pending · under test · failed · review pending |
| **QA** | QA review, batch release, TQM/deviations/CAPA, controlled changes | QC, Production (BMR) | Dispatch (release), Invoice | Review pending · release pending · open deviations · overdue actions |
| **Accounts** | Invoices, receipts, payments, expenses, adjustments, Tally | Dispatch, Purchase (bills) | Management | Invoices · receipts · outstanding · Tally failures |
| **Admin** | Users, roles, permissions, master data, settings, audit view | — | — | Access requests · inactive references · audit anomalies. **No QA-release, no approval by default.** |

**Roles × capabilities (design principle, not a permission matrix)**

The seven action verbs — **View, Create, Edit, Approve, Export, Download, Print** — are
independent per module. *Approve* is per workflow (e.g. `QA Release` is its own approval,
not a general "approver"). The Permissions screen (SYS-P01) shows a role × module × verb
grid where any cell the client has not decided is marked **TBC** and defaults to *no
access*. Company permissions and store permissions are shown in two separate grids.

---

## E. Screen-to-Screen Navigation (map)

```
LOGIN ─▶ DASHBOARD ─▶ (role queue card) ─▶ any list
                                  │
CUSTOMER ──▶ QUOTATION LIST ──▶ QUOTATION CREATE ──▶ QUOTATION DETAIL ──▶ [Accept] ──▶ [Convert]
                                                        │  └─ Revision history                │
                                                        ▼                                     ▼
                                              SALES ORDER LIST ◀────────────────────── SALES ORDER DETAIL ──▶ Order Review ▶ Confirm
                                                        │                                     │
                                                        ▼                                     ▼
                                              ORDER TRACKING ◀── (progress: ordered/pending/dispatched)
                                                                                               │
BATCH REGISTRATION ◀────────────────────────────────────────────────── (Register batch from order line)
     │  └─ Formula version selector ─▶ FORMULA DETAIL (revision, read-only)
     ▼
MATERIAL PLANNING ─▶ MATERIAL SHORTAGES ─▶ [Create Purchase Request] ─▶ PR DETAIL ─▶ PO DETAIL ─▶ DELIVERY TRACKING
                                                                                          │
                                                                                          ▼
MATERIAL RECEIVING ─▶ (Awaiting Inspection) ─▶ INCOMING QC ─▶ result ─┬▶ INVENTORY (Available)
                                                                       └▶ REJECTED MATERIALS ─▶ PURCHASE RETURN
INVENTORY ─▶ PRODUCTION PLANNING ─▶ PRODUCTION ISSUE ─▶ MANUFACTURING ─▶ PACKAGING ─▶ BMR
BMR ─▶ FINISHED GOODS QC ─▶ QA REVIEW ─▶ QA BATCH RELEASE ─▶ INVOICE ─▶ DISPATCH ELIGIBILITY ─▶ DISPATCH
DISPATCH ─▶ CUSTOMER RECEIPTS ─▶ TALLY POSTING ─▶ REPORTS / DASHBOARD
Any batch/lot chip ─▶ BATCH / MATERIAL TRACEABILITY ─▶ PRODUCT RECALL
Any record ─▶ Activity tab ─▶ AUDIT TRAIL (filtered to that record)
```

Rules: every arrow is a real link with a labelled chip in the header of the destination
("from SO-…"). A destination reached from upstream opens *pre-filtered* and *pre-linked*;
it never asks the user to retype the upstream reference.

---

## I. Status System

One shared vocabulary; each module uses a subset. Color is **never the only signal**: every
badge carries an icon and text.

**Workflow statuses (documents)**

| Status | Meaning | Tone |
|---|---|---|
| Draft | Editable, authorizes nothing | neutral |
| Submitted | Sent for review, locked for the submitter | info |
| Pending | Waiting on someone (name/role shown) | warning |
| Review Pending | Waiting on a reviewer (QC/QA/BMR) | warning |
| Approved | Approved by an authorized approver | success |
| Returned | Sent back for correction with a reason | warning |
| Rejected | Refused, reason required | danger |
| Completed | Finished normally | success |
| Failed | Technical or test failure | danger |
| On Hold | Deliberately paused, reason + owner shown | caution |
| Confirmed | Order confirmed (sales) | success |
| Cancelled | Terminated (policy **TBC**) | neutral-muted |

**Stock / lot statuses (inventory)** — Available · Reserved · Awaiting Inspection ·
Quarantine · Rejected · Blocked · Expired. *Awaiting Inspection*, *Quarantine*, *Rejected*,
*Blocked* and *Expired* are non-issuable: their rows show a lock icon and the issue
action is disabled with the reason.

**QC statuses** — Pending · Under Test · Passed · Failed · Review Pending. A **Failed**
result is never overwritten: an authorized retest creates a new attempt in the same
chain (`Attempt 1 Failed → Attempt 2 Passed`), both visible.

**QA release statuses** — Under Review · Released · On Hold · Rejected. *Released* is the
only status that makes finished stock **normally dispatchable**; the rule is stated in
words on every dispatch-related screen.

**Delivery statuses (purchase)** — Ordered · Partially Received · Pending · Fully
Received · Cancelled; plus a *Late* overlay derived from expected date.

**Tally statuses** — Pending · Successful · Failed · Retry. *Retry* is a state of the
same posting attempt chain; a retried posting reuses one idempotency key and can never
create a second accounting entry (shown as "Attempt 3 — same entry #").

**Approval history outcomes** — Approved · Rejected · Returned · Corrected.

**Distinguishing badge families** — workflow badges are pills; stock badges are pills with a
left color bar and lock icon where non-issuable; QA release is a larger shield badge;
QC is a beaker icon badge — so a screen mixing them stays legible.

---

## K. Client Presentation Flow (the 20-minute story)

Run as one clickable prototype (Figma page 23). Suggested narration order:

1. **Control center** (Dashboard) — "one place for orders, stock, quality and dispatch".
2. **Order to plan** — Quotation → Accepted → Convert → Sales Order → Order Review/Confirm.
   *Say*: order drafting and confirmation with explicit company policy are **built**.
3. **Plan to material** — Batch registration (formula version pinned) → requirement →
   shortage → Purchase Request. *Say*: formula drafts and PR/PO are built; batch/stock are designed.
4. **Material to stock** — PO → Receipt (**Awaiting Inspection**) → QC → Approved/Available.
   *Show* the rejected branch → Quarantine → Supplier return.
5. **Stock to product** — Production plan → Issue → Manufacturing → Packaging → BMR.
6. **Quality gate** — Finished goods QC → QA review → **QA Release** (admin sees it disabled
   — make the "Admin ≠ QA authority" point on purpose).
7. **Product to customer** — Invoice → Dispatch eligibility (checklist) → Dispatch (partial).
8. **Money and books** — Payment tracking → Tally posting (failed → retry → one entry).
9. **Proof** — Batch traceability (forward and reverse) and Product Recall — the wow moment.
10. **Governance** — Audit trail, notifications, role dashboards, then the **Pending Client
    Confirmation** page (§L) as the agenda for the next workshop.

Demo hygiene: all names/numbers synthetic; a persistent, tasteful "Prototype — design
preview" ribbon on design-only screens in the *presentation* file variant.

---

## L. TBC / Pending Client Confirmation

Displayed on Figma page 24 and, in the product, as a small amber **TBC** chip with a
tooltip "Pending client confirmation — not a decided rule". None is invented here.

| Area | What is undecided | Where the prototype shows it |
|---|---|---|
| Approval roles | Who approves quotations, POs, BMR, deviations, adjustments, Tally | Approval panels show "Approver: TBC (configurable)" |
| Approval sequence | Number/order of steps (only PR's 3-step flow exists today, itself provisional) | Step lists render from configuration, not fixed |
| Approval limits | Value thresholds per role | Limits column present, empty, TBC |
| BMR permissions | Create/Edit/Review/Approve/Print/Download/Production/QA access | BMR permission-state matrix (BMR-02) |
| BMR preparation timing | Before, at, or after batch start | Timeline shows an unplaced "BMR prepared" marker |
| Formula calculation rules | Scaling, packaging rounding, fixed quantities, losses, yield/waste, potency, units | Requirement screen shows quantity-based result + "Calculation rules: TBC" |
| Batch numbering | Scheme and generator | Batch number field is entered/edited, scheme TBC |
| Order-to-batch relationship | 1:1, 1:many, many:1 | Batch registration allows linking; cardinality note TBC |
| QC tests and specifications | Real tests, limits, methods | Test rows editable; no seeded values |
| QC approval process | Reviewer/approver rules, self-review | Reviewer field present; rule TBC |
| QA approval / release process | Who, how many, evidence required | Release panel shows required-evidence checklist as TBC |
| TQM forms | Complaint/deviation/CAPA field sets | Generic fields + TBC banner |
| Invoice-before-dispatch | Whether invoice must precede dispatch | Dispatch eligibility shows "Invoice required: TBC" |
| Tally version | Prime/ERP 9/etc. | Settings placeholder |
| Tally integration method | XML/ODBC/file/API | Settings placeholder |
| Required financial reports | Which reports | Financial Tracking Reports = layout placeholders |
| User/department structure | Departments, reporting lines | Users screen department field TBC |
| Notification channels | In-app/email/SMS | Preferences screen lists channels as TBC |
| Also carried from the backend (already documented) | Company-scoped vs shared masters; quotation conversion policy; order confirmation/cancellation rules; stock ledger and reservation policy; QC disposition and release | See `docs/erp-handoff-open-decisions.md` §A/§B |
