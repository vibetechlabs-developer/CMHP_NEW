import datetime
import secrets
from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.db.models import Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone

from apps.audit.services import record
from apps.common.errors import Conflict
from apps.companies.models import Company
from apps.companies.services import active_companies_for_user
from apps.catalog.models import Material, UnitOfMeasure
from apps.permissions.services import user_has_permission
from apps.stock_movements.models import (
    CutoverStockDraft,
    LotQualityStatus,
    MaterialIssue,
    MaterialIssueLine,
    MaterialIssueMovement,
    MaterialReturn,
    PhysicalCountDraft,
    ProductionCustody,
    ProductionFloorEvent,
    StockMovement,
)

# Mirrors apps.receiving.services.companies_with_po_view_access exactly -
# this app's data derives entirely from goods receipts, so the same
# company-access check applies. Deliberately NOT formulas.view: receipt
# quantities are not formula data.
PURCHASE_ORDERS_VIEW = "purchase_orders.view"


def create_receipt_in_movements(*, goods_receipt, lines, actor, posted_at):
    """Creates one `RECEIPT_IN` `StockMovement` per already-created
    `GoodsReceiptLine` on `goods_receipt`. MUST be called from inside the
    SAME `transaction.atomic()` block `apps.receiving.services.
    post_goods_receipt` already runs in, after the receipt's own status
    has been set to `POSTED` on the in-memory object but not necessarily
    saved yet - this function does not open its own transaction or lock
    anything itself; the caller's existing lock on the `GoodsReceipt` (and
    the fact that `source_receipt_line` is a `OneToOneField`, so a
    concurrent duplicate attempt hits a database uniqueness violation, not
    a race this function has to detect) is what makes this call safe.

    Never called for a DRAFT or CANCELLED receipt, and never for a receipt
    posted before this feature existed - `post_goods_receipt` is the only
    caller, and only calls this once, at the actual DRAFT -> POSTED
    transition (never on an idempotent repost retry).
    """
    movements = [
        StockMovement(
            movement_type=StockMovement.MovementType.RECEIPT_IN,
            source_goods_receipt=goods_receipt,
            source_receipt_line=line,
            store=goods_receipt.store,
            source_company=goods_receipt.company,
            material=line.material,
            unit=line.unit,
            quantity=line.received_quantity,
            material_code_snapshot=line.material_code_snapshot,
            material_name_snapshot=line.material_name_snapshot,
            unit_code_snapshot=line.unit_code_snapshot,
            unit_name_snapshot=line.unit_name_snapshot,
            lot_reference=line.lot_reference,
            posted_by=actor,
            posted_at=posted_at,
        )
        for line in lines
    ]
    created = StockMovement.objects.bulk_create(movements)
    if created and getattr(created[0], "pk", None) is None:
        created = list(
            StockMovement.objects.filter(source_goods_receipt=goods_receipt).order_by("id")
        )
    # New inward lots stay quarantined until incoming QC approves them.
    # Missing LotQualityStatus remains issue-eligible only for historical
    # receipts posted before this gate existed.
    LotQualityStatus.objects.bulk_create(
        [
            LotQualityStatus(
                stock_movement=movement,
                status=LotQualityStatus.Status.UNDER_TEST,
                remarks="Awaiting incoming QC approval. Not issue-eligible until released.",
                decided_by=actor,
                decided_at=posted_at,
            )
            for movement in created
        ]
    )
    return created


def companies_with_receipt_view_access(user):
    """Companies `user` currently holds `purchase_orders.view` in - used
    to scope every stock-movement/stock-balance list AND aggregation so
    store access alone never reveals, or sums into a total, another
    company's receipt quantities. Mirrors apps.receiving.services.
    companies_with_po_view_access exactly (same underlying data, same
    access rule) - deliberately not extended with formulas.view, since
    receipt quantities are not formula-derived data.
    """
    return [
        company for company in active_companies_for_user(user) if user_has_permission(user, company, PURCHASE_ORDERS_VIEW)
    ]


def stock_movements_queryset(*, store, accessible_companies):
    """Base queryset for both the list and the balance aggregation -
    filtering to accessible companies happens HERE, before any
    aggregation runs, so a total can never include a company the caller
    cannot see (never filter the aggregate result afterward).

    `select_related` reaches all the way to the source purchase order's
    supplier (material-register task): the register shows the supplier
    behind a receipt, gated by the exact same `accessible_companies`
    filter already applied above (never a separate, looser permission
    check) - this is purely an N+1 guard, not a new access decision.
    """
    return (
        StockMovement.objects.filter(store=store, source_company__in=accessible_companies)
        .select_related(
            "material", "unit", "source_company", "posted_by",
            "source_goods_receipt", "source_goods_receipt__source_purchase_order__supplier",
            "source_receipt_line", "source_receipt_line__container_type",
            "source_receipt_line__source_po_line", "source_receipt_line__source_po_line__issue_snapshot",
            "quality_status",
        )
    )


def compute_stock_balances(*, store, accessible_companies, material_id=None, posted_from=None, posted_to=None, issue_eligible_only=False):
    """Recorded-receipt totals, grouped by (material, unit, source_company)
    - NEVER just (material), so two lines for the same material recorded
    in different units are never summed together as if they were the
    same quantity (see docs/shared-store-inventory-plan.md §4), and NEVER
    merged across companies (§2 - shared storage never implies shared
    ownership; keeping source_company in the grouping means this
    aggregation itself never blends two companies' recorded receipts into
    one number, on top of the access-filtering already applied above).

    `posted_from`/`posted_to` (inclusive `date` objects, or `None` for no
    bound) restrict the aggregation to that posting-date window - the
    SAME filter the caller applied to the movement list, so a period
    total and the rows it was computed from always agree. Omitting both
    aggregates the complete authorized history (never just a page).

    When `issue_eligible_only=True`, receipt lots with an explicit
    UNDER_TEST / ON_HOLD / REJECTED QC status are excluded. Missing
    LotQualityStatus rows stay eligible (historical default = APPROVED).

    This is deliberately labeled "recorded receipt quantity" wherever it
    is surfaced (never available_stock/usable_stock/on_hand) - see
    apps.stock_movements.views for the coverage metadata every response
    carries alongside it.
    """
    from django.db.models import Q

    queryset = stock_movements_queryset(store=store, accessible_companies=accessible_companies)
    if material_id is not None:
        queryset = queryset.filter(material_id=material_id)
    if posted_from is not None:
        queryset = queryset.filter(posted_at__date__gte=posted_from)
    if posted_to is not None:
        queryset = queryset.filter(posted_at__date__lte=posted_to)
    if issue_eligible_only:
        blocked = (
            LotQualityStatus.Status.UNDER_TEST,
            LotQualityStatus.Status.ON_HOLD,
            LotQualityStatus.Status.REJECTED,
        )
        queryset = queryset.filter(
            Q(quality_status__isnull=True) | ~Q(quality_status__status__in=blocked)
        )

    return (
        queryset.values(
            "material_id", "material_code_snapshot", "material_name_snapshot",
            "unit_id", "unit_code_snapshot", "unit_name_snapshot",
            "source_company_id", "source_company__code",
        )
        .annotate(recorded_receipt_quantity=Sum("quantity"))
        .order_by("material_code_snapshot", "unit_code_snapshot", "source_company__code")
    )


