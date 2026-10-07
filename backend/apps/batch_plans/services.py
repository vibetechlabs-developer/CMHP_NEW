from decimal import Decimal, InvalidOperation

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction

from apps.audit.services import record
from apps.batch_plans.models import BatchPlan
from apps.batch_plans.validation import validate_unit_relationship
from apps.catalog.models import UnitOfMeasure
from apps.common.errors import Conflict
from apps.formulas.models import FormulaRevision
from apps.products.models import Product
from apps.sales_orders.models import SalesOrder, SalesOrderLine

ALLOWED_UPDATE_FIELDS = {
    "mrp_for_printing",
    "printing_status_note",
    "target_output_quantity",
    "planned_manufacturing_date",
    "packing_size_note",
    "notes",
    "planned_pack_quantity",
    "packing_content_quantity",
    "packing_content_uom_id",
}

# Editing any of these is a substantive quantity edit (Task 12B-2): it
# re-locks and re-validates the COMPLETE merged state, not just the one
# field that changed - see `update_batch_plan`.
QUANTITY_FIELDS = {
    "target_output_quantity",
    "planned_pack_quantity",
    "packing_content_quantity",
    "packing_content_uom_id",
}

MAX_TARGET_DECIMAL_PLACES = 3
MAX_TARGET_INTEGER_DIGITS = 11


def _check_target_quantity(quantity, output_uom):
    """Validate `target_output_quantity`: positive, max 3 decimal places,
    max 11 integer digits, whole number if `output_uom` is COUNT. Its
    meaning is UNCHANGED by Task 12B-2 - always a quantity in the formula
    revision's own output unit, and always explicit (never derived from
    `planned_pack_quantity`/`packing_content_quantity`).
    """
    if quantity is None:
        raise DjangoValidationError({"target_output_quantity": "Target output quantity is required."})
    try:
        val = Decimal(str(quantity))
    except (InvalidOperation, ValueError, TypeError):
        raise DjangoValidationError({"target_output_quantity": "Target output quantity must be a valid number."})

    if val <= Decimal(0):
        raise DjangoValidationError({"target_output_quantity": "Target output quantity must be greater than zero."})

    text = format(val, "f")
    integer_part, _, fraction_part = text.partition(".")
    if len(fraction_part) > MAX_TARGET_DECIMAL_PLACES:
        raise DjangoValidationError(
            {"target_output_quantity": f"At most {MAX_TARGET_DECIMAL_PLACES} decimal places are allowed."}
        )
    if len(integer_part) > MAX_TARGET_INTEGER_DIGITS:
        raise DjangoValidationError(
            {"target_output_quantity": f"At most {MAX_TARGET_INTEGER_DIGITS} integer digits are allowed."}
        )

    if output_uom and output_uom.dimension == UnitOfMeasure.Dimension.COUNT:
        if val % Decimal(1) != Decimal(0):
            raise DjangoValidationError(
                {"target_output_quantity": f"Whole numbers are required for {output_uom.code} (COUNT unit)."}
            )
    return val


def _coerce_decimal(value, field, label):
    """Same string/Decimal coercion `_check_target_quantity` does, factored
    out for `planned_pack_quantity`/`packing_content_quantity` (whose
    business-rule validation - positivity, whole-number, precision - lives
    in `apps.batch_plans.validation`, shared with `BatchPlan.clean()`).
    `None` stays `None` (the field is simply absent/being cleared).
    """
    if value is None:
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        raise DjangoValidationError({field: f"{label} must be a valid number."})


