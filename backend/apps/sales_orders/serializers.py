from decimal import Decimal

from rest_framework import serializers

from apps.quotations.serializers import (
    _CREATE_LINE_ALLOWED,
    _MAX_LINES,
    _UPDATE_LINE_ALLOWED,
    _LineInputBase,
    _reject_unknown_fields,
)
from apps.quotations.services import _LINE_AMOUNT_QUANTIZE
from apps.sales_orders.models import SalesOrder, SalesOrderLine

# Allow-lists (unknown/protected keys are rejected, never ignored). Create
# and update sets are independent: `currency` is create-only,
# `expected_version` update-only. Line input serializers are shared with
# quotations unchanged (same allow-lists, Decimal precision and limits).
_CREATE_HEADER_ALLOWED = {
    "customer_id",
    "order_date",
    "requested_delivery_date",
    "planned_manufacturing_date",
    "customer_order_reference",
    "currency",
    "notes",
    "lines",
}
_UPDATE_HEADER_ALLOWED = {
    "expected_version",
    "customer_id",
    "order_date",
    "requested_delivery_date",
    "planned_manufacturing_date",
    "customer_order_reference",
    "notes",
    "lines",
}


_LINE_TYPE_FIELD = "product_type_snapshot"


class SalesOrderLineCreateInputSerializer(_LineInputBase):
    # Optional here (as of this task) - the order line form no longer asks
    # for it. _LineInputBase itself stays required=True unchanged, since
    # apps.quotations still requires it; overridden only on this subclass,
    # not the shared base, so Quotations is untouched. `default=` (not just
    # required=False) so apps.sales_orders.services's plain `item["unit_
    # price"]` dict access keeps working whether or not the caller sent it.
    unit_price = serializers.DecimalField(
        max_digits=14, decimal_places=4, min_value=Decimal("0"), required=False, default=Decimal("0")
    )
    product_type_snapshot = serializers.CharField(required=False, allow_blank=True, max_length=100)

    def to_internal_value(self, data):
        _reject_unknown_fields(data, _CREATE_LINE_ALLOWED | {_LINE_TYPE_FIELD})
        return super().to_internal_value(data)


class SalesOrderLineUpdateInputSerializer(_LineInputBase):
    id = serializers.IntegerField(required=False)
    # See SalesOrderLineCreateInputSerializer above for why this is
    # overridden here rather than on the shared _LineInputBase.
    unit_price = serializers.DecimalField(
        max_digits=14, decimal_places=4, min_value=Decimal("0"), required=False, default=Decimal("0")
    )
    product_type_snapshot = serializers.CharField(required=False, allow_blank=True, max_length=100)

    def to_internal_value(self, data):
        _reject_unknown_fields(data, _UPDATE_LINE_ALLOWED | {_LINE_TYPE_FIELD})
        return super().to_internal_value(data)


class SalesOrderLineSerializer(serializers.ModelSerializer):
    product_id = serializers.IntegerField(read_only=True)
    product_code = serializers.CharField(source="product_code_snapshot", read_only=True)
    product_name = serializers.CharField(source="product_name_snapshot", read_only=True)
    sales_uom_code = serializers.CharField(source="sales_uom_code_snapshot", read_only=True)
    sales_uom_name = serializers.CharField(source="sales_uom_name_snapshot", read_only=True)
    product_is_active = serializers.BooleanField(source="product.is_active", read_only=True)
    sales_uom_is_active = serializers.BooleanField(source="product.sales_uom.is_active", read_only=True)

    class Meta:
        model = SalesOrderLine
        fields = [
            "id",
            "line_number",
            "product_id",
            "product_code",
            "product_name",
            "sales_uom_code",
            "sales_uom_name",
            "product_is_active",
            "sales_uom_is_active",
            "quantity",
            "unit_price",
            "description",
            "line_amount",
            "product_type_snapshot",
        ]
        read_only_fields = fields


