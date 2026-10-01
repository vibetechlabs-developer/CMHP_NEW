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

    class Meta:
        model = get_user_model()
        fields = ["id", "username", "email", "first_name", "last_name"]
        read_only_fields = fields
