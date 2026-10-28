from decimal import Decimal
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone


class StockMovement(models.Model):
    """Task 13C: Physical Receipt Ledger Foundation.

    A minimal, **append-only** record of physical material entering a shared store when a `GoodsReceipt` is
    posted. This is deliberately the smallest possible slice of `docs/shared-store-inventory-plan.md`'s larger
    design (Task 13B) — only ONE movement type exists, and several concepts that design discusses are
    EXPLICITLY NOT implemented here (see the boundary list below). Nothing about this model authorizes,
    reserves, releases, or consumes anything.

    BOUNDED SCOPE — do not read anything below as implying otherwise:
    - **`movement_type` has exactly one real value: `RECEIPT_IN`.** The enum exists so a future task can add
      `REVERSAL`/`ADJUSTMENT` (linked corrections, per this task's own instruction) without a second migration
      renaming this field — but no code anywhere creates anything but `RECEIPT_IN` today.
    - **`source_company` is the receipt's own company (the purchasing/receiving company) — NOT a legal-ownership
      claim.** This mirrors `GoodsReceipt.company`'s own documented caveat exactly ("purchasing company" only).
      Legal stock ownership, cross-company allocation, and any transfer-of-ownership concept are UNIMPLEMENTED —
      see `docs/shared-store-inventory-plan.md` §2.
    - **No QC/release/hold field exists anywhere on this model.** `IncomingInspection` submission does not, and
      must never be read to, change anything here. Release status must be described as "Not tracked" at the API
      layer — never as a computed `0`, never as "held," never as "rejected." Modelling a fake zero would imply a
      release concept exists; it does not.
    - **No reservation, issue, consumption, return, or requisition-fulfilment concept exists anywhere here.**
      A `MaterialRequisition`/`BatchPlan` is never referenced by this model at all in this task.
    - **No location field.** `GoodsReceiptLine` (the source of every field below) does not capture a
      `StorageLocation` — confirmed by direct code inspection — so none is invented here. Do not add one without
      first confirming the receiving flow actually captures it.
    - **No lot-merging.** `source_receipt_line` (a `OneToOneField` to `GoodsReceiptLine`, which is what actually
      enforces "one `RECEIPT_IN` movement per source receipt line" at the database level) is the ONLY identity
      concept this model has. Two different receipts — or two different lines on the same receipt — that happen
      to carry the identical supplier `lot_reference` text produce two SEPARATE `StockMovement` rows with two
      separate identities. **Identifying that two receipt lines are physically the same supplier lot is NOT
      resolved anywhere in this task** — a future lot-identity task would need to design that deliberately, not
      infer it from matching text.
    - **No expiry date, and no fabricated supplier lot number.** `lot_reference` is copied verbatim from
      `GoodsReceiptLine.lot_reference` (already optional, free-text, supplier-supplied-only there) — blank stays
      blank, never invented.
    - **No opening stock, and no historical backfill.** This model only ever gets a row when a `GoodsReceipt` is
      posted *after* this feature existed — see `apps.receiving.services.post_goods_receipt`. A previously-POSTED
      receipt is never touched, and repeating `POST .../post/` on one never creates a movement for it.

    IMMUTABLE once created, through every write path this codebase's supported services/API/admin surface
    actually uses today: this model overrides `save()` to call `self.clean()` explicitly (Django's own default
    `Model.save()` does NOT call `clean()` on its own — relying on that default would have been the real gap here;
    this model does not rely on it). `clean()` checks `self.pk` — truthy only for an already-existing row — and
    raises on any such save, the same "full save-then-reject" pattern `BatchNumberAllocation` uses, chosen for the
    identical reason: nothing here is ever legitimately re-saved. `delete()` always raises. Verified directly
    against this exact path by `tests.test_stock_movements.ModelImmutabilityTests` (fetch an existing row, mutate
    a field, call `.save()` -> raises; `.delete()` -> raises), not merely asserted here.

    The ONLY creation path (`apps.stock_movements.services.create_receipt_in_movements`) uses
    `objects.bulk_create()` on brand-new, never-before-saved instances (`pk` is `None` at construction) — `clean()`
    correctly allows this, since the immutability check is specifically keyed on an EXISTING `pk`, not on which
    method performed the write.

    KNOWN LIMITATION, disclosed the same way every other "immutable" model in this codebase discloses it, and
    verified honest rather than assumed: this override protects single-instance `.save()`/`.delete()` only.
    `QuerySet.update()`, `queryset.delete()`, and `bulk_update()` all bypass `save()`/`clean()` entirely and are
    not prevented by application code. So does `objects.bulk_create()` itself when called with Django's own
    `update_conflicts=True` upsert option (available since Django 4.1, present in this project's Django 5.2) —
    this codebase's own `create_receipt_in_movements` never passes that option, so today's only real creation path
    is genuinely insert-only, but a future caller adding it against this model's unique constraint could silently
    update an existing row without ever invoking `clean()`. Only direct database administration, or a future
    change like that, which this project does not otherwise guard against, could bypass this. Corrections are
    always a **future** linked `REVERSAL`/`ADJUSTMENT` row (not implemented in this task), never an edit to this
    row through any path this codebase provides today.
    """

    class MovementType(models.TextChoices):
        RECEIPT_IN = "RECEIPT_IN", "Receipt in"

    movement_type = models.CharField(max_length=20, choices=MovementType.choices)

    source_goods_receipt = models.ForeignKey(
        "receiving.GoodsReceipt", on_delete=models.PROTECT, related_name="stock_movements"
    )
    source_receipt_line = models.OneToOneField(
        "receiving.GoodsReceiptLine", on_delete=models.PROTECT, related_name="stock_movement"
    )
    store = models.ForeignKey("stores.SharedStore", on_delete=models.PROTECT, related_name="stock_movements")
    # The receipt's OWN company - purchasing/receiving context only, see the module docstring above.
    source_company = models.ForeignKey("companies.Company", on_delete=models.PROTECT, related_name="stock_movements")

    material = models.ForeignKey("catalog.Material", on_delete=models.PROTECT, related_name="stock_movements")
    unit = models.ForeignKey("catalog.UnitOfMeasure", on_delete=models.PROTECT, related_name="stock_movements")
    quantity = models.DecimalField(max_digits=14, decimal_places=3)

    # Copied once, at creation, from source_receipt_line's own values -
    # never refreshed, never re-derived, mirroring every other snapshot
    # in this codebase (e.g. GoodsReceiptLine's own snapshot fields).
    material_code_snapshot = models.CharField(max_length=32, blank=True)
    material_name_snapshot = models.CharField(max_length=255, blank=True)
    unit_code_snapshot = models.CharField(max_length=20, blank=True)
    unit_name_snapshot = models.CharField(max_length=100, blank=True)
    lot_reference = models.CharField(max_length=100, blank=True)

    posted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="stock_movements_posted"
    )
    # The receipt's own posted_at (business event time) - distinct from
    # created_at (this row's own database insert time), the same
    # distinction GoodsReceipt itself already keeps between posted_at
    # and created_at/updated_at.
    posted_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
            models.CheckConstraint(check=models.Q(quantity__gt=0), name="stock_movement_quantity_positive"),
        ]

    def __str__(self):
        return f"StockMovement #{self.pk or 'new'} ({self.movement_type}, {self.material_code_snapshot})"

    def clean(self):
        errors = {}
        if self.pk:
            errors["detail"] = "Stock movements are immutable and cannot be edited."
        elif self.movement_type not in self.MovementType.values:
            errors["movement_type"] = f"Movement type must be one of {list(self.MovementType.values)}."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError({"detail": "Stock movements cannot be deleted."})


