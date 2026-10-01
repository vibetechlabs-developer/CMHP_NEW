from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models


class MaterialRequisition(models.Model):
    """Task 13A: Material Requisition Draft Foundation. Task 15A: Submission.
    Task 15C: Approval, rejection and revision.

    A planning document requesting materials from a shared store for one
    existing, already-created `BatchPlan` - using the plan's own pinned,
    APPROVED formula revision and `apps.formulas.requirement_preview`'s
    exact-fraction calculator (reused unchanged, never a second scaling
    formula). This record REQUESTS materials; it does NOT reserve, issue,
    consume or otherwise change any stock, because no stock-balance or
    stock-ledger concept exists anywhere in this codebase. It is not itself
    a stock transaction, and creating or submitting it authorizes no
    manufacturing.

    DRAFT -> SUBMITTED -> APPROVED
                       -> REJECTED -> DRAFT -> SUBMITTED (Task 15C):
    - `DRAFT` = an editable request. Header `notes` and existing lines'
      `requested_quantity`/`quantity_remark` may still be changed (see
      `apps.material_requisitions.services.update_material_requisition`).
    - `SUBMITTED` = a FROZEN request, pending exactly ONE approval step by
      an explicitly authorized Admin (`material_requisitions.approve`) -
      not multiple rounds/steps like `apps.purchasing`'s own three-step
      flow, and not a confirmed client-validated process; this is the
      working flow the project lead accepted for this task. `apps.
      material_requisitions.services.submit_material_requisition` is the
      ONE way to reach this status (from `DRAFT`, whether a brand-new
      draft or one reopened by `revise_material_requisition` after a
      rejection); once reached, `update_material_requisition` rejects
      every edit (400), through every supported API/service/admin path.
    - `APPROVED` = the one approval step decided in favour. Terminal in
      this task - no unapprove, cancel, issue, fulfil or stock-reservation
      action exists anywhere here (see `apps.material_requisitions.
      services.approve_material_requisition`). Approval is a recorded
      decision only: it does NOT reserve or issue stock, and does NOT
      authorize production - a future "issue" action, if one is ever
      built, must perform its own current validation rather than trust
      this historical decision.
    - `REJECTED` = the one approval step decided against, always with a
      non-blank reason. The ONLY way out is `apps.material_requisitions.
      services.revise_material_requisition` (`REJECTED` -> `DRAFT`),
      which starts a fresh, editable draft while permanently preserving
      the rejected round's own submitted content and decision (see
      `MaterialRequisitionRound`) - a resubmission after this is a NEW
      round, never a rewrite of the old one.
    `SUBMITTED`/`APPROVED`/`REJECTED` are explicitly NOT "ready to issue,"
    "fulfilled," reserved stock, or production authorization - none of
    those concepts exist here - and none is automatically the same thing
    as the client's own Excel "Requisition Status" column (`docs/client-
    register-field-mapping.md`); that mapping is still unconfirmed.

    BOUNDED SCOPE (unchanged since Task 13A, confirmed still accurate):
    - Exactly ONE requisition per `BatchPlan` (the `OneToOneField` below,
      enforced at the database level) - a WORKING STRUCTURAL CHOICE for this
      initial slice, requiring client review, NOT a confirmed business rule
      that a supplementary/second requisition against the same plan is
      forbidden forever. If the client later wants more than one requisition
      per plan (e.g. a follow-up top-up request), this field becomes a
      ForeignKey - a schema change, deliberately deferred here exactly as
      `StorePreparation`'s own one-per-plan field was.
    - No official batch number is required or allocated by this record, and
      submission never requires or checks one either (Task 15A's own
      explicit instruction). A `BatchPlan`'s own `official_batch_number`
      (Task 12D), if and when allocated, is shown as CURRENT plan context
      only (see `apps.material_requisitions.services.
      assess_requisition_drift`) and is never treated as quantity-affecting
      drift on its own, and never rewrites this record's own historical
      snapshots.
    - A manually entered `requested_quantity` on a line (see
      `MaterialRequisitionLine`) is a proposed request only - never an
      approved rounding, loss or wastage rule, even once approved.
      Approval (Task 15C) does not require available stock, QC release,
      an official batch number, a confirmed sales order, or purchasing's
      three-step approval - none of those gates are confirmed for this
      workflow, and the ONE approval step here is deliberately NOT that
      three-step engine, reused only where its patterns genuinely fit
      (round/history structure, lock order, idempotency conventions).
    - Adding or removing lines, partial issue, stock-ownership/
      reservation/material-issue concepts, QC/QA gates, and post-approval
      cancellation/amendment remain explicitly UNIMPLEMENTED here - see
      `docs/erp-handoff-open-decisions.md` for the still-open questions
      this task deliberately does not answer.

    HEADER SNAPSHOTS: `store`/`batch_plan`/`company` are immutable once set
    (enforced in `clean()`). `company` is always derived from `batch_plan.
    company` at creation - never client-supplied. Every other
    `*_snapshot` field below is captured FRESH from the live, locked source
    (the batch plan and its pinned formula revision/product/output unit) at
    THIS record's own creation time - deliberately not copied from
    `BatchPlan`'s own (possibly older) snapshot, so a master-data rename
    that happened between the batch plan's creation and this requisition's
    creation is still captured accurately here. `source_plan_version_
    snapshot` is the `BatchPlan.version` that was locked and reviewed at
    creation (see `expected_batch_plan_version` in
    `apps.material_requisitions.serializers` - a field deliberately named
    and documented as DISTINCT from this record's own `expected_version`,
    which locks THIS record on PATCH). `target_output_quantity_snapshot`
    and `formula_base_output_quantity_snapshot` are retained specifically so
    a line's exact calculated requirement can be recomputed later (e.g. to
    decide whether a manually entered `requested_quantity` matches it)
    without re-reading the source `FormulaRevision`/`FormulaLine` rows -
    persisted requisition quantities never silently change if the
    `BatchPlan` is edited again after this requisition was created; see
    `apps.material_requisitions.services.assess_requisition_drift` for how a
    later edit to the plan is surfaced instead (structured drift
    information, never a silent rewrite).
    """

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        # Task 15A: a frozen request pending review. See `apps.material_
        # requisitions.services.submit_material_requisition` and this
        # model's own module docstring for the full state machine.
        SUBMITTED = "SUBMITTED", "Submitted"
        # Task 15C: terminal. See `services.approve_material_requisition`.
        APPROVED = "APPROVED", "Approved"
        # Task 15C: the only way back to DRAFT is `services.
        # revise_material_requisition`.
        REJECTED = "REJECTED", "Rejected"

    batch_plan = models.OneToOneField(
        "batch_plans.BatchPlan", on_delete=models.PROTECT, related_name="material_requisition"
    )
    store = models.ForeignKey("stores.SharedStore", on_delete=models.PROTECT, related_name="material_requisitions")
    company = models.ForeignKey("companies.Company", on_delete=models.PROTECT, related_name="material_requisitions")

    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    notes = models.CharField(max_length=2000, blank=True)
    version = models.PositiveIntegerField(default=1)
    # Task 15C: 0 until the first submit - exactly `apps.purchasing.models.
    # PurchaseRequest.current_round`'s own convention, reused unchanged.
    # Never decremented, even after a reject/revise/resubmit cycle - it
    # always names the most recent round, pending or already closed. See
    # `MaterialRequisitionRound` for the append-only per-round history
    # this survives a reject-revise-resubmit cycle without overwriting.
    current_round = models.PositiveIntegerField(default=0)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="material_requisitions_created"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="material_requisitions_updated"
    )
    updated_at = models.DateTimeField(auto_now=True)
    # Task 15A - mirror the MOST RECENT round's own submitted_by/at (see
    # MaterialRequisitionRound) for cheap, no-join reads; the full per-
    # round history is the actual source of truth. Null until the first
    # submit; updated again by every later resubmission after a revise.
    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="material_requisitions_submitted",
    )
    submitted_at = models.DateTimeField(null=True, blank=True)

    # Source identity/version snapshots - captured fresh at THIS record's
    # own creation (see module docstring), immutable thereafter, with
    # ONE deliberate exception: Task 15C's `revise_material_requisition`
    # rewrites these (and replaces the live lines - see
    # MaterialRequisitionLine's own docstring) when an explicit, reviewed
    # `refresh_from_source` is performed after quantity-affecting drift -
    # the old values are never lost, since they are already preserved
    # forever in the rejected round's own immutable `MaterialRequisitionRound`/
    # `MaterialRequisitionRoundLine` snapshot.
    source_plan_version_snapshot = models.PositiveIntegerField()
    source_order_reference_snapshot = models.CharField(max_length=64)
    source_line_number_snapshot = models.PositiveIntegerField()
    product_id_snapshot = models.PositiveIntegerField()
    product_code_snapshot = models.CharField(max_length=32)
    product_name_snapshot = models.CharField(max_length=255)
    formula_id_snapshot = models.PositiveIntegerField()
    formula_code_snapshot = models.CharField(max_length=32)
    formula_name_snapshot = models.CharField(max_length=255)
    formula_revision_id_snapshot = models.PositiveIntegerField()
    formula_revision_number_snapshot = models.PositiveIntegerField()
    # Content-version of the pinned revision at creation - informational/
    # traceability only. An APPROVED revision's own content can never
    # change again (no unapprove/edit path exists anywhere), so this value
    # cannot itself drift; it is retained purely so an audit trail need not
    # re-join to FormulaRevision to know which content-version was in force.
    formula_revision_version_snapshot = models.PositiveIntegerField()
    formula_base_output_quantity_snapshot = models.DecimalField(max_digits=14, decimal_places=3)
    output_uom_id_snapshot = models.PositiveIntegerField()
    output_uom_code_snapshot = models.CharField(max_length=20)
    output_uom_name_snapshot = models.CharField(max_length=100)
    # THE key quantity-drift signal: the BatchPlan's target_output_quantity
    # at the moment this requisition was created. Compared against the
    # plan's CURRENT value (never against BatchPlan.version, which also
    # bumps for reasons unrelated to quantity - e.g. Task 12D's official
    # batch number allocation) to decide whether a later plan edit is
    # "quantity-affecting" drift - see
    # apps.material_requisitions.services.assess_requisition_drift.
    target_output_quantity_snapshot = models.DecimalField(max_digits=14, decimal_places=3)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return f"MaterialRequisition #{self.pk or 'new'} ({self.store.code} - {self.product_code_snapshot})"

    def clean(self):
        self.notes = (self.notes or "").strip()
        errors = {}
        if self.status not in self.Status.values:
            errors["status"] = f"Status must be one of {list(self.Status.values)}."
        if self.pk:
            original = (
                MaterialRequisition.objects.filter(pk=self.pk)
                .values("batch_plan_id", "store_id", "company_id", "created_by_id")
                .first()
            )
            if original is not None:
                if original["batch_plan_id"] != self.batch_plan_id:
                    errors["batch_plan"] = "Batch plan cannot be changed after creation."
                if original["store_id"] != self.store_id:
                    errors["store"] = "Store cannot be changed after creation."
                if original["company_id"] != self.company_id:
                    errors["company"] = "Company cannot be changed after creation."
                if original["created_by_id"] != self.created_by_id:
                    errors["created_by"] = "Created by cannot be changed after creation."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError({"detail": "Material requisitions cannot be deleted."})


