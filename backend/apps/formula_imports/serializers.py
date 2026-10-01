from rest_framework import serializers

from apps.formula_imports.models import FormulaImportBatch, FormulaImportGroup, FormulaImportLine


class FormulaImportLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = FormulaImportLine
        fields = [
            "id",
            "line_number",
            "file_row_number",
            "material_code",
            "resolved_material_id",
            "material_quantity",
            "is_valid",
            "errors",
        ]
        read_only_fields = fields


class FormulaImportGroupSerializer(serializers.ModelSerializer):
    """One prospective `Formula`, with ALL its lines nested (bounded by
    `MAX_LINES_PER_GROUP` - never separately paginated; pagination
    happens across GROUPS, in the batch response, not across lines
    within one group).
    """

    lines = FormulaImportLineSerializer(many=True, read_only=True)

    class Meta:
        model = FormulaImportGroup
        fields = [
            "id",
            "group_number",
            "formula_code",
            "formula_name",
            "product_code",
            "resolved_product_id",
            "base_output_quantity",
            "output_uom_code",
            "resolved_output_uom_id",
            "formula_notes",
            "revision_notes",
            "is_valid",
            "errors",
            "lines",
        ]
        read_only_fields = fields


class FormulaImportBatchSerializer(serializers.ModelSerializer):
    """Summary shape shared by the preview-create, preview-detail and
    commit responses. `committed_at`/`committed_by_id`/`created_formulas`
    are always `null` until `status` is `COMMITTED`.
    """

    class Meta:
        model = FormulaImportBatch
        fields = [
            "id",
            "company_id",
            "status",
            "source_filename",
            "total_rows",
            "valid_rows",
            "invalid_rows",
            "total_groups",
            "valid_groups",
            "invalid_groups",
            "eligible_for_commit",
            "file_errors",
            "version",
            "previewed_at",
            "expires_at",
            "committed_at",
            "committed_by_id",
            "created_formulas",
        ]
        read_only_fields = fields


class FormulaImportCommitSerializer(serializers.Serializer):
    """Body of `POST .../formulas/import-commit/`. `preview_id` is the
    server-issued `FormulaImportBatch.id` from the preview response -
    never a replacement formula/group/line list (Task 14B's own explicit
    instruction).
    """

    preview_id = serializers.IntegerField()
    expected_version = serializers.IntegerField()

    def validate(self, attrs):
        if not isinstance(self.initial_data, dict):
            return attrs
        allowed = {"preview_id", "expected_version"}
        rejected = set(self.initial_data.keys()) - allowed
        if rejected:
            raise serializers.ValidationError(
                {field: "This field cannot be set through this endpoint." for field in sorted(rejected)}
            )
        return attrs