class SalesOrderSerializer(serializers.ModelSerializer):
    company_id = serializers.IntegerField(source="company.id", read_only=True)
    customer_id = serializers.IntegerField(read_only=True)
    customer_code = serializers.CharField(source="customer.code", read_only=True)
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    customer_is_active = serializers.BooleanField(source="customer.is_active", read_only=True)
    created_by_id = serializers.IntegerField(read_only=True)
    lines = SalesOrderLineSerializer(many=True, read_only=True)
    subtotal = serializers.SerializerMethodField()

    class Meta:
        model = SalesOrder
        fields = [
            "id",
            "company_id",
            "reference",
            "customer_id",
            "customer_code",
            "customer_name",
            "customer_is_active",
            "order_date",
            "requested_delivery_date",
            "planned_manufacturing_date",
            "customer_order_reference",
            "currency",
            "notes",
            "status",
            "lines",
            "subtotal",
            "version",
            "created_by_id",
            "confirmed_by_id",
            "confirmed_at",
            "confirmation_policy_version",
            "confirmation_policy",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    confirmed_by_id = serializers.IntegerField(read_only=True)
    confirmation_policy = serializers.JSONField(source="confirmation_policy_snapshot", read_only=True)

    def get_subtotal(self, obj):
        """Pre-tax Decimal sum of line amounts in the order's single
        currency, fixed 2 places. No tax-inclusive grand total exists.
        """
        total = sum((line.line_amount for line in obj.lines.all()), Decimal("0"))
        return str(total.quantize(_LINE_AMOUNT_QUANTIZE))


class SalesOrderListSerializer(SalesOrderSerializer):
    """Same shape as the detail; separate class so the list can diverge later."""


class SalesOrderCreateSerializer(serializers.Serializer):
    customer_id = serializers.IntegerField()
    order_date = serializers.DateField()
    requested_delivery_date = serializers.DateField(required=False, allow_null=True)
    customer_order_reference = serializers.CharField(required=False, allow_blank=True, max_length=100, default="")
    currency = serializers.CharField(max_length=3)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=2000, default="")
    planned_manufacturing_date = serializers.DateField(required=False, allow_null=True)
    lines = SalesOrderLineCreateInputSerializer(many=True, required=False, default=list, max_length=_MAX_LINES)

    def validate(self, attrs):
        _reject_unknown_fields(self.initial_data, _CREATE_HEADER_ALLOWED)
        delivery = attrs.get("requested_delivery_date")
        if delivery is not None and delivery < attrs["order_date"]:
            raise serializers.ValidationError(
                {"requested_delivery_date": "Requested delivery date cannot precede the order date."}
            )
        return attrs


class SalesOrderUpdateSerializer(serializers.Serializer):
    """PATCH-only; `expected_version` required, everything else optional
    with no default (absence = unchanged, `requested_delivery_date: null`
    clears, `lines` present = complete final collection).
    """

    expected_version = serializers.IntegerField()
    customer_id = serializers.IntegerField(required=False)
    order_date = serializers.DateField(required=False)
    requested_delivery_date = serializers.DateField(required=False, allow_null=True)
    customer_order_reference = serializers.CharField(required=False, allow_blank=True, max_length=100)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    planned_manufacturing_date = serializers.DateField(required=False, allow_null=True)
    lines = SalesOrderLineUpdateInputSerializer(many=True, required=False, max_length=_MAX_LINES)

    def validate(self, attrs):
        _reject_unknown_fields(self.initial_data, _UPDATE_HEADER_ALLOWED)
        return attrs


class SalesOrderConfirmSerializer(serializers.Serializer):
    """Body of POST .../confirm/: only the version the user reviewed."""

    expected_version = serializers.IntegerField()

    def validate(self, attrs):
        _reject_unknown_fields(self.initial_data, {"expected_version"})
        return attrs


_POLICY_UPDATE_ALLOWED = {
    "expected_version",
    "allow_self_confirmation",
    "allow_zero_price_lines",
    "allow_past_requested_delivery_dates",
}


class ConfirmationPolicyUpdateSerializer(serializers.Serializer):
    """PATCH of a company's confirmation policy. `expected_version` is
    required (0 when no policy exists yet). Each value must be an explicit
    true/false - `null` is rejected (a value is only ever answered, never
    cleared or defaulted).
    """

    expected_version = serializers.IntegerField(min_value=0)
    allow_self_confirmation = serializers.BooleanField(required=False)
    allow_zero_price_lines = serializers.BooleanField(required=False)
    allow_past_requested_delivery_dates = serializers.BooleanField(required=False)

    def validate(self, attrs):
        _reject_unknown_fields(self.initial_data, _POLICY_UPDATE_ALLOWED)
        return attrs
