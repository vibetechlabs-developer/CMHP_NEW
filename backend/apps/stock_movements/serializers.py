from decimal import Decimal

from django.db.models import Q
from rest_framework import serializers

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
from apps.suppliers.models import Supplier

# Attached to every list/detail/balance response in this app - see
# apps.stock_movements.views. Never named available_stock/usable_stock/
# on_hand anywhere; always paired with this notice so a reader cannot
# mistake a recorded-receipt total for complete physical stock.
#
# `issued_quantity_tracked` became True once MaterialIssue/
# MaterialIssueMovement existed (a plain received-minus-issued ledger
# number). `returns_reservations_release_tracked` is kept at its
# original False value and meaning (every existing test/caller reading
# it is unaffected) - it still means "reservations AND QC release are
# BOTH tracked", and neither is, even now that returns/defects/disposal
# are. `returns_and_disposals_tracked` is a NEW, separate, additive flag
# for exactly that distinct fact (see ProductionCustody/MaterialReturn/
# ProductionFloorEvent/apps.stock_movements.services.
# compute_returned_balances) - added once production-custody tracking
# existed, rather than silently leaving the old combined flag/notice
# text claiming returns are untracked when they no longer are.
COVERAGE_NOTICE = {
    "historical_receipts_backfilled": False,
    "opening_stock_included": False,
    "issued_quantity_tracked": True,
    "returns_and_disposals_tracked": True,
    "returns_reservations_release_tracked": False,
    "release_status": "Not tracked",
    "notice": (
        "Inward totals reflect only RECEIPT_IN movements recorded since this feature was installed; "
        "outward totals reflect only posted material issues recorded since the issue feature was installed. "
        "Historical receipts/issues from before either feature existed are not backfilled. Opening stock is "
        "not included. Production-floor returns, defect classifications and authorized disposals ARE tracked "
        "(see production custody) and 'book_quantity' below reflects returned-but-unassessed material; "
        "reservations and QC release are still NOT tracked anywhere in this system. The net ledger balance "
        "('net_quantity') is NOT complete physical stock and is never a QC-released or usable-stock claim - a "
        "returned quantity is never automatically re-issuable. See 'net_quantity' (issue-eligible, received "
        "minus issued only) vs 'book_quantity' (additionally includes returns) below."
    ),
}