def material_register_balances(*, store, accessible_companies, material_id, posted_from, posted_to):
    """Opening/period/closing recorded-receipt totals for ONE material at
    ONE store - see apps.stock_movements.views.MaterialRegisterView.

    All three reuse compute_stock_balances() (so every number is grouped
    by (unit, source_company), filtered by the SAME accessible_companies
    gate, and computed from the SAME underlying rows the movement list
    shows) - this function only chooses which posted-date window each one
    uses:

    - `opening`: every RECEIPT_IN strictly BEFORE `posted_from` (the day
      before it, inclusive-to that day). Empty (`[]`) if `posted_from` is
      None - there is no "before the start" when no start was given, and
      this is never silently treated as an all-time total instead.
    - `period_received`: exactly compute_stock_balances's own existing
      `posted_from`/`posted_to` window - identical to what the plain
      stock-balances/stock-movements endpoints already compute for the
      same filters, so a caller can cross-check this register against
      those endpoints and always get the same number.
    - `closing`: every RECEIPT_IN up to and including `posted_to` (no
      lower bound) - mathematically `opening + period_received`, but
      computed independently from the ledger rather than by addition, so
      a test can assert the two ways agree rather than assuming it.

    This is deliberately labelled "receipt-only coverage" wherever it is
    surfaced (see COVERAGE_NOTICE) - "opening" here means "posted
    movements recorded before the start date", NEVER a confirmed physical
    opening balance; no pre-ledger stock capture exists in this codebase
    (see docs/shared-store-inventory-plan.md §6, still an open feature).

    `period_issued` and `closing_net_of_issues` are purely ADDITIVE -
    `opening`/`period_received`/`closing` above keep their exact original
    receipt-only meaning (every existing caller/test of this function is
    unaffected). `period_issued` mirrors `period_received` but from
    compute_issued_balances; `closing_net_of_issues` is `closing` minus
    every recorded issue up to and including `posted_to`, grouped and
    computed the same (unit, source_company) way - a plain ledger
    balance, never a QC-released/usable-stock claim.
    """
    opening = []
    if posted_from is not None:
        opening = list(
            compute_stock_balances(
                store=store,
                accessible_companies=accessible_companies,
                material_id=material_id,
                posted_from=None,
                posted_to=posted_from - datetime.timedelta(days=1),
            )
        )

    period_received = list(
        compute_stock_balances(
            store=store, accessible_companies=accessible_companies, material_id=material_id,
            posted_from=posted_from, posted_to=posted_to,
        )
    )

    closing = list(
        compute_stock_balances(
            store=store, accessible_companies=accessible_companies, material_id=material_id,
            posted_from=None, posted_to=posted_to,
        )
    )

    period_issued = list(
        compute_issued_balances(
            store=store, accessible_companies=accessible_companies, material_id=material_id,
            posted_from=posted_from, posted_to=posted_to,
        )
    )

    issued_to_date = {
        (row["unit_id"], row["source_company_id"]): row["recorded_issued_quantity"]
        for row in compute_issued_balances(
            store=store, accessible_companies=accessible_companies, material_id=material_id,
            posted_from=None, posted_to=posted_to,
        )
    }
    # Additive, same reasoning as net_recorded_balances's own
    # book_quantity: a MaterialReturn is physically back in the store
    # (HELD_UNASSESSED) even though it is not issue-eligible again -
    # closing_net_of_issues's existing net_quantity field keeps its
    # exact original meaning, this only adds the two new fields below.
    returned_to_date = {
        (row["unit_id"], row["source_company_id"]): row["recorded_returned_quantity"]
        for row in compute_returned_balances(
            store=store, accessible_companies=accessible_companies, material_id=material_id,
            created_from=None, created_to=posted_to,
        )
    }
    closing_net_of_issues = [
        {
            **row,
            "recorded_issued_quantity": issued_to_date.get((row["unit_id"], row["source_company_id"]), Decimal("0")),
            "net_quantity": row["recorded_receipt_quantity"] - issued_to_date.get((row["unit_id"], row["source_company_id"]), Decimal("0")),
            "recorded_returned_quantity": returned_to_date.get((row["unit_id"], row["source_company_id"]), Decimal("0")),
            "book_quantity": (
                row["recorded_receipt_quantity"]
                - issued_to_date.get((row["unit_id"], row["source_company_id"]), Decimal("0"))
                + returned_to_date.get((row["unit_id"], row["source_company_id"]), Decimal("0"))
            ),
        }
        for row in closing
    ]

    return {
        "opening": opening,
        "period_received": period_received,
        "closing": closing,
        "period_issued": period_issued,
        "closing_net_of_issues": closing_net_of_issues,
    }


# ---------------------------------------------------------------------------
# Material issues (Issue Outward) - a separate, append-only ledger from
# StockMovement/GoodsReceipt above (see MaterialIssueMovement's own
# docstring for why). Everything below is purely additive: nothing above
# this line changes meaning or behaviour, and "recorded receipt quantity"
# never includes an issue.
# ---------------------------------------------------------------------------

_ISSUE_REFERENCE_MAX_ATTEMPTS = 5


def _generate_issue_reference():
    """Mirrors apps.receiving.services._generate_reference exactly - `MI-`
    prefix so this document type is never confused with a `GR-` receipt.
    """
    date_part = timezone.now().strftime("%Y%m%d")
    suffix = secrets.token_hex(5).upper()
    return f"MI-{date_part}-{suffix}"


def material_issue_movements_queryset(*, store, accessible_companies):
    """Base queryset for both the issue-movement list and the issued-
    balance aggregation - same company-access gate as
    stock_movements_queryset, applied before any aggregation, for the
    same reason (a total must never include a company the caller cannot
    see).
    """
    return MaterialIssueMovement.objects.filter(
        store=store, source_company__in=accessible_companies
    ).select_related("material", "unit", "source_company", "posted_by")


