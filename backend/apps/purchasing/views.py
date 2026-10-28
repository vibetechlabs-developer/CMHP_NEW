from django.core.exceptions import ValidationError as DjangoValidationError
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from rest_framework import exceptions, generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.errors import translate_django_validation_error
from apps.common.pagination import BoundedPageNumberPagination
from apps.companies.services import active_companies_for_user
from apps.permissions.services import user_has_permission
from apps.purchasing.models import PurchaseOrder, PurchaseRequest
from apps.suppliers.models import Supplier
from apps.purchasing.serializers import (
    PurchaseOrderCancelSerializer,
    PurchaseOrderCreateSerializer,
    PurchaseOrderIssueSerializer,
    PurchaseOrderSerializer,
    PurchaseOrderUpdateSerializer,
    PurchaseRequestApprovalDecisionSerializer,
    PurchaseRequestCancelSerializer,
    PurchaseRequestCreateSerializer,
    PurchaseRequestRejectSerializer,
    PurchaseRequestSerializer,
    PurchaseRequestUpdateSerializer,
    PurchaseRequestVersionSerializer,
)
from apps.purchasing.services import (
    approve_purchase_request,
    cancel_purchase_order,
    cancel_purchase_request,
    create_purchase_order,
    create_purchase_request,
    issue_purchase_order,
    reject_purchase_request,
    revise_purchase_request,
    submit_purchase_request,
    update_purchase_order,
    update_purchase_request,
)

PURCHASE_REQUESTS_VIEW = "purchase_requests.view"
PURCHASE_REQUESTS_CREATE = "purchase_requests.create"
PURCHASE_REQUESTS_EDIT = "purchase_requests.edit"
PURCHASE_REQUESTS_SUBMIT = "purchase_requests.submit"
PURCHASE_REQUESTS_CANCEL = "purchase_requests.cancel"
PURCHASE_REQUESTS_CANCEL_PENDING = "purchase_requests.cancel_pending"
PURCHASE_REQUESTS_APPROVE = "purchase_requests.approve"

PURCHASE_ORDERS_VIEW = "purchase_orders.view"
PURCHASE_ORDERS_CREATE = "purchase_orders.create"
PURCHASE_ORDERS_EDIT = "purchase_orders.edit"
PURCHASE_ORDERS_CANCEL = "purchase_orders.cancel"
PURCHASE_ORDERS_ISSUE = "purchase_orders.issue"


def _get_company_for_action(request, company_id, *required_permissions):
    """Resolves the URL's company under Task 08B-1's rules: an active
    membership in an active company is required just to be *found* at
    all - a nonexistent company, an inactive one, or one the caller
    simply is not a member of are all folded into the same 404, so a
    caller with no access to a company can never learn which of those is
    true. Holding every permission in `required_permissions` is then
    checked separately, a 403 (naming what is missing) if any is absent.

    No superuser or `is_staff` exception exists anywhere in this path -
    `apps.permissions.services.user_has_permission` already never
    consults either flag, and this task deliberately does not add a
    parallel administrative-read bypass the way Task 07B's shared
    catalog/storage locations did (see docs/backend-decisions.md, Task
    08B-1, for why this resource is stricter).
    """
    user = request.user
    company = active_companies_for_user(user).filter(pk=company_id).first()
    if company is None:
        raise exceptions.NotFound("Company not found.")
    missing = [code for code in required_permissions if not user_has_permission(user, company, code)]
    if missing:
        raise exceptions.PermissionDenied(f"The following permission(s) are required: {', '.join(missing)}.")
    return company


def _purchase_request_queryset():
    return PurchaseRequest.objects.select_related(
        "company", "created_by", "submitted_by", "cancelled_by"
    ).prefetch_related(
        "lines__material",
        "lines__unit",
        "approval_rounds__submitted_by",
        "approval_rounds__lines__material",
        "approval_rounds__lines__unit",
        "approval_rounds__decisions__actor",
    )


