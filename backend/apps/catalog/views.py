from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from rest_framework import exceptions, generics
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.services import record
from apps.catalog.models import Material, MaterialCategory, ProductType, UnitOfMeasure
from apps.catalog.permissions import CanReadSharedCatalog
from apps.catalog.serializers import (
    ProductTypeSerializer,
    ProductTypeWriteSerializer,
    MaterialCategoryCreateSerializer,
    MaterialCategorySerializer,
    MaterialCategoryUpdateSerializer,
    MaterialCreateSerializer,
    MaterialSerializer,
    MaterialUpdateSerializer,
    UnitOfMeasureCreateSerializer,
    UnitOfMeasureSerializer,
    UnitOfMeasureUpdateSerializer,
)
from apps.catalog.services import (
    activate_category,
    activate_material,
    activate_unit,
    create_category,
    create_material,
    create_unit,
    deactivate_category,
    deactivate_material,
    deactivate_unit,
    update_category,
    update_material,
    update_unit,
)
from apps.common.errors import translate_django_validation_error
from apps.common.pagination import BoundedPageNumberPagination
from apps.common.permissions import IsActiveSuperuser
from apps.common.validation import parse_int_filter, parse_strict_bool


def _read_write_permissions(request):
    return [CanReadSharedCatalog()] if request.method == "GET" else [IsActiveSuperuser()]


# ---------------------------------------------------------------------------
# UnitOfMeasure
# ---------------------------------------------------------------------------


def _duplicate_unit_code_error():
    return exceptions.ValidationError({"code": "A unit of measure with this code already exists."})


@method_decorator(never_cache, name="dispatch")
class UnitOfMeasureListCreateView(generics.ListCreateAPIView):
    """GET: active superuser, or an active user with `shared_catalog.view`
    in at least one active store - see apps.catalog.permissions.
    CanReadSharedCatalog. POST: active superuser only.
    """

    pagination_class = BoundedPageNumberPagination

    def get_permissions(self):
        return _read_write_permissions(self.request)

    def get_serializer_class(self):
        return UnitOfMeasureCreateSerializer if self.request.method == "POST" else UnitOfMeasureSerializer

    def get_queryset(self):
        queryset = UnitOfMeasure.objects.all()

        search = self.request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(Q(code__icontains=search) | Q(name__icontains=search))

        is_active_param = self.request.query_params.get("is_active")
        if is_active_param is not None:
            queryset = queryset.filter(is_active=parse_strict_bool(is_active_param))

        return queryset.order_by("code", "id")

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            unit = create_unit(actor=request.user, **serializer.validated_data)
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        except IntegrityError:
            raise _duplicate_unit_code_error()
        return Response(UnitOfMeasureSerializer(unit).data, status=201)


