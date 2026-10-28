from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from rest_framework import exceptions, generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog.permissions import CanReadSharedCatalog
from apps.common.errors import translate_django_validation_error
from apps.common.pagination import BoundedPageNumberPagination
from apps.common.permissions import IsActiveSuperuser
from apps.common.validation import parse_strict_bool
from apps.companies.models import Company
from apps.permissions.services import store_user_has_permission, user_has_permission
from apps.purchasing.models import PurchaseOrder
from apps.receiving.models import ContainerType, GoodsReceipt
from apps.receiving.serializers import (
    ContainerTypeCreateSerializer,
    ContainerTypeSerializer,
    ContainerTypeUpdateSerializer,
    EligiblePurchaseOrderSerializer,
    GoodsReceiptCancelSerializer,
    GoodsReceiptCreateSerializer,
    GoodsReceiptSerializer,
    GoodsReceiptUpdateSerializer,
    GoodsReceiptVersionSerializer,
)
from apps.receiving.services import (
    activate_container_type,
    cancel_goods_receipt,
    companies_with_po_view_access,
    create_container_type,
    create_goods_receipt,
    deactivate_container_type,
    eligible_purchase_orders_for_receiving,
    post_goods_receipt,
    update_container_type,
    update_goods_receipt,
)
from apps.stores.services import active_stores_for_user

RECEIVING_VIEW = "receiving.view"
RECEIVING_CREATE = "receiving.create"
RECEIVING_EDIT = "receiving.edit"
RECEIVING_POST = "receiving.post"
RECEIVING_CANCEL = "receiving.cancel"

# Not imported from apps.purchasing.views - that module defines its own
# local constant the same way, and every app in this project defines its
# own permission-code constants rather than sharing a view-layer import
# across app boundaries (see apps.purchasing.views' own PURCHASE_
# REQUESTS_VIEW/PURCHASE_ORDERS_VIEW constants for the identical pattern).
PURCHASE_ORDERS_VIEW = "purchase_orders.view"


def _get_store_for_action(request, store_id, *required_permissions):
    """Mirrors apps.purchasing.views._get_company_for_action exactly, for
    STORE scope: an active membership in an active store is required
    just to be *found* at all - a nonexistent store, an inactive one, or
    one the caller simply is not a member of are all folded into the
    same 404. Holding every permission in `required_permissions` is then
    checked separately, a 403 (naming what is missing) if any is absent.
    No superuser or company-membership bypass exists anywhere in this
    path - store access and company access are two independent axes
    (see apps.receiving.services.companies_with_po_view_access and
    docs/receiving-proposal.md's explicit access-policy note).
    """
    user = request.user
    store = active_stores_for_user(user).filter(pk=store_id).first()
    if store is None:
        raise exceptions.NotFound("Store not found.")
    missing = [code for code in required_permissions if not store_user_has_permission(user, store, code)]
    if missing:
        raise exceptions.PermissionDenied(f"The following permission(s) are required: {', '.join(missing)}.")
    return store


def _get_accessible_purchase_order(user, purchase_order_id):
    """Resolves a PurchaseOrder by id, folding "does not exist" and
    "caller lacks `purchase_orders.view` in its company" into the same
    404 - mirrors apps.purchasing.views._get_company_for_action's own
    convention for the company itself. Store access alone is never
    enough to reach a purchase order through this path.
    """
    purchase_order = get_object_or_404(PurchaseOrder.objects.select_related("company"), pk=purchase_order_id)
    if not user_has_permission(user, purchase_order.company, PURCHASE_ORDERS_VIEW):
        raise exceptions.NotFound("Purchase order not found.")
    return purchase_order


def _get_accessible_company_for_manual_receipt(user, company_id):
    """MANUAL ENTRY MODE's counterpart of _get_accessible_purchase_order
    (added after Task 09A) - there is no PurchaseOrder to resolve access
    through, so the caller's chosen company is checked directly against
    the SAME `purchase_orders.view` permission the PO-based path already
    requires, for identical authorization strength on both paths. Folds
    "does not exist" and "no access" into the same 404, same convention.
    """
    company = get_object_or_404(Company, pk=company_id)
    if not user_has_permission(user, company, PURCHASE_ORDERS_VIEW):
        raise exceptions.NotFound("Company not found.")
    return company


