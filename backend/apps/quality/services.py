import secrets

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone

from apps.audit.services import record
from apps.catalog.models import Material
from apps.common.errors import Conflict
from apps.companies.services import active_companies_for_user
from apps.quality.models import (
    IncomingInspection,
    InspectionObservation,
    MaterialSpecification,
    MaterialSpecificationVersion,
    SpecificationTest,
)
from apps.receiving.models import GoodsReceipt, GoodsReceiptLine

_REFERENCE_MAX_ATTEMPTS = 5


def _generate_reference():
    """Mirrors apps.receiving.services._generate_reference exactly -
    same collision-safety/legibility reasoning, `QC-` prefix so this
    document type is never visually confused with a `PR-`/`PO-`/`GR-`.
    """
    date_part = timezone.now().strftime("%Y%m%d")
    suffix = secrets.token_hex(5).upper()
    return f"QC-{date_part}-{suffix}"


def _validate_observations(observations_data):
    """Resolves and validates a proposed list of observations without
    creating or modifying any row. The only hard requirement is a
    non-blank `parameter_name` per row - everything else may be blank,
    since a draft's observations may be incomplete (see
    InspectionObservation's own docstring: no pass/fail, no seeded test
    catalog, no claim of regulatory compliance).
    """
    resolved = []
    for index, item in enumerate(observations_data, start=1):
        parameter_name = (item.get("parameter_name") or "").strip()
        if not parameter_name:
            raise DjangoValidationError({"observations": f"Observation {index}: parameter_name is required."})
        resolved.append(
            {
                "line_number": index,
                "parameter_name": parameter_name,
                "method_reference": (item.get("method_reference") or "").strip(),
                "result": (item.get("result") or "").strip(),
                "result_unit": (item.get("result_unit") or "").strip(),
                "remarks": (item.get("remarks") or "").strip(),
            }
        )
    return resolved


def _create_observations(inspection, resolved_observations):
    InspectionObservation.objects.bulk_create(
        [InspectionObservation(inspection=inspection, **item) for item in resolved_observations]
    )


def _observation_snapshot_list(inspection):
    return [
        {
            "parameter_name": obs.parameter_name,
            "method_reference": obs.method_reference,
            "result": obs.result,
            "result_unit": obs.result_unit,
            "remarks": obs.remarks,
        }
        for obs in inspection.observations.order_by("line_number", "id")
    ]


def _header_snapshot(inspection):
    return {
        "inspection_date": inspection.inspection_date.isoformat() if inspection.inspection_date else None,
        "notes": inspection.notes,
    }


def _validate_inspection_date(inspection_date, goods_receipt):
    """Validates a supplied inspection date against the receipt's own
    arrival date and against today - both compared in UTC, this
    project's storage/processing timezone (see backend/README.md:
    "Datetimes are stored and processed in UTC... conversion belongs at
    the presentation layer, not in Django's TIME_ZONE setting"). An
    inspection cannot predate the material's own physical arrival, and
    cannot be logged for a date that has not happened yet.
    """
    if inspection_date is None:
        return
    arrival_date = goods_receipt.arrived_at.date()
    if inspection_date < arrival_date:
        raise DjangoValidationError(
            {"inspection_date": f"Inspection date cannot be before the receipt's arrival date ({arrival_date})."}
        )
    today = timezone.now().date()
    if inspection_date > today:
        raise DjangoValidationError({"inspection_date": "Inspection date cannot be in the future."})


