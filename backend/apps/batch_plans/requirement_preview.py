from django.utils import timezone

from apps.batch_plans.models import BatchPlan
from apps.batch_plans.services import assess_source_drift
from apps.batch_plans.validation import compute_expected_packed_content
from apps.common.errors import Conflict
from apps.formulas.requirement_preview import (
    DISPLAY_SIGNIFICANT_DIGITS,
    _load_lines,
    _ratio_info,
    _to_fraction,
    build_requirement_preview,
)

_READ_ATTEMPTS = 3

PLANNING_NOTICES = [
    "Planning draft: official batch number not assigned. This is a planning estimate only and is not a production or issue authorization.",
    "No stock availability check is performed.",
    "Nothing is reserved, issued or consumed.",
    "No unit conversion is performed: the target uses the formula revision's output unit.",
    "Every line is treated as proportional to the target output for this preview only. "
    "Fixed-per-batch quantities, yield, losses, wastage and packaging rounding are not modeled "
    "and no rounding rule is applied.",
]

PACKING_ASSESSMENT_DIFFERENCE_LABEL = "Planning quantity difference"


def load_consistent_batch_plan(plan_id):
    """Read BatchPlan, its pinned FormulaRevision, and formula lines with
    read consistency using bounded retry on version change.
    """
    for _ in range(_READ_ATTEMPTS):
        plan = (
            BatchPlan.objects.select_related(
                "company",
                "sales_order_line__sales_order",
                "sales_order_line__product__sales_uom",
                "formula_revision__formula__product",
                "formula_revision__output_uom",
                "packing_content_uom",
            )
            .get(pk=plan_id)
        )
        lines = _load_lines(plan.formula_revision)
        version_after = BatchPlan.objects.filter(pk=plan_id).values_list("version", flat=True).get()
        if version_after == plan.version:
            return plan, lines
    raise Conflict("This batch plan is being edited. Retry the preview.")


def compute_packing_assessment(plan):
    """Task 12B-2: read-only structured assessment of the plan's explicit
    packing relationship (Shape B) against its explicit manufacturing
    target. Returns `None` if this plan has no packing relationship
    recorded (Shape A - the source order/sales unit already equals the
    formula's own output unit, so there is nothing to convert).

    Uses exact `fractions.Fraction` arithmetic throughout (via
    `apps.batch_plans.validation.compute_expected_packed_content`, itself
    built on each unit's `canonical_factor`) and the SAME display rendering
    (`apps.formulas.requirement_preview._ratio_info`) as the material
    requirement calculator, so a value shown here and a value shown there
    are directly comparable.

    IMPORTANT: `expected_packed_content` is a PLANNING calculation from an
    explicit, user-entered packing relationship - it is not a validated
    manufacturing instruction, and it does not change
    `target_output_quantity` (the actual manufacturing target) in any way.
    `difference` is `target_output_quantity - expected_packed_content`,
    signed, labeled "Planning quantity difference" (`PACKING_ASSESSMENT_
    DIFFERENCE_LABEL`) and NEVER labeled waste/yield/allowance/shortage - a
    negative value is surfaced as-is, not corrected.
    """
    if plan.packing_content_uom_id is None:
        return None

    output_unit = plan.formula_revision.output_uom
    content_unit = plan.packing_content_uom

    expected_fraction = compute_expected_packed_content(
        planned_pack_quantity=plan.planned_pack_quantity,
        packing_content_quantity=plan.packing_content_quantity,
        packing_content_uom=content_unit,
        output_unit=output_unit,
    )
    target_fraction = _to_fraction(plan.target_output_quantity)
    difference_fraction = target_fraction - expected_fraction

    notices = [
        "Explicit pack content is a working planning input, not a validated manufacturing instruction.",
        "The manufacturing target is entered independently and is never derived from planned pack quantity "
        "or packing content, even when both are present.",
    ]
    if difference_fraction < 0:
        notices.append(
            f"The manufacturing target is less than the expected packed content computed from the planned pack "
            f"quantity and packing content. This is shown as a {PACKING_ASSESSMENT_DIFFERENCE_LABEL.lower()} only; "
            "neither value is changed automatically."
        )

    return {
        "planned_pack_quantity": str(plan.planned_pack_quantity),
        "pack_uom_code": plan.pack_uom_code_snapshot,
        "pack_uom_name": plan.pack_uom_name_snapshot,
        "packing_content_quantity": str(plan.packing_content_quantity),
        "packing_content_uom_id": content_unit.id,
        "packing_content_uom_code": content_unit.code,
        "packing_content_uom_name": content_unit.name,
        "packing_content_uom_is_active": content_unit.is_active,
        "expected_packed_content": {
            **_ratio_info(expected_fraction),
            "unit_code": output_unit.code,
            "unit_name": output_unit.name,
        },
        "manufacturing_target_quantity": str(plan.target_output_quantity),
        "manufacturing_target_uom_code": output_unit.code,
        "difference": {
            **_ratio_info(difference_fraction),
            "unit_code": output_unit.code,
            "label": PACKING_ASSESSMENT_DIFFERENCE_LABEL,
        },
        "notices": notices,
    }


