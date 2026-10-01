from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from rest_framework import exceptions, generics
from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.errors import translate_django_validation_error
from apps.common.pagination import BoundedPageNumberPagination
from apps.common.permissions import IsActiveSuperuser
from apps.common.validation import parse_strict_bool
from apps.companies.models import Company
from apps.companies.services import active_companies_for_user
from apps.permissions.models import CompanyRole, PermissionDefinition, StoreRole
from apps.permissions.serializers import (
    CompanyRoleCreateSerializer,
    CompanyRoleSerializer,
    CompanyRoleUpdateSerializer,
    PermissionDefinitionSerializer,
    RolePermissionsReplaceSerializer,
    StoreRoleCreateSerializer,
    StoreRolePermissionsReplaceSerializer,
    StoreRoleSerializer,
    StoreRoleUpdateSerializer,
)
from apps.permissions.services import (
    activate_company_role,
    activate_store_role,
    create_company_role,
    create_store_role,
    deactivate_company_role,
    deactivate_store_role,
    effective_permission_codes,
    effective_store_permission_codes,
    replace_role_permissions,
    replace_store_role_permissions,
    update_company_role,
    update_store_role,
)
from apps.stores.models import SharedStore
from apps.stores.services import active_stores_for_user


@method_decorator(never_cache, name="dispatch")
class MyCompanyPermissionsView(APIView):
    """GET /api/v1/companies/<company_id>/my-permissions/ - Bearer access
    token required (default IsAuthenticated + JWTAuthentication).

    Active company membership is validated *before* anything else: a
    nonexistent company, a company the user has no active membership in,
    and an inactive company all produce the exact same 404, via the same
    active_companies_for_user() lookup used by /companies/mine/ - nothing
    here distinguishes "doesn't exist" from "not yours" for the caller.
    No is_staff/is_superuser bypass: active_companies_for_user() never
    consults those flags.
    """

    def get(self, request, company_id):
        company = active_companies_for_user(request.user).filter(pk=company_id).first()
        if company is None:
            raise NotFound("Company not found.")

        codes = effective_permission_codes(request.user, company)
        return Response({"company_id": company.id, "permissions": sorted(codes)})


@method_decorator(never_cache, name="dispatch")
class PermissionCatalogView(generics.ListAPIView):
    """GET /api/v1/permissions/ - read-only, superuser-only catalog of
    existing PermissionDefinition rows. No create/update/delete route
    exists for this model anywhere in the API - permission codes are
    introduced deliberately (in Django Admin) alongside the module that
    needs them, never speculatively seeded.
    """

    permission_classes = [IsActiveSuperuser]
    pagination_class = BoundedPageNumberPagination
    serializer_class = PermissionDefinitionSerializer

    def get_queryset(self):
        queryset = PermissionDefinition.objects.all()

        search = self.request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(Q(code__icontains=search) | Q(name__icontains=search))

        module = self.request.query_params.get("module", "").strip()
        if module:
            queryset = queryset.filter(module=module)

        scope = self.request.query_params.get("scope", "").strip()
        if scope:
            if scope not in PermissionDefinition.Scope.values:
                raise exceptions.ValidationError(
                    {"scope": f"Must be one of {list(PermissionDefinition.Scope.values)}."}
                )
            queryset = queryset.filter(scope=scope)

        is_active_param = self.request.query_params.get("is_active")
        if is_active_param is not None:
            queryset = queryset.filter(is_active=parse_strict_bool(is_active_param))

        return queryset.order_by("module", "code", "id")


def _get_company(company_id):
    return get_object_or_404(Company, pk=company_id)


def _get_company_role(company, role_id):
    return get_object_or_404(CompanyRole, pk=role_id, company=company)


def _duplicate_role_code_error():
    return exceptions.ValidationError(
        {"code": "A role with this code already exists in this company."}
    )


