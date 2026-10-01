"""Task 12B-2: shared quantity/unit validation rules for `BatchPlan`.

Used by BOTH `apps.batch_plans.models.BatchPlan.clean()` (a defensive,
in-memory backstop - the same "model AND service both check" pattern this
project uses everywhere else, e.g. `FormulaRevision.clean()` mirroring
`apps.formulas.approval`) and `apps.batch_plans.services` (the authoritative
check, run under the real row locks). One implementation, so the two paths
can never silently drift apart.

TWO SUPPORTED SOURCE SHAPES (mutually exclusive, never inferred from one
another):

A. SAME-UNIT (no packing fields at all): the source order line's product
   sales unit must equal the formula revision's own output unit, exactly as
   Task 12A originally required. `target_output_quantity` is in that unit.

B. EXPLICIT PACKING RELATIONSHIP (`planned_pack_quantity` +
   `packing_content_quantity` + `packing_content_uom` - all three, always
   together): the order line's product sales unit must be COUNT (e.g.
   bottles); the packing content unit must be a MASS or VOLUME unit of the
   SAME dimension as the formula's output unit, and BOTH units must carry an
   explicit `UnitOfMeasure.canonical_factor` (Task 12B-2) - never inferred
   from unit names/codes, never defaulted. `target_output_quantity` is
   STILL in the formula's own output unit and is STILL a separate, explicit
   manufacturing target - it is never derived from `planned_pack_quantity`/
   `packing_content_quantity`.

MASS is never converted to VOLUME or vice versa (that would need a density,
which nothing here models). An unknown conversion (either unit missing its
`canonical_factor`) fails clearly rather than guessing one.
"""

from fractions import Fraction

from django.core.exceptions import ValidationError

from apps.catalog.models import UnitOfMeasure

PACKING_FIELD_NAMES = ("planned_pack_quantity", "packing_content_quantity", "packing_content_uom_id")


def validate_quantity_precision(value, *, field, label, max_decimal_places=3, max_integer_digits=11):
    """Same shape rule every quantity in this project follows (see
    apps.formulas.requirement_preview.parse_target_output_quantity and
    apps.batch_plans.services._check_target_quantity, which this mirrors).
    """
    if value is None:
        raise ValidationError({field: f"{label} is required."})
    if value <= 0:
        raise ValidationError({field: f"{label} must be greater than zero."})
    text = format(value, "f")
    integer_part, _, fraction_part = text.partition(".")
    if len(fraction_part) > max_decimal_places:
        raise ValidationError({field: f"At most {max_decimal_places} decimal places are allowed."})
    if len(integer_part.lstrip("0") or "0") > max_integer_digits:
        raise ValidationError({field: f"At most {max_integer_digits} integer digits are allowed."})


def validate_target_quantity(quantity, output_unit, *, field="target_output_quantity", label="Target output quantity"):
    """`target_output_quantity` retains its ORIGINAL meaning unchanged
    (Task 12A): a positive quantity in the formula revision's own output
    unit, whole if that unit is COUNT. Never derived from packing fields.
    """
    validate_quantity_precision(quantity, field=field, label=label)
    if output_unit is not None and output_unit.dimension == UnitOfMeasure.Dimension.COUNT and quantity % 1 != 0:
        raise ValidationError({field: f"Whole numbers are required for {output_unit.code} (COUNT unit)."})


