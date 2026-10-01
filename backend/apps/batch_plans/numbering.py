"""Task 12D: official batch number allocation - a separate, explicit,
audited command on an ALREADY-EXISTING `BatchPlan`. Allocating a number
authorizes NOTHING: not production, not stock reservation, not material
issue, and it changes neither the plan's own `DRAFT` status nor the source
order's confirmation state. It is exactly one thing: recording that this
plan now has a permanent official identifier.

CONFIRMED CLIENT NUMBERING RULES:
- Format `CODEYY-NNN`, e.g. `GER26-001`.
- `CODE` is the SOURCE ORDER'S CUSTOMER's own code (`SalesOrder.customer.
  code`) - explicitly NOT automatically the operating `Company.code`.
  Task 12B-1 left this as an open question for the client-register
  mapping in general; this task answers it, but ONLY for numbering
  purposes, per this task's own explicit instruction - it does not
  retroactively resolve A13 (customer company-scoping) anywhere else.
- The year is the year the number is ALLOCATED (server time, business
  time zone) - never the order date, never the plan's own planned
  manufacturing date/month, never browser time.
- The sequence restarts at 001 for each `(operating company, client code)`
  pair, every new allocation year.
- Displayed with a minimum of 3 digits; after 999 the sequence continues
  1000, 1001, ... - it never wraps and never truncates. This is a
  documented TECHNICAL WORKING CHOICE about overflow behaviour, not a
  client-confirmed statement about realistic batch volume.

WORKING NAMESPACE, NOT A CONFIRMED CLIENT POLICY: `(operating_company,
client_code_snapshot, full_allocation_year)`. Consequences, all
deliberate and all documented here rather than silently accepted:
- The SAME normalised client code, within ONE operating company, shares
  one sequence - two different customers who happened to be coded
  identically within that company (should that ever occur) would share a
  numbering sequence too; `Customer.code` is only unique per
  `(company, code)` (Task 10A), so this is already the strongest identity
  guarantee available without a client-confirmed cross-company customer
  directory.
- TWO DIFFERENT OPERATING COMPANIES whose customers happen to share a
  code produce the IDENTICAL displayed `number` string for their
  respective Nth allocation of that code in a year. This is expected, not
  a bug: nothing here claims the `number` string is globally unique, and
  nothing merges customer records or creates a shared client directory
  across companies to prevent it - see `docs/erp-handoff-open-decisions.
  md`, Task 12D, for this recorded as an explicitly unresolved client
  decision.
"""

import re
from zoneinfo import ZoneInfo

from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import exceptions

from apps.audit.services import record
from apps.batch_plans.models import BatchNumberAllocation, BatchNumberSequenceCounter, BatchPlan
from apps.common.errors import Conflict, Forbidden
from apps.companies.services import active_companies_for_user
from apps.customers.models import Customer
from apps.permissions.services import user_has_permission
from apps.sales_orders.models import SalesOrder, SalesOrderLine

BATCH_PLANS_VIEW = "batch_plans.view"
BATCH_PLANS_ALLOCATE_NUMBER = "batch_plans.allocate_number"

# Only the characters `Customer.code` normalisation (`apps.companies.models.
# normalize_code` - trim + upper-case) already guarantees for a WELL-FORMED
# code. A code containing anything else (spaces, `/`, punctuation - e.g. the
# client's own Product Code sample `GER/06` shows this is a real
# possibility for a code field in this project) is REJECTED, never
# stripped or rewritten - see `_validate_client_code`.
_CODE_PATTERN = re.compile(r"^[A-Z0-9]+$")


def business_now():
    """The current instant, converted into `settings.BUSINESS_TIME_ZONE`
    (default `Asia/Kolkata` - an ASSUMPTION for client review, the exact
    same one `apps.sales_orders.confirmation.business_today` already
    documents and reuses, never re-decided here). The allocation YEAR is
    always `business_now().year` - captured once, after every lock in
    `allocate_batch_number` is already held, and used consistently for
    both the counter namespace and the stored `numbered_at`.
    """
    return timezone.now().astimezone(ZoneInfo(settings.BUSINESS_TIME_ZONE))


