from django.core.exceptions import ValidationError as DjangoValidationError
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from rest_framework import exceptions, generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.errors import translate_django_validation_error
from apps.common.pagination import BoundedPageNumberPagination
from apps.companies.services import active_companies_for_user
from apps.permissions.services import user_has_permission
from apps.quality.batch_quality_serializers import (
    BatchQualityCaseCreateSerializer,
    BatchQualityCaseDetailSerializer,
    BatchQualityCaseListSerializer,
    BatchQualityCoaCreateSerializer,
    BatchQualityCoaDecisionCreateSerializer,
    BatchQualityDecisionCreateSerializer,
    BatchQualityPackagingCompleteSerializer,
)
from apps.quality.batch_quality_services import (
    mark_packaging_complete,
    open_batch_quality_case,
    open_coa_case,
    record_coa_decision,
    record_packaging_decision,
    record_qa_release,
    record_qc_decision,
)
from apps.quality.models import BatchQualityCase

BATCH_QUALITY_VIEW = "batch_quality.view"
BATCH_QUALITY_QC_DECIDE = "batch_quality.qc_decide"
BATCH_QUALITY_QA_RELEASE = "batch_quality.qa_release"
BATCH_QUALITY_COA_RECORD = "batch_quality.coa_record"
BATCH_QUALITY_COA_GENERATE = "batch_quality.coa_generate"
BATCH_QUALITY_COA_APPROVE = "batch_quality.coa_approve"
PRODUCTION_PACKAGING_COMPLETE = "production.packaging_complete"
BATCH_QUALITY_PACKAGING_QA = "batch_quality.packaging_qa"


def _get_company_for_action(request, company_id, *required_permissions):
    company = active_companies_for_user(request.user).filter(pk=company_id).first()
    if company is None:
        raise exceptions.NotFound("Company not found.")
    missing = [code for code in required_permissions if not user_has_permission(request.user, company, code)]
    if missing:
        raise exceptions.PermissionDenied(f"The following permission(s) are required: {', '.join(missing)}.")
    return company


def _get_company_for_action_any(request, company_id, *permitted_permissions):
    company = active_companies_for_user(request.user).filter(pk=company_id).first()
    if company is None:
        raise exceptions.NotFound("Company not found.")
    if not any(user_has_permission(request.user, company, code) for code in permitted_permissions):
        raise exceptions.PermissionDenied(
            f"One of the following permission(s) is required: {', '.join(permitted_permissions)}."
        )
    return company


def _get_case_for_company(company, case_id):
    case = (
        BatchQualityCase.objects.prefetch_related("decisions__decided_by")
        .filter(pk=case_id, company=company)
        .first()
    )
    if case is None:
        raise exceptions.NotFound("Batch quality case not found.")
    return case


@method_decorator(never_cache, name="dispatch")
class BatchQualityCaseListCreateView(APIView):
    permission_classes = [IsAuthenticated]
    pagination_class = BoundedPageNumberPagination

    def get(self, request, company_id):
        company = _get_company_for_action(request, company_id, BATCH_QUALITY_VIEW)
        qs = (
            BatchQualityCase.objects.filter(company=company)
            .select_related("batch_plan", "created_by")
            .order_by("-created_at", "-id")
        )

        stage_status = request.query_params.get("stage_status", "").strip()
        if stage_status and stage_status != "ALL":
            qs = qs.filter(stage_status=stage_status)

        batch_plan_param = request.query_params.get("batch_plan") or request.query_params.get("batch_plan_id")
        if batch_plan_param:
            try:
                qs = qs.filter(batch_plan_id=int(batch_plan_param))
            except (ValueError, TypeError):
                pass

        search = request.query_params.get("search", "").strip()
        if search:
            from django.db.models import Q
            qs = qs.filter(
                Q(batch_number_snapshot__icontains=search)
                | Q(product_name_snapshot__icontains=search)
                | Q(product_code_snapshot__icontains=search)
            )

        paginator = self.pagination_class()
        page = paginator.paginate_queryset(qs, request, view=self)
        if page is not None:
            serializer = BatchQualityCaseListSerializer(page, many=True)
            return paginator.get_paginated_response(serializer.data)

        serializer = BatchQualityCaseListSerializer(qs, many=True)
        return Response(serializer.data)

    def post(self, request, company_id):
        company = _get_company_for_action(request, company_id, BATCH_QUALITY_QC_DECIDE)
        serializer = BatchQualityCaseCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            case = open_batch_quality_case(
                user=request.user,
                company=company,
                batch_plan_id=serializer.validated_data["batch_plan_id"],
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc)

        return Response(BatchQualityCaseDetailSerializer(case).data, status=status.HTTP_201_CREATED)


