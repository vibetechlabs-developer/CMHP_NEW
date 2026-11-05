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
from apps.companies.services import active_companies_for_user
from apps.permissions.services import user_has_permission
from apps.quality.control_sample_serializers import (
    ControlSampleCreateSerializer,
    ControlSampleDisposeSerializer,
    ControlSampleSerializer,
    ControlSampleUpdateSerializer,
)
from apps.quality.control_sample_services import (
    create_control_sample,
    dispose_control_sample,
    update_control_sample,
)
from apps.quality.models import ControlSample

CONTROL_SAMPLES_VIEW = "control_samples.view"
CONTROL_SAMPLES_CREATE = "control_samples.create"
CONTROL_SAMPLES_EDIT = "control_samples.edit"
CONTROL_SAMPLES_DISPOSE = "control_samples.dispose"


def _get_company_for_action(request, company_id, *required_permissions):
    company = active_companies_for_user(request.user).filter(pk=company_id).first()
    if company is None:
        raise exceptions.NotFound("Company not found.")
    missing = [code for code in required_permissions if not user_has_permission(request.user, company, code)]
    if missing:
        raise exceptions.PermissionDenied(f"The following permission(s) are required: {', '.join(missing)}.")
    return company


@method_decorator(never_cache, name="dispatch")
class ControlSampleListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    pagination_class = BoundedPageNumberPagination

    def get_serializer_class(self):
        return ControlSampleCreateSerializer if self.request.method == "POST" else ControlSampleSerializer

    def get_queryset(self):
        company = _get_company_for_action(self.request, self.kwargs["company_id"], CONTROL_SAMPLES_VIEW)
        qs = ControlSample.objects.filter(company=company).select_related(
            "product", "sales_order", "batch_plan", "created_by", "disposed_by"
        )
        params = self.request.query_params
        status_param = params.get("status", "").strip()
        if status_param and status_param != "ALL":
            qs = qs.filter(status=status_param)
        sample_type = params.get("sample_type", "").strip()
        if sample_type and sample_type != "ALL":
            qs = qs.filter(sample_type=sample_type)
        sales_order = params.get("sales_order")
        if sales_order:
            qs = qs.filter(sales_order_id=sales_order)
        search = params.get("search", "").strip()
        if search:
            qs = qs.filter(
                Q(batch_no__icontains=search)
                | Q(product_name__icontains=search)
                | Q(product_code__icontains=search)
                | Q(ar_no__icontains=search)
                | Q(storage_location__icontains=search)
            )
        return qs.order_by("-created_at", "-id")

    def create(self, request, *args, **kwargs):
        company = _get_company_for_action(request, self.kwargs["company_id"], CONTROL_SAMPLES_VIEW, CONTROL_SAMPLES_CREATE)
        serializer = ControlSampleCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            sample = create_control_sample(actor=request.user, company=company, **data)
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        return Response(ControlSampleSerializer(sample).data, status=201)


@method_decorator(never_cache, name="dispatch")
class ControlSampleDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id, sample_id):
        company = _get_company_for_action(request, company_id, CONTROL_SAMPLES_VIEW)
        sample = get_object_or_404(ControlSample, pk=sample_id, company=company)
        return Response(ControlSampleSerializer(sample).data)

    def patch(self, request, company_id, sample_id):
        company = _get_company_for_action(request, company_id, CONTROL_SAMPLES_VIEW, CONTROL_SAMPLES_EDIT)
        serializer = ControlSampleUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            sample = update_control_sample(
                actor=request.user, company=company, sample_id=sample_id, data=serializer.validated_data
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        return Response(ControlSampleSerializer(sample).data)


@method_decorator(never_cache, name="dispatch")
class ControlSampleDisposeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, company_id, sample_id):
        company = _get_company_for_action(request, company_id, CONTROL_SAMPLES_VIEW, CONTROL_SAMPLES_DISPOSE)
        serializer = ControlSampleDisposeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            sample = dispose_control_sample(
                actor=request.user,
                company=company,
                sample_id=sample_id,
                remarks=serializer.validated_data.get("remarks", ""),
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        return Response(ControlSampleSerializer(sample).data)
