import { store } from '../../store/store'
import { delay } from '../../store/mockApi'

import {
  addProduct,
  editProduct,
  deleteProduct,

  addCustomer,
  editCustomer,
  deleteCustomer,

  addFormula,

  addQuotation,
  addOrder,
  editOrder,
  setOrderStatus,

  addBatch,
  startProductionBatchFromOrder,
  editBatch,

  consumeBatchMaterial as consumeBatchMaterialAction,
} from '../../store/erpSlice'

import { qualityService } from '../quality/qualityService'
import { recordAudit } from '../../utils/audit'

import {
  getScopedCompanyId,
  enforceCompanyPayload,
  getLockedCompanyIds,
  isSuperAdmin,
} from '../../utils/companyScope'

import {
  storage,
} from '../../utils/storage'

import {
  filterOrderEditPayload,
  canDeleteOrders,
} from './orderPermissions'


/* ==========================================================
   COMPANY SCOPE
   ========================================================== */

function getOperationsCompanyId() {

  const user =
    storage.getUser()


  /*
   * Super Admin follows the currently
   * selected company workspace.
   */
  if (
    isSuperAdmin(user)
  ) {

    return getScopedCompanyId(
      user
    )

  }


  /*
   * Normal users are locked to their
   * primary company.
   *
   * This fixes the Store Manager / HR Manager
   * empty Orders problem.
   */
  const lockedCompanies =
    getLockedCompanyIds(
      user
    )


  const primaryCompany =
    Number(
      lockedCompanies?.[0]
    )


  if (
    Number.isFinite(
      primaryCompany
    ) &&
    primaryCompany > 0
  ) {

    return primaryCompany

  }


  return getScopedCompanyId(
    user
  )

}


/* ==========================================================
   COMPANY ROW FILTER
   ========================================================== */

function companyRows(
  rows
) {

  const companyId =
    getOperationsCompanyId()


  if (!companyId) {
    return []
  }


  return (
    Array.isArray(rows)
      ? rows
      : []
  ).filter(
    (row) =>
      Number(row?.company) ===
      Number(companyId)
  )

}


/* ==========================================================
   COMPANY RECORD CHECK
   ========================================================== */

function assertCompanyRecord(
  collection,
  id
) {

  const companyId =
    getOperationsCompanyId()


  const row =
    (
      Array.isArray(collection)
        ? collection
        : []
    ).find(
      (item) =>
        Number(item?.id) ===
        Number(id)
    )


  if (
    !companyId ||
    !row ||
    Number(row.company) !==
    Number(companyId)
  ) {

    throw new Error(
      'This record does not belong to your company.'
    )

  }


  return row

}


/* ==========================================================
   HYDRATE QUOTATION
   ========================================================== */

function hydrateQuotation(
  quotation,
  state
) {

  const company =
    state.companies.find(
      (item) =>
        item.id ===
        Number(
          quotation.company
        )
    )


  const customer =
    state.customers.find(
      (item) =>
        item.id ===
        Number(
          quotation.customer
        )
    )


  return {

    ...quotation,

    company_name:
      company?.name || '',

    customer_name:
      customer?.name || '',

  }

}


/* ==========================================================
   HYDRATE ORDER
   ========================================================== */

function hydrateOrder(
  order,
  state
) {

  const company =
    state.companies.find(
      (item) =>
        item.id ===
        Number(
          order.company
        )
    )


  const customer =
    state.customers.find(
      (item) =>
        item.id ===
        Number(
          order.customer
        )
    )


  return {

    ...order,

    company_name:
      company?.name || '',

    company_code:
      order.company_code ||
      company?.code ||
      '',

    customer_name:
      customer?.name || '',

  }

}


/* ==========================================================
   HYDRATE BATCH
   ========================================================== */

function hydrateBatch(
  batch,
  state
) {

  const company =
    state.companies.find(
      (item) =>
        item.id ===
        Number(
          batch.company
        )
    )


  const product =
    state.products.find(
      (item) =>
        item.id ===
        Number(
          batch.product
        )
    )


  const formula =
    state.formulas.find(
      (item) =>
        item.id ===
        Number(
          batch.formula
        )
    )


  const order =
    state.orders.find(
      (item) =>
        item.id ===
        Number(
          batch.order
        )
    )


  return {

    ...batch,

    company_name:
      company?.name || '',

    product_name:
      product?.name || '',

    formula_name:
      formula?.name || '',

    order_number:
      order?.number || '',

  }

}


/* ==========================================================
   OPERATIONS SERVICE
   ========================================================== */

