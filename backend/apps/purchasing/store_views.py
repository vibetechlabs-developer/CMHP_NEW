from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from rest_framework import exceptions, generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.errors import translate_django_validation_error
from apps.common.pagination import BoundedPageNumberPagination
from apps.companies.models import Company
from apps.companies.services import active_companies_for_user
from apps.permissions.services import store_user_has_permission, user_has_permission
from apps.purchasing.models import PurchaseOrder
from apps.purchasing.serializers import (
    PurchaseOrderCancelSerializer,
    PurchaseOrderCreateSerializer,
    PurchaseOrderIssueSerializer,
    PurchaseOrderLineCreateInputSerializer,
    PurchaseOrderSerializer,
    PurchaseOrderUpdateSerializer,
)
from apps.purchasing.services import (
    cancel_purchase_order,
    create_purchase_order,
    issue_purchase_order,
    update_purchase_order,
)
from apps.purchasing.views import _purchase_order_queryset
from apps.stores.services import active_stores_for_user
from apps.suppliers.models import Supplier
from rest_framework import serializers

PURCHASE_ORDERS_VIEW = "purchase_orders.view"
PURCHASE_ORDERS_CREATE = "purchase_orders.create"
PURCHASE_ORDERS_EDIT = "purchase_orders.edit"
PURCHASE_ORDERS_CANCEL = "purchase_orders.cancel"
PURCHASE_ORDERS_ISSUE = "purchase_orders.issue"
RECEIVING_VIEW = "receiving.view"


class StorePurchaseOrderCreateSerializer(serializers.Serializer):
    company_id = serializers.IntegerField()
    source_purchase_request_id = serializers.IntegerField(required=False)
    supplier_id = serializers.IntegerField()
    currency_code = serializers.CharField(max_length=3)
    expected_delivery_date = serializers.DateField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=2000, default="")
    lines = PurchaseOrderLineCreateInputSerializer(many=True, required=False)

    def validate(self, attrs):
        source_pr = attrs.get("source_purchase_request_id")
        if source_pr is None:
            lines = attrs.get("lines")
            if not lines:
                raise serializers.ValidationError({"lines": "At least one order line is required."})
        return attrs


def _get_store_for_action(request, store_id, *required_permissions):
    user = request.user
    store = active_stores_for_user(user).filter(pk=store_id).first()
    if store is None:
        raise exceptions.NotFound("Store not found.")
    missing = [code for code in required_permissions if not store_user_has_permission(user, store, code)]
    if missing:
        raise exceptions.PermissionDenied(f"The following permission(s) are required: {', '.join(missing)}.")
    return store


def _companies_with_po_view_access(user):
    return [
        company
        for company in active_companies_for_user(user)
        if user_has_permission(user, company, PURCHASE_ORDERS_VIEW)
    ]