def _lock_source_context(*, company, sales_order_line_id, formula_revision_id, packing_content_uom_id=None):
    """Lock and re-read every row a create/update decision depends on, in one
    fixed order shared by both mutation paths so they can never deadlock
    against each other or against the other write paths that touch the same
    rows:

    SalesOrder (parent of the referenced line) -> SalesOrderLine (re-read
    under that lock) -> FormulaRevision -> Product (of the line) -> every
    referenced UnitOfMeasure together (the product's sales/pack unit, the
    revision's own output unit, and - Task 12B-2 - the packing content unit
    if one was supplied), locked in ONE query, ascending id (mirrors
    `apps.formulas.approval.lock_and_load_approval_context`'s multi-unit
    lock, chosen for the identical deadlock-avoidance reason: several units
    locked together, in a fixed order, rather than one at a time).

    All locks are plain single-table `SELECT ... FOR UPDATE`/`FOR NO KEY
    UPDATE` on rows already reachable by primary key - never a joined or
    nullable-side lock. This is compatible with the existing write paths
    inspected before choosing it:
    - `apps.sales_orders.services.update_sales_order` locks only the
      `SalesOrder` row;
    - `apps.formulas.services.update_formula_revision` locks the revision,
      its formula and its output unit together in one query;
    - `apps.formulas.approval.approve_formula_revision` locks revision,
      formula, policy, product, units (ascending id) and materials
      (ascending id), always product/units AFTER the revision;
    - master-data deactivation (`deactivate_product`, a direct
      `UnitOfMeasure`/`Product` `UPDATE`) locks only its own row.
    No path here ever locks a `SalesOrder` after a `FormulaRevision`, or a
    `Product`/`UnitOfMeasure` before a `FormulaRevision`, so this order never
    cycles with any of them. `FOR NO KEY UPDATE` is used for `Product`/
    `UnitOfMeasure` (it conflicts with the row `UPDATE` every deactivation
    performs, but not with unrelated foreign-key inserts elsewhere).

    Raises a field-keyed `DjangoValidationError` when a reference is invalid,
    does not belong to `company`, the revision is not APPROVED, or a given
    `packing_content_uom_id` does not exist - these are structural problems
    with the references themselves, equally wrong on creation and on update.
    A `pack_unit`/`output_unit` MISMATCH is deliberately NOT raised here -
    see `apps.batch_plans.validation.validate_unit_relationship`, which
    every caller runs against the values this function returns. Returns
    `(order, line, revision, formula, product, pack_unit, output_unit,
    content_unit)` - `content_unit` is `None` iff `packing_content_uom_id`
    was `None`. Every object here is the value committed at lock time,
    never a value read earlier in the request.
    """
    try:
        line_stub = SalesOrderLine.objects.values("id", "sales_order_id").get(pk=sales_order_line_id)
    except SalesOrderLine.DoesNotExist:
        raise DjangoValidationError({"sales_order_line_id": "Sales order line does not exist."})

    try:
        order = SalesOrder.objects.select_for_update().get(pk=line_stub["sales_order_id"], company=company)
    except SalesOrder.DoesNotExist:
        raise DjangoValidationError({"sales_order_line_id": "The sales order line does not belong to this company."})

    try:
        line = SalesOrderLine.objects.filter(pk=sales_order_line_id, sales_order=order).get()
    except SalesOrderLine.DoesNotExist:
        raise DjangoValidationError({"sales_order_line_id": "The sales order line was not found on the specified order."})

    try:
        revision = (
            FormulaRevision.objects.select_for_update()
            .select_related("formula__company", "formula__product")
            .get(pk=formula_revision_id)
        )
    except FormulaRevision.DoesNotExist:
        raise DjangoValidationError({"formula_revision_id": "Formula revision does not exist."})

    formula = revision.formula
    if formula.company_id != company.id:
        raise DjangoValidationError({"formula_revision_id": "The formula revision does not belong to this company."})
    if revision.status != FormulaRevision.Status.APPROVED:
        raise DjangoValidationError(
            {"formula_revision_id": "Only an APPROVED formula revision can be selected for a batch plan."}
        )

    product = Product.objects.select_for_update(no_key=True).get(pk=line.product_id)

    unit_ids = sorted({product.sales_uom_id, revision.output_uom_id, *([packing_content_uom_id] if packing_content_uom_id else [])})
    units = {u.id: u for u in UnitOfMeasure.objects.select_for_update(no_key=True).filter(pk__in=unit_ids).order_by("pk")}

    content_unit = None
    if packing_content_uom_id is not None:
        content_unit = units.get(packing_content_uom_id)
        if content_unit is None:
            raise DjangoValidationError({"packing_content_uom_id": "Packing content unit does not exist."})

    pack_unit = units[product.sales_uom_id]
    output_unit = units[revision.output_uom_id]
    # `line.product`/`product.sales_uom` are cached here purely as a courtesy
    # (both relations were fetched BY the id already on the row, so this can
    # never change what they point to). `revision.output_uom` is deliberately
    # left UNATTACHED: assigning `pack_unit`/`output_unit` onto it here would
    # only be correct when the two happen to be equal, and would silently
    # make every genuine mismatch compare equal to itself - the exact bug
    # this comment exists to prevent (see git history / prior task notes on
    # this function). Callers needing `revision.output_uom` as an object get
    # `output_unit` from this function's own return value instead.
    line.product = product
    product.sales_uom = pack_unit
    return order, line, revision, formula, product, pack_unit, output_unit, content_unit