class MaterialIssue(models.Model):
    """A document recording material issued OUT of a shared store to a
    company's production, DRAFT -> POSTED -> CANCELLED - the same
    lifecycle `apps.receiving.models.GoodsReceipt` already uses, for the
    same reason (a reviewable draft before an irreversible stock effect).

    Deliberately NOT linked to any Product/BMR/batch-plan model:
    `batch_reference`/`product_reference` are free-text, supplier-style
    fields (mirroring `GoodsReceiptLine.lot_reference`'s own "optional,
    free-text, never fabricated" convention) - integrating a real
    Product/BMR/batch system is explicitly out of this task's scope.

    Unlike a `GoodsReceipt`, there is no purchase order to derive
    `source_company`/quantity limits from - `source_company` is chosen
    directly by the caller (validated against the companies they can
    see receipts for, `companies_with_receipt_view_access`), and the
    quantity cap enforced at posting is a plain ledger non-negativity
    rule - recorded receipts minus already-posted issues for this exact
    (material, unit, source_company) combination at this store - never
    a claim about QC release, reservation, or usable-stock eligibility.
    See `apps.stock_movements.services.post_material_issue`.

    Single-line by design (one material per issue document) - the
    reference UI this mirrors captures exactly one material per issue
    slip; a multi-line issue document is not implemented.
    """

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        POSTED = "POSTED", "Posted"
        CANCELLED = "CANCELLED", "Cancelled"

    reference = models.CharField(max_length=40, unique=True, editable=False)
    idempotency_key = models.CharField(max_length=100, blank=True)
    store = models.ForeignKey("stores.SharedStore", on_delete=models.PROTECT, related_name="material_issues")
    # The company this issue reduces recorded-receipt stock for -
    # explicitly chosen by the caller, not derived (there is no source
    # purchase order here to derive it from). Mirrors GoodsReceipt.
    # company's own "purchasing/receiving company only, not a legal-
    # ownership claim" caveat.
    source_company = models.ForeignKey("companies.Company", on_delete=models.PROTECT, related_name="material_issues")
    material = models.ForeignKey("catalog.Material", on_delete=models.PROTECT, related_name="material_issues")
    unit = models.ForeignKey("catalog.UnitOfMeasure", on_delete=models.PROTECT, related_name="material_issues")
    issued_quantity = models.DecimalField(max_digits=14, decimal_places=3)
    issued_at = models.DateTimeField()
    batch_reference = models.CharField(max_length=100, blank=True)
    product_reference = models.CharField(max_length=255, blank=True)
    remarks = models.CharField(max_length=2000, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)

    material_code_snapshot = models.CharField(max_length=32, blank=True)
    material_name_snapshot = models.CharField(max_length=255, blank=True)
    unit_code_snapshot = models.CharField(max_length=20, blank=True)
    unit_name_snapshot = models.CharField(max_length=100, blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="material_issues_created"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    posted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="material_issues_posted"
    )
    posted_at = models.DateTimeField(null=True, blank=True)
    cancelled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="material_issues_cancelled"
    )
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancellation_reason = models.CharField(max_length=1000, blank=True)
    version = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["idempotency_key"],
                condition=~models.Q(idempotency_key=""),
                name="unique_nonblank_material_issue_idempotency_key",
            ),
            models.CheckConstraint(check=models.Q(issued_quantity__gt=0), name="material_issue_quantity_positive"),
        ]

    def __str__(self):
        return self.reference

    def clean(self):
        self.batch_reference = (self.batch_reference or "").strip()
        self.product_reference = (self.product_reference or "").strip()
        self.remarks = (self.remarks or "").strip()
        self.cancellation_reason = (self.cancellation_reason or "").strip()
        self.idempotency_key = (self.idempotency_key or "").strip()
        errors = {}
        if not self.reference:
            errors["reference"] = "Reference is required."
        if self.status not in self.Status.values:
            errors["status"] = f"Status must be one of {list(self.Status.values)}."
        if self.pk:
            original = MaterialIssue.objects.filter(pk=self.pk).values(
                "store_id", "source_company_id", "material_id", "reference"
            ).first()
            if original is not None:
                if original["store_id"] != self.store_id:
                    errors["store"] = "Store cannot be changed after creation."
                if original["source_company_id"] != self.source_company_id:
                    errors["source_company"] = "Source company cannot be changed after creation."
                if original["material_id"] != self.material_id:
                    errors["material"] = "Material cannot be changed after creation."
                if original["reference"] != self.reference:
                    errors["reference"] = "Reference cannot be changed after creation."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)


