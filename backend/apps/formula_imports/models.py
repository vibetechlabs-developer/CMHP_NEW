from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from apps.companies.models import Company


class FormulaImportBatch(models.Model):
    """Task 14B: one CSV import attempt for NEW `Formula` identities (each
    with its own `DRAFT` revision 1 and material lines) - a validated
    PREVIEW, optionally followed by an explicit COMMIT. Deliberately NOT a
    generic refactor of `apps.product_imports` (Task 14A) - the shapes
    genuinely differ (a formula import has a two-level ROW/GROUP
    structure; a product import does not) and the task's own instruction
    was explicit that a shared "import engine" was out of scope.

    BOUNDED SCOPE - do not read anything below as implying otherwise:
    - **Only brand-new `Formula` identities are ever created.** This never
      adds a revision to an EXISTING formula, never edits/replaces one,
      and never touches its lines. An existing `(company, code)` -
      APPROVED or DRAFT - blocks the WHOLE commit (see `FormulaImportGroup`
      below), exactly like an already-taken code blocks a `Product` import.
    - **Never creates a `Product`/`Material`/`UnitOfMeasure`.** All three
      are resolved by code from what already exists; an unknown one is a
      row/group error, never an auto-create.
    - **Never approves anything, and never changes stock or creates a
      batch.** Every committed revision is an ordinary `DRAFT` - identical
      in every respect to one a human created through the normal UI, so it
      participates in approval/requirement-preview exactly as any other
      `DRAFT` revision would (verified by test, not merely asserted here).
    - **The raw uploaded file is never stored anywhere** - parsed once, in
      memory, then discarded; `source_checksum` (sha256) is kept only so a
      re-upload of the identical file is recognisable later.

    ROW vs. GROUP counts are DELIBERATELY separate and both persisted:
    `total_rows`/`valid_rows`/`invalid_rows` count CSV DATA rows (one row =
    one material line); `total_groups`/`valid_groups`/`invalid_groups`
    count distinct `formula_code` groups (one group = one prospective
    `Formula`). A file's row count says nothing about how many complete
    formulas it contains - see `MAX_ROWS`/`MAX_GROUPS` in `apps.
    formula_imports.services` for the two independent bounds this task's
    own instruction required ("do not assume a 5000-row file fits 2000
    complete formulas").

    IDENTITY AND ONE-WAY LIFECYCLE, IMMUTABILITY, AND `version` semantics
    are all identical to `apps.product_imports.models.ProductImportBatch`
    - see that model's own docstring for the full reasoning (repeated
    here only where it matters): `company`/`created_by`/`source_checksum`
    are immutable; `status` moves `PREVIEWED` -> `COMMITTED` exactly once,
    under this row's own lock, and never moves any other way; `version`
    never increments (the concurrency guard is `status`, not a counter -
    see `commit_import`'s own docstring); a repeated, authorized commit at
    an already-`COMMITTED` batch's own `expected_version` is an idempotent
    no-op in the SERVICE layer, never a second `.save()` here.

    RETENTION - the SAME documented WORKING POLICY as Task 14A, not a
    background job: a preview expires (`expires_at`) `PREVIEW_TTL` after
    creation; nothing auto-deletes an old `PREVIEWED` batch or its rows/
    groups - an administrator may do so directly.
    """

    class Status(models.TextChoices):
        PREVIEWED = "PREVIEWED", "Previewed"
        COMMITTED = "COMMITTED", "Committed"

    company = models.ForeignKey(Company, on_delete=models.PROTECT, related_name="formula_import_batches")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="formula_import_batches_created"
    )
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PREVIEWED)

    source_filename = models.CharField(max_length=255, blank=True, default="")
    source_checksum = models.CharField(max_length=64)

    total_rows = models.PositiveIntegerField(default=0)
    valid_rows = models.PositiveIntegerField(default=0)
    invalid_rows = models.PositiveIntegerField(default=0)
    total_groups = models.PositiveIntegerField(default=0)
    valid_groups = models.PositiveIntegerField(default=0)
    invalid_groups = models.PositiveIntegerField(default=0)
    eligible_for_commit = models.BooleanField(default=False)
    file_errors = models.JSONField(blank=True, default=list)

    # Fixed at 1 for this row's whole life - see the module docstring and
    # `commit_import`'s own docstring for why (mirrors `apps.
    # product_imports.models.ProductImportBatch.version` exactly).
    version = models.PositiveIntegerField(default=1)

    previewed_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    committed_at = models.DateTimeField(null=True, blank=True)
    committed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="formula_import_batches_committed",
    )
    # Set once, at commit: a bounded, reliable result mapping - a list of
    # {"formula_id", "code", "revision_id"} dicts, one per created formula.
    created_formulas = models.JSONField(null=True, blank=True)

    class Meta:
        ordering = ["-previewed_at", "-id"]

    def __str__(self):
        return f"FormulaImportBatch #{self.pk or 'new'} ({self.status})"

    def clean(self):
        errors = {}
        if self.status not in self.Status.values:
            errors["status"] = f"Status must be one of {list(self.Status.values)}."
        if self.pk:
            original = (
                FormulaImportBatch.objects.filter(pk=self.pk)
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
                    errors["status"] = "A committed import batch cannot be changed."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError({"detail": "An import batch cannot be deleted."})


class FormulaImportGroup(models.Model):
    """One prospective `Formula` - every CSV data row sharing the same
    (normalized) `formula_code` within one batch groups into exactly one
    of these, in the order that code FIRST appears in the file.

    `formula_name`/`product_code`/`base_output_quantity`/`output_uom_code`/
    `formula_notes`/`revision_notes` are the group's HEADER fields - every
    row contributing to this group must agree on all of them (after
    normalization); a conflict is recorded here, in `errors`, naming the
    field and the differing values - never silently resolved by picking
    one. The values stored here are whatever the FIRST contributing row
    supplied, purely for display; when `errors` names a conflict, treat
    these as one example, not the confirmed value.

    Disposable staging data, like `apps.product_imports.models.
    ProductImportRow` - no immutability enforcement here.
    """

    batch = models.ForeignKey(FormulaImportBatch, on_delete=models.CASCADE, related_name="groups")
    group_number = models.PositiveIntegerField()

    formula_code = models.CharField(max_length=32, blank=True, default="")
    formula_name = models.CharField(max_length=255, blank=True, default="")
    product_code = models.CharField(max_length=32, blank=True, default="")
    resolved_product_id = models.PositiveIntegerField(null=True, blank=True)
    base_output_quantity = models.DecimalField(max_digits=14, decimal_places=3, null=True, blank=True)
    output_uom_code = models.CharField(max_length=20, blank=True, default="")
    resolved_output_uom_id = models.PositiveIntegerField(null=True, blank=True)
    formula_notes = models.CharField(max_length=2000, blank=True, default="")
    revision_notes = models.CharField(max_length=2000, blank=True, default="")

    is_valid = models.BooleanField(default=False)
    errors = models.JSONField(blank=True, default=list)

    class Meta:
        ordering = ["group_number", "id"]
        constraints = [
            models.UniqueConstraint(fields=["batch", "group_number"], name="unique_formula_import_group_number"),
        ]

    def __str__(self):
        return f"{self.batch_id} group {self.group_number} ({self.formula_code})"


class FormulaImportLine(models.Model):
    """One material line within a `FormulaImportGroup` - the staging
    equivalent of a `FormulaLine`. `line_number` is 1-based WITHIN the
    group, in file order (never sorted, never re-ordered) - used verbatim
    as the real `FormulaLine.line_number` at commit. `file_row_number` is
    the row's position among the file's DATA rows overall (header and
    blank lines excluded), kept purely so an error message can point back
    at "row 37 of your file" even though rows for one formula may be
    interleaved with another's in the source file.

    A material code repeated within one group is NOT merged or rejected -
    it produces two separate lines here, exactly as `apps.formulas.
    services.update_formula_revision` already allows for an ordinary,
    non-imported revision (there is no uniqueness constraint on
    `(revision, material)`, only on `(revision, line_number)`).
    """

    group = models.ForeignKey(FormulaImportGroup, on_delete=models.CASCADE, related_name="lines")
    line_number = models.PositiveIntegerField()
    file_row_number = models.PositiveIntegerField()

    material_code = models.CharField(max_length=32, blank=True, default="")
    resolved_material_id = models.PositiveIntegerField(null=True, blank=True)
    material_quantity = models.DecimalField(max_digits=14, decimal_places=3, null=True, blank=True)

    is_valid = models.BooleanField(default=False)
    errors = models.JSONField(blank=True, default=list)

    class Meta:
        ordering = ["line_number", "id"]
        constraints = [
            models.UniqueConstraint(fields=["group", "line_number"], name="unique_formula_import_line_number"),
        ]

    def __str__(self):
        return f"{self.group_id} line {self.line_number} ({self.material_code})"
