from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email
from rest_framework import serializers

from apps.customers.models import Customer

# Same convention as apps.suppliers.serializers/apps.purchasing.
# serializers._reject_prohibited_fields: fields explicitly rejected
# (400), not silently ignored, if present in the request body. CREATE
# and UPDATE prohibited sets are built independently, never by unioning
# one into the other - `code` is a legitimate create input but becomes
# prohibited only once a row exists (the exact bug class this project
# hit three times already this session on `receipt_line_id`/`tests`/
# `code`-adjacent fields; see docs/backend-decisions.md, Task 10A).
_CUSTOMER_ALWAYS_PROHIBITED = {
    "is_active",
    "version",
    "created_at",
    "updated_at",
    "created_by",
    "created_by_id",
    "company",
    "company_id",
}
_CUSTOMER_CREATE_PROHIBITED = _CUSTOMER_ALWAYS_PROHIBITED
_CUSTOMER_UPDATE_PROHIBITED = _CUSTOMER_ALWAYS_PROHIBITED | {"code"}

_OPTIONAL_TEXT_FIELDS = ["contact_person", "phone", "city", "gst_number", "billing_address", "shipping_address", "notes"]


def _reject_prohibited_fields(initial_data, prohibited):
    if not isinstance(initial_data, dict):
        return
    rejected = prohibited & set(initial_data.keys())
    if rejected:
        raise serializers.ValidationError(
            {field: "This field cannot be set through this endpoint." for field in sorted(rejected)}
        )


def _validate_optional_email(value):
    if value:
        try:
            validate_email(value)
        except DjangoValidationError:
            raise serializers.ValidationError("Enter a valid email address.")
    return value


class CustomerSerializer(serializers.ModelSerializer):
    company_id = serializers.IntegerField(source="company.id", read_only=True)
    company_code = serializers.CharField(source="company.code", read_only=True)
    gst_no = serializers.CharField(source="gst_number", read_only=True)

    class Meta:
        model = Customer
        fields = [
            "id",
            "company_id",
            "company_code",
            "code",
            "name",
            "contact_person",
            "email",
            "phone",
            "city",
            "gst_number",
            "gst_no",
            "billing_address",
            "shipping_address",
            "notes",
            "is_active",
            "version",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class CustomerCreateSerializer(serializers.ModelSerializer):
    """`company` is never accepted here - it always comes from the URL
    (see apps.customers.views). `code` is required and writable only at
    create; PATCH cannot change it (see CustomerUpdateSerializer below).
    """

    gst_no = serializers.CharField(required=False, allow_blank=True, write_only=True)

    class Meta:
        model = Customer
        fields = [
            "code",
            "name",
            "contact_person",
            "email",
            "phone",
            "city",
            "gst_number",
            "gst_no",
            "billing_address",
            "shipping_address",
            "notes",
        ]
        extra_kwargs = {
            "email": {"required": False, "allow_blank": True},
            **{field: {"required": False, "allow_blank": True} for field in _OPTIONAL_TEXT_FIELDS},
        }

    def validate_email(self, value):
        return _validate_optional_email(value)

    def validate(self, attrs):
        _reject_prohibited_fields(self.initial_data, _CUSTOMER_CREATE_PROHIBITED)
        gst_no = attrs.pop("gst_no", None)
        if gst_no and not attrs.get("gst_number"):
            attrs["gst_number"] = gst_no
        return attrs


class CustomerUpdateSerializer(serializers.Serializer):
    """PATCH-only. `expected_version` is always required (optimistic
    concurrency - see apps.customers.services.update_customer). Every
    other field is independently optional with **no** `default=`: a
    key's mere absence must be distinguishable from an explicit empty
    value, same reasoning as apps.purchasing.serializers.
    PurchaseRequestUpdateSerializer - to clear an optional field, send it
    as an empty string ("") explicitly. `code`/`company` are immutable
    through this endpoint (rejected below, not silently ignored, if
    supplied).
    """

    expected_version = serializers.IntegerField()
    name = serializers.CharField(required=False, max_length=255)
    contact_person = serializers.CharField(required=False, allow_blank=True, max_length=150)
    email = serializers.CharField(required=False, allow_blank=True)
    phone = serializers.CharField(required=False, allow_blank=True, max_length=32)
    city = serializers.CharField(required=False, allow_blank=True, max_length=100)
    gst_number = serializers.CharField(required=False, allow_blank=True, max_length=32)
    gst_no = serializers.CharField(required=False, allow_blank=True, write_only=True, max_length=32)
    billing_address = serializers.CharField(required=False, allow_blank=True)
    shipping_address = serializers.CharField(required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True)

    def validate_email(self, value):
        return _validate_optional_email(value)

    def validate_name(self, value):
        if not value.strip():
            raise serializers.ValidationError("Name cannot be blank.")
        return value

    def validate(self, attrs):
        _reject_prohibited_fields(self.initial_data, _CUSTOMER_UPDATE_PROHIBITED)
        gst_no = attrs.pop("gst_no", None)
        if gst_no is not None and "gst_number" not in attrs:
            attrs["gst_number"] = gst_no
        return attrs


class CustomerVersionSerializer(serializers.Serializer):
    """Body shape shared by the activate/deactivate endpoints: only the
    optimistic-concurrency token, nothing else to submit.
    """

    expected_version = serializers.IntegerField()
