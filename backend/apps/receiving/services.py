import secrets
from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.db.models import Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone

from apps.audit.services import record
from apps.catalog.models import Material
from apps.common.errors import Conflict
from apps.companies.models import Company
from apps.companies.services import active_companies_for_user
from apps.permissions.services import user_has_permission
from apps.purchasing.models import PurchaseOrder, PurchaseOrderIssueLineSnapshot, PurchaseOrderIssueSnapshot
from apps.receiving.models import GoodsReceipt, GoodsReceiptLine, ContainerType
from apps.stock_movements.services import create_receipt_in_movements

_REFERENCE_MAX_ATTEMPTS = 5

# Physical delivery progress states (see delivery_progress_for_purchase_
# order) - deliberately not a model field/TextChoices, since nothing
# stores this: it is always computed fresh from POSTED GoodsReceiptLine
# rows, never persisted, and is explicitly independent of both
# PurchaseOrder.status and any future QC concept.
NOT_RECEIVED = "NOT_RECEIVED"
PARTIALLY_RECEIVED = "PARTIALLY_RECEIVED"
FULLY_RECEIVED = "FULLY_RECEIVED"


def _generate_reference():
    """Mirrors apps.purchasing.services._generate_reference exactly -
    same collision-safety/legibility reasoning, `GR-` prefix so this
    document type is never visually confused with a `PR-`/`PO-`.
    """
    date_part = timezone.now().strftime("%Y%m%d")
    suffix = secrets.token_hex(5).upper()
    return f"GR-{date_part}-{suffix}"


def _validate_lines(purchase_order, lines_data):
    """Resolves and fully validates a proposed list of receipt lines
    against `purchase_order`'s own issue-time line snapshots - without
    creating or modifying any row. Raises (and changes nothing) on an
    unknown/foreign `source_po_line_id` or a non-positive
    `received_quantity`. Deliberately does NOT check remaining-quantity
    here - that is a posting-time-only rule (see post_goods_receipt),
    not a draft create/edit rule, mirroring how PurchaseRequest's own
    active-material check only applies at submit, not at draft save.

    Assumes the caller has already confirmed `purchase_order.status ==
    ISSUED` (so `purchase_order.issue_snapshot` is guaranteed to exist).
    """
    valid_lines_by_id = {line.id: line for line in purchase_order.issue_snapshot.lines.select_related(
        "purchase_order_line__material", "purchase_order_line__unit"
    )}

    resolved = []
    for index, line in enumerate(lines_data, start=1):
        source_po_line_id = line["source_po_line_id"]
        source_po_line = valid_lines_by_id.get(source_po_line_id)
        if source_po_line is None:
            raise DjangoValidationError(
                {
                    "lines": (
                        f"Line {index}: source_po_line_id {source_po_line_id} does not belong to this "
                        "purchase order's issued lines."
                    )
                }
            )
        quantity = line["received_quantity"]
        if quantity is None or quantity <= 0:
            raise DjangoValidationError({"lines": f"Line {index}: received_quantity must be greater than zero."})

        # Optional container fields
        container_type_id = line.get("container_type_id")
        container_quantity = line.get("container_quantity")
        container_type_obj = None
        if container_type_id is not None:
            try:
                container_type_obj = ContainerType.objects.get(id=container_type_id)
            except ContainerType.DoesNotExist:
                raise DjangoValidationError({"lines": f"Line {index}: container_type_id {container_type_id} does not exist."})
            if not container_type_obj.is_active:
                raise DjangoValidationError({"lines": f"Line {index}: container type {container_type_obj.code} is inactive."})
        if container_quantity is not None and container_quantity <= 0:
            raise DjangoValidationError({"lines": f"Line {index}: container_quantity must be positive if provided."})

        po_line = source_po_line.purchase_order_line
        resolved.append(
            {
                "line_number": index,
                "source_po_line": source_po_line,
                "material": po_line.material,
                "unit": po_line.unit,
                "received_quantity": quantity,
                "lot_reference": (line.get("lot_reference") or "").strip(),
                "material_code_snapshot": source_po_line.material_code_snapshot,
                "material_name_snapshot": source_po_line.material_name_snapshot,
                "unit_code_snapshot": source_po_line.unit_code_snapshot,
                "unit_name_snapshot": source_po_line.unit_name_snapshot,
                "container_type": container_type_obj,
                "container_quantity": container_quantity,
            }
        )
    return resolved


