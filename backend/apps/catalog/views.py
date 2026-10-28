import datetime

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from rest_framework import exceptions, generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.services import record
from apps.catalog.models import Material, MaterialCategory, MaterialReorderSetting, ProductType, UnitOfMeasure
from apps.permissions.services import store_user_has_permission
from apps.receiving.models import ContainerType
from apps.receiving.services import companies_with_po_view_access
from apps.stock_movements.models import StockMovement
from apps.stores.services import active_stores_for_user
from apps.suppliers.models import Supplier
from apps.catalog.permissions import CanReadSharedCatalog
from apps.catalog.serializers import (
    ProductTypeSerializer,
    ProductTypeWriteSerializer,
    MaterialCategoryCreateSerializer,
    MaterialCategorySerializer,
    MaterialCategoryUpdateSerializer,
    MaterialCreateSerializer,
    MaterialReorderSettingSerializer,
    MaterialReorderSettingWriteSerializer,
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
    get_material_reorder_setting,
    set_material_reorder_level,
    update_category,
    update_material,
    update_unit,
)
from apps.common.errors import translate_django_validation_error
from apps.common.pagination import BoundedPageNumberPagination
from apps.common.permissions import IsActiveSuperuser
from apps.common.validation import parse_int_filter, parse_strict_bool

MATERIAL_RESTOCK_VIEW = "stock.view"
MATERIAL_RESTOCK_MANAGE = "materials.manage_reorder_level"


def _get_store_for_reorder_action(request, store_id, *required_permissions):
    """Same fold-into-404 + explicit-403 convention as apps.stock_movements.
    views._get_store_for_action / apps.receiving.views._get_store_for_action -
    kept as its own small copy here (not a shared import) since this is the
    only place apps.catalog needs it, same reasoning apps.receiving's own
    copy already documents.
    """
    user = request.user
    store = active_stores_for_user(user).filter(pk=store_id).first()
    if store is None:
        raise exceptions.NotFound("Store not found.")
    missing = [code for code in required_permissions if not store_user_has_permission(user, store, code)]
    if missing:
        raise exceptions.PermissionDenied(f"The following permission(s) are required: {', '.join(missing)}.")
    return store


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


def _parse_catalog_date_filter(raw_value, *, field):
    """Same strict YYYY-MM-DD parse as apps.stock_movements.views.
    _parse_date_filter - used here for the materials list's own
    receipt-activity date filter (see MaterialListCreateView.get_queryset).
    """
    try:
        return datetime.date.fromisoformat(raw_value.strip())
    except ValueError:
        raise exceptions.ValidationError({field: "Must be a date in YYYY-MM-DD format."})


