from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction

from apps.audit.services import record
from apps.catalog.models import Material, MaterialCategory, MaterialReorderSetting, UnitOfMeasure

UNIT_TRACKED_FIELDS = ["name"]
CATEGORY_TRACKED_FIELDS = ["name", "description"]
MATERIAL_TRACKED_FIELDS = [
    "name",
    "description",
    "category_id",
    "default_container_type_id",
    "code",
    "kind",
    "base_unit_id",
    "alcohol_percentage",
]


def _unit_snapshot(unit):
    return {field: getattr(unit, field) for field in UNIT_TRACKED_FIELDS}


def _category_snapshot(category):
    return {field: getattr(category, field) for field in CATEGORY_TRACKED_FIELDS}


def _material_snapshot(material):
    snapshot = {}
    for field in MATERIAL_TRACKED_FIELDS:
        val = getattr(material, field)
        # Decimal is not JSON-serializable; convert to string for audit log
        if isinstance(val, Decimal):
            val = str(val)
        snapshot[field] = val
    return snapshot


# ---------------------------------------------------------------------------
# UnitOfMeasure
# ---------------------------------------------------------------------------


@transaction.atomic
def create_unit(*, actor, code, name, dimension, canonical_factor=None):
    """No company/store context - the catalog is shared, so record() is
    called with company=None, store=None (its defaults), never an
    arbitrary company/store standing in as an "owner". `canonical_factor`
    (Task 12B-2) is optional and, if given, immutable afterward - see
    `UnitOfMeasure`'s own docstring for exactly what it means and does not
    mean. Never defaulted or inferred here; a caller must state it
    explicitly.
    """
    unit = UnitOfMeasure(code=code, name=name, dimension=dimension, canonical_factor=canonical_factor)
    unit.save()
    record(
        actor=actor,
        action="unit.created",
        target_type="unit_of_measure",
        target_id=unit.id,
        after={
            "code": unit.code,
            "dimension": unit.dimension,
            "canonical_factor": str(unit.canonical_factor) if unit.canonical_factor is not None else None,
            "is_active": True,
            **_unit_snapshot(unit),
        },
    )
    return unit


@transaction.atomic
def update_unit(*, actor, unit, data):
    """Only `name` is ever in `data` - the caller's serializer already
    restricts this to UNIT_TRACKED_FIELDS; `code`/`dimension` are
    immutable through this API (and through the model itself).
    """
    before = _unit_snapshot(unit)
    changed = {field: value for field, value in data.items() if getattr(unit, field) != value}
    if not changed:
        return unit

    for field, value in changed.items():
        setattr(unit, field, value)
    unit.save()

    after = _unit_snapshot(unit)
    if before == after:
        return unit

    record(
        actor=actor,
        action="unit.updated",
        target_type="unit_of_measure",
        target_id=unit.id,
        before=before,
        after=after,
    )
    return unit


@transaction.atomic
def activate_unit(*, actor, unit):
    if unit.is_active:
        return unit
    unit.is_active = True
    unit.save(update_fields=["is_active", "updated_at"])
    record(
        actor=actor,
        action="unit.activated",
        target_type="unit_of_measure",
        target_id=unit.id,
        before={"is_active": False},
        after={"is_active": True},
    )
    return unit


@transaction.atomic
def deactivate_unit(*, actor, unit):
    """Rejected (400, a documented conflict - not a 500, not a silent
    cascade) while any active Material still references this unit as its
    base_unit - deactivating it would otherwise leave those materials
    pointing at a unit that no longer means anything, with nothing
    stopping a caller from not noticing. Once every referencing material
    is itself inactive (or none exist), deactivation is allowed.
    """
    if not unit.is_active:
        return unit
    if Material.objects.filter(base_unit=unit, is_active=True).exists():
        raise ValidationError(
            {"detail": "Cannot deactivate a unit of measure while active materials reference it."}
        )
    unit.is_active = False
    unit.save(update_fields=["is_active", "updated_at"])
    record(
        actor=actor,
        action="unit.deactivated",
        target_type="unit_of_measure",
        target_id=unit.id,
        before={"is_active": True},
        after={"is_active": False},
    )
    return unit


