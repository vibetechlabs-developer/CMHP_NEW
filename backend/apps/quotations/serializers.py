from decimal import Decimal

from rest_framework import serializers

from apps.quotations.models import Quotation, QuotationLine
from apps.quotations.services import _LINE_AMOUNT_QUANTIZE

# Allow-lists (not deny-lists): every key outside the allowed set is
# rejected with 400, never silently ignored - this covers totals
# (`subtotal`, `total`, `grand_total`, `line_amount`), `reference`,
# `status`, `version` (except `expected_version` on PATCH), audit fields,
# `company`, snapshots, `line_number`, and any unknown key. CREATE and
# UPDATE sets are written independently on purpose (`id` is legal on an
# update line, `currency` on create only).
_CREATE_HEADER_ALLOWED = {"customer_id", "quotation_date", "valid_until", "currency", "notes", "lines"}
_UPDATE_HEADER_ALLOWED = {"expected_version", "customer_id", "quotation_date", "valid_until", "notes", "lines"}
_CREATE_LINE_ALLOWED = {"product_id", "quantity", "unit_price", "description"}
_UPDATE_LINE_ALLOWED = {"id", "product_id", "quantity", "unit_price", "description"}

_MAX_LINES = 200


def _reject_unknown_fields(data, allowed):
    if not isinstance(data, dict):
        return
    rejected = set(data.keys()) - allowed
    if rejected:
        raise serializers.ValidationError(
            {field: "Unknown or protected field - it cannot be set through this endpoint." for field in sorted(rejected)}
        )


class QuotationLineSerializer(serializers.ModelSerializer):
    product_id = serializers.IntegerField(read_only=True)
    product_code = serializers.CharField(source="product_code_snapshot", read_only=True)
    product_name = serializers.CharField(source="product_name_snapshot", read_only=True)
    sales_uom_code = serializers.CharField(source="sales_uom_code_snapshot", read_only=True)
    sales_uom_name = serializers.CharField(source="sales_uom_name_snapshot", read_only=True)
    product_is_active = serializers.BooleanField(source="product.is_active", read_only=True)
    sales_uom_is_active = serializers.BooleanField(source="product.sales_uom.is_active", read_only=True)

    class Meta:
        model = QuotationLine
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
        ]
        read_only_fields = fields


class QuotationSerializer(serializers.ModelSerializer):
    company_id = serializers.IntegerField(source="company.id", read_only=True)
    customer_id = serializers.IntegerField(read_only=True)
    customer_code = serializers.CharField(source="customer.code", read_only=True)
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    customer_is_active = serializers.BooleanField(source="customer.is_active", read_only=True)
    created_by_id = serializers.IntegerField(read_only=True)
    lines = QuotationLineSerializer(many=True, read_only=True)
    subtotal = serializers.SerializerMethodField()

    class Meta:
        model = Quotation
        fields = [
            "id",
            "company_id",
            "reference",
            "customer_id",
            "customer_code",
            "customer_name",
            "customer_is_active",
            "quotation_date",
            "valid_until",
            "currency",
            "notes",
            "status",
            "lines",
            "subtotal",
            "version",
            "created_by_id",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_subtotal(self, obj):
        """Pre-tax sum of line amounts in this quotation's single
        currency, Decimal only, as a fixed 2-place string. Deliberately
        named `subtotal` - there is no tax/discount/freight/grand total.
        """
        total = sum((line.line_amount for line in obj.lines.all()), Decimal("0"))
        return str(total.quantize(_LINE_AMOUNT_QUANTIZE))


class QuotationListSerializer(QuotationSerializer):
    """Same shape as the detail; kept as its own class so the list can
    diverge later without touching the detail contract.
    """


class _LineInputBase(serializers.Serializer):
    product_id = serializers.IntegerField()
    quantity = serializers.DecimalField(max_digits=14, decimal_places=3, min_value=Decimal("0.001"))
    unit_price = serializers.DecimalField(max_digits=14, decimal_places=4, min_value=Decimal("0"))
    description = serializers.CharField(required=False, allow_blank=True, max_length=500)


class QuotationLineCreateInputSerializer(_LineInputBase):
    def to_internal_value(self, data):
        _reject_unknown_fields(data, _CREATE_LINE_ALLOWED)
        return super().to_internal_value(data)


class QuotationLineUpdateInputSerializer(_LineInputBase):
    id = serializers.IntegerField(required=False)

    def to_internal_value(self, data):
        _reject_unknown_fields(data, _UPDATE_LINE_ALLOWED)
        return super().to_internal_value(data)


class QuotationCreateSerializer(serializers.Serializer):
    customer_id = serializers.IntegerField()
    quotation_date = serializers.DateField()
    valid_until = serializers.DateField(required=False, allow_null=True)
    currency = serializers.CharField(max_length=3)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=2000, default="")
    lines = QuotationLineCreateInputSerializer(many=True, required=False, default=list, max_length=_MAX_LINES)

    def validate(self, attrs):
        _reject_unknown_fields(self.initial_data, _CREATE_HEADER_ALLOWED)
        valid_until = attrs.get("valid_until")
        if valid_until is not None and valid_until < attrs["quotation_date"]:
            raise serializers.ValidationError(
                {"valid_until": "Valid-until date cannot precede the quotation date."}
            )
        return attrs


class QuotationUpdateSerializer(serializers.Serializer):
    """PATCH-only. `expected_version` required. Every other key is
    independently optional with no `default=` - absence means unchanged,
    `valid_until: null` clears it, `lines` (even `[]`) replaces the whole
    collection (see apps.quotations.services.update_quotation).
    """

    expected_version = serializers.IntegerField()
    customer_id = serializers.IntegerField(required=False)
    quotation_date = serializers.DateField(required=False)
    valid_until = serializers.DateField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    lines = QuotationLineUpdateInputSerializer(many=True, required=False, max_length=_MAX_LINES)

    def validate(self, attrs):
        _reject_unknown_fields(self.initial_data, _UPDATE_HEADER_ALLOWED)
        return attrs