def format_batch_number(client_code, allocation_year, sequence_value):
    """`CODE` + 2-digit year + `-` + a minimum-3-digit, never-wrapped,
    never-truncated sequence - e.g. `format_batch_number("GER", 2026, 1)
    == "GER26-001"`, and `format_batch_number("GER", 2026, 1000) ==
    "GER26-1000"`.
    """
    return f"{client_code}{allocation_year % 100:02d}-{sequence_value:03d}"


def _validate_client_code(code):
    if not code or not _CODE_PATTERN.match(code):
        raise DjangoValidationError(
            {
                "detail": (
                    f"Customer code '{code}' cannot safely form an official batch number - only letters and "
                    "digits are supported. The code was not changed; fix it on the customer record if it needs "
                    "to be numbering-safe."
                )
            }
        )
    return code


def _get_or_create_counter_locked(*, company, client_code, allocation_year):
    """NEVER an unlocked `MAX(...)+1`. If this namespace's counter row
    already exists, lock it directly (`select_for_update()`) and return
    it. If not, create it inside a SAVEPOINT - a nested `transaction.
    atomic()` block, which Postgres commits or rolls back independently of
    the surrounding transaction. A concurrent first-creation race is then
    caught as `IntegrityError` (the row's own `UniqueConstraint`) *without*
    poisoning the outer transaction, and the now-guaranteed-to-exist row is
    simply re-read and locked for real - never an unexplained 500, and
    never a second, silently-duplicate counter row.
    """
    counter = (
        BatchNumberSequenceCounter.objects.select_for_update()
        .filter(operating_company=company, client_code_snapshot=client_code, allocation_year=allocation_year)
        .first()
    )
    if counter is not None:
        return counter
    try:
        with transaction.atomic():
            counter = BatchNumberSequenceCounter.objects.create(
                operating_company=company,
                client_code_snapshot=client_code,
                allocation_year=allocation_year,
                last_sequence=0,
            )
    except IntegrityError:
        counter = BatchNumberSequenceCounter.objects.select_for_update().get(
            operating_company=company, client_code_snapshot=client_code, allocation_year=allocation_year
        )
    return counter


