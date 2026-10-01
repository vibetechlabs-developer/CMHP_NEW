from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models


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