def validate_packing_relationship(*, pack_unit, output_unit, planned_pack_quantity, packing_content_quantity,
                                  packing_content_uom):
    """Shape B only - call only once all three fields are known to be
    present (see `validate_unit_relationship`).
    """
    errors = {}
    if pack_unit.dimension != UnitOfMeasure.Dimension.COUNT:
        errors["planned_pack_quantity"] = (
            f"A packing relationship requires the order line's own unit ('{pack_unit.code}') to be a COUNT unit."
        )
    if packing_content_uom.dimension not in (UnitOfMeasure.Dimension.MASS, UnitOfMeasure.Dimension.VOLUME):
        errors["packing_content_uom_id"] = f"Packing content unit '{packing_content_uom.code}' must be a MASS or VOLUME unit."
    elif packing_content_uom.dimension != output_unit.dimension:
        errors["packing_content_uom_id"] = (
            f"Packing content unit '{packing_content_uom.code}' ({packing_content_uom.dimension}) is not compatible "
            f"with the formula's output unit '{output_unit.code}' ({output_unit.dimension}). Mass is never converted "
            "to volume, or volume to mass."
        )
    elif packing_content_uom.canonical_factor is None or output_unit.canonical_factor is None:
        errors["packing_content_uom_id"] = (
            f"No conversion is defined between '{packing_content_uom.code}' and '{output_unit.code}'. An "
            "administrator must set a canonical conversion factor for both units (Task 12B-2) before this "
            "combination can be used - unknown conversion relationships are never guessed at."
        )
    if errors:
        raise ValidationError(errors)

    if planned_pack_quantity is None or planned_pack_quantity <= 0:
        errors["planned_pack_quantity"] = "Planned pack quantity must be greater than zero."
    elif planned_pack_quantity % 1 != 0:
        errors["planned_pack_quantity"] = "Planned pack quantity must be a whole number (the order line's unit is a COUNT unit)."
    if packing_content_quantity is None or packing_content_quantity <= 0:
        errors["packing_content_quantity"] = "Packing content quantity must be greater than zero."
    if errors:
        raise ValidationError(errors)

    validate_quantity_precision(planned_pack_quantity, field="planned_pack_quantity", label="Planned pack quantity")
    validate_quantity_precision(
        packing_content_quantity, field="packing_content_quantity", label="Packing content quantity"
    )


def validate_unit_relationship(*, pack_unit, output_unit, planned_pack_quantity, packing_content_quantity,
                               packing_content_uom):
    """Decides between shape A and shape B, and validates whichever applies.
    A partial set (1 or 2 of the 3 packing fields) is always rejected -
    naming exactly which are missing - never silently treated as "no
    packing relationship".
    """
    supplied = {
        "planned_pack_quantity": planned_pack_quantity is not None,
        "packing_content_quantity": packing_content_quantity is not None,
        "packing_content_uom_id": packing_content_uom is not None,
    }
    if any(supplied.values()) and not all(supplied.values()):
        missing = [name for name, present in supplied.items() if not present]
        raise ValidationError(
            {
                field: (
                    "A packing relationship requires planned_pack_quantity, packing_content_quantity and "
                    "packing_content_uom_id together - this field is missing."
                )
                for field in missing
            }
        )

    if not any(supplied.values()):
        if pack_unit.id != output_unit.id:
            raise ValidationError(
                {
                    "packing_content_uom_id": (
                        f"The formula revision's output unit ('{output_unit.code}') does not match the order "
                        f"line's own unit ('{pack_unit.code}'). Either choose a formula revision whose output unit "
                        "matches, or supply an explicit packing relationship (planned_pack_quantity, "
                        "packing_content_quantity, packing_content_uom_id)."
                    )
                }
            )
        return

    validate_packing_relationship(
        pack_unit=pack_unit,
        output_unit=output_unit,
        planned_pack_quantity=planned_pack_quantity,
        packing_content_quantity=packing_content_quantity,
        packing_content_uom=packing_content_uom,
    )


def compute_expected_packed_content(*, planned_pack_quantity, packing_content_quantity, packing_content_uom,
                                    output_unit):
    """Exact-fraction conversion (Task 12B-2): `planned_pack_quantity *
    packing_content_quantity`, converted from `packing_content_uom` into
    `output_unit` via their `canonical_factor`s. Returns a `Fraction`.
    Raises `ValueError` if either unit lacks a `canonical_factor` - callers
    that reach this point are expected to have already validated that via
    `validate_packing_relationship`; this is a defensive re-check, not the
    primary one.
    """
    if packing_content_uom.canonical_factor is None or output_unit.canonical_factor is None:
        raise ValueError("Cannot compute expected packed content without both units' canonical_factor.")
    packs = Fraction(str(planned_pack_quantity))
    content = Fraction(str(packing_content_quantity))
    content_factor = Fraction(str(packing_content_uom.canonical_factor))
    output_factor = Fraction(str(output_unit.canonical_factor))
    return packs * content * content_factor / output_factor
