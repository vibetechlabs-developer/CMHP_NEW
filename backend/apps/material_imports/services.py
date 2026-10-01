"""Task 14C: CSV import for brand-new `Material` identities into the
SHARED catalog - a validated preview followed by an explicit, all-or-
nothing commit. Deliberately a SEPARATE, freshly written implementation
from `apps.product_imports`/`apps.formula_imports` (Tasks 14A/14B) - the
task's own instruction was explicit that a shared "import engine" refactor
was out of scope, and this app has no company/store context at all (the
catalog is shared - see `apps.material_imports.models` for the full
reasoning).

Neither `create_import_preview` nor `commit_import` has any permission
awareness of its own - `actor` is an already-access-checked
(`IsActiveSuperuser`) value by the time either is called (see `apps.
material_imports.views`).
"""

import csv
import hashlib
import io
from datetime import timedelta

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.audit.services import record
from apps.catalog.models import Material, UnitOfMeasure
from apps.common.errors import Conflict
from apps.companies.models import normalize_code
from apps.material_imports.models import MaterialImportBatch, MaterialImportRow

# Bounded limits - documented WORKING CHOICES, not client-confirmed
# policy, sized generously above the task's own "at least 2000 materials"
# requirement.
MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024  # 5 MiB
MAX_ROWS = 5000
MAX_HEADER_COLUMNS = 20
PREVIEW_TTL = timedelta(hours=1)

SUPPORTED_COLUMNS = ("code", "name", "material_type", "base_unit_code", "description")
REQUIRED_COLUMNS = ("code", "name", "material_type", "base_unit_code")

# Mirror Material's own field lengths exactly (apps.catalog.models).
MAX_CODE_LEN = 32
MAX_NAME_LEN = 255
MAX_BASE_UNIT_CODE_LEN = 20
# Material.description is an unbounded TextField; this import still
# bounds it - the same WORKING CHOICE apps.product_imports/apps.
# formula_imports already make for their own free-text columns.
MAX_DESCRIPTION_LEN = 2000

# The actual, real Material.Kind values - never an invented alias like
# "RAW"/"PACKAGING". Case/whitespace is normalized (upper + strip) before
# comparison, since a CSV column's casing is a formatting detail, not an
# inference about what the material actually is - the task's own "do not
# infer type from the material name" rule is about not GUESSING the type
# from an unrelated column, not about rejecting "raw_material" for being
# lower-case.
SUPPORTED_MATERIAL_TYPES = tuple(Material.Kind.values)


def _file_error(code, message):
    return {"code": code, "message": message}


def _row_error(column, message):
    return {"column": column, "message": message}


def _decode(raw_bytes):
    try:
        return raw_bytes.decode("utf-8-sig"), []
    except UnicodeDecodeError:
        return None, [_file_error("ENCODING_ERROR", "File is not valid UTF-8 (with or without a BOM).")]


def _parse_header(header_row):
    errors = []
    if len(header_row) > MAX_HEADER_COLUMNS:
        errors.append(
            _file_error("TOO_MANY_COLUMNS", f"Header has {len(header_row)} columns; at most {MAX_HEADER_COLUMNS} are allowed.")
        )
        return None, errors

    trimmed = [cell.strip() for cell in header_row]
    seen = {}
    for name in trimmed:
        seen[name] = seen.get(name, 0) + 1
    duplicates = sorted(name for name, count in seen.items() if count > 1)
    if duplicates:
        errors.append(_file_error("DUPLICATE_HEADER", f"Duplicate column(s) in header: {', '.join(duplicates)}."))

    unsupported = sorted(set(trimmed) - set(SUPPORTED_COLUMNS))
    if unsupported:
        errors.append(
            _file_error(
                "UNSUPPORTED_COLUMN",
                f"Unsupported column(s): {', '.join(unsupported)}. Supported columns are: {', '.join(SUPPORTED_COLUMNS)}.",
            )
        )

    missing = [name for name in REQUIRED_COLUMNS if name not in trimmed]
    if missing:
        errors.append(_file_error("MISSING_REQUIRED_COLUMN", f"Missing required column(s): {', '.join(missing)}."))

    if errors:
        return None, errors
    return {name: index for index, name in enumerate(trimmed)}, []


