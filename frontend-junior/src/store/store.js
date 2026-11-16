import {
  configureStore,
} from '@reduxjs/toolkit'

import erpReducer, {
  initialState,
} from './erpSlice'

import {
  loadPersistedERPState,
  savePersistedERPState,
} from './persistence'

import {
  recordAudit,
} from '../utils/audit'

import {
  migrateDocumentNumbers,
} from '../utils/documentNumbers'


function buildInitialERPState() {
  const savedState =
    loadPersistedERPState()

  if (
    !savedState ||
    typeof savedState !== 'object'
  ) {
    migrateDocumentNumbers(initialState)
    return {
      ...initialState,
    }
  }

  const result = {
    ...initialState,
  }

  Object.keys(
    initialState
  ).forEach(
    (key) => {
      if (
        Object.prototype.hasOwnProperty.call(
          savedState,
          key
        ) &&
        savedState[key] !== undefined &&
        savedState[key] !== null
      ) {
        result[key] =
          savedState[key]
      }
    }
  )

  // Hydrate empty arrays with seed data if saved state has no records for them
  const seedIfEmptyKeys = [
    'lots', 'commonProducts', 'commonRawMaterials', 'orders',
    'customers', 'suppliers', 'issueHistory', 'stockReturns',
    'qcRecords', 'qaRecords', 'purchaseOrders', 'dispatches'
  ]
  seedIfEmptyKeys.forEach((key) => {
    if (!Array.isArray(result[key]) || result[key].length === 0) {
      if (Array.isArray(initialState[key]) && initialState[key].length > 0) {
        result[key] = JSON.parse(JSON.stringify(initialState[key]))
      }
    }
  })

  // Ensure byCompany structure exists
  if (!result.byCompany) {
    result.byCompany = { cmhp: {}, tej: {} }
  }
  if (!result.byCompany.cmhp) result.byCompany.cmhp = {}
  if (!result.byCompany.tej) result.byCompany.tej = {}

  // List of company-specific slices that must be partitioned
  const companySlices = [
    'products', 'formulas', 'orders', 'batches', 'qcRecords', 'qaRecords',
    'invoices', 'payments', 'suppliers', 'purchaseOrders', 'goodsReceipts',
    'purchaseBills', 'internalAllocations', 'dispatches', 'salesReturns',
    'recalls', 'creditNotes', 'designations', 'shifts', 'holidays',
    'leaveTypes', 'attendance', 'leaveRequests', 'salaryStructures',
    'payrollRuns', 'payrollAdjustments', 'attendanceRegularizations', 'quotations'
  ]

  companySlices.forEach((slice) => {
    const rootList = Array.isArray(result[slice]) ? result[slice] : []
    const cmhpExisting = Array.isArray(result.byCompany.cmhp[slice]) ? result.byCompany.cmhp[slice] : []
    const tejExisting = Array.isArray(result.byCompany.tej[slice]) ? result.byCompany.tej[slice] : []

    // If byCompany had no data for this slice but root array has data, partition it
    if (cmhpExisting.length === 0 && tejExisting.length === 0 && rootList.length > 0) {
      result.byCompany.cmhp[slice] = []
      result.byCompany.tej[slice] = []

      rootList.forEach((row) => {
        // DB: Company 3 = Tej Biocare, Company 2 = CMHP
        const isTej = Number(row?.company) === 3 || row?.companyId === 'tej' || row?.company_code === 'TEJ'
        const compKey = isTej ? 'tej' : 'cmhp'
        const compId = isTej ? 3 : 2
        const stamped = {
          ...row,
          company: row?.company !== undefined ? Number(row.company) : compId,
          companyId: row?.companyId || compKey,
        }
        result.byCompany[compKey][slice].push(stamped)
      })
    } else {
      // Ensure records in byCompany have both company and companyId stamped
      result.byCompany.cmhp[slice] = (result.byCompany.cmhp[slice] || []).map((row) => ({
        ...row,
        company: row.company || 2,
        companyId: 'cmhp',
      }))
      result.byCompany.tej[slice] = (result.byCompany.tej[slice] || []).map((row) => ({
        ...row,
        company: row.company || 3,
        companyId: 'tej',
      }))
    }

    // Keep root array populated with all items, stamped with company & companyId
    result[slice] = [
      ...(result.byCompany.cmhp[slice] || []),
      ...(result.byCompany.tej[slice] || []),
    ]
  })

  // Ensure activeCompanyId & activeCompanyKey
  // DB: Company 2 = CMHP, Company 3 = Tej Biocare
  if (result.activeCompanyId === 3 || result.activeCompanyId === '3' || result.activeCompanyId === 'tej' || result.activeCompanyId === 'company_b' || result.activeCompanyKey === 'tej') {
    result.activeCompanyId = 3
    result.activeCompanyKey = 'tej'
  } else {
    result.activeCompanyId = 2
    result.activeCompanyKey = 'cmhp'
  }

  if (Array.isArray(result.companies)) {
    result.companies = result.companies.map((c) => {
      if ((c.id === 2 || c.id === 1) && (c.name === 'Company A' || c.code === 'COMP-A')) {
        return { ...c, id: 2, name: 'CMHP Pharma', code: 'CMHP' }
      }
      if (c.id === 3 && (c.name === 'Company B' || c.code === 'COMP-B')) {
        return { ...c, name: 'Tej Biocare', code: 'TEJ' }
      }
      return c
    })
  }

  migrateDocumentNumbers(
    result
  )

  return result
}


/*
 * AUDIT MIDDLEWARE
 *
 * Every ERP mutation such as:
 * add user
 * edit order
 * delete product
 * approve leave
 * mark attendance
 * update salary
 * inventory changes
 *
 * is automatically recorded.
 */

const auditMiddleware =
  (storeApi) =>
  (next) =>
  (action) => {
    const result =
      next(action)

    if (
      action?.type?.startsWith(
        'erp/'
      )
    ) {
      recordAudit({
        action:
          action.type,

        payload:
          action.payload,

        state:
          storeApi
            .getState()
            .erp,
      })
    }

    return result
  }


export const store =
  configureStore({
    reducer: {
      erp:
        erpReducer,
    },

    preloadedState: {
      erp:
        buildInitialERPState(),
    },

    middleware:
      (getDefaultMiddleware) =>
        getDefaultMiddleware({
          serializableCheck:
            true,
        }).concat(
          auditMiddleware
        ),
  })


let lastSavedState =
  null


store.subscribe(() => {
  const currentState =
    store
      .getState()
      .erp

  if (
    currentState ===
    lastSavedState
  ) {
    return
  }

  lastSavedState =
    currentState

  savePersistedERPState(
    currentState
  )
})


export default store