def _validate_manual_lines(lines_data):
    """MANUAL ENTRY MODE counterpart of _validate_lines (added after Task
    09A) - no PurchaseOrder exists to validate against. Each line names
    a real, active apps.catalog.Material directly (never free text,
    never caller-chosen - `unit` is always that material's own base
    unit, the same "no caller-chosen unit" convention apps.
    stock_movements.services.create_material_issue already uses) and may
    carry its own `unit_price`/`currency_code` - the only place this app
    ever accepts a caller-supplied price. Deliberately does NOT check
    any "remaining quantity" here or at posting time (see
    post_goods_receipt) - there is no ordered quantity to check against,
    a genuine, disclosed relaxation of the PO path's over-receipt guard.
    """
    resolved = []
    for index, line in enumerate(lines_data, start=1):
        material_id = line.get("material_id")
        if material_id is None:
            raise DjangoValidationError({"lines": f"Line {index}: material_id is required for a manual entry line."})
        try:
            material = Material.objects.select_related("base_unit").get(pk=material_id)
        except Material.DoesNotExist:
            raise DjangoValidationError({"lines": f"Line {index}: material_id {material_id} does not exist."})
        if not material.is_active:
            raise DjangoValidationError({"lines": f"Line {index}: material '{material.code}' is inactive."})

        quantity = line.get("received_quantity")
        if quantity is None or quantity <= 0:
            raise DjangoValidationError({"lines": f"Line {index}: received_quantity must be greater than zero."})

        unit_price = line.get("unit_price")
        if unit_price is not None and unit_price <= 0:
            raise DjangoValidationError({"lines": f"Line {index}: unit_price must be greater than zero if given."})
        currency_code = (line.get("currency_code") or "").strip().upper()

        container_type_id = line.get("container_type_id")
        container_quantity = line.get("container_quantity")
        container_type_obj = None
        if container_type_id is not None:
            try:
                container_type_obj = ContainerType.objects.get(id=container_type_id)
            except ContainerType.DoesNotExist:
                raise DjangoValidationError({"lines": f"Line {index}: container_type_id {container_type_id} does not exist."})
            if not container_type_obj.is_active:
                raise DjangoValidationError({"lines": f"Line {index}: container type {container_type_obj.code} is inactive."})
        if container_quantity is not None and container_quantity <= 0:
            raise DjangoValidationError({"lines": f"Line {index}: container_quantity must be positive if provided."})

        resolved.append(
            {
                "line_number": index,
                "source_po_line": None,
                "material": material,
                "unit": material.base_unit,
                "received_quantity": quantity,
                "lot_reference": (line.get("lot_reference") or "").strip(),
                "material_code_snapshot": material.code,
                "material_name_snapshot": material.name,
                "unit_code_snapshot": material.base_unit.code,
                "unit_name_snapshot": material.base_unit.name,
                "container_type": container_type_obj,
                "container_quantity": container_quantity,
                "unit_price": unit_price,
                "currency_code": currency_code,
            }
        )
    return resolved


def _create_lines(goods_receipt, resolved_lines):
    GoodsReceiptLine.objects.bulk_create(
        [
            GoodsReceiptLine(
                goods_receipt=goods_receipt,
                line_number=item["line_number"],
                source_po_line=item.get("source_po_line"),
                material=item["material"],
                unit=item["unit"],
                received_quantity=item["received_quantity"],
                lot_reference=item["lot_reference"],
                material_code_snapshot=item["material_code_snapshot"],
                material_name_snapshot=item["material_name_snapshot"],
                unit_code_snapshot=item["unit_code_snapshot"],
                unit_name_snapshot=item["unit_name_snapshot"],
                container_type=item.get("container_type"),
                container_quantity=item.get("container_quantity"),
                unit_price=item.get("unit_price"),
                currency_code=item.get("currency_code") or "",
            )
            for item in resolved_lines
        ]
    )


def _header_snapshot(goods_receipt):
    return {
        "arrived_at": goods_receipt.arrived_at.isoformat() if goods_receipt.arrived_at else None,
        "supplier_invoice_reference": goods_receipt.supplier_invoice_reference,
        "delivery_note_reference": goods_receipt.delivery_note_reference,
        "notes": goods_receipt.notes,
        "supplier_name": goods_receipt.supplier_name,
    }


def _line_snapshot_list(goods_receipt):
    return [
        {
            "source_po_line_id": line.source_po_line_id,
            "material_id": line.material_id,
            "received_quantity": str(line.received_quantity),
            "lot_reference": line.lot_reference,
            "container_type_id": line.container_type_id,
            "container_quantity": line.container_quantity,
            "unit_price": str(line.unit_price) if line.unit_price is not None else None,
            "currency_code": line.currency_code,
        }
        for line in goods_receipt.lines.order_by("line_number", "id")
    ]


