from rest_framework import serializers

from apps.material_requisitions.models import (
    MaterialRequisition,
    MaterialRequisitionLine,
    MaterialRequisitionRound,
    MaterialRequisitionRoundLine,
)

# Allow-lists: every key outside the set is rejected with 400, never
# silently ignored (same convention as every other company/store-scoped
# app in this project - see e.g. apps.store_preparation.serializers).
_CREATE_ALLOWED = {"batch_plan_id", "expected_batch_plan_version", "notes"}
_UPDATE_ALLOWED = {"expected_version", "notes", "lines"}
_LINE_UPDATE_ALLOWED = {"id", "requested_quantity", "quantity_remark"}


def _reject_unknown_fields(data, allowed):
    if not isinstance(data, dict):
        return
    rejected = set(data.keys()) - allowed
    if rejected:
        raise serializers.ValidationError(
            {field: "Unknown or protected field - it cannot be set through this endpoint." for field in sorted(rejected)}
        )


class MaterialRequisitionCreateSerializer(serializers.Serializer):
    """`batch_plan_id` identifies the (already-resolved, access-checked at
    the view layer) source plan. `expected_batch_plan_version` is the
    `BatchPlan.version` the caller last reviewed - deliberately named and
    documented as distinct from THIS requisition's own `expected_version`
    (which does not exist yet at create time; see `apps.material_
    requisitions.services.create_material_requisition`). Every calculated
    quantity, snapshot, and line is always server-resolved - none of them
    can be supplied here at all.
    """

    batch_plan_id = serializers.IntegerField(required=True)
    expected_batch_plan_version = serializers.IntegerField(required=True, min_value=0)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=2000, default="")

    def validate(self, attrs):
        _reject_unknown_fields(self.initial_data, _CREATE_ALLOWED)
        return attrs


class MaterialRequisitionLineUpdateInputSerializer(serializers.Serializer):
    """One partial line edit. `id` is required and must reference an
    EXISTING line of this requisition (enforced in the service, not here) -
    there is no create-line shape in this initial task, so no variant
    without `id` exists. `requested_quantity: null` explicitly clears a
    previously-set value; omitting the key leaves it unchanged.
    """

    id = serializers.IntegerField(required=True)
    requested_quantity = serializers.DecimalField(max_digits=14, decimal_places=3, required=False, allow_null=True)
    quantity_remark = serializers.CharField(required=False, allow_blank=True, max_length=1000)

    def to_internal_value(self, data):
        _reject_unknown_fields(data, _LINE_UPDATE_ALLOWED)
        return super().to_internal_value(data)


class MaterialRequisitionUpdateSerializer(serializers.Serializer):
    """PATCH-only. `expected_version` is always required. `notes` is
    independently optional (omit to leave unchanged, `""` to clear).
    `lines`, when present, is a list of PARTIAL edits identified by `id` -
    see `apps.material_requisitions.services.update_material_requisition`'s
    own docstring for the exact semantics (deliberately not the full-
    replace convention most other line-bearing resources in this project
    use, since lines can never be added or removed here). `batch_plan_id`/
    `store_id`/material identity/unit/calculated quantities/status/actors/
    timestamps/version have no writable path here at all.
    """

    expected_version = serializers.IntegerField(required=True)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    lines = MaterialRequisitionLineUpdateInputSerializer(many=True, required=False)

    def validate(self, attrs):
        _reject_unknown_fields(self.initial_data, _UPDATE_ALLOWED)
        return attrs