@method_decorator(never_cache, name="dispatch")
class CompanyRoleListCreateView(generics.ListCreateAPIView):
    """GET: every role (active and inactive) in the company from the URL -
    viewable even if the company itself is inactive. POST: create a new
    role with no permissions yet - rejected if the company is inactive.
    """

    permission_classes = [IsActiveSuperuser]
    pagination_class = BoundedPageNumberPagination

    def get_serializer_class(self):
        return CompanyRoleCreateSerializer if self.request.method == "POST" else CompanyRoleSerializer

    def get_queryset(self):
        company = _get_company(self.kwargs["company_id"])
        queryset = CompanyRole.objects.filter(company=company).prefetch_related("permissions")

        search = self.request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(Q(code__icontains=search) | Q(name__icontains=search))

        is_active_param = self.request.query_params.get("is_active")
        if is_active_param is not None:
            queryset = queryset.filter(is_active=parse_strict_bool(is_active_param))

        return queryset.order_by("code", "id")

    def create(self, request, *args, **kwargs):
        company = _get_company(self.kwargs["company_id"])
        if not company.is_active:
            raise exceptions.ValidationError({"detail": "Company is inactive."})

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            role = create_company_role(actor=request.user, company=company, **serializer.validated_data)
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        except IntegrityError:
            raise _duplicate_role_code_error()
        return Response(CompanyRoleSerializer(role).data, status=201)


