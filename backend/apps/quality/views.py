from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import models
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from rest_framework import exceptions, generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.errors import translate_django_validation_error
from apps.common.pagination import BoundedPageNumberPagination
from apps.common.permissions import IsActiveSuperuser
from apps.common.validation import parse_int_filter
from apps.companies.services import active_companies_for_user
from apps.permissions.services import store_user_has_permission
from apps.quality.models import IncomingInspection, MaterialSpecification, MaterialSpecificationVersion
from apps.quality.serializers import (
    EligibleReceiptLineSerializer,
    IncomingInspectionCancelSerializer,
    IncomingInspectionCreateSerializer,
    IncomingInspectionSerializer,
    IncomingInspectionUpdateSerializer,
    IncomingInspectionVersionSerializer,
    MaterialSpecificationCreateSerializer,
    MaterialSpecificationSerializer,
    MaterialSpecificationUpdateSerializer,
    MaterialSpecificationVersionSerializer,
    SpecificationVersionCreateSerializer,
    SpecificationVersionUpdateSerializer,
)
from apps.quality.services import (
    cancel_incoming_inspection,
    create_incoming_inspection,
    create_material_specification,
    create_specification_version,
    eligible_receipt_lines_for_inspection,
    submit_incoming_inspection,
    update_incoming_inspection,
    update_material_specification,
    update_specification_version,
)
from apps.receiving.models import GoodsReceiptLine
from apps.stores.services import active_stores_for_user

INCOMING_QC_VIEW = "incoming_qc.view"
INCOMING_QC_CREATE = "incoming_qc.create"
INCOMING_QC_EDIT = "incoming_qc.edit"
INCOMING_QC_SUBMIT = "incoming_qc.submit"
INCOMING_QC_CANCEL = "incoming_qc.cancel"


def _get_store_for_action(request, store_id, *required_permissions):
    """Mirrors apps.receiving.views._get_store_for_action exactly: an
    active membership in an active store is required just to be *found*
    at all - a nonexistent store, an inactive one, or one the caller
    simply is not a member of are all folded into the same 404. Holding
    every permission in `required_permissions` is then checked
    separately, a 403 (naming what is missing) if any is absent. No
    superuser bypass exists anywhere in this path.
    """
    user = request.user
    store = active_stores_for_user(user).filter(pk=store_id).first()
    if store is None:
        raise exceptions.NotFound("Store not found.")
    missing = [code for code in required_permissions if not store_user_has_permission(user, store, code)]
    if missing:
        raise exceptions.PermissionDenied(f"The following permission(s) are required: {', '.join(missing)}.")
    return store


def _check_company_membership(user, company):
    """Bare active-membership check - deliberately NOT tied to
    `purchase_orders.view` or any other purchasing permission, unlike
    apps.receiving.views' equivalent company-axis check. A QC user must
    never need purchasing-price visibility just to be found here (the
    brief for this task is explicit: "do not require QC users to hold
    purchasing-price access"). Folds "not a member at all" into the same
    404 as "does not exist" - the same convention every other app in
    this project uses, so a caller can never learn a receipt/inspection
    exists in a company they don't belong to.
    """
    if not active_companies_for_user(user).filter(pk=company.id).exists():
        raise exceptions.NotFound("Not found.")


def _get_eligible_receipt_line(user, store, receipt_line_id):
    """Resolves a GoodsReceiptLine by id, requiring it belong to the
    URL's own store (folded into the same 404 as "does not exist" - a
    receipt line from a different store is indistinguishable here from a
    nonexistent one) and that the caller hold active membership in the
    line's own purchasing company.
    """
    receipt_line = get_object_or_404(
        GoodsReceiptLine.objects.select_related("goods_receipt", "goods_receipt__company", "material", "unit"),
        pk=receipt_line_id,
        goods_receipt__store_id=store.id,
    )
    _check_company_membership(user, receipt_line.goods_receipt.company)
    return receipt_line


