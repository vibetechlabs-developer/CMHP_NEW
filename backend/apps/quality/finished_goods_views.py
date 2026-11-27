from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Sum
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from rest_framework import exceptions, serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.services import record
from apps.common.errors import Conflict, translate_django_validation_error
from apps.common.pagination import BoundedPageNumberPagination
from apps.quality.batch_quality_services import post_finished_goods_stock
from apps.companies.services import active_companies_for_user
from apps.permissions.services import user_has_permission
from apps.quality.models import (
    BatchQualityCase, FinishedGoodsAllocation, FinishedGoodsPlacement, FinishedGoodsStock,
)
from apps.sales_orders.models import SalesOrder, SalesOrderLine


def _get_company_for_action(request, company_id, *permissions):
    company = get_object_or_404(active_companies_for_user(request.user), pk=company_id)
    if not request.user.is_superuser and not all(
        user_has_permission(request.user, company, permission) for permission in permissions
    ):
        raise exceptions.PermissionDenied(f"Required permissions: {', '.join(permissions)}.")
    return company


class BayInput(serializers.Serializer):
    warehouseStore = serializers.CharField(max_length=255)


class PostingInput(serializers.Serializer):
    batchNo = serializers.CharField(max_length=100)


class AllocationInput(serializers.Serializer):
    orderRef = serializers.CharField(max_length=100)
    allocateQty = serializers.DecimalField(max_digits=14, decimal_places=3, min_value=Decimal("0.001"))
    requestId = serializers.UUIDField()


def serialize_stock(stock):
    allocations = list(stock.allocations.all())
    allocated = sum(row.quantity for row in allocations)
    placement = getattr(stock, "placement", None)
    return {
        "id": stock.pk,
        "batchNo": stock.batch_number,
        "productCode": stock.product_code_snapshot,
        "productName": stock.product_name_snapshot,
        "packSize": stock.product.pack_size,
        "unitCode": stock.unit_code_snapshot,
        "postedQty": stock.quantity,
        "availableBufferQty": stock.quantity - allocated,
        "allocatedQty": allocated,
        "warehouseStore": placement.bay if placement else stock.storage_location,
        "postedAt": stock.posted_at,
        "allocatedOrders": [
            {
                "id": row.pk,
                "orderRef": row.sales_order_line.sales_order.reference,
                "customer": row.sales_order_line.sales_order.customer.name,
                "qty": row.quantity,
                "actor": row.allocated_by.get_full_name() or row.allocated_by.get_username(),
                "date": row.allocated_at,
            }
            for row in allocations
        ],
    }


@method_decorator(never_cache, name="dispatch")
class FinishedGoodsListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        company = _get_company_for_action(request, company_id, "finished_goods.view")
        rows = FinishedGoodsStock.objects.filter(company=company, is_reversed=False).select_related(
            "product", "placement",
        ).prefetch_related(
            "allocations__sales_order_line__sales_order__customer", "allocations__allocated_by",
        ).order_by("-posted_at", "-pk")
        paginator = BoundedPageNumberPagination()
        page = paginator.paginate_queryset(rows, request, view=self)
        return paginator.get_paginated_response([serialize_stock(stock) for stock in page])

    def post(self, request, company_id):
        company = _get_company_for_action(request, company_id, "finished_goods.post")
        serializer = PostingInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        cases = list(BatchQualityCase.objects.filter(
            company=company, batch_number_snapshot=serializer.validated_data["batchNo"],
        )[:2])
        if len(cases) != 1:
            raise exceptions.ValidationError({"batchNo": "Select a batch with a matching Quality case."})
        case = cases[0]
        try:
            stock = post_finished_goods_stock(
                user=request.user, company=company, quality_case_id=case.pk, expected_version=case.version,
            )
        except DjangoValidationError as error:
            raise translate_django_validation_error(error) from error
        return Response({"id": stock.pk}, status=201)


@method_decorator(never_cache, name="dispatch")
class FinishedGoodsBayView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def patch(self, request, company_id, stock_id):
        company = _get_company_for_action(request, company_id, "finished_goods.post")
        serializer = BayInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        stock = get_object_or_404(FinishedGoodsStock.objects.select_for_update(), pk=stock_id, company=company, is_reversed=False)
        bay = serializer.validated_data["warehouseStore"]
        previous = getattr(stock, "placement", None)
        before = previous.bay if previous else stock.storage_location
        FinishedGoodsPlacement.objects.update_or_create(stock=stock, defaults={"bay": bay})
        record(actor=request.user, action="finished_goods.bay_updated", target_type="finished_goods_stock",
               target_id=stock.pk, company=company, before={"bay": before}, after={"bay": bay})
        return Response({"warehouseStore": bay})


@method_decorator(never_cache, name="dispatch")
class FinishedGoodsAllocationView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, company_id, stock_id):
        company = _get_company_for_action(request, company_id, "finished_goods.post", "sales_orders.edit")
        serializer = AllocationInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        stock = get_object_or_404(FinishedGoodsStock.objects.select_for_update(), pk=stock_id, company=company, is_reversed=False)
        order = get_object_or_404(
            SalesOrder.objects.select_for_update(), company=company, reference=data["orderRef"],
        )
        existing = FinishedGoodsAllocation.objects.filter(request_id=data["requestId"]).first()
        if existing:
            if existing.stock_id != stock.pk or existing.quantity != data["allocateQty"] or existing.sales_order_line.sales_order_id != order.pk:
                raise Conflict("This allocation request was already used with different details.")
            return Response({"id": existing.pk, "orderRef": order.reference, "qty": existing.quantity})
        if order.status != SalesOrder.Status.CONFIRMED or order.workflow_stage in ("DISPATCHED", "COMPLETED"):
            raise exceptions.ValidationError({"orderRef": "Use a confirmed sales order that has not been dispatched."})
        lines = list(SalesOrderLine.objects.filter(sales_order=order, product_id=stock.product_id)[:2])
        if len(lines) != 1 or lines[0].sales_uom_code_snapshot != stock.unit_code_snapshot:
            raise exceptions.ValidationError({"orderRef": "The order needs one matching product line with the same unit."})
        line = lines[0]
        qty = data["allocateQty"]
        if stock.unit.dimension == "COUNT" and qty != qty.to_integral_value():
            raise exceptions.ValidationError({"allocateQty": "Enter a whole number of units."})
        used = stock.allocations.aggregate(total=Sum("quantity"))["total"] or 0
        line_used = line.finished_goods_allocations.aggregate(total=Sum("quantity"))["total"] or 0
        if qty > stock.quantity - used or qty > line.quantity - line_used:
            raise exceptions.ValidationError({"allocateQty": "Quantity exceeds available stock or the unallocated order quantity."})
        allocation = FinishedGoodsAllocation.objects.create(
            stock=stock, sales_order_line=line, quantity=qty, allocated_by=request.user, request_id=data["requestId"],
        )
        return Response({"id": allocation.pk, "orderRef": order.reference, "qty": allocation.quantity}, status=201)
