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
from apps.common.permissions import IsActiveSuperuser
from apps.common.validation import parse_int_filter
from apps.companies.models import Company
from apps.companies.services import active_companies_for_user
from apps.formulas.approval import (
    approve_formula_revision,
    build_approval_preview,
    load_consistent_for_preview,
    policy_status,
    reject_formula_revision,
    submit_formula_revision,
    update_approval_policy,
)
from apps.formulas.models import Formula, FormulaApprovalPolicy, FormulaLine, FormulaRevision
from apps.formulas.requirement_preview import (
    build_requirement_preview,
    load_consistent_revision,
    parse_target_output_quantity,
)
from apps.formulas.serializers import (
    ApprovalPolicyUpdateSerializer,
    FormulaCreateSerializer,
    FormulaRevisionSerializer,
    FormulaRevisionSummarySerializer,
    FormulaSerializer,
    FormulaUpdateSerializer,
    RevisionApproveSerializer,
    RevisionCreateSerializer,
    RevisionRejectSerializer,
    RevisionSubmitSerializer,
    RevisionUpdateSerializer,
)
from apps.formulas.services import (
    create_formula,
    create_formula_revision,
    update_formula,
    update_formula_revision,
)
from apps.permissions.services import user_has_permission

FORMULAS_VIEW = "formulas.view"
FORMULAS_CREATE = "formulas.create"
FORMULAS_EDIT = "formulas.edit"
FORMULAS_APPROVE = "formulas.approve"
FORMULAS_SUBMIT = "formulas.submit"


def _get_company_for_action(request, company_id, *required_permissions):
    """Same helper body every company-scoped app defines locally: unknown/
    inactive company or no active membership -> one indistinguishable 404;
    membership present but a permission missing -> 403 naming it. No
    superuser/staff bypass.
    """
    user = request.user
    company = active_companies_for_user(user).filter(pk=company_id).first()
    if company is None:
        raise exceptions.NotFound("Company not found.")
    missing = [code for code in required_permissions if not user_has_permission(user, company, code)]
    if missing:
        raise exceptions.PermissionDenied(f"The following permission(s) are required: {', '.join(missing)}.")
    return company


def _formula_queryset():
    return Formula.objects.select_related("company", "product").prefetch_related(
        Prefetch(
            "revisions",
            queryset=FormulaRevision.objects.select_related("output_uom")
            .prefetch_related("lines")
            .order_by("revision_number"),
        )
    )


def _revision_queryset():
    return FormulaRevision.objects.select_related("output_uom").prefetch_related(
        Prefetch("lines", queryset=FormulaLine.objects.select_related("material", "unit").order_by("line_number", "id"))
    )


@method_decorator(never_cache, name="dispatch")
class FormulaListCreateView(generics.ListCreateAPIView):
    """GET `formulas.view`; POST `formulas.view` + `formulas.create`.
    Filters: `?search=` (code/name), `?product=<id>`. Ordering: code, id.
    """

    permission_classes = [IsAuthenticated]
    pagination_class = BoundedPageNumberPagination

    def get_serializer_class(self):
        return FormulaCreateSerializer if self.request.method == "POST" else FormulaSerializer

    def get_queryset(self):
        company = _get_company_for_action(self.request, self.kwargs["company_id"], FORMULAS_VIEW)
        queryset = _formula_queryset().filter(company=company)
        search = self.request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(Q(code__icontains=search) | Q(name__icontains=search))
        product_param = self.request.query_params.get("product")
        if product_param is not None:
            queryset = queryset.filter(product_id=parse_int_filter(product_param, field="product"))
        return queryset.order_by("code", "id")

    def create(self, request, *args, **kwargs):
        company = _get_company_for_action(request, self.kwargs["company_id"], FORMULAS_VIEW, FORMULAS_CREATE)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            formula = create_formula(actor=request.user, company=company, **serializer.validated_data)
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        return Response(FormulaSerializer(_formula_queryset().get(pk=formula.pk)).data, status=201)


