from django.conf import settings
from django.db import models

from apps.batch_plans.models import BatchPlan
from apps.companies.models import Company
from apps.formulas.models import FormulaRevision


class BatchManufacturingRecord(models.Model):
    """One batch manufacturing record (BMR) per batch plan. It pins the formula
    revision the batch uses and holds the two material slips. It does not
    allocate a batch number, create stock movements, or authorise production.
    """

    company = models.ForeignKey(Company, on_delete=models.PROTECT, related_name="batch_manufacturing_records")
    batch_plan = models.OneToOneField(BatchPlan, on_delete=models.PROTECT, related_name="bmr")
    formula_revision = models.ForeignKey(FormulaRevision, on_delete=models.PROTECT, related_name="bmrs")
    version = models.PositiveIntegerField(default=1)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="bmrs_created")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return f"BMR for batch plan #{self.batch_plan_id}"


class BMRLine(models.Model):
    """One line on a slip. `required_text` is the backend's exact requirement
    string (never recomputed here). `special_value` (for example "Q.S." or
    "45% V/V") is shown instead of the number when it is set. `label_claim`
    and `ar_no` are free text entered by the client's staff.
    """

    class Slip(models.TextChoices):
        RAW = "RAW", "Raw material requisition slip"
        PACKING = "PACKING", "Packing material requirement slip"

    bmr = models.ForeignKey(BatchManufacturingRecord, on_delete=models.PROTECT, related_name="lines")
    slip = models.CharField(max_length=10, choices=Slip.choices)
    line_number = models.PositiveIntegerField()
    formula_line_id = models.PositiveIntegerField()
    material_code = models.CharField(max_length=32)
    material_name = models.CharField(max_length=255)
    unit_code = models.CharField(max_length=32)
    required_text = models.CharField(max_length=60)
    special_value = models.CharField(max_length=60, blank=True, default="")
    label_claim = models.CharField(max_length=100, blank=True, default="")
    ar_no = models.CharField(max_length=100, blank=True, default="")
    # Packing slip only. Manual entry with audit; no stock movement is created.
    qty_received = models.CharField(max_length=40, blank=True, default="")
    version = models.PositiveIntegerField(default=1)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="bmr_lines_updated"
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["slip", "line_number", "id"]
        constraints = [
            models.UniqueConstraint(fields=["bmr", "slip", "line_number"], name="unique_bmr_slip_line"),
        ]

    def __str__(self):
        return f"{self.slip} line {self.line_number} of BMR #{self.bmr_id}"

    @property
    def display_required(self):
        return self.special_value or self.required_text
