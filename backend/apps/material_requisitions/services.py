from decimal import Decimal
from fractions import Fraction

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.audit.services import record
from apps.batch_plans.models import BatchPlan
from apps.batch_plans.services import assess_source_drift
from apps.catalog.models import Material, UnitOfMeasure
from apps.common.errors import Conflict
from apps.formulas.approval import lock_and_load_approval_context
from apps.formulas.models import FormulaRevision
from apps.formulas.requirement_preview import _to_fraction, build_requirement_preview
from apps.material_requisitions.models import (
    MaterialRequisition,
    MaterialRequisitionLine,
    MaterialRequisitionRound,
    MaterialRequisitionRoundLine,
)

# Same "operational quantity" precision as SalesOrderLine.quantity/
# FormulaLine.quantity/BatchPlan.target_output_quantity (see
# MaterialRequisitionLine's own docstring for why this specific field
# reuses that convention rather than inventing a new one).
REQUESTED_QUANTITY_MAX_DECIMAL_PLACES = 3
REQUESTED_QUANTITY_MAX_INTEGER_DIGITS = 11
_SCALE = Decimal(10) ** REQUESTED_QUANTITY_MAX_DECIMAL_PLACES
_SCALE_INT = 10**REQUESTED_QUANTITY_MAX_DECIMAL_PLACES

ALLOWED_HEADER_UPDATE_FIELDS = {"notes"}
ALLOWED_LINE_UPDATE_FIELDS = {"id", "requested_quantity", "quantity_remark"}


