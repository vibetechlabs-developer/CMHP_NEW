# CMHP ERP — website setup and end-to-end testing guide

Written for: a beginner tester starting from the fresh database, going through the real website click by click.

Verified against the actual code and the actual running state on **2026-10-07**, not against old documentation. Where the old demo environment (`DEMOA`, `DEMOB`, `DEMOWH`, demo accounts, `DEMOFPACK13E`) is mentioned in older docs, **none of that exists in this fresh database**. Every id, code and name in this guide is one you will create yourself.

---

## 0. Verified current state (read before you start)

| Fact | Value | How it was checked |
|---|---|---|
| Frontend | `http://localhost:5173` | Vite dev server, proxies `/api` to `http://127.0.0.1:8000` (`frontend/vite.config.js`) |
| Live backend database | `cmhp_new_clean_test` | Read from the running backend process's own environment, and confirmed by behaviour (a demo-only account is refused) |
| Original database | `cmhp_new_dev` | Preserved, separate, not touched by this task |
| Users in the live database | **0** | Direct count, just before writing this guide |
| Companies / stores / company memberships | **0 / 0 / 0** | Direct count |
| Mandatory system rows present | Django permissions (280), content types (70), the project's own permission catalog (69) | These come from migrations, not from a demo-seed command |
| Git checkpoint | Exists: commit `00003a7` "Checkpoint ERP integration and clean testing setup" on branch `checkpoint/clean-testing-setup` | `git log` on that branch |

Because the live database has **zero users**, the very first action is not "log in" — it is "create the first superuser from the command line." There is no website screen for that; Django does not allow one by design.

---

## Start here (short checklist)

1. Open a terminal. Create the first superuser (Section 2B). This is the only step that cannot be done in the browser.
2. Open `http://localhost:5173/login` and log in as that superuser (Section 2C).
3. You will land on the Dashboard with **no workspace selected** and an empty sidebar for company screens. This is correct — see Section 2D.
4. Use the API (Postman or `curl`) to create Company A and Company B, and the one shared store (Section 2E–F). There is no website screen for this.
5. Come back to the website, pick the **Common Inventory** workspace, go to **Store & Materials → Materials**, and create your first units and materials (Section 5). Then switch to the **Company A** workspace and continue with customers, products and formulas.

Everything after step 4 can be done entirely in the website, except for a few explicitly marked API-only items (company roles, store memberships/roles, formula approval policy).

---

## 1. Dependency order, at a glance

```
Superuser (CLI)
   -> Log in (website)
   -> Companies + Store (API, superuser)
   -> Units + Materials (website, Common Inventory workspace, superuser)
   -> Company roles (API) -> assign to real business users (website, User Management)
   -> Store roles + memberships (API)
   -> Customers, Products, Product Types* (website / API* as marked)
   -> Formulas + formula approval policy (website for formulas, API for the policy)
   -> Order -> Store Preparation -> Batch Plan -> Batch Number (website, three accounts)
   -> Material Requisition, BMR (API / website as marked)
```

---

## 2. First-time setup, step by step

### A. Start the correct backend and frontend

**Available in the real setup**, via the helper scripts already prepared.

| Where | Who | Action |
|---|---|---|
| PowerShell | You | `cd D:\CMHP_NEW\backend\scripts\db-switch` then `.\start_clean_test_db.ps1` — starts the backend on `127.0.0.1:8000` against `cmhp_new_clean_test`. Leave this window open; it is your server log. |
| PowerShell (new window) | You | `cd D:\CMHP_NEW\frontend` then `npm run dev` — starts Vite on `http://localhost:5173`. |
| Browser | You | Open `http://localhost:5173/login`. If it shows the login form, both servers are up. |

If port 8000 is already in use, the helper script refuses to start rather than killing anything. Stop whatever is listening first (confirm it is actually the CMHP_NEW backend before stopping it).

### B. Create the first superuser — **not a website screen; command line only**

Django does not expose "create the first admin" as a web form for security reasons. This is expected, not a missing feature.

```powershell
cd D:\CMHP_NEW\backend
$env:DB_NAME = 'cmhp_new_clean_test'
& 'C:\Users\Admin\AppData\Local\Programs\Python\Python312\python.exe' manage.py createsuperuser
Remove-Item Env:\DB_NAME
```

