from rest_framework import serializers

from apps.permissions.models import StoreRoleAssignment
from apps.stores.models import SharedStore, StorageLocation, StoreMembership

# Fields explicitly rejected (not silently ignored) if present in the
# request body - mirrors apps.companies.serializers' pattern exactly.
_PROHIBITED_ON_CREATE = {"is_active"}
_PROHIBITED_ON_UPDATE = _PROHIBITED_ON_CREATE | {"code"}

# Locations additionally reject fields that do not, and must not, exist
# on this model at all (Task 07B: no stock quantity, no company/owner
# FK) - explicit, not a silent Meta.fields omission, matching
# apps.catalog.serializers' identical rule for the material catalog.
_LOCATION_COMMON_PROHIBITED = {
    "is_active",
    "quantity",
    "stock",
    "company_id",
    "owner_id",
    "company",
    "owner",
    "store",
}
_LOCATION_PROHIBITED_ON_UPDATE = _LOCATION_COMMON_PROHIBITED | {"code"}


def _reject_prohibited_fields(initial_data, prohibited):
    rejected = prohibited & set(initial_data.keys())
    if rejected:
        raise serializers.ValidationError(
            {field: "This field cannot be set through this endpoint." for field in sorted(rejected)}
        )


class StoreSerializer(serializers.ModelSerializer):
    """Used by GET /api/v1/stores/mine/ - deliberately minimal (no
    is_active/timestamps), mirroring apps.companies.serializers.
    CompanySerializer: every store /mine/ returns is already active by
    construction (active_stores_for_user).
    """

    class Meta:
        model = SharedStore
        fields = ["id", "code", "name", "description"]
        read_only_fields = fields


class StoreDetailSerializer(serializers.ModelSerializer):
    """Management responses (list/detail/create/update/activate/
    deactivate) - includes is_active and timestamps.
    """

    class Meta:
        model = SharedStore
        fields = ["id", "code", "name", "description", "is_active", "created_at", "updated_at"]
        read_only_fields = fields


class StoreCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = SharedStore
        fields = ["code", "name", "description"]
        extra_kwargs = {"description": {"required": False, "allow_blank": True}}

    def validate(self, attrs):
        _reject_prohibited_fields(self.initial_data, _PROHIBITED_ON_CREATE)
        return attrs


class StoreUpdateSerializer(serializers.ModelSerializer):
    """PATCH-only: name/description. `code` is immutable through this
    API - explicitly rejected (400) if present, not silently ignored.
    """

    class Meta:
        model = SharedStore
        fields = ["name", "description"]
        extra_kwargs = {
            "name": {"required": False},
            "description": {"required": False, "allow_blank": True},
        }

    def validate(self, attrs):
        _reject_prohibited_fields(self.initial_data, _PROHIBITED_ON_UPDATE)
        return attrs


class StoreMembershipSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(source="user.id", read_only=True)
    username = serializers.CharField(source="user.username", read_only=True)

    class Meta:
        model = StoreMembership
        fields = ["id", "is_active", "user_id", "username", "created_at", "updated_at"]
        read_only_fields = fields


class StoreMembershipCreateSerializer(serializers.Serializer):
    user_id = serializers.IntegerField()


class StoreRoleAssignmentSerializer(serializers.ModelSerializer):
    role_id = serializers.IntegerField(source="role.id", read_only=True)
    role_code = serializers.CharField(source="role.code", read_only=True)
    role_name = serializers.CharField(source="role.name", read_only=True)

    class Meta:
        model = StoreRoleAssignment
        fields = ["id", "is_active", "role_id", "role_code", "role_name", "created_at", "updated_at"]
        read_only_fields = fields


class StoreRoleAssignmentCreateSerializer(serializers.Serializer):
    role_id = serializers.IntegerField()


class StorageLocationSerializer(serializers.ModelSerializer):
    store_id = serializers.IntegerField(source="store.id", read_only=True)
    store_code = serializers.CharField(source="store.code", read_only=True)

    class Meta:
        model = StorageLocation
        fields = [
            "id",
            "store_id",
            "store_code",
            "code",
            "name",
            "description",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class StorageLocationCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = StorageLocation
        fields = ["code", "name", "description"]
        extra_kwargs = {"description": {"required": False, "allow_blank": True}}

    def validate(self, attrs):
        _reject_prohibited_fields(self.initial_data, _LOCATION_COMMON_PROHIBITED)
        return attrs


class StorageLocationUpdateSerializer(serializers.ModelSerializer):
    """PATCH-only: name/description. store/code are immutable through
    this API.
    """

    class Meta:
        model = StorageLocation
        fields = ["name", "description"]
        extra_kwargs = {
            "name": {"required": False},
            "description": {"required": False, "allow_blank": True},
        }

    def validate(self, attrs):
        _reject_prohibited_fields(self.initial_data, _LOCATION_PROHIBITED_ON_UPDATE)
        return attrs
