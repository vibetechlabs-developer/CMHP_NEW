# CMHP ERP — Figma Structure, Design System, Components, Prototype (Part 3 of 3)

Design only. Companion to `01-ux-blueprint.md` and `02-screen-specifications.md`.

---

## F. Figma File Structure

One file, 24 pages, in this order. Each page has a cover frame (title, owner, status:
*Built / Partial / Design-only*), a frame per screen named `<ScreenID> — <Name> / <State>`, and
an **Annotations** layer (hidden in the client variant) that records backend status and TBC items.

| Page | Contents |
|---|---|
| 01 – Design System | Tokens, type, color, icons, grids, components, badge library, **UX states catalogue** (Draft…Review Pending, Empty/Loading/Error/Success, modals, Permission Denied, Conflict) |
| 02 – Authentication | AUTH-01 Login, session-expired, access-denied |
| 03 – Management Dashboard | DASH-01 + role dashboards (Sales, Purchase, Stores, Production, QC/QA, Accounts) |
| 04 – Master Data | Companies, Customers, Suppliers, Products, Materials, Units, Locations, Product/Material Codes, Formulas, Quality Specifications |
| 05 – Sales | Quotation list/create/detail/revisions/approval; Sales Order list/create/detail/progress; Order Review/Confirm/Policy |
| 06 – Planning | Batch registration, Material requirement, Material requests, Shortages |
| 07 – Purchase | PR, PO, Delivery tracking, Supplier bills, Purchase returns |
| 08 – Stores & Inventory | Receiving (+status strip), Inventory, Transfers, Issues, Consumption, Unused returns, Adjustments, Count, Rejected, Expiry |
| 09 – Production | Weekly plan, Batches, Execution, Packaging, Progress board |
| 10 – BMR | BMR record, Permission-state matrix, Review/approval |
| 11 – QC | QC dashboard, Incoming/In-process/Finished QC, Test/Result/Review, Reports, COA |
| 12 – QA | QA review, QA batch release (permission variants) |
| 13 – TQM | Complaints, Deviations, Corrective actions, Controlled changes |
| 14 – Traceability | Batch (forward) diagram, Material (reverse), Customer shipment |
| 15 – Invoice & Dispatch | Invoices, Dispatch eligibility, Dispatch, Customer returns |
| 16 – Product Recall | Recall flow screens |
| 17 – Accounts & Tally | Receipts, Payments, Expenses, Adjustments, Tally posting (+retry) |
| 18 – Documents | Reference books, Documents, Search, Preview, Versions |
| 19 – Reports | Report layouts |
| 20 – Notifications | Center, Preferences |
| 21 – Users & Permissions | Users, Roles, Permission grids |
| 22 – Audit Trail | Audit table, field diff, approval history |
| 23 – Prototype Flow | The single clickable client-demo flow (below) |
| 24 – Client Confirmation / TBC | The Pending Client Confirmation register (Blueprint §L) as a designed page |

**Conventions**: components live only on page 01; screens use instances; variables for color/
spacing/typography; auto-layout everywhere; variants for state (`default/hover/focus/disabled/
error/loading`) and for *permission* (`full / view-only / denied`). Each screen frame is provided at
**Desktop 1440**, **Laptop 1280** and **Tablet 1024**; mobile is a limited read-only set (dashboards,
notifications, approvals inbox, stock lookup).

---

## G. Design System

### Personality
Serious manufacturing ERP — calm, precise, data-dense, GMP-minded. Not a CRM: no rounded
"friendly" hero cards, no gradients, minimal illustration. Density is high but hierarchy is strong;
every status is explicit.

### Layout
- **Grid**: 12 columns, 24px gutters, max content 1440; sidebar 248px (collapsible to 64px icon rail);
  top bar 56px; record header 72px; sticky action bar 64px.
- **Spacing scale**: 4 / 8 / 12 / 16 / 24 / 32 / 48. Table row height: compact 36 / default 44 / comfortable 52 (user setting).
- **Radius**: 4 (inputs, badges), 8 (cards, modals). **Elevation**: 3 levels (flat, raised card, overlay).