def compute_issued_balances(*, store, accessible_companies, material_id=None, posted_from=None, posted_to=None):
    """Recorded-issue totals, grouped by (material, unit, source_company) -
    the issue-side counterpart of compute_stock_balances, same grouping,
    same date-window semantics, same "never merge across units or
    companies" rule. Deliberately labelled "recorded issued quantity"
    wherever surfaced - never subtracted from compute_stock_balances's
    own result inside this function (callers that want a net figure
    compute it themselves from both separate numbers, see
    material_register_balances's own additions).
    """
    queryset = material_issue_movements_queryset(store=store, accessible_companies=accessible_companies)
    if material_id is not None:
        queryset = queryset.filter(material_id=material_id)
    if posted_from is not None:
        queryset = queryset.filter(posted_at__date__gte=posted_from)
    if posted_to is not None:
        queryset = queryset.filter(posted_at__date__lte=posted_to)

    return (
        queryset.values(
            "material_id", "material_code_snapshot", "material_name_snapshot",
            "unit_id", "unit_code_snapshot", "unit_name_snapshot",
            "source_company_id", "source_company__code",
        )
        .annotate(recorded_issued_quantity=Sum("quantity"))
        .order_by("material_code_snapshot", "unit_code_snapshot", "source_company__code")
    )


def compute_returned_balances(*, store, accessible_companies, material_id=None, created_from=None, created_to=None, disposition=None):
    """Recorded `MaterialReturn` totals, grouped by (material, unit,
    source_company) - the physical-return counterpart of
    compute_issued_balances, same grouping, same "never merge across
    units or companies" rule.

    Pass `disposition` to restrict (e.g. RELEASED_USABLE for issue-
    eligible returned stock). Without it, totals include every disposition
    for physical `book_quantity` bookkeeping.
    """
    queryset = MaterialReturn.objects.filter(store=store, source_company__in=accessible_companies)
    if material_id is not None:
        queryset = queryset.filter(material_id=material_id)
    if disposition is not None:
        queryset = queryset.filter(disposition=disposition)
    if created_from is not None:
        queryset = queryset.filter(created_at__date__gte=created_from)
    if created_to is not None:
        queryset = queryset.filter(created_at__date__lte=created_to)

    return (
        queryset.values(
            "material_id", "material__code", "material__name",
            "unit_id", "unit__code", "unit__name",
            "source_company_id", "source_company__code",
        )
        .annotate(recorded_returned_quantity=Sum("quantity"))
        .order_by("material__code", "unit__code", "source_company__code")
    )


def net_recorded_balances(*, store, accessible_companies, material_id):
    """Per (unit, source_company): recorded receipts minus recorded
    issues, all-time (no date window - this is a POSTING-time ledger
    check, not a period report). A plain bookkeeping number - never a
    claim about QC release, reservation, or physical/usable stock. Used
    to populate the Issue Outward form's "available to issue" display
    and to cap what post_material_issue allows.

    `net_quantity` keeps its exact original meaning (receipts minus
    issues only) - every existing caller, including post_material_
    issue's own issue-eligibility cap, is unaffected. `recorded_
    returned_quantity`/`book_quantity` are purely ADDITIVE fields for
    physical book-keeping only (`book_quantity = net_quantity +
    recorded_returned_quantity`): a MaterialReturn is always created
    HELD_UNASSESSED (see MaterialReturn's own docstring), so a returned
    quantity being reflected here is never a claim that it is usable or
    re-issuable - `net_quantity`, not `book_quantity`, is still what
    gates issuing. See compute_returned_balances for why this is a
    separate aggregation rather than folded into compute_stock_balances/
    compute_issued_balances.

    Carries `unit_code`/`unit_name` through from whichever side (receipt
    or issue rows) has them for that (unit, company) key - the Issue
    Outward form needs a real unit label next to this number, never a
    hardcoded "KG" (see NetRecordedBalanceSerializer).
    """
    received = {}
    unit_labels = {}
    # Issue eligibility uses QC-approved (or untracked) receipt lots only.
    for row in compute_stock_balances(
        store=store, accessible_companies=accessible_companies, material_id=material_id, issue_eligible_only=True,
    ):
        key = (row["unit_id"], row["source_company_id"])
        received[key] = row["recorded_receipt_quantity"]
        unit_labels[row["unit_id"]] = (row["unit_code_snapshot"], row["unit_name_snapshot"])
    issued = {}
    for row in compute_issued_balances(store=store, accessible_companies=accessible_companies, material_id=material_id):
        key = (row["unit_id"], row["source_company_id"])
        issued[key] = row["recorded_issued_quantity"]
        unit_labels.setdefault(row["unit_id"], (row["unit_code_snapshot"], row["unit_name_snapshot"]))
    returned = {}
    for row in compute_returned_balances(store=store, accessible_companies=accessible_companies, material_id=material_id):
        key = (row["unit_id"], row["source_company_id"])
        returned[key] = row["recorded_returned_quantity"]
        unit_labels.setdefault(row["unit_id"], (row["unit__code"], row["unit__name"]))
    released = {}
    for row in compute_returned_balances(
        store=store, accessible_companies=accessible_companies, material_id=material_id, disposition="RELEASED_USABLE",
    ):
        key = (row["unit_id"], row["source_company_id"])
        released[key] = row["recorded_returned_quantity"]
        unit_labels.setdefault(row["unit_id"], (row["unit__code"], row["unit__name"]))

    keys = set(received) | set(issued) | set(returned) | set(released)
    results = []
    for unit_id, company_id in keys:
        received_qty = received.get((unit_id, company_id), Decimal("0"))
        issued_qty = issued.get((unit_id, company_id), Decimal("0"))
        returned_qty = returned.get((unit_id, company_id), Decimal("0"))
        released_qty = released.get((unit_id, company_id), Decimal("0"))
        unit_code, unit_name = unit_labels.get(unit_id, ("", ""))
        # Released-usable returns are issue-eligible again; held/rejected are not.
        net_quantity = received_qty - issued_qty + released_qty
        results.append({
            "unit_id": unit_id,
            "unit_code": unit_code,
            "unit_name": unit_name,
            "source_company_id": company_id,
            "recorded_receipt_quantity": received_qty,
            "recorded_issued_quantity": issued_qty,
            "net_quantity": net_quantity,
            "recorded_returned_quantity": returned_qty,
            "recorded_released_usable_quantity": released_qty,
            "book_quantity": received_qty - issued_qty + returned_qty,
        })
    return results


def _issue_header_snapshot(material_issue):
    return {
        "source_company_id": material_issue.source_company_id,
        "issued_quantity": str(material_issue.issued_quantity),
        "issued_at": material_issue.issued_at.isoformat() if material_issue.issued_at else None,
        "batch_reference": material_issue.batch_reference,
        "product_reference": material_issue.product_reference,
        "remarks": material_issue.remarks,
        "batch_plan_id": material_issue.batch_plan_id,
        "sales_order_id": material_issue.sales_order_id,
        "line_count": material_issue.lines.count() if material_issue.pk else 0,
    }