class MaterialIssueMovement(models.Model):
    """One append-only ledger entry created when a `MaterialIssue` is
    posted - the issue-side counterpart of `StockMovement`, kept as a
    SEPARATE model rather than a new `StockMovement.movement_type`
    specifically so `StockMovement` (and every already-tested query/
    serializer that assumes its `source_goods_receipt`/
    `source_receipt_line` are always set) is not touched at all. Never
    summed together with `StockMovement`'s own "recorded receipt
    quantity" - always its own, separately labelled "recorded issued
    quantity" (see apps.stock_movements.services.compute_issued_balances).

    Same immutability contract as `StockMovement`: `clean()` rejects any
    save of an already-existing row, `delete()` always raises. The only
    creation path is `apps.stock_movements.services.
    create_issue_out_movement`, called once, in the same transaction as
    the real `DRAFT` -> `POSTED` transition.
    """

    source_material_issue = models.OneToOneField(
        MaterialIssue, on_delete=models.PROTECT, related_name="movement"
    )
    store = models.ForeignKey("stores.SharedStore", on_delete=models.PROTECT, related_name="material_issue_movements")
    source_company = models.ForeignKey(
        "companies.Company", on_delete=models.PROTECT, related_name="material_issue_movements"
    )
    material = models.ForeignKey("catalog.Material", on_delete=models.PROTECT, related_name="material_issue_movements")
    unit = models.ForeignKey("catalog.UnitOfMeasure", on_delete=models.PROTECT, related_name="material_issue_movements")
    quantity = models.DecimalField(max_digits=14, decimal_places=3)

    material_code_snapshot = models.CharField(max_length=32, blank=True)
    material_name_snapshot = models.CharField(max_length=255, blank=True)
    unit_code_snapshot = models.CharField(max_length=20, blank=True)
    unit_name_snapshot = models.CharField(max_length=100, blank=True)
    batch_reference = models.CharField(max_length=100, blank=True)
    product_reference = models.CharField(max_length=255, blank=True)
    remarks = models.CharField(max_length=2000, blank=True)

    posted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="material_issue_movements_posted"
    )
    posted_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
            models.CheckConstraint(check=models.Q(quantity__gt=0), name="material_issue_movement_quantity_positive"),
        ]

    def __str__(self):
        return f"MaterialIssueMovement #{self.pk or 'new'} ({self.material_code_snapshot})"

    def clean(self):
        if self.pk:
            raise ValidationError({"detail": "Material issue movements are immutable and cannot be edited."})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError({"detail": "Material issue movements cannot be deleted."})


