from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from rest_framework import exceptions, generics
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.pagination import BoundedPageNumberPagination
from apps.common.permissions import IsActiveSuperuser
from apps.common.validation import parse_strict_bool
from apps.companies.models import Company, CompanyMembership
from apps.permissions.models import CompanyRole, MembershipRole
from apps.users.serializers import (
    MembershipCreateSerializer,
    MembershipSerializer,
    RoleAssignmentCreateSerializer,
    RoleAssignmentSerializer,
    UserCreateSerializer,
    UserSerializer,
    UserUpdateSerializer,
)
from apps.users.services import (
    activate_user,
    assign_company_membership,
    assign_membership_role,
    create_user,
    deactivate_company_membership,
    deactivate_membership_role,
    deactivate_user,
    update_user,
)

User = get_user_model()

ORDERING_ALLOWLIST = {"username", "-username", "date_joined", "-date_joined", "email", "-email"}


def _duplicate_user_error():
    return exceptions.ValidationError(
        {"detail": "A user with these details already exists."}
    )


@method_decorator(never_cache, name="dispatch")
class UserListCreateView(generics.ListCreateAPIView):
    """GET: paginated, searchable, filterable list. POST: create an
    ordinary user (no elevated flags, no membership/role side effects -
    see apps.users.services.create_user).
    """

    permission_classes = [IsActiveSuperuser]
    pagination_class = BoundedPageNumberPagination

    def get_serializer_class(self):
        return UserCreateSerializer if self.request.method == "POST" else UserSerializer

    def get_queryset(self):
        queryset = User.objects.all()

        search = self.request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(
                Q(username__icontains=search)
                | Q(email__icontains=search)
                | Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
            )

        is_active_param = self.request.query_params.get("is_active")
        if is_active_param is not None:
            queryset = queryset.filter(is_active=parse_strict_bool(is_active_param))

        ordering = self.request.query_params.get("ordering", "username")
        if ordering not in ORDERING_ALLOWLIST:
            raise exceptions.ValidationError(
                {"ordering": f"Must be one of {sorted(ORDERING_ALLOWLIST)}."}
            )
        # A secondary "id" key makes the ordering fully deterministic even
        # when many rows share the same primary ordering value.
        return queryset.order_by(ordering, "id")

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            user = create_user(actor=request.user, **serializer.validated_data)
        except IntegrityError:
            raise _duplicate_user_error()
        return Response(UserSerializer(user).data, status=201)


