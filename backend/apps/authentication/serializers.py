from django.contrib.auth import get_user_model
from rest_framework import serializers


class LoginSerializer(serializers.Serializer):
    """Structural validation only (both fields present and non-blank).
    Whether the credentials are actually correct - and the generic
    wrong-credentials-or-inactive 401 - is decided in the view via
    django.contrib.auth.authenticate(), not here.
    """

    username = serializers.CharField()
    password = serializers.CharField(trim_whitespace=False, style={"input_type": "password"})


class CurrentUserSerializer(serializers.ModelSerializer):
    """Safe identity fields only - no password hash, no is_staff/is_superuser,
    no other admin flags. Used both by GET /api/v1/auth/me/ and embedded in
    the login response.
    """

    capabilities = serializers.SerializerMethodField()

    class Meta:
        model = get_user_model()
        fields = ["id", "username", "email", "first_name", "last_name", "capabilities"]
        read_only_fields = fields

    def get_capabilities(self, obj):
        # Read-only UI hints derived from the SAME rule the server enforces.
        # Never accepted from client input. Not an access grant.
        from apps.common.permissions import is_active_superuser

        # Organization Setup (companies, shared stores, company/store roles
        # and memberships, units of measure, sales-order confirmation
        # policy) is gated by the same active-superuser rule as every one
        # of those endpoints (IsActiveSuperuser) - a single capability flag
        # covers the whole area, exactly as can_manage_material_catalog
        # already does for the material catalog.
        can_manage = is_active_superuser(obj)
        return {
            "can_manage_material_catalog": can_manage,
            "can_manage_organization_setup": can_manage,
        }
