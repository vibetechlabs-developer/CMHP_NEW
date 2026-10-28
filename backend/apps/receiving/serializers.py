from decimal import Decimal

from rest_framework import serializers

from apps.purchasing.models import PurchaseOrder
from apps.receiving.models import ContainerType, GoodsReceipt, GoodsReceiptLine

# Same convention as apps.purchasing.serializers: fields explicitly
# rejected (400), not silently ignored, if present in the request body.
# `status`/`reference`/`version`/the actor+timestamp fields/
# `cancellation_reason` are all server-managed. For a PO-based receipt,
# `store`/`company`/`source_purchase_order` still come exclusively from
# the URL/body's `source_purchase_order_id` (company always derived from
# the PO - never independently accepted for that path); `unit_price`/
# `currency_code` stay prohibited at header level (price is a per-line
# concept, see below), and for a PO-based LINE, material/unit/price are
# still always server-derived from the source PO line's own issue-time
# snapshot, never accepted directly - "no commercial data is ever
# accepted... by this app" remains true for that path exactly as before.
#
# `company_id` was added after Task 09A for MANUAL ENTRY MODE ONLY (no
# source_purchase_order_id): there the caller must say which company the
# receipt belongs to, since there is no PO to derive it from - see
# apps.receiving.services.create_goods_receipt's own validate() branch.
_HEADER_PROHIBITED = {
    "status",
    "reference",
    "version",
    "store",
    "store_id",
    "company",
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

# A PO-based line may only ever say "this source PO line, this received
# quantity, this optional lot reference" - material/unit/price are
# always server-derived from the source PO line's own issue-time
# snapshot there, never accepted directly. `material_id` was added after
# Task 09A for a MANUAL ENTRY MODE line (no source_po_line_id) - the only
# path on which a caller ever supplies material/price directly; `unit`
# stays prohibited even there (always the material's own base unit,
# server-derived, same convention apps.stock_movements.services.
# create_material_issue already uses - never a caller-chosen unit).
_LINE_PROHIBITED = {
    "id",
    "goods_receipt",
    "goods_receipt_id",
    "line_number",
    "material",
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
    container_type_id = serializers.IntegerField(source="container_type.id", read_only=True)
    container_type_code = serializers.CharField(source="container_type.code", read_only=True)
    container_quantity = serializers.IntegerField(read_only=True)
    # MANUAL ENTRY MODE ONLY (source_po_line_id is absent on this line) -
    # blank/null on every PO-based line, which still derives its price
    # from source_po_line's own issue-time snapshot via
    # DeliveryProgressLineSerializer/StockMovementSerializer instead,
    # unchanged from before.
    unit_price = serializers.DecimalField(max_digits=14, decimal_places=4, read_only=True, allow_null=True)
    currency_code = serializers.CharField(read_only=True)

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
            "container_type_id",
            "container_type_code",
            "container_quantity",
            "unit_price",
            "currency_code",
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
    # Blank on a PO-based receipt (supplier is derived from the PO
    # relation above instead); set only on a MANUAL ENTRY MODE receipt,
    # where it is free-text, never a claim that this name exists in the
    # real Supplier catalog (see GoodsReceipt.supplier_name's own
    # docstring).
    supplier_name = serializers.CharField(read_only=True)
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
            "supplier_name",
            "status",
            "arrived_at",
            "supplier_invoice_reference",
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

    Exactly one of `source_po_line_id` (PO-based line, the original
    path - material/unit/price all still server-derived from the PO,
    unchanged) or `material_id` (MANUAL ENTRY MODE line, added after
    Task 09A - a real apps.catalog.Material id, never free text; unit is
    still always the material's own base unit, never caller-chosen,
    same convention create_material_issue already uses) must be given -
    never both, never neither. `unit_price`/`currency_code` are only
    ever meaningful on a manual line; see the model-level CheckConstraint
    that keeps them unset on a PO-based line regardless of what a caller
    sends here.
    """

    source_po_line_id = serializers.IntegerField(required=False)
    material_id = serializers.IntegerField(required=False)
    received_quantity = serializers.DecimalField(max_digits=14, decimal_places=3, min_value=Decimal("0.001"))
    lot_reference = serializers.CharField(required=False, allow_blank=True, max_length=100)
    container_type_id = serializers.IntegerField(required=False, allow_null=True)
    container_quantity = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    unit_price = serializers.DecimalField(
        max_digits=14, decimal_places=4, min_value=Decimal("0.0001"), required=False, allow_null=True
    )
    currency_code = serializers.CharField(required=False, allow_blank=True, max_length=3)

    def to_internal_value(self, data):
        # Not validate()/self.initial_data: when used as a `many=True`
        # child, DRF's ListSerializer calls this child's run_validation()
        # directly per item - see apps.purchasing.serializers.
        # PurchaseRequestLineInputSerializer's identical override for why.
        _reject_prohibited_fields(data, _LINE_PROHIBITED)
        return super().to_internal_value(data)

    def validate(self, attrs):
        has_po_line = "source_po_line_id" in attrs
        has_material = "material_id" in attrs
        if has_po_line == has_material:
            raise serializers.ValidationError(
                "Exactly one of source_po_line_id or material_id is required per line, never both or neither."
            )
        if has_po_line and ("unit_price" in attrs or attrs.get("currency_code")):
            raise serializers.ValidationError(
                {"unit_price": "Price cannot be set on a PO-based line - it is derived from the purchase order."}
            )
        return attrs


class GoodsReceiptCreateSerializer(serializers.Serializer):
    """`store` is deliberately absent - it comes from the URL.
    `idempotency_key` is optional - omitting it simply forgoes retry
    safety, it does not disable creation.

    Exactly one of `source_purchase_order_id` (the original path -
    `company` always derived server-side from the PO, never accepted
    here) or `company_id` (MANUAL ENTRY MODE, added after Task 09A - no
    PO exists, so the caller must say which company directly) is
    required - never both, never neither. `supplier_name` is accepted
    only alongside `company_id`; a PO-based receipt keeps deriving its
    supplier display from the PO's own relation instead and this field
    is ignored for that path (see apps.receiving.services.
    create_goods_receipt).
    """

    source_purchase_order_id = serializers.IntegerField(required=False)
    company_id = serializers.IntegerField(required=False)
    supplier_name = serializers.CharField(required=False, allow_blank=True, max_length=255, default="")
    arrived_at = serializers.DateTimeField()
    supplier_invoice_reference = serializers.CharField(required=False, allow_blank=True, max_length=100, default="")
    delivery_note_reference = serializers.CharField(required=False, allow_blank=True, max_length=100, default="")
    notes = serializers.CharField(required=False, allow_blank=True, max_length=2000, default="")
    idempotency_key = serializers.CharField(required=False, allow_blank=True, max_length=100, default="")
    lines = GoodsReceiptLineInputSerializer(many=True, required=False, default=list)

    def validate(self, attrs):
        _reject_prohibited_fields(self.initial_data, _HEADER_PROHIBITED)
        has_po = "source_purchase_order_id" in attrs
        has_company = "company_id" in attrs
        if has_po == has_company:
            raise serializers.ValidationError(
                "Exactly one of source_purchase_order_id or company_id is required, never both or neither."
            )
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
    supplier_invoice_reference = serializers.CharField(required=False, allow_blank=True, max_length=100)
    delivery_note_reference = serializers.CharField(required=False, allow_blank=True, max_length=100)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    # Manual-mode-only in practice (ignored for a PO-based receipt, which
    # has no use for it - see create_goods_receipt) but harmless to
    # accept unconditionally here, same as every other optional header
    # field on this serializer.
    supplier_name = serializers.CharField(required=False, allow_blank=True, max_length=255)
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
    delivery_progress_for_purchase_order. `unit_price`/`pricing_unit_code`/
    `currency_code` are the issue-time snapshot's own historical price
    (never a per-container price, never the live PO price) - gated by
    the same purchase_orders.view/company-access check every other field
    here already passes through (see EligiblePurchaseOrderSerializer).
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
    unit_price = serializers.DecimalField(max_digits=14, decimal_places=4)
    pricing_unit_code = serializers.CharField()
    currency_code = serializers.CharField()


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


# ---------------------------------------------------------------------------
# ContainerType - shared packaging reference data. Mirrors
# apps.catalog.serializers' UnitOfMeasureSerializer/*CreateSerializer/
# *UpdateSerializer shape exactly - same kind of reference data, same
# rules (code immutable after creation, explicit reject of fields this
# endpoint does not accept).
# ---------------------------------------------------------------------------

_CONTAINER_TYPE_PROHIBITED_ON_CREATE = {"is_active"}
_CONTAINER_TYPE_PROHIBITED_ON_UPDATE = _CONTAINER_TYPE_PROHIBITED_ON_CREATE | {"code"}


class ContainerTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContainerType
        fields = ["id", "code", "name", "description", "is_active", "created_at", "updated_at"]
        read_only_fields = fields


class ContainerTypeCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContainerType
        fields = ["code", "name", "description"]
        extra_kwargs = {"description": {"required": False, "allow_blank": True}}

    def validate(self, attrs):
        _reject_prohibited_fields(self.initial_data, _CONTAINER_TYPE_PROHIBITED_ON_CREATE)
        return attrs


class ContainerTypeUpdateSerializer(serializers.ModelSerializer):
    """PATCH-only: name/description. code is immutable through this API."""

    class Meta:
        model = ContainerType
        fields = ["name", "description"]
        extra_kwargs = {
            "name": {"required": False},
            "description": {"required": False, "allow_blank": True},
        }

    def validate(self, attrs):
        _reject_prohibited_fields(self.initial_data, _CONTAINER_TYPE_PROHIBITED_ON_UPDATE)
        return attrs
