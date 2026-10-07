# Order-line workflow: store preparation before batch planning

Written for: engineers maintaining the sales-order, store-preparation and batch-plan modules.

## Confirmed sequence

1. Admin creates an order and its product lines (no batch plan).
2. Store Manager opens the same order and saves store preparation on a line.
   No batch plan, formula, batch number, requisition or stock movement is needed.
3. Manager opens the same order, creates the batch plan for that line and saves batch/printing fields.
4. Each department edits only its own section. Admin can edit all business-editable sections.

## Data relationship

`StorePreparation` (apps/store_preparation) now has exactly one owner:

| Owner | Column | Meaning | Created by |
|---|---|---|---|
| Order line | `sales_order_line` | Store-side preparation for an order line. Exists before any batch plan. | New `POST` with `sales_order_line_id` |
| Batch plan | `batch_plan` (OneToOne) | **Legacy**, batch-specific. Rows created before this change. Kept intact and readable. | Existing `POST` with `batch_plan_id` |

Database guarantees (migration `store_preparation.0003_order_line_preparation`, additive only):
- `store_prep_exactly_one_owner`: a row has a batch plan **or** an order line, never both or neither.
- `unique_line_store_preparation`: at most one order-line preparation per store and line. Concurrent duplicate creation fails at the database, and the API returns 409.
- The existing one-per-plan OneToOne constraint is unchanged for legacy rows.

Legacy compatibility:
- No legacy row is modified, merged, or reassigned.
- A later batch plan for a line does not copy or overwrite the line's preparation. The order-line record is the source. Legacy batch-linked rows are shown as batch-specific and are never converted automatically.
- Owner and store are immutable after creation (`clean()` refuses changes).

Order-line changes that would orphan preparation are refused explicitly (`apps/sales_orders/services.py`):
- Removing a line that has store preparation returns a validation error. The line is kept.
- Changing a line's product while store preparation exists returns a validation error. Add a new line for the other product instead.

## Access

Store-scoped (`store_preparation.*` is granted per store only, never company-wide):

| Action | Permission |
|---|---|
| View a store's preparation | `store_preparation.view` in that store |
| Create | `store_preparation.create` in that store |
| Edit | `store_preparation.edit` in that store |

Company-scoped owner check:

| Owner | Required in the owning company |
|---|---|
| Order-line preparation | `sales_orders.view` |
| Legacy batch-linked preparation | `batch_plans.view` |

Failed owner or store checks return 404 (no existence leak). A missing store permission returns 403 naming it.

## Permission matrix

| Section / field | Admin | Store Manager | Manager |
|---|---|---|---|
| Order details | View/Edit (`sales_orders.view`, `sales_orders.edit`) | View (`sales_orders.view`) | View (`sales_orders.view`) |
| Store preparation (Packing Type, Label, Box, Insert) | View/Edit (`store_preparation.view/create/edit` in the store) | View/Edit (same, in the store) | View (`store_preparation.view` in the store) |
| Batch and printing | View/Edit (`batch_plans.*`, `batch_plans.printing_edit`, `batch_plans.allocate_number`) | View (`batch_plans.view`) | View/Edit (`batch_plans.view/create/edit/printing_edit/allocate_number`) |

Role bundles (company DEMOA, created by a one-off script, no account assigned to Manager yet):
- `STORES_MANAGER`: `sales_orders.view`, `batch_plans.view`, `customers.view`, `products.view`.
- `BATCH_MANAGER`: `sales_orders.view`, `batch_plans.view/create/edit/printing_edit/allocate_number`, `customers.view`, `products.view`.
- `ADMIN_DEMOA` (existing): order edit and batch permissions.
- Store roles in DEMOWH: `STORES_MANAGER` (`store_preparation.view/create/edit`, `shared_catalog.view`) for the Store Manager; the Admin's existing store role provides the store preparation permissions.

Explicitly NOT granted by this workflow: `formulas.view`, `batch_plans.create` to Stores Manager, printing edit to Stores Manager, any company-wide store permission, and any superuser bypass.

## Endpoints

| Method | Path | Change |
|---|---|---|
| GET | `/api/v1/stores/<store_id>/preparations/` | Accepts `sales_order_line=<id>`. Returns order-line and legacy rows the caller can see. |
| POST | `/api/v1/stores/<store_id>/preparations/` | Accepts `sales_order_line_id` (new) or `batch_plan_id` (legacy). Exactly one. |
| GET / PATCH | `/api/v1/stores/<store_id>/preparations/<id>/` | Owner-aware access check. PATCH uses `expected_version`. Never modifies the order or batch plan. |

Response fields added: `sales_order_line_id`. `batch_plan_id` may now be `null`. `plan_context.owner` is `order_line` or `batch_plan`.

Frontend: `SalesOrderFormModal.jsx` keys the Store preparation section to the saved order line (`listPreparationsForLine`). Requisition status still follows the batch plan.

## Verification

- `tests/test_order_line_preparation.py`: 13 tests covering the full journey, forged direct API writes, cross-store and cross-company denial, multiple lines, duplicate creation, stale versions, legacy rows, order-line removal and product-change conflicts, and audit rollback.
- `tests/test_store_manager_access.py` and `tests/test_store_preparation.py`: existing behaviour preserved.

Not yet done: Postman collection and API dashboard regeneration; browser verification of the three-person journey.
