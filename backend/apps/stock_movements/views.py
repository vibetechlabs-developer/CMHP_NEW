import datetime

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from rest_framework import exceptions, generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog.models import Material
from apps.common.errors import translate_django_validation_error
from apps.companies.models import Company
from apps.common.pagination import BoundedPageNumberPagination
from apps.common.validation import parse_int_filter
from apps.companies.services import active_companies_for_user
from apps.permissions.services import store_user_has_permission, user_has_permission
from apps.stock_movements.models import MaterialIssue, MaterialReturn, ProductionCustody
from apps.stock_movements.serializers import (
    COVERAGE_NOTICE,
    CutoverStockDraftCreateSerializer,
    CutoverStockDraftSerializer,
    IssuedBalanceSerializer,
    MaterialIssueCancelSerializer,
    MaterialIssueCreateSerializer,
    MaterialIssueMovementSerializer,
    MaterialIssueSerializer,
    MaterialIssueUpdateSerializer,
    MaterialIssueVersionSerializer,
    MaterialReturnSerializer,
    NetBalanceSerializer,
    NetRecordedBalanceSerializer,
    PhysicalCountDraftCreateSerializer,
    PhysicalCountDraftSerializer,
    ProductionConsumptionSerializer,
    ProductionCustodySerializer,
    ProductionDefectClassificationSerializer,
    ProductionDisposalSerializer,
    ProductionReturnSerializer,
    StockBalanceSerializer,
    StockMovementSerializer,
)
from apps.stock_movements.services import (
    cancel_material_issue,
    compute_issued_balances,
    compute_stock_balances,
    companies_with_receipt_view_access,
    create_cutover_stock_draft,
    create_material_issue,
    create_physical_count_draft,
    list_cutover_stock_drafts,
    list_physical_count_drafts,
    list_production_custodies,
    material_issue_movements_queryset,
    material_register_balances,
    net_recorded_balances,
    post_material_issue,
    record_defect_classification,
    record_disposal,
    record_production_consumption,
    record_unused_or_defective_return,
    stock_movements_queryset,
    update_material_issue,
)
from apps.stores.services import active_stores_for_user

STOCK_VIEW = "stock.view"
STOCK_ISSUE_VIEW = "stock_issue.view"
STOCK_ISSUE_CREATE = "stock_issue.create"
STOCK_ISSUE_EDIT = "stock_issue.edit"
STOCK_ISSUE_POST = "stock_issue.post"
STOCK_ISSUE_CANCEL = "stock_issue.cancel"

ALLOWED_LIST_PARAMS = {"page", "page_size", "material", "posted_from", "posted_to"}


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


def _parse_date_filter(raw_value, *, field):
    """Mirrors apps.sales_orders.views._parse_date_filter (and the same
    helper in apps.quotations/apps.batch_register) exactly - same error
    shape, same strict YYYY-MM-DD parse.
    """
    try:
        return datetime.date.fromisoformat(raw_value.strip())
    except ValueError:
        raise exceptions.ValidationError({field: "Must be a date in YYYY-MM-DD format."})


def _posted_date_range(params):
    """`posted_from`/`posted_to` (inclusive, YYYY-MM-DD) filter on
    `StockMovement.posted_at`'s own calendar date - the receipt's
    POSTING event, not its physical arrival date (`arrived_at`, shown
    separately - see StockMovementSerializer). Either bound may be
    omitted; supplying both requires `from <= to` (400 otherwise, same
    convention as every other date-range filter in this codebase).
    """
    raw_from = params.get("posted_from")
    raw_to = params.get("posted_to")
    date_from = _parse_date_filter(raw_from, field="posted_from") if raw_from else None
    date_to = _parse_date_filter(raw_to, field="posted_to") if raw_to else None
    if date_from is not None and date_to is not None and date_from > date_to:
        raise exceptions.ValidationError({"posted_from": "Must not be after posted_to."})
    return date_from, date_to


