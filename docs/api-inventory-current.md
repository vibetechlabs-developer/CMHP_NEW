# Current API Inventory

**Read-only inventory, generated directly from the running URL resolver and the actual view/serializer/permission
code** (`apps/*/urls.py`, `apps/*/views.py`, `apps/*/serializers.py`) - not from Postman, not from memory of earlier
tasks, and not inferred from any task prompt. No test, migration, install, server restart, or business-data change
was made to produce this document.

## Headline counts

- **Unique API path patterns: 116**
- **Implemented method + path operations: 170** (a path with both `GET` and `POST`, or `GET` and `PATCH`, counts as
  two operations; `HEAD`/`OPTIONS` are excluded, as are Django Admin (`/admin/...`) and any static/media route)
- Both counts were produced by walking `django.urls.get_resolver()` at runtime and, for every resolved class-based
  view, checking which of `get`/`post`/`put`/`patch`/`delete` are actually defined somewhere in that view class's
  MRO (i.e. genuinely implemented, not just theoretically routable) - see the reproduction note at the end of this
  document.
- This project has **no DELETE endpoint anywhere** - every lifecycle transition is a paired
  `POST .../activate/` / `POST .../deactivate/` (or an equivalent named action such as `.../submit/`, `.../confirm/`,
  `.../issue/`, `.../approve/`), never a hard delete through the API.

## Official batch numbering - verified, not inferred

**Implemented in code, migrated, and tested** - `POST /api/v1/companies/<company_id>/batch-plans/<plan_id>/allocate-number/`
exists in the URL resolver, is backed by `apps.batch_plans.numbering.allocate_batch_number`, and its migrations
(`batch_plans.0003_batchnumberallocation_batchnumbersequencecounter`, `permissions.0021_seed_batch_plan_allocate_number_permission`)
are applied to the live dev database - confirmed directly:

```
$ python manage.py showmigrations batch_plans permissions | tail -2
 [X] 0020_seed_store_preparation_permissions
 [X] 0021_seed_batch_plan_allocate_number_permission
$ python manage.py shell -c "from apps.permissions.models import PermissionDefinition; \
  print(PermissionDefinition.objects.filter(code='batch_plans.allocate_number').exists())"
True
```

A dedicated test module (`tests.test_batch_number_allocation`, 36 tests) and a combined run with the rest of
`tests.test_batch_plans` (90 tests total) both passed, `OK`, exit code 0, in this same session.

**However, its own task documentation (backend-tasks/decisions, frontend handoff, screen catalogue, Postman, open
decisions) had not yet been written when this inventory was produced** - that write-up was interrupted by this
inventory request and resumes immediately after it, per the user's own instruction. Do not read "documented" and
"implemented" as the same fact for this one feature at this moment: the code, migration and tests are real and
verified; the reference docs for it are the one piece still pending. `BatchNumberAllocation`/
`BatchNumberSequenceCounter` have **zero rows** in the dev database right now (nobody has been granted
`batch_plans.allocate_number` yet - it is seeded assigned to nobody, by design).

## Counting rules applied

- GET and POST on the same path = 2 operations; GET and PATCH = 2 operations. A path with only one method = 1.
- `HEAD`/`OPTIONS` (DRF adds these automatically to every view) are never counted.
- `/admin/...` (Django Admin) and any static/media path are excluded entirely - none of the module totals below
  include them.
- Every row below is a route that actually resolves to a real, callable view method today - nothing aspirational,
  nothing from a Postman collection's own request list (the Postman collection documents a **superset** for manual
  testing convenience - e.g. deliberately-invalid examples for a 400/409/404 test - none of that inflates this count).

## Module totals

Grouped by the Django app that owns the view (the same grouping `docs/backend-tasks.md` uses task-by-task). Where a
Django app's views serve more than one business concept (e.g. `apps.permissions` backs both company-role and
store-role management), that is noted.

