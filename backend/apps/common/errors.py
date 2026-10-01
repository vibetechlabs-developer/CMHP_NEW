from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import exceptions


class Conflict(exceptions.APIException):
    """HTTP 409 - a documented optimistic-concurrency conflict.

    Used only for the specific, narrow case a caller can resolve by
    refetching the current resource and retrying with its current
    `version`/state - never for an ordinary business-rule rejection
    (those stay `400`, via translate_django_validation_error() below,
    exactly as in every prior task - see docs/backend-decisions.md, Task
    07B, for why this project deliberately keeps one status code for
    business-rule rejections). Raising this inside a
    `transaction.atomic()` block rolls back whatever the caller had
    already changed, same as any other exception.
    """

    status_code = 409
    default_detail = "This record has changed since it was last read. Refetch and retry."
    default_code = "conflict"


class Forbidden(exceptions.APIException):
    """HTTP 403 - raised from inside a service, not a view, for the one
    case in this project where which permission a caller must hold
    depends on a row's *current* state and must therefore be decided
    after that row is locked, not before (see
    apps.purchasing.services.cancel_purchase_request: cancelling a DRAFT
    needs `purchase_requests.cancel`, cancelling a SUBMITTED/pending
    request needs `purchase_requests.cancel_pending`, and the request's
    status could change between an unlocked view-layer read and the
    locked mutation). Every other permission check in this project stays
    entirely at the view layer, resolved before any row is touched (see
    apps.purchasing.views._get_company_for_action) - this class exists
    only for that one deliberately different case, so it must not be
    reused as a general-purpose "service-layer 403" without the same
    state-changes-the-required-permission justification.
    """

    status_code = 403
    default_detail = "You do not have permission to perform this action."
    default_code = "forbidden"


def translate_django_validation_error(exc: DjangoValidationError) -> exceptions.ValidationError:
    """Convert a raised django.core.exceptions.ValidationError - as raised
    by a model's clean()/save(), e.g. Company/CompanyRole/
    PermissionDefinition - into DRF's own ValidationError (HTTP 400).

    DRF's exception handler only understands rest_framework.exceptions.
    APIException subclasses; a bare Django ValidationError propagating out
    of a view is an unhandled exception (HTTP 500), not a 400. Every view
    that calls a service which may raise Django's ValidationError must
    catch it and re-raise through this helper instead of letting it escape.
    """
    if hasattr(exc, "message_dict"):
        return exceptions.ValidationError(exc.message_dict)
    return exceptions.ValidationError({"detail": exc.messages})
