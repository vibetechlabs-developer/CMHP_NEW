from apps.audit.models import AuditLog


def record(*, actor, action, target_type, target_id, company=None, store=None, before=None, after=None):
    """Create one audit log row.

    Must always be called from inside the same `transaction.atomic()`
    block as the business mutation it documents (see apps.users.services)
    - if this insert fails, that block rolls back and the mutation never
    commits either. `before`/`after` must only ever contain allowlisted,
    non-sensitive fields; never pass a password, password hash, token, or
    raw request body through this function. `company` and `store` are
    independent, both-nullable context fields (Task 07A) - every call
    site before Task 09A passed at most one of them, since nothing
    before then was ever both company- and store-scoped at once. Task
    09A's `apps.receiving.services` was the first genuine exception: a
    GoodsReceipt is simultaneously scoped to a purchasing company
    (derived from its source PurchaseOrder) and a physical store (where
    it was received), and both are meaningful audit context - so its
    calls here deliberately pass both. Task 09B-1's `apps.quality.
    services` is the second such exception, for the same reason one
    level further downstream: an IncomingInspection is simultaneously
    scoped to the purchasing company and the physical store its source
    GoodsReceiptLine already carries. Every other call site should still
    pass at most one, unless it has the same genuinely-dual-scoped
    reason a future task would need to document the same way.
    """
    return AuditLog.objects.create(
        actor=actor,
        action=action,
        target_type=target_type,
        target_id=target_id,
        company=company,
        store=store,
        before=before,
        after=after,
    )
