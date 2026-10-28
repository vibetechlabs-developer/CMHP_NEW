import secrets
from decimal import ROUND_HALF_UP, Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone

from apps.audit.services import record
from apps.catalog.models import Material, UnitOfMeasure
from apps.common.errors import Conflict, Forbidden
from apps.permissions.services import user_has_permission
from apps.purchasing.models import (
    PurchaseOrder,
    PurchaseOrderIssueLineSnapshot,
    PurchaseOrderIssueSnapshot,
    PurchaseOrderLine,
    PurchaseRequest,
    PurchaseRequestApproval,
    PurchaseRequestApprovalRound,
    PurchaseRequestApprovalRoundLine,
    PurchaseRequestLine,
)
from apps.suppliers.models import Supplier

_REFERENCE_MAX_ATTEMPTS = 5

# Task 08B-2: a fixed, illustrative three-step sequence - see
# docs/purchase-workflow-proposal.md for why this is a proposal, not a
# confirmed final step count, and apps.purchasing.services.
# approve_purchase_request/reject_purchase_request for how it is used.
APPROVAL_TOTAL_STEPS = 3

# The two permission codes cancel_purchase_request must choose between,
# depending on the purchase request's *actual* (locked) status - see
# apps.common.errors.Forbidden for why this check happens here, inside
# the transaction, rather than at the view layer like every other
# permission check in this project.
_CANCEL_DRAFT_PERMISSION = "purchase_requests.cancel"
_CANCEL_PENDING_PERMISSION = "purchase_requests.cancel_pending"


def _generate_reference():
    """Collision-safe, human-legible reference: a date stamp (for rough
    chronological sorting at a glance) plus 10 hex characters of
    cryptographic randomness (~40 bits - astronomically unlikely to
    collide even at high volume). Never `count() + 1`: that approach
    breaks the moment two requests are created concurrently (both read
    the same count, both compute the same "next" number) or a row is
    ever removed from the middle of the sequence. This is explicitly an
    internal identifier, not a finalised statutory/business numbering
    scheme (see docs/backend-tasks.md, Task 08B-1).
    """
    date_part = timezone.now().strftime("%Y%m%d")
    suffix = secrets.token_hex(5).upper()
    return f"PR-{date_part}-{suffix}"


def _create_header_with_unique_reference(*, company, actor, required_by, notes):
    """Retries on the extremely unlikely event of a reference collision.
    Each attempt runs in its own savepoint (`transaction.atomic()` nested
    inside the caller's own atomic block) so a failed attempt's
    `IntegrityError` only discards that one insert, never the caller's
    already-validated line data or anything else in progress.
    """
    for _ in range(_REFERENCE_MAX_ATTEMPTS):
        try:
            with transaction.atomic():
                purchase_request = PurchaseRequest(
                    company=company,
                    reference=_generate_reference(),
                    created_by=actor,
                    required_by=required_by,
                    notes=notes,
                )
                purchase_request.save()
                return purchase_request
        except IntegrityError:
            continue
    raise RuntimeError("Could not generate a unique purchase request reference after several attempts.")


def _validate_lines(lines_data):
    """Resolves and fully validates a proposed list of lines - used both
    for initial creation and for a full draft-line replacement - without
    creating or modifying any row. Raises (and changes nothing) on: an
    unknown `material_id` (Http404, the same "unknown FK reference in the
    body" convention already used by apps.catalog.views.
    MaterialListCreateView.create() for base_unit_id/category_id), a
    material repeated across more than one line, or a fractional quantity
    against a COUNT-dimension unit (Task 08B-1 explicitly does not
    support fractional COUNT quantities - see the model/task docs).

    Deliberately does NOT check whether the material/unit/category is
    currently *active* - that check only applies at submission time
    (apps.purchasing.services.submit_purchase_request), not while a
    request is still an editable draft; see docs/backend-decisions.md,
    Task 08B-1, for why.
    """
    seen_material_ids = set()
    resolved = []
    for index, line in enumerate(lines_data, start=1):
        material_id = line["material_id"]
        if material_id in seen_material_ids:
            raise DjangoValidationError(
                {
                    "lines": (
                        f"Line {index}: material {material_id} already appears in another line - "
                        "each material may appear at most once per request."
                    )
                }
            )
        seen_material_ids.add(material_id)

        material = get_object_or_404(Material, pk=material_id)
        unit = material.base_unit
        quantity = line["quantity"]
        if unit.dimension == UnitOfMeasure.Dimension.COUNT and quantity % 1 != 0:
            raise DjangoValidationError(
                {
                    "lines": (
                        f"Line {index}: '{unit.code}' is a COUNT unit and does not accept a "
                        "fractional quantity in this phase."
                    )
                }
            )

        resolved.append(
            {
                "line_number": index,
                "material": material,
                "unit": unit,
                "quantity": quantity,
                "notes": (line.get("notes") or "").strip(),
            }
        )
    return resolved


def _create_lines(purchase_request, resolved_lines):
    PurchaseRequestLine.objects.bulk_create(
        [
            PurchaseRequestLine(
                purchase_request=purchase_request,
                line_number=item["line_number"],
                material=item["material"],
                unit=item["unit"],
                quantity=item["quantity"],
                notes=item["notes"],
            )
            for item in resolved_lines
        ]
    )


def _header_snapshot(purchase_request):
    return {
        "required_by": purchase_request.required_by.isoformat() if purchase_request.required_by else None,
        "notes": purchase_request.notes,
    }


def _line_snapshot_list(purchase_request):
    return [
        {"material_id": line.material_id, "quantity": str(line.quantity), "notes": line.notes}
        for line in purchase_request.lines.order_by("line_number", "id")
    ]


@transaction.atomic
def create_purchase_request(*, actor, company, required_by=None, notes="", lines=None):
    """Always created `DRAFT`, `version=1`. An empty `lines` list is
    accepted - a request may start with no lines and have them added via
    a later PATCH (see update_purchase_request).
    """
    resolved_lines = _validate_lines(lines or [])
    purchase_request = _create_header_with_unique_reference(
        company=company, actor=actor, required_by=required_by, notes=notes or ""
    )
    _create_lines(purchase_request, resolved_lines)
    record(
        actor=actor,
        action="purchase_request.created",
        target_type="purchase_request",
        target_id=purchase_request.id,
        company=company,
        after={
            "reference": purchase_request.reference,
            "status": purchase_request.status,
            **_header_snapshot(purchase_request),
            "lines": _line_snapshot_list(purchase_request),
        },
    )
    return purchase_request


