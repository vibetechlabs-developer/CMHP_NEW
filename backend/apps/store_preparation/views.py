from django.core.exceptions import ValidationError as DjangoValidationError
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from rest_framework import exceptions, generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.batch_plans.models import BatchPlan
from apps.common.errors import translate_django_validation_error
from apps.common.pagination import BoundedPageNumberPagination
from apps.companies.services import active_companies_for_user
from apps.permissions.services import store_user_has_permission, user_has_permission
from apps.store_preparation.models import StorePreparation
from apps.store_preparation.serializers import (
    StorePreparationCreateSerializer,
    StorePreparationSerializer,
    StorePreparationUpdateSerializer,
)
from apps.store_preparation.services import create_store_preparation, update_store_preparation
from apps.stores.services import active_stores_for_user

STORE_PREPARATION_VIEW = "store_preparation.view"
STORE_PREPARATION_CREATE = "store_preparation.create"
STORE_PREPARATION_EDIT = "store_preparation.edit"

# Not imported from apps.receiving.views - every app in this project
# defines its own permission-code constants locally rather than sharing a
# view-layer import across app boundaries (see apps.receiving.views' own
# identically-named constant for the same reasoning).
BATCH_PLANS_VIEW = "batch_plans.view"

ALLOWED_LIST_PARAMS = {"page", "page_size", "batch_plan"}


def _get_store_for_action(request, store_id, *required_permissions):
    """Mirrors apps.receiving.views._get_store_for_action exactly: an
    active membership in an active store is required just to be *found* at
    all - a nonexistent store, an inactive one, or one the caller simply is
    not a member of are all folded into the same 404. Holding every
    permission in `required_permissions` is then checked separately, a 403
    (naming what is missing) if any is absent. No superuser or
    company-membership bypass exists anywhere in this path - store access
    and company access are two independent axes, exactly like receiving.
    """
    user = request.user
    store = active_stores_for_user(user).filter(pk=store_id).first()
    if store is None:
        raise exceptions.NotFound("Store not found.")
    missing = [code for code in required_permissions if not store_user_has_permission(user, store, code)]
    if missing:
        raise exceptions.PermissionDenied(f"The following permission(s) are required: {', '.join(missing)}.")
    return store


def companies_with_batch_plan_view_access(user):
    """Mirrors apps.receiving.services.companies_with_po_view_access
    exactly, for `batch_plans.view`: used to scope every store-preparation
    list/detail/source-lookup result so store access alone never reveals
    every operating company's batch plans. This dual-context requirement
    (store access AND, separately, an active company membership holding
    `batch_plans.view` in the plan's own company) is an EXPLICIT WORKING
    RULE for this Task 12C slice, not an assumption that store access ever
    grants access to every company - the identical rule Task 09A's
    receiving module already established for the same reason.
    """
    return [
        company for company in active_companies_for_user(user) if user_has_permission(user, company, BATCH_PLANS_VIEW)
    ]


def _get_accessible_batch_plan(user, batch_plan_id):
    """Resolves a BatchPlan by id, folding "does not exist" and "caller
    lacks `batch_plans.view` in its company" into the same 404 - mirrors
    apps.receiving.views._get_accessible_purchase_order exactly. Store
    access alone is never enough to reach a batch plan through this path.
    """
    plan = get_object_or_404(BatchPlan.objects.select_related("company"), pk=batch_plan_id)
    if not user_has_permission(user, plan.company, BATCH_PLANS_VIEW):
        raise exceptions.NotFound("Batch plan not found.")
    return plan


def _check_preparation_company_access(user, preparation):
    """Same fold-into-404 rule as `_get_accessible_batch_plan`, applied to
    an already-resolved StorePreparation's own `batch_plan.company` - a
    caller who passes the store-level check above but lacks
    `batch_plans.view` in this specific record's company must never learn
    the record exists at all.
    """
    if not user_has_permission(user, preparation.batch_plan.company, BATCH_PLANS_VIEW):
        raise exceptions.NotFound("Store preparation record not found.")