class MaterialRequisitionLineSerializer(serializers.ModelSerializer):
    """Raw and packaging material sections are split client-side by
    `material_type` (never invented here) - mirrors `apps.formulas.
    requirement_preview`'s own row shape closely so the two are directly
    comparable. `calculated_quantity`/`calculation_is_exact`/
    `calculation_is_approximate`/`calculation_warnings` are the FROZEN
    values captured at requisition-creation time (see `MaterialRequisition
    Line`'s own docstring) - never recomputed on a later read.
    """

    material_type = serializers.CharField(source="material_kind_snapshot", read_only=True)
    calculated_quantity = serializers.SerializerMethodField()
    calculation_is_exact = serializers.SerializerMethodField()
    calculation_is_approximate = serializers.SerializerMethodField()
    calculation_warnings = serializers.SerializerMethodField()
    material_is_active = serializers.BooleanField(source="material.is_active", read_only=True)
    unit_is_active = serializers.BooleanField(source="unit.is_active", read_only=True)

    class Meta:
        model = MaterialRequisitionLine
        fields = [
            "id",
            "line_number",
            "material_id",
            "material_code_snapshot",
            "material_name_snapshot",
            "material_type",
            "material_is_active",
            "unit_id",
            "unit_code_snapshot",
            "unit_name_snapshot",
            "unit_is_active",
            "base_line_quantity_snapshot",
            "calculated_quantity",
            "calculation_is_exact",
            "calculation_is_approximate",
            "calculation_warnings",
            "requested_quantity",
            "quantity_decision_issue",
            "quantity_remark",
            "requested_quantity_contributor_id",
            "requested_quantity_contributed_at",
        ]
        read_only_fields = fields

    def get_calculated_quantity(self, obj):
        return obj.calculation_snapshot.get("required_quantity", {}).get("value")

    def get_calculation_is_exact(self, obj):
        return obj.calculation_snapshot.get("required_quantity", {}).get("is_exact")

    def get_calculation_is_approximate(self, obj):
        return obj.calculation_snapshot.get("required_quantity", {}).get("is_approximate")

    def get_calculation_warnings(self, obj):
        return obj.calculation_snapshot.get("warnings", [])


