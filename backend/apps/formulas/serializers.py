from decimal import Decimal

from rest_framework import serializers

from apps.formulas.models import Formula, FormulaLine, FormulaRevision

# Allow-lists: every key outside the set is rejected with 400 (never
# silently ignored). Create/update sets are independent. Notably absent
# everywhere: `material_type`/`type`/`unit_id`/`unit` (derived from the
# material), `line_number`, `revision_number`,
# `latest_revision_number`, `version` (only `expected_version` on PATCH),
# `status`, `company`, snapshots, audit fields, any approval/batch field.
# `output_uom_id` (Task 12B-2) is create-only, optional - see
# `apps.formulas.services._resolve_revision_output_uom`; absent from every
# *_UPDATE set below, since `FormulaRevision.output_uom` stays immutable
# after creation exactly as before.
_FORMULA_CREATE = {"product_id", "code", "name", "notes", "base_output_quantity", "revision_notes", "output_uom_id"}
_FORMULA_UPDATE = {"expected_version", "name", "notes"}
_REVISION_CREATE = {"base_output_quantity", "notes", "output_uom_id"}
_REVISION_UPDATE = {"expected_version", "base_output_quantity", "notes", "lines"}
_LINE_ALLOWED = {"id", "material_id", "quantity", "notes"}
_MAX_LINES = 200
_APPROVE = {"expected_version"}
_POLICY_UPDATE = {"expected_version", "allow_self_approval"}


def _reject_unknown_fields(data, allowed):
    if not isinstance(data, dict):
        return
    rejected = set(data.keys()) - allowed
    if rejected:
        raise serializers.ValidationError(
            {field: "Unknown or protected field - it cannot be set through this endpoint." for field in sorted(rejected)}
        )


_QUANTITY = dict(max_digits=14, decimal_places=3, min_value=Decimal("0.001"))


class FormulaLineSerializer(serializers.ModelSerializer):
    material_id = serializers.IntegerField(read_only=True)
    material_code = serializers.CharField(source="material_code_snapshot", read_only=True)
    material_name = serializers.CharField(source="material_name_snapshot", read_only=True)
    material_type = serializers.CharField(source="material_kind_snapshot", read_only=True)
    unit_id = serializers.IntegerField(read_only=True)
    unit_code = serializers.CharField(source="unit_code_snapshot", read_only=True)
    unit_name = serializers.CharField(source="unit_name_snapshot", read_only=True)
    material_is_active = serializers.BooleanField(source="material.is_active", read_only=True)
    unit_is_active = serializers.BooleanField(source="unit.is_active", read_only=True)

    class Meta:
        model = FormulaLine
        fields = [
            "id",
            "line_number",
            "material_id",
            "material_code",
            "material_name",
            "material_type",
            "unit_id",
            "unit_code",
            "unit_name",
            "material_is_active",
            "unit_is_active",
            "quantity",
            "notes",
        ]
        read_only_fields = fields


class _RevisionBase(serializers.ModelSerializer):
    formula_id = serializers.IntegerField(read_only=True)
    output_uom_id = serializers.IntegerField(read_only=True)
    output_uom_code = serializers.CharField(source="output_uom.code", read_only=True)
    output_uom_name = serializers.CharField(source="output_uom.name", read_only=True)
    output_uom_is_active = serializers.BooleanField(source="output_uom.is_active", read_only=True)


class FormulaRevisionSummarySerializer(_RevisionBase):
    line_count = serializers.SerializerMethodField()

    class Meta:
        model = FormulaRevision
        fields = [
            "id",
            "formula_id",
            "revision_number",
            "status",
            "base_output_quantity",
            "output_uom_id",
            "output_uom_code",
            "output_uom_name",
            "output_uom_is_active",
            "notes",
            "line_count",
            "version",
            "created_at",
            "updated_at",
            "approved_by_id",
            "approved_at",
            "approval_policy_version",
        ]
        read_only_fields = fields

    def get_line_count(self, obj):
        return len(obj.lines.all())


