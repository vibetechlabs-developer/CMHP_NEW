from decimal import Decimal

from rest_framework import serializers

from apps.purchasing.models import PurchaseOrder
from apps.receiving.models import GoodsReceipt, GoodsReceiptLine

# Same convention as apps.purchasing.serializers: fields explicitly
# rejected (400), not silently ignored, if present in the request body.
# `status`/`reference`/`version`/the actor+timestamp fields/
# `cancellation_reason` are all server-managed; `store`/`company`/
# `source_purchase_order` come exclusively from the URL/body's
# `source_purchase_order_id` (resolved server-side, company always
# derived from the PO - never independently accepted); `material`/
# `unit`/pricing fields do not exist anywhere on this model at all - no
# commercial data is ever accepted or exposed by this app (see
# apps.receiving.views' explicit scope note).
_HEADER_PROHIBITED = {
    "status",
    "reference",
    "version",
    "store",
    "store_id",
    "company",
    "company_id",
    "source_purchase_order",
    "created_at",
    "updated_at",
    "created_by",
    "created_by_id",
    "posted_by",
    "posted_by_id",
    "posted_at",
    "cancelled_by",
    "cancelled_by_id",
    "cancelled_at",
    "cancellation_reason",
    "unit_price",
    "line_amount",
    "currency_code",
}

# A line may only ever say "this source PO line, this received quantity,
# this optional lot reference" - material/unit are always server-derived
# from the source PO line's own issue-time snapshot, never accepted
# directly.
_LINE_PROHIBITED = {
    "id",
    "goods_receipt",
    "goods_receipt_id",
    "line_number",
    "material",
    "material_id",
    "unit",
    "unit_id",
    "material_code_snapshot",
    "material_name_snapshot",
    "unit_code_snapshot",
    "unit_name_snapshot",
}


def _reject_prohibited_fields(initial_data, prohibited):
    if not isinstance(initial_data, dict):
        return
    rejected = prohibited & set(initial_data.keys())
    if rejected:
        raise serializers.ValidationError(
            {field: "This field cannot be set through this endpoint." for field in sorted(rejected)}
        )


class GoodsReceiptLineSerializer(serializers.ModelSerializer):
    source_po_line_id = serializers.IntegerField(source="source_po_line.id", read_only=True)
    material_id = serializers.IntegerField(source="material.id", read_only=True)
    material_code = serializers.CharField(source="material.code", read_only=True)
    material_name = serializers.CharField(source="material.name", read_only=True)
    unit_id = serializers.IntegerField(source="unit.id", read_only=True)
    unit_code = serializers.CharField(source="unit.code", read_only=True)
    unit_name = serializers.CharField(source="unit.name", read_only=True)

    class Meta:
        model = GoodsReceiptLine
        fields = [
            "id",
            "line_number",
            "source_po_line_id",
            "material_id",
            "material_code",
            "material_name",
            "unit_id",
            "unit_code",
            "unit_name",
            "received_quantity",
            "lot_reference",
            "material_code_snapshot",
            "material_name_snapshot",
            "unit_code_snapshot",
            "unit_name_snapshot",
        ]
        read_only_fields = fields


class GoodsReceiptSerializer(serializers.ModelSerializer):
    """Deliberately exposes only material/quantity/lot detail - no
    supplier price, line amount, or commercial total appears anywhere
    on this serializer, even though the source PurchaseOrder carries
    them; receiving is a physical-arrival record, not a commercial one
    (see apps.receiving.models.GoodsReceipt's docstring).
    """

    store_id = serializers.IntegerField(source="store.id", read_only=True)
    store_code = serializers.CharField(source="store.code", read_only=True)
    company_id = serializers.IntegerField(source="company.id", read_only=True)
    company_code = serializers.CharField(source="company.code", read_only=True)
    source_purchase_order_id = serializers.IntegerField(source="source_purchase_order.id", read_only=True)
    source_purchase_order_reference = serializers.CharField(
        source="source_purchase_order.reference", read_only=True
    )
    created_by_id = serializers.IntegerField(source="created_by.id", read_only=True)
    posted_by_id = serializers.SerializerMethodField()
    cancelled_by_id = serializers.SerializerMethodField()
    lines = GoodsReceiptLineSerializer(many=True, read_only=True)

    class Meta:
        model = GoodsReceipt
        fields = [
            "id",
            "reference",
            "idempotency_key",
            "store_id",
            "store_code",
            "company_id",
            "company_code",
            "source_purchase_order_id",
            "source_purchase_order_reference",
            "status",
            "arrived_at",
            "delivery_note_reference",
            "notes",
            "created_by_id",
            "created_at",
            "updated_at",
            "posted_by_id",
            "posted_at",
            "cancelled_by_id",
            "cancelled_at",
            "cancellation_reason",
            "version",
            "lines",
        ]
        read_only_fields = fields

    def get_posted_by_id(self, obj):
        return obj.posted_by_id

    def get_cancelled_by_id(self, obj):
        return obj.cancelled_by_id


