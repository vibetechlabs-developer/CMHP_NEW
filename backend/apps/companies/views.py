from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from rest_framework import exceptions, generics
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.errors import translate_django_validation_error
from apps.common.pagination import BoundedPageNumberPagination
from apps.common.permissions import IsActiveSuperuser
from apps.common.validation import parse_strict_bool
from apps.companies.models import Company
from apps.companies.serializers import (
    CompanyCreateSerializer,
    CompanyDetailSerializer,
    CompanySerializer,
    CompanyUpdateSerializer,
)
from apps.companies.services import (
    active_companies_for_user,
    activate_company,
    create_company,
    deactivate_company,
    update_company,
)


@method_decorator(never_cache, name="dispatch")
class MyCompaniesView(APIView):
    """GET /api/v1/companies/mine/ - Bearer access token required (default
    IsAuthenticated + JWTAuthentication). Reuses active_companies_for_user()
    as-is - the active-user/active-membership/active-company rules and the
    deterministic ordering all live there, not duplicated here.
    """

    def get(self, request):
        companies = active_companies_for_user(request.user)
        return Response({"companies": CompanySerializer(companies, many=True).data})


def _duplicate_company_code_error():
    return exceptions.ValidationError({"code": "A company with this code already exists."})


@method_decorator(never_cache, name="dispatch")
class CompanyListCreateView(generics.ListCreateAPIView):
    """GET: paginated, searchable, filterable list of every company
    (active and inactive - unlike /mine/, this is the superuser-only
    administrative view). POST: create an active company. Neither creates
    or touches any membership/role/store record.
    """

    permission_classes = [IsActiveSuperuser]
    pagination_class = BoundedPageNumberPagination

    def get_serializer_class(self):
        return CompanyCreateSerializer if self.request.method == "POST" else CompanyDetailSerializer

    def get_queryset(self):
        queryset = Company.objects.all()

        search = self.request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(
                Q(code__icontains=search)
                | Q(legal_name__icontains=search)
                | Q(display_name__icontains=search)
            )

        is_active_param = self.request.query_params.get("is_active")
        if is_active_param is not None:
            queryset = queryset.filter(is_active=parse_strict_bool(is_active_param))

        return queryset.order_by("code", "id")

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            company = create_company(actor=request.user, **serializer.validated_data)
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        except IntegrityError:
            raise _duplicate_company_code_error()
        return Response(CompanyDetailSerializer(company).data, status=201)


@method_decorator(never_cache, name="dispatch")
class CompanyDetailView(APIView):
    """GET: full management detail (including is_active). PATCH:
    legal_name/display_name only - see CompanyUpdateSerializer for exactly
    what is rejected.
    """

    permission_classes = [IsActiveSuperuser]

    def get(self, request, company_id):
        company = get_object_or_404(Company, pk=company_id)
        return Response(CompanyDetailSerializer(company).data)

    def patch(self, request, company_id):
        company = get_object_or_404(Company, pk=company_id)
        serializer = CompanyUpdateSerializer(company, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            company = update_company(actor=request.user, company=company, data=serializer.validated_data)
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        return Response(CompanyDetailSerializer(company).data)


@method_decorator(never_cache, name="dispatch")
class CompanyActivateView(APIView):
    permission_classes = [IsActiveSuperuser]

    def post(self, request, company_id):
        company = get_object_or_404(Company, pk=company_id)
        company = activate_company(actor=request.user, company=company)
        return Response(CompanyDetailSerializer(company).data)


@method_decorator(never_cache, name="dispatch")
class CompanyDeactivateView(APIView):
    """Idempotent. Never cascades: memberships/roles/role assignments keep
    whatever is_active state they already had - see
    apps.companies.services.deactivate_company.
    """

    permission_classes = [IsActiveSuperuser]

    def post(self, request, company_id):
        company = get_object_or_404(Company, pk=company_id)
        company = deactivate_company(actor=request.user, company=company)
        return Response(CompanyDetailSerializer(company).data)
