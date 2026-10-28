import { createSlice } from '@reduxjs/toolkit'
import {
  SEED_PRODUCTS,
  SEED_RAW_MATERIALS,
  SEED_LOTS,
  SEED_ORDERS,
  SEED_CUSTOMERS,
  SEED_SUPPLIERS,
  SEED_ISSUE_HISTORY,
  SEED_STOCK_RETURNS,
  SEED_QC_RECORDS,
  SEED_QA_RECORDS,
  SEED_PURCHASE_ORDERS,
  SEED_GOODS_RECEIPTS,
  SEED_DISPATCHES,
  SEED_FORMULAS,
  SEED_FORMULA_APPROVALS,
} from './seedData'


let lastGeneratedId =
  Date.now()


const nextId = () => {

  const now =
    Date.now()


  if (
    now >
    lastGeneratedId
  ) {

    lastGeneratedId =
      now

  } else {

    lastGeneratedId += 1

  }


  return lastGeneratedId

}


const nowIso = () =>
  new Date().toISOString()


function patchById(
  list,
  id,
  payload
) {

  const item =
    list.find(
      (x) =>
        Number(x.id) ===
        Number(id)
    )


  if (item) {

    Object.assign(
      item,
      payload
    )

  }

}


function deleteById(
  list,
  id
) {

  const index =
    list.findIndex(
      (x) =>
        Number(x.id) ===
        Number(id)
    )


  if (
    index !== -1
  ) {

    list.splice(
      index,
      1
    )

  }

}


function setStatusById(
  list,
  id,
  is_active
) {

  const item =
    list.find(
      (x) =>
        Number(x.id) ===
        Number(id)
    )


  if (item) {

    item.is_active =
      is_active

  }

}


function resolveCompanyKey(state, payload) {
  if (payload?.companyId === 'tej' || payload?.companyId === 'cmhp') {
    return payload.companyId
  }
  const comp = Number(payload?.company)
  if (comp === 2) return 'tej'
  if (comp === 1) return 'cmhp'
  return state?.activeCompanyKey || (state?.activeCompanyId === 2 ? 'tej' : 'cmhp')
}

function ensureByCompanyState(state) {
  if (!state.byCompany) {
    state.byCompany = { cmhp: {}, tej: {} }
  }
  if (!state.byCompany.cmhp) state.byCompany.cmhp = {}
  if (!state.byCompany.tej) state.byCompany.tej = {}
}

function addCompanyEntity(state, sliceName, item) {
  ensureByCompanyState(state)
  const key = resolveCompanyKey(state, item)
  const compId = key === 'tej' ? 2 : 1
  const stamped = {
    ...item,
    company: item.company !== undefined ? Number(item.company) : compId,
    companyId: item.companyId || key,
  }
  if (!Array.isArray(state.byCompany[key][sliceName])) {
    state.byCompany[key][sliceName] = []
  }
  state.byCompany[key][sliceName].push(stamped)
  if (!Array.isArray(state[sliceName])) {
    state[sliceName] = []
  }
  state[sliceName].push(stamped)
  return stamped
}

function patchCompanyEntity(state, sliceName, id, payload) {
  ensureByCompanyState(state)
  if (state.byCompany?.cmhp?.[sliceName]) {
    patchById(state.byCompany.cmhp[sliceName], id, payload)
  }
  if (state.byCompany?.tej?.[sliceName]) {
    patchById(state.byCompany.tej[sliceName], id, payload)
  }
  if (state[sliceName]) {
    patchById(state[sliceName], id, payload)
  }
}

function deleteCompanyEntity(state, sliceName, id) {
  ensureByCompanyState(state)
  if (state.byCompany?.cmhp?.[sliceName]) {
    deleteById(state.byCompany.cmhp[sliceName], id)
  }
  if (state.byCompany?.tej?.[sliceName]) {
    deleteById(state.byCompany.tej[sliceName], id)
  }
  if (state[sliceName]) {
    deleteById(state[sliceName], id)
  }
}


/*
|--------------------------------------------------------------------------
| INITIAL STATE
|--------------------------------------------------------------------------
*/


export const initialState = {

  activeCompanyId: 1,
  activeCompanyKey: 'cmhp',

  byCompany: {
    cmhp: {
      products: [],
      formulas: SEED_FORMULAS.filter((f) => f.company === 1),
      formulaApprovals: SEED_FORMULA_APPROVALS.filter((a) => a.company === 1),
      orders: [],
      batches: [],
      qcRecords: [],
      qaRecords: [],
      invoices: [],
      payments: [],
      suppliers: [],
      purchaseOrders: [],
      goodsReceipts: [],
      purchaseBills: [],
      internalAllocations: [],
      dispatches: [],
      salesReturns: [],
      recalls: [],
      creditNotes: [],
      designations: [],
      shifts: [],
      holidays: [],
      leaveTypes: [],
      attendance: [],
      leaveRequests: [],
      salaryStructures: [],
      payrollRuns: [],
      payrollAdjustments: [],
      attendanceRegularizations: [],
      quotations: [],
    },
    tej: {
      products: [],
      formulas: SEED_FORMULAS.filter((f) => f.company === 2),
      formulaApprovals: SEED_FORMULA_APPROVALS.filter((a) => a.company === 2),
      orders: [],
      batches: [],
      qcRecords: [],
      qaRecords: [],
      invoices: [],
      payments: [],
      suppliers: [],
      purchaseOrders: [],
      goodsReceipts: [],
      purchaseBills: [],
      internalAllocations: [],
      dispatches: [],
      salesReturns: [],
      recalls: [],
      creditNotes: [],
      designations: [],
      shifts: [],
      holidays: [],
      leaveTypes: [],
      attendance: [],
      leaveRequests: [],
      salaryStructures: [],
      payrollRuns: [],
      payrollAdjustments: [],
      attendanceRegularizations: [],
      quotations: [],
    },
  },

  /*
  |--------------------------------------------------------------------------
  | FIXED COMPANIES
  |--------------------------------------------------------------------------
  */

  companies: [

    {
      id: 1,
      name: 'CMHP Pharma',
      legal_name: 'CMHP Pharmaceuticals Pvt. Ltd.',
      code: 'CMHP',
      gstin: '24AAACC1234F1Z5',
      pan: 'AAACC1234F',
      state: 'Gujarat',
      state_code: '24',
      registered_address: 'Plot No. 102, GIDC Industrial Estate, Ankleshwar, Gujarat, India - 393002',
      contact_email: 'billing@cmhp.com',
      contact_phone: '+91 98765 43210',
      bank_name: 'State Bank of India',
      bank_account_number: '38491029384',
      bank_ifsc: 'SBIN0001234',
      bank_branch: 'GIDC Ankleshwar',
      terms_and_conditions: '1. Goods once sold will not be accepted back.\n2. Interest @18% p.a. will be charged on overdue payments.\n3. Subject to Ankleshwar jurisdiction.',
      tax_enabled: true,
      default_tax_rate: 18,
      is_active: true,
    },

    {
      id: 2,
      name: 'Tej Biocare',
      legal_name: 'Tej Biocare Healthcare Pvt. Ltd.',
      code: 'TEJ',
      gstin: '24BBBCC5678G1Z2',
      pan: 'BBBCC5678G',
      state: 'Gujarat',
      state_code: '24',
      registered_address: 'Survey No. 45/2, Chhatral GIDC, Gandhinagar, Gujarat, India - 382729',
      contact_email: 'accounts@tejbiocare.com',
      contact_phone: '+91 98765 99999',
      bank_name: 'HDFC Bank',
      bank_account_number: '50200012345678',
      bank_ifsc: 'HDFC0001824',
      bank_branch: 'Gandhinagar',
      terms_and_conditions: '1. Payment due as per agreed terms.\n2. Goods dispatched at buyer\'s risk.\n3. Subject to Gandhinagar jurisdiction.',
      tax_enabled: true,
      default_tax_rate: 18,
      is_active: true,
    },

  ],


  /*
  |--------------------------------------------------------------------------
  | SYSTEM / ADMINISTRATION
  |--------------------------------------------------------------------------
  */

  departments: [],


  users: [

    {
      id: 1,

      username:
        'admin',

      password:
        'admin123',

      first_name:
        'Fenil',

      last_name:
        'Rami',

      email:
        'admin@cmhp.com',

      role:
        'SUPER_ADMIN',

      companies:
        [1, 2],

      department:
        null,

      employee_id:
        'EMP-0001',

      designation:
        'System Administrator',

      phone:
        '',

      joining_date:
        '',

      employment_status:
        'ACTIVE',

      can_access_common_inventory:
        true,

      is_active:
        true,

    },

  ],


  /*
  |--------------------------------------------------------------------------
  | UOM
  |--------------------------------------------------------------------------
  */

  uoms: [

    {
      id: 1,
      code: 'KG',
      name: 'Kilogram',
      is_active: true,
    },

    {
      id: 2,
      code: 'GM',
      name: 'Gram',
      is_active: true,
    },

    {
      id: 3,
      code: 'LTR',
      name: 'Litre',
      is_active: true,
    },

    {
      id: 4,
      code: 'NOS',
      name: 'Numbers',
      is_active: true,
    },

    {
      id: 5,
      code: 'BOX',
      name: 'Box',
      is_active: true,
    },

  ],


  /*
  |--------------------------------------------------------------------------
  | INVENTORY
  |--------------------------------------------------------------------------
  */

  commonProducts: [...SEED_PRODUCTS],
  commonRawMaterials: [...SEED_RAW_MATERIALS],

  stockLedgerEntries: [],

  items: [],

  lots: [...SEED_LOTS],

  transactions: [],
  issueHistory: [...SEED_ISSUE_HISTORY],
  stockReturns: [...SEED_STOCK_RETURNS],


  /*
  |--------------------------------------------------------------------------
  | OPERATIONS
  |--------------------------------------------------------------------------
  */

  products: [...SEED_PRODUCTS],

  customers: [...SEED_CUSTOMERS],

  formulas: [...SEED_FORMULAS],
  formulaApprovals: [...SEED_FORMULA_APPROVALS],

  qcRecords: [...SEED_QC_RECORDS],

  qaRecords: [...SEED_QA_RECORDS],

  payments: [],

  payrollRuns: [],

  payrollAdjustments: [],

  attendanceRegularizations: [],

  payrollSettings: {
    pf_enabled: true,
    pf_rate: 12,
    pf_cap: 15000,
    esi_enabled: true,
    esi_rate: 0.75,
    esi_threshold: 21000,
    pt_enabled: true,
    pt_amount: 200,
  },

  quotations: [],

  orders: [...SEED_ORDERS],

  batches: [],


  /*
  |--------------------------------------------------------------------------
  | INVOICING
  |--------------------------------------------------------------------------
  */

  invoices: [],


  /*
  |--------------------------------------------------------------------------
  | SUPPLY CHAIN
  |--------------------------------------------------------------------------
  */

  suppliers: [...SEED_SUPPLIERS],

  purchaseOrders: [...SEED_PURCHASE_ORDERS],

  goodsReceipts: [...SEED_GOODS_RECEIPTS],

  purchaseBills: [],

  internalAllocations: [],

  dispatches: [...SEED_DISPATCHES],

  salesReturns: [],

  recalls: [],

  creditNotes: [],


  /*
  |--------------------------------------------------------------------------
  | HRMS MASTERS
  |--------------------------------------------------------------------------
  */

  designations: [],

  shifts: [],

  holidays: [],

  leaveTypes: [],


  /*
  |--------------------------------------------------------------------------
  | HRMS ATTENDANCE / LEAVE
  |--------------------------------------------------------------------------
  */

  attendance: [],

  leaveRequests: [],


  /*
  |--------------------------------------------------------------------------
  | PAYROLL
  |--------------------------------------------------------------------------
  */

  salaryStructures: [],

}


