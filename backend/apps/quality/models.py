from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from apps.catalog.models import Material, UnitOfMeasure
from apps.companies.models import Company, normalize_code
from apps.receiving.models import GoodsReceiptLine
from apps.stores.models import SharedStore


class IncomingInspection(models.Model):
    """A manually-entered QC inspection draft against one already-`POSTED`
    GoodsReceiptLine, at the store that line's parent receipt belongs to.
    Task 09B-1 scope only.

    CONFIRMED SCOPE BOUNDARY (do not read anything below as implying
    otherwise): this model records that an inspection was performed and
    what was manually observed, nothing more. It does **not** decide
    acceptance or rejection, does **not** release material to production,
    does **not** create or change any stock, does **not** change the
    source receipt line's received quantity, and does **not** establish
    legal ownership of the inspected material. There is deliberately no
    ACCEPTED/REJECTED/RELEASED status anywhere on this model or on
    InspectionObservation - see docs/incoming-qc-proposal.md for what a
    future disposition/release task would still need to decide.

    `receipt_line` (not the parent GoodsReceipt, and not the supplier's
    own lot-reference text) is the identity this inspection is filed
    against - see apps.quality.services.create_incoming_inspection. Using
    the receipt line's own primary key means two different receipts that
    happen to carry the same supplier lot text are never accidentally
    merged into one inspection subject: a `GoodsReceiptLine` is already a
    precise, permanent (once its parent receipt is `POSTED`, per Task
    09A) identity for exactly this purpose.

    `company`/`store` are always copied from the receipt line's parent
    GoodsReceipt at creation - never independently settable (see
    apps.quality.views, which never reads a `company`/`company_id`/
    `store`/`store_id` key from the request body at all). This carries
    forward the same "purchasing company, not legal ownership" caveat
    apps.receiving.models.GoodsReceipt.company already documents.

    `material`/`unit` and the `*_snapshot` text fields (including
    `lot_reference_snapshot`, which may legitimately be blank - a missing
    supplier lot reference must stay visibly missing, never fabricated)
    are copied once from `receipt_line` at creation time, the same
    snapshot-inheritance pattern already used at every earlier step of
    this codebase's purchasing/receiving chain. `received_quantity_
    snapshot` is exposed as informational context only - it is the
    received quantity of the *receipt line*, never a claim about
    available or usable stock (no stock-ledger concept exists anywhere
    in this codebase).

    INITIAL SCOPE RESTRICTION (documented, not accidental): at most one
    non-cancelled IncomingInspection may exist per receipt line - see the
    `one_active_incoming_inspection_per_receipt_line` constraint below. A
    cancelled draft may be replaced by a new one, but this task does not
    model more than one inspection "in play" against a single receipt
    line at a time. Splitting one receipt line's quantity across several
    separate inspections/dispositions, retesting after an initial
    inspection, and combining multiple receipts into one inspection are
    all explicitly deferred.

    Task 09B-3A adds `SUBMITTED`: a `DRAFT` inspection with at least one
    observation may be submitted, recording `submitted_by`/`submitted_at`
    and permanently freezing it - once `SUBMITTED`, neither the header
    nor its observations may be edited, and it can no longer be
    cancelled, through any service/API path (see
    apps.quality.services.submit_incoming_inspection,
    update_incoming_inspection, cancel_incoming_inspection). There is
    still no review/decision/disposition of any kind - `SUBMITTED` says
    only "the analyst is done recording observations," nothing about
    whether the material is acceptable. A correction/retest transition
    back to an editable state is a later task's work (see
    docs/incoming-qc-review-proposal.md, Task 09B-2's design, corrected
    by Task 09B-3A's own Part 1 but not implemented by it).
    """

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        SUBMITTED = "SUBMITTED", "Submitted"
        CANCELLED = "CANCELLED", "Cancelled"

    reference = models.CharField(max_length=40, unique=True, editable=False)
    receipt_line = models.ForeignKey(
        GoodsReceiptLine, on_delete=models.PROTECT, related_name="incoming_inspections"
    )
    store = models.ForeignKey(SharedStore, on_delete=models.PROTECT, related_name="incoming_inspections")
    company = models.ForeignKey(Company, on_delete=models.PROTECT, related_name="incoming_inspections")
    material = models.ForeignKey(Material, on_delete=models.PROTECT, related_name="incoming_inspections")
    unit = models.ForeignKey(UnitOfMeasure, on_delete=models.PROTECT, related_name="incoming_inspections")
    material_code_snapshot = models.CharField(max_length=32, blank=True)
    material_name_snapshot = models.CharField(max_length=255, blank=True)
    unit_code_snapshot = models.CharField(max_length=20, blank=True)
    unit_name_snapshot = models.CharField(max_length=100, blank=True)
    lot_reference_snapshot = models.CharField(max_length=100, blank=True)
    received_quantity_snapshot = models.DecimalField(max_digits=14, decimal_places=3)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    inspection_date = models.DateField(null=True, blank=True)
    notes = models.CharField(max_length=2000, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="incoming_inspections_created"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="incoming_inspections_submitted",
    )
    submitted_at = models.DateTimeField(null=True, blank=True)
    cancelled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="incoming_inspections_cancelled",
    )
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancellation_reason = models.CharField(max_length=1000, blank=True)
    version = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["receipt_line"],
                condition=~models.Q(status="CANCELLED"),
                name="one_active_incoming_inspection_per_receipt_line",
            ),
        ]

    def __str__(self):
        return self.reference

    def clean(self):
        self.notes = (self.notes or "").strip()
        self.cancellation_reason = (self.cancellation_reason or "").strip()
        errors = {}
        if not self.reference:
            errors["reference"] = "Reference is required."
        if self.status not in self.Status.values:
            errors["status"] = f"Status must be one of {list(self.Status.values)}."
        if self.pk:
            original = (
                IncomingInspection.objects.filter(pk=self.pk)
                .values("receipt_line_id", "store_id", "company_id", "reference")
                .first()
            )
            if original is not None:
                if original["receipt_line_id"] != self.receipt_line_id:
                    errors["receipt_line"] = "Source receipt line cannot be changed after creation."
                if original["store_id"] != self.store_id:
                    errors["store"] = "Store cannot be changed after creation."
                if original["company_id"] != self.company_id:
                    errors["company"] = "Company cannot be changed after creation."
                if original["reference"] != self.reference:
                    errors["reference"] = "Reference cannot be changed after creation."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)


