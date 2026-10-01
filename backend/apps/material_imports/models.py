from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models


class MaterialImportBatch(models.Model):
    """Task 14C: one CSV import attempt for brand-new `Material`
    identities (raw or packaging materials) into the SHARED catalog - a
    validated PREVIEW, optionally followed by an explicit COMMIT.

    NO `company` FIELD ANYWHERE ON THIS MODEL. Materials are shared,
    cross-company catalog identities (`apps.catalog.models.Material` has
    no company FK at all - the same reasoning `apps.stores.models.
    SharedStore` already documents) - inventing a company scope for this
    import, or duplicating a material per operating company, would
    contradict that identity directly. Deliberately a SEPARATE, freshly
    written implementation from `apps.product_imports` (Task 14A) and
    `apps.formula_imports` (Task 14B) - the task's own instruction was
    explicit that a shared "import engine" refactor was out of scope, and
    this app's access model genuinely differs from both of theirs: there
    is no company/store permission axis to check at all here, only
    `apps.common.permissions.IsActiveSuperuser` - the SAME, sole,
    already-established authorization every other catalog-mutating
    endpoint in this project already requires (`apps.catalog.views`'s own
    `_read_write_permissions`) - preserved here unchanged, never relaxed
    to `shared_catalog.view` (a READ-only permission for ordinary lookups,
    never a create permission for anything in this app).

    BOUNDED SCOPE - do not read anything below as implying otherwise:
    - **Master data only.** No opening stock, receipt, lot, QC status,
      ownership, location, pricing, tax or quantity concept exists
      anywhere in this model or its rows - see `MaterialImportRow`.
    - **Create-only.** Committing never updates, reactivates or overwrites
      an existing `Material` - a code already reserved by ANY material
      (active or inactive) blocks that row, always.
    - **Never creates a `UnitOfMeasure`.** `base_unit_code` is resolved
      against what already exists; an unknown or inactive one is a row
      error, never an auto-create or an inferred conversion factor.
    - **The raw uploaded file is never stored anywhere** - parsed once,
      in memory, then discarded; `source_checksum` (sha256) is kept only
      so a re-upload of the identical file is recognisable later.

    IDENTITY AND ONE-WAY LIFECYCLE, IMMUTABILITY, `version` semantics, and
    RETENTION are all identical in spirit to `apps.product_imports.
    models.ProductImportBatch` (Task 14A) - see that model's own
    docstring for the full reasoning, unchanged here except for the
    absent `company` field: `created_by`/`source_checksum` are immutable;
    `status` moves `PREVIEWED` -> `COMMITTED` exactly once, under this
    row's own lock; `version` never increments (the concurrency guard is
    `status`, not a counter); a repeated, authorized commit at an
    already-`COMMITTED` batch's own `expected_version` is an idempotent
    no-op in the SERVICE layer.
    """

    class Status(models.TextChoices):
        PREVIEWED = "PREVIEWED", "Previewed"
        COMMITTED = "COMMITTED", "Committed"

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="material_import_batches_created"
    )
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PREVIEWED)

    source_filename = models.CharField(max_length=255, blank=True, default="")
    source_checksum = models.CharField(max_length=64)

    total_rows = models.PositiveIntegerField(default=0)
    valid_rows = models.PositiveIntegerField(default=0)
    invalid_rows = models.PositiveIntegerField(default=0)
    eligible_for_commit = models.BooleanField(default=False)
    file_errors = models.JSONField(blank=True, default=list)

    # Fixed at 1 for this row's whole life - see the module docstring.
    version = models.PositiveIntegerField(default=1)

    previewed_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    committed_at = models.DateTimeField(null=True, blank=True)
    committed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="material_import_batches_committed",
    )
    created_material_ids = models.JSONField(null=True, blank=True)

    class Meta:
        ordering = ["-previewed_at", "-id"]

    def __str__(self):
        return f"MaterialImportBatch #{self.pk or 'new'} ({self.status})"

    def clean(self):
        errors = {}
        if self.status not in self.Status.values:
            errors["status"] = f"Status must be one of {list(self.Status.values)}."
        if self.pk:
            original = (
                MaterialImportBatch.objects.filter(pk=self.pk)
                .values("created_by_id", "source_checksum", "status")
                .first()
            )
            if original is not None:
                if original["created_by_id"] != self.created_by_id:
                    errors["created_by"] = "Created by cannot be changed after creation."
                if original["source_checksum"] != self.source_checksum:
                    errors["source_checksum"] = "Source checksum cannot be changed after creation."
                if original["status"] == self.Status.COMMITTED:
                    errors["status"] = "A committed import batch cannot be changed."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError({"detail": "An import batch cannot be deleted."})


class MaterialImportRow(models.Model):
    """One parsed, normalized, already-validated CSV data row. Disposable
    staging data, like `apps.product_imports.models.ProductImportRow` -
    no immutability enforcement here. `resolved_base_unit_id` is a plain
    id, not a `ForeignKey` - the same "never couple disposable staging
    data to a master row" reasoning `apps.product_imports.models.
    ProductImportRow` already documents for the identical shape of field.
    """

    batch = models.ForeignKey(MaterialImportBatch, on_delete=models.CASCADE, related_name="rows")
    row_number = models.PositiveIntegerField()

    code = models.CharField(max_length=32, blank=True, default="")
    name = models.CharField(max_length=255, blank=True, default="")
    material_type = models.CharField(max_length=20, blank=True, default="")
    base_unit_code = models.CharField(max_length=20, blank=True, default="")
    resolved_base_unit_id = models.PositiveIntegerField(null=True, blank=True)
    description = models.CharField(max_length=2000, blank=True, default="")

    is_valid = models.BooleanField(default=False)
    errors = models.JSONField(blank=True, default=list)

    class Meta:
        ordering = ["row_number", "id"]
        constraints = [
            models.UniqueConstraint(fields=["batch", "row_number"], name="unique_material_import_row_number"),
        ]

    def __str__(self):
        return f"{self.batch_id} row {self.row_number} ({self.code})"
