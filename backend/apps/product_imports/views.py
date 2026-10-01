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
from apps.permissions.services import user_has_permission
from apps.product_imports.models import ProductImportBatch
from apps.product_imports.serializers import (
    ProductImportBatchSerializer,
    ProductImportCommitSerializer,
    ProductImportRowSerializer,
)
from apps.product_imports.services import commit_import, create_import_preview

PRODUCTS_VIEW = "products.view"
PRODUCTS_CREATE = "products.create"
PRODUCTS_IMPORT = "products.import"

# A CSV import is a bulk product-creation capability, so every endpoint
# here requires the SAME three permissions together - view, create, and
# the new import-specific permission - rather than splitting them across
# preview vs. commit. A working decision for this first slice (Task 14A),
# not a claim the client has confirmed a finer split is unnecessary.
REQUIRED_PERMISSIONS = (PRODUCTS_VIEW, PRODUCTS_CREATE, PRODUCTS_IMPORT)

MAX_UPLOAD_FILENAME_LEN = 255


def _get_company_for_action(request, company_id, *required_permissions):
    """Same fold-into-404/named-403 rule every company-scoped app in this
    project replicates locally (see e.g. apps.products.views's
    identically-bodied helper) - never imported across apps.
    """
    user = request.user
    company = active_companies_for_user(user).filter(pk=company_id).first()
    if company is None:
        raise exceptions.NotFound("Company not found.")
    missing = [code for code in required_permissions if not user_has_permission(user, company, code)]
    if missing:
        raise exceptions.PermissionDenied(f"The following permission(s) are required: {', '.join(missing)}.")
    return company


def _get_owned_batch(request, company, batch_id):
    """Folds "does not exist", "belongs to a different company" and
    "belongs to a different user" into the SAME 404 - a caller who lacks
    access to a batch must never learn which of those is true, and must
    never be able to read or commit another user's preview even within
    the same company (Task 14A's own explicit instruction).
    """
    batch = (
        ProductImportBatch.objects.select_related("company", "created_by", "committed_by")
        .filter(pk=batch_id, company=company, created_by=request.user)
        .first()
    )
    if batch is None:
        raise exceptions.NotFound("Import preview not found.")
    return batch


def _paginate_rows(request, batch):
    paginator = BoundedPageNumberPagination()
    page = paginator.paginate_queryset(batch.rows.order_by("row_number"), request)
    return {
        "count": paginator.page.paginator.count,
        "next": paginator.get_next_link(),
        "previous": paginator.get_previous_link(),
        "results": ProductImportRowSerializer(page, many=True).data,
    }


def _batch_payload(request, batch):
    return {**ProductImportBatchSerializer(batch).data, "rows": _paginate_rows(request, batch)}


@method_decorator(never_cache, name="dispatch")
class ProductImportPreviewView(APIView):
    """POST `/api/v1/companies/<company_id>/products/import-preview/` -
    `products.view` + `products.create` + `products.import`. Multipart
    body, one field: `file` (CSV, UTF-8 or UTF-8-with-BOM). Never creates
    a `Product` - see `apps.product_imports.services.
    create_import_preview`. Always returns `201` with the batch summary
    and the first page of normalized rows, even for a file this task
    could not parse at all (`file_errors` explains why, `eligible_for_
    commit` is `false`) - a stable identifier exists for every attempt.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, company_id):
        company = _get_company_for_action(request, company_id, *REQUIRED_PERMISSIONS)
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
class ProductImportPreviewDetailView(APIView):
    """GET `/api/v1/companies/<company_id>/products/import-preview/<id>/`
    - same permissions as preview creation; ownership/company are folded
    into `404` (see `_get_owned_batch`). Supports `?page=`/`?page_size=`
    over the row list, same convention as every other paginated list in
    this project.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, company_id, batch_id):
        company = _get_company_for_action(request, company_id, *REQUIRED_PERMISSIONS)
        batch = _get_owned_batch(request, company, batch_id)
        return Response(_batch_payload(request, batch))


@method_decorator(never_cache, name="dispatch")
class ProductImportCommitView(APIView):
    """POST `/api/v1/companies/<company_id>/products/import-commit/` -
    same permissions as preview creation. Body: `{"preview_id":
    <batch id>, "expected_version": <int>}` - never a replacement list of
    products (Task 14A's own explicit instruction). See `apps.
    product_imports.services.commit_import` for the exact all-or-nothing,
    repeat-safe commit behavior.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, company_id):
        company = _get_company_for_action(request, company_id, *REQUIRED_PERMISSIONS)
        serializer = ProductImportCommitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Ownership/company access is checked here, before the service
        # ever runs (the service has no permission or ownership awareness
        # of its own, matching every other service in this project) - a
        # cross-company or another user's preview id folds into the same
        # 404 `_get_owned_batch` already gives on GET.
        batch = _get_owned_batch(request, company, data["preview_id"])

        try:
            batch, _created_ids, _committed_now = commit_import(
                actor=request.user,
                company=company,
                batch_id=batch.id,
                expected_version=data["expected_version"],
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc

        batch = (
            ProductImportBatch.objects.select_related("company", "created_by", "committed_by").get(pk=batch.pk)
        )
        return Response(_batch_payload(request, batch))
