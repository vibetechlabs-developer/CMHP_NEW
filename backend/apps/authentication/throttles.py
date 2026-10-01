from rest_framework.throttling import AnonRateThrottle


class LoginRateThrottle(AnonRateThrottle):
    """Keyed by client IP (login has no authenticated user yet). Rate is
    configurable via REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["login"],
    set from the AUTH_LOGIN_THROTTLE_RATE environment variable.
    """

    scope = "login"