| Module (Django app) | Path patterns | Operations | Business area(s) covered |
|---|---|---|---|
| `apps.authentication` | 5 | 5 | CSRF bootstrap, login, refresh, logout, current user |
| `apps.companies` | 5 | 7 | Company CRUD/lifecycle, "my companies" |
| `apps.permissions` | 13 | 17 | Permission catalog; company-role AND store-role CRUD/lifecycle/permission-assignment (split across `/companies/.../roles/` and `/stores/.../roles/` paths, but all served by this one app's views) |
| `apps.stores` | 14 | 20 | Shared store CRUD/lifecycle, "my stores", store overview, store membership + role-assignment, storage locations |
| `apps.catalog` | 12 | 18 | Units of measure, material categories, materials (shared, cross-company) |
| `apps.suppliers` | 4 | 6 | Supplier CRUD/lifecycle (shared, cross-company) |
| `apps.purchasing` | 11 | 15 | Purchase Requests (create/submit/approve/reject/revise/cancel) + Purchase Orders (create/edit/issue/cancel) |
| `apps.receiving` | 5 | 7 | Goods Receipts (create/edit/post/cancel), eligible-PO lookup |
| `apps.quality` | 9 | 15 | Material Specifications + versions, Incoming QC Inspections (create/edit/submit/cancel), eligible-receipt-line lookup |
| `apps.customers` | 4 | 6 | Customer CRUD/lifecycle |
| `apps.products` | 4 | 6 | Product CRUD/lifecycle |
| `apps.quotations` | 2 | 4 | Quotation drafts (create/edit only - no submit/accept/convert) |
| `apps.sales_orders` | 5 | 8 | Direct Sales Order drafts, confirmation preview + confirm, confirmation policy |
| `apps.formulas` | 8 | 13 | Formula/revision drafts, approval policy, approval, approval preview, requirement preview |
| `apps.batch_plans` | 4 | 6 | Batch planning drafts, requirement preview, **official number allocation** |
| `apps.store_preparation` | 2 | 4 | Store-side Packing Type / insert-required record |
| `apps.users` | 8 | 12 | User CRUD/lifecycle, company-membership + role-assignment management |
| `apps.common` | 1 | 1 | Health check |
| **Total** | **116** | **170** | |

---

## Full operation list

Every column below is taken directly from the code, not summarised from memory. "Contract location" points to the
serializer file (exact request/response shape) and, where one exists, the matching section of
`docs/frontend-api-handoff.md` (plain-language contract with examples, error cases, and screen mapping).

Legend for **Context**: `—` = no company/store scoping (global/superuser-administered or self-scoped);
`C` = company-scoped (`<company_id>` in the path, `active_companies_for_user` + `user_has_permission`);
`S` = store-scoped (`<store_id>` in the path, `active_stores_for_user` + `store_user_has_permission`);
`C+S` = BOTH checked independently in the same request (an explicit, documented working rule - store access never
implies company access, or vice versa).

### Authentication (`apps.authentication`) - public/CSRF, no company/store context

| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/api/v1/auth/csrf/` | Issue the `csrftoken` cookie + JSON token | Public |
| POST | `/api/v1/auth/login/` | Exchange username/password for an access token + refresh cookie | Public, CSRF header required |
| POST | `/api/v1/auth/refresh/` | Rotate the refresh cookie, issue a new access token | Public (cookie-authenticated), CSRF header required |
| POST | `/api/v1/auth/logout/` | Blacklist the refresh token, clear the cookie | Public (cookie-authenticated), CSRF header required |
| GET | `/api/v1/auth/me/` | Current user identity | Bearer |

Contract: `docs/frontend-api-handoff.md` §0.2-0.4. Serializers: `apps/authentication/serializers.py`.

### Companies (`apps.companies`) - `—` except `/mine/`, `/my-permissions/` which are self-scoped

| Method | Path | Purpose | Context | Permission |
|---|---|---|---|---|
| GET | `/api/v1/companies/` | List all companies (admin) | — | active superuser |
| POST | `/api/v1/companies/` | Create a company | — | active superuser |
| GET | `/api/v1/companies/mine/` | Companies the caller has active membership in | — (self) | none beyond auth |
| GET | `/api/v1/companies/<id>/` | Company detail | — | active superuser |
| PATCH | `/api/v1/companies/<id>/` | Edit company metadata | — | active superuser |
| POST | `/api/v1/companies/<id>/activate/` | Reactivate a company | — | active superuser |
| POST | `/api/v1/companies/<id>/deactivate/` | Deactivate a company | — | active superuser |
| GET | `/api/v1/companies/<id>/my-permissions/` | Caller's own effective permission codes in this company | C (membership only) | none beyond membership |

Contract: `docs/frontend-api-handoff.md` §2. Serializers: `apps/companies/serializers.py`.

### Company & Store Roles / Permission Catalog (`apps.permissions`)

| Method | Path | Purpose | Context | Permission |
|---|---|---|---|---|
| GET | `/api/v1/permissions/` | Full permission-definition catalog (paginated) | — | active superuser |
| GET | `/api/v1/companies/<id>/roles/` | List a company's roles | C | active superuser |
| POST | `/api/v1/companies/<id>/roles/` | Create a company role | C | active superuser |
| GET | `/api/v1/companies/<id>/roles/<rid>/` | Role detail | C | active superuser |
| PATCH | `/api/v1/companies/<id>/roles/<rid>/` | Edit role name/description | C | active superuser |
| POST | `/api/v1/companies/<id>/roles/<rid>/activate/` | Reactivate a role | C | active superuser |
| POST | `/api/v1/companies/<id>/roles/<rid>/deactivate/` | Deactivate a role | C | active superuser |
| PUT | `/api/v1/companies/<id>/roles/<rid>/permissions/` | Replace a role's entire COMPANY-scope permission set | C | active superuser |
| GET | `/api/v1/stores/<id>/roles/` | List a store's roles | S | active superuser |
| POST | `/api/v1/stores/<id>/roles/` | Create a store role | S | active superuser |
| GET | `/api/v1/stores/<id>/roles/<rid>/` | Role detail | S | active superuser |
| PATCH | `/api/v1/stores/<id>/roles/<rid>/` | Edit role name/description | S | active superuser |
| POST | `/api/v1/stores/<id>/roles/<rid>/activate/` | Reactivate a role | S | active superuser |
| POST | `/api/v1/stores/<id>/roles/<rid>/deactivate/` | Deactivate a role | S | active superuser |
| PUT | `/api/v1/stores/<id>/roles/<rid>/permissions/` | Replace a role's entire STORE-scope permission set | S | active superuser |
| GET | `/api/v1/companies/<id>/my-permissions/` | *(listed under Companies above)* | | |
| GET | `/api/v1/stores/<id>/my-permissions/` | Caller's own effective permission codes in this store | S (membership only) | none beyond membership |

Contract: `docs/frontend-api-handoff.md` §3. Serializers: `apps/permissions/serializers.py`.

### Stores, memberships, storage locations (`apps.stores`)

| Method | Path | Purpose | Context | Permission |
|---|---|---|---|---|
| GET | `/api/v1/stores/` | List all shared stores (admin) | — | active superuser |
| POST | `/api/v1/stores/` | Create a store | — | active superuser |
| GET | `/api/v1/stores/mine/` | Stores the caller has active membership in | — (self) | none beyond auth |
| GET | `/api/v1/stores/<id>/` | Store detail | — | active superuser |
| PATCH | `/api/v1/stores/<id>/` | Edit store metadata | — | active superuser |
| POST | `/api/v1/stores/<id>/activate/` | Reactivate a store | — | active superuser |
| POST | `/api/v1/stores/<id>/deactivate/` | Deactivate a store | — | active superuser |
| GET | `/api/v1/stores/<id>/overview/` | Store identity summary (no stock/quantity data) | S | `shared_store.view` |
| GET | `/api/v1/stores/<id>/memberships/` | List store memberships (bare array, not paginated) | S | active superuser |
| POST | `/api/v1/stores/<id>/memberships/` | Grant/reactivate a store membership | S | active superuser |
| POST | `/api/v1/stores/<id>/memberships/<mid>/deactivate/` | Revoke a store membership | S | active superuser |
| GET | `/api/v1/stores/<id>/memberships/<mid>/roles/` | List a membership's role assignments (bare array) | S | active superuser |
| POST | `/api/v1/stores/<id>/memberships/<mid>/roles/` | Assign a store role | S | active superuser |
| POST | `/api/v1/stores/<id>/memberships/<mid>/roles/<aid>/deactivate/` | Unassign a store role | S | active superuser |
| GET | `/api/v1/stores/<id>/locations/` | List storage locations | S | active superuser |
| POST | `/api/v1/stores/<id>/locations/` | Create a storage location | S | active superuser |
| GET | `/api/v1/stores/<id>/locations/<lid>/` | Location detail | S | active superuser |
| PATCH | `/api/v1/stores/<id>/locations/<lid>/` | Edit location metadata | S | active superuser |
| POST | `/api/v1/stores/<id>/locations/<lid>/activate/` | Reactivate a location | S | active superuser |
| POST | `/api/v1/stores/<id>/locations/<lid>/deactivate/` | Deactivate a location | S | active superuser |

Contract: `docs/frontend-api-handoff.md` §4. Serializers: `apps/stores/serializers.py`.

### Shared catalog: units, categories, materials (`apps.catalog`) - shared across companies

| Method | Path | Purpose | Context | Permission |
|---|---|---|---|---|
| GET | `/api/v1/units/` | List units of measure | — (read: superuser OR `shared_catalog.view` in any store) | see left |
| POST | `/api/v1/units/` | Create a unit | — | active superuser |
| GET | `/api/v1/units/<id>/` | Unit detail | — | same read rule |
| PATCH | `/api/v1/units/<id>/` | Edit unit name (code/dimension/`canonical_factor` immutable) | — | active superuser |
| POST | `/api/v1/units/<id>/activate/` | Reactivate a unit | — | active superuser |
| POST | `/api/v1/units/<id>/deactivate/` | Deactivate a unit (blocked while an active material references it) | — | active superuser |
| GET | `/api/v1/material-categories/` | List categories | — | same read rule |
| POST | `/api/v1/material-categories/` | Create a category | — | active superuser |
| GET | `/api/v1/material-categories/<id>/` | Category detail | — | same read rule |
| PATCH | `/api/v1/material-categories/<id>/` | Edit category | — | active superuser |
| POST | `/api/v1/material-categories/<id>/activate/` | Reactivate | — | active superuser |
| POST | `/api/v1/material-categories/<id>/deactivate/` | Deactivate | — | active superuser |
| GET | `/api/v1/materials/` | List materials | — | same read rule |
| POST | `/api/v1/materials/` | Create a material | — | active superuser |
| GET | `/api/v1/materials/<id>/` | Material detail | — | same read rule |
| PATCH | `/api/v1/materials/<id>/` | Edit material metadata | — | active superuser |
| POST | `/api/v1/materials/<id>/activate/` | Reactivate | — | active superuser |
| POST | `/api/v1/materials/<id>/deactivate/` | Deactivate | — | active superuser |

Contract: `docs/frontend-api-handoff.md` §4. Serializers: `apps/catalog/serializers.py`.

### Suppliers (`apps.suppliers`) - shared, `—`

| Method | Path | Purpose | Permission |
|---|---|---|---|
| GET | `/api/v1/suppliers/` | List suppliers | active superuser |
| POST | `/api/v1/suppliers/` | Create a supplier | active superuser |
| GET | `/api/v1/suppliers/<id>/` | Supplier detail | active superuser |
| PATCH | `/api/v1/suppliers/<id>/` | Edit supplier metadata | active superuser |
| POST | `/api/v1/suppliers/<id>/activate/` | Reactivate | active superuser |
| POST | `/api/v1/suppliers/<id>/deactivate/` | Deactivate | active superuser |

Contract: serializers in `apps/suppliers/serializers.py`; no dedicated frontend-handoff section number (pre-dates the numbered sections) - see `docs/erp-screen-catalog.md` ADM-11/12 area.

### Purchasing: Purchase Requests + Purchase Orders (`apps.purchasing`) - C

| Method | Path | Purpose | Permission |
|---|---|---|---|
| GET | `/api/v1/companies/<id>/purchase-requests/` | List | `purchase_requests.view` |
| POST | `/api/v1/companies/<id>/purchase-requests/` | Create a draft | `purchase_requests.view`+`.create` |
| GET | `/api/v1/companies/<id>/purchase-requests/<rid>/` | Detail | `purchase_requests.view` |
| PATCH | `/api/v1/companies/<id>/purchase-requests/<rid>/` | Edit a draft | `.view`+`.edit` |
| POST | `/api/v1/companies/<id>/purchase-requests/<rid>/submit/` | Submit (starts 3-step approval round) | `.view`+`.submit` |
| POST | `/api/v1/companies/<id>/purchase-requests/<rid>/cancel/` | Cancel | `.view`+`.cancel` |
| POST | `/api/v1/companies/<id>/purchase-requests/<rid>/approve/` | Approve one round/step | `.view`+`.approve` |
| POST | `/api/v1/companies/<id>/purchase-requests/<rid>/reject/` | Reject one round/step | `.view`+`.approve` |
| POST | `/api/v1/companies/<id>/purchase-requests/<rid>/revise/` | Revise after rejection (new round) | `.view`+`.edit` |
| GET | `/api/v1/companies/<id>/purchase-orders/` | List | `purchase_orders.view` |
| POST | `/api/v1/companies/<id>/purchase-orders/` | Create from an APPROVED request | `.view`+`.create` |
| GET | `/api/v1/companies/<id>/purchase-orders/<oid>/` | Detail | `purchase_orders.view` |
| PATCH | `/api/v1/companies/<id>/purchase-orders/<oid>/` | Edit a draft | `.view`+`.edit` |
| POST | `/api/v1/companies/<id>/purchase-orders/<oid>/cancel/` | Cancel | `.view`+`.cancel` |
| POST | `/api/v1/companies/<id>/purchase-orders/<oid>/issue/` | Issue (terminal) | `.view`+`.issue` |

Contract: `docs/frontend-api-handoff.md` §5-6. Serializers: `apps/purchasing/serializers.py`.

### Receiving (`apps.receiving`) - S, plus `purchase_orders.view` in the source PO's own company

| Method | Path | Purpose | Permission |
|---|---|---|---|
| GET | `/api/v1/stores/<id>/goods-receipts/` | List (scoped to companies the caller also sees) | `receiving.view` (S) |
| POST | `/api/v1/stores/<id>/goods-receipts/` | Create against an ISSUED PO | `.view`+`.create` (S) + `purchase_orders.view` (C, source PO) |
| GET | `/api/v1/stores/<id>/goods-receipts/eligible-purchase-orders/` | Lookup for creation | `receiving.view` (S) |
| GET | `/api/v1/stores/<id>/goods-receipts/<rid>/` | Detail | `.view` (S) + `purchase_orders.view` (C) |
| PATCH | `/api/v1/stores/<id>/goods-receipts/<rid>/` | Edit a DRAFT | `.view`+`.edit` (S) + `purchase_orders.view` (C) |
| POST | `/api/v1/stores/<id>/goods-receipts/<rid>/post/` | Post (confirms physical arrival) | `.view`+`.post` (S) + `purchase_orders.view` (C) |
| POST | `/api/v1/stores/<id>/goods-receipts/<rid>/cancel/` | Cancel a DRAFT | `.view`+`.cancel` (S) + `purchase_orders.view` (C) |

Contract: `docs/frontend-api-handoff.md` §7. Serializers: `apps/receiving/serializers.py`.

### Material Specifications + Incoming QC (`apps.quality`)

| Method | Path | Purpose | Context | Permission |
|---|---|---|---|---|
| GET | `/api/v1/material-specifications/` | List | — | active superuser |
| POST | `/api/v1/material-specifications/` | Create | — | active superuser |
| GET | `/api/v1/material-specifications/<id>/` | Detail | — | active superuser |
| PATCH | `/api/v1/material-specifications/<id>/` | Edit metadata | — | active superuser |
| GET | `/api/v1/material-specifications/<id>/versions/` | List versions | — | active superuser |
| POST | `/api/v1/material-specifications/<id>/versions/` | Create a version draft | — | active superuser |
| GET | `/api/v1/material-specifications/<id>/versions/<vid>/` | Version detail | — | active superuser |
| PATCH | `/api/v1/material-specifications/<id>/versions/<vid>/` | Edit a DRAFT version | — | active superuser |
| GET | `/api/v1/stores/<id>/incoming-inspections/` | List | S | `incoming_qc.view` |
| POST | `/api/v1/stores/<id>/incoming-inspections/` | Create a draft against a receipt line | S | `.view`+`.create` |
| GET | `/api/v1/stores/<id>/incoming-inspections/eligible-receipt-lines/` | Lookup for creation | S | `incoming_qc.view` |
| GET | `/api/v1/stores/<id>/incoming-inspections/<iid>/` | Detail | S | `incoming_qc.view` |
| PATCH | `/api/v1/stores/<id>/incoming-inspections/<iid>/` | Edit a draft | S | `.view`+`.edit` |
| POST | `/api/v1/stores/<id>/incoming-inspections/<iid>/submit/` | Submit (freezes it) | S | `.view`+`.submit` |
| POST | `/api/v1/stores/<id>/incoming-inspections/<iid>/cancel/` | Cancel a draft | S | `.view`+`.cancel` |

Contract: `docs/frontend-api-handoff.md` §8-9. Serializers: `apps/quality/serializers.py`.

### Customers, Products (`apps.customers`, `apps.products`) - C

| Method | Path | Purpose | Permission |
|---|---|---|---|
| GET | `/api/v1/companies/<id>/customers/` | List | `customers.view` |
| POST | `/api/v1/companies/<id>/customers/` | Create | `.view`+`.create` |
| GET | `/api/v1/companies/<id>/customers/<cid>/` | Detail | `customers.view` |
| PATCH | `/api/v1/companies/<id>/customers/<cid>/` | Edit metadata | `.view`+`.edit` |
| POST | `/api/v1/companies/<id>/customers/<cid>/activate/` | Reactivate | `.view`+`.activate` |
| POST | `/api/v1/companies/<id>/customers/<cid>/deactivate/` | Deactivate | `.view`+`.deactivate` |
| GET | `/api/v1/companies/<id>/products/` | List | `products.view` |
| POST | `/api/v1/companies/<id>/products/` | Create (incl. optional `product_type`) | `.view`+`.create` |
| GET | `/api/v1/companies/<id>/products/<pid>/` | Detail | `products.view` |
| PATCH | `/api/v1/companies/<id>/products/<pid>/` | Edit metadata | `.view`+`.edit` |
| POST | `/api/v1/companies/<id>/products/<pid>/activate/` | Reactivate | `.view`+`.activate` |
| POST | `/api/v1/companies/<id>/products/<pid>/deactivate/` | Deactivate | `.view`+`.deactivate` |

Contract: `docs/frontend-api-handoff.md` §10-11. Serializers: `apps/customers/serializers.py`, `apps/products/serializers.py`.

### Quotations, Direct Sales Orders (`apps.quotations`, `apps.sales_orders`) - C

| Method | Path | Purpose | Permission |
|---|---|---|---|
| GET | `/api/v1/companies/<id>/quotations/` | List | `quotations.view` |
| POST | `/api/v1/companies/<id>/quotations/` | Create a draft | `.view`+`.create` |
| GET | `/api/v1/companies/<id>/quotations/<qid>/` | Detail | `quotations.view` |
| PATCH | `/api/v1/companies/<id>/quotations/<qid>/` | Edit a draft (header + lines) | `.view`+`.edit` |
| GET | `/api/v1/companies/<id>/sales-orders/` | List | `sales_orders.view` |
| POST | `/api/v1/companies/<id>/sales-orders/` | Create a draft | `.view`+`.create` |
| GET | `/api/v1/companies/<id>/sales-orders/<sid>/` | Detail | `sales_orders.view` |
| PATCH | `/api/v1/companies/<id>/sales-orders/<sid>/` | Edit a DRAFT | `.view`+`.edit` |
| GET | `/api/v1/companies/<id>/sales-orders/<sid>/confirmation-preview/` | Read-only eligibility preview | `sales_orders.view` |
| POST | `/api/v1/companies/<id>/sales-orders/<sid>/confirm/` | DRAFT → CONFIRMED (policy-gated) | `.view`+`.confirm` |
| GET | `/api/v1/companies/<id>/sales-order-confirmation-policy/` | Read the company's confirmation policy | active superuser |
| PATCH | `/api/v1/companies/<id>/sales-order-confirmation-policy/` | Configure the policy | active superuser |

Contract: `docs/frontend-api-handoff.md` §12-13. Serializers: `apps/quotations/serializers.py`, `apps/sales_orders/serializers.py`.

### Manufacturing Formulas (`apps.formulas`) - C

| Method | Path | Purpose | Permission |
|---|---|---|---|
| GET | `/api/v1/companies/<id>/formulas/` | List | `formulas.view` |
| POST | `/api/v1/companies/<id>/formulas/` | Create (+ empty revision 1; optional `output_uom_id`) | `.view`+`.create` |
| GET | `/api/v1/companies/<id>/formulas/<fid>/` | Detail | `formulas.view` |
| PATCH | `/api/v1/companies/<id>/formulas/<fid>/` | Edit metadata | `.view`+`.edit` |
| GET | `/api/v1/companies/<id>/formulas/<fid>/revisions/` | List revisions (summaries) | `formulas.view` |
| POST | `/api/v1/companies/<id>/formulas/<fid>/revisions/` | New empty DRAFT revision | `.view`+`.create` |
| GET | `/api/v1/companies/<id>/formulas/<fid>/revisions/<rid>/` | Revision detail (with lines) | `formulas.view` |
| PATCH | `/api/v1/companies/<id>/formulas/<fid>/revisions/<rid>/` | Edit a DRAFT revision | `.view`+`.edit` |
| GET | `/api/v1/companies/<id>/formulas/<fid>/revisions/<rid>/requirement-preview/` | Read-only material requirement calculation | `formulas.view` |
| GET | `/api/v1/companies/<id>/formulas/<fid>/revisions/<rid>/approval-preview/` | Read-only approval-eligibility preview | `formulas.view` |
| POST | `/api/v1/companies/<id>/formulas/<fid>/revisions/<rid>/approve/` | DRAFT → APPROVED (policy-gated) | `.view`+`.approve` |
| GET | `/api/v1/companies/<id>/formula-approval-policy/` | Read the company's approval policy | active superuser |
| PATCH | `/api/v1/companies/<id>/formula-approval-policy/` | Configure the policy | active superuser |

Contract: `docs/frontend-api-handoff.md` §14. Serializers: `apps/formulas/serializers.py`.

### Manufacturing Batch Planning (`apps.batch_plans`) - C

| Method | Path | Purpose | Permission |
|---|---|---|---|
| GET | `/api/v1/companies/<id>/batch-plans/` | List | `batch_plans.view` |
| POST | `/api/v1/companies/<id>/batch-plans/` | Create a planning draft | `.view`+`.create`+`sales_orders.view`+`formulas.view` |
| GET | `/api/v1/companies/<id>/batch-plans/<pid>/` | Detail | `batch_plans.view` |
| PATCH | `/api/v1/companies/<id>/batch-plans/<pid>/` | Edit target/packing/dates/notes | `.view`+`.edit` |
| GET | `/api/v1/companies/<id>/batch-plans/<pid>/requirement-preview/` | Read-only material requirement calculation | `.view`+`formulas.view` |
| POST | `/api/v1/companies/<id>/batch-plans/<pid>/allocate-number/` | **Allocate the official batch number** | `.view`+`.allocate_number` |

Contract: `docs/frontend-api-handoff.md` §15 (§15's official-number-allocation subsection is the pending write-up noted
above). Serializers: `apps/batch_plans/serializers.py`.

### Store Preparation (`apps.store_preparation`) - S, plus `batch_plans.view` in the plan's own company

| Method | Path | Purpose | Permission |
|---|---|---|---|
| GET | `/api/v1/stores/<id>/preparations/` | List (scoped to companies the caller also sees) | `store_preparation.view` (S) |
| POST | `/api/v1/stores/<id>/preparations/` | Create for an existing batch plan | `.view`+`.create` (S) + `batch_plans.view` (C) |
| GET | `/api/v1/stores/<id>/preparations/<pid>/` | Detail | `.view` (S) + `batch_plans.view` (C) |
| PATCH | `/api/v1/stores/<id>/preparations/<pid>/` | Edit Packing Type / insert-required | `.view`+`.edit` (S) + `batch_plans.view` (C) |

Contract: `docs/frontend-api-handoff.md` §16. Serializers: `apps/store_preparation/serializers.py`.

### Users (`apps.users`) - `—`

| Method | Path | Purpose | Permission |
|---|---|---|---|
| GET | `/api/v1/users/` | List | active superuser |
| POST | `/api/v1/users/` | Create | active superuser |
| GET | `/api/v1/users/<uid>/` | Detail | active superuser |
| PATCH | `/api/v1/users/<uid>/` | Edit | active superuser |
| POST | `/api/v1/users/<uid>/activate/` | Reactivate | active superuser |
| POST | `/api/v1/users/<uid>/deactivate/` | Deactivate | active superuser |
| GET | `/api/v1/users/<uid>/memberships/` | List company memberships (bare array) | active superuser |
| POST | `/api/v1/users/<uid>/memberships/` | Grant/reactivate a company membership | active superuser |
| POST | `/api/v1/users/<uid>/memberships/<mid>/deactivate/` | Revoke a membership | active superuser |
| GET | `/api/v1/users/<uid>/memberships/<mid>/roles/` | List role assignments (bare array) | active superuser |
| POST | `/api/v1/users/<uid>/memberships/<mid>/roles/` | Assign a company role | active superuser |
| POST | `/api/v1/users/<uid>/memberships/<mid>/roles/<aid>/deactivate/` | Unassign a role | active superuser |

Contract: `docs/frontend-api-handoff.md` §1. Serializers: `apps/users/serializers.py`.

### Health (`apps.common`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/health/` | `{"status": "ok"}` liveness check, public |

---

## A gap this inventory surfaced: no CORS configuration exists

`config/settings/base.py`'s `MIDDLEWARE` list has no `corsheaders` entry, `INSTALLED_APPS` has no
`django-cors-headers` package, and no `CORS_ALLOWED_ORIGINS`/`CORS_ALLOW_CREDENTIALS` setting exists anywhere in
`config/settings/{base,local,production}.py`. `production.py` explicitly notes *"CORS/CSRF trusted origins are
intentionally not preconfigured here - there is no frontend yet"* - a comment written before this session's Task
started producing frontend-integration docs, now directly relevant. Consequence: a browser-based frontend served
from a **different origin** (a different scheme/host/port) than this API - e.g. a Vite/CRA dev server on
`localhost:5173` calling an API on `localhost:8001` - **will have every cross-origin request blocked by the browser**
(no `Access-Control-Allow-Origin` header is ever returned), and the refresh cookie could not be sent cross-site
under `SameSite=Lax` either way. See `docs/frontend-demo-integration-plan.md` for what this means for the four
screens in scope.

## Reproduction

```
python manage.py shell -c "
from django.urls import get_resolver
resolver = get_resolver()
# walk resolver.url_patterns recursively; for each leaf pattern, resolve
# p.callback.view_class and check which of get/post/put/patch/delete are
# defined anywhere in its MRO.
"
```

The exact script used is not committed to the repository (a one-off inventory script run from the project's own
scratch space) - the counts and the full per-path list above are its verified output, re-checked by an independent
`grep`-based cross-count over the same output.