def _cell(raw_row, column_index, column):
    index = column_index.get(column)
    if index is None or index >= len(raw_row):
        return ""
    return raw_row[index]


def _parse_data_row(row_number, raw_row, column_index, header_width):
    """Field-level validation only - no database queries."""
    errors = []
    if len(raw_row) != header_width:
        errors.append(_row_error(None, f"Row has {len(raw_row)} column(s); the header has {header_width}."))

    code = normalize_code(_cell(raw_row, column_index, "code"))
    if not code:
        errors.append(_row_error("code", "Code is required."))
    elif len(code) > MAX_CODE_LEN:
        errors.append(_row_error("code", f"Code exceeds {MAX_CODE_LEN} characters."))

    name = _cell(raw_row, column_index, "name").strip()
    if not name:
        errors.append(_row_error("name", "Name is required."))
    elif len(name) > MAX_NAME_LEN:
        errors.append(_row_error("name", f"Name exceeds {MAX_NAME_LEN} characters."))

    material_type = _cell(raw_row, column_index, "material_type").strip().upper()
    if not material_type:
        errors.append(_row_error("material_type", "Material type is required."))
    elif material_type not in SUPPORTED_MATERIAL_TYPES:
        errors.append(
            _row_error(
                "material_type",
                f"Material type must be one of {list(SUPPORTED_MATERIAL_TYPES)} (got '{material_type}').",
            )
        )

    base_unit_code = normalize_code(_cell(raw_row, column_index, "base_unit_code"))
    if not base_unit_code:
        errors.append(_row_error("base_unit_code", "Base unit code is required."))
    elif len(base_unit_code) > MAX_BASE_UNIT_CODE_LEN:
        errors.append(_row_error("base_unit_code", f"Base unit code exceeds {MAX_BASE_UNIT_CODE_LEN} characters."))

    description = _cell(raw_row, column_index, "description").strip()
    if len(description) > MAX_DESCRIPTION_LEN:
        errors.append(_row_error("description", f"Description exceeds {MAX_DESCRIPTION_LEN} characters."))

    # Stored values are truncated to each staging COLUMN's own width
    # (identical to the real Material field it mirrors) - the ERROR
    # above already used the TRUE, untruncated length, so an over-length
    # cell is still correctly reported; this truncation exists only so
    # persisting the (already-invalid) staging row itself can never raise
    # an unhandled database error. `material_type` has no length error of
    # its own (an unsupported value is already rejected on other
    # grounds), but is truncated too, defensively, for the same reason.
    return MaterialImportRow(
        row_number=row_number,
        code=code[:MAX_CODE_LEN],
        name=name[:MAX_NAME_LEN],
        material_type=material_type[:20],
        base_unit_code=base_unit_code[:MAX_BASE_UNIT_CODE_LEN],
        description=description[:MAX_DESCRIPTION_LEN],
        is_valid=not errors,
        errors=errors,
    )


def parse_csv(raw_bytes):
    """Pure function, no database access: bytes in, `(rows, file_errors)`
    out. `rows` is a list of unsaved `MaterialImportRow` instances - fully
    blank lines are skipped and never counted as a row.
    """
    if len(raw_bytes) > MAX_FILE_SIZE_BYTES:
        return [], [_file_error("FILE_TOO_LARGE", f"File exceeds the {MAX_FILE_SIZE_BYTES}-byte limit.")]

    text, errors = _decode(raw_bytes)
    if text is None:
        return [], errors

    reader = csv.reader(io.StringIO(text))
    try:
        header_row = next(reader)
    except StopIteration:
        return [], [_file_error("EMPTY_FILE", "File has no header row.")]

    column_index, header_errors = _parse_header(header_row)
    if header_errors:
        return [], header_errors

    rows = []
    row_number = 0
    for raw_row in reader:
        if not raw_row or all(not cell.strip() for cell in raw_row):
            continue
        row_number += 1
        if row_number > MAX_ROWS:
            errors.append(_file_error("TOO_MANY_ROWS", f"File has more than {MAX_ROWS} data rows."))
            break
        rows.append(_parse_data_row(row_number, raw_row, column_index, len(header_row)))
    return rows, errors


