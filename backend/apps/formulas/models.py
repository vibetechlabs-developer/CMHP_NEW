from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from apps.catalog.models import Material, UnitOfMeasure
from apps.companies.models import Company, normalize_code
from apps.products.models import Product


class Formula(models.Model):
    """A company-scoped manufacturing formula IDENTITY for one Product -
    Task 11A, draft preparation only.

    CONFIRMED SCOPE BOUNDARY: no approval, batch creation, requirement
    generation, reservation, material issue or production exists. Nothing
    here marks a formula as default/approved: several formulas per product
    are allowed and none is implied to be "the" formula. Specification
    tests (`apps.quality`) are a completely separate concept and share
    nothing with formulas.

    WORKING IMPLEMENTATION CHOICES (not client-approved manufacturing
    policy): company scoping (like Customer/Product); simple quantity-
    based drafting (a revision states a positive `base_output_quantity`
    and plain material quantities - no unit conversion, percentage,
    potency, density, yield allowance, waste factor, fixed-quantity or
    packaging-rounding logic, and no proportional scaling).

    `company`, `product` and `code` are immutable; `product` must belong
    to `company`. The FOUR version-like values are deliberately distinct
    (same lesson as `MaterialSpecification`):
    - `Formula.version` - concurrency token for this row's own
      `name`/`notes` (PATCH `.../formulas/<id>/`).
    - `Formula.latest_revision_number` - allocation counter, bumped only
      while this row is locked when a revision is created; never a
      concurrency token; unaffected by metadata edits.
    - `FormulaRevision.revision_number` - the sequential draft number
      (1, 2, 3, ...), never reused.
    - `FormulaRevision.version` - concurrency token for one revision's
      content (base output, notes, lines).
    """

    company = models.ForeignKey(Company, on_delete=models.PROTECT, related_name="formulas")
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="formulas")
    code = models.CharField(max_length=32)
    name = models.CharField(max_length=255)
    notes = models.CharField(max_length=2000, blank=True)
    latest_revision_number = models.PositiveIntegerField(default=0)
    version = models.PositiveIntegerField(default=1)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="formulas_created"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["company_id", "code"]
        constraints = [
            models.UniqueConstraint(fields=["company", "code"], name="unique_formula_company_code"),
        ]

    def __str__(self):
        return f"{self.company.code}/{self.code}"

    def clean(self):
        self.code = normalize_code(self.code)
        self.name = (self.name or "").strip()
        self.notes = (self.notes or "").strip()
        errors = {}
        if not self.code:
            errors["code"] = "Code is required."
        if not self.name:
            errors["name"] = "Name is required."
        if self.company_id and self.product_id and self.product.company_id != self.company_id:
            errors["product"] = "The product must belong to the formula's company."
        if self.pk:
            original = Formula.objects.filter(pk=self.pk).values("company_id", "product_id", "code").first()
            if original is not None:
                if original["company_id"] != self.company_id:
                    errors["company"] = "Company cannot be changed after creation."
                if original["product_id"] != self.product_id:
                    errors["product"] = "Product cannot be changed after creation."
                if original["code"] != self.code:
                    errors["code"] = "Code cannot be changed after creation."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        if self.revisions.filter(status=FormulaRevision.Status.APPROVED).exists():
            raise ValidationError({"detail": "A formula with an approved revision cannot be deleted."})
        return super().delete(*args, **kwargs)