@method_decorator(never_cache, name="dispatch")
class CompanyRoleDetailView(APIView):
    """Every lookup is scoped to the company in the URL - a role id that
    belongs to a different company than the one in the URL is a 404, the
    same as a role id that does not exist at all.
    """

    permission_classes = [IsActiveSuperuser]

    def get(self, request, company_id, role_id):
        company = _get_company(company_id)
        role = _get_company_role(company, role_id)
        return Response(CompanyRoleSerializer(role).data)

    def patch(self, request, company_id, role_id):
        company = _get_company(company_id)
        role = _get_company_role(company, role_id)
        if not company.is_active:
            raise exceptions.ValidationError({"detail": "Company is inactive."})

        serializer = CompanyRoleUpdateSerializer(role, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            role = update_company_role(actor=request.user, role=role, data=serializer.validated_data)
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        return Response(CompanyRoleSerializer(role).data)


@method_decorator(never_cache, name="dispatch")
class CompanyRoleActivateView(APIView):
    """Rejected under an inactive company - a role cannot become a source
    of business access again while its own company is still inactive.
    """

    permission_classes = [IsActiveSuperuser]

    def post(self, request, company_id, role_id):
        company = _get_company(company_id)
        role = _get_company_role(company, role_id)
        if not company.is_active:
            raise exceptions.ValidationError({"detail": "Company is inactive."})
        role = activate_company_role(actor=request.user, role=role)
        return Response(CompanyRoleSerializer(role).data)


@method_decorator(never_cache, name="dispatch")
class CompanyRoleDeactivateView(APIView):
    """Idempotent, and allowed even under an inactive company - revoking a
    role's contribution to business access must always be possible.
    """

    permission_classes = [IsActiveSuperuser]

    def post(self, request, company_id, role_id):
        company = _get_company(company_id)
        role = _get_company_role(company, role_id)
        role = deactivate_company_role(actor=request.user, role=role)
        return Response(CompanyRoleSerializer(role).data)


@method_decorator(never_cache, name="dispatch")
class RolePermissionsView(APIView):
    """PUT /api/v1/companies/<company_id>/roles/<role_id>/permissions/ -
    atomically replaces the role's entire permission set. See
    apps.permissions.services.replace_role_permissions for the
    normalisation/duplicate/no-op/locking rules.
    """

    permission_classes = [IsActiveSuperuser]

    def put(self, request, company_id, role_id):
        company = _get_company(company_id)
        role = _get_company_role(company, role_id)
        if not company.is_active:
            raise exceptions.ValidationError({"detail": "Company is inactive."})
        if not role.is_active:
            raise exceptions.ValidationError({"detail": "Role is inactive."})

        serializer = RolePermissionsReplaceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            role, codes = replace_role_permissions(
                actor=request.user,
                role=role,
                permission_codes=serializer.validated_data["permission_codes"],
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc

        return Response({"role": CompanyRoleSerializer(role).data, "permission_codes": codes})


@method_decorator(never_cache, name="dispatch")
class MyStorePermissionsView(APIView):
    """GET /api/v1/stores/<store_id>/my-permissions/ - mirrors
    MyCompanyPermissionsView exactly, for stores. Company membership or
    company role never grants any result here - active_stores_for_user()
    only ever consults StoreMembership/SharedStore.
    """

    def get(self, request, store_id):
        store = active_stores_for_user(request.user).filter(pk=store_id).first()
        if store is None:
            raise NotFound("Store not found.")

        codes = effective_store_permission_codes(request.user, store)
        return Response({"store_id": store.id, "permissions": sorted(codes)})


def _get_store(store_id):
    return get_object_or_404(SharedStore, pk=store_id)


def _get_store_role(store, role_id):
    return get_object_or_404(StoreRole, pk=role_id, store=store)


def _duplicate_store_role_code_error():
    return exceptions.ValidationError(
        {"code": "A role with this code already exists in this store."}
    )


@method_decorator(never_cache, name="dispatch")
class StoreRoleListCreateView(generics.ListCreateAPIView):
    """Mirrors CompanyRoleListCreateView exactly, for StoreRole/SharedStore."""

    permission_classes = [IsActiveSuperuser]
    pagination_class = BoundedPageNumberPagination

    def get_serializer_class(self):
        return StoreRoleCreateSerializer if self.request.method == "POST" else StoreRoleSerializer

    def get_queryset(self):
        store = _get_store(self.kwargs["store_id"])
        queryset = StoreRole.objects.filter(store=store).prefetch_related("permissions")

        search = self.request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(Q(code__icontains=search) | Q(name__icontains=search))

        is_active_param = self.request.query_params.get("is_active")
        if is_active_param is not None:
            queryset = queryset.filter(is_active=parse_strict_bool(is_active_param))

        return queryset.order_by("code", "id")

    def create(self, request, *args, **kwargs):
        store = _get_store(self.kwargs["store_id"])
        if not store.is_active:
            raise exceptions.ValidationError({"detail": "Store is inactive."})

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            role = create_store_role(actor=request.user, store=store, **serializer.validated_data)
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        except IntegrityError:
            raise _duplicate_store_role_code_error()
        return Response(StoreRoleSerializer(role).data, status=201)


@method_decorator(never_cache, name="dispatch")
class StoreRoleDetailView(APIView):
    """Mirrors CompanyRoleDetailView exactly - every lookup is scoped to
    the store in the URL; a role id belonging to a different store is a
    404, identical to a role id that does not exist at all.
    """

    permission_classes = [IsActiveSuperuser]

    def get(self, request, store_id, role_id):
        store = _get_store(store_id)
        role = _get_store_role(store, role_id)
        return Response(StoreRoleSerializer(role).data)

    def patch(self, request, store_id, role_id):
        store = _get_store(store_id)
        role = _get_store_role(store, role_id)
        if not store.is_active:
            raise exceptions.ValidationError({"detail": "Store is inactive."})

        serializer = StoreRoleUpdateSerializer(role, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            role = update_store_role(actor=request.user, role=role, data=serializer.validated_data)
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        return Response(StoreRoleSerializer(role).data)


@method_decorator(never_cache, name="dispatch")
class StoreRoleActivateView(APIView):
    """Rejected under an inactive store - mirrors CompanyRoleActivateView."""

    permission_classes = [IsActiveSuperuser]

    def post(self, request, store_id, role_id):
        store = _get_store(store_id)
        role = _get_store_role(store, role_id)
        if not store.is_active:
            raise exceptions.ValidationError({"detail": "Store is inactive."})
        role = activate_store_role(actor=request.user, role=role)
        return Response(StoreRoleSerializer(role).data)


@method_decorator(never_cache, name="dispatch")
class StoreRoleDeactivateView(APIView):
    """Idempotent, allowed even under an inactive store - mirrors
    CompanyRoleDeactivateView.
    """

    permission_classes = [IsActiveSuperuser]

    def post(self, request, store_id, role_id):
        store = _get_store(store_id)
        role = _get_store_role(store, role_id)
        role = deactivate_store_role(actor=request.user, role=role)
        return Response(StoreRoleSerializer(role).data)


@method_decorator(never_cache, name="dispatch")
class StoreRolePermissionsView(APIView):
    """PUT /api/v1/stores/<store_id>/roles/<role_id>/permissions/ -
    mirrors RolePermissionsView exactly. See
    apps.permissions.services.replace_store_role_permissions - only
    scope=STORE permission codes are ever accepted; a scope=COMPANY code
    is rejected the same way an unknown code is.
    """

    permission_classes = [IsActiveSuperuser]

    def put(self, request, store_id, role_id):
        store = _get_store(store_id)
        role = _get_store_role(store, role_id)
        if not store.is_active:
            raise exceptions.ValidationError({"detail": "Store is inactive."})
        if not role.is_active:
            raise exceptions.ValidationError({"detail": "Role is inactive."})

        serializer = StoreRolePermissionsReplaceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            role, codes = replace_store_role_permissions(
                actor=request.user,
                role=role,
                permission_codes=serializer.validated_data["permission_codes"],
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc

        return Response({"role": StoreRoleSerializer(role).data, "permission_codes": codes})
