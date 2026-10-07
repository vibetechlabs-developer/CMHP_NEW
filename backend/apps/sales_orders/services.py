import secrets

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.db.models import ProtectedError
from django.utils import timezone

from apps.audit.services import record
from django.shortcuts import get_object_or_404
from rest_framework import exceptions

from apps.catalog.models import UnitOfMeasure
from apps.common.errors import Conflict, Forbidden
from apps.companies.services import active_companies_for_user
from apps.customers.models import Customer
from apps.permissions.services import user_has_permission
from apps.products.models import Product
from apps.quotations.services import (
    _TEMP_LINE_NUMBER_OFFSET,
    _check_quantity,
    _compute_line_amount,
    _line_snapshot_list,
    _normalize_currency,
    _resolve_active_customer,
    _resolve_line_product,
    _snapshot_fields,
)
from apps.sales_orders.confirmation import (
    POLICY_NOT_CONFIGURED_MESSAGE,
    ConfirmationBlocked,
    assess_confirmation,
    business_today,
    policy_snapshot,
)
from apps.sales_orders.models import SalesOrder, SalesOrderConfirmationPolicy, SalesOrderLine

# The line helpers above are imported from apps.quotations.services
# unchanged (Decimal precision/rounding, COUNT rule, active-reference
# checks, snapshots, audit line snapshots) so both documents share one
# proven implementation; quotations were deliberately not refactored.

_REFERENCE_MAX_ATTEMPTS = 5


def _generate_reference():
    """Technical working default, NOT client-approved numbering: `SO-`,
    a date stamp and 10 random hex characters. Never `count() + 1`.
    Uniqueness is a per-company database constraint; a collision is
    retried.
    """
    return f"SO-{timezone.now().strftime('%Y%m%d')}-{secrets.token_hex(5).upper()}"


def _header_snapshot(order):
    return {
        "customer_id": order.customer_id,
        "order_date": order.order_date.isoformat(),
        "requested_delivery_date": (
            order.requested_delivery_date.isoformat() if order.requested_delivery_date else None
        ),
        "planned_manufacturing_date": (
            order.planned_manufacturing_date.isoformat() if order.planned_manufacturing_date else None
        ),
        "customer_order_reference": order.customer_order_reference,
        "notes": order.notes,
    }


def _so_line_snapshot_list(lines):
    lines = list(lines)
    base = _line_snapshot_list(lines)
    by_id = {line.id: line for line in lines}
    for entry in base:
        entry["product_type_snapshot"] = by_id[entry["id"]].product_type_snapshot
    return base


def _resolve_product_type(value, line_number):
    """Blank is allowed (no type recorded). Otherwise the value must be an
    active, maintained ProductType name. The product master is never changed.
    """
    value = (value or "").strip()
    if not value:
        return ""
    from apps.catalog.models import ProductType

    if not ProductType.objects.filter(name=value, is_active=True).exists():
        raise DjangoValidationError(
            {"lines": f"Line {line_number}: product type '{value}' is not an active product type."}
        )
    return value


def _check_dates(order_date, requested_delivery_date):
    if requested_delivery_date is not None and requested_delivery_date < order_date:
        raise DjangoValidationError(
            {"requested_delivery_date": "Requested delivery date cannot precede the order date."}
        )


def _create_header_with_unique_reference(*, company, actor, customer, order_date, requested_delivery_date,
                                         planned_manufacturing_date, customer_order_reference, currency, notes):
    for _ in range(_REFERENCE_MAX_ATTEMPTS):
        try:
            with transaction.atomic():
                order = SalesOrder(
                    company=company,
                    reference=_generate_reference(),
                    customer=customer,
                    order_date=order_date,
                    requested_delivery_date=requested_delivery_date,
                    planned_manufacturing_date=planned_manufacturing_date,
                    customer_order_reference=customer_order_reference,
                    currency=currency,
                    notes=notes,
                    created_by=actor,
                )
                order.save()
                return order
        except IntegrityError as exc:
            constraint_name = getattr(getattr(exc.__cause__, "diag", None), "constraint_name", "") or ""
            if "unique_sales_order_company_reference" in constraint_name:
                continue
            raise
    raise RuntimeError("Could not generate a unique sales order reference after several attempts.")