class MaterialRequisitionLine(models.Model):
    """One material line of a `MaterialRequisition`, auto-fetched from the
    pinned formula revision's own lines at requisition-creation time - never
    client-supplied, never added or removed after creation in this initial
    task (see `MaterialRequisition`'s own docstring). `material`/`unit` and
    every `*_snapshot` field mirror `apps.formulas.models.FormulaLine`'s own
    convention exactly (unit is always the material's own base unit, never
    client-supplied); `material_kind_snapshot` is always the material's own
    `Material.kind` (`RAW_MATERIAL`/`PACKAGING_MATERIAL`) at the moment this
    line was created.

    Task 15C: `requested_quantity_contributor`/`requested_quantity_
    contributed_at` record WHO authored the value currently in
    `requested_quantity` (set by `apps.material_requisitions.services` at
    creation - the auto-fit value counts, since the creator is already
    unconditionally barred from deciding this requisition regardless -
    and on any PATCH that genuinely CHANGES the value; a no-op PATCH, or
    one that only touches `quantity_remark`, never touches these two
    fields). This is a WORKING CONTRIBUTOR DEFINITION for client review,
    matching `apps.formulas.models.FormulaRevisionContributor`'s own
    "substantive change, never a no-op" principle but scoped to ONE line
    field and allowed to change authorship over time (unlike that model's
    append-only set) - because here a value is either overwritten by a
    new author or carried forward unchanged, never co-authored by several
    people at once. `apps.material_requisitions.services.
    revise_material_requisition`'s reject-then-reopen path deliberately
    never touches these two fields when no refresh is performed, so a
    carried-forward value's authorship survives a reject/revise cycle
    intact - see that function's own docstring. When a `refresh_from_
    source` rebuild replaces a line outright, its replacement starts with
    a fresh contributor exactly like a brand-new line does (the OLD
    line's value and authorship are not lost - they are preserved
    forever in that round's own `MaterialRequisitionRoundLine` snapshot).
    `MaterialRequisitionRound.contributor_provenance_complete` records
    whether this field is known-reliable for a given round (fail-closed
    default) - see that model's own docstring for the legacy-data
    migration that backfills it from this app's own complete audit
    history.

    `calculation_snapshot` preserves the EXACT calculated ratio this line's
    `apps.formulas.requirement_preview.build_requirement_preview` row
    produced (the same `{value, is_exact, is_approximate, is_whole_number}`
    shape used everywhere else in this codebase for an exact rational
    result, at 50 significant digits, ROUND_HALF_EVEN) plus any warnings
    that applied to it at that moment (e.g. a fractional COUNT-unit
    requirement, or a since-renamed master) - frozen at creation, exactly
    like every other snapshot in this project; it is never recomputed on a
    later read, so a historical read stays available and unchanged even if
    the referenced material later becomes inactive.

    `requested_quantity` is the ONE operational, editable quantity field on
    this line - `DecimalField(max_digits=14, decimal_places=3)`, the SAME
    precision every other operational quantity field in this codebase uses
    (`SalesOrderLine.quantity`, `FormulaLine.quantity`, `BatchPlan.
    target_output_quantity`) - chosen specifically so it composes with the
    rest of the system without a second, incompatible precision convention.
    It is populated automatically ONLY when the exact calculated requirement
    terminates within this precision (at most 3 decimal places, at most 11
    integer digits) AND, for a COUNT unit, is already a whole number -
    otherwise it is left `null` and `quantity_decision_issue` names why, so
    a genuinely non-representable exact value (a repeating decimal, a
    fractional COUNT result, or an out-of-range value) is never silently
    rounded to fit. A user may still enter an explicit `requested_quantity`
    later via PATCH (see `apps.material_requisitions.services.
    update_material_requisition`); doing so when it differs from the exact
    calculated requirement requires a non-blank `quantity_remark` - itself
    only ever a proposed request, never an approved rounding/loss/wastage
    rule.
    """

    class QuantityDecisionIssue(models.TextChoices):
        NONE = "", "None"
        REQUIRES_ROUNDING = "QUANTITY_REQUIRES_ROUNDING", "Requires rounding beyond 3 decimal places"
        FRACTIONAL_COUNT = "FRACTIONAL_COUNT_QUANTITY", "Fractional result for a COUNT unit"
        OUT_OF_RANGE = "QUANTITY_OUT_OF_RANGE", "Exceeds the operational quantity range"
        NOT_CALCULATED = "LINE_NOT_CALCULATED", "Could not be calculated"

    requisition = models.ForeignKey(MaterialRequisition, on_delete=models.CASCADE, related_name="lines")
    line_number = models.PositiveIntegerField()
    material = models.ForeignKey(
        "catalog.Material", on_delete=models.PROTECT, related_name="material_requisition_lines"
    )
    unit = models.ForeignKey(
        "catalog.UnitOfMeasure", on_delete=models.PROTECT, related_name="material_requisition_lines"
    )
    material_code_snapshot = models.CharField(max_length=32, blank=True)
    material_name_snapshot = models.CharField(max_length=255, blank=True)
    material_kind_snapshot = models.CharField(max_length=20, blank=True)
    unit_code_snapshot = models.CharField(max_length=20, blank=True)
    unit_name_snapshot = models.CharField(max_length=100, blank=True)

    base_line_quantity_snapshot = models.DecimalField(max_digits=14, decimal_places=3)
    calculation_snapshot = models.JSONField(default=dict)

    requested_quantity = models.DecimalField(max_digits=14, decimal_places=3, null=True, blank=True)
    quantity_decision_issue = models.CharField(
        max_length=32, choices=QuantityDecisionIssue.choices, blank=True, default=QuantityDecisionIssue.NONE
    )
    quantity_remark = models.CharField(max_length=1000, blank=True)
    # Task 15C - see this model's own docstring for the exact definition
    # and when these two fields do/don't change.
    requested_quantity_contributor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="material_requisition_line_contributions",
    )
    requested_quantity_contributed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["line_number", "id"]
        constraints = [
            models.UniqueConstraint(fields=["requisition", "line_number"], name="unique_material_requisition_line_number"),
            models.CheckConstraint(check=models.Q(base_line_quantity_snapshot__gt=0), name="material_requisition_line_base_quantity_positive"),
            models.CheckConstraint(
                check=models.Q(requested_quantity__isnull=True) | models.Q(requested_quantity__gt=0),
                name="material_requisition_line_requested_quantity_positive_when_set",
            ),
        ]

    def __str__(self):
        return f"{self.requisition} line {self.line_number}"

    def clean(self):
        self.quantity_remark = (self.quantity_remark or "").strip()
        errors = {}
        if self.pk:
            original = (
                MaterialRequisitionLine.objects.filter(pk=self.pk)
                .values("requisition_id", "material_id", "unit_id", "line_number", "base_line_quantity_snapshot")
                .first()
            )
            if original is not None:
                if original["requisition_id"] != self.requisition_id:
                    errors["requisition"] = "Requisition cannot be changed after creation."
                if original["material_id"] != self.material_id:
                    errors["material"] = "Material cannot be changed after creation."
                if original["unit_id"] != self.unit_id:
                    errors["unit"] = "Unit cannot be changed after creation."
                if original["line_number"] != self.line_number:
                    errors["line_number"] = "Line number cannot be changed after creation."
                if original["base_line_quantity_snapshot"] != self.base_line_quantity_snapshot:
                    errors["base_line_quantity_snapshot"] = "The calculated base quantity cannot be changed after creation."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        """Blocks ordinary (per-instance) deletion unconditionally. Task
        15C's `revise_material_requisition` refresh-from-source path is
        the ONE sanctioned exception, and it does NOT go through this
        method at all - it issues a bulk `QuerySet.delete()` directly
        (Django's documented behaviour: a queryset-level delete never
        calls an individual instance's own `delete()` override), exactly
        the same kind of ORM bypass already disclosed elsewhere in this
        project for bulk operations. This is deliberate, not an oversight
        - see that function's own docstring - and is the only place in
        this codebase that does it for this model.
        """
        raise ValidationError({"detail": "Material requisition lines cannot be deleted in this task."})