class ProductionCustody(models.Model):
    """Tracks physical custody of materials issued to production floor.

    Source of custody is a POSTED MaterialIssue.
    Physical custody invariant:
      remaining_quantity = issued_quantity - consumed_quantity - returned_quantity - disposed_quantity
      damaged_quantity is a condition subset of held custody: damaged_quantity <= remaining_quantity
    """

    source_issue = models.OneToOneField(
        MaterialIssue, on_delete=models.PROTECT, related_name="production_custody"
    )
    store = models.ForeignKey("stores.SharedStore", on_delete=models.PROTECT, related_name="production_custodies")
    source_company = models.ForeignKey(
        "companies.Company", on_delete=models.PROTECT, related_name="production_custodies"
    )
    material = models.ForeignKey("catalog.Material", on_delete=models.PROTECT, related_name="production_custodies")
    unit = models.ForeignKey("catalog.UnitOfMeasure", on_delete=models.PROTECT, related_name="production_custodies")
    batch_reference = models.CharField(max_length=100, blank=True)
    product_reference = models.CharField(max_length=255, blank=True)

    issued_quantity = models.DecimalField(max_digits=14, decimal_places=3)
    consumed_quantity = models.DecimalField(max_digits=14, decimal_places=3, default=Decimal("0.000"))
    returned_quantity = models.DecimalField(max_digits=14, decimal_places=3, default=Decimal("0.000"))
    damaged_quantity = models.DecimalField(max_digits=14, decimal_places=3, default=Decimal("0.000"))
    disposed_quantity = models.DecimalField(max_digits=14, decimal_places=3, default=Decimal("0.000"))

    version = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
            models.CheckConstraint(check=models.Q(issued_quantity__gte=0), name="custody_issued_non_negative"),
            models.CheckConstraint(check=models.Q(consumed_quantity__gte=0), name="custody_consumed_non_negative"),
            models.CheckConstraint(check=models.Q(returned_quantity__gte=0), name="custody_returned_non_negative"),
            models.CheckConstraint(check=models.Q(damaged_quantity__gte=0), name="custody_damaged_non_negative"),
            models.CheckConstraint(check=models.Q(disposed_quantity__gte=0), name="custody_disposed_non_negative"),
        ]

    @property
    def remaining_quantity(self) -> Decimal:
        return self.issued_quantity - self.consumed_quantity - self.returned_quantity - self.disposed_quantity

    @property
    def sound_quantity(self) -> Decimal:
        return max(Decimal("0.000"), self.remaining_quantity - self.damaged_quantity)

    def __str__(self):
        return f"ProductionCustody for Issue #{self.source_issue_id} ({self.material.code}): {self.remaining_quantity} remaining"


