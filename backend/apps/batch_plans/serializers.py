from decimal import Decimal
from rest_framework import serializers

from apps.batch_plans.models import BatchPlan
from apps.batch_plans.requirement_preview import compute_packing_assessment
from apps.batch_plans.services import assess_source_drift

PLANNING_NOTICE = "Planning draft — official batch number not assigned."

# Allow-lists: every key outside the set is rejected with 400, never
# silently ignored (same convention as apps.formulas.serializers /
# apps.sales_orders.serializers). Notably absent from both: `company`/
# `company_id`, `sales_order_line_id`, `formula_revision_id`, `status`,
# `version` (only `expected_version` on PATCH), every snapshot field,
# `created_by`/timestamps - none of these is ever client-settable.
#
# Task 12B-2: `planned_pack_quantity`/`packing_content_quantity`/
# `packing_content_uom_id` are optional on BOTH create and update - see
# apps.batch_plans.validation for the "all three together, or none" rule
# and apps.batch_plans.services.update_batch_plan for how an update merges
# a partial edit against the plan's current stored values before
# validating the complete result.
_PACKING_FIELDS = {"planned_pack_quantity", "packing_content_quantity", "packing_content_uom_id"}
# Printing-department fields. Separate permission boundary (batch_plans.printing_edit).
_PRINTING_FIELDS = {"mrp_for_printing", "printing_status_note"}
_CREATE_ALLOWED = {
    "sales_order_line_id",
    "formula_revision_id",
    "target_output_quantity",
    "planned_manufacturing_date",
    "packing_size_note",
    "notes",
} | _PACKING_FIELDS | _PRINTING_FIELDS
_UPDATE_ALLOWED = {
    "expected_version",
    "target_output_quantity",
    "planned_manufacturing_date",
    "packing_size_note",
    "notes",
} | _PACKING_FIELDS | _PRINTING_FIELDS


def _reject_unknown_fields(data, allowed):
    if not isinstance(data, dict):
        return
    rejected = set(data.keys()) - allowed
    if rejected:
        raise serializers.ValidationError(
            {field: "Unknown or protected field - it cannot be set through this endpoint." for field in sorted(rejected)}
        )


class BatchPlanCreateSerializer(serializers.Serializer):
    sales_order_line_id = serializers.IntegerField(required=True)
    formula_revision_id = serializers.IntegerField(required=True)
    target_output_quantity = serializers.DecimalField(max_digits=14, decimal_places=3, required=True)
    planned_manufacturing_date = serializers.DateField(required=False, allow_null=True)
    packing_size_note = serializers.CharField(required=False, allow_blank=True, max_length=255, default="")
    notes = serializers.CharField(required=False, allow_blank=True, max_length=2000, default="")
    # Task 12B-2 - optional, always supplied together (validated in the
    # service layer, which sees all three at once, not field-by-field).
    planned_pack_quantity = serializers.DecimalField(max_digits=14, decimal_places=3, required=False)
    packing_content_quantity = serializers.DecimalField(max_digits=14, decimal_places=3, required=False)
    packing_content_uom_id = serializers.IntegerField(required=False)
    mrp_for_printing = serializers.DecimalField(
        max_digits=14, decimal_places=2, required=False, allow_null=True, min_value=Decimal("0")
    )
    printing_status_note = serializers.CharField(required=False, allow_blank=True, max_length=255, default="")

    def validate(self, attrs):
        _reject_unknown_fields(self.initial_data, _CREATE_ALLOWED)
        return attrs


class BatchPlanUpdateSerializer(serializers.Serializer):
    expected_version = serializers.IntegerField(required=True)
    target_output_quantity = serializers.DecimalField(max_digits=14, decimal_places=3, required=False)
    planned_manufacturing_date = serializers.DateField(required=False, allow_null=True)
    packing_size_note = serializers.CharField(required=False, allow_blank=True, max_length=255)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    # Task 12B-2 - each independently `allow_null=True` so a caller can
    # explicitly clear one (e.g. revert to Shape A) - the service then
    # re-validates the COMPLETE merged state, so clearing only one of the
    # three while the other two remain set is still rejected as incomplete.
    planned_pack_quantity = serializers.DecimalField(max_digits=14, decimal_places=3, required=False, allow_null=True)
    packing_content_quantity = serializers.DecimalField(max_digits=14, decimal_places=3, required=False, allow_null=True)
    packing_content_uom_id = serializers.IntegerField(required=False, allow_null=True)
    mrp_for_printing = serializers.DecimalField(
        max_digits=14, decimal_places=2, required=False, allow_null=True, min_value=Decimal("0")
    )
    printing_status_note = serializers.CharField(required=False, allow_blank=True, max_length=255)

    def validate(self, attrs):
        _reject_unknown_fields(self.initial_data, _UPDATE_ALLOWED)
        return attrs


