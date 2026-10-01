import datetime

from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from rest_framework import exceptions
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.batch_register.services import (
    compute_access_context,
    register_queryset,
    serialize_row,
)
from apps.common.pagination import BoundedPageNumberPagination
from apps.common.validation import parse_int_filter, parse_strict_bool
from apps.companies.services import active_companies_for_user
from apps.permissions.services import user_has_permission

BATCH_PLANS_VIEW = "batch_plans.view"

ALLOWED_PARAMS = {
    "page",
    "page_size",
    "product",
    "customer",
    "order_date_from",
    "order_date_to",
    "planned_manufacturing_date_from",
    "planned_manufacturing_date_to",
    "has_batch_number",
    "search",
    "order",
}
# A SMALL, explicit allow-list - never arbitrary field ordering (this
# task's own explicit instruction). Both directions of the same two
# fields `BatchPlan` itself already orders by/exposes.
ALLOWED_ORDER_VALUES = {
    "created_at", "-created_at",
    "planned_manufacturing_date", "-planned_manufacturing_date",
}
DEFAULT_ORDER = "-created_at"


def _get_company_for_action(request, company_id):
    """Same fold-into-404/named-403 rule every company-scoped app in this
    project replicates locally. This is the ONE required permission for
    the base register - `batch_plans.view` - never broadened (Task 15B's
    own explicit instruction); `sales_orders.view`/`customers.view`/
    `products.view` are each independently OPTIONAL, checked per-field,
    never required just to reach this endpoint at all.
    """
    user = request.user
    company = active_companies_for_user(user).filter(pk=company_id).first()
    if company is None:
        raise exceptions.NotFound("Company not found.")
    if not user_has_permission(user, company, BATCH_PLANS_VIEW):
        raise exceptions.PermissionDenied(f"The following permission(s) are required: {BATCH_PLANS_VIEW}.")
    return company


def _parse_date(raw_value, *, field):
    try:
        return datetime.date.fromisoformat(raw_value.strip())
    except ValueError:
        raise exceptions.ValidationError({field: "Must be a date in YYYY-MM-DD format."})


@method_decorator(never_cache, name="dispatch")
class BatchRegisterListView(APIView):
    """GET `/api/v1/companies/<company_id>/batch-register/` -
    `batch_plans.view` only. Read-only - no `POST`/`PATCH`/`PUT`/`DELETE`
    exists on this path at all (a 405 on any of those is DRF's own
    default `APIView` behavior for a method this class never defines,
    not something added here). See `apps.batch_register.services` for
    the full row/field/access contract.
    """

    permission_classes = [IsAuthenticated]
    pagination_class = BoundedPageNumberPagination

    def get(self, request, company_id):
        company = _get_company_for_action(request, company_id)
        access = compute_access_context(request.user, company)

        params = request.query_params
        unknown = sorted(set(params.keys()) - ALLOWED_PARAMS)
        if unknown:
            raise exceptions.ValidationError({param: "Unknown query parameter." for param in unknown})

        queryset = register_queryset(company)

        product_param = params.get("product")
        if product_param:
            queryset = queryset.filter(product_id_snapshot=parse_int_filter(product_param, field="product"))

        customer_param = params.get("customer")
        if customer_param:
            if not access["customers_ok"]:
                raise exceptions.PermissionDenied("The following permission(s) are required: customers.view.")
            queryset = queryset.filter(
                sales_order_line__sales_order__customer_id=parse_int_filter(customer_param, field="customer")
            )

        date_from = params.get("order_date_from")
        date_to = params.get("order_date_to")
        if date_from or date_to:
            if not access["sales_orders_ok"]:
                raise exceptions.PermissionDenied("The following permission(s) are required: sales_orders.view.")
            if date_from:
                queryset = queryset.filter(
                    sales_order_line__sales_order__order_date__gte=_parse_date(date_from, field="order_date_from")
                )
            if date_to:
                queryset = queryset.filter(
                    sales_order_line__sales_order__order_date__lte=_parse_date(date_to, field="order_date_to")
                )

        pmd_from = params.get("planned_manufacturing_date_from")
        pmd_to = params.get("planned_manufacturing_date_to")
        if pmd_from:
            queryset = queryset.filter(
                planned_manufacturing_date__gte=_parse_date(pmd_from, field="planned_manufacturing_date_from")
            )
        if pmd_to:
            queryset = queryset.filter(
                planned_manufacturing_date__lte=_parse_date(pmd_to, field="planned_manufacturing_date_to")
            )

        has_batch_number = params.get("has_batch_number")
        if has_batch_number is not None:
            wants_numbered = parse_strict_bool(has_batch_number, field="has_batch_number")
            queryset = queryset.filter(number_allocation__isnull=not wants_numbered)

        search = params.get("search", "").strip()
        if search:
            from django.db.models import Q

            queryset = queryset.filter(
                Q(product_code_snapshot__icontains=search)
                | Q(product_name_snapshot__icontains=search)
                | Q(source_order_reference_snapshot__icontains=search)
                | Q(number_allocation__number__icontains=search)
            )

        order_param = params.get("order", DEFAULT_ORDER)
        if order_param not in ALLOWED_ORDER_VALUES:
            raise exceptions.ValidationError(
                {"order": f"Must be one of {sorted(ALLOWED_ORDER_VALUES)}."}
            )
        queryset = queryset.order_by(order_param, "-id")

        paginator = BoundedPageNumberPagination()
        page = paginator.paginate_queryset(queryset, request, view=self)
        rows = [serialize_row(plan, access) for plan in page]
        return paginator.get_paginated_response(rows)
