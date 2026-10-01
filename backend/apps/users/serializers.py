from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from apps.companies.models import CompanyMembership
from apps.permissions.models import MembershipRole

User = get_user_model()

# Fields this API must never silently accept, on create or update - rather
# than only omitting them from Meta.fields (which DRF would just ignore
# silently), presence of any of these in the raw request body is treated
# as an explicit error. Superuser/staff status changes, company membership
# and role assignment all have their own dedicated (superuser-gated)
# endpoints/admin; is_active has its own activate/deactivate endpoints.
_PROHIBITED_ON_CREATE = {
    "is_staff",
    "is_superuser",
    "is_active",
    "groups",
    "user_permissions",
    "password",
}
_PROHIBITED_ON_UPDATE = _PROHIBITED_ON_CREATE | {"initial_password"}


def _reject_prohibited_fields(initial_data, prohibited):
    rejected = prohibited & set(initial_data.keys())
    if rejected:
        raise serializers.ValidationError(
            {field: "This field cannot be set through this endpoint." for field in sorted(rejected)}
        )


class UserSerializer(serializers.ModelSerializer):
    """Safe fields only - no password/hash, no tokens. Membership detail is
    not nested here (that would mean an extra query per row in the list
    view); `memberships_url` links to the dedicated endpoint instead.
    """

    memberships_url = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "is_active",
            "is_staff",
            "is_superuser",
            "date_joined",
            "updated_at",
            "memberships_url",
        ]
        read_only_fields = fields

    def get_memberships_url(self, obj):
        return f"/api/v1/users/{obj.id}/memberships/"


class UserCreateSerializer(serializers.ModelSerializer):
    initial_password = serializers.CharField(write_only=True, trim_whitespace=False)

    class Meta:
        model = User
        fields = ["username", "email", "first_name", "last_name", "initial_password"]
        extra_kwargs = {
            "first_name": {"required": False, "allow_blank": True},
            "last_name": {"required": False, "allow_blank": True},
        }

    def validate(self, attrs):
        _reject_prohibited_fields(self.initial_data, _PROHIBITED_ON_CREATE)
        return attrs

    def validate_initial_password(self, value):
        validate_password(value)
        return value


class UserUpdateSerializer(serializers.ModelSerializer):
    """PATCH-only: username/email/first_name/last_name. Uniqueness is
    enforced by DRF's normal auto-generated UniqueValidator (which
    excludes this instance's own row), same as any other ModelSerializer
    update - no extra code needed for that.
    """

    class Meta:
        model = User
        fields = ["username", "email", "first_name", "last_name"]
        extra_kwargs = {
            "username": {"required": False},
            "email": {"required": False},
            "first_name": {"required": False, "allow_blank": True},
            "last_name": {"required": False, "allow_blank": True},
        }

    def validate(self, attrs):
        _reject_prohibited_fields(self.initial_data, _PROHIBITED_ON_UPDATE)
        return attrs


class MembershipSerializer(serializers.ModelSerializer):
    company_id = serializers.IntegerField(source="company.id", read_only=True)
    company_code = serializers.CharField(source="company.code", read_only=True)
    company_legal_name = serializers.CharField(source="company.legal_name", read_only=True)
    company_display_name = serializers.CharField(source="company.display_name", read_only=True)

    class Meta:
        model = CompanyMembership
        fields = [
            "id",
            "is_active",
            "company_id",
            "company_code",
            "company_legal_name",
            "company_display_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class MembershipCreateSerializer(serializers.Serializer):
    company_id = serializers.IntegerField()


class RoleAssignmentSerializer(serializers.ModelSerializer):
    role_id = serializers.IntegerField(source="role.id", read_only=True)
    role_code = serializers.CharField(source="role.code", read_only=True)
    role_name = serializers.CharField(source="role.name", read_only=True)

    class Meta:
        model = MembershipRole
        fields = ["id", "is_active", "role_id", "role_code", "role_name", "created_at", "updated_at"]
        read_only_fields = fields


class RoleAssignmentCreateSerializer(serializers.Serializer):
    role_id = serializers.IntegerField()