def _preparation_queryset():
    return StorePreparation.objects.select_related("batch_plan__company", "store", "created_by", "updated_by")


@method_decorator(never_cache, name="dispatch")
class StorePreparationListCreateView(generics.ListCreateAPIView):
    """GET: `store_preparation.view` in the URL's store, further scoped to
    records whose batch plan's company the caller also holds
    `batch_plans.view` in - store access alone never reveals every
    company's preparation records.
    POST: `store_preparation.view` + `store_preparation.create` in the
    store, **and** `batch_plans.view` in the source batch plan's own
    company. The batch plan is explicitly supplied (`batch_plan_id`) -
    nothing is auto-selected, and nothing is created by a GET.
    """

    permission_classes = [IsAuthenticated]
    pagination_class = BoundedPageNumberPagination

    def get_serializer_class(self):
        return StorePreparationCreateSerializer if self.request.method == "POST" else StorePreparationSerializer

    def get_queryset(self):
        store = _get_store_for_action(self.request, self.kwargs["store_id"], STORE_PREPARATION_VIEW)
        params = self.request.query_params
        unknown = sorted(set(params.keys()) - ALLOWED_LIST_PARAMS)
        if unknown:
            raise exceptions.ValidationError({param: "Unknown query parameter." for param in unknown})

        companies = companies_with_batch_plan_view_access(self.request.user)
        queryset = _preparation_queryset().filter(store=store, batch_plan__company__in=companies)

        batch_plan_param = params.get("batch_plan")
        if batch_plan_param:
            try:
                batch_plan_id = int(batch_plan_param.strip())
            except ValueError:
                raise exceptions.ValidationError({"batch_plan": "Must be a valid integer id."})
            queryset = queryset.filter(batch_plan_id=batch_plan_id)

        return queryset.order_by("-created_at", "-id")

    def create(self, request, *args, **kwargs):
        store = _get_store_for_action(request, self.kwargs["store_id"], STORE_PREPARATION_VIEW, STORE_PREPARATION_CREATE)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        batch_plan_id = data.pop("batch_plan_id")

        # Company access is checked here, before the service ever runs -
        # the service has no permission awareness of its own (matching
        # every other service in this project). This also confirms the
        # source batch plan is visible to this caller at all, folding a
        # cross-company or nonexistent id into the same 404.
        batch_plan = _get_accessible_batch_plan(request.user, batch_plan_id)

        try:
            preparation = create_store_preparation(actor=request.user, store=store, batch_plan=batch_plan, **data)
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        preparation = _preparation_queryset().get(pk=preparation.pk)
        return Response(StorePreparationSerializer(preparation).data, status=201)


@method_decorator(never_cache, name="dispatch")
class StorePreparationDetailView(APIView):
    """GET: `store_preparation.view` **and** `batch_plans.view` in the
    record's own batch-plan company. PATCH: `store_preparation.view`/
    `store_preparation.edit` in the store, plus the same company check.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, store_id, preparation_id):
        store = _get_store_for_action(request, store_id, STORE_PREPARATION_VIEW)
        preparation = get_object_or_404(_preparation_queryset(), pk=preparation_id, store=store)
        _check_preparation_company_access(request.user, preparation)
        return Response(StorePreparationSerializer(preparation).data)

    def patch(self, request, store_id, preparation_id):
        store = _get_store_for_action(request, store_id, STORE_PREPARATION_VIEW, STORE_PREPARATION_EDIT)
        preparation = get_object_or_404(StorePreparation.objects.select_related("batch_plan"), pk=preparation_id, store=store)
        _check_preparation_company_access(request.user, preparation)
        serializer = StorePreparationUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        expected_version = data.pop("expected_version")
        try:
            preparation = update_store_preparation(
                actor=request.user, preparation_id=preparation.id, expected_version=expected_version, data=data
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        preparation = _preparation_queryset().get(pk=preparation.pk)
        return Response(StorePreparationSerializer(preparation).data)