# ---------------------------------------------------------------------------
# MaterialCategory
# ---------------------------------------------------------------------------


@transaction.atomic
def create_category(*, actor, code, name, description=""):
    category = MaterialCategory(code=code, name=name, description=description)
    category.save()
    record(
        actor=actor,
        action="material_category.created",
        target_type="material_category",
        target_id=category.id,
        after={"code": category.code, "is_active": True, **_category_snapshot(category)},
    )
    return category


@transaction.atomic
def update_category(*, actor, category, data):
    before = _category_snapshot(category)
    changed = {field: value for field, value in data.items() if getattr(category, field) != value}
    if not changed:
        return category

    for field, value in changed.items():
        setattr(category, field, value)
    category.save()

    after = _category_snapshot(category)
    if before == after:
        return category

    record(
        actor=actor,
        action="material_category.updated",
        target_type="material_category",
        target_id=category.id,
        before=before,
        after=after,
    )
    return category


@transaction.atomic
def activate_category(*, actor, category):
    if category.is_active:
        return category
    category.is_active = True
    category.save(update_fields=["is_active", "updated_at"])
    record(
        actor=actor,
        action="material_category.activated",
        target_type="material_category",
        target_id=category.id,
        before={"is_active": False},
        after={"is_active": True},
    )
    return category


@transaction.atomic
def deactivate_category(*, actor, category):
    """Same documented-conflict rule as deactivate_unit(), for
    MaterialCategory instead of UnitOfMeasure.
    """
    if not category.is_active:
        return category
    if Material.objects.filter(category=category, is_active=True).exists():
        raise ValidationError(
            {"detail": "Cannot deactivate a material category while active materials reference it."}
        )
    category.is_active = False
    category.save(update_fields=["is_active", "updated_at"])
    record(
        actor=actor,
        action="material_category.deactivated",
        target_type="material_category",
        target_id=category.id,
        before={"is_active": True},
        after={"is_active": False},
    )
    return category


# ---------------------------------------------------------------------------
# Material
# ---------------------------------------------------------------------------


@transaction.atomic
def create_material(*, actor, code, name, kind, base_unit, description="", category=None, default_container_type=None, alcohol_percentage=None):
    """Rejects an inactive base_unit, category or default_container_type
    (400) - a material must never be created already pointing at a
    reference that cannot currently be used. `category` and
    `default_container_type` are each optional (None is always allowed);
    `base_unit` is required and always resolved by the caller (the view)
    from `base_unit_id` before this function is called.
    """
    if not base_unit.is_active:
        raise ValidationError({"base_unit": "Base unit is inactive."})
    if category is not None and not category.is_active:
        raise ValidationError({"category": "Category is inactive."})
    if default_container_type is not None and not default_container_type.is_active:
        raise ValidationError({"default_container_type": "Container type is inactive."})

    material = Material(
        code=code,
        name=name,
        description=description,
        kind=kind,
        base_unit=base_unit,
        category=category,
        default_container_type=default_container_type,
        alcohol_percentage=alcohol_percentage,
    )
    material.save()
    record(
        actor=actor,
        action="material.created",
        target_type="material",
        target_id=material.id,
        after={
            "code": material.code,
            "kind": material.kind,
            "base_unit_id": material.base_unit_id,
            "is_active": True,
            **_material_snapshot(material),
        },
    )
    return material


_MATERIAL_RELATION_FIELDS = {
    "category_id": "category",
    "default_container_type_id": "default_container_type",
    "base_unit_id": "base_unit",
}