export const operationsService = {


  /* ========================================================
     PRODUCTS
     ======================================================== */

  getProducts: () => {

    const state =
      store.getState().erp


    return delay(
      companyRows(
        state.products
      )
    )

  },


  createProduct: (
    payload
  ) => {

    store.dispatch(
      addProduct(
        enforceCompanyPayload(
          payload
        )
      )
    )


    return delay(null)

  },


  updateProduct: (
    id,
    payload
  ) => {

    const state =
      store.getState().erp


    assertCompanyRecord(
      state.products,
      id
    )


    const safePayload = {
      ...payload,
    }


    delete safePayload.company


    store.dispatch(
      editProduct({
        id,
        payload:
          safePayload,
      })
    )


    return delay(null)

  },

  deleteProduct: (
    id
  ) => {

    const user =
      storage.getUser()

    if (
      !isSuperAdmin(user)
    ) {

      throw new Error(
        'Only Admin can delete products.'
      )

    }

    const state =
      store.getState().erp

    assertCompanyRecord(
      state.products,
      id
    )

    store.dispatch(
      deleteProduct({
        id,
      })
    )

    return delay(null)

  },

  /* ========================================================
     CUSTOMERS (SHARED)
     ======================================================== */

  getCustomers: () => {
    const state = store.getState().erp
    return delay(Array.isArray(state.customers) ? state.customers : [])
  },

  createCustomer: (payload) => {
    const safePayload = { ...payload }
    store.dispatch(addCustomer(safePayload))
    recordAudit({
      action: 'customer/created',
      entityType: 'Customer',
      entityId: safePayload.code || safePayload.name,
      payload: { name: safePayload.name, gstin: safePayload.gstin, state: safePayload.state },
    })
    return delay(null)
  },

  updateCustomer: (id, payload) => {
    const safePayload = { ...payload }
    store.dispatch(
      editCustomer({
        id,
        payload: safePayload,
      })
    )
    recordAudit({
      action: 'customer/updated',
      entityType: 'Customer',
      entityId: payload.code || id,
      payload: safePayload,
    })
    return delay(null)
  },

  deleteCustomer: (id) => {
    const state = store.getState().erp
    const existing = state.customers?.find((c) => Number(c.id) === Number(id))

    store.dispatch(
      deleteCustomer({
        id,
      })
    )

    recordAudit({
      action: 'customer/deleted',
      entityType: 'Customer',
      entityId: existing?.code || id,
      payload: { name: existing?.name },
    })

    return delay(null)
  },


  /* ========================================================
     FORMULAS
     ======================================================== */

  getFormulas: () => {

    const state =
      store.getState().erp


    return delay(
      companyRows(
        state.formulas
      )
    )

  },


  createFormula: (
    payload
  ) => {

    store.dispatch(
      addFormula(
        enforceCompanyPayload(
          payload
        )
      )
    )


    return delay(null)

  },


  /* ========================================================
     QUOTATIONS
     ======================================================== */

  getQuotations: () => {

    const state =
      store.getState().erp


    return delay(
      companyRows(
        state.quotations
      ).map(
        (quotation) =>
          hydrateQuotation(
            quotation,
            state
          )
      )
    )

  },


  createQuotation: (
    payload
  ) => {

    const scoped =
      enforceCompanyPayload(
        payload
      )


    store.dispatch(
      addQuotation({

        ...scoped,

        company:
          Number(
            scoped.company
          ),

        customer:
          Number(
            scoped.customer
          ),

        number:
          scoped.number,

        valid_until:
          scoped.valid_until ||
          null,

        lines:
          scoped.lines ||
          [],

      })
    )


    return delay(null)

  },


  /* ========================================================
     ORDERS
     ======================================================== */

  getOrders: () => {

    const state =
      store.getState().erp


    /*
     * Admin-created orders will now appear for
     * HR Manager / Store Manager when the order
     * belongs to their primary company.
     */
    return delay(
      companyRows(
        state.orders
      ).map(
        (order) =>
          hydrateOrder(
            order,
            state
          )
      )
    )

  },


  createOrder: (
    payload
  ) => {

    const scoped =
      enforceCompanyPayload(
        payload
      )


    store.dispatch(
      addOrder({

        ...scoped,

        company:
          Number(
            scoped.company
          ),

        customer:
          scoped.customer
            ? Number(
              scoped.customer
            )
            : null,

        number:
          scoped.number,

        order_date:
          scoped.order_date,

        quotation:
          scoped.quotation
            ? Number(
              scoped.quotation
            )
            : null,

        status: scoped.status || 'DRAFT',

        lines:
          scoped.lines ||
          [],

      })
    )

    recordAudit({
      action: 'order/created',
      entityType: 'Order',
      entityId: scoped.number,
      payload: { customer: scoped.customer, product: scoped.product_name, company: scoped.company },
    })

    return delay(null)

  },


  /*
   * ========================================================
   * CONFIRM ORDER (Sends order to Quality Control)
   * ========================================================
   */
  confirmOrder: (id, user = null) => {
    const state = store.getState().erp
    const order = state.orders.find((o) => Number(o.id) === Number(id))
    if (!order) throw new Error('Order not found')

    store.dispatch(
      setOrderStatus({
        id: order.id,
        status: 'QC_PENDING',
      })
    )

    // Automatically generate QC Inspection in quality module
    qualityService.createQcForOrder(order, user)

    recordAudit({
      action: 'order/confirmed',
      entityType: 'Order',
      entityId: order.number || order.id,
      payload: { customer: order.customer, product: order.product_name, newStatus: 'QC_PENDING' },
    })

    return delay(null)
  },


  /*
   * ========================================================
   * UPDATE ORDER
   * ========================================================
   *
   * Admin:
   *   Can update all fields.
   *
   * HR Manager:
   *   Can update only:
   *   - batch_no
   *   - packing_size
   *   - batch_size
   *   - mrp_for_printing
   *   - printing_status
   *
   * Store Manager:
   *   Can update only:
   *   - packing_type
   *   - label
   *   - box
   *   - insert
   *   - requisition_status
   */

  updateOrder: (
    id,
    payload
  ) => {

    const state =
      store.getState().erp


    assertCompanyRecord(
      state.orders,
      id
    )


    const safePayload =
      filterOrderEditPayload(
        payload,
        storage.getUser()
      )


    if (
      Object.keys(
        safePayload
      ).length === 0
    ) {

      throw new Error(
        'You do not have permission to edit these order fields.'
      )

    }


    delete safePayload.company


    store.dispatch(
      editOrder({

        id,

        payload:
          safePayload,

      })
    )

    const existing = state.orders.find((o) => Number(o.id) === Number(id))

    recordAudit({
      action: 'order/updated',
      entityType: 'Order',
      entityId: existing?.number || id,
      payload: safePayload,
    })

    return delay(null)

  },


  /*
   * ========================================================
   * DELETE ORDER
   * ========================================================
   *
   * Only Admin / Super Admin.
   */

  deleteOrder: (
    id
  ) => {

    const user =
      storage.getUser()


    if (
      !canDeleteOrders(
        user
      )
    ) {

      throw new Error(
        'Only Admin can delete sales orders.'
      )

    }


    const state =
      store.getState().erp


    assertCompanyRecord(
      state.orders,
      id
    )


    store.dispatch({

      type:
        'erp/deleteOrder',

      payload: {
        id,
      },

    })


    return delay(null)

  },


  /* ========================================================
     PRODUCTION BATCHES
     ======================================================== */

  getBatches: () => {

    const state =
      store.getState().erp


    return delay(
      companyRows(
        state.batches
      ).map(
        (batch) =>
          hydrateBatch(
            batch,
            state
          )
      )
    )

  },


  createBatch: (
    payload
  ) => {

    const scoped =
      enforceCompanyPayload(
        payload
      )


    store.dispatch(
      addBatch({

        ...scoped,

        company:
          Number(
            scoped.company
          ),

        product:
          Number(
            scoped.product
          ),

        formula:
          scoped.formula
            ? Number(
              scoped.formula
            )
            : null,

        order:
          scoped.order
            ? Number(
              scoped.order
            )
            : null,

        number:
          scoped.number,

        planned_quantity:
          Number(
            scoped.planned_quantity
          ) || 0,

      })
    )


    return delay(null)

  },


  updateBatch: (
    id,
    payload
  ) => {

    const state =
      store.getState().erp


    assertCompanyRecord(
      state.batches,
      id
    )


    const safePayload = {
      ...payload,
    }


    delete safePayload.company


    store.dispatch(
      editBatch({
        id,
        payload:
          safePayload,
      })
    )


    return delay(null)

  },


  consumeBatchMaterial: (
    batchId,
    payload
  ) => {

    const state =
      store.getState().erp


    assertCompanyRecord(
      state.batches,
      batchId
    )


    store.dispatch(
      consumeBatchMaterialAction({

        batchId,

        lot:
          payload.lot,

        quantity:
          payload.quantity,

      })
    )


    return delay(null)

  },

  produceBatchFromOrder: (payload) => {
    store.dispatch(startProductionBatchFromOrder(payload))
    recordAudit({
      action: 'production/batchCreatedFromOrder',
      entityType: 'Batch',
      entityId: payload.batchNumber,
      payload: {
        orderId: payload.orderId,
        orderNumber: payload.orderNumber,
        productName: payload.productName,
        plannedQuantity: payload.plannedQuantity,
        materialsIssued: payload.materialsToIssue?.length || 0,
      },
    })
    return delay(null)
  },

}