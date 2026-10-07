from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from apps.batch_plans.validation import validate_target_quantity, validate_unit_relationship
from apps.companies.models import Company
from apps.formulas.models import FormulaRevision
from apps.sales_orders.models import SalesOrderLine


class BatchPlan(models.Model):
    """Task 12A: Manufacturing Batch Planning Drafts. Task 12B-2: structured
    packing content and an independent manufacturing target quantity.

    A planning draft connecting:
      Sales-order line -> approved formula revision -> target output -> requirement preview.

    BOUNDED SCOPE & PLANNING DEFAULTS:
    - This record is a PLANNING DRAFT, not an official manufacturing batch or production approval.
    - Official batch numbering, sequence counters, MRP, and printing status are NOT implemented.
    - Store requisitions, stock checks, reservations, material issue, consumption, and production
      lifecycle are NOT implemented.
    - One plan references one sales-order line; multiple plans may reference the same line, and
      nothing here enforces that their planned quantities add up to, or stay within, the line's
      own ordered quantity - no allocation/fulfillment concept exists.
    - Referenced sales orders may be in DRAFT or CONFIRMED status.
    - Formula revision must be APPROVED and belong to the same company and product as the line.
    - `target_output_quantity` is ALWAYS in the formula revision's own output unit - this meaning
      is unchanged from Task 12A. It follows existing Decimal precision (max 14 digits, 3 decimal
      places) and COUNT wholeness rules, and it is an explicit, user-entered manufacturing target -
      it is never derived from the packing fields below, even when they are also present.
    - `packing_size_note` stays purely descriptive text; no conversions are performed on it and no
      legacy value is ever parsed - see `apps.batch_plans.validation` for the module docstring's
      full account of the two supported, mutually-exclusive source-unit shapes:
        A. the line's product sales unit equals the formula's output unit (unchanged Task 12A rule,
           still the default when no packing fields are supplied at all), or
        B. an explicit packing relationship - `planned_pack_quantity` (a whole COUNT quantity of
           the line's own pack unit, e.g. bottles), `packing_content_quantity` +
           `packing_content_uom` (how much MASS/VOLUME content one pack holds, e.g. grams) - all
           three always supplied together, never a partial set. This is a PLANNING INPUT, not a
           validated manufacturing instruction: nothing here confirms the real-world packing
           content is correct, only that the *arithmetic* it implies is internally consistent.
    - The internal plan ID is its identifier. It is never labeled as an official Batch No.
    """

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"

    company = models.ForeignKey(Company, on_delete=models.PROTECT, related_name="batch_plans")
    sales_order_line = models.ForeignKey(SalesOrderLine, on_delete=models.PROTECT, related_name="batch_plans")
    formula_revision = models.ForeignKey(FormulaRevision, on_delete=models.PROTECT, related_name="batch_plans")

    target_output_quantity = models.DecimalField(max_digits=14, decimal_places=3)
    planned_manufacturing_date = models.DateField(null=True, blank=True)
    packing_size_note = models.CharField(max_length=255, blank=True)
    notes = models.CharField(max_length=2000, blank=True)

    # Task 12B-2: optional, all-or-nothing (see apps.batch_plans.validation).
    planned_pack_quantity = models.DecimalField(max_digits=14, decimal_places=3, null=True, blank=True)
    packing_content_quantity = models.DecimalField(max_digits=14, decimal_places=3, null=True, blank=True)
    packing_content_uom = models.ForeignKey(
        "catalog.UnitOfMeasure", on_delete=models.PROTECT, null=True, blank=True,
        related_name="batch_plan_packing_content_uses",
    )

    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    # Printing-department fields. MRP is a working value in the sales order currency
    # (reported with the plan); no tax, invoice or stock effect.
    mrp_for_printing = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    printing_status_note = models.CharField(max_length=255, blank=True, default="")
    version = models.PositiveIntegerField(default=1)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="batch_plans_created"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Server-generated source snapshots (immutable once set)
    source_order_reference_snapshot = models.CharField(max_length=64)
    source_line_number_snapshot = models.PositiveIntegerField()
    product_id_snapshot = models.PositiveIntegerField()
    product_code_snapshot = models.CharField(max_length=32)
    product_name_snapshot = models.CharField(max_length=255)
    # The formula revision's own output unit (Task 12A meaning, unchanged).
    output_uom_id_snapshot = models.PositiveIntegerField()
    output_uom_code_snapshot = models.CharField(max_length=20)
    output_uom_name_snapshot = models.CharField(max_length=100)
    # Task 12B-2: the SOURCE line's own product sales/pack unit at creation -
    # captured always (even in shape A, where it equals output_uom_id_snapshot),
    # since it is what a shape-B packing relationship's `planned_pack_quantity`
    # is denominated in, and what source drift (below) compares against.
    pack_uom_id_snapshot = models.PositiveIntegerField()
    pack_uom_code_snapshot = models.CharField(max_length=20)
    pack_uom_name_snapshot = models.CharField(max_length=100)
    formula_id_snapshot = models.PositiveIntegerField()
    formula_code_snapshot = models.CharField(max_length=32)
    formula_name_snapshot = models.CharField(max_length=255)
    formula_revision_number_snapshot = models.PositiveIntegerField()
    formula_base_output_quantity_snapshot = models.DecimalField(max_digits=14, decimal_places=3)
    source_snapshots = models.JSONField(blank=True, default=dict)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
            models.CheckConstraint(
                check=models.Q(target_output_quantity__gt=0),
                name="batch_plan_target_output_positive",
            ),
            models.CheckConstraint(
                check=models.Q(planned_pack_quantity__isnull=True) | models.Q(planned_pack_quantity__gt=0),
                name="batch_plan_planned_pack_quantity_positive_when_set",
            ),
            models.CheckConstraint(
                check=models.Q(packing_content_quantity__isnull=True) | models.Q(packing_content_quantity__gt=0),
                name="batch_plan_packing_content_quantity_positive_when_set",
            ),
        ]

    def __str__(self):
        return f"BatchPlan #{self.pk or 'new'} ({self.company.code} - {self.product_code_snapshot})"

    def clean(self):
        self.packing_size_note = (self.packing_size_note or "").strip()
        self.notes = (self.notes or "").strip()
        errors = {}

        if self.status not in self.Status.values:
            errors["status"] = f"Status must be one of {list(self.Status.values)}."

        output_unit = getattr(self.formula_revision, "output_uom", None) if self.formula_revision_id else None
        try:
            validate_target_quantity(self.target_output_quantity, output_unit)
        except ValidationError as exc:
            errors.update(exc.message_dict)

        # Integrity checks across referenced source models on creation ONLY.
        # `sales_order_line`/`formula_revision` are immutable after creation
        # (enforced below); `planned_pack_quantity`/`packing_content_quantity`/
        # `packing_content_uom` DO remain editable after creation (Task
        # 12B-2), but this model-level check is deliberately NOT re-run for
        # every later save - a descriptive-only edit (notes/planned date/
        # packing_size_note) must stay possible even on a plan whose source
        # has since drifted incompatible (Task 12A's own rule, unchanged; see
        # `apps.batch_plans.services.assess_source_drift`). The AUTHORITATIVE
        # re-validation of a packing/target-quantity edit against current
        # locked state is `apps.batch_plans.services.update_batch_plan`'s
        # job, not this method's.
        if not self.pk:
            if self.company_id and self.sales_order_line_id:
                order_company_id = self.sales_order_line.sales_order.company_id
                if order_company_id != self.company_id:
                    errors["sales_order_line"] = "The sales order line must belong to the batch plan's company."
            if self.company_id and self.formula_revision_id:
                formula_company_id = self.formula_revision.formula.company_id
                if formula_company_id != self.company_id:
                    errors["formula_revision"] = "The formula revision must belong to the batch plan's company."
            if self.sales_order_line_id and self.formula_revision_id:
                line_product_id = self.sales_order_line.product_id
                formula_product_id = self.formula_revision.formula.product_id
                if line_product_id != formula_product_id:
                    errors["formula_revision"] = "The formula revision's product must match the sales order line's product."
                if self.formula_revision.status != FormulaRevision.Status.APPROVED:
                    errors["formula_revision"] = "Only an APPROVED formula revision can be selected for a batch plan."
                if not errors and output_unit is not None:
                    pack_unit = self.sales_order_line.product.sales_uom
                    try:
                        validate_unit_relationship(
                            pack_unit=pack_unit,
                            output_unit=output_unit,
                            planned_pack_quantity=self.planned_pack_quantity,
                            packing_content_quantity=self.packing_content_quantity,
                            packing_content_uom=self.packing_content_uom,
                        )
                    except ValidationError as exc:
                        errors.update(exc.message_dict)

        if self.pk:
            original = (
                BatchPlan.objects.filter(pk=self.pk)
                .values("company_id", "sales_order_line_id", "formula_revision_id", "created_by_id")
                .first()
            )
            if original is not None:
                if original["company_id"] != self.company_id:
                    errors["company"] = "Company cannot be changed after creation."
                if original["sales_order_line_id"] != self.sales_order_line_id:
                    errors["sales_order_line"] = "Sales order line cannot be changed after creation."
                if original["formula_revision_id"] != self.formula_revision_id:
                    errors["formula_revision"] = "Formula revision cannot be changed after creation."
                if original["created_by_id"] != self.created_by_id:
                    errors["created_by"] = "Created by cannot be changed after creation."

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError({"detail": "Batch plans cannot be deleted."})