You will be prompted for a username, email (optional) and password, all typed locally. Nothing is printed back to you except the username you typed.

### C. Log in

**Available in the real website.**

| Where | Who | Action | Fields | Expected result |
|---|---|---|---|---|
| `/login` | Your new superuser | Enter username and password, click **Sign in** | Username, Password | Redirected into the app. The top-right shows your name. |

### D. Reach setup when no company/store workspace exists

This is not a bug and not a missing "Settings" page. It is how the real code behaves with zero memberships.

- After login you land on the **Dashboard**. The sidebar's company-scoped group (Orders, Products, Customer Management, User Management, Operations) is **hidden**, because it only shows when a **Company A** or **Company B** workspace is active, and you have none yet.
- The **Store & Materials** sidebar group (Materials, Locations, Recorded Receipts) is also hidden unless the **Common Inventory** workspace is active.
- A real superuser account is automatically allowed into the **Common Inventory** workspace (no store membership needed for that visibility rule), but a store membership is still required for Locations and Recorded Receipts to actually show data — read-only catalog access is not the same as store access.
- The workspace switcher is the dropdown in the top bar labelled **CURRENT WORKSPACE**. Click it to see which workspaces are available to you. With zero company memberships, only **Common Inventory** will be offered.
- There is **no website button to create a company or a store.** That is deliberately API-only (`IsActiveSuperuser`), the same convention as Django Admin-style configuration elsewhere in this project.

### E. Create the two operating companies — **API-only (Postman folder: "Company Management")**

