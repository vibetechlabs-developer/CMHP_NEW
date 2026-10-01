from rest_framework import serializers

from apps.suppliers.models import Supplier

# Same convention as apps.catalog.serializers._COMMON_PROHIBITED: fields
# explicitly rejected (not silently ignored) if present in the request
# body - `is_active`/`created_at`/`updated_at` have no writable path on
# this endpoint (activation/deactivation are separate endpoints, and
# timestamps are server-assigned); `quantity`/`stock`/`company_id`/
# `owner_id`/`company`/`owner` do not exist on Supplier at all (no stock,
# no owning company - see apps.suppliers.models.Supplier).
_COMMON_PROHIBITED = {
    "is_active",
    "created_at",
    "updated_at",
    "quantity",
    "stock",
    "company_id",
    "owner_id",
    "company",
    "owner",
}
_PROHIBITED_ON_UPDATE = _COMMON_PROHIBITED | {"code"}

_OPTIONAL_TEXT_FIELDS = [
    "display_name",
    "contact_name",
    "phone",
    "address_line_1",
    "address_line_2",
    "city",
    "state_region",
    "postal_code",
    "country_code",
]


def _reject_prohibited_fields(initial_data, prohibited):
    rejected = prohibited & set(initial_data.keys())
    if rejected:
        raise serializers.ValidationError(
            {field: "This field cannot be set through this endpoint." for field in sorted(rejected)}
        )


class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = [
            "id",
            "code",
            "legal_name",
            "display_name",
            "contact_name",
            "email",
            "phone",
            "address_line_1",
            "address_line_2",
            "city",
            "state_region",
            "postal_code",
            "country_code",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class SupplierCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = [
            "code",
            "legal_name",
            "display_name",
            "contact_name",
            "email",
            "phone",
            "address_line_1",
            "address_line_2",
            "city",
            "state_region",
            "postal_code",
            "country_code",
        ]
        extra_kwargs = {
            "email": {"required": False, "allow_blank": True},
            **{field: {"required": False, "allow_blank": True} for field in _OPTIONAL_TEXT_FIELDS},
        }

    def validate(self, attrs):
        _reject_prohibited_fields(self.initial_data, _COMMON_PROHIBITED)
        return attrs


class SupplierUpdateSerializer(serializers.ModelSerializer):
    """PATCH-only: legal_name/display_name/contact_name/email/phone/
    address_line_1/address_line_2/city/state_region/postal_code/
    country_code. `code` is immutable through this API. Omitted fields
    are left unchanged (this serializer is always used with
    `partial=True`). To clear an optional field, send it as an empty
    string ("") explicitly - the same convention already used by
    apps.catalog.serializers.MaterialCategoryUpdateSerializer.description
    - `legal_name` cannot be cleared this way (it stays required if
    supplied at all, same as on create).
    """

    class Meta:
        model = Supplier
        fields = [
            "legal_name",
            "display_name",
            "contact_name",
            "email",
            "phone",
            "address_line_1",
            "address_line_2",
            "city",
            "state_region",
            "postal_code",
            "country_code",
        ]
        extra_kwargs = {
            "legal_name": {"required": False},
            "email": {"required": False, "allow_blank": True},
            **{field: {"required": False, "allow_blank": True} for field in _OPTIONAL_TEXT_FIELDS},
        }

    def validate(self, attrs):
        _reject_prohibited_fields(self.initial_data, _PROHIBITED_ON_UPDATE)
        return attrs
