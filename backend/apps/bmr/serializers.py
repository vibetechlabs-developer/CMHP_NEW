from rest_framework import serializers

from apps.bmr.models import (
    BatchManufacturingRecord,
    BMRLine,
    BMRDocument,
    ProductionOrderStatus,
    OrderDocumentRecord,
    OrderDispatchAuditLog,
)

_UPDATE_ALLOWED = {"expected_version", "special_value", "label_claim", "ar_no", "qty_received"}


class BMRLineSerializer(serializers.ModelSerializer):
    display_required = serializers.CharField(read_only=True)

    class Meta:
        model = BMRLine
        fields = [
            "id",
            "slip",
            "line_number",
            "formula_line_id",
            "material_code",
            "material_name",
            "unit_code",
            "required_text",
            "special_value",
            "display_required",
            "label_claim",
            "ar_no",
            "qty_received",
            "version",
            "updated_at",
        ]
        read_only_fields = fields


class BMRSerializer(serializers.ModelSerializer):
    batch_plan_id = serializers.IntegerField(read_only=True)
    formula_revision_id = serializers.IntegerField(read_only=True)
    lines = serializers.SerializerMethodField()

    class Meta:
        model = BatchManufacturingRecord
        fields = ["id", "company_id", "batch_plan_id", "formula_revision_id", "version", "created_at", "updated_at", "lines"]
        read_only_fields = fields

    def get_lines(self, obj):
        return BMRLineSerializer(obj.lines.all(), many=True).data


class BMRLineUpdateSerializer(serializers.Serializer):
    expected_version = serializers.IntegerField(min_value=1)
    special_value = serializers.CharField(required=False, allow_blank=True, max_length=60)
    label_claim = serializers.CharField(required=False, allow_blank=True, max_length=100)
    ar_no = serializers.CharField(required=False, allow_blank=True, max_length=100)
    qty_received = serializers.CharField(required=False, allow_blank=True, max_length=40)

    def validate(self, attrs):
        if isinstance(self.initial_data, dict):
            rejected = set(self.initial_data.keys()) - _UPDATE_ALLOWED
            if rejected:
                raise serializers.ValidationError(
                    {field: "Unknown or protected field." for field in sorted(rejected)}
                )
        return attrs


class BMRDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = BMRDocument
        fields = [
            "id",
            "company_id",
            "order_id",
            "batch_no",
            "bmr_type",
            "data",
            "is_draft",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]



class ProductionOrderStatusSerializer(serializers.ModelSerializer):
    dispatched_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ProductionOrderStatus
        fields = [
            "id",
            "company_id",
            "order_id",
            "order_reference",
            "batch_no",
            "bmr_status",
            "production_status",
            "production_remark",
            "packaging_status",
            "dispatch_status",
            "qa_status",
            "qa_remark",
            "dispatched_at",
            "dispatched_by",
            "dispatched_by_name",
            "is_locked",
            "physically_dispatched",
            "coa_returned",
            "coa_returned_at",
            "coa_return_reason",
            "production_returned",
            "production_returned_at",
            "production_return_reason",
            "updated_at",
            "created_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_dispatched_by_name(self, obj):
        if obj.dispatched_by:
            return obj.dispatched_by.get_full_name() or obj.dispatched_by.username
        return ""


class OrderDocumentRecordSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = OrderDocumentRecord
        fields = [
            "id",
            "company_id",
            "order_id",
            "order_reference",
            "product_type",
            "batch_no",
            "doc_type",
            "sub_type",
            "title",
            "status",
            "data",
            "file",
            "file_url",
            "is_locked",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_file_url(self, obj):
        if obj.file:
            try:
                return obj.file.url
            except Exception:
                return ""
        return ""


class OrderDispatchAuditLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderDispatchAuditLog
        fields = [
            "id",
            "company_id",
            "order_id",
            "order_reference",
            "action",
            "actor_id",
            "actor_username",
            "reason",
            "metadata",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]