@transaction.atomic
def create_sales_order(*, actor, company, customer_id, order_date, currency, requested_delivery_date=None,
                       planned_manufacturing_date=None, customer_order_reference="", notes="", lines=None):
    """Always `DRAFT`, `version=1`. Empty drafts and zero-price lines are
    allowed. Customer must be active and in `company`; every line's
    product (and its sales unit) must be active and in `company`.
    """
    currency = _normalize_currency(currency)
    customer = _resolve_active_customer(company, customer_id)
    _check_dates(order_date, requested_delivery_date)

    prepared = []
    for index, item in enumerate(lines or [], start=1):
        product = _resolve_line_product(company, item["product_id"], index)
        _check_quantity(product, item["quantity"], index)
        prepared.append(
            SalesOrderLine(
                line_number=index,
                product=product,
                quantity=item["quantity"],
                unit_price=item["unit_price"],
                description=(item.get("description") or "").strip(),
                line_amount=_compute_line_amount(item["quantity"], item["unit_price"]),
                product_type_snapshot=_resolve_product_type(item.get("product_type_snapshot"), index),
                **_snapshot_fields(product),
            )
        )

    order = _create_header_with_unique_reference(
        company=company,
        actor=actor,
        customer=customer,
        order_date=order_date,
        requested_delivery_date=requested_delivery_date,
        planned_manufacturing_date=planned_manufacturing_date,
        customer_order_reference=(customer_order_reference or "").strip(),
        currency=currency,
        notes=notes or "",
    )
    for line in prepared:
        line.sales_order = order
    SalesOrderLine.objects.bulk_create(prepared)

    record(
        actor=actor,
        action="sales_order.created",
        target_type="sales_order",
        target_id=order.id,
        company=company,
        after={
            "reference": order.reference,
            "status": order.status,
            "currency": order.currency,
            **_header_snapshot(order),
            "lines": _so_line_snapshot_list(order.lines.all()),
        },
    )
    return order