def _check_receipt_company_access(user, goods_receipt):
    """Same fold-into-404 rule as _get_accessible_purchase_order, applied
    to an already-resolved GoodsReceipt's own `company` - a caller who
    passes the store-level check above but lacks `purchase_orders.view`
    in this specific receipt's company must never learn the receipt
    exists at all.
    """
    if not user_has_permission(user, goods_receipt.company, PURCHASE_ORDERS_VIEW):
        raise exceptions.NotFound("Goods receipt not found.")


def _goods_receipt_queryset():
    return GoodsReceipt.objects.select_related(
        "store", "company", "source_purchase_order", "created_by", "posted_by", "cancelled_by"
    ).prefetch_related("lines__material", "lines__unit", "lines__source_po_line")


@method_decorator(never_cache, name="dispatch")
class GoodsReceiptListCreateView(generics.ListCreateAPIView):
    """GET: `receiving.view` in the URL's store, further scoped to
    receipts whose company the caller also holds `purchase_orders.view`
    in - store access alone never reveals every company's receipts (see
    docs/receiving-proposal.md). POST: `receiving.view` and
    `receiving.create` in the store, **and** `purchase_orders.view` in
    the source purchase order's own company.
    """

    permission_classes = [IsAuthenticated]
    pagination_class = BoundedPageNumberPagination

    def get_serializer_class(self):
        return GoodsReceiptCreateSerializer if self.request.method == "POST" else GoodsReceiptSerializer

    def get_queryset(self):
        store = _get_store_for_action(self.request, self.kwargs["store_id"], RECEIVING_VIEW)
        companies = companies_with_po_view_access(self.request.user)
        queryset = _goods_receipt_queryset().filter(store=store, company__in=companies)

        status_param = self.request.query_params.get("status", "").strip()
        if status_param:
            if status_param not in GoodsReceipt.Status.values:
                raise exceptions.ValidationError(
                    {"status": f"Must be one of {list(GoodsReceipt.Status.values)}."}
                )
            queryset = queryset.filter(status=status_param)

        search = self.request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(
                Q(reference__icontains=search)
                | Q(supplier_invoice_reference__icontains=search)
                | Q(delivery_note_reference__icontains=search)
                | Q(source_purchase_order__reference__icontains=search)
            )

        return queryset.order_by("-created_at", "-id")

    def create(self, request, *args, **kwargs):
        store = _get_store_for_action(request, self.kwargs["store_id"], RECEIVING_VIEW, RECEIVING_CREATE)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Company access is checked here, before the service ever runs -
        # the service itself has no permission awareness (matching every
        # other service in this project). PO-based: confirms the source
        # PO is visible to this caller at all, folding a cross-company or
        # nonexistent id into the same 404. MANUAL ENTRY MODE (added
        # after Task 09A, no source_purchase_order_id - see
        # create_goods_receipt's own docstring): the same check applied
        # directly to the caller's chosen company_id instead.
        source_purchase_order_id = data.get("source_purchase_order_id")
        if source_purchase_order_id is not None:
            purchase_order = _get_accessible_purchase_order(request.user, source_purchase_order_id)
            company_id = None
        else:
            purchase_order = None
            company_id = _get_accessible_company_for_manual_receipt(request.user, data["company_id"]).id

        try:
            goods_receipt = create_goods_receipt(
                actor=request.user,
                store=store,
                source_purchase_order_id=purchase_order.id if purchase_order else None,
                company_id=company_id,
                supplier_name=data.get("supplier_name", ""),
                arrived_at=data["arrived_at"],
                supplier_invoice_reference=data.get("supplier_invoice_reference", ""),
                delivery_note_reference=data.get("delivery_note_reference", ""),
                notes=data.get("notes", ""),
                idempotency_key=data.get("idempotency_key", ""),
                lines=data.get("lines", []),
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        goods_receipt = _goods_receipt_queryset().get(pk=goods_receipt.pk)
        # Always 201, even for a safe idempotent-key replay that returned
        # an already-existing row rather than inserting a new one - the
        # resource this call describes exists either way, and
        # distinguishing "created just now" from "already existed
        # identically" would require create_goods_receipt to return a
        # (receipt, created) pair the way Django's own get_or_create()
        # does, which no other create_* function in this project needs
        # or has; not worth the divergence for a status-code nuance the
        # brief did not ask for.
        return Response(GoodsReceiptSerializer(goods_receipt).data, status=201)


@method_decorator(never_cache, name="dispatch")
class GoodsReceiptDetailView(APIView):
    """GET: `receiving.view` **and** `purchase_orders.view` in the
    receipt's own company. PATCH: `receiving.view`/`receiving.edit` in
    the store, plus the same company check, `DRAFT` only - see
    apps.receiving.services.update_goods_receipt.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, store_id, receipt_id):
        store = _get_store_for_action(request, store_id, RECEIVING_VIEW)
        goods_receipt = get_object_or_404(_goods_receipt_queryset(), pk=receipt_id, store=store)
        _check_receipt_company_access(request.user, goods_receipt)
        return Response(GoodsReceiptSerializer(goods_receipt).data)

    def patch(self, request, store_id, receipt_id):
        store = _get_store_for_action(request, store_id, RECEIVING_VIEW, RECEIVING_EDIT)
        goods_receipt = get_object_or_404(GoodsReceipt, pk=receipt_id, store=store)
        _check_receipt_company_access(request.user, goods_receipt)
        serializer = GoodsReceiptUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        expected_version = data.pop("expected_version")
        try:
            goods_receipt = update_goods_receipt(
                actor=request.user,
                goods_receipt_id=goods_receipt.id,
                expected_version=expected_version,
                data=data,
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        goods_receipt = _goods_receipt_queryset().get(pk=goods_receipt.pk)
        return Response(GoodsReceiptSerializer(goods_receipt).data)


@method_decorator(never_cache, name="dispatch")
class GoodsReceiptPostView(APIView):
    """`receiving.view` and `receiving.post` in the store, plus
    `purchase_orders.view` in the receipt's own company. See
    apps.receiving.services.post_goods_receipt for the full
    remaining-quantity/locking/idempotent-retry rules.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, store_id, receipt_id):
        store = _get_store_for_action(request, store_id, RECEIVING_VIEW, RECEIVING_POST)
        goods_receipt = get_object_or_404(GoodsReceipt, pk=receipt_id, store=store)
        _check_receipt_company_access(request.user, goods_receipt)
        serializer = GoodsReceiptVersionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            goods_receipt = post_goods_receipt(
                actor=request.user,
                goods_receipt_id=goods_receipt.id,
                expected_version=serializer.validated_data["expected_version"],
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        goods_receipt = _goods_receipt_queryset().get(pk=goods_receipt.pk)
        return Response(GoodsReceiptSerializer(goods_receipt).data)


@method_decorator(never_cache, name="dispatch")
class GoodsReceiptCancelView(APIView):
    """`receiving.view` and `receiving.cancel` in the store, plus
    `purchase_orders.view` in the receipt's own company. `DRAFT` only -
    see apps.receiving.services.cancel_goods_receipt. A `POSTED` receipt
    can never be cancelled through this endpoint.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, store_id, receipt_id):
        store = _get_store_for_action(request, store_id, RECEIVING_VIEW, RECEIVING_CANCEL)
        goods_receipt = get_object_or_404(GoodsReceipt, pk=receipt_id, store=store)
        _check_receipt_company_access(request.user, goods_receipt)
        serializer = GoodsReceiptCancelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            goods_receipt = cancel_goods_receipt(
                actor=request.user,
                goods_receipt_id=goods_receipt.id,
                expected_version=serializer.validated_data["expected_version"],
                reason=serializer.validated_data["cancellation_reason"],
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        goods_receipt = _goods_receipt_queryset().get(pk=goods_receipt.pk)
        return Response(GoodsReceiptSerializer(goods_receipt).data)


@method_decorator(never_cache, name="dispatch")
class EligiblePurchaseOrdersView(generics.ListAPIView):
    """GET .../goods-receipts/eligible-purchase-orders/ - a minimal
    lookup for creating a new receipt: `ISSUED` purchase orders from
    companies the caller holds `purchase_orders.view` in, gated by the
    exact same store `receiving.view` requirement as every other
    endpoint here. Grants no broader purchasing access of its own - see
    apps.receiving.services.eligible_purchase_orders_for_receiving.
    Never exposes supplier price/line amount/currency/subtotal, only
    identity and physical delivery progress.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = EligiblePurchaseOrderSerializer
    pagination_class = BoundedPageNumberPagination

    def get_queryset(self):
        _get_store_for_action(self.request, self.kwargs["store_id"], RECEIVING_VIEW)
        return eligible_purchase_orders_for_receiving(self.request.user)


# ---------------------------------------------------------------------------
# ContainerType - shared packaging reference data, independent of any
# store. Mirrors apps.catalog.views' UnitOfMeasure* views exactly: GET is
# CanReadSharedCatalog (active superuser, or shared_catalog.view in at
# least one active store), every write is active-superuser-only.
# ---------------------------------------------------------------------------


def _container_type_read_write_permissions(request):
    return [CanReadSharedCatalog()] if request.method == "GET" else [IsActiveSuperuser()]


def _duplicate_container_type_code_error():
    return exceptions.ValidationError({"code": "A container type with this code already exists."})


@method_decorator(never_cache, name="dispatch")
class ContainerTypeListCreateView(generics.ListCreateAPIView):
    pagination_class = BoundedPageNumberPagination

    def get_permissions(self):
        return _container_type_read_write_permissions(self.request)

    def get_serializer_class(self):
        return ContainerTypeCreateSerializer if self.request.method == "POST" else ContainerTypeSerializer

    def get_queryset(self):
        queryset = ContainerType.objects.all()

        search = self.request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(Q(code__icontains=search) | Q(name__icontains=search))

        is_active_param = self.request.query_params.get("is_active")
        if is_active_param is not None:
            queryset = queryset.filter(is_active=parse_strict_bool(is_active_param))

        return queryset.order_by("code", "id")

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            container_type = create_container_type(actor=request.user, **serializer.validated_data)
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        except IntegrityError:
            raise _duplicate_container_type_code_error()
        return Response(ContainerTypeSerializer(container_type).data, status=201)


@method_decorator(never_cache, name="dispatch")
class ContainerTypeDetailView(APIView):
    def get_permissions(self):
        return _container_type_read_write_permissions(self.request)

    def get(self, request, container_type_id):
        container_type = get_object_or_404(ContainerType, pk=container_type_id)
        return Response(ContainerTypeSerializer(container_type).data)

    def patch(self, request, container_type_id):
        container_type = get_object_or_404(ContainerType, pk=container_type_id)
        serializer = ContainerTypeUpdateSerializer(container_type, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            container_type = update_container_type(
                actor=request.user, container_type=container_type, data=serializer.validated_data
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        return Response(ContainerTypeSerializer(container_type).data)


@method_decorator(never_cache, name="dispatch")
class ContainerTypeActivateView(APIView):
    permission_classes = [IsActiveSuperuser]

    def post(self, request, container_type_id):
        container_type = get_object_or_404(ContainerType, pk=container_type_id)
        container_type = activate_container_type(actor=request.user, container_type=container_type)
        return Response(ContainerTypeSerializer(container_type).data)


@method_decorator(never_cache, name="dispatch")
class ContainerTypeDeactivateView(APIView):
    """Rejected (400) while any active Material still references this
    container type as its default - see
    apps.receiving.services.deactivate_container_type.
    """

    permission_classes = [IsActiveSuperuser]

    def post(self, request, container_type_id):
        container_type = get_object_or_404(ContainerType, pk=container_type_id)
        try:
            container_type = deactivate_container_type(actor=request.user, container_type=container_type)
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        return Response(ContainerTypeSerializer(container_type).data)