class InspectionObservation(models.Model):
    """One manually-entered test/parameter observation on an
    IncomingInspection.

    Deliberately carries no pass/fail flag, no numerical limit field, and
    no ACCEPTED/REJECTED concept - see IncomingInspection's own docstring
    and docs/incoming-qc-proposal.md. No pharmaceutical test catalog,
    sampling formula, or specification is seeded anywhere in this
    codebase; `parameter_name`/`method_reference` are free text entered
    by the user and are never validated against, or treated as, an
    approved specification. A draft's observations may be incomplete -
    `result` is optional so a test can be logged before its result is
    known.
    """

    inspection = models.ForeignKey(IncomingInspection, on_delete=models.CASCADE, related_name="observations")
    line_number = models.PositiveIntegerField()
    parameter_name = models.CharField(max_length=200)
    method_reference = models.CharField(max_length=200, blank=True)
    result = models.CharField(max_length=500, blank=True)
    result_unit = models.CharField(max_length=50, blank=True)
    remarks = models.CharField(max_length=1000, blank=True)

    class Meta:
        ordering = ["line_number", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["inspection", "line_number"], name="unique_inspection_observation_line_number"
            ),
        ]

    def __str__(self):
        return f"{self.inspection.reference} observation {self.line_number}"

    def clean(self):
        self.parameter_name = (self.parameter_name or "").strip()
        self.method_reference = (self.method_reference or "").strip()
        self.result = (self.result or "").strip()
        self.result_unit = (self.result_unit or "").strip()
        self.remarks = (self.remarks or "").strip()
        errors = {}
        if not self.parameter_name:
            errors["parameter_name"] = "Parameter name is required."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)


