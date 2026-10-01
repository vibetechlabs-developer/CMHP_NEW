from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from rest_framework import exceptions, generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.common.pagination import BoundedPageNumberPagination
from apps.permissions.services import store_user_has_permission
from apps.stock_movements.serializers import COVERAGE_NOTICE, StockBalanceSerializer, StockMovementSerializer
from apps.stock_movements.services import (
    compute_stock_balances,
    companies_with_receipt_view_access,
    stock_movements_queryset,
)
from apps.stores.services import active_stores_for_user

STOCK_VIEW = "stock.view"

ALLOWED_LIST_PARAMS = {"page", "page_size", "material"}


def _get_store_for_action(request, store_id, *required_permissions):
    """Mirrors apps.receiving.views._get_store_for_action exactly: an
    active membership in an active store is required just to be *found*
    at all - a nonexistent store, an inactive one, or one the caller
    simply is not a member of are all folded into the same 404. Holding
    every permission in `required_permissions` is then checked
    separately, a 403 (naming what is missing) if any is absent. No
    superuser or company-membership bypass exists anywhere in this path.
    """
    user = request.user
    store = active_stores_for_user(user).filter(pk=store_id).first()
    if store is None:
        raise exceptions.NotFound("Store not found.")
    missing = [code for code in required_permissions if not store_user_has_permission(user, store, code)]
    if missing:
        raise exceptions.PermissionDenied(f"The following permission(s) are required: {', '.join(missing)}.")
    return store


def _material_filter(params):
    material_param = params.get("material")
    if not material_param:
        return None
    try:
        return int(material_param.strip())
    except ValueError:
        raise exceptions.ValidationError({"material": "Must be a valid integer id."})


@method_decorator(never_cache, name="dispatch")
class StockMovementListView(generics.ListAPIView):
    """GET only - read-only, no mutation endpoint exists anywhere in this
    app. Requires `stock.view` in the URL's store, further scoped to
    movements whose receipt's own company the caller also holds
    `purchase_orders.view` in - store access alone never reveals another
    company's receipt quantities (mirrors apps.receiving's own dual-
    access convention exactly; deliberately NOT extended with
    formulas.view - receipt quantities are not formula data).
    """

    permission_classes = [IsAuthenticated]
    pagination_class = BoundedPageNumberPagination
    serializer_class = StockMovementSerializer

    def get_queryset(self):
        store = _get_store_for_action(self.request, self.kwargs["store_id"], STOCK_VIEW)
        params = self.request.query_params
        unknown = sorted(set(params.keys()) - ALLOWED_LIST_PARAMS)
        if unknown:
            raise exceptions.ValidationError({param: "Unknown query parameter." for param in unknown})

        companies = companies_with_receipt_view_access(self.request.user)
        queryset = stock_movements_queryset(store=store, accessible_companies=companies)

        material_id = _material_filter(params)
        if material_id is not None:
            queryset = queryset.filter(material_id=material_id)

        return queryset.order_by("-created_at", "-id")

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        response.data["coverage"] = COVERAGE_NOTICE
        return response


@method_decorator(never_cache, name="dispatch")
class StockBalanceListView(generics.ListAPIView):
    """GET only. Same access rule as StockMovementListView. Company
    filtering happens INSIDE compute_stock_balances, before the SUM
    aggregation runs - a total can never include a company the caller
    cannot see. Grouped by (material, unit, source_company) - never
    merged across units or companies. Labeled "recorded_receipt_quantity"
    everywhere, never available_stock/usable_stock/on_hand.
    """

    permission_classes = [IsAuthenticated]
    pagination_class = BoundedPageNumberPagination
    serializer_class = StockBalanceSerializer

    def get_queryset(self):
        store = _get_store_for_action(self.request, self.kwargs["store_id"], STOCK_VIEW)
        params = self.request.query_params
        unknown = sorted(set(params.keys()) - ALLOWED_LIST_PARAMS)
        if unknown:
            raise exceptions.ValidationError({param: "Unknown query parameter." for param in unknown})

        companies = companies_with_receipt_view_access(self.request.user)
        material_id = _material_filter(params)
        return compute_stock_balances(store=store, accessible_companies=companies, material_id=material_id)

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        response.data["coverage"] = COVERAGE_NOTICE
        return response
