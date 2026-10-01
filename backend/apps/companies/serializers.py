from rest_framework import serializers

from apps.companies.models import Company

# Fields explicitly rejected (not silently ignored) if present in the
# request body - `is_active` has its own activate/deactivate endpoints,
# and `code` is immutable through PATCH once a company is created.
_PROHIBITED_ON_CREATE = {"is_active"}
_PROHIBITED_ON_UPDATE = _PROHIBITED_ON_CREATE | {"code"}


def _reject_prohibited_fields(initial_data, prohibited):
    rejected = prohibited & set(initial_data.keys())
    if rejected:
        raise serializers.ValidationError(
            {field: "This field cannot be set through this endpoint." for field in sorted(rejected)}
        )


class CompanySerializer(serializers.ModelSerializer):
    """Used by GET /api/v1/companies/mine/ - unchanged since Task 04.
    Deliberately minimal (no is_active/timestamps): every company /mine/
    returns is already active by construction (active_companies_for_user).
    """

    class Meta:
        model = Company
        fields = ["id", "code", "legal_name", "display_name"]
        read_only_fields = fields


class CompanyDetailSerializer(serializers.ModelSerializer):
    """Management responses (list/detail/create/update/activate/
    deactivate) - includes is_active and timestamps, unlike CompanySerializer
    above, since an administrator managing companies needs to see those.
    """

    class Meta:
        model = Company
        fields = ["id", "code", "legal_name", "display_name", "is_active", "created_at", "updated_at"]
        read_only_fields = fields


class CompanyCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Company
        fields = ["code", "legal_name", "display_name"]
        extra_kwargs = {"display_name": {"required": False, "allow_blank": True}}

    def validate(self, attrs):
        _reject_prohibited_fields(self.initial_data, _PROHIBITED_ON_CREATE)
        return attrs


class CompanyUpdateSerializer(serializers.ModelSerializer):
    """PATCH-only: legal_name/display_name. `code` is immutable through
    this API - explicitly rejected (400) if present in the request body,
    rather than silently ignored, matching apps.users.serializers'
    prohibited-field pattern from Task 05.
    """

    class Meta:
        model = Company
        fields = ["legal_name", "display_name"]
        extra_kwargs = {
            "legal_name": {"required": False},
            "display_name": {"required": False, "allow_blank": True},
        }

    def validate(self, attrs):
        _reject_prohibited_fields(self.initial_data, _PROHIBITED_ON_UPDATE)
        return attrs
