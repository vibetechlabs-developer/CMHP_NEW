import secrets
from decimal import ROUND_HALF_UP, Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone

from apps.audit.services import record
from apps.catalog.models import UnitOfMeasure
from apps.common.errors import Conflict
from apps.customers.models import Customer
from apps.products.models import Product
from apps.quotations.models import Quotation, QuotationLine

_REFERENCE_MAX_ATTEMPTS = 5
_LINE_AMOUNT_QUANTIZE = Decimal("0.01")
# QuotationLine.line_amount is max_digits=16, decimal_places=2 - reject
# anything that would overflow it as a 400 instead of a database error.
_LINE_AMOUNT_LIMIT = Decimal("10") ** 14
_TEMP_LINE_NUMBER_OFFSET = 1_000_000


def _generate_reference():
    """Technical working default, NOT client-confirmed numbering: a date
    stamp plus 10 hex characters of cryptographic randomness, `QT-`
    prefixed so it is never confused with `PR-`/`PO-`/`GR-`/`QC-`. Never
    `count() + 1` - that breaks the moment two quotations are created
    concurrently. Uniqueness is enforced per company by a database
    constraint; a collision (astronomically unlikely) is retried.
    """
    date_part = timezone.now().strftime("%Y%m%d")
    return f"QT-{date_part}-{secrets.token_hex(5).upper()}"


def _compute_line_amount(quantity, unit_price):
    """Decimal only, never float: quantity (3 dp) * unit_price (4 dp)
    quantized to 2 dp with ROUND_HALF_UP - the same convention as
    apps.purchasing.services._compute_line_amount. Pre-tax amount only.
    """
    amount = (quantity * unit_price).quantize(_LINE_AMOUNT_QUANTIZE, rounding=ROUND_HALF_UP)
    if amount >= _LINE_AMOUNT_LIMIT:
        raise DjangoValidationError({"lines": "A line amount is too large."})
    return amount


def _normalize_currency(currency):
    code = (currency or "").strip().upper()
    if not code:
        raise DjangoValidationError({"currency": "Currency is required."})
    if len(code) != 3 or not code.isalpha():
        raise DjangoValidationError({"currency": "Currency must be exactly three letters (e.g. INR, USD)."})
    return code


def _resolve_active_customer(company, customer_id):
    """Unknown id and other-company id fold into the same 404."""
    customer = get_object_or_404(Customer, pk=customer_id, company=company)
    if not customer.is_active:
        raise DjangoValidationError({"customer_id": f"Customer '{customer.code}' is inactive."})
    return customer


def _resolve_line_product(company, product_id, index):
    """For a NEW or CHANGED line only: the product must belong to the
    company (404 otherwise), be active, and so must its sales unit.
    """
    product = get_object_or_404(Product.objects.select_related("sales_uom"), pk=product_id, company=company)
    if not product.is_active:
        raise DjangoValidationError({"lines": f"Line {index}: product '{product.code}' is inactive."})
    if not product.sales_uom.is_active:
        raise DjangoValidationError(
            {"lines": f"Line {index}: sales unit '{product.sales_uom.code}' of product '{product.code}' is inactive."}
        )
    return product


def _check_quantity(product, quantity, index):
    if product.sales_uom.dimension == UnitOfMeasure.Dimension.COUNT and quantity % 1 != 0:
        raise DjangoValidationError(
            {
                "lines": (
                    f"Line {index}: '{product.sales_uom.code}' is a COUNT unit and does not accept a "
                    "fractional quantity."
                )
            }
        )


def _snapshot_fields(product):
    return {
        "product_code_snapshot": product.code,
        "product_name_snapshot": product.name,
        "sales_uom_code_snapshot": product.sales_uom.code,
        "sales_uom_name_snapshot": product.sales_uom.name,
    }


def _header_snapshot(quotation):
    return {
        "customer_id": quotation.customer_id,
        "quotation_date": quotation.quotation_date.isoformat(),
        "valid_until": quotation.valid_until.isoformat() if quotation.valid_until else None,
        "notes": quotation.notes,
    }


def _line_snapshot_list(lines):
    return [
        {
            "id": line.id,
            "line_number": line.line_number,
            "product_id": line.product_id,
            "product_code_snapshot": line.product_code_snapshot,
            "quantity": str(line.quantity),
            "unit_price": str(line.unit_price),
            "description": line.description,
            "line_amount": str(line.line_amount),
        }
        for line in sorted(lines, key=lambda line: (line.line_number, line.id))
    ]