class StockMovementSerializer(serializers.ModelSerializer):
    """Read-only. `source_company` is labeled exactly that — never
    `owning_company` — to avoid implying a legal-ownership answer this
    task does not provide. `release_status` is always the literal string
    "Not tracked", never a computed zero.
    """

    source_goods_receipt_id = serializers.IntegerField(source="source_goods_receipt.id", read_only=True)
    source_goods_receipt_reference = serializers.CharField(source="source_goods_receipt.reference", read_only=True)
    # The receipt's own physical-arrival date - distinct from `posted_at`
    # below (the posting EVENT time). Material-register task: shown
    # explicitly so a reader never confuses "when it arrived" with "when
    # it was posted into this system" (they can differ by days).
    source_goods_receipt_arrived_at = serializers.DateTimeField(source="source_goods_receipt.arrived_at", read_only=True)
    source_receipt_line_id = serializers.IntegerField(source="source_receipt_line.id", read_only=True)
    source_company_id = serializers.IntegerField(source="source_company.id", read_only=True)
    source_company_code = serializers.CharField(source="source_company.code", read_only=True)
    material_id = serializers.IntegerField(read_only=True)
    unit_id = serializers.IntegerField(read_only=True)
    posted_by_id = serializers.IntegerField(read_only=True)
    release_status = serializers.SerializerMethodField()
    # Supplier identity only (never price/amount/currency - same
    # restraint apps.receiving.serializers.EligiblePurchaseOrderSerializer
    # already applies to supplier exposure). Gated by the SAME
    # accessible-company filter every movement already passes through
    # apps.stock_movements.services.stock_movements_queryset - no
    # separate or looser permission check is introduced for this.
    supplier_id = serializers.IntegerField(source="source_goods_receipt.source_purchase_order.supplier.id", read_only=True)
    supplier_code = serializers.SerializerMethodField()
    supplier_name = serializers.SerializerMethodField()
    # Container detail lives on GoodsReceiptLine, not on StockMovement
    # itself - traversed read-only through the existing source_receipt_
    # line FK (material-register task). SerializerMethodField, not a
    # plain dotted `source=`, because container_type is optional and a
    # naive source="source_receipt_line.container_type.code" raises an
    # uncaught AttributeError for every line with none set - the exact
    # bug class already fixed once this session for Material.default_
    # container_type_id (see apps.catalog.serializers.MaterialSerializer).
    source_invoice_reference = serializers.CharField(
        source="source_goods_receipt.supplier_invoice_reference", read_only=True
    )
    source_delivery_note_reference = serializers.CharField(
        source="source_goods_receipt.delivery_note_reference", read_only=True
    )
    container_type_code = serializers.SerializerMethodField()
    container_quantity = serializers.SerializerMethodField()
    # Read-only, historical price basis - sourced from the PurchaseOrder-
    # IssueLineSnapshot the receipt line was created against (Task 08C-2's
    # permanent issue-time copy), NEVER the live PurchaseOrderLine - a PO's
    # own unit_price can change after issue (see apps.purchasing.models.
    # PurchaseOrderLine), and showing that live, possibly-since-changed
    # figure as if it were the original receipt's price would misrepresent
    # history. Gated by the exact same accessible-company filter every
    # other field on this movement already passes through (never a
    # separate or looser check) - a caller who cannot see the movement at
    # all never reaches this field; one who can already implicitly holds
    # purchase_orders.view in that company, the same permission that
    # already gates supplier_id/supplier_code/supplier_name above. Never a
    # per-container price: it is the PO line's own per-unit price, exactly
    # as ordered - `pricing_unit_code` states which unit that price is per,
    # so a caller never assumes it is per-container.
    unit_price = serializers.SerializerMethodField()
    pricing_unit_code = serializers.SerializerMethodField()
    currency_code = serializers.SerializerMethodField()

    class Meta:
        model = StockMovement
        fields = [
            "id",
            "movement_type",
            "source_goods_receipt_id",
            "source_goods_receipt_reference",
            "source_goods_receipt_arrived_at",
            "source_invoice_reference",
            "source_delivery_note_reference",
            "source_receipt_line_id",
            "store_id",
            "source_company_id",
            "source_company_code",
            "supplier_id",
            "supplier_code",
            "supplier_name",
            "material_id",
            "material_code_snapshot",
            "material_name_snapshot",
            "unit_id",
            "unit_code_snapshot",
            "unit_name_snapshot",
            "quantity",
            "lot_reference",
            "container_type_code",
            "container_quantity",
            "unit_price",
            "pricing_unit_code",
            "currency_code",
            "release_status",
            "posted_by_id",
            "posted_at",
            "created_at",
        ]
        read_only_fields = fields

    def get_release_status(self, obj):
        return "Not tracked"

    def get_supplier_code(self, obj):
        purchase_order = obj.source_goods_receipt.source_purchase_order
        if purchase_order is not None and purchase_order.supplier:
            return purchase_order.supplier.code
        name = (obj.source_goods_receipt.supplier_name or "").strip()
        if name and name.upper() != "STOCK":
            sup = Supplier.objects.filter(
                Q(display_name__iexact=name) | Q(legal_name__iexact=name) | Q(code__iexact=name)
            ).first()
            if sup:
                return sup.code
        return None

    def get_supplier_name(self, obj):
        purchase_order = obj.source_goods_receipt.source_purchase_order
        if purchase_order is not None:
            supplier = purchase_order.supplier
            return supplier.display_name or supplier.legal_name
        # MANUAL ENTRY MODE receipt (no PO) - free-text supplier_name on
        # the receipt itself, never a claim that it exists in the real
        # Supplier catalog (see GoodsReceipt.supplier_name's own
        # docstring).
        return obj.source_goods_receipt.supplier_name or None

    def get_container_type_code(self, obj):
        line = obj.source_receipt_line
        return line.container_type.code if line and line.container_type_id else None

    def get_container_quantity(self, obj):
        line = obj.source_receipt_line
        return line.container_quantity if line else None

    def get_unit_price(self, obj):
        line = obj.source_receipt_line
        if not line:
            return None
        if line.source_po_line_id:
            return line.source_po_line.unit_price_snapshot
        # MANUAL ENTRY MODE line - its own directly-entered price.
        return line.unit_price

    def get_pricing_unit_code(self, obj):
        line = obj.source_receipt_line
        if not line:
            return None
        if line.source_po_line_id:
            return line.source_po_line.unit_code_snapshot
        # A manual line's price is always per its own (material base)
        # unit - same snapshot the quantity itself is already shown in.
        return line.unit_code_snapshot

    def get_currency_code(self, obj):
        line = obj.source_receipt_line
        if not line:
            return None
        if line.source_po_line_id:
            return line.source_po_line.issue_snapshot.currency_code_snapshot
        return line.currency_code or None