@transaction.atomic
def update_purchase_request(*, actor, purchase_request_id, expected_version, data):
    """`data` may contain `required_by`/`notes`/`lines`, each independently
    optional (omitted = unchanged). If `lines` is present at all - even
    as an empty list - it fully replaces the existing line set: every
    proposed line is validated first (see _validate_lines), and only once
    every line passes are the old rows deleted and the new ones created,
    all inside this same transaction - a caller never sees a partially
    replaced line set.

    Requires the row lock (`select_for_update`) and the caller's
    `expected_version` to match the current `version` before anything is
    read for comparison, so two concurrent PATCHes can never both
    "succeed" against the same starting state - see apps.common.errors.
    Conflict. A PATCH that would not actually change anything (every
    supplied value already matches the current row) is a no-op: no
    version increment, no audit entry, per Task 08B-1's explicit rule.
    """
    purchase_request = PurchaseRequest.objects.select_for_update().get(pk=purchase_request_id)
    if purchase_request.version != expected_version:
        raise Conflict("This purchase request has changed since it was last read. Refetch and retry.")
    if purchase_request.status != PurchaseRequest.Status.DRAFT:
        raise DjangoValidationError({"detail": "Only a draft purchase request can be edited."})

    before_header = _header_snapshot(purchase_request)
    header_changed = False
    if "required_by" in data and data["required_by"] != purchase_request.required_by:
        purchase_request.required_by = data["required_by"]
        header_changed = True
    if "notes" in data and data["notes"] != purchase_request.notes:
        purchase_request.notes = data["notes"]
        header_changed = True

    lines_changed = False
    before_lines = None
    after_lines = None
    if "lines" in data:
        before_lines = _line_snapshot_list(purchase_request)
        resolved = _validate_lines(data["lines"])
        after_lines = [
            {"material_id": item["material"].id, "quantity": str(item["quantity"]), "notes": item["notes"]}
            for item in resolved
        ]
        if after_lines != before_lines:
            lines_changed = True
            purchase_request.lines.all().delete()
            _create_lines(purchase_request, resolved)

    if not header_changed and not lines_changed:
        return purchase_request

    purchase_request.version += 1
    purchase_request.save(update_fields=["required_by", "notes", "version", "updated_at"])

    audit_before = dict(before_header)
    audit_after = _header_snapshot(purchase_request)
    if lines_changed:
        audit_before["lines"] = before_lines
        audit_after["lines"] = after_lines

    record(
        actor=actor,
        action="purchase_request.updated",
        target_type="purchase_request",
        target_id=purchase_request.id,
        company=purchase_request.company,
        before=audit_before,
        after=audit_after,
    )
    return purchase_request


@transaction.atomic
def submit_purchase_request(*, actor, purchase_request_id, expected_version):
    """`DRAFT` -> `SUBMITTED`, starting the next approval round at step 1.
    Revalidates every line's material, base unit, and (if assigned)
    category are all still active - any of these could have changed
    since the line was added to the draft - and rejects a `required_by`
    date that has since fallen into the past. Freezes each line's
    material/unit code+name into its snapshot fields at this moment, so a
    later master-data rename never rewrites what was actually submitted -
    then copies that same frozen content into a brand new, permanent
    PurchaseRequestApprovalRound(+lines) row that this specific round
    alone owns (see that model's docstring for why a separate copy is
    required rather than reusing PurchaseRequestLine, which the *next*
    submit is free to overwrite).

    `current_round` increments by exactly 1 every time this actually
    transitions DRAFT -> SUBMITTED (whether this is the first submission
    ever, or a resubmission after `revise_purchase_request` following a
    rejection) - Task 08B-2's confirmed rule is that a resubmission
    always restarts at step 1, never resumes from whichever step
    rejected the previous round.

    Retry semantics: a call at the *current* version against an
    already-`SUBMITTED` request is treated as an idempotent retry of a
    call that already succeeded - it returns the unchanged resource with
    no further mutation and no new audit entry, never an error, and does
    not create a second round. A call against `CANCELLED`, `APPROVED`, or
    `REJECTED` is rejected (`400`) regardless of version: none of those
    have a direct transition to `SUBMITTED` in this slice - a `REJECTED`
    request must go through the explicit `revise_purchase_request` action
    first. Submitting never creates a Purchase Order, never touches
    stock, and does not itself constitute approval of anything.
    """
    purchase_request = PurchaseRequest.objects.select_for_update().get(pk=purchase_request_id)
    if purchase_request.version != expected_version:
        raise Conflict("This purchase request has changed since it was last read. Refetch and retry.")

    if purchase_request.status == PurchaseRequest.Status.SUBMITTED:
        return purchase_request
    if purchase_request.status != PurchaseRequest.Status.DRAFT:
        raise DjangoValidationError(
            {
                "detail": (
                    f"A purchase request with status '{purchase_request.status}' cannot be submitted. "
                    "A rejected request must be revised back to draft first."
                )
            }
        )

    lines = list(
        purchase_request.lines.select_related("material__category", "unit").order_by("line_number", "id")
    )
    if not lines:
        raise DjangoValidationError({"detail": "At least one line is required to submit a purchase request."})

    if purchase_request.required_by is not None and purchase_request.required_by < timezone.now().date():
        raise DjangoValidationError({"required_by": "Required-by date cannot be in the past."})

    for line in lines:
        material = line.material
        unit = line.unit
        if not material.is_active:
            raise DjangoValidationError(
                {"detail": f"Material '{material.code}' is inactive and cannot be submitted."}
            )
        if not unit.is_active:
            raise DjangoValidationError({"detail": f"Unit '{unit.code}' is inactive and cannot be submitted."})
        if material.category_id and not material.category.is_active:
            raise DjangoValidationError(
                {"detail": f"Category for material '{material.code}' is inactive and cannot be submitted."}
            )

    before = {"status": purchase_request.status}

    for line in lines:
        line.material_code_snapshot = line.material.code
        line.material_name_snapshot = line.material.name
        line.unit_code_snapshot = line.unit.code
        line.unit_name_snapshot = line.unit.name
    PurchaseRequestLine.objects.bulk_update(
        lines,
        ["material_code_snapshot", "material_name_snapshot", "unit_code_snapshot", "unit_name_snapshot"],
    )

    submitted_at = timezone.now()
    round_number = purchase_request.current_round + 1
    approval_round = PurchaseRequestApprovalRound.objects.create(
        purchase_request=purchase_request,
        round_number=round_number,
        required_by_snapshot=purchase_request.required_by,
        notes_snapshot=purchase_request.notes,
        submitted_by=actor,
        submitted_at=submitted_at,
    )
    PurchaseRequestApprovalRoundLine.objects.bulk_create(
        [
            PurchaseRequestApprovalRoundLine(
                round=approval_round,
                line_number=line.line_number,
                material=line.material,
                unit=line.unit,
                quantity=line.quantity,
                notes=line.notes,
                material_code_snapshot=line.material_code_snapshot,
                material_name_snapshot=line.material_name_snapshot,
                unit_code_snapshot=line.unit_code_snapshot,
                unit_name_snapshot=line.unit_name_snapshot,
            )
            for line in lines
        ]
    )

    purchase_request.status = PurchaseRequest.Status.SUBMITTED
    purchase_request.submitted_by = actor
    purchase_request.submitted_at = submitted_at
    purchase_request.current_round = round_number
    purchase_request.current_step = 1
    purchase_request.version += 1
    purchase_request.save(
        update_fields=[
            "status",
            "submitted_by",
            "submitted_at",
            "current_round",
            "current_step",
            "version",
            "updated_at",
        ]
    )

    record(
        actor=actor,
        action="purchase_request.submitted",
        target_type="purchase_request",
        target_id=purchase_request.id,
        company=purchase_request.company,
        before=before,
        after={
            "status": purchase_request.status,
            "submitted_by_id": actor.id,
            "round": round_number,
            "step": 1,
        },
    )
    return purchase_request