def _line_snapshot_from_resolved(resolved_lines):
    """Same shape as _line_snapshot_list, built from resolved (not yet
    persisted) line dicts - used to compare a proposed idempotent-retry
    create against an existing row before writing anything.
    """
    return [
        {
            "source_po_line_id": item["source_po_line"].id if item.get("source_po_line") else None,
            "material_id": item["material"].id,
            "received_quantity": str(item["received_quantity"]),
            "lot_reference": item["lot_reference"],
            "container_type_id": item["container_type"].id if item.get("container_type") else None,
            "container_quantity": item.get("container_quantity"),
            "unit_price": str(item["unit_price"]) if item.get("unit_price") is not None else None,
            "currency_code": item.get("currency_code") or "",
        }
        for item in resolved_lines
    ]


def _create_header_with_unique_reference(
    *,
    store,
    company,
    actor,
    source_purchase_order,
    supplier_name,
    arrived_at,
    supplier_invoice_reference,
    delivery_note_reference,
    notes,
    idempotency_key,
):
    """Retries on the extremely unlikely event of a reference collision -
    mirrors apps.purchasing.services._create_header_with_unique_reference
    exactly. A collision on `idempotency_key` instead (a genuine
    concurrent race: another request created a row with the same key
    between create_goods_receipt's own pre-check and this insert) is
    distinguished by inspecting the failed constraint's name and raised
    as a `Conflict` immediately, never retried with a fresh reference -
    retrying would only exhaust the attempt budget without ever
    resolving the actual collision.
    """
    for _ in range(_REFERENCE_MAX_ATTEMPTS):
        try:
            with transaction.atomic():
                goods_receipt = GoodsReceipt(
                    store=store,
                    company=company,
                    source_purchase_order=source_purchase_order,
                    supplier_name=supplier_name,
                    reference=_generate_reference(),
                    arrived_at=arrived_at,
                    supplier_invoice_reference=supplier_invoice_reference,
                    delivery_note_reference=delivery_note_reference,
                    notes=notes,
                    idempotency_key=idempotency_key,
                    created_by=actor,
                )
                goods_receipt.save()
                return goods_receipt
        except IntegrityError as exc:
            constraint_name = getattr(getattr(exc.__cause__, "diag", None), "constraint_name", "") or ""
            if "idempotency_key" in constraint_name:
                raise Conflict(
                    "A goods receipt with this idempotency_key was just created concurrently. "
                    "Retry the same request to see the existing result."
                ) from exc
            continue
    raise RuntimeError("Could not generate a unique goods receipt reference after several attempts.")