def assess_source_drift(plan):
    """Assess whether the referenced SalesOrder, SalesOrderLine, Product,
    or UnitOfMeasure has changed or drifted since the plan's snapshots were
    taken. Read-only: takes no lock and is safe to call from GET handlers.

    Task 12B-2: the unit-compatibility check now branches on whether THIS
    plan records an explicit packing relationship (`packing_content_uom_id`
    is not `None`, i.e. Shape B):
    - Shape A (no packing relationship): unchanged Task 12A rule - the
      line's CURRENT sales unit must still equal the formula's CURRENT
      output unit.
    - Shape B: the line's CURRENT sales unit must still equal the PINNED
      `pack_uom_id_snapshot` this plan's packing relationship was computed
      against - a product whose sales unit changed to a *different* unit
      (even one that is still COUNT) invalidates the arithmetic that was
      done with the old one.
    Returns structured drift information and current source state.
    """
    line = plan.sales_order_line
    order = line.sales_order
    current_product = line.product
    current_sales_uom = current_product.sales_uom
    formula_revision = plan.formula_revision
    formula = formula_revision.formula
    formula_product = formula.product
    formula_output_uom = formula_revision.output_uom

    issues = []

    is_incompatible_product = line.product_id != formula.product_id
    if plan.packing_content_uom_id is not None:
        is_incompatible_unit = current_sales_uom.id != plan.pack_uom_id_snapshot
    else:
        is_incompatible_unit = current_sales_uom.id != formula_output_uom.id
    is_incompatible = is_incompatible_product or is_incompatible_unit

    if is_incompatible_product:
        issues.append({
            "code": "INCOMPATIBLE_PRODUCT_DRIFT",
            "message": (
                f"The sales order line product ('{current_product.code}') does not match "
                f"the formula revision product ('{formula_product.code}')."
            ),
            "blocking": True,
        })

    if is_incompatible_unit:
        if plan.packing_content_uom_id is not None:
            message = (
                f"The sales order line's own unit ('{current_sales_uom.code}') no longer matches the unit "
                f"('{plan.pack_uom_code_snapshot}') this plan's packing relationship was computed against."
            )
        else:
            message = (
                f"The sales order line sales unit ('{current_sales_uom.code}') does not match "
                f"the formula revision output unit ('{formula_output_uom.code}')."
            )
        issues.append({"code": "INCOMPATIBLE_UNIT_DRIFT", "message": message, "blocking": True})

    # Line position drift
    if line.line_number != plan.source_line_number_snapshot:
        issues.append({
            "code": "LINE_NUMBER_CHANGED",
            "message": f"Sales order line moved from position {plan.source_line_number_snapshot} to {line.line_number}.",
            "blocking": False,
        })

    # Renaming drift
    if current_product.code != plan.product_code_snapshot or current_product.name != plan.product_name_snapshot:
        issues.append({
            "code": "PRODUCT_RENAMED",
            "message": "Product master code or name was modified after snapshot.",
            "blocking": False,
        })

    if formula_output_uom.code != plan.output_uom_code_snapshot or formula_output_uom.name != plan.output_uom_name_snapshot:
        issues.append({
            "code": "UNIT_RENAMED",
            "message": "Output unit code or name was modified after snapshot.",
            "blocking": False,
        })

    # Inactive master data warnings
    if not current_product.is_active:
        issues.append({
            "code": "INACTIVE_PRODUCT",
            "message": f"Product '{current_product.code}' is currently inactive.",
            "blocking": False,
        })

    if not formula_output_uom.is_active:
        issues.append({
            "code": "INACTIVE_OUTPUT_UNIT",
            "message": f"Output unit '{formula_output_uom.code}' is currently inactive.",
            "blocking": False,
        })

    if plan.packing_content_uom_id is not None and not plan.packing_content_uom.is_active:
        issues.append({
            "code": "INACTIVE_PACKING_CONTENT_UNIT",
            "message": f"Packing content unit '{plan.packing_content_uom.code}' is currently inactive.",
            "blocking": False,
        })

    # Current source state summary
    current_source_state = {
        "sales_order": {
            "id": order.id,
            "reference": order.reference,
            "status": order.status,
            "order_date": order.order_date.isoformat() if order.order_date else None,
            "customer_id": order.customer_id,
        },
        "sales_order_line": {
            "id": line.id,
            "line_number": line.line_number,
            "product_id": current_product.id,
            "product_code": current_product.code,
            "product_name": current_product.name,
            "product_is_active": current_product.is_active,
            "sales_uom_id": current_sales_uom.id,
            "sales_uom_code": current_sales_uom.code,
            "sales_uom_name": current_sales_uom.name,
            "sales_uom_is_active": current_sales_uom.is_active,
            "quantity": str(line.quantity),
        },
        "formula_revision": {
            "id": formula_revision.id,
            "revision_number": formula_revision.revision_number,
            "status": formula_revision.status,
            "base_output_quantity": str(formula_revision.base_output_quantity),
            "output_uom_id": formula_output_uom.id,
            "output_uom_code": formula_output_uom.code,
            "output_uom_name": formula_output_uom.name,
            "output_uom_is_active": formula_output_uom.is_active,
        },
    }

    return {
        "has_drift": bool(issues),
        "is_incompatible": is_incompatible,
        "issues": issues,
        "current_source_state": current_source_state,
    }