def _apply_file_wide_checks(rows):
    """The only DB-touching step of preview creation - exactly TWO
    queries regardless of row count: existing `Material` codes (no
    company scoping - the catalog is shared) and matching `UnitOfMeasure`
    codes. Mutates `rows` in place.
    """
    codes_seen = {}
    for row in rows:
        if row.code:
            codes_seen.setdefault(row.code, []).append(row.row_number)
    duplicate_codes = {code: numbers for code, numbers in codes_seen.items() if len(numbers) > 1}

    all_codes = [row.code for row in rows if row.code]
    existing_codes = set(Material.objects.filter(code__in=all_codes).values_list("code", flat=True)) if all_codes else set()

    unit_codes = {row.base_unit_code for row in rows if row.base_unit_code}
    units_by_code = (
        {u.code: u for u in UnitOfMeasure.objects.filter(code__in=unit_codes).only("id", "code", "is_active")}
        if unit_codes else {}
    )

    for row in rows:
        if row.code in duplicate_codes:
            other_rows = [n for n in duplicate_codes[row.code] if n != row.row_number]
            row.errors.append(
                _row_error("code", f"Duplicate code within this file (also on row(s) {', '.join(map(str, other_rows))}).")
            )
        if row.code and row.code in existing_codes:
            row.errors.append(_row_error("code", f"Code '{row.code}' is already used by an existing material."))

        if row.base_unit_code:
            unit = units_by_code.get(row.base_unit_code)
            if unit is None:
                row.errors.append(_row_error("base_unit_code", f"Unit '{row.base_unit_code}' does not exist."))
            elif not unit.is_active:
                row.errors.append(_row_error("base_unit_code", f"Unit '{row.base_unit_code}' is inactive."))
            else:
                row.resolved_base_unit_id = unit.id

        row.is_valid = not row.errors


@transaction.atomic
def create_import_preview(*, actor, raw_bytes, source_filename):
    """Parse `raw_bytes` (never persisted - see the module docstring),
    validate it completely, and persist ONLY the batch summary and the
    normalized rows. Always succeeds and returns a batch, even for a
    completely unparseable upload.
    """
    checksum = hashlib.sha256(raw_bytes).hexdigest()
    rows, file_errors = parse_csv(raw_bytes)
    if rows:
        _apply_file_wide_checks(rows)

    valid_rows = sum(1 for row in rows if row.is_valid)
    total_rows = len(rows)
    invalid_rows = total_rows - valid_rows
    eligible_for_commit = bool(total_rows) and invalid_rows == 0 and not file_errors

    batch = MaterialImportBatch(
        created_by=actor,
        status=MaterialImportBatch.Status.PREVIEWED,
        source_filename=(source_filename or "")[:255],
        source_checksum=checksum,
        total_rows=total_rows,
        valid_rows=valid_rows,
        invalid_rows=invalid_rows,
        eligible_for_commit=eligible_for_commit,
        file_errors=file_errors,
        expires_at=timezone.now() + PREVIEW_TTL,
    )
    batch.save()

    for row in rows:
        row.batch = batch
    MaterialImportRow.objects.bulk_create(rows)

    record(
        actor=actor,
        action="material_import.previewed",
        target_type="material_import_batch",
        target_id=batch.id,
        after={
            "source_filename": batch.source_filename,
            "source_checksum": checksum,
            "total_rows": total_rows,
            "valid_rows": valid_rows,
            "invalid_rows": invalid_rows,
            "eligible_for_commit": eligible_for_commit,
            "file_errors": file_errors,
        },
    )
    return batch


