from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from apps.catalog.models import Material, UnitOfMeasure
from apps.companies.models import Company
from apps.suppliers.models import Supplier


class PurchaseRequest(models.Model):
    """An internal record of a material need raised by one company.

    Not a Purchase Order: does not reference a supplier or a price, and
    approval never automatically creates a PO or touches stock (Task
    08B-2 scope; see docs/purchase-workflow-proposal.md).

    `SUBMITTED` starts a three-step approval round (Task 08B-2): steps
    are neutral ("Step 1"/"Step 2"/"Step 3"), each decided by whichever
    company member holds `purchase_requests.approve` - there is no
    separate per-step role, and "Business Admin" here means exactly
    "holds this permission", never Django `is_superuser`/`is_staff`. Only
    the third step's approval moves a request to `APPROVED`; a rejection
    at any step moves it straight to `REJECTED` (see
    apps.purchasing.services for the full state machine). `current_round`/
    `current_step` track where an in-progress approval is; see
    PurchaseRequestApprovalRound for the append-only per-round history
    that survives a reject-revise-resubmit cycle without being
    overwritten.

    CONFIRMED BUSINESS DECISION: `company` is the company that *needs*
    the material, not necessarily the company that will eventually place
    a Purchase Order, receive the supplier's bill, or legally own the
    resulting stock - those are separate, still-unresolved questions
    (see docs/purchase-workflow-proposal.md). `company` is immutable
    after creation - the requesting company never changes on an existing
    request; a different company that also needs the same material
    raises its own separate PurchaseRequest.

    `version` supports optimistic concurrency: every PATCH/submit/cancel
    call must supply the `version` it last observed. A mismatch (another
    change happened first) is rejected without applying anything, so two
    concurrent editors can never silently clobber each other's change or
    double-apply a transition - see apps.purchasing.services for the
    exact retry/no-op rules.
    """

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        SUBMITTED = "SUBMITTED", "Submitted"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"
        CANCELLED = "CANCELLED", "Cancelled"

    company = models.ForeignKey(Company, on_delete=models.PROTECT, related_name="purchase_requests")
    reference = models.CharField(max_length=40, unique=True, editable=False)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    required_by = models.DateField(null=True, blank=True)
    notes = models.CharField(max_length=2000, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="purchase_requests_created"
    )
    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="purchase_requests_submitted",
    )
    submitted_at = models.DateTimeField(null=True, blank=True)
    cancelled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="purchase_requests_cancelled",
    )
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancellation_reason = models.CharField(max_length=1000, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    version = models.PositiveIntegerField(default=1)
    current_round = models.PositiveIntegerField(
        default=0,
        help_text="0 until the first submit. Incremented by each submit that actually starts a new "
        "approval round - see apps.purchasing.services.submit_purchase_request. Never decremented, "
        "even after a reject/revise/resubmit cycle - it always names the most recent round, whether "
        "that round is still pending, or has already closed as APPROVED/REJECTED/CANCELLED.",
    )
    current_step = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="1..3 while `status=SUBMITTED` (which step is currently pending); null at every other "
        "status, including immediately after that round closes - see PurchaseRequestApproval for which "
        "step actually decided a closed round.",
    )

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return self.reference

    def clean(self):
        self.notes = (self.notes or "").strip()
        self.cancellation_reason = (self.cancellation_reason or "").strip()
        errors = {}
        if not self.reference:
            errors["reference"] = "Reference is required."
        if self.status not in self.Status.values:
            errors["status"] = f"Status must be one of {list(self.Status.values)}."
        if self.pk:
            original = (
                PurchaseRequest.objects.filter(pk=self.pk).values("company_id", "reference").first()
            )
            if original is not None:
                if original["company_id"] != self.company_id:
                    errors["company"] = "Company cannot be changed after creation."
                if original["reference"] != self.reference:
                    errors["reference"] = "Reference cannot be changed after creation."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)


