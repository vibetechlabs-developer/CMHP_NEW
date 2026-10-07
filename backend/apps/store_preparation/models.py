from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q

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

    # A preparation belongs to EXACTLY ONE owner (enforced by the check
    # constraint in Meta):
    # - `sales_order_line`: the store-side preparation for an order line. This
    #   is the confirmed workflow - it exists before any batch plan, and a
    #   later batch plan for the same line never copies or overwrites it.
    # - `batch_plan`: LEGACY batch-specific rows created before order-line
    #   preparation existed. Kept intact and readable; never converted.
    batch_plan = models.OneToOneField(
        BatchPlan, on_delete=models.PROTECT, related_name="store_preparation", null=True, blank=True
    )
    sales_order_line = models.ForeignKey(
        "sales_orders.SalesOrderLine",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="store_preparations",
    )
    store = models.ForeignKey(SharedStore, on_delete=models.PROTECT, related_name="store_preparations")
    packing_type = models.CharField(max_length=255, blank=True)
    insert_required = models.BooleanField(null=True, blank=True)
    # Unstructured interim text. Meaning not yet defined by the client; never used
    # for stock, availability or readiness.
    label_note = models.CharField(max_length=255, blank=True, default="")
    box_note = models.CharField(max_length=255, blank=True, default="")
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
        constraints = [
            models.CheckConstraint(
                condition=(
                    Q(batch_plan__isnull=False, sales_order_line__isnull=True)
                    | Q(batch_plan__isnull=True, sales_order_line__isnull=False)
                ),
                name="store_prep_exactly_one_owner",
            ),
            # One order-line preparation per store and line. The database
            # enforces this, so concurrent duplicate creation cannot succeed.
            models.UniqueConstraint(
                fields=["store", "sales_order_line"],
                condition=Q(batch_plan__isnull=True),
                name="unique_line_store_preparation",
            ),
        ]

    def __str__(self):
        if self.batch_plan_id:
            return f"StorePreparation for BatchPlan #{self.batch_plan_id}"
        return f"StorePreparation for SalesOrderLine #{self.sales_order_line_id}"

    @property
    def owning_company(self):
        """The company whose access rules govern this record."""
        if self.batch_plan_id:
            return self.batch_plan.company
        return self.sales_order_line.sales_order.company

    def clean(self):
        self.packing_type = (self.packing_type or "").strip()
        errors = {}
        if (self.batch_plan_id is None) == (self.sales_order_line_id is None):
            errors["detail"] = "A store preparation belongs to exactly one batch plan or one order line."
        if self.pk:
            original = (
                StorePreparation.objects.filter(pk=self.pk)
                .values("batch_plan_id", "sales_order_line_id", "store_id")
                .first()
            )
            if original is not None:
                if original["batch_plan_id"] != self.batch_plan_id:
                    errors["batch_plan"] = "Batch plan cannot be changed after creation."
                if original["sales_order_line_id"] != self.sales_order_line_id:
                    errors["sales_order_line"] = "Order line cannot be changed after creation."
                if original["store_id"] != self.store_id:
                    errors["store"] = "Store cannot be changed after creation."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError({"detail": "Store preparation records cannot be deleted."})
