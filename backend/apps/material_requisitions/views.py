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
from apps.material_requisitions.models import MaterialRequisition
from apps.material_requisitions.serializers import (
    MaterialRequisitionApproveSerializer,
    MaterialRequisitionCreateSerializer,
    MaterialRequisitionListSerializer,
    MaterialRequisitionRejectSerializer,
    MaterialRequisitionReviseSerializer,
    MaterialRequisitionSerializer,
    MaterialRequisitionSubmitSerializer,
    MaterialRequisitionUpdateSerializer,
)
from apps.material_requisitions.services import (
    approve_material_requisition,
    create_material_requisition,
    reject_material_requisition,
    revise_material_requisition,
    submit_material_requisition,
    update_material_requisition,
)
from apps.permissions.services import store_user_has_permission, user_has_permission
from apps.stores.services import active_stores_for_user

MATERIAL_REQUISITIONS_VIEW = "material_requisitions.view"
MATERIAL_REQUISITIONS_CREATE = "material_requisitions.create"
MATERIAL_REQUISITIONS_EDIT = "material_requisitions.edit"
MATERIAL_REQUISITIONS_SUBMIT = "material_requisitions.submit"
MATERIAL_REQUISITIONS_APPROVE = "material_requisitions.approve"
MATERIAL_REQUISITIONS_REVISE = "material_requisitions.revise"

# Not imported from apps.store_preparation.views - every app in this
# project defines its own permission-code constants locally (see that
# module's own identically-named constant for the same reasoning).
BATCH_PLANS_VIEW = "batch_plans.view"
FORMULAS_VIEW = "formulas.view"

ALLOWED_LIST_PARAMS = {"page", "page_size", "batch_plan"}


def _get_store_for_action(request, store_id, *required_permissions):
    """Mirrors apps.store_preparation.views._get_store_for_action exactly:
    an active membership in an active store is required just to be *found*
    at all - a nonexistent store, an inactive one, or one the caller simply
    is not a member of are all folded into the same 404. Holding every
    permission in `required_permissions` is then checked separately, a 403
    (naming what is missing) if any is absent. No superuser or
    company-membership bypass exists anywhere in this path.
    """
    user = request.user
    store = active_stores_for_user(user).filter(pk=store_id).first()
    if store is None:
        raise exceptions.NotFound("Store not found.")
    missing = [code for code in required_permissions if not store_user_has_permission(user, store, code)]
    if missing:
        raise exceptions.PermissionDenied(f"The following permission(s) are required: {', '.join(missing)}.")
    return store


def _has_requisition_company_access(user, company):
    """This app requires BOTH `batch_plans.view` AND `formulas.view` in the
    source plan's own operating company - Task 13A's own explicit,
    documented working rule (see docs/erp-handoff-open-decisions.md,
    requiring client review on whether store users should receive formula
    visibility at all): a material requisition inherently exposes
    recipe-derived line quantities, so viewing/creating/editing one - and
    every list result that would otherwise reveal a company's requisitions
    exist - needs the SAME formula-recipe visibility `batch_plans.
    requirement-preview` already requires, applied consistently everywhere
    in this app, not just on the endpoint that shows the fullest detail.
    """
    return user_has_permission(user, company, BATCH_PLANS_VIEW) and user_has_permission(user, company, FORMULAS_VIEW)


def companies_with_requisition_source_access(user):
    """Mirrors apps.store_preparation.views.companies_with_batch_plan_view_
    access, extended with the formulas.view requirement above - used to
    scope every list/detail result so store access alone never reveals a
    company's requisitions, and formula-recipe data is never exposed to a
    caller lacking formulas.view even indirectly through this app.
    """
    return [company for company in active_companies_for_user(user) if _has_requisition_company_access(user, company)]


def _get_accessible_batch_plan(user, batch_plan_id):
    """Resolves a BatchPlan by id, folding "does not exist" and "caller
    lacks batch_plans.view AND/OR formulas.view in its company" into the
    same 404 - mirrors apps.store_preparation.views._get_accessible_batch_
    plan exactly, extended with the formulas.view requirement (see
    `_has_requisition_company_access`). Store access alone is never enough
    to reach a batch plan through this path.
    """
    plan = get_object_or_404(BatchPlan.objects.select_related("company"), pk=batch_plan_id)
    if not _has_requisition_company_access(user, plan.company):
        raise exceptions.NotFound("Batch plan not found.")
    return plan