class FormulaRevisionSerializer(FormulaRevisionSummarySerializer):
    """Full revision including ONE `lines` collection holding both raw and
    packaging lines (distinguished by `material_type`); the frontend
    splits it into two tables that are saved together in one PATCH.
    """

    lines = FormulaLineSerializer(many=True, read_only=True)

    class Meta(FormulaRevisionSummarySerializer.Meta):
        # Applied policy values and the identity frozen at approval (null for drafts).
        fields = FormulaRevisionSummarySerializer.Meta.fields + [
            "approval_policy_snapshot",
            "approved_identity_snapshot",
            "lines",
        ]
        read_only_fields = fields


class FormulaSerializer(serializers.ModelSerializer):
    company_id = serializers.IntegerField(source="company.id", read_only=True)
    product_id = serializers.IntegerField(read_only=True)
    product_code = serializers.CharField(source="product.code", read_only=True)
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_is_active = serializers.BooleanField(source="product.is_active", read_only=True)
    revisions = FormulaRevisionSummarySerializer(many=True, read_only=True)

    class Meta:
        model = Formula
        fields = [
            "id",
            "company_id",
            "product_id",
            "product_code",
            "product_name",
            "product_is_active",
            "code",
            "name",
            "notes",
            "latest_revision_number",
            "version",
            "revisions",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class FormulaCreateSerializer(serializers.Serializer):
    product_id = serializers.IntegerField()
    code = serializers.CharField(max_length=32)
    name = serializers.CharField(max_length=255)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=2000, default="")
    base_output_quantity = serializers.DecimalField(**_QUANTITY)
    revision_notes = serializers.CharField(required=False, allow_blank=True, max_length=2000, default="")
    # Task 12B-2: optional; omitted preserves the original default
    # (product.sales_uom) exactly. See apps.formulas.services.
    # _resolve_revision_output_uom.
    output_uom_id = serializers.IntegerField(required=False)

    def validate(self, attrs):
        _reject_unknown_fields(self.initial_data, _FORMULA_CREATE)
        return attrs


class FormulaUpdateSerializer(serializers.Serializer):
    expected_version = serializers.IntegerField()
    name = serializers.CharField(required=False, max_length=255)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=2000)

    def validate_name(self, value):
        if not value.strip():
            raise serializers.ValidationError("Name cannot be blank.")
        return value

    def validate(self, attrs):
        _reject_unknown_fields(self.initial_data, _FORMULA_UPDATE)
        return attrs


class RevisionCreateSerializer(serializers.Serializer):
    base_output_quantity = serializers.DecimalField(**_QUANTITY)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=2000, default="")
    # Task 12B-2: optional; omitted preserves the original default
    # (product.sales_uom) exactly, same as FormulaCreateSerializer.
    output_uom_id = serializers.IntegerField(required=False)

    def validate(self, attrs):
        _reject_unknown_fields(self.initial_data, _REVISION_CREATE)
        return attrs


class FormulaLineInputSerializer(serializers.Serializer):
    id = serializers.IntegerField(required=False)
    material_id = serializers.IntegerField()
    quantity = serializers.DecimalField(**_QUANTITY)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=500)

    def to_internal_value(self, data):
        _reject_unknown_fields(data, _LINE_ALLOWED)
        return super().to_internal_value(data)


class RevisionUpdateSerializer(serializers.Serializer):
    expected_version = serializers.IntegerField()
    base_output_quantity = serializers.DecimalField(required=False, **_QUANTITY)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    lines = FormulaLineInputSerializer(many=True, required=False, max_length=_MAX_LINES)

    def validate(self, attrs):
        _reject_unknown_fields(self.initial_data, _REVISION_UPDATE)
        return attrs


class RevisionApproveSerializer(serializers.Serializer):
    expected_version = serializers.IntegerField(min_value=1)

    def validate(self, attrs):
        _reject_unknown_fields(self.initial_data, _APPROVE)
        return attrs


class ApprovalPolicyUpdateSerializer(serializers.Serializer):
    """`expected_version` 0 creates. `allow_self_approval` must be an explicit
    true/false; `null` is rejected (a value is only answered, never cleared or
    defaulted).
    """

    expected_version = serializers.IntegerField(min_value=0)
    allow_self_approval = serializers.BooleanField(required=False)

    def validate(self, attrs):
        _reject_unknown_fields(self.initial_data, _POLICY_UPDATE)
        return attrs
