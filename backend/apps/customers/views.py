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
from apps.common.validation import parse_strict_bool
from apps.companies.services import active_companies_for_user
from apps.customers.imports import commit_customer_rows, preview_customer_rows
from apps.customers.models import Customer
from apps.customers.serializers import (
    CustomerCreateSerializer,
    CustomerSerializer,
    CustomerUpdateSerializer,
    CustomerVersionSerializer,
)
from apps.customers.services import (
    delete_customer,
    activate_customer,
    create_customer,
    deactivate_customer,
    update_customer,
)
from apps.permissions.services import user_has_permission

CUSTOMERS_VIEW = "customers.view"
CUSTOMERS_CREATE = "customers.create"
CUSTOMERS_EDIT = "customers.edit"
CUSTOMERS_ACTIVATE = "customers.activate"
CUSTOMERS_DEACTIVATE = "customers.deactivate"
CUSTOMERS_DELETE = "customers.delete"


def _get_company_for_action(request, company_id, *required_permissions):
    """Resolves the URL's company under the same rules Task 08B-1
    established and every company-scoped app since has replicated locally
    (never imported across apps - see apps.purchasing.views._get_company_
    for_action, apps.receiving.views, apps.quality.views): an active
    membership in an active company is required just to be *found* at
    all - a nonexistent company, an inactive one, or one the caller
    simply is not a member of are all folded into the same 404, so a
    caller with no access to a company can never learn which of those is
    true. Holding every permission in `required_permissions` is then
    checked separately, a 403 (naming what is missing) if any is absent.

    No superuser or `is_staff` exception exists anywhere in this path -
    `apps.permissions.services.user_has_permission` already never
    consults either flag, and this task does not add a parallel
    administrative-read bypass.
    """
    user = request.user
    company = active_companies_for_user(user).filter(pk=company_id).first()
    if company is None:
        raise exceptions.NotFound("Company not found.")
    missing = [code for code in required_permissions if not user_has_permission(user, company, code)]
    if missing:
        raise exceptions.PermissionDenied(f"The following permission(s) are required: {', '.join(missing)}.")
    return company


@method_decorator(never_cache, name="dispatch")
class CustomerListCreateView(generics.ListCreateAPIView):
    """GET: `customers.view` in the URL's company. POST: `customers.view`
    **and** `customers.create` - view permission is always required
    alongside a mutation permission, so no one can create a customer they
    could not then also see (same convention as every other company-
    scoped list/create view in this project).
    """

    permission_classes = [IsAuthenticated]
    pagination_class = BoundedPageNumberPagination

    def get_serializer_class(self):
        return CustomerCreateSerializer if self.request.method == "POST" else CustomerSerializer

    def get_queryset(self):
        company = _get_company_for_action(self.request, self.kwargs["company_id"], CUSTOMERS_VIEW)
        queryset = Customer.objects.select_related("company").filter(company=company)

        search = self.request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(
                Q(code__icontains=search)
                | Q(name__icontains=search)
                | Q(contact_person__icontains=search)
                | Q(email__icontains=search)
                | Q(phone__icontains=search)
                | Q(city__icontains=search)
                | Q(gst_number__icontains=search)
            )

        is_active_param = self.request.query_params.get("is_active")
        if is_active_param is not None:
            queryset = queryset.filter(is_active=parse_strict_bool(is_active_param))

        return queryset.order_by("code", "id")

    def create(self, request, *args, **kwargs):
        company = _get_company_for_action(request, self.kwargs["company_id"], CUSTOMERS_VIEW, CUSTOMERS_CREATE)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            customer = create_customer(actor=request.user, company=company, **serializer.validated_data)
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        return Response(CustomerSerializer(customer).data, status=201)