def _create_header_with_unique_reference(
    *, receipt_line, store, company, material, unit, actor, inspection_date, notes
):
    """Retries on the extremely unlikely event of a reference collision -
    mirrors apps.receiving.services._create_header_with_unique_reference.
    A collision on the `one_active_incoming_inspection_per_receipt_line`
    constraint instead (a genuine concurrent race: another request
    created a non-cancelled inspection for this exact receipt line
    between create_incoming_inspection's own pre-check and this insert)
    is distinguished by inspecting the failed constraint's name and
    raised as a `Conflict` immediately, never retried with a fresh
    reference - retrying would only exhaust the attempt budget without
    ever resolving the actual duplicate.
    """
    for _ in range(_REFERENCE_MAX_ATTEMPTS):
        try:
            with transaction.atomic():
                inspection = IncomingInspection(
                    receipt_line=receipt_line,
                    store=store,
                    company=company,
                    material=material,
                    unit=unit,
                    material_code_snapshot=receipt_line.material_code_snapshot,
                    material_name_snapshot=receipt_line.material_name_snapshot,
                    unit_code_snapshot=receipt_line.unit_code_snapshot,
                    unit_name_snapshot=receipt_line.unit_name_snapshot,
                    lot_reference_snapshot=receipt_line.lot_reference,
                    received_quantity_snapshot=receipt_line.received_quantity,
                    reference=_generate_reference(),
                    inspection_date=inspection_date,
                    notes=notes,
                    created_by=actor,
                )
                inspection.save()
                return inspection
        except IntegrityError as exc:
            constraint_name = getattr(getattr(exc.__cause__, "diag", None), "constraint_name", "") or ""
            if "one_active_incoming_inspection_per_receipt_line" in constraint_name:
                raise Conflict(
                    "An active (non-cancelled) inspection already exists for this receipt line. "
                    "Refetch and use the existing inspection, or cancel it before creating a new one."
                ) from exc
            continue
    raise RuntimeError("Could not generate a unique incoming inspection reference after several attempts.")


@transaction.atomic
def create_incoming_inspection(*, actor, receipt_line_id, inspection_date=None, notes="", observations=None):
    """Creates a `DRAFT` IncomingInspection against one already-`POSTED`
    GoodsReceiptLine. `store`/`company`/`material`/`unit` and the
    `*_snapshot` fields are always derived from the receipt line itself -
    never independently accepted (see apps.quality.views, which never
    reads a `store_id`/`company_id`/`material_id`/`unit_id` key from the
    request body at all).

    Locks the receipt line (`select_for_update()`) for the whole
    transaction and pre-checks for an existing non-cancelled inspection
    before inserting - this is the primary race guard; the model's own
    partial unique constraint is the backstop for a genuine concurrent
    race that slips past the pre-check (see
    _create_header_with_unique_reference's IntegrityError handling),
    exactly mirroring apps.purchasing.services.create_purchase_order's
    one-PO-per-PR guard.
    """
    notes = notes or ""

    receipt_line = (
        GoodsReceiptLine.objects.select_for_update()
        .select_related("goods_receipt", "goods_receipt__company", "goods_receipt__store", "material", "unit")
        .get(pk=receipt_line_id)
    )
    goods_receipt = receipt_line.goods_receipt
    if goods_receipt.status != GoodsReceipt.Status.POSTED:
        raise DjangoValidationError({"detail": "Only a posted goods receipt line can be inspected."})

    _validate_inspection_date(inspection_date, goods_receipt)

    existing_active = (
        IncomingInspection.objects.filter(receipt_line=receipt_line)
        .exclude(status=IncomingInspection.Status.CANCELLED)
        .first()
    )
    if existing_active is not None:
        raise Conflict(
            "An active (non-cancelled) inspection already exists for this receipt line. "
            "Refetch and use the existing inspection, or cancel it before creating a new one."
        )

    resolved_observations = _validate_observations(observations or [])

    inspection = _create_header_with_unique_reference(
        receipt_line=receipt_line,
        store=goods_receipt.store,
        company=goods_receipt.company,
        material=receipt_line.material,
        unit=receipt_line.unit,
        actor=actor,
        inspection_date=inspection_date,
        notes=notes,
    )
    _create_observations(inspection, resolved_observations)

    record(
        actor=actor,
        action="incoming_inspection.created",
        target_type="incoming_inspection",
        target_id=inspection.id,
        company=inspection.company,
        store=inspection.store,
        after={
            "reference": inspection.reference,
            "status": inspection.status,
            "receipt_line_id": receipt_line.id,
            **_header_snapshot(inspection),
            "observations": _observation_snapshot_list(inspection),
        },
    )
    return inspection


