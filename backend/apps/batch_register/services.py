"""Task 15B: a READ-ONLY operational register combining EXISTING order,
batch-plan, store-preparation and requisition information - one row per
`BatchPlan`. No new model, no new table, no new business status, no new
lifecycle behavior. This module only queries and reshapes records that
already exist and are already governed by their own apps' own services -
nothing here ever writes, locks, or bumps a version.

ROW IDENTITY: exactly one row per `BatchPlan`, never per order or order
line. One order line may legitimately have zero, one, or several
`BatchPlan`s (Task 12A placed no limit); each produces its own row. An
order with NO batch plan at all has no row here - this is NOT a complete
list of orders, only of batch plans, via the existing `/companies/<id>/
sales-orders/` list for that. There is no mutation endpoint anywhere in
this app.

ACCESS MODEL - three independent layers, every one applied BEFORE
pagination/filtering/counting ever runs:
1. The base row set itself requires `batch_plans.view` in the URL's
   company (checked once, at the view layer, before any query here runs)
   - the SAME, unbroadened existing batch-plan visibility contract; every
     row's `company_id` is forced to match the URL, so there is no
     cross-company leak to guard against in the base query at all.
2. Three OPTIONAL per-request company permissions
   (`sales_orders.view`/`customers.view`/`products.view`) each gate ONE
   cluster of fields that are not already part of `BatchPlan`'s own
   immutable snapshot - live order/customer/product data this app does
   not own. Missing one of these does not block the whole request; it
   only replaces that one section with `{"access": "restricted"}` on
   EVERY row, identically, whether or not the underlying related record
   exists - never a partial/leaking shape.
3. `store_preparation`/`material_requisition` are STORE-scoped resources
   with their OWN permission systems (`apps.store_preparation`/`apps.
   material_requisitions`, including the latter's own dual company
   check) - computed ONCE per request (which stores the caller can see
   each resource type in), never re-queried per row. Unlike layer 2,
   these two resources can live in ANY store regardless of the plan's
   company - including a store that has since been DEACTIVATED, since
   deactivating a store never touches rows that already reference it
   (Task 15B.2; `store`'s `on_delete=PROTECT` only blocks deletion, and
   deactivation is a plain flag flip - see `apps/stores/services.
   deactivate_store`). There is therefore no way to enumerate "every
   store that could ever be hiding a record" (an inactive store may
   still be hiding one). Rather than approximate that with an "active
   stores only" coverage check (Task 15B.1's approach, which this task
   found could itself be fooled by a deactivated store), this makes NO
   existence claim at all unless it can show the caller a real,
   currently-accessible record: no record, a record in an inaccessible
   active store, and a record in a now-inactive store all render
   identically as `{"access": "unavailable"}` - never read as "this does
   not exist", only as "no related information is visible to this
   caller". `{"access": "accessible", "exists": true, ...}` is the only
   other shape, returned only for a record the caller can actually see.

READ CONSISTENCY: each row is read in one ordinary (non-atomic,
non-locking) query set, not inside a transaction, and is NOT a frozen
cross-record snapshot - two different rows (or the same row read twice)
may reflect two different instants if something else commits in
between. This view grants no authorization to approve, issue, or act on
anything; every future mutation still goes through its own source
record's own endpoint, with its own `expected_version` and its own
permission re-check, exactly as before this task existed.
"""

from apps.batch_plans.models import BatchPlan
from apps.batch_plans.services import assess_source_drift
from apps.permissions.services import store_user_has_permission, user_has_permission
from apps.stores.services import active_stores_for_user

SALES_ORDERS_VIEW = "sales_orders.view"
CUSTOMERS_VIEW = "customers.view"
PRODUCTS_VIEW = "products.view"
STORE_PREPARATION_VIEW = "store_preparation.view"
MATERIAL_REQUISITIONS_VIEW = "material_requisitions.view"
FORMULAS_VIEW = "formulas.view"

RESTRICTED = {"access": "restricted"}

# Task 15B.2: the single representation for every "cannot tell" state on
# a store-scoped related-record section - absent, hidden in an
# inaccessible active store, or hidden in a now-inactive store. Task
# 15B.1 tried to carve out a safe "exists: false" case (full coverage of
# every ACTIVE store), but a store can be deactivated without touching
# any `StorePreparation`/`MaterialRequisition` row that already
# references it (see the module docstring), so "every active store" was
# never actually "every store that could be hiding a record" - that
# exception is removed entirely rather than patched again. `UNAVAILABLE`
# must never be read as "this does not exist" - only as "no related
# information is visible to this caller".
UNAVAILABLE = {"access": "unavailable"}