@transaction.atomic
def create_goods_receipt(
    *,
    actor,
    store,
    source_purchase_order_id=None,
    company_id=None,
    supplier_name="",
    arrived_at,
    supplier_invoice_reference="",
    delivery_note_reference="",
    notes="",
    idempotency_key="",
    lines=None,
):
    """Creates a `DRAFT` GoodsReceipt at `store`, in one of two mutually
    exclusive modes:

    - PO-BASED (give `source_purchase_order_id`, the original Task 09A
      path, unchanged): against an already-`ISSUED` PurchaseOrder;
      `company` is always `source_purchase_order.company` - never
      independently accepted; every line names a `source_po_line_id`
      and derives material/unit/price from it, never a caller-supplied
      price (see _validate_lines). `supplier_name` is ignored for this
      path - supplier is always shown via the PO relation instead.

    - MANUAL ENTRY MODE (give `company_id` instead, added after Task
      09A - see GoodsReceipt.supplier_name's own docstring for why):
      no PurchaseOrder exists, so the caller names the company directly
      and may give a free-text `supplier_name`; every line names a real
      `material_id` directly and may carry its own `unit_price`/
      `currency_code` - the only path on which this app ever accepts a
      caller-supplied price. No over-receipt check applies (see
      post_goods_receipt) - there is nothing to check it against.

    An empty `lines` list is accepted either way, mirroring
    PurchaseRequest's own "empty draft is valid" rule - completeness is
    enforced only at posting (see post_goods_receipt).

    Idempotency: if `idempotency_key` is non-blank and a GoodsReceipt
    with that exact key already exists, this is a safe retry - if the
    proposed content matches the existing row exactly, that row is
    returned unchanged (no new row, no new audit entry); if it differs
    in any way, this is a `409 Conflict` - the caller's retry does not
    actually match what it claims to be retrying, so silently creating a
    second document or silently returning the mismatched existing one
    would both be wrong.
    """
    idempotency_key = (idempotency_key or "").strip()
    supplier_invoice_reference = (supplier_invoice_reference or "").strip()
    delivery_note_reference = (delivery_note_reference or "").strip()
    notes = notes or ""
    lines = lines or []

    if source_purchase_order_id is not None:
        purchase_order = get_object_or_404(
            PurchaseOrder.objects.select_related("company", "issue_snapshot"), pk=source_purchase_order_id
        )
        if purchase_order.status != PurchaseOrder.Status.ISSUED:
            raise DjangoValidationError({"detail": "Only an ISSUED purchase order can receive a goods receipt."})
        company = purchase_order.company
        supplier_name = ""
        resolved_lines = _validate_lines(purchase_order, lines)
    else:
        company = get_object_or_404(Company, pk=company_id)
        purchase_order = None
        supplier_name = (supplier_name or "").strip()
        resolved_lines = _validate_manual_lines(lines)

    if idempotency_key:
        existing = GoodsReceipt.objects.filter(idempotency_key=idempotency_key).first()
        if existing is not None:
            proposed = {
                "store_id": store.id,
                "source_purchase_order_id": purchase_order.id if purchase_order else None,
                "company_id": company.id,
                "supplier_name": supplier_name,
                "arrived_at": arrived_at,
                "supplier_invoice_reference": supplier_invoice_reference,
                "delivery_note_reference": delivery_note_reference,
                "notes": notes,
                "lines": _line_snapshot_from_resolved(resolved_lines),
            }
            actual = {
                "store_id": existing.store_id,
                "source_purchase_order_id": existing.source_purchase_order_id,
                "company_id": existing.company_id,
                "supplier_name": existing.supplier_name,
                "arrived_at": existing.arrived_at,
                "supplier_invoice_reference": existing.supplier_invoice_reference,
                "delivery_note_reference": existing.delivery_note_reference,
                "notes": existing.notes,
                "lines": _line_snapshot_list(existing),
            }
            if proposed == actual:
                return existing
            raise Conflict(
                "This idempotency_key was already used to create a different goods receipt. "
                "Use a new key, or refetch and confirm the existing one."
            )

    goods_receipt = _create_header_with_unique_reference(
        store=store,
        company=company,
        actor=actor,
        source_purchase_order=purchase_order,
        supplier_name=supplier_name,
        arrived_at=arrived_at,
        supplier_invoice_reference=supplier_invoice_reference,
        delivery_note_reference=delivery_note_reference,
        notes=notes,
        idempotency_key=idempotency_key,
    )
    _create_lines(goods_receipt, resolved_lines)

    record(
        actor=actor,
        action="goods_receipt.created",
        target_type="goods_receipt",
        target_id=goods_receipt.id,
        company=goods_receipt.company,
        store=goods_receipt.store,
        after={
            "reference": goods_receipt.reference,
            "status": goods_receipt.status,
            "source_purchase_order_id": purchase_order.id if purchase_order else None,
            **_header_snapshot(goods_receipt),
            "lines": _line_snapshot_list(goods_receipt),
        },
    )
    return goods_receipt