const erpSlice = createSlice({

  name:
    'erp',

  initialState,


  reducers: {


    /*
    |--------------------------------------------------------------------------
    | COMPANIES
    |--------------------------------------------------------------------------
    */


    setActiveCompanyId: (
      state,
      action
    ) => {
      const val = action.payload
      if (val === 2 || val === '2' || val === 'tej' || val === 'company_b') {
        state.activeCompanyId = 2
        state.activeCompanyKey = 'tej'
      } else if (val === null || val === 'common_inventory') {
        state.activeCompanyId = null
        state.activeCompanyKey = null
      } else {
        state.activeCompanyId = 1
        state.activeCompanyKey = 'cmhp'
      }
    },

    editCompany: (
      state,
      action
    ) => {

      patchById(

        state.companies,

        action.payload.id,

        action.payload.payload

      )

    },


    setCompanyStatus: (
      state,
      action
    ) => {

      setStatusById(

        state.companies,

        action.payload.id,

        action.payload.is_active

      )

    },


    /*
    |--------------------------------------------------------------------------
    | DEPARTMENTS
    |--------------------------------------------------------------------------
    */


    addDepartment: (
      state,
      action
    ) => {

      state.departments.push({

        id:
          nextId(),

        is_active:
          true,

        ...action.payload,

      })

    },


    editDepartment: (
      state,
      action
    ) => {

      patchById(

        state.departments,

        action.payload.id,

        action.payload.payload

      )

    },


    deleteDepartment: (
      state,
      action
    ) => {

      deleteById(

        state.departments,

        action.payload.id

      )

    },


    setDepartmentStatus: (
      state,
      action
    ) => {

      setStatusById(

        state.departments,

        action.payload.id,

        action.payload.is_active

      )

    },


    /*
    |--------------------------------------------------------------------------
    | USERS
    |--------------------------------------------------------------------------
    */


    addUser: (
      state,
      action
    ) => {

      state.users.push({

        id:
          nextId(),

        is_active:
          true,

        ...action.payload,

      })

    },


    editUserAccess: (
      state,
      action
    ) => {

      patchById(

        state.users,

        action.payload.id,

        action.payload.payload

      )

    },


    deleteUser: (
      state,
      action
    ) => {

      deleteById(

        state.users,

        action.payload.id

      )

    },


    setUserStatus: (
      state,
      action
    ) => {

      setStatusById(

        state.users,

        action.payload.id,

        action.payload.is_active

      )

    },


    /*
    |--------------------------------------------------------------------------
    /*
    |--------------------------------------------------------------------------
    | COMMON INVENTORY - PRODUCTS & RAW MATERIALS
    |--------------------------------------------------------------------------
    */

    addCommonProduct: (state, action) => {
      if (!state.commonProducts) state.commonProducts = []
      state.commonProducts.push({
        id: nextId(),
        created_at: nowIso(),
        current_stock: 0,
        reorder_level: 0,
        unit_cost: 0,
        ...action.payload,
      })
    },

    editCommonProduct: (state, action) => {
      if (!state.commonProducts) state.commonProducts = []
      patchById(state.commonProducts, action.payload.id, action.payload.payload)
    },

    deleteCommonProduct: (state, action) => {
      if (!state.commonProducts) state.commonProducts = []
      deleteById(state.commonProducts, action.payload.id)
    },

    bulkImportCommonProducts: (state, action) => {
      if (!state.commonProducts) state.commonProducts = []
      const items = Array.isArray(action.payload) ? action.payload : []
      items.forEach((item) => {
        state.commonProducts.push({
          id: nextId(),
          created_at: nowIso(),
          current_stock: 0,
          reorder_level: 0,
          unit_cost: 0,
          ...item,
        })
      })
    },

    addCommonRawMaterial: (state, action) => {
      if (!state.commonRawMaterials) state.commonRawMaterials = []
      state.commonRawMaterials.push({
        id: nextId(),
        created_at: nowIso(),
        current_stock: 0,
        reorder_level: 0,
        ...action.payload,
      })
    },

    editCommonRawMaterial: (state, action) => {
      if (!state.commonRawMaterials) state.commonRawMaterials = []
      patchById(state.commonRawMaterials, action.payload.id, action.payload.payload)
    },

    deleteCommonRawMaterial: (state, action) => {
      if (!state.commonRawMaterials) state.commonRawMaterials = []
      deleteById(state.commonRawMaterials, action.payload.id)
    },

    bulkImportCommonRawMaterials: (state, action) => {
      if (!state.commonRawMaterials) state.commonRawMaterials = []
      const items = Array.isArray(action.payload) ? action.payload : []
      items.forEach((item) => {
        state.commonRawMaterials.push({
          id: nextId(),
          created_at: nowIso(),
          current_stock: 0,
          reorder_level: 0,
          ...item,
        })
      })
    },

    /*
    |--------------------------------------------------------------------------
    | STOCK LEDGER (EXCEL-STYLE INWARD / OUTWARD / OPENING REGISTER)
    |--------------------------------------------------------------------------
    */

    addStockLedgerEntry: (state, action) => {
      if (!state.stockLedgerEntries) state.stockLedgerEntries = []
      const entry = {
        id: nextId(),
        created_at: nowIso(),
        reversed: false,
        ...action.payload,
      }
      state.stockLedgerEntries.push(entry)

      // Auto-sync stock balance with Common Raw Material or Common Product
      if (entry.item_id || entry.item_code) {
        const mat = (state.commonRawMaterials || []).find(
          (m) => String(m.id) === String(entry.item_id) || String(m.code) === String(entry.item_code)
        )
        if (mat) {
          if (entry.type === 'INWARD') {
            mat.current_stock = (Number(mat.current_stock) || 0) + Number(entry.received_quantity || 0)
          } else if (entry.type === 'OUTWARD') {
            mat.current_stock = Math.max(0, (Number(mat.current_stock) || 0) - Number(entry.issued_quantity || 0))
          }
        }
        const prod = (state.commonProducts || []).find(
          (p) => String(p.id) === String(entry.item_id) || String(p.code) === String(entry.item_code)
        )
        if (prod) {
          if (entry.type === 'INWARD') {
            prod.current_stock = (Number(prod.current_stock) || 0) + Number(entry.received_quantity || 0)
          } else if (entry.type === 'OUTWARD') {
            prod.current_stock = Math.max(0, (Number(prod.current_stock) || 0) - Number(entry.issued_quantity || 0))
          }
        }
        const syncCompanyProduct = (list) => {
          if (!Array.isArray(list)) return
          const cp = list.find((p) => String(p.id) === String(entry.item_id) || String(p.code) === String(entry.item_code) || String(p.name) === String(entry.item_name))
          if (cp) {
            if (entry.type === 'INWARD') {
              cp.current_stock = (Number(cp.current_stock) || 0) + Number(entry.received_quantity || 0)
            } else if (entry.type === 'OUTWARD') {
              cp.current_stock = Math.max(0, (Number(cp.current_stock) || 0) - Number(entry.issued_quantity || 0))
            }
          }
        }
        syncCompanyProduct(state.products)
        syncCompanyProduct(state.byCompany?.cmhp?.products)
        syncCompanyProduct(state.byCompany?.tej?.products)
      }
    },

    startProductionBatchFromOrder: (state, action) => {
      const {
        orderId,
        orderNumber,
        batchNumber,
        productId,
        productCode,
        productName,
        plannedQuantity,
        company,
        companyKey,
        materialsToIssue,
      } = action.payload

      if (!state.stockLedgerEntries) state.stockLedgerEntries = []

      // 1. Issue each raw material to OUTWARD ledger
      if (Array.isArray(materialsToIssue)) {
        materialsToIssue.forEach((mat) => {
          const qty = Number(mat.issuedQuantity || mat.requiredAmount) || 0
          const entry = {
            id: nextId(),
            item_id: mat.id || mat.itemId,
            item_code: mat.code || mat.itemCode,
            item_name: mat.name || mat.itemName,
            type: 'OUTWARD',
            financial_year: '2026-27',
            date: nowIso().slice(0, 10),
            batch_no: batchNumber,
            name_of_product: productName,
            issued_quantity: qty,
            remark: mat.remark || `${qty} KG (${Math.ceil(qty / 25)} Bag)`,
            created_at: nowIso(),
            reversed: false,
          }
          state.stockLedgerEntries.push(entry)

          // Deduct from common raw materials
          const rm = (state.commonRawMaterials || []).find(
            (m) => String(m.id) === String(entry.item_id) || String(m.code) === String(entry.item_code)
          )
          if (rm) {
            rm.current_stock = Math.max(0, (Number(rm.current_stock) || 0) - qty)
          }
        })
      }

      // 2. Create batch
      const batchPayload = {
        id: nextId(),
        number: batchNumber,
        company: Number(company) || (companyKey === 'tej' ? 2 : 1),
        companyId: companyKey || (Number(company) === 2 ? 'tej' : 'cmhp'),
        order: Number(orderId) || null,
        product: Number(productId) || null,
        product_name: productName,
        product_code: productCode,
        planned_quantity: Number(plannedQuantity) || 0,
        status: 'IN_PRODUCTION',
        qc_status: 'PENDING',
        qa_status: 'PENDING',
        created_at: nowIso(),
        material_consumption: (materialsToIssue || []).map((m) => ({
          item: m.id || m.itemId,
          item_code: m.code || m.itemCode,
          item_name: m.name || m.itemName,
          quantity: Number(m.issuedQuantity || m.requiredAmount) || 0,
          issued_at: nowIso(),
        })),
      }
      addCompanyEntity(state, 'batches', batchPayload)

      // 3. Update Order status
      patchCompanyEntity(state, 'orders', orderId, {
        status: 'IN_PRODUCTION',
        batch_no: batchNumber,
        qc_status: 'PENDING',
      })

      // 4. Create QC inspection record
      const qcPayload = {
        id: nextId(),
        number: `QC-${batchNumber}`,
        order_id: Number(orderId),
        order_number: orderNumber,
        batch_id: batchPayload.id,
        batch_number: batchNumber,
        company: Number(company) || 1,
        companyId: companyKey || 'cmhp',
        product_name: productName,
        ordered_qty: Number(plannedQuantity) || 0,
        inspected_qty: Number(plannedQuantity) || 0,
        accepted_qty: Number(plannedQuantity) || 0,
        rejected_qty: 0,
        status: 'PENDING',
        created_at: nowIso(),
        inspection_date: nowIso().slice(0, 10),
        remarks: 'Auto-routed from production batch formulation',
      }
      addCompanyEntity(state, 'qcRecords', qcPayload)
    },

    setOpeningStockRecord: (state, action) => {
      if (!state.stockLedgerEntries) state.stockLedgerEntries = []
      const { item_id, item_code, item_name, financial_year, quantity, no_of_containers, date } = action.payload
      const existingIdx = state.stockLedgerEntries.findIndex(
        (e) =>
          (String(e.item_id) === String(item_id) || String(e.item_code) === String(item_code)) &&
          e.financial_year === financial_year &&
          e.type === 'OPENING'
      )
      const entry = {
        id: existingIdx !== -1 ? state.stockLedgerEntries[existingIdx].id : nextId(),
        item_id,
        item_code,
        item_name,
        type: 'OPENING',
        financial_year,
        date: date || '01-04-2026',
        invoice_no: 'OPENING',
        supplier: 'STOCK',
        received_quantity: Number(quantity) || 0,
        no_of_containers: no_of_containers || '',
        price: '',
        reversed: false,
        created_at: nowIso(),
      }
      if (existingIdx !== -1) {
        state.stockLedgerEntries[existingIdx] = entry
      } else {
        state.stockLedgerEntries.push(entry)
      }
    },

    reverseStockLedgerEntry: (state, action) => {
      if (!state.stockLedgerEntries) return
      const { id, reason } = action.payload
      const entry = state.stockLedgerEntries.find((e) => String(e.id) === String(id))
      if (!entry || entry.reversed) return

      entry.reversed = true
      entry.reversed_at = nowIso()
      entry.reversal_reason = reason || 'Reversed by user'

      // Revert material/product stock adjustment
      if (entry.item_id || entry.item_code) {
        const mat = (state.commonRawMaterials || []).find(
          (m) => String(m.id) === String(entry.item_id) || String(m.code) === String(entry.item_code)
        )
        if (mat) {
          if (entry.type === 'INWARD') {
            mat.current_stock = Math.max(0, (Number(mat.current_stock) || 0) - Number(entry.received_quantity || 0))
          } else if (entry.type === 'OUTWARD') {
            mat.current_stock = (Number(mat.current_stock) || 0) + Number(entry.issued_quantity || 0)
          }
        }
      }
    },

    adjustStockLedgerPhysical: (state, action) => {
      if (!state.stockLedgerEntries) state.stockLedgerEntries = []
      const { item_id, item_code, item_name, financial_year, date, physical_stock, system_stock, variance, reason } = action.payload
      const entry = {
        id: nextId(),
        item_id,
        item_code,
        item_name,
        type: 'ADJUSTMENT',
        financial_year,
        date: date || nowIso().slice(0, 10),
        invoice_no: 'ADJUSTMENT',
        supplier: 'PHYSICAL VERIFICATION',
        physical_stock: Number(physical_stock),
        system_stock: Number(system_stock),
        variance: Number(variance),
        remark: reason || 'Physical stock count adjustment',
        reversed: false,
        created_at: nowIso(),
      }
      state.stockLedgerEntries.push(entry)

      const mat = (state.commonRawMaterials || []).find(
        (m) => String(m.id) === String(item_id) || String(m.code) === String(item_code)
      )
      if (mat) {
        mat.current_stock = Number(physical_stock)
      }
    },

    bulkImportStockLedgerEntries: (state, action) => {
      if (!state.stockLedgerEntries) state.stockLedgerEntries = []
      const items = Array.isArray(action.payload) ? action.payload : []
      items.forEach((item) => {
        state.stockLedgerEntries.push({
          id: nextId(),
          created_at: nowIso(),
          reversed: false,
          ...item,
        })
      })
    },


    addItem: (
      state,
      action
    ) => {

      state.items.push({

        id:
          nextId(),

        is_active:
          true,

        ...action.payload,

      })

    },


    editItem: (
      state,
      action
    ) => {

      patchById(

        state.items,

        action.payload.id,

        action.payload.payload

      )

    },


    deleteItem: (
      state,
      action
    ) => {

      deleteById(

        state.items,

        action.payload.id

      )

    },


    setItemStatus: (
      state,
      action
    ) => {

      setStatusById(

        state.items,

        action.payload.id,

        action.payload.is_active

      )

    },


    /*
    |--------------------------------------------------------------------------
    | RECEIVE STOCK
    |--------------------------------------------------------------------------
    */


    receiveStock: (
      state,
      action
    ) => {

      const p =
        action.payload


      const quantity =
        Number(
          p.received_quantity
        )


      if (!p.item) {

        return

      }


      if (!p.lot_number) {
        return
      }

      if (
        !Number.isFinite(
          quantity
        ) ||
        quantity <= 0
      ) {
        return
      }

      const lotId =
        nextId()

      state.lots.push({
        id:
          lotId,

        item:
          Number(
            p.item
          ),

        lot_number:
          p.lot_number,

        qc_status:
          'PENDING',

        qc_reason:
          '',

        expiry_date:
          p.expiry_date ||
          null,

        manufacture_date:
          p.manufacture_date ||
          null,

        received_quantity:
          quantity,

        available_quantity:
          quantity,

        supplier:
          p.supplier
            ? Number(
                p.supplier
              )
            : null,

        supplier_name:
          p.supplier_name ||
          '',

        created_at:
          nowIso(),

      })


      state.transactions.unshift({

        id:
          nextId(),

        transaction_type:
          'RECEIPT',

        item:
          Number(
            p.item
          ),

        lot:
          lotId,

        quantity,

        company:
          null,

        reference_note:
          p.reference_note ||
          '',

        created_by:
          p.created_by ||
          'system',

        created_at:
          nowIso(),

      })

    },


    /*
    |--------------------------------------------------------------------------
    | LOT QC
    |--------------------------------------------------------------------------
    */


    setLotQcStatus: (
      state,
      action
    ) => {

      const {
        lotId,
        to_status,
        reason,
      } = action.payload


      const lot =
        state.lots.find(
          (x) =>
            Number(x.id) ===
            Number(lotId)
        )


      if (!lot) {

        return

      }


      lot.qc_status =
        to_status

      lot.qc_reason =
        reason || ''

    },


    /*
    |--------------------------------------------------------------------------
    | ISSUE STOCK
    |--------------------------------------------------------------------------
    */


    issueStock: (
      state,
      action
    ) => {
      const p = action.payload || {}
      const lotId = p.lot_id !== undefined ? p.lot_id : p.lot
      const qty = Number(p.quantity)

      if (!Number.isFinite(qty) || qty <= 0) {
        return
      }

      const lotObj = (state.lots || []).find(
        (x) => Number(x.id) === Number(lotId)
      )

      if (!lotObj) {
        return
      }

      const available = Number(lotObj.available_quantity) || 0
      if (qty > available) {
        return
      }

      lotObj.available_quantity = available - qty

      // Also sync parent stock in commonRawMaterials or commonProducts if found
      if (lotObj.item_type === 'RAW_MATERIAL') {
        const mat = (state.commonRawMaterials || []).find(
          (m) => Number(m.id) === Number(lotObj.item_id || lotObj.item) || m.code === lotObj.item_code
        )
        if (mat) mat.current_stock = Math.max(0, (Number(mat.current_stock) || 0) - qty)
      } else {
        const prod = (state.commonProducts || []).find(
          (pr) => Number(pr.id) === Number(lotObj.item_id || lotObj.item) || pr.code === lotObj.item_code
        )
        if (prod) prod.current_stock = Math.max(0, (Number(prod.current_stock) || 0) - qty)
      }

      if (!state.issueHistory) state.issueHistory = []
      const issueNumber = p.issue_number || `ISS-${new Date().getFullYear()}-${String(state.issueHistory.length + 1).padStart(3, '0')}`

      const entry = {
        id: nextId(),
        issue_number: issueNumber,
        date: p.date || nowIso().slice(0, 10),
        item_id: lotObj.item_id || lotObj.item,
        item_code: lotObj.item_code,
        item_name: lotObj.item_name,
        category: lotObj.category,
        lot_id: Number(lotId),
        lot_number: lotObj.lot_number,
        quantity: qty,
        uom: lotObj.uom || lotObj.uom_code || 'Units',
        issued_to_type: p.issued_to_type || (p.company ? 'COMPANY' : 'DEPARTMENT'),
        issued_to_name: p.issued_to_name || p.reference_note || 'Production',
        order_id: p.order_id || null,
        issued_by: p.issued_by || 'Demo User',
        remarks: p.remarks || p.reference_note || '',
        created_at: nowIso(),
      }
      state.issueHistory.unshift(entry)

      if (!state.transactions) state.transactions = []
      state.transactions.unshift({
        id: nextId(),
        transaction_type: 'ISSUE',
        item: lotObj.item_id || lotObj.item,
        item_code: lotObj.item_code,
        lot: Number(lotId),
        lot_number: lotObj.lot_number,
        quantity: qty,
        company: p.company ? Number(p.company) : null,
        reference_note: p.remarks || p.reference_note || '',
        created_by: 'Demo User',
        created_at: nowIso(),
      })
    },


    /*
    |--------------------------------------------------------------------------
    | RETURN STOCK
    |--------------------------------------------------------------------------
    */


    returnStock: (
      state,
      action
    ) => {
      const p = action.payload || {}
      const lotId = p.lot_id !== undefined ? p.lot_id : p.lot
      const qty = Number(p.quantity)

      if (!Number.isFinite(qty) || qty <= 0) {
        return
      }

      const lotObj = (state.lots || []).find(
        (x) => Number(x.id) === Number(lotId)
      )

      if (!lotObj) {
        return
      }

      const available = Number(lotObj.available_quantity) || 0
      if (qty > available) {
        return
      }

      // Deduct or block the returned quantity from stock in Redux
      lotObj.available_quantity = available - qty

      // Also sync parent stock in commonRawMaterials or commonProducts if found
      if (lotObj.item_type === 'RAW_MATERIAL') {
        const mat = (state.commonRawMaterials || []).find(
          (m) => Number(m.id) === Number(lotObj.item_id || lotObj.item) || m.code === lotObj.item_code
        )
        if (mat) mat.current_stock = Math.max(0, (Number(mat.current_stock) || 0) - qty)
      } else {
        const prod = (state.commonProducts || []).find(
          (pr) => Number(pr.id) === Number(lotObj.item_id || lotObj.item) || pr.code === lotObj.item_code
        )
        if (prod) prod.current_stock = Math.max(0, (Number(prod.current_stock) || 0) - qty)
      }

      if (!state.stockReturns) state.stockReturns = []
      const returnNumber = p.return_number || `RET-${new Date().getFullYear()}-${String(state.stockReturns.length + 1).padStart(3, '0')}`

      const returnEntry = {
        id: nextId(),
        return_number: returnNumber,
        date: p.date || nowIso().slice(0, 10),
        item_id: lotObj.item_id || lotObj.item,
        item_code: lotObj.item_code,
        item_name: lotObj.item_name,
        category: lotObj.category,
        item_type: lotObj.item_type,
        lot_id: Number(lotId),
        lot_number: lotObj.lot_number,
        quantity: qty,
        uom: lotObj.uom || lotObj.uom_code || 'Units',
        return_to: p.return_to || (lotObj.item_type === 'MEDICINE' ? lotObj.source_company : lotObj.supplier_name),
        return_to_label: p.return_to_label || (lotObj.item_type === 'MEDICINE' ? `${lotObj.source_company} (Manufacturer)` : `${lotObj.supplier_name} (Supplier)`),
        return_to_type: p.return_to_type || (lotObj.item_type === 'MEDICINE' ? 'MANUFACTURER' : 'SUPPLIER'),
        reason: p.reason || 'Defect / Quality Issue',
        reason_notes: p.reason_notes || p.reference_note || '',
        status: p.status || 'Raised',
        created_by: p.created_by || 'Demo User',
        created_at: nowIso(),
      }
      state.stockReturns.unshift(returnEntry)

      if (!state.transactions) state.transactions = []
      state.transactions.unshift({
        id: nextId(),
        transaction_type: 'RETURN',
        item: lotObj.item_id || lotObj.item,
        item_code: lotObj.item_code,
        lot: Number(lotId),
        lot_number: lotObj.lot_number,
        quantity: qty,
        company: p.company ? Number(p.company) : null,
        reference_note: `${returnEntry.reason}: ${returnEntry.reason_notes}`,
        created_by: 'Demo User',
        created_at: nowIso(),
      })
    },

    updateStockReturnStatus: (state, action) => {
      const { id, status, notes } = action.payload || {}
      if (!state.stockReturns) return
      const ret = state.stockReturns.find((r) => Number(r.id) === Number(id))
      if (ret) {
        ret.status = status
        if (notes) ret.status_notes = notes
        ret.updated_at = nowIso()
      }
    },


    /*
    |--------------------------------------------------------------------------
    | STOCK ADJUSTMENT
    |--------------------------------------------------------------------------
    */


    adjustStock: (
      state,
      action
    ) => {

      const {
        lot,
        quantity,
        reference_note,
      } = action.payload


      const qty =
        Number(
          quantity
        )


      const lotObj =
        state.lots.find(
          (x) =>
            Number(x.id) ===
            Number(lot)
        )


      if (!lotObj) {

        return

      }


      if (
        !Number.isFinite(qty)
      ) {

        return

      }


      const current =
        Number(
          lotObj.available_quantity
        ) || 0


      const next =
        current +
        qty


      if (
        next < 0
      ) {

        return

      }


      lotObj.available_quantity =
        next


      state.transactions.unshift({

        id:
          nextId(),

        transaction_type:
          'ADJUSTMENT',

        item:
          lotObj.item,

        lot:
          Number(
            lot
          ),

        quantity:
          qty,

        company:
          null,

        reference_note:
          reference_note ||
          '',

        created_by:
          'system',

        created_at:
          nowIso(),

      })

    },


    /*
    |--------------------------------------------------------------------------
    | PRODUCTS
    |--------------------------------------------------------------------------
    */


    addProduct: (
      state,
      action
    ) => {
      addCompanyEntity(state, 'products', {
        id: nextId(),
        is_active: true,
        ...action.payload,
      })
    },

    editProduct: (
      state,
      action
    ) => {
      patchCompanyEntity(
        state,
        'products',
        action.payload.id,
        action.payload.payload
      )
    },

    deleteProduct: (
      state,
      action
    ) => {
      deleteCompanyEntity(
        state,
        'products',
        action.payload.id
      )
      ensureByCompanyState(state)
      const filterFn = (f) => String(f.product_id) !== String(action.payload.id)
      if (state.byCompany?.cmhp?.formulas) {
        state.byCompany.cmhp.formulas = state.byCompany.cmhp.formulas.filter(filterFn)
      }
      if (state.byCompany?.tej?.formulas) {
        state.byCompany.tej.formulas = state.byCompany.tej.formulas.filter(filterFn)
      }
      state.formulas = state.formulas.filter(filterFn)
    },

    saveProductLastSelection: (
      state,
      action
    ) => {
      const { productId, formulaId, revisionId } = action.payload || {}
      ensureByCompanyState(state)
      const updateProd = (p) => {
        if (p && String(p.id) === String(productId)) {
          if (formulaId !== undefined) p.last_formula_id = formulaId
          if (revisionId !== undefined) p.last_revision_id = revisionId
        }
      }
      ;(state.products || []).forEach(updateProd)
      ;(state.byCompany?.cmhp?.products || []).forEach(updateProd)
      ;(state.byCompany?.tej?.products || []).forEach(updateProd)
    },

    /*
    |--------------------------------------------------------------------------
    | CUSTOMERS
    |--------------------------------------------------------------------------
    */

    addCustomer: (
      state,
      action
    ) => {
      state.customers.push({
        id: nextId(),
        is_active: true,
        ...action.payload,
      })
    },

    editCustomer: (
      state,
      action
    ) => {
      patchById(
        state.customers,
        action.payload.id,
        action.payload.payload
      )
    },

    deleteCustomer: (
      state,
      action
    ) => {
      deleteById(
        state.customers,
        action.payload.id
      )
    },

    /*
    |--------------------------------------------------------------------------
    | FORMULAS
    |--------------------------------------------------------------------------
    */

    addFormula: (
      state,
      action
    ) => {
      addCompanyEntity(state, 'formulas', {
        id: nextId(),
        revisions: [],
        ...action.payload,
      })
    },

    saveFormula: (
      state,
      action
    ) => {
      const { id, product_id, name, base_quantity, base_unit, revisions, company, companyId } = action.payload || {}
      const existing = (state.formulas || []).find(
        (f) => String(f.id) === String(id)
      )

      if (existing) {
        const patchData = {}
        if (name !== undefined) patchData.name = name
        if (base_quantity !== undefined) patchData.base_quantity = Number(base_quantity)
        if (base_unit !== undefined) patchData.base_unit = base_unit
        if (revisions !== undefined) patchData.revisions = revisions
        patchCompanyEntity(state, 'formulas', id, patchData)
      } else {
        const prod = (state.products || []).find((p) => String(p.id) === String(product_id))
        const comp = company || prod?.company
        const compKey = companyId || prod?.companyId
        addCompanyEntity(state, 'formulas', {
          id: id || nextId(),
          product_id: Number(product_id) || product_id,
          name: name || 'Standard Formula',
          base_quantity: Number(base_quantity) || 100,
          base_unit: base_unit || 'g',
          company: comp,
          companyId: compKey,
          revisions: revisions || [
            {
              id: 'rev-00',
              name: 'Rev 00',
              description: 'Initial revision',
              created_at: nowIso(),
              materials: [],
            },
          ],
        })
      }
    },

    editFormula: (
      state,
      action
    ) => {
      patchCompanyEntity(
        state,
        'formulas',
        action.payload.id,
        action.payload.payload
      )
    },

    deleteFormula: (
      state,
      action
    ) => {
      deleteCompanyEntity(
        state,
        'formulas',
        action.payload.id
      )
    },

    addFormulaRevision: (
      state,
      action
    ) => {
      const { formulaId, revision } = action.payload || {}
      ensureByCompanyState(state)
      const pushRev = (f) => {
        if (f && String(f.id) === String(formulaId)) {
          if (!Array.isArray(f.revisions)) f.revisions = []
          f.revisions.push(revision)
        }
      }
      ;(state.formulas || []).forEach(pushRev)
      ;(state.byCompany?.cmhp?.formulas || []).forEach(pushRev)
      ;(state.byCompany?.tej?.formulas || []).forEach(pushRev)
    },

    saveRevisionMaterials: (
      state,
      action
    ) => {
      const { formulaId, revisionId, materials } = action.payload || {}
      ensureByCompanyState(state)
      const saveMat = (f) => {
        if (f && String(f.id) === String(formulaId) && Array.isArray(f.revisions)) {
          const rev = f.revisions.find((r) => String(r.id) === String(revisionId))
          if (rev) {
            rev.materials = materials || []
          }
        }
      }
      ;(state.formulas || []).forEach(saveMat)
      ;(state.byCompany?.cmhp?.formulas || []).forEach(saveMat)
      ;(state.byCompany?.tej?.formulas || []).forEach(saveMat)
    },

    deleteFormulaRevision: (
      state,
      action
    ) => {
      const { formulaId, revisionId } = action.payload || {}
      ensureByCompanyState(state)
      const delRev = (f) => {
        if (f && String(f.id) === String(formulaId) && Array.isArray(f.revisions)) {
          f.revisions = f.revisions.filter((r) => String(r.id) !== String(revisionId))
        }
      }
      ;(state.formulas || []).forEach(delRev)
      ;(state.byCompany?.cmhp?.formulas || []).forEach(delRev)
      ;(state.byCompany?.tej?.formulas || []).forEach(delRev)
    },

    /*
    |--------------------------------------------------------------------------
    | FORMULA APPROVALS (QC LIFECYCLE)
    |--------------------------------------------------------------------------
    */

    submitFormulaApproval: (state, action) => {
      ensureByCompanyState(state)
      const p = action.payload || {}
      const id = p.id || `FA-${Date.now().toString().slice(-6)}`
      const now = nowIso()

      const newApproval = {
        id,
        company: p.company !== undefined ? Number(p.company) : (state.activeCompanyId || 1),
        companyId: p.companyId || (state.activeCompanyKey || 'cmhp'),
        productId: Number(p.productId) || p.productId,
        productName: p.productName || '',
        productCode: p.productCode || '',
        dosageForm: p.dosageForm || 'Oral Liquid',
        formulaId: p.formulaId,
        formulaName: p.formulaName || '',
        revisionId: p.revisionId,
        revisionName: p.revisionName || '',
        formulaBaseQuantity: Number(p.formulaBaseQuantity) || 100,
        formulaBaseUnit: p.formulaBaseUnit || 'L',
        batchQuantity: Number(p.batchQuantity) || 1,
        batchUnit: p.batchUnit || 'L',
        scaleFactor: Number(p.scaleFactor) || 1,
        materialsCount: Array.isArray(p.materials) ? p.materials.length : 0,
        materials: Array.isArray(p.materials) ? JSON.parse(JSON.stringify(p.materials)) : [],
        snapshot: JSON.parse(JSON.stringify(p.snapshot || p)),
        remarks: p.remarks || '',
        status: 'PENDING',
        submittedBy: p.submittedBy || 'Production Chemist',
        submittedByRole: p.submittedByRole || 'Production Chemist',
        submittedAt: now,
        decidedBy: null,
        decidedByRole: null,
        decidedAt: null,
        decisionRemarks: '',
        declineReason: '',
        declineCategory: '',
        history: [
          {
            action: 'SUBMITTED',
            by: p.submittedBy || 'Production Chemist',
            role: p.submittedByRole || 'Production Chemist',
            at: now,
            remarks: p.remarks || '',
          },
        ],
      }

      addCompanyEntity(state, 'formulaApprovals', newApproval)

      // Update matching product
      const updateProd = (prod) => {
        if (prod && String(prod.id) === String(p.productId)) {
          prod.formula_approval_status = 'PENDING'
          prod.last_formula_approval_id = id
        }
      }
      ;(state.products || []).forEach(updateProd)
      ;(state.byCompany?.cmhp?.products || []).forEach(updateProd)
      ;(state.byCompany?.tej?.products || []).forEach(updateProd)
    },

    withdrawFormulaApproval: (state, action) => {
      ensureByCompanyState(state)
      const { id, reason, withdrawnBy } = action.payload || {}
      const now = nowIso()

      const patchData = (item) => {
        if (item && String(item.id) === String(id)) {
          item.status = 'WITHDRAWN'
          if (!Array.isArray(item.history)) item.history = []
          item.history.push({
            action: 'WITHDRAWN',
            by: withdrawnBy || 'Production Chemist',
            at: now,
            reason: reason || 'Withdrawn by submitter',
          })
          const updateProd = (prod) => {
            if (prod && String(prod.id) === String(item.productId)) {
              prod.formula_approval_status = 'NOT_SUBMITTED'
            }
          }
          ;(state.products || []).forEach(updateProd)
          ;(state.byCompany?.cmhp?.products || []).forEach(updateProd)
          ;(state.byCompany?.tej?.products || []).forEach(updateProd)
        }
      }

      ;(state.formulaApprovals || []).forEach(patchData)
      ;(state.byCompany?.cmhp?.formulaApprovals || []).forEach(patchData)
      ;(state.byCompany?.tej?.formulaApprovals || []).forEach(patchData)
    },

    decideFormulaApproval: (state, action) => {
      ensureByCompanyState(state)
      const { id, decision, remarks, reason, declineCategory, decidedBy, decidedByRole } = action.payload || {}
      const now = nowIso()
      const isApproved = decision === 'APPROVED'

      const patchData = (item) => {
        if (item && String(item.id) === String(id)) {
          item.status = isApproved ? 'APPROVED' : 'DECLINED'
          item.decidedBy = decidedBy || (isApproved ? 'Dr. R. K. Mehta' : 'Pooja Varma')
          item.decidedByRole = decidedByRole || (isApproved ? 'QA Manager' : 'QC In-Charge')
          item.decidedAt = now
          item.decisionRemarks = isApproved ? (remarks || '') : (reason || '')
          if (!isApproved) {
            item.declineReason = reason || 'Declined during QC audit'
            item.declineCategory = declineCategory || 'General'
          }
          if (!Array.isArray(item.history)) item.history = []
          item.history.push({
            action: item.status,
            by: item.decidedBy,
            role: item.decidedByRole,
            at: now,
            remarks: item.decisionRemarks,
            reason: item.declineReason,
            category: item.declineCategory,
          })

          const updateProd = (prod) => {
            if (prod && String(prod.id) === String(item.productId)) {
              prod.formula_approval_status = item.status
            }
          }
          ;(state.products || []).forEach(updateProd)
          ;(state.byCompany?.cmhp?.products || []).forEach(updateProd)
          ;(state.byCompany?.tej?.products || []).forEach(updateProd)
        }
      }

      ;(state.formulaApprovals || []).forEach(patchData)
      ;(state.byCompany?.cmhp?.formulaApprovals || []).forEach(patchData)
      ;(state.byCompany?.tej?.formulaApprovals || []).forEach(patchData)
    },


    /*
    |--------------------------------------------------------------------------
    | QUOTATIONS
    |--------------------------------------------------------------------------
    */


    addQuotation: (
      state,
      action
    ) => {

      state.quotations.push({

        id:
          nextId(),

        status:
          'DRAFT',

        lines:
          [],

        ...action.payload,

      })

    },


    deleteQuotation: (
      state,
      action
    ) => {

      deleteById(

        state.quotations,

        action.payload.id

      )

    },


    /*
    |--------------------------------------------------------------------------
    | ORDERS
    |--------------------------------------------------------------------------
    |
    | NEW:
    |
    | editOrder
    |
    | This reducer is used by OperationsService after
    | the service has already filtered the fields according
    | to the current user's role.
    |
    */


    addOrder: (
      state,
      action
    ) => {
      addCompanyEntity(state, 'orders', {
        id: nextId(),
        status: 'CONFIRMED',
        lines: [],
        ...action.payload,
      })
    },

    editOrder: (
      state,
      action
    ) => {
      patchCompanyEntity(
        state,
        'orders',
        action.payload.id,
        action.payload.payload
      )
    },

    deleteOrder: (
      state,
      action
    ) => {
      deleteCompanyEntity(
        state,
        'orders',
        action.payload.id
      )
    },

    /*
    |--------------------------------------------------------------------------
    | BATCHES
    |--------------------------------------------------------------------------
    */

    addBatch: (
      state,
      action
    ) => {
      addCompanyEntity(state, 'batches', {
        id: nextId(),
        produced_quantity: 0,
        qc_status: 'PENDING',
        qa_status: 'PENDING',
        status: 'IN_PROGRESS',
        material_consumption: [],
        qc_history: [],
        qa_history: [],
        ...action.payload,
      })
    },

    editBatch: (
      state,
      action
    ) => {
      patchCompanyEntity(
        state,
        'batches',
        action.payload.id,
        action.payload.payload
      )
    },

    deleteBatch: (
      state,
      action
    ) => {
      deleteCompanyEntity(
        state,
        'batches',
        action.payload.id
      )
    },

    consumeBatchMaterial: (
      state,
      action
    ) => {
      const {
        batchId,
        lot,
        quantity,
      } = action.payload

      const qty = Number(quantity)
      const findBatch = (list) => (list || []).find((x) => Number(x.id) === Number(batchId))
      const batch = findBatch(state.batches)
      const lotObj = (state.lots || []).find((x) => Number(x.id) === Number(lot))

      if (!batch || !lotObj || !Number.isFinite(qty) || qty <= 0) return

      const available = Number(lotObj.available_quantity) || 0
      if (qty > available) return

      lotObj.available_quantity = available - qty

      const consumptionRecord = {
        item: lotObj.item,
        lot: Number(lot),
        lot_number: lotObj.lot_number || '',
        quantity: qty,
        issued_at: nowIso(),
      }

      const updateBatchConsumption = (b) => {
        if (b) {
          if (!Array.isArray(b.material_consumption)) b.material_consumption = []
          b.material_consumption.push(consumptionRecord)
        }
      }

      updateBatchConsumption(batch)
      updateBatchConsumption(findBatch(state.byCompany?.cmhp?.batches))
      updateBatchConsumption(findBatch(state.byCompany?.tej?.batches))

      state.transactions.unshift({
        id: nextId(),
        transaction_type: 'ISSUE',
        item: lotObj.item,
        lot: Number(lot),
        quantity: qty,
        company: batch.company || null,
        reference_note: `Consumed by batch ${batch.number || ''}`,
        created_by: 'system',
        created_at: nowIso(),
      })
    },

    setBatchQc: (
      state,
      action
    ) => {
      const { batchId, decision, remarks } = action.payload
      const qcStatus = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED'
      const qcEntry = {
        decision: qcStatus,
        remarks: remarks || '',
        by: 'Current user',
        at: nowIso(),
      }

      const updateB = (b) => {
        if (b) {
          b.qc_status = qcStatus
          if (!Array.isArray(b.qc_history)) b.qc_history = []
          b.qc_history.push(qcEntry)
        }
      }

      updateB((state.batches || []).find((x) => Number(x.id) === Number(batchId)))
      updateB((state.byCompany?.cmhp?.batches || []).find((x) => Number(x.id) === Number(batchId)))
      updateB((state.byCompany?.tej?.batches || []).find((x) => Number(x.id) === Number(batchId)))
    },

    setBatchQa: (
      state,
      action
    ) => {
      const { batchId, decision, remarks } = action.payload
      const qaStatus = decision === 'RELEASE' ? 'RELEASED' : 'HOLD'
      const qaEntry = {
        decision: qaStatus,
        remarks: remarks || '',
        by: 'Current user',
        at: nowIso(),
      }

      const updateB = (b) => {
        if (b) {
          b.qa_status = qaStatus
          if (!Array.isArray(b.qa_history)) b.qa_history = []
          b.qa_history.push(qaEntry)
          if (qaStatus === 'RELEASED') {
            b.status = 'COMPLETED'
          }
        }
      }

      updateB((state.batches || []).find((x) => Number(x.id) === Number(batchId)))
      updateB((state.byCompany?.cmhp?.batches || []).find((x) => Number(x.id) === Number(batchId)))
      updateB((state.byCompany?.tej?.batches || []).find((x) => Number(x.id) === Number(batchId)))
    },

    /*
    |--------------------------------------------------------------------------
    | INVOICES
    |--------------------------------------------------------------------------
    */

    addInvoice: (
      state,
      action
    ) => {
      addCompanyEntity(state, 'invoices', {
        id: nextId(),
        status: 'ISSUED',
        ...action.payload,
      })
    },

    editInvoice: (
      state,
      action
    ) => {
      patchCompanyEntity(
        state,
        'invoices',
        action.payload.id,
        action.payload.payload
      )
    },

    deleteInvoice: (
      state,
      action
    ) => {
      deleteCompanyEntity(
        state,
        'invoices',
        action.payload.id
      )
    },

    setInvoiceStatus: (
      state,
      action
    ) => {
      const { id, status, paid_on } = action.payload
      patchCompanyEntity(state, 'invoices', id, {
        ...(status && { status }),
        ...(paid_on && { paid_on }),
      })
    },

    setOrderStatus: (
      state,
      action
    ) => {
      const { id, status, qc_status, qa_status, invoiced_qty } = action.payload
      patchCompanyEntity(state, 'orders', id, {
        ...(status && { status }),
        ...(qc_status && { qc_status }),
        ...(qa_status && { qa_status }),
        ...(invoiced_qty !== undefined && { invoiced_qty }),
      })
    },

    addQcRecord: (
      state,
      action
    ) => {
      addCompanyEntity(state, 'qcRecords', {
        id: nextId(),
        created_at: new Date().toISOString(),
        status: 'PENDING',
        ...action.payload,
      })
    },

    editQcRecord: (
      state,
      action
    ) => {
      patchCompanyEntity(
        state,
        'qcRecords',
        action.payload.id,
        action.payload.payload
      )
    },

    addQaRecord: (
      state,
      action
    ) => {
      addCompanyEntity(state, 'qaRecords', {
        id: nextId(),
        created_at: new Date().toISOString(),
        status: 'PENDING',
        ...action.payload,
      })
    },

    editQaRecord: (
      state,
      action
    ) => {
      patchCompanyEntity(
        state,
        'qaRecords',
        action.payload.id,
        action.payload.payload
      )
    },

    approveQaRelease: (state, action) => {
      const {
        qaId,
        orderId,
        batchNumber,
        productName,
        productCode,
        productId,
        approvedQty,
        remarks,
        officer,
      } = action.payload

      // 1. Mark QA Record Approved
      patchCompanyEntity(state, 'qaRecords', qaId, {
        status: 'APPROVED',
        qa_approved_qty: Number(approvedQty) || 0,
        remarks: remarks || '',
        released_at: nowIso(),
        release_officer: officer || 'QA Officer',
      })

      // 2. Add INWARD Finished Goods to Stock Ledger
      if (!state.stockLedgerEntries) state.stockLedgerEntries = []
      const fgEntry = {
        id: nextId(),
        item_id: productId,
        item_code: productCode,
        item_name: productName,
        type: 'INWARD',
        financial_year: '2026-27',
        date: nowIso().slice(0, 10),
        invoice_no: batchNumber || 'QA-RELEASE',
        supplier: 'Production Batch Release',
        received_quantity: Number(approvedQty) || 0,
        no_of_containers: `${Number(approvedQty) || 0} Units`,
        price: '—',
        created_at: nowIso(),
        reversed: false,
      }
      state.stockLedgerEntries.push(fgEntry)

      // 3. Increment Finished Goods in commonProducts & products
      const p = (state.commonProducts || []).find(
        (x) => String(x.id) === String(productId) || (productCode && String(x.code) === String(productCode)) || String(x.name) === String(productName)
      )
      if (p) {
        p.current_stock = (Number(p.current_stock) || 0) + (Number(approvedQty) || 0)
      }
      const syncCompProd = (list) => {
        if (!Array.isArray(list)) return
        const cp = list.find((x) => String(x.id) === String(productId) || (productCode && String(x.code) === String(productCode)) || String(x.name) === String(productName))
        if (cp) cp.current_stock = (Number(cp.current_stock) || 0) + (Number(approvedQty) || 0)
      }
      syncCompProd(state.products)
      syncCompProd(state.byCompany?.cmhp?.products)
      syncCompProd(state.byCompany?.tej?.products)

      // 4. Update Order status to READY_TO_INVOICE
      if (orderId) {
        patchCompanyEntity(state, 'orders', orderId, {
          status: 'READY_TO_INVOICE',
          qa_status: 'APPROVED',
          qa_approved_qty: Number(approvedQty) || 0,
        })
      }
    },

    addPaymentRecord: (
      state,
      action
    ) => {
      addCompanyEntity(state, 'payments', {
        id: nextId(),
        created_at: new Date().toISOString(),
        ...action.payload,
      })
    },


    /*
    |--------------------------------------------------------------------------
    | SUPPLIERS
    |--------------------------------------------------------------------------
    */

    addSupplier: (
      state,
      action
    ) => {
      addCompanyEntity(state, 'suppliers', {
        id: nextId(),
        is_active: true,
        ...action.payload,
      })
    },

    editSupplier: (
      state,
      action
    ) => {
      patchCompanyEntity(
        state,
        'suppliers',
        action.payload.id,
        action.payload.payload
      )
    },

    deleteSupplier: (
      state,
      action
    ) => {
      deleteCompanyEntity(
        state,
        'suppliers',
        action.payload.id
      )
    },

    setSupplierStatus: (
      state,
      action
    ) => {
      patchCompanyEntity(
        state,
        'suppliers',
        action.payload.id,
        { is_active: action.payload.is_active }
      )
    },

    /*
    |--------------------------------------------------------------------------
    | PURCHASE ORDERS
    |--------------------------------------------------------------------------
    */

    addPurchaseOrder: (
      state,
      action
    ) => {
      addCompanyEntity(state, 'purchaseOrders', {
        id: nextId(),
        status: 'DRAFT',
        lines: [],
        created_at: nowIso(),
        ...action.payload,
      })
    },

    editPurchaseOrder: (
      state,
      action
    ) => {
      patchCompanyEntity(
        state,
        'purchaseOrders',
        action.payload.id,
        action.payload.payload
      )
    },

    deletePurchaseOrder: (
      state,
      action
    ) => {
      deleteCompanyEntity(
        state,
        'purchaseOrders',
        action.payload.id
      )
    },

    approvePurchaseOrder: (
      state,
      action
    ) => {
      patchCompanyEntity(
        state,
        'purchaseOrders',
        action.payload.id,
        {
          status: 'APPROVED',
          approved_at: nowIso(),
          approved_by: action.payload.actor_name || 'Current user',
        }
      )
    },

    cancelPurchaseOrder: (
      state,
      action
    ) => {
      patchCompanyEntity(
        state,
        'purchaseOrders',
        action.payload.id,
        {
          status: 'CANCELLED',
          cancelled_at: nowIso(),
          cancelled_by: action.payload.actor_name || 'Current user',
        }
      )
    },


    /*
    |--------------------------------------------------------------------------
    | GOODS RECEIPTS
    |--------------------------------------------------------------------------
    */

    addGoodsReceipt: (
      state,
      action
    ) => {
      addCompanyEntity(state, 'goodsReceipts', {
        id: nextId(),
        status: 'RECEIVED',
        created_at: nowIso(),
        ...action.payload,
      })
    },

    editGoodsReceipt: (
      state,
      action
    ) => {
      patchCompanyEntity(
        state,
        'goodsReceipts',
        action.payload.id,
        action.payload.payload
      )
    },

    deleteGoodsReceipt: (
      state,
      action
    ) => {
      deleteCompanyEntity(
        state,
        'goodsReceipts',
        action.payload.id
      )
    },

    /*
    |--------------------------------------------------------------------------
    | PURCHASE BILLS
    |--------------------------------------------------------------------------
    */

    addPurchaseBill: (
      state,
      action
    ) => {
      addCompanyEntity(state, 'purchaseBills', {
        id: nextId(),
        status: 'DRAFT',
        paid_amount: 0,
        created_at: nowIso(),
        ...action.payload,
      })
    },

    editPurchaseBill: (
      state,
      action
    ) => {
      patchCompanyEntity(
        state,
        'purchaseBills',
        action.payload.id,
        action.payload.payload
      )
    },

    deletePurchaseBill: (
      state,
      action
    ) => {
      deleteCompanyEntity(
        state,
        'purchaseBills',
        action.payload.id
      )
    },

    /*
    |--------------------------------------------------------------------------
    | INTERNAL ALLOCATIONS
    |--------------------------------------------------------------------------
    */

    addInternalAllocation: (
      state,
      action
    ) => {
      addCompanyEntity(state, 'internalAllocations', {
        id: nextId(),
        status: 'ALLOCATED',
        created_at: nowIso(),
        ...action.payload,
      })
    },

    deleteInternalAllocation: (
      state,
      action
    ) => {
      deleteCompanyEntity(
        state,
        'internalAllocations',
        action.payload.id
      )
    },

    /*
    |--------------------------------------------------------------------------
    | DISPATCHES
    |--------------------------------------------------------------------------
    */

    addDispatch: (
      state,
      action
    ) => {
      const dispatchId = nextId()
      const payload = action.payload || {}
      addCompanyEntity(state, 'dispatches', {
        id: dispatchId,
        status: 'DISPATCHED',
        created_at: nowIso(),
        ...payload,
      })

      // Auto-issue Finished Goods to OUTWARD stock ledger and update order
      const orderId = payload.order_id || payload.order
      const order = (state.orders || []).find((o) => Number(o.id) === Number(orderId))
      const batch = (state.batches || []).find((b) => Number(b.id) === Number(payload.batch))
      const prodName = payload.product_name || order?.product_name || batch?.product_name || 'Pharmaceutical Product'
      const prodId = payload.product_id || order?.product_id || batch?.product
      const prodCode = payload.product_code || order?.product_code || batch?.product_code
      const qty = Number(payload.quantity || order?.batch_size || 1)

      if (!state.stockLedgerEntries) state.stockLedgerEntries = []
      const outEntry = {
        id: nextId(),
        item_id: prodId,
        item_code: prodCode,
        item_name: prodName,
        type: 'OUTWARD',
        financial_year: '2026-27',
        date: payload.dispatch_date || nowIso().slice(0, 10),
        batch_no: payload.batch_number || batch?.number || order?.batch_no || 'DISPATCH',
        name_of_product: prodName,
        issued_quantity: qty,
        remark: `Dispatched under DC #${payload.dispatch_number || dispatchId}`,
        created_at: nowIso(),
        reversed: false,
      }
      state.stockLedgerEntries.push(outEntry)

      // Deduct Finished Goods from commonProducts and products
      const p = (state.commonProducts || []).find(
        (x) => String(x.id) === String(prodId) || (prodCode && String(x.code) === String(prodCode)) || String(x.name) === String(prodName)
      )
      if (p) {
        p.current_stock = Math.max(0, (Number(p.current_stock) || 0) - qty)
      }
      const syncCompProd = (list) => {
        if (!Array.isArray(list)) return
        const cp = list.find((x) => String(x.id) === String(prodId) || (prodCode && String(x.code) === String(prodCode)) || String(x.name) === String(prodName))
        if (cp) cp.current_stock = Math.max(0, (Number(cp.current_stock) || 0) - qty)
      }
      syncCompProd(state.products)
      syncCompProd(state.byCompany?.cmhp?.products)
      syncCompProd(state.byCompany?.tej?.products)

      // Update Order status to DISPATCHED
      if (orderId) {
        patchCompanyEntity(state, 'orders', orderId, {
          status: 'DISPATCHED',
          dispatch_id: dispatchId,
          dispatch_number: payload.dispatch_number,
          dispatched_at: nowIso(),
        })
      }
    },

    editDispatch: (
      state,
      action
    ) => {
      patchCompanyEntity(
        state,
        'dispatches',
        action.payload.id,
        action.payload.payload
      )
    },

    deleteDispatch: (
      state,
      action
    ) => {
      deleteCompanyEntity(
        state,
        'dispatches',
        action.payload.id
      )
    },

    setDispatchStatus: (
      state,
      action
    ) => {
      patchCompanyEntity(
        state,
        'dispatches',
        action.payload.id,
        { status: action.payload.status }
      )
    },


    /*
    |--------------------------------------------------------------------------
    | SALES RETURNS
    |--------------------------------------------------------------------------
    */

    addSalesReturn: (
      state,
      action
    ) => {
      addCompanyEntity(state, 'salesReturns', {
        id: nextId(),
        status: 'PENDING',
        created_at: nowIso(),
        ...action.payload,
      })
    },

    decideSalesReturn: (
      state,
      action
    ) => {
      patchCompanyEntity(
        state,
        'salesReturns',
        action.payload.id,
        {
          status: action.payload.status,
          decision_reason: action.payload.reason || action.payload.decision_notes || '',
          decided_at: nowIso(),
        }
      )
    },

    deleteSalesReturn: (
      state,
      action
    ) => {
      deleteCompanyEntity(
        state,
        'salesReturns',
        action.payload.id
      )
    },

    /*
    |--------------------------------------------------------------------------
    | RECALLS
    |--------------------------------------------------------------------------
    */

    addRecall: (
      state,
      action
    ) => {
      addCompanyEntity(state, 'recalls', {
        id: nextId(),
        status: 'OPEN',
        returned_quantity: 0,
        created_at: nowIso(),
        ...action.payload,
      })
    },

    logRecallReturn: (
      state,
      action
    ) => {
      const qty = Number(action.payload.quantity) || 0
      if (qty <= 0) return

      const updateR = (r) => {
        if (r && Number(r.id) === Number(action.payload.id)) {
          r.returned_quantity = (Number(r.returned_quantity) || 0) + qty
        }
      }
      ;(state.recalls || []).forEach(updateR)
      ;(state.byCompany?.cmhp?.recalls || []).forEach(updateR)
      ;(state.byCompany?.tej?.recalls || []).forEach(updateR)
    },

    closeRecall: (
      state,
      action
    ) => {
      patchCompanyEntity(
        state,
        'recalls',
        action.payload.id,
        {
          status: 'CLOSED',
          closed_at: nowIso(),
        }
      )
    },

    deleteRecall: (
      state,
      action
    ) => {
      deleteCompanyEntity(
        state,
        'recalls',
        action.payload.id
      )
    },

    /*
    |--------------------------------------------------------------------------
    | CREDIT NOTES
    |--------------------------------------------------------------------------
    */

    addCreditNote: (
      state,
      action
    ) => {
      addCompanyEntity(state, 'creditNotes', {
        id: nextId(),
        status: 'DRAFT',
        created_at: nowIso(),
        ...action.payload,
      })
    },

    deleteCreditNote: (
      state,
      action
    ) => {
      deleteCompanyEntity(
        state,
        'creditNotes',
        action.payload.id
      )
    },


    /*
    |--------------------------------------------------------------------------
    | HRMS - DESIGNATIONS
    |--------------------------------------------------------------------------
    */

    addDesignation: (
      state,
      action
    ) => {
      addCompanyEntity(state, 'designations', {
        id: nextId(),
        is_active: true,
        ...action.payload,
      })
    },

    editDesignation: (
      state,
      action
    ) => {
      patchCompanyEntity(
        state,
        'designations',
        action.payload.id,
        action.payload.payload
      )
    },

    deleteDesignation: (
      state,
      action
    ) => {
      deleteCompanyEntity(
        state,
        'designations',
        action.payload.id
      )
    },

    setDesignationStatus: (
      state,
      action
    ) => {
      patchCompanyEntity(
        state,
        'designations',
        action.payload.id,
        { is_active: action.payload.is_active }
      )
    },

    /*
    |--------------------------------------------------------------------------
    | HRMS - SHIFTS
    |--------------------------------------------------------------------------
    */

    addShift: (
      state,
      action
    ) => {
      addCompanyEntity(state, 'shifts', {
        id: nextId(),
        is_active: true,
        ...action.payload,
      })
    },

    editShift: (
      state,
      action
    ) => {
      patchCompanyEntity(
        state,
        'shifts',
        action.payload.id,
        action.payload.payload
      )
    },

    deleteShift: (
      state,
      action
    ) => {
      deleteCompanyEntity(
        state,
        'shifts',
        action.payload.id
      )
    },

    setShiftStatus: (
      state,
      action
    ) => {
      patchCompanyEntity(
        state,
        'shifts',
        action.payload.id,
        { is_active: action.payload.is_active }
      )
    },

    /*
    |--------------------------------------------------------------------------
    | HRMS - HOLIDAYS
    |--------------------------------------------------------------------------
    */

    addHoliday: (
      state,
      action
    ) => {
      addCompanyEntity(state, 'holidays', {
        id: nextId(),
        ...action.payload,
      })
    },

    editHoliday: (
      state,
      action
    ) => {
      patchCompanyEntity(
        state,
        'holidays',
        action.payload.id,
        action.payload.payload
      )
    },

    deleteHoliday: (
      state,
      action
    ) => {
      deleteCompanyEntity(
        state,
        'holidays',
        action.payload.id
      )
    },

    /*
    |--------------------------------------------------------------------------
    | HRMS - LEAVE TYPES
    |--------------------------------------------------------------------------
    */

    addLeaveType: (
      state,
      action
    ) => {
      addCompanyEntity(state, 'leaveTypes', {
        id: nextId(),
        is_active: true,
        ...action.payload,
      })
    },

    editLeaveType: (
      state,
      action
    ) => {
      patchCompanyEntity(
        state,
        'leaveTypes',
        action.payload.id,
        action.payload.payload
      )
    },

    deleteLeaveType: (
      state,
      action
    ) => {
      deleteCompanyEntity(
        state,
        'leaveTypes',
        action.payload.id
      )
    },

    setLeaveTypeStatus: (
      state,
      action
    ) => {
      patchCompanyEntity(
        state,
        'leaveTypes',
        action.payload.id,
        { is_active: action.payload.is_active }
      )
    },


    /*
    |--------------------------------------------------------------------------
    | HRMS - ATTENDANCE
    |--------------------------------------------------------------------------
    */

    checkIn: (
      state,
      action
    ) => {
      const { user, company, shift } = action.payload
      const today = nowIso().slice(0, 10)
      const existing = (state.attendance || []).find(
        (record) => Number(record.user) === Number(user) && record.date === today
      )

      if (existing) {
        if (!existing.check_in) {
          patchCompanyEntity(state, 'attendance', existing.id, {
            check_in: nowIso(),
            status: existing.status || 'PRESENT',
          })
        }
        return
      }

      addCompanyEntity(state, 'attendance', {
        id: nextId(),
        user: Number(user),
        company: company ? Number(company) : undefined,
        shift: shift ? Number(shift) : null,
        date: today,
        check_in: nowIso(),
        check_out: null,
        working_hours: null,
        status: 'PRESENT',
        note: '',
      })
    },

    checkOut: (
      state,
      action
    ) => {
      const { user } = action.payload
      const today = nowIso().slice(0, 10)
      const record = (state.attendance || []).find(
        (r) => Number(r.user) === Number(user) && r.date === today
      )

      if (!record || !record.check_in || record.check_out) {
        return
      }

      const checkOutTime = nowIso()
      const hours = (new Date(checkOutTime) - new Date(record.check_in)) / (1000 * 60 * 60)

      patchCompanyEntity(state, 'attendance', record.id, {
        check_out: checkOutTime,
        working_hours: Math.round(hours * 100) / 100,
      })
    },

    markAttendance: (
      state,
      action
    ) => {
      const p = action.payload
      const existing = (state.attendance || []).find(
        (r) => Number(r.user) === Number(p.user) && r.date === p.date
      )

      if (existing) {
        patchCompanyEntity(state, 'attendance', existing.id, p)
        return
      }

      addCompanyEntity(state, 'attendance', {
        id: nextId(),
        check_in: null,
        check_out: null,
        working_hours: null,
        note: '',
        ...p,
      })
    },

    editAttendance: (
      state,
      action
    ) => {
      patchCompanyEntity(
        state,
        'attendance',
        action.payload.id,
        action.payload.payload
      )
    },

    deleteAttendance: (
      state,
      action
    ) => {
      deleteCompanyEntity(
        state,
        'attendance',
        action.payload.id
      )
    },


    /*
    |--------------------------------------------------------------------------
    | HRMS - LEAVE REQUESTS
    |--------------------------------------------------------------------------
    */

    applyLeave: (
      state,
      action
    ) => {
      addCompanyEntity(state, 'leaveRequests', {
        id: nextId(),
        status: 'PENDING',
        applied_at: nowIso(),
        decided_by: null,
        decided_at: null,
        decision_note: '',
        ...action.payload,
      })
    },

    decideLeave: (
      state,
      action
    ) => {
      const { id, status, decided_by, decision_note } = action.payload
      patchCompanyEntity(state, 'leaveRequests', id, {
        status,
        decided_by: decided_by || null,
        decided_at: nowIso(),
        decision_note: decision_note || '',
      })
    },

    cancelLeave: (
      state,
      action
    ) => {
      patchCompanyEntity(state, 'leaveRequests', action.payload.id, {
        status: 'CANCELLED',
      })
    },

    deleteLeaveRequest: (
      state,
      action
    ) => {
      deleteCompanyEntity(
        state,
        'leaveRequests',
        action.payload.id
      )
    },

    /*
    |--------------------------------------------------------------------------
    | HRMS - SALARY STRUCTURE
    |--------------------------------------------------------------------------
    */

    addSalaryStructure: (
      state,
      action
    ) => {
      addCompanyEntity(state, 'salaryStructures', {
        id: nextId(),
        ...action.payload,
      })
    },

    editSalaryStructure: (
      state,
      action
    ) => {
      patchCompanyEntity(
        state,
        'salaryStructures',
        action.payload.id,
        action.payload.payload
      )
    },

    deleteSalaryStructure: (
      state,
      action
    ) => {
      deleteCompanyEntity(
        state,
        'salaryStructures',
        action.payload.id
      )
    },

  },

})


