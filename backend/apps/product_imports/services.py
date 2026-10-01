"""Task 14A: CSV import for the company-scoped `Product` master - a
validated preview followed by an explicit, all-or-nothing commit.

Two entry points: `parse_and_create_preview` (no DB writes to `Product`,
ever) and `commit_import` (the only path that ever creates one). Neither
function has any permission awareness of its own - matching every other
service in this project, `company`/`actor` are already-resolved,
already-access-checked values by the time either is called (see
`apps.product_imports.views`).
"""

import csv
import hashlib
import io
from datetime import timedelta

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.audit.services import record
from apps.catalog.models import UnitOfMeasure
from apps.common.errors import Conflict
from apps.companies.models import normalize_code
from apps.product_imports.models import ProductImportBatch, ProductImportRow
from apps.products.models import Product

# Bounded limits - documented WORKING CHOICES, not client-confirmed
# policy, sized generously above the task's own "at least 2000 rows"
# requirement while still bounding worst-case memory/DB work per request.
MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024  # 5 MiB
MAX_ROWS = 5000
MAX_HEADER_COLUMNS = 20
PREVIEW_TTL = timedelta(hours=1)

SUPPORTED_COLUMNS = ("code", "name", "product_type", "description", "sales_uom_code")
REQUIRED_COLUMNS = ("code", "name", "sales_uom_code")

# Mirror Product's own field lengths exactly (apps.products.models.Product)
# - a row that would not fit the model is a row error, not a truncation.
MAX_CODE_LEN = 32
MAX_NAME_LEN = 255
MAX_PRODUCT_TYPE_LEN = 100
# Product.description is an unbounded TextField; this import still bounds
# it (same free-text cap several other notes/description fields in this
# project use, e.g. BatchPlan.notes/Formula.notes) so one absurdly long
# cell cannot blow up a response - a WORKING CHOICE, not a model constraint.
MAX_DESCRIPTION_LEN = 2000
MAX_UOM_CODE_LEN = 20


def _file_error(code, message):
    return {"code": code, "message": message}


def _row_error(column, message):
    return {"column": column, "message": message}


def _decode(raw_bytes):
    """UTF-8, including a UTF-8 BOM (stripped automatically by the
    `utf-8-sig` codec if present, left untouched if absent) - the one
    encoding this task requires. Returns `(text_or_None, file_errors)`.
    """
    try:
        return raw_bytes.decode("utf-8-sig"), []
    except UnicodeDecodeError:
        return None, [_file_error("ENCODING_ERROR", "File is not valid UTF-8 (with or without a BOM).")]


def _parse_header(header_row):
    """Returns `(column_index_or_None, file_errors)`. `column_index` maps
    a supported column name to its position in the file - only ever
    returned when the header has no duplicate, unsupported or missing-
    required-column problems, so callers never have to re-check those
    themselves before indexing into a data row.
    """
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
    """Field-level validation only - no database queries. Returns a
    `ProductImportRow` (unsaved) with `errors` already populated for
    every field-level problem found; file-wide checks (duplicate/existing
    codes, unit resolution) are layered on afterward in
    `parse_and_create_preview`, which is the only place a DB query
    actually runs.
    """
    errors = []
    if len(raw_row) != header_width:
        errors.append(
            _row_error(None, f"Row has {len(raw_row)} column(s); the header has {header_width}.")
        )

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

    product_type = _cell(raw_row, column_index, "product_type").strip()
    if len(product_type) > MAX_PRODUCT_TYPE_LEN:
        errors.append(_row_error("product_type", f"Product type exceeds {MAX_PRODUCT_TYPE_LEN} characters."))

    description = _cell(raw_row, column_index, "description").strip()
    if len(description) > MAX_DESCRIPTION_LEN:
        errors.append(_row_error("description", f"Description exceeds {MAX_DESCRIPTION_LEN} characters."))

    sales_uom_code = normalize_code(_cell(raw_row, column_index, "sales_uom_code"))
    if not sales_uom_code:
        errors.append(_row_error("sales_uom_code", "Sales unit code is required."))
    elif len(sales_uom_code) > MAX_UOM_CODE_LEN:
        errors.append(_row_error("sales_uom_code", f"Sales unit code exceeds {MAX_UOM_CODE_LEN} characters."))

    # Stored values are truncated to each staging COLUMN's own width
    # (identical to the real Product field it mirrors) - the ERROR above
    # already used the TRUE, untruncated length, so an over-length cell
    # is still correctly reported; this truncation exists only so
    # persisting the (already-invalid) staging row itself can never raise
    # an unhandled database error (found and fixed during Task 14C, which
    # hit the identical class of bug in its own, separate staging model -
    # see docs/backend-decisions.md, Task 14C, for the full account).
    return ProductImportRow(
        row_number=row_number,
        code=code[:MAX_CODE_LEN],
        name=name[:MAX_NAME_LEN],
        product_type=product_type[:MAX_PRODUCT_TYPE_LEN],
        description=description[:MAX_DESCRIPTION_LEN],
        sales_uom_code=sales_uom_code[:MAX_UOM_CODE_LEN],
        is_valid=not errors,
        errors=errors,
    )