@method_decorator(never_cache, name="dispatch")
class CustomerDetailView(APIView):
    """GET: `customers.view`. PATCH: `customers.view` and `customers.edit`
    - see apps.customers.services.update_customer for the full no-op/
    version/inactive-metadata-correction rules.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, company_id, customer_id):
        company = _get_company_for_action(request, company_id, CUSTOMERS_VIEW)
        customer = get_object_or_404(Customer.objects.select_related("company"), pk=customer_id, company=company)
        return Response(CustomerSerializer(customer).data)

    def delete(self, request, company_id, customer_id):
        """Only for customers nothing references. Requires customers.view and
        customers.delete. `expected_version` is a required query parameter.
        """
        company = _get_company_for_action(request, company_id, CUSTOMERS_VIEW, CUSTOMERS_DELETE)
        raw = request.query_params.get("expected_version")
        try:
            expected_version = int(raw)
        except (TypeError, ValueError):
            raise exceptions.ValidationError({"expected_version": "Required integer query parameter."})
        try:
            delete_customer(actor=request.user, company=company, customer_id=customer_id, expected_version=expected_version)
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        return Response(status=204)

    def patch(self, request, company_id, customer_id):
        company = _get_company_for_action(request, company_id, CUSTOMERS_VIEW, CUSTOMERS_EDIT)
        customer = get_object_or_404(Customer, pk=customer_id, company=company)
        serializer = CustomerUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        expected_version = data.pop("expected_version")
        try:
            customer = update_customer(
                actor=request.user, customer_id=customer.id, expected_version=expected_version, data=data
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        customer = Customer.objects.select_related("company").get(pk=customer.pk)
        return Response(CustomerSerializer(customer).data)


@method_decorator(never_cache, name="dispatch")
class CustomerActivateView(APIView):
    """`customers.view` and `customers.activate`. Requires
    `expected_version` in the body - see apps.customers.services.
    activate_customer for the idempotent-already-active no-op rule.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, company_id, customer_id):
        company = _get_company_for_action(request, company_id, CUSTOMERS_VIEW, CUSTOMERS_ACTIVATE)
        customer = get_object_or_404(Customer, pk=customer_id, company=company)
        serializer = CustomerVersionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            customer = activate_customer(
                actor=request.user,
                customer_id=customer.id,
                expected_version=serializer.validated_data["expected_version"],
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        customer = Customer.objects.select_related("company").get(pk=customer.pk)
        return Response(CustomerSerializer(customer).data)


@method_decorator(never_cache, name="dispatch")
class CustomerDeactivateView(APIView):
    """`customers.view` and `customers.deactivate`. Requires
    `expected_version` in the body - see apps.customers.services.
    deactivate_customer for the idempotent-already-inactive no-op rule.
    Never deletes or cascades - no DELETE endpoint exists for this
    resource.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, company_id, customer_id):
        company = _get_company_for_action(request, company_id, CUSTOMERS_VIEW, CUSTOMERS_DEACTIVATE)
        customer = get_object_or_404(Customer, pk=customer_id, company=company)
        serializer = CustomerVersionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            customer = deactivate_customer(
                actor=request.user,
                customer_id=customer.id,
                expected_version=serializer.validated_data["expected_version"],
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        customer = Customer.objects.select_related("company").get(pk=customer.pk)
        return Response(CustomerSerializer(customer).data)


@method_decorator(never_cache, name="dispatch")
class CustomerImportPreviewView(APIView):
    """Validate customer rows without writing anything. Needs customers.view and
    customers.create (duplicate detection reveals existing codes, so create is required).
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, company_id):
        company = _get_company_for_action(request, company_id, CUSTOMERS_VIEW, CUSTOMERS_CREATE)
        return Response(preview_customer_rows(company, request.data.get("rows")), status=200)


@method_decorator(never_cache, name="dispatch")
class CustomerImportCommitView(APIView):
    """Create every valid row or none (all-or-nothing). Each created customer is audited."""

    permission_classes = [IsAuthenticated]

    def post(self, request, company_id):
        company = _get_company_for_action(request, company_id, CUSTOMERS_VIEW, CUSTOMERS_CREATE)
        created = commit_customer_rows(actor=request.user, company=company, rows=request.data.get("rows"))
        return Response({"created": len(created), "codes": [c.code for c in created]}, status=201)
