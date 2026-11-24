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


class BMRDocument(models.Model):
    """Stores full BMR records (Drops, Syrup, etc.) with all section forms,
    QA checks, reconciliation, signatures, and batch data for permanent DB persistence.
    """

    company = models.ForeignKey(Company, on_delete=models.CASCADE, null=True, blank=True, related_name="bmr_documents")
    order_id = models.CharField(max_length=100, db_index=True)
    batch_no = models.CharField(max_length=100, blank=True, default="", db_index=True)
    bmr_type = models.CharField(max_length=50, default="drops")
    data = models.JSONField(default=dict)
    is_draft = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at", "-id"]

    def __str__(self):
        return f"BMRDocument order={self.order_id} batch={self.batch_no} type={self.bmr_type}"



class ProductionOrderStatus(models.Model):
    """Stores production tracking fields for a sales order.
    Keyed by company + order_reference so it can be linked to any order
    without a FK to SalesOrder (which lives in a separate app).
    """

    class BmrStatus(models.TextChoices):
        YES = "YES", "Yes"
        NO = "NO", "No"

    class DispatchStatus(models.TextChoices):
        YES = "YES", "Yes"
        NO = "NO", "No"

    company = models.ForeignKey(
        Company,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="production_order_statuses",
    )
    order_id = models.CharField(max_length=100, db_index=True)
    order_reference = models.CharField(max_length=100, blank=True, db_index=True)
    batch_no = models.CharField(max_length=100, blank=True, default="")
    bmr_status = models.CharField(max_length=10, choices=BmrStatus.choices, default=BmrStatus.NO)
    production_status = models.CharField(max_length=50, default="In Planning")
    production_remark = models.TextField(blank=True, default="")
    packaging_status = models.CharField(max_length=50, default="Pending")
    dispatch_status = models.CharField(max_length=10, choices=DispatchStatus.choices, default=DispatchStatus.NO)
    qa_status = models.CharField(max_length=50, blank=True, default="Pending")
    qa_remark = models.TextField(blank=True, default="")
    dispatched_at = models.DateTimeField(null=True, blank=True)
    dispatched_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="orders_dispatched",
    )
    is_locked = models.BooleanField(default=False, db_index=True)
    physically_dispatched = models.BooleanField(default=False)
    coa_returned = models.BooleanField(default=False, db_index=True)
    coa_returned_at = models.DateTimeField(null=True, blank=True)
    coa_returned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="coas_returned",
    )
    coa_return_reason = models.TextField(blank=True, default="")
    production_returned = models.BooleanField(default=False, db_index=True)
    production_returned_at = models.DateTimeField(null=True, blank=True)
    production_returned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="productions_returned",
    )
    production_return_reason = models.TextField(blank=True, default="")
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-updated_at", "-id"]
        unique_together = [("company", "order_id")]

    def __str__(self):
        return f"ProductionStatus order={self.order_id} company={self.company_id}"


class BMRDocumentAttachment(models.Model):
    """Stores physical BMR document files (PDFs, scans, signed forms) attached to a batch.
    Supports multiple documents per batch (Master BMR, Material Slips, Weighing, Manufacturing,
    In-process QC, Packaging, Reconciliation, etc.) with SHA-256 verification and version tracking.
    """

    class DocumentType(models.TextChoices):
        MASTER_BMR = "MASTER_BMR", "Master BMR"
        RAW_MATERIAL_SLIP = "RAW_MATERIAL_SLIP", "Raw Material Issue Slip"
        WEIGHING_SLIP = "WEIGHING_SLIP", "Weighing Slip"
        MANUFACTURING_RECORD = "MANUFACTURING_RECORD", "Manufacturing Record"
        IN_PROCESS_QC = "IN_PROCESS_QC", "In-Process QC Record"
        PACKAGING_RECORD = "PACKAGING_RECORD", "Packaging Record"
        RECONCILIATION = "RECONCILIATION", "Yield & Reconciliation Record"
        FINAL_APPROVAL = "FINAL_APPROVAL", "Final BMR Approval"
        OTHER = "OTHER", "Other BMR Attachment"

    class Status(models.TextChoices):
        ATTACHED = "ATTACHED", "Attached"
        ARCHIVED = "ARCHIVED", "Archived"

    company = models.ForeignKey(Company, on_delete=models.PROTECT, related_name="bmr_attachments")
    batch_plan = models.ForeignKey(BatchPlan, on_delete=models.PROTECT, related_name="bmr_attachments")
    batch_number = models.CharField(max_length=100, db_index=True)
    product_name_snapshot = models.CharField(max_length=255)
    product_code_snapshot = models.CharField(max_length=32, blank=True)
    bmr_number = models.CharField(max_length=100, blank=True)
    document_name = models.CharField(max_length=255)
    document_type = models.CharField(max_length=50, choices=DocumentType.choices, default=DocumentType.MASTER_BMR)
    file = models.FileField(upload_to="bmr_documents/%Y/%m/")
    file_size = models.PositiveBigIntegerField(default=0)
    mime_type = models.CharField(max_length=100, blank=True)
    sha256_checksum = models.CharField(max_length=64, blank=True, db_index=True)
    version = models.PositiveIntegerField(default=1)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ATTACHED)
    remarks = models.TextField(blank=True, default="")
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="bmr_attachments_uploaded"
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-uploaded_at", "-id"]

    def __str__(self):
        return f"BMR Attachment: {self.document_name} ({self.batch_number}) v{self.version}"

    @property
    def is_physically_attached(self):
        import os
        try:
            return bool(self.file and os.path.exists(self.file.path) and os.path.getsize(self.file.path) > 0)
        except Exception:
            return False

    @property
    def effective_attachment_status(self):
        if self.status == self.Status.ATTACHED and not self.is_physically_attached:
            return "FILE_MISSING"
        return self.status