@transaction.atomic
def cancel_purchase_request(*, actor, purchase_request_id, expected_version, reason):
    """`DRAFT`/`SUBMITTED` -> `CANCELLED`. Requires a non-blank reason
    every time, including on an idempotent retry (see below) - the reason
    is part of what the caller is asserting, not an afterthought. Never
    cancels an `APPROVED` or `REJECTED` request (`400`) - a rejected
    request is revised, not cancelled; nothing in this slice cancels an
    approved one.

    Task 08B-2 authorization fix: which permission the caller must hold
    depends on whether this is actually a `DRAFT` cancellation (needs
    `purchase_requests.cancel`, unchanged from Task 08B-1) or a
    `SUBMITTED`/pending-approval one (needs the new
    `purchase_requests.cancel_pending` - `purchase_requests.cancel` alone
    is no longer sufficient for this, closing the gap described in
    docs/purchase-workflow-proposal.md). That decision is made *here*,
    after `purchase_request` is locked and its real status is known - not
    by the view before the lock - because the status the view saw could
    already be stale by the time this transaction starts (e.g. a
    concurrent submit just moved this same request from `DRAFT` to
    `SUBMITTED`); deciding which permission applies from a pre-lock read
    would silently reopen exactly the gap this fix closes. See
    apps.common.errors.Forbidden. The view still does its own best-effort
    pre-check (requiring at least one of the two permissions) purely as a
    cheap fail-fast for an obviously unauthorized caller - the check here
    is the only authoritative one.

    A pending cancellation additionally closes the current approval round
    (`PurchaseRequestApprovalRound.outcome = CANCELLED`) and records a
    `CANCELLED` PurchaseRequestApproval row against whichever step was
    pending, exactly like a rejection closes it - see
    reject_purchase_request. Available at every step, not just the first.

    Retry semantics: a call at the *current* version against an
    already-`CANCELLED` request, with the *same* reason it was already
    cancelled with, is an idempotent no-op (no further mutation, no new
    audit entry). The same call with a *different* reason is rejected
    (`409`, not silently applied and not silently ignored) - the request
    has already reached a terminal state for a reason the caller's local
    copy does not match, so the caller must refetch and look at what
    actually happened rather than have their new reason overwrite
    history. No reopening exists in this slice - cancellation is terminal.
    """
    reason = (reason or "").strip()
    if not reason:
        raise DjangoValidationError({"cancellation_reason": "A cancellation reason is required."})

    purchase_request = PurchaseRequest.objects.select_for_update().get(pk=purchase_request_id)
    if purchase_request.version != expected_version:
        raise Conflict("This purchase request has changed since it was last read. Refetch and retry.")

    if purchase_request.status == PurchaseRequest.Status.CANCELLED:
        if purchase_request.cancellation_reason == reason:
            return purchase_request
        raise Conflict(
            "This purchase request was already cancelled with a different reason. Refetch and review it."
        )

    if purchase_request.status not in (PurchaseRequest.Status.DRAFT, PurchaseRequest.Status.SUBMITTED):
        raise DjangoValidationError(
            {"detail": f"A purchase request with status '{purchase_request.status}' cannot be cancelled."}
        )

    is_pending = purchase_request.status == PurchaseRequest.Status.SUBMITTED
    required_permission = _CANCEL_PENDING_PERMISSION if is_pending else _CANCEL_DRAFT_PERMISSION
    if not user_has_permission(actor, purchase_request.company, required_permission):
        raise Forbidden(f"The '{required_permission}' permission is required to cancel this purchase request.")

    before = {"status": purchase_request.status}

    update_fields = ["status", "cancelled_by", "cancelled_at", "cancellation_reason", "version", "updated_at"]
    if is_pending:
        approval_round = PurchaseRequestApprovalRound.objects.select_for_update().get(
            purchase_request=purchase_request, round_number=purchase_request.current_round
        )
        PurchaseRequestApproval.objects.create(
            round=approval_round,
            step=purchase_request.current_step,
            decision=PurchaseRequestApproval.Decision.CANCELLED,
            actor=actor,
            reason=reason,
        )
        approval_round.outcome = PurchaseRequestApprovalRound.Outcome.CANCELLED
        approval_round.closed_at = timezone.now()
        approval_round.save(update_fields=["outcome", "closed_at"])
        purchase_request.current_step = None
        update_fields.append("current_step")

    purchase_request.status = PurchaseRequest.Status.CANCELLED
    purchase_request.cancelled_by = actor
    purchase_request.cancelled_at = timezone.now()
    purchase_request.cancellation_reason = reason
    purchase_request.version += 1
    purchase_request.save(update_fields=update_fields)

    record(
        actor=actor,
        action="purchase_request.cancelled",
        target_type="purchase_request",
        target_id=purchase_request.id,
        company=purchase_request.company,
        before=before,
        after={
            "status": purchase_request.status,
            "cancellation_reason": purchase_request.cancellation_reason,
            "was_pending": is_pending,
        },
    )
    return purchase_request


def _lock_current_round(purchase_request):
    """Locks and returns the PurchaseRequestApprovalRound the header's
    `current_round` currently points at - used by approve/reject/pending-
    cancel, all of which must serialize against each other and against a
    concurrent decision on the same round, not just against changes to
    the PurchaseRequest header row itself.
    """
    return PurchaseRequestApprovalRound.objects.select_for_update().get(
        purchase_request=purchase_request, round_number=purchase_request.current_round
    )


def _reject_if_self_or_repeat_decider(*, purchase_request, approval_round, actor):
    """Shared eligibility gate for approve_purchase_request and
    reject_purchase_request:

    1. Self-decision is never allowed, with no exception - not for a
       superuser, not for whoever holds `purchase_requests.approve`, not
       for any other role. This applies to *deciding* the request at all
       (approving OR rejecting it), not only to approving it: letting a
       requester reject their own request would still mean the review of
       their request was not actually independent.
    2. PROVISIONAL, UNCONFIRMED POLICY: the same person may not decide
       more than one step within the same approval round - each step
       needs a *different* eligible approver. This is conservative and
       deliberately restrictive; the client has not confirmed whether one
       Admin approving multiple steps of the same round should be
       allowed, so this implementation does not silently allow it. See
       docs/purchase-workflow-proposal.md.

    Neither check has an automatic fallback: if this leaves a round with
    no further eligible decider, the request simply stays pending at that
    step until an administrator resolves it outside this system (e.g. by
    granting `purchase_requests.approve` to another eligible person) -
    nothing here invents a bypass.
    """
    if actor.id == purchase_request.created_by_id:
        raise DjangoValidationError(
            {
                "detail": (
                    "The requester cannot decide (approve or reject) their own purchase request. "
                    "No exception exists for this, including for superusers."
                )
            }
        )
    already_decided = approval_round.decisions.filter(
        actor=actor,
        decision__in=[PurchaseRequestApproval.Decision.APPROVED, PurchaseRequestApproval.Decision.REJECTED],
    ).exists()
    if already_decided:
        raise DjangoValidationError(
            {
                "detail": (
                    "Provisional policy (not yet confirmed by the client): the same approver cannot "
                    "decide more than one step within the same approval round. A different eligible "
                    "approver is required for this step."
                )
            }
        )