def _create_header_with_unique_reference(*, company, actor, customer, quotation_date, valid_until, currency, notes):
    for _ in range(_REFERENCE_MAX_ATTEMPTS):
        try:
            with transaction.atomic():
                quotation = Quotation(
                    company=company,
                    reference=_generate_reference(),
                    customer=customer,
                    quotation_date=quotation_date,
                    valid_until=valid_until,
                    currency=currency,
                    notes=notes,
                    created_by=actor,
                )
                quotation.save()
                return quotation
        except IntegrityError as exc:
            constraint_name = getattr(getattr(exc.__cause__, "diag", None), "constraint_name", "") or ""
            if "unique_quotation_company_reference" in constraint_name:
                continue
            raise
    raise RuntimeError("Could not generate a unique quotation reference after several attempts.")


@transaction.atomic
def create_quotation(*, actor, company, customer_id, quotation_date, currency, valid_until=None, notes="", lines=None):
    """Always `DRAFT`, `version=1`. An empty/omitted `lines` list is fine,
    and so is a zero `unit_price`. `company` comes from the URL. Every
    line's product and sales unit must be active and belong to `company`;
    the customer must be active and belong to `company`.
    """
    currency = _normalize_currency(currency)
    customer = _resolve_active_customer(company, customer_id)
    if valid_until is not None and valid_until < quotation_date:
        raise DjangoValidationError({"valid_until": "Valid-until date cannot precede the quotation date."})

    prepared = []
    for index, item in enumerate(lines or [], start=1):
        product = _resolve_line_product(company, item["product_id"], index)
        _check_quantity(product, item["quantity"], index)
        prepared.append(
            QuotationLine(
                line_number=index,
                product=product,
                quantity=item["quantity"],
                unit_price=item["unit_price"],
                description=(item.get("description") or "").strip(),
                line_amount=_compute_line_amount(item["quantity"], item["unit_price"]),
                **_snapshot_fields(product),
            )
        )

    quotation = _create_header_with_unique_reference(
        company=company,
        actor=actor,
        customer=customer,
        quotation_date=quotation_date,
        valid_until=valid_until,
        currency=currency,
        notes=notes or "",
    )
    for line in prepared:
        line.quotation = quotation
    QuotationLine.objects.bulk_create(prepared)

    record(
        actor=actor,
        action="quotation.created",
        target_type="quotation",
        target_id=quotation.id,
        company=company,
        after={
            "reference": quotation.reference,
            "status": quotation.status,
            "currency": quotation.currency,
            **_header_snapshot(quotation),
            "lines": _line_snapshot_list(quotation.lines.all()),
        },
    )
    return quotation