@transaction.atomic
def update_sales_order(*, actor, sales_order_id, expected_version, data):
    """Same semantics as `update_quotation`: every key optional; `lines`,
    when present (even `[]`), is the complete final list - ids update,
    missing ids are removed, no id creates; unknown/foreign/duplicate ids
    are 400. New or changed lines need an active product and sales unit;
    unchanged lines referencing since-deactivated masters are preserved
    (and removable). Snapshots are captured only for new lines or product
    replacement. Locked, version-checked, DRAFT only; no-op writes
    nothing; header/lines/version/audit are atomic. `currency`/
    `company`/`reference`/`status` are never editable.
    """
    order = SalesOrder.objects.select_for_update().select_related("customer").get(pk=sales_order_id)
    if order.version != expected_version:
        raise Conflict("This sales order has changed since it was last read. Refetch and retry.")
    if order.status != SalesOrder.Status.DRAFT:
        raise DjangoValidationError({"detail": "Only a draft sales order can be edited."})

    company = order.company
    before_header = _header_snapshot(order)
    header_changed = False

    if "customer_id" in data and data["customer_id"] != order.customer_id:
        order.customer = _resolve_active_customer(company, data["customer_id"])
        header_changed = True
    if "order_date" in data and data["order_date"] != order.order_date:
        order.order_date = data["order_date"]
        header_changed = True
    if "requested_delivery_date" in data and data["requested_delivery_date"] != order.requested_delivery_date:
        order.requested_delivery_date = data["requested_delivery_date"]
        header_changed = True
    if "planned_manufacturing_date" in data and data["planned_manufacturing_date"] != order.planned_manufacturing_date:
        order.planned_manufacturing_date = data["planned_manufacturing_date"]
        header_changed = True
    if "customer_order_reference" in data:
        value = (data["customer_order_reference"] or "").strip()
        if value != order.customer_order_reference:
            order.customer_order_reference = value
            header_changed = True
    if "notes" in data:
        value = (data["notes"] or "").strip()
        if value != order.notes:
            order.notes = value
            header_changed = True
    _check_dates(order.order_date, order.requested_delivery_date)

    lines_changed = False
    before_lines = None
    kept = []
    new_lines = []
    removed_ids = set()
    if "lines" in data:
        existing = {line.id: line for line in order.lines.all()}
        before_lines = _so_line_snapshot_list(existing.values())
        seen_ids = set()
        for index, item in enumerate(data["lines"], start=1):
            line_id = item.get("id")
            if line_id is None:
                product = _resolve_line_product(company, item["product_id"], index)
                _check_quantity(product, item["quantity"], index)
                new_lines.append(
                    SalesOrderLine(
                        sales_order=order,
                        line_number=index,
                        product=product,
                        quantity=item["quantity"],
                        unit_price=item["unit_price"],
                        description=(item.get("description") or "").strip(),
                        line_amount=_compute_line_amount(item["quantity"], item["unit_price"]),
                        product_type_snapshot=_resolve_product_type(item.get("product_type_snapshot"), index),
                        **_snapshot_fields(product),
                    )
                )
                continue
            if line_id in seen_ids:
                raise DjangoValidationError({"lines": f"Line {line_id} appears more than once in this request."})
            seen_ids.add(line_id)
            line = existing.get(line_id)
            if line is None:
                raise DjangoValidationError({"lines": f"Line {line_id} does not belong to this sales order."})

            description = (item.get("description") or "").strip()
            type_value = (
                _resolve_product_type(item["product_type_snapshot"], index)
                if "product_type_snapshot" in item
                else line.product_type_snapshot
            )
            unchanged = (
                item["product_id"] == line.product_id
                and item["quantity"] == line.quantity
                and item["unit_price"] == line.unit_price
                and description == line.description
                and type_value == line.product_type_snapshot
            )
            if not unchanged:
                product = _resolve_line_product(company, item["product_id"], index)
                _check_quantity(product, item["quantity"], index)
                if product.id != line.product_id:
                    if line.store_preparations.exists():
                        raise DjangoValidationError(
                            {"lines": f"Line {line_id}: the product cannot be changed because store preparation is recorded for this line. Preparation is kept with its line and is never reassigned. Add a new line for the other product."}
                        )
                    line.product = product
                    for field, value in _snapshot_fields(product).items():
                        setattr(line, field, value)
                line.quantity = item["quantity"]
                line.unit_price = item["unit_price"]
                line.description = description
                line.product_type_snapshot = type_value
                line.line_amount = _compute_line_amount(line.quantity, line.unit_price)
            kept.append((line, index, not unchanged))

        removed_ids = set(existing) - seen_ids
        lines_changed = bool(removed_ids) or bool(new_lines) or any(
            changed or line.line_number != index for line, index, changed in kept
        )

    if not header_changed and not lines_changed:
        return order

    if lines_changed:
        if removed_ids:
            try:
                order.lines.filter(id__in=removed_ids).delete()
            except ProtectedError as e:
                if any(type(obj).__name__ == "StorePreparation" for obj in e.protected_objects):
                    raise DjangoValidationError(
                        {"lines": "A removed line has store preparation recorded against it. Preparation is kept with its order line, so that line cannot be removed."}
                    )
                referenced_lines = sorted({
                    obj.sales_order_line_id
                    for obj in e.protected_objects
                    if hasattr(obj, "sales_order_line_id")
                })
                if referenced_lines:
                    raise DjangoValidationError(
                        {"lines": f"Cannot remove line(s) {referenced_lines}: referenced by existing batch plan(s)."}
                    )
                raise DjangoValidationError(
                    {"lines": "One or more removed lines are referenced by existing records and cannot be deleted."}
                )
        moving = [line for line, index, _ in kept if line.line_number != index]
        if moving:
            for line in moving:
                line.line_number = _TEMP_LINE_NUMBER_OFFSET + line.id
            SalesOrderLine.objects.bulk_update(moving, ["line_number"])
        to_write = []
        for line, index, changed in kept:
            if changed or line.line_number != index:
                line.line_number = index
                to_write.append(line)
        if to_write:
            SalesOrderLine.objects.bulk_update(
                to_write,
                [
                    "line_number",
                    "product",
                    "quantity",
                    "unit_price",
                    "description",
                    "line_amount",
                    "product_code_snapshot",
                    "product_name_snapshot",
                    "sales_uom_code_snapshot",
                    "sales_uom_name_snapshot",
                    "product_type_snapshot",
                ],
            )
        if new_lines:
            SalesOrderLine.objects.bulk_create(new_lines)

    order.version += 1
    order.save(
        update_fields=[
            "customer",
            "order_date",
            "requested_delivery_date",
            "customer_order_reference",
            "notes",
            "version",
            "updated_at",
        ]
    )

    audit_before = dict(before_header)
    audit_after = _header_snapshot(order)
    if lines_changed:
        audit_before["lines"] = before_lines
        audit_after["lines"] = _so_line_snapshot_list(order.lines.all())

    record(
        actor=actor,
        action="sales_order.updated",
        target_type="sales_order",
        target_id=order.id,
        company=company,
        before=audit_before,
        after=audit_after,
    )
    return order