@method_decorator(never_cache, name="dispatch")
class UserDetailView(APIView):
    """GET: full safe detail. PATCH: identity fields only - see
    apps.users.serializers.UserUpdateSerializer for exactly which ones and
    what is explicitly rejected.
    """

    permission_classes = [IsActiveSuperuser]

    def get(self, request, user_id):
        user = get_object_or_404(User, pk=user_id)
        return Response(UserSerializer(user).data)

    def patch(self, request, user_id):
        user = get_object_or_404(User, pk=user_id)
        serializer = UserUpdateSerializer(user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            user = update_user(actor=request.user, user=user, data=serializer.validated_data)
        except IntegrityError:
            raise _duplicate_user_error()
        return Response(UserSerializer(user).data)


@method_decorator(never_cache, name="dispatch")
class UserActivateView(APIView):
    """Superuser target accounts are excluded - manage those in Django
    Admin for this phase (see docs/backend-decisions.md, Task 05).
    """

    permission_classes = [IsActiveSuperuser]

    def post(self, request, user_id):
        user = get_object_or_404(User, pk=user_id)
        if user.is_superuser:
            raise exceptions.PermissionDenied(
                "Superuser accounts must be managed in Django Admin."
            )
        user = activate_user(actor=request.user, user=user)
        return Response(UserSerializer(user).data)


@method_decorator(never_cache, name="dispatch")
class UserDeactivateView(APIView):
    permission_classes = [IsActiveSuperuser]

    def post(self, request, user_id):
        user = get_object_or_404(User, pk=user_id)
        # Checked before the superuser exclusion: the caller is always a
        # superuser (permission_classes above), so "deactivate myself"
        # would otherwise always be masked by "target is a superuser" and
        # this more specific, more useful message would be unreachable.
        if user.pk == request.user.pk:
            raise exceptions.ValidationError({"detail": "You cannot deactivate your own account."})
        if user.is_superuser:
            raise exceptions.PermissionDenied(
                "Superuser accounts must be managed in Django Admin."
            )
        user = deactivate_user(actor=request.user, user=user)
        return Response(UserSerializer(user).data)


@method_decorator(never_cache, name="dispatch")
class MembershipListCreateView(APIView):
    """GET: every membership (active and inactive) for this user. POST:
    assign/reactivate membership in an existing, active company - see
    apps.users.services.assign_company_membership for the
    create-vs-reactivate-vs-no-op distinction behind the 201/200 split.
    """

    permission_classes = [IsActiveSuperuser]

    def get(self, request, user_id):
        user = get_object_or_404(User, pk=user_id)
        memberships = CompanyMembership.objects.filter(user=user).select_related("company")
        return Response(MembershipSerializer(memberships, many=True).data)

    def post(self, request, user_id):
        user = get_object_or_404(User, pk=user_id)
        serializer = MembershipCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        company = get_object_or_404(Company, pk=serializer.validated_data["company_id"])

        if not user.is_active:
            raise exceptions.ValidationError({"detail": "User is inactive."})
        if not company.is_active:
            raise exceptions.ValidationError({"detail": "Company is inactive."})

        membership, created = assign_company_membership(actor=request.user, user=user, company=company)
        return Response(MembershipSerializer(membership).data, status=201 if created else 200)


@method_decorator(never_cache, name="dispatch")
class MembershipDeactivateView(APIView):
    """Idempotent; works even if the user/company is already inactive -
    revoking access is always allowed, unlike granting it.
    """

    permission_classes = [IsActiveSuperuser]

    def post(self, request, user_id, membership_id):
        user = get_object_or_404(User, pk=user_id)
        membership = get_object_or_404(CompanyMembership, pk=membership_id, user=user)
        membership = deactivate_company_membership(actor=request.user, membership=membership)
        return Response(MembershipSerializer(membership).data)


@method_decorator(never_cache, name="dispatch")
class RoleAssignmentListCreateView(APIView):
    """GET: every role assignment (active and inactive) for this
    membership. POST: assign/reactivate an existing CompanyRole that
    belongs to the same company as the membership - see
    apps.users.services.assign_membership_role, which reuses
    apps.permissions.services.assign_role() for the actual write.
    """

    permission_classes = [IsActiveSuperuser]

    def _get_membership(self, user_id, membership_id):
        user = get_object_or_404(User, pk=user_id)
        return get_object_or_404(CompanyMembership, pk=membership_id, user=user)

    def get(self, request, user_id, membership_id):
        membership = self._get_membership(user_id, membership_id)
        assignments = MembershipRole.objects.filter(membership=membership).select_related("role")
        return Response(RoleAssignmentSerializer(assignments, many=True).data)

    def post(self, request, user_id, membership_id):
        membership = self._get_membership(user_id, membership_id)
        serializer = RoleAssignmentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        role = get_object_or_404(CompanyRole, pk=serializer.validated_data["role_id"])

        if not membership.user.is_active:
            raise exceptions.ValidationError({"detail": "User is inactive."})
        if not membership.company.is_active:
            raise exceptions.ValidationError({"detail": "Company is inactive."})
        if not membership.is_active:
            raise exceptions.ValidationError({"detail": "Membership is inactive."})
        if not role.is_active:
            raise exceptions.ValidationError({"detail": "Role is inactive."})
        if membership.company_id != role.company_id:
            raise exceptions.ValidationError(
                {"detail": "Role and membership must belong to the same company."}
            )

        assignment, created = assign_membership_role(actor=request.user, membership=membership, role=role)
        return Response(RoleAssignmentSerializer(assignment).data, status=201 if created else 200)


@method_decorator(never_cache, name="dispatch")
class RoleAssignmentDeactivateView(APIView):
    """Idempotent; works even if the user/company/membership/role is
    already inactive - revoking is always allowed.
    """

    permission_classes = [IsActiveSuperuser]

    def post(self, request, user_id, membership_id, assignment_id):
        user = get_object_or_404(User, pk=user_id)
        membership = get_object_or_404(CompanyMembership, pk=membership_id, user=user)
        assignment = get_object_or_404(MembershipRole, pk=assignment_id, membership=membership)
        assignment = deactivate_membership_role(
            actor=request.user, membership=membership, role=assignment.role
        )
        return Response(RoleAssignmentSerializer(assignment).data)
