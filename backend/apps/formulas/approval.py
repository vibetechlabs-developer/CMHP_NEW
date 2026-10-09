"""Task 11C: policy-gated approval of formula revisions (DRAFT -> APPROVED).

APPROVAL DOES NOT create batches, reserve stock, issue materials, validate
manufacturing scaling or authorize production. It is a recorded decision that
this revision's content is approved, nothing more. There is no unapprove,
clone, retire, supersede, effective dating or "current revision" selection.

`assess_approval` is the ONE assessment used by both the read-only
`approval-preview` and the transactional `approve_formula_revision`, so they
cannot drift (a preview still cannot guarantee a later success).

WORKING RULES FOR CLIENT REVIEW (not confirmed policy):
- Contributor = the user who created the revision OR made a substantive content
  change (base output, revision notes, material lines). Formula-master metadata
  edits are not content edits; no-op edits add nobody.
- Self-approval = the approver is a contributor.
- Technical eligibility safeguards are listed in `ELIGIBILITY_SAFEGUARDS`.
"""

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import exceptions
from rest_framework.exceptions import APIException

from apps.audit.services import record
from apps.catalog.models import Material, UnitOfMeasure
from apps.common.errors import Conflict, Forbidden
from apps.companies.services import active_companies_for_user
from apps.formulas.models import (
    Formula,
    FormulaApprovalPolicy,
    FormulaLine,
    FormulaRevision,
    FormulaRevisionContributor,
)
from apps.permissions.services import user_has_permission
from apps.products.models import Product

FORMULAS_VIEW = "formulas.view"
FORMULAS_APPROVE = "formulas.approve"
FORMULAS_SUBMIT = "formulas.submit"

POLICY_NOT_CONFIGURED_MESSAGE = "Approval rules are not configured. Contact your administrator."

CATEGORY_POLICY_NOT_CONFIGURED = "POLICY_NOT_CONFIGURED"
CATEGORY_ELIGIBILITY = "ELIGIBILITY"
CATEGORY_POLICY_RULE = "POLICY_RULE"

ELIGIBILITY_SAFEGUARDS = [
    "revision is a draft",
    "at least one material line",
    "positive base output and line quantities (whole numbers for COUNT units)",
    "consistent product/company and material/line-unit relationships",
    "active product, output unit, materials and line units",
]
CONTRIBUTOR_DEFINITION = (
    "A contributor created the revision or made a substantive content change "
    "(base output, revision notes or material lines). Formula-master metadata edits and no-op updates do not count."
)


class ApprovalBlocked(APIException):
    """HTTP 400 with a structured body (`detail` set directly so `line_id`/
    `line_number` stay integers).
    """

    status_code = 400
    default_detail = "The revision cannot be approved."
    default_code = "formula_approval_blocked"

    def __init__(self, payload):
        super().__init__()
        self.detail = payload


def policy_status(policy):
    if policy is None:
        return "NOT_CONFIGURED"
    return "CONFIGURED" if policy.is_complete else "INCOMPLETE"


def policy_summary(policy):
    """Effective values only (never who configured it)."""
    return {
        "status": policy_status(policy),
        "version": policy.version if policy is not None else None,
        "allow_self_approval": policy.allow_self_approval if policy is not None else None,
    }


def policy_snapshot(policy):
    return {
        "version": policy.version,
        "allow_self_approval": policy.allow_self_approval,
        "contributor_definition": CONTRIBUTOR_DEFINITION,
        "eligibility_safeguards": ELIGIBILITY_SAFEGUARDS,
    }


def approved_identity(formula, product, output_unit, revision):
    """Frozen at approval so later Formula/Product edits cannot rewrite what the
    approved record represents.
    """
    return {
        "formula_id": formula.id,
        "formula_code": formula.code,
        "formula_name": formula.name,
        "formula_notes": formula.notes,
        "product_id": product.id,
        "product_code": product.code,
        "product_name": product.name,
        "output_unit_code": output_unit.code,
        "output_unit_name": output_unit.name,
        "revision_number": revision.revision_number,
        "base_output_quantity": str(revision.base_output_quantity),
    }


def _block(code, category, message, **extra):
    return {"code": code, "category": category, "message": message, **extra}