class FormulaRevision(models.Model):
    """One DRAFT revision of a formula: a base output quantity plus raw-
    and packaging-material lines that are saved together atomically.
    Statuses: `DRAFT` (editable) and `APPROVED` (Task 11C). DRAFT -> APPROVED
    is the only transition (`apps.formulas.approval.approve_formula_revision`);
    there is no unapprove, clone, retire, supersede or production lifecycle, and
    several approved revisions may coexist (nothing selects a "current" one).
    APPROVAL DOES NOT create batches, reserve stock, issue materials, validate
    manufacturing scaling or authorize production.

    An APPROVED revision is immutable: its content (base output, notes, lines)
    and approval record cannot change through any service, API or admin path
    (enforced in `clean()`/`FormulaLine.clean()`/`delete()`, and by the
    services under the row lock). KNOWN LIMITATION, same as every model here:
    `QuerySet.update()`/`bulk_*`/`queryset.delete()` bypass model methods.

    `approved_by`/`approved_at` record who approved and when;
    `approval_policy_version`/`approval_policy_snapshot` record the company
    policy values applied; `approved_identity_snapshot` freezes the display
    identity (formula code/name/notes, product, units) so later Formula-master
    edits cannot rewrite what the approved record represents.
    `contributor_history_complete` says whether `FormulaRevisionContributor`
    holds every user who created or substantively changed this revision (see
    that model); it defaults to False (fail closed) and is set True only for
    revisions registered by the services or verified during the backfill.

    `output_uom` defaults to `product.sales_uom` at creation, but (Task
    12B-2) a NEW revision may instead be given any explicit, active unit at
    creation time (`apps.formulas.services.create_formula`/
    `create_formula_revision`'s `output_uom_id`) - e.g. a product sold in
    bottles whose formula is manufactured in kilograms. Either way it is
    immutable once set. No general unit-conversion engine exists here;
    `apps.batch_plans.services` is the one place an explicit, documented
    conversion between a packing-content unit and this field is ever
    computed. Lines are never scaled to another output quantity.
    """

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        APPROVED = "APPROVED", "Approved"

    formula = models.ForeignKey(Formula, on_delete=models.CASCADE, related_name="revisions")
    revision_number = models.PositiveIntegerField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    base_output_quantity = models.DecimalField(max_digits=14, decimal_places=3)
    output_uom = models.ForeignKey(UnitOfMeasure, on_delete=models.PROTECT, related_name="formula_revisions")
    notes = models.CharField(max_length=2000, blank=True)
    version = models.PositiveIntegerField(default=1)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="formula_revisions_created"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    contributor_history_complete = models.BooleanField(default=False)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="formula_revisions_approved",
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    approval_policy_version = models.PositiveIntegerField(null=True, blank=True)
    approval_policy_snapshot = models.JSONField(null=True, blank=True)
    approved_identity_snapshot = models.JSONField(null=True, blank=True)

    class Meta:
        ordering = ["formula_id", "revision_number"]
        constraints = [
            models.UniqueConstraint(fields=["formula", "revision_number"], name="unique_formula_revision_number"),
            models.CheckConstraint(
                check=models.Q(base_output_quantity__gt=0), name="formula_revision_base_output_positive"
            ),
        ]

    def __str__(self):
        return f"{self.formula} rev {self.revision_number}"

    def clean(self):
        self.notes = (self.notes or "").strip()
        errors = {}
        if self.status not in self.Status.values:
            errors["status"] = f"Status must be one of {list(self.Status.values)}."
        if self.base_output_quantity is not None and self.base_output_quantity <= 0:
            errors["base_output_quantity"] = "Base output quantity must be greater than zero."
        if self.status == self.Status.APPROVED:
            if self.approved_by_id is None or self.approved_at is None:
                errors["status"] = "An approved revision must record who approved it and when."
        elif self.approved_by_id is not None or self.approved_at is not None:
            errors["status"] = "Only an approved revision may carry approval details."
        if self.pk:
            original = (
                FormulaRevision.objects.filter(pk=self.pk)
                .values(
                    "formula_id", "revision_number", "output_uom_id", "status", "base_output_quantity",
                    "notes", "approved_by_id", "approved_at",
                )
                .first()
            )
            if original is not None and original["status"] == self.Status.APPROVED:
                for field in ("status", "base_output_quantity", "notes", "approved_by_id", "approved_at"):
                    if original[field] != getattr(self, field):
                        errors[field.replace("_id", "")] = "An approved revision cannot be changed."
            if original is not None:
                if original["formula_id"] != self.formula_id:
                    errors["formula"] = "Formula cannot be changed after creation."
                if original["revision_number"] != self.revision_number:
                    errors["revision_number"] = "Revision number cannot be changed after creation."
                if original["output_uom_id"] != self.output_uom_id:
                    errors["output_uom"] = "Output unit cannot be changed after creation."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        if self.status == self.Status.APPROVED:
            raise ValidationError({"detail": "An approved revision cannot be deleted."})
        return super().delete(*args, **kwargs)


