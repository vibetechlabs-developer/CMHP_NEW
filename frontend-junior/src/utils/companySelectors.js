/**
 * Company Selectors and Helpers
 *
 * Provides scoped access to Redux ERP state for the currently active company.
 *
 * Rules:
 * - Products, Formulas, Invoices, Orders, QC/QA, Supply Chain, and HRMS records
 *   are strictly segregated between CMHP Pharma (cmhp / 1) and Tej Biocare (tej / 2).
 * - Customers and Common Inventory (items, lots, locations, transactions, uoms)
 *   are single shared datasets across both companies.
 */

export const COMPANY_KEYS = {
  CMHP: 'cmhp',
  TEJ: 'tej',
}

export const COMPANY_IDS = {
  CMHP: 2,
  TEJ: 3,
}

export function toCompanyKey(val) {
  if (val === 3 || val === '3' || val === 'tej' || val === 'TEJ' || val === 'company_b') {
    return COMPANY_KEYS.TEJ
  }
  return COMPANY_KEYS.CMHP
}

export function toCompanyId(val) {
  if (val === 3 || val === '3' || val === 'tej' || val === 'TEJ' || val === 'company_b') {
    return COMPANY_IDS.TEJ
  }
  return COMPANY_IDS.CMHP
}

export function selectActiveCompanyKey(state) {
  const erp = state?.erp || state || {}
  if (erp.activeCompanyKey) {
    return toCompanyKey(erp.activeCompanyKey)
  }
  if (erp.activeCompanyId) {
    return toCompanyKey(erp.activeCompanyId)
  }
  return COMPANY_KEYS.CMHP
}

export function selectActiveCompanyId(state) {
  const erp = state?.erp || state || {}
  if (erp.activeCompanyId) {
    return toCompanyId(erp.activeCompanyId)
  }
  if (erp.activeCompanyKey) {
    return toCompanyId(erp.activeCompanyKey)
  }
  return COMPANY_IDS.CMHP
}

/**
 * Generic selector for company-partitioned slice
 */
export function selectCompanySlice(state, sliceName) {
  const erp = state?.erp || state || {}
  const compKey = selectActiveCompanyKey(state)
  const compId = selectActiveCompanyId(state)

  // 1. Check byCompany partition
  if (erp.byCompany?.[compKey]?.[sliceName]) {
    return erp.byCompany[compKey][sliceName]
  }

  // 2. Fallback to filtering top-level slice
  const topList = erp[sliceName]
  if (Array.isArray(topList)) {
    return topList.filter(
      (row) =>
        Number(row?.company) === Number(compId) ||
        row?.companyId === compKey
    )
  }

  return []
}

// -------------------------------------------------------------
// SEPARATE PER COMPANY SELECTORS
// -------------------------------------------------------------

export const selectProducts = (state) => selectCompanySlice(state, 'products')
export const selectFormulas = (state) => selectCompanySlice(state, 'formulas')
export const selectOrders = (state) => selectCompanySlice(state, 'orders')
export const selectBatches = (state) => selectCompanySlice(state, 'batches')
export const selectQcRecords = (state) => selectCompanySlice(state, 'qcRecords')
export const selectQaRecords = (state) => selectCompanySlice(state, 'qaRecords')
export const selectInvoices = (state) => selectCompanySlice(state, 'invoices')
export const selectPayments = (state) => selectCompanySlice(state, 'payments')
export const selectSuppliers = (state) => selectCompanySlice(state, 'suppliers')
export const selectPurchaseOrders = (state) => selectCompanySlice(state, 'purchaseOrders')
export const selectGoodsReceipts = (state) => selectCompanySlice(state, 'goodsReceipts')
export const selectPurchaseBills = (state) => selectCompanySlice(state, 'purchaseBills')
export const selectInternalAllocations = (state) => selectCompanySlice(state, 'internalAllocations')
export const selectDispatches = (state) => selectCompanySlice(state, 'dispatches')
export const selectSalesReturns = (state) => selectCompanySlice(state, 'salesReturns')
export const selectRecalls = (state) => selectCompanySlice(state, 'recalls')
export const selectCreditNotes = (state) => selectCompanySlice(state, 'creditNotes')
export const selectFormulaApprovals = (state) => selectCompanySlice(state, 'formulaApprovals')

// HRMS Selectors
export const selectDesignations = (state) => selectCompanySlice(state, 'designations')
export const selectShifts = (state) => selectCompanySlice(state, 'shifts')
export const selectHolidays = (state) => selectCompanySlice(state, 'holidays')
export const selectLeaveTypes = (state) => selectCompanySlice(state, 'leaveTypes')
export const selectAttendance = (state) => selectCompanySlice(state, 'attendance')
export const selectLeaveRequests = (state) => selectCompanySlice(state, 'leaveRequests')
export const selectSalaryStructures = (state) => selectCompanySlice(state, 'salaryStructures')
export const selectPayrollRuns = (state) => selectCompanySlice(state, 'payrollRuns')

// -------------------------------------------------------------
// SHARED SELECTORS (Common to both companies)
// -------------------------------------------------------------

/**
 * Customers: one common customer list visible in both companies
 */
export const selectCustomers = (state) => {
  const erp = state?.erp || state || {}
  return erp.customers || []
}

/**
 * Common Inventory: one shared, mixed data set for everyone
 */
export const selectCommonInventoryItems = (state) => {
  const erp = state?.erp || state || {}
  return erp.items || []
}

export const selectCommonInventoryLots = (state) => {
  const erp = state?.erp || state || {}
  return erp.lots || []
}

export const selectCommonInventoryLocations = (state) => {
  const erp = state?.erp || state || {}
  return erp.locations || []
}

export const selectCommonInventoryTransactions = (state) => {
  const erp = state?.erp || state || {}
  return erp.transactions || []
}

export const selectCommonInventoryUoms = (state) => {
  const erp = state?.erp || state || {}
  return erp.uoms || []
}
