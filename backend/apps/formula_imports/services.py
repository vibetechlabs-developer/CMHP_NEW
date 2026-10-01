"""Task 14B: CSV import for brand-new `Formula` identities (each with its
own `DRAFT` revision 1 and material lines) - a validated preview followed
by an explicit, all-or-nothing commit. Deliberately a SEPARATE, freshly
written implementation from `apps.product_imports.services` (Task 14A) -
the task's own instruction was explicit that a shared "import engine"
refactor was out of scope, and the actual rules genuinely differ (a
two-level ROW/GROUP structure; formula-specific validation; contributor
tracking).

Neither `create_import_preview` nor `commit_import` has any permission
awareness of its own - matching every other service in this project,
`company`/`actor` are already-resolved, already-access-checked values by
the time either is called (see `apps.formula_imports.views`).
"""

import csv
import hashlib
import io
from datetime import timedelta
from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.audit.services import record
from apps.catalog.models import Material, UnitOfMeasure
from apps.common.errors import Conflict
from apps.companies.models import normalize_code
from apps.formula_imports.models import FormulaImportBatch, FormulaImportGroup, FormulaImportLine
from apps.formulas.models import Formula, FormulaLine, FormulaRevision, FormulaRevisionContributor
from apps.products.models import Product

# Bounded limits - documented WORKING CHOICES, not client-confirmed
# policy. TWO INDEPENDENT bounds for rows and groups: a file's row count
# says nothing about how many complete formulas it contains (a 5000-row
# file could be 5000 one-line formulas, or 25 formulas of 200 lines each)
# - see FormulaImportBatch's own docstring. A catalog needing MORE than
# these bounds in one go should be split into several sequential CSV
# files, each its own preview + commit - there is no chunking within one
# request.
MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024  # 5 MiB
MAX_ROWS = 5000  # material-line rows, total
MAX_GROUPS = 1000  # distinct formulas
MAX_LINES_PER_GROUP = 200  # mirrors apps.quotations.serializers._MAX_LINES's own bounded-line-count convention
MAX_HEADER_COLUMNS = 20
PREVIEW_TTL = timedelta(hours=1)

SUPPORTED_COLUMNS = (
    "formula_code", "formula_name", "product_code", "base_output_quantity", "output_uom_code",
    "material_code", "material_quantity", "formula_notes", "revision_notes",
)
REQUIRED_COLUMNS = (
    "formula_code", "formula_name", "product_code", "base_output_quantity", "output_uom_code",
    "material_code", "material_quantity",
)
# formula_notes/revision_notes are the only two optional columns - both
# map to a `blank=True` field on Formula/FormulaRevision respectively.

# Mirror the real model field lengths exactly (apps.formulas.models).
MAX_FORMULA_CODE_LEN = 32
MAX_FORMULA_NAME_LEN = 255
MAX_PRODUCT_CODE_LEN = 32
MAX_OUTPUT_UOM_CODE_LEN = 20
MAX_MATERIAL_CODE_LEN = 32
MAX_NOTES_LEN = 2000
QUANTITY_MAX_DECIMAL_PLACES = 3
QUANTITY_MAX_INTEGER_DIGITS = 11

_HEADER_STRING_FIELDS = ("formula_name", "product_code", "output_uom_code", "formula_notes", "revision_notes")


def _file_error(code, message):
    return {"code": code, "message": message}


def _group_error(column, message):
    return {"column": column, "message": message}


def _line_error(column, message):
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


def _parse_quantity(raw_text, field):
    """Returns `(Decimal value, None)` or `(None, error_message)`. Same
    shape of rule every quantity field in this project follows (see e.g.
    apps.batch_plans.validation.validate_quantity_precision).
    """
    text = (raw_text or "").strip()
    if not text:
        return None, f"{field} is required."
    try:
        value = Decimal(text)
    except Exception:
        return None, f"{field} must be a valid number."
    if value <= 0:
        return None, f"{field} must be greater than zero."
    as_text = format(value, "f")
    integer_part, _, fraction_part = as_text.partition(".")
    if len(fraction_part) > QUANTITY_MAX_DECIMAL_PLACES:
        return None, f"At most {QUANTITY_MAX_DECIMAL_PLACES} decimal places are allowed for {field}."
    if len(integer_part.lstrip("0") or "0") > QUANTITY_MAX_INTEGER_DIGITS:
        return None, f"At most {QUANTITY_MAX_INTEGER_DIGITS} integer digits are allowed for {field}."
    return value, None