@method_decorator(never_cache, name="dispatch")
class UnitOfMeasureDetailView(APIView):
    def get_permissions(self):
        return _read_write_permissions(self.request)

    def get(self, request, unit_id):
        unit = get_object_or_404(UnitOfMeasure, pk=unit_id)
        return Response(UnitOfMeasureSerializer(unit).data)

    def patch(self, request, unit_id):
        unit = get_object_or_404(UnitOfMeasure, pk=unit_id)
        serializer = UnitOfMeasureUpdateSerializer(unit, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            unit = update_unit(actor=request.user, unit=unit, data=serializer.validated_data)
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        return Response(UnitOfMeasureSerializer(unit).data)


@method_decorator(never_cache, name="dispatch")
class UnitOfMeasureActivateView(APIView):
    permission_classes = [IsActiveSuperuser]

    def post(self, request, unit_id):
        unit = get_object_or_404(UnitOfMeasure, pk=unit_id)
        unit = activate_unit(actor=request.user, unit=unit)
        return Response(UnitOfMeasureSerializer(unit).data)


@method_decorator(never_cache, name="dispatch")
class UnitOfMeasureDeactivateView(APIView):
    """Rejected (400) while any active Material still references this
    unit as its base_unit - see apps.catalog.services.deactivate_unit.
    """

    permission_classes = [IsActiveSuperuser]

    def post(self, request, unit_id):
        unit = get_object_or_404(UnitOfMeasure, pk=unit_id)
        try:
            unit = deactivate_unit(actor=request.user, unit=unit)
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        return Response(UnitOfMeasureSerializer(unit).data)


# ---------------------------------------------------------------------------
# MaterialCategory
# ---------------------------------------------------------------------------


def _duplicate_category_code_error():
    return exceptions.ValidationError({"code": "A material category with this code already exists."})


@method_decorator(never_cache, name="dispatch")
class MaterialCategoryListCreateView(generics.ListCreateAPIView):
    pagination_class = BoundedPageNumberPagination

    def get_permissions(self):
        return _read_write_permissions(self.request)

    def get_serializer_class(self):
        return (
            MaterialCategoryCreateSerializer
            if self.request.method == "POST"
            else MaterialCategorySerializer
        )

    def get_queryset(self):
        queryset = MaterialCategory.objects.all()

        search = self.request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(Q(code__icontains=search) | Q(name__icontains=search))

        is_active_param = self.request.query_params.get("is_active")
        if is_active_param is not None:
            queryset = queryset.filter(is_active=parse_strict_bool(is_active_param))

        return queryset.order_by("code", "id")

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            category = create_category(actor=request.user, **serializer.validated_data)
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        except IntegrityError:
            raise _duplicate_category_code_error()
        return Response(MaterialCategorySerializer(category).data, status=201)


@method_decorator(never_cache, name="dispatch")
class MaterialCategoryDetailView(APIView):
    def get_permissions(self):
        return _read_write_permissions(self.request)

    def get(self, request, category_id):
        category = get_object_or_404(MaterialCategory, pk=category_id)
        return Response(MaterialCategorySerializer(category).data)

    def patch(self, request, category_id):
        category = get_object_or_404(MaterialCategory, pk=category_id)
        serializer = MaterialCategoryUpdateSerializer(category, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            category = update_category(actor=request.user, category=category, data=serializer.validated_data)
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        return Response(MaterialCategorySerializer(category).data)


@method_decorator(never_cache, name="dispatch")
class MaterialCategoryActivateView(APIView):
    permission_classes = [IsActiveSuperuser]

    def post(self, request, category_id):
        category = get_object_or_404(MaterialCategory, pk=category_id)
        category = activate_category(actor=request.user, category=category)
        return Response(MaterialCategorySerializer(category).data)


@method_decorator(never_cache, name="dispatch")
class MaterialCategoryDeactivateView(APIView):
    """Rejected (400) while any active Material still references this
    category - see apps.catalog.services.deactivate_category.
    """

    permission_classes = [IsActiveSuperuser]

    def post(self, request, category_id):
        category = get_object_or_404(MaterialCategory, pk=category_id)
        try:
            category = deactivate_category(actor=request.user, category=category)
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        return Response(MaterialCategorySerializer(category).data)


# ---------------------------------------------------------------------------
# Material
# ---------------------------------------------------------------------------


def _duplicate_material_code_error():
    return exceptions.ValidationError({"code": "A material with this code already exists."})


@method_decorator(never_cache, name="dispatch")
class MaterialListCreateView(generics.ListCreateAPIView):
    pagination_class = BoundedPageNumberPagination

    def get_permissions(self):
        return _read_write_permissions(self.request)

    def get_serializer_class(self):
        return MaterialCreateSerializer if self.request.method == "POST" else MaterialSerializer

    def get_queryset(self):
        queryset = Material.objects.select_related("category", "base_unit")

        search = self.request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(Q(code__icontains=search) | Q(name__icontains=search))

        is_active_param = self.request.query_params.get("is_active")
        if is_active_param is not None:
            queryset = queryset.filter(is_active=parse_strict_bool(is_active_param))

        kind = self.request.query_params.get("kind", "").strip()
        if kind:
            if kind not in Material.Kind.values:
                raise exceptions.ValidationError({"kind": f"Must be one of {list(Material.Kind.values)}."})
            queryset = queryset.filter(kind=kind)

        category_param = self.request.query_params.get("category")
        if category_param is not None:
            queryset = queryset.filter(category_id=parse_int_filter(category_param, field="category"))

        base_unit_param = self.request.query_params.get("base_unit")
        if base_unit_param is not None:
            queryset = queryset.filter(base_unit_id=parse_int_filter(base_unit_param, field="base_unit"))

        return queryset.order_by("code", "id")

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        base_unit = get_object_or_404(UnitOfMeasure, pk=data.pop("base_unit_id"))
        category_id = data.pop("category_id", None)
        category = get_object_or_404(MaterialCategory, pk=category_id) if category_id is not None else None

        try:
            material = create_material(
                actor=request.user, base_unit=base_unit, category=category, **data
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        except IntegrityError:
            raise _duplicate_material_code_error()
        return Response(MaterialSerializer(material).data, status=201)


@method_decorator(never_cache, name="dispatch")
class MaterialDetailView(APIView):
    def get_permissions(self):
        return _read_write_permissions(self.request)

    def get(self, request, material_id):
        material = get_object_or_404(Material.objects.select_related("category", "base_unit"), pk=material_id)
        return Response(MaterialSerializer(material).data)

    def patch(self, request, material_id):
        material = get_object_or_404(Material.objects.select_related("category", "base_unit"), pk=material_id)
        serializer = MaterialUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)

        if "category_id" in data:
            category_id = data.pop("category_id")
            data["category_id"] = (
                get_object_or_404(MaterialCategory, pk=category_id) if category_id is not None else None
            )

        try:
            material = update_material(actor=request.user, material=material, data=data)
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        return Response(MaterialSerializer(material).data)


@method_decorator(never_cache, name="dispatch")
class MaterialActivateView(APIView):
    """Rejected (400) if the material's base_unit or category has since
    become inactive - see apps.catalog.services.activate_material.
    """

    permission_classes = [IsActiveSuperuser]

    def post(self, request, material_id):
        material = get_object_or_404(Material.objects.select_related("category", "base_unit"), pk=material_id)
        try:
            material = activate_material(actor=request.user, material=material)
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        return Response(MaterialSerializer(material).data)


@method_decorator(never_cache, name="dispatch")
class MaterialDeactivateView(APIView):
    permission_classes = [IsActiveSuperuser]

    def post(self, request, material_id):
        material = get_object_or_404(Material, pk=material_id)
        material = deactivate_material(actor=request.user, material=material)
        return Response(MaterialSerializer(material).data)


class ProductTypeListCreateView(generics.ListCreateAPIView):
    """GET: active superuser or `shared_catalog.view` in an active store
    (same rule as units). POST: active superuser only (configuration).
    """

    pagination_class = BoundedPageNumberPagination

    def get_permissions(self):
        return _read_write_permissions(self.request)

    def get_serializer_class(self):
        return ProductTypeWriteSerializer if self.request.method == "POST" else ProductTypeSerializer

    def get_queryset(self):
        queryset = ProductType.objects.all()
        is_active_param = self.request.query_params.get("is_active")
        if is_active_param is not None:
            queryset = queryset.filter(is_active=parse_strict_bool(is_active_param))
        return queryset

    def create(self, request, *args, **kwargs):
        serializer = ProductTypeWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        product_type = ProductType(name=serializer.validated_data["name"])
        try:
            product_type.clean()
            with transaction.atomic():
                product_type.save()
                record(
                    actor=request.user,
                    action="product_type.created",
                    target_type="product_type",
                    target_id=product_type.id,
                    after={"name": product_type.name, "is_active": product_type.is_active},
                )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        except IntegrityError as exc:
            raise exceptions.ValidationError({"name": "A product type with this name already exists."}) from exc
        return Response(ProductTypeSerializer(product_type).data, status=201)


@method_decorator(never_cache, name="dispatch")
class ProductTypeDetailView(APIView):
    """PATCH: active superuser only. Accepts `name` and `is_active`. Renaming a
    type does not rewrite order-line snapshots, which keep the value they were
    saved with.
    """

    permission_classes = [IsActiveSuperuser]

    def patch(self, request, product_type_id):
        product_type = get_object_or_404(ProductType, pk=product_type_id)
        allowed = {"name", "is_active"}
        unknown = sorted(set(request.data.keys()) - allowed)
        if unknown:
            raise exceptions.ValidationError({key: "This field cannot be set through this endpoint." for key in unknown})
        before = {"name": product_type.name, "is_active": product_type.is_active}
        if "name" in request.data:
            product_type.name = str(request.data["name"]).strip()
        if "is_active" in request.data:
            product_type.is_active = parse_strict_bool(request.data["is_active"])
        try:
            product_type.clean()
            with transaction.atomic():
                product_type.save()
                record(
                    actor=request.user,
                    action="product_type.updated",
                    target_type="product_type",
                    target_id=product_type.id,
                    before=before,
                    after={"name": product_type.name, "is_active": product_type.is_active},
                )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        except IntegrityError as exc:
            raise exceptions.ValidationError({"name": "A product type with this name already exists."}) from exc
        return Response(ProductTypeSerializer(product_type).data)
