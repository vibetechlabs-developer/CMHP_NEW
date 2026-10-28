/**
 * CMHP Pharmaceutical ERP - Formula & Live Batch Calculation Engine
 * 
 * Supports stoichiometric batch scaling, cross-unit conversions
 * (mg <-> g <-> kg, ml <-> L), sensible decimal rounding,
 * and automatic best-fit pharmaceutical unit representation.
 */

export const UNIT_TYPES = {
  MASS: 'MASS',
  VOLUME: 'VOLUME',
  COUNT: 'COUNT',
}

export const SUPPORTED_UNITS = [
  { value: 'mg', label: 'mg (Milligram)', type: UNIT_TYPES.MASS, toBase: 0.001 },
  { value: 'g', label: 'g (Gram)', type: UNIT_TYPES.MASS, toBase: 1 },
  { value: 'kg', label: 'kg (Kilogram)', type: UNIT_TYPES.MASS, toBase: 1000 },
  { value: 'ml', label: 'ml (Milliliter)', type: UNIT_TYPES.VOLUME, toBase: 1 },
  { value: 'L', label: 'L (Liter)', type: UNIT_TYPES.VOLUME, toBase: 1000 },
]

export const UNIT_MAP = SUPPORTED_UNITS.reduce((acc, u) => {
  acc[u.value] = u
  return acc
}, {})

/**
 * Returns the unit category (MASS, VOLUME, or UNKNOWN)
 */
export function getUnitType(unit) {
  return UNIT_MAP[unit]?.type || UNIT_TYPES.COUNT
}

/**
 * Converts a quantity to its dimension's base unit (g for mass, ml for volume)
 */
export function toDimensionBase(qty, unit) {
  const num = Number(qty) || 0
  const u = UNIT_MAP[unit]
  if (!u) return num
  return num * u.toBase
}

/**
 * Calculates the dimensionless batch scaling factor S
 * S = (Batch Qty in base) / (Formula Base Qty in base)
 */
export function calculateBatchScaleFactor(
  formulaBaseQty,
  formulaBaseUnit,
  requiredBatchQty,
  requiredBatchUnit
) {
  const fQty = Number(formulaBaseQty) || 0
  const bQty = Number(requiredBatchQty) || 0

  if (fQty <= 0 || bQty <= 0) {
    return 0
  }

  const fType = getUnitType(formulaBaseUnit)
  const bType = getUnitType(requiredBatchUnit)

  if (fType === bType && fType !== UNIT_TYPES.COUNT) {
    const fBase = toDimensionBase(fQty, formulaBaseUnit)
    const bBase = toDimensionBase(bQty, requiredBatchUnit)
    if (fBase <= 0) return 0
    return bBase / fBase
  }

  // Fallback for direct matching or non-standard units
  return bQty / fQty
}

/**
 * Formats a number cleanly, rounding up to decimals, trimming trailing zeros
 */
export function formatPharmaNumber(value, maxDecimals = 4) {
  if (value === null || value === undefined || isNaN(value)) {
    return '0'
  }
  const num = Number(value)
  if (num === 0) return '0'

  // Round to maxDecimals without floating point imprecision
  const factor = Math.pow(10, maxDecimals)
  const rounded = Math.round(num * factor) / factor

  // Format with locale commas for readability
  const parts = rounded.toString().split('.')
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return parts.join('.')
}

/**
 * Determines the best-fit pharmaceutical unit and scaled value
 */
export function getBestFitPharmaUnit(rawQty, rawUnit) {
  const num = Number(rawQty) || 0
  const uType = getUnitType(rawUnit)

  if (uType === UNIT_TYPES.MASS) {
    const inGrams = toDimensionBase(num, rawUnit)
    if (inGrams >= 1000) {
      const inKg = inGrams / 1000
      return {
        value: inKg,
        unit: 'kg',
        formatted: `${formatPharmaNumber(inKg, 3)} kg`,
        isDifferent: rawUnit !== 'kg',
      }
    } else if (inGrams >= 1) {
      return {
        value: inGrams,
        unit: 'g',
        formatted: `${formatPharmaNumber(inGrams, 3)} g`,
        isDifferent: rawUnit !== 'g',
      }
    } else {
      const inMg = inGrams * 1000
      return {
        value: inMg,
        unit: 'mg',
        formatted: `${formatPharmaNumber(inMg, 2)} mg`,
        isDifferent: rawUnit !== 'mg',
      }
    }
  }

  if (uType === UNIT_TYPES.VOLUME) {
    const inMl = toDimensionBase(num, rawUnit)
    if (inMl >= 1000) {
      const inL = inMl / 1000
      return {
        value: inL,
        unit: 'L',
        formatted: `${formatPharmaNumber(inL, 3)} L`,
        isDifferent: rawUnit !== 'L',
      }
    } else {
      return {
        value: inMl,
        unit: 'ml',
        formatted: `${formatPharmaNumber(inMl, 2)} ml`,
        isDifferent: rawUnit !== 'ml',
      }
    }
  }

  return {
    value: num,
    unit: rawUnit,
    formatted: `${formatPharmaNumber(num, 3)} ${rawUnit}`,
    isDifferent: false,
  }
}

/**
 * Calculates raw material required quantities for an entire revision
 */
export function calculateRevisionRequirements({
  formulaBaseQty,
  formulaBaseUnit,
  requiredBatchQty,
  requiredBatchUnit,
  materials = [],
}) {
  const scaleFactor = calculateBatchScaleFactor(
    formulaBaseQty,
    formulaBaseUnit,
    requiredBatchQty,
    requiredBatchUnit
  )

  const fBaseQty = Number(formulaBaseQty) || 1

  return materials.map((mat) => {
    const baseQty = Number(mat.base_quantity) || 0
    const rawReqQty = baseQty * scaleFactor
    const bestFit = getBestFitPharmaUnit(rawReqQty, mat.unit)

    // Calculate percentage contribution in formula if same unit type
    const percentage = fBaseQty > 0 ? (baseQty / fBaseQty) * 100 : 0

    return {
      id: mat.id,
      name: mat.name,
      baseUnit: mat.unit,
      baseQuantity: baseQty,
      scaleFactor,
      rawRequiredQuantity: rawReqQty,
      formattedBaseQuantity: `${formatPharmaNumber(baseQty, 3)} ${mat.unit}`,
      formattedRequiredQuantity: `${formatPharmaNumber(rawReqQty, 3)} ${mat.unit}`,
      bestFit,
      percentage: percentage > 0 ? Number(percentage.toFixed(2)) : null,
    }
  })
}
