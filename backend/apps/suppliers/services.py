from django.db import transaction

from apps.audit.services import record
from apps.suppliers.models import Supplier

SUPPLIER_TRACKED_FIELDS = [
    "legal_name",
    "display_name",
    "contact_name",
    "email",
    "phone",
    "address_line_1",
    "address_line_2",
    "city",
    "state_region",
    "postal_code",
    "country_code",
]


def _supplier_snapshot(supplier):
    return {field: getattr(supplier, field) for field in SUPPLIER_TRACKED_FIELDS}


@transaction.atomic
def create_supplier(*, actor, code, legal_name, **optional_fields):
    """No company/store context - the supplier directory is shared
    (provisionally, see apps.suppliers.models.Supplier docstring), so
    record() is called with company=None, store=None (its defaults).
    """
    supplier = Supplier(code=code, legal_name=legal_name, **optional_fields)
    supplier.save()
    record(
        actor=actor,
        action="supplier.created",
        target_type="supplier",
        target_id=supplier.id,
        after={"code": supplier.code, "is_active": True, **_supplier_snapshot(supplier)},
    )
    return supplier


@transaction.atomic
def update_supplier(*, actor, supplier, data):
    """`data` is already restricted to SUPPLIER_TRACKED_FIELDS by the
    caller's serializer - `code` is immutable through this API (and
    through the model itself).
    """
    before = _supplier_snapshot(supplier)
    changed = {field: value for field, value in data.items() if getattr(supplier, field) != value}
    if not changed:
        return supplier

    for field, value in changed.items():
        setattr(supplier, field, value)
    supplier.save()

    after = _supplier_snapshot(supplier)
    if before == after:
        return supplier

    record(
        actor=actor,
        action="supplier.updated",
        target_type="supplier",
        target_id=supplier.id,
        before=before,
        after=after,
    )
    return supplier


@transaction.atomic
def activate_supplier(*, actor, supplier):
    if supplier.is_active:
        return supplier
    supplier.is_active = True
    supplier.save(update_fields=["is_active", "updated_at"])
    record(
        actor=actor,
        action="supplier.activated",
        target_type="supplier",
        target_id=supplier.id,
        before={"is_active": False},
        after={"is_active": True},
    )
    return supplier


@transaction.atomic
def deactivate_supplier(*, actor, supplier):
    """No dependency checks - this task implements no purchase orders,
    receipts, or any other record that could reference a supplier, so
    there is nothing to protect deactivation against yet (contrast
    apps.catalog.services.deactivate_unit, which does have a real
    dependent - Material.base_unit). Deactivating a supplier preserves
    its identity and history: the row is never deleted.
    """
    if not supplier.is_active:
        return supplier
    supplier.is_active = False
    supplier.save(update_fields=["is_active", "updated_at"])
    record(
        actor=actor,
        action="supplier.deactivated",
        target_type="supplier",
        target_id=supplier.id,
        before={"is_active": True},
        after={"is_active": False},
    )
    return supplier
