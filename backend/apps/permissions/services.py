from django.core.exceptions import ValidationError
from django.db import transaction

from apps.audit.services import record
from apps.permissions.models import (
    CompanyRole,
    MembershipRole,
    PermissionDefinition,
    StoreRole,
    StoreRoleAssignment,
    normalize_permission_code,
)

ROLE_TRACKED_FIELDS = ["name", "description"]


def _role_snapshot(role):
    return {field: getattr(role, field) for field in ROLE_TRACKED_FIELDS}


def effective_permission_codes(user, company):
    """The set of permission codes `user` currently holds within `company`.

    Deny by default: returns an empty frozenset unless the user, the
    company, at least one membership row, at least one role assignment,
    the assigned role, and the permission definition are *all* active.
    Anonymous users and users with no membership in this company get an
    empty result. is_staff/is_superuser are never consulted - matching
    apps.companies.services.active_companies_for_user, Django-admin access
    is unrelated to business permissions.

    A single query (with `.distinct()`), so checking one company's
    permissions never costs more than one round trip regardless of how
    many roles/permissions are involved.
    """
    if user is None or not getattr(user, "is_authenticated", False):
        return frozenset()
    if not user.is_active:
        return frozenset()
    if company is None or not company.is_active:
        return frozenset()

    codes = (
        PermissionDefinition.objects.filter(
            is_active=True,
            scope=PermissionDefinition.Scope.COMPANY,
            company_roles__is_active=True,
            company_roles__company=company,
            company_roles__membership_assignments__is_active=True,
            company_roles__membership_assignments__membership__is_active=True,
            company_roles__membership_assignments__membership__user=user,
            company_roles__membership_assignments__membership__company=company,
        )
        .values_list("code", flat=True)
        .distinct()
    )
    return frozenset(codes)


def user_has_permission(user, company, permission_code):
    """Whether `user` currently holds `permission_code` within `company`."""
    return normalize_permission_code(permission_code) in effective_permission_codes(user, company)


def effective_store_permission_codes(user, store):
    """The set of STORE-scope permission codes `user` currently holds
    within `store`. Structurally identical to effective_permission_codes()
    above (see there for the deny-by-default/single-query reasoning) -
    kept as a separate function, not a shared parametrised one, because
    the two traverse entirely different relation paths (company_roles vs
    store_roles) and a shared implementation would need reflection-style
    field-name lookups that would be harder to read than the duplication.

    `scope=STORE` here (mirroring `scope=COMPANY` above) means a
    permission that was ever incorrectly attached to a CompanyRole (e.g.
    through a bulk-write ORM bypass that skips PermissionDefinition
    scope validation) is never resolved here regardless - this path only
    ever traverses `store_roles`, which only `StoreRole` populates.
    Company membership/role never grants any result here, and vice versa:
    neither model nor query in this function ever references
    Company/CompanyMembership/CompanyRole.
    """
    if user is None or not getattr(user, "is_authenticated", False):
        return frozenset()
    if not user.is_active:
        return frozenset()
    if store is None or not store.is_active:
        return frozenset()

    codes = (
        PermissionDefinition.objects.filter(
            is_active=True,
            scope=PermissionDefinition.Scope.STORE,
            store_roles__is_active=True,
            store_roles__store=store,
            store_roles__membership_assignments__is_active=True,
            store_roles__membership_assignments__membership__is_active=True,
            store_roles__membership_assignments__membership__user=user,
            store_roles__membership_assignments__membership__store=store,
        )
        .values_list("code", flat=True)
        .distinct()
    )
    return frozenset(codes)


def store_user_has_permission(user, store, permission_code):
    """Whether `user` currently holds `permission_code` within `store`."""
    return normalize_permission_code(permission_code) in effective_store_permission_codes(user, store)


