from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from rest_framework import exceptions
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.errors import translate_django_validation_error
from apps.common.pagination import BoundedPageNumberPagination
from apps.common.permissions import IsActiveSuperuser
from apps.material_imports.models import MaterialImportBatch
from apps.material_imports.serializers import (
    MaterialImportBatchSerializer,
    MaterialImportCommitSerializer,
    MaterialImportRowSerializer,
)
from apps.material_imports.services import commit_import, create_import_preview

MAX_UPLOAD_FILENAME_LEN = 255


def _get_owned_batch(request, batch_id):
    """Folds "does not exist" and "belongs to a different user" into the
    SAME 404 - mirrors apps.product_imports.views._get_owned_batch,
    minus the company axis (this catalog has none). Every caller here is
    already an active superuser (see `IsActiveSuperuser` below); ownership
    is still enforced independently - one superuser must never read or
    commit another's preview (Task 14C's own explicit instruction).
    """
    batch = (
        MaterialImportBatch.objects.select_related("created_by", "committed_by")
        .filter(pk=batch_id, created_by=request.user)
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
        "results": MaterialImportRowSerializer(page, many=True).data,
    }


def _batch_payload(request, batch):
    return {**MaterialImportBatchSerializer(batch).data, "rows": _paginate_rows(request, batch)}


@method_decorator(never_cache, name="dispatch")
class MaterialImportPreviewView(APIView):
    """POST `/api/v1/materials/import-preview/` - active superuser only
    (`IsActiveSuperuser`), the SAME, sole authorization every other
    catalog-mutating endpoint in this project already requires (`apps.
    catalog.views`'s own `_read_write_permissions`) - never relaxed to
    `shared_catalog.view` (a read-only permission). Multipart body, one
    field: `file` (CSV, UTF-8 or UTF-8-with-BOM). Never creates a
    `Material` - see `apps.material_imports.services.
    create_import_preview`. Always returns `201`, even for a file this
    task cannot parse at all.
    """

    permission_classes = [IsActiveSuperuser]

    def post(self, request):
        upload = request.FILES.get("file")
        if upload is None:
            raise exceptions.ValidationError({"file": "A CSV file is required (multipart field name: 'file')."})

        raw_bytes = upload.read()
        source_filename = (upload.name or "")[:MAX_UPLOAD_FILENAME_LEN]
        batch = create_import_preview(actor=request.user, raw_bytes=raw_bytes, source_filename=source_filename)
        return Response(_batch_payload(request, batch), status=201)


@method_decorator(never_cache, name="dispatch")
class MaterialImportPreviewDetailView(APIView):
    """GET `/api/v1/materials/import-preview/<id>/` - same authorization
    as preview creation; ownership folded into `404` (see
    `_get_owned_batch`). `?page=`/`?page_size=` over the row list.
    """

    permission_classes = [IsActiveSuperuser]

    def get(self, request, batch_id):
        batch = _get_owned_batch(request, batch_id)
        return Response(_batch_payload(request, batch))


@method_decorator(never_cache, name="dispatch")
class MaterialImportCommitView(APIView):
    """POST `/api/v1/materials/import-commit/` - same authorization as
    preview creation. Body: `{"preview_id": <batch id>, "expected_
    version": <int>}` - never a replacement material/row list. See
    `apps.material_imports.services.commit_import` for the exact all-or-
    nothing, repeat-safe commit behavior.
    """

    permission_classes = [IsActiveSuperuser]

    def post(self, request):
        serializer = MaterialImportCommitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        batch = _get_owned_batch(request, data["preview_id"])

        try:
            batch, _created_ids, _committed_now = commit_import(
                actor=request.user, batch_id=batch.id, expected_version=data["expected_version"]
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc

        batch = MaterialImportBatch.objects.select_related("created_by", "committed_by").get(pk=batch.pk)
        return Response(_batch_payload(request, batch))
