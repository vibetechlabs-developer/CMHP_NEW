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

from apps.batch_plans.models import BatchPlan
from apps.catalog.models import UnitOfMeasure
from apps.formulas.models import FormulaRevision
from apps.batch_plans.numbering import allocate_batch_number
from apps.batch_plans.requirement_preview import (
    build_batch_plan_requirement_preview,
    load_consistent_batch_plan,
)
from apps.batch_plans.serializers import (
    BatchPlanAllocateNumberSerializer,
    BatchPlanCreateSerializer,
    BatchPlanDetailSerializer,
    BatchPlanListSerializer,
    BatchPlanUpdateSerializer,
)
from apps.batch_plans.services import (
    assess_source_drift,
    create_batch_plan,
    update_batch_plan,
)
from apps.common.errors import translate_django_validation_error
from apps.common.pagination import BoundedPageNumberPagination
from apps.companies.services import active_companies_for_user
from apps.permissions.services import user_has_permission

BATCH_PLANS_VIEW = "batch_plans.view"
BATCH_PLANS_CREATE = "batch_plans.create"
BATCH_PLANS_EDIT = "batch_plans.edit"
BATCH_PLANS_ALLOCATE_NUMBER = "batch_plans.allocate_number"
BATCH_PLANS_PRINTING_EDIT = "batch_plans.printing_edit"
PRINTING_FIELDS = {"mrp_for_printing", "printing_status_note"}
SALES_ORDERS_VIEW = "sales_orders.view"
FORMULAS_VIEW = "formulas.view"

ALLOWED_LIST_PARAMS = {
    "page",
    "page_size",
    "order",
    "planned_manufacturing_date",
    "planned_date",
    "search",
}


def _get_company_for_action(request, company_id, *required_permissions):
    """Unknown/inactive company or no active membership -> 404;
    membership present but permission missing -> 403 naming it.
    No superuser/staff bypass.
    """
    user = request.user
    company = active_companies_for_user(user).filter(pk=company_id).first()
    if company is None:
        raise exceptions.NotFound("Company not found.")
    missing = [code for code in required_permissions if not user_has_permission(user, company, code)]
    if missing:
        raise exceptions.PermissionDenied(f"The following permission(s) are required: {', '.join(missing)}.")
    return company


def _batch_plan_queryset():
    return BatchPlan.objects.select_related(
        "company",
        "sales_order_line__sales_order",
        "sales_order_line__product__sales_uom",
        "formula_revision__formula__product",
        "formula_revision__output_uom",
        "packing_content_uom",
        "number_allocation",
    )


def _parse_date_filter(raw_value, *, field):
    try:
        return datetime.date.fromisoformat(raw_value.strip())
    except ValueError:
        raise exceptions.ValidationError({field: "Must be a date in YYYY-MM-DD format."})


def _require_printing_edit(request, company, data):
    """Printing fields are a separate access boundary: any printing key in the
    request requires batch_plans.printing_edit in this company.
    """
    if not PRINTING_FIELDS & set(data.keys()):
        return
    if not user_has_permission(request.user, company, BATCH_PLANS_PRINTING_EDIT):
        raise exceptions.PermissionDenied(
            f"The following permission(s) are required: {BATCH_PLANS_PRINTING_EDIT}."
        )


@method_decorator(never_cache, name="dispatch")
class BatchPlanListCreateView(generics.ListCreateAPIView):
    """GET: `batch_plans.view`.
    POST: `batch_plans.view` + `batch_plans.create` + `sales_orders.view`.

    List query params:
      `?order=<sales_order_id>`
      `?planned_manufacturing_date=YYYY-MM-DD` or `?planned_date=YYYY-MM-DD`
      `?search=<term>` (matches order reference, product code/name, formula code, notes)
    """

    permission_classes = [IsAuthenticated]
    pagination_class = BoundedPageNumberPagination

    def get_serializer_class(self):
        if self.request.method == "POST":
            return BatchPlanCreateSerializer
        return BatchPlanListSerializer

    def get_queryset(self):
        company = _get_company_for_action(self.request, self.kwargs["company_id"], BATCH_PLANS_VIEW)
        params = self.request.query_params
        unknown = sorted(set(params.keys()) - ALLOWED_LIST_PARAMS)
        if unknown:
            raise exceptions.ValidationError({param: "Unknown query parameter." for param in unknown})

        queryset = _batch_plan_queryset().filter(company=company)

        order_param = params.get("order")
        if order_param:
            try:
                order_id = int(order_param.strip())
                queryset = queryset.filter(sales_order_line__sales_order_id=order_id)
            except ValueError:
                raise exceptions.ValidationError({"order": "Must be a valid integer order id."})

        date_param = params.get("planned_manufacturing_date") or params.get("planned_date")
        if date_param:
            field_name = "planned_manufacturing_date" if "planned_manufacturing_date" in params else "planned_date"
            parsed_date = _parse_date_filter(date_param, field=field_name)
            queryset = queryset.filter(planned_manufacturing_date=parsed_date)

        search = params.get("search")
        if search:
            s = search.strip()
            queryset = queryset.filter(
                Q(source_order_reference_snapshot__icontains=s)
                | Q(product_code_snapshot__icontains=s)
                | Q(product_name_snapshot__icontains=s)
                | Q(formula_code_snapshot__icontains=s)
                | Q(notes__icontains=s)
            )

        return queryset.order_by("-created_at", "-id")

    def create(self, request, *args, **kwargs):
        # `formulas.view` is intentionally NOT required here: the create response
        # carries revision identity and quantities only (no recipe lines), and the
        # service already requires an APPROVED revision of this company. The
        # requirement preview (recipe-derived) keeps its formulas.view gate.
        company = _get_company_for_action(
            request,
            self.kwargs["company_id"],
            BATCH_PLANS_VIEW,
            BATCH_PLANS_CREATE,
            SALES_ORDERS_VIEW,
        )
        _require_printing_edit(request, company, request.data)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            plan = create_batch_plan(actor=request.user, company=company, **serializer.validated_data)
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc

        plan = _batch_plan_queryset().get(pk=plan.pk)
        return Response(BatchPlanDetailSerializer(plan).data, status=201)