class ProductionFloorEvent(models.Model):
    """Immutable audit event recorded against a ProductionCustody ledger."""

    EVENT_TYPE_CHOICES = (
        ("CONSUMPTION", "Actual Consumption"),
        ("RETURN_UNUSED", "Return Unused"),
        ("RETURN_DEFECTIVE", "Return Defective"),
        ("DEFECT_CLASSIFIED", "Defect Classification"),
        ("DISPOSAL", "Disposal Under Policy"),
    )

    custody = models.ForeignKey(ProductionCustody, on_delete=models.PROTECT, related_name="floor_events")
    event_type = models.CharField(max_length=30, choices=EVENT_TYPE_CHOICES)
    quantity = models.DecimalField(max_digits=14, decimal_places=3)
    reason = models.CharField(max_length=500, blank=True)
    disposal_policy = models.CharField(max_length=255, blank=True)
    notes = models.TextField(blank=True)
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return f"ProductionFloorEvent #{self.pk} {self.event_type} {self.quantity}"


class MaterialReturn(models.Model):
    """Physical material return from production floor back to store.

    Returned physical stock is placed in explicit HELD_UNASSESSED disposition.
    It does not immediately become unrestricted usable store stock without
    established QC/release rules.
    """

    RETURN_TYPE_CHOICES = (
        ("UNUSED", "Unused Return"),
        ("DEFECTIVE", "Defective Return"),
    )
    DISPOSITION_CHOICES = (
        ("HELD_UNASSESSED", "Held / Unassessed"),
        ("RELEASED_USABLE", "Released to Usable"),
        ("QUARANTINE_REJECTED", "Quarantine / Rejected"),
    )

    source_custody = models.ForeignKey(ProductionCustody, on_delete=models.PROTECT, related_name="returns")
    source_issue = models.ForeignKey(MaterialIssue, on_delete=models.PROTECT, related_name="returns")
    store = models.ForeignKey("stores.SharedStore", on_delete=models.PROTECT, related_name="material_returns")
    source_company = models.ForeignKey(
        "companies.Company", on_delete=models.PROTECT, related_name="material_returns"
    )
    material = models.ForeignKey("catalog.Material", on_delete=models.PROTECT, related_name="material_returns")
    unit = models.ForeignKey("catalog.UnitOfMeasure", on_delete=models.PROTECT, related_name="material_returns")

    return_type = models.CharField(max_length=20, choices=RETURN_TYPE_CHOICES)
    quantity = models.DecimalField(max_digits=14, decimal_places=3)
    disposition = models.CharField(max_length=30, choices=DISPOSITION_CHOICES, default="HELD_UNASSESSED")
    batch_reference = models.CharField(max_length=100, blank=True)
    reason = models.CharField(max_length=500, blank=True)
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
            models.CheckConstraint(check=models.Q(quantity__gt=0), name="material_return_quantity_positive"),
        ]

    def __str__(self):
        return f"MaterialReturn #{self.pk} ({self.return_type}: {self.quantity} {self.unit.code} [{self.disposition}])"


