from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from rest_framework import exceptions
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.errors import translate_django_validation_error
from apps.common.pagination import BoundedPageNumberPagination
from apps.companies.services import active_companies_for_user
from apps.formula_imports.models import FormulaImportBatch
from apps.formula_imports.serializers import (
    FormulaImportBatchSerializer,
    FormulaImportCommitSerializer,
    FormulaImportGroupSerializer,
)
from apps.formula_imports.services import commit_import, create_import_preview
from apps.permissions.services import user_has_permission, user_has_permission_in_any_store

FORMULAS_VIEW = "formulas.view"
FORMULAS_CREATE = "formulas.create"
FORMULAS_IMPORT = "formulas.import"
# Reused UNCHANGED from apps.catalog.permissions.CATALOG_VIEW_PERMISSION -
# never a new catalog permission, and never grants store access itself
# (this task's own explicit instruction). Deliberately NOT reusing
# apps.catalog.permissions.CanReadSharedCatalog (the permission CLASS)
# directly - that class also grants a superuser bypass, which this task
# explicitly forbids for every permission checked here; the underlying
# `user_has_permission_in_any_store` check is reused instead, without it.
SHARED_CATALOG_VIEW = "shared_catalog.view"

REQUIRED_COMPANY_PERMISSIONS = (FORMULAS_VIEW, FORMULAS_CREATE, FORMULAS_IMPORT)

MAX_UPLOAD_FILENAME_LEN = 255


def _get_company_for_action(request, company_id):
    """Same fold-into-404 rule every company-scoped app in this project
    replicates locally - a nonexistent/inactive company, or one the
    caller has no active membership in, is indistinguishable from the
    caller lacking access. Holding `formulas.view`/`formulas.create`/
    `formulas.import` in the company AND `shared_catalog.view` in at
    least one active store (the SAME rule `apps.catalog.permissions.
    CanReadSharedCatalog` already enforces for ordinary material lookups,
    reused here rather than inventing a new permission) are both checked
    together, in ONE combined 403 naming everything missing - no
    superuser/is_staff/role-name bypass for either kind of permission.
    """
    user = request.user
    company = active_companies_for_user(user).filter(pk=company_id).first()
    if company is None:
        raise exceptions.NotFound("Company not found.")
    missing = [code for code in REQUIRED_COMPANY_PERMISSIONS if not user_has_permission(user, company, code)]
    if not user_has_permission_in_any_store(user, SHARED_CATALOG_VIEW):
        missing.append(SHARED_CATALOG_VIEW)
    if missing:
        raise exceptions.PermissionDenied(f"The following permission(s) are required: {', '.join(missing)}.")
    return company


def _get_owned_batch(request, company, batch_id):
    """Folds "does not exist", "belongs to a different company" and
    "belongs to a different user" into the SAME 404 - mirrors apps.
    product_imports.views._get_owned_batch exactly, for the identical
    reason (Task 14A/14B's own explicit instruction: another user, even
    in the same company, must never read or commit someone else's
    preview).
    """
    batch = (
        FormulaImportBatch.objects.select_related("company", "created_by", "committed_by")
        .filter(pk=batch_id, company=company, created_by=request.user)
        .first()
    )
    if batch is None:
        raise exceptions.NotFound("Import preview not found.")
    return batch


def _paginate_groups(request, batch):
    paginator = BoundedPageNumberPagination()
    page = paginator.paginate_queryset(
        batch.groups.prefetch_related("lines").order_by("group_number"), request
    )
    return {
        "count": paginator.page.paginator.count,
        "next": paginator.get_next_link(),
        "previous": paginator.get_previous_link(),
        "results": FormulaImportGroupSerializer(page, many=True).data,
    }


def _batch_payload(request, batch):
    return {**FormulaImportBatchSerializer(batch).data, "groups": _paginate_groups(request, batch)}


@method_decorator(never_cache, name="dispatch")
class FormulaImportPreviewView(APIView):
    """POST `/api/v1/companies/<company_id>/formulas/import-preview/` -
    `formulas.view` + `formulas.create` + `formulas.import` in the
    company, AND `shared_catalog.view` in at least one active store.
    Multipart body, one field: `file` (CSV, UTF-8 or UTF-8-with-BOM).
    Never creates a `Formula`/`FormulaRevision`/`FormulaLine` - see
    `apps.formula_imports.services.create_import_preview`. Always returns
    `201` with the batch summary and the first page of groups (each with
    its own nested lines), even for a file this task could not parse at
    all.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, company_id):
        company = _get_company_for_action(request, company_id)
        upload = request.FILES.get("file")
        if upload is None:
            raise exceptions.ValidationError({"file": "A CSV file is required (multipart field name: 'file')."})

        raw_bytes = upload.read()
        source_filename = (upload.name or "")[:MAX_UPLOAD_FILENAME_LEN]
        batch = create_import_preview(
            actor=request.user, company=company, raw_bytes=raw_bytes, source_filename=source_filename
        )
        return Response(_batch_payload(request, batch), status=201)


@method_decorator(never_cache, name="dispatch")
class FormulaImportPreviewDetailView(APIView):
    """GET `/api/v1/companies/<company_id>/formulas/import-preview/<id>/`
    - same permissions as preview creation; ownership/company folded into
    `404` (see `_get_owned_batch`). `?page=`/`?page_size=` paginate
    GROUPS (each with its own nested lines), same convention as every
    other paginated list in this project.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, company_id, batch_id):
        company = _get_company_for_action(request, company_id)
        batch = _get_owned_batch(request, company, batch_id)
        return Response(_batch_payload(request, batch))


@method_decorator(never_cache, name="dispatch")
class FormulaImportCommitView(APIView):
    """POST `/api/v1/companies/<company_id>/formulas/import-commit/` -
    same permissions as preview creation. Body: `{"preview_id":
    <batch id>, "expected_version": <int>}` - never a replacement
    formula/group/line list. See `apps.formula_imports.services.
    commit_import` for the exact all-or-nothing, repeat-safe commit
    behavior.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, company_id):
        company = _get_company_for_action(request, company_id)
        serializer = FormulaImportCommitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Ownership/company access is checked here, before the service
        # ever runs (the service has no permission or ownership awareness
        # of its own) - a cross-company or another user's preview id
        # folds into the same 404 `_get_owned_batch` already gives on GET.
        batch = _get_owned_batch(request, company, data["preview_id"])

        try:
            batch, _created, _committed_now = commit_import(
                actor=request.user,
                company=company,
                batch_id=batch.id,
                expected_version=data["expected_version"],
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc

        batch = (
            FormulaImportBatch.objects.select_related("company", "created_by", "committed_by").get(pk=batch.pk)
        )
        return Response(_batch_payload(request, batch))
