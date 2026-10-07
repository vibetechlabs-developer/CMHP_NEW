from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404

from apps.audit.services import record
from apps.catalog.models import Material, UnitOfMeasure
from apps.common.errors import Conflict
from apps.formulas.models import Formula, FormulaLine, FormulaRevision, FormulaRevisionContributor
from apps.products.models import Product

_TEMP_LINE_NUMBER_OFFSET = 1_000_000


def _check_whole_for_count(unit, quantity, label):
    """Existing COUNT rule (see apps.purchasing.services._validate_lines):
    a COUNT-dimension unit accepts whole numbers only.
    """
    if unit.dimension == UnitOfMeasure.Dimension.COUNT and quantity % 1 != 0:
        raise DjangoValidationError(
            {label[0]: f"{label[1]}: '{unit.code}' is a COUNT unit and does not accept a fractional quantity."}
        )


def _register_contributor(revision, user):
    """Task 11C: record `user` as having created or substantively changed
    `revision`. Called only inside the same transaction as the creation or a
    REAL content change (never for a no-op, never for Formula-master metadata
    edits). Idempotent per (revision, user).
    """
    FormulaRevisionContributor.objects.get_or_create(revision=revision, user=user)


def _formula_snapshot(formula):
    return {"name": formula.name, "notes": formula.notes}


def _revision_header_snapshot(revision):
    return {"base_output_quantity": str(revision.base_output_quantity), "notes": revision.notes}


def _line_snapshot_list(lines):
    return [
        {
            "id": line.id,
            "line_number": line.line_number,
            "material_id": line.material_id,
            "material_code_snapshot": line.material_code_snapshot,
            "material_type": line.material_kind_snapshot,
            "quantity": str(line.quantity),
            "unit_code_snapshot": line.unit_code_snapshot,
            "notes": line.notes,
        }
        for line in sorted(lines, key=lambda line: (line.line_number, line.id))
    ]


def _resolve_active_product_for_new_revision(company, product_id):
    product = get_object_or_404(Product.objects.select_related("sales_uom"), pk=product_id, company=company)
    if not product.is_active:
        raise DjangoValidationError({"product_id": f"Product '{product.code}' is inactive."})
    if not product.sales_uom.is_active:
        raise DjangoValidationError(
            {"product_id": f"Sales unit '{product.sales_uom.code}' of product '{product.code}' is inactive."}
        )
    return product


def _resolve_revision_output_uom(product, output_uom_id):
    """Task 12B-2: a NEW revision's output unit. Omitted (`output_uom_id`
    `None`) preserves the original, unchanged default - `product.sales_uom`.
    Given explicitly, it may be ANY active unit, independent of the
    product's own sales unit (e.g. a product sold in bottles whose formula
    is manufactured in kilograms) - this is what makes that combination
    plannable at all (Task 12A's `BatchPlan` same-unit rule, and its
    Task 12B-2 packing-relationship alternative, both key off this field).
    Choosing it establishes no unit conversion by itself; see
    `apps.batch_plans.services` for the one place an explicit conversion
    is ever computed. Once set at creation, `FormulaRevision.output_uom`
    is immutable (enforced in `FormulaRevision.clean()`, unchanged) -
    existing and approved revisions are never touched by this function.
    """
    if output_uom_id is None:
        return product.sales_uom
    unit = get_object_or_404(UnitOfMeasure, pk=output_uom_id)
    if not unit.is_active:
        raise DjangoValidationError({"output_uom_id": f"Unit '{unit.code}' is inactive."})
    return unit


def _resolve_line_material(material_id, index):
    """For a NEW or CHANGED line only: the material and its base unit must
    both be active. The unit is derived from the material, never supplied.
    """
    material = get_object_or_404(Material.objects.select_related("base_unit"), pk=material_id)
    if not material.is_active:
        raise DjangoValidationError({"lines": f"Line {index}: material '{material.code}' is inactive."})
    if not material.base_unit.is_active:
        raise DjangoValidationError(
            {"lines": f"Line {index}: unit '{material.base_unit.code}' of material '{material.code}' is inactive."}
        )
    return material


def _material_snapshot_fields(material):
    return {
        "material_code_snapshot": material.code,
        "material_name_snapshot": material.name,
        "material_kind_snapshot": material.kind,
        "unit_code_snapshot": material.base_unit.code,
        "unit_name_snapshot": material.base_unit.name,
    }