class PurchaseRequestLine(models.Model):
    """One requested material/quantity within a PurchaseRequest.

    `unit` is always derived from `material.base_unit` at the moment the
    line is created or replaced - never accepted directly from a caller
    (see apps.purchasing.services) - since no unit-conversion engine
    exists (Task 07B) and a request must always speak in the material's
    own base unit.

    `material_code_snapshot`/`material_name_snapshot`/`unit_code_
    snapshot`/`unit_name_snapshot` are populated only at submission time
    (apps.purchasing.services.submit_purchase_request) - a DRAFT line
    always reflects the live `material`/`unit` rows (it is still
    editable, so there is nothing yet to protect), but a SUBMITTED
    line's snapshot is frozen so a later rename of the material or unit
    never rewrites what was actually submitted for review.

    `line_number` fixes display order independently of primary-key
    ordering, since draft-line replacement (apps.purchasing.services.
    update_purchase_request) deletes and recreates rows rather than
    reordering them in place.
    """

    purchase_request = models.ForeignKey(PurchaseRequest, on_delete=models.CASCADE, related_name="lines")
    line_number = models.PositiveIntegerField()
    material = models.ForeignKey(Material, on_delete=models.PROTECT, related_name="purchase_request_lines")
    quantity = models.DecimalField(max_digits=14, decimal_places=3)
    unit = models.ForeignKey(UnitOfMeasure, on_delete=models.PROTECT, related_name="purchase_request_lines")
    notes = models.CharField(max_length=500, blank=True)
    material_code_snapshot = models.CharField(max_length=32, blank=True)
    material_name_snapshot = models.CharField(max_length=255, blank=True)
    unit_code_snapshot = models.CharField(max_length=20, blank=True)
    unit_name_snapshot = models.CharField(max_length=100, blank=True)

    class Meta:
        ordering = ["line_number", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["purchase_request", "material"], name="unique_material_per_purchase_request"
            ),
            models.CheckConstraint(check=models.Q(quantity__gt=0), name="purchase_request_line_quantity_positive"),
        ]

    def __str__(self):
        return f"{self.purchase_request.reference} line {self.line_number}"

    def clean(self):
        self.notes = (self.notes or "").strip()
        errors = {}
        if self.quantity is not None and self.quantity <= 0:
            errors["quantity"] = "Quantity must be greater than zero."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)


class PurchaseRequestApprovalRound(models.Model):
    """One approval round's immutable header snapshot, taken the moment
    that round's `submit` actually happened - apps.purchasing.services.
    submit_purchase_request creates exactly one of these per round, never
    updates it afterwards except `outcome`/`closed_at` when the round
    ends. This is what lets a reject -> revise -> resubmit cycle keep
    every earlier round's submitted content forever, even though the
    live PurchaseRequest/PurchaseRequestLine rows get edited and
    resubmitted in place: `required_by_snapshot`/`notes_snapshot` here,
    and each PurchaseRequestApprovalRoundLine under it, are a permanent
    copy - never touched again once this round closes, unlike
    PurchaseRequestLine.*_snapshot, which is overwritten by the *next*
    submit.

    `round_number` starts at 1 and increases by exactly 1 each time a
    DRAFT is actually (re)submitted - see
    PurchaseRequest.current_round - never reused, never renumbered.
    """

    class Outcome(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"
        CANCELLED = "CANCELLED", "Cancelled"

    purchase_request = models.ForeignKey(
        PurchaseRequest, on_delete=models.CASCADE, related_name="approval_rounds"
    )
    round_number = models.PositiveIntegerField()
    required_by_snapshot = models.DateField(null=True, blank=True)
    notes_snapshot = models.CharField(max_length=2000, blank=True)
    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="purchase_request_rounds_submitted"
    )
    submitted_at = models.DateTimeField()
    outcome = models.CharField(max_length=10, choices=Outcome.choices, default=Outcome.PENDING)
    closed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["purchase_request", "round_number"]
        constraints = [
            models.UniqueConstraint(
                fields=["purchase_request", "round_number"], name="unique_round_per_purchase_request"
            ),
        ]

    def __str__(self):
        return f"{self.purchase_request.reference} round {self.round_number}"


