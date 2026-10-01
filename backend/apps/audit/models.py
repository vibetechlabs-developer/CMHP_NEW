from django.conf import settings
from django.db import models

from apps.companies.models import Company
from apps.stores.models import SharedStore


class AuditLog(models.Model):
    """Application-level, append-only record of who changed what, when.

    This is a foundation for Task 05's own mutations (see
    apps.users.services) - it is deliberately NOT a claim of database-level
    tamper-proofing (any row can still be edited/deleted directly in
    Postgres by someone with DB access; there is no trigger, checksum, or
    write-once constraint enforcing immutability below the application
    layer), and it does NOT retroactively cover every change ever made
    through Django Admin's own forms - see apps.audit.admin and
    docs/backend-decisions.md for the exact coverage boundary.

    `company` and `store` (Task 07A) are two separate, both-nullable FKs,
    not one shared "context" FK - a store is not a company and must never
    be represented by a fake/borrowed Company row (see docs/backend-
    decisions.md, Task 07A). Most audit entries set at most one of them:
    company-scoped mutations set `company`, store-scoped mutations set
    `store`, and account-only mutations (e.g. `user.created`) set
    neither. Task 09A's `apps.receiving` app is the one deliberate
    exception - a GoodsReceipt mutation sets **both**, since receiving is
    genuinely scoped to a purchasing company (derived from its source
    PurchaseOrder) and a physical store at the same time - see
    apps.audit.services.record's own docstring for the full reasoning.
    """

    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="audit_actions"
    )
    action = models.CharField(max_length=100)
    target_type = models.CharField(max_length=50)
    target_id = models.BigIntegerField()
    company = models.ForeignKey(
        Company,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="audit_logs",
    )
    store = models.ForeignKey(
        SharedStore,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="audit_logs",
    )
    before = models.JSONField(null=True, blank=True)
    after = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["target_type", "target_id"]),
            models.Index(fields=["action"]),
        ]

    def __str__(self):
        return f"{self.action} {self.target_type}#{self.target_id} by {self.actor}"