def assess_approval(revision, formula, product, output_unit, lines, policy, *, actor_is_contributor, actor_known):
    """Pure function over already-loaded objects (no queries, no writes).
    `lines` carry `.material` (with `.base_unit`) and `.unit` loaded.
    `actor_is_contributor` is whether the assessed user is a recorded
    contributor. Returns {"policy", "blocking_reasons", "informational_observations"}.
    """
    blocking = []
    info = []

    if revision.status == FormulaRevision.Status.APPROVED:
        blocking.append(_block("REVISION_ALREADY_APPROVED", CATEGORY_ELIGIBILITY, "This revision is already approved."))
    elif revision.status != FormulaRevision.Status.SUBMITTED:
        # A DRAFT revision must be submitted for QA review first (apps.
        # formulas.approval.submit_formula_revision) - approval is no
        # longer reachable directly from DRAFT.
        blocking.append(
            _block(
                "REVISION_NOT_SUBMITTED",
                CATEGORY_ELIGIBILITY,
                f"A revision with status '{revision.status}' cannot be approved. It must be submitted for QA "
                "review first.",
            )
        )

    state = policy_status(policy)
    if state != "CONFIGURED":
        blocking.append(
            _block(
                "APPROVAL_POLICY_NOT_CONFIGURED" if state == "NOT_CONFIGURED" else "APPROVAL_POLICY_INCOMPLETE",
                CATEGORY_POLICY_NOT_CONFIGURED,
                POLICY_NOT_CONFIGURED_MESSAGE,
            )
        )

    # -- technical eligibility safeguards -------------------------------------
    if not lines:
        blocking.append(_block("EMPTY_REVISION", CATEGORY_ELIGIBILITY, "The revision has no material lines."))
    if revision.base_output_quantity is None or revision.base_output_quantity <= 0:
        blocking.append(_block("INVALID_BASE_OUTPUT", CATEGORY_ELIGIBILITY, "The base output quantity must be greater than zero."))
    elif output_unit.dimension == UnitOfMeasure.Dimension.COUNT and revision.base_output_quantity % 1 != 0:
        blocking.append(
            _block("INVALID_BASE_OUTPUT", CATEGORY_ELIGIBILITY, "A COUNT output unit needs a whole-number base output.")
        )
    if product.company_id != formula.company_id:
        blocking.append(
            _block("INCONSISTENT_PRODUCT_COMPANY", CATEGORY_ELIGIBILITY, "The product does not belong to the formula's company.")
        )
    # Task 12B-2: a revision's output unit is legitimately independent of
    # the product's own sales unit (e.g. a product sold in bottles whose
    # formula is manufactured in kilograms) - approval no longer requires
    # `revision.output_uom_id == product.sales_uom_id`. Whether a given
    # BatchPlan can actually be built from an approved revision with a
    # different output unit is decided separately, at planning time, by
    # `apps.batch_plans.services` (same-unit, or an explicit packing
    # relationship) - never by this function.
    if not product.is_active:
        blocking.append(_block("INACTIVE_PRODUCT", CATEGORY_ELIGIBILITY, f"Product '{product.code}' is inactive."))
    if not output_unit.is_active:
        blocking.append(_block("INACTIVE_OUTPUT_UNIT", CATEGORY_ELIGIBILITY, f"Output unit '{output_unit.code}' is inactive."))

    for line in lines:
        material, unit = line.material, line.unit
        where = {"line_id": line.id, "line_number": line.line_number}
        if line.quantity is None or line.quantity <= 0:
            blocking.append(_block("INVALID_QUANTITY", CATEGORY_ELIGIBILITY, "The quantity must be greater than zero.", **where))
        elif unit.dimension == UnitOfMeasure.Dimension.COUNT and line.quantity % 1 != 0:
            blocking.append(_block("INVALID_QUANTITY", CATEGORY_ELIGIBILITY, "A COUNT unit needs a whole-number quantity.", **where))
        if line.unit_id != material.base_unit_id or line.material_kind_snapshot != material.kind:
            blocking.append(
                _block("INCONSISTENT_LINE", CATEGORY_ELIGIBILITY, "The line's unit or material type is not consistent with its material.", **where)
            )
        if not material.is_active:
            blocking.append(
                _block("INACTIVE_MATERIAL", CATEGORY_ELIGIBILITY, f"Material '{line.material_code_snapshot}' is inactive.", **where)
            )
        if not unit.is_active:
            blocking.append(
                _block("INACTIVE_UNIT", CATEGORY_ELIGIBILITY, f"Unit '{line.unit_code_snapshot}' is inactive.", **where)
            )
        if (
            material.code != line.material_code_snapshot
            or material.name != line.material_name_snapshot
            or unit.code != line.unit_code_snapshot
            or unit.name != line.unit_name_snapshot
        ):
            info.append(
                {
                    "code": "MASTER_DATA_CHANGED_SINCE_SNAPSHOT",
                    "message": "The material or its unit was renamed after this line was captured. The stored values are kept; nothing is refreshed.",
                    **where,
                }
            )

    # -- explicit company policy (only when fully configured) -----------------
    if state == "CONFIGURED":
        if policy.allow_self_approval:
            if actor_is_contributor:
                info.append(
                    {"code": "SELF_APPROVAL_ALLOWED_BY_POLICY", "message": "The company policy allows contributors to approve their own revisions."}
                )
        elif actor_known:
            if actor_is_contributor:
                blocking.append(
                    _block(
                        "SELF_APPROVAL_NOT_ALLOWED",
                        CATEGORY_POLICY_RULE,
                        "The company policy does not allow someone who created or changed this revision to approve it.",
                    )
                )
            elif not revision.contributor_history_complete:
                blocking.append(
                    _block(
                        "CONTRIBUTOR_HISTORY_INCOMPLETE",
                        CATEGORY_POLICY_RULE,
                        "This revision's contributor history is incomplete, so it cannot be shown that you did not contribute to it. "
                        "Because self-approval is not allowed, it cannot be approved by this user.",
                    )
                )

    return {
        "policy": policy_summary(policy),
        "blocking_reasons": blocking,
        "informational_observations": info,
    }


