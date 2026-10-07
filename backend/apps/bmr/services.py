from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction

from apps.audit.services import record
from apps.batch_plans.requirement_preview import build_batch_plan_requirement_preview, load_consistent_batch_plan
from apps.batch_plans.models import BatchPlan
from apps.bmr.models import BatchManufacturingRecord, BMRLine
from apps.common.errors import Conflict
from apps.formulas.models import FormulaLine

EDITABLE_LINE_FIELDS = ["special_value", "label_claim", "ar_no", "qty_received"]


def _line_snapshot(line):
    return {field: getattr(line, field) for field in EDITABLE_LINE_FIELDS} | {"version": line.version}


@transaction.atomic
def create_bmr(*, actor, company, batch_plan_id):
    """Create the BMR for one batch plan. Lines come from the EXISTING
    requirement preview, so quantities are the backend's exact answers. Refused
    when the preview is not calculation-complete. Never allocates a batch number.
    """
    plan = BatchPlan.objects.select_for_update().filter(pk=batch_plan_id, company=company).first()
    if plan is None:
        raise DjangoValidationError({"detail": "Batch plan not found in this company."})
    if BatchManufacturingRecord.objects.filter(batch_plan=plan).exists():
        raise Conflict("A batch manufacturing record already exists for this batch plan.")

    plan_obj, formula_lines = load_consistent_batch_plan(plan.id)
    preview = build_batch_plan_requirement_preview(plan_obj, formula_lines)
    if not preview.get("calculation_complete"):
        raise DjangoValidationError(
            {"detail": "The requirement calculation is incomplete, so the BMR cannot be created yet."}
        )

    try:
        bmr = BatchManufacturingRecord.objects.create(
            company=company,
            batch_plan=plan,
            formula_revision=plan.formula_revision,
            created_by=actor,
        )
    except IntegrityError as exc:
        raise Conflict("A batch manufacturing record already exists for this batch plan.") from exc

    rows = sorted(preview["lines"], key=lambda row: (row["material_type"], row["line_number"]))
    # Free-text values set on the formula line seed the record's lines (they can be edited there).
    formula_lines = {fl.id: fl for fl in FormulaLine.objects.filter(revision=plan.formula_revision)}
    for row in rows:
        seed = formula_lines.get(row["id"])
        slip = BMRLine.Slip.RAW if row["material_type"] == "RAW_MATERIAL" else BMRLine.Slip.PACKING
        BMRLine.objects.create(
            bmr=bmr,
            slip=slip,
            line_number=row["line_number"],
            formula_line_id=row["id"],
            material_code=row["material_code"],
            material_name=row["material_name"],
            unit_code=row["unit_code"],
            required_text=row["required_quantity"]["value"],
            special_value=seed.special_value if seed else "",
            label_claim=seed.label_claim if seed else "",
            ar_no=seed.ar_no if seed else "",
            updated_by=actor,
        )

    record(
        actor=actor,
        action="bmr.created",
        target_type="batch_manufacturing_record",
        target_id=bmr.id,
        company=company,
        after={"batch_plan_id": plan.id, "formula_revision_id": plan.formula_revision_id, "line_count": len(rows)},
    )
    return bmr


@transaction.atomic
def update_bmr_line(*, actor, bmr, line_id, expected_version, data):
    """Edit the free-text fields of one line, version-checked and audited. Qty
    received is only for packing lines. Required quantities are never editable here.
    """
    line = BMRLine.objects.select_for_update().filter(pk=line_id, bmr=bmr).first()
    if line is None:
        raise DjangoValidationError({"detail": "Line not found on this record."})
    if line.version != expected_version:
        raise Conflict("This line has changed since it was last read. Refetch and retry.")
    if "qty_received" in data and line.slip != BMRLine.Slip.PACKING:
        raise DjangoValidationError({"qty_received": "Qty received applies to packing material lines only."})

    before = _line_snapshot(line)
    changed = False
    for field in EDITABLE_LINE_FIELDS:
        if field in data:
            value = (data[field] or "").strip()
            if getattr(line, field) != value:
                setattr(line, field, value)
                changed = True
    if not changed:
        return line

    line.version += 1
    line.updated_by = actor
    line.save(update_fields=[*EDITABLE_LINE_FIELDS, "version", "updated_by", "updated_at"])
    record(
        actor=actor,
        action="bmr.line_updated",
        target_type="bmr_line",
        target_id=line.id,
        company=bmr.company,
        before=before,
        after=_line_snapshot(line),
    )
    return line
