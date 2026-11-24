import datetime

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Prefetch, Q
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from rest_framework import exceptions, generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.errors import translate_django_validation_error
from apps.common.pagination import BoundedPageNumberPagination
from apps.common.validation import parse_int_filter
from apps.companies.services import active_companies_for_user
from apps.permissions.services import user_has_permission
from apps.sales_orders.models import SalesOrder, SalesOrderLine
from apps.sales_orders.serializers import (
    ConfirmationPolicyUpdateSerializer,
    SalesOrderConfirmSerializer,
    SalesOrderCreateSerializer,
    SalesOrderListSerializer,
    SalesOrderSerializer,
    SalesOrderUpdateSerializer,
)
from apps.common.permissions import IsActiveSuperuser
from apps.companies.models import Company
from apps.sales_orders.confirmation import policy_status
from apps.sales_orders.models import SalesOrderConfirmationPolicy
from apps.sales_orders.preview import build_confirmation_preview
from apps.sales_orders.services import (
    SALES_ORDERS_CONFIRM,
    SALES_ORDERS_DELETE,
    confirm_sales_order,
    create_sales_order,
    delete_sales_order,
    set_workflow_stage,
    update_confirmation_policy,
    update_sales_order,
)

SALES_ORDERS_VIEW = "sales_orders.view"
SALES_ORDERS_CREATE = "sales_orders.create"
SALES_ORDERS_EDIT = "sales_orders.edit"


def order_batch_numbers(company, order_ids):
    """Batch number for each order: `{customer code}-{order year}-{sequence}`.

    The sequence is how many orders that same customer (the ordering
    company) already has in that calendar year, in arrival order, starting
    at 0001. A new year starts again at 0001. Counted across the whole
    company, not just the current page.
    """
    wanted = {oid for oid in order_ids if oid}
    if not wanted:
        return {}
    page_orders = SalesOrder.objects.filter(company=company, pk__in=wanted).only("id", "customer_id", "order_date")
    customer_ids = set()
    years = set()
    for order in page_orders:
        if order.order_date is None:
            continue
        customer_ids.add(order.customer_id)
        years.add(order.order_date.year)
    if not customer_ids or not years:
        return {}
    groups = {}
    codes = {}
    siblings = (
        SalesOrder.objects.filter(company=company, customer_id__in=customer_ids, order_date__year__in=years)
        .order_by("created_at", "id")
        .values_list("id", "customer_id", "order_date", "customer__code")
    )
    for oid, customer_id, order_date, code in siblings:
        if order_date is None:
            continue
        groups.setdefault((customer_id, order_date.year), []).append(oid)
        codes[oid] = (code or "").strip().upper()
    numbers = {}
    for (customer_id, year), ids in groups.items():
        for index, oid in enumerate(ids, start=1):
            if oid not in wanted:
                continue
            numbers[oid] = f"{codes.get(oid) or 'XX'}-{year}-{index:04d}"
    return numbers


def order_section_flags(order_ids):
    """Which order sections already have saved details.

    Admin is the order itself. Manager is a saved batch plan. Store is a
    saved store-preparation row, either on the order line or on a batch plan.
    """
    wanted = {oid for oid in order_ids if oid}
    if not wanted:
        return {}
    from apps.batch_plans.models import BatchPlan
    from apps.store_preparation.models import StorePreparation

    with_batch = set(
        BatchPlan.objects.filter(sales_order_line__sales_order_id__in=wanted).values_list(
            "sales_order_line__sales_order_id", flat=True
        )
    )
    with_store = set(
        StorePreparation.objects.filter(sales_order_line__sales_order_id__in=wanted).values_list(
            "sales_order_line__sales_order_id", flat=True
        )
    )
    with_store.update(
        StorePreparation.objects.filter(batch_plan__sales_order_line__sales_order_id__in=wanted).values_list(
            "batch_plan__sales_order_line__sales_order_id", flat=True
        )
    )
    return {
        oid: {"has_batch_plan": oid in with_batch, "has_store_prep": oid in with_store}
        for oid in wanted
    }