# ---------------------------------------------------------------------------
# Task 10F: confirmation policy configuration and DRAFT -> CONFIRMED
# ---------------------------------------------------------------------------

SALES_ORDERS_VIEW = "sales_orders.view"
SALES_ORDERS_CONFIRM = "sales_orders.confirm"


def _policy_values(policy):
    return {field: getattr(policy, field) for field in SalesOrderConfirmationPolicy.VALUE_FIELDS}


@transaction.atomic
def update_confirmation_policy(*, actor, company, expected_version, data):
    """Create or update a company's explicit confirmation policy (active-
    superuser configuration, enforced by the view). `expected_version` is 0
    when no policy row exists yet. Only the supplied values change; values
    never supplied stay `null` (unanswered) - nothing is defaulted. The row
    is locked while it is read and compared; a no-op writes nothing (no
    version bump, no audit). Creation racing another creation resolves to
    one winner and a `Conflict` for the other. Configuring a policy
    confers no confirmation authority.
    """
    policy = SalesOrderConfirmationPolicy.objects.select_for_update().filter(company=company).first()
    if policy is None:
        if expected_version != 0:
            raise Conflict("The confirmation policy has changed since it was last read. Refetch and retry.")
        if not data:
            raise DjangoValidationError({"detail": "Provide at least one policy value."})
        try:
            with transaction.atomic():
                policy = SalesOrderConfirmationPolicy.objects.create(
                    company=company, created_by=actor, updated_by=actor, **data
                )
        except IntegrityError as exc:
            raise Conflict("The confirmation policy has changed since it was last read. Refetch and retry.") from exc
        record(
            actor=actor,
            action="sales_order_confirmation_policy.created",
            target_type="sales_order_confirmation_policy",
            target_id=policy.id,
            company=company,
            after={"version": policy.version, **_policy_values(policy)},
        )
        return policy

    if policy.version != expected_version:
        raise Conflict("The confirmation policy has changed since it was last read. Refetch and retry.")
    changed = {field: value for field, value in data.items() if getattr(policy, field) != value}
    if not changed:
        return policy

    before = {"version": policy.version, **_policy_values(policy)}
    for field, value in changed.items():
        setattr(policy, field, value)
    policy.version += 1
    policy.updated_by = actor
    policy.save(update_fields=[*changed.keys(), "version", "updated_by", "updated_at"])
    record(
        actor=actor,
        action="sales_order_confirmation_policy.updated",
        target_type="sales_order_confirmation_policy",
        target_id=policy.id,
        company=company,
        before=before,
        after={"version": policy.version, **_policy_values(policy)},
    )
    return policy