@method_decorator(never_cache, name="dispatch")
class BatchPlanDetailView(APIView):
    """GET: `batch_plans.view`.
    PATCH: `batch_plans.view` + `batch_plans.edit`.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, company_id, plan_id):
        company = _get_company_for_action(request, company_id, BATCH_PLANS_VIEW)
        plan = get_object_or_404(_batch_plan_queryset(), pk=plan_id, company=company)
        return Response(BatchPlanDetailSerializer(plan).data)

    def patch(self, request, company_id, plan_id):
        company = _get_company_for_action(request, company_id, BATCH_PLANS_VIEW, BATCH_PLANS_EDIT)
        plan = get_object_or_404(_batch_plan_queryset(), pk=plan_id, company=company)
        _require_printing_edit(request, company, request.data)
        serializer = BatchPlanUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = dict(serializer.validated_data)
        expected_version = data.pop("expected_version")
        try:
            plan, _ = update_batch_plan(
                actor=request.user,
                plan_id=plan.id,
                expected_version=expected_version,
                data=data,
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc

        plan = _batch_plan_queryset().get(pk=plan.pk)
        return Response(BatchPlanDetailSerializer(plan).data)


@method_decorator(never_cache, name="dispatch")
class BatchPlanRequirementPreviewView(APIView):
    """GET: `batch_plans.view` + `formulas.view`.
    Read-only planning requirement calculation based on the saved plan target
    and pinned approved formula revision.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, company_id, plan_id):
        company = _get_company_for_action(request, company_id, BATCH_PLANS_VIEW, FORMULAS_VIEW)
        # Verify plan exists and belongs to company
        plan_stub = get_object_or_404(BatchPlan, pk=plan_id, company=company)
        plan, lines = load_consistent_batch_plan(plan_stub.id)
        preview = build_batch_plan_requirement_preview(plan, lines)
        return Response(preview)


@method_decorator(never_cache, name="dispatch")
class BatchPlanAllocateNumberView(APIView):
    """POST `{"expected_version": n}`. Requires `batch_plans.view` +
    `batch_plans.allocate_number` (company scoped, no superuser/role-name
    bypass) - deliberately NOT `formulas.approve`; allocation is a
    separate action from formula approval. Authority is re-checked under
    the plan's row lock in `apps.batch_plans.numbering.
    allocate_batch_number`. Allocation authorizes no production, reserves
    no stock, issues no material and never changes the source order's
    confirmation state or the plan's own DRAFT status.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, company_id, plan_id):
        company = _get_company_for_action(request, company_id, BATCH_PLANS_VIEW, BATCH_PLANS_ALLOCATE_NUMBER)
        get_object_or_404(BatchPlan, pk=plan_id, company=company)
        serializer = BatchPlanAllocateNumberSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            allocate_batch_number(
                actor=request.user,
                company_id=company.id,
                plan_id=plan_id,
                expected_version=serializer.validated_data["expected_version"],
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        plan = _batch_plan_queryset().get(pk=plan_id)
        return Response(BatchPlanDetailSerializer(plan).data)


@method_decorator(never_cache, name="dispatch")
class BatchPlanningUnitsView(APIView):
    """Read-only list of ACTIVE units for batch planning pickers (packing
    content unit, batch size unit). Gated by `batch_plans.view` in the
    company - deliberately NOT by `shared_catalog.view` or any catalog
    administration permission. Returns only identifying fields.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        _get_company_for_action(request, company_id, BATCH_PLANS_VIEW)
        units = UnitOfMeasure.objects.filter(is_active=True).order_by("code")
        return Response(
            {
                "results": [
                    {"id": unit.id, "code": unit.code, "name": unit.name, "dimension": unit.dimension}
                    for unit in units
                ]
            }
        )


@method_decorator(never_cache, name="dispatch")
class BatchPlanningEligibleRevisionsView(APIView):
    """APPROVED formula revisions of one product in this company, for choosing
    a batch plan's source. Returns identifying and quantity fields only - never
    the formula's material lines or any draft revision. Gated by
    `batch_plans.view` in the company, so planners need no `formulas.view`.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        company = _get_company_for_action(request, company_id, BATCH_PLANS_VIEW)
        raw = request.query_params.get("product")
        try:
            product_id = int(raw)
        except (TypeError, ValueError):
            raise exceptions.ValidationError({"product": "Required integer query parameter."})
        revisions = (
            FormulaRevision.objects.select_related("formula", "output_uom")
            .filter(
                formula__company=company,
                formula__product_id=product_id,
                status=FormulaRevision.Status.APPROVED,
            )
            .order_by("formula__code", "revision_number")
        )
        return Response(
            {
                "results": [
                    {
                        "id": revision.id,
                        "formula_id": revision.formula_id,
                        "formula_code": revision.formula.code,
                        "formula_name": revision.formula.name,
                        "revision_number": revision.revision_number,
                        "base_output_quantity": str(revision.base_output_quantity),
                        "output_uom_id": revision.output_uom_id,
                        "output_uom_code": revision.output_uom.code,
                    }
                    for revision in revisions
                ]
            }
        )