# ---------------------------------------------------------------------------
# Policy configuration (active superuser; same convention as sales orders)
# ---------------------------------------------------------------------------


@transaction.atomic
def update_approval_policy(*, actor, company, expected_version, data):
    """Create (`expected_version` 0) or update a company's approval policy.
    Only supplied values change; an unanswered value stays `null` (no default).
    Row-locked, atomic with its audit event, a no-op writes nothing, and a
    creation race resolves to one winner plus a `Conflict`. Configuring the
    policy confers no approval authority.
    """
    policy = FormulaApprovalPolicy.objects.select_for_update().filter(company=company).first()
    if policy is None:
        if expected_version != 0:
            raise Conflict("The approval policy has changed since it was last read. Refetch and retry.")
        if not data:
            raise DjangoValidationError({"detail": "Provide at least one policy value."})
        try:
            with transaction.atomic():
                policy = FormulaApprovalPolicy.objects.create(company=company, created_by=actor, updated_by=actor, **data)
        except IntegrityError as exc:
            raise Conflict("The approval policy has changed since it was last read. Refetch and retry.") from exc
        record(
            actor=actor,
            action="formula_approval_policy.created",
            target_type="formula_approval_policy",
            target_id=policy.id,
            company=company,
            after={"version": policy.version, "allow_self_approval": policy.allow_self_approval},
        )
        return policy

    if policy.version != expected_version:
        raise Conflict("The approval policy has changed since it was last read. Refetch and retry.")
    changed = {field: value for field, value in data.items() if getattr(policy, field) != value}
    if not changed:
        return policy
    before = {"version": policy.version, "allow_self_approval": policy.allow_self_approval}
    for field, value in changed.items():
        setattr(policy, field, value)
    policy.version += 1
    policy.updated_by = actor
    policy.save(update_fields=[*changed.keys(), "version", "updated_by", "updated_at"])
    record(
        actor=actor,
        action="formula_approval_policy.updated",
        target_type="formula_approval_policy",
        target_id=policy.id,
        company=company,
        before=before,
        after={"version": policy.version, "allow_self_approval": policy.allow_self_approval},
    )
    return policy


# ---------------------------------------------------------------------------
# Approval
# ---------------------------------------------------------------------------


def _load_lines_with_masters(revision_id):
    return list(
        FormulaLine.objects.filter(revision_id=revision_id)
        .select_related("material__base_unit", "unit")
        .order_by("line_number", "id")
    )


