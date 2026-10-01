from django.conf import settings
from django.contrib.auth import authenticate, get_user_model
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from rest_framework import exceptions
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.settings import api_settings as jwt_settings
from rest_framework_simplejwt.tokens import RefreshToken

from apps.authentication.cookies import clear_refresh_cookie, set_refresh_cookie
from apps.authentication.csrf import enforce_csrf
from apps.authentication.serializers import CurrentUserSerializer, LoginSerializer
from apps.authentication.throttles import LoginRateThrottle

User = get_user_model()


def _refresh_max_age_seconds():
    return int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds())


class ExplicitAuthFailure401Mixin:
    """DRF's APIView.handle_exception() silently downgrades
    AuthenticationFailed/NotAuthenticated from 401 to 403 whenever the view
    cannot offer a WWW-Authenticate challenge header - which is exactly the
    case here, since these views authenticate via the refresh cookie or
    plain credentials, not Bearer, so authentication_classes is empty.
    Overriding get_authenticate_header() restores the spec-required 401
    without adding Bearer as an actual (unwanted) authentication method on
    these views.
    """

    def get_authenticate_header(self, request):
        return "Bearer"


@method_decorator(never_cache, name="dispatch")
class CsrfBootstrapView(APIView):
    """GET /api/v1/auth/csrf/ - public. Sets the standard Django `csrftoken`
    cookie and returns the same value in the body so a non-browser client
    (Postman, curl, a future mobile app) that cannot read a cookie
    programmatically can still pick up the token from JSON.
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        token = get_token(request)
        return Response({"csrfToken": token})


@method_decorator(never_cache, name="dispatch")
class LoginView(ExplicitAuthFailure401Mixin, APIView):
    """POST /api/v1/auth/login/ - public, CSRF-protected, rate-limited.

    Wrong username, wrong password, and a correct-password-but-inactive
    account all produce the *same* 401 - Django's own
    ModelBackend.authenticate() already collapses all three into a single
    "no user" result (and pays the password-hasher cost even for a
    nonexistent username, for timing-attack resistance), so this view
    never has to special-case "inactive" itself.
    """

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [LoginRateThrottle]

    def post(self, request):
        enforce_csrf(request)

        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = authenticate(
            request,
            username=serializer.validated_data["username"],
            password=serializer.validated_data["password"],
        )
        if user is None:
            raise exceptions.AuthenticationFailed("Invalid username or password.")

        refresh = RefreshToken.for_user(user)
        access = refresh.access_token

        response = Response(
            {
                "access": str(access),
                "user": CurrentUserSerializer(user).data,
            }
        )
        set_refresh_cookie(response, str(refresh), _refresh_max_age_seconds())
        return response


@method_decorator(never_cache, name="dispatch")
class RefreshView(ExplicitAuthFailure401Mixin, APIView):
    """POST /api/v1/auth/refresh/ - public (no access token required),
    CSRF-protected. Reads the refresh token only from the HttpOnly cookie,
    never from the request body. Rotates it: the presented refresh token
    is blacklisted and a new one is issued, so a stolen-but-not-yet-used
    old refresh token stops working the moment the legitimate client
    refreshes.
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        enforce_csrf(request)

        raw_refresh = request.COOKIES.get(settings.AUTH_REFRESH_COOKIE_NAME)
        if not raw_refresh:
            raise exceptions.AuthenticationFailed("Refresh token missing.")

        try:
            old_refresh = RefreshToken(raw_refresh)
        except TokenError:
            raise exceptions.AuthenticationFailed(
                "Refresh token is invalid, expired, or blacklisted."
            )

        # SimpleJWT's rotation does not by itself re-check the user - only
        # the token's own signature/expiry/blacklist status. A user
        # deactivated after this refresh token was issued must not be able
        # to use it to obtain a fresh access token, so that is checked here
        # explicitly against the database.
        user_id = old_refresh.get(jwt_settings.USER_ID_CLAIM)
        user = User.objects.filter(pk=user_id, is_active=True).first()
        if user is None:
            raise exceptions.AuthenticationFailed("User is inactive or no longer exists.")

        old_refresh.blacklist()
        new_refresh = RefreshToken.for_user(user)
        access = new_refresh.access_token

        response = Response({"access": str(access)})
        set_refresh_cookie(response, str(new_refresh), _refresh_max_age_seconds())
        return response


@method_decorator(never_cache, name="dispatch")
class LogoutView(ExplicitAuthFailure401Mixin, APIView):
    """POST /api/v1/auth/logout/ - public (no access token required),
    CSRF-protected. Idempotent: a missing, already-expired, or
    already-blacklisted refresh cookie is not an error - logging out twice,
    or logging out after the refresh token already expired, still succeeds
    and still clears the cookie.

    LIMITATION (documented, not solved here): this blacklists the refresh
    token only. Any access token already issued to this session stays
    valid until its own short expiry (ACCESS_TOKEN_LIFETIME, 5 minutes by
    default) - there is no server-side access-token revocation list. This
    is a deliberate tradeoff (that is what makes access tokens cheap to
    verify - no database hit per request); do not read this endpoint as
    "immediately revokes all access".
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        enforce_csrf(request)

        raw_refresh = request.COOKIES.get(settings.AUTH_REFRESH_COOKIE_NAME)
        if raw_refresh:
            try:
                RefreshToken(raw_refresh).blacklist()
            except TokenError:
                pass  # already invalid/expired/blacklisted - logout still succeeds

        response = Response(status=204)
        clear_refresh_cookie(response)
        return response


@method_decorator(never_cache, name="dispatch")
class MeView(APIView):
    """GET /api/v1/auth/me/ - Bearer access token required (the default
    IsAuthenticated + JWTAuthentication from REST_FRAMEWORK settings).
    """

    def get(self, request):
        return Response(CurrentUserSerializer(request.user).data)
