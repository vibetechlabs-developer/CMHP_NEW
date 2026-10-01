from django.db import IntegrityError, transaction

from apps.audit.services import record
from apps.common.errors import Conflict
from apps.store_preparation.models import StorePreparation

PREPARATION_TRACKED_FIELDS = ["packing_type", "insert_required"]
ALLOWED_UPDATE_FIELDS = set(PREPARATION_TRACKED_FIELDS)


def _preparation_snapshot(preparation):
    return {field: getattr(preparation, field) for field in PREPARATION_TRACKED_FIELDS}


def _duplicate_preparation_error():
    """A concurrent duplicate hits the `OneToOneField`'s own unique
    constraint at the database level, raising `IntegrityError` - translated
    here to a `Conflict` (409), the same choice every other "genuine
    identity collision" in this project makes (see e.g. apps.products.
    services._duplicate_product_code_error) rather than an unhandled 500.
    """
    return Conflict("A store preparation record already exists for this batch plan.")


@transaction.atomic
def create_store_preparation(*, actor, store, batch_plan, packing_type="", insert_required=None):
    """Create the ONE `StorePreparation` for `batch_plan` at `store`.
    `store`/`batch_plan` are already-resolved, already-access-checked
    objects - this function has no permission awareness of its own,
    matching every other service in this project (access is the view
    layer's job). No lock is taken on `batch_plan` itself: this never
    mutates it, and the one-per-plan rule is enforced by the database's own
    unique constraint on the `OneToOneField`, not by a row lock racing
    against it - a concurrent duplicate attempt is a clear 409, never a
    lost update or a 500 (see `_duplicate_preparation_error`).
    """
    try:
        preparation = StorePreparation(
            batch_plan=batch_plan,
            store=store,
            packing_type=(packing_type or "").strip(),
            insert_required=insert_required,
            created_by=actor,
            updated_by=actor,
        )
        preparation.save()
    except IntegrityError as exc:
        raise _duplicate_preparation_error() from exc

    record(
        actor=actor,
        action="store_preparation.created",
        target_type="store_preparation",
        target_id=preparation.id,
        company=batch_plan.company,
        store=store,
        after={"batch_plan_id": batch_plan.id, "store_id": store.id, **_preparation_snapshot(preparation)},
    )
    return preparation


@transaction.atomic
def update_store_preparation(*, actor, preparation_id, expected_version, data):
    """Edit `packing_type`/`insert_required` only - `batch_plan`/`store` are
    immutable (enforced in `StorePreparation.clean()`, and never accepted
    here at all - the caller's serializer already restricts `data` to
    `ALLOWED_UPDATE_FIELDS`). Locked, version-checked; "no-op" is decided
    *after* normalisation (`packing_type` stripped via `clean()`), not
    before, matching `apps.products.services.update_product`'s identical
    reasoning - a whitespace-only change is still a no-op. Real edits bump
    `version` and write one audit event, atomically; an audit failure rolls
    back everything.
    """
    preparation = (
        StorePreparation.objects.select_for_update().select_related("batch_plan__company", "store").get(pk=preparation_id)
    )
    if preparation.version != expected_version:
        raise Conflict("This store preparation record has changed since it was last read. Refetch and retry.")

    before = _preparation_snapshot(preparation)
    for field in PREPARATION_TRACKED_FIELDS:
        if field in data:
            setattr(preparation, field, data[field])
    preparation.clean()
    after = _preparation_snapshot(preparation)
    if before == after:
        return preparation

    preparation.version += 1
    preparation.updated_by = actor
    preparation.save(update_fields=["packing_type", "insert_required", "version", "updated_by", "updated_at"])

    record(
        actor=actor,
        action="store_preparation.updated",
        target_type="store_preparation",
        target_id=preparation.id,
        company=preparation.batch_plan.company,
        store=preparation.store,
        before=before,
        after=after,
    )
    return preparation
