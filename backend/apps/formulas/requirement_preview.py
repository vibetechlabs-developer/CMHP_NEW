"""Task 11D: READ-ONLY material requirement preview for one formula revision.

A planning estimate only. It is not an authorization to produce: even for an
APPROVED revision (Task 11C) nothing here is a production requirement, no stock is checked, nothing is reserved/issued/consumed,
no unit conversion is done, and no fixed-per-batch quantity, yield, loss,
wastage or packaging rounding is modeled. Every line is treated as purely
proportional to the target output *for this preview only*. Nothing here is
persisted, versioned or audited.

CALCULATION
For each line:  required = stored_line_quantity * target / base_output_quantity.
The inputs are exact decimals (quantities have at most 3 decimal places), so the
ratio is computed as an exact rational number (`fractions.Fraction`), never with
binary floats. That gives two things independently of any display precision:
- exactness: the result is a *terminating* decimal iff the reduced denominator
  has only the prime factors 2 and 5. A non-terminating result (e.g. 1/3) is
  never claimed to be exact.
- wholeness: a result is a whole number iff the reduced denominator is 1. The
  COUNT-unit fractional-piece warning is decided from this exact ratio, never
  from a rounded/display value, so a tiny fractional part cannot disappear.
Only the *displayed string* is rendered at `DISPLAY_SIGNIFICANT_DIGITS`
significant digits (ROUND_HALF_EVEN). A terminating result that fits is shown
exactly; otherwise the string is an approximation and `is_exact` is false.
No operational rounding (up/down/to inventory precision) is applied.
"""

import re
from decimal import ROUND_HALF_EVEN, Context, Decimal
from fractions import Fraction

from django.utils import timezone
from rest_framework import exceptions

from apps.catalog.models import UnitOfMeasure
from apps.common.errors import Conflict
from apps.formulas.models import FormulaLine, FormulaRevision

DISPLAY_SIGNIFICANT_DIGITS = 50
_DISPLAY_CONTEXT = Context(prec=DISPLAY_SIGNIFICANT_DIGITS, rounding=ROUND_HALF_EVEN)

TARGET_PARAM = "target_output_quantity"
# Same precision as every stored quantity: max_digits=14, decimal_places=3.
TARGET_MAX_DECIMAL_PLACES = 3
TARGET_MAX_INTEGER_DIGITS = 11
_PLAIN_DECIMAL = re.compile(r"^[0-9]+(\.[0-9]+)?$")

_READ_ATTEMPTS = 3

_SHARED_NOTICES = [
    "No stock availability check is performed.",
    "Nothing is reserved, issued or consumed.",
    "No unit conversion is performed: the target uses the revision's output unit.",
    "Every line is treated as proportional to the target output for this preview only. "
    "Fixed-per-batch quantities, yield, losses, wastage and packaging rounding are not modeled "
    "and no rounding rule is applied.",
]
_DRAFT_NOTICES = [
    "Draft formula revision: this is a planning estimate only and the revision is not approved.",
    "This is not an approved requirement.",
]
_APPROVED_NOTICES = [
    "Approved formula revision: the approval records that this revision's content was approved. "
    "It does not authorize production, batch scaling or material use.",
    "The output is a planning estimate only and is not a production or issue authorization.",
]


def notices_for(status):
    lead = _APPROVED_NOTICES if status == FormulaRevision.Status.APPROVED else _DRAFT_NOTICES
    return [*lead, *_SHARED_NOTICES]


NOTICES = notices_for(FormulaRevision.Status.DRAFT)


def parse_target_output_quantity(query_params, output_unit):
    """Strict parse of `?target_output_quantity=`. 400 (field-keyed) for: an
    unknown or repeated parameter, missing/blank, anything but plain digits with
    an optional fractional part (no sign, exponent, NaN/Infinity, whitespace or
    separators), zero, more than 3 decimal places, more than 11 integer digits,
    and a fractional value when the output unit is COUNT.
    """
    unknown = sorted(set(query_params.keys()) - {TARGET_PARAM})
    if unknown:
        raise exceptions.ValidationError({name: "Unknown query parameter." for name in unknown})
    values = query_params.getlist(TARGET_PARAM)
    if len(values) > 1:
        raise exceptions.ValidationError({TARGET_PARAM: "Provide exactly one value."})
    if not values or not values[0].strip():
        raise exceptions.ValidationError({TARGET_PARAM: "This query parameter is required."})
    raw = values[0]
    if raw != raw.strip() or not _PLAIN_DECIMAL.match(raw):
        raise exceptions.ValidationError(
            {TARGET_PARAM: "Must be a positive plain decimal number (digits with an optional fraction, no sign or exponent)."}
        )
    integer_part, _, fraction_part = raw.partition(".")
    if len(fraction_part) > TARGET_MAX_DECIMAL_PLACES:
        raise exceptions.ValidationError(
            {TARGET_PARAM: f"At most {TARGET_MAX_DECIMAL_PLACES} decimal places are allowed."}
        )
    if len(integer_part.lstrip("0") or "0") > TARGET_MAX_INTEGER_DIGITS:
        raise exceptions.ValidationError(
            {TARGET_PARAM: f"Too large: at most {TARGET_MAX_INTEGER_DIGITS} integer digits are allowed."}
        )
    target = Decimal(raw)
    if not target.is_finite():
        raise exceptions.ValidationError({TARGET_PARAM: "Must be a finite number."})
    if target <= 0:
        raise exceptions.ValidationError({TARGET_PARAM: "Must be greater than zero."})
    if output_unit.dimension == UnitOfMeasure.Dimension.COUNT and target % 1 != 0:
        raise exceptions.ValidationError(
            {TARGET_PARAM: f"The output unit '{output_unit.code}' is a COUNT unit and needs a whole-number target."}
        )
    return target