class MaterialRequisitionSerializer(serializers.ModelSerializer):
    """Full detail/list representation. Deliberately never returns
    `available_stock`, `shortage`, `reserved_quantity`, `issued_quantity`,
    `can_produce`, `approved` or `ready_to_issue` - none of these concepts
    exist anywhere in this codebase, and this is a DRAFT planning document
    only, never called approved or submitted. Prices and customer
    information are never present here (this resource has no connection to
    pricing/commercial data at all). `source_drift` is always computed
    fresh at serialization time (`apps.material_requisitions.services.
    assess_requisition_drift`, read-only/unlocked) and kept clearly
    separate from the saved `*_snapshot` fields above it, and from
    `current_plan_context` (which shows the plan's live official batch
    number, if any, WITHOUT rewriting any historical snapshot - Task 12D
    number allocation is never itself quantity-affecting drift).

    Task 15C: `current_round`/`current_decision` surface the LATEST
    round's own status/decision at a glance; `rounds` is the FULL,
    paginated-by-the-client (small, bounded by how many times this one
    requisition has actually been submitted) history of every round that
    has ever existed, oldest first, each permanently preserved regardless
    of outcome - approving or rejecting NEVER deletes or rewrites an
    earlier round. Approval remains a historical decision even if the
    source later changes; `source_drift` is kept visible and separate
    precisely so a reader can see "this was approved" and "the source has
    since drifted" as two independent, equally true facts, never one
    silently overwriting the other.
    """

    raw_lines = serializers.SerializerMethodField()
    packaging_lines = serializers.SerializerMethodField()
    source_drift = serializers.SerializerMethodField()
    current_plan_context = serializers.SerializerMethodField()
    current_decision = serializers.SerializerMethodField()
    rounds = serializers.SerializerMethodField()

    class Meta:
        model = MaterialRequisition
        fields = [
            "id",
            "batch_plan_id",
            "store_id",
            "company_id",
            "status",
            "notes",
            "version",
            "current_round",
            "created_by_id",
            "created_at",
            "updated_by_id",
            "updated_at",
            "submitted_by_id",
            "submitted_at",
            "current_decision",
            "rounds",
            "source_plan_version_snapshot",
            "source_order_reference_snapshot",
            "source_line_number_snapshot",
            "product_id_snapshot",
            "product_code_snapshot",
            "product_name_snapshot",
            "formula_id_snapshot",
            "formula_code_snapshot",
            "formula_name_snapshot",
            "formula_revision_id_snapshot",
            "formula_revision_number_snapshot",
            "formula_revision_version_snapshot",
            "formula_base_output_quantity_snapshot",
            "output_uom_id_snapshot",
            "output_uom_code_snapshot",
            "output_uom_name_snapshot",
            "target_output_quantity_snapshot",
            "raw_lines",
            "packaging_lines",
            "source_drift",
            "current_plan_context",
        ]
        read_only_fields = fields

    def _lines(self, obj):
        # `obj.lines` is expected to be prefetched by the view's queryset;
        # cached_lines avoids two separate DB round trips for the two
        # material-type sections.
        if not hasattr(obj, "_cached_lines"):
            obj._cached_lines = list(obj.lines.select_related("material", "unit").all())
        return obj._cached_lines

    def get_raw_lines(self, obj):
        from apps.catalog.models import Material

        return MaterialRequisitionLineSerializer(
            [
                l for l in self._lines(obj)
                if l.material_kind_snapshot in (Material.Kind.RAW_MATERIAL, Material.Kind.MOTHER_TINCTURE)
            ],
            many=True,
        ).data

    def get_packaging_lines(self, obj):
        from apps.catalog.models import Material

        return MaterialRequisitionLineSerializer(
            [l for l in self._lines(obj) if l.material_kind_snapshot == Material.Kind.PACKAGING_MATERIAL], many=True
        ).data

    def get_source_drift(self, obj):
        from apps.material_requisitions.services import assess_requisition_drift

        return assess_requisition_drift(obj)

    def get_current_decision(self, obj):
        """The CURRENT (most recent) round's own decision state, or
        `None` for a requisition that has never been submitted
        (`current_round == 0`). Explicitly NOT a claim that approval is
        still valid against today's source state - see `source_drift`,
        reported separately, for that; a future "issue" action must
        perform its own current validation rather than trust this field.
        """
        if obj.current_round == 0:
            return None
        round_obj = next((r for r in self._rounds(obj) if r.round_number == obj.current_round), None)
        if round_obj is None:
            return None
        return {
            "round_number": round_obj.round_number,
            "outcome": round_obj.outcome,
            "submitted_by_id": round_obj.submitted_by_id,
            "submitted_at": round_obj.submitted_at,
            "decided_by_id": round_obj.decided_by_id,
            "decided_at": round_obj.decided_at,
            "rejection_reason": round_obj.rejection_reason,
            "contributor_provenance_complete": round_obj.contributor_provenance_complete,
        }

    def _rounds(self, obj):
        if not hasattr(obj, "_cached_rounds"):
            obj._cached_rounds = list(
                obj.rounds.order_by("round_number").prefetch_related("lines")
            )
        return obj._cached_rounds

    def get_rounds(self, obj):
        return MaterialRequisitionRoundSerializer(self._rounds(obj), many=True).data

    def get_current_plan_context(self, obj):
        plan = obj.batch_plan
        allocation = getattr(plan, "number_allocation", None)
        return {
            "batch_plan_id": plan.id,
            "batch_plan_version": plan.version,
            "official_batch_number": allocation.number if allocation else None,
        }


class MaterialRequisitionListSerializer(MaterialRequisitionSerializer):
    """Same shape as the detail; separate class so the list can diverge
    later, matching `apps.sales_orders.serializers.SalesOrderListSerializer`
    and `apps.batch_plans`' own list/detail split convention."""


class MaterialRequisitionSubmitSerializer(serializers.Serializer):
    """Body of `POST .../material-requisitions/<id>/submit/`: only the
    optimistic-concurrency token, same shape as `apps.products.
    serializers.ProductVersionSerializer`/`apps.batch_plans.serializers.
    BatchPlanAllocateNumberSerializer` - nothing else is ever accepted.
    """

    expected_version = serializers.IntegerField(required=True)

    def validate(self, attrs):
        if isinstance(self.initial_data, dict):
            rejected = set(self.initial_data.keys()) - {"expected_version"}
            if rejected:
                raise serializers.ValidationError(
                    {field: "Unknown or protected field - it cannot be set through this endpoint." for field in sorted(rejected)}
                )
        return attrs