### Color (semantic tokens; hex values are a proposed palette, adjustable)
| Token | Use | Proposed |
|---|---|---|
| `brand-primary` | Actions, active nav | deep teal `#0F5C63` |
| `brand-primary-soft` | Selected rows/backgrounds | `#E3F1F2` |
| `surface` / `surface-alt` | Page / cards | `#F6F8F9` / `#FFFFFF` |
| `border` | Dividers | `#D5DDE1` |
| `text` / `text-muted` | Body / secondary | `#14252B` / `#5B6C73` |
| `success` | Approved, Passed, Available, Released | `#1E7B4D` on `#E4F4EA` |
| `warning` | Pending, Review Pending, Awaiting Inspection | `#9A6700` on `#FFF4D6` |
| `danger` | Failed, Rejected, Expired, Blocked | `#B3261E` on `#FCE8E6` |
| `caution` | On Hold, Quarantine | `#B25A00` on `#FFE9D2` |
| `info` | Submitted, Under Test | `#1B5FAA` on `#E3EEFA` |
| `neutral` | Draft, Cancelled | `#4A5A61` on `#ECEFF1` |
| `tbc` | Pending Client Confirmation | `#8A5A00` hatched amber |

Rules: contrast ≥ 4.5:1 for text; **color is never the only signal** (icon + label always);
dark theme provided; chart palette is separate from status colors so a green bar never reads as
"Approved".

### Typography
Inter (UI) + a tabular-figures numeric style for all quantities/amounts. Scale: Display 28/36,
H1 22/30, H2 18/26, H3 16/24, Body 14/20, Small 12/16, Micro 11/14 (labels only). Numbers right-
aligned with units in a muted suffix (`1 000.000 kg`); lot/batch/reference values in a monospace
style so they are copyable and scannable.

### Iconography
A single outline set (1.5px). Domain glyphs: beaker (QC), shield (QA release), lock (non-issuable
stock), box (inventory), truck (dispatch), link (traceability), book (reference), file-lock
(controlled document), sync (Tally), warning triangle, clock (late).

### Motion
Subtle only (120–200ms): drawer slide, toast, skeleton shimmer, diagram path highlight. Respect
reduced-motion; no motion conveys status.

### Accessibility
Keyboard-complete tables/forms/diagrams (traceability nodes focusable, path announced), visible
focus ring, ARIA-friendly status text, min hit target 32px, errors described in text, no
time-limited toasts for errors.

### Content rules
Plain sentences; state consequences before irreversible actions; never expose internal codes to
end users ("Confirmation rules are not configured. Contact your administrator."); TBC items say
"Pending client confirmation", never a guessed default.

---

## H. Components

**Navigation & chrome** — Sidebar (groups, active, collapsed rail), Top bar, Company/Store switcher,
Global search, Notification bell, Breadcrumb, Record header, **Chain strip** (upstream/downstream chips),
Tabs, Right rail, Sticky action bar.

**Data display** — Data table (sort, filter, column chooser, sticky header, bulk select, row actions,
inline status, density), Filter bar + saved views, Pagination, **KPI card** (value, delta, sparkline,
drill), Chart set (line, bar, stacked bar, donut, funnel, gauge-lite), Progress bar (single and
**segmented Ordered/Pending/Dispatched**), Key-value grid, **Lot drawer**, Empty/Loading/Error blocks.

**Status** — **Status badge** (workflow), **Stock badge** (with lock), **QC badge**, **QA release
shield**, **Tally badge** (with attempt count), Late/Expiry chips, **TBC chip**, Inherited-from tooltip.

**Forms** — Text/number/decimal (unit suffix), Date/date-range, Select/combobox with async lookup and
inactive-item badge, Line-item editor (add/remove/reorder, two-table variant for Raw/Packaging),
Rich-note field, **File upload** (drag-drop, type/size rules, list with status), Stepper/Wizard,
Unsaved-changes guard, Reason-required field.

**Workflow** — **Approval stepper** (steps, approver, outcome), Approval history timeline
(Approved/Rejected/Returned/Corrected), Decision dialog (with reason), **Stock-status workflow
strip** (Received → Awaiting Inspection → QC → Approved → Available; Rejected branch),
Stage tracker (manufacturing), **Checklist gate** (dispatch eligibility rows), Retest chain timeline,
Release decision panel.

**Overlays** — Modal, Drawer, Confirmation dialog (states consequence), Warning dialog, Toast,
Conflict (stale version) dialog, Permission-denied panel.