@transaction.atomic
def allocate_batch_number(*, actor, company_id, plan_id, expected_version):
    """Allocate `plan`'s one and only official batch number, atomically.

    1. Lock the plan (`select_for_update()`) - the same lock every
       quantity edit already takes (`apps.batch_plans.services.
       update_batch_plan`), so allocation and an edit serialize: whichever
       commits first makes the other fail with 409 on `expected_version`,
       never a partial/lost update.
    2. Re-check access UNDER the lock (active company membership,
       `batch_plans.view`, `batch_plans.allocate_number`) - authority is
       decided at this point, not only at request entry. `formulas.
       approve` is deliberately never checked here: allocation is a
       separate action from formula approval, with its own permission.
    3. Stale `expected_version` -> 409, exactly like every other command.
       An authorized repeat AT THE CURRENT version of an already-numbered
       plan is an idempotent no-op: the existing number/year/sequence/
       timestamp are returned completely unchanged - no new sequence is
       drawn, no plan-version bump, no audit event, and it is not
       reassessed against a since-changed customer code or source state.
    4. Lock the source `SalesOrder`, then its `Customer` - this order
       (order-before-customer) mirrors `apps.sales_orders.confirmation`'s
       own `load_locked_confirmation_context` sub-order exactly, so this
       can never deadlock against a concurrent order edit/confirmation
       that also locks both. Re-derive the line's current product/unit
       identity (protected against concurrent drift by the SAME order
       lock every line-mutating path in `apps.sales_orders.services.
       update_sales_order` already holds throughout) and refuse to
       allocate if it no longer matches the pinned formula revision -
       `FormulaRevision.formula_id`/`product_id`/`output_uom_id` are all
       immutable identities, so nothing about the FORMULA side can ever
       need re-locking; only the mutable order/line/customer side can.
    5. Resolve and validate the customer's own code (`_validate_client_
       code`) - never accepted from the client, never silently stripped.
    6. Capture `business_now()` - the allocation instant and its derived
       year - only AFTER every lock above is held, and use that one
       captured value consistently for the counter namespace and for the
       stored record.
    7. Lock (or safely create) the one sequence counter for `(operating
       company, client code, allocation year)` and increment it (see
       `_get_or_create_counter_locked`) - two different plans in the same
       namespace, allocated concurrently, are strictly serialized by this
       lock and always receive distinct sequential numbers.
    8. Create the immutable `BatchNumberAllocation` row, bump the plan's
       own `version` (its `DRAFT` status is NEVER changed by this), and
       write the audit event - all inside this one transaction; an audit
       failure rolls back the counter increment and the allocation
       together with it, leaving the counter exactly as it was.
    """
    plan = get_object_or_404(
        BatchPlan.objects.select_for_update().select_related("company"), pk=plan_id, company_id=company_id
    )
    company = plan.company

    if not active_companies_for_user(actor).filter(pk=company.id).exists():
        raise exceptions.NotFound("Company not found.")
    missing = [
        code for code in (BATCH_PLANS_VIEW, BATCH_PLANS_ALLOCATE_NUMBER) if not user_has_permission(actor, company, code)
    ]
    if missing:
        raise Forbidden(f"The following permission(s) are required: {', '.join(missing)}.")

    if plan.version != expected_version:
        raise Conflict("This batch plan has changed since it was last read. Refetch and retry.")

    existing = BatchNumberAllocation.objects.filter(batch_plan_id=plan.id).first()
    if existing is not None:
        return plan, existing

    line_stub = SalesOrderLine.objects.values("sales_order_id").get(pk=plan.sales_order_line_id)
    order = SalesOrder.objects.select_for_update().get(pk=line_stub["sales_order_id"])
    customer = Customer.objects.select_for_update().get(pk=order.customer_id)

    # Re-read the line's CURRENT product identity now that the order (and
    # therefore every path that could have changed it) is locked - see the
    # docstring above for why no separate lock on the line/product rows is
    # needed beyond this.
    current_line = SalesOrderLine.objects.select_related("product__sales_uom").get(
        pk=plan.sales_order_line_id, sales_order=order
    )
    revision = plan.formula_revision
    formula_product_id = revision.formula.product_id
    formula_output_uom_id = revision.output_uom_id
    if plan.packing_content_uom_id is not None:
        expected_pack_uom_id = plan.pack_uom_id_snapshot
    else:
        expected_pack_uom_id = formula_output_uom_id
    is_incompatible = (
        current_line.product_id != formula_product_id
        or current_line.product.sales_uom_id != expected_pack_uom_id
    )
    if is_incompatible:
        raise DjangoValidationError(
            {
                "detail": (
                    "The referenced sales order line's product or unit no longer matches the pinned formula "
                    "revision. Number allocation is blocked until the source is compatible again."
                )
            }
        )

    client_code = _validate_client_code(customer.code)

    allocation_instant = business_now()
    allocation_year = allocation_instant.year

    counter = _get_or_create_counter_locked(company=company, client_code=client_code, allocation_year=allocation_year)
    counter.last_sequence += 1
    counter.save(update_fields=["last_sequence", "updated_at"])
    sequence_value = counter.last_sequence

    number = format_batch_number(client_code, allocation_year, sequence_value)

    allocation = BatchNumberAllocation.objects.create(
        batch_plan=plan,
        operating_company=company,
        number=number,
        client_code_snapshot=client_code,
        allocation_year=allocation_year,
        sequence_value=sequence_value,
        numbered_by=actor,
        numbered_at=allocation_instant,
        allocation_timezone=settings.BUSINESS_TIME_ZONE,
    )

    plan.version += 1
    plan.save(update_fields=["version", "updated_at"])

    record(
        actor=actor,
        action="batch_plan.number_allocated",
        target_type="batch_plan",
        target_id=plan.id,
        company=company,
        after={
            "number": number,
            "client_code_snapshot": client_code,
            "allocation_year": allocation_year,
            "sequence_value": sequence_value,
            "numbered_by_id": actor.id,
            "numbered_at": allocation_instant.isoformat(),
            "allocation_timezone": settings.BUSINESS_TIME_ZONE,
        },
    )
    return plan, allocation