@transaction.atomic
def update_goods_receipt(*, actor, goods_receipt_id, expected_version, data):
    """`data` may contain `arrived_at`/`delivery_note_reference`/`notes`/
    `lines`, each independently optional (omitted = unchanged). `lines`,
    if present at all - even as an empty list - fully replaces the
    existing line set, mirroring update_purchase_request's convention
    (not PurchaseOrderLine's narrower single-field-edit convention - a
    GoodsReceipt's lines are still being composed at DRAFT stage, unlike
    a PurchaseOrderLine's already-fixed identity).

    DRAFT only (`400` otherwise). Requires the row lock
    (`select_for_update`) and the caller's `expected_version` to match
    before anything is read for comparison - same Conflict-on-mismatch
    rule as every other mutation in this project. A no-op PATCH (every
    supplied value already matches) does not increment `version` or
    write an audit entry.
    """
    goods_receipt = GoodsReceipt.objects.select_for_update().get(pk=goods_receipt_id)
    if goods_receipt.version != expected_version:
        raise Conflict("This goods receipt has changed since it was last read. Refetch and retry.")
    if goods_receipt.status != GoodsReceipt.Status.DRAFT:
        raise DjangoValidationError({"detail": "Only a draft goods receipt can be edited."})

    # PO-based vs MANUAL ENTRY MODE - whichever this receipt already is
    # (fixed at creation, never changeable on update - see GoodsReceipt.
    # clean()'s own "source purchase order cannot be changed" rule).
    purchase_order = None
    if goods_receipt.source_purchase_order_id is not None:
        purchase_order = PurchaseOrder.objects.select_related("issue_snapshot").get(
            pk=goods_receipt.source_purchase_order_id
        )

    before_header = _header_snapshot(goods_receipt)
    header_changed = False
    if "arrived_at" in data and data["arrived_at"] != goods_receipt.arrived_at:
        goods_receipt.arrived_at = data["arrived_at"]
        header_changed = True
    if (
        "supplier_invoice_reference" in data
        and data["supplier_invoice_reference"] != goods_receipt.supplier_invoice_reference
    ):
        goods_receipt.supplier_invoice_reference = data["supplier_invoice_reference"]
        header_changed = True
    if (
        "delivery_note_reference" in data
        and data["delivery_note_reference"] != goods_receipt.delivery_note_reference
    ):
        goods_receipt.delivery_note_reference = data["delivery_note_reference"]
        header_changed = True
    if "notes" in data and data["notes"] != goods_receipt.notes:
        goods_receipt.notes = data["notes"]
        header_changed = True
    if (
        purchase_order is None
        and "supplier_name" in data
        and data["supplier_name"] != goods_receipt.supplier_name
    ):
        goods_receipt.supplier_name = data["supplier_name"]
        header_changed = True

    lines_changed = False
    before_lines = None
    after_lines = None
    if "lines" in data:
        before_lines = _line_snapshot_list(goods_receipt)
        resolved = _validate_lines(purchase_order, data["lines"]) if purchase_order else _validate_manual_lines(data["lines"])
        after_lines = _line_snapshot_from_resolved(resolved)
        if after_lines != before_lines:
            lines_changed = True
            goods_receipt.lines.all().delete()
            _create_lines(goods_receipt, resolved)

    if not header_changed and not lines_changed:
        return goods_receipt

    goods_receipt.version += 1
    goods_receipt.save(
        update_fields=["arrived_at", "delivery_note_reference", "notes", "supplier_name", "version", "updated_at"]
    )

    audit_before = dict(before_header)
    audit_after = _header_snapshot(goods_receipt)
    if lines_changed:
        audit_before["lines"] = before_lines
        audit_after["lines"] = after_lines

    record(
        actor=actor,
        action="goods_receipt.updated",
        target_type="goods_receipt",
        target_id=goods_receipt.id,
        company=goods_receipt.company,
        store=goods_receipt.store,
        before=audit_before,
        after=audit_after,
    )
    return goods_receipt