def lock_and_load_approval_context(revision, formula):
    """Lock the referenced rows and return fresh (policy, product, output_unit, lines).

    LOCK ORDER (fixed; verified against the existing write paths - see below):
    revision -> formula (held by the caller) -> company approval policy ->
    product -> units (ascending id, the output unit and every line unit in one
    ordered query) -> materials (ascending id). Locks are `FOR NO KEY UPDATE`
    for policy/master rows (they conflict with every master-data mutation's
    row UPDATE / `FOR UPDATE` but not with unrelated foreign-key inserts).

    Existing write paths, inspected before choosing this order:
    - `update_formula_revision` locks revision + formula + output unit
      (joined `FOR UPDATE`);
    - `create_formula_revision` locks formula + product + sales unit;
    - `update_formula` locks formula; master services lock their single row;
    - `update_approval_policy` locks the policy row only.
    Every path acquires its rows in an order consistent with
    revision < formula < policy < product < unit < material, and no service
    locks a revision while holding a formula, so no lock cycle exists. No
    nullable-side join is ever locked (all locks here are single-table).

    GUARANTEE: while the approving transaction is open, the product, output
    unit, line units, materials and the policy cannot be changed or
    deactivated by another transaction; approval decides against exactly the
    state committed with it. Rows are re-read AFTER the locks are held.
    """
    policy = FormulaApprovalPolicy.objects.select_for_update(no_key=True).filter(company_id=formula.company_id).first()
    product = Product.objects.select_for_update(no_key=True).get(pk=formula.product_id)
    lines = _load_lines_with_masters(revision.id)
    unit_ids = sorted({revision.output_uom_id, *(line.unit_id for line in lines), *(line.material.base_unit_id for line in lines)})
    units = {u.id: u for u in UnitOfMeasure.objects.select_for_update(no_key=True).filter(pk__in=unit_ids).order_by("pk")}
    material_ids = sorted({line.material_id for line in lines})
    materials = {
        m.id: m for m in Material.objects.select_for_update(no_key=True).filter(pk__in=material_ids).order_by("pk")
    }
    for line in lines:
        line.material = materials[line.material_id]
        line.unit = units[line.unit_id]
    return policy, product, units[revision.output_uom_id], lines


@transaction.atomic
def submit_formula_revision(*, actor, company_id, formula_id, revision_id, expected_version):
    """DRAFT -> SUBMITTED, atomically. Freezes the revision's header/lines
    for QA review (FormulaLine.clean()/.delete() and update_formula_revision
    already block anything other than DRAFT, so SUBMITTED is automatically
    covered by that same existing rule). This is NOT approval and confers no
    approval authority - see approve_formula_revision/reject_formula_revision
    for what QA can then do with it.

    Same lock order as approve_formula_revision: revision -> formula.

    1. Lock the revision; stale `expected_version` -> 409 (first, as always).
    2. Re-check access under the lock (active membership, formulas.view,
       formulas.submit): authority is decided under the lock.
    3. An already-SUBMITTED revision at its CURRENT version is an idempotent
       no-op for a still-authorized caller: returns unchanged, no new
       timestamp/version/audit entry. APPROVED -> 400 (cannot be
       re-submitted). Only DRAFT proceeds past this point.
    4. Requires at least one material line - submitting an empty revision
       for review is refused outright, the same minimal structural gate
       apps.material_requisitions.services.submit_material_requisition
       applies. Deeper eligibility (active references, quantity rules,
       self-approval policy, ...) is NOT re-checked here - that is entirely
       assess_approval's job, run when QA actually attempts the decision,
       exactly as before. A structurally-broken submission simply cannot be
       approved and QA rejects it back to DRAFT for fixing.
    5. Records submitted_by/submitted_at, clears any previous rejection
       note (a fresh submission supersedes it), increments version, writes
       one audit event.
    """
    get_object_or_404(Formula, pk=formula_id, company_id=company_id)
    revision = get_object_or_404(FormulaRevision.objects.select_for_update(), pk=revision_id, formula_id=formula_id)
    formula = Formula.objects.select_for_update().select_related("company").get(pk=formula_id)
    company = formula.company

    if not active_companies_for_user(actor).filter(pk=company.id).exists():
        raise exceptions.NotFound("Company not found.")
    missing = [code for code in (FORMULAS_VIEW, FORMULAS_SUBMIT) if not user_has_permission(actor, company, code)]
    if missing:
        raise Forbidden(f"The following permission(s) are required: {', '.join(missing)}.")

    if revision.version != expected_version:
        raise Conflict("This formula revision has changed since it was last read. Refetch and retry.")
    if revision.status == FormulaRevision.Status.SUBMITTED:
        return revision
    if revision.status != FormulaRevision.Status.DRAFT:
        raise DjangoValidationError(
            {"detail": f"A revision with status '{revision.status}' cannot be submitted for QA review."}
        )
    if not FormulaLine.objects.filter(revision_id=revision.id).exists():
        raise DjangoValidationError({"detail": "A revision with no material lines cannot be submitted for QA review."})

    before = {"status": revision.status}
    revision.status = FormulaRevision.Status.SUBMITTED
    revision.submitted_by = actor
    revision.submitted_at = timezone.now()
    revision.last_rejection_reason = ""
    revision.last_rejected_by = None
    revision.last_rejected_at = None
    revision.version += 1
    revision.save(
        update_fields=[
            "status", "submitted_by", "submitted_at",
            "last_rejection_reason", "last_rejected_by", "last_rejected_at",
            "version", "updated_at",
        ]
    )
    record(
        actor=actor,
        action="formula_revision.submitted",
        target_type="formula_revision",
        target_id=revision.id,
        company=company,
        before=before,
        after={"status": revision.status, "submitted_by_id": actor.id, "submitted_at": revision.submitted_at.isoformat()},
    )
    return revision


