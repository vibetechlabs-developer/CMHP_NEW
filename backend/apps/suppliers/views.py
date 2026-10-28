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
from apps.suppliers.models import Supplier
from apps.suppliers.serializers import (
    SupplierCreateSerializer,
    SupplierSerializer,
    SupplierUpdateSerializer,
)
from apps.suppliers.services import (
    activate_supplier,
    create_supplier,
    deactivate_supplier,
    delete_supplier,
    update_supplier,
)


def _duplicate_supplier_code_error():
    return exceptions.ValidationError({"code": "A supplier with this code already exists."})


@method_decorator(never_cache, name="dispatch")
class SupplierListCreateView(generics.ListCreateAPIView):
    """Active-superuser-only, both directions - unlike the shared catalog
    (Task 07B), there is no store-permission read exception here: every
    supplier endpoint requires IsActiveSuperuser (see backend-decisions.md,
    Task 08A, for why this task does not reuse or extend
    shared_catalog.view).
    """

    permission_classes = [IsActiveSuperuser]
    pagination_class = BoundedPageNumberPagination

    def get_serializer_class(self):
        return SupplierCreateSerializer if self.request.method == "POST" else SupplierSerializer

    def get_queryset(self):
        queryset = Supplier.objects.all()

        search = self.request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(
                Q(code__icontains=search)
                | Q(legal_name__icontains=search)
                | Q(display_name__icontains=search)
                | Q(contact_name__icontains=search)
            )

        is_active_param = self.request.query_params.get("is_active")
        if is_active_param is not None:
            queryset = queryset.filter(is_active=parse_strict_bool(is_active_param))

        return queryset.order_by("code", "id")

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            supplier = create_supplier(actor=request.user, **serializer.validated_data)
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        except IntegrityError:
            raise _duplicate_supplier_code_error()
        return Response(SupplierSerializer(supplier).data, status=201)


@method_decorator(never_cache, name="dispatch")
class SupplierDetailView(APIView):
    permission_classes = [IsActiveSuperuser]

    def get(self, request, supplier_id):
        supplier = get_object_or_404(Supplier, pk=supplier_id)
        return Response(SupplierSerializer(supplier).data)

    def patch(self, request, supplier_id):
        supplier = get_object_or_404(Supplier, pk=supplier_id)
        serializer = SupplierUpdateSerializer(supplier, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            supplier = update_supplier(actor=request.user, supplier=supplier, data=serializer.validated_data)
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        return Response(SupplierSerializer(supplier).data)

    def delete(self, request, supplier_id):
        supplier = get_object_or_404(Supplier, pk=supplier_id)
        try:
            delete_supplier(actor=request.user, supplier=supplier)
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        return Response(status=204)


@method_decorator(never_cache, name="dispatch")
class SupplierActivateView(APIView):
    permission_classes = [IsActiveSuperuser]

    def post(self, request, supplier_id):
        supplier = get_object_or_404(Supplier, pk=supplier_id)
        supplier = activate_supplier(actor=request.user, supplier=supplier)
        return Response(SupplierSerializer(supplier).data)


@method_decorator(never_cache, name="dispatch")
class SupplierDeactivateView(APIView):
    permission_classes = [IsActiveSuperuser]

    def post(self, request, supplier_id):
        supplier = get_object_or_404(Supplier, pk=supplier_id)
        supplier = deactivate_supplier(actor=request.user, supplier=supplier)
        return Response(SupplierSerializer(supplier).data)
