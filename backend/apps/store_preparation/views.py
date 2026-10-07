from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Q
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
from apps.sales_orders.models import SalesOrderLine
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

# Each app defines its own permission-code constants locally rather than
# sharing a view-layer import across app boundaries.
BATCH_PLANS_VIEW = "batch_plans.view"
SALES_ORDERS_VIEW = "sales_orders.view"

ALLOWED_LIST_PARAMS = {"page", "page_size", "batch_plan", "sales_order_line"}


def _get_store_for_action(request, store_id, *required_permissions):
    """An active membership in an active store is required just to be
    *found* - a nonexistent store, an inactive one, or one the caller is not
    a member of all fold into one 404. Each permission in
    `required_permissions` is then checked store-scoped, a 403 naming what is
    missing otherwise. No superuser or company-membership bypass exists here:
    store access and company access are independent axes.
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
    """Companies where the caller holds `batch_plans.view`. Used to scope
    LEGACY batch-linked preparation rows - store access alone never reveals
    every company's batch plans.
    """
    return [
        company for company in active_companies_for_user(user) if user_has_permission(user, company, BATCH_PLANS_VIEW)
    ]


def companies_with_sales_order_view_access(user):
    """Companies where the caller holds `sales_orders.view`. Used for
    ORDER-LINE preparation rows - the order is the business owner of the
    line, so reading its preparation needs order visibility, not batch rights.
    """
    return [
        company for company in active_companies_for_user(user) if user_has_permission(user, company, SALES_ORDERS_VIEW)
    ]


def _check_preparation_access(user, preparation):
    """Fold "no company access" into 404 so a caller who passed the store
    check never learns the record exists. Order-line rows need
    `sales_orders.view` in the owning company; legacy batch rows need
    `batch_plans.view` there, unchanged from before.
    """
    company = preparation.owning_company
    required = BATCH_PLANS_VIEW if preparation.batch_plan_id else SALES_ORDERS_VIEW
    if not user_has_permission(user, company, required):
        raise exceptions.NotFound("Store preparation record not found.")


def _get_accessible_batch_plan(user, batch_plan_id):
    plan = get_object_or_404(BatchPlan.objects.select_related("company"), pk=batch_plan_id)
    if not user_has_permission(user, plan.company, BATCH_PLANS_VIEW):
        raise exceptions.NotFound("Batch plan not found.")
    return plan


def _get_accessible_order_line(user, line_id):
    line = SalesOrderLine.objects.select_related("sales_order__company").filter(pk=line_id).first()
    if line is None or not user_has_permission(user, line.sales_order.company, SALES_ORDERS_VIEW):
        raise exceptions.NotFound("Order line not found.")
    return line


def _preparation_queryset():
    return StorePreparation.objects.select_related(
        "batch_plan__company",
        "sales_order_line__sales_order__company",
        "store",
        "created_by",
        "updated_by",
    )


@method_decorator(never_cache, name="dispatch")
class StorePreparationListCreateView(generics.ListCreateAPIView):
    """GET: `store_preparation.view` in the store, scoped to records the
    caller can see in their owning company (order-line rows need
    `sales_orders.view`, legacy batch rows need `batch_plans.view`).
    POST: `store_preparation.view` + `store_preparation.create` in the store,
    plus access to the owner - `sales_order_line_id` (order visibility) or
    the legacy `batch_plan_id` (`batch_plans.view`). Nothing is auto-selected
    and nothing is created by a GET.
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

        plan_companies = companies_with_batch_plan_view_access(self.request.user)
        order_companies = companies_with_sales_order_view_access(self.request.user)
        queryset = _preparation_queryset().filter(store=store).filter(
            Q(batch_plan__company__in=plan_companies)
            | Q(sales_order_line__sales_order__company__in=order_companies)
        )

        for param, field in (("batch_plan", "batch_plan_id"), ("sales_order_line", "sales_order_line_id")):
            value = params.get(param)
            if value:
                try:
                    queryset = queryset.filter(**{field: int(value.strip())})
                except ValueError:
                    raise exceptions.ValidationError({param: "Must be a valid integer id."})

        return queryset.order_by("-created_at", "-id")

    def create(self, request, *args, **kwargs):
        store = _get_store_for_action(request, self.kwargs["store_id"], STORE_PREPARATION_VIEW, STORE_PREPARATION_CREATE)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        batch_plan_id = data.pop("batch_plan_id", None)
        line_id = data.pop("sales_order_line_id", None)

        # Owner access is checked before the service runs. The service has
        # no permission awareness of its own. Cross-company or nonexistent
        # ids fold into the same 404.
        if line_id is not None:
            line = _get_accessible_order_line(request.user, line_id)
            preparation = self._create(store, sales_order_line=line, data=data)
        else:
            plan = _get_accessible_batch_plan(request.user, batch_plan_id)
            preparation = self._create(store, batch_plan=plan, data=data)

        preparation = _preparation_queryset().get(pk=preparation.pk)
        return Response(StorePreparationSerializer(preparation).data, status=201)

    def _create(self, store, data, **owner):
        try:
            return create_store_preparation(actor=self.request.user, store=store, **owner, **data)
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc


@method_decorator(never_cache, name="dispatch")
class StorePreparationDetailView(APIView):
    """GET: `store_preparation.view` in the store and access to the record's
    owner. PATCH: `store_preparation.view` + `store_preparation.edit` in the
    store, plus the same owner access. Never touches the order or any batch
    plan.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, store_id, preparation_id):
        store = _get_store_for_action(request, store_id, STORE_PREPARATION_VIEW)
        preparation = get_object_or_404(_preparation_queryset(), pk=preparation_id, store=store)
        _check_preparation_access(request.user, preparation)
        return Response(StorePreparationSerializer(preparation).data)

    def patch(self, request, store_id, preparation_id):
        store = _get_store_for_action(request, store_id, STORE_PREPARATION_VIEW, STORE_PREPARATION_EDIT)
        preparation = get_object_or_404(_preparation_queryset(), pk=preparation_id, store=store)
        _check_preparation_access(request.user, preparation)
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
