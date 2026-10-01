from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from rest_framework import exceptions, generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog.models import UnitOfMeasure
from apps.common.errors import translate_django_validation_error
from apps.common.pagination import BoundedPageNumberPagination
from apps.common.validation import parse_strict_bool
from apps.companies.services import active_companies_for_user
from apps.permissions.services import user_has_permission
from apps.products.models import Product
from apps.products.serializers import (
    ProductCreateSerializer,
    ProductSerializer,
    ProductUpdateSerializer,
    ProductVersionSerializer,
)
from apps.products.services import (
    activate_product,
    create_product,
    deactivate_product,
    update_product,
)

PRODUCTS_VIEW = "products.view"
PRODUCTS_CREATE = "products.create"
PRODUCTS_EDIT = "products.edit"
PRODUCTS_ACTIVATE = "products.activate"
PRODUCTS_DEACTIVATE = "products.deactivate"


def _get_company_for_action(request, company_id, *required_permissions):
    """Resolves the URL's company under the same rules Task 08B-1
    established and every company-scoped app since has replicated locally
    (never imported across apps - see apps.purchasing.views/apps.
    customers.views's own identically-named, identically-bodied helper):
    an active membership in an active company is required just to be
    *found* at all - a nonexistent company, an inactive one, or one the
    caller simply is not a member of are all folded into the same 404, so
    a caller with no access to a company can never learn which of those
    is true. Holding every permission in `required_permissions` is then
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
class ProductListCreateView(generics.ListCreateAPIView):
    """GET: `products.view` in the URL's company. POST: `products.view`
    **and** `products.create` - view permission is always required
    alongside a mutation permission, so no one can create a product they
    could not then also see (same convention as every other company-
    scoped list/create view in this project).
    """

    permission_classes = [IsAuthenticated]
    pagination_class = BoundedPageNumberPagination

    def get_serializer_class(self):
        return ProductCreateSerializer if self.request.method == "POST" else ProductSerializer

    def get_queryset(self):
        company = _get_company_for_action(self.request, self.kwargs["company_id"], PRODUCTS_VIEW)
        queryset = Product.objects.select_related("company", "sales_uom").filter(company=company)

        search = self.request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(Q(code__icontains=search) | Q(name__icontains=search))

        is_active_param = self.request.query_params.get("is_active")
        if is_active_param is not None:
            queryset = queryset.filter(is_active=parse_strict_bool(is_active_param))

        return queryset.order_by("code", "id")

    def create(self, request, *args, **kwargs):
        company = _get_company_for_action(request, self.kwargs["company_id"], PRODUCTS_VIEW, PRODUCTS_CREATE)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        sales_uom = get_object_or_404(UnitOfMeasure, pk=data.pop("sales_uom_id"))
        try:
            product = create_product(actor=request.user, company=company, sales_uom=sales_uom, **data)
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        return Response(ProductSerializer(product).data, status=201)


@method_decorator(never_cache, name="dispatch")
class ProductDetailView(APIView):
    """GET: `products.view`. PATCH: `products.view` and `products.edit`
    - see apps.products.services.update_product for the full no-op/
    version/inactive-metadata-correction rules.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, company_id, product_id):
        company = _get_company_for_action(request, company_id, PRODUCTS_VIEW)
        product = get_object_or_404(
            Product.objects.select_related("company", "sales_uom"), pk=product_id, company=company
        )
        return Response(ProductSerializer(product).data)

    def patch(self, request, company_id, product_id):
        company = _get_company_for_action(request, company_id, PRODUCTS_VIEW, PRODUCTS_EDIT)
        product = get_object_or_404(Product, pk=product_id, company=company)
        serializer = ProductUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        expected_version = data.pop("expected_version")
        try:
            product = update_product(
                actor=request.user, product_id=product.id, expected_version=expected_version, data=data
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        product = Product.objects.select_related("company", "sales_uom").get(pk=product.pk)
        return Response(ProductSerializer(product).data)


@method_decorator(never_cache, name="dispatch")
class ProductActivateView(APIView):
    """`products.view` and `products.activate`. Requires `expected_version`
    in the body - see apps.products.services.activate_product for the
    idempotent-already-active no-op rule and the sales_uom re-check.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, company_id, product_id):
        company = _get_company_for_action(request, company_id, PRODUCTS_VIEW, PRODUCTS_ACTIVATE)
        product = get_object_or_404(Product, pk=product_id, company=company)
        serializer = ProductVersionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            product = activate_product(
                actor=request.user,
                product_id=product.id,
                expected_version=serializer.validated_data["expected_version"],
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        product = Product.objects.select_related("company", "sales_uom").get(pk=product.pk)
        return Response(ProductSerializer(product).data)


@method_decorator(never_cache, name="dispatch")
class ProductDeactivateView(APIView):
    """`products.view` and `products.deactivate`. Requires
    `expected_version` in the body - see apps.products.services.
    deactivate_product for the idempotent-already-inactive no-op rule.
    Never deletes or cascades - no DELETE endpoint exists for this
    resource.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, company_id, product_id):
        company = _get_company_for_action(request, company_id, PRODUCTS_VIEW, PRODUCTS_DEACTIVATE)
        product = get_object_or_404(Product, pk=product_id, company=company)
        serializer = ProductVersionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            product = deactivate_product(
                actor=request.user,
                product_id=product.id,
                expected_version=serializer.validated_data["expected_version"],
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        product = Product.objects.select_related("company", "sales_uom").get(pk=product.pk)
        return Response(ProductSerializer(product).data)