def load_locked_confirmation_context(order):
    """Lock the referenced rows and return fresh (policy, customer, lines).

    LOCK ORDER (fixed, to be deadlock-free): the caller already holds the
    order row; then the company policy row; then the customer; then the
    products ascending by id; then their sales units ascending by id. All
    use `FOR NO KEY UPDATE`, which conflicts with the row-level `UPDATE`/
    `SELECT ... FOR UPDATE` every master-data mutation performs
    (`deactivate_customer`/`deactivate_product`/`update_*` lock only their
    own row; `deactivate_unit` takes no explicit lock but its UPDATE
    blocks on ours) yet does not block other drafts merely referencing the
    same rows. No master-data service ever locks an order, and each locks a
    single row, so no lock cycle is possible.

    GUARANTEE: while the confirming transaction is open, none of the
    referenced customer/products/sales units (nor the policy) can be
    changed or deactivated by another transaction; confirmation therefore
    decides against exactly the state that is committed with it. A
    deactivation that commits first is seen and blocks confirmation; one
    that arrives later simply waits, then applies to the now-confirmed
    order's masters (historical readability preserved by snapshots).
    Rows are re-read AFTER the locks are held, never reusing values loaded
    earlier.
    """
    policy = (
        SalesOrderConfirmationPolicy.objects.select_for_update(no_key=True).filter(company_id=order.company_id).first()
    )
    customer = Customer.objects.select_for_update(no_key=True).get(pk=order.customer_id)
    product_ids = sorted(set(order.lines.values_list("product_id", flat=True)))
    products = {
        product.id: product
        for product in Product.objects.select_for_update(no_key=True).filter(pk__in=product_ids).order_by("pk")
    }
    uom_ids = sorted({product.sales_uom_id for product in products.values()})
    uoms = {
        uom.id: uom for uom in UnitOfMeasure.objects.select_for_update(no_key=True).filter(pk__in=uom_ids).order_by("pk")
    }
    lines = list(order.lines.order_by("line_number", "id"))
    for line in lines:
        line.product = products[line.product_id]
        line.product.sales_uom = uoms[line.product.sales_uom_id]
    return policy, customer, lines


