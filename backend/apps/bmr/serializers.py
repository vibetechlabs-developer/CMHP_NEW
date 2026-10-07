from rest_framework import serializers

from apps.bmr.models import BatchManufacturingRecord, BMRLine

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