@method_decorator(never_cache, name="dispatch")
class StorePurchaseOrderListCreateView(generics.ListCreateAPIView):
    """Store-scoped facade for common purchasing in a shared warehouse.
    Lists authorized purchase orders across companies the caller has access to,
    and supports creating shared-store POs with explicit legal billing entity attribution.
    """

    permission_classes = [IsAuthenticated]
    pagination_class = BoundedPageNumberPagination

    def get_serializer_class(self):
        return StorePurchaseOrderCreateSerializer if self.request.method == "POST" else PurchaseOrderSerializer

    def get_queryset(self):
        _get_store_for_action(self.request, self.kwargs["store_id"], RECEIVING_VIEW)
        companies = _companies_with_po_view_access(self.request.user)
        queryset = _purchase_order_queryset().filter(company__in=companies)

        status_param = self.request.query_params.get("status", "").strip()
        if status_param:
            if status_param not in PurchaseOrder.Status.values:
                raise exceptions.ValidationError(
                    {"status": f"Must be one of {list(PurchaseOrder.Status.values)}."}
                )
            queryset = queryset.filter(status=status_param)

        search = self.request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(
                Q(reference__icontains=search)
                | Q(supplier__legal_name__icontains=search)
                | Q(supplier__display_name__icontains=search)
                | Q(supplier__code__icontains=search)
                | Q(notes__icontains=search)
            )

        supplier_id = self.request.query_params.get("supplier_id")
        if supplier_id:
            try:
                queryset = queryset.filter(supplier_id=int(supplier_id))
            except (ValueError, TypeError):
                pass

        date_from = self.request.query_params.get("date_from", "").strip()
        if date_from:
            queryset = queryset.filter(created_at__date__gte=date_from)

        date_to = self.request.query_params.get("date_to", "").strip()
        if date_to:
            queryset = queryset.filter(created_at__date__lte=date_to)

        return queryset.order_by("-created_at", "-id")

    def create(self, request, *args, **kwargs):
        _get_store_for_action(request, self.kwargs["store_id"], RECEIVING_VIEW)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        company_id = data["company_id"]

        try:
            company = Company.objects.get(pk=company_id, is_active=True)
        except Company.DoesNotExist:
            raise exceptions.NotFound("Billing company not found.")

        if not user_has_permission(request.user, company, PURCHASE_ORDERS_CREATE):
            raise exceptions.PermissionDenied("You do not have permission to create purchase orders for this company.")

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
class StorePurchaseOrderDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, store_id, order_id):
        _get_store_for_action(request, store_id, RECEIVING_VIEW)
        order = get_object_or_404(_purchase_order_queryset(), pk=order_id)
        if not user_has_permission(request.user, order.company, PURCHASE_ORDERS_VIEW):
            raise exceptions.NotFound("Purchase order not found.")
        return Response(PurchaseOrderSerializer(order).data)

    def patch(self, request, store_id, order_id):
        _get_store_for_action(request, store_id, RECEIVING_VIEW)
        order = get_object_or_404(PurchaseOrder, pk=order_id)
        if not user_has_permission(request.user, order.company, PURCHASE_ORDERS_EDIT):
            raise exceptions.PermissionDenied("You do not have permission to edit this purchase order.")
        serializer = PurchaseOrderUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        expected_version = data.pop("expected_version")
        try:
            order = update_purchase_order(
                actor=request.user,
                purchase_order_id=order.id,
                expected_version=expected_version,
                data=data,
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        order = _purchase_order_queryset().get(pk=order.pk)
        return Response(PurchaseOrderSerializer(order).data)


@method_decorator(never_cache, name="dispatch")
class StorePurchaseOrderIssueView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, store_id, order_id):
        _get_store_for_action(request, store_id, RECEIVING_VIEW)
        order = get_object_or_404(PurchaseOrder, pk=order_id)
        if not user_has_permission(request.user, order.company, PURCHASE_ORDERS_ISSUE):
            raise exceptions.PermissionDenied("You do not have permission to issue this purchase order.")
        serializer = PurchaseOrderIssueSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            order = issue_purchase_order(
                actor=request.user,
                purchase_order_id=order.id,
                expected_version=serializer.validated_data["expected_version"],
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        order = _purchase_order_queryset().get(pk=order.pk)
        return Response(PurchaseOrderSerializer(order).data)


@method_decorator(never_cache, name="dispatch")
class StorePurchaseOrderCancelView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, store_id, order_id):
        _get_store_for_action(request, store_id, RECEIVING_VIEW)
        order = get_object_or_404(PurchaseOrder, pk=order_id)
        if not user_has_permission(request.user, order.company, PURCHASE_ORDERS_CANCEL):
            raise exceptions.PermissionDenied("You do not have permission to cancel this purchase order.")
        serializer = PurchaseOrderCancelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            order = cancel_purchase_order(
                actor=request.user,
                purchase_order_id=order.id,
                expected_version=serializer.validated_data["expected_version"],
                reason=serializer.validated_data["cancellation_reason"],
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        order = _purchase_order_queryset().get(pk=order.pk)
        return Response(PurchaseOrderSerializer(order).data)


@method_decorator(never_cache, name="dispatch")
class StorePurchasingSupplierListView(APIView):
    """Active suppliers available for common store purchasing."""

    permission_classes = [IsAuthenticated]

    def get(self, request, store_id):
        _get_store_for_action(request, store_id, RECEIVING_VIEW)
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