def build_batch_plan_requirement_preview(plan, lines):
    """Generate requirement preview for a BatchPlan, incorporating source drift
    checks and reusing the exact rational calculation engine from formulas.
    """
    drift = assess_source_drift(plan)
    formula = plan.formula_revision.formula
    product = formula.product
    output_unit = plan.formula_revision.output_uom
    packing_assessment = compute_packing_assessment(plan)

    source_context = {
        "sales_order_id": plan.sales_order_line.sales_order_id,
        "sales_order_reference": plan.source_order_reference_snapshot,
        "sales_order_status": plan.sales_order_line.sales_order.status,
        "sales_order_line_id": plan.sales_order_line_id,
        "sales_order_line_number": plan.source_line_number_snapshot,
        "sales_order_line_quantity": str(plan.sales_order_line.quantity),
        "product_id": plan.product_id_snapshot,
        "product_code": plan.product_code_snapshot,
        "product_name": plan.product_name_snapshot,
        "output_uom_id": plan.output_uom_id_snapshot,
        "output_uom_code": plan.output_uom_code_snapshot,
        "output_uom_name": plan.output_uom_name_snapshot,
        "pack_uom_id": plan.pack_uom_id_snapshot,
        "pack_uom_code": plan.pack_uom_code_snapshot,
        "pack_uom_name": plan.pack_uom_name_snapshot,
    }

    plan_info = {
        "id": plan.id,
        "version": plan.version,
        "status": plan.status,
        "target_output_quantity": str(plan.target_output_quantity),
        "planned_manufacturing_date": (
            plan.planned_manufacturing_date.isoformat() if plan.planned_manufacturing_date else None
        ),
        "packing_size_note": plan.packing_size_note,
        "notes": plan.notes,
    }

    if drift["is_incompatible"]:
        # Incompatible source drift blocks calculation
        return {
            "preview": {
                "informational": True,
                "generated_at": timezone.now().isoformat(),
                "calculation": {
                    "method": "proportional",
                    "formula": "required_quantity = base_line_quantity * target_output_quantity / base_output_quantity",
                    "arithmetic": "exact rational arithmetic (no binary floats)",
                    "display_significant_digits": DISPLAY_SIGNIFICANT_DIGITS,
                    "display_rounding": "ROUND_HALF_EVEN",
                    "operational_rounding_applied": False,
                    "note": "Calculation blocked due to incompatible source drift.",
                },
                "notices": PLANNING_NOTICES,
            },
            "plan": plan_info,
            "source_context": source_context,
            "source_drift": drift,
            "packing_assessment": packing_assessment,
            "formula": {
                "id": formula.id,
                "code": formula.code,
                "name": formula.name,
                "product": {
                    "id": product.id,
                    "code": product.code,
                    "name": product.name,
                    "is_active": product.is_active,
                },
            },
            "revision": {
                "id": plan.formula_revision.id,
                "revision_number": plan.formula_revision.revision_number,
                "status": plan.formula_revision.status,
                "version": plan.formula_revision.version,
                "base_output_quantity": str(plan.formula_revision.base_output_quantity),
                "output_unit": {
                    "id": output_unit.id,
                    "code": output_unit.code,
                    "name": output_unit.name,
                    "dimension": output_unit.dimension,
                    "is_active": output_unit.is_active,
                },
            },
            "target_output_quantity": str(plan.target_output_quantity),
            "scale_factor": None,
            "lines": [],
            "raw_line_count": 0,
            "packaging_line_count": 0,
            "calculation_complete": False,
            "calculation_issues": [
                {
                    "code": "INCOMPATIBLE_SOURCE_DRIFT",
                    "message": (
                        "The referenced sales order line's product or sales unit has changed and is "
                        "incompatible with the pinned formula revision. Requirement calculation is blocked."
                    ),
                }
            ],
            "warnings": [issue for issue in drift["issues"] if not issue.get("blocking")],
        }

    # Compatible: reuse exact formula calculator. Scaling ALWAYS uses
    # `plan.target_output_quantity` (the explicit manufacturing target) -
    # never `planned_pack_quantity` or the computed `expected_packed_
    # content` from `packing_assessment`, even when both are present.
    preview_data = build_requirement_preview(plan.formula_revision, lines, plan.target_output_quantity)

    # Attach planning notices and plan context
    preview_data["preview"]["notices"] = PLANNING_NOTICES
    preview_data["plan"] = plan_info
    preview_data["source_context"] = source_context
    preview_data["source_drift"] = drift
    preview_data["packing_assessment"] = packing_assessment

    # Merge drift warnings into preview warnings
    drift_warnings = [
        {"code": issue["code"], "message": issue["message"]}
        for issue in drift["issues"]
        if not issue.get("blocking")
    ]
    preview_data["warnings"].extend(drift_warnings)

    return preview_data
