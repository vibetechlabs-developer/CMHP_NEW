import hashlib
from rest_framework import serializers

from apps.bmr.models import BMRDocumentAttachment
from apps.quality.models import COADocumentAttachment


class BMRDocumentAttachmentSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.SerializerMethodField()
    is_physically_attached = serializers.BooleanField(read_only=True)
    effective_attachment_status = serializers.CharField(read_only=True)
    document_type_display = serializers.CharField(source="get_document_type_display", read_only=True)

    class Meta:
        model = BMRDocumentAttachment
        fields = [
            "id",
            "company_id",
            "batch_plan_id",
            "batch_number",
            "product_name_snapshot",
            "product_code_snapshot",
            "bmr_number",
            "document_name",
            "document_type",
            "document_type_display",
            "file",
            "file_size",
            "mime_type",
            "sha256_checksum",
            "version",
            "status",
            "effective_attachment_status",
            "is_physically_attached",
            "remarks",
            "uploaded_by_id",
            "uploaded_by_name",
            "uploaded_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "file_size",
            "mime_type",
            "sha256_checksum",
            "version",
            "uploaded_by_id",
            "uploaded_by_name",
            "uploaded_at",
            "updated_at",
        ]

    def get_uploaded_by_name(self, obj):
        if obj.uploaded_by:
            full = f"{obj.uploaded_by.first_name} {obj.uploaded_by.last_name}".strip()
            return full or obj.uploaded_by.username or obj.uploaded_by.email
        return "—"


class BMRDocumentUploadSerializer(serializers.Serializer):
    batch_plan_id = serializers.IntegerField(required=True)
    document_type = serializers.ChoiceField(choices=BMRDocumentAttachment.DocumentType.choices, default=BMRDocumentAttachment.DocumentType.MASTER_BMR)
    document_name = serializers.CharField(max_length=255, required=False, allow_blank=True)
    bmr_number = serializers.CharField(max_length=100, required=False, allow_blank=True)
    file = serializers.FileField(required=True)
    remarks = serializers.CharField(required=False, allow_blank=True, default="")


class COADocumentAttachmentSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()
    is_physically_attached = serializers.BooleanField(read_only=True)
    effective_file_status = serializers.CharField(read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = COADocumentAttachment
        fields = [
            "id",
            "company_id",
            "batch_plan_id",
            "quality_case_id",
            "batch_number",
            "product_name_snapshot",
            "product_code_snapshot",
            "coa_number",
            "document_name",
            "qc_reference",
            "mfg_date",
            "expiry_date",
            "file",
            "file_size",
            "mime_type",
            "sha256_checksum",
            "version",
            "status",
            "status_display",
            "qc_status",
            "qa_status",
            "is_physically_attached",
            "effective_file_status",
            "remarks",
            "uploaded_by_id",
            "uploaded_by_name",
            "uploaded_at",
            "approved_by_id",
            "approved_by_name",
            "approved_at",
            "approval_remarks",
            "rejection_reason",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "file_size",
            "mime_type",
            "sha256_checksum",
            "version",
            "status",
            "status_display",
            "qc_status",
            "qa_status",
            "uploaded_by_id",
            "uploaded_by_name",
            "uploaded_at",
            "approved_by_id",
            "approved_by_name",
            "approved_at",
            "approval_remarks",
            "rejection_reason",
            "updated_at",
        ]

    def get_uploaded_by_name(self, obj):
        if obj.uploaded_by:
            full = f"{obj.uploaded_by.first_name} {obj.uploaded_by.last_name}".strip()
            return full or obj.uploaded_by.username or obj.uploaded_by.email
        return "—"

    def get_approved_by_name(self, obj):
        if obj.approved_by:
            full = f"{obj.approved_by.first_name} {obj.approved_by.last_name}".strip()
            return full or obj.approved_by.username or obj.approved_by.email
        return "—"


class COADocumentUploadSerializer(serializers.Serializer):
    batch_plan_id = serializers.IntegerField(required=False, allow_null=True)
    quality_case_id = serializers.IntegerField(required=False, allow_null=True)
    batch_number = serializers.CharField(max_length=100, required=False, allow_blank=True)
    coa_number = serializers.CharField(max_length=100, required=True)
    document_name = serializers.CharField(max_length=255, required=False, allow_blank=True)
    qc_reference = serializers.CharField(max_length=100, required=False, allow_blank=True, default="")
    mfg_date = serializers.DateField(required=False, allow_null=True)
    expiry_date = serializers.DateField(required=False, allow_null=True)
    file = serializers.FileField(required=True)
    remarks = serializers.CharField(required=False, allow_blank=True, default="")


class COAApprovalActionSerializer(serializers.Serializer):
    remarks = serializers.CharField(required=False, allow_blank=True, default="")


class COARejectionActionSerializer(serializers.Serializer):
    reason = serializers.CharField(required=True, min_length=3)