def assess_source_drift_from_context(plan, line, revision):
    """Same assessment as `assess_source_drift`, but against the already-
    locked `line` (with its `product`/`sales_uom` attached by
    `_lock_source_context`) instead of a fresh unlocked read. `revision.
    output_uom` is not pre-attached (see `_lock_source_context`), so this
    triggers one ordinary read of it - still against the value committed at
    lock time, since the surrounding transaction holds the revision's row
    lock. Used only by `update_batch_plan`, after the lock is held.
    """
    plan.sales_order_line = line
    plan.formula_revision = revision
    return assess_source_drift(plan)


def _plan_audit_snapshot(plan):
    return {
        "id": plan.id,
        "company_id": plan.company_id,
        "sales_order_line_id": plan.sales_order_line_id,
        "formula_revision_id": plan.formula_revision_id,
        "target_output_quantity": str(plan.target_output_quantity),
        "planned_manufacturing_date": (
            plan.planned_manufacturing_date.isoformat() if plan.planned_manufacturing_date else None
        ),
        "packing_size_note": plan.packing_size_note,
        "notes": plan.notes,
        "planned_pack_quantity": str(plan.planned_pack_quantity) if plan.planned_pack_quantity is not None else None,
        "packing_content_quantity": (
            str(plan.packing_content_quantity) if plan.packing_content_quantity is not None else None
        ),
        "packing_content_uom_id": plan.packing_content_uom_id,
        "mrp_for_printing": str(plan.mrp_for_printing) if plan.mrp_for_printing is not None else None,
        "printing_status_note": plan.printing_status_note,
        "status": plan.status,
        "version": plan.version,
        "source_order_reference": plan.source_order_reference_snapshot,
        "source_line_number": plan.source_line_number_snapshot,
        "product_code": plan.product_code_snapshot,
        "output_uom_code": plan.output_uom_code_snapshot,
        "pack_uom_code": plan.pack_uom_code_snapshot,
        "formula_code": plan.formula_code_snapshot,
        "formula_revision_number": plan.formula_revision_number_snapshot,
    }


def _validate_mrp(value):
    if value is not None and value < 0:
        raise DjangoValidationError({"mrp_for_printing": "MRP for printing cannot be negative."})
    return value