class FormulaRevisionContributor(models.Model):
    """Task 11C: one row per user who CREATED a revision or made a SUBSTANTIVE
    CONTENT change to it (base output, revision notes or material lines).
    Formula-master metadata edits (name/notes on `Formula`) are NOT content
    edits, and a no-op update adds nobody. Rows are added by
    `apps.formulas.services` inside the same transaction as the creation/edit,
    are never removed, and are what the self-approval rule reads. This
    definition is an explicit WORKING RULE for client review, not a confirmed
    regulatory requirement. Whether the set is complete for a legacy revision
    is recorded separately on `FormulaRevision.contributor_history_complete`.
    """

    revision = models.ForeignKey(FormulaRevision, on_delete=models.CASCADE, related_name="contributors")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="formula_revision_contributions"
    )
    first_contributed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["revision", "user"], name="unique_formula_revision_contributor"),
        ]

    def __str__(self):
        return f"{self.revision} contributor {self.user_id}"


class FormulaApprovalPolicy(models.Model):
    """Task 11C: a company's EXPLICIT answer to the still-open self-approval
    question. One row per operating company. `allow_self_approval` is `null`
    (unanswered) until an administrator answers it - NO default. A missing row
    or a `null` value blocks approval with `formula_approval_policy_not_
    configured`. Configured by an active superuser through
    `/companies/<id>/formula-approval-policy/` (audited, `expected_version`, 0
    to create); that authority is not approval authority - approving needs the
    separate COMPANY permission `formulas.approve`.
    """

    company = models.OneToOneField(Company, on_delete=models.PROTECT, related_name="formula_approval_policy")
    allow_self_approval = models.BooleanField(null=True, blank=True)
    version = models.PositiveIntegerField(default=1)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="formula_approval_policies_created"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="formula_approval_policies_updated"
    )
    updated_at = models.DateTimeField(auto_now=True)

    VALUE_FIELDS = ("allow_self_approval",)

    def __str__(self):
        return f"{self.company.code} formula approval policy v{self.version}"

    @property
    def is_complete(self):
        return all(getattr(self, field) is not None for field in self.VALUE_FIELDS)


class FormulaLine(models.Model):
    """One material line of a draft revision. `unit` is always derived from
    `material.base_unit` (never client-supplied) and `material_kind_
    snapshot` is always the material's own `Material.kind` (RAW_MATERIAL or
    PACKAGING_MATERIAL) - a client can never state a contradicting type.
    Snapshots are captured for new lines or when the material is replaced,
    never refreshed on unrelated edits. `line_number` is one server-
    assigned sequence across both material types.
    """

    revision = models.ForeignKey(FormulaRevision, on_delete=models.CASCADE, related_name="lines")
    line_number = models.PositiveIntegerField()
    material = models.ForeignKey(Material, on_delete=models.PROTECT, related_name="formula_lines")
    quantity = models.DecimalField(max_digits=14, decimal_places=3)
    unit = models.ForeignKey(UnitOfMeasure, on_delete=models.PROTECT, related_name="formula_lines")
    notes = models.CharField(max_length=500, blank=True)
    # Client-defined free text, entered per formula line. Not used in any calculation.
    label_claim = models.CharField(max_length=100, blank=True, default="")
    ar_no = models.CharField(max_length=100, blank=True, default="")
    # Non-numeric value such as "Q.S." or "45% V/V". Shown instead of a number when set.
    special_value = models.CharField(max_length=60, blank=True, default="")
    material_code_snapshot = models.CharField(max_length=32, blank=True)
    material_name_snapshot = models.CharField(max_length=255, blank=True)
    material_kind_snapshot = models.CharField(max_length=20, blank=True)
    unit_code_snapshot = models.CharField(max_length=20, blank=True)
    unit_name_snapshot = models.CharField(max_length=100, blank=True)

    class Meta:
        ordering = ["line_number", "id"]
        constraints = [
            models.UniqueConstraint(fields=["revision", "line_number"], name="unique_formula_line_number"),
            models.CheckConstraint(check=models.Q(quantity__gt=0), name="formula_line_quantity_positive"),
        ]

    def __str__(self):
        return f"{self.revision} line {self.line_number}"

    def clean(self):
        self.notes = (self.notes or "").strip()
        if self.quantity is not None and self.quantity <= 0:
            raise ValidationError({"quantity": "Quantity must be greater than zero."})
        if self.revision_id and self.revision.status == FormulaRevision.Status.APPROVED:
            raise ValidationError({"detail": "The lines of an approved revision cannot be changed."})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        if self.revision.status == FormulaRevision.Status.APPROVED:
            raise ValidationError({"detail": "The lines of an approved revision cannot be deleted."})
        return super().delete(*args, **kwargs)
