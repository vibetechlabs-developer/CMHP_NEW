from rest_framework import serializers

from apps.quality.models import ControlSample


class ControlSampleSerializer(serializers.ModelSerializer):
    company_id = serializers.IntegerField(source="company.id", read_only=True)
    product_id = serializers.IntegerField(read_only=True, allow_null=True)
    sales_order_id = serializers.IntegerField(read_only=True, allow_null=True)
    batch_plan_id = serializers.IntegerField(read_only=True, allow_null=True)
    created_by_id = serializers.IntegerField(read_only=True)
    disposed_by_id = serializers.IntegerField(read_only=True, allow_null=True)

    class Meta:
        model = ControlSample
        fields = [
            "id",
            "company_id",
            "product_id",
            "sales_order_id",
            "batch_plan_id",
            "batch_no",
            "product_code",
            "product_name",
            "pack_size",
            "sample_qty",
            "unit",
            "sample_type",
            "storage_location",
            "ar_no",
            "mfg_date",
            "exp_date",
            "tested_by",
            "notes",
            "status",
            "fg_deducted",
            "created_by_id",
            "created_at",
            "updated_at",
            "disposed_by_id",
            "disposed_at",
            "disposal_remarks",
        ]
        read_only_fields = fields


class ControlSampleCreateSerializer(serializers.Serializer):
    batch_no = serializers.CharField(max_length=100)
    product_name = serializers.CharField(max_length=255)
    sample_qty = serializers.DecimalField(max_digits=14, decimal_places=3)
    product_id = serializers.IntegerField(required=False, allow_null=True)
    sales_order_id = serializers.IntegerField(required=False, allow_null=True)
    batch_plan_id = serializers.IntegerField(required=False, allow_null=True)
    product_code = serializers.CharField(required=False, allow_blank=True, max_length=32, default="")
    pack_size = serializers.CharField(required=False, allow_blank=True, max_length=100, default="")
    unit = serializers.CharField(required=False, allow_blank=True, max_length=40, default="Bottles")
    sample_type = serializers.ChoiceField(
        choices=ControlSample.SampleType.choices, required=False, default=ControlSample.SampleType.RETENTION
    )
    storage_location = serializers.CharField(required=False, allow_blank=True, max_length=255, default="")
    ar_no = serializers.CharField(required=False, allow_blank=True, max_length=100, default="")
    mfg_date = serializers.DateField(required=False, allow_null=True)
    exp_date = serializers.DateField(required=False, allow_null=True)
    tested_by = serializers.CharField(required=False, allow_blank=True, max_length=255, default="")
    notes = serializers.CharField(required=False, allow_blank=True, max_length=2000, default="")
    deduct_fg = serializers.BooleanField(required=False, default=False)


class ControlSampleUpdateSerializer(serializers.Serializer):
    sample_qty = serializers.DecimalField(max_digits=14, decimal_places=3, required=False)
    pack_size = serializers.CharField(required=False, allow_blank=True, max_length=100)
    unit = serializers.CharField(required=False, allow_blank=True, max_length=40)
    sample_type = serializers.ChoiceField(choices=ControlSample.SampleType.choices, required=False)
    storage_location = serializers.CharField(required=False, allow_blank=True, max_length=255)
    ar_no = serializers.CharField(required=False, allow_blank=True, max_length=100)
    mfg_date = serializers.DateField(required=False, allow_null=True)
    exp_date = serializers.DateField(required=False, allow_null=True)
    tested_by = serializers.CharField(required=False, allow_blank=True, max_length=255)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=2000)


class ControlSampleDisposeSerializer(serializers.Serializer):
    remarks = serializers.CharField(required=False, allow_blank=True, max_length=2000, default="")
