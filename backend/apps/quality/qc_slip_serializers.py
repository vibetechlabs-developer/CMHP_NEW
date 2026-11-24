from rest_framework import serializers
from apps.quality.models import QcSlipRecord


class QcSlipRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = QcSlipRecord
        fields = [
            "id",
            "company",
            "order_id",
            "batch_no",
            "product_type",
            "slip_kind",
            "sub_kind",
            "status",
            "data",
            "completed_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]