@transaction.atomic
def reject_formula_revision(*, actor, company_id, formula_id, revision_id, expected_version, rejection_reason):
    """SUBMITTED -> DRAFT (back to the SAME revision, editable again, never
    a new one) - the other half of the QA decision alongside
    approve_formula_revision. Uses the SAME formulas.approve permission as
    approval (rejecting is not a lesser or different authority - it is the
    "no" half of the same decision formulas.approve already grants). Unlike
    approval, rejection does NOT check self/contributor status: sending a
    submission back for more work creates no false assurance the way
    self-approval would, so a contributor (even the submitter) may reject
    their own submission.

    Same lock order as approve_formula_revision: revision -> formula.

    1. Lock the revision; stale `expected_version` -> 409.
    2. Re-check access under the lock (active membership, formulas.view,
       formulas.approve).
    3. Only SUBMITTED can be rejected - APPROVED or DRAFT -> 400 (no
       idempotent no-op here, unlike approve/submit: once back at DRAFT a
       repeated reject attempt has nothing left to reject).
    4. `rejection_reason` is required (non-blank) - QA must say why.
    5. status -> DRAFT (same revision_number; lines/header become editable
       again through the ordinary update_formula_revision path), records
       last_rejected_by/at and the reason, increments version, one audit
       event. submitted_by/submitted_at are left as a historical record of
       the submission that was just decided on, not cleared.
    """
    get_object_or_404(Formula, pk=formula_id, company_id=company_id)
    revision = get_object_or_404(FormulaRevision.objects.select_for_update(), pk=revision_id, formula_id=formula_id)
    formula = Formula.objects.select_for_update().select_related("company").get(pk=formula_id)
    company = formula.company

    if not active_companies_for_user(actor).filter(pk=company.id).exists():
        raise exceptions.NotFound("Company not found.")
    missing = [code for code in (FORMULAS_VIEW, FORMULAS_APPROVE) if not user_has_permission(actor, company, code)]
    if missing:
        raise Forbidden(f"The following permission(s) are required: {', '.join(missing)}.")

    if revision.version != expected_version:
        raise Conflict("This formula revision has changed since it was last read. Refetch and retry.")
    if revision.status != FormulaRevision.Status.SUBMITTED:
        raise DjangoValidationError(
            {"detail": f"A revision with status '{revision.status}' cannot be rejected. Only a SUBMITTED revision can be."}
        )
    reason = (rejection_reason or "").strip()
    if not reason:
        raise DjangoValidationError({"rejection_reason": "A rejection reason is required."})

    before = {"status": revision.status}
    revision.status = FormulaRevision.Status.DRAFT
    revision.last_rejection_reason = reason
    revision.last_rejected_by = actor
    revision.last_rejected_at = timezone.now()
    revision.version += 1
    revision.save(
        update_fields=[
            "status", "last_rejection_reason", "last_rejected_by", "last_rejected_at", "version", "updated_at",
        ]
    )
    record(
        actor=actor,
        action="formula_revision.rejected",
        target_type="formula_revision",
        target_id=revision.id,
        company=company,
        before=before,
        after={
            "status": revision.status,
            "rejected_by_id": actor.id,
            "rejected_at": revision.last_rejected_at.isoformat(),
            "rejection_reason": reason,
        },
    )
    return revision