def register_queryset(company):
    """One row per `BatchPlan` in `company` - the ONLY filter on the base
    query; every select_related below mirrors `apps.batch_plans.views.
    _batch_plan_queryset` exactly (reused, never re-derived) plus the two
    reverse one-to-ones this task newly joins, so `assess_source_drift`
    and every field below cost zero additional queries per row.
    """
    return (
        BatchPlan.objects.filter(company=company)
        .select_related(
            "company",
            "sales_order_line__sales_order__customer",
            "sales_order_line__product__sales_uom",
            "formula_revision__formula__product",
            "formula_revision__output_uom",
            "packing_content_uom",
            "number_allocation",
            "store_preparation",
            "material_requisition",
        )
    )


def compute_access_context(user, company):
    """Computed ONCE per request - never per row. Returns a dict of
    booleans/sets a single row-serialization pass consults repeatedly
    without ever issuing a further query.
    """
    store_prep_store_ids = {
        store.id for store in active_stores_for_user(user) if store_user_has_permission(user, store, STORE_PREPARATION_VIEW)
    }
    requisition_store_ids = {
        store.id for store in active_stores_for_user(user) if store_user_has_permission(user, store, MATERIAL_REQUISITIONS_VIEW)
    }
    return {
        "sales_orders_ok": user_has_permission(user, company, SALES_ORDERS_VIEW),
        "customers_ok": user_has_permission(user, company, CUSTOMERS_VIEW),
        "products_ok": user_has_permission(user, company, PRODUCTS_VIEW),
        "formulas_ok": user_has_permission(user, company, FORMULAS_VIEW),
        "store_prep_store_ids": store_prep_store_ids,
        "requisition_store_ids": requisition_store_ids,
    }


def _order_context(plan, access):
    if not access["sales_orders_ok"]:
        return RESTRICTED
    line = plan.sales_order_line
    order = line.sales_order
    return {
        "access": "accessible",
        "order_date": order.order_date.isoformat() if order.order_date else None,
        "order_status": order.status,
        "line_quantity": str(line.quantity),
        "line_sales_uom_code": line.sales_uom_code_snapshot,
    }


def _customer_context(plan, access):
    if not access["customers_ok"]:
        return RESTRICTED
    customer = plan.sales_order_line.sales_order.customer
    return {"access": "accessible", "id": customer.id, "name": customer.name, "code": customer.code}


def _product_type_context(plan, access):
    if not access["products_ok"]:
        return RESTRICTED
    product = plan.sales_order_line.product
    return {"access": "accessible", "value": product.product_type, "is_active": product.is_active}


def _store_preparation_context(plan, access):
    """`StorePreparation` is a REVERSE one-to-one - `plan.store_preparation`
    raises `DoesNotExist` (via Django's own `RelatedObjectDoesNotExist`,
    which is also an `AttributeError`) when none exists; already-selected
    by `register_queryset`'s own `select_related`, so this never queries.

    LEAK-AVOIDANCE (Task 15B.1/15B.2): `store` on `StorePreparation` is a
    free `ForeignKey` to ANY `SharedStore`, entirely independent of the
    plan's company, and deactivating a store never detaches a row that
    already references it (confirmed by reading `apps/store_preparation/
    models.py` and `apps/stores/services.deactivate_store` directly).
    `access["store_prep_store_ids"]` only ever contains ACTIVE stores
    (`active_stores_for_user`'s own contract), so a preparation whose
    store has since been deactivated is correctly never "accessible"
    here either way - but Task 15B.1's "exists: False once coverage of
    every ACTIVE store is held" carve-out could still be fooled by an
    absent preparation next to a plan whose preparation happens to sit
    in a now-INACTIVE store elsewhere: that row would wrongly look
    different (`UNAVAILABLE`) from the "exists: False" row, re-opening
    the exact leak this was meant to close. Removed entirely rather than
    patched again: no existence claim is made unless a real,
    currently-accessible record can be shown.
    """
    preparation = getattr(plan, "store_preparation", None)
    if preparation is None or preparation.store_id not in access["store_prep_store_ids"]:
        return UNAVAILABLE
    return {
        "access": "accessible",
        "exists": True,
        "id": preparation.id,
        "packing_type": preparation.packing_type,
        "insert_required": preparation.insert_required,
        "version": preparation.version,
    }


def _material_requisition_context(plan, access):
    """Same reverse-one-to-one shape and the same Task 15B.1/15B.2 leak-
    closing rule as `_store_preparation_context`, gated by BOTH the
    store-scoped `material_requisitions.view` AND the company-scoped
    `formulas.view` - the identical dual rule `apps.material_
    requisitions` itself already enforces (never recipe lines, never
    quantities, never prices - only identity/status, per Task 15B's own
    explicit instruction). Missing `formulas.view` alone is an
    unconditional `UNAVAILABLE` (it is a flat company-level denial, not
    an existence-dependent one).
    """
    if not access["formulas_ok"]:
        return UNAVAILABLE
    requisition = getattr(plan, "material_requisition", None)
    if requisition is None or requisition.store_id not in access["requisition_store_ids"]:
        return UNAVAILABLE
    return {
        "access": "accessible",
        "exists": True,
        "id": requisition.id,
        "status": requisition.status,
        "version": requisition.version,
    }