class MaterialRequisitionRound(models.Model):
    """Task 15C: one approval round's immutable submission snapshot plus
    its (at most one) decision - the smallest structure that satisfies
    "never overwrite a prior round's submission or decision" for a
    workflow with exactly ONE approval step (unlike `apps.purchasing.
    models.PurchaseRequestApprovalRound`, which this mirrors structurally
    but WITHOUT a separate per-step decision table, since there is only
    ever one decision per round here - folding `decided_by`/`decided_at`/
    `outcome`/`rejection_reason` directly onto this row is the "smallest
    appropriate round/history structure" this task asks for, not a
    simplification that loses any required history).

    `apps.material_requisitions.services.submit_material_requisition`
    creates exactly one of these (+ its `MaterialRequisitionRoundLine`
    rows) per round, the moment a genuine DRAFT -> SUBMITTED transition
    happens (never on an idempotent repeat - see that function). Never
    updated afterwards except `outcome`/`decided_by`/`decided_at`/
    `rejection_reason` when `approve_material_requisition`/`reject_
    material_requisition` closes it - every other field is a permanent
    copy, taken once, of "what was actually submitted and reviewed,"
    independent of whatever the live `MaterialRequisition`/
    `MaterialRequisitionLine` rows are edited to afterward (e.g. by a
    later `revise_material_requisition` refresh).

    `round_number` starts at 1 and increases by exactly 1 each time a
    DRAFT is actually (re)submitted - see `MaterialRequisition.
    current_round` - never reused, never renumbered, exactly like
    `PurchaseRequestApprovalRound.round_number`.

    `contributor_provenance_complete` (default `True` - every round this
    app's own services create from Task 15C onward tracks contributors
    exhaustively, so completeness is the normal case here, the OPPOSITE
    default from `apps.formulas.models.FormulaRevision.
    contributor_history_complete`'s fail-closed `False`) is set `False`
    only by the legacy-data migration, for a pre-existing round whose
    contributor provenance could not be reliably reconstructed from this
    app's own audit history - approval is then blocked for EVERY actor
    until a human resolves it, never silently assumed safe. See `apps.
    material_requisitions.services._reject_if_self_or_unprovable` for
    where this is read, and the migration that sets it for the exact
    reconstruction method and its honesty guarantee (no legacy round is
    ever marked `APPROVED`, and no contributor is ever invented).
    """

    class Outcome(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"

    requisition = models.ForeignKey(MaterialRequisition, on_delete=models.CASCADE, related_name="rounds")
    round_number = models.PositiveIntegerField()

    # Submission snapshot - permanent, taken once at submit time.
    notes_snapshot = models.CharField(max_length=2000, blank=True)
    source_plan_version_snapshot = models.PositiveIntegerField()
    target_output_quantity_snapshot = models.DecimalField(max_digits=14, decimal_places=3)
    formula_revision_id_snapshot = models.PositiveIntegerField()
    formula_revision_version_snapshot = models.PositiveIntegerField()
    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="material_requisition_rounds_submitted"
    )
    submitted_at = models.DateTimeField()

    # Decision - set exactly once, when this round closes.
    outcome = models.CharField(max_length=10, choices=Outcome.choices, default=Outcome.PENDING)
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="material_requisition_rounds_decided",
    )
    decided_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.CharField(max_length=1000, blank=True)

    contributor_provenance_complete = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["requisition", "round_number"]
        constraints = [
            models.UniqueConstraint(fields=["requisition", "round_number"], name="unique_round_per_material_requisition"),
        ]

    def __str__(self):
        return f"{self.requisition} round {self.round_number}"