def user_has_permission_in_any_store(user, permission_code):
    """Whether `user` holds `permission_code` in at least one store they
    currently have active membership in - used for resources that are
    shared across stores (Task 07B's material catalog), where access is
    gated by "does this user have the right permission *somewhere*", not
    by a specific store_id from the URL (the catalog itself has none).

    Deny by default, same requirements as effective_store_permission_codes()
    (active user, active store, active membership, active assignment,
    active role, active permission, scope=STORE) - just existence-checked
    across every store at once instead of returning the set for one. A
    single query (`.exists()`), so this stays cheap regardless of how many
    stores the user belongs to. Company membership/role is never
    consulted - this can only ever be satisfied through store access.
    """
    if user is None or not getattr(user, "is_authenticated", False):
        return False
    if not user.is_active:
        return False

    normalized = normalize_permission_code(permission_code)
    return PermissionDefinition.objects.filter(
        code=normalized,
        is_active=True,
        scope=PermissionDefinition.Scope.STORE,
        store_roles__is_active=True,
        store_roles__store__is_active=True,
        store_roles__membership_assignments__is_active=True,
        store_roles__membership_assignments__membership__is_active=True,
        store_roles__membership_assignments__membership__user=user,
    ).exists()


@transaction.atomic
def assign_role(membership, role):
    """Assign `role` to `membership`, idempotently.

    Requires both to belong to the same company - raises ValidationError
    otherwise, independent of whatever validation the model/admin layer
    also does. Reactivates an existing inactive assignment instead of
    creating a duplicate row (the (membership, role) unique constraint
    covers inactive rows too, so a duplicate insert would fail anyway;
    this is what makes repeated calls idempotent instead of erroring).
    `select_for_update()` avoids a race between two concurrent callers
    both seeing "does not exist yet" and both trying to insert.
    """
    if membership.company_id != role.company_id:
        raise ValidationError("Role and membership must belong to the same company.")

    assignment, created = MembershipRole.objects.select_for_update().get_or_create(
        membership=membership, role=role
    )
    if not created and not assignment.is_active:
        assignment.is_active = True
        assignment.save(update_fields=["is_active", "updated_at"])
    return assignment


@transaction.atomic
def deactivate_role_assignment(membership, role):
    """Deactivate the (membership, role) assignment if it exists and is
    active. Returns the assignment (whatever its resulting state) or None
    if no such assignment row exists at all. Never deletes the row -
    deactivation only, consistent with the rest of this codebase.
    """
    try:
        assignment = MembershipRole.objects.select_for_update().get(
            membership=membership, role=role
        )
    except MembershipRole.DoesNotExist:
        return None
    if assignment.is_active:
        assignment.is_active = False
        assignment.save(update_fields=["is_active", "updated_at"])
    return assignment


@transaction.atomic
def assign_store_role(membership, role):
    """Assign `role` to `membership`, idempotently. Mirrors assign_role()
    above exactly, for StoreRoleAssignment/StoreMembership/StoreRole
    instead of MembershipRole/CompanyMembership/CompanyRole.
    """
    if membership.store_id != role.store_id:
        raise ValidationError("Role and membership must belong to the same store.")

    assignment, created = StoreRoleAssignment.objects.select_for_update().get_or_create(
        membership=membership, role=role
    )
    if not created and not assignment.is_active:
        assignment.is_active = True
        assignment.save(update_fields=["is_active", "updated_at"])
    return assignment


@transaction.atomic
def deactivate_store_role_assignment(membership, role):
    """Mirrors deactivate_role_assignment() above exactly."""
    try:
        assignment = StoreRoleAssignment.objects.select_for_update().get(
            membership=membership, role=role
        )
    except StoreRoleAssignment.DoesNotExist:
        return None
    if assignment.is_active:
        assignment.is_active = False
        assignment.save(update_fields=["is_active", "updated_at"])
    return assignment