class PurchaseRequestApprovalRoundLine(models.Model):
    """One material/quantity line as it stood at the moment its round was
    submitted - a permanent copy, structurally identical to
    PurchaseRequestLine but never replaced or deleted once written (see
    PurchaseRequestApprovalRound's docstring for why a separate copy is
    necessary rather than reusing the live PurchaseRequestLine rows).
    """

    round = models.ForeignKey(PurchaseRequestApprovalRound, on_delete=models.CASCADE, related_name="lines")
    line_number = models.PositiveIntegerField()
    material = models.ForeignKey(
        Material, on_delete=models.PROTECT, related_name="purchase_request_round_lines"
    )
    quantity = models.DecimalField(max_digits=14, decimal_places=3)
    unit = models.ForeignKey(
        UnitOfMeasure, on_delete=models.PROTECT, related_name="purchase_request_round_lines"
    )
    notes = models.CharField(max_length=500, blank=True)
    material_code_snapshot = models.CharField(max_length=32, blank=True)
    material_name_snapshot = models.CharField(max_length=255, blank=True)
    unit_code_snapshot = models.CharField(max_length=20, blank=True)
    unit_name_snapshot = models.CharField(max_length=100, blank=True)

    class Meta:
        ordering = ["round", "line_number"]
        constraints = [
            models.UniqueConstraint(fields=["round", "line_number"], name="unique_round_line_number"),
            models.CheckConstraint(
                check=models.Q(quantity__gt=0), name="purchase_request_round_line_quantity_positive"
            ),
        ]

    def __str__(self):
        return f"{self.round} line {self.line_number}"


class PurchaseRequestApproval(models.Model):
    """One append-only decision row: a step's approval or rejection, or a
    pending-cancellation, within one approval round. Never updated or
    deleted after creation - this is the durable history
    apps.purchasing.services reads to enforce the provisional "a
    different eligible Admin decides each step" restriction and to render
    a full decision trail across every round a request has ever had (see
    docs/purchase-workflow-proposal.md, Task 08B-2).

    `step` is which step (1..3) this decision resolved - for a
    CANCELLED row, the step that was pending at the moment of
    cancellation (cancellation is not itself a "step decision" the way
    approve/reject are, but recording which step it interrupted is part
    of the same audit trail). The (round, step) unique constraint is the
    database backstop against ever recording two decisions for the same
    step of the same round - approve/reject/cancel races are also
    prevented earlier, by locking PurchaseRequest and this round's row
    inside the same transaction (see apps.purchasing.services), but this
    constraint means even a hypothetical missed lock cannot silently
    double-write history.
    """

    class Decision(models.TextChoices):
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"
        CANCELLED = "CANCELLED", "Cancelled"

    round = models.ForeignKey(PurchaseRequestApprovalRound, on_delete=models.CASCADE, related_name="decisions")
    step = models.PositiveIntegerField()
    decision = models.CharField(max_length=10, choices=Decision.choices)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="purchase_request_decisions"
    )
    decided_at = models.DateTimeField(auto_now_add=True)
    reason = models.CharField(
        max_length=1000,
        blank=True,
        help_text="Required (non-blank) for REJECTED and CANCELLED - see "
        "apps.purchasing.services. Always blank for APPROVED: an approval needs no justification text.",
    )

    class Meta:
        ordering = ["round", "step", "decided_at"]
        constraints = [
            models.UniqueConstraint(fields=["round", "step"], name="unique_decision_per_round_step"),
        ]

    def __str__(self):
        return f"{self.round} step {self.step}: {self.decision}"


