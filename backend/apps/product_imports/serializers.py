from rest_framework import serializers

from apps.product_imports.models import ProductImportBatch, ProductImportRow


class ProductImportRowSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductImportRow
        fields = [
            "id",
            "row_number",
            "code",
            "name",
            "product_type",
            "description",
            "sales_uom_code",
            "resolved_sales_uom_id",
            "is_valid",
            "errors",
        ]
        read_only_fields = fields


class ProductImportBatchSerializer(serializers.ModelSerializer):
    """Summary shape shared by the preview-create, preview-detail and
    commit responses. `created_product_ids`/`committed_at`/
    `committed_by_id` are always `null` until `status` is `COMMITTED`.
    """

    class Meta:
        model = ProductImportBatch
        fields = [
            "id",
            "company_id",
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
            "created_product_ids",
        ]
        read_only_fields = fields


class ProductImportCommitSerializer(serializers.Serializer):
    """Body of `POST .../products/import-commit/`. `preview_id` is the
    server-issued `ProductImportBatch.id` from the preview response -
    never a replacement list of products or rows (Task 14A's own explicit
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