def _resolve_issue_links(*, source_company, batch_plan_id=None, sales_order_id=None):
    """Batch plan and/or sales order must bind every material issue so free-text
    batch typos cannot silently issue against the wrong production job.
    """
    from apps.batch_plans.models import BatchPlan
    from apps.sales_orders.models import SalesOrder

    batch_plan = None
    sales_order = None
    if batch_plan_id:
        batch_plan = get_object_or_404(BatchPlan.objects.select_related("sales_order_line__sales_order"), pk=batch_plan_id)
        if batch_plan.company_id != source_company.id:
            raise DjangoValidationError({"batch_plan_id": "Batch plan does not belong to the selected company."})
        sales_order = batch_plan.sales_order_line.sales_order
    if sales_order_id:
        sales_order = get_object_or_404(SalesOrder, pk=sales_order_id)
        if sales_order.company_id != source_company.id:
            raise DjangoValidationError({"sales_order_id": "Sales order does not belong to the selected company."})
        if batch_plan and batch_plan.sales_order_line.sales_order_id != sales_order.id:
            raise DjangoValidationError({"sales_order_id": "Sales order does not match the selected batch plan."})
    if batch_plan is None and sales_order is None:
        raise DjangoValidationError({
            "detail": "Select a batch plan or sales order before creating a material issue to production.",
        })
    return batch_plan, sales_order


def _normalize_issue_lines(*, lines, material_id=None, unit_id=None, issued_quantity=None):
    """Accept multi-line payload or fall back to a single header material."""
    prepared = []
    if lines:
        for index, item in enumerate(lines, start=1):
            mid = item.get("material_id")
            if not mid:
                raise DjangoValidationError({"lines": f"Line {index}: material_id is required."})
            material = get_object_or_404(Material.objects.select_related("base_unit"), pk=mid)
            uid = item.get("unit_id")
            unit = get_object_or_404(UnitOfMeasure, pk=uid) if uid else material.base_unit
            qty = Decimal(str(item.get("issued_quantity")))
            if qty <= 0:
                raise DjangoValidationError({"lines": f"Line {index}: issued_quantity must be greater than zero."})
            prepared.append({"material": material, "unit": unit, "issued_quantity": qty, "line_number": index})
    else:
        if not material_id:
            raise DjangoValidationError({"material_id": "Provide material_id or a non-empty lines list."})
        material = get_object_or_404(Material.objects.select_related("base_unit"), pk=material_id)
        unit = get_object_or_404(UnitOfMeasure, pk=unit_id) if unit_id else material.base_unit
        if issued_quantity is None or Decimal(issued_quantity) <= 0:
            raise DjangoValidationError({"issued_quantity": "Issued quantity must be greater than zero."})
        prepared.append({
            "material": material,
            "unit": unit,
            "issued_quantity": Decimal(str(issued_quantity)),
            "line_number": 1,
        })
    return prepared


def _replace_issue_lines(material_issue, prepared_lines):
    material_issue.lines.all().delete()
    for item in prepared_lines:
        MaterialIssueLine.objects.create(
            material_issue=material_issue,
            line_number=item["line_number"],
            material=item["material"],
            unit=item["unit"],
            issued_quantity=item["issued_quantity"],
            material_code_snapshot=item["material"].code,
            material_name_snapshot=item["material"].name,
            unit_code_snapshot=item["unit"].code,
            unit_name_snapshot=item["unit"].name,
        )
    first = prepared_lines[0]
    total = sum((p["issued_quantity"] for p in prepared_lines), Decimal("0"))
    material_issue.material = first["material"]
    material_issue.unit = first["unit"]
    material_issue.issued_quantity = total
    material_issue.material_code_snapshot = first["material"].code
    material_issue.material_name_snapshot = first["material"].name
    material_issue.unit_code_snapshot = first["unit"].code
    material_issue.unit_name_snapshot = first["unit"].name


def _create_issue_header_with_unique_reference(
    *, store, actor, source_company, material, unit, issued_quantity, issued_at,
    batch_reference, product_reference, remarks, idempotency_key, batch_plan=None, sales_order=None,
):
    for _ in range(_ISSUE_REFERENCE_MAX_ATTEMPTS):
        try:
            with transaction.atomic():
                material_issue = MaterialIssue(
                    store=store,
                    source_company=source_company,
                    material=material,
                    unit=unit,
                    reference=_generate_issue_reference(),
                    issued_quantity=issued_quantity,
                    issued_at=issued_at,
                    batch_reference=batch_reference,
                    product_reference=product_reference,
                    remarks=remarks,
                    idempotency_key=idempotency_key,
                    created_by=actor,
                    material_code_snapshot=material.code,
                    material_name_snapshot=material.name,
                    unit_code_snapshot=unit.code,
                    unit_name_snapshot=unit.name,
                    batch_plan=batch_plan,
                    sales_order=sales_order,
                )
                material_issue.save()
                return material_issue
        except IntegrityError as exc:
            constraint_name = getattr(getattr(exc.__cause__, "diag", None), "constraint_name", "") or ""
            if "idempotency_key" in constraint_name:
                raise Conflict(
                    "A material issue with this idempotency_key was just created concurrently. "
                    "Retry the same request to see the existing result."
                ) from exc
            continue
    raise RuntimeError("Could not generate a unique material issue reference after several attempts.")