| | |
|---|---|
| Request | `Create company` |
| Method / path | `POST /api/v1/companies/` |
| Auth | Bearer token of your superuser (log in via `3. Login` in Postman first, or copy the access token from the website's network tab) |
| Minimal body | `{"code": "ALFA", "legal_name": "Alfa Test Company Pvt Ltd"}` |
| Optional field | `display_name` |
| Expected success | `201`, body includes `"id"` — **record this id as Company A's real id** |
| Common errors | `400` duplicate `code`; `403` if the token is not an active superuser |

Repeat once more for Company B, e.g. `{"code": "BETA", "legal_name": "Beta Test Company Pvt Ltd"}`.

**Important UI fact, verified in code:** the website's workspace switcher always labels these **"Company A"** and **"Company B"** — never their real codes or names. Which real company becomes "Company A" is decided automatically: it is the real company with the **lower id** that your superuser is a member of (see step H). Create Alfa first so it gets the lower id and therefore becomes "Company A" in the UI, if you want the labels to line up with your test names. This mapping is a known, documented limitation of the current frontend — not something you configure.

### F. Create one shared physical store — **API-only (Postman folder: "Shared Store Management")**

| | |
|---|---|
| Request | `Create store` |
| Method / path | `POST /api/v1/stores/` |
| Auth | Superuser bearer token |
| Minimal body | `{"code": "SHAREDWH", "name": "Shared Test Warehouse"}` |
| Optional field | `description` |
| Expected success | `201`, record the `"id"` as your store id |

This store is shared by both companies. There is no company field on a store — store access is a completely separate axis from company access (see Section 4).

### G. Create ordinary business users — **real website, User Management**

**Available in the real website.** This is the one genuinely connected setup screen besides Materials.

| Where | Who | Action | Fields | Expected result |
|---|---|---|---|---|
| Sidebar → **User Management** (visible once you are in the Company A or Company B workspace) → **User Management** tab | Superuser | Click **+ Add user** (exact label may read "Add user") | Username, Password (min 8 characters), First/Last name, Email, Employment status, Department (free text), and (optionally, in the same form) Company + Role to assign immediately | A new row appears in the user list; `201` from `POST /api/v1/users/` |

Create three synthetic accounts, for example: `biz-admin`, `store-mgr`, `batch-mgr`. You do not have to assign a company/role at creation time — you can do it afterward from the same screen (Section H).

### H. Assign company and store memberships

- **Company membership: real website.** Same User Management screen: open a user's row, pick a company from the dropdown (populated from `GET /api/v1/companies/`, so your two companies from step E will appear), and save. This calls `POST /api/v1/users/<id>/memberships/` with `{"company_id": <id>}`.
- **Store membership: API-only.** No website screen assigns a user to a store.
  - Postman: "Store Roles and Memberships" → `Assign store membership`
  - `POST /api/v1/stores/{{store_id}}/memberships/`
  - Body: `{"user_id": <id>}`
  - Expected: `201` with a membership id — you need this id for the next step.

### I. Create/assign company and store roles

- **Creating a role: API-only.**
  - Company role — Postman "Company Role Management" → `Create role`: `POST /api/v1/companies/{{company_id}}/roles/`, body `{"code": "BIZ_ADMIN", "name": "Business Admin", "description": "..."}`.
  - Store role — Postman "Store Roles and Memberships" → `Create store role`: `POST /api/v1/stores/{{store_id}}/roles/`, same shape.
- **Setting which permissions the role grants: API-only.**
  - Company: `PUT /api/v1/companies/{{company_id}}/roles/{{role_id}}/permissions/`, body `{"permission_codes": ["sales_orders.view", "sales_orders.create", "sales_orders.edit", "batch_plans.view", "customers.view", "customers.create", "products.view", "formulas.view"]}` — adjust per the matrix in Section 4. Get the exact codes from `GET /api/v1/permissions/?scope=COMPANY`.
  - Store: `PUT /api/v1/stores/{{store_id}}/roles/{{store_role_id}}/permissions/`, body `{"permission_codes": ["store_preparation.view", "store_preparation.create", "store_preparation.edit"]}` for a Store Manager. Codes from `GET /api/v1/permissions/?scope=STORE`.
- **Assigning an existing role to a membership: real website for company roles** (same User Management screen, "Role" dropdown next to a user's company). **Store role assignment is API-only**: `POST /api/v1/stores/{{store_id}}/memberships/{{store_membership_id}}/roles/`, body `{"role_id": <store_role_id>}`.

### J. Configure required policies deliberately — **both are unanswered business decisions; do not skip**

**Formula approval policy — not configured means approval is blocked entirely, not "allowed by default."**

With no policy row, every approval attempt is refused with reason `APPROVAL_POLICY_NOT_CONFIGURED`. You, the tester/owner, must decide:

| Choice | Effect |
|---|---|
| `allow_self_approval: true` | Anyone who drafted or edited a revision may also approve it. Faster for a one-person test, but not how real segregation-of-duties usually works. |
| `allow_self_approval: false` | A different, real contributor must approve. You will need a second company-role account (a "Formula approver") for approval to ever succeed, and self-drafted revisions can never be approved by the drafter. |

API-only: `PATCH /api/v1/companies/{{company_id}}/formula-approval-policy/`, body `{"expected_version": 0, "allow_self_approval": true}` (first time only: `expected_version` must be `0`).

**Sales order confirmation policy — separate feature, not required for the three-department journey.** It exists (`PATCH /api/v1/companies/{{company_id}}/sales-order-confirmation-policy/`) but **confirming an order is not a prerequisite for store preparation or batch planning in the current code** — batch plans are created directly from a `DRAFT` order line. Do not configure or use this unless you are specifically testing order confirmation as its own feature.

### K. Units, materials, customers, products, formulas

Covered in full in Section 5.

---

## 3. Business identities — keep these separate

| Term | What it means here | Example you will create |
|---|---|---|
| **Operating Company A / B** | The two companies this ERP instance runs for. Shown in the UI only as "Company A"/"Company B" (see Section 2E note). | `ALFA`, `BETA` |
| **Customer (company placing an order)** | A separate `Customer` record, scoped to one operating company. Not the same table as `Company`. | `Customer code: NOVA`, name "Nova Test Buyers" |
| **Customer code used by official batch numbering** | The *customer's* code (`Customer.code`), not the operating company's code. The batch number format is `CODEYY-NNN`, where `CODE` is the customer's code. | A batch for customer `NOVA` in year 2026 → `NOVA26-001` |
| **Shared Store** | One physical warehouse, usable by both companies. Not owned by either. | `SHAREDWH` |
| **Product** | What you manufacture/sell, belongs to one operating company, has its own sales unit. | `Product code: FGSYN1`, "Synthetic Finished Good 1" |
| **Material** | A raw or packaging input, shared across the whole catalog — not duplicated per company. | `Material code: RAWSYN1` (raw), `PKGSYN1` (packaging) |
| **Sales unit** | The unit a product is sold in (e.g. bottles). Set on the Product. | `BTL` |
| **Formula output unit** | The unit the formula's base/target output is measured in. Must equal the product's sales unit unless you also configure an explicit packing relationship. | `KG` or `BTL` |
| **Packing-content unit** | The unit used for the optional pack-quantity relationship on a batch plan (e.g. mL per bottle). Independent of the above two. | `ML` |
| **Order quantity** | How many sales units the customer ordered on one order line. | `100 BTL` |
| **Batch output quantity** | The formula's own target output for one manufacturing run — a separate number, in the formula's output unit, entered by the Batch Manager. | `76 KG` |

Do not assume order quantity and batch output quantity must match in units or scale — they are deliberately separate fields.

---

## 4. Account and access matrix

Use these role **labels**, not old account names — nothing survived from the previous database.

| Role label | Scope | Minimum company permissions | Minimum store permissions | What they can actually do |
|---|---|---|---|---|
| **Setup Superuser** | Global (Django-admin-style) | None required | None required | Create companies, stores, units, product types, company/store roles, materials, material import. **This authority does not extend to business records** — a superuser with zero company memberships cannot view or edit a single order, customer or product. Superuser status is not a bypass on `sales_orders.*`, `batch_plans.*`, `store_preparation.*`, `customers.*`, `products.*`, `formulas.*`, `bmr.*`, `material_requisitions.*`. |
| **Business Admin** | One company | `sales_orders.view`, `sales_orders.create`, `sales_orders.edit`, `customers.view`, `customers.create`, `products.view`, `formulas.view`, `batch_plans.view` (to see the batch section read-only) | none | Create/edit orders, create customers, view products and formulas. Cannot write Store Preparation or Batch fields even though they can see them. |
| **Store Manager** | One store (plus `batch_plans.view` in the relevant company, just to see the order context) | `batch_plans.view` | `store_preparation.view`, `store_preparation.create`, `store_preparation.edit` | Views the order and batch context read-only. Edits **only** Store Preparation (Packing Type, Label, Box, Insert). Sees requisition **status only** (see below) — never recipe lines or quantities. |
| **Batch Manager** | One company | `batch_plans.view`, `batch_plans.create`, `batch_plans.edit`, `batch_plans.allocate_number`, `batch_plans.printing_edit`, `formulas.view`, `products.view`, `customers.view`, `sales_orders.view` | none required for batch work itself; `store_preparation.view` only if you also want to see the store section read-only | Creates/edits the batch plan, enters MRP/printing fields, allocates the official batch number. Cannot write Store Preparation. |
| **Formula approver** (only if `allow_self_approval: false`) | One company | `formulas.approve`, plus enough history to not be "a contributor" on the revision being approved | none | Approves a drafted revision someone else worked on. If self-approval is disallowed and no second real account exists, nothing can ever be approved — this is a policy effect, not a bug. |

**Rules verified in code, stated plainly:**
- Superuser setup authority (`IsActiveSuperuser`) is checked by exactly four kinds of endpoint: companies, stores, catalog writes (units/materials/product-types/material import), and — nowhere else. It is never consulted by `effective_permission_codes()` or `active_companies_for_user()`.
- Company membership and store membership are two separate database tables with no relationship to each other. Being in Company A grants nothing in any store; being in the Shared Store grants nothing in any company.
- A role **name** (e.g. "Business Admin") grants nothing by itself — only the permission codes actually attached to that role's `permissions` set matter. Naming a role "Admin" with zero permissions attached grants zero access.
- An approved formula revision's lines are immutable even to someone with `formulas.edit` — editing only works on a `DRAFT` revision.
- Store Manager's requisition visibility is a dedicated status-only endpoint (`GET /api/v1/stores/{store_id}/batch-plans/{plan_id}/requisition-status/`) that never requires, and never returns, `formulas.view`-gated recipe data. It is a different thing from full requisition access (`material_requisitions.view`), which does expose quantities and is not something the Store Manager role needs.

Do not grant every permission "for convenience" — each matrix row above is the minimum, verified against the actual `_get_company_for_action` / `_get_store_for_action` checks in the views.

---

## 5. Master-data setup

| Master data | Where | Notes |
|---|---|---|
| **Units of measure** | **API-only.** `POST /api/v1/units/`, body `{"code": "KG", "name": "Kilogram", "dimension": "MASS"}`. `dimension` is one of `MASS`, `VOLUME`, `COUNT`. No website screen creates units — the Materials and Products forms only let you *search* existing active units. | `code` and `dimension` are immutable after creation (confirmed: the update serializer only allows `name`). |
| **Explicit unit conversion factors** | **API-only, optional.** The same create call accepts `canonical_factor` (Postman: "Create unit with canonical_factor"). Once set, it is immutable — there is no later-edit path for it. | Only set this if you specifically need cross-unit conversion; most test units can omit it. |
| **Shared raw/packaging materials** | **Real website.** Sidebar → **Store & Materials** (switch to the **Common Inventory** workspace first) → **Materials** tab → **+ Add material**. Fields: Material code, Material name, Type (Raw material / Packaging), Base unit (search box — only finds units you already created via the API step above), Description (optional). | Code, Type and Base unit are immutable after creation — only Name and Description can be edited later. Creating a material does **not** create any stock. |
| **Material CSV preview and commit** | **Real website**, same Materials tab → **Import materials** → **Download template** → fill it in → choose the file → **Check file** (preview, writes nothing) → **Import N materials** (all-or-nothing commit). | Columns: `code, name, material_type (RAW/PACKAGING), base_unit_code, description`. The commit re-validates; a stale or already-committed preview is refused and you must re-check the file. |
| **Store locations** | **Real website, read-only today.** Sidebar → Store & Materials → **Locations**, scoped to the store you are a member of. **Current limitation, verified in code:** there is no create/edit screen, and the Goods Receipt model does not record which location a material was placed in — the UI does not and must not claim otherwise. | Creating a location is API-only: `POST /api/v1/stores/{store_id}/locations/`. |
| **Suppliers** | **API-only** (Postman: "Supplier Management"). No connected frontend screen exists; the Supply Chain sidebar page is a separate, disconnected mock screen — do not use it for real supplier data. | `POST /api/v1/suppliers/`, minimal body `{"code": "SUP1", "legal_name": "Synthetic Supplier One"}`. |
| **Customers** | **Real website.** Sidebar → **Customer Management** (Company A/B workspace) → **+ Add customer**. Fields: Customer code, Customer name, Contact person, Email, Phone, Billing/Shipping address, Notes. | Code is immutable after creation. |
| **Product types** | **API-only, no creation screen.** The Product form's "Product type" dropdown reads real, active `/api/v1/product-types/` rows, but nothing in the frontend creates one — until you create at least one via the API, that dropdown only offers "Not specified". | `POST /api/v1/product-types/`, body `{"name": "Synthetic Tablet"}`. |
| **Products and sales units** | **Real website.** Sidebar → **Products** → **+ Add product**. Fields: Code, Name, Product type (dropdown — see above), Sales unit (search box, from active units), Description. | Code is immutable. |
| **Product CSV preview/commit** | **Real website**, Products page → **Import CSV**, same preview-then-commit pattern as materials. | Does not create stock. |
| **Formula creation** | **Real website.** From a Product's workspace, open its **Formulas** tab → **+ New formula**: Product (locked to the one you opened it from), Formula code, Formula name, Base output quantity, Output unit. | Creates one `DRAFT` revision automatically, with an empty material list. |
| **Formula revisions and material lines** | **Real website.** Inside the formula editor: **+ New revision** for a new draft (always starts empty — nothing is copied from the previous revision). Add raw/packaging lines via **+ Add material**, enter Base quantity, optional Special value, Label claim, AR No. **Save draft** writes both tables together. | A revision's lines are only editable while it is `DRAFT`. Once approved, it is read-only, permanently. |
| **Formula CSV import** | **Backend-only — no frontend screen.** (Postman: "Formula Draft CSV Import (Task 14B)".) | `POST /api/v1/companies/{company_id}/formulas/import-preview/`, then `.../import-commit/`. |
| **Formula approval policy, preview, approval** | Policy: **API-only** (Section 2J). Preview and approve: **real website**, in the formula editor's Approval panel — **Check approval** then, only if eligible, **Approve revision N**. | Approving never happens silently; "Check approval" is a separate, explicit step from "Save draft". |

---

## 6. Main three-department order journey (one order, start to finish)

Use entirely synthetic names throughout, e.g. customer `NOVA`, product `FGSYN1`, formula `FSYN1`.

### Business Admin

| # | Where | Action | Fields | Expect |
|---|---|---|---|---|
| 1 | Workspace switcher (top bar) | Select **Company A** | — | Sidebar now shows Orders, Products, Customer Management, etc. |
| 2 | Sidebar → **Orders** | **+ Add order** | Customer (search/select, or create inline if the screen offers it), Product line (Product + quantity + unit price), Order date, Planned manufacturing date, Currency | `201` on save; an order reference like `SO-...` appears |
| 3 | Order list | Open the order you just created | — | Order details load with the values you entered |
| 4 | Order screen | **Save order details** | (no changes needed, just confirm the button works) | A saved/success indicator appears |
| 5 | Browser | Close the order, reopen it from the list, then refresh the page (F5) | — | Every field still shows your entered values — this is the actual persistence check |
| 6 | — | **Record the order reference exactly as shown**, e.g. `SO-20261007-XXXXXXXX` | — | You will reuse this with the other two accounts |

### Store Manager

| # | Where | Action | Fields | Expect |
|---|---|---|---|---|
| 7 | — | Sign out. Sign in as the Store Manager account (Section 2G–I) | — | — |
| 8 | Workspace switcher | Select **Company A** (to see the order) | — | Sidebar shows Orders (view only, per their permissions) |
| 9 | Orders → open the same order (by its reference) | View order information | — | Order section shows read-only; no Save button for order fields, or it is disabled |
| 10 | Order screen, Store section | Choose the accessible shared store (if more than one is offered — in this guide there is exactly one) | — | — |
| 11 | Store section | Enter Packing Type, Label, Box, Insert | Free text fields except Insert (yes/no) | — |
| 12 | Store section | **Save store details** | — | Saved before any batch plan exists — this is the specific fix verified earlier in this project |
| 13 | — | Reopen the order (or refresh) | — | Store fields persist |
| 14 | Batch section | Attempt to edit a batch field | — | Field is read-only or the Save control is absent/disabled — verifies the role boundary |

### Batch Manager

| # | Where | Action | Fields | Expect |
|---|---|---|---|---|
| 15 | — | Sign out. Sign in as the Batch Manager account | — | — |
| 16 | Workspace switcher | Select **Company A** | — | — |
| 17 | Orders → open the same order | View store preparation | — | Read-only; no edit controls for Packing Type/Label/Box/Insert |
| 18 | Batch section | Choose **the approved revision of this product's formula** (dropdown only lists `APPROVED` revisions) | — | If none exists yet, go create and approve one first (Section 5/J) — the dropdown will be empty otherwise, which is correct behaviour, not a bug |
| 19 | Batch section | Enter target output/batch size and its unit | Target output quantity (in the formula's output unit) | — |
| 20 | Batch section | Enter packing relationship, if your test needs it | Packing size note, planned pack quantity, packing content quantity + unit | Optional — omit if not testing packing content |
| 21 | Batch section | Enter MRP for printing and printing status | Numeric MRP, free-text printing status | — |
| 22 | Batch section | **Save batch plan** | — | `201`/`200`; batch plan now exists in `DRAFT` |
| 23 | — | Reopen, refresh | — | Values persist |
| 24 | Batch section | **Allocate batch number** (explicit, separate button) | — | A number like `NOVA26-001` appears (customer code + allocation year + sequence) |
| 25 | — | Reopen the order again | — | The same batch number is shown — clicking Allocate again (if the button still appears) must return the identical number, never a new one |

**What this journey does *not* require:** order confirmation. The code creates batch plans directly from a `DRAFT` order line — do not add a "confirm the order" step unless you are deliberately testing that separate, optional feature.

---

## 7. Formula calculator

Build one small synthetic fixture yourself, through the formula editor (Section 5), so the numbers below are something you can reproduce:

- Formula `FSYN1`, base output **100 KG**.
- One raw-material line: base quantity **10 KG**.
- One packaging line: base quantity **25 PCS** (a `COUNT`-dimension unit — pick one you created, or create `PCS` as `COUNT`).

Then, in the editor's **Material requirements preview**:

| Term shown | Meaning |
|---|---|
| Base output | The formula's own stored output quantity (100 KG in this fixture) — read-only, from the saved revision |
| Target output | The quantity you type in and calculate for |
| Scale factor | Target ÷ Base, shown as the server's exact value, with a "View full value" control for anything too long to show inline — never truncated silently |
| Raw/Packaging requirements | Each line's base quantity × scale factor, computed by the backend, not the browser |
| Approximate results | Flagged explicitly when the exact fraction cannot be shown as a clean decimal |
| Fractional COUNT warning | Shown when a `COUNT`-dimension line (like your 25 PCS) would require a non-whole number of units — e.g. target 50 → scale 0.5 → 12.5 PCS. This is shown, not rounded, and not hidden. |

Try three targets with your fixture:
1. **Target = 100** (same as base): scale factor 1, raw = 10 KG, packaging = 25 PCS.
2. **Target = 200** (double): scale factor 2, raw = 20 KG, packaging = 50 PCS.
3. **Target = 50** (half): scale factor 0.5, raw = 5 KG, packaging = **12.5 PCS — fractional COUNT warning expected here.**

**Why calculation never issues or reserves material:** this screen only calls a read-only preview endpoint. Nothing about it writes to any stock table — there is no stock table it could write to yet (Section 10).

**Save behaviour to verify:**
- Calculating is read-only — do it repeatedly with no side effects.
- **Save draft** on the material lines never approves anything; approval is the separate Approval panel action.
- Once a revision is `APPROVED`, its lines cannot be edited again, by anyone, through this screen.
- Open the formula editor from inside an order's drawer, type something into the batch section first (don't save it), then open and close the formula drawer — your unsaved batch input must still be there when you return.

---

## 8. Requisition and BMR

**Requisition: verified today — no frontend screen creates or manages a requisition.** The only frontend requisition code anywhere is the Store Manager's **status-only** read in the order's Store section (Section 4). Everything else is API-only:

| Action | Method / path | Postman folder |
|---|---|---|
| Create from a batch plan | `POST /api/v1/stores/{store_id}/material-requisitions/`, body `{"batch_plan_id": <id>, "expected_batch_plan_version": <plan's version>}` | Material Requisitions |
| Edit requested quantity with a remark | `PATCH .../material-requisitions/{id}/`, body includes `requested_quantity` + `quantity_remark` per line context | Material Requisitions |
| Submit | `POST .../submit/` | Material Requisitions |
| Approve | `POST .../approve/` | Material Requisitions |
| Reject | `POST .../reject/` | Material Requisitions |
| Revise (after rejection) | `POST .../revise/` | Material Requisitions |

Requisition approval is **not** physical material issue — nothing in this app issues, reserves or consumes stock (Section 10).

**BMR: real website screen, inside the order drawer's batch section**, shown only once a saved batch plan exists and the signed-in account holds `bmr.view` (read), `bmr.create` (the **Create record** button), and `bmr.edit` (editing line fields). These permissions must be granted exactly as in Section 2I — there is no default grant to any role.

| # | Action | Expect |
|---|---|---|
| 1 | Open the batch section of a saved plan, with `bmr.view`/`bmr.create` | **Create record** button appears; no fake empty record is shown before you click it |
| 2 | Click **Create record** | Raw material requisition slip and Packing slip appear, with quantities taken from the existing requirement preview — exact backend strings, nothing recalculated in the browser |
| 3 | Edit Special value / Label claim / AR No. / Qty received (packing lines only) | Each save is version-checked; saves persist on reopen |
| 4 | Scroll to the bottom | Four blank sign-off blocks: Prepared, Reviewed, Approved, Checked — each with a blank "Signature" line and no name pre-filled |
| 5 | **Print** | Only the record prints; the rest of the page is hidden in print view |

**Explicitly true, verified in code — do not present otherwise:** BMR generation is not production completion; BMR quantities are not evidence that material was actually consumed; the blank sign-off blocks are not completed approvals of anything.

---

## 9. Purchasing, receiving and materials

| Stage | In the website today? | API-only alternative |
|---|---|---|
| Supplier | No | `POST /api/v1/suppliers/` |
| Purchase Request | No | Postman "Purchase Requests" folder |
| Approval (of the PR) | No | Same folder, `.../approve/` |
| Purchase Order | No | Postman "Purchase Orders" |
| Issue PO | No | `.../issue/` |
| Goods Receipt | No | Postman "Goods Receipts" |
| Recorded Receipt Ledger | **Yes — real website** | Sidebar → Store & Materials → **Recorded Receipts** (Common Inventory workspace) |

The Supply Chain sidebar page exists but is **not connected** to any of the real backend above — it is a disconnected mock screen left over from an earlier UI pass. Do not use it as evidence of purchasing working.

**Recorded Receipts screen, as actually implemented:**
- Every quantity is labelled **"Recorded receipt quantity"** — never "available", "released", or "on-hand" stock, because none of those concepts are computed anywhere in this codebase.
- Each row shows a **source company**, explicitly labelled as receiving/purchasing context — the code comment in the serializer is explicit that this is never a legal-ownership claim.
- A fixed notice is shown: "Recorded receipts only. Opening stock, issues, returns and QC release are not included."
- There is no Issue, Reserve, Release or Transfer button anywhere on this screen, because none of those actions exist in the backend.

**Incoming QC and Material Specifications:** backend endpoints exist (`apps.quality` — 9 paths) with a draft/submit lifecycle, but the Quality sidebar screen is mock-only, not connected to them. Treat as API-only today; use the Postman "Incoming QC Inspections" / "Material Specifications" folders if you need to exercise them.

---

## 10. What the website cannot do yet

Verified absent or partial, as of this guide:

| Area | Status |
|---|---|
| QC disposition / QA release | Not implemented anywhere (backend or frontend) |
| Ownership transfer between companies | Not implemented — the task's own rule holds: never infer ownership from `source_company` |
| Opening stock | Not implemented |
| Reservation, issue, consumption, returns | Not implemented |
| Production execution / status | Not implemented |
| Packaging completion | Not implemented |
| Dispatch | Not implemented |
| Invoice and Tally integration | Not implemented |
| Reports / audit-log viewer | No viewer screen; audit rows exist in the database but nothing in the website reads them |
| Quality, Invoicing, Supply Chain, HR, Company Departments/Locations tabs | Each renders a screen, but reads/writes an in-memory mock store, not the backend — do not treat these as implemented modules, and do not follow click-steps through them as if they were real |

---

## 11. Test checklist

See `docs/website-test-checklist.csv` for the full table. Every row's PASS/FAIL/NOT TESTED column starts blank — none of it is prefilled from code inspection or from the automated test suite, which is separate evidence.

---

## 12. Gujarati notes for a few easy-to-confuse steps

- **Pehla superuser command line thi banse, website thi nahi** — aa Django nu security rule chhe, bug nathi.
- **Login pachi sidebar khali dekhay to gabhraso nahi** — tamara superuser ne koi company membership nathi, etle company-wala screens (Orders, Products...) hidden chhe. Workspace switcher ma "Common Inventory" select karo, "Store & Materials" dekhashe.
- **Company A / Company B** — aa labels sachu company name nathi batavta; jenu id nanu hoy e "Company A" banse.
- **Formula approve nathi thatu?** — company ni approval policy set nathi thai, etle approval block thay chhe. Aa policy API thi set karvi padshe (Section 2J).
- **Order confirm karvani jarur nathi** — store prep ane batch plan direct draft order par kaam kare chhe.

---

*Preserves all earlier reports. Does not supersede `docs/current-fullstack-progress-report.md` or `docs/client-flow-completion-checklist.md`; it is a new, separate onboarding guide for the fresh database.*