class MaterialSpecification(models.Model):
    """A named, shared identity for "the specification we test this
    material against" - Task 09B-3B, the drafting-only foundation
    `docs/incoming-qc-review-proposal.md` proposed in §3. This model is
    deliberately just an identity container: `code`/`name`/`description`
    only, no lifecycle/status field of its own - every actual draft of
    *content* (tests, acceptance criteria) lives on a child
    `MaterialSpecificationVersion` instead (see that model's own
    docstring for why the two are split).

    CONFIRMED SCOPE BOUNDARY (do not read anything below as implying
    otherwise): this task does **not** implement approval, publication,
    effective dates, superseding, retirement, or cloning of a
    specification or any of its versions - every version created here is
    permanently `DRAFT` (see MaterialSpecificationVersion.Status). It
    does **not** attach any specification to an `IncomingInspection` -
    that integration is intentionally deferred (see
    apps.quality.models.IncomingInspection's own docstring, unchanged by
    this task; the future integration point is documented in
    docs/incoming-qc-review-proposal.md instead). It does **not** confer
    any QC/QA release or approval authority - see "Access" below.

    Access: superuser-only in both directions, the same "no read
    exception, unlike the shared catalog" shape `apps.suppliers.Supplier`
    already uses (see that model's own docstring and
    docs/backend-decisions.md, Task 08A) - deliberately **not** extended
    with `shared_catalog.view` or any store/company-scoped permission.
    Being able to manage a specification draft here confers **no**
    operational QC authority whatsoever - it is entirely separate from,
    and does not widen, `incoming_qc.*` access. Future operational read
    access (which store/company roles, if any, should ever see an
    *approved* specification) and approval authority are both explicitly
    **unresolved** - see docs/erp-handoff-open-decisions.md.

    `material` is `PROTECT` and immutable after creation - the same
    "identity, once set, is never silently reassignable" rule every
    other model in this purchasing/receiving/quality chain already
    follows. This is intentionally **not** a second material master: it
    only ever references `apps.catalog.Material`, never duplicates any of
    its fields.

    `version` (Task 09B-3B.1) is the ordinary optimistic-concurrency
    token for this row's own editable metadata (`name`/`description`) -
    `PATCH .../material-specifications/<id>/` now requires
    `expected_version`, the same `select_for_update()` + compare + audit
    shape every other mutation in this project uses. This is a corrected
    gap, not a new design choice: the original task explicitly required
    `expected_version` for updates using existing project conventions,
    and the first implementation wrongly treated this row as unversioned
    master-data (like `Material`/`Supplier`) instead - see
    docs/backend-decisions.md, Task 09B-3B.1.

    Three fields on this app's models are named "version" or carry a
    version-like number, and are **all deliberately distinct**, never to
    be confused with one another:
    - `MaterialSpecification.version` (this field) - concurrency token
      for *this row's own* `name`/`description`.
    - `MaterialSpecification.latest_revision_number` (below) -
      allocation counter for *how many* `MaterialSpecificationVersion`
      children have ever been created; unrelated to and unaffected by
      `version` above, and vice versa - editing metadata never bumps
      `latest_revision_number`, and creating a new revision never bumps
      `version`.
    - `MaterialSpecificationVersion.version` (see that model) -
      concurrency token for *one specific version's own* content
      (`reference_document`/`notes`/`tests`).
    """

    material = models.ForeignKey(Material, on_delete=models.PROTECT, related_name="specifications")
    code = models.CharField(max_length=32, unique=True)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    # Allocation counter for MaterialSpecificationVersion.revision_number
    # - the authoritative "how many versions have ever been created"
    # count, incremented only while this row is locked
    # (`select_for_update()`), mirroring
    # apps.purchasing.models.PurchaseRequest.current_round's identical
    # role for PurchaseRequestApprovalRound.round_number. The
    # `unique_specification_version_revision` constraint on the child
    # model is the backstop, not the primary allocation mechanism.
    # Deliberately independent of `version` below - see the class
    # docstring's "three fields named/shaped like a version" note.
    latest_revision_number = models.PositiveIntegerField(default=0)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="material_specifications_created"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    version = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ["code"]

    def __str__(self):
        return self.code

    def clean(self):
        self.code = normalize_code(self.code)
        self.name = (self.name or "").strip()
        self.description = (self.description or "").strip()
        errors = {}
        if not self.code:
            errors["code"] = "Code is required."
        if not self.name:
            errors["name"] = "Name is required."
        if self.pk:
            original = (
                MaterialSpecification.objects.filter(pk=self.pk).values("material_id", "code").first()
            )
            if original is not None:
                if original["material_id"] != self.material_id:
                    errors["material"] = "Material cannot be changed after creation."
                if original["code"] != self.code:
                    errors["code"] = "Code cannot be changed after creation."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)