@transaction.atomic
def create_material_issue(
    *, actor, store, source_company_id, material_id=None, issued_quantity=None, issued_at,
    unit_id=None, batch_reference="", product_reference="", remarks="", idempotency_key="",
    batch_plan_id=None, sales_order_id=None, lines=None,
):
    """Creates a DRAFT MaterialIssue bound to a batch plan and/or sales order.
    Supports multi-line slips (all RM/PM for one BMR/batch) via `lines`.
    """
    idempotency_key = (idempotency_key or "").strip()
    batch_reference = (batch_reference or "").strip()
    product_reference = (product_reference or "").strip()
    remarks = remarks or ""

    source_company = get_object_or_404(Company, pk=source_company_id)
    batch_plan, sales_order = _resolve_issue_links(
        source_company=source_company, batch_plan_id=batch_plan_id, sales_order_id=sales_order_id,
    )
    if batch_plan and not batch_reference:
        allocation = getattr(batch_plan, "number_allocation", None)
        batch_reference = (getattr(allocation, "number", None) or "") or f"Plan-{batch_plan.id}"
    if batch_plan and not product_reference:
        product_reference = batch_plan.product_name_snapshot or batch_plan.product_code_snapshot or ""
    if sales_order and not product_reference:
        first_line = sales_order.lines.order_by("line_number").first()
        if first_line:
            product_reference = first_line.product_name_snapshot or first_line.product_code_snapshot or ""

    prepared_lines = _normalize_issue_lines(
        lines=lines, material_id=material_id, unit_id=unit_id, issued_quantity=issued_quantity,
    )
    first = prepared_lines[0]
    total_qty = sum((p["issued_quantity"] for p in prepared_lines), Decimal("0"))

    if idempotency_key:
        existing = MaterialIssue.objects.filter(idempotency_key=idempotency_key).first()
        if existing is not None:
            if (
                existing.source_company_id == source_company.id
                and existing.store_id == store.id
                and existing.batch_plan_id == (batch_plan.id if batch_plan else None)
                and existing.sales_order_id == (sales_order.id if sales_order else None)
                and str(existing.issued_quantity) == str(total_qty)
            ):
                return existing
            raise Conflict(
                "This idempotency_key was already used to create a different material issue. "
                "Use a new key, or refetch and confirm the existing one."
            )

    material_issue = _create_issue_header_with_unique_reference(
        store=store, actor=actor, source_company=source_company, material=first["material"], unit=first["unit"],
        issued_quantity=total_qty, issued_at=issued_at, batch_reference=batch_reference,
        product_reference=product_reference, remarks=remarks, idempotency_key=idempotency_key,
        batch_plan=batch_plan, sales_order=sales_order,
    )
    _replace_issue_lines(material_issue, prepared_lines)
    material_issue.save()

    record(
        actor=actor,
        action="material_issue.created",
        target_type="material_issue",
        target_id=material_issue.id,
        company=source_company,
        store=store,
        after={"reference": material_issue.reference, "status": material_issue.status, **_issue_header_snapshot(material_issue)},
    )
    return material_issue


@transaction.atomic
def update_material_issue(*, actor, material_issue_id, expected_version, data):
    """DRAFT only. May update header fields, batch/order links, and/or replace `lines`."""
    material_issue = MaterialIssue.objects.select_for_update().get(pk=material_issue_id)
    if material_issue.version != expected_version:
        raise Conflict("This material issue has changed since it was last read. Refetch and retry.")
    if material_issue.status != MaterialIssue.Status.DRAFT:
        raise DjangoValidationError({"detail": "Only a draft material issue can be edited."})

    before = _issue_header_snapshot(material_issue)
    changed = False
    if "issued_at" in data and data["issued_at"] != material_issue.issued_at:
        material_issue.issued_at = data["issued_at"]
        changed = True
    if "batch_reference" in data and data["batch_reference"] != material_issue.batch_reference:
        material_issue.batch_reference = data["batch_reference"]
        changed = True
    if "product_reference" in data and data["product_reference"] != material_issue.product_reference:
        material_issue.product_reference = data["product_reference"]
        changed = True
    if "remarks" in data and data["remarks"] != material_issue.remarks:
        material_issue.remarks = data["remarks"]
        changed = True
    if "batch_plan_id" in data or "sales_order_id" in data:
        batch_plan, sales_order = _resolve_issue_links(
            source_company=material_issue.source_company,
            batch_plan_id=data.get("batch_plan_id", material_issue.batch_plan_id),
            sales_order_id=data.get("sales_order_id", material_issue.sales_order_id),
        )
        if material_issue.batch_plan_id != (batch_plan.id if batch_plan else None):
            material_issue.batch_plan = batch_plan
            changed = True
        if material_issue.sales_order_id != (sales_order.id if sales_order else None):
            material_issue.sales_order = sales_order
            changed = True
    if "lines" in data:
        prepared = _normalize_issue_lines(lines=data["lines"])
        _replace_issue_lines(material_issue, prepared)
        changed = True
    elif "issued_quantity" in data and Decimal(data["issued_quantity"]) != material_issue.issued_quantity:
        if Decimal(data["issued_quantity"]) <= 0:
            raise DjangoValidationError({"issued_quantity": "Issued quantity must be greater than zero."})
        material_issue.issued_quantity = data["issued_quantity"]
        first_line = material_issue.lines.order_by("line_number").first()
        if first_line and material_issue.lines.count() == 1:
            first_line.issued_quantity = data["issued_quantity"]
            first_line.save(update_fields=["issued_quantity"])
        changed = True

    if not changed:
        return material_issue

    material_issue.version += 1
    material_issue.save()

    record(
        actor=actor,
        action="material_issue.updated",
        target_type="material_issue",
        target_id=material_issue.id,
        company=material_issue.source_company,
        store=material_issue.store,
        before=before,
        after=_issue_header_snapshot(material_issue),
    )
    return material_issue


