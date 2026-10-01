# CMHP ERP — Screen Specifications (Part 2 of 3)

Design only. See `01-ux-blueprint.md` for status tags (BUILT / PARTIAL / DESIGN-ONLY / TBC),
the journey, and navigation; `03-…` for the design system and Figma structure.

## 0. Shared definitions (apply to every screen unless a screen overrides them)

To keep 100+ screens precise without repeating themselves, the attributes every screen
must provide are defined once here and only *deviations* are listed per screen.

**Header** — top bar (company/store switcher, global search, notifications, user menu) +
breadcrumb + record title with status badge + primary action (right). Detail screens add
a **chain strip** under the title: upstream/downstream record chips.

**Sidebar** — the module's group expanded, current screen highlighted; only permitted
screens are listed.

**Layout archetypes** (referenced by name below)
- **L-List** — filter bar (search, status, date, owner, saved views) → data table (sortable,
  column chooser, sticky header, row actions, bulk select where safe) → pagination → export
  (permission-gated).
- **L-Detail** — record header + chain strip → tabs (*Overview · Lines/Content · Documents ·
  Activity*) → right rail (status, next action, key facts) → sticky action bar.
- **L-Editor** — header summary → sectioned form/line editor → sticky "Save draft / Submit"
  bar with unsaved-change guard; version held in state, never editable.
- **L-Dashboard** — KPI strip → chart row → alert/queue panels → activity feed.
- **L-Wizard** — stepper (3–5 steps) → step body → back/next → review step.
- **L-Board** — kanban or stage lanes with cards and counts.
- **L-Diagram** — canvas with node/edge graph + side inspector + result table.
- **L-Modal / L-Drawer / L-Confirm** — overlays (see components).

**Standard states (default for every screen)**
- **Empty** — illustration-free, icon + one sentence + the primary create action if permitted
  (else "No records yet" + who can create).
- **Loading** — skeleton of the real layout (table rows, cards); no full-page spinner.
- **Error** — inline banner with plain message, retry, and a reference id; field-level errors
  under fields; never a raw code.
- **Success** — toast with a link to the record; the record header shows the new status.
- **Conflict (stale version)** — modal "This record changed since you opened it": shows what
  changed, buttons *Reload* (never auto-retry).
- **Permission behavior** — *no view* → screen absent from sidebar and, if opened by link,
  the Permission Denied state; *view only* → actions disabled with a tooltip naming the missing
  permission; *approve* actions render only for holders of that specific approval.
  Export/Download/Print are separate gated buttons.
- **Audit** — every record has an *Activity* tab (user, date/time, previous → new value,
  reason).

**Per-screen line format**: **Purpose · Layout · Content (fields/components) · Actions ·
Statuses · Navigation · Deviations** (states/permissions only when different from §0).

---

## 1. Authentication (Figma 02) — AUTH-01 BUILT

**AUTH-01 Login** — *Purpose*: sign in. *Layout*: centered card on a calm manufacturing
backdrop (no marketing). *Content*: username, password, sign-in, throttle message,
company branding text. *Actions*: Sign in. *Statuses*: idle · submitting · locked/throttled
("try again in N seconds"). *Navigation*: → role dashboard; last company/store restored.
*Deviations*: Error = "Sign-in failed" without revealing which field; no self-registration.
**AUTH-02 Session expired** — modal returning to the same page after re-login.
**AUTH-03 Access denied** — full-page Permission Denied: what was requested, which permission
is missing, "Contact your administrator", back button.

---

## 2. Dashboards (Figma 03) — DESIGN-ONLY (KPIs backed later)