@transaction.atomic
def approve_purchase_request(*, actor, purchase_request_id, expected_version, expected_round, expected_step):
    """Advances the currently pending step by exactly one. Only the
    `APPROVAL_TOTAL_STEPS`-th step's approval moves the request to
    `APPROVED` and closes the round (`outcome=APPROVED`) - every earlier
    step's approval only advances `current_step` and leaves the request
    `SUBMITTED`.

    `expected_round`/`expected_step` must match `current_round`/
    `current_step` exactly, in addition to `expected_version` matching
    `version` - any mismatch is a `409 Conflict`, never silently
    resolved. Unlike submit/cancel, there is deliberately no idempotent-
    retry branch here: a repeated call could otherwise land on the
    *next* step's approval by accident once the first call has already
    advanced `current_step` - requiring an exact round/step match (not
    just version) is what prevents that.

    See _reject_if_self_or_repeat_decider for the self-decision ban and
    the provisional distinct-approver-per-step restriction, both enforced
    before anything is written. The caller's `purchase_requests.approve`
    permission itself is checked at the view layer, not here - unlike
    cancellation, this permission's requirement does not depend on the
    request's mutable state, so no post-lock recheck is needed (see
    apps.common.errors.Forbidden).
    """
    purchase_request = PurchaseRequest.objects.select_for_update().get(pk=purchase_request_id)
    if purchase_request.version != expected_version:
        raise Conflict("This purchase request has changed since it was last read. Refetch and retry.")
    if purchase_request.status != PurchaseRequest.Status.SUBMITTED:
        raise DjangoValidationError(
            {"detail": "Only a submitted purchase request awaiting approval can be approved."}
        )
    if purchase_request.current_round != expected_round or purchase_request.current_step != expected_step:
        raise Conflict(
            "This purchase request has moved to a different approval round/step since it was last read. "
            "Refetch and retry."
        )

    approval_round = _lock_current_round(purchase_request)
    _reject_if_self_or_repeat_decider(purchase_request=purchase_request, approval_round=approval_round, actor=actor)

    step = purchase_request.current_step
    PurchaseRequestApproval.objects.create(
        round=approval_round, step=step, decision=PurchaseRequestApproval.Decision.APPROVED, actor=actor, reason=""
    )

    before = {"status": purchase_request.status, "current_step": step}
    update_fields = ["version", "updated_at"]
    if step >= APPROVAL_TOTAL_STEPS:
        purchase_request.status = PurchaseRequest.Status.APPROVED
        purchase_request.current_step = None
        update_fields += ["status", "current_step"]
        approval_round.outcome = PurchaseRequestApprovalRound.Outcome.APPROVED
        approval_round.closed_at = timezone.now()
        approval_round.save(update_fields=["outcome", "closed_at"])
    else:
        purchase_request.current_step = step + 1
        update_fields.append("current_step")

    purchase_request.version += 1
    purchase_request.save(update_fields=update_fields)

    record(
        actor=actor,
        action="purchase_request.approved",
        target_type="purchase_request",
        target_id=purchase_request.id,
        company=purchase_request.company,
        before=before,
        after={"status": purchase_request.status, "round": approval_round.round_number, "decided_step": step},
    )
    return purchase_request


@transaction.atomic
def reject_purchase_request(*, actor, purchase_request_id, expected_version, expected_round, expected_step, reason):
    """Rejects the currently pending step, moving the request straight to
    `REJECTED` and closing the round (`outcome=REJECTED`) regardless of
    which step rejected it - there is no "reject just this step, continue
    the round" outcome. Requires a non-blank `reason`, always (no
    idempotent-retry exception the way cancel has one, since a repeated
    reject call cannot land on this request twice the way a repeated
    cancel-with-the-same-reason legitimately might - `expected_round`/
    `expected_step` will already have gone stale by the second call).

    See approve_purchase_request's docstring for the shared
    version/round/step-match, self-decision-ban and provisional distinct-
    approver rules - all identical here.
    """
    reason = (reason or "").strip()
    if not reason:
        raise DjangoValidationError({"rejection_reason": "A rejection reason is required."})

    purchase_request = PurchaseRequest.objects.select_for_update().get(pk=purchase_request_id)
    if purchase_request.version != expected_version:
        raise Conflict("This purchase request has changed since it was last read. Refetch and retry.")
    if purchase_request.status != PurchaseRequest.Status.SUBMITTED:
        raise DjangoValidationError(
            {"detail": "Only a submitted purchase request awaiting approval can be rejected."}
        )
    if purchase_request.current_round != expected_round or purchase_request.current_step != expected_step:
        raise Conflict(
            "This purchase request has moved to a different approval round/step since it was last read. "
            "Refetch and retry."
        )

    approval_round = _lock_current_round(purchase_request)
    _reject_if_self_or_repeat_decider(purchase_request=purchase_request, approval_round=approval_round, actor=actor)

    step = purchase_request.current_step
    PurchaseRequestApproval.objects.create(
        round=approval_round, step=step, decision=PurchaseRequestApproval.Decision.REJECTED, actor=actor,
        reason=reason,
    )

    before = {"status": purchase_request.status, "current_step": step}
    purchase_request.status = PurchaseRequest.Status.REJECTED
    purchase_request.current_step = None
    purchase_request.version += 1
    purchase_request.save(update_fields=["status", "current_step", "version", "updated_at"])

    approval_round.outcome = PurchaseRequestApprovalRound.Outcome.REJECTED
    approval_round.closed_at = timezone.now()
    approval_round.save(update_fields=["outcome", "closed_at"])

    record(
        actor=actor,
        action="purchase_request.rejected",
        target_type="purchase_request",
        target_id=purchase_request.id,
        company=purchase_request.company,
        before=before,
        after={
            "status": purchase_request.status,
            "round": approval_round.round_number,
            "decided_step": step,
            "reason": reason,
        },
    )
    return purchase_request


@transaction.atomic
def revise_purchase_request(*, actor, purchase_request_id, expected_version):
    """`REJECTED` -> `DRAFT` only - the sole way back to an editable draft
    after a rejection. Does not itself touch lines/notes/required_by
    (use the existing PATCH endpoint afterwards, same as any other
    draft edit) and does not touch `created_by` - "preserve original
    created_by through all revisions" (Task 08B-2) falls out naturally
    from simply never writing that field here. `current_round`/
    `current_step` are also left untouched: the next submit_purchase_
    request call increments `current_round` and resets `current_step` to
    1 regardless of their current value, so nothing here needs to reset
    them early.

    Retry semantics are deliberately narrower than "status is already
    DRAFT": `DRAFT` is not an exclusive product of this action the way
    `SUBMITTED`/`CANCELLED` are exclusive products of submit/cancel - a
    brand new request is also `DRAFT`, from creation, having never been
    submitted at all. Treating *every* already-`DRAFT` request as an
    idempotent no-op would silently accept "revise" called on something
    that was never rejected - or even never submitted - as if it were a
    harmless retry. So the idempotent branch requires positive evidence
    that this `DRAFT` was actually reached via a real `REJECTED` ->
    `DRAFT` transition: `current_round` is 0 only for a request that has
    never been submitted (nothing else ever sets it back to 0), and the
    only status this service or submit_purchase_request ever leaves a
    request in besides `DRAFT` is one of `SUBMITTED`/`APPROVED`/
    `REJECTED`/`CANCELLED` - so `current_round > 0` while `status=DRAFT`
    can only mean "this was `REJECTED`, then revised." A call at the
    *current* version against a `DRAFT` request that satisfies that is an
    idempotent no-op (no further mutation, no new audit entry) - mirrors
    submit/cancel's retry convention for their own respective target
    states. A `DRAFT` that fails it (`current_round == 0`, i.e. never
    submitted) is rejected (`400`) - there is nothing to revise. Any
    non-`DRAFT`, non-`REJECTED` status (`SUBMITTED`/`APPROVED`/
    `CANCELLED`) is also rejected (`400`): only a `REJECTED` request can
    be revised.
    """
    purchase_request = PurchaseRequest.objects.select_for_update().get(pk=purchase_request_id)
    if purchase_request.version != expected_version:
        raise Conflict("This purchase request has changed since it was last read. Refetch and retry.")

    if purchase_request.status == PurchaseRequest.Status.DRAFT:
        if purchase_request.current_round > 0:
            return purchase_request
        raise DjangoValidationError(
            {"detail": "This purchase request has never been submitted, so there is nothing to revise."}
        )
    if purchase_request.status != PurchaseRequest.Status.REJECTED:
        raise DjangoValidationError({"detail": "Only a rejected purchase request can be revised back to draft."})

    before = {"status": purchase_request.status}
    purchase_request.status = PurchaseRequest.Status.DRAFT
    purchase_request.version += 1
    purchase_request.save(update_fields=["status", "version", "updated_at"])

    record(
        actor=actor,
        action="purchase_request.revised",
        target_type="purchase_request",
        target_id=purchase_request.id,
        company=purchase_request.company,
        before=before,
        after={"status": purchase_request.status},
    )
    return purchase_request