class MaterialSpecificationVersion(models.Model):
    """One draft revision of a `MaterialSpecification`'s actual test
    content. Deliberately split from `MaterialSpecification` itself so
    the *identity* (which material, what this specification is called)
    and the *content that changes over time* (which tests, what
    acceptance criteria) are two different lifecycles - a future
    approval/publication task can then version content without ever
    needing to rename or duplicate the parent identity.

    `revision_number` and `version` are **two different concepts, kept
    deliberately distinct** (this task's own explicit instruction, not
    an accident of naming): `revision_number` is the specification's own
    sequential draft numbering (1, 2, 3, ... - a new one every time
    "create a new draft version" is called, never reused, allocated
    under `MaterialSpecification`'s own row lock - see that model's
    `latest_revision_number`); `version` is the ordinary optimistic-
    concurrency token every mutable document in this project carries
    (`expected_version` on every `PATCH`, incremented on every real
    change to *this* version's own content, unrelated to how many
    revisions the specification has). Concretely: editing revision 3's
    notes twice increments *its own* `version` from 1 to 3, while
    `revision_number` stays `3` throughout - creating revision 4 later
    does not touch revision 3's `version` at all.

    Only `DRAFT` exists as a status in this task - the `Status` choices
    class exists (rather than omitting a status field entirely) so a
    future task can add `ACTIVE`/`SUPERSEDED`/`RETIRED` etc. without a
    schema migration inventing the field from scratch, but nothing here
    treats `DRAFT` as anything other than the only reachable value today.
    `update_specification_version` (see apps.quality.services)
    deliberately still checks `status == DRAFT` explicitly before
    allowing an edit, even though no other value is reachable yet - the
    same lesson Task 09B-3A already had to apply to
    `cancel_incoming_inspection` once `SUBMITTED` was added there: an
    implicit "there's only one other state" assumption silently breaks
    the moment a real second state is introduced, so the explicit check
    is written now, before it is ever exercised by anything other than
    `DRAFT`.

    `specification` is `CASCADE`: a version is permanently owned by
    exactly one specification and has no life of its own apart from it
    (same relationship shape as `GoodsReceiptLine.goods_receipt`/
    `InspectionObservation.inspection`), and is immutable after
    creation, same rule as every other parent-reference field in this
    codebase.
    """

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"

    specification = models.ForeignKey(MaterialSpecification, on_delete=models.CASCADE, related_name="versions")
    revision_number = models.PositiveIntegerField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    reference_document = models.CharField(max_length=200, blank=True)
    notes = models.CharField(max_length=2000, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="material_specification_versions_created"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    version = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ["specification_id", "revision_number"]
        constraints = [
            models.UniqueConstraint(
                fields=["specification", "revision_number"], name="unique_specification_version_revision"
            ),
        ]

    def __str__(self):
        return f"{self.specification.code} rev {self.revision_number}"

    def clean(self):
        self.reference_document = (self.reference_document or "").strip()
        self.notes = (self.notes or "").strip()
        errors = {}
        if self.status not in self.Status.values:
            errors["status"] = f"Status must be one of {list(self.Status.values)}."
        if self.pk:
            original = (
                MaterialSpecificationVersion.objects.filter(pk=self.pk)
                .values("specification_id", "revision_number")
                .first()
            )
            if original is not None:
                if original["specification_id"] != self.specification_id:
                    errors["specification"] = "Specification cannot be changed after creation."
                if original["revision_number"] != self.revision_number:
                    errors["revision_number"] = "Revision number cannot be changed after creation."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)


class SpecificationTest(models.Model):
    """One manually-entered test/parameter row on a draft
    `MaterialSpecificationVersion`.

    Deliberately carries no numeric-limit operator (`>=`/`<=`/range), no
    automatic evaluation logic, no sampling-calculation field, and no
    clinically meaningful default anywhere - `acceptance_criteria` is
    free descriptive text a human enters, exactly like
    `InspectionObservation.result` already is on the drafting side of
    this app. `result_type` is the one enum this model has
    (`NUMERIC`/`TEXT`) and is deliberately not itself a validation rule -
    it only describes what *shape* of result a future inspection would
    record against this test, never what value would be acceptable.
    """

    class ResultType(models.TextChoices):
        NUMERIC = "NUMERIC", "Numeric"
        TEXT = "TEXT", "Text"

    version = models.ForeignKey(MaterialSpecificationVersion, on_delete=models.CASCADE, related_name="tests")
    line_number = models.PositiveIntegerField()
    parameter_name = models.CharField(max_length=200)
    method_reference = models.CharField(max_length=200, blank=True)
    result_type = models.CharField(max_length=10, choices=ResultType.choices)
    unit_label = models.CharField(max_length=50, blank=True)
    acceptance_criteria = models.TextField(blank=True)

    class Meta:
        ordering = ["line_number", "id"]
        constraints = [
            models.UniqueConstraint(fields=["version", "line_number"], name="unique_specification_test_line_number"),
        ]

    def __str__(self):
        return f"{self.version} test {self.line_number}"

    def clean(self):
        self.parameter_name = (self.parameter_name or "").strip()
        self.method_reference = (self.method_reference or "").strip()
        self.unit_label = (self.unit_label or "").strip()
        self.acceptance_criteria = (self.acceptance_criteria or "").strip()
        errors = {}
        if not self.parameter_name:
            errors["parameter_name"] = "Parameter name is required."
        if self.result_type not in self.ResultType.values:
            errors["result_type"] = f"Result type must be one of {list(self.ResultType.values)}."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)