class MaterialRequisitionRoundLine(models.Model):
    """Task 15C: one line exactly as it stood at the moment its round was
    submitted - a permanent copy, structurally parallel to `apps.
    purchasing.models.PurchaseRequestApprovalRoundLine`, including
    `requested_quantity_contributor`/`requested_quantity_contributed_at`
    (copied from the live `MaterialRequisitionLine` at submission time) -
    the contributor-provenance half of the snapshot this task's own
    instruction requires ("Submission actor/time" + "Contributor
    provenance"). Never updated or deleted after creation.
    """

    round = models.ForeignKey(MaterialRequisitionRound, on_delete=models.CASCADE, related_name="lines")
    line_number = models.PositiveIntegerField()
    material = models.ForeignKey(
        "catalog.Material", on_delete=models.PROTECT, related_name="material_requisition_round_lines"
    )
    unit = models.ForeignKey(
        "catalog.UnitOfMeasure", on_delete=models.PROTECT, related_name="material_requisition_round_lines"
    )
    material_code_snapshot = models.CharField(max_length=32, blank=True)
    material_name_snapshot = models.CharField(max_length=255, blank=True)
    material_kind_snapshot = models.CharField(max_length=20, blank=True)
    unit_code_snapshot = models.CharField(max_length=20, blank=True)
    unit_name_snapshot = models.CharField(max_length=100, blank=True)

    base_line_quantity_snapshot = models.DecimalField(max_digits=14, decimal_places=3)
    calculation_snapshot = models.JSONField(default=dict)
    requested_quantity = models.DecimalField(max_digits=14, decimal_places=3, null=True, blank=True)
    quantity_remark = models.CharField(max_length=1000, blank=True)

    requested_quantity_contributor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="material_requisition_round_line_contributions",
    )
    requested_quantity_contributed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["round", "line_number"]
        constraints = [
            models.UniqueConstraint(fields=["round", "line_number"], name="unique_material_requisition_round_line_number"),
        ]

    def __str__(self):
        return f"{self.round} line {self.line_number}"