@transaction.atomic
def create_company_role(*, actor, company, code, name, description=""):
    """New roles always start with no permissions - assigning any is a
    separate, explicit call to replace_role_permissions() below. Company
    comes only as a parameter here, never from request data at the view
    layer - see apps.permissions.views.CompanyRoleListCreateView.
    """
    role = CompanyRole(company=company, code=code, name=name, description=description)
    role.save()  # normalises code/name and validates via CompanyRole.clean()
    record(
        actor=actor,
        action="role.created",
        target_type="company_role",
        target_id=role.id,
        company=company,
        after={"code": role.code, "is_active": True, **_role_snapshot(role)},
    )
    return role


@transaction.atomic
def update_company_role(*, actor, role, data):
    """Apply only the changed fields from `data` (already restricted to
    ROLE_TRACKED_FIELDS - name/description - by the caller's serializer;
    `code` and `company` are immutable through this API). Re-checked after
    save() too, same reasoning as apps.companies.services.update_company:
    CompanyRole.save() strips whitespace, so a whitespace-only change must
    not be treated as a real one.
    """
    before = _role_snapshot(role)
    changed = {field: value for field, value in data.items() if getattr(role, field) != value}
    if not changed:
        return role

    for field, value in changed.items():
        setattr(role, field, value)
    role.save()

    after = _role_snapshot(role)
    if before == after:
        return role

    record(
        actor=actor,
        action="role.updated",
        target_type="company_role",
        target_id=role.id,
        company=role.company,
        before=before,
        after=after,
    )
    return role


@transaction.atomic
def activate_company_role(*, actor, role):
    if role.is_active:
        return role
    role.is_active = True
    role.save(update_fields=["is_active", "updated_at"])
    record(
        actor=actor,
        action="role.activated",
        target_type="company_role",
        target_id=role.id,
        company=role.company,
        before={"is_active": False},
        after={"is_active": True},
    )
    return role


@transaction.atomic
def deactivate_company_role(*, actor, role):
    """Deactivating a role immediately removes its contribution to
    effective_permission_codes() (which already requires
    company_roles__is_active=True) on the very next lookup - no separate
    write to MembershipRole rows is needed or performed. Those assignment
    rows, and their own is_active state, are left untouched, so
    reactivating this role later restores any of them that are still
    individually active.
    """
    if not role.is_active:
        return role
    role.is_active = False
    role.save(update_fields=["is_active", "updated_at"])
    record(
        actor=actor,
        action="role.deactivated",
        target_type="company_role",
        target_id=role.id,
        company=role.company,
        before={"is_active": True},
        after={"is_active": False},
    )
    return role


@transaction.atomic
def create_store_role(*, actor, store, code, name, description=""):
    """Mirrors create_company_role() exactly, for StoreRole/SharedStore."""
    role = StoreRole(store=store, code=code, name=name, description=description)
    role.save()  # normalises code/name and validates via StoreRole.clean()
    record(
        actor=actor,
        action="store_role.created",
        target_type="store_role",
        target_id=role.id,
        store=store,
        after={"code": role.code, "is_active": True, **_role_snapshot(role)},
    )
    return role


@transaction.atomic
def update_store_role(*, actor, role, data):
    """Mirrors update_company_role() exactly."""
    before = _role_snapshot(role)
    changed = {field: value for field, value in data.items() if getattr(role, field) != value}
    if not changed:
        return role

    for field, value in changed.items():
        setattr(role, field, value)
    role.save()

    after = _role_snapshot(role)
    if before == after:
        return role

    record(
        actor=actor,
        action="store_role.updated",
        target_type="store_role",
        target_id=role.id,
        store=role.store,
        before=before,
        after=after,
    )
    return role


@transaction.atomic
def activate_store_role(*, actor, role):
    if role.is_active:
        return role
    role.is_active = True
    role.save(update_fields=["is_active", "updated_at"])
    record(
        actor=actor,
        action="store_role.activated",
        target_type="store_role",
        target_id=role.id,
        store=role.store,
        before={"is_active": False},
        after={"is_active": True},
    )
    return role


