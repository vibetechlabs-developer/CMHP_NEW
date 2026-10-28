from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.db.models import ProtectedError
from rest_framework import exceptions

from apps.audit.services import record
from apps.common.errors import Conflict
from apps.customers.models import Customer

CUSTOMER_TRACKED_FIELDS = [
    "name",
    "contact_person",
    "email",
    "phone",
    "city",
    "gst_number",
    "billing_address",
    "shipping_address",
    "notes",
]


def _customer_snapshot(customer):
    return {field: getattr(customer, field) for field in CUSTOMER_TRACKED_FIELDS}


def _duplicate_customer_code_error():
    """A duplicate `(company, code)` raises `IntegrityError` at the
    database's own unique constraint; translated to a `Conflict` (409)
    here, following the more recent `apps.quality.services.
    create_material_specification` precedent rather than the older
    `apps.suppliers.services.create_supplier` one (`400`, via the view
    layer) - this task's own instruction to "handle duplicate-code races
    without an unhandled 500" is read here as "signal a genuine identity
    collision as a conflict", the natural remedy being "refetch/search
    for the existing one", not "resubmit a corrected payload". See
    docs/backend-decisions.md, Task 10A, for this explicit choice.
    """
    return Conflict("A customer with this code already exists for this company.")


@transaction.atomic
def create_customer(*, actor, company, code, name, **optional_fields):
    """`company` is always the URL's resolved company (see
    apps.customers.views) - never accepted from the request body. A
    duplicate `(company, code)` is handled here, not left to propagate as
    an unhandled 500 - see `_duplicate_customer_code_error`.
    """
    try:
        customer = Customer(company=company, code=code, name=name, created_by=actor, **optional_fields)
        customer.save()
    except IntegrityError as exc:
        raise _duplicate_customer_code_error() from exc

    record(
        actor=actor,
        action="customer.created",
        target_type="customer",
        target_id=customer.id,
        company=company,
        after={"code": customer.code, "is_active": True, **_customer_snapshot(customer)},
    )
    return customer


@transaction.atomic
def update_customer(*, actor, customer_id, expected_version, data):
    """Metadata update only - `code`/`company` are immutable and have no
    writable path here (see apps.customers.serializers). Deliberately
    does **not** check `customer.is_active`: this task explicitly allows
    metadata corrections on an inactive customer as long as the company
    itself is still active (the URL-resolution step in
    apps.customers.views already guarantees that). Requires the row lock
    (`select_for_update()`) and the caller's `expected_version` to match
    before anything is read for comparison, same Conflict-on-mismatch
    rule as every other mutation in this project.

    A no-op PATCH does not increment `version` or write an audit entry.
    "No-op" is decided *after* normalisation, not before: `customer.
    clean()` is called explicitly (in-memory only, nothing persisted yet)
    so a change that is only whitespace - e.g. re-sending the same
    address with different leading/trailing spaces - is caught the same
    way apps.companies.services.update_company's own docstring explains
    for Company (whose fields are normalised the same way). Unlike
    update_company, this only calls clean() once and does not perform an
    intermediate unconditional save() - Customer also carries a `version`
    counter, and a spurious write here would need to either bump it for
    an effective no-op or leave a first write undercounted, neither of
    which is correct for a versioned row; deciding no-op status before
    the one real save() avoids both.
    """
    customer = Customer.objects.select_for_update().get(pk=customer_id)
    if customer.version != expected_version:
        raise Conflict("This customer has changed since it was last read. Refetch and retry.")

    before = _customer_snapshot(customer)
    changed = {field: value for field, value in data.items() if getattr(customer, field) != value}
    if not changed:
        return customer

    for field, value in changed.items():
        setattr(customer, field, value)
    customer.clean()

    after = _customer_snapshot(customer)
    if before == after:
        return customer

    customer.version += 1
    customer.save(update_fields=[*changed.keys(), "version", "updated_at"])

    record(
        actor=actor,
        action="customer.updated",
        target_type="customer",
        target_id=customer.id,
        company=customer.company,
        before=before,
        after=after,
    )
    return customer


@transaction.atomic
def activate_customer(*, actor, customer_id, expected_version):
    """`is_active` False -> True. Requires the row lock and a matching
    `expected_version`, same as every other lifecycle mutation in this
    project. Explicitly checks `is_active` rather than relying on an
    implicit "not active means eligible" assumption - the same
    defensive-check lesson `apps.quality.services.cancel_incoming_
    inspection` had to apply once a third status appeared on that model;
    written explicitly here from the start even though `Customer` only
    ever has two `is_active` states today. Already-active is treated as
    an idempotent no-op: no version bump, no audit entry.
    """
    customer = Customer.objects.select_for_update().get(pk=customer_id)
    if customer.version != expected_version:
        raise Conflict("This customer has changed since it was last read. Refetch and retry.")
    if customer.is_active:
        return customer

    before = {"is_active": False}
    customer.is_active = True
    customer.version += 1
    customer.save(update_fields=["is_active", "version", "updated_at"])

    record(
        actor=actor,
        action="customer.activated",
        target_type="customer",
        target_id=customer.id,
        company=customer.company,
        before=before,
        after={"is_active": True},
    )
    return customer


@transaction.atomic
def deactivate_customer(*, actor, customer_id, expected_version):
    """`is_active` True -> False. No dependency checks - this task
    implements no quotation, sales order, invoice, or any other record
    that could reference a customer, so there is nothing yet to protect
    deactivation against (mirrors apps.suppliers.services.
    deactivate_supplier's identical reasoning). Deactivating never
    deletes or cascades - the row, and its code reservation, are
    permanent. Already-inactive is treated as an idempotent no-op: no
    version bump, no audit entry.
    """
    customer = Customer.objects.select_for_update().get(pk=customer_id)
    if customer.version != expected_version:
        raise Conflict("This customer has changed since it was last read. Refetch and retry.")
    if not customer.is_active:
        return customer

    before = {"is_active": True}
    customer.is_active = False
    customer.version += 1
    customer.save(update_fields=["is_active", "version", "updated_at"])

    record(
        actor=actor,
        action="customer.deactivated",
        target_type="customer",
        target_id=customer.id,
        company=customer.company,
        before=before,
        after={"is_active": False},
    )
    return customer


CUSTOMERS_DELETE = "customers.delete"


@transaction.atomic
def delete_customer(*, actor, company, customer_id, expected_version):
    """Permanently delete a customer that nothing references. Locked and
    version-checked; the deletion and its audit record commit together.
    Customers with sales orders or quotations are kept - deactivate them
    instead.
    """
    customer = Customer.objects.select_for_update().filter(pk=customer_id, company=company).first()
    if customer is None:
        raise exceptions.NotFound("Customer not found in this company.")
    if customer.version != expected_version:
        raise Conflict("This customer has changed since it was last read. Refetch and retry.")
    before = _customer_snapshot(customer)
    try:
        with transaction.atomic():
            customer.delete()
    except ProtectedError:
        raise DjangoValidationError(
            {"detail": "This customer has sales orders or quotations and cannot be deleted. Deactivate it instead."}
        )
    record(
        actor=actor,
        action="customer.deleted",
        target_type="customer",
        target_id=customer_id,
        company=company,
        before=before,
        after=None,
    )