@transaction.atomic
def post_material_issue(*, actor, material_issue_id, expected_version):
    """DRAFT -> POSTED. Idempotent on an already-POSTED document at the
    current version (same convention as post_goods_receipt). The ONLY
    rule enforced here: the issue, added to every other already-POSTED
    issue for this exact (material, unit, source_company) at this store,
    may not exceed the recorded receipt total for that same combination
    - a plain non-negativity ledger check, never a QC/release/
    reservation decision (see MaterialIssue's own docstring).

    Creates exactly one MaterialIssueMovement, in the same transaction
    as the status transition - a failure after this point rolls the
    transition back too.

    Concurrency: unlike a GoodsReceipt (capped against one PurchaseOrder
    row it can lock), there is no single pre-existing row the net-balance
    check below is "about" - MaterialIssueMovement is an append-only
    ledger, not a running balance. Without a lock, two concurrent posts
    of two DIFFERENT MaterialIssue documents for the same material could
    each read the same "before" net balance and both pass the check
    (classic check-then-act race), together posting more than was ever
    recorded as received. `select_for_update()` on the `Material` row
    itself serializes every post for that material (store-wide, not just
    this one company) before the balance is read - coarser than strictly
    necessary, but correct, and this table is never locked for anything
    else, so legitimate concurrent posts simply queue briefly rather
    than ever double-spend the same recorded balance.
    """
    material_issue = MaterialIssue.objects.select_for_update().get(pk=material_issue_id)
    if material_issue.version != expected_version:
        raise Conflict("This material issue has changed since it was last read. Refetch and retry.")

    if material_issue.status == MaterialIssue.Status.POSTED:
        return material_issue
    if material_issue.status != MaterialIssue.Status.DRAFT:
        raise DjangoValidationError({"detail": f"A material issue with status '{material_issue.status}' cannot be posted."})

    if material_issue.issued_at > timezone.now():
        raise DjangoValidationError({"issued_at": "Issue date/time cannot be in the future."})

    # Cap every line (or the legacy header) against QC-approved net balance.
    lines = list(material_issue.lines.select_related("material", "unit").order_by("line_number", "id"))
    if not lines:
        lines = [None]
    for line in lines:
        material_id = line.material_id if line else material_issue.material_id
        unit_id = line.unit_id if line else material_issue.unit_id
        qty = line.issued_quantity if line else material_issue.issued_quantity
        Material.objects.select_for_update().get(pk=material_id)
        balances = net_recorded_balances(
            store=material_issue.store,
            accessible_companies=[material_issue.source_company],
            material_id=material_id,
        )
        row = next(
            (b for b in balances if b["unit_id"] == unit_id and b["source_company_id"] == material_issue.source_company_id),
            None,
        )
        net_available = row["net_quantity"] if row else Decimal("0")
        label = (line.material_code_snapshot if line else material_issue.material_code_snapshot) or str(material_id)
        unit_label = (line.unit_code_snapshot if line else material_issue.unit_code_snapshot) or ""
        if qty > net_available:
            raise DjangoValidationError({
                "detail": (
                    f"Posting {qty} {unit_label} of {label} would exceed the QC-approved net balance "
                    f"({net_available} {unit_label}) for {material_issue.source_company.code} at this store. "
                    "Quarantine / on-hold / rejected lots are not issue-eligible."
                )
            })

    before = {"status": material_issue.status}
    posted_at = timezone.now()
    material_issue.status = MaterialIssue.Status.POSTED
    material_issue.posted_by = actor
    material_issue.posted_at = posted_at
    material_issue.version += 1
    material_issue.save(update_fields=["status", "posted_by", "posted_at", "version", "updated_at"])

    movement_ids = []
    for line in lines:
        movement = MaterialIssueMovement(
            source_material_issue=material_issue,
            source_line=line,
            store=material_issue.store,
            source_company=material_issue.source_company,
            material_id=line.material_id if line else material_issue.material_id,
            unit_id=line.unit_id if line else material_issue.unit_id,
            quantity=line.issued_quantity if line else material_issue.issued_quantity,
            material_code_snapshot=(line.material_code_snapshot if line else material_issue.material_code_snapshot),
            material_name_snapshot=(line.material_name_snapshot if line else material_issue.material_name_snapshot),
            unit_code_snapshot=(line.unit_code_snapshot if line else material_issue.unit_code_snapshot),
            unit_name_snapshot=(line.unit_name_snapshot if line else material_issue.unit_name_snapshot),
            batch_reference=material_issue.batch_reference,
            product_reference=material_issue.product_reference,
            remarks=material_issue.remarks,
            posted_by=actor,
            posted_at=posted_at,
        )
        movement.save()
        movement_ids.append(movement.id)

        ProductionCustody.objects.get_or_create(
            source_issue=material_issue,
            source_line=line,
            defaults={
                "store": material_issue.store,
                "source_company": material_issue.source_company,
                "material_id": line.material_id if line else material_issue.material_id,
                "unit_id": line.unit_id if line else material_issue.unit_id,
                "batch_reference": material_issue.batch_reference,
                "product_reference": material_issue.product_reference,
                "issued_quantity": line.issued_quantity if line else material_issue.issued_quantity,
                "consumed_quantity": Decimal("0.000"),
                "returned_quantity": Decimal("0.000"),
                "damaged_quantity": Decimal("0.000"),
                "disposed_quantity": Decimal("0.000"),
            },
        )

    record(
        actor=actor,
        action="material_issue.posted",
        target_type="material_issue",
        target_id=material_issue.id,
        company=material_issue.source_company,
        store=material_issue.store,
        before=before,
        after={
            "status": material_issue.status,
            "posted_by_id": actor.id,
            "movement_ids": movement_ids,
            "quantity": str(material_issue.issued_quantity),
        },
    )
    return material_issue


@transaction.atomic
def cancel_material_issue(*, actor, material_issue_id, expected_version, reason):
    """DRAFT -> CANCELLED only - mirrors cancel_goods_receipt exactly,
    including requiring a non-blank reason on every call (including an
    idempotent retry) and never allowing a POSTED issue to be cancelled.
    """
    reason = (reason or "").strip()
    if not reason:
        raise DjangoValidationError({"cancellation_reason": "A cancellation reason is required."})

    material_issue = MaterialIssue.objects.select_for_update().get(pk=material_issue_id)
    if material_issue.version != expected_version:
        raise Conflict("This material issue has changed since it was last read. Refetch and retry.")

    if material_issue.status == MaterialIssue.Status.CANCELLED:
        if material_issue.cancellation_reason == reason:
            return material_issue
        raise Conflict("This material issue was already cancelled with a different reason. Refetch and review it.")
    if material_issue.status != MaterialIssue.Status.DRAFT:
        raise DjangoValidationError({"detail": f"A material issue with status '{material_issue.status}' cannot be cancelled."})

    before = {"status": material_issue.status}
    material_issue.status = MaterialIssue.Status.CANCELLED
    material_issue.cancelled_by = actor
    material_issue.cancelled_at = timezone.now()
    material_issue.cancellation_reason = reason
    material_issue.version += 1
    material_issue.save(update_fields=["status", "cancelled_by", "cancelled_at", "cancellation_reason", "version", "updated_at"])

    record(
        actor=actor,
        action="material_issue.cancelled",
        target_type="material_issue",
        target_id=material_issue.id,
        company=material_issue.source_company,
        store=material_issue.store,
        before=before,
        after={"status": material_issue.status, "cancellation_reason": material_issue.cancellation_reason},
    )
    return material_issue


# ---------------------------------------------------------------------------
# Production Custody & Floor Events
# ---------------------------------------------------------------------------

def list_production_custodies(*, store, accessible_companies, material_id=None):
    qs = ProductionCustody.objects.filter(
        store=store, source_company__in=accessible_companies
    ).select_related("material", "unit", "source_company", "source_issue")
    if material_id is not None:
        qs = qs.filter(material_id=material_id)
    return qs


