from django.db import transaction

from apps.audit.services import record
from apps.permissions.models import StoreRoleAssignment
from apps.permissions.services import assign_store_role as _assign_store_role
from apps.permissions.services import deactivate_store_role_assignment as _deactivate_store_role_assignment
from apps.stores.models import SharedStore, StorageLocation, StoreMembership

STORE_TRACKED_FIELDS = ["name", "description"]
LOCATION_TRACKED_FIELDS = ["name", "description"]


def _store_snapshot(store):
    return {field: getattr(store, field) for field in STORE_TRACKED_FIELDS}


def _location_snapshot(location):
    return {field: getattr(location, field) for field in LOCATION_TRACKED_FIELDS}


def active_stores_for_user(user):
    """Stores the given user currently has active access to.

    Deny by default: a store is only returned when the user, the
    membership row, and the store itself are all active. Anonymous users
    and users with no membership row get an empty queryset. Entirely
    independent of company membership - this never consults
    CompanyMembership/CompanyRole, and apps.companies.services.
    active_companies_for_user never consults this table either. A user
    may have store access with zero company memberships, and vice versa.
    """
    if user is None or not getattr(user, "is_authenticated", False):
        return SharedStore.objects.none()
    if not user.is_active:
        return SharedStore.objects.none()
    return (
        SharedStore.objects.filter(
            is_active=True,
            memberships__user=user,
            memberships__is_active=True,
        )
        .distinct()
        .order_by("code")
    )


@transaction.atomic
def create_store(*, actor, code, name, description=""):
    """Create an active shared store. No owning-company FK exists on this
    model at all (see apps.stores.models.SharedStore) - this function has
    no `company` parameter to accidentally misuse either. Creates no
    membership or role.
    """
    store = SharedStore(code=code, name=name, description=description)
    store.save()
    record(
        actor=actor,
        action="store.created",
        target_type="store",
        target_id=store.id,
        store=store,
        after={"code": store.code, "is_active": True, **_store_snapshot(store)},
    )
    return store


@transaction.atomic
def update_store(*, actor, store, data):
    """Apply only the changed fields from `data` (already restricted to
    STORE_TRACKED_FIELDS by the caller's serializer - `code` is immutable
    through this API). Re-checked after save() too, same reasoning as
    apps.companies.services.update_company: SharedStore.save() strips
    whitespace, so a whitespace-only change must not be treated as real.
    """
    before = _store_snapshot(store)
    changed = {field: value for field, value in data.items() if getattr(store, field) != value}
    if not changed:
        return store

    for field, value in changed.items():
        setattr(store, field, value)
    store.save()

    after = _store_snapshot(store)
    if before == after:
        return store

    record(
        actor=actor,
        action="store.updated",
        target_type="store",
        target_id=store.id,
        store=store,
        before=before,
        after=after,
    )
    return store


@transaction.atomic
def activate_store(*, actor, store):
    if store.is_active:
        return store
    store.is_active = True
    store.save(update_fields=["is_active", "updated_at"])
    record(
        actor=actor,
        action="store.activated",
        target_type="store",
        target_id=store.id,
        store=store,
        before={"is_active": False},
        after={"is_active": True},
    )
    return store


@transaction.atomic
def deactivate_store(*, actor, store):
    """Deactivating a store never cascades: memberships, roles, and role
    assignments all keep their own is_active state untouched, identical to
    apps.companies.services.deactivate_company. effective_store_permission_
    codes()/active_stores_for_user() both already require store.is_active,
    so deactivation alone blocks access on the very next lookup.
    """
    if not store.is_active:
        return store
    store.is_active = False
    store.save(update_fields=["is_active", "updated_at"])
    record(
        actor=actor,
        action="store.deactivated",
        target_type="store",
        target_id=store.id,
        store=store,
        before={"is_active": True},
        after={"is_active": False},
    )
    return store


@transaction.atomic
def assign_store_membership(*, actor, user, store):
    """Assign (or reactivate) `user`'s membership in `store`. Mirrors
    apps.users.services.assign_company_membership exactly - see there for
    the created-vs-reactivated-vs-no-op reasoning behind the 201/200 split
    and the no-duplicate-audit-on-no-op rule.
    """
    existing = StoreMembership.objects.filter(user=user, store=store).first()
    was_active = existing.is_active if existing else None

    membership = StoreMembership.objects.activate(user=user, store=store)
    created = existing is None

    if created:
        record(
            actor=actor,
            action="store_membership.created",
            target_type="store_membership",
            target_id=membership.id,
            store=store,
            after={"user_id": user.id, "store_id": store.id, "is_active": True},
        )
    elif was_active is False:
        record(
            actor=actor,
            action="store_membership.reactivated",
            target_type="store_membership",
            target_id=membership.id,
            store=store,
            before={"is_active": False},
            after={"is_active": True},
        )
    return membership, created