@transaction.atomic
def approve_formula_revision(*, actor, company_id, formula_id, revision_id, expected_version):
    """DRAFT -> APPROVED, atomically.

    1. Lock the revision (the same lock every content edit takes, so approval
       and edit serialize: whichever commits first makes the other fail with
       409 on `expected_version` - never a partial or lost update), then the
       formula (`FOR UPDATE`, same as the other formula write paths).
    2. Re-check access under the lock (active membership, `formulas.view`,
       `formulas.approve`): authority is decided under the lock.
    3. Stale `expected_version` -> 409 (first, like every command). A repeat at
       the CURRENT version of an already-APPROVED revision is an idempotent
       no-op for a still-authorized user: no new timestamp, policy snapshot,
       version or audit event, and it is not reassessed under a later policy or
       master state.
    4. Lock policy/product/units/materials, re-read them, assess with the same
       function the preview uses; any blocking reason -> structured 400.
    5. Record approved_by/approved_at, the applied policy values/version and the
       frozen display identity, increment the content version, write the audit
       event - all in this transaction (an audit failure rolls it all back).
    Content and line rows are never touched.
    """
    get_object_or_404(Formula, pk=formula_id, company_id=company_id)
    revision = get_object_or_404(FormulaRevision.objects.select_for_update(), pk=revision_id, formula_id=formula_id)
    formula = Formula.objects.select_for_update().select_related("company").get(pk=formula_id)
    company = formula.company

    if not active_companies_for_user(actor).filter(pk=company.id).exists():
        raise exceptions.NotFound("Company not found.")
    missing = [code for code in (FORMULAS_VIEW, FORMULAS_APPROVE) if not user_has_permission(actor, company, code)]
    if missing:
        raise Forbidden(f"The following permission(s) are required: {', '.join(missing)}.")

    if revision.version != expected_version:
        raise Conflict("This formula revision has changed since it was last read. Refetch and retry.")
    if revision.status == FormulaRevision.Status.APPROVED:
        return revision

    policy, product, output_unit, lines = lock_and_load_approval_context(revision, formula)
    is_contributor = FormulaRevisionContributor.objects.filter(revision=revision, user=actor).exists()
    assessment = assess_approval(
        revision, formula, product, output_unit, lines, policy, actor_is_contributor=is_contributor, actor_known=True
    )
    if assessment["blocking_reasons"]:
        not_configured = any(r["category"] == CATEGORY_POLICY_NOT_CONFIGURED for r in assessment["blocking_reasons"])
        raise ApprovalBlocked(
            {
                "code": "formula_approval_policy_not_configured" if not_configured else "formula_approval_blocked",
                "detail": POLICY_NOT_CONFIGURED_MESSAGE if not_configured else "The revision cannot be approved.",
                "blocking_reasons": assessment["blocking_reasons"],
            }
        )

    snapshot = policy_snapshot(policy)
    revision.status = FormulaRevision.Status.APPROVED
    revision.approved_by = actor
    revision.approved_at = timezone.now()
    revision.approval_policy_version = policy.version
    revision.approval_policy_snapshot = snapshot
    revision.approved_identity_snapshot = approved_identity(formula, product, output_unit, revision)
    revision.version += 1
    revision.save(
        update_fields=[
            "status",
            "approved_by",
            "approved_at",
            "approval_policy_version",
            "approval_policy_snapshot",
            "approved_identity_snapshot",
            "version",
            "updated_at",
        ]
    )
    record(
        actor=actor,
        action="formula_revision.approved",
        target_type="formula_revision",
        target_id=revision.id,
        company=company,
        before={"status": FormulaRevision.Status.DRAFT},
        after={
            "status": revision.status,
            "approved_by_id": actor.id,
            "approved_at": revision.approved_at.isoformat(),
            "policy": snapshot,
            "identity": revision.approved_identity_snapshot,
        },
    )
    return revision


# ---------------------------------------------------------------------------
# Approval preview (read-only)
# ---------------------------------------------------------------------------