# Materials themselves carry no reorder level or minimum-stock threshold
# anywhere in this codebase (see Material's own docstring) - a stock-status
# filter cannot be computed honestly. Rather than silently ignoring
# `?stock_status=`, any non-blank value is explicitly rejected (400) so a
# caller is never left thinking the filter quietly did nothing.
_STOCK_STATUS_UNAVAILABLE = (
    "Stock-status filtering is not available: no reorder level or minimum-stock threshold is "
    "captured on the material catalog in this version."
)


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
            kinds = [k.strip() for k in kind.split(",") if k.strip()]
            invalid = [k for k in kinds if k not in Material.Kind.values]
            if invalid:
                raise exceptions.ValidationError({"kind": f"Must be one of {list(Material.Kind.values)}."})
            if len(kinds) == 1:
                queryset = queryset.filter(kind=kinds[0])
            else:
                queryset = queryset.filter(kind__in=kinds)

        category_param = self.request.query_params.get("category")
        if category_param is not None:
            queryset = queryset.filter(category_id=parse_int_filter(category_param, field="category"))

        base_unit_param = self.request.query_params.get("base_unit")
        if base_unit_param is not None:
            queryset = queryset.filter(base_unit_id=parse_int_filter(base_unit_param, field="base_unit"))

        stock_status_param = self.request.query_params.get("stock_status", "").strip()
        if stock_status_param:
            raise exceptions.ValidationError({"stock_status": _STOCK_STATUS_UNAVAILABLE})

        # Supplier and receipt-activity-date filters both derive from the
        # material's own recorded receipt history (apps.stock_movements),
        # never from a single "owning supplier" field - a material legally
        # has none. Both are scoped to companies the caller holds
        # purchase_orders.view in - the same access rule the receiving/
        # stock-movements apps already apply to supplier identity, applied
        # here consistently rather than left ungated for this list.
        supplier_param = self.request.query_params.get("supplier")
        receipt_from_param = self.request.query_params.get("receipt_from")
        receipt_to_param = self.request.query_params.get("receipt_to")
        if supplier_param is not None or receipt_from_param or receipt_to_param:
            accessible_companies = companies_with_po_view_access(self.request.user)
            movements = StockMovement.objects.filter(source_company__in=accessible_companies)
            if supplier_param is not None:
                supplier_id = parse_int_filter(supplier_param, field="supplier")
                supplier_obj = Supplier.objects.filter(id=supplier_id).first()
                q = Q(source_goods_receipt__source_purchase_order__supplier_id=supplier_id)
                if supplier_obj:
                    names = [n.strip() for n in [supplier_obj.display_name, supplier_obj.legal_name] if n and n.strip()]
                    for name in names:
                        q |= Q(source_goods_receipt__supplier_name__iexact=name)
                movements = movements.filter(q)
            if receipt_from_param:
                movements = movements.filter(
                    posted_at__date__gte=_parse_catalog_date_filter(receipt_from_param, field="receipt_from")
                )
            if receipt_to_param:
                movements = movements.filter(
                    posted_at__date__lte=_parse_catalog_date_filter(receipt_to_param, field="receipt_to")
                )
            queryset = queryset.filter(id__in=movements.values("material_id"))

        return queryset.order_by("code", "id").distinct()

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        base_unit = get_object_or_404(UnitOfMeasure, pk=data.pop("base_unit_id"))
        category_id = data.pop("category_id", None)
        category = get_object_or_404(MaterialCategory, pk=category_id) if category_id is not None else None
        default_container_type_id = data.pop("default_container_type_id", None)
        default_container_type = (
            get_object_or_404(ContainerType, pk=default_container_type_id)
            if default_container_type_id is not None
            else None
        )

        try:
            material = create_material(
                actor=request.user,
                base_unit=base_unit,
                category=category,
                default_container_type=default_container_type,
                **data,
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        except IntegrityError:
            raise _duplicate_material_code_error()
        return Response(MaterialSerializer(material).data, status=201)


@method_decorator(never_cache, name="dispatch")
class MaterialSupplierOptionsView(APIView):
    """GET only - the active suppliers available for material filtering and
    inward stock reference, ordered by code.
    """

    permission_classes = [CanReadSharedCatalog]

    def get(self, request):
        suppliers = Supplier.objects.filter(is_active=True).order_by("code")
        return Response(
            [
                {
                    "id": supplier.id,
                    "code": supplier.code,
                    "name": supplier.display_name or supplier.legal_name or supplier.code,
                    "display_name": supplier.display_name,
                    "legal_name": supplier.legal_name,
                }
                for supplier in suppliers
            ]
        )


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

        if "default_container_type_id" in data:
            default_container_type_id = data.pop("default_container_type_id")
            data["default_container_type_id"] = (
                get_object_or_404(ContainerType, pk=default_container_type_id)
                if default_container_type_id is not None
                else None
            )

        if "base_unit_id" in data:
            base_unit_id = data.pop("base_unit_id")
            data["base_unit_id"] = (
                get_object_or_404(UnitOfMeasure, pk=base_unit_id)
                if base_unit_id is not None
                else None
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


@method_decorator(never_cache, name="dispatch")
class MaterialReorderSettingView(APIView):
    """GET/PUT .../stores/<store_id>/materials/<material_id>/reorder-
    setting/ - the store-scoped reorder threshold for one material (see
    MaterialReorderSetting's own docstring for why this is never a field
    on Material itself). GET requires only `stock.view` in the store (the
    same read access the material register already uses) - a store user
    who can see stock can see its reorder threshold. PUT requires the
    separate `materials.manage_reorder_level` permission - a narrower,
    dedicated capability, never folded into the superuser-only catalog-
    write gate (CanReadSharedCatalog/_read_write_permissions above),
    since this is a store-level operational setting, not a change to the
    shared material master itself.

    GET returns `{"reorder_level": null, ...}`-shaped absence (never a
    404) when nothing is configured yet for this store - "not configured"
    is a normal, expected state, not an error.
    """

    def get_permissions(self):
        return [IsAuthenticated()]

    def get(self, request, store_id, material_id):
        store = _get_store_for_reorder_action(request, store_id, MATERIAL_RESTOCK_VIEW)
        material = get_object_or_404(Material, pk=material_id)
        setting = get_material_reorder_setting(store=store, material=material)
        if setting is None:
            return Response({"store_id": store.id, "material_id": material.id, "reorder_level": None})
        return Response(MaterialReorderSettingSerializer(setting).data)

    def put(self, request, store_id, material_id):
        store = _get_store_for_reorder_action(request, store_id, MATERIAL_RESTOCK_VIEW, MATERIAL_RESTOCK_MANAGE)
        material = get_object_or_404(Material, pk=material_id)
        serializer = MaterialReorderSettingWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            setting = set_material_reorder_level(
                actor=request.user, store=store, material=material,
                reorder_level=serializer.validated_data["reorder_level"],
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        return Response(MaterialReorderSettingSerializer(setting).data)


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