**Domain** — **Traceability diagram** (swimlane with node cards, quantity-weighted connectors, path
highlight, inspector), Reverse-trace summary strip, Recall stepper, Formula-version chip (pinned),
Audit timeline with field diff, Permission grid (role × module × verb), BMR section rail,
Document viewer, COA preview.

**Permission variants** — every action component has `enabled / disabled-with-reason / hidden` variants;
*hidden* is used for approval actions the user may never hold; *disabled-with-reason* for actions the
user could hold but lacks (tooltip names the permission).

---

## J. Prototype Connections (Figma page 23)

**Flow start**: Login. Interactions use *On click → Navigate to* with *Smart animate*; overlays use
*Open overlay*; each hop keeps the same top bar/sidebar.

| # | From (frame) | Trigger | To (frame) |
|---|---|---|---|
| 1 | AUTH-01 Login | Sign in | DASH-01 |
| 2 | DASH-01 | "Orders" KPI / "Create quotation" shortcut | MD-CUST list → customer selected |
| 3 | Customer detail | "New quotation" | SAL-Q02 |
| 4 | SAL-Q02 | Submit | SAL-Q03 (status Submitted) |
| 5 | SAL-Q03 | **Accept Quotation** → confirmation modal → Confirm | SAL-Q03 (Accepted) with "Convert to Sales Order" |
| 6 | SAL-Q03 | **Convert to Sales Order** | SAL-O02 (pre-filled) → Save → SAL-O03 |
| 7 | SAL-O03 | Review & Confirm → Confirm | SO-04 → SO-05 → SAL-O03 (Confirmed) |
| 8 | SAL-O03 | "Register batch" | PLN-B02 |
| 9 | PLN-B02 | Formula version selector → Register | PLN-M01 (requirement) |
| 10 | PLN-M01 | shortage row: **Create Purchase Request** | PUR-R02 (prefilled, source chip) → Submit → PUR-R03 (approved variant) |
| 11 | PUR-R03 | Create PO | PUR-O02 → Issue → PUR-O03 |
| 12 | PUR-O03 | Receive material | STO-R02 → Post → STO-R03 (strip: Awaiting Inspection) |
| 13 | STO-R03 | Send to QC | QC-I02 → Submit/approve → STO-I01 (lot Available) |
| 14 | STO-I01 | Plan production | PRD-P01 → open batch → STO-P01 (issue Available lots) |
| 15 | STO-P01 | Issue | PRD-E01 (manufacturing) → PRD-K01 (packaging) |
| 16 | PRD-K01 | Complete | BMR-01 → BMR-03 (review/approval) |
| 17 | BMR-01 | Send to QC | QC-F01 (Passed; also a Failed→retest branch) |
| 18 | QC-F01 | Send to QA | QA-01 → QA-02 (**Release**; Admin-variant shows disabled) |
| 19 | QA-02 | Released | INV-I02 (invoice) |
| 20 | INV-I02 | Dispatch | INV-E01 (checklist ✓✓✓; blocked variant on QA Hold) → INV-D02 (partial dispatch) |
| 21 | INV-D02 | Record payment | ACC-R01 → ACC-T01 (Failed → Retry → Successful) |
| 22 | ACC-T01 | Reports | RPT-01 / DASH-01 |
| — | Any lot/batch chip | Click | TRC-B01 / TRC-M01 → TRC-R01 (recall) |
| — | Any record Activity tab | Click | SYS-A01 (filtered) |

**Variants to prototype (toggle via a variant switcher, page 23)**: *Admin viewing QA-02*, *Sales
viewing a QC screen (denied)*, *QC fail → retest*, *QA Hold → dispatch blocked*, *Tally failed → retry*,
*Shortage none (skip PR)*, *empty states*, *TBC overlay on/off*.

---

## Handoff notes for the designer

1. Build page 01 first (tokens → badges → table → record header); everything else is instances.
2. Reuse existing built-screen specs in `docs/erp-screen-catalog.md` for BUILT screens rather than
   redesigning their fields; extend visually only.
3. Keep the annotation layer accurate: mark each frame Built / Partial / Design-only so the client is
   never shown a design-only screen as working software.
4. Do not fill TBC items with plausible values. Use the TBC chip and real placeholders.