@transaction.atomic
def update_incoming_inspection(*, actor, inspection_id, expected_version, data):
    """`data` may contain `inspection_date`/`notes`/`observations`, each
    independently optional (omitted = unchanged). `observations`, if
    present at all - even as an empty list - fully replaces the existing
    observation set, mirroring update_goods_receipt's `lines` convention
    exactly.

    `DRAFT` only (`400` otherwise) - this already blocks editing a
    `SUBMITTED` inspection (Task 09B-3A) with no change needed here, the
    same way it already blocked `CANCELLED`. Requires the row lock
    (`select_for_update`) and the caller's `expected_version` to match
    before anything is read for comparison - same Conflict-on-mismatch
    rule as every other mutation in this project, and the same lock
    `submit_incoming_inspection` takes on this row, so an edit can never
    race a concurrent submission into a torn state. A no-op PATCH (every
    supplied value already matches) does not increment `version` or
    write an audit entry.
    """
    inspection = (
        IncomingInspection.objects.select_for_update()
        .select_related("receipt_line__goods_receipt")
        .get(pk=inspection_id)
    )
    if inspection.version != expected_version:
        raise Conflict("This incoming inspection has changed since it was last read. Refetch and retry.")
    if inspection.status != IncomingInspection.Status.DRAFT:
        raise DjangoValidationError({"detail": "Only a draft incoming inspection can be edited."})

    before_header = _header_snapshot(inspection)
    header_changed = False
    if "inspection_date" in data and data["inspection_date"] != inspection.inspection_date:
        _validate_inspection_date(data["inspection_date"], inspection.receipt_line.goods_receipt)
        inspection.inspection_date = data["inspection_date"]
        header_changed = True
    if "notes" in data and data["notes"] != inspection.notes:
        inspection.notes = data["notes"]
        header_changed = True

    observations_changed = False
    before_observations = None
    after_observations = None
    if "observations" in data:
        before_observations = _observation_snapshot_list(inspection)
        resolved = _validate_observations(data["observations"])
        after_observations = [
            {key: item[key] for key in ("parameter_name", "method_reference", "result", "result_unit", "remarks")}
            for item in resolved
        ]
        if after_observations != before_observations:
            observations_changed = True
            inspection.observations.all().delete()
            _create_observations(inspection, resolved)

    if not header_changed and not observations_changed:
        return inspection

    inspection.version += 1
    inspection.save(update_fields=["inspection_date", "notes", "version", "updated_at"])

    audit_before = dict(before_header)
    audit_after = _header_snapshot(inspection)
    if observations_changed:
        audit_before["observations"] = before_observations
        audit_after["observations"] = after_observations

    record(
        actor=actor,
        action="incoming_inspection.updated",
        target_type="incoming_inspection",
        target_id=inspection.id,
        company=inspection.company,
        store=inspection.store,
        before=audit_before,
        after=audit_after,
    )
    return inspection


@transaction.atomic
def submit_incoming_inspection(*, actor, inspection_id, expected_version):
    """`DRAFT` -> `SUBMITTED`. Requires at least one observation (the
    existing `InspectionObservation` structure/validation already
    guarantees every row has a non-blank `parameter_name` - this only
    checks that at least one such row exists) and that the source
    receipt line's parent `GoodsReceipt` is still `POSTED` (revalidated
    here, not just trusted from creation time - nothing prevents time
    passing, or another process cancelling the receipt, between draft
    creation and submission; no such path exists today, but the check
    costs nothing and matches this project's convention of revalidating
    at each real transition rather than only at creation, e.g.
    `issue_purchase_order`'s own revalidation of its source request).

    Locks the inspection row (`select_for_update()`) for the whole
    transaction before doing anything else - this is what coordinates
    submission against a concurrent `update_incoming_inspection` call on
    the same row: whichever transaction acquires the lock first commits,
    the second sees the first's result once it proceeds (a fresh
    `DRAFT`-check for update, or a fresh `expected_version` mismatch for
    either call if the caller's own stale version was read before the
    race began) - never a torn state where an edit lands on an
    already-submitted inspection or vice versa.

    Retry semantics mirror `submit_purchase_request` exactly: a call at
    the *current* version against an already-`SUBMITTED` inspection is an
    idempotent no-op (returns unchanged, no version bump, no new audit
    entry) - this does not protect a literal same-stale-version
    duplicate send (that still raises `Conflict` below, same as every
    other mutation in this project), only a well-behaved caller that
    refetches after its first submit succeeded and calls submit again
    with the now-current version.

    Once this actually transitions to `SUBMITTED`, the inspection and its
    observations become permanently read-only through
    `update_incoming_inspection`/`cancel_incoming_inspection` (both
    re-check `status == DRAFT` themselves, independently of this
    function). A correction/retest transition back to an editable state
    is deliberately not implemented here - see
    docs/incoming-qc-review-proposal.md.
    """
    inspection = (
        IncomingInspection.objects.select_for_update()
        .select_related("receipt_line__goods_receipt")
        .get(pk=inspection_id)
    )
    if inspection.version != expected_version:
        raise Conflict("This incoming inspection has changed since it was last read. Refetch and retry.")

    if inspection.status == IncomingInspection.Status.SUBMITTED:
        return inspection
    if inspection.status != IncomingInspection.Status.DRAFT:
        raise DjangoValidationError(
            {"detail": f"An incoming inspection with status '{inspection.status}' cannot be submitted."}
        )

    goods_receipt = inspection.receipt_line.goods_receipt
    if goods_receipt.status != GoodsReceipt.Status.POSTED:
        raise DjangoValidationError(
            {"detail": "The source goods receipt is no longer POSTED and this inspection cannot be submitted."}
        )

    if not inspection.observations.exists():
        raise DjangoValidationError(
            {"detail": "At least one observation is required to submit an incoming inspection."}
        )

    before = {"status": inspection.status}
    submitted_at = timezone.now()
    inspection.status = IncomingInspection.Status.SUBMITTED
    inspection.submitted_by = actor
    inspection.submitted_at = submitted_at
    inspection.version += 1
    inspection.save(update_fields=["status", "submitted_by", "submitted_at", "version", "updated_at"])

    record(
        actor=actor,
        action="incoming_inspection.submitted",
        target_type="incoming_inspection",
        target_id=inspection.id,
        company=inspection.company,
        store=inspection.store,
        before=before,
        after={
            "status": inspection.status,
            "submitted_by_id": actor.id,
            "submitted_at": submitted_at.isoformat(),
            "observations": _observation_snapshot_list(inspection),
        },
    )
    return inspection


