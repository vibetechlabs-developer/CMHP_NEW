from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from apps.companies.models import Company


class ProductImportBatch(models.Model):
    """Task 14A: one CSV import attempt for the company-scoped `Product`
    master - a validated PREVIEW, optionally followed by an explicit
    COMMIT. This record is the ONLY thing a preview persists from the
    uploaded file: the raw bytes are never stored (see `apps.
    product_imports.services` - they are parsed once, in memory, then
    discarded; `source_checksum` is a sha256 of those bytes, kept only so
    a re-upload of the identical file is recognisable, never to
    reconstruct the file itself).

    BOUNDED SCOPE - do not read anything below as implying otherwise:
    - **Create-only.** Committing NEVER updates, reactivates or overwrites
      an existing `Product` - a code already reserved by any product
      (active or inactive) in this company blocks that row, always.
    - **No formula/material requirement, packing default, stock quantity,
      customer mapping, pricing, tax or batch data is imported here** -
      only the plain `Product` identity fields `apps.products.models.
      Product` already has (`code`, `name`, `product_type`,
      `description`, `sales_uom`).
    - **`company` always comes from the URL** (see `apps.
      product_imports.views`) - never from a CSV column or the request
      body.
    - **All-or-nothing commit.** Any invalid row at preview time, or any
      row whose validity has changed by commit time (a code taken, or a
      unit deactivated, since the preview was generated), blocks the
      ENTIRE commit - never a partial import.

    IDENTITY AND ONE-WAY LIFECYCLE: `company`, `created_by` and
    `source_checksum` are immutable once set. `status` moves `PREVIEWED`
    -> `COMMITTED` exactly once, done by `apps.product_imports.services.
    commit_import` under this row's own lock; there is no uncommit,
    retry-with-different-rows, or edit of an already-committed batch -
    once `COMMITTED`, this row is as fully immutable as `StockMovement`/
    `BatchNumberAllocation` (`clean()`/`delete()` below enforce this the
    same way those models do). A repeated, authorized commit call at the
    batch's own `expected_version` on an ALREADY-COMMITTED batch is an
    idempotent no-op in the SERVICE layer (never a second `.save()` here -
    see `commit_import`'s own docstring for why).

    KNOWN LIMITATION, disclosed the same way every other "immutable"
    model in this codebase discloses it: this override protects ordinary
    `.save()`/`.delete()` only. `QuerySet.update()`/`bulk_update()`/
    `queryset.delete()` bypass it entirely and are not prevented by
    application code.

    RETENTION - a documented WORKING POLICY, not a background job: a
    preview `expires_at` `PREVIEW_TTL_SECONDS` (see `apps.
    product_imports.services`) after it is created; `commit_import`
    refuses a commit attempt past that time with a clear, retryable error
    (create a fresh preview) rather than silently extending it. Old
    PREVIEWED batches and their rows are NOT automatically deleted by any
    scheduler - this task deliberately does not install one (see the
    task's own instruction) - so a bounded number of stale preview rows
    can accumulate over time; an administrator may delete them directly
    (a COMMITTED batch's rows are a durable record of what was actually
    imported and should normally be kept).
    """

    class Status(models.TextChoices):
        PREVIEWED = "PREVIEWED", "Previewed"
        COMMITTED = "COMMITTED", "Committed"

    company = models.ForeignKey(Company, on_delete=models.PROTECT, related_name="product_import_batches")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="product_import_batches_created"
    )
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PREVIEWED)

    # Display-only - the ORIGINAL filename as supplied by the browser,
    # never a filesystem path (nothing here ever writes the upload to
    # disk at all - see the module docstring).
    source_filename = models.CharField(max_length=255, blank=True, default="")
    source_checksum = models.CharField(max_length=64)

    total_rows = models.PositiveIntegerField(default=0)
    valid_rows = models.PositiveIntegerField(default=0)
    invalid_rows = models.PositiveIntegerField(default=0)
    eligible_for_commit = models.BooleanField(default=False)
    # File-level problems (bad encoding, missing/duplicate/unsupported
    # header columns, too many rows) - distinct from per-row `errors` on
    # `ProductImportRow`. A list of {"code", "message"} dicts.
    file_errors = models.JSONField(blank=True, default=list)

    # Optimistic-concurrency token for the ONE state-changing action this
    # resource supports (commit) - see `commit_import`. Never bumped: a
    # committed batch has nothing left that could legitimately change, so
    # unlike every other versioned resource in this project this field
    # stays 1 for the row's entire life; the concurrency guard is
    # `status`, not an incrementing counter (see `commit_import`'s own
    # docstring for the exact reasoning).
    version = models.PositiveIntegerField(default=1)

    previewed_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    committed_at = models.DateTimeField(null=True, blank=True)
    committed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="product_import_batches_committed",
    )
    # Set once, at commit, from the actual Product rows just created - a
    # "reliable result mapping" (bounded: this task's own row limit caps
    # its size) rather than re-deriving it later from anything mutable.
    created_product_ids = models.JSONField(null=True, blank=True)

    class Meta:
        ordering = ["-previewed_at", "-id"]

    def __str__(self):
        return f"ProductImportBatch #{self.pk or 'new'} ({self.status})"

    def clean(self):
        errors = {}
        if self.status not in self.Status.values:
            errors["status"] = f"Status must be one of {list(self.Status.values)}."
        if self.pk:
            original = (
                ProductImportBatch.objects.filter(pk=self.pk)
                .values("company_id", "created_by_id", "source_checksum", "status")
                .first()
            )
            if original is not None:
                if original["company_id"] != self.company_id:
                    errors["company"] = "Company cannot be changed after creation."
                if original["created_by_id"] != self.created_by_id:
                    errors["created_by"] = "Created by cannot be changed after creation."
                if original["source_checksum"] != self.source_checksum:
                    errors["source_checksum"] = "Source checksum cannot be changed after creation."
                if original["status"] == self.Status.COMMITTED:
                    # The ONLY legitimate transition is PREVIEWED -> COMMITTED,
                    # made exactly once - once COMMITTED, no further save,
                    # including one that merely repeats COMMITTED, is allowed.
                    errors["status"] = "A committed import batch cannot be changed."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError({"detail": "An import batch cannot be deleted."})