@transaction.atomic
def create_batch_plan(
    *,
    actor,
    company,
    sales_order_line_id,
    formula_revision_id,
    target_output_quantity,
    planned_manufacturing_date=None,
    packing_size_note="",
    notes="",
    planned_pack_quantity=None,
    packing_content_quantity=None,
    packing_content_uom_id=None,
    mrp_for_printing=None,
    printing_status_note="",
):
    """Create a DRAFT BatchPlan connecting a sales order line and an approved
    formula revision. Locks and re-reads every dependency (see
    `_lock_source_context`) before deciding, so a mismatched or
    since-deactivated combination can never be created even if it raced with
    a concurrent edit. Atomic with its audit event; an audit failure rolls
    back the whole creation.

    Task 12B-2: `planned_pack_quantity`/`packing_content_quantity`/
    `packing_content_uom_id` are optional and always supplied together (see
    `apps.batch_plans.validation.validate_unit_relationship`). When absent,
    the ORIGINAL Task 12A same-unit rule applies unchanged: the product's
    sales unit must equal the formula revision's own output unit.
    `target_output_quantity` keeps its original, unchanged meaning either
    way - an explicit manufacturing target in the formula's output unit.
    """
    order, line, revision, formula, product, pack_unit, output_unit, content_unit = _lock_source_context(
        company=company,
        sales_order_line_id=sales_order_line_id,
        formula_revision_id=formula_revision_id,
        packing_content_uom_id=packing_content_uom_id,
    )

    if product.id != formula.product_id:
        raise DjangoValidationError(
            {
                "formula_revision_id": (
                    f"Formula revision is for product '{formula.product.code}', but the sales order line "
                    f"is for product '{product.code}'. Products must match."
                )
            }
        )

    if not product.is_active:
        raise DjangoValidationError({"sales_order_line_id": f"Product '{product.code}' is inactive."})
    if not output_unit.is_active:
        raise DjangoValidationError({"formula_revision_id": f"Output unit '{output_unit.code}' is inactive."})
    if content_unit is not None and not content_unit.is_active:
        raise DjangoValidationError({"packing_content_uom_id": f"Packing content unit '{content_unit.code}' is inactive."})

    target_val = _check_target_quantity(target_output_quantity, output_unit)
    planned_pack_val = _coerce_decimal(planned_pack_quantity, "planned_pack_quantity", "Planned pack quantity")
    content_val = _coerce_decimal(packing_content_quantity, "packing_content_quantity", "Packing content quantity")
    validate_unit_relationship(
        pack_unit=pack_unit,
        output_unit=output_unit,
        planned_pack_quantity=planned_pack_val,
        packing_content_quantity=content_val,
        packing_content_uom=content_unit,
    )

    snapshots = {
        "sales_order": {
            "id": order.id,
            "reference": order.reference,
            "status": order.status,
            "order_date": order.order_date.isoformat() if order.order_date else None,
        },
        "sales_order_line": {
            "id": line.id,
            "line_number": line.line_number,
            "product_id": product.id,
            "product_code": product.code,
            "product_name": product.name,
            "sales_uom_id": pack_unit.id,
            "sales_uom_code": pack_unit.code,
            "sales_uom_name": pack_unit.name,
            "quantity": str(line.quantity),
        },
        "formula": {
            "id": formula.id,
            "code": formula.code,
            "name": formula.name,
        },
        "formula_revision": {
            "id": revision.id,
            "revision_number": revision.revision_number,
            "status": revision.status,
            "base_output_quantity": str(revision.base_output_quantity),
            "output_uom_id": output_unit.id,
            "output_uom_code": output_unit.code,
            "output_uom_name": output_unit.name,
        },
        "packing_relationship": (
            {
                "planned_pack_quantity": str(planned_pack_val),
                "packing_content_quantity": str(content_val),
                "packing_content_uom_id": content_unit.id,
                "packing_content_uom_code": content_unit.code,
                "packing_content_uom_name": content_unit.name,
            }
            if content_unit is not None
            else None
        ),
    }

    plan = BatchPlan(
        company=company,
        sales_order_line=line,
        formula_revision=revision,
        target_output_quantity=target_val,
        planned_manufacturing_date=planned_manufacturing_date,
        packing_size_note=(packing_size_note or "").strip(),
        notes=(notes or "").strip(),
        planned_pack_quantity=planned_pack_val,
        packing_content_quantity=content_val,
        packing_content_uom=content_unit,
        mrp_for_printing=_validate_mrp(mrp_for_printing),
        printing_status_note=(printing_status_note or "").strip(),
        status=BatchPlan.Status.DRAFT,
        version=1,
        created_by=actor,
        source_order_reference_snapshot=order.reference,
        source_line_number_snapshot=line.line_number,
        product_id_snapshot=product.id,
        product_code_snapshot=product.code,
        product_name_snapshot=product.name,
        output_uom_id_snapshot=output_unit.id,
        output_uom_code_snapshot=output_unit.code,
        output_uom_name_snapshot=output_unit.name,
        pack_uom_id_snapshot=pack_unit.id,
        pack_uom_code_snapshot=pack_unit.code,
        pack_uom_name_snapshot=pack_unit.name,
        formula_id_snapshot=formula.id,
        formula_code_snapshot=formula.code,
        formula_name_snapshot=formula.name,
        formula_revision_number_snapshot=revision.revision_number,
        formula_base_output_quantity_snapshot=revision.base_output_quantity,
        source_snapshots=snapshots,
    )
    plan.save()

    record(
        actor=actor,
        action="batch_plan.created",
        target_type="batch_plan",
        target_id=plan.id,
        company=company,
        after=_plan_audit_snapshot(plan),
    )
    return plan