class MaterialRequisitionApproveSerializer(serializers.Serializer):
    """Body of `POST .../material-requisitions/<id>/approve/`: only the
    optimistic-concurrency token - same shape as `MaterialRequisitionSubmitSerializer`.
    """

    expected_version = serializers.IntegerField(required=True)

    def validate(self, attrs):
        if isinstance(self.initial_data, dict):
            rejected = set(self.initial_data.keys()) - {"expected_version"}
            if rejected:
                raise serializers.ValidationError(
                    {field: "Unknown or protected field - it cannot be set through this endpoint." for field in sorted(rejected)}
                )
        return attrs


class MaterialRequisitionRejectSerializer(serializers.Serializer):
    """Body of `POST .../material-requisitions/<id>/reject/`:
    `expected_version` plus a required, non-blank `rejection_reason`
    (Task 15C's own explicit instruction - re-validated again in the
    service under lock, never trusted from this shape-only check alone).
    """

    expected_version = serializers.IntegerField(required=True)
    rejection_reason = serializers.CharField(required=True, max_length=1000)

    def validate(self, attrs):
        if isinstance(self.initial_data, dict):
            rejected = set(self.initial_data.keys()) - {"expected_version", "rejection_reason"}
            if rejected:
                raise serializers.ValidationError(
                    {field: "Unknown or protected field - it cannot be set through this endpoint." for field in sorted(rejected)}
                )
        if not (attrs.get("rejection_reason") or "").strip():
            raise serializers.ValidationError({"rejection_reason": "A rejection reason is required."})
        return attrs


class MaterialRequisitionReviseSerializer(serializers.Serializer):
    """Body of `POST .../material-requisitions/<id>/revise/`:
    `expected_version` always required; `refresh_from_source`/
    `expected_batch_plan_version` are only required together, and only
    when the source has actually drifted in a quantity-affecting way -
    the service itself decides that and raises a clear 400/409 naming
    exactly what is missing or stale, rather than this shape-only layer
    guessing at business state it cannot see.
    """

    expected_version = serializers.IntegerField(required=True)
    refresh_from_source = serializers.BooleanField(required=False, default=False)
    expected_batch_plan_version = serializers.IntegerField(required=False, allow_null=True, default=None)

    def validate(self, attrs):
        if isinstance(self.initial_data, dict):
            rejected = set(self.initial_data.keys()) - {
                "expected_version",
                "refresh_from_source",
                "expected_batch_plan_version",
            }
            if rejected:
                raise serializers.ValidationError(
                    {field: "Unknown or protected field - it cannot be set through this endpoint." for field in sorted(rejected)}
                )
        return attrs


class MaterialRequisitionRoundLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = MaterialRequisitionRoundLine
        fields = [
            "line_number",
            "material_id",
            "material_code_snapshot",
            "material_name_snapshot",
            "material_kind_snapshot",
            "unit_id",
            "unit_code_snapshot",
            "unit_name_snapshot",
            "base_line_quantity_snapshot",
            "requested_quantity",
            "quantity_remark",
            "requested_quantity_contributor_id",
            "requested_quantity_contributed_at",
        ]
        read_only_fields = fields


class MaterialRequisitionRoundSerializer(serializers.ModelSerializer):
    """One entry of a requisition's round history - every round that has
    ever existed for it, oldest first (see `MaterialRequisitionRound.
    Meta.ordering`), each permanently preserved regardless of outcome.
    """

    lines = MaterialRequisitionRoundLineSerializer(many=True, read_only=True)

    class Meta:
        model = MaterialRequisitionRound
        fields = [
            "round_number",
            "notes_snapshot",
            "source_plan_version_snapshot",
            "target_output_quantity_snapshot",
            "formula_revision_id_snapshot",
            "formula_revision_version_snapshot",
            "submitted_by_id",
            "submitted_at",
            "outcome",
            "decided_by_id",
            "decided_at",
            "rejection_reason",
            "contributor_provenance_complete",
            "lines",
        ]
        read_only_fields = fields