@transaction.atomic
def cancel_incoming_inspection(*, actor, inspection_id, expected_version, reason):
    """`DRAFT` -> `CANCELLED` only. Requires a non-blank reason every
    time, including on an idempotent retry - mirrors
    cancel_goods_receipt's rule exactly. Cancelled inspections are
    permanently read-only through this app's API.

    Task 09B-3A: now that `SUBMITTED` exists as a third status, "not
    CANCELLED" no longer implies "DRAFT" - an explicit status check is
    required here (this function previously had none, silently relying
    on the two-status assumption; the same class of bug Task 08C-2 fixed
    in `cancel_purchase_order` once `ISSUED` was added there). A
    `SUBMITTED` inspection can never be cancelled through this function -
    submission is permanent pending a future correction/retest task.
    """
    reason = (reason or "").strip()
    if not reason:
        raise DjangoValidationError({"cancellation_reason": "A cancellation reason is required."})

    inspection = IncomingInspection.objects.select_for_update().get(pk=inspection_id)
    if inspection.version != expected_version:
        raise Conflict("This incoming inspection has changed since it was last read. Refetch and retry.")

    if inspection.status == IncomingInspection.Status.CANCELLED:
        if inspection.cancellation_reason == reason:
            return inspection
        raise Conflict(
            "This incoming inspection was already cancelled with a different reason. Refetch and review it."
        )
    if inspection.status != IncomingInspection.Status.DRAFT:
        raise DjangoValidationError(
            {"detail": f"An incoming inspection with status '{inspection.status}' cannot be cancelled."}
        )

    before = {"status": inspection.status}
    inspection.status = IncomingInspection.Status.CANCELLED
    inspection.cancelled_by = actor
    inspection.cancelled_at = timezone.now()
    inspection.cancellation_reason = reason
    inspection.version += 1
    inspection.save(
        update_fields=["status", "cancelled_by", "cancelled_at", "cancellation_reason", "version", "updated_at"]
    )

    record(
        actor=actor,
        action="incoming_inspection.cancelled",
        target_type="incoming_inspection",
        target_id=inspection.id,
        company=inspection.company,
        store=inspection.store,
        before=before,
        after={"status": inspection.status, "cancellation_reason": inspection.cancellation_reason},
    )
    return inspection