**DASH-01 Management Dashboard** — *Purpose*: pharmaceutical control-center overview.
*Layout*: L-Dashboard. *Content*: KPI cards — **Orders, Purchases, Batch Stock, Expiry,
Production, QC Pending, QA Pending, Dispatch, Sales, Customer Outstanding, Tally Sync** (value,
delta, sparkline, drill link); charts — **Production overview** (planned vs actual by week,
stacked by stage), **Order status** (donut + legend, click filters Order Tracking),
**Purchase status** (funnel Requested→Ordered→Received); alert panels — **Material shortage**,
**Near-expiry**, **QC pending**, **QA release pending**; **Recent activity** feed; **Notifications**
preview. *Actions*: date-range, company, department filter; drill-through; export (permission).
*Navigation*: every card/alert opens the relevant list pre-filtered. *Deviations*: KPI cards a
user cannot view are replaced by "No access" tiles (layout stays stable). Currency values show
the company currency and never sum across currencies (mixed → "Multiple currencies").

**DASH-S Sales** — Orders, Pending Orders, Dispatch Status, quotations awaiting acceptance.
**DASH-P Purchase** — PRs pending approval, POs open, Pending Deliveries, Material Shortages.
**DASH-T Stores** — Stock by status, Expiry, Rejected Material, Receipts awaiting inspection.
**DASH-R Production** — Production Plan, Batch Status board, Material Readiness, Planned vs Actual.
**DASH-Q QC/QA** — Pending Tests, Failed Tests, Review Pending, Batch Release queue.
**DASH-A Accounts** — Invoices, Receipts, Payments, Outstanding ageing, Tally Posting Status.
*(All: L-Dashboard, same chrome; each landing is chosen by the user's primary role; users with
several roles get a tab per role.)*

---

## 3. Master Data (Figma 04)

**MD-CO Companies** BUILT (ADM-05/07) — list/detail, active state, no delete.
**MD-CUST Customers** BUILT (CUST-01–04) — list (code, name, contact, active), create modal,
detail/edit (code immutable; editable while inactive), activate/deactivate confirm. Version in
state. Note: company-scoping is provisional (**TBC**).
**MD-SUP Suppliers** BUILT (SUP-01/02) — shared directory; "active ≠ qualified" note; qualification
workflow **TBC**.
**MD-PROD Products** BUILT (PROD-01–04) — sales unit immutable; inactive-unit badge.
**MD-MAT Materials** BUILT (CAT-03) — kind Raw/Packaging, category, base unit; material lookup
needs store-level catalog access (note shown to formula authors).
**MD-UOM Units** BUILT (CAT-01) — dimension (mass/volume/count); deactivation guard messaging.
**MD-LOC Storage Locations** BUILT (CAT-04) — per store.
**MD-PCODE Product Codes / MD-MCODE Material Codes** DESIGN-ONLY — code registry with
generator rule **TBC**; shows code, owner record, status, immutability lock.
**MD-FRM Formulas** BUILT drafts (FRM-01–05) — *Layout*: list + detail with **Revisions tab**;
editor = product/base-output summary, **Raw Materials** table, **Packaging Materials** table,
Notes, *Save Draft* (both tables save atomically). *Statuses*: revision Draft only today; a
**Approved** state and *Controlled Change* link are DESIGN-ONLY and marked **TBC**. No Approve /
Create Batch / Issue Material actions in the built version.
**MD-SPEC Quality Specifications** BUILT drafts (SPEC-01–05) — specification → versions → test rows;
kept visually and structurally separate from formulas.

*Common deviations*: master lists show a *Where used* drawer (linked records) before
deactivation; deactivation confirmation warns about active references without hiding history.

---

## 4. Sales (Figma 05)