class BatchPlanAllocateNumberSerializer(serializers.Serializer):
    """Body shape for `POST .../allocate-number/`: only the optimistic-
    concurrency token. `code`/`year`/`sequence`/`number` are never
    accepted here - Task 12D's own explicit instruction; every one of
    those is always server-resolved under lock
    (`apps.batch_plans.numbering.allocate_batch_number`).
    """

    expected_version = serializers.IntegerField()

    def validate(self, attrs):
        _reject_unknown_fields(self.initial_data, {"expected_version"})
        return attrs


def _batch_number_fields(obj):
    """Shared by list/detail: the official number is nullable (most plans
    are never numbered), and this never exposes anything beyond what Task
    12D's read-response requirement asks for. Django's reverse
    `OneToOneField` accessor raises a `DoesNotExist` that is ALSO an
    `AttributeError` by design, specifically so `getattr(obj,
    "number_allocation", None)` safely returns `None` for an unnumbered
    plan instead of raising - see `_batch_plan_queryset` in
    apps.batch_plans.views for the `select_related("number_allocation")`
    that keeps this a single query.
    """
    allocation = getattr(obj, "number_allocation", None)
    if allocation is None:
        return {
            "official_batch_number": None,
            "numbered_by_id": None,
            "numbered_at": None,
        }
    return {
        "official_batch_number": allocation.number,
        "numbered_by_id": allocation.numbered_by_id,
        "numbered_at": allocation.numbered_at,
    }


class BatchPlanListSerializer(serializers.ModelSerializer):
    source_order_reference = serializers.CharField(source="source_order_reference_snapshot")
    source_line_number = serializers.IntegerField(source="source_line_number_snapshot")
    product_code = serializers.CharField(source="product_code_snapshot")
    product_name = serializers.CharField(source="product_name_snapshot")
    output_uom_code = serializers.CharField(source="output_uom_code_snapshot")
    pack_uom_code = serializers.CharField(source="pack_uom_code_snapshot")
    formula_code = serializers.CharField(source="formula_code_snapshot")
    formula_revision_number = serializers.IntegerField(source="formula_revision_number_snapshot")
    packing_content_uom_code = serializers.CharField(source="packing_content_uom.code", read_only=True, default=None)
    official_batch_number = serializers.SerializerMethodField()
    numbered_by_id = serializers.SerializerMethodField()
    numbered_at = serializers.SerializerMethodField()
    notice = serializers.SerializerMethodField()
    mrp_currency_code = serializers.SerializerMethodField()

    class Meta:
        model = BatchPlan
        fields = [
            "id",
            "company_id",
            "sales_order_line_id",
            "formula_revision_id",
            "target_output_quantity",
            "planned_manufacturing_date",
            "packing_size_note",
            "notes",
            "mrp_for_printing",
            "printing_status_note",
            "mrp_currency_code",
            "planned_pack_quantity",
            "packing_content_quantity",
            "packing_content_uom_id",
            "packing_content_uom_code",
            "official_batch_number",
            "numbered_by_id",
            "numbered_at",
            "status",
            "version",
            "source_order_reference",
            "source_line_number",
            "product_code",
            "product_name",
            "output_uom_code",
            "pack_uom_code",
            "formula_code",
            "formula_revision_number",
            "created_by_id",
            "created_at",
            "updated_at",
            "notice",
        ]

    def get_mrp_currency_code(self, obj):
        return obj.sales_order_line.sales_order.currency

    def get_official_batch_number(self, obj):
        return _batch_number_fields(obj)["official_batch_number"]

    def get_numbered_by_id(self, obj):
        return _batch_number_fields(obj)["numbered_by_id"]

    def get_numbered_at(self, obj):
        return _batch_number_fields(obj)["numbered_at"]

    def get_notice(self, obj):
        fields = _batch_number_fields(obj)
        if fields["official_batch_number"]:
            return f"Official batch number assigned: {fields['official_batch_number']}."
        return PLANNING_NOTICE