def _get_company_for_action(request, company_id, *required_permissions):
    """Same helper body every company-scoped app defines locally (see
    apps.customers.views): nonexistent/inactive company or no active
    membership -> one indistinguishable 404; membership present but a
    permission missing -> 403 naming it. No superuser/staff bypass.
    """
    user = request.user
    company = active_companies_for_user(user).filter(pk=company_id).first()
    if company is None:
        raise exceptions.NotFound("Company not found.")
    missing = [code for code in required_permissions if not user_has_permission(user, company, code)]
    if missing:
        raise exceptions.PermissionDenied(f"The following permission(s) are required: {', '.join(missing)}.")
    return company


def _sales_order_queryset():
    return SalesOrder.objects.select_related("company", "customer").prefetch_related(
        Prefetch("lines", queryset=SalesOrderLine.objects.select_related("product__sales_uom").order_by("line_number", "id"))
    )


def _parse_date_filter(raw_value, *, field):
    try:
        return datetime.date.fromisoformat(raw_value.strip())
    except ValueError:
        raise exceptions.ValidationError({field: "Must be a date in YYYY-MM-DD format."})


@method_decorator(never_cache, name="dispatch")
class SalesOrderListCreateView(generics.ListCreateAPIView):
    """GET: `sales_orders.view`. POST: `sales_orders.view` + `sales_orders.create`.

    List filters: `?search=` (order reference, customer name or customer order reference), `?customer=<id>`,
    `?order_date_from=YYYY-MM-DD`, `?order_date_to=YYYY-MM-DD`
    (inclusive; `from` after `to` is 400). Ordering: newest first
    (`-created_at`, `-id`).
    """

    permission_classes = [IsAuthenticated]
    pagination_class = BoundedPageNumberPagination

    def get_serializer_class(self):
        return SalesOrderCreateSerializer if self.request.method == "POST" else SalesOrderListSerializer

    def get_serializer_context(self):
        context = super().get_serializer_context()
        if self.request.method != "GET":
            return context
        company = active_companies_for_user(self.request.user).filter(pk=self.kwargs["company_id"]).first()
        if company is None:
            return context
        # Page queryset ids are not known yet here; filled in list() below when paginating.
        context.setdefault("sample_qty_by_order", {})
        context.setdefault("sample_unit_by_order", {})
        return context

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        company = _get_company_for_action(request, self.kwargs["company_id"], SALES_ORDERS_VIEW)
        results = response.data.get("results") if isinstance(response.data, dict) else None
        if not results:
            return response
        order_ids = [row.get("id") for row in results if row.get("id")]
        numbers = order_batch_numbers(company, order_ids)
        section_flags = order_section_flags(order_ids)
        for row in results:
            row["batch_number"] = numbers.get(row.get("id"))
            flags = section_flags.get(row.get("id"), {})
            row["has_batch_plan"] = flags.get("has_batch_plan", False)
            row["has_store_prep"] = flags.get("has_store_prep", False)
        try:
            from apps.quality.control_sample_services import sample_qty_by_sales_order
            from apps.quality.models import ControlSample

            totals = sample_qty_by_sales_order(company=company, sales_order_ids=order_ids)
            units = {}
            for sample in (
                ControlSample.objects.filter(company=company, sales_order_id__in=order_ids)
                .exclude(status=ControlSample.Status.DISPOSED)
                .order_by("sales_order_id", "id")
            ):
                units.setdefault(sample.sales_order_id, sample.unit)
            for row in results:
                oid = row.get("id")
                total = totals.get(oid)
                row["sample_qty"] = str(total) if total is not None else None
                row["sample_unit"] = units.get(oid)
        except Exception:
            pass
        return response

    def get_queryset(self):
        company = _get_company_for_action(self.request, self.kwargs["company_id"], SALES_ORDERS_VIEW)
        params = self.request.query_params
        queryset = _sales_order_queryset().filter(company=company)

        search = params.get("search", "").strip()
        if search:
            queryset = queryset.filter(
                Q(reference__icontains=search)
                | Q(customer__name__icontains=search)
                | Q(customer_order_reference__icontains=search)
            )

        customer_param = params.get("customer")
        if customer_param is not None:
            queryset = queryset.filter(customer_id=parse_int_filter(customer_param, field="customer"))

        date_from = params.get("order_date_from")
        date_to = params.get("order_date_to")
        parsed_from = _parse_date_filter(date_from, field="order_date_from") if date_from is not None else None
        parsed_to = _parse_date_filter(date_to, field="order_date_to") if date_to is not None else None
        if parsed_from and parsed_to and parsed_from > parsed_to:
            raise exceptions.ValidationError({"order_date_from": "Must not be after order_date_to."})
        if parsed_from:
            queryset = queryset.filter(order_date__gte=parsed_from)
        if parsed_to:
            queryset = queryset.filter(order_date__lte=parsed_to)

        return queryset.order_by("-created_at", "-id")

    def create(self, request, *args, **kwargs):
        company = _get_company_for_action(request, self.kwargs["company_id"], SALES_ORDERS_VIEW, SALES_ORDERS_CREATE)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            sales_order = create_sales_order(actor=request.user, company=company, **serializer.validated_data)
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        sales_order = _sales_order_queryset().get(pk=sales_order.pk)
        return Response(SalesOrderSerializer(sales_order).data, status=201)