def parse_csv(raw_bytes):
    """Pure function, no database access at all: bytes in, `(rows,
    file_errors)` out. `rows` is a list of unsaved `ProductImportRow`
    instances (file-level-error cases return an empty list). Fully blank
    lines are skipped and never counted as a row - `row_number` is the
    row's 1-based position among actual data rows only.
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


def _apply_file_wide_checks(rows, company):
    """The only DB-touching step of preview creation - exactly TWO
    queries regardless of row count (never one query per row): existing
    `Product` codes for this company, and matching `UnitOfMeasure` codes.
    Mutates `rows` in place (appending errors / setting `resolved_sales_
    uom_id`) and returns nothing.
    """
    codes_seen = {}
    for row in rows:
        if row.code:
            codes_seen.setdefault(row.code, []).append(row.row_number)
    duplicate_codes = {code: numbers for code, numbers in codes_seen.items() if len(numbers) > 1}

    all_codes = [row.code for row in rows if row.code]
    existing_codes = set(
        Product.objects.filter(company=company, code__in=all_codes).values_list("code", flat=True)
    ) if all_codes else set()

    uom_codes = {row.sales_uom_code for row in rows if row.sales_uom_code}
    units_by_code = {
        u.code: u for u in UnitOfMeasure.objects.filter(code__in=uom_codes).only("id", "code", "is_active")
    } if uom_codes else {}

    for row in rows:
        if row.code in duplicate_codes:
            other_rows = [n for n in duplicate_codes[row.code] if n != row.row_number]
            row.errors.append(
                _row_error(
                    "code",
                    f"Duplicate code within this file (also on row(s) {', '.join(map(str, other_rows))})." ,
                )
            )
        if row.code and row.code in existing_codes:
            row.errors.append(_row_error("code", f"Code '{row.code}' is already used by an existing product in this company."))

        if row.sales_uom_code:
            unit = units_by_code.get(row.sales_uom_code)
            if unit is None:
                row.errors.append(_row_error("sales_uom_code", f"Unit '{row.sales_uom_code}' does not exist."))
            elif not unit.is_active:
                row.errors.append(_row_error("sales_uom_code", f"Unit '{row.sales_uom_code}' is inactive."))
            else:
                row.resolved_sales_uom_id = unit.id

        row.is_valid = not row.errors


@transaction.atomic
def create_import_preview(*, actor, company, raw_bytes, source_filename):
    """Parse `raw_bytes` (never persisted - see the module docstring),
    validate it completely, and persist ONLY the batch summary and the
    normalized rows. Always succeeds and returns a batch (even a
    completely unparseable upload gets one, with `file_errors` set and
    `eligible_for_commit=False`) - a stable identifier and audit trail
    exist for every attempt, not only successful ones.
    """
    checksum = hashlib.sha256(raw_bytes).hexdigest()
    rows, file_errors = parse_csv(raw_bytes)
    if rows:
        _apply_file_wide_checks(rows, company)

    valid_rows = sum(1 for row in rows if row.is_valid)
    total_rows = len(rows)
    invalid_rows = total_rows - valid_rows
    eligible_for_commit = bool(total_rows) and invalid_rows == 0 and not file_errors

    batch = ProductImportBatch(
        company=company,
        created_by=actor,
        status=ProductImportBatch.Status.PREVIEWED,
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
    ProductImportRow.objects.bulk_create(rows)

    record(
        actor=actor,
        action="product_import.previewed",
        target_type="product_import_batch",
        target_id=batch.id,
        company=company,
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


def _build_product(company, actor, row):
    product = Product(
        company=company,
        code=row.code,
        name=row.name,
        description=row.description,
        product_type=row.product_type,
        sales_uom_id=row.resolved_sales_uom_id,
        created_by=actor,
    )
    # Reuses Product's OWN validation/normalization (apps.products.models.
    # Product.clean()) in memory, no query - never a second, parallel set
    # of rules. Every value here was already normalized identically during
    # preview, so this is a defensive re-check, not expected to find
    # anything new; see commit_import's own docstring for why bulk_create
    # is still used for the actual write.
    product.clean()
    return product


@transaction.atomic
def commit_import(*, actor, company, batch_id, expected_version):
    """Create every row's `Product`, all-or-nothing, and mark the batch
    `COMMITTED` - in the SAME transaction, so an audit-write failure rolls
    both back together.

    CONCURRENCY: `version` never changes on this model (see
    `ProductImportBatch`'s own docstring) - the guard against a double
    commit is the row lock plus the `status` field itself. Whichever
    concurrent request acquires the lock first performs the whole commit
    and flips `status` to `COMMITTED`; the other, once it acquires the
    lock afterward, sees `COMMITTED` and takes the idempotent-repeat
    branch below - returning the SAME `created_product_ids` rather than
    creating anything a second time. A caller resubmitting the identical
    `expected_version` it originally received (the only value this field
    ever takes) after a lost response therefore always gets the original
    result back, exactly as this task requires - never a second import.
    A truly WRONG `expected_version` (never 1) is rejected as `Conflict`.
    """
    batch = ProductImportBatch.objects.select_for_update().select_related("company").get(pk=batch_id)
    if batch.version != expected_version:
        raise Conflict("This import batch's concurrency token is invalid. Refetch and retry.")

    if batch.status == ProductImportBatch.Status.COMMITTED:
        return batch, list(batch.created_product_ids or []), False

    if timezone.now() > batch.expires_at:
        raise DjangoValidationError({"detail": "This import preview has expired. Create a new preview and try again."})
    if not batch.eligible_for_commit:
        raise DjangoValidationError({"detail": "This import preview contains invalid rows and cannot be committed."})

    rows = list(batch.rows.order_by("row_number"))
    if not rows:
        raise DjangoValidationError({"detail": "This import preview has no rows to commit."})

    # --- Revalidate current database state (Task 14A §6) ----------------
    codes = [row.code for row in rows]
    conflicting_codes = sorted(
        Product.objects.filter(company=batch.company, code__in=codes).values_list("code", flat=True)
    )
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

    unit_ids = sorted({row.resolved_sales_uom_id for row in rows if row.resolved_sales_uom_id})
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

    # --- Create ------------------------------------------------------
    product_objs = [_build_product(batch.company, actor, row) for row in rows]
    try:
        with transaction.atomic():
            created = Product.objects.bulk_create(product_objs)
    except IntegrityError as exc:
        raise Conflict(
            "One or more codes were created by someone else at the exact moment of commit. "
            "Create a new preview and try again."
        ) from exc

    created_ids = [product.id for product in created]

    batch.status = ProductImportBatch.Status.COMMITTED
    batch.committed_at = timezone.now()
    batch.committed_by = actor
    batch.created_product_ids = created_ids
    batch.save(update_fields=["status", "committed_at", "committed_by", "created_product_ids"])

    record(
        actor=actor,
        action="product_import.committed",
        target_type="product_import_batch",
        target_id=batch.id,
        company=batch.company,
        after={
            "created_count": len(created_ids),
            "source_checksum": batch.source_checksum,
            # Bounded sample, never the full list for a large import - the
            # full list is already durably on `created_product_ids` itself.
            "created_product_ids_sample": created_ids[:50],
        },
    )
    return batch, created_ids, True