def _parse_data_row(file_row_number, raw_row, column_index, header_width):
    """Field-level validation only - no database queries. Every value is
    already normalized (code fields upper-cased/trimmed via
    `normalize_code`, text fields stripped) so later group-consistency
    comparison is a plain equality check, and every DB lookup afterward
    queries by the exact stored form.
    """
    errors = []
    if len(raw_row) != header_width:
        errors.append(_line_error(None, f"Row has {len(raw_row)} column(s); the header has {header_width}."))

    formula_code = normalize_code(_cell(raw_row, column_index, "formula_code"))
    if not formula_code:
        errors.append(_line_error("formula_code", "Formula code is required."))
    elif len(formula_code) > MAX_FORMULA_CODE_LEN:
        errors.append(_line_error("formula_code", f"Formula code exceeds {MAX_FORMULA_CODE_LEN} characters."))

    formula_name = _cell(raw_row, column_index, "formula_name").strip()
    if not formula_name:
        errors.append(_line_error("formula_name", "Formula name is required."))
    elif len(formula_name) > MAX_FORMULA_NAME_LEN:
        errors.append(_line_error("formula_name", f"Formula name exceeds {MAX_FORMULA_NAME_LEN} characters."))

    product_code = normalize_code(_cell(raw_row, column_index, "product_code"))
    if not product_code:
        errors.append(_line_error("product_code", "Product code is required."))
    elif len(product_code) > MAX_PRODUCT_CODE_LEN:
        errors.append(_line_error("product_code", f"Product code exceeds {MAX_PRODUCT_CODE_LEN} characters."))

    base_output_quantity, boq_err = _parse_quantity(
        _cell(raw_row, column_index, "base_output_quantity"), "base_output_quantity"
    )
    if boq_err:
        errors.append(_line_error("base_output_quantity", boq_err))

    output_uom_code = normalize_code(_cell(raw_row, column_index, "output_uom_code"))
    if not output_uom_code:
        errors.append(_line_error("output_uom_code", "Output unit code is required."))
    elif len(output_uom_code) > MAX_OUTPUT_UOM_CODE_LEN:
        errors.append(_line_error("output_uom_code", f"Output unit code exceeds {MAX_OUTPUT_UOM_CODE_LEN} characters."))

    material_code = normalize_code(_cell(raw_row, column_index, "material_code"))
    if not material_code:
        errors.append(_line_error("material_code", "Material code is required."))
    elif len(material_code) > MAX_MATERIAL_CODE_LEN:
        errors.append(_line_error("material_code", f"Material code exceeds {MAX_MATERIAL_CODE_LEN} characters."))

    material_quantity, mq_err = _parse_quantity(
        _cell(raw_row, column_index, "material_quantity"), "material_quantity"
    )
    if mq_err:
        errors.append(_line_error("material_quantity", mq_err))

    formula_notes = _cell(raw_row, column_index, "formula_notes").strip()
    if len(formula_notes) > MAX_NOTES_LEN:
        errors.append(_line_error("formula_notes", f"Formula notes exceed {MAX_NOTES_LEN} characters."))

    revision_notes = _cell(raw_row, column_index, "revision_notes").strip()
    if len(revision_notes) > MAX_NOTES_LEN:
        errors.append(_line_error("revision_notes", f"Revision notes exceed {MAX_NOTES_LEN} characters."))

    return {
        "file_row_number": file_row_number,
        "formula_code": formula_code,
        "formula_name": formula_name,
        "product_code": product_code,
        "base_output_quantity": base_output_quantity,
        "output_uom_code": output_uom_code,
        "material_code": material_code,
        "material_quantity": material_quantity,
        "formula_notes": formula_notes,
        "revision_notes": revision_notes,
        "line_errors": errors,
    }