@transaction.atomic
def deactivate_store_role(*, actor, role):
    """Mirrors deactivate_company_role() exactly - removes this role's
    contribution to effective_store_permission_codes() on the very next
    lookup, without touching StoreRoleAssignment rows.
    """
    if not role.is_active:
        return role
    role.is_active = False
    role.save(update_fields=["is_active", "updated_at"])
    record(
        actor=actor,
        action="store_role.deactivated",
        target_type="store_role",
        target_id=role.id,
        store=role.store,
        before={"is_active": True},
        after={"is_active": False},
    )
    return role


@transaction.atomic
def _replace_role_permission_set(
    *, actor, role, permission_codes, scope, action, target_type, company=None, store=None
):
    """Shared implementation behind replace_role_permissions() (COMPANY)
    and replace_store_role_permissions() (STORE) - identical validation/
    locking/no-op rules, differing only in which scope of
    PermissionDefinition rows may be resolved and which audit
    company/store context applies. See replace_role_permissions()'s
    docstring for the full rule set (normalisation, duplicate collapsing,
    unknown-vs-inactive-code separation, no-partial-write, locking,
    no-op suppression) - all of it applies here unchanged, plus:

    - `scope` additionally restricts which PermissionDefinition rows can
      ever be resolved: a code that exists but belongs to the *other*
      scope is indistinguishable from a code that does not exist at all
      (both fall into "unknown permission code(s)") - this is what makes
      "company services must reject STORE permissions" (and vice versa)
      true without a separate error path or message that would leak
      which scope a foreign code actually belongs to.
    """
    role = type(role).objects.select_for_update().get(pk=role.pk)

    normalized_codes = {normalize_permission_code(code) for code in permission_codes}

    definitions = list(
        PermissionDefinition.objects.filter(code__in=normalized_codes, scope=scope)
    )
    found_codes = {definition.code for definition in definitions}

    missing_codes = sorted(normalized_codes - found_codes)
    if missing_codes:
        raise ValidationError({"permission_codes": f"Unknown permission code(s): {missing_codes}"})

    inactive_codes = sorted(definition.code for definition in definitions if not definition.is_active)
    if inactive_codes:
        raise ValidationError({"permission_codes": f"Inactive permission code(s): {inactive_codes}"})

    before_codes = sorted(role.permissions.values_list("code", flat=True))
    after_codes = sorted(found_codes)

    if before_codes == after_codes:
        return role, after_codes

    role.permissions.set(definitions)

    record(
        actor=actor,
        action=action,
        target_type=target_type,
        target_id=role.id,
        company=company,
        store=store,
        before={"permission_codes": before_codes},
        after={"permission_codes": after_codes},
    )
    return role, after_codes


def replace_role_permissions(*, actor, role, permission_codes):
    """Atomically replace a CompanyRole's entire permission set with
    exactly the given codes. Only codes resolving to an existing, active,
    scope=COMPANY PermissionDefinition are accepted - a code that exists
    but is scope=STORE is rejected the same way an unknown code is (see
    _replace_role_permission_set's docstring). See that function for the
    full normalisation/duplicate/locking/no-op rule set.
    """
    return _replace_role_permission_set(
        actor=actor,
        role=role,
        permission_codes=permission_codes,
        scope=PermissionDefinition.Scope.COMPANY,
        action="role.permissions_replaced",
        target_type="company_role",
        company=role.company,
    )


def replace_store_role_permissions(*, actor, role, permission_codes):
    """Atomically replace a StoreRole's entire permission set with exactly
    the given codes. Only codes resolving to an existing, active,
    scope=STORE PermissionDefinition are accepted - a code that exists but
    is scope=COMPANY is rejected the same way an unknown code is. See
    _replace_role_permission_set's docstring for the full rule set.
    """
    return _replace_role_permission_set(
        actor=actor,
        role=role,
        permission_codes=permission_codes,
        scope=PermissionDefinition.Scope.STORE,
        action="store_role.permissions_replaced",
        target_type="store_role",
        store=role.store,
    )
