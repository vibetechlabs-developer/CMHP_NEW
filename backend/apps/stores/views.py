from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from rest_framework import exceptions, generics
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.errors import translate_django_validation_error
from apps.common.pagination import BoundedPageNumberPagination
from apps.common.permissions import IsActiveSuperuser
from apps.common.validation import parse_strict_bool
from apps.permissions.models import StoreRole, StoreRoleAssignment
from apps.permissions.services import store_user_has_permission
from apps.stores.models import SharedStore, StorageLocation, StoreMembership
from apps.stores.serializers import (
    StorageLocationCreateSerializer,
    StorageLocationSerializer,
    StorageLocationUpdateSerializer,
    StoreCreateSerializer,
    StoreDetailSerializer,
    StoreMembershipCreateSerializer,
    StoreMembershipSerializer,
    StoreRoleAssignmentCreateSerializer,
    StoreRoleAssignmentSerializer,
    StoreSerializer,
    StoreUpdateSerializer,
)
from apps.stores.services import (
    active_stores_for_user,
    activate_location,
    activate_store,
    assign_store_membership,
    assign_store_membership_role,
    create_location,
    create_store,
    deactivate_location,
    deactivate_store,
    deactivate_store_membership,
    deactivate_store_membership_role,
    update_location,
    update_store,
)

User = get_user_model()

STORE_OVERVIEW_PERMISSION = "shared_store.view"
STORAGE_LOCATIONS_VIEW_PERMISSION = "storage_locations.view"


@method_decorator(never_cache, name="dispatch")
class MyStoresView(APIView):
    """GET /api/v1/stores/mine/ - Bearer access token required. Reuses
    active_stores_for_user() as-is, mirroring MyCompaniesView. Does not
    require or accept a company id - store access is independent of
    company membership entirely.
    """

    def get(self, request):
        stores = active_stores_for_user(request.user)
        return Response({"stores": StoreSerializer(stores, many=True).data})


@method_decorator(never_cache, name="dispatch")
class StoreOverviewView(APIView):
    """GET /api/v1/stores/<store_id>/overview/ - requires active store
    membership AND the `shared_store.view` permission - a deliberately
    stricter, and separate, authorization check from `/my-permissions/`
    (which only requires membership, to let a caller discover their own
    permission list even when it is empty) and from the superuser-only
    management endpoints below. Returns identity fields only - no stock/
    quantity/valuation metrics exist yet and none are invented here.
    """

    def get(self, request, store_id):
        store = active_stores_for_user(request.user).filter(pk=store_id).first()
        if store is None:
            raise NotFound("Store not found.")
        if not store_user_has_permission(request.user, store, STORE_OVERVIEW_PERMISSION):
            raise exceptions.PermissionDenied(
                f"The '{STORE_OVERVIEW_PERMISSION}' permission is required."
            )
        return Response({"id": store.id, "code": store.code, "name": store.name})


def _duplicate_store_code_error():
    return exceptions.ValidationError({"code": "A store with this code already exists."})


@method_decorator(never_cache, name="dispatch")
class StoreListCreateView(generics.ListCreateAPIView):
    """Mirrors apps.companies.views.CompanyListCreateView exactly, for
    SharedStore (no owning-company concept applies here at all).
    """

    permission_classes = [IsActiveSuperuser]
    pagination_class = BoundedPageNumberPagination

    def get_serializer_class(self):
        return StoreCreateSerializer if self.request.method == "POST" else StoreDetailSerializer

    def get_queryset(self):
        queryset = SharedStore.objects.all()

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
            store = create_store(actor=request.user, **serializer.validated_data)
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        except IntegrityError:
            raise _duplicate_store_code_error()
        return Response(StoreDetailSerializer(store).data, status=201)