@method_decorator(never_cache, name="dispatch")
class FormulaDetailView(APIView):
    """GET `formulas.view`; PATCH `formulas.view` + `formulas.edit`
    (metadata only, `expected_version` = Formula.version).
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, company_id, formula_id):
        company = _get_company_for_action(request, company_id, FORMULAS_VIEW)
        formula = get_object_or_404(_formula_queryset(), pk=formula_id, company=company)
        return Response(FormulaSerializer(formula).data)

    def patch(self, request, company_id, formula_id):
        company = _get_company_for_action(request, company_id, FORMULAS_VIEW, FORMULAS_EDIT)
        formula = get_object_or_404(Formula, pk=formula_id, company=company)
        serializer = FormulaUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        expected_version = data.pop("expected_version")
        try:
            update_formula(actor=request.user, formula_id=formula.id, expected_version=expected_version, data=data)
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        return Response(FormulaSerializer(_formula_queryset().get(pk=formula.pk)).data)


@method_decorator(never_cache, name="dispatch")
class RevisionListCreateView(APIView):
    """GET `formulas.view` (revision summaries, no lines); POST
    `formulas.view` + `formulas.create` (new EMPTY draft revision).
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, company_id, formula_id):
        company = _get_company_for_action(request, company_id, FORMULAS_VIEW)
        formula = get_object_or_404(Formula, pk=formula_id, company=company)
        revisions = _revision_queryset().filter(formula=formula).order_by("revision_number")
        return Response(FormulaRevisionSummarySerializer(revisions, many=True).data)

    def post(self, request, company_id, formula_id):
        company = _get_company_for_action(request, company_id, FORMULAS_VIEW, FORMULAS_CREATE)
        formula = get_object_or_404(Formula, pk=formula_id, company=company)
        serializer = RevisionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            revision = create_formula_revision(actor=request.user, formula_id=formula.id, **serializer.validated_data)
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        return Response(FormulaRevisionSerializer(_revision_queryset().get(pk=revision.pk)).data, status=201)