# Task 15B.1/15B.2: these three `assess_source_drift` issue codes
# reference the order line's CURRENT product - `current_product.code`/
# `current_product.is_active` - which is LIVE state, not `product_code_
# snapshot` (frozen), and is the exact same live fact `product_type_
# current` already gates behind `products.view`. Task 15B.1 redacted
# only the `message` text, but the CODE alone already names the specific
# live fact (e.g. merely seeing "INACTIVE_PRODUCT" in the list already
# tells an unauthorized caller the product is currently inactive,
# regardless of what the message says) - insufficient, per this task's
# own finding. Every other issue code (unit/line-position related)
# references nothing this register gates anywhere, so only these three
# are moved under `product_detail` below.
_PRODUCT_GATED_ISSUE_CODES = {"INCOMPATIBLE_PRODUCT_DRIFT", "PRODUCT_RENAMED", "INACTIVE_PRODUCT"}


def _source_drift_context(plan, access):
    """Deliberately NOT the raw `assess_source_drift` return value -
    that function's own `current_source_state` sub-dict includes
    `order_date`/`customer_id`, which would bypass this endpoint's own,
    separately-gated `order_context`/`customer` sections.

    `is_incompatible` is the one GENERIC compatibility signal - it is
    already part of the existing authorized `BatchPlan` contract (`apps.
    batch_plans.serializers.BatchPlanDetailSerializer.get_source_drift`
    returns it to any `batch_plans.view` holder, ungated by `products.
    view`), so it is surfaced unconditionally here too, matching that
    same boundary - "a generic source compatibility warning [that] is
    already authorized". The three codes in `_PRODUCT_GATED_ISSUE_CODES`
    are split into their own `product_detail` sub-section instead of
    staying in the flat `issues` list, so that NEITHER their code NOR
    their message is visible without `products.view` - `product_detail`
    is `UNAVAILABLE` in that case (the "otherwise mark the protected
    assessment unavailable" branch), never a redacted stand-in entry
    inside `issues` itself. Every other issue code stays in `issues`,
    unconditionally visible, exactly as before - none of them reference
    anything this register gates anywhere.
    """
    drift = assess_source_drift(plan)
    product_issues = [issue for issue in drift["issues"] if issue["code"] in _PRODUCT_GATED_ISSUE_CODES]
    other_issues = [issue for issue in drift["issues"] if issue["code"] not in _PRODUCT_GATED_ISSUE_CODES]
    if access["products_ok"]:
        product_detail = {"access": "accessible", "issues": product_issues}
    else:
        product_detail = UNAVAILABLE
    return {
        "is_incompatible": drift["is_incompatible"],
        "issues": other_issues,
        "product_detail": product_detail,
    }


def serialize_row(plan, access):
    line = plan.sales_order_line
    order = line.sales_order
    revision = plan.formula_revision
    output_unit = revision.output_uom
    allocation = getattr(plan, "number_allocation", None)
    content_unit = plan.packing_content_uom

    return {
        "batch_plan_id": plan.id,
        "version": plan.version,
        "status": plan.status,
        "created_at": plan.created_at.isoformat(),
        "planned_manufacturing_date": (
            plan.planned_manufacturing_date.isoformat() if plan.planned_manufacturing_date else None
        ),
        "sales_order_id": order.id,
        "sales_order_reference": plan.source_order_reference_snapshot,
        "sales_order_line_id": line.id,
        "product_id_snapshot": plan.product_id_snapshot,
        "product_code_snapshot": plan.product_code_snapshot,
        "product_name_snapshot": plan.product_name_snapshot,
        "product_type_current": _product_type_context(plan, access),
        "customer": _customer_context(plan, access),
        "order_context": _order_context(plan, access),
        "planned_pack_quantity": str(plan.planned_pack_quantity) if plan.planned_pack_quantity is not None else None,
        "packing_content_quantity": (
            str(plan.packing_content_quantity) if plan.packing_content_quantity is not None else None
        ),
        "packing_content_uom_code": content_unit.code if content_unit is not None else None,
        "target_output_quantity": str(plan.target_output_quantity),
        "output_uom_code": output_unit.code,
        "official_batch_number": allocation.number if allocation is not None else None,
        "store_preparation": _store_preparation_context(plan, access),
        "material_requisition": _material_requisition_context(plan, access),
        "source_drift": _source_drift_context(plan, access),
    }