class PurchaseOrder(models.Model):
    """Task 08C-1 scope only: a DRAFT/CANCELLED purchase order generated
    from one already-`APPROVED` PurchaseRequest. No issue/send/approval
    action, no receipt, QC, stock, invoice, or Tally integration exists
    anywhere in this task - see docs/backend-tasks.md, Task 08C-1, "Not
    implemented".

    PROPOSED POLICY, NOT YET CLIENT-CONFIRMED (see docs/purchase-order-
    proposal.md): two separate companies share one physical store, and
    this task does not resolve how that shared physical location relates
    to legal ownership of stock once it arrives. For this initial
    implementation, `company` is fixed to be exactly the source
    PurchaseRequest's own `company` - the same company that raised the
    original need is the only company allowed to place the resulting
    order in this slice. Cross-company purchasing (company A requesting,
    company B legally purchasing/paying) is explicitly **not**
    supported here; a shared delivery/storage location never by itself
    establishes which company legally owns the stock once received -
    that question remains open and is not decided by this model.

    Initial-scope restrictions (all documented here, all enforced by
    apps.purchasing.services, none configurable yet):
    - At most one non-`CANCELLED` PurchaseOrder per PurchaseRequest (see
      the partial `UniqueConstraint` below) - split orders and partial
      procurement across several POs are explicitly deferred. This
      constraint's condition (`~Q(status="CANCELLED")`) already covers
      `ISSUED` correctly without any change - it was written as
      "not cancelled", never as "is draft", so Task 08C-2's new `ISSUED`
      status falls under it automatically.
    - Exactly one supplier per PO - no multi-supplier split.
    - Every line from the request's approved round is copied, unedited
      in identity/quantity - no extra materials, no omitted lines, no
      quantity changes (see PurchaseOrderLine).
    - A `CANCELLED` PO does not block a replacement: the partial unique
      constraint only ever counts non-`CANCELLED` rows, so creating a
      new PO after cancelling a `DRAFT` one is the (only) supported
      "replace this order" path. An `ISSUED` PO can **not** be
      cancelled or replaced in this task (see Task 08C-2 below).

    `currency_code` is always required at creation (see
    apps.purchasing.services.create_purchase_order) - never silently
    assumed or defaulted, since guessing a currency for a real money
    document would be worse than requiring the caller to state it. Only
    a small, explicit, documented set of currencies may actually be
    **issued** (see apps.purchasing.services._SUPPORTED_ISSUE_CURRENCIES)
    - a currency shape-valid enough to be accepted on a `DRAFT` is not
    automatically issuable.

    Task 08C-2 adds an explicit `ISSUED` status: internal finalisation
    of a draft PO by someone holding `purchase_orders.issue`, proposed
    (not yet client-confirmed) as requiring only that one company-scoped
    permission - not a new multi-step commercial approval workflow like
    PurchaseRequest's own three-step approval (Task 08B-2). Issuing is
    **not** proof of supplier delivery, email transmission, supplier
    acceptance, or material receipt - none of those concepts exist
    anywhere in this codebase. An `ISSUED` PO is terminal in this task:
    it cannot be edited, cancelled, reopened, or amended through any API
    or Django Admin surface - see apps.purchasing.services.
    issue_purchase_order and PurchaseOrderIssueSnapshot.
    """

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        ISSUED = "ISSUED", "Issued"
        CANCELLED = "CANCELLED", "Cancelled"

    company = models.ForeignKey(Company, on_delete=models.PROTECT, related_name="purchase_orders")
    reference = models.CharField(max_length=40, unique=True, editable=False)
    source_purchase_request = models.ForeignKey(
        PurchaseRequest, on_delete=models.PROTECT, related_name="purchase_orders"
    )
    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, related_name="purchase_orders")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    expected_delivery_date = models.DateField(null=True, blank=True)
    notes = models.CharField(max_length=2000, blank=True)
    currency_code = models.CharField(max_length=3)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="purchase_orders_created"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    issued_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="purchase_orders_issued",
    )
    issued_at = models.DateTimeField(null=True, blank=True)
    cancelled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="purchase_orders_cancelled",
    )
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancellation_reason = models.CharField(max_length=1000, blank=True)
    version = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["source_purchase_request"],
                condition=~models.Q(status="CANCELLED"),
                name="one_active_purchase_order_per_purchase_request",
            ),
        ]

    def __str__(self):
        return self.reference

    def clean(self):
        self.notes = (self.notes or "").strip()
        self.cancellation_reason = (self.cancellation_reason or "").strip()
        self.currency_code = (self.currency_code or "").strip().upper()
        errors = {}
        if not self.reference:
            errors["reference"] = "Reference is required."
        if self.status not in self.Status.values:
            errors["status"] = f"Status must be one of {list(self.Status.values)}."
        if not self.currency_code:
            errors["currency_code"] = "Currency code is required."
        elif len(self.currency_code) != 3 or not self.currency_code.isalpha():
            errors["currency_code"] = "Currency code must be exactly three letters (e.g. INR, USD)."
        if self.company_id and self.source_purchase_request_id and self.company_id != self.source_purchase_request.company_id:
            errors["company"] = "A purchase order's company must match its source purchase request's company."
        if self.pk:
            original = (
                PurchaseOrder.objects.filter(pk=self.pk)
                .values("company_id", "reference", "source_purchase_request_id", "currency_code")
                .first()
            )
            if original is not None:
                if original["company_id"] != self.company_id:
                    errors["company"] = "Company cannot be changed after creation."
                if original["reference"] != self.reference:
                    errors["reference"] = "Reference cannot be changed after creation."
                if original["source_purchase_request_id"] != self.source_purchase_request_id:
                    errors["source_purchase_request"] = "Source purchase request cannot be changed after creation."
                if original["currency_code"] != self.currency_code:
                    errors["currency_code"] = "Currency code cannot be changed after creation."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)