**SAL-Q01 Quotation List** PARTIAL (QUOT-01) — columns: reference, customer, date, valid until,
currency, subtotal, **status** (Draft · Submitted · Accepted · Rejected · Expired · Revised —
beyond Draft is DESIGN-ONLY). Filters: customer, dates, status. Row → SAL-Q03. *Actions*: New.
**SAL-Q02 Quotation Create/Edit** PARTIAL (QUOT-02) — L-Editor. Header: customer (active),
date, **validity**, currency (fixed after create), **terms** (text), notes. Lines: product,
quantity, unit, price, line amount; **Taxes** row (DESIGN-ONLY; tax rules **TBC** — rendered as
a labelled placeholder block, never a computed value); subtotal (pre-tax) and an *estimated total*
area marked TBC. *Actions*: Save Draft, Submit. Inactive-master badges; snapshot values stay.
**SAL-Q03 Quotation Detail** PARTIAL (QUOT-03) — header chain (customer › quotation › order).
Tabs: Overview · Lines · Terms & Validity · **Revisions** · Documents · Activity. Right rail shows
status and the **Accept Quotation** action for authorized roles (**TBC**). *Interaction*:
**Accept Quotation → confirmation modal ("Accepting records the customer's acceptance. It does not
create stock or production.") → status Accepted → banner action "Convert to Sales Order"**.
*Convert* opens SAL-O02 pre-filled and read-only-linked (conversion policy **TBC**).
**SAL-Q04 Quotation Revision History** DESIGN-ONLY — timeline of revisions (R0, R1…), side-by-side
diff of lines/prices/terms, who/when/why, "Set as current". Old revisions are read-only.
**SAL-Q05 Quotation Approval/Acceptance** DESIGN-ONLY — approval history (Approved/Rejected/
Returned/Corrected), approver list from configuration (**TBC**), decision dialog with reason.

**SAL-O01 Sales Order List** BUILT (SO-01) — reference, customer, customer PO, order date,
requested delivery, currency, subtotal, **status** (Draft · Confirmed). Filters as built.
**SAL-O02 Create/Edit Order** BUILT (SO-02) — L-Editor (see catalog); order date, requested delivery,
customer order reference (not unique), currency, lines.
**SAL-O03 Sales Order Detail** BUILT (SO-03) — Overview · Lines · **Progress** (see SAL-O04) · Activity.
Buttons: *Edit draft* (draft only), *Review & Confirm* (opens SO-04), read-only when Confirmed
(confirmed by/at, recorded policy).
**SO-04 Order Review** BUILT — summary, line totals, items needing attention (policy missing /
eligibility / policy rules / informational), *Edit draft*, **Confirm** (enabled only if the viewer
holds the confirm permission and nothing blocks). "Confirmation rules are not configured. Contact
your administrator." when the policy is missing. **SO-05 Confirm dialog** BUILT (states in catalog).
**SO-06 Confirmation Policy** BUILT (superuser configuration; **Admin configures the policy but
configuration ≠ confirmation authority**).
**SAL-O04 Order Progress / Order Tracking** DESIGN-ONLY — per line: **Ordered · Pending ·
Dispatched** quantities as segmented progress bars; delivery date with lateness chip; **batch
relationship** column (linked batch chips; cardinality **TBC**); dispatch status timeline
(Confirmed → Batch registered → Produced → Released → Dispatched); filters by customer/status/late.

---

## 5. Planning (Figma 06)

**PLN-B01 Batch Registrations List** DESIGN-ONLY — batch no., product, sales order, quantity,
formula version, production date, expected completion, status (Registered · Planned · In
Production · Completed · On Hold).
**PLN-B02 Batch Registration** DESIGN-ONLY — L-Editor. Fields: **Sales Order** (picker, confirmed
only — rule **TBC**), **Product** (from the order line), **Batch Number** (scheme **TBC**, editable
until registered then immutable), **Batch Quantity**, **Formula Version** (selector listing formula
+ revision, showing the **revision number and its status prominently in a pinned chip "Formula F-001
rev 2 — pinned"**), **Production Date**, **Expected Completion Date**. A collapsible *Formula
snapshot* shows the lines as they were when pinned. Warning modal if the chosen revision is not
Approved (approval state **TBC**). *Why formula version is prominent*: approved formula changes must
stay historically traceable — the chip is read-only after registration and appears on every
downstream screen (planning, BMR, QA, traceability).
**PLN-M01 Material Requirement** DESIGN-ONLY — L-Detail for a batch. **Two separate tables**:
**Raw Materials** and **Packaging Materials**. Columns: Material · Required Quantity · Available
Quantity · Shortage Quantity · Unit · Status (*Sufficient · Short · Awaiting Inspection stock only*).
Available counts only **Available**-status stock (pending/quarantine excluded, shown in a tooltip
breakdown). Example row: *Amber bottle 200ml — Required 1000 · Available 700 · Shortage 300 · BTL ·
Short → **Create Purchase Request***. Banner: "Calculation rules pending client confirmation".
No proportional scaling controls appear. *Actions*: Recalculate, Create Purchase Request (per
shortage or all), Reserve (**TBC**, hidden).
**PLN-M02 Material Requests** DESIGN-ONLY — internal requests from Production to Stores/Purchase.
**PLN-S01 Material Shortages** DESIGN-ONLY — cross-batch shortage board: material, total short,
affected batches, earliest need date, existing PR/PO links, *Create PR* / *Add to existing PR*.

---

## 6. Purchase (Figma 07) — PR/PO BUILT

**PUR-R01 Purchase Requests** BUILT (PR-01) · **PUR-R02 Create PR** (PR-02) · **PUR-R03 PR Detail**
(PR-03, Approval History tab PR-04, decision dialog PR-05). Design additions: a **Shortage source**
chip (batch/shortage the PR came from — DESIGN-ONLY link); 3-step approval stepper (Step 1–3) with
approver identities; self-decision and distinct-approver notes marked provisional (**TBC**).
**PUR-O01 Purchase Orders** BUILT (PO-01) · **PUR-O02 Create PO** (PO-02) · **PUR-O03 PO Detail**
(PO-03; Issue snapshot PO-04; Issue dialog PO-05). Content: **Supplier · Material · Quantity · Rate ·
Expected delivery date**, currency, subtotal (pre-tax). Statuses Draft · Issued · Cancelled.
**PUR-D01 Delivery Tracking** PARTIAL — per PO line: **Ordered · Received · Pending** with segmented
bar; delivery status badge **Ordered · Partially Received · Pending · Fully Received · Cancelled**;
expected date + *Late* chip; supplier contact; timeline of receipts (links to Material Receiving).
**PUR-B01 Supplier Bills** DESIGN-ONLY — bill list/detail matched to PO and receipts (3-way match
panel: PO / Receipt / Bill with variance highlighting); status Draft → Verified → Approved
(approvers **TBC**) → Sent to Accounts.
**PUR-X01 Purchase Returns** DESIGN-ONLY — return of rejected/damaged material: linked receipt lot,
quantity, reason, supplier acknowledgement, credit expectation; status Draft → Approved → Shipped →
Closed; ties to *Rejected Materials*.

---

## 7. Stores & Inventory (Figma 08)

**STO-R01 Receipts List** BUILT (GR-01) · **STO-R02 Create Receipt** (GR-02) · **STO-R03 Detail**
(GR-03; eligible-PO picker GR-06; post/cancel dialogs GR-05/07). *Design content*: **PO, Supplier,
Supplier Lot, Internal Lot, Quantity, Dates (arrival, manufacturing/expiry where captured — **TBC**),
Attachments, Shortage, Excess, Damage, Discrepancy**. **Critical visual**: after posting, a
horizontal **stock-status workflow strip** is pinned in the header:
`RECEIVED → AWAITING INSPECTION → QC → APPROVED → AVAILABLE STOCK`, with the branch
`QC → REJECTED → QUARANTINE / SUPPLIER RETURN`. The current lot sits on *Awaiting Inspection* with a
lock icon and the sentence "Received material is not usable production stock until QC approves it."
(Built today: posting and delivery progress; the strip beyond *Awaiting Inspection* is DESIGN-ONLY.)
**STO-I01 Inventory Dashboard** DESIGN-ONLY — tabs **Raw Materials · Packaging Materials · Finished
Goods**; view toggle *by Item · by Lot · by Batch · by Location*; status chips with counts
(**Available · Reserved · Quarantine · Rejected · Blocked · Expired · Awaiting Inspection**), each a
strong badge; alert strips **Low stock** and **Near expiry**; table columns item, lot/batch, location,
quantity + unit, status, expiry (days-left chip), owner company (**TBC**); row → lot drawer with movement
history and traceability link. Quick actions: Transfer, Adjust, Count (permission-gated).
**STO-T01 Stock Transfers** — from/to location, lot, quantity, reason; status Draft → Approved →
Completed.
**STO-P01 Production Issues** — issue to a production batch: batch chip, requirement rows, **only
Available lots selectable** (others greyed with reason), lot-level quantities, issuer/receiver
sign-off; over-issue warning modal.
**STO-C01 Material Consumption** — actual vs issued per batch (feeds BMR); variance flag.
**STO-U01 Unused Material Returns** — return of issued-unused material to stock; returned lots
re-enter as **Awaiting Inspection or Available per rule (TBC)**.
**STO-A01 Stock Adjustments** — reason (mandatory), lot, +/- quantity, evidence, approval (approver **TBC**);
audit shows previous → new.
**STO-N01 Stock Count** — count sheet (blind/open toggle **TBC**), counted vs system, variance,
recount, post adjustment.
**STO-J01 Rejected Materials** — quarantine/rejected lots: reason (from QC), supplier, disposition
(*Supplier Return / Destroy / Rework* — **TBC**), links to Purchase Return.
**STO-E01 Expiry Management** — timeline of lots by expiry (30/60/90-day bands), expired lots
auto-shown as **Expired** and non-issuable, retest-date support (**TBC**).
*Deviations*: every stock table has **status filter chips as the primary control**; non-issuable
rows show a lock; totals never mix statuses without saying so.

---

## 8. Production (Figma 09)

**PRD-P01 Weekly Production Plan** DESIGN-ONLY — week grid (Mon–Sun) with batch cards, and a table
alternative. Columns: **Batch · Product · Planned Quantity · Production Date · Priority · Material
Readiness** (traffic indicator + "3/5 materials ready" tooltip) and a progress bar. Actions:
reschedule (drag), set priority, open batch. Filters: line/week/status.
**PRD-B01 Production Batches** — list + detail; detail header shows batch no., product, **formula
version chip (pinned)**, quantity, order link; tabs *Overview · Materials · Manufacturing · Packaging ·
BMR · QC/QA · Traceability · Activity*.
**PRD-E01 Production Execution / Manufacturing** — stage tracker (e.g. Weigh → Blend → Fill → …; stage
list configurable, **TBC**), **Progress**, **Actual Consumption** vs planned per material (variance
chips), **Output**, **Wastage**, **Unused Material Returned**, **Packaging Material Usage**,
**Finished Quantity**, **Planned vs Actual**, **Yield** (shown as a computed display with the
calculation basis "TBC"). Actions: start stage, record entry, hold batch (reason), complete stage.
Statuses: Not Started · In Progress · On Hold · Completed.
**PRD-K01 Packaging** — packaging material usage by lot, packs produced, rejects, reconciliation
(issued − used − returned − rejected = 0 check, rule **TBC**), finished goods handoff to QC.
**PRD-G01 Production Progress** — cross-batch board (L-Board) by stage with counts and late chips.

---

## 9. BMR (Figma 10)

**BMR-01 Batch Manufacturing Record** DESIGN-ONLY — L-Detail. Sections: **Batch Details ·
Formula Reference (revision pinned) · Material Usage · Manufacturing Execution · Packaging Records ·
Timeline · Attachments · Review · Approval**. A vertical **progress rail** shows record
completeness; sections fill from upstream records (read-only "sourced from") with manual entries
clearly marked. Print/Download buttons are permission-gated and log to audit.
**BMR-02 BMR Permission States** — a **configurable matrix** with rows *Creation · Editing · Review ·
Approval · Printing · Download · Production access · QA access* and columns = roles; every cell defaults
to **Pending Client Confirmation** (amber) and *no access*; an Admin can set cells, each change audited.
The screen states plainly: "BMR permissions are not decided. Nothing here implies a rule."
**BMR-03 BMR Review/Approval** — reviewer panel, comments per section, outcome Approved/Returned/
Rejected/Corrected with reason; preparation timing marker **TBC**.

---

## 10. QC (Figma 11)

**QC-D01 QC Dashboard** — cards **Pending · Under Test · Passed · Failed · Review Pending**; queues by
type; oldest-waiting; analyst workload.
**QC-I01 Incoming Material QC (list)** BUILT drafts (QC-01) · **QC-I02 Detail / Draft** (QC-02–05) —
today: draft observations against a posted receipt line, then *Submit* (freezes). Design extension
(DESIGN-ONLY): **QC Test** rows (Test Specification, Sample, Result, Analyst, Reviewer, Test Date),
**QC Result** status and **QC Review** step; disposition **Approved / Rejected** sends the lot to
*Available* or *Quarantine* (rules **TBC**). Specification is picked from Quality Specifications and its
**version is pinned** on the inspection.
**QC-P01 In-Process QC** — checks tied to a production batch stage; pass/fail gates a stage (rule **TBC**).
**QC-F01 Finished Goods QC** — tests per batch; result feeds QA Review; **retest** action (authorized)
creates Attempt N+1; failed attempts stay visible in a **retest chain** timeline; failure blocks release.
**QC-R01 QC Reports** — by period/product/material/analyst; export gated.
**QC-C01 Certificate of Analysis** — generated from passed results; preview, version, issue date,
download/print gated; each COA shows spec version and batch/lot.
**Standard QC test form** (L-Editor): Test Specification (pinned version) · Sample (id, quantity,
taken by/at) · Result (numeric/text, unit) · Analyst · Reviewer (self-review rule **TBC**) · Test Date ·
Attachments · Notes. *Failed result flow*: result saved as **Failed** → banner "Failed results are
kept. An authorized retest creates a new attempt." → retest (reason) → new attempt row in the chain.

---

## 11. QA (Figma 12) — Admin ≠ QA authority

**QA-01 QA Review** — one screen assembling a batch's evidence as tabs/cards: **Batch · QC Status ·
BMR Status · Production Records · Material Traceability · Documents · Deviation/Issue status**, each
with a green/amber/red readiness indicator and a link. A top **release-readiness summary** lists what
is complete/outstanding.
**QA-02 QA Batch Release** — decision panel with three actions: **Release · Hold · Reject**, each
requiring a reason and showing the evidence checklist (**required evidence TBC**). *Permission
behavior (critical)*: the three buttons render **only** for users holding the explicit QA-release
permission. An Admin, Sales, Production or QC user (without it) sees the panel read-only and the
line "QA release requires the QA Release permission. Administrative access does not grant it."
*Rule banner (always visible, prominent shield icon)*: **"Finished goods cannot be normally dispatched
until QA release is completed."** Status after action: Released (dispatchable) · On Hold (blocked,
reason + owner) · Rejected (blocked, disposition **TBC**). Confirmation modal states the consequence.
The release decision is immutable; a change requires a documented reversal path (**TBC**).

---

## 12. TQM / Quality Issues (Figma 13)

**TQM-C01 Complaints** — customer/internal complaint intake: source, product/batch link, severity,
owner, status (Open → Investigating → Closed). **TQM-D01 Deviations** — deviation record: description,
batch/lot link, classification (**TBC**), impact assessment, owner, status; open deviations shown as
blockers/warnings in QA Review. **TQM-A01 Corrective Actions** — fields **Issue (link) · Owner · Deadline
· Status · Closure Evidence** (attachments); overdue chip; closure requires evidence + verifier (**TBC**).
**TQM-X01 Controlled Changes** — change requests against **Formula · Specification · Documents**:
what changes, from → to (version diff), reason, impact, approvals (**TBC**), effective version. Forms
are generic and marked **TBC (TQM forms)**.

---

## 13. Traceability (Figma 14) — the signature screens

**TRC-B01 Batch Traceability** — *Purpose*: full forward genealogy from one batch number.
*Layout*: L-Diagram with a **search bar** ("Enter Batch Number") at top, a **horizontal swimlane
diagram** below, and a **result table + inspector** on the right.
*Diagram lanes (left → right, each a column of linked nodes)*:
`Supplier Lots → Raw Materials → Production Batch → Formula Version → BMR → QC → QA Release →
Finished Goods → Invoices → Dispatches → Customers`.
Nodes are cards (icon, id, status badge, quantity) joined by curved connectors whose thickness reflects
quantity; hovering a node highlights its full path; clicking opens the inspector with details and a link
to the source record. Fan-in/out is explicit (one batch → many customers). Status colors follow §I so a
Quarantine lot or On-Hold release is instantly visible on the path. *Actions*: Expand/collapse lane,
Fit to screen, Export/Print (gated), **Start recall from this batch**. *Empty*: "No batch found for
that number" + suggestions. *Loading*: skeleton lanes with shimmering nodes.
**TRC-M01 Material Traceability (reverse)** — enter a **material lot**: diagram reverses to
`Material Lot → Which batches used it? → Finished goods → Which customers received them?` with a
summary strip *N batches · N invoices · N customers · quantity shipped*. *Action*: Start recall.
**TRC-S01 Customer Shipment Traceability** — pick a customer/invoice → batches and lots delivered, dates,
quantities, returns.
**TRC-R01 Product Recall** — *Flow shown as a stepper*: **Batch selected → Identify affected stock →
Identify customers → Identify dispatches → Track recovery**. Panels: **Affected Stock** (by location/
status; on-hand stock auto-flagged **Blocked**), **Customers** (contact, quantity received, notified
status), **Dispatches** (invoice, date, transporter), **Recovery Progress** (per customer: notified →
acknowledged → returned quantity; overall % bar). Actions: Initiate recall (confirmation + reason,
approver **TBC**), Notify (channel **TBC**), Record recovery, Close. Recall records are immutable
audit-wise.

---

## 14. Invoice & Dispatch (Figma 15)

**INV-I01 Invoices** — reference, customer, order, date, amount (currency), status (Draft · Approved ·
Sent · Paid · Part-paid · Cancelled — **TBC**), tally status. **INV-I02 Invoice Detail** — lines from
released/dispatch quantities, taxes area (**TBC**), payment status, Tally chip; **invoice-before-
dispatch** applicability shown as **TBC**.
**INV-E01 Dispatch Eligibility** — *Purpose*: gate dispatch. *Content*: **mandatory checklist** —
`QA Release ✓ · Expiry Check ✓ · Stock Availability ✓` (each row shows the evidence: release id, expiry
date/days-left, stock lot/qty). Each item ✓ (green) / ✗ (red with reason) / — (not evaluated). Only when
all are valid does a large **"Eligible for Dispatch"** state appear and *Create Dispatch* enable; otherwise
a **"Not eligible — blocked by: QA Release"** banner. *Rule text*: "Finished goods are dispatchable only
after QA release." Extra rows (invoice, customer credit) appear as **TBC**.
**INV-D01 Dispatch List / INV-D02 Dispatch** — fields **Invoice · Batch · Packed Quantity · Transporter ·
Dispatch Details** (vehicle, LR no., date, documents). **Partial dispatch** supported: per line
**Dispatched · Pending** quantities and a **Delivery Status** (Not Dispatched · Partially Dispatched ·
Dispatched · Delivered); creating a second dispatch for the pending balance is one click. Blocked by
INV-E01 status; shows why.
**INV-R01 Customer Returns** — return intake: invoice/batch link, quantity, **Return Reason**,
**Assessment** (Pending → Accepted/Rejected), **Credit** and **Replacement** outcomes; returned stock
sits in a **separate "Returned – Pending Assessment" bucket** and is never merged with Available until
assessed.

---

## 15. Accounts & Tally (Figma 17)

**ACC-R01 Customer Receipts** — receipt entry against invoices (allocate/part-pay), mode, reference,
outstanding recalculation, status. **ACC-S01 Supplier Payments** — against approved bills; approval
(**TBC**). **ACC-E01 Expenses**, **ACC-J01 Credit/Debit Adjustments** — reason mandatory, link to invoice/
bill/return, approval (**TBC**).
**ACC-T01 Tally Posting** — pipeline view **Draft → Verification → Approval → Tally Posting** as a
stepper per voucher batch; table columns voucher, type, amount, status **Pending · Successful · Failed ·
Retry**, attempt count, idempotency key, last error. *Failed/Retry design*: a failed posting shows the
error, a **Retry** button, and the explicit note "Retrying reuses the same posting key and cannot create a
duplicate entry"; after success the entry number is displayed once and Retry disappears. Filters by
status/date/type. *Settings note*: Tally version and integration method are **TBC** (placeholders).

---

## 16. Documents (Figma 18)

**DOC-R01 Reference Books** — library with a **distinct "REFERENCE — not an approved manufacturing
instruction" banner and a different visual treatment (muted tone, book icon)**; organize by category,
search, view, download (gated). **DOC-D01 Documents** — controlled documents: category, owner,
status (Draft · Approved · Obsolete), current version. **DOC-S01 Search** — full-text + filters, results
with snippet. **DOC-P01 Preview** — in-app viewer with watermark on non-controlled copies.
**DOC-V01 Document Versions** — version list, diff/compare, effective dates, superseded marker,
approvals. Approved manufacturing instructions carry an "Approved" seal and never share a list with
reference books without an explicit type column and filter.

---

## 17. Reports (Figma 19)

**RPT-01 Management Dashboard** (same as DASH-01 with report drill-downs). **RPT-S Sales**, **RPT-P
Purchase**, **RPT-I Inventory**, **RPT-R Production**, **RPT-Q QC/QA**, **RPT-F Financial Tracking**
(required reports **TBC** → layout placeholders). Common layout: filter panel (period, company, product,
customer/supplier) → summary KPIs → chart → detail table → *Export / Download / Print* (each gated).
Saved views and scheduled delivery are DESIGN-ONLY.

---

## 18. Notifications (Figma 20)

**NTF-01 Notification Center** — inbox list grouped by day; types **Approval Pending · Material
Shortage · Late Material · Purchase Delay · QC Pending · QA Review Pending · Production Update ·
Tally Posting Failed**; unread state, severity icon, deep link into the record, mark read/all, filter
by type. **NTF-02 Preferences** — per-type toggles; **channels (in-app/email/SMS) TBC**. Empty:
"You're all caught up." A notification never contains a decision button — it links to the record.

---

## 19. System (Figma 21, 22)

**SYS-U01 Users** BUILT (ADM-01–04) · **SYS-R01 Roles** BUILT (ADM-09/10, ADM-13/14) · **SYS-P01
Permissions** BUILT catalog (ADM-08) + design grid: role × module × verb (**View · Create · Edit ·
Approve · Export · Download · Print**), company and store grids separated, TBC cells amber and default
no-access. Note on the screen: "Administrator access does not grant business approvals such as QA release."
**SYS-S01 Settings** — company settings, numbering schemes (**TBC**), business timezone (assumed India,
**TBC**), Tally connection (**TBC**), notification channels (**TBC**), sales-order confirmation policy
(BUILT, SO-06).
**SYS-A01 Audit Trail** — table + filters **User · Module · Date · Action · Record**; each row expands to
**Previous Value → New Value + Reason** (field-level diff). **Approval history** view shows outcome chips
**Approved · Rejected · Returned · Corrected** on a timeline. Read-only, exportable (gated), no delete.

---

## 20. UX states catalogue (Figma 01 “States”)

Every major workflow ships these frames, in light and dark and at desktop/tablet widths:

- **Status frames**: Draft · Submitted · Pending · Approved · Returned · Rejected · Completed · Failed ·
  On Hold · Quarantine · Awaiting Inspection · Review Pending (record header + badge + right-rail action).
- **System frames**: Empty · Loading (skeleton) · Error · Success (toast + header) · **Confirmation modal**
  (states consequence, requires typed reason where policy says) · **Warning modal** (e.g. non-approved
  formula, over-issue, blocked dispatch) · **Permission Denied** (names missing permission).
- **Conflict frame**: stale-version modal with a diff summary.