@transaction.atomic
def post_goods_receipt(*, actor, goods_receipt_id, expected_version):
    """`DRAFT` -> `POSTED`. Requires at least one line and a non-future
    `arrived_at` - checked here, not at draft create/edit (a DRAFT may
    legitimately anticipate a future/uncertain arrival before it is
    confirmed).

    Locks the source PurchaseOrder (`select_for_update()`) for the whole
    transaction - this is what serializes posting against every other
    posting attempt for the same PO, across every GoodsReceipt and every
    store, so two concurrent postings against overlapping PO lines can
    never both pass the remaining-quantity check below (the second
    blocks on this lock until the first's transaction commits or rolls
    back, then re-sums against genuinely up-to-date state).

    For every line on this receipt, sums this line's own
    `received_quantity` plus every *other already-POSTED*
    `GoodsReceiptLine` referencing the same source PO line
    (`PurchaseOrderIssueLineSnapshot`) - across every store and every
    other GoodsReceipt, not just this one - and rejects (`400`) if that
    sum would exceed the line's ordered quantity
    (`source_po_line.quantity_snapshot`). PROPOSED POLICY, NOT
    CLIENT-CONFIRMED: no over-delivery tolerance exists in this initial
    slice - exceeding the ordered quantity by even a small amount is
    rejected outright, not merely flagged or allowed through. See
    docs/receiving-proposal.md.

    Retry semantics: a call at the *current* version against an
    already-`POSTED` receipt is an idempotent no-op - no re-summation, no
    double-counting, no new audit entry, no `posted_at`/`posted_by`
    replacement. This is what makes "posting retries must never count
    quantities twice" true: the summation and status transition only
    ever run once, at the actual `DRAFT` -> `POSTED` transition, never
    again on a repeat call. A call against a `CANCELLED` receipt is
    rejected (`400`) - there is no transition from `CANCELLED`.

    Task 13C: the actual DRAFT -> POSTED transition (never the idempotent
    retry) also creates one `RECEIPT_IN` `apps.stock_movements.models.
    StockMovement` per line, in this SAME transaction - see
    `apps.stock_movements.services.create_receipt_in_movements`. This is
    the ONLY place any `StockMovement` is ever created; a receipt POSTED
    before this feature existed is never backfilled, and repeating this
    call on one never creates a movement for it (the idempotent-no-op
    return path above returns before reaching this code at all). Ordered/
    received/undelivered quantity semantics above are completely
    unchanged by this - the ledger is purely additive.
    """
    goods_receipt = GoodsReceipt.objects.select_for_update().get(pk=goods_receipt_id)
    if goods_receipt.version != expected_version:
        raise Conflict("This goods receipt has changed since it was last read. Refetch and retry.")

    if goods_receipt.status == GoodsReceipt.Status.POSTED:
        return goods_receipt
    if goods_receipt.status != GoodsReceipt.Status.DRAFT:
        raise DjangoValidationError(
            {"detail": f"A goods receipt with status '{goods_receipt.status}' cannot be posted."}
        )

    # Manual entry mode (goods_receipt.source_purchase_order_id is None)
    # has no PurchaseOrder to lock or validate against at all - skip
    # straight to the arrived_at/lines checks below. See MANUAL ENTRY
    # MODE in create_goods_receipt's own docstring.
    if goods_receipt.source_purchase_order_id is not None:
        purchase_order = PurchaseOrder.objects.select_for_update().get(pk=goods_receipt.source_purchase_order_id)
        if purchase_order.status != PurchaseOrder.Status.ISSUED:
            raise DjangoValidationError(
                {"detail": "The source purchase order is no longer ISSUED and this receipt cannot be posted."}
            )

    if goods_receipt.arrived_at > timezone.now():
        raise DjangoValidationError({"arrived_at": "Arrival date/time cannot be in the future."})

    lines = list(
        goods_receipt.lines.select_related("source_po_line", "material", "unit").order_by("line_number", "id")
    )
    if not lines:
        raise DjangoValidationError({"detail": "At least one line is required to post a goods receipt."})

    for line in lines:
        # Manual entry mode line (no source_po_line) - there is no
        # ordered quantity to check against, so no over-receipt guard
        # applies to it at all. A deliberate, disclosed relaxation of
        # the PO path's own rule below, never a silent gap - see
        # create_goods_receipt's MANUAL ENTRY MODE docstring.
        if line.source_po_line_id is None:
            continue
        ordered_quantity = line.source_po_line.quantity_snapshot
        already_posted = (
            GoodsReceiptLine.objects.filter(
                source_po_line_id=line.source_po_line_id,
                goods_receipt__status=GoodsReceipt.Status.POSTED,
            )
            .exclude(pk=line.pk)
            .aggregate(total=Sum("received_quantity"))["total"]
            or Decimal("0")
        )
        prospective_total = already_posted + line.received_quantity
        if prospective_total > ordered_quantity:
            remaining = max(ordered_quantity - already_posted, Decimal("0"))
            raise DjangoValidationError(
                {
                    "detail": (
                        f"Line {line.line_number}: posting {line.received_quantity} would exceed the "
                        f"ordered quantity ({ordered_quantity}). Remaining before this post: {remaining}."
                    )
                }
            )

    before = {"status": goods_receipt.status}
    posted_at = timezone.now()
    goods_receipt.status = GoodsReceipt.Status.POSTED
    goods_receipt.posted_by = actor
    goods_receipt.posted_at = posted_at
    goods_receipt.version += 1
    goods_receipt.save(update_fields=["status", "posted_by", "posted_at", "version", "updated_at"])

    # Task 13C: one RECEIPT_IN StockMovement per line, in this SAME
    # transaction - a movement/audit failure below rolls the status
    # transition back too (see apps.stock_movements.services.
    # create_receipt_in_movements's own docstring for why no additional
    # lock is needed here). Only ever runs on the real DRAFT -> POSTED
    # transition above, never on the idempotent-repost return path.
    movements = create_receipt_in_movements(
        goods_receipt=goods_receipt, lines=lines, actor=actor, posted_at=posted_at
    )

    record(
        actor=actor,
        action="goods_receipt.posted",
        target_type="goods_receipt",
        target_id=goods_receipt.id,
        company=goods_receipt.company,
        store=goods_receipt.store,
        before=before,
        after={
            "status": goods_receipt.status,
            "posted_by_id": actor.id,
            "stock_movements": [
                {"id": m.id, "material_code": m.material_code_snapshot, "quantity": str(m.quantity)}
                for m in movements
            ],
        },
    )
    return goods_receipt