def _fit_requested_quantity(required_fraction, unit):
    """Decide whether `required_fraction` (the EXACT calculated
    requirement for one line, as a `fractions.Fraction` - computed with
    the SAME formula `apps.formulas.requirement_preview.
    build_requirement_preview` already used: `required = line_quantity *
    target / base_output_quantity`, never a second scaling approach) can
    populate `requested_quantity` without any rounding.

    Returns `(Decimal value, "")` when it fits cleanly at
    `REQUESTED_QUANTITY_MAX_DECIMAL_PLACES` decimal places and
    `REQUESTED_QUANTITY_MAX_INTEGER_DIGITS` integer digits, and - for a
    COUNT unit - is already a whole number. Otherwise returns
    `(None, issue_code)`, one of `MaterialRequisitionLine.
    QuantityDecisionIssue`'s values, and the exact value is NEVER rounded
    to force a fit.
    """
    scaled = required_fraction * _SCALE_INT
    if scaled.denominator != 1:
        return None, MaterialRequisitionLine.QuantityDecisionIssue.REQUIRES_ROUNDING
    if unit.dimension == UnitOfMeasure.Dimension.COUNT and required_fraction.denominator != 1:
        return None, MaterialRequisitionLine.QuantityDecisionIssue.FRACTIONAL_COUNT
    integer_value = scaled.numerator
    integer_digits = len(str(abs(integer_value // _SCALE_INT)))
    if integer_digits > REQUESTED_QUANTITY_MAX_INTEGER_DIGITS:
        return None, MaterialRequisitionLine.QuantityDecisionIssue.OUT_OF_RANGE
    value = Decimal(integer_value) / _SCALE
    return value, MaterialRequisitionLine.QuantityDecisionIssue.NONE


def _check_requested_quantity(raw_value, unit):
    """Validate a client-supplied `requested_quantity`: positive, at most
    `REQUESTED_QUANTITY_MAX_DECIMAL_PLACES` decimal places, at most
    `REQUESTED_QUANTITY_MAX_INTEGER_DIGITS` integer digits, and a whole
    number if `unit` is COUNT - the same shape of rule
    `apps.batch_plans.services._check_target_quantity` applies to
    `target_output_quantity`, duplicated here (not imported) because it is
    ordinary per-app field validation, not the calculator itself.
    """
    try:
        val = Decimal(str(raw_value))
    except Exception:
        raise DjangoValidationError({"requested_quantity": "Requested quantity must be a valid number."})
    if val <= Decimal(0):
        raise DjangoValidationError({"requested_quantity": "Requested quantity must be greater than zero."})
    text = format(val, "f")
    integer_part, _, fraction_part = text.partition(".")
    if len(fraction_part) > REQUESTED_QUANTITY_MAX_DECIMAL_PLACES:
        raise DjangoValidationError(
            {"requested_quantity": f"At most {REQUESTED_QUANTITY_MAX_DECIMAL_PLACES} decimal places are allowed."}
        )
    if len(integer_part) > REQUESTED_QUANTITY_MAX_INTEGER_DIGITS:
        raise DjangoValidationError(
            {"requested_quantity": f"At most {REQUESTED_QUANTITY_MAX_INTEGER_DIGITS} integer digits are allowed."}
        )
    if unit.dimension == UnitOfMeasure.Dimension.COUNT and val % 1 != 0:
        raise DjangoValidationError(
            {"requested_quantity": f"Whole numbers are required for {unit.code} (COUNT unit)."}
        )
    return val


def _requisition_audit_snapshot(requisition):
    return {
        "id": requisition.id,
        "batch_plan_id": requisition.batch_plan_id,
        "store_id": requisition.store_id,
        "company_id": requisition.company_id,
        "status": requisition.status,
        "notes": requisition.notes,
        "version": requisition.version,
        "current_round": requisition.current_round,
        "source_plan_version": requisition.source_plan_version_snapshot,
        "target_output_quantity": str(requisition.target_output_quantity_snapshot),
        "formula_code": requisition.formula_code_snapshot,
        "formula_revision_number": requisition.formula_revision_number_snapshot,
        "product_code": requisition.product_code_snapshot,
    }


def _line_audit_snapshot(line):
    # `requested_quantity` is read by Task 15C's own legacy-data migration
    # (apps/material_requisitions/migrations/0004_backfill_rounds_and_
    # contributors.py) to reconstruct contributor provenance for rows
    # created before this module tracked it directly - its key/shape here
    # must stay stable for that reason, even though the migration itself
    # does not import this function (it reads the raw JSON a prior call
    # to this function already wrote to the database).
    return {
        "id": line.id,
        "line_number": line.line_number,
        "material_code": line.material_code_snapshot,
        "requested_quantity": str(line.requested_quantity) if line.requested_quantity is not None else None,
        "quantity_decision_issue": line.quantity_decision_issue,
        "quantity_remark": line.quantity_remark,
        "requested_quantity_contributor_id": line.requested_quantity_contributor_id,
    }


def _duplicate_requisition_error():
    """A concurrent duplicate hits the `OneToOneField`'s own unique
    constraint at the database level, raising `IntegrityError` - translated
    here to a `Conflict` (409), the same choice `apps.store_preparation.
    services._duplicate_preparation_error` makes for the identical
    one-per-plan shape, rather than an unhandled 500.
    """
    return Conflict("A material requisition already exists for this batch plan.")


@transaction.atomic
def create_material_requisition(*, actor, store, batch_plan_id, expected_batch_plan_version, notes=""):
    """Create the ONE DRAFT `MaterialRequisition` for `batch_plan_id`, at
    `store`, auto-fetching every line from the plan's pinned APPROVED
    formula revision.

    LOCK ORDER (fixed, chosen to extend - never reorder - the two existing
    paths it touches): `BatchPlan` (locked first, exactly where `apps.
    batch_plans.services.update_batch_plan` already locks it relative to
    everything downstream) -> `FormulaRevision` -> its company's
    `FormulaApprovalPolicy` -> `Product` -> `UnitOfMeasure`s -> `Material`s
    (this second half is `apps.formulas.approval.
    lock_and_load_approval_context`, reused unchanged - the exact order
    `approve_formula_revision` already locks in). No existing path locks a
    `BatchPlan` after a `FormulaRevision`, or any of the formula-side rows
    before a `BatchPlan`, so this is simply the two established orders
    concatenated, never reversed - no new deadlock cycle is introduced.

    `store` is an already-resolved, already-access-checked object (this
    function has no permission awareness of its own, matching every other
    service in this project).

    1. Lock the plan; `expected_batch_plan_version` must match its current
       `version` exactly, or `Conflict` (409) - a field deliberately named
       and documented as distinct from this requisition's OWN
       `expected_version` (used only on PATCH, once the record exists).
    2. Reject (400) if the plan's source has drifted incompatible (`apps.
       batch_plans.services.assess_source_drift`, reused unchanged,
       unlocked - safe to call here since nothing it reads is mutated by
       this function).
    3. Lock and re-read the pinned formula revision and its lines/
       materials/units; reject (400) if the output unit is inactive or the
       revision has no lines (structurally not expected for an APPROVED
       revision, checked defensively).
    4. Run `apps.formulas.requirement_preview.build_requirement_preview`
       unchanged against the plan's CURRENT `target_output_quantity` -
       reject (400) if it is not `calculation_complete`.
    5. For each resulting line, decide `requested_quantity` via
       `_fit_requested_quantity` (never a second scaling formula - see its
       own docstring) and persist the header + lines + audit event
       atomically. A concurrent duplicate creation for the same plan hits
       the `OneToOneField`'s own DB constraint and is translated to a
       clean `Conflict` (409), never a 500.
    """
    try:
        plan = (
            BatchPlan.objects.select_for_update()
            .select_related("company")
            .get(pk=batch_plan_id)
        )
    except BatchPlan.DoesNotExist:
        raise DjangoValidationError({"batch_plan_id": "Batch plan does not exist."})

    if plan.version != expected_batch_plan_version:
        raise Conflict("This batch plan has changed since it was last reviewed. Refetch and retry.")

    drift = assess_source_drift(plan)
    if drift["is_incompatible"]:
        raise DjangoValidationError(
            {"batch_plan_id": "The batch plan's source has drifted and is incompatible. A requisition cannot be created until this is resolved."}
        )

    revision = (
        FormulaRevision.objects.select_for_update()
        .select_related("formula__company", "formula__product")
        .get(pk=plan.formula_revision_id)
    )
    formula = revision.formula
    _policy, product, output_unit, lines = lock_and_load_approval_context(revision, formula)

    if not output_unit.is_active:
        raise DjangoValidationError({"batch_plan_id": f"Output unit '{output_unit.code}' is inactive."})
    if not lines:
        raise DjangoValidationError({"batch_plan_id": "The formula revision has no material lines; a requisition cannot be created."})

    target = plan.target_output_quantity
    preview = build_requirement_preview(revision, lines, target)
    if not preview["calculation_complete"]:
        raise DjangoValidationError({"batch_plan_id": "The material requirement could not be fully calculated for this plan."})

    base = revision.base_output_quantity
    factor_fraction = _to_fraction(target) / _to_fraction(base)

    requisition = MaterialRequisition(
        batch_plan=plan,
        store=store,
        company=plan.company,
        status=MaterialRequisition.Status.DRAFT,
        notes=(notes or "").strip(),
        version=1,
        created_by=actor,
        updated_by=actor,
        source_plan_version_snapshot=plan.version,
        source_order_reference_snapshot=plan.source_order_reference_snapshot,
        source_line_number_snapshot=plan.source_line_number_snapshot,
        product_id_snapshot=product.id,
        product_code_snapshot=product.code,
        product_name_snapshot=product.name,
        formula_id_snapshot=formula.id,
        formula_code_snapshot=formula.code,
        formula_name_snapshot=formula.name,
        formula_revision_id_snapshot=revision.id,
        formula_revision_number_snapshot=revision.revision_number,
        formula_revision_version_snapshot=revision.version,
        formula_base_output_quantity_snapshot=base,
        output_uom_id_snapshot=output_unit.id,
        output_uom_code_snapshot=output_unit.code,
        output_uom_name_snapshot=output_unit.name,
        target_output_quantity_snapshot=target,
    )
    try:
        requisition.save()
    except IntegrityError as exc:
        raise _duplicate_requisition_error() from exc

    rows_by_line_id = {row["id"]: row for row in preview["lines"]}
    warnings_by_line_id = {}
    for warning in preview["warnings"]:
        line_id = warning.get("line_id")
        if line_id is not None:
            warnings_by_line_id.setdefault(line_id, []).append(warning)

    created_at = timezone.now()
    line_objs = []
    for line in lines:
        row = rows_by_line_id[line.id]
        required_fraction = _to_fraction(line.quantity) * factor_fraction
        fit_value, issue = _fit_requested_quantity(required_fraction, line.unit)
        line_objs.append(
            MaterialRequisitionLine(
                requisition=requisition,
                line_number=row["line_number"],
                material=line.material,
                unit=line.unit,
                material_code_snapshot=row["material_code"],
                material_name_snapshot=row["material_name"],
                material_kind_snapshot=row["material_type"],
                unit_code_snapshot=row["unit_code"],
                unit_name_snapshot=row["unit_name"],
                base_line_quantity_snapshot=line.quantity,
                calculation_snapshot={
                    "required_quantity": row["required_quantity"],
                    "warnings": warnings_by_line_id.get(line.id, []),
                },
                requested_quantity=fit_value,
                quantity_decision_issue=issue,
                # Task 15C: the auto-fit value is attributed to the
                # creator, same as any other substantive value-setting
                # event - see MaterialRequisitionLine's own docstring.
                # `actor` is unconditionally barred from deciding this
                # requisition anyway (they created it), so this never
                # changes who can approve; it exists so contributor
                # provenance is complete from the very first line ever
                # written, rather than needing a later edit to establish
                # it.
                requested_quantity_contributor=actor if fit_value is not None else None,
                requested_quantity_contributed_at=created_at if fit_value is not None else None,
            )
        )
    MaterialRequisitionLine.objects.bulk_create(line_objs)

    record(
        actor=actor,
        action="material_requisition.created",
        target_type="material_requisition",
        target_id=requisition.id,
        company=plan.company,
        store=store,
        after={
            **_requisition_audit_snapshot(requisition),
            "lines": [_line_audit_snapshot(l) for l in line_objs],
        },
    )
    return requisition


def assess_requisition_drift(requisition):
    """Read-only, unlocked (safe from a GET handler): structured drift
    between this requisition's saved snapshots and the source `BatchPlan`'s
    CURRENT state.

    Reuses `apps.batch_plans.services.assess_source_drift` unchanged for
    the product/unit-compatibility half (`is_incompatible`), and adds ONE
    requisition-specific signal: whether the plan's `target_output_
    quantity` - the one field that actually drives every line's calculated
    requirement - has changed since this requisition's own `target_output_
    quantity_snapshot` was captured. `plan_version_changed` is reported
    separately and is deliberately NOT used to decide `quantity_affecting`
    on its own, because `BatchPlan.version` also bumps for reasons that
    never touch a quantity - most notably Task 12D's official batch number
    allocation, which must never be treated as quantity-affecting drift.
    """
    plan = requisition.batch_plan
    plan_drift = assess_source_drift(plan)
    target_changed = plan.target_output_quantity != requisition.target_output_quantity_snapshot
    quantity_affecting = plan_drift["is_incompatible"] or target_changed

    issues = list(plan_drift["issues"])
    if target_changed:
        issues.append(
            {
                "code": "PLAN_TARGET_QUANTITY_CHANGED",
                "message": (
                    f"The batch plan's target output quantity has changed from "
                    f"{requisition.target_output_quantity_snapshot} to {plan.target_output_quantity} "
                    "since this requisition was created."
                ),
                "blocking": True,
            }
        )

    return {
        "is_incompatible": plan_drift["is_incompatible"],
        "quantity_affecting": quantity_affecting,
        "issues": issues,
        "current_source_state": plan_drift["current_source_state"],
        "plan_version_changed": plan.version != requisition.source_plan_version_snapshot,
        "current_official_batch_number": getattr(getattr(plan, "number_allocation", None), "number", None),
    }


@transaction.atomic
def update_material_requisition(*, actor, requisition_id, expected_version, data):
    """Edit a DRAFT `MaterialRequisition`'s header `notes` and/or existing
    lines' `requested_quantity`/`quantity_remark` only. Locked, version-
    checked; a true no-op writes nothing (no version bump, no audit entry).

    LINE SEMANTICS (deliberately NOT the full-replace convention every
    other line-bearing resource in this project uses - documented here
    precisely because it diverges): `lines`, when present, is a list of
    PARTIAL edits identified by `id` - every entry MUST reference an
    EXISTING line of this requisition (an entry without an `id`, an
    unknown/foreign `id`, or the same `id` twice, is rejected with 400).
    Lines not mentioned are left completely unchanged. Lines can never be
    added or removed through this endpoint in this initial task - there is
    no create-line or remove-line path here at all.

    Any edit that sets a NON-NULL `requested_quantity` differing from that
    line's own exact calculated requirement (recomputed from this
    requisition's own snapshots - `target_output_quantity_snapshot` and
    `formula_base_output_quantity_snapshot` on the header, `base_line_
    quantity_snapshot` on the line - never by re-reading the source
    `FormulaRevision`/`FormulaLine` rows again) REQUIRES a non-blank
    `quantity_remark` in the SAME request, or 400. A manually entered
    `requested_quantity` is only ever a proposed request - never an
    approved rounding, loss or wastage rule.

    If ANY line in this request changes `requested_quantity`, quantity
    edits are first blocked (400) when `assess_requisition_drift` reports
    `quantity_affecting` drift - the source plan changed in a way that
    would make the already-calculated requirement stale. Header `notes`-
    only edits remain possible even then (see `assess_requisition_drift`'s
    own docstring for why a bare `BatchPlan.version` bump - e.g. an
    official batch number allocation - is deliberately NOT, by itself,
    quantity-affecting).
    """
    requisition = (
        MaterialRequisition.objects.select_for_update()
        .select_related("batch_plan", "company", "store")
        .get(pk=requisition_id)
    )
    if requisition.version != expected_version:
        raise Conflict("This material requisition has changed since it was last read. Refetch and retry.")

    # Task 15A: a SUBMITTED requisition is frozen - no header or line edit
    # is possible through this (the only edit) path, matching apps.quality.
    # services.update_incoming_inspection's identical status re-check for
    # the identical reason. This is the ONLY place this freeze is enforced
    # (the admin surface is already fully read-only - see apps.material_
    # requisitions.admin.MaterialRequisitionAdmin); there is no reopen/
    # amend action anywhere, so this check can never be bypassed by a
    # supported path, but a later source change is still visible via
    # `assess_requisition_drift` - never rewritten into this frozen record.
    if requisition.status != MaterialRequisition.Status.DRAFT:
        raise DjangoValidationError(
            {"detail": f"A material requisition with status '{requisition.status}' cannot be edited."}
        )

    invalid_keys = sorted(set(data.keys()) - {"notes", "lines"})
    if invalid_keys:
        raise DjangoValidationError({k: "This field cannot be edited." for k in invalid_keys})

    new_notes = requisition.notes
    notes_changed = False
    if "notes" in data:
        val = (data["notes"] or "").strip()
        if val != requisition.notes:
            new_notes = val
            notes_changed = True

    lines_changed = False
    updated_lines = []
    line_audit_before = []
    line_audit_after = []
    if "lines" in data:
        existing = {line.id: line for line in requisition.lines.select_related("unit").all()}
        seen_ids = set()
        touches_quantity = any("requested_quantity" in item for item in data["lines"])
        if touches_quantity:
            drift = assess_requisition_drift(requisition)
            if drift["quantity_affecting"]:
                raise DjangoValidationError(
                    {
                        "lines": (
                            "The source batch plan has changed in a way that affects the calculated requirement "
                            "since this requisition was created. Quantity edits are blocked until this is resolved; "
                            "header notes may still be edited."
                        )
                    }
                )

        for item in data["lines"]:
            line_id = item.get("id")
            if line_id is None:
                raise DjangoValidationError({"lines": "Each entry must reference an existing line id; new lines cannot be added here."})
            if line_id in seen_ids:
                raise DjangoValidationError({"lines": f"Line {line_id} appears more than once in this request."})
            seen_ids.add(line_id)
            line = existing.get(line_id)
            if line is None:
                raise DjangoValidationError({"lines": f"Line {line_id} does not belong to this requisition."})

            before = _line_audit_snapshot(line)
            new_requested = line.requested_quantity
            new_remark = line.quantity_remark
            new_issue = line.quantity_decision_issue
            line_changed = False
            # Task 15C: tracked SEPARATELY from `line_changed` - a
            # remark-only edit must never touch contributor provenance
            # (see MaterialRequisitionLine's own docstring and this
            # task's explicit "no-op edits must not create contributors"
            # instruction, extended here to "remark-only edits don't
            # either", since they do not change WHICH quantity value is
            # being requested).
            quantity_value_changed = False

            if "requested_quantity" in item:
                raw = item["requested_quantity"]
                if raw is None:
                    if line.requested_quantity is not None:
                        new_requested = None
                        line_changed = True
                        quantity_value_changed = True
                else:
                    val = _check_requested_quantity(raw, line.unit)
                    if val != line.requested_quantity:
                        new_requested = val
                        line_changed = True
                        quantity_value_changed = True

            if "quantity_remark" in item:
                val = (item["quantity_remark"] or "").strip()
                if val != line.quantity_remark:
                    new_remark = val
                    line_changed = True

            if line_changed and new_requested is not None:
                factor = _to_fraction(requisition.target_output_quantity_snapshot) / _to_fraction(
                    requisition.formula_base_output_quantity_snapshot
                )
                exact_fraction = _to_fraction(line.base_line_quantity_snapshot) * factor
                if Fraction(new_requested) != exact_fraction and not new_remark:
                    raise DjangoValidationError(
                        {
                            "lines": (
                                f"Line {line_id}: a non-blank quantity_remark is required when requested_quantity "
                                "differs from the calculated requirement."
                            )
                        }
                    )
                # A requested_quantity that now exactly matches the calculation clears any stale issue code.
                new_issue = MaterialRequisitionLine.QuantityDecisionIssue.NONE

            if line_changed:
                line.requested_quantity = new_requested
                line.quantity_remark = new_remark
                line.quantity_decision_issue = new_issue
                if quantity_value_changed:
                    # A genuinely new value gets a new author; clearing
                    # the value back to null leaves nothing to attribute
                    # authorship to, so both fields reset together.
                    line.requested_quantity_contributor = actor if new_requested is not None else None
                    line.requested_quantity_contributed_at = timezone.now() if new_requested is not None else None
                updated_lines.append(line)
                lines_changed = True
                line_audit_before.append(before)
                line_audit_after.append(_line_audit_snapshot(line))

    if not notes_changed and not lines_changed:
        return requisition, False

    before_header = _requisition_audit_snapshot(requisition)
    if notes_changed:
        requisition.notes = new_notes
    if lines_changed:
        for line in updated_lines:
            line.clean()
        MaterialRequisitionLine.objects.bulk_update(
            updated_lines,
            [
                "requested_quantity",
                "quantity_remark",
                "quantity_decision_issue",
                "requested_quantity_contributor",
                "requested_quantity_contributed_at",
            ],
        )
    requisition.version += 1
    requisition.updated_by = actor
    requisition.save(update_fields=["notes", "version", "updated_by", "updated_at"])

    record(
        actor=actor,
        action="material_requisition.updated",
        target_type="material_requisition",
        target_id=requisition.id,
        company=requisition.company,
        store=requisition.store,
        before={**before_header, "lines": line_audit_before},
        after={**_requisition_audit_snapshot(requisition), "lines": line_audit_after},
    )
    return requisition, True


def _validate_line_eligible_for_submission(requisition, line, material, unit):
    """One line's submission-eligibility checks, all against EXACT values
    - never an approximate display string from `calculation_snapshot`.
    Raises a field-keyed `DjangoValidationError` naming the line on the
    first problem found; returns nothing on success.
    """
    where = f"Line {line.line_number} ({line.material_code_snapshot})"
    if not material.is_active:
        raise DjangoValidationError({"detail": f"{where}: material '{material.code}' is inactive."})
    if not unit.is_active:
        raise DjangoValidationError({"detail": f"{where}: unit '{unit.code}' is inactive."})

    if line.requested_quantity is None:
        issue = line.quantity_decision_issue or MaterialRequisitionLine.QuantityDecisionIssue.NOT_CALCULATED
        raise DjangoValidationError(
            {
                "detail": (
                    f"{where}: no requested quantity has been decided ({issue}). Resolve this with an explicit "
                    "requested_quantity (and a quantity_remark, if it differs from the calculated requirement) "
                    "before submitting."
                )
            }
        )
    # Re-validates precision/range/COUNT-wholeness against the CURRENT
    # unit - the same rule a PATCH already enforces - never trusted as
    # still true just because it passed once at creation or a past PATCH.
    _check_requested_quantity(line.requested_quantity, unit)

    factor = _to_fraction(requisition.target_output_quantity_snapshot) / _to_fraction(
        requisition.formula_base_output_quantity_snapshot
    )
    exact_fraction = _to_fraction(line.base_line_quantity_snapshot) * factor
    if Fraction(line.requested_quantity) != exact_fraction and not line.quantity_remark:
        raise DjangoValidationError(
            {
                "detail": (
                    f"{where}: requested_quantity differs from the exact calculated requirement without a "
                    "quantity_remark explanation. A manually explained quantity is still only a request - "
                    "submission does not approve rounding, losses or waste."
                )
            }
        )


@transaction.atomic
def submit_material_requisition(*, actor, requisition_id, expected_version):
    """Task 15A: `DRAFT` -> `SUBMITTED`. Freezes the request for some
    future processing workflow this task does not define - it does NOT
    approve quantities, reserve stock, issue materials, authorize
    production or release anything from QC. `store`/company access are
    already checked at the view layer before this is called (this
    function has no permission awareness of its own, matching every
    other service in this project) - the "recheck authorization" this
    task's own instruction asks for is satisfied by that same view-layer
    check running again on every call, not by a second, state-dependent
    permission check inside this function: unlike `apps.formulas.
    approval.approve_formula_revision` (whose REQUIRED permission
    genuinely depends on a row's current state), submission always
    requires exactly `material_requisitions.view`/`.submit` regardless of
    status, so no `Forbidden`-class exception is needed here.

    LOCK ORDER: `MaterialRequisition` (this row, locked first - the
    primary target of this action, and no existing path locks it
    together with a `BatchPlan` yet, so there is no established order to
    extend; this task is the first to need one) -> `BatchPlan` (locked,
    because `target_output_quantity` CAN change via `apps.batch_plans.
    services.update_batch_plan` - this is exactly the "prevent a
    concurrent BatchPlan quantity edit from escaping the submission
    checks" protection this task's own instruction asks for: whichever
    transaction acquires the plan's lock first proceeds against a
    consistent view; the loser either sees the committed new value, under
    its own lock, in time to correctly flag quantity-affecting drift, or
    waits and runs after this submission has already completed) ->
    `FormulaRevision` (read via `select_related`, UNLOCKED - its `status`
    can never move away from `APPROVED` once set, no unapprove path exists
    anywhere, so there is nothing a concurrent transaction could change
    out from under this read; this mirrors `apps.quality.services.
    submit_incoming_inspection`'s identical choice to read its own
    terminal-state source field, `GoodsReceipt.status`, unlocked for the
    same reason) -> `UnitOfMeasure`s then `Material`s referenced by this
    requisition's OWN lines (ascending id in each set, mirroring `apps.
    formulas.approval.lock_and_load_approval_context`'s own "units before
    materials, ascending id" sub-order).

    1. Lock the requisition; stale `expected_version` -> `Conflict` (409),
       checked first, like every other mutation in this project.
    2. An already-`SUBMITTED` requisition at its CURRENT version is an
       idempotent no-op: returns unchanged, no version bump, no new audit
       entry, and - critically - does NOT re-run the eligibility checks
       below as if this were a new submission (mirrors `submit_incoming_
       inspection`/`submit_purchase_request`'s identical retry semantics).
       Any other non-`DRAFT` status (there is only `DRAFT`/`SUBMITTED`
       today, but this stays defensive) is rejected (400).
    3. Requires at least one line (structurally guaranteed by creation
       today, checked defensively).
    4. Locks the `BatchPlan` and re-runs `apps.batch_plans.services.
       assess_source_drift` plus this app's own `target_output_quantity`
       comparison - the SAME two signals `assess_requisition_drift`
       already exposes read-only, re-evaluated here under lock - any
       quantity-affecting drift blocks submission (400).
    5. Confirms the pinned `FormulaRevision` is still `APPROVED` (always
       true today, since no unapprove path exists - checked defensively,
       never assumed).
    6. For every line: the referenced material/unit must still be active,
       `requested_quantity` must be resolved (not `null`) and still valid
       at its current precision/range/COUNT rule, and any value differing
       from the EXACT calculated requirement (compared as a `fractions.
       Fraction`, never recomputed from `calculation_snapshot`'s
       approximate display string) must carry a non-blank
       `quantity_remark` - see `_validate_line_eligible_for_submission`.
       Explicitly NOT checked, because none of these gates are confirmed
       for requisition submission (Task 15A's own explicit instruction):
       available stock, QC release, an official batch number, a confirmed
       sales order, or purchasing's three-step approval.
    7. Task 15C: creates exactly one `MaterialRequisitionRound` (+ one
       `MaterialRequisitionRoundLine` per line, copying each line's
       CURRENT requested_quantity/quantity_remark/contributor as the
       permanent record of what was actually submitted and by whom) at
       `round_number = current_round + 1` - never on the idempotent-
       repeat path above, matching `apps.purchasing.services.
       submit_purchase_request`'s identical "no duplicate rounds on
       retry" rule.
    8. Records `SUBMITTED`/`submitted_by`/`submitted_at`, bumps
       `current_round` and `version`, and writes one audit event - all
       atomically; an audit failure rolls back the whole transition,
       same as every other mutation here.
    """
    requisition = (
        MaterialRequisition.objects.select_for_update()
        .select_related("batch_plan", "company", "store")
        .get(pk=requisition_id)
    )
    if requisition.version != expected_version:
        raise Conflict("This material requisition has changed since it was last read. Refetch and retry.")

    if requisition.status == MaterialRequisition.Status.SUBMITTED:
        return requisition
    if requisition.status != MaterialRequisition.Status.DRAFT:
        raise DjangoValidationError(
            {"detail": f"A material requisition with status '{requisition.status}' cannot be submitted."}
        )

    lines = list(requisition.lines.select_related("material__base_unit", "unit").order_by("line_number"))
    if not lines:
        raise DjangoValidationError({"detail": "At least one line is required to submit a material requisition."})

    plan = BatchPlan.objects.select_for_update().select_related("company").get(pk=requisition.batch_plan_id)
    plan_drift = assess_source_drift(plan)
    target_changed = plan.target_output_quantity != requisition.target_output_quantity_snapshot
    if plan_drift["is_incompatible"] or target_changed:
        raise DjangoValidationError(
            {
                "detail": (
                    "The source batch plan has changed in a way that affects the calculated requirement since "
                    "this requisition was created. Submission is blocked until this is resolved."
                )
            }
        )

    revision = FormulaRevision.objects.select_related("formula").get(pk=plan.formula_revision_id)
    if revision.status != FormulaRevision.Status.APPROVED:
        raise DjangoValidationError(
            {"detail": "The source formula revision is no longer APPROVED. Submission is blocked."}
        )

    unit_ids = sorted({line.unit_id for line in lines})
    locked_units = {
        u.id: u for u in UnitOfMeasure.objects.select_for_update(no_key=True).filter(pk__in=unit_ids).order_by("pk")
    }
    material_ids = sorted({line.material_id for line in lines})
    locked_materials = {
        m.id: m for m in Material.objects.select_for_update(no_key=True).filter(pk__in=material_ids).order_by("pk")
    }

    for line in lines:
        _validate_line_eligible_for_submission(
            requisition, line, locked_materials[line.material_id], locked_units[line.unit_id]
        )

    before = {"status": requisition.status, "current_round": requisition.current_round}
    submitted_at = timezone.now()
    round_number = requisition.current_round + 1

    round_obj = MaterialRequisitionRound.objects.create(
        requisition=requisition,
        round_number=round_number,
        notes_snapshot=requisition.notes,
        source_plan_version_snapshot=plan.version,
        target_output_quantity_snapshot=plan.target_output_quantity,
        formula_revision_id_snapshot=revision.id,
        formula_revision_version_snapshot=revision.version,
        submitted_by=actor,
        submitted_at=submitted_at,
        outcome=MaterialRequisitionRound.Outcome.PENDING,
        contributor_provenance_complete=True,
    )
    MaterialRequisitionRoundLine.objects.bulk_create(
        [
            MaterialRequisitionRoundLine(
                round=round_obj,
                line_number=line.line_number,
                material_id=line.material_id,
                unit_id=line.unit_id,
                material_code_snapshot=line.material_code_snapshot,
                material_name_snapshot=line.material_name_snapshot,
                material_kind_snapshot=line.material_kind_snapshot,
                unit_code_snapshot=line.unit_code_snapshot,
                unit_name_snapshot=line.unit_name_snapshot,
                base_line_quantity_snapshot=line.base_line_quantity_snapshot,
                calculation_snapshot=line.calculation_snapshot,
                requested_quantity=line.requested_quantity,
                quantity_remark=line.quantity_remark,
                requested_quantity_contributor_id=line.requested_quantity_contributor_id,
                requested_quantity_contributed_at=line.requested_quantity_contributed_at,
            )
            for line in lines
        ]
    )

    requisition.status = MaterialRequisition.Status.SUBMITTED
    requisition.submitted_by = actor
    requisition.submitted_at = submitted_at
    requisition.current_round = round_number
    requisition.version += 1
    requisition.save(
        update_fields=["status", "submitted_by", "submitted_at", "current_round", "version", "updated_at"]
    )

    record(
        actor=actor,
        action="material_requisition.submitted",
        target_type="material_requisition",
        target_id=requisition.id,
        company=requisition.company,
        store=requisition.store,
        before=before,
        after={
            "status": requisition.status,
            "submitted_by_id": actor.id,
            "submitted_at": submitted_at.isoformat(),
            "round": round_number,
            "lines": [_line_audit_snapshot(l) for l in lines],
        },
    )
    return requisition


def _lock_current_round(requisition):
    """Locks and returns the `MaterialRequisitionRound` the header's
    `current_round` currently points at - mirrors `apps.purchasing.
    services._lock_current_round` exactly, for the same reason: approve/
    reject must serialize against each other and against a concurrent
    decision on the same round, not just against changes to the
    `MaterialRequisition` header row itself.
    """
    return MaterialRequisitionRound.objects.select_for_update().get(
        requisition=requisition, round_number=requisition.current_round
    )


def _reject_if_self_or_unprovable(*, requisition, round_obj, actor):
    """Shared eligibility gate for `approve_material_requisition` and
    `reject_material_requisition` (Task 15C's own explicit instruction:
    "Apply the same actor-separation rule to rejection"). Checked AFTER
    the requisition and round are locked, BEFORE anything is written -
    never on an idempotent-repeat path (see both callers).

    WORKING CONTRIBUTOR DEFINITION (for client review, not confirmed
    policy - mirrors the explicit working-rule framing `apps.formulas.
    approval.CONTRIBUTOR_DEFINITION` already uses for the same kind of
    not-yet-confirmed rule): the actor may not decide this requisition if
    they are ANY of -
    1. The requisition's own creator (`MaterialRequisition.created_by`) -
       unconditional, no exception, including for superusers - the exact
       same absolute rule `apps.purchasing.services.
       _reject_if_self_or_repeat_decider` already applies to purchase
       requests.
    2. The current round's submitter (`MaterialRequisitionRound.
       submitted_by`) - the person who put THIS specific round up for
       review cannot also be the one who decides it.
    3. A recorded contributor to any line's CURRENT `requested_quantity`
       value (`MaterialRequisitionLine.requested_quantity_contributor`) -
       whoever most recently set the value actually being reviewed,
       whether that happened in this round or was carried forward
       unchanged from an earlier one (see that field's own docstring).

    If `round_obj.contributor_provenance_complete` is `False` (set only
    by the legacy-data migration, for a pre-existing round whose
    contributor history could not be reliably reconstructed), rule 3
    cannot be evaluated for ANYONE - it is impossible to prove the actor
    is NOT a contributor, so the decision is blocked for every actor
    until a human resolves it, mirroring `apps.formulas.approval.
    assess_approval`'s identical `CONTRIBUTOR_HISTORY_INCOMPLETE`
    fail-closed behaviour exactly. This is checked regardless of rules 1
    and 2, since even the creator/submitter check does not need rule 3 to
    already have blocked them - but a non-creator, non-submitter actor
    can never be cleared without it.
    """
    if actor.id == requisition.created_by_id:
        raise DjangoValidationError(
            {
                "detail": (
                    "This requisition's own creator cannot decide (approve or reject) it. No exception exists "
                    "for this, including for superusers. (SELF_DECISION_CREATOR)"
                )
            }
        )
    if actor.id == round_obj.submitted_by_id:
        raise DjangoValidationError(
            {
                "detail": (
                    "Whoever submitted this approval round cannot also decide it. (SELF_DECISION_SUBMITTER)"
                )
            }
        )
    if not round_obj.contributor_provenance_complete:
        raise DjangoValidationError(
            {
                "detail": (
                    "This round's contributor history could not be fully reconstructed, so it cannot be shown "
                    "that you did not make a substantive requested-quantity change to it. It cannot be decided "
                    "by any user until this is resolved. (CONTRIBUTOR_PROVENANCE_INCOMPLETE)"
                )
            }
        )
    contributor_ids = set(
        requisition.lines.exclude(requested_quantity_contributor__isnull=True).values_list(
            "requested_quantity_contributor_id", flat=True
        )
    )
    if actor.id in contributor_ids:
        raise DjangoValidationError(
            {
                "detail": (
                    "You made a substantive requested-quantity change to a line of this requisition, so you "
                    "cannot also decide it. (SELF_DECISION_CONTRIBUTOR)"
                )
            }
        )


def _revalidate_round_for_approval(requisition):
    """Re-runs, under lock, exactly the same source-eligibility checks
    `submit_material_requisition` already runs - this is a deliberate
    re-use, not a parallel copy of a different policy: approval must see
    the SAME frozen-submitted-quantities/explanations, source-formula-
    approval, active-master-data and no-quantity-affecting-drift
    guarantees a fresh submission would have to pass, because time has
    passed since this round was actually submitted and any of them could
    have changed. Returns the locked `(plan, revision, lines)` so the
    caller can build the audit snapshot from the same locked read.

    Deliberately NOT called by `reject_material_requisition` - Task
    15C's own explicit instruction is that source drift must never
    prevent an authorized rejection intended to return the request for
    correction; rejecting only needs the self-decision/round/version
    checks every decision needs, never this eligibility re-check.
    """
    lines = list(requisition.lines.select_related("material__base_unit", "unit").order_by("line_number"))
    if not lines:
        raise DjangoValidationError({"detail": "At least one line is required to approve a material requisition."})

    plan = BatchPlan.objects.select_for_update().select_related("company").get(pk=requisition.batch_plan_id)
    plan_drift = assess_source_drift(plan)
    target_changed = plan.target_output_quantity != requisition.target_output_quantity_snapshot
    if plan_drift["is_incompatible"] or target_changed:
        raise DjangoValidationError(
            {
                "detail": (
                    "The source batch plan has changed in a way that affects the calculated requirement since "
                    "this round was submitted. Approval is blocked until this is resolved - the request may "
                    "still be rejected and sent back for correction."
                )
            }
        )

    revision = FormulaRevision.objects.select_related("formula").get(pk=plan.formula_revision_id)
    if revision.status != FormulaRevision.Status.APPROVED:
        raise DjangoValidationError(
            {"detail": "The source formula revision is no longer APPROVED. Approval is blocked."}
        )

    unit_ids = sorted({line.unit_id for line in lines})
    locked_units = {
        u.id: u for u in UnitOfMeasure.objects.select_for_update(no_key=True).filter(pk__in=unit_ids).order_by("pk")
    }
    material_ids = sorted({line.material_id for line in lines})
    locked_materials = {
        m.id: m for m in Material.objects.select_for_update(no_key=True).filter(pk__in=material_ids).order_by("pk")
    }
    for line in lines:
        _validate_line_eligible_for_submission(
            requisition, line, locked_materials[line.material_id], locked_units[line.unit_id]
        )
    return plan, revision, lines


@transaction.atomic
def approve_material_requisition(*, actor, requisition_id, expected_version):
    """Task 15C: the ONE approval step - `SUBMITTED` -> `APPROVED`. A
    recorded decision only: it does NOT reserve stock, issue materials,
    authorize production, or release anything from QC. If this
    requisition is ever "issued" by some future action, that action must
    perform its OWN current validation - this decision is never silently
    revoked or rewritten if the source later changes (see
    `assess_requisition_drift` for how a later change is surfaced
    instead, on a read, never by mutating this historical record).

    LOCK ORDER (extends, never reorders, `submit_material_requisition`'s
    own established order): `MaterialRequisition` -> its current
    `MaterialRequisitionRound` -> `BatchPlan` -> `FormulaRevision`
    (unlocked, same reasoning as submission) -> `UnitOfMeasure`s then
    `Material`s referenced by this requisition's own lines.

    1. Lock the requisition; stale `expected_version` -> `Conflict` (409).
    2. An already-`APPROVED` requisition at its CURRENT version is an
       idempotent no-op for a still-authorized caller: returns unchanged,
       preserving the ORIGINAL `decided_by`/`decided_at` - it is NOT
       reassessed (no self-decision/contributor/eligibility re-check),
       mirroring `submit_material_requisition`'s own retry semantics.
       `REJECTED`/`DRAFT` -> 400 ("only the current SUBMITTED round can
       be approved" - Task 15C's own explicit instruction). Only
       `SUBMITTED` proceeds past this point.
    3. Lock the current round; it must be `PENDING` (always true while
       `status=SUBMITTED` - checked defensively, never assumed).
    4. `_reject_if_self_or_unprovable` - the actor may not be this
       requisition's creator, this round's submitter, or a recorded
       contributor to any line's current `requested_quantity`; blocked
       entirely (for everyone) if this round's contributor provenance is
       not known-complete.
    5. `_revalidate_round_for_approval` - frozen submitted quantities and
       explanations, source formula approval, active material/unit
       references, and no quantity-affecting source drift, reusing the
       exact same checks a fresh submission would have to pass.
    6. Persist: round `outcome=APPROVED`/`decided_by`/`decided_at`,
       requisition `status=APPROVED`/`version+=1`, one audit event - all
       atomically; an audit failure rolls back the whole decision.
    """
    requisition = (
        MaterialRequisition.objects.select_for_update()
        .select_related("batch_plan", "company", "store")
        .get(pk=requisition_id)
    )
    if requisition.version != expected_version:
        raise Conflict("This material requisition has changed since it was last read. Refetch and retry.")

    if requisition.status == MaterialRequisition.Status.APPROVED:
        return requisition
    if requisition.status != MaterialRequisition.Status.SUBMITTED:
        raise DjangoValidationError(
            {
                "detail": (
                    f"A material requisition with status '{requisition.status}' cannot be approved. Only the "
                    "current SUBMITTED round can be decided."
                )
            }
        )

    round_obj = _lock_current_round(requisition)
    if round_obj.outcome != MaterialRequisitionRound.Outcome.PENDING:
        raise DjangoValidationError({"detail": "This approval round has already been decided."})

    _reject_if_self_or_unprovable(requisition=requisition, round_obj=round_obj, actor=actor)
    plan, revision, lines = _revalidate_round_for_approval(requisition)

    before = {"status": requisition.status, "round": round_obj.round_number}
    decided_at = timezone.now()
    round_obj.outcome = MaterialRequisitionRound.Outcome.APPROVED
    round_obj.decided_by = actor
    round_obj.decided_at = decided_at
    round_obj.save(update_fields=["outcome", "decided_by", "decided_at"])

    requisition.status = MaterialRequisition.Status.APPROVED
    requisition.version += 1
    requisition.save(update_fields=["status", "version", "updated_at"])

    record(
        actor=actor,
        action="material_requisition.approved",
        target_type="material_requisition",
        target_id=requisition.id,
        company=requisition.company,
        store=requisition.store,
        before=before,
        after={
            "status": requisition.status,
            "round": round_obj.round_number,
            "decided_by_id": actor.id,
            "decided_at": decided_at.isoformat(),
            "plan_version_at_decision": plan.version,
            "formula_revision_version_at_decision": revision.version,
        },
    )
    return requisition


@transaction.atomic
def reject_material_requisition(*, actor, requisition_id, expected_version, rejection_reason):
    """Task 15C: the ONE approval step decided against - `SUBMITTED` ->
    `REJECTED`, always with a non-blank reason. The ONLY way out of
    `REJECTED` is `revise_material_requisition`.

    Deliberately does NOT re-run `_revalidate_round_for_approval` - Task
    15C's own explicit instruction is that source drift must never
    prevent an authorized rejection intended to return the request for
    correction; a reviewer who spots exactly that kind of problem must
    still be able to reject it. Shares `_reject_if_self_or_unprovable`
    with `approve_material_requisition` unchanged - the self-decision and
    contributor-provenance rules apply identically to both decisions.

    Retry semantics (Task 15C's own explicit instruction, narrower than
    `approve`'s): a call at the CURRENT version against an already-
    `REJECTED` round with the SAME `rejection_reason` it was already
    rejected with is an idempotent no-op - returns unchanged, preserving
    the ORIGINAL `decided_by`/`decided_at`/`rejection_reason`, not
    reassessed. The SAME call with a DIFFERENT reason is a `Conflict`
    (409) - "a changed reason is not an idempotent retry... conflicting
    decisions must fail without changing anything" - mirrors `apps.
    purchasing.services.cancel_purchase_request`'s identical same-
    reason-is-a-no-op / different-reason-is-409 convention, rather than
    `apps.purchasing.services.reject_purchase_request`'s own no-retry-at-
    all rule (that app's 3-step round/step staleness problem does not
    exist here - a single-step round's own PENDING/decided state is
    already a complete, race-safe signal on its own).
    """
    rejection_reason = (rejection_reason or "").strip()
    if not rejection_reason:
        raise DjangoValidationError({"rejection_reason": "A rejection reason is required."})

    requisition = (
        MaterialRequisition.objects.select_for_update()
        .select_related("batch_plan", "company", "store")
        .get(pk=requisition_id)
    )
    if requisition.version != expected_version:
        raise Conflict("This material requisition has changed since it was last read. Refetch and retry.")

    if requisition.status == MaterialRequisition.Status.REJECTED:
        round_obj = _lock_current_round(requisition)
        if round_obj.rejection_reason == rejection_reason:
            return requisition
        raise Conflict(
            "This material requisition was already rejected with a different reason. Refetch and review it."
        )
    if requisition.status != MaterialRequisition.Status.SUBMITTED:
        raise DjangoValidationError(
            {
                "detail": (
                    f"A material requisition with status '{requisition.status}' cannot be rejected. Only the "
                    "current SUBMITTED round can be decided."
                )
            }
        )

    round_obj = _lock_current_round(requisition)
    if round_obj.outcome != MaterialRequisitionRound.Outcome.PENDING:
        raise DjangoValidationError({"detail": "This approval round has already been decided."})

    _reject_if_self_or_unprovable(requisition=requisition, round_obj=round_obj, actor=actor)

    before = {"status": requisition.status, "round": round_obj.round_number}
    decided_at = timezone.now()
    round_obj.outcome = MaterialRequisitionRound.Outcome.REJECTED
    round_obj.decided_by = actor
    round_obj.decided_at = decided_at
    round_obj.rejection_reason = rejection_reason
    round_obj.save(update_fields=["outcome", "decided_by", "decided_at", "rejection_reason"])

    requisition.status = MaterialRequisition.Status.REJECTED
    requisition.version += 1
    requisition.save(update_fields=["status", "version", "updated_at"])

    record(
        actor=actor,
        action="material_requisition.rejected",
        target_type="material_requisition",
        target_id=requisition.id,
        company=requisition.company,
        store=requisition.store,
        before=before,
        after={
            "status": requisition.status,
            "round": round_obj.round_number,
            "decided_by_id": actor.id,
            "decided_at": decided_at.isoformat(),
            "rejection_reason": rejection_reason,
        },
    )
    return requisition


@transaction.atomic
def revise_material_requisition(
    *, actor, requisition_id, expected_version, refresh_from_source=False, expected_batch_plan_version=None
):
    """Task 15C: `REJECTED` -> `DRAFT` only - the sole way back to an
    editable draft after a rejection. Every prior round's submission and
    decision (`MaterialRequisitionRound`/`MaterialRequisitionRoundLine`)
    is NEVER touched by this function - they remain exactly as they were
    forever. `current_round` is also left untouched: the next `submit_
    material_requisition` call increments it regardless of its current
    value, exactly mirroring `apps.purchasing.services.
    revise_purchase_request`'s identical choice.

    LOCK ORDER: `MaterialRequisition` -> `BatchPlan` (always locked and
    re-assessed, to DECIDE whether a refresh is required - not only when
    the caller claims one is) -> `FormulaRevision`/its approval context
    (locked via `lock_and_load_approval_context`, reused unchanged, ONLY
    when a refresh actually proceeds) -> `UnitOfMeasure`s/`Material`s (as
    part of that same reused context).

    TWO DISTINCT PATHS, decided by whether the source has drifted in a
    way that affects the calculated requirement (the SAME `assess_
    source_drift` + `target_output_quantity` comparison submission/
    approval already use):

    - NO quantity-affecting drift: a plain reopen. The live lines are
      NOT touched at all - every `requested_quantity`/`quantity_remark`/
      `requested_quantity_contributor` carries forward completely
      unchanged, so a value's authorship survives the reopen intact
      (see `MaterialRequisitionLine`'s own docstring - "merely reopening/
      submitting must not erase authorship"). `refresh_from_source=True`
      with nothing to refresh is accepted as a harmless no-op, not an
      error - a caller cannot be expected to know in advance whether a
      refresh is actually needed before asking for one.
    - Quantity-affecting drift EXISTS: `refresh_from_source` MUST be
      `True` and `expected_batch_plan_version` MUST equal the `BatchPlan`
      's CURRENT version (proof the reviewer has actually seen the
      current state before authorizing a rebuild) - otherwise `400`/
      `Conflict` respectively. When both hold, this reuses the EXACT same
      calculator `create_material_requisition` uses
      (`build_requirement_preview` against the revision's lines and the
      plan's NEW `target_output_quantity`) to compute a brand new set of
      lines, with a brand new `requested_quantity_contributor=actor` for
      every line a value could be auto-fit for, and `None`/unresolved
      (never silently rounded - `_fit_requested_quantity` never rounds)
      for one that cannot. The OLD lines are bulk-deleted (the one
      sanctioned exception to `MaterialRequisitionLine.delete()`'s own
      block - see that method's docstring) and replaced; nothing is
      LOST, because the round that was just rejected already preserved
      every old line's value and contributor forever in its own
      `MaterialRequisitionRoundLine` snapshot, taken before this ever
      ran. The requisition's own header `*_snapshot` fields are rewritten
      to the new plan/revision state too (see `MaterialRequisition`'s own
      docstring for this one deliberate exception to their usual
      immutability).

    Retry semantics mirror `revise_purchase_request`'s own, narrower-
    than-"status is already DRAFT" rule exactly: a brand-new, never-
    submitted requisition is also `DRAFT` from creation, so treating
    every `DRAFT` as a valid retry target would silently accept "revise"
    called on something that was never rejected. The idempotent branch
    requires positive evidence this `DRAFT` was reached via a real
    `REJECTED` -> `DRAFT` transition (`current_round > 0`, which only a
    real submission could ever have set) - satisfied, it is a no-op (no
    further mutation, no new audit entry, and no refresh is re-applied
    even if `refresh_from_source=True` is passed again); unsatisfied
    (`current_round == 0`, never submitted), `400`. Any other non-
    `DRAFT`, non-`REJECTED` status is also `400`.
    """
    requisition = (
        MaterialRequisition.objects.select_for_update()
        .select_related("batch_plan", "company", "store")
        .get(pk=requisition_id)
    )
    if requisition.version != expected_version:
        raise Conflict("This material requisition has changed since it was last read. Refetch and retry.")

    if requisition.status == MaterialRequisition.Status.DRAFT:
        if requisition.current_round > 0:
            return requisition, False
        raise DjangoValidationError(
            {"detail": "This material requisition has never been submitted, so there is nothing to revise."}
        )
    if requisition.status != MaterialRequisition.Status.REJECTED:
        raise DjangoValidationError(
            {"detail": "Only a rejected material requisition can be revised back to draft."}
        )

    plan = BatchPlan.objects.select_for_update().select_related("company").get(pk=requisition.batch_plan_id)
    plan_drift = assess_source_drift(plan)
    target_changed = plan.target_output_quantity != requisition.target_output_quantity_snapshot
    quantity_affecting = plan_drift["is_incompatible"] or target_changed

    before = {"status": requisition.status}
    refreshed = False

    if quantity_affecting:
        if not refresh_from_source:
            raise DjangoValidationError(
                {
                    "detail": (
                        "The source batch plan has changed in a way that affects the calculated requirement "
                        "since this requisition was last reviewed. Set refresh_from_source=true and supply the "
                        "current expected_batch_plan_version to rebuild the draft from the current source, or "
                        "resolve the drift on the batch plan first."
                    )
                }
            )
        if expected_batch_plan_version != plan.version:
            raise Conflict("This batch plan has changed since it was last reviewed. Refetch and retry.")

        revision = (
            FormulaRevision.objects.select_for_update()
            .select_related("formula__company", "formula__product")
            .get(pk=plan.formula_revision_id)
        )
        formula = revision.formula
        _policy, product, output_unit, formula_lines = lock_and_load_approval_context(revision, formula)
        if not output_unit.is_active:
            raise DjangoValidationError({"detail": f"Output unit '{output_unit.code}' is inactive."})
        if not formula_lines:
            raise DjangoValidationError(
                {"detail": "The formula revision has no material lines; this requisition cannot be refreshed."}
            )

        target = plan.target_output_quantity
        preview = build_requirement_preview(revision, formula_lines, target)
        if not preview["calculation_complete"]:
            raise DjangoValidationError(
                {"detail": "The material requirement could not be fully calculated for the current plan state."}
            )

        base = revision.base_output_quantity
        factor_fraction = _to_fraction(target) / _to_fraction(base)
        rows_by_line_id = {row["id"]: row for row in preview["lines"]}
        warnings_by_line_id = {}
        for warning in preview["warnings"]:
            line_id = warning.get("line_id")
            if line_id is not None:
                warnings_by_line_id.setdefault(line_id, []).append(warning)

        refreshed_at = timezone.now()
        new_line_objs = []
        for formula_line in formula_lines:
            row = rows_by_line_id[formula_line.id]
            required_fraction = _to_fraction(formula_line.quantity) * factor_fraction
            fit_value, issue = _fit_requested_quantity(required_fraction, formula_line.unit)
            new_line_objs.append(
                MaterialRequisitionLine(
                    requisition=requisition,
                    line_number=row["line_number"],
                    material=formula_line.material,
                    unit=formula_line.unit,
                    material_code_snapshot=row["material_code"],
                    material_name_snapshot=row["material_name"],
                    material_kind_snapshot=row["material_type"],
                    unit_code_snapshot=row["unit_code"],
                    unit_name_snapshot=row["unit_name"],
                    base_line_quantity_snapshot=formula_line.quantity,
                    calculation_snapshot={
                        "required_quantity": row["required_quantity"],
                        "warnings": warnings_by_line_id.get(formula_line.id, []),
                    },
                    # "Clear obsolete quantity overrides and explanations" -
                    # a refresh never carries a manual override/remark
                    # forward; only a freshly auto-fit value (never
                    # rounded - see _fit_requested_quantity) is set, with
                    # a fresh contributor, exactly like a brand-new line.
                    requested_quantity=fit_value,
                    quantity_decision_issue=issue,
                    quantity_remark="",
                    requested_quantity_contributor=actor if fit_value is not None else None,
                    requested_quantity_contributed_at=refreshed_at if fit_value is not None else None,
                )
            )

        # The ONE sanctioned bulk-queryset delete for this model - see
        # MaterialRequisitionLine.delete()'s own docstring. The old
        # content is already preserved forever in this (REJECTED) round's
        # own MaterialRequisitionRoundLine snapshot, taken at submission.
        MaterialRequisitionLine.objects.filter(requisition=requisition).delete()
        MaterialRequisitionLine.objects.bulk_create(new_line_objs)

        requisition.source_plan_version_snapshot = plan.version
        requisition.source_order_reference_snapshot = plan.source_order_reference_snapshot
        requisition.source_line_number_snapshot = plan.source_line_number_snapshot
        requisition.product_id_snapshot = product.id
        requisition.product_code_snapshot = product.code
        requisition.product_name_snapshot = product.name
        requisition.formula_id_snapshot = formula.id
        requisition.formula_code_snapshot = formula.code
        requisition.formula_name_snapshot = formula.name
        requisition.formula_revision_id_snapshot = revision.id
        requisition.formula_revision_number_snapshot = revision.revision_number
        requisition.formula_revision_version_snapshot = revision.version
        requisition.formula_base_output_quantity_snapshot = base
        requisition.output_uom_id_snapshot = output_unit.id
        requisition.output_uom_code_snapshot = output_unit.code
        requisition.output_uom_name_snapshot = output_unit.name
        requisition.target_output_quantity_snapshot = target
        refreshed = True

    requisition.status = MaterialRequisition.Status.DRAFT
    requisition.version += 1
    update_fields = ["status", "version", "updated_at"]
    if refreshed:
        update_fields += [
            "source_plan_version_snapshot",
            "source_order_reference_snapshot",
            "source_line_number_snapshot",
            "product_id_snapshot",
            "product_code_snapshot",
            "product_name_snapshot",
            "formula_id_snapshot",
            "formula_code_snapshot",
            "formula_name_snapshot",
            "formula_revision_id_snapshot",
            "formula_revision_number_snapshot",
            "formula_revision_version_snapshot",
            "formula_base_output_quantity_snapshot",
            "output_uom_id_snapshot",
            "output_uom_code_snapshot",
            "output_uom_name_snapshot",
            "target_output_quantity_snapshot",
        ]
    requisition.save(update_fields=update_fields)

    record(
        actor=actor,
        action="material_requisition.revised",
        target_type="material_requisition",
        target_id=requisition.id,
        company=requisition.company,
        store=requisition.store,
        before=before,
        after={"status": requisition.status, "refreshed_from_source": refreshed},
    )
    return requisition, refreshed