@method_decorator(never_cache, name="dispatch")
class BatchQualityCaseDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id, case_id):
        company = _get_company_for_action(request, company_id, BATCH_QUALITY_VIEW)
        case = _get_case_for_company(company, case_id)
        return Response(BatchQualityCaseDetailSerializer(case).data)


@method_decorator(never_cache, name="dispatch")
class BatchQualityQcDecisionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, company_id, case_id):
        company = _get_company_for_action(request, company_id, BATCH_QUALITY_QC_DECIDE)
        case = _get_case_for_company(company, case_id)
        serializer = BatchQualityDecisionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            updated_case, _ = record_qc_decision(
                user=request.user,
                quality_case_id=case.id,
                expected_version=serializer.validated_data["expected_version"],
                outcome=serializer.validated_data["outcome"],
                remarks=serializer.validated_data.get("remarks", ""),
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc)

        refreshed = _get_case_for_company(company, case.id)
        return Response(BatchQualityCaseDetailSerializer(refreshed).data)


@method_decorator(never_cache, name="dispatch")
class BatchQualityQaReleaseView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, company_id, case_id):
        company = _get_company_for_action(request, company_id, BATCH_QUALITY_QA_RELEASE)
        case = _get_case_for_company(company, case_id)
        serializer = BatchQualityDecisionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            updated_case, _ = record_qa_release(
                user=request.user,
                quality_case_id=case.id,
                expected_version=serializer.validated_data["expected_version"],
                outcome=serializer.validated_data["outcome"],
                remarks=serializer.validated_data.get("remarks", ""),
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc)

        refreshed = _get_case_for_company(company, case.id)
        return Response(BatchQualityCaseDetailSerializer(refreshed).data)


@method_decorator(never_cache, name="dispatch")
class BatchQualityCoaView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, company_id, case_id):
        # Accept new dedicated permission; fall back to legacy coa_record for existing role assignments
        company = _get_company_for_action_any(
            request, company_id, BATCH_QUALITY_COA_GENERATE, BATCH_QUALITY_COA_RECORD
        )
        case = _get_case_for_company(company, case_id)
        serializer = BatchQualityCoaCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            updated_case, _ = open_coa_case(
                user=request.user,
                quality_case_id=case.id,
                expected_version=serializer.validated_data["expected_version"],
                remarks=serializer.validated_data.get("remarks", ""),
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc)

        refreshed = _get_case_for_company(company, case.id)
        return Response(BatchQualityCaseDetailSerializer(refreshed).data)


@method_decorator(never_cache, name="dispatch")
class BatchQualityCoaDecisionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, company_id, case_id):
        company = _get_company_for_action(request, company_id, BATCH_QUALITY_COA_APPROVE)
        case = _get_case_for_company(company, case_id)
        serializer = BatchQualityCoaDecisionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            updated_case, _ = record_coa_decision(
                user=request.user,
                quality_case_id=case.id,
                expected_version=serializer.validated_data["expected_version"],
                outcome=serializer.validated_data["outcome"],
                document_reference=serializer.validated_data["document_reference"],
                remarks=serializer.validated_data.get("remarks", ""),
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc)

        refreshed = _get_case_for_company(company, case.id)
        return Response(BatchQualityCaseDetailSerializer(refreshed).data)


@method_decorator(never_cache, name="dispatch")
class BatchQualityPackagingCompleteView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, company_id, case_id):
        company = _get_company_for_action(request, company_id, PRODUCTION_PACKAGING_COMPLETE)
        case = _get_case_for_company(company, case_id)
        serializer = BatchQualityPackagingCompleteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            updated_case = mark_packaging_complete(
                user=request.user,
                quality_case_id=case.id,
                expected_version=serializer.validated_data["expected_version"],
                remarks=serializer.validated_data.get("remarks", ""),
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc)

        refreshed = _get_case_for_company(company, case.id)
        return Response(BatchQualityCaseDetailSerializer(refreshed).data)


@method_decorator(never_cache, name="dispatch")
class BatchQualityPackagingDecisionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, company_id, case_id):
        company = _get_company_for_action(request, company_id, BATCH_QUALITY_PACKAGING_QA)
        case = _get_case_for_company(company, case_id)
        serializer = BatchQualityDecisionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            updated_case, _ = record_packaging_decision(
                user=request.user,
                quality_case_id=case.id,
                expected_version=serializer.validated_data["expected_version"],
                outcome=serializer.validated_data["outcome"],
                remarks=serializer.validated_data.get("remarks", ""),
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc)

        refreshed = _get_case_for_company(company, case.id)
        return Response(BatchQualityCaseDetailSerializer(refreshed).data)