@method_decorator(never_cache, name="dispatch")
class RevisionDetailView(APIView):
    """GET `formulas.view`; PATCH `formulas.view` + `formulas.edit`
    (`expected_version` = FormulaRevision.version). A revision id under a
    different formula/company is a 404.
    """

    permission_classes = [IsAuthenticated]

    def _revision(self, company, formula_id, revision_id, queryset):
        formula = get_object_or_404(Formula, pk=formula_id, company=company)
        return get_object_or_404(queryset, pk=revision_id, formula=formula)

    def get(self, request, company_id, formula_id, revision_id):
        company = _get_company_for_action(request, company_id, FORMULAS_VIEW)
        revision = self._revision(company, formula_id, revision_id, _revision_queryset())
        return Response(FormulaRevisionSerializer(revision).data)

    def patch(self, request, company_id, formula_id, revision_id):
        company = _get_company_for_action(request, company_id, FORMULAS_VIEW, FORMULAS_EDIT)
        revision = self._revision(company, formula_id, revision_id, FormulaRevision.objects.all())
        serializer = RevisionUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        expected_version = data.pop("expected_version")
        try:
            update_formula_revision(
                actor=request.user, revision_id=revision.id, expected_version=expected_version, data=data
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        return Response(FormulaRevisionSerializer(_revision_queryset().get(pk=revision.pk)).data)


@method_decorator(never_cache, name="dispatch")
class RevisionRequirementPreviewView(APIView):
    """GET only, `formulas.view` (same access as reading the revision; no
    superuser/role-name bypass; a revision under another formula/company is a
    404). Strictly read-only: no writes, locks, version bumps or audit events.
    A planning estimate for `?target_output_quantity=` in the revision's own
    output unit; see apps.formulas.requirement_preview for the arithmetic,
    read-consistency approach and the (many) things it does not model.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, company_id, formula_id, revision_id):
        company = _get_company_for_action(request, company_id, FORMULAS_VIEW)
        formula = get_object_or_404(Formula, pk=formula_id, company=company)
        revision = get_object_or_404(
            FormulaRevision.objects.select_related("output_uom"), pk=revision_id, formula=formula
        )
        target = parse_target_output_quantity(request.query_params, revision.output_uom)
        revision, lines = load_consistent_revision(revision.pk)
        return Response(build_requirement_preview(revision, lines, target))


@method_decorator(never_cache, name="dispatch")
class RevisionApprovalPreviewView(APIView):
    """GET only, `formulas.view`. Read-only: no writes, locks, version bumps or
    audit. Uses the same assessment as the approve command. `ready_to_attempt`
    is ELIGIBILITY, not permission (`actor_has_approve_permission` is reported
    separately). Exposes the requester's own contributor flag only.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, company_id, formula_id, revision_id):
        company = _get_company_for_action(request, company_id, FORMULAS_VIEW)
        formula = get_object_or_404(Formula, pk=formula_id, company=company)
        get_object_or_404(FormulaRevision, pk=revision_id, formula=formula)
        revision, lines, is_contributor = load_consistent_for_preview(revision_id, request.user)
        policy = FormulaApprovalPolicy.objects.filter(company=company).first()
        return Response(
            build_approval_preview(
                revision,
                lines,
                is_contributor,
                policy,
                actor_has_approve_permission=user_has_permission(request.user, company, FORMULAS_APPROVE),
            )
        )


@method_decorator(never_cache, name="dispatch")
class RevisionApproveView(APIView):
    """POST `{"expected_version": n}`. Requires `formulas.view` +
    `formulas.approve` (company scoped, no superuser/role-name bypass).
    Authority is checked again under the row lock in the service.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, company_id, formula_id, revision_id):
        company = _get_company_for_action(request, company_id, FORMULAS_VIEW, FORMULAS_APPROVE)
        formula = get_object_or_404(Formula, pk=formula_id, company=company)
        get_object_or_404(FormulaRevision, pk=revision_id, formula=formula)
        serializer = RevisionApproveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            approve_formula_revision(
                actor=request.user,
                company_id=company.id,
                formula_id=formula.id,
                revision_id=revision_id,
                expected_version=serializer.validated_data["expected_version"],
                approval_remarks=serializer.validated_data.get("approval_remarks", ""),
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        return Response(FormulaRevisionSerializer(_revision_queryset().get(pk=revision_id)).data)


class RevisionSubmitView(APIView):
    """POST `{"expected_version": n}`. Requires `formulas.view` +
    `formulas.submit`. DRAFT -> SUBMITTED - freezes the revision for QA
    review. Authority is checked again under the row lock in the service.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, company_id, formula_id, revision_id):
        company = _get_company_for_action(request, company_id, FORMULAS_VIEW, FORMULAS_SUBMIT)
        formula = get_object_or_404(Formula, pk=formula_id, company=company)
        get_object_or_404(FormulaRevision, pk=revision_id, formula=formula)
        serializer = RevisionSubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            submit_formula_revision(
                actor=request.user,
                company_id=company.id,
                formula_id=formula.id,
                revision_id=revision_id,
                expected_version=serializer.validated_data["expected_version"],
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        return Response(FormulaRevisionSerializer(_revision_queryset().get(pk=revision_id)).data)


class RevisionRejectView(APIView):
    """POST `{"expected_version": n, "rejection_reason": "..."}`. Requires
    `formulas.view` + `formulas.approve` (the same permission as approval -
    rejection is the other half of the same QA decision, not a separate
    authority). SUBMITTED -> DRAFT, same revision, editable again.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, company_id, formula_id, revision_id):
        company = _get_company_for_action(request, company_id, FORMULAS_VIEW, FORMULAS_APPROVE)
        formula = get_object_or_404(Formula, pk=formula_id, company=company)
        get_object_or_404(FormulaRevision, pk=revision_id, formula=formula)
        serializer = RevisionRejectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            reject_formula_revision(
                actor=request.user,
                company_id=company.id,
                formula_id=formula.id,
                revision_id=revision_id,
                expected_version=serializer.validated_data["expected_version"],
                rejection_reason=serializer.validated_data["rejection_reason"],
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        return Response(FormulaRevisionSerializer(_revision_queryset().get(pk=revision_id)).data)


def _approval_policy_representation(company, policy):
    return {
        "company_id": company.id,
        "status": policy_status(policy),
        "version": policy.version if policy is not None else 0,
        "allow_self_approval": policy.allow_self_approval if policy else None,
        "created_by_id": policy.created_by_id if policy else None,
        "created_at": policy.created_at if policy else None,
        "updated_by_id": policy.updated_by_id if policy else None,
        "updated_at": policy.updated_at if policy else None,
    }


@method_decorator(never_cache, name="dispatch")
class ApprovalPolicyView(APIView):
    """Active-superuser configuration (same convention as the sales-order
    confirmation policy). Configuring the policy grants NO approval authority:
    that is the separate `formulas.approve` company permission.
    """

    permission_classes = [IsActiveSuperuser]

    def get(self, request, company_id):
        company = get_object_or_404(Company, pk=company_id)
        policy = FormulaApprovalPolicy.objects.filter(company=company).first()
        return Response(_approval_policy_representation(company, policy))

    def patch(self, request, company_id):
        company = get_object_or_404(Company, pk=company_id)
        serializer = ApprovalPolicyUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        expected_version = data.pop("expected_version")
        try:
            policy = update_approval_policy(actor=request.user, company=company, expected_version=expected_version, data=data)
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        return Response(_approval_policy_representation(company, policy))