@transaction.atomic
def cancel_goods_receipt(*, actor, goods_receipt_id, expected_version, reason):
    """`DRAFT` -> `CANCELLED` only. Requires a non-blank reason every
    time, including on an idempotent retry - mirrors
    cancel_purchase_order's rule exactly. `POSTED` receipts can never be
    cancelled in this task: "posted receipts and their lines are
    immutable... posted-receipt corrections/reversals are deferred" -
    see docs/receiving-proposal.md for what a future correction/reversal
    task would still need to add.
    """
    reason = (reason or "").strip()
    if not reason:
        raise DjangoValidationError({"cancellation_reason": "A cancellation reason is required."})

    goods_receipt = GoodsReceipt.objects.select_for_update().get(pk=goods_receipt_id)
    if goods_receipt.version != expected_version:
        raise Conflict("This goods receipt has changed since it was last read. Refetch and retry.")

    if goods_receipt.status == GoodsReceipt.Status.CANCELLED:
        if goods_receipt.cancellation_reason == reason:
            return goods_receipt
        raise Conflict(
            "This goods receipt was already cancelled with a different reason. Refetch and review it."
        )
    if goods_receipt.status != GoodsReceipt.Status.DRAFT:
        raise DjangoValidationError(
            {"detail": f"A goods receipt with status '{goods_receipt.status}' cannot be cancelled."}
        )

    before = {"status": goods_receipt.status}
    goods_receipt.status = GoodsReceipt.Status.CANCELLED
    goods_receipt.cancelled_by = actor
    goods_receipt.cancelled_at = timezone.now()
    goods_receipt.cancellation_reason = reason
    goods_receipt.version += 1
    goods_receipt.save(
        update_fields=["status", "cancelled_by", "cancelled_at", "cancellation_reason", "version", "updated_at"]
    )

    record(
        actor=actor,
        action="goods_receipt.cancelled",
        target_type="goods_receipt",
        target_id=goods_receipt.id,
        company=goods_receipt.company,
        store=goods_receipt.store,
        before=before,
        after={"status": goods_receipt.status, "cancellation_reason": goods_receipt.cancellation_reason},
    )
    return goods_receipt


def _delivery_status_for(ordered, received):
    if received <= 0:
        return NOT_RECEIVED
    if received < ordered:
        return PARTIALLY_RECEIVED
    return FULLY_RECEIVED


def delivery_progress_for_purchase_order(purchase_order):
    """Per-line physical delivery progress for `purchase_order` -
    ordered/received/remaining quantities and a NOT_RECEIVED/
    PARTIALLY_RECEIVED/FULLY_RECEIVED status per line, computed purely
    from already-`POSTED` GoodsReceiptLine rows across every store.
    Deliberately independent of `PurchaseOrder.status` and of any future
    QC concept - `FULLY_RECEIVED` means only "the ordered quantity has
    physically arrived, on paper," never "accepted, usable, or
    financially closed" (see GoodsReceipt's docstring). Returns `[]` if
    the order has no issue snapshot (i.e. is not `ISSUED`).

    `unit_price`/`pricing_unit_code`/`currency_code` are the issue-time
    snapshot's own historical price (never the live, possibly-since-
    changed PurchaseOrderLine price) - the same source and the same
    reasoning as apps.stock_movements.serializers.StockMovementSerializer.
    get_unit_price. Callers of this function already sit behind the
    same `purchase_orders.view`/company-access gate every other field
    here does (see eligible_purchase_orders_for_receiving) - no new or
    looser check is introduced for these three fields.
    """
    try:
        issue_snapshot = purchase_order.issue_snapshot
    except PurchaseOrderIssueSnapshot.DoesNotExist:
        return []

    progress = []
    for po_line in issue_snapshot.lines.order_by("line_number", "id"):
        received = (
            GoodsReceiptLine.objects.filter(
                source_po_line=po_line, goods_receipt__status=GoodsReceipt.Status.POSTED
            ).aggregate(total=Sum("received_quantity"))["total"]
            or Decimal("0")
        )
        ordered = po_line.quantity_snapshot
        remaining = max(ordered - received, Decimal("0"))
        progress.append(
            {
                "source_po_line_id": po_line.id,
                "line_number": po_line.line_number,
                "material_code_snapshot": po_line.material_code_snapshot,
                "material_name_snapshot": po_line.material_name_snapshot,
                "unit_code_snapshot": po_line.unit_code_snapshot,
                "unit_name_snapshot": po_line.unit_name_snapshot,
                "ordered_quantity": ordered,
                "received_quantity": received,
                "remaining_quantity": remaining,
                "delivery_status": _delivery_status_for(ordered, received),
                "unit_price": po_line.unit_price_snapshot,
                "pricing_unit_code": po_line.unit_code_snapshot,
                # `issue_snapshot` (the enclosing loop variable), not
                # `po_line.issue_snapshot` - same object, avoids an N+1
                # reverse-FK query per line.
                "currency_code": issue_snapshot.currency_code_snapshot,
            }
        )
    return progress