/*
|--------------------------------------------------------------------------
| EXPORT ACTIONS
|--------------------------------------------------------------------------
*/


export const {

  // companies

  setActiveCompanyId,

  editCompany,

  setCompanyStatus,


  // departments

  addDepartment,

  editDepartment,

  deleteDepartment,

  setDepartmentStatus,


  // users

  addUser,

  editUserAccess,

  deleteUser,

  setUserStatus,


  // common inventory products & materials
  addCommonProduct,
  editCommonProduct,
  deleteCommonProduct,
  bulkImportCommonProducts,
  addCommonRawMaterial,
  editCommonRawMaterial,
  deleteCommonRawMaterial,
  bulkImportCommonRawMaterials,

  // stock ledger (Excel-style)
  addStockLedgerEntry,
  setOpeningStockRecord,
  reverseStockLedgerEntry,
  adjustStockLedgerPhysical,
  bulkImportStockLedgerEntries,


  // items

  addItem,

  editItem,

  deleteItem,

  setItemStatus,


  // inventory

  receiveStock,

  setLotQcStatus,

  issueStock,

  returnStock,

  updateStockReturnStatus,

  adjustStock,


  // operations

  addProduct,

  editProduct,

  deleteProduct,

  saveProductLastSelection,


  addCustomer,

  editCustomer,

  deleteCustomer,


  addFormula,

  saveFormula,

  editFormula,

  deleteFormula,

  addFormulaRevision,

  saveRevisionMaterials,

  deleteFormulaRevision,

  // formula approvals (QC lifecycle)
  submitFormulaApproval,
  withdrawFormulaApproval,
  decideFormulaApproval,

  addQuotation,

  deleteQuotation,


  addOrder,

  /*
   * NEW ACTION
   */
  editOrder,

  deleteOrder,


  addBatch,

  startProductionBatchFromOrder,

  editBatch,

  deleteBatch,

  consumeBatchMaterial,

  setBatchQc,

  setBatchQa,


  // invoices

  addInvoice,

  editInvoice,

  deleteInvoice,

  setInvoiceStatus,

  setOrderStatus,

  addQcRecord,

  editQcRecord,

  addQaRecord,

  editQaRecord,

  approveQaRelease,

  addPaymentRecord,


  // suppliers

  addSupplier,

  editSupplier,

  deleteSupplier,

  setSupplierStatus,


  // purchase

  addPurchaseOrder,

  editPurchaseOrder,

  deletePurchaseOrder,

  approvePurchaseOrder,

  cancelPurchaseOrder,


  addGoodsReceipt,

  editGoodsReceipt,

  deleteGoodsReceipt,


  addPurchaseBill,

  editPurchaseBill,

  deletePurchaseBill,


  // internal allocation

  addInternalAllocation,

  deleteInternalAllocation,


  // dispatch

  addDispatch,

  editDispatch,

  deleteDispatch,

  setDispatchStatus,


  // returns

  addSalesReturn,

  decideSalesReturn,

  deleteSalesReturn,


  // recall

  addRecall,

  logRecallReturn,

  closeRecall,

  deleteRecall,


  // credit note

  addCreditNote,

  deleteCreditNote,


  // hrms - designations

  addDesignation,

  editDesignation,

  deleteDesignation,

  setDesignationStatus,


  // hrms - shifts

  addShift,

  editShift,

  deleteShift,

  setShiftStatus,


  // hrms - holidays

  addHoliday,

  editHoliday,

  deleteHoliday,


  // hrms - leave types

  addLeaveType,

  editLeaveType,

  deleteLeaveType,

  setLeaveTypeStatus,


  // hrms - attendance

  checkIn,

  checkOut,

  markAttendance,

  editAttendance,

  deleteAttendance,


  // hrms - leave requests

  applyLeave,

  decideLeave,

  cancelLeave,

  deleteLeaveRequest,


  // hrms - salary structure

  addSalaryStructure,

  editSalaryStructure,

  deleteSalaryStructure,

} =
  erpSlice.actions


export default erpSlice.reducer