@transaction.atomic
def create_formula(*, actor, company, product_id, code, name, base_output_quantity, notes="", revision_notes="",
                   output_uom_id=None):
    """Creates the Formula and its EMPTY revision 1 (`DRAFT`) atomically.
    The product must belong to `company` and be active with an active
    sales unit; `base_output_quantity` must be positive (whole for a COUNT
    output unit). A duplicate `(company, code)` is a 409, like Customer/
    Product. Lines are only ever written through `update_formula_revision`.
    `output_uom_id` (Task 12B-2, optional) - see `_resolve_revision_output_uom`.
    """
    product = _resolve_active_product_for_new_revision(company, product_id)
    output_uom = _resolve_revision_output_uom(product, output_uom_id)
    _check_whole_for_count(output_uom, base_output_quantity, ("base_output_quantity", "Base output"))

    try:
        formula = Formula(
            company=company, product=product, code=code, name=name, notes=notes or "", created_by=actor
        )
        formula.save()
    except IntegrityError as exc:
        raise Conflict("A formula with this code already exists for this company.") from exc

    revision = FormulaRevision(
        formula=formula,
        revision_number=1,
        base_output_quantity=base_output_quantity,
        output_uom=output_uom,
        notes=(revision_notes or "").strip(),
        created_by=actor,
        contributor_history_complete=True,
    )
    revision.save()
    _register_contributor(revision, actor)
    formula.latest_revision_number = 1
    formula.save(update_fields=["latest_revision_number"])

    record(
        actor=actor,
        action="formula.created",
        target_type="formula",
        target_id=formula.id,
        company=company,
        after={
            "code": formula.code,
            "product_id": product.id,
            **_formula_snapshot(formula),
            "first_revision": {"revision_number": 1, **_revision_header_snapshot(revision), "lines": []},
        },
    )
    return formula


@transaction.atomic
def update_formula(*, actor, formula_id, expected_version, data):
    """Metadata (`name`/`notes`) edit. Locks the Formula row and checks
    `Formula.version`. `create_formula_revision` locks the same row but
    writes only `latest_revision_number`; this writes only `name`/`notes`/
    `version` - disjoint fields, serialized by the row lock, so neither
    can lose the other's update and neither invalidates the other's token.
    No-op writes nothing.
    """
    formula = Formula.objects.select_for_update().get(pk=formula_id)
    if formula.version != expected_version:
        raise Conflict("This formula has changed since it was last read. Refetch and retry.")

    before = _formula_snapshot(formula)
    for field in ("name", "notes"):
        if field in data:
            setattr(formula, field, (data[field] or "").strip())
    formula.clean()
    after = _formula_snapshot(formula)
    if before == after:
        return formula

    formula.version += 1
    formula.save(update_fields=["name", "notes", "version", "updated_at"])
    record(
        actor=actor,
        action="formula.updated",
        target_type="formula",
        target_id=formula.id,
        company=formula.company,
        before=before,
        after=after,
    )
    return formula


@transaction.atomic
def create_formula_revision(*, actor, formula_id, base_output_quantity, notes="", output_uom_id=None):
    """New EMPTY `DRAFT` revision. `revision_number` is allocated from
    `latest_revision_number + 1` while the Formula row is locked
    (`select_for_update()`), so concurrent requests get strictly
    sequential numbers; the unique constraint is only the backstop. Never
    reads or bumps `Formula.version`. The product and its sales unit must
    still be active. `output_uom_id` (Task 12B-2, optional) - see
    `_resolve_revision_output_uom`; omitted, this revision defaults to
    `product.sales_uom` exactly as before. Consistent with `create_formula`
    (the first revision): both resolve the output unit the same way, so a
    formula's later revisions behave identically to its first regardless of
    which one a client happens to create.
    """
    formula = Formula.objects.select_for_update().select_related("product__sales_uom").get(pk=formula_id)
    product = _resolve_active_product_for_new_revision(formula.company, formula.product_id)
    output_uom = _resolve_revision_output_uom(product, output_uom_id)
    _check_whole_for_count(output_uom, base_output_quantity, ("base_output_quantity", "Base output"))

    next_number = formula.latest_revision_number + 1
    revision = FormulaRevision(
        formula=formula,
        revision_number=next_number,
        base_output_quantity=base_output_quantity,
        output_uom=output_uom,
        notes=(notes or "").strip(),
        created_by=actor,
        contributor_history_complete=True,
    )
    revision.save()
    _register_contributor(revision, actor)
    formula.latest_revision_number = next_number
    formula.save(update_fields=["latest_revision_number"])

    record(
        actor=actor,
        action="formula_revision.created",
        target_type="formula_revision",
        target_id=revision.id,
        company=formula.company,
        after={"revision_number": next_number, **_revision_header_snapshot(revision), "lines": []},
    )
    return revision