class StockBalanceSerializer(serializers.Serializer):
    """Read-only, built from apps.stock_movements.services.
    compute_stock_balances's grouped rows - not a model. One row per
    (material, unit, source_company) combination; never merged across
    units or companies.
    """

    material_id = serializers.IntegerField()
    material_code = serializers.CharField(source="material_code_snapshot")
    material_name = serializers.CharField(source="material_name_snapshot")
    unit_id = serializers.IntegerField()
    unit_code = serializers.CharField(source="unit_code_snapshot")
    unit_name = serializers.CharField(source="unit_name_snapshot")
    source_company_id = serializers.IntegerField()
    source_company_code = serializers.CharField(source="source_company__code")
    recorded_receipt_quantity = serializers.DecimalField(max_digits=14, decimal_places=3)
    release_status = serializers.SerializerMethodField()

    def get_release_status(self, obj):
        return "Not tracked"


class IssuedBalanceSerializer(serializers.Serializer):
    """Read-only, built from apps.stock_movements.services.
    compute_issued_balances's grouped rows - the issue-side counterpart
    of StockBalanceSerializer, same grouping and the same restraint
    (never merged across units or companies).
    """

    material_id = serializers.IntegerField()
    material_code = serializers.CharField(source="material_code_snapshot")
    material_name = serializers.CharField(source="material_name_snapshot")
    unit_id = serializers.IntegerField()
    unit_code = serializers.CharField(source="unit_code_snapshot")
    unit_name = serializers.CharField(source="unit_name_snapshot")
    source_company_id = serializers.IntegerField()
    source_company_code = serializers.CharField(source="source_company__code")
    recorded_issued_quantity = serializers.DecimalField(max_digits=14, decimal_places=3)


class NetBalanceSerializer(StockBalanceSerializer):
    """StockBalanceSerializer plus the matching issued total and the
    plain net (received minus issued) - used for material_register_
    balances's additive `closing_net_of_issues` field only. The net
    figure is a ledger balance, never a QC-released/usable-stock claim
    (see apps.stock_movements.services.net_recorded_balances).

    `recorded_returned_quantity`/`book_quantity` are further additive
    fields on top of that - a MaterialReturn is physically back in the
    store (always HELD_UNASSESSED - see that model's own docstring) so
    `book_quantity` reflects it, but `net_quantity` above keeps its
    exact original receipts-minus-issues meaning and is still what
    issue-eligibility is ever checked against, never `book_quantity`.
    """

    recorded_issued_quantity = serializers.DecimalField(max_digits=14, decimal_places=3)
    net_quantity = serializers.DecimalField(max_digits=14, decimal_places=3)
    recorded_returned_quantity = serializers.DecimalField(max_digits=14, decimal_places=3)
    book_quantity = serializers.DecimalField(max_digits=14, decimal_places=3)