@method_decorator(never_cache, name="dispatch")
class StoreDetailView(APIView):
    """GET: full management detail. PATCH: name/description only - code
    is immutable, allowed regardless of the store's own is_active state
    (see docs/backend-decisions.md, Task 07A, for why this mirrors the
    same company-level asymmetry from Task 06).
    """

    permission_classes = [IsActiveSuperuser]

    def get(self, request, store_id):
        store = get_object_or_404(SharedStore, pk=store_id)
        return Response(StoreDetailSerializer(store).data)

    def patch(self, request, store_id):
        store = get_object_or_404(SharedStore, pk=store_id)
        serializer = StoreUpdateSerializer(store, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            store = update_store(actor=request.user, store=store, data=serializer.validated_data)
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        return Response(StoreDetailSerializer(store).data)


@method_decorator(never_cache, name="dispatch")
class StoreActivateView(APIView):
    permission_classes = [IsActiveSuperuser]

    def post(self, request, store_id):
        store = get_object_or_404(SharedStore, pk=store_id)
        store = activate_store(actor=request.user, store=store)
        return Response(StoreDetailSerializer(store).data)


@method_decorator(never_cache, name="dispatch")
class StoreDeactivateView(APIView):
    """Idempotent. Never cascades - memberships/roles/role assignments
    keep whatever is_active state they already had.
    """

    permission_classes = [IsActiveSuperuser]

    def post(self, request, store_id):
        store = get_object_or_404(SharedStore, pk=store_id)
        store = deactivate_store(actor=request.user, store=store)
        return Response(StoreDetailSerializer(store).data)


@method_decorator(never_cache, name="dispatch")
class StoreMembershipListCreateView(APIView):
    """GET: every membership (active and inactive) in this store. POST:
    assign/reactivate an existing, active user - mirrors
    apps.users.views.MembershipListCreateView, keyed by store instead of
    by user.
    """

    permission_classes = [IsActiveSuperuser]

    def get(self, request, store_id):
        store = get_object_or_404(SharedStore, pk=store_id)
        memberships = StoreMembership.objects.filter(store=store).select_related("user")
        return Response(StoreMembershipSerializer(memberships, many=True).data)

    def post(self, request, store_id):
        store = get_object_or_404(SharedStore, pk=store_id)
        serializer = StoreMembershipCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = get_object_or_404(User, pk=serializer.validated_data["user_id"])

        if not user.is_active:
            raise exceptions.ValidationError({"detail": "User is inactive."})
        if not store.is_active:
            raise exceptions.ValidationError({"detail": "Store is inactive."})

        membership, created = assign_store_membership(actor=request.user, user=user, store=store)
        return Response(StoreMembershipSerializer(membership).data, status=201 if created else 200)


@method_decorator(never_cache, name="dispatch")
class StoreMembershipDeactivateView(APIView):
    """Idempotent; works even if the user/store is already inactive -
    revoking access is always allowed.
    """

    permission_classes = [IsActiveSuperuser]

    def post(self, request, store_id, membership_id):
        store = get_object_or_404(SharedStore, pk=store_id)
        membership = get_object_or_404(StoreMembership, pk=membership_id, store=store)
        membership = deactivate_store_membership(actor=request.user, membership=membership)
        return Response(StoreMembershipSerializer(membership).data)


@method_decorator(never_cache, name="dispatch")
class StoreRoleAssignmentListCreateView(APIView):
    """GET: every role assignment (active and inactive) for this
    membership. POST: assign/reactivate an existing StoreRole that
    belongs to the same store as the membership.
    """

    permission_classes = [IsActiveSuperuser]

    def _get_membership(self, store_id, membership_id):
        store = get_object_or_404(SharedStore, pk=store_id)
        return get_object_or_404(StoreMembership, pk=membership_id, store=store)

    def get(self, request, store_id, membership_id):
        membership = self._get_membership(store_id, membership_id)
        assignments = StoreRoleAssignment.objects.filter(membership=membership).select_related("role")
        return Response(StoreRoleAssignmentSerializer(assignments, many=True).data)

    def post(self, request, store_id, membership_id):
        membership = self._get_membership(store_id, membership_id)
        serializer = StoreRoleAssignmentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        role = get_object_or_404(StoreRole, pk=serializer.validated_data["role_id"])

        if not membership.user.is_active:
            raise exceptions.ValidationError({"detail": "User is inactive."})
        if not membership.store.is_active:
            raise exceptions.ValidationError({"detail": "Store is inactive."})
        if not membership.is_active:
            raise exceptions.ValidationError({"detail": "Membership is inactive."})
        if not role.is_active:
            raise exceptions.ValidationError({"detail": "Role is inactive."})
        if membership.store_id != role.store_id:
            raise exceptions.ValidationError(
                {"detail": "Role and membership must belong to the same store."}
            )

        assignment, created = assign_store_membership_role(actor=request.user, membership=membership, role=role)
        return Response(StoreRoleAssignmentSerializer(assignment).data, status=201 if created else 200)


@method_decorator(never_cache, name="dispatch")
class StoreRoleAssignmentDeactivateView(APIView):
    """Idempotent; works even if the user/store/membership/role is already
    inactive - revoking is always allowed.
    """

    permission_classes = [IsActiveSuperuser]

    def post(self, request, store_id, membership_id, assignment_id):
        store = get_object_or_404(SharedStore, pk=store_id)
        membership = get_object_or_404(StoreMembership, pk=membership_id, store=store)
        assignment = get_object_or_404(StoreRoleAssignment, pk=assignment_id, membership=membership)
        assignment = deactivate_store_membership_role(
            actor=request.user, membership=membership, role=assignment.role
        )
        return Response(StoreRoleAssignmentSerializer(assignment).data)


def _get_store_for_location_read(request, store_id):
    """Resolves the store for a locations-read endpoint under the rules
    in docs/backend-tasks.md, Task 07B: an active superuser may read
    locations for administration without any membership (and regardless
    of the store's own active state - consistent with every other
    superuser management-detail read in this project); anyone else needs
    an active membership in this specific, active store *and*
    `storage_locations.view` there. Inaccessible/inactive/nonexistent
    stores all produce the same 404 for a non-superuser - membership
    without the permission is a 403, not folded into the same 404,
    because at that point the store itself is not in question, only the
    permission is.
    """
    user = request.user
    if user.is_authenticated and user.is_active and user.is_superuser:
        return get_object_or_404(SharedStore, pk=store_id)

    store = active_stores_for_user(user).filter(pk=store_id).first()
    if store is None:
        raise NotFound("Store not found.")
    if not store_user_has_permission(user, store, STORAGE_LOCATIONS_VIEW_PERMISSION):
        raise exceptions.PermissionDenied(
            f"The '{STORAGE_LOCATIONS_VIEW_PERMISSION}' permission is required."
        )
    return store


def _duplicate_location_code_error():
    return exceptions.ValidationError({"code": "A location with this code already exists in this store."})


@method_decorator(never_cache, name="dispatch")
class StorageLocationListCreateView(generics.ListCreateAPIView):
    """GET: active superuser (any store, any state), or an active user
    with active membership in *this* store and `storage_locations.view`
    there. POST: active superuser only, rejected if the store is
    inactive. This admin/operational split mirrors
    apps.catalog.permissions.CanReadSharedCatalog's reasoning, applied at
    a single-store scope instead of "any store".
    """

    pagination_class = BoundedPageNumberPagination

    def get_permissions(self):
        return [IsAuthenticated()] if self.request.method == "GET" else [IsActiveSuperuser()]

    def get_serializer_class(self):
        return (
            StorageLocationCreateSerializer
            if self.request.method == "POST"
            else StorageLocationSerializer
        )

    def get_queryset(self):
        store = _get_store_for_location_read(self.request, self.kwargs["store_id"])
        queryset = StorageLocation.objects.filter(store=store).select_related("store")

        search = self.request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(Q(code__icontains=search) | Q(name__icontains=search))

        is_active_param = self.request.query_params.get("is_active")
        if is_active_param is not None:
            queryset = queryset.filter(is_active=parse_strict_bool(is_active_param))

        return queryset.order_by("code", "id")

    def create(self, request, *args, **kwargs):
        store = get_object_or_404(SharedStore, pk=self.kwargs["store_id"])
        if not store.is_active:
            raise exceptions.ValidationError({"detail": "Store is inactive."})

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            location = create_location(actor=request.user, store=store, **serializer.validated_data)
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        except IntegrityError:
            raise _duplicate_location_code_error()
        return Response(StorageLocationSerializer(location).data, status=201)


@method_decorator(never_cache, name="dispatch")
class StorageLocationDetailView(APIView):
    """Every lookup is scoped to the store in the URL - a location id
    belonging to a different store is a 404, identical to one that does
    not exist at all.
    """

    def get_permissions(self):
        return [IsAuthenticated()] if self.request.method == "GET" else [IsActiveSuperuser()]

    def get(self, request, store_id, location_id):
        store = _get_store_for_location_read(request, store_id)
        location = get_object_or_404(StorageLocation, pk=location_id, store=store)
        return Response(StorageLocationSerializer(location).data)

    def patch(self, request, store_id, location_id):
        store = get_object_or_404(SharedStore, pk=store_id)
        location = get_object_or_404(StorageLocation, pk=location_id, store=store)
        if not store.is_active:
            raise exceptions.ValidationError({"detail": "Store is inactive."})

        serializer = StorageLocationUpdateSerializer(location, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            location = update_location(actor=request.user, location=location, data=serializer.validated_data)
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        return Response(StorageLocationSerializer(location).data)


@method_decorator(never_cache, name="dispatch")
class StorageLocationActivateView(APIView):
    """Rejected under an inactive store - a location cannot become usable
    again while its own store is still inactive.
    """

    permission_classes = [IsActiveSuperuser]

    def post(self, request, store_id, location_id):
        store = get_object_or_404(SharedStore, pk=store_id)
        location = get_object_or_404(StorageLocation, pk=location_id, store=store)
        if not store.is_active:
            raise exceptions.ValidationError({"detail": "Store is inactive."})
        location = activate_location(actor=request.user, location=location)
        return Response(StorageLocationSerializer(location).data)


@method_decorator(never_cache, name="dispatch")
class StorageLocationDeactivateView(APIView):
    """Idempotent, allowed even under an inactive store - cleanup/
    revocation must always be possible.
    """

    permission_classes = [IsActiveSuperuser]

    def post(self, request, store_id, location_id):
        store = get_object_or_404(SharedStore, pk=store_id)
        location = get_object_or_404(StorageLocation, pk=location_id, store=store)
        location = deactivate_location(actor=request.user, location=location)
        return Response(StorageLocationSerializer(location).data)
