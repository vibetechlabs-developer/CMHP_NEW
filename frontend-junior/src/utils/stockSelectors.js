/**
 * Single Source of Truth Stock Selector & Calculation Engine
 *
 * Guarantees that stock numbers across Products, Common Inventory,
 * Stock Ledger, Orders, and Production are always strictly 100% consistent.
 */

export function getItemLedgerEntries(state, itemIdentifier) {
  const erp = state?.erp || state || {}
  const entries = Array.isArray(erp.stockLedgerEntries) ? erp.stockLedgerEntries : []
  if (!itemIdentifier) return entries

  const id = itemIdentifier.id ? String(itemIdentifier.id) : null
  const code = itemIdentifier.code ? String(itemIdentifier.code).trim().toLowerCase() : null
  const name = itemIdentifier.name ? String(itemIdentifier.name).trim().toLowerCase() : null

  return entries.filter((entry) => {
    if (id && String(entry.item_id) === id) return true
    if (code && String(entry.item_code).trim().toLowerCase() === code) return true
    if (name && String(entry.item_name).trim().toLowerCase() === name) return true
    return false
  })
}

export function calculateItemStockFromLedger(state, itemIdentifier, defaultStock = 0) {
  const entries = getItemLedgerEntries(state, itemIdentifier)

  if (entries.length === 0) {
    return Number(defaultStock) || 0
  }

  let balance = 0
  let hasOpening = false

  entries.forEach((entry) => {
    if (entry.reversed) return

    if (entry.type === 'OPENING') {
      balance += Number(entry.received_quantity) || 0
      hasOpening = true
    } else if (entry.type === 'INWARD') {
      balance += Number(entry.received_quantity) || 0
    } else if (entry.type === 'OUTWARD') {
      balance -= Number(entry.issued_quantity) || 0
    } else if (entry.type === 'ADJUSTMENT') {
      if (entry.physical_stock !== undefined && entry.physical_stock !== null) {
        balance = Number(entry.physical_stock) || 0
      } else {
        balance += Number(entry.variance) || 0
      }
    }
  })

  // If there are transactions but no explicit opening stock row, include defaultStock
  if (!hasOpening && defaultStock > 0 && balance >= 0) {
    balance += Number(defaultStock)
  }

  return Math.max(0, balance)
}

/**
 * Primary selector for an item's current available stock
 */
export function selectItemStock(state, itemIdentifier) {
  const erp = state?.erp || state || {}
  if (!itemIdentifier) return 0

  const id = itemIdentifier.id ? String(itemIdentifier.id) : null
  const code = itemIdentifier.code ? String(itemIdentifier.code).trim().toLowerCase() : null
  const name = itemIdentifier.name ? String(itemIdentifier.name).trim().toLowerCase() : null

  // Check Common Raw Materials
  const rawMaterials = Array.isArray(erp.commonRawMaterials) ? erp.commonRawMaterials : []
  const rawMatch = rawMaterials.find(
    (m) =>
      (id && String(m.id) === id) ||
      (code && String(m.code).trim().toLowerCase() === code) ||
      (name && String(m.name).trim().toLowerCase() === name)
  )

  // Check Common Products
  const products = Array.isArray(erp.commonProducts) ? erp.commonProducts : []
  const prodMatch = products.find(
    (p) =>
      (id && String(p.id) === id) ||
      (code && String(p.code).trim().toLowerCase() === code) ||
      (name && String(p.name).trim().toLowerCase() === name)
  )

  const defaultStock = rawMatch ? rawMatch.current_stock : prodMatch ? prodMatch.current_stock : 0

  return calculateItemStockFromLedger(state, itemIdentifier, defaultStock)
}

/**
 * Checks whether required stock is available (prevents negative stock)
 */
export function selectCanIssueStock(state, itemIdentifier, requiredQty) {
  const current = selectItemStock(state, itemIdentifier)
  const req = Number(requiredQty) || 0
  return {
    available: current,
    required: req,
    sufficient: current >= req,
    shortage: Math.max(0, req - current),
  }
}

/**
 * Calculate BOM formula requirements against current stock
 * and identify any raw material shortages.
 */
export function checkFormulaStockAvailability(state, formula, requiredBatchQty, requiredBatchUnit = 'kg') {
  if (!formula) {
    return {
      canProduce: false,
      error: 'Formula not provided',
      materials: [],
      hasShortage: true,
      totalShortageCount: 1,
    }
  }

  const fBaseQty = Number(formula.base_quantity) || 1
  const reqBatchQty = Number(requiredBatchQty) || 0

  if (reqBatchQty <= 0) {
    return {
      canProduce: false,
      error: 'Batch quantity must be greater than 0',
      materials: [],
      hasShortage: false,
      totalShortageCount: 0,
    }
  }

  const activeRevision = (formula.revisions && formula.revisions[formula.revisions.length - 1]) || {}
  const formulaMaterials = activeRevision.materials || []

  // Scale factor: requiredBatchQty / formulaBaseQty
  const scaleFactor = reqBatchQty / fBaseQty

  let hasShortage = false
  let totalShortageCount = 0

  const materialChecks = formulaMaterials.map((mat) => {
    const baseQty = Number(mat.base_quantity) || 0
    const requiredAmount = baseQty * scaleFactor

    // Look up material in common raw materials or items
    const availableStock = selectItemStock(state, {
      id: mat.id || mat.item_id,
      code: mat.code,
      name: mat.name,
    })

    const shortage = Math.max(0, requiredAmount - availableStock)
    const isSufficient = availableStock >= requiredAmount

    if (!isSufficient) {
      hasShortage = true
      totalShortageCount += 1
    }

    return {
      id: mat.id,
      name: mat.name,
      code: mat.code,
      unit: mat.unit || 'kg',
      baseQuantity: baseQty,
      requiredAmount,
      availableStock,
      shortage,
      isSufficient,
    }
  })

  return {
    canProduce: !hasShortage,
    hasShortage,
    totalShortageCount,
    scaleFactor,
    materials: materialChecks,
  }
}