def _build_material(actor, row, base_unit):
    material = Material(
        code=row.code,
        name=row.name,
        description=row.description,
        kind=row.material_type,
        base_unit=base_unit,
        category=None,
    )
    # Reuses Material's OWN validation/normalization (apps.catalog.
    # models.Material.clean()) in memory, no query - the actual
    # `base_unit.is_active` check is deliberately NOT in clean() (see that
    # model's own docstring - it is a service-layer rule) and is instead
    # done explicitly, under lock, by the caller before this is built.
    material.clean()
    return material


@transaction.atomic
def commit_import(*, actor, batch_id, expected_version):
    """Create every row's `Material`, all-or-nothing, and mark the batch
    `COMMITTED` - in the SAME transaction, so an audit-write failure
    rolls both back together.

    CONCURRENCY: identical idempotent-repeat design to `apps.
    product_imports.services.commit_import` (Task 14A) - `version` never
    changes on this model; the guard against a double commit is the row
    lock plus `status` itself.
    """
    batch = MaterialImportBatch.objects.select_for_update().get(pk=batch_id)
    if batch.version != expected_version:
        raise Conflict("This import batch's concurrency token is invalid. Refetch and retry.")

    if batch.status == MaterialImportBatch.Status.COMMITTED:
        return batch, list(batch.created_material_ids or []), False

    if timezone.now() > batch.expires_at:
        raise DjangoValidationError({"detail": "This import preview has expired. Create a new preview and try again."})
    if not batch.eligible_for_commit:
        raise DjangoValidationError({"detail": "This import preview contains invalid rows and cannot be committed."})

    rows = list(batch.rows.order_by("row_number"))
    if not rows:
        raise DjangoValidationError({"detail": "This import preview has no rows to commit."})

    # --- Revalidate current database state (Task 14C §5) ----------------
    codes = [row.code for row in rows]
    conflicting_codes = sorted(Material.objects.filter(code__in=codes).values_list("code", flat=True))
    if conflicting_codes:
        raise DjangoValidationError(
            {
                "detail": (
                    f"{len(conflicting_codes)} code(s) were created by someone else since this preview was "
                    "generated. Create a new preview and try again."
                ),
                "codes": conflicting_codes[:50],
            }
        )

    unit_ids = sorted({row.resolved_base_unit_id for row in rows if row.resolved_base_unit_id})
    locked_units = {
        u.id: u for u in UnitOfMeasure.objects.select_for_update(no_key=True).filter(pk__in=unit_ids).order_by("pk")
    }
    missing_units = set(unit_ids) - set(locked_units.keys())
    if missing_units:
        raise DjangoValidationError({"detail": f"{len(missing_units)} referenced unit(s) no longer exist. Create a new preview."})
    deactivated_units = sorted(u.code for u in locked_units.values() if not u.is_active)
    if deactivated_units:
        raise DjangoValidationError(
            {
                "detail": (
                    f"Unit(s) {', '.join(deactivated_units)} became inactive since this preview was generated. "
                    "Create a new preview and try again."
                )
            }
        )

    # --- Create -----------------------------------------------------
    material_objs = [_build_material(actor, row, locked_units[row.resolved_base_unit_id]) for row in rows]
    try:
        with transaction.atomic():
            created = Material.objects.bulk_create(material_objs)
    except IntegrityError as exc:
        raise Conflict(
            "One or more codes were created by someone else at the exact moment of commit. "
            "Create a new preview and try again."
        ) from exc

    created_materials = list(Material.objects.filter(code__in=codes))
    created_ids = [m.id for m in created_materials]

    batch.status = MaterialImportBatch.Status.COMMITTED
    batch.committed_at = timezone.now()
    batch.committed_by = actor
    batch.created_material_ids = created_ids
    batch.save(update_fields=["status", "committed_at", "committed_by", "created_material_ids"])

    record(
        actor=actor,
        action="material_import.committed",
        target_type="material_import_batch",
        target_id=batch.id,
        after={
            "created_count": len(created_ids),
            "source_checksum": batch.source_checksum,
            "created_material_ids_sample": created_ids[:50],
        },
    )
    return batch, created_ids, True