@method_decorator(never_cache, name="dispatch")
class StockMovementListView(generics.ListAPIView):
    """GET only - read-only, no mutation endpoint exists anywhere in this
    app. Requires `stock.view` in the URL's store, further scoped to
    movements whose receipt's own company the caller also holds
    `purchase_orders.view` in - store access alone never reveals another
    company's receipt quantities (mirrors apps.receiving's own dual-
    access convention exactly; deliberately NOT extended with
    formulas.view - receipt quantities are not formula data).

    `?posted_from=YYYY-MM-DD`/`?posted_to=YYYY-MM-DD` (both optional,
    inclusive) filter by `posted_at`'s own calendar date - the POSTING
    event, distinct from each movement's `source_goods_receipt_arrived_at`
    (the physical arrival date, also returned by the serializer so a
    caller can tell the two apart; this filter is on the former, never
    the latter). The response's `period` block states exactly which
    window was applied (`null`/`null` for both means "all recorded
    history", never left ambiguous).
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

        date_from, date_to = _posted_date_range(params)
        if date_from is not None:
            queryset = queryset.filter(posted_at__date__gte=date_from)
        if date_to is not None:
            queryset = queryset.filter(posted_at__date__lte=date_to)

        return queryset.order_by("-created_at", "-id")

    def list(self, request, *args, **kwargs):
        date_from, date_to = _posted_date_range(request.query_params)
        response = super().list(request, *args, **kwargs)
        response.data["coverage"] = COVERAGE_NOTICE
        response.data["period"] = {
            "posted_from": date_from.isoformat() if date_from else None,
            "posted_to": date_to.isoformat() if date_to else None,
        }
        return response


@method_decorator(never_cache, name="dispatch")
class StockBalanceListView(generics.ListAPIView):
    """GET only. Same access rule as StockMovementListView. Company
    filtering happens INSIDE compute_stock_balances, before the SUM
    aggregation runs - a total can never include a company the caller
    cannot see. Grouped by (material, unit, source_company) - never
    merged across units or companies. Labeled "recorded_receipt_quantity"
    everywhere, never available_stock/usable_stock/on_hand.

    Same `?posted_from=`/`?posted_to=` window as StockMovementListView
    (see its docstring) - applied BEFORE the SUM aggregation, so a
    period total and the movement rows it was computed from always
    agree. Omitting both aggregates the complete authorized history.
    The response's `period` block states which window produced the
    numbers below it, so a caller can never confuse a period subtotal
    for the all-time total.
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
        date_from, date_to = _posted_date_range(params)
        return compute_stock_balances(
            store=store, accessible_companies=companies, material_id=material_id,
            posted_from=date_from, posted_to=date_to,
        )

    def list(self, request, *args, **kwargs):
        date_from, date_to = _posted_date_range(request.query_params)
        response = super().list(request, *args, **kwargs)
        response.data["coverage"] = COVERAGE_NOTICE
        response.data["period"] = {
            "posted_from": date_from.isoformat() if date_from else None,
            "posted_to": date_to.isoformat() if date_to else None,
        }
        return response


REGISTER_ALLOWED_PARAMS = {"page", "page_size", "posted_from", "posted_to", "search", "supplier"}