_READ_ATTEMPTS = 3


def load_consistent_for_preview(revision_id, user):
    """Header, lines and the requesting user's contributor flag as ONE
    consistent state without locks or writes: read header (with version), lines
    and contributor row, then re-check the version (every content edit bumps it
    in the same transaction that changes lines and contributors); retry, then
    409 rather than a torn mix. Same approach as the requirement preview.
    """
    for _ in range(_READ_ATTEMPTS):
        revision = FormulaRevision.objects.select_related("formula__product", "formula__company", "output_uom").get(pk=revision_id)
        lines = _load_lines_with_masters(revision.id)
        is_contributor = FormulaRevisionContributor.objects.filter(revision=revision, user=user).exists()
        version_after = FormulaRevision.objects.filter(pk=revision_id).values_list("version", flat=True).get()
        if version_after == revision.version:
            return revision, lines, is_contributor
    raise Conflict("This formula revision is being edited. Retry the preview.")


APPROVAL_PREVIEW_NOTICE = (
    "Informational only. This review reflects the revision, its master data and the company approval rules at the "
    "moment it was generated and can be stale immediately. It does not guarantee that a later approval will succeed "
    "and it does not grant permission to approve. Approval does not create batches, reserve stock, issue material, "
    "validate manufacturing scaling or authorize production."
)


def build_approval_preview(revision, lines, is_contributor, policy, *, actor_has_approve_permission):
    formula = revision.formula
    product = formula.product
    output_unit = revision.output_uom
    assessment = assess_approval(
        revision, formula, product, output_unit, lines, policy, actor_is_contributor=is_contributor, actor_known=True
    )
    blocking = assessment["blocking_reasons"]
    approved = revision.status == FormulaRevision.Status.APPROVED
    rows = []
    for line in lines:
        rows.append(
            {
                "id": line.id,
                "line_number": line.line_number,
                "material_id": line.material_id,
                "material_code": line.material_code_snapshot,
                "material_name": line.material_name_snapshot,
                "material_type": line.material_kind_snapshot,
                "unit_id": line.unit_id,
                "unit_code": line.unit_code_snapshot,
                "unit_name": line.unit_name_snapshot,
                "quantity": str(line.quantity),
                "notes": line.notes,
                "current": {
                    "material_code": line.material.code,
                    "material_name": line.material.name,
                    "material_is_active": line.material.is_active,
                    "unit_code": line.unit.code,
                    "unit_name": line.unit.name,
                    "unit_is_active": line.unit.is_active,
                },
            }
        )
    return {
        "preview": {
            "informational": True,
            "generated_at": timezone.now().isoformat(),
            "notice": APPROVAL_PREVIEW_NOTICE,
        },
        "formula": {
            "id": formula.id,
            "code": formula.code,
            "name": formula.name,
            "product": {"id": product.id, "code": product.code, "name": product.name, "is_active": product.is_active},
        },
        "revision": {
            "id": revision.id,
            "revision_number": revision.revision_number,
            "status": revision.status,
            "version": revision.version,
            "base_output_quantity": str(revision.base_output_quantity),
            "notes": revision.notes,
            "output_unit": {
                "id": output_unit.id,
                "code": output_unit.code,
                "name": output_unit.name,
                "dimension": output_unit.dimension,
                "is_active": output_unit.is_active,
            },
        },
        "lines": rows,
        "approval": {
            "already_approved": approved,
            "approved_by_id": revision.approved_by_id,
            "approved_at": revision.approved_at.isoformat() if revision.approved_at else None,
            "policy_version": revision.approval_policy_version,
            "policy": revision.approval_policy_snapshot,
            "approved_identity": revision.approved_identity_snapshot,
        },
        "eligibility": {
            "policy": assessment["policy"],
            "policy_message": POLICY_NOT_CONFIGURED_MESSAGE if policy_status(policy) != "CONFIGURED" else None,
            "blocking_reasons": blocking,
            "informational_observations": assessment["informational_observations"],
            # Eligibility only - NOT permission. The frontend must also check formulas.approve.
            "ready_to_attempt": bool(not approved and not blocking),
            "actor_has_approve_permission": actor_has_approve_permission,
        },
        "contributors": {
            "requesting_user_is_contributor": is_contributor,
            "history_complete": revision.contributor_history_complete,
        },
    }