# ---------------------------------------------------------------------------
# Task 08C-1: Purchase Order drafts
#
# PROPOSED POLICY, NOT YET CLIENT-CONFIRMED - see docs/purchase-order-
# proposal.md: a PurchaseOrder's company is fixed to its source
# PurchaseRequest's own company; cross-company purchasing is not
# supported in this slice; a shared physical delivery location does not
# by itself establish legal stock ownership. This requires client review
# before production use.
# ---------------------------------------------------------------------------

_PO_REFERENCE_MAX_ATTEMPTS = 5
_LINE_AMOUNT_QUANTIZE = Decimal("0.01")


def _generate_po_reference():
    """Mirrors _generate_reference() above exactly, for PurchaseOrder -
    same collision-safety/legibility reasoning, `PO-` prefix instead of
    `PR-` so the two document types are never visually confused.
    """
    date_part = timezone.now().strftime("%Y%m%d")
    suffix = secrets.token_hex(5).upper()
    return f"PO-{date_part}-{suffix}"


def _compute_line_amount(quantity, unit_price):
    """Documented currency-rounding convention for this task: quantity
    (3 decimal places) times unit_price (4 decimal places) is quantized
    to 2 decimal places using ROUND_HALF_UP - the conventional "round
    0.5 up" rule most business users expect, deliberately not Python's
    default banker's rounding. This is a pre-tax line subtotal only - no
    GST/discount/freight/invoice-total concept exists anywhere in this
    task.
    """
    return (quantity * unit_price).quantize(_LINE_AMOUNT_QUANTIZE, rounding=ROUND_HALF_UP)


def _normalize_currency_code(currency_code):
    code = (currency_code or "").strip().upper()
    if not code:
        raise DjangoValidationError({"currency_code": "Currency code is required."})
    if len(code) != 3 or not code.isalpha():
        raise DjangoValidationError({"currency_code": "Currency code must be exactly three letters (e.g. INR, USD)."})
    return code


def _po_header_snapshot(purchase_order):
    return {
        "supplier_id": purchase_order.supplier_id,
        "expected_delivery_date": (
            purchase_order.expected_delivery_date.isoformat() if purchase_order.expected_delivery_date else None
        ),
        "notes": purchase_order.notes,
    }


def _po_line_snapshot_list(lines):
    return [
        {"id": line.id, "unit_price": str(line.unit_price), "line_amount": str(line.line_amount)}
        for line in sorted(lines, key=lambda line: (line.line_number, line.id))
    ]


def _create_po_header_with_unique_reference(
    *, company, actor, source_purchase_request, supplier, currency_code, expected_delivery_date, notes
):
    """Retries on the extremely unlikely event of a reference collision -
    mirrors _create_header_with_unique_reference() above exactly. The
    one-active-PO-per-purchase-request race is already prevented before
    this is ever called (the caller holds source_purchase_request locked
    via select_for_update() for the whole surrounding transaction), so
    any IntegrityError reaching this loop is assumed to be a reference
    collision, exactly like the PurchaseRequest case.
    """
    for _ in range(_PO_REFERENCE_MAX_ATTEMPTS):
        try:
            with transaction.atomic():
                purchase_order = PurchaseOrder(
                    company=company,
                    reference=_generate_po_reference(),
                    source_purchase_request=source_purchase_request,
                    supplier=supplier,
                    currency_code=currency_code,
                    expected_delivery_date=expected_delivery_date,
                    notes=notes,
                    created_by=actor,
                )
                purchase_order.save()
                return purchase_order
        except IntegrityError:
            continue
    raise RuntimeError("Could not generate a unique purchase order reference after several attempts.")

def _create_direct_pr_for_po(*, actor, company, direct_lines):
    """Creates an APPROVED PurchaseRequest + a companion APPROVED
    ApprovalRound + ApprovalRoundLines purely to satisfy
    PurchaseOrderLine.source_round_line FK constraints when a PO is
    created directly (without going through the full PR lifecycle).

    The resulting PurchaseRequest is internal; it will never surface
    through the purchase-requests API endpoints (it has no real
    submitter/approver identity beyond `actor`, which serves as
    all three roles). No schema migration is required: this reuses all
    existing tables and constraints.
    """
    from apps.purchasing.models import PurchaseRequestLine  # local to avoid circular

    # 1. Build & resolve lines
    resolved = []
    for i, item in enumerate(direct_lines, start=1):
        material = get_object_or_404(Material, pk=item["material_id"])
        if item.get("unit_id"):
            unit = get_object_or_404(UnitOfMeasure, pk=item["unit_id"])
        else:
            unit = material.base_unit
        if unit is None:
            raise DjangoValidationError(
                {"lines": f"Line {i}: material '{material.code}' has no base unit; supply unit_id explicitly."}
            )
        resolved.append((i, material, unit, item["quantity"], item.get("unit_price", Decimal("0"))))

    # 2. Create a synthetic APPROVED PurchaseRequest (skip the normal lifecycle)
    pr = PurchaseRequest(
        company=company,
        reference=f"PR-{timezone.now().strftime('%Y%m%d')}-{secrets.token_hex(5).upper()}",
        status=PurchaseRequest.Status.APPROVED,
        created_by=actor,
        submitted_by=actor,
        submitted_at=timezone.now(),
        current_round=1,
        current_step=None,
    )
    pr.save()

    # 3. Create PurchaseRequestLines (required by the model)
    PurchaseRequestLine.objects.bulk_create([
        PurchaseRequestLine(
            purchase_request=pr,
            line_number=i,
            material=mat,
            unit=unit,
            quantity=qty,
            material_code_snapshot=mat.code,
            material_name_snapshot=mat.name,
            unit_code_snapshot=unit.code,
            unit_name_snapshot=unit.name,
        )
        for i, mat, unit, qty, _price in resolved
    ])

    # 4. Create an APPROVED ApprovalRound
    now = timezone.now()
    approval_round = PurchaseRequestApprovalRound(
        purchase_request=pr,
        round_number=1,
        submitted_by=actor,
        submitted_at=now,
        outcome=PurchaseRequestApprovalRound.Outcome.APPROVED,
        closed_at=now,
    )
    approval_round.save()

    # 5. Create ApprovalRoundLines (these become PurchaseOrderLine.source_round_line)
    PurchaseRequestApprovalRoundLine.objects.bulk_create([
        PurchaseRequestApprovalRoundLine(
            round=approval_round,
            line_number=i,
            material=mat,
            unit=unit,
            quantity=qty,
            material_code_snapshot=mat.code,
            material_name_snapshot=mat.name,
            unit_code_snapshot=unit.code,
            unit_name_snapshot=unit.name,
        )
        for i, mat, unit, qty, _price in resolved
    ])

    # Attach the round so create_purchase_order can find it
    pr._direct_approval_round = approval_round
    # Also store unit_prices per line_number for PO line initialisation
    pr._direct_line_prices = {i: price for i, _m, _u, _q, price in resolved}
    return pr


