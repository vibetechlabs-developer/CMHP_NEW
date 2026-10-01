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
from apps.quotations.models import Quotation, QuotationLine
from apps.quotations.serializers import (
    QuotationCreateSerializer,
    QuotationListSerializer,
    QuotationSerializer,
    QuotationUpdateSerializer,
)
from apps.quotations.services import create_quotation, update_quotation

QUOTATIONS_VIEW = "quotations.view"
QUOTATIONS_CREATE = "quotations.create"
QUOTATIONS_EDIT = "quotations.edit"


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


def _quotation_queryset():
    return Quotation.objects.select_related("company", "customer").prefetch_related(
        Prefetch("lines", queryset=QuotationLine.objects.select_related("product__sales_uom").order_by("line_number", "id"))
    )


def _parse_date_filter(raw_value, *, field):
    try:
        return datetime.date.fromisoformat(raw_value.strip())
    except ValueError:
        raise exceptions.ValidationError({field: "Must be a date in YYYY-MM-DD format."})


@method_decorator(never_cache, name="dispatch")
class QuotationListCreateView(generics.ListCreateAPIView):
    """GET: `quotations.view`. POST: `quotations.view` + `quotations.create`.

    List filters: `?search=` (reference or customer name), `?customer=<id>`,
    `?quotation_date_from=YYYY-MM-DD`, `?quotation_date_to=YYYY-MM-DD`
    (inclusive; `from` after `to` is 400). Ordering: newest first
    (`-created_at`, `-id`).
    """

    permission_classes = [IsAuthenticated]
    pagination_class = BoundedPageNumberPagination

    def get_serializer_class(self):
        return QuotationCreateSerializer if self.request.method == "POST" else QuotationListSerializer

    def get_queryset(self):
        company = _get_company_for_action(self.request, self.kwargs["company_id"], QUOTATIONS_VIEW)
        params = self.request.query_params
        queryset = _quotation_queryset().filter(company=company)

        search = params.get("search", "").strip()
        if search:
            queryset = queryset.filter(Q(reference__icontains=search) | Q(customer__name__icontains=search))

        customer_param = params.get("customer")
        if customer_param is not None:
            queryset = queryset.filter(customer_id=parse_int_filter(customer_param, field="customer"))

        date_from = params.get("quotation_date_from")
        date_to = params.get("quotation_date_to")
        parsed_from = _parse_date_filter(date_from, field="quotation_date_from") if date_from is not None else None
        parsed_to = _parse_date_filter(date_to, field="quotation_date_to") if date_to is not None else None
        if parsed_from and parsed_to and parsed_from > parsed_to:
            raise exceptions.ValidationError({"quotation_date_from": "Must not be after quotation_date_to."})
        if parsed_from:
            queryset = queryset.filter(quotation_date__gte=parsed_from)
        if parsed_to:
            queryset = queryset.filter(quotation_date__lte=parsed_to)

        return queryset.order_by("-created_at", "-id")

    def create(self, request, *args, **kwargs):
        company = _get_company_for_action(request, self.kwargs["company_id"], QUOTATIONS_VIEW, QUOTATIONS_CREATE)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            quotation = create_quotation(actor=request.user, company=company, **serializer.validated_data)
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        quotation = _quotation_queryset().get(pk=quotation.pk)
        return Response(QuotationSerializer(quotation).data, status=201)


@method_decorator(never_cache, name="dispatch")
class QuotationDetailView(APIView):
    """GET: `quotations.view`. PATCH: `quotations.view` + `quotations.edit`.
    No DELETE and no lifecycle endpoint exists.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, company_id, quotation_id):
        company = _get_company_for_action(request, company_id, QUOTATIONS_VIEW)
        quotation = get_object_or_404(_quotation_queryset(), pk=quotation_id, company=company)
        return Response(QuotationSerializer(quotation).data)

    def patch(self, request, company_id, quotation_id):
        company = _get_company_for_action(request, company_id, QUOTATIONS_VIEW, QUOTATIONS_EDIT)
        quotation = get_object_or_404(Quotation, pk=quotation_id, company=company)
        serializer = QuotationUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        expected_version = data.pop("expected_version")
        try:
            quotation = update_quotation(
                actor=request.user, quotation_id=quotation.id, expected_version=expected_version, data=data
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        quotation = _quotation_queryset().get(pk=quotation.pk)
        return Response(QuotationSerializer(quotation).data)
