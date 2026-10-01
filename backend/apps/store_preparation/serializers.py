from rest_framework import serializers

from apps.store_preparation.models import StorePreparation

# Allow-lists: every key outside the set is rejected with 400, never
# silently ignored (same convention as every other company/store-scoped
# app in this project). `batch_plan_id`/`store_id` are create-only (never
# accepted on update - both are immutable); `version`/`created_by`/
# timestamps are never client-settable at all.
_CREATE_ALLOWED = {"batch_plan_id", "packing_type", "insert_required"}
_UPDATE_ALLOWED = {"expected_version", "packing_type", "insert_required"}


def _reject_unknown_fields(data, allowed):
    if not isinstance(data, dict):
        return
    rejected = set(data.keys()) - allowed
    if rejected:
        raise serializers.ValidationError(
            {field: "Unknown or protected field - it cannot be set through this endpoint." for field in sorted(rejected)}
        )


class StorePreparationCreateSerializer(serializers.Serializer):
    batch_plan_id = serializers.IntegerField(required=True)
    packing_type = serializers.CharField(required=False, allow_blank=True, max_length=255, default="")
    # `null` (not specified), `true` (required) and `false` (not required /
    # N/A) are all explicitly accepted - see StorePreparation's own
    # docstring for what each means.
    insert_required = serializers.BooleanField(required=False, allow_null=True, default=None)

    def validate(self, attrs):
        _reject_unknown_fields(self.initial_data, _CREATE_ALLOWED)
        return attrs


class StorePreparationUpdateSerializer(serializers.Serializer):
    """PATCH-only. `expected_version` is always required. `packing_type`/
    `insert_required` are each independently optional with **no**
    `default=` - a key's mere absence must be distinguishable from an
    explicit value (to clear `packing_type`, send `""`; to reset
    `insert_required` to "not specified", send `null` explicitly).
    `batch_plan_id`/`store_id` are immutable and have no writable path
    here at all.
    """

    expected_version = serializers.IntegerField()
    packing_type = serializers.CharField(required=False, allow_blank=True, max_length=255)
    insert_required = serializers.BooleanField(required=False, allow_null=True)

    def validate(self, attrs):
        _reject_unknown_fields(self.initial_data, _UPDATE_ALLOWED)
        return attrs


class StorePreparationSerializer(serializers.ModelSerializer):
    """Exposes only the minimal source context a Store user needs to
    recognise which plan/order/product this preparation belongs to -
    NEVER the formula's material lines, recipe quantities, prices, or the
    plan's full source snapshots. `plan_context`'s `planning_id` is
    explicitly never called an official batch number - matching Task 12A/
    12B-2's own wording for the same field.
    """

    company_id = serializers.IntegerField(source="batch_plan.company_id", read_only=True)
    store_id = serializers.IntegerField(source="store.id", read_only=True)
    store_code = serializers.CharField(source="store.code", read_only=True)
    store_name = serializers.CharField(source="store.name", read_only=True)
    plan_context = serializers.SerializerMethodField()

    class Meta:
        model = StorePreparation
        fields = [
            "id",
            "batch_plan_id",
            "company_id",
            "store_id",
            "store_code",
            "store_name",
            "packing_type",
            "insert_required",
            "version",
            "created_by_id",
            "created_at",
            "updated_by_id",
            "updated_at",
            "plan_context",
        ]
        read_only_fields = fields

    def get_plan_context(self, obj):
        plan = obj.batch_plan
        return {
            "planning_id": plan.id,
            "order_reference": plan.source_order_reference_snapshot,
            "product_code": plan.product_code_snapshot,
            "product_name": plan.product_name_snapshot,
        }