class OrderDocumentRecord(models.Model):
    """Permanent database persistence for every order document:
    Attachment 1 (RM Requisition Slip), Attachment 2 (Test Request / Receipt),
    Attachment 3 (Bulk Release Slip), Attachment 4 (PM Requisition Slip),
    Attachment 5 (Test Request FP / After Filter / After Test),
    Attachment 6 (Finish Product Transfer Slip), BMR, COA, and INVOICE.
    Stores complete JSON data and optional file uploads for true database persistence.
    """

    class DocType(models.TextChoices):
        ATTACHMENT_1 = "ATTACHMENT_1", "Attachment 1 (RM Requisition Slip)"
        ATTACHMENT_2 = "ATTACHMENT_2", "Attachment 2 (Test Request / Receipt)"
        ATTACHMENT_3 = "ATTACHMENT_3", "Attachment 3 (Bulk Release Slip)"
        ATTACHMENT_4 = "ATTACHMENT_4", "Attachment 4 (PM Requisition Slip)"
        ATTACHMENT_5 = "ATTACHMENT_5", "Attachment 5 (After Test / FP)"
        ATTACHMENT_6 = "ATTACHMENT_6", "Attachment 6 (Transfer Slip)"
        BMR = "BMR", "Batch Manufacturing Record"
        COA = "COA", "Certificate of Analysis"
        INVOICE = "INVOICE", "Invoice"

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        SAVED = "SAVED", "Saved"
        COMPLETED = "COMPLETED", "Completed"

    company = models.ForeignKey(Company, on_delete=models.CASCADE, null=True, blank=True, related_name="order_documents")
    order_id = models.CharField(max_length=100, db_index=True)
    order_reference = models.CharField(max_length=100, blank=True, default="", db_index=True)
    product_type = models.CharField(max_length=50, blank=True, default="tablet", db_index=True)
    batch_no = models.CharField(max_length=100, blank=True, default="", db_index=True)
    doc_type = models.CharField(max_length=50, choices=DocType.choices, db_index=True)
    sub_type = models.CharField(max_length=100, blank=True, default="", db_index=True)  # e.g., "before_filter", "after_filter", "bulk", "fp"
    title = models.CharField(max_length=255, blank=True, default="")
    status = models.CharField(max_length=30, choices=Status.choices, default=Status.COMPLETED, db_index=True)
    data = models.JSONField(default=dict)
    file = models.FileField(upload_to="order_documents/%Y/%m/", null=True, blank=True)
    is_locked = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["company", "order_id", "doc_type", "sub_type"],
                name="unique_order_doc_type_sub_type",
            )
        ]

    def __str__(self):
        return f"{self.doc_type} ({self.sub_type}) for Order #{self.order_id}"


class OrderDispatchAuditLog(models.Model):
    """Audit log tracking every Dispatch, Return to Production, and Back to COA action.
    Records who, when, which order, action type, reason, and metadata.
    """

    class Action(models.TextChoices):
        DISPATCH = "DISPATCH", "Dispatched to Records & Dispatch"
        RETURN_TO_PRODUCTION = "RETURN_TO_PRODUCTION", "Returned to Production"
        BACK_TO_COA = "BACK_TO_COA", "Sent Back to COA"

    company = models.ForeignKey(Company, on_delete=models.CASCADE, null=True, blank=True, related_name="order_dispatch_logs")
    order_id = models.CharField(max_length=100, db_index=True)
    order_reference = models.CharField(max_length=100, blank=True, default="", db_index=True)
    action = models.CharField(max_length=50, choices=Action.choices, db_index=True)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="order_dispatch_actions")
    actor_username = models.CharField(max_length=150, blank=True, default="")
    reason = models.TextField(blank=True, default="")
    metadata = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return f"{self.action} on Order #{self.order_id} by {self.actor_username} at {self.created_at}"