@method_decorator(never_cache, name="dispatch")
class MaterialRegisterView(generics.ListAPIView):
    """GET /api/v1/stores/<store_id>/materials/<material_id>/register/ -
    a single, store+material-scoped register: opening/period/closing
    recorded-receipt totals (see apps.stock_movements.services.
    material_register_balances) plus the SAME paginated movement history
    StockMovementListView already exposes, narrowed to this one material
    and the same posted-date window. Same dual store+company access rule
    as every other endpoint in this app (`stock.view` in the store,
    further scoped to companies the caller also holds `purchase_orders.
    view` in) - material identity itself (code/name/base unit) is NOT
    gated by this check, since it is ordinary shared-catalog identity,
    not receipt-quantity data; only the balances/movements below it are.

    `?posted_from=`/`?posted_to=` (both optional, inclusive `YYYY-MM-DD`,
    same validation as every other date-range filter in this codebase)
    decide the period window. Opening is "every RECEIPT_IN recorded
    before `posted_from`" - NOT a confirmed physical opening balance (see
    `material_register_balances`'s own docstring) - and is omitted
    entirely (empty list) if `posted_from` is not given, rather than
    silently defaulting to an all-time total. Closing is "every
    RECEIPT_IN recorded up to and including `posted_to`". Opening,
    period and closing are never mixed into one number anywhere in this
    response.
    """

    permission_classes = [IsAuthenticated]
    pagination_class = BoundedPageNumberPagination
    serializer_class = StockMovementSerializer

    def _material(self):
        return get_object_or_404(Material, pk=self.kwargs["material_id"])

    def get_queryset(self):
        store = _get_store_for_action(self.request, self.kwargs["store_id"], STOCK_VIEW)
        params = self.request.query_params
        unknown = sorted(set(params.keys()) - REGISTER_ALLOWED_PARAMS)
        if unknown:
            raise exceptions.ValidationError({param: "Unknown query parameter." for param in unknown})

        material = self._material()
        companies = companies_with_receipt_view_access(self.request.user)
        queryset = stock_movements_queryset(store=store, accessible_companies=companies).filter(
            material_id=material.id
        )

        date_from, date_to = _posted_date_range(params)
        if date_from is not None:
            queryset = queryset.filter(posted_at__date__gte=date_from)
        if date_to is not None:
            queryset = queryset.filter(posted_at__date__lte=date_to)

        # Free-text search over the receipt's own invoice/delivery
        # reference - never over supplier/material identity (those have
        # their own dedicated filters/columns already). Supplier narrows
        # to one supplier id, within the SAME accessible-companies
        # queryset already applied above - no separate or looser check.
        search = params.get("search", "").strip()
        if search:
            queryset = queryset.filter(
                Q(source_goods_receipt__supplier_invoice_reference__icontains=search)
                | Q(source_goods_receipt__delivery_note_reference__icontains=search)
            )

        supplier_param = params.get("supplier")
        if supplier_param:
            supplier_id = parse_int_filter(supplier_param, field="supplier")
            queryset = queryset.filter(source_goods_receipt__source_purchase_order__supplier_id=supplier_id)

        return queryset.order_by("-created_at", "-id")

    def list(self, request, *args, **kwargs):
        store = _get_store_for_action(request, self.kwargs["store_id"], STOCK_VIEW)
        material = self._material()
        companies = companies_with_receipt_view_access(request.user)
        date_from, date_to = _posted_date_range(request.query_params)

        response = super().list(request, *args, **kwargs)

        balances = material_register_balances(
            store=store, accessible_companies=companies, material_id=material.id,
            posted_from=date_from, posted_to=date_to,
        )
        response.data["material"] = {
            "id": material.id, "code": material.code, "name": material.name,
            "base_unit_id": material.base_unit_id, "base_unit_code": material.base_unit.code,
        }
        response.data["store_id"] = store.id
        response.data["store_code"] = store.code
        response.data["opening"] = StockBalanceSerializer(balances["opening"], many=True).data
        response.data["period_received"] = StockBalanceSerializer(balances["period_received"], many=True).data
        response.data["closing"] = StockBalanceSerializer(balances["closing"], many=True).data
        # Additive only - opening/period_received/closing above keep
        # their original receipt-only meaning unchanged for every
        # existing caller. period_issued/closing_net_of_issues are new.
        response.data["period_issued"] = IssuedBalanceSerializer(balances["period_issued"], many=True).data
        response.data["closing_net_of_issues"] = NetBalanceSerializer(balances["closing_net_of_issues"], many=True).data
        response.data["coverage"] = COVERAGE_NOTICE
        response.data["period"] = {
            "posted_from": date_from.isoformat() if date_from else None,
            "posted_to": date_to.isoformat() if date_to else None,
        }
        return response


# ---------------------------------------------------------------------------
# Material issues (Issue Outward) - mirrors apps.receiving.views'
# GoodsReceipt* view classes exactly: same _get_store_for_action gate,
# same company-access fold-into-404 convention, same DRAFT/POSTED/
# CANCELLED lifecycle. `source_company` here is chosen directly by the
# caller (validated against companies_with_receipt_view_access) rather
# than derived from a purchase order - there is none for an issue.
# ---------------------------------------------------------------------------


def _check_issue_company_access(user, material_issue):
    """Same fold-into-404 rule apps.receiving.views._check_receipt_
    company_access uses for GoodsReceipt.company, applied to
    MaterialIssue.source_company.
    """
    if not user_has_permission(user, material_issue.source_company, "purchase_orders.view"):
        raise exceptions.NotFound("Material issue not found.")


def _material_issue_queryset():
    return MaterialIssue.objects.select_related(
        "store", "source_company", "material", "unit", "created_by", "posted_by", "cancelled_by"
    )