def eligible_receipt_lines_for_inspection(user, store):
    """`POSTED` GoodsReceiptLine rows at `store`, in companies `user` has
    active membership in - a bare membership check
    (apps.companies.services.active_companies_for_user), deliberately
    NOT gated on `purchase_orders.view` or any other purchasing
    permission: a QC user must never need purchasing-price access just
    to see what is eligible for inspection here (see
    apps.quality.views._check_company_membership's docstring). Excludes
    any line that already has a non-cancelled IncomingInspection -
    "eligible" means "can actually be used to create a new inspection
    right now," matching this app's one-active-inspection-per-line rule.
    """
    companies = active_companies_for_user(user)
    already_inspected = IncomingInspection.objects.exclude(status=IncomingInspection.Status.CANCELLED).values_list(
        "receipt_line_id", flat=True
    )
    return (
        GoodsReceiptLine.objects.filter(
            goods_receipt__store=store,
            goods_receipt__status=GoodsReceipt.Status.POSTED,
            goods_receipt__company__in=companies,
        )
        .exclude(pk__in=already_inspected)
        .select_related("goods_receipt", "goods_receipt__company", "material", "unit")
        .order_by("-goods_receipt__posted_at", "-id")
    )


# ---------------------------------------------------------------------------
# Material specifications (Task 09B-3B) - drafting/versioning foundation
# only. See apps.quality.models.MaterialSpecification's own docstring for
# the full scope boundary (no approval/publication/QC-integration here).
# ---------------------------------------------------------------------------

def _duplicate_specification_code_error():
    return Conflict("A material specification with this code already exists.")


def _specification_snapshot(specification):
    return {
        "material_id": specification.material_id,
        "code": specification.code,
        "name": specification.name,
        "description": specification.description,
    }


def _version_header_snapshot(version):
    return {
        "reference_document": version.reference_document,
        "notes": version.notes,
    }


def _test_snapshot_list(version):
    return [
        {
            "parameter_name": test.parameter_name,
            "method_reference": test.method_reference,
            "result_type": test.result_type,
            "unit_label": test.unit_label,
            "acceptance_criteria": test.acceptance_criteria,
        }
        for test in version.tests.order_by("line_number", "id")
    ]


def _validate_tests(tests_data):
    """Mirrors apps.quality.services._validate_observations exactly -
    the only hard requirements are a non-blank `parameter_name` and a
    valid `result_type` per row; `method_reference`/`unit_label`/
    `acceptance_criteria` may all be blank while drafting (this task
    explicitly allows an incomplete draft - see the model's own
    docstring for why no default/clinically-meaningful value is ever
    substituted here).
    """
    resolved = []
    for index, item in enumerate(tests_data, start=1):
        parameter_name = (item.get("parameter_name") or "").strip()
        if not parameter_name:
            raise DjangoValidationError({"tests": f"Test {index}: parameter_name is required."})
        result_type = item.get("result_type")
        if result_type not in SpecificationTest.ResultType.values:
            raise DjangoValidationError(
                {"tests": f"Test {index}: result_type must be one of {list(SpecificationTest.ResultType.values)}."}
            )
        resolved.append(
            {
                "line_number": index,
                "parameter_name": parameter_name,
                "method_reference": (item.get("method_reference") or "").strip(),
                "result_type": result_type,
                "unit_label": (item.get("unit_label") or "").strip(),
                "acceptance_criteria": (item.get("acceptance_criteria") or "").strip(),
            }
        )
    return resolved


def _create_tests(version, resolved_tests):
    SpecificationTest.objects.bulk_create(
        [SpecificationTest(version=version, **item) for item in resolved_tests]
    )


def _create_first_version(specification, actor):
    """Allocates revision 1, strictly empty (no reference_document/notes/
    tests) - always safe without a separate lock, since `specification`
    was just created inside the same transaction and no other
    transaction can reference its id yet.
    """
    version = MaterialSpecificationVersion(specification=specification, revision_number=1, created_by=actor)
    version.save()
    specification.latest_revision_number = 1
    specification.save(update_fields=["latest_revision_number"])
    return version