@method_decorator(never_cache, name="dispatch")
class SalesOrderDetailView(APIView):
    """GET: `sales_orders.view`. PATCH: `sales_orders.view` + `sales_orders.edit`.
    No DELETE and no lifecycle endpoint exists.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, company_id, sales_order_id):
        company = _get_company_for_action(request, company_id, SALES_ORDERS_VIEW)
        sales_order = get_object_or_404(_sales_order_queryset(), pk=sales_order_id, company=company)
        return Response(SalesOrderSerializer(sales_order).data)

    def delete(self, request, company_id, sales_order_id):
        """DRAFT orders with no batch plans only. `expected_version` is a required
        query parameter. Requires sales_orders.view and sales_orders.delete.
        """
        company = _get_company_for_action(request, company_id, SALES_ORDERS_VIEW, SALES_ORDERS_DELETE)
        raw = request.query_params.get("expected_version")
        try:
            expected_version = int(raw)
        except (TypeError, ValueError):
            raise exceptions.ValidationError({"expected_version": "Required integer query parameter."})
        try:
            delete_sales_order(
                actor=request.user, company=company, sales_order_id=sales_order_id, expected_version=expected_version
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        return Response(status=204)

    def patch(self, request, company_id, sales_order_id):
        company = _get_company_for_action(request, company_id, SALES_ORDERS_VIEW, SALES_ORDERS_EDIT)
        sales_order = get_object_or_404(SalesOrder, pk=sales_order_id, company=company)
        payload = request.data if isinstance(request.data, dict) else {}
        stage_keys = {"status", "workflow_stage", "expected_version"}
        if set(payload.keys()) <= stage_keys and ("status" in payload or "workflow_stage" in payload):
            try:
                expected_version = int(payload.get("expected_version"))
            except (TypeError, ValueError):
                raise exceptions.ValidationError({"expected_version": "A valid integer is required."})
            try:
                sales_order = set_workflow_stage(
                    sales_order_id=sales_order.id,
                    expected_version=expected_version,
                    stage=payload.get("workflow_stage", payload.get("status")),
                )
            except DjangoValidationError as exc:
                raise translate_django_validation_error(exc) from exc
            sales_order = _sales_order_queryset().get(pk=sales_order.pk)
            return Response(SalesOrderSerializer(sales_order).data)
        serializer = SalesOrderUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        expected_version = data.pop("expected_version")
        try:
            sales_order = update_sales_order(
                actor=request.user, sales_order_id=sales_order.id, expected_version=expected_version, data=data
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        sales_order = _sales_order_queryset().get(pk=sales_order.pk)
        return Response(SalesOrderSerializer(sales_order).data)


@method_decorator(never_cache, name="dispatch")
class SalesOrderConfirmationPreviewView(APIView):
    """GET only, `sales_orders.view` - exactly the same access as order
    detail; reveals no additional authority. Strictly read-only: no
    status/version change, no audit event, no stock/batch/production
    effect, and no confirm/cancel permission or endpoint exists. The
    response is informational and can be stale immediately; a future
    confirmation command must revalidate in a transaction against the
    reviewed `order.version`. See apps.sales_orders.preview.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, company_id, sales_order_id):
        company = _get_company_for_action(request, company_id, SALES_ORDERS_VIEW)
        order = get_object_or_404(_sales_order_queryset(), pk=sales_order_id, company=company)
        policy = SalesOrderConfirmationPolicy.objects.filter(company=company).first()
        return Response(
            build_confirmation_preview(
                order,
                actor=request.user,
                actor_has_confirm_permission=user_has_permission(request.user, company, SALES_ORDERS_CONFIRM),
                policy=policy,
            )
        )