@method_decorator(never_cache, name="dispatch")
class MaterialIssueListCreateView(generics.ListCreateAPIView):
    """GET: `stock_issue.view` in the URL's store, scoped to issues whose
    `source_company` the caller also holds `purchase_orders.view` in -
    same dual-access convention as every other endpoint in this app.
    POST: `stock_issue.view` + `stock_issue.create` in the store, plus
    `purchase_orders.view` in the chosen `source_company_id`.
    """

    permission_classes = [IsAuthenticated]
    pagination_class = BoundedPageNumberPagination

    def get_serializer_class(self):
        return MaterialIssueCreateSerializer if self.request.method == "POST" else MaterialIssueSerializer

    def get_queryset(self):
        store = _get_store_for_action(self.request, self.kwargs["store_id"], STOCK_ISSUE_VIEW)
        companies = companies_with_receipt_view_access(self.request.user)
        queryset = _material_issue_queryset().filter(store=store, source_company__in=companies)
        params = self.request.query_params

        status_param = params.get("status", "").strip()
        if status_param:
            if status_param not in MaterialIssue.Status.values:
                raise exceptions.ValidationError({"status": f"Must be one of {list(MaterialIssue.Status.values)}."})
            queryset = queryset.filter(status=status_param)

        material_param = params.get("material")
        if material_param:
            queryset = queryset.filter(material_id=parse_int_filter(material_param, field="material"))

        source_company_param = params.get("source_company_id")
        if source_company_param:
            queryset = queryset.filter(
                source_company_id=parse_int_filter(source_company_param, field="source_company_id")
            )

        material_kind_param = params.get("material_kind", "").strip()
        if material_kind_param:
            if material_kind_param not in Material.Kind.values:
                raise exceptions.ValidationError(
                    {"material_kind": f"Must be one of {list(Material.Kind.values)}."}
                )
            queryset = queryset.filter(material__kind=material_kind_param)

        batch_param = params.get("batch_reference", "").strip()
        if batch_param:
            queryset = queryset.filter(batch_reference__icontains=batch_param)

        product_param = params.get("product_reference", "").strip()
        if product_param:
            queryset = queryset.filter(product_reference__icontains=product_param)

        date_from = params.get("date_from", "").strip()
        if date_from:
            queryset = queryset.filter(issued_at__date__gte=date_from)

        date_to = params.get("date_to", "").strip()
        if date_to:
            queryset = queryset.filter(issued_at__date__lte=date_to)

        search_param = params.get("search", "").strip()
        if search_param:
            queryset = queryset.filter(
                Q(reference__icontains=search_param)
                | Q(material_code_snapshot__icontains=search_param)
                | Q(material_name_snapshot__icontains=search_param)
                | Q(batch_reference__icontains=search_param)
                | Q(product_reference__icontains=search_param)
            )

        return queryset.order_by("-created_at", "-id")

    def create(self, request, *args, **kwargs):
        store = _get_store_for_action(request, self.kwargs["store_id"], STOCK_ISSUE_VIEW, STOCK_ISSUE_CREATE)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        company = get_object_or_404(Company, pk=data["source_company_id"])
        if not user_has_permission(request.user, company, "purchase_orders.view"):
            raise exceptions.NotFound("Company not found.")

        try:
            material_issue = create_material_issue(
                actor=request.user,
                store=store,
                source_company_id=company.id,
                material_id=data["material_id"],
                unit_id=data.get("unit_id"),
                issued_quantity=data["issued_quantity"],
                issued_at=data["issued_at"],
                batch_reference=data.get("batch_reference", ""),
                product_reference=data.get("product_reference", ""),
                remarks=data.get("remarks", ""),
                idempotency_key=data.get("idempotency_key", ""),
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        material_issue = _material_issue_queryset().get(pk=material_issue.pk)
        return Response(MaterialIssueSerializer(material_issue).data, status=201)


@method_decorator(never_cache, name="dispatch")
class MaterialIssueDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, store_id, issue_id):
        store = _get_store_for_action(request, store_id, STOCK_ISSUE_VIEW)
        material_issue = get_object_or_404(_material_issue_queryset(), pk=issue_id, store=store)
        _check_issue_company_access(request.user, material_issue)
        return Response(MaterialIssueSerializer(material_issue).data)

    def patch(self, request, store_id, issue_id):
        store = _get_store_for_action(request, store_id, STOCK_ISSUE_VIEW, STOCK_ISSUE_EDIT)
        material_issue = get_object_or_404(MaterialIssue, pk=issue_id, store=store)
        _check_issue_company_access(request.user, material_issue)
        serializer = MaterialIssueUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        expected_version = data.pop("expected_version")
        try:
            material_issue = update_material_issue(
                actor=request.user, material_issue_id=material_issue.id, expected_version=expected_version, data=data,
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        material_issue = _material_issue_queryset().get(pk=material_issue.pk)
        return Response(MaterialIssueSerializer(material_issue).data)


@method_decorator(never_cache, name="dispatch")
class MaterialIssuePostView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, store_id, issue_id):
        store = _get_store_for_action(request, store_id, STOCK_ISSUE_VIEW, STOCK_ISSUE_POST)
        material_issue = get_object_or_404(MaterialIssue, pk=issue_id, store=store)
        _check_issue_company_access(request.user, material_issue)
        serializer = MaterialIssueVersionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            material_issue = post_material_issue(
                actor=request.user, material_issue_id=material_issue.id,
                expected_version=serializer.validated_data["expected_version"],
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        material_issue = _material_issue_queryset().get(pk=material_issue.pk)
        return Response(MaterialIssueSerializer(material_issue).data)


@method_decorator(never_cache, name="dispatch")
class MaterialIssueCancelView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, store_id, issue_id):
        store = _get_store_for_action(request, store_id, STOCK_ISSUE_VIEW, STOCK_ISSUE_CANCEL)
        material_issue = get_object_or_404(MaterialIssue, pk=issue_id, store=store)
        _check_issue_company_access(request.user, material_issue)
        serializer = MaterialIssueCancelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            material_issue = cancel_material_issue(
                actor=request.user, material_issue_id=material_issue.id,
                expected_version=serializer.validated_data["expected_version"],
                reason=serializer.validated_data["cancellation_reason"],
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        material_issue = _material_issue_queryset().get(pk=material_issue.pk)
        return Response(MaterialIssueSerializer(material_issue).data)


@method_decorator(never_cache, name="dispatch")
class MaterialIssueMovementListView(generics.ListAPIView):
    """GET only - posted issue movements, the Outward-table counterpart
    of StockMovementListView. Same `stock_issue.view` + company-access
    gate, same `?material=`/`?posted_from=`/`?posted_to=` filters.
    """

    permission_classes = [IsAuthenticated]
    pagination_class = BoundedPageNumberPagination
    serializer_class = MaterialIssueMovementSerializer

    def get_queryset(self):
        store = _get_store_for_action(self.request, self.kwargs["store_id"], STOCK_ISSUE_VIEW)
        params = self.request.query_params
        unknown = sorted(set(params.keys()) - ALLOWED_LIST_PARAMS)
        if unknown:
            raise exceptions.ValidationError({param: "Unknown query parameter." for param in unknown})

        companies = companies_with_receipt_view_access(self.request.user)
        queryset = material_issue_movements_queryset(store=store, accessible_companies=companies)

        material_id = _material_filter(params)
        if material_id is not None:
            queryset = queryset.filter(material_id=material_id)

        date_from, date_to = _posted_date_range(params)
        if date_from is not None:
            queryset = queryset.filter(posted_at__date__gte=date_from)
        if date_to is not None:
            queryset = queryset.filter(posted_at__date__lte=date_to)

        return queryset.order_by("-created_at", "-id")

    def list(self, request, *args, **kwargs):
        date_from, date_to = _posted_date_range(request.query_params)
        response = super().list(request, *args, **kwargs)
        response.data["coverage"] = COVERAGE_NOTICE
        response.data["period"] = {
            "posted_from": date_from.isoformat() if date_from else None,
            "posted_to": date_to.isoformat() if date_to else None,
        }
        return response


@method_decorator(never_cache, name="dispatch")
class AvailableToIssueView(APIView):
    """GET .../material-issues/available/?material=<id> - the Issue
    Outward form's "available to issue" display: recorded receipts
    minus recorded issues, per (unit, source_company), for companies
    the caller holds purchase_orders.view in. A plain ledger number,
    never a QC-released/usable-stock claim - see
    apps.stock_movements.services.net_recorded_balances.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, store_id):
        store = _get_store_for_action(request, store_id, STOCK_ISSUE_VIEW)
        material_id = _material_filter(request.query_params)
        if material_id is None:
            raise exceptions.ValidationError({"material": "This query parameter is required."})
        companies = companies_with_receipt_view_access(request.user)
        balances = net_recorded_balances(store=store, accessible_companies=companies, material_id=material_id)
        company_codes = {c.id: c.code for c in companies}
        for row in balances:
            row["source_company_code"] = company_codes.get(row["source_company_id"], "")
        return Response(NetRecordedBalanceSerializer(balances, many=True).data)


# ---------------------------------------------------------------------------
# Production Custody Views
# ---------------------------------------------------------------------------

@method_decorator(never_cache, name="dispatch")
class ProductionCustodyListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, store_id):
        store = _get_store_for_action(request, store_id, STOCK_ISSUE_VIEW)
        companies = companies_with_receipt_view_access(request.user)
        material_id = _material_filter(request.query_params)
        custodies = list_production_custodies(
            store=store, accessible_companies=companies, material_id=material_id
        ).prefetch_related("floor_events", "floor_events__recorded_by")
        serializer = ProductionCustodySerializer(custodies, many=True)
        return Response(serializer.data)


@method_decorator(never_cache, name="dispatch")
class ProductionCustodyDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, store_id, custody_id):
        store = _get_store_for_action(request, store_id, STOCK_ISSUE_VIEW)
        companies = companies_with_receipt_view_access(request.user)
        custody = get_object_or_404(
            ProductionCustody.objects.prefetch_related("floor_events"),
            pk=custody_id,
            store=store,
            source_company__in=companies,
        )
        return Response(ProductionCustodySerializer(custody).data)


@method_decorator(never_cache, name="dispatch")
class ProductionCustodyConsumeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, store_id, custody_id):
        store = _get_store_for_action(request, store_id, STOCK_ISSUE_VIEW, STOCK_ISSUE_POST)
        companies = companies_with_receipt_view_access(request.user)
        custody = get_object_or_404(ProductionCustody, pk=custody_id, store=store, source_company__in=companies)

        serializer = ProductionConsumptionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            updated = record_production_consumption(
                actor=request.user,
                custody_id=custody.id,
                quantity=data["quantity"],
                notes=data.get("notes", ""),
                expected_version=data.get("expected_version"),
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc)

        return Response(ProductionCustodySerializer(updated).data)


@method_decorator(never_cache, name="dispatch")
class ProductionCustodyClassifyDefectView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, store_id, custody_id):
        store = _get_store_for_action(request, store_id, STOCK_ISSUE_VIEW, STOCK_ISSUE_POST)
        companies = companies_with_receipt_view_access(request.user)
        custody = get_object_or_404(ProductionCustody, pk=custody_id, store=store, source_company__in=companies)

        serializer = ProductionDefectClassificationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            updated = record_defect_classification(
                actor=request.user,
                custody_id=custody.id,
                quantity=data["quantity"],
                reason=data.get("reason", ""),
                notes=data.get("notes", ""),
                expected_version=data.get("expected_version"),
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc)

        return Response(ProductionCustodySerializer(updated).data)


@method_decorator(never_cache, name="dispatch")
class ProductionCustodyReturnView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, store_id, custody_id):
        store = _get_store_for_action(request, store_id, STOCK_ISSUE_VIEW, STOCK_ISSUE_POST)
        companies = companies_with_receipt_view_access(request.user)
        custody = get_object_or_404(ProductionCustody, pk=custody_id, store=store, source_company__in=companies)

        serializer = ProductionReturnSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            updated = record_unused_or_defective_return(
                actor=request.user,
                custody_id=custody.id,
                quantity=data["quantity"],
                return_type=data["return_type"],
                reason=data.get("reason", ""),
                expected_version=data.get("expected_version"),
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc)

        return Response(ProductionCustodySerializer(updated).data)


@method_decorator(never_cache, name="dispatch")
class ProductionCustodyDisposeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, store_id, custody_id):
        store = _get_store_for_action(request, store_id, STOCK_ISSUE_VIEW, STOCK_ISSUE_POST)
        companies = companies_with_receipt_view_access(request.user)
        custody = get_object_or_404(ProductionCustody, pk=custody_id, store=store, source_company__in=companies)

        serializer = ProductionDisposalSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            updated = record_disposal(
                actor=request.user,
                custody_id=custody.id,
                quantity=data["quantity"],
                disposal_policy=data["disposal_policy"],
                reason=data.get("reason", ""),
                notes=data.get("notes", ""),
                expected_version=data.get("expected_version"),
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc)

        return Response(ProductionCustodySerializer(updated).data)


@method_decorator(never_cache, name="dispatch")
class MaterialReturnListView(generics.ListAPIView):
    """GET only - a store-wide, company-access-filtered list of
    recorded `MaterialReturn` rows, independent of any one
    `ProductionCustody`'s own detail drawer (which already carries its
    OWN return events via `floor_events` - see ProductionCustodySerializer).
    Same `stock_issue.view` + company-access gate as every other read in
    this app; no new/looser permission is introduced for this list.
    """

    permission_classes = [IsAuthenticated]
    pagination_class = BoundedPageNumberPagination
    serializer_class = MaterialReturnSerializer

    def get_queryset(self):
        store = _get_store_for_action(self.request, self.kwargs["store_id"], STOCK_ISSUE_VIEW)
        companies = companies_with_receipt_view_access(self.request.user)
        queryset = MaterialReturn.objects.filter(store=store, source_company__in=companies).select_related(
            "source_issue", "source_company", "material", "unit", "recorded_by"
        )
        params = self.request.query_params

        material_param = params.get("material")
        if material_param:
            queryset = queryset.filter(material_id=parse_int_filter(material_param, field="material"))

        return_type_param = params.get("return_type", "").strip()
        if return_type_param:
            if return_type_param not in dict(MaterialReturn.RETURN_TYPE_CHOICES):
                raise exceptions.ValidationError(
                    {"return_type": f"Must be one of {list(dict(MaterialReturn.RETURN_TYPE_CHOICES))}."}
                )
            queryset = queryset.filter(return_type=return_type_param)

        disposition_param = params.get("disposition", "").strip()
        if disposition_param:
            if disposition_param not in dict(MaterialReturn.DISPOSITION_CHOICES):
                raise exceptions.ValidationError(
                    {"disposition": f"Must be one of {list(dict(MaterialReturn.DISPOSITION_CHOICES))}."}
                )
            queryset = queryset.filter(disposition=disposition_param)

        date_from = params.get("date_from", "").strip()
        if date_from:
            queryset = queryset.filter(created_at__date__gte=date_from)

        date_to = params.get("date_to", "").strip()
        if date_to:
            queryset = queryset.filter(created_at__date__lte=date_to)

        return queryset.order_by("-created_at", "-id")


# ---------------------------------------------------------------------------
# Count & Cutover Draft Views
# ---------------------------------------------------------------------------

@method_decorator(never_cache, name="dispatch")
class PhysicalCountDraftListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, store_id):
        store = _get_store_for_action(request, store_id, STOCK_VIEW)
        material_id = _material_filter(request.query_params)
        drafts = list_physical_count_drafts(store_id=store.id, material_id=material_id)
        return Response(PhysicalCountDraftSerializer(drafts, many=True).data)

    def post(self, request, store_id):
        store = _get_store_for_action(request, store_id, STOCK_VIEW)
        serializer = PhysicalCountDraftCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            draft = create_physical_count_draft(
                actor=request.user,
                store_id=store.id,
                material_id=data["material_id"],
                unit_id=data["unit_id"],
                book_reference_quantity=data["book_reference_quantity"],
                actual_count_quantity=data["actual_count_quantity"],
                reason=data.get("reason", ""),
                scope=data.get("scope", "STORE_PHYSICAL"),
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc)

        return Response(PhysicalCountDraftSerializer(draft).data, status=201)


@method_decorator(never_cache, name="dispatch")
class CutoverStockDraftListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, store_id):
        store = _get_store_for_action(request, store_id, STOCK_VIEW)
        material_id = _material_filter(request.query_params)
        drafts = list_cutover_stock_drafts(store_id=store.id, material_id=material_id)
        return Response(CutoverStockDraftSerializer(drafts, many=True).data)

    def post(self, request, store_id):
        store = _get_store_for_action(request, store_id, STOCK_VIEW)
        serializer = CutoverStockDraftCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            draft = create_cutover_stock_draft(
                actor=request.user,
                store_id=store.id,
                material_id=data["material_id"],
                unit_id=data["unit_id"],
                effective_date=data["effective_date"],
                quantity=data["quantity"],
                source_reference=data["source_reference"],
                remarks=data.get("remarks", ""),
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc)

        return Response(CutoverStockDraftSerializer(draft).data, status=201)