class MaterialIssueMovementSerializer(serializers.ModelSerializer):
    """Read-only - the issue-side counterpart of StockMovementSerializer,
    shown in the register's Outward table. Never shares a queryset or an
    aggregation with StockMovement/StockMovementSerializer (see
    MaterialIssueMovement's own docstring for why they are kept
    separate).
    """

    source_material_issue_id = serializers.IntegerField(source="source_material_issue.id", read_only=True)
    source_material_issue_reference = serializers.CharField(source="source_material_issue.reference", read_only=True)
    store_id = serializers.IntegerField(read_only=True)
    source_company_id = serializers.IntegerField(read_only=True)
    source_company_code = serializers.CharField(source="source_company.code", read_only=True)
    material_id = serializers.IntegerField(read_only=True)
    unit_id = serializers.IntegerField(read_only=True)
    posted_by_id = serializers.IntegerField(read_only=True)

    class Meta:
        model = MaterialIssueMovement
        fields = [
            "id",
            "source_material_issue_id",
            "source_material_issue_reference",
            "store_id",
            "source_company_id",
            "source_company_code",
            "material_id",
            "material_code_snapshot",
            "material_name_snapshot",
            "unit_id",
            "unit_code_snapshot",
            "unit_name_snapshot",
            "quantity",
            "batch_reference",
            "product_reference",
            "remarks",
            "posted_by_id",
            "posted_at",
            "created_at",
        ]
        read_only_fields = fields


# ---------------------------------------------------------------------------
# MaterialIssue document (DRAFT/POSTED/CANCELLED) - mirrors
# apps.receiving.serializers' GoodsReceipt* serializers exactly, minus
# the PO/line structure (a MaterialIssue is single-line by design).
# ---------------------------------------------------------------------------

_ISSUE_HEADER_PROHIBITED = {
    "status", "reference", "version", "store", "store_id", "material_code_snapshot", "material_name_snapshot",
    "unit_code_snapshot", "unit_name_snapshot", "created_at", "updated_at", "created_by", "created_by_id",
    "posted_by", "posted_by_id", "posted_at", "cancelled_by", "cancelled_by_id", "cancelled_at",
    "cancellation_reason", "unit",
}


def _reject_prohibited_issue_fields(initial_data, prohibited):
    if not isinstance(initial_data, dict):
        return
    rejected = prohibited & set(initial_data.keys())
    if rejected:
        raise serializers.ValidationError(
            {field: "This field cannot be set through this endpoint." for field in sorted(rejected)}
        )


class MaterialIssueSerializer(serializers.ModelSerializer):
    store_id = serializers.IntegerField(source="store.id", read_only=True)
    store_code = serializers.CharField(source="store.code", read_only=True)
    source_company_id = serializers.IntegerField(source="source_company.id", read_only=True)
    source_company_code = serializers.CharField(source="source_company.code", read_only=True)
    material_id = serializers.IntegerField(source="material.id", read_only=True)
    material_kind = serializers.CharField(source="material.kind", read_only=True)
    unit_id = serializers.IntegerField(source="unit.id", read_only=True)
    created_by_id = serializers.IntegerField(source="created_by.id", read_only=True)
    posted_by_id = serializers.SerializerMethodField()
    cancelled_by_id = serializers.SerializerMethodField()

    class Meta:
        model = MaterialIssue
        fields = [
            "id",
            "reference",
            "idempotency_key",
            "store_id",
            "store_code",
            "source_company_id",
            "source_company_code",
            "material_id",
            "material_kind",
            "material_code_snapshot",
            "material_name_snapshot",
            "unit_id",
            "unit_code_snapshot",
            "unit_name_snapshot",
            "status",
            "issued_quantity",
            "issued_at",
            "batch_reference",
            "product_reference",
            "remarks",
            "created_by_id",
            "created_at",
            "updated_at",
            "posted_by_id",
            "posted_at",
            "cancelled_by_id",
            "cancelled_at",
            "cancellation_reason",
            "version",
        ]
        read_only_fields = fields

    def get_posted_by_id(self, obj):
        return obj.posted_by_id

    def get_cancelled_by_id(self, obj):
        return obj.cancelled_by_id