def companies_with_po_view_access(user):
    """Companies `user` currently holds `purchase_orders.view` in - used
    to scope every goods-receipt list/detail/eligible-PO-lookup result
    so store access alone never reveals every company's purchase orders.
    See apps.receiving.views and docs/receiving-proposal.md's explicit
    access-policy note: a common-store operator handling receiving for
    both companies using a shared store needs company access to both,
    granted the ordinary way (an active CompanyMembership plus a role
    holding `purchase_orders.view`) - store membership never substitutes
    for it.
    """
    return [
        company
        for company in active_companies_for_user(user)
        if user_has_permission(user, company, "purchase_orders.view")
    ]


def eligible_purchase_orders_for_receiving(user):
    """`ISSUED` purchase orders belonging to a company `user` holds
    `purchase_orders.view` in - the source list for the "minimal
    eligible PO lookup" endpoint (see apps.receiving.views). Grants no
    broader purchasing access of its own: it only ever returns what the
    same `purchase_orders.view` check already lets the caller see
    through apps.purchasing's own endpoints - this function does not
    exist to work around that check, only to save the caller from
    querying every company one at a time.
    """
    companies = companies_with_po_view_access(user)
    return (
        PurchaseOrder.objects.filter(company__in=companies, status=PurchaseOrder.Status.ISSUED)
        .select_related("company", "supplier", "source_purchase_request", "issue_snapshot")
        .order_by("-issued_at")
    )


# ---------------------------------------------------------------------------
# ContainerType - shared packaging reference data. Mirrors
# apps.catalog.services' create_unit/update_unit/activate_unit/
# deactivate_unit exactly (see there for the identical no-company/no-store
# audit-context reasoning and the immutable-code/no-op-suppression rules).
# ---------------------------------------------------------------------------


def _container_type_snapshot(container_type):
    return {"name": container_type.name, "description": container_type.description}


def create_container_type(*, actor, code, name, description=""):
    container_type = ContainerType(code=code, name=name, description=description)
    container_type.save()
    record(
        actor=actor,
        action="container_type.created",
        target_type="container_type",
        target_id=container_type.id,
        after={"code": container_type.code, "is_active": True, **_container_type_snapshot(container_type)},
    )
    return container_type


def update_container_type(*, actor, container_type, data):
    before = _container_type_snapshot(container_type)
    changed = {field: value for field, value in data.items() if getattr(container_type, field) != value}
    if not changed:
        return container_type

    for field, value in changed.items():
        setattr(container_type, field, value)
    container_type.save()

    after = _container_type_snapshot(container_type)
    if before == after:
        return container_type

    record(
        actor=actor,
        action="container_type.updated",
        target_type="container_type",
        target_id=container_type.id,
        before=before,
        after=after,
    )
    return container_type


@transaction.atomic
def activate_container_type(*, actor, container_type):
    if container_type.is_active:
        return container_type
    container_type.is_active = True
    container_type.save(update_fields=["is_active", "updated_at"])
    record(
        actor=actor,
        action="container_type.activated",
        target_type="container_type",
        target_id=container_type.id,
        before={"is_active": False},
        after={"is_active": True},
    )
    return container_type


@transaction.atomic
def deactivate_container_type(*, actor, container_type):
    """Rejected while any active Material still references this as its
    `default_container_type` - mirrors apps.catalog.services.
    deactivate_unit's identical guard for base_unit exactly.
    """
    from apps.catalog.models import Material

    if not container_type.is_active:
        return container_type
    if Material.objects.filter(default_container_type=container_type, is_active=True).exists():
        raise DjangoValidationError(
            {"detail": "Cannot deactivate a container type while active materials reference it as their default."}
        )
    container_type.is_active = False
    container_type.save(update_fields=["is_active", "updated_at"])
    record(
        actor=actor,
        action="container_type.deactivated",
        target_type="container_type",
        target_id=container_type.id,
        before={"is_active": True},
        after={"is_active": False},
    )
    return container_type