@transaction.atomic
def update_batch_plan(*, actor, plan_id, expected_version, data):
    """Edit a DRAFT BatchPlan's mutable fields only. Locked, version-checked,
    no-op writes nothing.

    A date/packing_size_note/notes-only edit stays lightweight (no re-lock)
    and remains possible even on a plan whose source has drifted
    incompatible - Task 12A's own rule, unchanged.

    Editing `target_output_quantity`/`planned_pack_quantity`/
    `packing_content_quantity`/`packing_content_uom_id` (Task 12B-2: ANY of
    these) is a substantive quantity edit: it re-locks and re-reads the
    referenced order/line/revision/product/units exactly like creation (see
    `_lock_source_context`), MERGES the edit with the plan's current values
    for the fields not being touched, and validates the COMPLETE resulting
    state with the same rules creation uses - never just the one field that
    changed in isolation. Blocked by the same incompatibility/active-state
    rules an in-flight source change or deactivation is deciding against.
    Atomic with its audit event; an audit failure rolls back the whole
    update.
    """
    try:
        plan = BatchPlan.objects.select_for_update().select_related("company").get(pk=plan_id)
    except BatchPlan.DoesNotExist:
        raise DjangoValidationError({"detail": "Batch plan does not exist."})

    if plan.version != expected_version:
        raise Conflict("This batch plan has changed since it was last read. Refetch and retry.")

    invalid_keys = sorted(set(data.keys()) - ALLOWED_UPDATE_FIELDS)
    if invalid_keys:
        raise DjangoValidationError({k: "This field cannot be edited." for k in invalid_keys})

    new_target = plan.target_output_quantity
    new_date = plan.planned_manufacturing_date
    new_packing_note = plan.packing_size_note
    new_notes = plan.notes
    new_planned_pack = plan.planned_pack_quantity
    new_content_qty = plan.packing_content_quantity
    new_content_uom_id = plan.packing_content_uom_id

    quantity_changed = False
    if QUANTITY_FIELDS & set(data.keys()):
        candidate_target = data.get("target_output_quantity", plan.target_output_quantity)
        candidate_planned_pack = data["planned_pack_quantity"] if "planned_pack_quantity" in data else plan.planned_pack_quantity
        candidate_content_qty = (
            data["packing_content_quantity"] if "packing_content_quantity" in data else plan.packing_content_quantity
        )
        candidate_content_uom_id = (
            data["packing_content_uom_id"] if "packing_content_uom_id" in data else plan.packing_content_uom_id
        )

        order, line, revision, formula, product, pack_unit, output_unit, content_unit = _lock_source_context(
            company=plan.company,
            sales_order_line_id=plan.sales_order_line_id,
            formula_revision_id=plan.formula_revision_id,
            packing_content_uom_id=candidate_content_uom_id,
        )
        drift = assess_source_drift_from_context(plan, line, revision)
        if drift["is_incompatible"]:
            raise DjangoValidationError(
                {
                    "target_output_quantity": (
                        "The referenced sales order line's product or unit has changed and is "
                        "incompatible with the pinned formula revision. Quantity changes are blocked."
                    )
                }
            )
        if not product.is_active:
            raise DjangoValidationError(
                {"target_output_quantity": f"Product '{product.code}' is inactive. Quantity changes require an active product."}
            )
        if not output_unit.is_active:
            raise DjangoValidationError(
                {"target_output_quantity": f"Output unit '{output_unit.code}' is inactive. Quantity changes require an active output unit."}
            )
        if content_unit is not None and not content_unit.is_active:
            raise DjangoValidationError(
                {"packing_content_uom_id": f"Packing content unit '{content_unit.code}' is inactive."}
            )

        validated_target = _check_target_quantity(candidate_target, output_unit)
        planned_pack_val = _coerce_decimal(candidate_planned_pack, "planned_pack_quantity", "Planned pack quantity")
        content_val = _coerce_decimal(candidate_content_qty, "packing_content_quantity", "Packing content quantity")
        validate_unit_relationship(
            pack_unit=pack_unit,
            output_unit=output_unit,
            planned_pack_quantity=planned_pack_val,
            packing_content_quantity=content_val,
            packing_content_uom=content_unit,
        )

        candidate_content_uom_id_resolved = content_unit.id if content_unit is not None else None
        if (
            validated_target != plan.target_output_quantity
            or planned_pack_val != plan.planned_pack_quantity
            or content_val != plan.packing_content_quantity
            or candidate_content_uom_id_resolved != plan.packing_content_uom_id
        ):
            quantity_changed = True
            new_target = validated_target
            new_planned_pack = planned_pack_val
            new_content_qty = content_val
            new_content_uom_id = candidate_content_uom_id_resolved

    date_changed = False
    if "planned_manufacturing_date" in data:
        in_date = data["planned_manufacturing_date"]
        if in_date != plan.planned_manufacturing_date:
            new_date = in_date
            date_changed = True

    packing_note_changed = False
    if "packing_size_note" in data:
        val = (data["packing_size_note"] or "").strip()
        if val != plan.packing_size_note:
            new_packing_note = val
            packing_note_changed = True

    notes_changed = False
    if "notes" in data:
        val = (data["notes"] or "").strip()
        if val != plan.notes:
            new_notes = val
            notes_changed = True

    printing_changed = False
    new_mrp = plan.mrp_for_printing
    new_printing_note = plan.printing_status_note
    if "mrp_for_printing" in data and _validate_mrp(data["mrp_for_printing"]) != plan.mrp_for_printing:
        new_mrp = _validate_mrp(data["mrp_for_printing"])
        printing_changed = True
    if "printing_status_note" in data:
        value = (data["printing_status_note"] or "").strip()
        if value != plan.printing_status_note:
            new_printing_note = value
            printing_changed = True

    if not (quantity_changed or date_changed or packing_note_changed or notes_changed or printing_changed):
        return plan, False

    before_snapshot = _plan_audit_snapshot(plan)

    plan.target_output_quantity = new_target
    plan.planned_manufacturing_date = new_date
    plan.packing_size_note = new_packing_note
    plan.notes = new_notes
    plan.planned_pack_quantity = new_planned_pack
    plan.packing_content_quantity = new_content_qty
    plan.packing_content_uom_id = new_content_uom_id
    plan.mrp_for_printing = new_mrp
    plan.printing_status_note = new_printing_note
    plan.version += 1
    plan.save(
        update_fields=[
            "target_output_quantity",
            "planned_manufacturing_date",
            "packing_size_note",
            "notes",
            "planned_pack_quantity",
            "packing_content_quantity",
            "packing_content_uom",
            "mrp_for_printing",
            "printing_status_note",
            "version",
            "updated_at",
        ]
    )

    record(
        actor=actor,
        action="batch_plan.updated",
        target_type="batch_plan",
        target_id=plan.id,
        company=plan.company,
        before=before_snapshot,
        after=_plan_audit_snapshot(plan),
    )
    return plan, True