class MaterialIssueCreateSerializer(serializers.Serializer):
    """`store` comes from the URL; `source_company_id`/`material_id` are
    both required and explicitly chosen by the caller - there is no
    purchase order to derive either from (see MaterialIssue's own
    docstring). `unit` is always the material's own base unit, never
    independently accepted.
    """

    source_company_id = serializers.IntegerField()
    material_id = serializers.IntegerField()
    unit_id = serializers.IntegerField(required=False, allow_null=True)
    issued_quantity = serializers.DecimalField(max_digits=14, decimal_places=3, min_value=Decimal("0.001"))
    issued_at = serializers.DateTimeField()
    batch_reference = serializers.CharField(required=False, allow_blank=True, max_length=100, default="")
    product_reference = serializers.CharField(required=False, allow_blank=True, max_length=255, default="")
    remarks = serializers.CharField(required=False, allow_blank=True, max_length=2000, default="")
    idempotency_key = serializers.CharField(required=False, allow_blank=True, max_length=100, default="")

    def validate(self, attrs):
        _reject_prohibited_issue_fields(self.initial_data, _ISSUE_HEADER_PROHIBITED)
        return attrs


class MaterialIssueUpdateSerializer(serializers.Serializer):
    """PATCH-only, DRAFT only. `expected_version` is always required.
    `source_company`/`material`/`unit` are immutable after creation -
    only the remaining header fields may change.
    """

    expected_version = serializers.IntegerField()
    issued_quantity = serializers.DecimalField(max_digits=14, decimal_places=3, min_value=Decimal("0.001"), required=False)
    issued_at = serializers.DateTimeField(required=False)
    batch_reference = serializers.CharField(required=False, allow_blank=True, max_length=100)
    product_reference = serializers.CharField(required=False, allow_blank=True, max_length=255)
    remarks = serializers.CharField(required=False, allow_blank=True, max_length=2000)

    def validate(self, attrs):
        _reject_prohibited_issue_fields(self.initial_data, _ISSUE_HEADER_PROHIBITED | {"source_company_id", "material_id"})
        return attrs


class MaterialIssueVersionSerializer(serializers.Serializer):
    expected_version = serializers.IntegerField()


class MaterialIssueCancelSerializer(serializers.Serializer):
    expected_version = serializers.IntegerField()
    cancellation_reason = serializers.CharField(max_length=1000, allow_blank=False)


class NetRecordedBalanceSerializer(serializers.Serializer):
    """Read-only - apps.stock_movements.services.net_recorded_balances's
    own output shape, used by the Issue Outward form to show what is
    available to issue. A plain ledger number, never a QC/usable-stock
    claim - see that function's own docstring.

    unit_code/unit_name/source_company_code were previously computed by
    the service/view but silently dropped here (an undeclared DRF
    serializer field is stripped, not a pass-through) - the Issue
    Outward modal's company/unit labels were rendering blank because of
    it. Declared explicitly now, matching StockBalanceSerializer's own
    field names for the same data.

    `recorded_returned_quantity`/`book_quantity` are additive (see
    net_recorded_balances's own docstring) - `net_quantity`, never
    `book_quantity`, is still what the Issue Outward form must compare
    a proposed issue against; `book_quantity` exists for physical
    book-keeping/register display only.
    """

    unit_id = serializers.IntegerField()
    unit_code = serializers.CharField()
    unit_name = serializers.CharField()
    source_company_id = serializers.IntegerField()
    source_company_code = serializers.CharField()
    recorded_receipt_quantity = serializers.DecimalField(max_digits=14, decimal_places=3)
    recorded_issued_quantity = serializers.DecimalField(max_digits=14, decimal_places=3)
    net_quantity = serializers.DecimalField(max_digits=14, decimal_places=3)
    recorded_returned_quantity = serializers.DecimalField(max_digits=14, decimal_places=3)
    book_quantity = serializers.DecimalField(max_digits=14, decimal_places=3)


