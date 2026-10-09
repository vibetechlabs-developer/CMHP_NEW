from rest_framework import serializers

from apps.stock_movements.models import StockMovement

# Attached to every list/detail/balance response in this app - see
# apps.stock_movements.views. Never named available_stock/usable_stock/
# on_hand anywhere; always paired with this notice so a reader cannot
# mistake a recorded-receipt total for complete physical stock.
COVERAGE_NOTICE = {
    "historical_receipts_backfilled": False,
    "opening_stock_included": False,
    "issues_returns_release_tracked": False,
    "release_status": "Not tracked",
    "notice": (
        "This total reflects only RECEIPT_IN movements recorded since this feature was installed. "
        "Historical receipts posted before this feature existed are not backfilled. Opening stock is not "
        "included. Issues, returns, reservations and QC release are not tracked anywhere in this system yet. "
        "This is NOT complete physical stock — see 'recorded_receipt_quantity' below, not an available or "
        "usable balance."
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
    supplier_code = serializers.CharField(source="source_goods_receipt.source_purchase_order.supplier.code", read_only=True)
    supplier_name = serializers.SerializerMethodField()

    class Meta:
        model = StockMovement
        fields = [
            "id",
            "movement_type",
            "source_goods_receipt_id",
            "source_goods_receipt_reference",
            "source_goods_receipt_arrived_at",
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
            "release_status",
            "posted_by_id",
            "posted_at",
            "created_at",
        ]
        read_only_fields = fields

    def get_release_status(self, obj):
        return "Not tracked"

    def get_supplier_name(self, obj):
        supplier = obj.source_goods_receipt.source_purchase_order.supplier
        return supplier.display_name or supplier.legal_name


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
