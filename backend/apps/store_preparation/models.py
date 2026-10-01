from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from apps.batch_plans.models import BatchPlan
from apps.stores.models import SharedStore


class StorePreparation(models.Model):
    """Task 12C: the confirmed STORE-side preparation information for one
    existing `BatchPlan` - Packing Type and whether an insert is required.

    CONFIRMED CLIENT RULES (not everything about Store preparation - see
    the module docstring below for what remains unresolved):
    - `packing_type` is manually entered free text (the client's own
      example: "25 Gm G2") - there is no fixed choice list, and nothing
      here parses or structures it.
    - `insert_required`:
        - `None` ("null") means **not specified** - nobody has answered
          this yet. This is NOT the same as "not required."
        - `False` means **not required / N/A** - the client's own example
          of marking Insert as "N/A" on their register.
        - `True` means **required** - and ONLY that: it does not mean the
          insert is available, printed, issued, or ready. No readiness,
          artwork/reference tracking, or quantity concept exists here.

    WORKING STRUCTURAL CHOICE, NOT A CONFIRMED CLIENT POLICY: exactly ONE
    `StorePreparation` per `BatchPlan` (enforced by the `OneToOneField`
    below, at the database level) - this task was told to implement a
    bounded slice, one record per plan, and to document this as needing
    client review rather than a settled multi-store-routing answer. If the
    client later says one plan can be prepared at more than one store, or
    that a store can hold several distinct preparation "attempts" for the
    same plan, this field would need to become a ForeignKey (many rows per
    plan) instead - that is a schema change, not a data change, and is
    explicitly deferred.

    UNRESOLVED, deliberately NOT implemented in this model or anywhere in
    this task (see docs/client-register-field-mapping.md and
    docs/erp-handoff-open-decisions.md, Task 12C block): what Label/Box
    values (including what `0` means on the client's own sample row) should
    be; Insert quantity, readiness, or artwork/reference tracking beyond
    the required/not-required/not-specified tri-state above; any
    requisition lifecycle; official batch numbering/year/reset rules. None
    of these has a placeholder field here - inventing one would look like
    a designed answer to a question nobody has answered yet.

    This record establishes NO stock ownership, reserves NO material, and
    authorizes NO manufacturing - the same scope boundary every other
    record downstream of `BatchPlan` already carries.
    """

    batch_plan = models.OneToOneField(BatchPlan, on_delete=models.PROTECT, related_name="store_preparation")
    store = models.ForeignKey(SharedStore, on_delete=models.PROTECT, related_name="store_preparations")
    packing_type = models.CharField(max_length=255, blank=True)
    insert_required = models.BooleanField(null=True, blank=True)
    version = models.PositiveIntegerField(default=1)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="store_preparations_created"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="store_preparations_updated"
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return f"StorePreparation for BatchPlan #{self.batch_plan_id}"

    def clean(self):
        self.packing_type = (self.packing_type or "").strip()
        errors = {}
        if self.pk:
            original = (
                StorePreparation.objects.filter(pk=self.pk).values("batch_plan_id", "store_id").first()
            )
            if original is not None:
                if original["batch_plan_id"] != self.batch_plan_id:
                    errors["batch_plan"] = "Batch plan cannot be changed after creation."
                if original["store_id"] != self.store_id:
                    errors["store"] = "Store cannot be changed after creation."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError({"detail": "Store preparation records cannot be deleted."})
