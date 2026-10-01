from django.db import transaction

from apps.audit.services import record
from apps.companies.models import Company

COMPANY_TRACKED_FIELDS = ["legal_name", "display_name"]


def _company_snapshot(company):
    return {field: getattr(company, field) for field in COMPANY_TRACKED_FIELDS}


def active_companies_for_user(user):
    """Companies the given user currently has active access to.

    A company is only returned when the user, the membership row, and the
    company itself are all active - inactive users, inactive memberships
    and inactive companies are all excluded. Anonymous users and users
    with no membership rows get an empty queryset.

    This answers "which companies is this account a member of", nothing
    more. It intentionally does not consult is_staff/is_superuser -
    membership access and admin/permission access are separate concerns,
    so those flags never implicitly grant company access here. Likewise,
    having a membership does not by itself grant any module/action
    permission within that company; that is a separate, later concern.
    """
    if user is None or not getattr(user, "is_authenticated", False):
        return Company.objects.none()
    if not user.is_active:
        return Company.objects.none()
    return (
        Company.objects.filter(
            is_active=True,
            memberships__user=user,
            memberships__is_active=True,
        )
        .distinct()
        .order_by("code")
    )


@transaction.atomic
def create_company(*, actor, code, legal_name, display_name=""):
    """Create an active company. Company.save() normalises `code` (trim +
    upper) and strips/validates `legal_name`/`display_name` via its own
    clean() - not reimplemented here. Creates no membership, role, or
    store record.
    """
    company = Company(code=code, legal_name=legal_name, display_name=display_name)
    company.save()
    record(
        actor=actor,
        action="company.created",
        target_type="company",
        target_id=company.id,
        company=company,
        after={"code": company.code, "is_active": True, **_company_snapshot(company)},
    )
    return company


@transaction.atomic
def update_company(*, actor, company, data):
    """Apply only the changed fields from `data` (already restricted to
    COMPANY_TRACKED_FIELDS by the caller's serializer - `code` is
    immutable through this API). Company.save() also strips whitespace via
    clean(), so a change that is only whitespace is re-checked *after*
    save() too - a naive pre-save-only comparison (as apps.users.services.
    update_user uses, safe there because User has no such normalisation)
    would otherwise write and audit a row that normalises to no real
    change.
    """
    before = _company_snapshot(company)
    changed = {field: value for field, value in data.items() if getattr(company, field) != value}
    if not changed:
        return company

    for field, value in changed.items():
        setattr(company, field, value)
    company.save()

    after = _company_snapshot(company)
    if before == after:
        return company

    record(
        actor=actor,
        action="company.updated",
        target_type="company",
        target_id=company.id,
        company=company,
        before=before,
        after=after,
    )
    return company


@transaction.atomic
def activate_company(*, actor, company):
    if company.is_active:
        return company
    company.is_active = True
    company.save(update_fields=["is_active", "updated_at"])
    record(
        actor=actor,
        action="company.activated",
        target_type="company",
        target_id=company.id,
        company=company,
        before={"is_active": False},
        after={"is_active": True},
    )
    return company


@transaction.atomic
def deactivate_company(*, actor, company):
    """Deactivating a company never cascades: memberships, roles, and role
    assignments all keep their own is_active state untouched, so
    reactivating the company later makes any of them that are still
    individually active eligible again immediately (apps.permissions.
    services.effective_permission_codes() and apps.companies.services.
    active_companies_for_user() both already require company.is_active,
    so deactivation alone is enough to block access on the very next
    lookup - no cascade write is needed for that).
    """
    if not company.is_active:
        return company
    company.is_active = False
    company.save(update_fields=["is_active", "updated_at"])
    record(
        actor=actor,
        action="company.deactivated",
        target_type="company",
        target_id=company.id,
        company=company,
        before={"is_active": True},
        after={"is_active": False},
    )
    return company