@transaction.atomic
def update_material(*, actor, material, data):
    """`data` is already restricted to MATERIAL_TRACKED_FIELDS - name/
    description/category_id/default_container_type_id - by the caller's
    serializer; code/kind/base_unit are immutable through this API. A
    PATCH that would newly assign an inactive category or default
    container type is rejected (400) - re-assigning to the *same* one the
    material already has is never rejected here, even if that reference
    has since become inactive, because that is not a new assignment (and
    the model's own field-shape validation in Material.clean() does not
    check this either - see its docstring).
    """
    for field, relation_name in _MATERIAL_RELATION_FIELDS.items():
        if field not in data:
            continue
        new_value = data[field]
        current_id = getattr(material, field)
        if new_value is not None and new_value.pk != current_id and not new_value.is_active:
            label = relation_name.replace("_", " ")
            raise ValidationError({relation_name: f"{label.capitalize()} is inactive."})

    before = _material_snapshot(material)
    changed = {}
    for field, value in data.items():
        current = getattr(material, field)
        new_value = value.pk if field in _MATERIAL_RELATION_FIELDS and value is not None else value
        if current != new_value:
            changed[field] = value

    if not changed:
        return material

    for field, value in changed.items():
        if field in _MATERIAL_RELATION_FIELDS:
            setattr(material, _MATERIAL_RELATION_FIELDS[field], value)
        else:
            setattr(material, field, value)
    material.save()

    after = _material_snapshot(material)
    if before == after:
        return material

    record(
        actor=actor,
        action="material.updated",
        target_type="material",
        target_id=material.id,
        before=before,
        after=after,
    )
    return material


@transaction.atomic
def activate_material(*, actor, material):
    """Re-checks the base_unit/category are still active before allowing
    reactivation - either could have been deactivated while this material
    itself was inactive (deactivating a unit/category is only blocked by
    *active* materials referencing it, so an inactive material's
    references are never a blocker for that - see deactivate_unit()/
    deactivate_category()).
    """
    if material.is_active:
        return material
    if not material.base_unit.is_active:
        raise ValidationError({"base_unit": "Base unit is inactive."})
    if material.category_id is not None and not material.category.is_active:
        raise ValidationError({"category": "Category is inactive."})
    material.is_active = True
    material.save(update_fields=["is_active", "updated_at"])
    record(
        actor=actor,
        action="material.activated",
        target_type="material",
        target_id=material.id,
        before={"is_active": False},
        after={"is_active": True},
    )
    return material


@transaction.atomic
def deactivate_material(*, actor, material):
    """Excludes the material from new selections under the established
    activation rule (apps.catalog.permissions / the material list's own
    `is_active` filter) without touching any historical reference: every
    receipt/register/audit row that already names this material keeps
    its own frozen snapshot fields (material_code_snapshot etc.) exactly
    as the stock_movements/receiving apps already guarantee, and this
    call itself never creates, cancels or alters a stock movement.
    Deactivating a material preserves its identity and history: the row
    is never deleted, and nothing about its code/kind/base_unit/category
    is touched.
    """
    if not material.is_active:
        return material
    material.is_active = False
    material.save(update_fields=["is_active", "updated_at"])
    record(
        actor=actor,
        action="material.deactivated",
        target_type="material",
        target_id=material.id,
        before={"is_active": True},
        after={"is_active": False},
    )
    return material


# ---------------------------------------------------------------------------
# MaterialReorderSetting - store-scoped reorder level (see its own model
# docstring for why this is a separate row, never a field on Material).
# ---------------------------------------------------------------------------


def get_material_reorder_setting(*, store, material):
    """Returns the setting row or None - None means "not configured for
    this store", never a reorder level of zero.
    """
    return MaterialReorderSetting.objects.filter(store=store, material=material).first()


@transaction.atomic
def set_material_reorder_level(*, actor, store, material, reorder_level):
    """Creates or updates the one (store, material) row. Setting it never
    creates a stock movement and never changes Material itself - see
    MaterialReorderSetting's own docstring. `reorder_level` must already
    be a non-negative Decimal (validated by the caller's serializer); the
    model's own CheckConstraint/clean() re-validate it regardless.
    """
    setting = MaterialReorderSetting.objects.filter(store=store, material=material).first()
    before = {"reorder_level": str(setting.reorder_level)} if setting else None
    if setting is None:
        setting = MaterialReorderSetting(store=store, material=material, reorder_level=reorder_level, updated_by=actor)
    else:
        setting.reorder_level = reorder_level
        setting.updated_by = actor
    setting.save()
    record(
        actor=actor,
        action="material_reorder_setting.updated" if before else "material_reorder_setting.created",
        target_type="material_reorder_setting",
        target_id=setting.id,
        store=store,
        before=before,
        after={"reorder_level": str(setting.reorder_level)},
    )
    return setting