class BatchPlanDetailSerializer(serializers.ModelSerializer):
    source_order_reference = serializers.CharField(source="source_order_reference_snapshot", read_only=True)
    source_line_number = serializers.IntegerField(source="source_line_number_snapshot", read_only=True)
    product_code = serializers.CharField(source="product_code_snapshot", read_only=True)
    product_name = serializers.CharField(source="product_name_snapshot", read_only=True)
    output_uom_code = serializers.CharField(source="output_uom_code_snapshot", read_only=True)
    pack_uom_code = serializers.CharField(source="pack_uom_code_snapshot", read_only=True)
    formula_code = serializers.CharField(source="formula_code_snapshot", read_only=True)
    formula_revision_number = serializers.IntegerField(source="formula_revision_number_snapshot", read_only=True)
    source_snapshots = serializers.SerializerMethodField()
    current_source_state = serializers.SerializerMethodField()
    source_drift = serializers.SerializerMethodField()
    packing_assessment = serializers.SerializerMethodField()
    order_quantity = serializers.SerializerMethodField()
    official_batch_number = serializers.SerializerMethodField()
    numbered_by_id = serializers.SerializerMethodField()
    numbered_at = serializers.SerializerMethodField()
    notice = serializers.SerializerMethodField()
    mrp_currency_code = serializers.SerializerMethodField()

    class Meta:
        model = BatchPlan
        fields = [
            "id",
            "company_id",
            "sales_order_line_id",
            "formula_revision_id",
            "target_output_quantity",
            "planned_manufacturing_date",
            "packing_size_note",
            "notes",
            "mrp_for_printing",
            "printing_status_note",
            "mrp_currency_code",
            "planned_pack_quantity",
            "packing_content_quantity",
            "packing_content_uom_id",
            "official_batch_number",
            "numbered_by_id",
            "numbered_at",
            "status",
            "version",
            "source_order_reference",
            "source_line_number",
            "product_code",
            "product_name",
            "output_uom_code",
            "pack_uom_code",
            "formula_code",
            "formula_revision_number",
            "created_by_id",
            "created_at",
            "updated_at",
            "order_quantity",
            "source_snapshots",
            "current_source_state",
            "source_drift",
            "packing_assessment",
            "notice",
        ]

    def get_mrp_currency_code(self, obj):
        return obj.sales_order_line.sales_order.currency

    def get_official_batch_number(self, obj):
        return _batch_number_fields(obj)["official_batch_number"]

    def get_numbered_by_id(self, obj):
        return _batch_number_fields(obj)["numbered_by_id"]

    def get_numbered_at(self, obj):
        return _batch_number_fields(obj)["numbered_at"]

    def get_order_quantity(self, obj):
        """The source line's own CURRENT ordered quantity (e.g. 3024
        bottles) - distinct from `planned_pack_quantity` (how many of those
        this ONE plan covers - a plan is never assumed to cover the whole
        order) and from `target_output_quantity` (the manufacturing target,
        in the formula's own output unit).
        """
        return {
            "quantity": str(obj.sales_order_line.quantity),
            "unit_code": obj.sales_order_line.product.sales_uom.code,
            "unit_name": obj.sales_order_line.product.sales_uom.name,
        }

    def get_source_snapshots(self, obj):
        return {
            "sales_order_reference": obj.source_order_reference_snapshot,
            "sales_order_line_number": obj.source_line_number_snapshot,
            "product_id": obj.product_id_snapshot,
            "product_code": obj.product_code_snapshot,
            "product_name": obj.product_name_snapshot,
            "output_uom_id": obj.output_uom_id_snapshot,
            "output_uom_code": obj.output_uom_code_snapshot,
            "output_uom_name": obj.output_uom_name_snapshot,
            "pack_uom_id": obj.pack_uom_id_snapshot,
            "pack_uom_code": obj.pack_uom_code_snapshot,
            "pack_uom_name": obj.pack_uom_name_snapshot,
            "formula_id": obj.formula_id_snapshot,
            "formula_code": obj.formula_code_snapshot,
            "formula_name": obj.formula_name_snapshot,
            "formula_revision_number": obj.formula_revision_number_snapshot,
            "formula_base_output_quantity": str(obj.formula_base_output_quantity_snapshot),
        }

    def _get_drift_assessment(self, obj):
        if not hasattr(obj, "_cached_drift"):
            obj._cached_drift = assess_source_drift(obj)
        return obj._cached_drift

    def get_current_source_state(self, obj):
        drift = self._get_drift_assessment(obj)
        return drift["current_source_state"]

    def get_source_drift(self, obj):
        drift = self._get_drift_assessment(obj)
        return {
            "has_drift": drift["has_drift"],
            "is_incompatible": drift["is_incompatible"],
            "issues": drift["issues"],
        }

    def get_packing_assessment(self, obj):
        """`None` for a Shape-A plan (no packing relationship recorded) -
        never fabricated. See `apps.batch_plans.requirement_preview.
        compute_packing_assessment` for the full field-by-field meaning;
        this is the same computation, also available here (under plain
        `batch_plans.view`, no `formulas.view` needed) since it exposes only
        this plan's own quantities/units, never the formula's material
        lines.
        """
        return compute_packing_assessment(obj)

    def get_notice(self, obj):
        fields = _batch_number_fields(obj)
        if fields["official_batch_number"]:
            return f"Official batch number assigned: {fields['official_batch_number']}."
        return PLANNING_NOTICE