def _inspection_queryset():
    return IncomingInspection.objects.select_related(
        "receipt_line",
        "receipt_line__goods_receipt",
        "store",
        "company",
        "material",
        "unit",
        "created_by",
        "cancelled_by",
    ).prefetch_related("observations")


def _get_inspection(request, store, inspection_id):
    inspection = get_object_or_404(_inspection_queryset(), pk=inspection_id, store=store)
    _check_company_membership(request.user, inspection.company)
    return inspection


@method_decorator(never_cache, name="dispatch")
class IncomingInspectionListCreateView(generics.ListCreateAPIView):
    """GET: `incoming_qc.view` in the URL's store, further scoped to
    inspections whose company the caller also holds active membership in
    - store access alone never reveals every company's inspections (see
    docs/incoming-qc-proposal.md). POST: `incoming_qc.view` and
    `incoming_qc.create` in the store, **and** active membership in the
    source receipt line's own company.
    """

    permission_classes = [IsAuthenticated]
    pagination_class = BoundedPageNumberPagination

    def get_serializer_class(self):
        return (
            IncomingInspectionCreateSerializer
            if self.request.method == "POST"
            else IncomingInspectionSerializer
        )

    def get_queryset(self):
        store = _get_store_for_action(self.request, self.kwargs["store_id"], INCOMING_QC_VIEW)
        companies = active_companies_for_user(self.request.user)
        queryset = _inspection_queryset().filter(store=store, company__in=companies)

        status_param = self.request.query_params.get("status", "").strip()
        if status_param:
            if status_param not in IncomingInspection.Status.values:
                raise exceptions.ValidationError(
                    {"status": f"Must be one of {list(IncomingInspection.Status.values)}."}
                )
            queryset = queryset.filter(status=status_param)

        receipt_param = self.request.query_params.get("receipt", "").strip()
        if receipt_param:
            queryset = queryset.filter(
                receipt_line__goods_receipt_id=parse_int_filter(receipt_param, field="receipt")
            )

        material_param = self.request.query_params.get("material", "").strip()
        if material_param:
            queryset = queryset.filter(material_id=parse_int_filter(material_param, field="material"))

        return queryset.order_by("-created_at", "-id")

    def create(self, request, *args, **kwargs):
        store = _get_store_for_action(request, self.kwargs["store_id"], INCOMING_QC_VIEW, INCOMING_QC_CREATE)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Company access is checked here, before the service ever runs -
        # the service itself has no permission awareness (matching every
        # other service in this project). This also confirms the source
        # receipt line is visible to this caller at all, folding a
        # cross-store/cross-company/nonexistent id into the same 404.
        receipt_line = _get_eligible_receipt_line(request.user, store, data["receipt_line_id"])

        try:
            inspection = create_incoming_inspection(
                actor=request.user,
                receipt_line_id=receipt_line.id,
                inspection_date=data.get("inspection_date"),
                notes=data.get("notes", ""),
                observations=data.get("observations", []),
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        inspection = _inspection_queryset().get(pk=inspection.pk)
        return Response(IncomingInspectionSerializer(inspection).data, status=201)


@method_decorator(never_cache, name="dispatch")
class IncomingInspectionDetailView(APIView):
    """GET: `incoming_qc.view` **and** active membership in the
    inspection's own company. PATCH: `incoming_qc.view`/`incoming_qc.
    edit` in the store, plus the same company check, `DRAFT` only - see
    apps.quality.services.update_incoming_inspection.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, store_id, inspection_id):
        store = _get_store_for_action(request, store_id, INCOMING_QC_VIEW)
        inspection = _get_inspection(request, store, inspection_id)
        return Response(IncomingInspectionSerializer(inspection).data)

    def patch(self, request, store_id, inspection_id):
        store = _get_store_for_action(request, store_id, INCOMING_QC_VIEW, INCOMING_QC_EDIT)
        inspection = _get_inspection(request, store, inspection_id)
        serializer = IncomingInspectionUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        expected_version = data.pop("expected_version")
        try:
            inspection = update_incoming_inspection(
                actor=request.user,
                inspection_id=inspection.id,
                expected_version=expected_version,
                data=data,
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        inspection = _inspection_queryset().get(pk=inspection.pk)
        return Response(IncomingInspectionSerializer(inspection).data)


@method_decorator(never_cache, name="dispatch")
class IncomingInspectionSubmitView(APIView):
    """`incoming_qc.view` and `incoming_qc.submit` in the store, plus
    active membership in the inspection's own company. `DRAFT` only -
    see apps.quality.services.submit_incoming_inspection. Dedicated
    permission, deliberately separate from `incoming_qc.edit` - see
    docs/incoming-qc-review-proposal.md §2.2's open question, resolved
    for this task by adding the dedicated code rather than reusing edit.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, store_id, inspection_id):
        store = _get_store_for_action(request, store_id, INCOMING_QC_VIEW, INCOMING_QC_SUBMIT)
        inspection = _get_inspection(request, store, inspection_id)
        serializer = IncomingInspectionVersionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            inspection = submit_incoming_inspection(
                actor=request.user,
                inspection_id=inspection.id,
                expected_version=serializer.validated_data["expected_version"],
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        inspection = _inspection_queryset().get(pk=inspection.pk)
        return Response(IncomingInspectionSerializer(inspection).data)


@method_decorator(never_cache, name="dispatch")
class IncomingInspectionCancelView(APIView):
    """`incoming_qc.view` and `incoming_qc.cancel` in the store, plus
    active membership in the inspection's own company. `DRAFT` only -
    see apps.quality.services.cancel_incoming_inspection.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, store_id, inspection_id):
        store = _get_store_for_action(request, store_id, INCOMING_QC_VIEW, INCOMING_QC_CANCEL)
        inspection = _get_inspection(request, store, inspection_id)
        serializer = IncomingInspectionCancelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            inspection = cancel_incoming_inspection(
                actor=request.user,
                inspection_id=inspection.id,
                expected_version=serializer.validated_data["expected_version"],
                reason=serializer.validated_data["cancellation_reason"],
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        inspection = _inspection_queryset().get(pk=inspection.pk)
        return Response(IncomingInspectionSerializer(inspection).data)


@method_decorator(never_cache, name="dispatch")
class EligibleReceiptLinesView(generics.ListAPIView):
    """GET .../incoming-inspections/eligible-receipt-lines/ - a minimal
    lookup for creating a new inspection: `POSTED` receipt lines from
    companies the caller has active membership in, gated by the exact
    same store `incoming_qc.view` requirement as every other endpoint
    here. Grants no broader receiving/purchasing access of its own - see
    apps.quality.services.eligible_receipt_lines_for_inspection. Never
    exposes supplier price/line amount/currency.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = EligibleReceiptLineSerializer
    pagination_class = BoundedPageNumberPagination

    def get_queryset(self):
        store = _get_store_for_action(self.request, self.kwargs["store_id"], INCOMING_QC_VIEW)
        return eligible_receipt_lines_for_inspection(self.request.user, store)


# ---------------------------------------------------------------------------
# Material specifications (Task 09B-3B) - global, superuser-only, no
# store/company scoping at all (see MaterialSpecification's own
# docstring). Deliberately not mounted under /stores/ - see
# apps.quality.specification_urls, mounted directly at /api/v1/ in
# config/urls.py, the same shape apps.catalog uses for its own
# shared-master resources.
# ---------------------------------------------------------------------------


def _specification_queryset():
    return MaterialSpecification.objects.select_related("material", "created_by").prefetch_related(
        "versions__tests", "versions__created_by"
    )


def _version_queryset():
    return MaterialSpecificationVersion.objects.select_related("specification", "created_by").prefetch_related(
        "tests"
    )


@method_decorator(never_cache, name="dispatch")
class MaterialSpecificationListCreateView(generics.ListCreateAPIView):
    """Active-superuser-only, both directions - the same "no read
    exception, unlike the shared catalog" shape `apps.suppliers.
    SupplierListCreateView` already uses (see that view's own docstring
    and docs/backend-decisions.md, Task 08A/09B-3B).
    """

    permission_classes = [IsActiveSuperuser]
    pagination_class = BoundedPageNumberPagination

    def get_serializer_class(self):
        return (
            MaterialSpecificationCreateSerializer
            if self.request.method == "POST"
            else MaterialSpecificationSerializer
        )

    def get_queryset(self):
        queryset = _specification_queryset()

        search = self.request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(
                models.Q(code__icontains=search) | models.Q(name__icontains=search)
            )

        material_param = self.request.query_params.get("material", "").strip()
        if material_param:
            queryset = queryset.filter(material_id=parse_int_filter(material_param, field="material"))

        return queryset.order_by("code", "id")

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            specification = create_material_specification(actor=request.user, **serializer.validated_data)
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        specification = _specification_queryset().get(pk=specification.pk)
        return Response(MaterialSpecificationSerializer(specification).data, status=201)


@method_decorator(never_cache, name="dispatch")
class MaterialSpecificationDetailView(APIView):
    permission_classes = [IsActiveSuperuser]

    def get(self, request, specification_id):
        specification = get_object_or_404(_specification_queryset(), pk=specification_id)
        return Response(MaterialSpecificationSerializer(specification).data)

    def patch(self, request, specification_id):
        get_object_or_404(MaterialSpecification, pk=specification_id)
        serializer = MaterialSpecificationUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        expected_version = data.pop("expected_version")
        try:
            specification = update_material_specification(
                actor=request.user,
                specification_id=specification_id,
                expected_version=expected_version,
                data=data,
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        specification = _specification_queryset().get(pk=specification.pk)
        return Response(MaterialSpecificationSerializer(specification).data)


@method_decorator(never_cache, name="dispatch")
class SpecificationVersionListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsActiveSuperuser]
    pagination_class = BoundedPageNumberPagination

    def get_serializer_class(self):
        return (
            SpecificationVersionCreateSerializer
            if self.request.method == "POST"
            else MaterialSpecificationVersionSerializer
        )

    def get_queryset(self):
        get_object_or_404(MaterialSpecification, pk=self.kwargs["specification_id"])
        return _version_queryset().filter(specification_id=self.kwargs["specification_id"]).order_by(
            "revision_number"
        )

    def create(self, request, *args, **kwargs):
        get_object_or_404(MaterialSpecification, pk=self.kwargs["specification_id"])
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            version = create_specification_version(
                actor=request.user, specification_id=self.kwargs["specification_id"], **serializer.validated_data
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        version = _version_queryset().get(pk=version.pk)
        return Response(MaterialSpecificationVersionSerializer(version).data, status=201)


@method_decorator(never_cache, name="dispatch")
class SpecificationVersionDetailView(APIView):
    permission_classes = [IsActiveSuperuser]

    def get(self, request, specification_id, version_id):
        version = get_object_or_404(_version_queryset(), pk=version_id, specification_id=specification_id)
        return Response(MaterialSpecificationVersionSerializer(version).data)

    def patch(self, request, specification_id, version_id):
        version = get_object_or_404(
            MaterialSpecificationVersion, pk=version_id, specification_id=specification_id
        )
        serializer = SpecificationVersionUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        expected_version = data.pop("expected_version")
        try:
            version = update_specification_version(
                actor=request.user, version_id=version.id, expected_version=expected_version, data=data
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        version = _version_queryset().get(pk=version.pk)
        return Response(MaterialSpecificationVersionSerializer(version).data)