@transaction.atomic
def deactivate_store_membership(*, actor, membership):
    if not membership.is_active:
        return membership
    membership.is_active = False
    membership.save(update_fields=["is_active", "updated_at"])
    record(
        actor=actor,
        action="store_membership.deactivated",
        target_type="store_membership",
        target_id=membership.id,
        store=membership.store,
        before={"is_active": True},
        after={"is_active": False},
    )
    return membership


@transaction.atomic
def assign_store_membership_role(*, actor, membership, role):
    """Audited wrapper around apps.permissions.services.assign_store_role()
    - mirrors apps.users.services.assign_membership_role exactly (see
    there for the create-vs-reactivate-vs-no-op reasoning).
    """
    existing = StoreRoleAssignment.objects.filter(membership=membership, role=role).first()
    was_active = existing.is_active if existing else None

    assignment = _assign_store_role(membership, role)
    created = existing is None

    if created:
        record(
            actor=actor,
            action="store_role_assignment.created",
            target_type="store_role_assignment",
            target_id=assignment.id,
            store=membership.store,
            after={"membership_id": membership.id, "role_id": role.id, "is_active": True},
        )
    elif was_active is False:
        record(
            actor=actor,
            action="store_role_assignment.reactivated",
            target_type="store_role_assignment",
            target_id=assignment.id,
            store=membership.store,
            before={"is_active": False},
            after={"is_active": True},
        )
    return assignment, created


@transaction.atomic
def deactivate_store_membership_role(*, actor, membership, role):
    """Audited wrapper around
    apps.permissions.services.deactivate_store_role_assignment() - mirrors
    apps.users.services.deactivate_membership_role exactly.
    """
    existing = StoreRoleAssignment.objects.filter(membership=membership, role=role).first()
    if existing is None:
        return None
    was_active = existing.is_active

    assignment = _deactivate_store_role_assignment(membership, role)

    if was_active:
        record(
            actor=actor,
            action="store_role_assignment.deactivated",
            target_type="store_role_assignment",
            target_id=assignment.id,
            store=membership.store,
            before={"is_active": True},
            after={"is_active": False},
        )
    return assignment


@transaction.atomic
def create_location(*, actor, store, code, name, description=""):
    """Create a storage location. Rejected by the caller (the view) if
    `store` is inactive, before this function is ever called - mirrors
    apps.permissions.services.create_store_role's inactive-parent check
    being done at the view layer, not here.
    """
    location = StorageLocation(store=store, code=code, name=name, description=description)
    location.save()
    record(
        actor=actor,
        action="storage_location.created",
        target_type="storage_location",
        target_id=location.id,
        store=store,
        after={"code": location.code, "is_active": True, **_location_snapshot(location)},
    )
    return location


@transaction.atomic
def update_location(*, actor, location, data):
    before = _location_snapshot(location)
    changed = {field: value for field, value in data.items() if getattr(location, field) != value}
    if not changed:
        return location

    for field, value in changed.items():
        setattr(location, field, value)
    location.save()

    after = _location_snapshot(location)
    if before == after:
        return location

    record(
        actor=actor,
        action="storage_location.updated",
        target_type="storage_location",
        target_id=location.id,
        store=location.store,
        before=before,
        after=after,
    )
    return location


@transaction.atomic
def activate_location(*, actor, location):
    if location.is_active:
        return location
    location.is_active = True
    location.save(update_fields=["is_active", "updated_at"])
    record(
        actor=actor,
        action="storage_location.activated",
        target_type="storage_location",
        target_id=location.id,
        store=location.store,
        before={"is_active": False},
        after={"is_active": True},
    )
    return location


@transaction.atomic
def deactivate_location(*, actor, location):
    """Always allowed, regardless of the parent store's state - revoking/
    cleaning up a location must never be blocked. No stock-related
    dependency check exists here, unlike deactivate_unit()/deactivate_
    category() in apps.catalog.services - this task implements no stock
    model at all, so there is nothing yet that could reference a location
    the way a Material references a unit/category. A later inventory task
    that adds stock balances per location will need to add an equivalent
    "does active stock still reference this location" guard at that
    point - it does not exist yet and must not be assumed.
    """
    if not location.is_active:
        return location
    location.is_active = False
    location.save(update_fields=["is_active", "updated_at"])
    record(
        actor=actor,
        action="storage_location.deactivated",
        target_type="storage_location",
        target_id=location.id,
        store=location.store,
        before={"is_active": True},
        after={"is_active": False},
    )
    return location