@transaction.atomic
def update_formula_revision(*, actor, revision_id, expected_version, data):
    """`data` may contain `base_output_quantity`/`notes`/`lines`, each
    optional. `lines`, when present (even `[]`), is the COMPLETE final
    collection for the revision (raw and packaging lines together, one
    atomic save): an entry with `id` updates that line of THIS revision
    (unknown/foreign/repeated ids are 400), an entry without `id` is new,
    an existing line not listed is removed; `line_number` follows
    submitted order. Omitted `lines` leaves them untouched.

    Validation applies only to NEW or CHANGED lines (material_id, quantity
    or notes differing from the stored line): the material and its base
    unit must be active, COUNT units need whole quantities. An unchanged
    line whose material/unit has since been deactivated is preserved and
    may be removed, but changing its quantity/notes/material is rejected.
    Snapshots and the derived `unit` are (re)captured only for new lines or
    when the material is replaced. `base_output_quantity` edits never
    rescale lines (no scaling exists). Row-locked, version-checked, DRAFT
    only (an APPROVED revision is immutable, Task 11C); no-op writes nothing;
    header, lines, version, the editor's contributor row and audit are atomic
    - a REAL content change registers `actor` as a contributor (base output,
    revision notes and lines are "substantive"; a no-op adds nobody).
    """
    revision = FormulaRevision.objects.select_for_update().select_related("formula", "output_uom").get(pk=revision_id)
    if revision.version != expected_version:
        raise Conflict("This formula revision has changed since it was last read. Refetch and retry.")
    if revision.status != FormulaRevision.Status.DRAFT:
        raise DjangoValidationError({"detail": f"A revision with status '{revision.status}' cannot be edited."})

    before_header = _revision_header_snapshot(revision)
    header_changed = False
    if "base_output_quantity" in data and data["base_output_quantity"] != revision.base_output_quantity:
        _check_whole_for_count(
            revision.output_uom, data["base_output_quantity"], ("base_output_quantity", "Base output")
        )
        revision.base_output_quantity = data["base_output_quantity"]
        header_changed = True
    if "notes" in data:
        value = (data["notes"] or "").strip()
        if value != revision.notes:
            revision.notes = value
            header_changed = True

    lines_changed = False
    before_lines = None
    kept, new_lines, removed_ids = [], [], set()
    if "lines" in data:
        existing = {line.id: line for line in revision.lines.all()}
        before_lines = _line_snapshot_list(existing.values())
        seen_ids = set()
        for index, item in enumerate(data["lines"], start=1):
            notes = (item.get("notes") or "").strip()
            label_claim = (item.get("label_claim") or "").strip()
            ar_no = (item.get("ar_no") or "").strip()
            special_value = (item.get("special_value") or "").strip()
            line_id = item.get("id")
            if line_id is None:
                material = _resolve_line_material(item["material_id"], index)
                _check_whole_for_count(material.base_unit, item["quantity"], ("lines", f"Line {index}"))
                new_lines.append(
                    FormulaLine(
                        revision=revision,
                        line_number=index,
                        material=material,
                        quantity=item["quantity"],
                        unit=material.base_unit,
                        notes=notes,
                        label_claim=label_claim,
                        ar_no=ar_no,
                        special_value=special_value,
                        **_material_snapshot_fields(material),
                    )
                )
                continue
            if line_id in seen_ids:
                raise DjangoValidationError({"lines": f"Line {line_id} appears more than once in this request."})
            seen_ids.add(line_id)
            line = existing.get(line_id)
            if line is None:
                raise DjangoValidationError({"lines": f"Line {line_id} does not belong to this revision."})
            unchanged = (
                item["material_id"] == line.material_id
                and item["quantity"] == line.quantity
                and notes == line.notes
                and label_claim == line.label_claim
                and ar_no == line.ar_no
                and special_value == line.special_value
            )
            if not unchanged:
                material = _resolve_line_material(item["material_id"], index)
                _check_whole_for_count(material.base_unit, item["quantity"], ("lines", f"Line {index}"))
                if material.id != line.material_id:
                    line.material = material
                    line.unit = material.base_unit
                    for field, value in _material_snapshot_fields(material).items():
                        setattr(line, field, value)
                line.quantity = item["quantity"]
                line.notes = notes
                line.label_claim = label_claim
                line.ar_no = ar_no
                line.special_value = special_value
            kept.append((line, index, not unchanged))

        removed_ids = set(existing) - seen_ids
        lines_changed = bool(removed_ids) or bool(new_lines) or any(
            changed or line.line_number != index for line, index, changed in kept
        )

    if not header_changed and not lines_changed:
        return revision

    if lines_changed:
        if removed_ids:
            revision.lines.filter(id__in=removed_ids).delete()
        moving = [line for line, index, _ in kept if line.line_number != index]
        if moving:
            for line in moving:
                line.line_number = _TEMP_LINE_NUMBER_OFFSET + line.id
            FormulaLine.objects.bulk_update(moving, ["line_number"])
        to_write = []
        for line, index, changed in kept:
            if changed or line.line_number != index:
                line.line_number = index
                to_write.append(line)
        if to_write:
            FormulaLine.objects.bulk_update(
                to_write,
                [
                    "line_number",
                    "material",
                    "quantity",
                    "unit",
                    "notes",
                    "material_code_snapshot",
                    "material_name_snapshot",
                    "material_kind_snapshot",
                    "unit_code_snapshot",
                    "unit_name_snapshot",
                ],
            )
        if new_lines:
            FormulaLine.objects.bulk_create(new_lines)

    revision.version += 1
    revision.save(update_fields=["base_output_quantity", "notes", "version", "updated_at"])
    _register_contributor(revision, actor)

    audit_before = dict(before_header)
    audit_after = _revision_header_snapshot(revision)
    if lines_changed:
        audit_before["lines"] = before_lines
        audit_after["lines"] = _line_snapshot_list(revision.lines.all())
    record(
        actor=actor,
        action="formula_revision.updated",
        target_type="formula_revision",
        target_id=revision.id,
        company=revision.formula.company,
        before=audit_before,
        after=audit_after,
    )
    return revision