def parse_formula_csv(raw_bytes):
    """Pure function, no database access: bytes in, `(parsed_rows,
    file_errors)` out. `parsed_rows` is a list of plain dicts (see
    `_parse_data_row`) - fully blank lines are skipped and never counted.
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


def _group_rows(parsed_rows):
    """Groups rows by (already-normalized) `formula_code`, preserving the
    order each code FIRST appears in - never sorted, never re-ordered.
    Rows for one code may be interleaved with another's in the file; this
    still groups them correctly regardless of contiguity.
    """
    groups_by_code = {}
    order = []
    for row in parsed_rows:
        code = row["formula_code"]
        if code not in groups_by_code:
            groups_by_code[code] = {"formula_code": code, "rows": []}
            order.append(code)
        groups_by_code[code]["rows"].append(row)

    groups = []
    for index, code in enumerate(order, start=1):
        group = groups_by_code[code]
        group["group_number"] = index
        groups.append(group)
    return groups


def _finalize_group_header(group):
    """Snapshots the group's header fields from its FIRST row (for
    display only - see the model's own docstring) and records any
    disagreement across the group's rows as a group-level error, naming
    the field and up to 5 example differing values. Comparing already-
    normalized `Decimal`s (not strings) means "100" and "100.000" are
    correctly treated as the SAME value, never a false conflict.
    """
    rows = group["rows"]
    first = rows[0]
    for field in (*_HEADER_STRING_FIELDS, "base_output_quantity"):
        group[field] = first[field]

    errors = []
    for field in _HEADER_STRING_FIELDS:
        values = {row[field] for row in rows}
        if len(values) > 1:
            errors.append(
                _group_error(field, f"Conflicting {field} values across this formula's rows: {sorted(values)[:5]}")
            )
    boq_values = {row["base_output_quantity"] for row in rows if row["base_output_quantity"] is not None}
    if len(boq_values) > 1:
        errors.append(
            _group_error(
                "base_output_quantity",
                f"Conflicting base_output_quantity values across this formula's rows: {sorted(str(v) for v in boq_values)[:5]}",
            )
        )
    group["header_errors"] = errors


def _resolve_groups(groups, company):
    """The only DB-touching step of preview creation: exactly FOUR
    queries regardless of row/group count (never one per row) - existing
    `Formula` codes, `Product` codes, `UnitOfMeasure` codes, and
    `Material` codes, each resolved with one `code__in=` lookup. Mutates
    `groups` (and each group's `rows`) in place.
    """
    formula_codes = [g["formula_code"] for g in groups if g["formula_code"]]
    existing_formula_codes = (
        set(Formula.objects.filter(company=company, code__in=formula_codes).values_list("code", flat=True))
        if formula_codes else set()
    )

    product_codes = {g["product_code"] for g in groups if g["product_code"]}
    products = (
        {p.code: p for p in Product.objects.filter(company=company, code__in=product_codes).select_related("sales_uom")}
        if product_codes else {}
    )

    uom_codes = {g["output_uom_code"] for g in groups if g["output_uom_code"]}
    units = {u.code: u for u in UnitOfMeasure.objects.filter(code__in=uom_codes)} if uom_codes else {}

    material_codes = {row["material_code"] for g in groups for row in g["rows"] if row["material_code"]}
    materials = (
        {m.code: m for m in Material.objects.filter(code__in=material_codes).select_related("base_unit")}
        if material_codes else {}
    )

    for group in groups:
        errors = list(group["header_errors"])

        if group["formula_code"] and group["formula_code"] in existing_formula_codes:
            errors.append(
                _group_error("formula_code", f"Formula code '{group['formula_code']}' already exists for this company.")
            )

        group["resolved_product_id"] = None
        product = products.get(group["product_code"]) if group["product_code"] else None
        if group["product_code"] and product is None:
            errors.append(_group_error("product_code", f"Product '{group['product_code']}' does not exist in this company."))
        elif product is not None:
            if not product.is_active:
                errors.append(_group_error("product_code", f"Product '{product.code}' is inactive."))
            elif not product.sales_uom.is_active:
                errors.append(
                    _group_error(
                        "product_code",
                        f"Product '{product.code}''s own sales unit '{product.sales_uom.code}' is inactive.",
                    )
                )
            else:
                group["resolved_product_id"] = product.id

        group["resolved_output_uom_id"] = None
        output_unit = units.get(group["output_uom_code"]) if group["output_uom_code"] else None
        if group["output_uom_code"] and output_unit is None:
            errors.append(_group_error("output_uom_code", f"Unit '{group['output_uom_code']}' does not exist."))
        elif output_unit is not None:
            if not output_unit.is_active:
                errors.append(_group_error("output_uom_code", f"Unit '{output_unit.code}' is inactive."))
            else:
                group["resolved_output_uom_id"] = output_unit.id

        if (
            output_unit is not None
            and group["resolved_output_uom_id"] is not None
            and group["base_output_quantity"] is not None
            and output_unit.dimension == UnitOfMeasure.Dimension.COUNT
            and group["base_output_quantity"] % 1 != 0
        ):
            errors.append(
                _group_error("base_output_quantity", f"Whole numbers are required for {output_unit.code} (COUNT unit).")
            )

        if len(group["rows"]) > MAX_LINES_PER_GROUP:
            errors.append(
                _group_error(None, f"This formula has {len(group['rows'])} lines; at most {MAX_LINES_PER_GROUP} are allowed.")
            )

        for row in group["rows"]:
            line_errors = list(row["line_errors"])
            resolved_material_id = None
            material = materials.get(row["material_code"]) if row["material_code"] else None
            if row["material_code"] and material is None:
                line_errors.append(_line_error("material_code", f"Material '{row['material_code']}' does not exist."))
            elif material is not None:
                if not material.is_active:
                    line_errors.append(_line_error("material_code", f"Material '{material.code}' is inactive."))
                elif not material.base_unit.is_active:
                    line_errors.append(
                        _line_error(
                            "material_code",
                            f"Unit '{material.base_unit.code}' of material '{material.code}' is inactive.",
                        )
                    )
                else:
                    resolved_material_id = material.id
                    if (
                        material.base_unit.dimension == UnitOfMeasure.Dimension.COUNT
                        and row["material_quantity"] is not None
                        and row["material_quantity"] % 1 != 0
                    ):
                        line_errors.append(
                            _line_error(
                                "material_quantity",
                                f"Whole numbers are required for {material.base_unit.code} (COUNT unit).",
                            )
                        )
            row["resolved_material_id"] = resolved_material_id
            row["line_errors"] = line_errors

        group["errors"] = errors
        group["is_valid"] = not errors and all(not row["line_errors"] for row in group["rows"])


@transaction.atomic
def create_import_preview(*, actor, company, raw_bytes, source_filename):
    """Parse, group, and validate `raw_bytes` completely, in memory
    (never persisted - see the module docstring), then persist ONLY the
    batch summary, groups and lines. Never creates a `Formula`. Always
    succeeds and returns a batch, even for a completely unparseable
    upload (`file_errors` explains why, `eligible_for_commit` is `false`).
    """
    checksum = hashlib.sha256(raw_bytes).hexdigest()
    parsed_rows, file_errors = parse_formula_csv(raw_bytes)

    groups = []
    if parsed_rows:
        groups = _group_rows(parsed_rows)
        if len(groups) > MAX_GROUPS:
            # Still bounded and reported clearly, but no group/row detail
            # is computed for an already-oversized file.
            file_errors = file_errors + [
                _file_error(
                    "TOO_MANY_GROUPS",
                    f"File has {len(groups)} distinct formula_code groups; at most {MAX_GROUPS} are allowed.",
                )
            ]
            groups = []
        else:
            # Group/row validation still runs even when a file-level error
            # already exists (e.g. TOO_MANY_ROWS truncated the file) - the
            # same "helpful partial feedback" choice apps.product_imports
            # makes; eligible_for_commit is forced false by file_errors
            # regardless (see below).
            for group in groups:
                _finalize_group_header(group)
            _resolve_groups(groups, company)

    total_rows = len(parsed_rows)
    valid_rows = sum(1 for row in parsed_rows if not row["line_errors"])
    invalid_rows = total_rows - valid_rows
    total_groups = len(groups)
    valid_groups = sum(1 for g in groups if g["is_valid"])
    invalid_groups = total_groups - valid_groups
    eligible_for_commit = bool(total_groups) and invalid_groups == 0 and not file_errors

    batch = FormulaImportBatch(
        company=company,
        created_by=actor,
        status=FormulaImportBatch.Status.PREVIEWED,
        source_filename=(source_filename or "")[:255],
        source_checksum=checksum,
        total_rows=total_rows,
        valid_rows=valid_rows,
        invalid_rows=invalid_rows,
        total_groups=total_groups,
        valid_groups=valid_groups,
        invalid_groups=invalid_groups,
        eligible_for_commit=eligible_for_commit,
        file_errors=file_errors,
        expires_at=timezone.now() + PREVIEW_TTL,
    )
    batch.save()

    # Stored string values are truncated to each staging COLUMN's own
    # width (identical to the real Formula/FormulaRevision field it
    # mirrors) - the ERRORS already collected above used the TRUE,
    # untruncated length/value, so an over-length cell is still correctly
    # reported; this truncation exists only so persisting the (already-
    # invalid) staging row itself can never raise an unhandled database
    # error - see docs/backend-decisions.md, Task 14C, for the bug this
    # truncation pattern was originally found and fixed for.
    group_objs = [
        FormulaImportGroup(
            batch=batch,
            group_number=group["group_number"],
            formula_code=group["formula_code"][:MAX_FORMULA_CODE_LEN],
            formula_name=group["formula_name"][:MAX_FORMULA_NAME_LEN],
            product_code=group["product_code"][:MAX_PRODUCT_CODE_LEN],
            resolved_product_id=group["resolved_product_id"],
            base_output_quantity=group["base_output_quantity"],
            output_uom_code=group["output_uom_code"][:MAX_OUTPUT_UOM_CODE_LEN],
            resolved_output_uom_id=group["resolved_output_uom_id"],
            formula_notes=group["formula_notes"][:MAX_NOTES_LEN],
            revision_notes=group["revision_notes"][:MAX_NOTES_LEN],
            is_valid=group["is_valid"],
            errors=group["errors"],
        )
        for group in groups
    ]
    FormulaImportGroup.objects.bulk_create(group_objs)
    # Explicit re-fetch by the unique (batch, group_number) key, never
    # relying on bulk_create's return-list order matching the input order.
    stored_groups_by_number = {g.group_number: g for g in FormulaImportGroup.objects.filter(batch=batch)}

    line_objs = []
    for group in groups:
        stored_group = stored_groups_by_number[group["group_number"]]
        for line_number, row in enumerate(group["rows"], start=1):
            line_objs.append(
                FormulaImportLine(
                    group=stored_group,
                    line_number=line_number,
                    file_row_number=row["file_row_number"],
                    material_code=row["material_code"][:MAX_MATERIAL_CODE_LEN],
                    resolved_material_id=row["resolved_material_id"],
                    material_quantity=row["material_quantity"],
                    is_valid=not row["line_errors"],
                    errors=row["line_errors"],
                )
            )
    FormulaImportLine.objects.bulk_create(line_objs)

    record(
        actor=actor,
        action="formula_import.previewed",
        target_type="formula_import_batch",
        target_id=batch.id,
        company=company,
        after={
            "source_filename": batch.source_filename,
            "source_checksum": checksum,
            "total_rows": total_rows,
            "valid_rows": valid_rows,
            "invalid_rows": invalid_rows,
            "total_groups": total_groups,
            "valid_groups": valid_groups,
            "invalid_groups": invalid_groups,
            "eligible_for_commit": eligible_for_commit,
            "file_errors": file_errors,
        },
    )
    return batch


@transaction.atomic
def commit_import(*, actor, company, batch_id, expected_version):
    """Create every group's `Formula` + `DRAFT` revision 1 + lines +
    contributor row, all-or-nothing, and mark the batch `COMMITTED` - in
    the SAME transaction, so an audit-write failure rolls all of it back
    together.

    LOCK ORDER: `FormulaImportBatch` (this row) -> `Product` (ascending
    id) -> `UnitOfMeasure` (every output unit AND every material's own
    base unit, together, ascending id) -> `Material` (ascending id).
    This extends - never reverses - the two pairwise orders every
    existing formula-related lock already establishes (`apps.formulas.
    approval.lock_and_load_approval_context`: product before units before
    materials; `apps.batch_plans.services._lock_source_context`: product
    before units). Which `UnitOfMeasure` ids need locking depends on
    which materials are involved, so those ids are discovered via one
    UNLOCKED read first (mirroring `lock_and_load_approval_context`'s own
    identical use of an unlocked join purely to discover which ids to
    lock, never trusted for correctness on its own) - the authoritative
    `is_active` state is read again only AFTER the real lock is held.

    CONCURRENCY: identical idempotent-repeat design to `apps.
    product_imports.services.commit_import` (Task 14A) - `version` never
    changes on this model; the guard against a double commit is the row
    lock plus `status` itself. See that function's own docstring for the
    full reasoning, which applies here unchanged.
    """
    batch = FormulaImportBatch.objects.select_for_update().select_related("company").get(pk=batch_id)
    if batch.version != expected_version:
        raise Conflict("This import batch's concurrency token is invalid. Refetch and retry.")

    if batch.status == FormulaImportBatch.Status.COMMITTED:
        return batch, list(batch.created_formulas or []), False

    if timezone.now() > batch.expires_at:
        raise DjangoValidationError({"detail": "This import preview has expired. Create a new preview and try again."})
    if not batch.eligible_for_commit:
        raise DjangoValidationError({"detail": "This import preview contains invalid rows or groups and cannot be committed."})

    groups = list(batch.groups.order_by("group_number").prefetch_related("lines"))
    if not groups:
        raise DjangoValidationError({"detail": "This import preview has no formulas to commit."})

    # --- Revalidate current database state (Task 14B §7) ----------------
    codes = [g.formula_code for g in groups]
    conflicting_codes = sorted(Formula.objects.filter(company=batch.company, code__in=codes).values_list("code", flat=True))
    if conflicting_codes:
        raise DjangoValidationError(
            {
                "detail": (
                    f"{len(conflicting_codes)} formula code(s) were created by someone else since this preview was "
                    "generated. Create a new preview and try again."
                ),
                "codes": conflicting_codes[:50],
            }
        )

    product_ids = sorted({g.resolved_product_id for g in groups if g.resolved_product_id})
    locked_products = {
        p.id: p
        for p in Product.objects.select_for_update(no_key=True)
        .select_related("sales_uom")
        .filter(company=batch.company, pk__in=product_ids)
        .order_by("pk")
    }
    if set(product_ids) - set(locked_products.keys()):
        raise DjangoValidationError({"detail": "One or more referenced products no longer exist. Create a new preview."})

    all_lines = [line for g in groups for line in g.lines.all()]
    material_ids = sorted({line.resolved_material_id for line in all_lines if line.resolved_material_id})
    # Unlocked, purely to discover which UnitOfMeasure ids to lock - see
    # this function's own docstring. Not trusted for is_active state.
    material_base_unit_ids = set(Material.objects.filter(pk__in=material_ids).values_list("base_unit_id", flat=True))
    output_uom_ids = {g.resolved_output_uom_id for g in groups if g.resolved_output_uom_id}
    unit_ids = sorted(output_uom_ids | material_base_unit_ids)
    locked_units = {
        u.id: u for u in UnitOfMeasure.objects.select_for_update(no_key=True).filter(pk__in=unit_ids).order_by("pk")
    }

    locked_materials = {
        m.id: m
        for m in Material.objects.select_for_update(no_key=True)
        .select_related("base_unit")
        .filter(pk__in=material_ids)
        .order_by("pk")
    }
    if set(material_ids) - set(locked_materials.keys()):
        raise DjangoValidationError({"detail": "One or more referenced materials no longer exist. Create a new preview."})

    for group in groups:
        product = locked_products.get(group.resolved_product_id)
        if product is None or not product.is_active or not product.sales_uom.is_active:
            raise DjangoValidationError(
                {"detail": f"Formula '{group.formula_code}': the referenced product or its sales unit is no longer active. Create a new preview."}
            )
        output_unit = locked_units.get(group.resolved_output_uom_id)
        if output_unit is None or not output_unit.is_active:
            raise DjangoValidationError(
                {"detail": f"Formula '{group.formula_code}': the referenced output unit is no longer active. Create a new preview."}
            )
        for line in group.lines.all():
            material = locked_materials.get(line.resolved_material_id)
            if material is None or not material.is_active or not material.base_unit.is_active:
                raise DjangoValidationError(
                    {"detail": f"Formula '{group.formula_code}': a referenced material or its unit is no longer active. Create a new preview."}
                )

    # --- Create -----------------------------------------------------
    formulas_to_create = []
    for group in groups:
        formula = Formula(
            company=batch.company,
            product=locked_products[group.resolved_product_id],
            code=group.formula_code,
            name=group.formula_name,
            notes=group.formula_notes,
            latest_revision_number=1,
            version=1,
            created_by=actor,
        )
        formula.clean()
        formulas_to_create.append(formula)

    try:
        with transaction.atomic():
            Formula.objects.bulk_create(formulas_to_create)
    except IntegrityError as exc:
        raise Conflict(
            "One or more formula codes were created by someone else at the exact moment of commit. "
            "Create a new preview and try again."
        ) from exc

    created_formulas = list(Formula.objects.filter(company=batch.company, code__in=codes))
    formula_by_code = {f.code: f for f in created_formulas}

    revisions_to_create = []
    for group in groups:
        formula = formula_by_code[group.formula_code]
        revision = FormulaRevision(
            formula=formula,
            revision_number=1,
            base_output_quantity=group.base_output_quantity,
            output_uom=locked_units[group.resolved_output_uom_id],
            notes=group.revision_notes,
            created_by=actor,
            # This import IS the complete, sole authorship of this
            # revision - never marked incomplete when authorship is
            # actually fully known (Task 14B's own explicit instruction).
            contributor_history_complete=True,
        )
        revision.clean()
        revisions_to_create.append(revision)
    FormulaRevision.objects.bulk_create(revisions_to_create)

    created_revisions = list(
        FormulaRevision.objects.filter(formula_id__in=[f.id for f in created_formulas], revision_number=1)
    )
    revision_by_formula_id = {r.formula_id: r for r in created_revisions}

    line_objs = []
    contributor_objs = []
    for group in groups:
        formula = formula_by_code[group.formula_code]
        revision = revision_by_formula_id[formula.id]
        for line in group.lines.all():  # prefetched above; FormulaImportLine's own default ordering is line_number
            material = locked_materials[line.resolved_material_id]
            formula_line = FormulaLine(
                revision=revision,
                line_number=line.line_number,
                material=material,
                quantity=line.material_quantity,
                unit=material.base_unit,
                notes="",
                material_code_snapshot=material.code,
                material_name_snapshot=material.name,
                material_kind_snapshot=material.kind,
                unit_code_snapshot=material.base_unit.code,
                unit_name_snapshot=material.base_unit.name,
            )
            formula_line.clean()
            line_objs.append(formula_line)
        # The importing user is the sole, complete author of this brand-
        # new revision - registered as a contributor exactly once,
        # matching apps.formulas.services._register_contributor's own
        # per-(revision, user) semantics.
        contributor_objs.append(FormulaRevisionContributor(revision=revision, user=actor))

    FormulaLine.objects.bulk_create(line_objs)
    FormulaRevisionContributor.objects.bulk_create(contributor_objs)

    created_summary = [
        {"formula_id": f.id, "code": f.code, "revision_id": revision_by_formula_id[f.id].id}
        for f in created_formulas
    ]

    batch.status = FormulaImportBatch.Status.COMMITTED
    batch.committed_at = timezone.now()
    batch.committed_by = actor
    batch.created_formulas = created_summary
    batch.save(update_fields=["status", "committed_at", "committed_by", "created_formulas"])

    record(
        actor=actor,
        action="formula_import.committed",
        target_type="formula_import_batch",
        target_id=batch.id,
        company=batch.company,
        after={
            "created_count": len(created_summary),
            "source_checksum": batch.source_checksum,
            "created_formulas_sample": created_summary[:50],
        },
    )
    return batch, created_summary, True