class ProductionFloorEventSerializer(serializers.ModelSerializer):
    recorded_by_id = serializers.IntegerField(source="recorded_by.id", read_only=True)
    recorded_by_username = serializers.CharField(source="recorded_by.username", read_only=True)

    class Meta:
        model = ProductionFloorEvent
        fields = [
            "id",
            "event_type",
            "quantity",
            "reason",
            "disposal_policy",
            "notes",
            "recorded_by_id",
            "recorded_by_username",
            "created_at",
        ]
        read_only_fields = fields


class ProductionCustodySerializer(serializers.ModelSerializer):
    source_issue_id = serializers.IntegerField(source="source_issue.id", read_only=True)
    source_issue_reference = serializers.CharField(source="source_issue.reference", read_only=True)
    store_id = serializers.IntegerField(source="store.id", read_only=True)
    source_company_id = serializers.IntegerField(source="source_company.id", read_only=True)
    source_company_code = serializers.CharField(source="source_company.code", read_only=True)
    material_id = serializers.IntegerField(source="material.id", read_only=True)
    material_code = serializers.CharField(source="material.code", read_only=True)
    material_name = serializers.CharField(source="material.name", read_only=True)
    unit_id = serializers.IntegerField(source="unit.id", read_only=True)
    unit_code = serializers.CharField(source="unit.code", read_only=True)
    remaining_quantity = serializers.DecimalField(max_digits=14, decimal_places=3, read_only=True)
    sound_quantity = serializers.DecimalField(max_digits=14, decimal_places=3, read_only=True)
    floor_events = ProductionFloorEventSerializer(many=True, read_only=True)

    class Meta:
        model = ProductionCustody
        fields = [
            "id",
            "source_issue_id",
            "source_issue_reference",
            "store_id",
            "source_company_id",
            "source_company_code",
            "material_id",
            "material_code",
            "material_name",
            "unit_id",
            "unit_code",
            "batch_reference",
            "product_reference",
            "issued_quantity",
            "consumed_quantity",
            "returned_quantity",
            "damaged_quantity",
            "disposed_quantity",
            "remaining_quantity",
            "sound_quantity",
            "version",
            "floor_events",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class MaterialReturnSerializer(serializers.ModelSerializer):
    """Read-only - one row per recorded `MaterialReturn` (see that
    model's own docstring: always created with `disposition=
    "HELD_UNASSESSED"` by `apps.stock_movements.services.
    record_unused_or_defective_return`; no release/quarantine
    transition exists anywhere in this codebase yet, so `disposition`
    is never anything else today - this serializer does not invent one).
    Has no `reference`/`*_snapshot` columns (a newer, smaller model than
    MaterialIssue) - labels are read live off the FK relations.
    """

    source_custody_id = serializers.IntegerField(source="source_custody.id", read_only=True)
    source_issue_id = serializers.IntegerField(source="source_issue.id", read_only=True)
    source_issue_reference = serializers.CharField(source="source_issue.reference", read_only=True)
    store_id = serializers.IntegerField(source="store.id", read_only=True)
    source_company_id = serializers.IntegerField(source="source_company.id", read_only=True)
    source_company_code = serializers.CharField(source="source_company.code", read_only=True)
    material_id = serializers.IntegerField(source="material.id", read_only=True)
    material_code = serializers.CharField(source="material.code", read_only=True)
    material_name = serializers.CharField(source="material.name", read_only=True)
    material_kind = serializers.CharField(source="material.kind", read_only=True)
    unit_id = serializers.IntegerField(source="unit.id", read_only=True)
    unit_code = serializers.CharField(source="unit.code", read_only=True)
    recorded_by_id = serializers.IntegerField(source="recorded_by.id", read_only=True)
    recorded_by_username = serializers.CharField(source="recorded_by.username", read_only=True)

    class Meta:
        model = MaterialReturn
        fields = [
            "id",
            "source_custody_id",
            "source_issue_id",
            "source_issue_reference",
            "store_id",
            "source_company_id",
            "source_company_code",
            "material_id",
            "material_code",
            "material_name",
            "material_kind",
            "unit_id",
            "unit_code",
            "return_type",
            "quantity",
            "disposition",
            "batch_reference",
            "reason",
            "recorded_by_id",
            "recorded_by_username",
            "created_at",
        ]
        read_only_fields = fields


class ProductionConsumptionSerializer(serializers.Serializer):
    quantity = serializers.DecimalField(max_digits=14, decimal_places=3, min_value=Decimal("0.001"))
    notes = serializers.CharField(required=False, allow_blank=True, max_length=1000)
    expected_version = serializers.IntegerField(required=False)


class ProductionDefectClassificationSerializer(serializers.Serializer):
    quantity = serializers.DecimalField(max_digits=14, decimal_places=3, min_value=Decimal("0.001"))
    reason = serializers.CharField(required=False, allow_blank=True, max_length=500)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=1000)
    expected_version = serializers.IntegerField(required=False)