@transaction.atomic
def create_purchase_order(
    *, actor, company, source_purchase_request_id=None, supplier_id, currency_code,
    expected_delivery_date=None, notes="", direct_lines=None
):
    """Creates a `DRAFT` PurchaseOrder from one already-`APPROVED`
    PurchaseRequest belonging to `company`, copying every line from that
    request's approved round verbatim (material/unit/quantity - see
    PurchaseRequestApprovalRoundLine) - never from the live, possibly-
    since-edited PurchaseRequestLine rows, and never a caller-supplied
    line list. `unit_price` starts at `0` on every copied line (the
    source PurchaseRequest never carried a price - there is nothing to
    copy) and is edited afterwards via update_purchase_order.

    `source_purchase_request` is looked up scoped to `company` (fold
    "does not exist" and "belongs to a different company" into the same
    404 - see apps.purchasing.views._get_company_for_action for the same
    convention used everywhere else in this codebase) and locked
    (`select_for_update()`) for the remainder of this transaction - this
    is what makes the one-active-PO-per-purchase-request rule race-safe:
    two concurrent create calls against the same request can never both
    pass the "no active PO yet" check, because the second blocks on this
    lock until the first's transaction commits or rolls back. The
    `UniqueConstraint` on PurchaseOrder is the database-level backstop
    behind that locking, not a substitute for it.

    Revalidates every copied line's material/unit/category are still
    active *now* (they were already checked once, at the original
    PurchaseRequest submit time - see submit_purchase_request - but more
    time may have passed since then) and that `supplier` is active -
    `is_active` here means only "in use", never "QC-qualified" (no such
    concept exists anywhere in this codebase; see apps.suppliers.models.
    Supplier).
    """
    currency_code = _normalize_currency_code(currency_code)

    if source_purchase_request_id is None:
        # Direct creation: auto-generate a companion APPROVED PurchaseRequest
        # + ApprovalRound + lines to satisfy the FK/UniqueConstraint without
        # any schema migration. This path is intentionally invisible to the
        # existing 96 tests (they all pass source_purchase_request_id).
        if not direct_lines:
            raise DjangoValidationError({"lines": "At least one order line is required for direct PO creation."})
        purchase_request = _create_direct_pr_for_po(
            actor=actor, company=company, direct_lines=direct_lines
        )
    else:
        purchase_request = get_object_or_404(
            PurchaseRequest.objects.select_for_update(), pk=source_purchase_request_id, company=company
        )
        if purchase_request.status != PurchaseRequest.Status.APPROVED:
            raise DjangoValidationError(
                {"detail": "Only an APPROVED purchase request can generate a Purchase Order."}
            )

        has_active_po = PurchaseOrder.objects.filter(source_purchase_request=purchase_request).exclude(
            status=PurchaseOrder.Status.CANCELLED
        ).exists()
        if has_active_po:
            raise DjangoValidationError(
                {
                    "detail": (
                        "This purchase request already has an active Purchase Order. Cancel it first to "
                        "create a replacement."
                    )
                }
            )

    supplier = get_object_or_404(Supplier, pk=supplier_id)
    if not supplier.is_active:
        raise DjangoValidationError(
            {"supplier_id": f"Supplier '{supplier.code}' is inactive and cannot be used on a Purchase Order."}
        )

    # Resolve the approved round from the PR (real or synthetic)
    if hasattr(purchase_request, '_direct_approval_round'):
        approval_round = purchase_request._direct_approval_round
    else:
        approval_round = (
            purchase_request.approval_rounds.filter(outcome=PurchaseRequestApprovalRound.Outcome.APPROVED)
            .order_by("-round_number")
            .first()
        )
    if approval_round is None:
        # Defensive only - the PurchaseRequest state machine (see
        # approve_purchase_request) guarantees an APPROVED request always
        # has exactly one APPROVED round, so this should be unreachable.
        raise DjangoValidationError({"detail": "No approved round was found for this purchase request."})

    # Fetch round lines; for direct creation they're just-inserted
    round_lines = list(
        approval_round.lines.select_related("material__category", "unit").order_by("line_number", "id")
    )
    if not round_lines:
        raise DjangoValidationError({"detail": "The approved purchase request has no lines to copy."})

    for line in round_lines:
        material = line.material
        unit = line.unit
        if not material.is_active:
            raise DjangoValidationError(
                {"detail": f"Material '{material.code}' is inactive and cannot be used on a Purchase Order."}
            )
        if not unit.is_active:
            raise DjangoValidationError(
                {"detail": f"Unit '{unit.code}' is inactive and cannot be used on a Purchase Order."}
            )
        if material.category_id and not material.category.is_active:
            raise DjangoValidationError(
                {
                    "detail": (
                        f"Category for material '{material.code}' is inactive and cannot be used on a "
                        "Purchase Order."
                    )
                }
            )

    purchase_order = _create_po_header_with_unique_reference(
        company=company,
        actor=actor,
        source_purchase_request=purchase_request,
        supplier=supplier,
        currency_code=currency_code,
        expected_delivery_date=expected_delivery_date,
        notes=notes or "",
    )

    # For direct POs, seed unit_price from the caller-supplied values
    direct_prices = getattr(purchase_request, '_direct_line_prices', {})
    PurchaseOrderLine.objects.bulk_create(
        [
            PurchaseOrderLine(
                purchase_order=purchase_order,
                line_number=line.line_number,
                source_round_line=line,
                material=line.material,
                unit=line.unit,
                quantity=line.quantity,
                unit_price=direct_prices.get(line.line_number, Decimal("0")),
                line_amount=_compute_line_amount(
                    line.quantity, direct_prices.get(line.line_number, Decimal("0"))
                ),
                material_code_snapshot=line.material_code_snapshot,
                material_name_snapshot=line.material_name_snapshot,
                unit_code_snapshot=line.unit_code_snapshot,
                unit_name_snapshot=line.unit_name_snapshot,
            )
            for line in round_lines
        ]
    )

    record(
        actor=actor,
        action="purchase_order.created",
        target_type="purchase_order",
        target_id=purchase_order.id,
        company=company,
        after={
            "reference": purchase_order.reference,
            "status": purchase_order.status,
            "source_purchase_request_id": purchase_request.id,
            "supplier_id": supplier.id,
            "currency_code": currency_code,
            "line_count": len(round_lines),
        },
    )
    return purchase_order