class PurchaseOrderLine(models.Model):
    """One material/quantity/price line on a PurchaseOrder.

    `source_round_line` is the immutable link back to exactly which
    approved-round snapshot line this was copied from - see
    PurchaseRequestApprovalRoundLine. `material`/`unit`/`quantity` are
    copied from it once, at PO-creation time, and are never editable
    afterwards (see apps.purchasing.services.update_purchase_order,
    which only ever touches `unit_price`) - Task 08C-1 explicitly does
    not support changing quantities, adding materials, or omitting a
    line from what the approved request contained.

    `unit_price` is the only editable field on a line in this slice
    (DRAFT only). `line_amount` is always server-calculated
    (`quantity * unit_price`, quantized to 2 decimal places with
    ROUND_HALF_UP - see apps.purchasing.services._compute_line_amount)
    and is a pre-tax subtotal only: no GST/discount/freight/invoice
    total concept exists anywhere in this task.
    """

    purchase_order = models.ForeignKey(PurchaseOrder, on_delete=models.CASCADE, related_name="lines")
    line_number = models.PositiveIntegerField()
    source_round_line = models.ForeignKey(
        PurchaseRequestApprovalRoundLine, on_delete=models.PROTECT, related_name="purchase_order_lines"
    )
    material = models.ForeignKey(Material, on_delete=models.PROTECT, related_name="purchase_order_lines")
    unit = models.ForeignKey(UnitOfMeasure, on_delete=models.PROTECT, related_name="purchase_order_lines")
    quantity = models.DecimalField(max_digits=14, decimal_places=3)
    unit_price = models.DecimalField(max_digits=14, decimal_places=4, default=0)
    line_amount = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    material_code_snapshot = models.CharField(max_length=32, blank=True)
    material_name_snapshot = models.CharField(max_length=255, blank=True)
    unit_code_snapshot = models.CharField(max_length=20, blank=True)
    unit_name_snapshot = models.CharField(max_length=100, blank=True)

    class Meta:
        ordering = ["line_number", "id"]
        constraints = [
            models.UniqueConstraint(fields=["purchase_order", "line_number"], name="unique_po_line_number"),
            models.UniqueConstraint(
                fields=["purchase_order", "source_round_line"], name="unique_po_source_round_line"
            ),
            models.CheckConstraint(check=models.Q(quantity__gt=0), name="po_line_quantity_positive"),
            models.CheckConstraint(check=models.Q(unit_price__gte=0), name="po_line_unit_price_nonnegative"),
        ]

    def __str__(self):
        return f"{self.purchase_order.reference} line {self.line_number}"

    def clean(self):
        errors = {}
        if self.quantity is not None and self.quantity <= 0:
            errors["quantity"] = "Quantity must be greater than zero."
        if self.unit_price is not None and self.unit_price < 0:
            errors["unit_price"] = "Unit price cannot be negative."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)