@transaction.atomic
def create_material_specification(*, actor, material_id, code, name, description=""):
    """Creates a `MaterialSpecification` and its revision-1 `DRAFT`
    `MaterialSpecificationVersion` atomically, in one transaction - if
    either half fails, neither is left behind. The first version is
    always strictly empty (no `reference_document`/`notes`/`tests`
    accepted here) - matching this task's own "initial *empty* draft
    version" wording exactly, and keeping test-row/version-metadata
    entry to exactly one place (`update_specification_version`), never
    duplicated into this endpoint too (see `create_specification_version`
    for the identical reasoning on every later version). `material` must
    be active (checked here, since this task has no later "submit"-style
    revalidation point the way `PurchaseRequest` does - there is nowhere
    else in this task's scope this would ever be re-checked).

    A duplicate `code` raises `IntegrityError` at the database's own
    unique constraint; translated to a `Conflict` (409) here rather than
    a plain `400`, since the natural remedy is "refetch/search for the
    existing one," the same reasoning `Conflict` is used for elsewhere in
    this project for a genuine identity collision (see
    apps.receiving.services's `idempotency_key` collision handling) -
    unlike `apps.suppliers.services.create_supplier`, which lets its
    view layer translate the same `IntegrityError` into a `400`
    (`_duplicate_supplier_code_error`); this task's own instruction to
    "validate... duplicate IDs... consistently" is read here as
    "consistently signal a real conflict as a conflict," not as binding
    this new endpoint to an older, narrower precedent.
    """
    material = get_object_or_404(Material, pk=material_id)
    if not material.is_active:
        raise DjangoValidationError({"material_id": f"Material '{material.code}' is inactive."})

    try:
        specification = MaterialSpecification(
            material=material, code=code, name=name, description=description, created_by=actor
        )
        specification.save()
    except IntegrityError as exc:
        raise _duplicate_specification_code_error() from exc

    version = _create_first_version(specification, actor)

    record(
        actor=actor,
        action="material_specification.created",
        target_type="material_specification",
        target_id=specification.id,
        after={
            **_specification_snapshot(specification),
            "first_version": {
                "revision_number": version.revision_number,
                **_version_header_snapshot(version),
                "tests": _test_snapshot_list(version),
            },
        },
    )
    return specification


@transaction.atomic
def update_material_specification(*, actor, specification_id, expected_version, data):
    """Metadata update - `name`/`description` only - requiring
    `expected_version` and a row lock, exactly like every other mutation
    in this project (Task 09B-3B.1: the original task explicitly
    required `expected_version` for updates; the first implementation
    wrongly exempted this row as unversioned master-data instead - see
    docs/backend-decisions.md, Task 09B-3B.1, for the correction).

    Locks the row (`select_for_update()`) and compares `expected_version`
    before reading anything else for comparison, same Conflict-on-
    mismatch rule as every other mutation in this project. A no-op PATCH
    (every supplied value already matches) does not increment `version`
    or write an audit entry. This lock is entirely independent of
    `create_specification_version`'s own lock on the *same row* for
    `latest_revision_number` allocation - both hold `select_for_update()`
    on this row, so Postgres serializes them (whichever transaction
    commits first is fully visible to the other before it proceeds), but
    they read/write disjoint field sets (`name`/`description`/`version`
    here vs. `latest_revision_number` there) and neither operation's
    `expected_version`/allocation depends on the other's outcome - a
    concurrent revision-creation never invalidates an in-flight metadata
    edit's `expected_version`, and vice versa. No lost-update risk exists
    between them for exactly that reason.
    """
    specification = MaterialSpecification.objects.select_for_update().get(pk=specification_id)
    if specification.version != expected_version:
        raise Conflict("This material specification has changed since it was last read. Refetch and retry.")

    before = _specification_snapshot(specification)
    changed = {field: value for field, value in data.items() if getattr(specification, field) != value}
    if not changed:
        return specification

    for field, value in changed.items():
        setattr(specification, field, value)

    after = _specification_snapshot(specification)
    if before == after:
        return specification

    specification.version += 1
    specification.save(update_fields=[*changed.keys(), "version", "updated_at"])

    record(
        actor=actor,
        action="material_specification.updated",
        target_type="material_specification",
        target_id=specification.id,
        before=before,
        after=after,
    )
    return specification