class ProductImportRow(models.Model):
    """One parsed, normalized, already-validated CSV data row belonging to
    a `ProductImportBatch`. Deliberately NOT a `Product`, and never
    directly referenced by one - `apps.product_imports.services.
    commit_import` reads these rows to build fresh `Product` instances
    but stores no link back afterward (each committed `Product`'s own id
    is recorded once, in bulk, on `ProductImportBatch.created_product_ids`
    instead).

    Disposable staging data, not a durable business record like
    `StockMovement` - no immutability enforcement exists here (see
    `ProductImportBatch`'s own docstring for this app's retention policy).
    `resolved_sales_uom_id` is a plain id, not a `ForeignKey` - a row
    referencing a unit must never be a reason a `UnitOfMeasure` cannot
    later be considered for deletion by some future task; nothing here
    should create that coupling for what is, once its batch is committed
    or abandoned, purely historical staging data.
    """

    batch = models.ForeignKey(ProductImportBatch, on_delete=models.CASCADE, related_name="rows")
    # 1-based position among the file's DATA rows only (header and fully
    # blank lines excluded, and neither counted) - see
    # `apps.product_imports.services.parse_csv` for the exact rule.
    row_number = models.PositiveIntegerField()

    code = models.CharField(max_length=32, blank=True, default="")
    name = models.CharField(max_length=255, blank=True, default="")
    product_type = models.CharField(max_length=100, blank=True, default="")
    description = models.CharField(max_length=2000, blank=True, default="")
    sales_uom_code = models.CharField(max_length=20, blank=True, default="")
    resolved_sales_uom_id = models.PositiveIntegerField(null=True, blank=True)

    is_valid = models.BooleanField(default=False)
    # A list of {"column", "message"} dicts - every practical error found
    # for this row, not just the first.
    errors = models.JSONField(blank=True, default=list)

    class Meta:
        ordering = ["row_number", "id"]
        constraints = [
            models.UniqueConstraint(fields=["batch", "row_number"], name="unique_product_import_row_number"),
        ]

    def __str__(self):
        return f"{self.batch_id} row {self.row_number} ({self.code})"
