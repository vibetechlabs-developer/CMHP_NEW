from django.db.models import Sum

from apps.companies.services import active_companies_for_user
from apps.permissions.services import user_has_permission
from apps.stock_movements.models import StockMovement

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