@transaction.atomic
def record_production_consumption(*, actor, custody_id, quantity, notes="", expected_version=None):
    try:
        qty = Decimal(str(quantity))
    except Exception:
        raise DjangoValidationError({"quantity": "Must be a valid positive decimal quantity."})
    if qty <= Decimal("0.000"):
        raise DjangoValidationError({"quantity": "Consumed quantity must be greater than zero."})

    custody = ProductionCustody.objects.select_for_update().get(pk=custody_id)
    if expected_version is not None and custody.version != expected_version:
        raise Conflict("Production custody record was modified concurrently. Please refresh and retry.")

    sound_remaining = custody.sound_quantity
    if qty > sound_remaining:
        raise DjangoValidationError({
            "detail": f"Cannot consume {qty}: only {sound_remaining} sound quantity remaining in production custody ({custody.damaged_quantity} is classified as damaged)."
        })

    before = {"consumed_quantity": str(custody.consumed_quantity), "version": custody.version}
    custody.consumed_quantity += qty
    custody.version += 1
    custody.save(update_fields=["consumed_quantity", "version", "updated_at"])

    event = ProductionFloorEvent.objects.create(
        custody=custody,
        event_type="CONSUMPTION",
        quantity=qty,
        notes=notes or "",
        recorded_by=actor,
    )

    record(
        actor=actor,
        action="production_custody.consumed",
        target_type="production_custody",
        target_id=custody.id,
        company=custody.source_company,
        store=custody.store,
        before=before,
        after={"consumed_quantity": str(custody.consumed_quantity), "event_id": event.id, "quantity": str(qty)},
    )
    return custody


@transaction.atomic
def record_defect_classification(*, actor, custody_id, quantity, reason="", notes="", expected_version=None):
    try:
        qty = Decimal(str(quantity))
    except Exception:
        raise DjangoValidationError({"quantity": "Must be a valid positive decimal quantity."})
    if qty <= Decimal("0.000"):
        raise DjangoValidationError({"quantity": "Classified defect quantity must be greater than zero."})

    custody = ProductionCustody.objects.select_for_update().get(pk=custody_id)
    if expected_version is not None and custody.version != expected_version:
        raise Conflict("Production custody record was modified concurrently. Please refresh and retry.")

    sound_remaining = custody.sound_quantity
    if qty > sound_remaining:
        raise DjangoValidationError({
            "detail": f"Cannot classify {qty} as damaged: only {sound_remaining} sound quantity available to classify."
        })

    before = {"damaged_quantity": str(custody.damaged_quantity), "version": custody.version}
    custody.damaged_quantity += qty
    custody.version += 1
    custody.save(update_fields=["damaged_quantity", "version", "updated_at"])

    event = ProductionFloorEvent.objects.create(
        custody=custody,
        event_type="DEFECT_CLASSIFIED",
        quantity=qty,
        reason=reason or "",
        notes=notes or "",
        recorded_by=actor,
    )

    record(
        actor=actor,
        action="production_custody.defect_classified",
        target_type="production_custody",
        target_id=custody.id,
        company=custody.source_company,
        store=custody.store,
        before=before,
        after={"damaged_quantity": str(custody.damaged_quantity), "event_id": event.id, "quantity": str(qty)},
    )
    return custody


@transaction.atomic
def record_unused_or_defective_return(*, actor, custody_id, quantity, return_type, reason="", expected_version=None):
    if return_type not in ("UNUSED", "DEFECTIVE"):
        raise DjangoValidationError({"return_type": "Must be either UNUSED or DEFECTIVE."})

    try:
        qty = Decimal(str(quantity))
    except Exception:
        raise DjangoValidationError({"quantity": "Must be a valid positive decimal quantity."})
    if qty <= Decimal("0.000"):
        raise DjangoValidationError({"quantity": "Returned quantity must be greater than zero."})

    custody = ProductionCustody.objects.select_for_update().get(pk=custody_id)
    if expected_version is not None and custody.version != expected_version:
        raise Conflict("Production custody record was modified concurrently. Please refresh and retry.")

    remaining = custody.remaining_quantity
    if qty > remaining:
        raise DjangoValidationError({
            "detail": f"Cannot return {qty}: only {remaining} remaining in production custody."
        })

    before = {
        "returned_quantity": str(custody.returned_quantity),
        "damaged_quantity": str(custody.damaged_quantity),
        "version": custody.version,
    }

    if return_type == "UNUSED":
        sound_remaining = custody.sound_quantity
        if qty > sound_remaining:
            raise DjangoValidationError({
                "detail": f"Cannot return {qty} as unused: only {sound_remaining} sound quantity remaining in production custody ({custody.damaged_quantity} is classified as damaged)."
            })
        custody.returned_quantity += qty
    else:  # DEFECTIVE
        damaged_reduction = min(custody.damaged_quantity, qty)
        custody.damaged_quantity -= damaged_reduction
        custody.returned_quantity += qty

    custody.version += 1
    custody.save(update_fields=["returned_quantity", "damaged_quantity", "version", "updated_at"])

    # Physical return creates MaterialReturn with explicit HELD_UNASSESSED disposition.
    # Store physical custody increases; usable stock is not released without inspection rule.
    material_return = MaterialReturn.objects.create(
        source_custody=custody,
        source_issue=custody.source_issue,
        store=custody.store,
        source_company=custody.source_company,
        material=custody.material,
        unit=custody.unit,
        return_type=return_type,
        quantity=qty,
        disposition="HELD_UNASSESSED",
        batch_reference=custody.batch_reference,
        reason=reason or "",
        recorded_by=actor,
    )

    event = ProductionFloorEvent.objects.create(
        custody=custody,
        event_type=f"RETURN_{return_type}",
        quantity=qty,
        reason=reason or "",
        recorded_by=actor,
    )

    record(
        actor=actor,
        action="production_custody.returned",
        target_type="production_custody",
        target_id=custody.id,
        company=custody.source_company,
        store=custody.store,
        before=before,
        after={
            "returned_quantity": str(custody.returned_quantity),
            "return_id": material_return.id,
            "event_id": event.id,
            "quantity": str(qty),
            "return_type": return_type,
            "disposition": "HELD_UNASSESSED",
        },
    )
    return custody


@transaction.atomic
def record_disposal(*, actor, custody_id, quantity, disposal_policy, reason="", notes="", expected_version=None):
    policy = (disposal_policy or "").strip()
    if not policy:
        raise DjangoValidationError({"disposal_policy": "Explicit disposal policy authorization is required for disposal."})

    try:
        qty = Decimal(str(quantity))
    except Exception:
        raise DjangoValidationError({"quantity": "Must be a valid positive decimal quantity."})
    if qty <= Decimal("0.000"):
        raise DjangoValidationError({"quantity": "Disposed quantity must be greater than zero."})

    custody = ProductionCustody.objects.select_for_update().get(pk=custody_id)
    if expected_version is not None and custody.version != expected_version:
        raise Conflict("Production custody record was modified concurrently. Please refresh and retry.")

    remaining = custody.remaining_quantity
    if qty > remaining:
        raise DjangoValidationError({
            "detail": f"Cannot dispose {qty}: only {remaining} remaining in production custody."
        })

    before = {
        "disposed_quantity": str(custody.disposed_quantity),
        "damaged_quantity": str(custody.damaged_quantity),
        "version": custody.version,
    }

    damaged_deduction = min(custody.damaged_quantity, qty)
    custody.damaged_quantity -= damaged_deduction
    custody.disposed_quantity += qty
    custody.version += 1
    custody.save(update_fields=["disposed_quantity", "damaged_quantity", "version", "updated_at"])

    event = ProductionFloorEvent.objects.create(
        custody=custody,
        event_type="DISPOSAL",
        quantity=qty,
        disposal_policy=policy,
        reason=reason or "",
        notes=notes or "",
        recorded_by=actor,
    )

    record(
        actor=actor,
        action="production_custody.disposed",
        target_type="production_custody",
        target_id=custody.id,
        company=custody.source_company,
        store=custody.store,
        before=before,
        after={
            "disposed_quantity": str(custody.disposed_quantity),
            "event_id": event.id,
            "quantity": str(qty),
            "disposal_policy": policy,
        },
    )
    return custody