@transaction.atomic
def confirm_sales_order(*, actor, company_id, sales_order_id, expected_version):
    """DRAFT -> CONFIRMED, atomically.

    1. Lock the order (the same lock every draft edit takes, so confirm and
       edit serialize: whichever commits first makes the other fail with a
       409 on `expected_version`, never a partial/lost update).
    2. Re-check access after the lock (active membership, `sales_orders.
       view`, `sales_orders.confirm`) - authority is decided under the lock,
       not only at request entry.
    3. Stale `expected_version` -> 409 (first, like every other command). A
       repeat at the CURRENT version of an already-CONFIRMED order is an
       idempotent no-op for a still-authorized user: no new timestamp,
       version or audit event.
    4. Lock policy/customer/products/units and re-read them (see
       `load_locked_confirmation_context`), assess with the SAME function
       the preview uses; any blocking reason -> structured 400
       (`ConfirmationBlocked`) and nothing is written.
    5. Set status/confirmed_by/confirmed_at, record the policy values/
       version used, increment `version` and write the audit event in the
       same transaction (an audit failure rolls everything back).
    Line rows and their snapshots are never touched. Confirmation creates no
    stock reservation, batch, invoice or production record.
    """
    order = get_object_or_404(SalesOrder.objects.select_for_update(), pk=sales_order_id, company_id=company_id)
    company = order.company

    if not active_companies_for_user(actor).filter(pk=company.id).exists():
        raise exceptions.NotFound("Company not found.")
    missing = [
        code for code in (SALES_ORDERS_VIEW, SALES_ORDERS_CONFIRM) if not user_has_permission(actor, company, code)
    ]
    if missing:
        raise Forbidden(f"The following permission(s) are required: {', '.join(missing)}.")

    if order.version != expected_version:
        raise Conflict("This sales order has changed since it was last read. Refetch and retry.")
    if order.status == SalesOrder.Status.CONFIRMED:
        return order

    policy, customer, lines = load_locked_confirmation_context(order)
    today = business_today()
    assessment = assess_confirmation(order, customer, lines, policy, actor=actor, today=today)
    if assessment["blocking_reasons"]:
        not_configured = any(r["category"] == "POLICY_NOT_CONFIGURED" for r in assessment["blocking_reasons"])
        raise ConfirmationBlocked(
            {
                "code": "confirmation_policy_not_configured" if not_configured else "confirmation_blocked",
                "detail": POLICY_NOT_CONFIGURED_MESSAGE if not_configured else "The order cannot be confirmed.",
                "blocking_reasons": assessment["blocking_reasons"],
            }
        )

    snapshot = policy_snapshot(policy, today)
    order.status = SalesOrder.Status.CONFIRMED
    order.confirmed_by = actor
    order.confirmed_at = timezone.now()
    order.confirmation_policy_version = policy.version
    order.confirmation_policy_snapshot = snapshot
    order.version += 1
    order.save(
        update_fields=[
            "status",
            "confirmed_by",
            "confirmed_at",
            "confirmation_policy_version",
            "confirmation_policy_snapshot",
            "version",
            "updated_at",
        ]
    )
    record(
        actor=actor,
        action="sales_order.confirmed",
        target_type="sales_order",
        target_id=order.id,
        company=company,
        before={"status": SalesOrder.Status.DRAFT},
        after={
            "status": order.status,
            "confirmed_by_id": actor.id,
            "confirmed_at": order.confirmed_at.isoformat(),
            "policy": snapshot,
        },
    )
    return order


SALES_ORDERS_DELETE = "sales_orders.delete"


@transaction.atomic
def delete_sales_order(*, actor, company, sales_order_id, expected_version):
    """Permanently delete a DRAFT sales order that has no batch plans. Locked
    and version-checked; the deletion and its audit record commit together.
    Confirmed orders are never deleted here, and an order with batch plans
    must have those plans removed first.
    """
    from apps.batch_plans.models import BatchPlan

    order = SalesOrder.objects.select_for_update().filter(pk=sales_order_id, company=company).first()
    if order is None:
        raise exceptions.NotFound("Sales order not found in this company.")
    if order.version != expected_version:
        raise Conflict("This sales order has changed since it was last read. Refetch and retry.")
    if order.status != SalesOrder.Status.DRAFT:
        raise DjangoValidationError({"detail": "Only a draft sales order can be deleted."})
    if BatchPlan.objects.filter(sales_order_line__sales_order=order).exists():
        raise DjangoValidationError({"detail": "This order has batch plans. Remove them before deleting the order."})
    # Store preparation is protected (PROTECT) on its order line, and the store
    # team owns it. A draft with such a record is refused, never cascaded.
    from apps.store_preparation.models import StorePreparation

    if StorePreparation.objects.filter(sales_order_line__sales_order=order).exists():
        raise DjangoValidationError(
            {"detail": "This order has store preparation records, so it cannot be deleted. Store preparation is kept as recorded by the store team."}
        )

    before = {
        "reference": order.reference,
        **_header_snapshot(order),
        "lines": _so_line_snapshot_list(order.lines.all()),
    }
    record(
        actor=actor,
        action="sales_order.deleted",
        target_type="sales_order",
        target_id=order.id,
        company=company,
        before=before,
        after=None,
    )
    try:
        order.delete()
    except ProtectedError as exc:
        # Any other protected link that appears later is still refused as JSON, never a 500.
        raise DjangoValidationError({"detail": "This order is linked to other records, so it cannot be deleted."}) from exc
