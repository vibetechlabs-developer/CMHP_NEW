from rest_framework import serializers

from apps.permissions.models import CompanyRole, PermissionDefinition, StoreRole

# Fields explicitly rejected (not silently ignored) if present in the
# request body. `company`/`store` come exclusively from the URL - never
# from the body, on create or update. `code` and `is_active` have their
# own rules/endpoints.
_ROLE_PROHIBITED_ON_CREATE = {"company", "is_active", "permissions"}
_ROLE_PROHIBITED_ON_UPDATE = _ROLE_PROHIBITED_ON_CREATE | {"code"}
_STORE_ROLE_PROHIBITED_ON_CREATE = {"store", "is_active", "permissions"}
_STORE_ROLE_PROHIBITED_ON_UPDATE = _STORE_ROLE_PROHIBITED_ON_CREATE | {"code"}


def _reject_prohibited_fields(initial_data, prohibited):
    rejected = prohibited & set(initial_data.keys())
    if rejected:
        raise serializers.ValidationError(
            {field: "This field cannot be set through this endpoint." for field in sorted(rejected)}
        )


class PermissionDefinitionSerializer(serializers.ModelSerializer):
    """Read-only permission catalog entry - see GET /api/v1/permissions/.
    No create/update/delete serializer exists for this model through the
    API; permission codes are introduced deliberately, in Django Admin,
    alongside the module that needs them.
    """

    class Meta:
        model = PermissionDefinition
        fields = [
            "id",
            "code",
            "name",
            "module",
            "description",
            "scope",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class RolePermissionSerializer(serializers.Serializer):
    """One entry in a role's assigned-permissions list. Includes the
    definition's current is_active state so an administrator can spot a
    permission that was deactivated after being assigned to this role -
    it no longer contributes to effective_permission_codes(), but the
    assignment itself is not silently dropped from this list.
    """

    code = serializers.CharField()
    name = serializers.CharField()
    module = serializers.CharField()
    is_active = serializers.BooleanField()


class CompanyRoleSerializer(serializers.ModelSerializer):
    company_id = serializers.IntegerField(source="company.id", read_only=True)
    company_code = serializers.CharField(source="company.code", read_only=True)
    permissions = serializers.SerializerMethodField()

    class Meta:
        model = CompanyRole
        fields = [
            "id",
            "company_id",
            "company_code",
            "code",
            "name",
            "description",
            "is_active",
            "permissions",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_permissions(self, obj):
        # Sorted in Python, not via .order_by() on the related manager -
        # the latter would issue a fresh query and defeat the caller's
        # .prefetch_related("permissions") (see CompanyRoleListCreateView).
        permissions = sorted(obj.permissions.all(), key=lambda permission: permission.code)
        return RolePermissionSerializer(permissions, many=True).data


class CompanyRoleCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = CompanyRole
        fields = ["code", "name", "description"]
        extra_kwargs = {"description": {"required": False, "allow_blank": True}}

    def validate(self, attrs):
        _reject_prohibited_fields(self.initial_data, _ROLE_PROHIBITED_ON_CREATE)
        return attrs


class CompanyRoleUpdateSerializer(serializers.ModelSerializer):
    """PATCH-only: name/description. code and company are immutable
    through this API.
    """

    class Meta:
        model = CompanyRole
        fields = ["name", "description"]
        extra_kwargs = {
            "name": {"required": False},
            "description": {"required": False, "allow_blank": True},
        }

    def validate(self, attrs):
        _reject_prohibited_fields(self.initial_data, _ROLE_PROHIBITED_ON_UPDATE)
        return attrs


class RolePermissionsReplaceSerializer(serializers.Serializer):
    """Body of PUT .../roles/<id>/permissions/ - see
    apps.permissions.services.replace_role_permissions for the actual
    normalisation/validation/duplicate-handling rules; this only enforces
    the request shape (a list of strings, clearly rejecting anything
    else) before that service ever runs. Scope-agnostic (used for both
    the company-role and the store-role permission-replacement endpoints
    - see StoreRolePermissionsReplaceSerializer below) - it only validates
    request *shape*, never which scope a code belongs to; that is the
    service layer's job (apps.permissions.services._replace_role_permission_
    set), since only the service knows which role type is being written.
    """

    permission_codes = serializers.ListField(
        child=serializers.CharField(allow_blank=False), allow_empty=True
    )

    def validate_permission_codes(self, value):
        # ListField already rejects a non-list value for the field as a
        # whole. DRF's CharField, though, is deliberately lenient about
        # coercing an int/float item to a string rather than rejecting it
        # (e.g. 123 -> "123") - too lenient for "reject non-string input
        # clearly", so the *raw* (pre-coercion) items are checked here
        # instead of trusting the already-coerced `value`.
        raw_items = self.initial_data.get("permission_codes", [])
        for item in raw_items:
            if not isinstance(item, str):
                raise serializers.ValidationError(
                    f"Each permission code must be a string, got: {item!r}."
                )
        return value


# Same request shape as the company-role endpoint - a distinct name at the
# store-role import site (apps.stores.urls/apps.permissions.views) is
# clearer than importing `RolePermissionsReplaceSerializer` and having to
# remember it is shared, without actually duplicating any code.
StoreRolePermissionsReplaceSerializer = RolePermissionsReplaceSerializer


class StoreRoleSerializer(serializers.ModelSerializer):
    store_id = serializers.IntegerField(source="store.id", read_only=True)
    store_code = serializers.CharField(source="store.code", read_only=True)
    permissions = serializers.SerializerMethodField()

    class Meta:
        model = StoreRole
        fields = [
            "id",
            "store_id",
            "store_code",
            "code",
            "name",
            "description",
            "is_active",
            "permissions",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_permissions(self, obj):
        permissions = sorted(obj.permissions.all(), key=lambda permission: permission.code)
        return RolePermissionSerializer(permissions, many=True).data


class StoreRoleCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = StoreRole
        fields = ["code", "name", "description"]
        extra_kwargs = {"description": {"required": False, "allow_blank": True}}

    def validate(self, attrs):
        _reject_prohibited_fields(self.initial_data, _STORE_ROLE_PROHIBITED_ON_CREATE)
        return attrs


class StoreRoleUpdateSerializer(serializers.ModelSerializer):
    """PATCH-only: name/description. code and store are immutable through
    this API.
    """

    class Meta:
        model = StoreRole
        fields = ["name", "description"]
        extra_kwargs = {
            "name": {"required": False},
            "description": {"required": False, "allow_blank": True},
        }

    def validate(self, attrs):
        _reject_prohibited_fields(self.initial_data, _STORE_ROLE_PROHIBITED_ON_UPDATE)
        return attrs