class PurchaseOrderIssueSnapshot(models.Model):
    """Created exactly once, by apps.purchasing.services.
    issue_purchase_order, the moment a `DRAFT` PurchaseOrder becomes
    `ISSUED` - a permanent, self-contained copy of every "who/what this
    order was with" fact that a *later* edit to Company/Supplier master
    data could otherwise silently rewrite. Never updated after creation
    (there is no service anywhere that writes to this model a second
    time for the same PurchaseOrder - `OneToOneField` enforces that at
    the schema level too).

    Only fields that actually exist on Company/Supplier today are
    captured - nothing here is invented. `apps.companies.models.Company`
    has no address, tax-ID, or bank-details field at all, so none is
    snapshotted; `apps.suppliers.models.Supplier`'s full identity/
    contact/address field set is copied as-is, unedited.

    Material/unit identity was already snapshotted once, at PO-creation
    time, onto `PurchaseOrderLine.*_snapshot` (Task 08C-1) - those fields
    are copied again here, onto `PurchaseOrderIssueLineSnapshot`, purely
    so this issue-time record is fully self-contained and readable on
    its own, without following a chain of foreign keys back through
    `PurchaseOrderLine` to make sense of it.
    """

    purchase_order = models.OneToOneField(
        PurchaseOrder, on_delete=models.CASCADE, related_name="issue_snapshot"
    )
    issued_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="purchase_order_issue_snapshots"
    )
    issued_at = models.DateTimeField()

    company_code_snapshot = models.CharField(max_length=32, blank=True)
    company_legal_name_snapshot = models.CharField(max_length=255, blank=True)
    company_display_name_snapshot = models.CharField(max_length=255, blank=True)

    supplier_code_snapshot = models.CharField(max_length=32, blank=True)
    supplier_legal_name_snapshot = models.CharField(max_length=255, blank=True)
    supplier_display_name_snapshot = models.CharField(max_length=255, blank=True)
    supplier_contact_name_snapshot = models.CharField(max_length=150, blank=True)
    supplier_email_snapshot = models.CharField(max_length=254, blank=True)
    supplier_phone_snapshot = models.CharField(max_length=32, blank=True)
    supplier_address_line_1_snapshot = models.CharField(max_length=255, blank=True)
    supplier_address_line_2_snapshot = models.CharField(max_length=255, blank=True)
    supplier_city_snapshot = models.CharField(max_length=100, blank=True)
    supplier_state_region_snapshot = models.CharField(max_length=100, blank=True)
    supplier_postal_code_snapshot = models.CharField(max_length=20, blank=True)
    supplier_country_code_snapshot = models.CharField(max_length=2, blank=True)

    currency_code_snapshot = models.CharField(max_length=3, blank=True)
    subtotal_snapshot = models.DecimalField(max_digits=16, decimal_places=2)
    expected_delivery_date_snapshot = models.DateField()
    notes_snapshot = models.CharField(max_length=2000, blank=True)

    source_purchase_request_reference_snapshot = models.CharField(max_length=40, blank=True)
    approved_round_number_snapshot = models.PositiveIntegerField()

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.purchase_order.reference} issue snapshot"


class PurchaseOrderIssueLineSnapshot(models.Model):
    """One permanent, issue-time copy per PurchaseOrderLine - see
    PurchaseOrderIssueSnapshot's docstring for why this duplicates
    fields that are, today, already frozen on the live
    PurchaseOrderLine (quantity always was immutable; `unit_price`/
    `line_amount` become immutable the moment the order leaves `DRAFT`,
    since update_purchase_order only ever permits editing a `DRAFT`).
    """

    issue_snapshot = models.ForeignKey(
        PurchaseOrderIssueSnapshot, on_delete=models.CASCADE, related_name="lines"
    )
    purchase_order_line = models.ForeignKey(
        PurchaseOrderLine, on_delete=models.PROTECT, related_name="issue_line_snapshots"
    )
    line_number = models.PositiveIntegerField()
    material_code_snapshot = models.CharField(max_length=32, blank=True)
    material_name_snapshot = models.CharField(max_length=255, blank=True)
    unit_code_snapshot = models.CharField(max_length=20, blank=True)
    unit_name_snapshot = models.CharField(max_length=100, blank=True)
    quantity_snapshot = models.DecimalField(max_digits=14, decimal_places=3)
    unit_price_snapshot = models.DecimalField(max_digits=14, decimal_places=4)
    line_amount_snapshot = models.DecimalField(max_digits=16, decimal_places=2)

    class Meta:
        ordering = ["line_number", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["issue_snapshot", "line_number"], name="unique_issue_snapshot_line_number"
            ),
        ]

    def __str__(self):
        return f"{self.issue_snapshot} line {self.line_number}"