class PhysicalCountDraft(models.Model):
    """Database-backed draft for physical inventory counts.

    Does NOT post stock adjustments without established variance approval policies.
    """

    STATUS_CHOICES = (
        ("DRAFT", "Draft Count"),
        ("RECONCILED", "Reconciled (Pending Policy)"),
    )

    store = models.ForeignKey("stores.SharedStore", on_delete=models.PROTECT, related_name="physical_count_drafts")
    material = models.ForeignKey("catalog.Material", on_delete=models.PROTECT, related_name="physical_count_drafts")
    unit = models.ForeignKey("catalog.UnitOfMeasure", on_delete=models.PROTECT, related_name="physical_count_drafts")
    scope = models.CharField(max_length=100, default="STORE_PHYSICAL")
    cutoff_date = models.DateTimeField(default=timezone.now)
    book_reference_quantity = models.DecimalField(max_digits=14, decimal_places=3)
    actual_count_quantity = models.DecimalField(max_digits=14, decimal_places=3)
    discrepancy_quantity = models.DecimalField(max_digits=14, decimal_places=3)
    reason = models.CharField(max_length=500, blank=True)
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    recorded_at = models.DateTimeField(default=timezone.now)
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default="DRAFT")
    posting_blocker_reason = models.CharField(
        max_length=500,
        default="Posting adjustment blocked: count variance approval and ledger adjustment policy rules are not yet configured.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return f"PhysicalCountDraft #{self.pk} for {self.material.code} (diff: {self.discrepancy_quantity})"


class CutoverStockDraft(models.Model):
    """Database-backed draft for initial stock cutover baseline.

    Does NOT post stock effects without established cutover governance rules.
    Does NOT disguise opening balances as supplier receipts.
    """

    STATUS_CHOICES = (
        ("DRAFT", "Draft Opening Baseline"),
        ("SUPERSEDED", "Superseded"),
    )

    store = models.ForeignKey("stores.SharedStore", on_delete=models.PROTECT, related_name="cutover_stock_drafts")
    material = models.ForeignKey("catalog.Material", on_delete=models.PROTECT, related_name="cutover_stock_drafts")
    unit = models.ForeignKey("catalog.UnitOfMeasure", on_delete=models.PROTECT, related_name="cutover_stock_drafts")
    effective_date = models.DateField()
    quantity = models.DecimalField(max_digits=14, decimal_places=3)
    source_reference = models.CharField(max_length=255)
    remarks = models.TextField(blank=True)
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default="DRAFT")
    posting_blocker_reason = models.CharField(
        max_length=500,
        default="Posting baseline cutover blocked: initial cutover governance and opening balance approval policy are not yet configured.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
            models.CheckConstraint(check=models.Q(quantity__gte=0), name="cutover_draft_quantity_non_negative"),
        ]

    def __str__(self):
        return f"CutoverStockDraft #{self.pk} for {self.material.code}: {self.quantity}"