# ---------------------------------------------------------------------------
# Count & Cutover Draft Services
# ---------------------------------------------------------------------------

def create_physical_count_draft(
    *, actor, store_id, material_id, unit_id, book_reference_quantity, actual_count_quantity, reason="", scope="STORE_PHYSICAL"
):
    try:
        book_qty = Decimal(str(book_reference_quantity))
        actual_qty = Decimal(str(actual_count_quantity))
    except Exception:
        raise DjangoValidationError({"detail": "Book reference and actual count quantities must be valid decimals."})

    diff = actual_qty - book_qty

    draft = PhysicalCountDraft.objects.create(
        store_id=store_id,
        material_id=material_id,
        unit_id=unit_id,
        scope=scope or "STORE_PHYSICAL",
        book_reference_quantity=book_qty,
        actual_count_quantity=actual_qty,
        discrepancy_quantity=diff,
        reason=reason or "",
        recorded_by=actor,
        recorded_at=timezone.now(),
        status="DRAFT",
    )
    return draft


def list_physical_count_drafts(*, store_id, material_id=None):
    qs = PhysicalCountDraft.objects.filter(store_id=store_id).select_related("material", "unit", "recorded_by")
    if material_id is not None:
        qs = qs.filter(material_id=material_id)
    return qs


def create_cutover_stock_draft(
    *, actor, store_id, material_id, unit_id, effective_date, quantity, source_reference, remarks=""
):
    try:
        qty = Decimal(str(quantity))
    except Exception:
        raise DjangoValidationError({"quantity": "Cutover quantity must be a valid non-negative decimal."})
    if qty < Decimal("0.000"):
        raise DjangoValidationError({"quantity": "Cutover quantity cannot be negative."})

    src_ref = (source_reference or "").strip()
    if not src_ref:
        raise DjangoValidationError({"source_reference": "Source reference is required for cutover opening."})

    draft = CutoverStockDraft.objects.create(
        store_id=store_id,
        material_id=material_id,
        unit_id=unit_id,
        effective_date=effective_date,
        quantity=qty,
        source_reference=src_ref,
        remarks=remarks or "",
        recorded_by=actor,
        status="DRAFT",
    )
    return draft


def list_cutover_stock_drafts(*, store_id, material_id=None):
    qs = CutoverStockDraft.objects.filter(store_id=store_id).select_related("material", "unit", "recorded_by")
    if material_id is not None:
        qs = qs.filter(material_id=material_id)
    return qs


@transaction.atomic
def set_lot_quality_status(*, actor, stock_movement_id, status, ar_no="", chemist="", remarks=""):
    """Set/update QC release gate for one receipt lot. APPROVED lots are
    issue-eligible; UNDER_TEST / ON_HOLD / REJECTED are excluded from
    net_recorded_balances used at posting time.
    """
    if status not in LotQualityStatus.Status.values:
        raise DjangoValidationError({"status": f"Must be one of {list(LotQualityStatus.Status.values)}."})
    movement = get_object_or_404(StockMovement, pk=stock_movement_id)
    now = timezone.now()
    obj, _created = LotQualityStatus.objects.update_or_create(
        stock_movement=movement,
        defaults={
            "status": status,
            "ar_no": (ar_no or "").strip(),
            "chemist": (chemist or "").strip(),
            "remarks": (remarks or "").strip(),
            "decided_by": actor,
            "decided_at": now,
        },
    )
    record(
        actor=actor,
        action="lot_quality_status.set",
        target_type="stock_movement",
        target_id=movement.id,
        company=movement.source_company,
        store=movement.store,
        after={"status": obj.status, "ar_no": obj.ar_no},
    )
    return obj


def approve_receipt_lots(*, actor, goods_receipt_id, remarks="Incoming QC approved."):
    """Release every RECEIPT_IN lot on a posted goods receipt for issue.

    Used after incoming QC approve (and by tests that seed issueable stock).
    """
    movements = StockMovement.objects.filter(
        source_goods_receipt_id=goods_receipt_id,
        movement_type=StockMovement.MovementType.RECEIPT_IN,
    )
    released = []
    for movement in movements:
        released.append(
            set_lot_quality_status(
                actor=actor,
                stock_movement_id=movement.id,
                status=LotQualityStatus.Status.APPROVED,
                remarks=remarks,
            )
        )
    return released


@transaction.atomic
def decide_material_return_disposition(*, actor, return_id, disposition, reason=""):
    """HELD_UNASSESSED -> RELEASED_USABLE or QUARANTINE_REJECTED.

    RELEASED_USABLE adds the quantity back into issue-eligible
    `net_quantity`. QUARANTINE_REJECTED keeps it out of issue eligibility
    while remaining visible on physical book quantity.
    """
    if disposition not in ("RELEASED_USABLE", "QUARANTINE_REJECTED"):
        raise DjangoValidationError({
            "disposition": "Disposition decision must be RELEASED_USABLE or QUARANTINE_REJECTED.",
        })
    material_return = MaterialReturn.objects.select_for_update().select_related(
        "source_company", "store", "material", "unit"
    ).get(pk=return_id)
    if material_return.disposition != "HELD_UNASSESSED":
        raise DjangoValidationError({
            "detail": f"Only HELD_UNASSESSED returns can be dispositioned (current: {material_return.disposition}).",
        })
    before = {"disposition": material_return.disposition}
    material_return.disposition = disposition
    material_return.disposition_decided_by = actor
    material_return.disposition_decided_at = timezone.now()
    material_return.disposition_reason = (reason or "").strip()
    material_return.save(
        update_fields=[
            "disposition", "disposition_decided_by", "disposition_decided_at", "disposition_reason",
        ]
    )
    record(
        actor=actor,
        action="material_return.disposition_decided",
        target_type="material_return",
        target_id=material_return.id,
        company=material_return.source_company,
        store=material_return.store,
        before=before,
        after={"disposition": disposition, "quantity": str(material_return.quantity)},
    )
    return material_return