@transaction.atomic
def update_purchase_order(*, actor, purchase_order_id, expected_version, data):
    """`data` may contain `supplier_id`/`expected_delivery_date`/`notes`/
    `lines`, each independently optional (omitted = unchanged). `lines`,
    if present, is a list of `{"id": <line id>, "unit_price": <decimal>}`
    - every id must already belong to this purchase order (unknown id or
    a duplicate id is `400`); no line may be added or removed, and
    `quantity`/`material`/`unit` are never accepted here at all (see
    apps.purchasing.serializers). `line_amount` is recomputed
    server-side for every changed line (see _compute_line_amount) -
    never accepted from the caller.

    DRAFT only (`400` otherwise). Requires the row lock
    (`select_for_update`) and the caller's `expected_version` to match
    before anything is read for comparison - same Conflict-on-mismatch
    rule as every other mutation in this app. A PATCH that would not
    actually change anything (every supplied value already matches) is a
    no-op: no version increment, no audit entry.
    """
    purchase_order = PurchaseOrder.objects.select_for_update().get(pk=purchase_order_id)
    if purchase_order.version != expected_version:
        raise Conflict("This purchase order has changed since it was last read. Refetch and retry.")
    if purchase_order.status != PurchaseOrder.Status.DRAFT:
        raise DjangoValidationError({"detail": "Only a draft purchase order can be edited."})

    before_header = _po_header_snapshot(purchase_order)
    header_changed = False

    if "supplier_id" in data and data["supplier_id"] != purchase_order.supplier_id:
        supplier = get_object_or_404(Supplier, pk=data["supplier_id"])
        if not supplier.is_active:
            raise DjangoValidationError(
                {"supplier_id": f"Supplier '{supplier.code}' is inactive and cannot be used on a Purchase Order."}
            )
        purchase_order.supplier = supplier
        header_changed = True
    if "expected_delivery_date" in data and data["expected_delivery_date"] != purchase_order.expected_delivery_date:
        purchase_order.expected_delivery_date = data["expected_delivery_date"]
        header_changed = True
    if "notes" in data and data["notes"] != purchase_order.notes:
        purchase_order.notes = data["notes"]
        header_changed = True

    lines_changed = False
    before_lines = None
    after_lines = None
    if "lines" in data:
        existing_lines = {line.id: line for line in purchase_order.lines.all()}
        before_lines = _po_line_snapshot_list(existing_lines.values())

        seen_ids = set()
        to_update = []
        for item in data["lines"]:
            line_id = item["id"]
            if line_id in seen_ids:
                raise DjangoValidationError({"lines": f"Line {line_id} appears more than once in this request."})
            seen_ids.add(line_id)
            line = existing_lines.get(line_id)
            if line is None:
                raise DjangoValidationError({"lines": f"Line {line_id} does not belong to this purchase order."})
            new_price = item["unit_price"]
            if new_price != line.unit_price:
                line.unit_price = new_price
                line.line_amount = _compute_line_amount(line.quantity, new_price)
                to_update.append(line)

        if to_update:
            lines_changed = True
            PurchaseOrderLine.objects.bulk_update(to_update, ["unit_price", "line_amount"])
        after_lines = _po_line_snapshot_list(existing_lines.values())

    if not header_changed and not lines_changed:
        return purchase_order

    purchase_order.version += 1
    purchase_order.save(update_fields=["supplier", "expected_delivery_date", "notes", "version", "updated_at"])

    audit_before = dict(before_header)
    audit_after = _po_header_snapshot(purchase_order)
    if lines_changed:
        audit_before["lines"] = before_lines
        audit_after["lines"] = after_lines

    record(
        actor=actor,
        action="purchase_order.updated",
        target_type="purchase_order",
        target_id=purchase_order.id,
        company=purchase_order.company,
        before=audit_before,
        after=audit_after,
    )
    return purchase_order


@transaction.atomic
def cancel_purchase_order(*, actor, purchase_order_id, expected_version, reason):
    """`DRAFT` -> `CANCELLED` only. Requires a non-blank reason every
    time, including on an idempotent retry (see below) - mirrors
    cancel_purchase_request's rule exactly.

    Task 08C-2 added `ISSUED` as a third status, so - unlike before that
    task - "not already `CANCELLED`" no longer implies `DRAFT`; an
    explicit status check is required here now. No reopen, amendment, or
    cancellation of an `ISSUED` purchase order exists anywhere in this
    codebase (see issue_purchase_order and PurchaseOrder's own
    docstring) - this is a deliberate terminal state, not an oversight.

    Cancelling a purchase order never touches its source PurchaseRequest,
    never touches stock, and - per Task 08C-1's explicit scope - a
    cancelled `DRAFT` PO is exactly what frees its source PurchaseRequest
    to receive a replacement PO (see the partial `UniqueConstraint` on
    PurchaseOrder.source_purchase_request, which already covers `ISSUED`
    as "active" too, so an `ISSUED` order's source request permanently
    cannot receive a replacement in this task).
    """
    reason = (reason or "").strip()
    if not reason:
        raise DjangoValidationError({"cancellation_reason": "A cancellation reason is required."})

    purchase_order = PurchaseOrder.objects.select_for_update().get(pk=purchase_order_id)
    if purchase_order.version != expected_version:
        raise Conflict("This purchase order has changed since it was last read. Refetch and retry.")

    if purchase_order.status == PurchaseOrder.Status.CANCELLED:
        if purchase_order.cancellation_reason == reason:
            return purchase_order
        raise Conflict(
            "This purchase order was already cancelled with a different reason. Refetch and review it."
        )
    if purchase_order.status != PurchaseOrder.Status.DRAFT:
        raise DjangoValidationError(
            {"detail": f"A purchase order with status '{purchase_order.status}' cannot be cancelled."}
        )

    before = {"status": purchase_order.status}
    purchase_order.status = PurchaseOrder.Status.CANCELLED
    purchase_order.cancelled_by = actor
    purchase_order.cancelled_at = timezone.now()
    purchase_order.cancellation_reason = reason
    purchase_order.version += 1
    purchase_order.save(
        update_fields=["status", "cancelled_by", "cancelled_at", "cancellation_reason", "version", "updated_at"]
    )

    record(
        actor=actor,
        action="purchase_order.cancelled",
        target_type="purchase_order",
        target_id=purchase_order.id,
        company=purchase_order.company,
        before=before,
        after={"status": purchase_order.status, "cancellation_reason": purchase_order.cancellation_reason},
    )
    return purchase_order


# ---------------------------------------------------------------------------
# Task 08C-2: Purchase Order issue
#
# PROPOSED POLICY, NOT YET CLIENT-CONFIRMED: a user explicitly holding
# company-scoped `purchase_orders.issue` may finalize (issue) a DRAFT
# purchase order. This is deliberately NOT a new multi-step commercial
# approval workflow the way PurchaseRequest has one (Task 08B-2's three-
# step round) - one permission, one decision, no self-decision ban, no
# distinct-approver rule. See docs/purchase-order-proposal.md.
#
# Issuing is internal finalization only - it is not proof of supplier
# delivery, email transmission, supplier acceptance, or material
# receipt. None of those concepts exist anywhere in this codebase.
# ---------------------------------------------------------------------------

# Deliberately small and explicit - NOT a real ISO 4217 list, and not a
# claim that these are the only real-world currencies with a 2-decimal
# minor unit. This project's rounding convention (_compute_line_amount,
# always exactly 2 decimal places via ROUND_HALF_UP) is only verified
# correct for a currency whose own minor unit genuinely has 2 decimal
# places - a 0-decimal currency (e.g. JPY) or a 3-decimal currency (e.g.
# KWD) would silently get a wrong amount from that same fixed-2dp
# rounding. `_normalize_currency_code` (Task 08C-1) only ever checks
# *shape* (three letters) at DRAFT creation/edit time, and that is
# unchanged here - this allowlist is checked only at issue, so an
# unsupported-but-shape-valid currency can still be drafted (matching
# "do not change existing draft-price/currency behaviour"), just not
# issued, until this list is deliberately extended and its rounding
# verified for the new currency.
_SUPPORTED_ISSUE_CURRENCIES = frozenset({"INR", "USD", "EUR", "GBP"})

# Supplier fields snapshotted verbatim at issue time - see
# PurchaseOrderIssueSnapshot's docstring. Listed once here so the
# read/write sides (this function and the model) cannot silently drift
# apart from each other.
_SUPPLIER_SNAPSHOT_FIELDS = (
    "code",
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
)


