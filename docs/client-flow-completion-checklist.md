# Client flow completion checklist

Written for: the product owner, the client-facing lead, and the QA person who runs the browser journey.
Audit date: 2026-10-06. Companion to `current-fullstack-progress-report.md` (section 4 and 10).

How to use: each row has a **Code status** (what the audit found in code and tests) and a **Browser result** column for the manual run. Browser results are blank until someone runs the step on a synthetic order. Do not use real customer data.

Status words: Implemented and verified at the stated layer; Connected in code (browser pending); Partial; Mock-only; Not implemented; Awaiting client decision.

---

## Before you start

- [ ] Use a synthetic order and a synthetic customer. Do not use real client data.
- [ ] Sign in as Nishita (Admin). Choose the workspace (currently Company A / DEMOA in test data).
- [ ] Sign out and sign in as Saloni and Fenil in separate browser profiles or private windows, so sessions do not mix.
- [ ] Fenil must sign out and sign in again after any role change (role data is read at sign-in).
- [ ] Note the time and the browser used in the results table.

---

## Step 1. Admin (Nishita): create the order

| # | Check | Code status | Browser result |
|---|---|---|---|
| 1.1 | Choose operating company workspace | Connected in code (`my-permissions`) | |
| 1.2 | Create or select the customer; customer code shown | Connected in code (`customers`) | |
| 1.3 | Select product; product type and product code shown | Connected in code (`products`, `product-types`) | |
| 1.4 | Enter date of order, order quantity (whole number) and unit price | Connected in code (`sales-orders`) | |
| 1.5 | Enter planned manufacturing date (exact date; month-only not supported) | Awaiting client decision (stored as a date) | |
| 1.6 | Save order; order number shown after save | Connected in code | |
| 1.7 | Close and reopen the order; values are still there | Connected in code (read back from backend) | |
| 1.8 | Admin sees all sections (order, store, batch, BMR) | Implemented and verified at backend layer (role permissions) | |
| 1.9 | Notes field used for remarks | Working choice (Remark is not a separate field) | |

---

## Step 2. Store Manager (Saloni): store preparation

| # | Check | Code status | Browser result |
|---|---|---|---|
| 2.1 | Open the same order | Connected in code | |
| 2.2 | Store block is editable: packing type, label, box, insert | Implemented and verified at backend layer (`test_store_manager_access`, 11 pass) | |
| 2.3 | Save store preparation before any batch plan exists | Implemented and verified at backend layer (`test_order_line_preparation`, 13 pass) | |
| 2.4 | Reopen; store values persist | Connected in code (read back) | |
| 2.5 | Order details are read-only for Saloni (no edit control) | Implemented and verified at backend layer (no `sales_orders.edit`) | |
| 2.6 | Batch block is view-only or hidden for Saloni | Connected in code | |
| 2.7 | Requisition status visible (status only) | Implemented at backend layer: `present` shows the workflow status; absent, other-store and deactivated-store all return `unavailable` (`test_requisition_status`, 10 pass). Frontend shows "Requisition status unavailable" otherwise | NOT VERIFIED |

---

## Step 3. Manager (Fenil): batch plan

| # | Check | Code status | Browser result |
|---|---|---|---|
| 3.1 | Open the same order after sign-in (role refreshed) | Connected in code | |
| 3.2 | Store block is view-only for Fenil | Implemented and verified at backend layer (`test_batch_manager_access`, 12 pass) | |
| 3.3 | Choose an approved formula revision for the product | Implemented and verified at backend layer (eligible-revisions returns approved only) | |
| 3.4 | Enter batch size (target output and unit) | Connected in code | |
| 3.5 | Enter packing size (content quantity and unit) and packing size note | Connected in code | |
| 3.6 | Enter planned manufacturing date for the batch | Awaiting client decision (exact date) | |
| 3.7 | Save batch plan; reopen; values persist | Connected in code (read back) | |
| 3.8 | Enter MRP for printing and printing status note | Connected in code | |
| 3.9 | Allocate the permanent batch number (`CODEYY-NNN`); number shown | Implemented and verified at backend layer (`test_batch_number_allocation`, pass) | |
| 3.10 | Allocate again: same number returned | Implemented and verified at backend layer | |
| 3.11 | Create BMR from the plan | Nishita (Admin, DEMOA) holds `bmr.view`, `bmr.create`, `bmr.edit` via role `ADMIN_DEMOA`. Saloni and Fenil hold none and are refused (`AdminGrantAccessTests`) | NOT VERIFIED (browser) |
| 3.12 | Fenil cannot edit store preparation or order fields | Implemented and verified at backend layer | |

---

## Step 4. Formula checks (through Products or the order drawer)