@transaction.atomic
def create_specification_version(*, actor, specification_id, reference_document="", notes=""):
    """Creates a new, empty `DRAFT` version - `revision_number` is
    allocated from `specification.latest_revision_number + 1` while the
    specification row is locked (`select_for_update()`), the same
    "lock the parent, read-modify-write its counter" shape
    `submit_purchase_request` already uses for `PurchaseRequest.
    current_round`. The database's own `unique_specification_version_
    revision` constraint is the backstop for a race that somehow slips
    past the lock, not the primary allocation mechanism. Test rows are
    deliberately never accepted here - "create a new empty draft
    version" and "edit a draft version's tests" are two separate
    operations in this task's own scope (see
    `update_specification_version` for the only place tests are ever
    written), so there is exactly one way to modify test rows, not two
    overlapping ones.

    Only ever writes `latest_revision_number` on the specification row -
    it never reads, compares, or increments `MaterialSpecification.
    version` (Task 09B-3B.1's metadata concurrency token), so allocating
    a new revision has no effect on, and is never blocked by, an
    in-flight metadata edit's `expected_version` - see
    `update_material_specification`'s own docstring for the full "why
    these two locks on the same row never race each other" reasoning.
    """
    specification = MaterialSpecification.objects.select_for_update().get(pk=specification_id)
    next_revision = specification.latest_revision_number + 1

    version = MaterialSpecificationVersion(
        specification=specification,
        revision_number=next_revision,
        reference_document=(reference_document or "").strip(),
        notes=(notes or "").strip(),
        created_by=actor,
    )
    version.save()
    specification.latest_revision_number = next_revision
    specification.save(update_fields=["latest_revision_number"])

    record(
        actor=actor,
        action="material_specification_version.created",
        target_type="material_specification_version",
        target_id=version.id,
        after={"revision_number": version.revision_number, **_version_header_snapshot(version), "tests": []},
    )
    return version


@transaction.atomic
def update_specification_version(*, actor, version_id, expected_version, data):
    """`data` may contain `reference_document`/`notes`/`tests`, each
    independently optional (omitted = unchanged). `tests`, if present at
    all - even as an empty list - fully replaces the existing test-row
    set, mirroring `update_incoming_inspection`'s `observations`
    convention exactly (the same full-replace shape, not an
    add/remove-one-row API, per this task's own "avoid multiple
    overlapping ways to modify the same test rows" instruction).

    `DRAFT` only (`400` otherwise) - explicitly checked even though no
    other status is reachable yet in this task, matching the model's own
    docstring rationale (the `cancel_incoming_inspection` lesson from
    Task 09B-3A). Requires the row lock (`select_for_update`, on the
    *version*, not the specification - editing one version's tests never
    needs to serialize against another version being created) and the
    caller's `expected_version` to match before anything is read for
    comparison - same Conflict-on-mismatch rule as every other mutation
    in this project. A no-op PATCH (every supplied value already
    matches) does not increment `version` or write an audit entry.
    """
    version = MaterialSpecificationVersion.objects.select_for_update().get(pk=version_id)
    if version.version != expected_version:
        raise Conflict("This specification version has changed since it was last read. Refetch and retry.")
    if version.status != MaterialSpecificationVersion.Status.DRAFT:
        raise DjangoValidationError(
            {"detail": f"A specification version with status '{version.status}' cannot be edited."}
        )

    before_header = _version_header_snapshot(version)
    header_changed = False
    if "reference_document" in data and data["reference_document"] != version.reference_document:
        version.reference_document = data["reference_document"]
        header_changed = True
    if "notes" in data and data["notes"] != version.notes:
        version.notes = data["notes"]
        header_changed = True

    tests_changed = False
    before_tests = None
    after_tests = None
    if "tests" in data:
        before_tests = _test_snapshot_list(version)
        resolved = _validate_tests(data["tests"])
        after_tests = [
            {key: item[key] for key in ("parameter_name", "method_reference", "result_type", "unit_label", "acceptance_criteria")}
            for item in resolved
        ]
        if after_tests != before_tests:
            tests_changed = True
            version.tests.all().delete()
            _create_tests(version, resolved)

    if not header_changed and not tests_changed:
        return version

    version.version += 1
    version.save(update_fields=["reference_document", "notes", "version", "updated_at"])

    audit_before = dict(before_header)
    audit_after = _version_header_snapshot(version)
    if tests_changed:
        audit_before["tests"] = before_tests
        audit_after["tests"] = after_tests

    record(
        actor=actor,
        action="material_specification_version.updated",
        target_type="material_specification_version",
        target_id=version.id,
        before=audit_before,
        after=audit_after,
    )
    return version