@transaction.atomic
def issue_purchase_order(*, actor, purchase_order_id, expected_version):
    """`DRAFT` -> `ISSUED` only. `CANCELLED` can never be issued (`400`).
    A repeat call against an already-`ISSUED` order at the *current*
    version is an idempotent no-op - unchanged resource returned, no
    further mutation, no new audit entry, no snapshot re-created and no
    `issued_at`/`issued_by` replacement - mirroring submit_purchase_
    request's own retry convention. A stale `expected_version` is always
    `409`, exactly like every other mutation in this app.

    Revalidates, inside this same locked transaction, everything that
    could have drifted since the order was drafted:

    - The source PurchaseRequest still belongs to this order's own
      `company` and is still `APPROVED` (it is a terminal status once
      reached - see approve_purchase_request - so in practice this can
      only ever fail if something is deeply wrong, but the check runs
      anyway rather than assuming the invariant).
    - Every PurchaseOrderLine still matches its source approved-round
      line's material/unit/quantity exactly (both are immutable after
      creation already - see PurchaseOrderLine/PurchaseRequestApproval
      RoundLine - so this is defense-in-depth, not an expected failure
      path).
    - At least one line exists.
    - Every line's material/unit/category is still active *now* (more
      time may have passed since the order was created) and the
      supplier is still active - `is_active` means only "in use", never
      "QC-qualified"; no supplier-qualification concept exists anywhere
      in this codebase, and this function does not invent one.
    - `expected_delivery_date` is present (it is optional on a `DRAFT`)
      and is not in the past.
    - `currency_code` is one of `_SUPPORTED_ISSUE_CURRENCIES` - see that
      constant's docstring for why this allowlist exists and is
      deliberately small.
    - Every line's `unit_price` is strictly greater than zero - a `DRAFT`
      may legitimately sit at the default `unit_price=0` indefinitely,
      but issuing at a zero price is rejected with a clear message.
      Free-of-charge purchasing is explicitly deferred, not supported by
      silently allowing a zero-priced issue.

    On success, creates the permanent PurchaseOrderIssueSnapshot(+lines)
    row (see that model's docstring), sets `status=ISSUED`, `issued_by`,
    `issued_at`, increments `version` once, and records one audit entry
    - snapshot, header mutation, and audit all commit or roll back
    together in this one transaction.
    """
    purchase_order = PurchaseOrder.objects.select_for_update().get(pk=purchase_order_id)
    if purchase_order.version != expected_version:
        raise Conflict("This purchase order has changed since it was last read. Refetch and retry.")

    if purchase_order.status == PurchaseOrder.Status.ISSUED:
        return purchase_order
    if purchase_order.status != PurchaseOrder.Status.DRAFT:
        raise DjangoValidationError(
            {"detail": f"A purchase order with status '{purchase_order.status}' cannot be issued."}
        )

    # PurchaseRequest.APPROVED is a terminal status (see
    # approve_purchase_request) - nothing else in this codebase can move
    # it away from APPROVED once reached, so no lock is needed here to
    # protect against a concurrent status change the way
    # create_purchase_order's lock protects the one-active-PO race.
    source_pr = PurchaseRequest.objects.get(pk=purchase_order.source_purchase_request_id)
    if source_pr.company_id != purchase_order.company_id:
        # Defensive only - PurchaseOrder.clean() already guarantees this
        # invariant at every save, so this should be unreachable.
        raise DjangoValidationError(
            {"detail": "This purchase order's company no longer matches its source purchase request's company."}
        )
    if source_pr.status != PurchaseRequest.Status.APPROVED:
        raise DjangoValidationError(
            {"detail": "The source purchase request is no longer APPROVED and this purchase order cannot be issued."}
        )

    approval_round = (
        source_pr.approval_rounds.filter(outcome=PurchaseRequestApprovalRound.Outcome.APPROVED)
        .order_by("-round_number")
        .first()
    )
    if approval_round is None:
        raise DjangoValidationError({"detail": "No approved round was found for the source purchase request."})
    round_lines_by_id = {line.id: line for line in approval_round.lines.all()}

    po_lines = list(
        purchase_order.lines.select_related("material__category", "unit", "source_round_line").order_by(
            "line_number", "id"
        )
    )
    if not po_lines:
        raise DjangoValidationError({"detail": "At least one line is required to issue a purchase order."})

    for line in po_lines:
        round_line = round_lines_by_id.get(line.source_round_line_id)
        if (
            round_line is None
            or round_line.material_id != line.material_id
            or round_line.unit_id != line.unit_id
            or round_line.quantity != line.quantity
        ):
            raise DjangoValidationError(
                {
                    "detail": (
                        f"Line {line.line_number} no longer matches the source purchase request's "
                        "approved round and cannot be issued."
                    )
                }
            )
        if line.unit_price <= 0:
            raise DjangoValidationError(
                {
                    "detail": (
                        f"Line {line.line_number}: a zero unit price cannot be issued. Free-of-charge "
                        "purchasing is deferred - set a real price before issuing."
                    )
                }
            )
        material = line.material
        unit = line.unit
        if not material.is_active:
            raise DjangoValidationError(
                {"detail": f"Material '{material.code}' is inactive and cannot be issued."}
            )
        if not unit.is_active:
            raise DjangoValidationError({"detail": f"Unit '{unit.code}' is inactive and cannot be issued."})
        if material.category_id and not material.category.is_active:
            raise DjangoValidationError(
                {"detail": f"Category for material '{material.code}' is inactive and cannot be issued."}
            )

    supplier = purchase_order.supplier
    if not supplier.is_active:
        raise DjangoValidationError(
            {"supplier_id": f"Supplier '{supplier.code}' is inactive and cannot be issued."}
        )

    if purchase_order.expected_delivery_date is None:
        raise DjangoValidationError(
            {"expected_delivery_date": "An expected delivery date is required to issue a purchase order."}
        )
    if purchase_order.expected_delivery_date < timezone.now().date():
        raise DjangoValidationError({"expected_delivery_date": "Expected delivery date cannot be in the past."})

    if purchase_order.currency_code not in _SUPPORTED_ISSUE_CURRENCIES:
        raise DjangoValidationError(
            {
                "currency_code": (
                    f"Currency '{purchase_order.currency_code}' is not yet supported for issuing. "
                    f"Supported currencies: {sorted(_SUPPORTED_ISSUE_CURRENCIES)}."
                )
            }
        )

    subtotal = sum((line.line_amount for line in po_lines), Decimal("0.00"))

    before = {"status": purchase_order.status}
    issued_at = timezone.now()
    company = purchase_order.company

    issue_snapshot = PurchaseOrderIssueSnapshot.objects.create(
        purchase_order=purchase_order,
        issued_by=actor,
        issued_at=issued_at,
        company_code_snapshot=company.code,
        company_legal_name_snapshot=company.legal_name,
        company_display_name_snapshot=company.display_name,
        **{f"supplier_{field}_snapshot": getattr(supplier, field) for field in _SUPPLIER_SNAPSHOT_FIELDS},
        currency_code_snapshot=purchase_order.currency_code,
        subtotal_snapshot=subtotal,
        expected_delivery_date_snapshot=purchase_order.expected_delivery_date,
        notes_snapshot=purchase_order.notes,
        source_purchase_request_reference_snapshot=source_pr.reference,
        approved_round_number_snapshot=approval_round.round_number,
    )
    PurchaseOrderIssueLineSnapshot.objects.bulk_create(
        [
            PurchaseOrderIssueLineSnapshot(
                issue_snapshot=issue_snapshot,
                purchase_order_line=line,
                line_number=line.line_number,
                material_code_snapshot=line.material_code_snapshot,
                material_name_snapshot=line.material_name_snapshot,
                unit_code_snapshot=line.unit_code_snapshot,
                unit_name_snapshot=line.unit_name_snapshot,
                quantity_snapshot=line.quantity,
                unit_price_snapshot=line.unit_price,
                line_amount_snapshot=line.line_amount,
            )
            for line in po_lines
        ]
    )

    purchase_order.status = PurchaseOrder.Status.ISSUED
    purchase_order.issued_by = actor
    purchase_order.issued_at = issued_at
    purchase_order.version += 1
    purchase_order.save(update_fields=["status", "issued_by", "issued_at", "version", "updated_at"])

    record(
        actor=actor,
        action="purchase_order.issued",
        target_type="purchase_order",
        target_id=purchase_order.id,
        company=company,
        before=before,
        after={"status": purchase_order.status, "issued_by_id": actor.id, "subtotal": str(subtotal)},
    )
    return purchase_order