def _to_fraction(value):
    return Fraction(value)


def _terminates(fraction):
    """True iff the reduced denominator is 2^a * 5^b (a terminating decimal)."""
    d = fraction.denominator
    for p in (2, 5):
        while d % p == 0:
            d //= p
    return d == 1


def _display(fraction):
    """Decimal string (never exponent notation) at the display precision and
    whether it equals the exact value. Terminating values that fit are exact.
    """
    exact_decimal = _DISPLAY_CONTEXT.divide(Decimal(fraction.numerator), Decimal(fraction.denominator))
    is_exact = _terminates(fraction) and Fraction(exact_decimal) == fraction
    # normalize() must use OUR context: the ambient default (28 digits) would
    # silently truncate the displayed approximation.
    text = format(_DISPLAY_CONTEXT.normalize(exact_decimal) if exact_decimal != 0 else Decimal(0), "f")
    return text, is_exact


def _ratio_info(fraction):
    text, is_exact = _display(fraction)
    return {
        "value": text,
        "is_exact": is_exact,
        "is_approximate": not is_exact,
        "significant_digits": DISPLAY_SIGNIFICANT_DIGITS,
        "rounding": "ROUND_HALF_EVEN",
        "is_whole_number": fraction.denominator == 1,
    }


def load_consistent_revision(revision_id):
    """Read the revision header and its lines as ONE consistent state without
    locks, writes or an isolation-level change.

    A revision edit (apps.formulas.services.update_formula_revision) changes
    lines and header inside one transaction and bumps `version` in that same
    transaction, so *any* committed edit changes `version`. We read the header
    (including its version), then the lines, then the version again; if the
    two versions match, no edit committed in between and header and lines belong
    to the same revision version. Otherwise retry (bounded); if the revision is
    still changing, raise a 409 rather than return a torn combination.
    """
    for _ in range(_READ_ATTEMPTS):
        revision = (
            FormulaRevision.objects.select_related("formula__product", "formula__company", "output_uom")
            .get(pk=revision_id)
        )
        lines = _load_lines(revision)
        version_after = FormulaRevision.objects.filter(pk=revision_id).values_list("version", flat=True).get()
        if version_after == revision.version:
            return revision, lines
    raise Conflict("This formula revision is being edited. Retry the preview.")


def _load_lines(revision):
    return list(
        FormulaLine.objects.filter(revision_id=revision.id)
        .select_related("material", "unit", "label_claim_uom")
        .order_by("line_number", "id")
    )


def _issue(code, message, **extra):
    return {"code": code, "message": message, **extra}