class ProductionReturnSerializer(serializers.Serializer):
    return_type = serializers.ChoiceField(choices=["UNUSED", "DEFECTIVE"])
    quantity = serializers.DecimalField(max_digits=14, decimal_places=3, min_value=Decimal("0.001"))
    reason = serializers.CharField(required=False, allow_blank=True, max_length=500)
    expected_version = serializers.IntegerField(required=False)


class ProductionDisposalSerializer(serializers.Serializer):
    quantity = serializers.DecimalField(max_digits=14, decimal_places=3, min_value=Decimal("0.001"))
    disposal_policy = serializers.CharField(max_length=255, allow_blank=False)
    reason = serializers.CharField(required=False, allow_blank=True, max_length=500)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=1000)
    expected_version = serializers.IntegerField(required=False)


class PhysicalCountDraftSerializer(serializers.ModelSerializer):
    material_code = serializers.CharField(source="material.code", read_only=True)
    material_name = serializers.CharField(source="material.name", read_only=True)
    unit_code = serializers.CharField(source="unit.code", read_only=True)
    recorded_by_username = serializers.CharField(source="recorded_by.username", read_only=True)

    class Meta:
        model = PhysicalCountDraft
        fields = [
            "id",
            "store_id",
            "material_id",
            "material_code",
            "material_name",
            "unit_id",
            "unit_code",
            "scope",
            "cutoff_date",
            "book_reference_quantity",
            "actual_count_quantity",
            "discrepancy_quantity",
            "reason",
            "status",
            "posting_blocker_reason",
            "recorded_by_username",
            "recorded_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class PhysicalCountDraftCreateSerializer(serializers.Serializer):
    material_id = serializers.IntegerField()
    unit_id = serializers.IntegerField()
    book_reference_quantity = serializers.DecimalField(max_digits=14, decimal_places=3)
    actual_count_quantity = serializers.DecimalField(max_digits=14, decimal_places=3)
    reason = serializers.CharField(required=False, allow_blank=True, max_length=500)
    scope = serializers.CharField(required=False, default="STORE_PHYSICAL", max_length=100)


class CutoverStockDraftSerializer(serializers.ModelSerializer):
    material_code = serializers.CharField(source="material.code", read_only=True)
    material_name = serializers.CharField(source="material.name", read_only=True)
    unit_code = serializers.CharField(source="unit.code", read_only=True)
    recorded_by_username = serializers.CharField(source="recorded_by.username", read_only=True)

    class Meta:
        model = CutoverStockDraft
        fields = [
            "id",
            "store_id",
            "material_id",
            "material_code",
            "material_name",
            "unit_id",
            "unit_code",
            "effective_date",
            "quantity",
            "source_reference",
            "remarks",
            "status",
            "posting_blocker_reason",
            "recorded_by_username",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class CutoverStockDraftCreateSerializer(serializers.Serializer):
    material_id = serializers.IntegerField()
    unit_id = serializers.IntegerField()
    effective_date = serializers.DateField()
    quantity = serializers.DecimalField(max_digits=14, decimal_places=3, min_value=Decimal("0.000"))
    source_reference = serializers.CharField(max_length=255, allow_blank=False)
    remarks = serializers.CharField(required=False, allow_blank=True)

