from rest_framework import serializers

from apps.material_imports.models import MaterialImportBatch, MaterialImportRow


class MaterialImportRowSerializer(serializers.ModelSerializer):
    class Meta:
        model = MaterialImportRow
        fields = [
            "id",
            "row_number",
            "code",
            "name",
            "material_type",
            "base_unit_code",
            "resolved_base_unit_id",
            "description",
            "is_valid",
            "errors",
        ]
        read_only_fields = fields


class MaterialImportBatchSerializer(serializers.ModelSerializer):
    """Summary shape shared by the preview-create, preview-detail and
    commit responses. `committed_at`/`committed_by_id`/
    `created_material_ids` are always `null` until `status` is
    `COMMITTED`. No `company_id` field anywhere - this is a shared
    catalog import, never company-scoped.
    """

    class Meta:
        model = MaterialImportBatch
        fields = [
            "id",
            "status",
            "source_filename",
            "total_rows",
            "valid_rows",
            "invalid_rows",
            "eligible_for_commit",
            "file_errors",
            "version",
            "previewed_at",
            "expires_at",
            "committed_at",
            "committed_by_id",
            "created_material_ids",
        ]
        read_only_fields = fields


class MaterialImportCommitSerializer(serializers.Serializer):
    """Body of `POST /materials/import-commit/`. `preview_id` is the
    server-issued `MaterialImportBatch.id` from the preview response -
    never a replacement material/row list (Task 14C's own explicit
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