def _check_requisition_company_access(user, requisition):
    """Same fold-into-404 rule as `_get_accessible_batch_plan`, applied to
    an already-resolved MaterialRequisition's own `company`."""
    if not _has_requisition_company_access(user, requisition.company):
        raise exceptions.NotFound("Material requisition not found.")


def _requisition_queryset():
    return MaterialRequisition.objects.select_related(
        "batch_plan__company", "batch_plan__number_allocation", "store", "company", "created_by", "updated_by"
    ).prefetch_related("lines__material", "lines__unit", "rounds__lines")


@method_decorator(never_cache, name="dispatch")
class MaterialRequisitionListCreateView(generics.ListCreateAPIView):
    """GET: `material_requisitions.view` in the URL's store, further scoped
    to records whose batch plan's company the caller also holds BOTH
    `batch_plans.view` AND `formulas.view` in - store access alone never
    reveals every company's requisitions or their recipe-derived lines.
    POST: `material_requisitions.view` + `material_requisitions.create` in
    the store, **and** the same dual company check on the source batch
    plan's own company. The batch plan is explicitly supplied
    (`batch_plan_id`) - nothing is auto-selected, and nothing is created by
    a GET.
    """

    permission_classes = [IsAuthenticated]
    pagination_class = BoundedPageNumberPagination

    def get_serializer_class(self):
        return MaterialRequisitionCreateSerializer if self.request.method == "POST" else MaterialRequisitionListSerializer

    def get_queryset(self):
        store = _get_store_for_action(self.request, self.kwargs["store_id"], MATERIAL_REQUISITIONS_VIEW)
        params = self.request.query_params
        unknown = sorted(set(params.keys()) - ALLOWED_LIST_PARAMS)
        if unknown:
            raise exceptions.ValidationError({param: "Unknown query parameter." for param in unknown})

        companies = companies_with_requisition_source_access(self.request.user)
        queryset = _requisition_queryset().filter(store=store, company__in=companies)

        batch_plan_param = params.get("batch_plan")
        if batch_plan_param:
            try:
                batch_plan_id = int(batch_plan_param.strip())
            except ValueError:
                raise exceptions.ValidationError({"batch_plan": "Must be a valid integer id."})
            queryset = queryset.filter(batch_plan_id=batch_plan_id)

        return queryset.order_by("-created_at", "-id")

    def create(self, request, *args, **kwargs):
        store = _get_store_for_action(
            request, self.kwargs["store_id"], MATERIAL_REQUISITIONS_VIEW, MATERIAL_REQUISITIONS_CREATE
        )
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        batch_plan_id = data.pop("batch_plan_id")

        # Company access is checked here, before the service ever runs -
        # the service has no permission awareness of its own (matching
        # every other service in this project). This also confirms the
        # source batch plan is visible to this caller at all, folding a
        # cross-company, formula-invisible, or nonexistent id into the
        # same 404.
        _get_accessible_batch_plan(request.user, batch_plan_id)

        try:
            requisition = create_material_requisition(
                actor=request.user, store=store, batch_plan_id=batch_plan_id, **data
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        requisition = _requisition_queryset().get(pk=requisition.pk)
        return Response(MaterialRequisitionSerializer(requisition).data, status=201)


@method_decorator(never_cache, name="dispatch")
class MaterialRequisitionDetailView(APIView):
    """GET: `material_requisitions.view` **and** the dual `batch_plans.
    view` + `formulas.view` check in the record's own batch-plan company.
    PATCH: `material_requisitions.view`/`material_requisitions.edit` in the
    store, plus the same company check.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, store_id, requisition_id):
        store = _get_store_for_action(request, store_id, MATERIAL_REQUISITIONS_VIEW)
        requisition = get_object_or_404(_requisition_queryset(), pk=requisition_id, store=store)
        _check_requisition_company_access(request.user, requisition)
        return Response(MaterialRequisitionSerializer(requisition).data)

    def patch(self, request, store_id, requisition_id):
        store = _get_store_for_action(
            request, store_id, MATERIAL_REQUISITIONS_VIEW, MATERIAL_REQUISITIONS_EDIT
        )
        requisition = get_object_or_404(MaterialRequisition.objects.select_related("company"), pk=requisition_id, store=store)
        _check_requisition_company_access(request.user, requisition)
        serializer = MaterialRequisitionUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        expected_version = data.pop("expected_version")
        try:
            requisition, _changed = update_material_requisition(
                actor=request.user, requisition_id=requisition.id, expected_version=expected_version, data=data
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        requisition = _requisition_queryset().get(pk=requisition.pk)
        return Response(MaterialRequisitionSerializer(requisition).data)


@method_decorator(never_cache, name="dispatch")
class MaterialRequisitionSubmitView(APIView):
    """POST `/api/v1/stores/<store_id>/material-requisitions/<id>/submit/`
    - `material_requisitions.view` + `material_requisitions.submit` in the
    store, plus the same dual `batch_plans.view` + `formulas.view` company
    check every other endpoint in this app already requires. Deliberately
    does NOT also require `material_requisitions.edit` (Task 15A's own
    explicit instruction) - submitting is a distinct action from editing,
    gated by its own permission alone. Body: `{"expected_version": n}` -
    see `apps.material_requisitions.services.submit_material_requisition`
    for the full DRAFT -> SUBMITTED transition, its eligibility checks,
    and its idempotent-repeat-at-current-version semantics.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, store_id, requisition_id):
        store = _get_store_for_action(
            request, store_id, MATERIAL_REQUISITIONS_VIEW, MATERIAL_REQUISITIONS_SUBMIT
        )
        requisition = get_object_or_404(MaterialRequisition.objects.select_related("company"), pk=requisition_id, store=store)
        _check_requisition_company_access(request.user, requisition)
        serializer = MaterialRequisitionSubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            requisition = submit_material_requisition(
                actor=request.user,
                requisition_id=requisition.id,
                expected_version=serializer.validated_data["expected_version"],
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        requisition = _requisition_queryset().get(pk=requisition.pk)
        return Response(MaterialRequisitionSerializer(requisition).data)


@method_decorator(never_cache, name="dispatch")
class MaterialRequisitionApproveView(APIView):
    """POST `/api/v1/stores/<store_id>/material-requisitions/<id>/approve/`
    - `material_requisitions.view` + `material_requisitions.approve` in
    the store, plus the same dual `batch_plans.view` + `formulas.view`
    company check every other endpoint in this app already requires.
    Deliberately does NOT also require `.edit` - approving is a distinct
    action from editing, gated by its own permission alone, exactly like
    `.submit`. See `apps.material_requisitions.services.
    approve_material_requisition` for the full eligibility/self-decision/
    idempotency rules - this view performs no business logic of its own.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, store_id, requisition_id):
        store = _get_store_for_action(
            request, store_id, MATERIAL_REQUISITIONS_VIEW, MATERIAL_REQUISITIONS_APPROVE
        )
        requisition = get_object_or_404(MaterialRequisition.objects.select_related("company"), pk=requisition_id, store=store)
        _check_requisition_company_access(request.user, requisition)
        serializer = MaterialRequisitionApproveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            requisition = approve_material_requisition(
                actor=request.user,
                requisition_id=requisition.id,
                expected_version=serializer.validated_data["expected_version"],
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        requisition = _requisition_queryset().get(pk=requisition.pk)
        return Response(MaterialRequisitionSerializer(requisition).data)


@method_decorator(never_cache, name="dispatch")
class MaterialRequisitionRejectView(APIView):
    """POST `/api/v1/stores/<store_id>/material-requisitions/<id>/reject/`
    - `material_requisitions.view` + `material_requisitions.approve` (the
    SAME permission that gates approval - Task 15C's own explicit
    instruction: "Approve and reject require view + approve") in the
    store, plus the same dual company check. Body requires a non-blank
    `rejection_reason`. See `apps.material_requisitions.services.
    reject_material_requisition` for the full eligibility/self-decision/
    idempotency rules.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, store_id, requisition_id):
        store = _get_store_for_action(
            request, store_id, MATERIAL_REQUISITIONS_VIEW, MATERIAL_REQUISITIONS_APPROVE
        )
        requisition = get_object_or_404(MaterialRequisition.objects.select_related("company"), pk=requisition_id, store=store)
        _check_requisition_company_access(request.user, requisition)
        serializer = MaterialRequisitionRejectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            requisition = reject_material_requisition(
                actor=request.user,
                requisition_id=requisition.id,
                expected_version=serializer.validated_data["expected_version"],
                rejection_reason=serializer.validated_data["rejection_reason"],
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        requisition = _requisition_queryset().get(pk=requisition.pk)
        return Response(MaterialRequisitionSerializer(requisition).data)


@method_decorator(never_cache, name="dispatch")
class MaterialRequisitionReviseView(APIView):
    """POST `/api/v1/stores/<store_id>/material-requisitions/<id>/revise/`
    - `material_requisitions.view` + `material_requisitions.edit` +
    `material_requisitions.revise` in the store (Task 15C's own explicit
    instruction: revising reopens editable data, so it additionally
    requires `.edit`, unlike approve/reject/submit which each stand
    alone), plus the same dual company check. See `apps.material_
    requisitions.services.revise_material_requisition` for the full
    REJECTED -> DRAFT / refresh-from-source rules.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, store_id, requisition_id):
        store = _get_store_for_action(
            request,
            store_id,
            MATERIAL_REQUISITIONS_VIEW,
            MATERIAL_REQUISITIONS_EDIT,
            MATERIAL_REQUISITIONS_REVISE,
        )
        requisition = get_object_or_404(MaterialRequisition.objects.select_related("company"), pk=requisition_id, store=store)
        _check_requisition_company_access(request.user, requisition)
        serializer = MaterialRequisitionReviseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            requisition, _refreshed = revise_material_requisition(
                actor=request.user,
                requisition_id=requisition.id,
                expected_version=data["expected_version"],
                refresh_from_source=data["refresh_from_source"],
                expected_batch_plan_version=data["expected_batch_plan_version"],
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        requisition = _requisition_queryset().get(pk=requisition.pk)
        return Response(MaterialRequisitionSerializer(requisition).data)


STORE_PREPARATION_VIEW = "store_preparation.view"


@method_decorator(never_cache, name="dispatch")
class BatchPlanRequisitionStatusView(APIView):
    """Status only, for the order's store block. Returns the requisition's
    workflow status for one batch plan in ONE store - nothing else: no lines,
    no quantities, no material, no formula, no approver, no rounds.

    Access: an active store membership with `store_preparation.view` in that
    store (store users already hold it for the order's preparation block),
    plus `batch_plans.view` in the plan's company. `formulas.view` is NOT
    required, because nothing recipe-derived is returned.

    States (Task 15B.2 disclosure rule):
    - `present`: a real requisition in THIS active store; its workflow status.
    - `unavailable`: returned for EVERY other case - no requisition, a
      requisition in another store, or one held in a deactivated store. The
      body is identical in all of them, so the caller cannot tell whether a
      record exists outside their authorized store.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, store_id, plan_id):
        store = _get_store_for_action(request, store_id, STORE_PREPARATION_VIEW)
        plan = get_object_or_404(BatchPlan.objects.select_related("company"), pk=plan_id)
        if not user_has_permission(request.user, plan.company, BATCH_PLANS_VIEW):
            raise exceptions.NotFound("Batch plan not found.")

        # Absent, held in another store and held in a deactivated store all get
        # the same neutral body. Only a real requisition in this active store
        # returns its status.
        requisition = MaterialRequisition.objects.filter(batch_plan=plan).only("id", "store_id", "status").first()
        if requisition is None or requisition.store_id != store.id:
            body = {"state": "unavailable"}
        else:
            body = {
                "state": "present",
                "status": requisition.status,
                "status_label": requisition.get_status_display(),
            }
        return Response({"batch_plan_id": plan.id, **body})