def build_requirement_preview(revision, lines, target):
    formula = revision.formula
    product = formula.product
    output_unit = revision.output_uom
    base = revision.base_output_quantity

    issues = []
    warnings = []
    rows = []

    if base is None or base <= 0:
        issues.append(_issue("INVALID_BASE_OUTPUT", "The revision's base output quantity is not positive; no requirement can be calculated."))
        factor_fraction = None
        factor = None
    else:
        factor_fraction = _to_fraction(target) / _to_fraction(base)
        factor = _ratio_info(factor_fraction)

    if not lines:
        issues.append(
            _issue(
                "EMPTY_FORMULA",
                "This revision has no material lines. The preview is empty and is not a complete material requirement.",
            )
        )

    if not product.is_active:
        warnings.append(_issue("INACTIVE_PRODUCT", f"Product '{product.code}' is currently inactive."))
    if not output_unit.is_active:
        warnings.append(_issue("INACTIVE_OUTPUT_UNIT", f"Output unit '{output_unit.code}' is currently inactive."))

    for line in lines:
        material = line.material
        unit = line.unit
        where = {"line_id": line.id, "line_number": line.line_number}
        is_label_claim = line.calculation_mode == FormulaLine.CalculationMode.AS_PER_LABEL_CLAIM

        if is_label_claim:
            # AS_PER_LABEL_CLAIM: required = target_output_quantity / label_claim_quantity,
            # with label_claim_quantity converted into the revision's own output
            # unit via canonical_factor first - same same-dimension conversion
            # apps.batch_plans.validation.compute_expected_packed_content uses.
            # This line's own quantity/unit are NOT used here (see FormulaLine's
            # own docstring on calculation_mode).
            claim_uom = line.label_claim_uom
            if (
                line.label_claim_quantity is None
                or line.label_claim_quantity <= 0
                or claim_uom is None
                or claim_uom.canonical_factor is None
                or output_unit.canonical_factor is None
            ):
                issues.append(
                    _issue(
                        "LINE_NOT_CALCULATED",
                        "This line's label claim is incomplete or its unit has no conversion factor; the preview is incomplete.",
                        **where,
                    )
                )
                continue
            claim_in_output_unit = (
                _to_fraction(line.label_claim_quantity)
                * _to_fraction(claim_uom.canonical_factor)
                / _to_fraction(output_unit.canonical_factor)
            )
            required = _to_fraction(target) / claim_in_output_unit
        else:
            if factor_fraction is None or line.quantity is None or line.quantity <= 0:
                issues.append(
                    _issue("LINE_NOT_CALCULATED", "This line could not be calculated; the preview is incomplete.", **where)
                )
                continue
            required = _to_fraction(line.quantity) * factor_fraction

        text, is_exact = _display(required)
        whole = required.denominator == 1
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
                "notes": line.notes,
                "base_line_quantity": str(line.quantity),
                "calculation_mode": line.calculation_mode,
                "label_claim_quantity": str(line.label_claim_quantity) if is_label_claim else None,
                "label_claim_uom_code": claim_uom.code if is_label_claim else None,
                "required_quantity": {
                    "value": text,
                    "is_exact": is_exact,
                    "is_approximate": not is_exact,
                    "is_whole_number": whole,
                },
                "current": {
                    "material_code": material.code,
                    "material_name": material.name,
                    "material_is_active": material.is_active,
                    "unit_code": unit.code,
                    "unit_name": unit.name,
                    "unit_is_active": unit.is_active,
                },
            }
        )
        if not material.is_active:
            warnings.append(_issue("INACTIVE_MATERIAL", f"Material '{line.material_code_snapshot}' is currently inactive.", **where))
        if not unit.is_active:
            warnings.append(_issue("INACTIVE_UNIT", f"Unit '{line.unit_code_snapshot}' is currently inactive.", **where))
        if is_label_claim and not whole:
            warnings.append(
                _issue(
                    "FRACTIONAL_LABEL_CLAIM_REQUIREMENT",
                    f"The exact number of packs required for '{line.material_code_snapshot}' (as per label claim) "
                    "is not a whole number. It is shown unrounded; no rounding rule has been decided.",
                    required_quantity=text,
                    **where,
                )
            )
        elif unit.dimension == UnitOfMeasure.Dimension.COUNT and not whole:
            warnings.append(
                _issue(
                    "FRACTIONAL_COUNT_REQUIREMENT",
                    f"The exact requirement for '{line.material_code_snapshot}' is not a whole number of "
                    f"{line.unit_code_snapshot}. It is shown unrounded; no rounding rule has been decided.",
                    required_quantity=text,
                    **where,
                )
            )
        if (
            material.code != line.material_code_snapshot
            or material.name != line.material_name_snapshot
            or unit.code != line.unit_code_snapshot
            or unit.name != line.unit_name_snapshot
        ):
            warnings.append(
                _issue(
                    "MASTER_DATA_CHANGED_SINCE_SNAPSHOT",
                    "The material or its unit was renamed after this line was captured. The stored snapshot is shown; nothing was refreshed.",
                    informational=True,
                    **where,
                )
            )

    return {
        "preview": {
            "informational": True,
            "generated_at": timezone.now().isoformat(),
            "calculation": {
                "method": "per-line (see each line's own calculation_mode)",
                "formula_as_per_formula": "required_quantity = base_line_quantity * target_output_quantity / base_output_quantity",
                "formula_as_per_label_claim": "required_quantity = target_output_quantity / label_claim_quantity (converted into the output unit via canonical_factor)",
                "arithmetic": "exact rational arithmetic (no binary floats)",
                "display_significant_digits": DISPLAY_SIGNIFICANT_DIGITS,
                "display_rounding": "ROUND_HALF_EVEN",
                "operational_rounding_applied": False,
                "note": "A value with is_exact=false is a display approximation of a non-terminating result.",
            },
            "notices": notices_for(revision.status),
        },
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
            "id": revision.id,
            "revision_number": revision.revision_number,
            "status": revision.status,
            "version": revision.version,
            "base_output_quantity": str(base),
            "output_unit": {
                "id": output_unit.id,
                "code": output_unit.code,
                "name": output_unit.name,
                "dimension": output_unit.dimension,
                "is_active": output_unit.is_active,
            },
        },
        "approval": {
            "approved_by_id": revision.approved_by_id,
            "approved_at": revision.approved_at.isoformat() if revision.approved_at else None,
            "policy_version": revision.approval_policy_version,
            # Frozen at approval; `formula`/`revision` above show CURRENT master data.
            "approved_identity": revision.approved_identity_snapshot,
        },
        "target_output_quantity": str(target),
        "scale_factor": factor,
        "lines": rows,
        "raw_line_count": sum(1 for r in rows if r["material_type"] == "RAW_MATERIAL"),
        "packaging_line_count": sum(1 for r in rows if r["material_type"] == "PACKAGING_MATERIAL"),
        "calculation_complete": not issues,
        "calculation_issues": issues,
        "warnings": warnings,
    }