class BatchNumberSequenceCounter(models.Model):
    """Task 12D: the ONE per-namespace sequence counter behind official
    batch numbers. Namespace: `(operating_company, client_code_snapshot,
    allocation_year)` - a documented WORKING CHOICE, not a confirmed
    client policy (see `apps.batch_plans.numbering`'s own module docstring
    for the full reasoning, including that identical displayed numbers can
    legitimately exist across two different operating companies).

    Never read with an unlocked `MAX(...)+1` - every read of `last_sequence`
    that will be used to allocate a number happens after this row (or a
    freshly-created one) is locked with `select_for_update()` - see
    `apps.batch_plans.numbering._get_or_create_counter_locked`.
    """

    operating_company = models.ForeignKey(Company, on_delete=models.PROTECT, related_name="batch_number_counters")
    client_code_snapshot = models.CharField(max_length=32)
    allocation_year = models.PositiveIntegerField()
    last_sequence = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["operating_company", "client_code_snapshot", "allocation_year"],
                name="unique_batch_number_counter_namespace",
            ),
        ]

    def __str__(self):
        return f"{self.operating_company.code}/{self.client_code_snapshot}/{self.allocation_year} -> {self.last_sequence}"


class BatchNumberAllocation(models.Model):
    """Task 12D: the ONE official batch number a `BatchPlan` will ever
    receive - a protected one-to-one record, and (unlike `BatchPlan` or
    `StorePreparation`) FULLY IMMUTABLE once created: `clean()`/`save()`
    below reject any save on an already-existing row outright, and
    `delete()` always raises. There is no edit, clear, regenerate, cancel,
    unnumber, or number-reuse path anywhere - a successfully allocated
    number is a permanently retained identifier (a documented working
    preservation rule, matching how `FormulaRevision` approval is likewise
    one-way).

    `number` is the display string (`CODEYY-NNN`, Task 12D's own
    client-confirmed format) - it is intentionally NOT globally unique:
    `client_code_snapshot`/`allocation_year`/`sequence_value` together are
    (enforced below, scoped per `operating_company`), and two different
    operating companies whose customers happen to share a code can and
    will produce the identical `number` string for their respective Nth
    allocation in a year - see `apps.batch_plans.numbering`'s module
    docstring. `allocation_timezone` records exactly which zone
    `numbered_at`'s year was computed in (`settings.BUSINESS_TIME_ZONE` at
    allocation time), so the decision stays explainable even if that
    setting is later changed.

    Never created directly from client input: `client_code_snapshot`,
    `allocation_year`, and `sequence_value` are always server-resolved
    inside `apps.batch_plans.numbering.allocate_batch_number`, under lock,
    never accepted from a request body.
    """

    batch_plan = models.OneToOneField(BatchPlan, on_delete=models.PROTECT, related_name="number_allocation")
    operating_company = models.ForeignKey(Company, on_delete=models.PROTECT, related_name="batch_number_allocations")
    number = models.CharField(max_length=40, editable=False)
    client_code_snapshot = models.CharField(max_length=32)
    allocation_year = models.PositiveIntegerField()
    sequence_value = models.PositiveIntegerField()
    numbered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="batch_numbers_allocated"
    )
    numbered_at = models.DateTimeField()
    allocation_timezone = models.CharField(max_length=64)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["operating_company", "client_code_snapshot", "allocation_year", "sequence_value"],
                name="unique_batch_number_sequence_per_namespace",
            ),
        ]

    def __str__(self):
        return self.number

    def clean(self):
        if self.pk:
            raise ValidationError({"detail": "An allocated batch number cannot be changed."})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError({"detail": "An allocated batch number cannot be deleted."})
