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
    MaterialIssue,
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
    StockMovement.objects.bulk_create(movements)
    return movements


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
        )
    )


def compute_stock_balances(*, store, accessible_companies, material_id=None, posted_from=None, posted_to=None):
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

    This is deliberately labeled "recorded receipt quantity" wherever it
    is surfaced (never available_stock/usable_stock/on_hand) - see
    apps.stock_movements.views for the coverage metadata every response
    carries alongside it.
    """
    queryset = stock_movements_queryset(store=store, accessible_companies=accessible_companies)
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


def compute_returned_balances(*, store, accessible_companies, material_id=None, created_from=None, created_to=None):
    """Recorded `MaterialReturn` totals, grouped by (material, unit,
    source_company) - the physical-return counterpart of
    compute_issued_balances, same grouping, same "never merge across
    units or companies" rule. A `MaterialReturn` is created with
    `disposition="HELD_UNASSESSED"` (see that model's own docstring) and
    this function does not change that - it only totals the recorded
    physical quantity that came back into the store under ANY
    disposition, for `net_recorded_balances`'s own additive `book_
    quantity` field below. Never merged into `net_recorded_balances`'s
    pre-existing `net_quantity` (the issue-eligibility figure
    `post_material_issue` caps against) - a return must never make
    itself automatically re-issuable.

    `MaterialReturn` has no `*_snapshot` columns (unlike
    MaterialIssueMovement) - it is a newer, smaller model - so labels
    are read live off the FK relations instead; still store/company-
    access-filtered the same way as every other aggregation here.
    """
    queryset = MaterialReturn.objects.filter(store=store, source_company__in=accessible_companies)
    if material_id is not None:
        queryset = queryset.filter(material_id=material_id)
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
    for row in compute_stock_balances(store=store, accessible_companies=accessible_companies, material_id=material_id):
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

    keys = set(received) | set(issued) | set(returned)
    results = []
    for unit_id, company_id in keys:
        received_qty = received.get((unit_id, company_id), Decimal("0"))
        issued_qty = issued.get((unit_id, company_id), Decimal("0"))
        returned_qty = returned.get((unit_id, company_id), Decimal("0"))
        unit_code, unit_name = unit_labels.get(unit_id, ("", ""))
        net_quantity = received_qty - issued_qty
        results.append({
            "unit_id": unit_id,
            "unit_code": unit_code,
            "unit_name": unit_name,
            "source_company_id": company_id,
            "recorded_receipt_quantity": received_qty,
            "recorded_issued_quantity": issued_qty,
            "net_quantity": net_quantity,
            "recorded_returned_quantity": returned_qty,
            "book_quantity": net_quantity + returned_qty,
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
    }


def _create_issue_header_with_unique_reference(
    *, store, actor, source_company, material, unit, issued_quantity, issued_at,
    batch_reference, product_reference, remarks, idempotency_key,
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
    *, actor, store, source_company_id, material_id, issued_quantity, issued_at,
    unit_id=None, batch_reference="", product_reference="", remarks="", idempotency_key="",
):
    """Creates a DRAFT MaterialIssue - mirrors create_goods_receipt's own
    idempotency-key handling exactly (a repeat with identical content is
    a safe no-op; a repeat with different content is a 409 Conflict).
    No quantity cap is enforced here - same "complete only at posting"
    convention as create_goods_receipt (see post_material_issue).
    """
    idempotency_key = (idempotency_key or "").strip()
    batch_reference = (batch_reference or "").strip()
    product_reference = (product_reference or "").strip()
    remarks = remarks or ""

    source_company = get_object_or_404(Company, pk=source_company_id)
    material = get_object_or_404(Material.objects.select_related("base_unit"), pk=material_id)
    if unit_id:
        unit = get_object_or_404(UnitOfMeasure, pk=unit_id)
    else:
        unit = material.base_unit

    if issued_quantity is None or Decimal(issued_quantity) <= 0:
        raise DjangoValidationError({"issued_quantity": "Issued quantity must be greater than zero."})

    if idempotency_key:
        existing = MaterialIssue.objects.filter(idempotency_key=idempotency_key).first()
        if existing is not None:
            proposed = {
                "source_company_id": source_company.id,
                "issued_quantity": str(Decimal(issued_quantity)),
                "issued_at": issued_at,
                "batch_reference": batch_reference,
                "product_reference": product_reference,
                "remarks": remarks,
            }
            actual = {
                "source_company_id": existing.source_company_id,
                "issued_quantity": str(existing.issued_quantity),
                "issued_at": existing.issued_at,
                "batch_reference": existing.batch_reference,
                "product_reference": existing.product_reference,
                "remarks": existing.remarks,
            }
            if proposed == actual and existing.material_id == material.id and existing.unit_id == unit.id and existing.store_id == store.id:
                return existing
            raise Conflict(
                "This idempotency_key was already used to create a different material issue. "
                "Use a new key, or refetch and confirm the existing one."
            )

    material_issue = _create_issue_header_with_unique_reference(
        store=store, actor=actor, source_company=source_company, material=material, unit=unit,
        issued_quantity=issued_quantity, issued_at=issued_at, batch_reference=batch_reference,
        product_reference=product_reference, remarks=remarks, idempotency_key=idempotency_key,
    )

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
    """DRAFT only (400 otherwise). `data` may contain any subset of
    issued_quantity/issued_at/batch_reference/product_reference/remarks -
    source_company/material/unit are immutable after creation (mirrors
    GoodsReceipt.company's own "copied at creation, never independently
    editable" rule).
    """
    material_issue = MaterialIssue.objects.select_for_update().get(pk=material_issue_id)
    if material_issue.version != expected_version:
        raise Conflict("This material issue has changed since it was last read. Refetch and retry.")
    if material_issue.status != MaterialIssue.Status.DRAFT:
        raise DjangoValidationError({"detail": "Only a draft material issue can be edited."})

    before = _issue_header_snapshot(material_issue)
    changed = False
    if "issued_quantity" in data and Decimal(data["issued_quantity"]) != material_issue.issued_quantity:
        if Decimal(data["issued_quantity"]) <= 0:
            raise DjangoValidationError({"issued_quantity": "Issued quantity must be greater than zero."})
        material_issue.issued_quantity = data["issued_quantity"]
        changed = True
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

    # Serializes concurrent posts for this material before either reads
    # the net balance below - see the concurrency note above.
    Material.objects.select_for_update().get(pk=material_issue.material_id)

    accessible_companies = [material_issue.source_company]
    balances = net_recorded_balances(
        store=material_issue.store, accessible_companies=accessible_companies, material_id=material_issue.material_id,
    )
    row = next(
        (b for b in balances if b["unit_id"] == material_issue.unit_id and b["source_company_id"] == material_issue.source_company_id),
        None,
    )
    net_available = row["net_quantity"] if row else Decimal("0")
    if material_issue.issued_quantity > net_available:
        raise DjangoValidationError({
            "detail": (
                f"Posting {material_issue.issued_quantity} {material_issue.unit_code_snapshot} would exceed the "
                f"recorded net balance ({net_available} {material_issue.unit_code_snapshot}) for "
                f"{material_issue.material_code_snapshot} / {material_issue.source_company.code} at this store. "
                "This is a recorded-ledger check only, not a QC-release or reservation decision."
            )
        })

    before = {"status": material_issue.status}
    posted_at = timezone.now()
    material_issue.status = MaterialIssue.Status.POSTED
    material_issue.posted_by = actor
    material_issue.posted_at = posted_at
    material_issue.version += 1
    material_issue.save(update_fields=["status", "posted_by", "posted_at", "version", "updated_at"])

    movement = MaterialIssueMovement(
        source_material_issue=material_issue,
        store=material_issue.store,
        source_company=material_issue.source_company,
        material_id=material_issue.material_id,
        unit_id=material_issue.unit_id,
        quantity=material_issue.issued_quantity,
        material_code_snapshot=material_issue.material_code_snapshot,
        material_name_snapshot=material_issue.material_name_snapshot,
        unit_code_snapshot=material_issue.unit_code_snapshot,
        unit_name_snapshot=material_issue.unit_name_snapshot,
        batch_reference=material_issue.batch_reference,
        product_reference=material_issue.product_reference,
        remarks=material_issue.remarks,
        posted_by=actor,
        posted_at=posted_at,
    )
    movement.save()

    ProductionCustody.objects.get_or_create(
        source_issue=material_issue,
        defaults={
            "store": material_issue.store,
            "source_company": material_issue.source_company,
            "material": material_issue.material,
            "unit": material_issue.unit,
            "batch_reference": material_issue.batch_reference,
            "product_reference": material_issue.product_reference,
            "issued_quantity": material_issue.issued_quantity,
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
        after={"status": material_issue.status, "posted_by_id": actor.id, "movement_id": movement.id, "quantity": str(movement.quantity)},
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