@transaction.atomic
def update_quotation(*, actor, quotation_id, expected_version, data):
    """`data` may contain `customer_id`/`quotation_date`/`valid_until`/
    `notes`/`lines`, each independently optional (omitted = unchanged).
    `currency`/`company`/`reference`/`status` are never accepted.

    `lines`, if present at all (even `[]`), is the AUTHORITATIVE final
    line list: an entry with an `id` refers to an existing line of this
    quotation (unknown/foreign or repeated ids are 400); an entry without
    `id` is a new line; an existing line whose id is absent is removed.
    `line_number` is reassigned 1..N from the submitted order.

    Reference validation applies only to NEW or CHANGED lines: an existing
    line whose product, quantity, unit_price and description are all
    unchanged is kept untouched even if its product or sales unit has
    since been deactivated (historical drafts stay editable in other
    respects, and removable). A changed line - including one that only
    changes quantity - must reference an active product with an active
    sales unit. Stored snapshots are refreshed only when a line is new or
    its product is replaced; never otherwise, and the unit is never
    silently swapped.

    Row-locked, `expected_version`-checked, DRAFT only. A PATCH that
    changes nothing writes nothing: no version bump, no audit entry.
    Header, lines, amounts, version and audit commit atomically.
    """
    quotation = Quotation.objects.select_for_update().select_related("customer").get(pk=quotation_id)
    if quotation.version != expected_version:
        raise Conflict("This quotation has changed since it was last read. Refetch and retry.")
    if quotation.status != Quotation.Status.DRAFT:
        raise DjangoValidationError({"detail": "Only a draft quotation can be edited."})

    company = quotation.company
    before_header = _header_snapshot(quotation)
    header_changed = False

    if "customer_id" in data and data["customer_id"] != quotation.customer_id:
        quotation.customer = _resolve_active_customer(company, data["customer_id"])
        header_changed = True
    if "quotation_date" in data and data["quotation_date"] != quotation.quotation_date:
        quotation.quotation_date = data["quotation_date"]
        header_changed = True
    if "valid_until" in data and data["valid_until"] != quotation.valid_until:
        quotation.valid_until = data["valid_until"]
        header_changed = True
    if "notes" in data:
        new_notes = (data["notes"] or "").strip()
        if new_notes != quotation.notes:
            quotation.notes = new_notes
            header_changed = True
    if quotation.valid_until is not None and quotation.valid_until < quotation.quotation_date:
        raise DjangoValidationError({"valid_until": "Valid-until date cannot precede the quotation date."})

    lines_changed = False
    before_lines = None
    kept = []
    new_lines = []
    removed_ids = set()
    if "lines" in data:
        existing = {line.id: line for line in quotation.lines.all()}
        before_lines = _line_snapshot_list(existing.values())
        seen_ids = set()
        for index, item in enumerate(data["lines"], start=1):
            line_id = item.get("id")
            if line_id is None:
                product = _resolve_line_product(company, item["product_id"], index)
                _check_quantity(product, item["quantity"], index)
                new_lines.append(
                    QuotationLine(
                        quotation=quotation,
                        line_number=index,
                        product=product,
                        quantity=item["quantity"],
                        unit_price=item["unit_price"],
                        description=(item.get("description") or "").strip(),
                        line_amount=_compute_line_amount(item["quantity"], item["unit_price"]),
                        **_snapshot_fields(product),
                    )
                )
                continue
            if line_id in seen_ids:
                raise DjangoValidationError({"lines": f"Line {line_id} appears more than once in this request."})
            seen_ids.add(line_id)
            line = existing.get(line_id)
            if line is None:
                raise DjangoValidationError({"lines": f"Line {line_id} does not belong to this quotation."})

            description = (item.get("description") or "").strip()
            unchanged = (
                item["product_id"] == line.product_id
                and item["quantity"] == line.quantity
                and item["unit_price"] == line.unit_price
                and description == line.description
            )
            if not unchanged:
                product = _resolve_line_product(company, item["product_id"], index)
                _check_quantity(product, item["quantity"], index)
                if product.id != line.product_id:
                    line.product = product
                    for field, value in _snapshot_fields(product).items():
                        setattr(line, field, value)
                line.quantity = item["quantity"]
                line.unit_price = item["unit_price"]
                line.description = description
                line.line_amount = _compute_line_amount(line.quantity, line.unit_price)
            kept.append((line, index, not unchanged))

        removed_ids = set(existing) - seen_ids
        lines_changed = bool(removed_ids) or bool(new_lines) or any(
            changed or line.line_number != index for line, index, changed in kept
        )

    if not header_changed and not lines_changed:
        return quotation

    if lines_changed:
        if removed_ids:
            quotation.lines.filter(id__in=removed_ids).delete()
        moving = [line for line, index, _ in kept if line.line_number != index]
        if moving:
            temp = []
            for line in moving:
                original = line.line_number
                line.line_number = _TEMP_LINE_NUMBER_OFFSET + line.id
                temp.append((line, original))
            QuotationLine.objects.bulk_update([line for line, _ in temp], ["line_number"])
        to_write = []
        for line, index, changed in kept:
            if changed or line.line_number != index:
                line.line_number = index
                to_write.append(line)
        if to_write:
            QuotationLine.objects.bulk_update(
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
                ],
            )
        if new_lines:
            QuotationLine.objects.bulk_create(new_lines)

    quotation.version += 1
    quotation.save(update_fields=["customer", "quotation_date", "valid_until", "notes", "version", "updated_at"])

    audit_before = dict(before_header)
    audit_after = _header_snapshot(quotation)
    if lines_changed:
        audit_before["lines"] = before_lines
        audit_after["lines"] = _line_snapshot_list(quotation.lines.all())

    record(
        actor=actor,
        action="quotation.updated",
        target_type="quotation",
        target_id=quotation.id,
        company=company,
        before=audit_before,
        after=audit_after,
    )
    return quotation