class GoodsReceiptLineInputSerializer(serializers.Serializer):
    """Used, `many=True`, inside both create and update input - never
    exposed standalone.
    """

    source_po_line_id = serializers.IntegerField()
    received_quantity = serializers.DecimalField(max_digits=14, decimal_places=3, min_value=Decimal("0.001"))
    lot_reference = serializers.CharField(required=False, allow_blank=True, max_length=100)

    def to_internal_value(self, data):
        # Not validate()/self.initial_data: when used as a `many=True`
        # child, DRF's ListSerializer calls this child's run_validation()
        # directly per item - see apps.purchasing.serializers.
        # PurchaseRequestLineInputSerializer's identical override for why.
        _reject_prohibited_fields(data, _LINE_PROHIBITED)
        return super().to_internal_value(data)


class GoodsReceiptCreateSerializer(serializers.Serializer):
    """`store`/`company` are deliberately absent - `store` comes from the
    URL, `company` is always derived server-side from the source
    purchase order (see apps.receiving.services.create_goods_receipt).
    `idempotency_key` is optional - omitting it simply forgoes retry
    safety, it does not disable creation.
    """

    source_purchase_order_id = serializers.IntegerField()
    arrived_at = serializers.DateTimeField()
    delivery_note_reference = serializers.CharField(required=False, allow_blank=True, max_length=100, default="")
    notes = serializers.CharField(required=False, allow_blank=True, max_length=2000, default="")
    idempotency_key = serializers.CharField(required=False, allow_blank=True, max_length=100, default="")
    lines = GoodsReceiptLineInputSerializer(many=True, required=False, default=list)

    def validate(self, attrs):
        _reject_prohibited_fields(self.initial_data, _HEADER_PROHIBITED)
        return attrs


class GoodsReceiptUpdateSerializer(serializers.Serializer):
    """PATCH-only. `expected_version` is always required. `arrived_at`/
    `delivery_note_reference`/`notes`/`lines` are each independently
    optional with **no** `default=` - a key's mere absence must be
    distinguishable from an explicit value, same reasoning as
    PurchaseRequestUpdateSerializer.
    """

    expected_version = serializers.IntegerField()
    arrived_at = serializers.DateTimeField(required=False)
    delivery_note_reference = serializers.CharField(required=False, allow_blank=True, max_length=100)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    lines = GoodsReceiptLineInputSerializer(many=True, required=False)

    def validate(self, attrs):
        _reject_prohibited_fields(self.initial_data, _HEADER_PROHIBITED)
        return attrs


class GoodsReceiptVersionSerializer(serializers.Serializer):
    """Body shape for the post endpoint: only the optimistic-concurrency
    token, nothing else to submit.
    """

    expected_version = serializers.IntegerField()


class GoodsReceiptCancelSerializer(serializers.Serializer):
    expected_version = serializers.IntegerField()
    cancellation_reason = serializers.CharField(max_length=1000, allow_blank=False)


class DeliveryProgressLineSerializer(serializers.Serializer):
    """Read-only - see apps.receiving.services.
    delivery_progress_for_purchase_order. Never exposes price/amount -
    quantities and identity only.
    """

    source_po_line_id = serializers.IntegerField()
    line_number = serializers.IntegerField()
    material_code_snapshot = serializers.CharField()
    material_name_snapshot = serializers.CharField()
    unit_code_snapshot = serializers.CharField()
    unit_name_snapshot = serializers.CharField()
    ordered_quantity = serializers.DecimalField(max_digits=14, decimal_places=3)
    received_quantity = serializers.DecimalField(max_digits=14, decimal_places=3)
    remaining_quantity = serializers.DecimalField(max_digits=14, decimal_places=3)
    delivery_status = serializers.CharField()


class EligiblePurchaseOrderSerializer(serializers.ModelSerializer):
    """The "minimal eligible PO lookup" response - see apps.receiving.
    services.eligible_purchase_orders_for_receiving. Deliberately does
    not expose supplier price/line amount/currency/subtotal - only what
    a receiving clerk needs to pick the right order and see what is
    still outstanding.
    """

    company_id = serializers.IntegerField(source="company.id", read_only=True)
    company_code = serializers.CharField(source="company.code", read_only=True)
    supplier_id = serializers.IntegerField(source="supplier.id", read_only=True)
    supplier_code = serializers.CharField(source="supplier.code", read_only=True)
    delivery_progress = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseOrder
        fields = [
            "id",
            "reference",
            "company_id",
            "company_code",
            "supplier_id",
            "supplier_code",
            "expected_delivery_date",
            "delivery_progress",
        ]
        read_only_fields = fields

    def get_delivery_progress(self, obj):
        from apps.receiving.services import delivery_progress_for_purchase_order

        return DeliveryProgressLineSerializer(delivery_progress_for_purchase_order(obj), many=True).data
