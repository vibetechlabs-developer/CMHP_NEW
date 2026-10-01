from django.contrib.auth import get_user_model
from django.db import transaction

from apps.audit.services import record
from apps.companies.models import CompanyMembership
from apps.permissions.models import MembershipRole
from apps.permissions.services import assign_role as _assign_role
from apps.permissions.services import deactivate_role_assignment as _deactivate_role_assignment

User = get_user_model()

USER_TRACKED_FIELDS = ["username", "email", "first_name", "last_name"]


def _user_snapshot(user):
    return {field: getattr(user, field) for field in USER_TRACKED_FIELDS}


@transaction.atomic
def create_user(*, actor, username, email, initial_password, first_name="", last_name=""):
    """Create an ordinary user via Django's normal user-creation path
    (`UserManager.create_user`, which hashes the password with
    `set_password()` - never stored/logged in plaintext, and never
    included in the audit `after` snapshot below). Leaves
    is_staff/is_superuser at their model defaults (False) and creates no
    membership or role assignment.
    """
    user = User.objects.create_user(
        username=username,
        email=email,
        password=initial_password,
        first_name=first_name,
        last_name=last_name,
    )
    record(
        actor=actor,
        action="user.created",
        target_type="user",
        target_id=user.id,
        after=_user_snapshot(user),
    )
    return user


@transaction.atomic
def update_user(*, actor, user, data):
    """Apply only the changed fields from `data` (already restricted to
    USER_TRACKED_FIELDS by the caller's serializer). A request that
    resubmits identical values changes nothing and creates no audit entry.
    """
    before = _user_snapshot(user)
    changed = {field: value for field, value in data.items() if getattr(user, field) != value}
    if not changed:
        return user

    for field, value in changed.items():
        setattr(user, field, value)
    user.save(update_fields=[*changed.keys(), "updated_at"])

    record(
        actor=actor,
        action="user.updated",
        target_type="user",
        target_id=user.id,
        before=before,
        after=_user_snapshot(user),
    )
    return user


@transaction.atomic
def activate_user(*, actor, user):
    if user.is_active:
        return user
    user.is_active = True
    user.save(update_fields=["is_active", "updated_at"])
    record(
        actor=actor,
        action="user.activated",
        target_type="user",
        target_id=user.id,
        before={"is_active": False},
        after={"is_active": True},
    )
    return user


@transaction.atomic
def deactivate_user(*, actor, user):
    if not user.is_active:
        return user
    user.is_active = False
    user.save(update_fields=["is_active", "updated_at"])
    record(
        actor=actor,
        action="user.deactivated",
        target_type="user",
        target_id=user.id,
        before={"is_active": True},
        after={"is_active": False},
    )
    return user


@transaction.atomic
def assign_company_membership(*, actor, user, company):
    """Assign (or reactivate) `user`'s membership in `company`.

    Returns (membership, created) - created is True only for a genuinely
    new row (HTTP 201 at the view layer); reactivating an inactive row or
    calling this again on an already-active row both return created=False
    (HTTP 200) - and only the reactivation case, not the already-active
    no-op case, adds an audit entry.
    """
    existing = CompanyMembership.objects.filter(user=user, company=company).first()
    was_active = existing.is_active if existing else None

    membership = CompanyMembership.objects.activate(user=user, company=company)
    created = existing is None

    if created:
        record(
            actor=actor,
            action="membership.created",
            target_type="company_membership",
            target_id=membership.id,
            company=company,
            after={"user_id": user.id, "company_id": company.id, "is_active": True},
        )
    elif was_active is False:
        record(
            actor=actor,
            action="membership.reactivated",
            target_type="company_membership",
            target_id=membership.id,
            company=company,
            before={"is_active": False},
            after={"is_active": True},
        )
    return membership, created


@transaction.atomic
def deactivate_company_membership(*, actor, membership):
    if not membership.is_active:
        return membership
    membership.is_active = False
    membership.save(update_fields=["is_active", "updated_at"])
    record(
        actor=actor,
        action="membership.deactivated",
        target_type="company_membership",
        target_id=membership.id,
        company=membership.company,
        before={"is_active": True},
        after={"is_active": False},
    )
    return membership


@transaction.atomic
def assign_membership_role(*, actor, membership, role):
    """Thin audited wrapper around apps.permissions.services.assign_role() -
    reused as-is (not reimplemented), which already enforces the
    same-company invariant and idempotent get_or_create/reactivate
    behaviour. Only the "was this actually new/reactivated" distinction
    needed for HTTP 201 vs 200 and for skipping the audit entry on a true
    no-op is added here.
    """
    existing = MembershipRole.objects.filter(membership=membership, role=role).first()
    was_active = existing.is_active if existing else None

    assignment = _assign_role(membership, role)
    created = existing is None

    if created:
        record(
            actor=actor,
            action="role_assignment.created",
            target_type="membership_role",
            target_id=assignment.id,
            company=membership.company,
            after={"membership_id": membership.id, "role_id": role.id, "is_active": True},
        )
    elif was_active is False:
        record(
            actor=actor,
            action="role_assignment.reactivated",
            target_type="membership_role",
            target_id=assignment.id,
            company=membership.company,
            before={"is_active": False},
            after={"is_active": True},
        )
    return assignment, created


@transaction.atomic
def deactivate_membership_role(*, actor, membership, role):
    existing = MembershipRole.objects.filter(membership=membership, role=role).first()
    if existing is None:
        return None
    was_active = existing.is_active

    assignment = _deactivate_role_assignment(membership, role)

    if was_active:
        record(
            actor=actor,
            action="role_assignment.deactivated",
            target_type="membership_role",
            target_id=assignment.id,
            company=membership.company,
            before={"is_active": True},
            after={"is_active": False},
        )
    return assignment
