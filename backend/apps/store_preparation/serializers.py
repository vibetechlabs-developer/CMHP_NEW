from rest_framework import serializers

from apps.store_preparation.models import StorePreparation

# Allow-lists: every key outside the set is rejected with 400, never
# silently ignored (same convention as every other company/store-scoped
# app in this project). The owner (`sales_order_line_id` or the legacy
# `batch_plan_id`) and `store_id` are create-only and immutable;
# `version`/`created_by`/timestamps are never client-settable at all.
_CREATE_ALLOWED = {
    "batch_plan_id",
    "sales_order_line_id",
    "packing_type",
    "insert_required",
    "label_note",
    "box_note",
}
_UPDATE_ALLOWED = {"expected_version", "packing_type", "insert_required", "label_note", "box_note"}


def _reject_unknown_fields(data, allowed):
    if not isinstance(data, dict):
        return
    rejected = set(data.keys()) - allowed
    if rejected:
        raise serializers.ValidationError(
            {field: "Unknown or protected field - it cannot be set through this endpoint." for field in sorted(rejected)}
        )


class StorePreparationCreateSerializer(serializers.Serializer):
    """Exactly one owner is required: `sales_order_line_id` (the confirmed
    workflow - no batch plan needed) or the legacy `batch_plan_id`.
    """

    batch_plan_id = serializers.IntegerField(required=False, allow_null=True, default=None)
    sales_order_line_id = serializers.IntegerField(required=False, allow_null=True, default=None)
    packing_type = serializers.CharField(required=False, allow_blank=True, max_length=255, default="")
    # `null` (not specified), `true` (required) and `false` (not required /
    # N/A) are all explicitly accepted - see StorePreparation's own
    # docstring for what each means.
    insert_required = serializers.BooleanField(required=False, allow_null=True, default=None)
    label_note = serializers.CharField(required=False, allow_blank=True, max_length=255, default="")
    box_note = serializers.CharField(required=False, allow_blank=True, max_length=255, default="")

    def validate(self, attrs):
        _reject_unknown_fields(self.initial_data, _CREATE_ALLOWED)
        has_plan = attrs.get("batch_plan_id") is not None
        has_line = attrs.get("sales_order_line_id") is not None
        if has_plan == has_line:
            message = "Give exactly one of batch_plan_id or sales_order_line_id."
            raise serializers.ValidationError({"batch_plan_id": message, "sales_order_line_id": message})
        return attrs


class StorePreparationUpdateSerializer(serializers.Serializer):
    """PATCH-only. `expected_version` is always required. Each editable field
    is independently optional with **no** `default=`, so a key's absence is
    distinguishable from an explicit value (to clear `packing_type`, send
    `""`; to reset `insert_required` to "not specified", send `null`).
    The owner and store are immutable and have no writable path here.
    """

    expected_version = serializers.IntegerField()
    packing_type = serializers.CharField(required=False, allow_blank=True, max_length=255)
    insert_required = serializers.BooleanField(required=False, allow_null=True)
    label_note = serializers.CharField(required=False, allow_blank=True, max_length=255)
    box_note = serializers.CharField(required=False, allow_blank=True, max_length=255)

    def validate(self, attrs):
        _reject_unknown_fields(self.initial_data, _UPDATE_ALLOWED)
        return attrs


class StorePreparationSerializer(serializers.ModelSerializer):
    """Exposes only the minimal source context a Store user needs to
    recognise which order line (or legacy plan) this preparation belongs to -
    NEVER the formula's material lines, recipe quantities, prices, or the
    plan's full source snapshots. `planning_id` is never called an official
    batch number.
    """

    company_id = serializers.SerializerMethodField()
    store_id = serializers.IntegerField(source="store.id", read_only=True)
    store_code = serializers.CharField(source="store.code", read_only=True)
    store_name = serializers.CharField(source="store.name", read_only=True)
    plan_context = serializers.SerializerMethodField()

    class Meta:
        model = StorePreparation
        fields = [
            "id",
            "sales_order_line_id",
            "batch_plan_id",
            "company_id",
            "store_id",
            "store_code",
            "store_name",
            "packing_type",
            "label_note",
            "box_note",
            "insert_required",
            "version",
            "created_by_id",
            "created_at",
            "updated_by_id",
            "updated_at",
            "plan_context",
        ]
        read_only_fields = fields

    def get_company_id(self, obj):
        return obj.owning_company.id

    def get_plan_context(self, obj):
        if obj.batch_plan_id:
            plan = obj.batch_plan
            return {
                "planning_id": plan.id,
                "order_reference": plan.source_order_reference_snapshot,
                "product_code": plan.product_code_snapshot,
                "product_name": plan.product_name_snapshot,
                "line_number": plan.source_line_number_snapshot,
                "owner": "batch_plan",
            }
        line = obj.sales_order_line
        return {
            "planning_id": None,
            "order_reference": line.sales_order.reference,
            "product_code": line.product_code_snapshot,
            "product_name": line.product_name_snapshot,
            "line_number": line.line_number,
            "owner": "order_line",
        }
