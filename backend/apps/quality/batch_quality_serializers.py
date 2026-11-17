from rest_framework import serializers

from apps.quality.models import BatchQualityCase, BatchQualityDecision


class BatchQualityDecisionSerializer(serializers.ModelSerializer):
    decided_by_name = serializers.SerializerMethodField()

    class Meta:
        model = BatchQualityDecision
        fields = [
            "id",
            "decision_type",
            "outcome",
            "previous_status",
            "new_status",
            "decided_by_id",
            "decided_by_name",
            "decided_at",
            "remarks",
            "document_reference",
        ]
        read_only_fields = fields

    def get_decided_by_name(self, obj):
        user = obj.decided_by
        if not user:
            return ""
        name = user.get_full_name().strip()
        return name or user.username


class BatchQualityCaseListSerializer(serializers.ModelSerializer):
    class Meta:
        model = BatchQualityCase
        fields = [
            "id",
            "company_id",
            "batch_plan_id",
            "batch_number_snapshot",
            "product_id_snapshot",
            "product_code_snapshot",
            "product_name_snapshot",
            "stage_status",
            "qc_status",
            "qa_release_status",
            "coa_status",
            "coa_document_reference",
            "packaging_complete",
            "packaging_complete_at",
            "packaging_complete_by_id",
            "packaging_qa_status",
            "created_at",
            "updated_at",
            "version",
        ]
        read_only_fields = fields


class BatchQualityCaseDetailSerializer(serializers.ModelSerializer):
    decisions = BatchQualityDecisionSerializer(many=True, read_only=True)

    class Meta:
        model = BatchQualityCase
        fields = [
            "id",
            "company_id",
            "batch_plan_id",
            "batch_number_snapshot",
            "product_id_snapshot",
            "product_code_snapshot",
            "product_name_snapshot",
            "stage_status",
            "qc_status",
            "qa_release_status",
            "coa_status",
            "coa_document_reference",
            "packaging_complete",
            "packaging_complete_at",
            "packaging_complete_by_id",
            "packaging_qa_status",
            "created_at",
            "updated_at",
            "version",
            "decisions",
        ]
        read_only_fields = fields


class BatchQualityCaseCreateSerializer(serializers.Serializer):
    batch_plan_id = serializers.IntegerField(required=True)


class BatchQualityDecisionCreateSerializer(serializers.Serializer):
    expected_version = serializers.IntegerField(required=True)
    outcome = serializers.ChoiceField(
        choices=[
            BatchQualityDecision.Outcome.APPROVED,
            BatchQualityDecision.Outcome.REJECTED,
            BatchQualityDecision.Outcome.HOLD,
        ],
        required=True,
    )
    remarks = serializers.CharField(required=False, allow_blank=True, default="")


class BatchQualityCoaCreateSerializer(serializers.Serializer):
    expected_version = serializers.IntegerField(required=True)
    remarks = serializers.CharField(required=False, allow_blank=True, default="")


class BatchQualityCoaDecisionCreateSerializer(serializers.Serializer):
    expected_version = serializers.IntegerField(required=True)
    outcome = serializers.ChoiceField(
        choices=[
            BatchQualityDecision.Outcome.APPROVED,
            BatchQualityDecision.Outcome.REJECTED,
            BatchQualityDecision.Outcome.HOLD,
        ],
        required=True,
    )
    document_reference = serializers.CharField(required=True)
    remarks = serializers.CharField(required=False, allow_blank=True, default="")


class BatchQualityPackagingCompleteSerializer(serializers.Serializer):
    expected_version = serializers.IntegerField(required=True)
    remarks = serializers.CharField(required=False, allow_blank=True, default="")