@method_decorator(never_cache, name="dispatch")
class PurchaseRequestListCreateView(generics.ListCreateAPIView):
    """GET: `purchase_requests.view` in the URL's company. POST:
    `purchase_requests.view` **and** `purchase_requests.create` - view
    permission is always required alongside a mutation permission, so no
    one can create a request they could not then also see.
    """

    permission_classes = [IsAuthenticated]
    pagination_class = BoundedPageNumberPagination

    def get_serializer_class(self):
        return PurchaseRequestCreateSerializer if self.request.method == "POST" else PurchaseRequestSerializer

    def get_queryset(self):
        company = _get_company_for_action(self.request, self.kwargs["company_id"], PURCHASE_REQUESTS_VIEW)
        queryset = _purchase_request_queryset().filter(company=company)

        search = self.request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(reference__icontains=search)

        status_param = self.request.query_params.get("status", "").strip()
        if status_param:
            if status_param not in PurchaseRequest.Status.values:
                raise exceptions.ValidationError(
                    {"status": f"Must be one of {list(PurchaseRequest.Status.values)}."}
                )
            queryset = queryset.filter(status=status_param)

        return queryset.order_by("-created_at", "-id")

    def create(self, request, *args, **kwargs):
        company = _get_company_for_action(
            request, self.kwargs["company_id"], PURCHASE_REQUESTS_VIEW, PURCHASE_REQUESTS_CREATE
        )
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            purchase_request = create_purchase_request(
                actor=request.user,
                company=company,
                required_by=data.get("required_by"),
                notes=data.get("notes", ""),
                lines=data.get("lines", []),
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        purchase_request = _purchase_request_queryset().get(pk=purchase_request.pk)
        return Response(PurchaseRequestSerializer(purchase_request).data, status=201)


@method_decorator(never_cache, name="dispatch")
class PurchaseRequestDetailView(APIView):
    """GET: `purchase_requests.view`. PATCH: `purchase_requests.view` and
    `purchase_requests.edit`, DRAFT only - see apps.purchasing.services.
    update_purchase_request for the full replace-lines/no-op/version
    rules.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, company_id, request_id):
        company = _get_company_for_action(request, company_id, PURCHASE_REQUESTS_VIEW)
        purchase_request = get_object_or_404(_purchase_request_queryset(), pk=request_id, company=company)
        return Response(PurchaseRequestSerializer(purchase_request).data)

    def patch(self, request, company_id, request_id):
        company = _get_company_for_action(request, company_id, PURCHASE_REQUESTS_VIEW, PURCHASE_REQUESTS_EDIT)
        purchase_request = get_object_or_404(PurchaseRequest, pk=request_id, company=company)
        serializer = PurchaseRequestUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        expected_version = data.pop("expected_version")
        try:
            purchase_request = update_purchase_request(
                actor=request.user,
                purchase_request_id=purchase_request.id,
                expected_version=expected_version,
                data=data,
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        purchase_request = _purchase_request_queryset().get(pk=purchase_request.pk)
        return Response(PurchaseRequestSerializer(purchase_request).data)


@method_decorator(never_cache, name="dispatch")
class PurchaseRequestSubmitView(APIView):
    """`purchase_requests.view` and `purchase_requests.submit`. See
    apps.purchasing.services.submit_purchase_request for the active-
    reference revalidation, snapshot capture, and idempotent-retry rules.
    Submitting never creates a Purchase Order and never means approved.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, company_id, request_id):
        company = _get_company_for_action(request, company_id, PURCHASE_REQUESTS_VIEW, PURCHASE_REQUESTS_SUBMIT)
        purchase_request = get_object_or_404(PurchaseRequest, pk=request_id, company=company)
        serializer = PurchaseRequestVersionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            purchase_request = submit_purchase_request(
                actor=request.user,
                purchase_request_id=purchase_request.id,
                expected_version=serializer.validated_data["expected_version"],
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        purchase_request = _purchase_request_queryset().get(pk=purchase_request.pk)
        return Response(PurchaseRequestSerializer(purchase_request).data)


@method_decorator(never_cache, name="dispatch")
class PurchaseRequestCancelView(APIView):
    """`purchase_requests.view`, plus - as of Task 08B-2 - at least one of
    `purchase_requests.cancel`/`purchase_requests.cancel_pending` as a
    cheap pre-check. Which one is actually *required* depends on whether
    the request is `DRAFT` or `SUBMITTED`, and that can only be decided
    safely after the row is locked - see apps.purchasing.services.
    cancel_purchase_request's docstring and apps.common.errors.Forbidden
    for why the authoritative check happens there, not here. No reopening
    exists in this slice; never cancels `APPROVED`/`REJECTED`.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, company_id, request_id):
        company = _get_company_for_action(request, company_id, PURCHASE_REQUESTS_VIEW)
        user = request.user
        if not (
            user_has_permission(user, company, PURCHASE_REQUESTS_CANCEL)
            or user_has_permission(user, company, PURCHASE_REQUESTS_CANCEL_PENDING)
        ):
            raise exceptions.PermissionDenied(
                f"The following permission(s) are required: {PURCHASE_REQUESTS_CANCEL} "
                f"or {PURCHASE_REQUESTS_CANCEL_PENDING}."
            )
        purchase_request = get_object_or_404(PurchaseRequest, pk=request_id, company=company)
        serializer = PurchaseRequestCancelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            purchase_request = cancel_purchase_request(
                actor=request.user,
                purchase_request_id=purchase_request.id,
                expected_version=serializer.validated_data["expected_version"],
                reason=serializer.validated_data["cancellation_reason"],
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        purchase_request = _purchase_request_queryset().get(pk=purchase_request.pk)
        return Response(PurchaseRequestSerializer(purchase_request).data)


@method_decorator(never_cache, name="dispatch")
class PurchaseRequestApproveView(APIView):
    """`purchase_requests.view` and `purchase_requests.approve`. Approves
    whichever step is currently pending - there is no per-step URL. See
    apps.purchasing.services.approve_purchase_request for the round/step-
    match, self-decision-ban, and provisional distinct-approver rules.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, company_id, request_id):
        company = _get_company_for_action(request, company_id, PURCHASE_REQUESTS_VIEW, PURCHASE_REQUESTS_APPROVE)
        purchase_request = get_object_or_404(PurchaseRequest, pk=request_id, company=company)
        serializer = PurchaseRequestApprovalDecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            purchase_request = approve_purchase_request(
                actor=request.user,
                purchase_request_id=purchase_request.id,
                expected_version=serializer.validated_data["expected_version"],
                expected_round=serializer.validated_data["expected_round"],
                expected_step=serializer.validated_data["expected_step"],
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        purchase_request = _purchase_request_queryset().get(pk=purchase_request.pk)
        return Response(PurchaseRequestSerializer(purchase_request).data)


@method_decorator(never_cache, name="dispatch")
class PurchaseRequestRejectView(APIView):
    """`purchase_requests.view` and `purchase_requests.approve` - the same
    permission decides *and* rejects; there is no separate reject-only
    permission. See apps.purchasing.services.reject_purchase_request.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, company_id, request_id):
        company = _get_company_for_action(request, company_id, PURCHASE_REQUESTS_VIEW, PURCHASE_REQUESTS_APPROVE)
        purchase_request = get_object_or_404(PurchaseRequest, pk=request_id, company=company)
        serializer = PurchaseRequestRejectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            purchase_request = reject_purchase_request(
                actor=request.user,
                purchase_request_id=purchase_request.id,
                expected_version=serializer.validated_data["expected_version"],
                expected_round=serializer.validated_data["expected_round"],
                expected_step=serializer.validated_data["expected_step"],
                reason=serializer.validated_data["rejection_reason"],
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        purchase_request = _purchase_request_queryset().get(pk=purchase_request.pk)
        return Response(PurchaseRequestSerializer(purchase_request).data)


@method_decorator(never_cache, name="dispatch")
class PurchaseRequestReviseView(APIView):
    """`purchase_requests.view` and `purchase_requests.edit` - revising
    reopens the request for editing, so it is gated the same way a PATCH
    is. See apps.purchasing.services.revise_purchase_request: `REJECTED`
    -> `DRAFT` only, preserves `created_by`, does not itself touch
    lines/notes/required_by. A request that was never submitted at all
    (still `DRAFT` with no approval history) has nothing to revise and
    is rejected (`400`), distinct from a genuine idempotent retry against
    a `DRAFT` that really did come from a `REJECTED` -> `DRAFT`
    transition.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, company_id, request_id):
        company = _get_company_for_action(request, company_id, PURCHASE_REQUESTS_VIEW, PURCHASE_REQUESTS_EDIT)
        purchase_request = get_object_or_404(PurchaseRequest, pk=request_id, company=company)
        serializer = PurchaseRequestVersionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            purchase_request = revise_purchase_request(
                actor=request.user,
                purchase_request_id=purchase_request.id,
                expected_version=serializer.validated_data["expected_version"],
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        purchase_request = _purchase_request_queryset().get(pk=purchase_request.pk)
        return Response(PurchaseRequestSerializer(purchase_request).data)


# ---------------------------------------------------------------------------
# Task 08C-1: Purchase Order drafts
# ---------------------------------------------------------------------------


def _purchase_order_queryset():
    return PurchaseOrder.objects.select_related(
        "company", "source_purchase_request", "supplier", "created_by", "issued_by", "cancelled_by",
        "issue_snapshot",
    ).prefetch_related(
        "lines__material", "lines__unit", "lines__source_round_line", "issue_snapshot__lines"
    )


@method_decorator(never_cache, name="dispatch")
class PurchaseOrderListCreateView(generics.ListCreateAPIView):
    """GET: `purchase_orders.view` in the URL's company. POST:
    `purchase_orders.view`, `purchase_orders.create`, **and**
    `purchase_requests.view` - creating a PO always reads from a source
    PurchaseRequest, so the caller must be allowed to see that request
    too (see apps.purchasing.services.create_purchase_order). A source
    request belonging to a different company, or that does not exist at
    all, is folded into the same `404` either way - see that service's
    docstring for why (mirrors _get_company_for_action's own convention
    for the company itself).
    """

    permission_classes = [IsAuthenticated]
    pagination_class = BoundedPageNumberPagination

    def get_serializer_class(self):
        return PurchaseOrderCreateSerializer if self.request.method == "POST" else PurchaseOrderSerializer

    def get_queryset(self):
        company = _get_company_for_action(self.request, self.kwargs["company_id"], PURCHASE_ORDERS_VIEW)
        queryset = _purchase_order_queryset().filter(company=company)

        search = self.request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(reference__icontains=search)

        status_param = self.request.query_params.get("status", "").strip()
        if status_param:
            if status_param not in PurchaseOrder.Status.values:
                raise exceptions.ValidationError(
                    {"status": f"Must be one of {list(PurchaseOrder.Status.values)}."}
                )
            queryset = queryset.filter(status=status_param)

        return queryset.order_by("-created_at", "-id")

    def create(self, request, *args, **kwargs):
        company = _get_company_for_action(
            request,
            self.kwargs["company_id"],
            PURCHASE_ORDERS_VIEW,
            PURCHASE_ORDERS_CREATE,
            PURCHASE_REQUESTS_VIEW,
        )
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            purchase_order = create_purchase_order(
                actor=request.user,
                company=company,
                source_purchase_request_id=data.get("source_purchase_request_id"),
                supplier_id=data["supplier_id"],
                currency_code=data["currency_code"],
                expected_delivery_date=data.get("expected_delivery_date"),
                notes=data.get("notes", ""),
                direct_lines=data.get("lines") or None,
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        purchase_order = _purchase_order_queryset().get(pk=purchase_order.pk)
        return Response(PurchaseOrderSerializer(purchase_order).data, status=201)


@method_decorator(never_cache, name="dispatch")
class PurchaseOrderDetailView(APIView):
    """GET: `purchase_orders.view`. PATCH: `purchase_orders.view` and
    `purchase_orders.edit`, DRAFT only - see apps.purchasing.services.
    update_purchase_order for the full field-scope/no-op/version rules.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, company_id, order_id):
        company = _get_company_for_action(request, company_id, PURCHASE_ORDERS_VIEW)
        purchase_order = get_object_or_404(_purchase_order_queryset(), pk=order_id, company=company)
        return Response(PurchaseOrderSerializer(purchase_order).data)

    def patch(self, request, company_id, order_id):
        company = _get_company_for_action(request, company_id, PURCHASE_ORDERS_VIEW, PURCHASE_ORDERS_EDIT)
        purchase_order = get_object_or_404(PurchaseOrder, pk=order_id, company=company)
        serializer = PurchaseOrderUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        expected_version = data.pop("expected_version")
        try:
            purchase_order = update_purchase_order(
                actor=request.user,
                purchase_order_id=purchase_order.id,
                expected_version=expected_version,
                data=data,
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        purchase_order = _purchase_order_queryset().get(pk=purchase_order.pk)
        return Response(PurchaseOrderSerializer(purchase_order).data)


@method_decorator(never_cache, name="dispatch")
class PurchaseOrderCancelView(APIView):
    """`purchase_orders.view` and `purchase_orders.cancel`. See
    apps.purchasing.services.cancel_purchase_order for the required-
    reason, idempotent-same-reason-retry, and conflicting-reason rules.
    No reopening exists in this slice - a cancelled PO is not itself
    editable again, but its source PurchaseRequest is then free to
    receive a replacement PO (a new POST to this same list endpoint).
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, company_id, order_id):
        company = _get_company_for_action(request, company_id, PURCHASE_ORDERS_VIEW, PURCHASE_ORDERS_CANCEL)
        purchase_order = get_object_or_404(PurchaseOrder, pk=order_id, company=company)
        serializer = PurchaseOrderCancelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            purchase_order = cancel_purchase_order(
                actor=request.user,
                purchase_order_id=purchase_order.id,
                expected_version=serializer.validated_data["expected_version"],
                reason=serializer.validated_data["cancellation_reason"],
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        purchase_order = _purchase_order_queryset().get(pk=purchase_order.pk)
        return Response(PurchaseOrderSerializer(purchase_order).data)


@method_decorator(never_cache, name="dispatch")
class PurchaseOrderIssueView(APIView):
    """`purchase_orders.view` and `purchase_orders.issue`. See
    apps.purchasing.services.issue_purchase_order for the full
    revalidation list, the permanent issue-time snapshot, and the
    idempotent-retry rule. Task 08C-2 proposed policy, not yet
    client-confirmed: this one company-scoped permission is sufficient
    to finalize a purchase order - there is no separate multi-step
    approval workflow for a PO the way PurchaseRequest has one.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, company_id, order_id):
        company = _get_company_for_action(request, company_id, PURCHASE_ORDERS_VIEW, PURCHASE_ORDERS_ISSUE)
        purchase_order = get_object_or_404(PurchaseOrder, pk=order_id, company=company)
        serializer = PurchaseOrderIssueSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            purchase_order = issue_purchase_order(
                actor=request.user,
                purchase_order_id=purchase_order.id,
                expected_version=serializer.validated_data["expected_version"],
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        purchase_order = _purchase_order_queryset().get(pk=purchase_order.pk)
        return Response(PurchaseOrderSerializer(purchase_order).data)


@method_decorator(never_cache, name="dispatch")
class PurchasingSupplierListView(APIView):
    """List active suppliers available for purchasing (PO creation).
    Available to users with purchasing view/create permissions for the company.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        _get_company_for_action(
            request,
            company_id,
            PURCHASE_ORDERS_VIEW,
            PURCHASE_ORDERS_CREATE,
            PURCHASE_REQUESTS_VIEW,
        )
        suppliers = Supplier.objects.filter(is_active=True).order_by("code")
        return Response(
            [
                {
                    "id": s.id,
                    "code": s.code,
                    "name": s.display_name or s.legal_name,
                    "legal_name": s.legal_name,
                    "display_name": s.display_name,
                }
                for s in suppliers
            ]
        )