| # | Check | Code status | Browser result |
|---|---|---|---|
| 4.1 | Products > Formulas tab opens the product's formulas | Connected in code | |
| 4.2 | Create a formula for the product (draft) | Connected in code | |
| 4.3 | Add raw and packaging lines; quantities saved on Save draft | Connected in code (`PATCH` with expected version) | |
| 4.4 | Adding a material already in the list is not offered again | Connected in code (tested) | |
| 4.5 | Save with a blank or zero quantity shows a clear message | Connected in code (tested) | |
| 4.6 | Calculate requirement at a target (e.g. 500 and 50) | Connected in code; exact values from backend (tested with real shape) | |
| 4.7 | Fractional packaging COUNT shows the warning and "approximate" | Connected in code (tested) | |
| 4.8 | Approved revision is read-only | Implemented and verified at frontend layer | |
| 4.9 | Approve needs the approval permission and no blocker | Implemented and verified at backend layer (policy-gated) | |
| 4.10 | Open formulas from the order, add unsaved input, close and reopen the drawer; input kept | Verified at frontend test layer (`SalesOrderFormModal.test.jsx`) | |

---

## Step 5. Items outside the order flow (do not demo as working)

| # | Screen | Code status | Browser result |
|---|---|---|---|
| 5.1 | `/operations` Quotations: "+ Add quotation" | Disabled with "Not connected yet"; no mock rows listed (`Operations.legacy.test.jsx`) | NOT VERIFIED |
| 5.2 | `/operations` Batches: "Plan batch from an order" link; "Consume common stock" disabled | Link goes to Orders; no mock rows listed (`Operations.legacy.test.jsx`) | NOT VERIFIED |
| 5.3 | Companies and Departments tabs | Mock-only | |
| 5.4 | Quality, Invoicing, Supply Chain, Inventory, HR | Mock-only (sample data pages) | |
| 5.5 | Dashboard figures | Sample data; label says "Live inventory data" (to be decided) | |
| 5.6 | Production, packaging, dispatch, invoice on the order | Not implemented | |

---

## Results record

Second correction round (2026-10-06): requisition-status disclosure fixed; BMR codes granted to Nishita's Admin role only. Browser visibility of the BMR panel for Nishita, and its absence for Saloni and Fenil: **NOT VERIFIED** (no browser tool). Manual sheet below.

Browser walk-through in the 2026-10-06 demo-readiness task: **NOT VERIFIED.** No browser tool was available. No synthetic order was created in a browser. Automated evidence for the same steps: backend 119 tests OK (affected modules, including `test_requisition_status`); frontend 61 tests OK (15 files); build exit 0; lint exit 0 (53 existing warnings, 0 errors).

Steps A to J of the demo-readiness scenario, browser status: A NOT VERIFIED, B NOT VERIFIED, C NOT VERIFIED, D NOT VERIFIED (backend-enforced, browser pending), E NOT VERIFIED, F NOT VERIFIED, G NOT VERIFIED (backend-tested), H NOT VERIFIED (backend-enforced), I NOT VERIFIED, J NOT VERIFIED (backend-tested, status-only).

Do not declare the project demo-ready from this evidence. Run the table below in a browser first.

| Date | Tester | Browser | Steps passed | Steps failed | Notes |
|---|---|---|---|---|---|
| | | | | | |

---

## Current status summary (code audit, 2026-10-06)

- Steps 1.1 to 1.7, 2.2 to 2.4, 3.2 to 3.10, and 4.1 to 4.10: connected in code or verified at backend or frontend test layer. Browser run pending.
- Step 1.5, 3.6: awaiting client decision (date versus month).
- Step 2.7: awaiting client decision (requisition visibility).
- Steps 5.1 and 5.2: false success. Must be fixed or hidden before demo.
- Steps 5.4 to 5.6 and the production, packaging, dispatch and invoice items: not connected or not implemented.

---

## Manual browser checklist (Nishita, BMR and requisition status)

1. Sign out, then sign in as Nishita (a fresh login loads the new permissions).
2. Open Orders, choose a synthetic order whose batch plan exists, and open its batch section.
3. Confirm the BMR panel is visible. Create a BMR only on the synthetic order. Do not create records on real orders.
4. In the store block, confirm the requisition field reads "Requisition status unavailable" when no requisition is visible to you, and shows the status label when one is visible.
5. Sign in as Saloni and Fenil in separate sessions and confirm the BMR panel is not shown.
6. Record PASS or FAIL for each item. Leave anything not run as NOT VERIFIED.

## Delete sales order (2026-10-06)

| Check | Code status | Browser result |
|---|---|---|
| Delete a draft with no linked records | Implemented at backend layer (`test_sales_order_delete`) | NOT VERIFIED |
| Draft with store preparation shows a plain-language refusal and keeps the order | Implemented (backend 400 JSON; frontend test) | NOT VERIFIED |
| Confirmed order cannot be deleted | Implemented at backend layer | NOT VERIFIED |
| 409 asks for a new confirmation; no automatic retry | Implemented (frontend test) | NOT VERIFIED |
| Inventory pages (dummy sample) show as the other demo modules | Enabled; build and tests only | NOT VERIFIED |

Browser walk-through for these steps was not run: no browser tool was available.