@method_decorator(never_cache, name="dispatch")
class SalesOrderConfirmView(APIView):
    """POST `sales_orders.view` + `sales_orders.confirm` (explicit
    permission assignment only - never a role name, `is_staff` or
    `is_superuser`). Body: `{"expected_version": <reviewed version>}`.
    See apps.sales_orders.services.confirm_sales_order for the transaction,
    locking, retry and idempotency rules. No unconfirm/cancel/amend
    endpoint exists.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, company_id, sales_order_id):
        company = _get_company_for_action(request, company_id, SALES_ORDERS_VIEW, SALES_ORDERS_CONFIRM)
        get_object_or_404(SalesOrder, pk=sales_order_id, company=company)
        serializer = SalesOrderConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order = confirm_sales_order(
            actor=request.user,
            company_id=company.id,
            sales_order_id=sales_order_id,
            expected_version=serializer.validated_data["expected_version"],
        )
        return Response(SalesOrderSerializer(_sales_order_queryset().get(pk=order.pk)).data)


def _policy_representation(company, policy):
    return {
        "company_id": company.id,
        "status": policy_status(policy),
        "version": policy.version if policy is not None else 0,
        "allow_self_confirmation": policy.allow_self_confirmation if policy else None,
        "allow_zero_price_lines": policy.allow_zero_price_lines if policy else None,
        "allow_past_requested_delivery_dates": policy.allow_past_requested_delivery_dates if policy else None,
        "created_by_id": policy.created_by_id if policy else None,
        "created_at": policy.created_at if policy else None,
        "updated_by_id": policy.updated_by_id if policy else None,
        "updated_at": policy.updated_at if policy else None,
    }


@method_decorator(never_cache, name="dispatch")
class ConfirmationPolicyView(APIView):
    """Active-superuser configuration (the project's existing convention
    for configuration endpoints). GET returns the policy or a
    NOT_CONFIGURED shell with `version: 0`; PATCH creates/updates it with
    `expected_version` (0 to create). Operational users cannot read or
    change it here (they see only the effective values through the order
    review). Being able to configure the policy grants NO confirmation
    authority - that is the separate `sales_orders.confirm` company
    permission.
    """

    permission_classes = [IsActiveSuperuser]

    def get(self, request, company_id):
        company = get_object_or_404(Company, pk=company_id)
        policy = SalesOrderConfirmationPolicy.objects.filter(company=company).first()
        return Response(_policy_representation(company, policy))

    def patch(self, request, company_id):
        company = get_object_or_404(Company, pk=company_id)
        serializer = ConfirmationPolicyUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        expected_version = data.pop("expected_version")
        try:
            policy = update_confirmation_policy(
                actor=request.user, company=company, expected_version=expected_version, data=data
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        return Response(_policy_representation(company, policy))
