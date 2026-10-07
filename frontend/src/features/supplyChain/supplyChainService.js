import { store } from '../../store/store'
import { delay } from '../../store/mockApi'

import {
  addSupplier,
  editSupplier,
  deleteSupplier,
  setSupplierStatus,

  addPurchaseOrder,
  editPurchaseOrder,
  deletePurchaseOrder,
  approvePurchaseOrder as approvePurchaseOrderAction,
  cancelPurchaseOrder as cancelPurchaseOrderAction,

  addGoodsReceipt,
  editGoodsReceipt,
  deleteGoodsReceipt,

  addPurchaseBill,
  editPurchaseBill,
  deletePurchaseBill,

  addInternalAllocation,
  deleteInternalAllocation,

  addDispatch,
  editDispatch,
  deleteDispatch,
  setDispatchStatus as setDispatchStatusAction,

  addSalesReturn,
  deleteSalesReturn,
  decideSalesReturn as decideSalesReturnAction,

  addRecall,
  deleteRecall,
  logRecallReturn as logRecallReturnAction,
  closeRecall as closeRecallAction,
} from '../../store/erpSlice'

import {
  getScopedCompanyId,
  enforceCompanyPayload,
} from '../../utils/companyScope'


// ============================================================
// HELPERS
// ============================================================

function getState() {
  return store.getState().erp
}


function getCompanyId() {
  const companyId =
    getScopedCompanyId()

  if (!companyId) {
    throw new Error(
      'No active company is selected.'
    )
  }

  return Number(companyId)
}


function filterByCompany(
  rows,
  companyId = getCompanyId()
) {
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


function findCompany(
  id,
  state
) {
  return state.companies.find(
    (company) =>
      Number(company.id) ===
      Number(id)
  )
}


function findSupplier(
  id,
  state
) {
  return state.suppliers.find(
    (supplier) =>
      Number(supplier.id) ===
      Number(id)
  )
}


function findItem(
  id,
  state
) {
  return state.items.find(
    (item) =>
      Number(item.id) ===
      Number(id)
  )
}


function findLocation(
  id,
  state
) {
  return state.locations.find(
    (location) =>
      Number(location.id) ===
      Number(id)
  )
}


function findLot(
  id,
  state
) {
  return state.lots.find(
    (lot) =>
      Number(lot.id) ===
      Number(id)
  )
}


function assertCompanyRecord(
  collection,
  id
) {
  const companyId =
    getCompanyId()

  const record =
    (
      Array.isArray(collection)
        ? collection
        : []
    ).find(
      (row) =>
        Number(row.id) ===
        Number(id)
    )

  if (
    !record ||
    Number(record.company) !==
      Number(companyId)
  ) {
    throw new Error(
      'This record does not belong to the active company.'
    )
  }

  return record
}


/*
 * IMPORTANT:
 *
 * Company-specific create operations ALWAYS
 * use the active workspace company.
 *
 * Any company value coming from the form
 * is ignored/replaced.
 */
function scopedPayload(
  payload = {}
) {
  return enforceCompanyPayload(
    payload
  )
}


// ============================================================
// SERVICE
// ============================================================

export const supplyChainService = {

  // ==========================================================
  // MASTER DATA
  // ==========================================================

  /*
   * Company selector inside Supply Chain:
   *
   * Normal users:
   *   Company A only
   *
   * Super Admin:
   *   Currently selected company only
   *
   * Global A/B switching is handled by
   * WorkspaceContext.
   */
  getCompanies() {

    const state =
      getState()

    const companyId =
      getCompanyId()

    return delay(
      state.companies.filter(
        (company) =>
          Number(company.id) ===
          Number(companyId)
      )
    )
  },


  /*
   * UOM belongs to Common Inventory.
   *
   * SHARED.
   */
  getUoms() {
    return delay(
      getState().uoms
    )
  },


  /*
   * Items belong to Common Inventory.
   *
   * SHARED.
   */
  getItems() {
    return delay(
      getState().items
    )
  },


  /*
   * Storage Locations belong to
   * Common Inventory.
   *
   * SHARED.
   */
  getLocations() {
    return delay(
      getState().locations
    )
  },


  /*
   * Lots belong to Common Inventory.
   *
   * SHARED.
   */
  getLots() {
    return delay(
      getState().lots
    )
  },


  /*
   * Products are company-specific.
   */
  getProducts() {

    const state =
      getState()

    return delay(
      filterByCompany(
        state.products
      )
    )
  },


  /*
   * Customers are company-specific.
   */
  getCustomers() {

    const state =
      getState()

    return delay(
      filterByCompany(
        state.customers
      )
    )
  },


  /*
   * Production batches are company-specific.
   */
  getBatches() {

    const state =
      getState()

    return delay(
      filterByCompany(
        state.batches
      )
    )
  },


  /*
   * Invoices are company-specific.
   */
  getInvoices() {

    const state =
      getState()

    return delay(
      filterByCompany(
        state.invoices
      )
    )
  },


  // ==========================================================
  // SUPPLIERS
  // ==========================================================

  getSuppliers() {

    const state =
      getState()

    return delay(
      filterByCompany(
        state.suppliers
      )
    )
  },


  createSupplier(
    payload
  ) {

    const scoped =
      scopedPayload(
        payload
      )

    store.dispatch(
      addSupplier({

        ...scoped,

        is_active:
          true,

      })
    )

    return delay(null)
  },


  updateSupplier(
    id,
    payload
  ) {

    const state =
      getState()

    assertCompanyRecord(
      state.suppliers,
      id
    )

    const safePayload = {
      ...payload,
    }

    /*
     * Company cannot be changed
     * from edit screen.
     */
    delete safePayload.company

    store.dispatch(
      editSupplier({

        id,

        payload:
          safePayload,

      })
    )

    return delay(null)
  },


  deleteSupplier(
    id
  ) {

    const state =
      getState()

    assertCompanyRecord(
      state.suppliers,
      id
    )

    store.dispatch(
      deleteSupplier({
        id,
      })
    )

    return delay(null)
  },


  setSupplierStatus(
    id,
    is_active
  ) {

    const state =
      getState()

    assertCompanyRecord(
      state.suppliers,
      id
    )

    store.dispatch(
      setSupplierStatus({

        id,

        is_active,

      })
    )

    return delay(null)
  },


  // ==========================================================
  // PURCHASE ORDERS
  // ==========================================================

  getPurchaseOrders() {

    const state =
      getState()

    const rows =
      filterByCompany(
        state.purchaseOrders
      ).map(
        (po) => {

          const company =
            findCompany(
              po.company,
              state
            )

          const supplier =
            findSupplier(
              po.supplier,
              state
            )

          return {

            ...po,

            company_name:
              company?.name || '',

            supplier_name:
              supplier?.name || '',

          }
        }
      )

    return delay(
      rows.reverse()
    )
  },


  createPurchaseOrder(
    payload
  ) {

    const scoped =
      scopedPayload(
        payload
      )

    store.dispatch(
      addPurchaseOrder({

        ...scoped,

        company:
          Number(
            scoped.company
          ),

        supplier:
          Number(
            scoped.supplier
          ),

        lines:
          scoped.lines || [],

        status:
          scoped.status ||
          'DRAFT',

      })
    )

    return delay(null)
  },


  updatePurchaseOrder(
    id,
    payload
  ) {

    const state =
      getState()

    assertCompanyRecord(
      state.purchaseOrders,
      id
    )

    const safePayload = {
      ...payload,
    }

    delete safePayload.company

    store.dispatch(
      editPurchaseOrder({

        id,

        payload:
          safePayload,

      })
    )

    return delay(null)
  },


  deletePurchaseOrder(
    id
  ) {

    const state =
      getState()

    assertCompanyRecord(
      state.purchaseOrders,
      id
    )

    store.dispatch(
      deletePurchaseOrder({
        id,
      })
    )

    return delay(null)
  },


  approvePurchaseOrder(
    id
  ) {

    const state =
      getState()

    assertCompanyRecord(
      state.purchaseOrders,
      id
    )

    store.dispatch(
      approvePurchaseOrderAction({
        id,
      })
    )

    return delay(null)
  },


  cancelPurchaseOrder(
    id
  ) {

    const state =
      getState()

    assertCompanyRecord(
      state.purchaseOrders,
      id
    )

    store.dispatch(
      cancelPurchaseOrderAction({
        id,
      })
    )

    return delay(null)
  },


  // ==========================================================
  // GOODS RECEIPTS
  // ==========================================================

  getGoodsReceipts() {

    const state =
      getState()

    const rows =
      filterByCompany(
        state.goodsReceipts
      ).map(
        (grn) => {

          const company =
            findCompany(
              grn.company,
              state
            )

          const supplier =
            findSupplier(
              grn.supplier,
              state
            )

          return {

            ...grn,

            company_name:
              company?.name || '',

            supplier_name:
              supplier?.name || '',

          }
        }
      )

    return delay(
      rows.reverse()
    )
  },


  createGoodsReceipt(
    payload
  ) {

    const scoped =
      scopedPayload(
        payload
      )

    const quantity =
      Number(
        scoped.quantity
      )

    store.dispatch(
      addGoodsReceipt({

        ...scoped,

        company:
          Number(
            scoped.company
          ),

        supplier:
          Number(
            scoped.supplier
          ),

        po:
          scoped.po
            ? Number(
                scoped.po
              )
            : null,

        quantity,

        status:
          'RECEIVED',

      })
    )


    /*
     * GRN creates stock in the
     * COMMON INVENTORY.
     *
     * No company is used for the
     * common stock itself.
     */
    if (
      scoped.item &&
      scoped.location &&
      scoped.lot_number &&
      quantity > 0
    ) {

      store.dispatch({

        type:
          'erp/receiveStock',

        payload: {

          item:
            Number(
              scoped.item
            ),

          location:
            Number(
              scoped.location
            ),

          lot_number:
            scoped.lot_number,

          received_quantity:
            quantity,

          expiry_date:
            scoped.expiry_date ||
            null,

          manufacture_date:
            scoped.manufacture_date ||
            null,

          supplier:
            scoped.supplier
              ? Number(
                  scoped.supplier
                )
              : null,

          supplier_name:
            scoped.supplier_name ||
            '',

          reference_note:
            `GRN ${
              scoped.grn_number ||
              ''
            }`,

        },

      })
    }

    return delay(null)
  },


  updateGoodsReceipt(
    id,
    payload
  ) {

    const state =
      getState()

    assertCompanyRecord(
      state.goodsReceipts,
      id
    )

    const safePayload = {
      ...payload,
    }

    delete safePayload.company

    store.dispatch(
      editGoodsReceipt({

        id,

        payload:
          safePayload,

      })
    )

    return delay(null)
  },


  deleteGoodsReceipt(
    id
  ) {

    const state =
      getState()

    assertCompanyRecord(
      state.goodsReceipts,
      id
    )

    store.dispatch(
      deleteGoodsReceipt({
        id,
      })
    )

    return delay(null)
  },


  // ==========================================================
  // PURCHASE BILLS
  // ==========================================================

  getPurchaseBills() {

    const state =
      getState()

    const rows =
      filterByCompany(
        state.purchaseBills
      ).map(
        (bill) => {

          const company =
            findCompany(
              bill.company,
              state
            )

          const supplier =
            findSupplier(
              bill.supplier,
              state
            )

          const total =
            Number(
              bill.total_amount ||
              0
            )

          const paid =
            Number(
              bill.paid_amount ||
              0
            )

          return {

            ...bill,

            company_name:
              company?.name || '',

            supplier_name:
              supplier?.name || '',

            outstanding_amount:
              total - paid,

          }
        }
      )

    return delay(
      rows.reverse()
    )
  },


  createPurchaseBill(
    payload
  ) {

    const scoped =
      scopedPayload(
        payload
      )

    store.dispatch(
      addPurchaseBill({

        ...scoped,

        company:
          Number(
            scoped.company
          ),

        supplier:
          Number(
            scoped.supplier
          ),

        total_amount:
          Number(
            scoped.total_amount ||
            0
          ),

        paid_amount:
          Number(
            scoped.paid_amount ||
            0
          ),

      })
    )

    return delay(null)
  },


  updatePurchaseBill(
    id,
    payload
  ) {

    const state =
      getState()

    assertCompanyRecord(
      state.purchaseBills,
      id
    )

    const safePayload = {
      ...payload,
    }

    delete safePayload.company

    store.dispatch(
      editPurchaseBill({

        id,

        payload:
          safePayload,

      })
    )

    return delay(null)
  },


  deletePurchaseBill(
    id
  ) {

    const state =
      getState()

    assertCompanyRecord(
      state.purchaseBills,
      id
    )

    store.dispatch(
      deletePurchaseBill({
        id,
      })
    )

    return delay(null)
  },


  // ==========================================================
  // INTERNAL ALLOCATION
  // ==========================================================

  getInternalAllocations() {

    const state =
      getState()

    const rows =
      filterByCompany(
        state.internalAllocations
      ).map(
        (row) => {

          const company =
            findCompany(
              row.company,
              state
            )

          const item =
            findItem(
              row.item,
              state
            )

          const lot =
            findLot(
              row.lot,
              state
            )

          return {

            ...row,

            company_name:
              company?.name || '',

            item_name:
              item?.name || '',

            item_code:
              item?.code || '',

            lot_number:
              lot?.lot_number || '',

          }
        }
      )

    return delay(
      rows.reverse()
    )
  },


  createInternalAllocation(
    payload
  ) {

    const scoped =
      scopedPayload(
        payload
      )

    const state =
      getState()

    const lot =
      findLot(
        scoped.lot,
        state
      )

    if (!lot) {

      throw new Error(
        'Selected lot was not found.'
      )

    }

    const quantity =
      Number(
        scoped.quantity
      )

    const available =
      Number(
        lot.available_quantity ||
        0
      )

    if (
      !Number.isFinite(
        quantity
      ) ||
      quantity <= 0
    ) {

      throw new Error(
        'Enter a valid quantity.'
      )

    }

    if (
      quantity >
      available
    ) {

      throw new Error(
        `Only ${available} quantity is available in this lot.`
      )

    }


    /*
     * Allocation record belongs to
     * current company.
     */
    store.dispatch(
      addInternalAllocation({

        ...scoped,

        company:
          Number(
            scoped.company
          ),

        item:
          Number(
            scoped.item
          ),

        lot:
          Number(
            scoped.lot
          ),

        quantity,

      })
    )


    /*
     * Stock itself remains COMMON.
     */
    store.dispatch({

      type:
        'erp/issueStock',

      payload: {

        lot:
          Number(
            scoped.lot
          ),

        company:
          Number(
            scoped.company
          ),

        quantity,

        reference_note:
          scoped.reference_note ||
          'Internal Company Allocation',

      },

    })

    return delay(null)
  },


  deleteInternalAllocation(
    id
  ) {

    const state =
      getState()

    assertCompanyRecord(
      state.internalAllocations,
      id
    )

    store.dispatch(
      deleteInternalAllocation({
        id,
      })
    )

    return delay(null)
  },


  // ==========================================================
  // DISPATCH
  // ==========================================================

  getDispatches() {

    const state =
      getState()

    const rows =
      filterByCompany(
        state.dispatches
      ).map(
        (row) => {

          const company =
            findCompany(
              row.company,
              state
            )

          const customer =
            state.customers.find(
              (customer) =>
                Number(
                  customer.id
                ) ===
                Number(
                  row.customer
                )
            )

          return {

            ...row,

            company_name:
              company?.name || '',

            customer_name:
              customer?.name || '',

          }
        }
      )

    return delay(
      rows.reverse()
    )
  },


  createDispatch(
    payload
  ) {

    const scoped =
      scopedPayload(
        payload
      )

    store.dispatch(
      addDispatch({

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

        batch:
          scoped.batch
            ? Number(
                scoped.batch
              )
            : null,

        invoice:
          scoped.invoice
            ? Number(
                scoped.invoice
              )
            : null,

      })
    )

    return delay(null)
  },


  updateDispatch(
    id,
    payload
  ) {

    const state =
      getState()

    assertCompanyRecord(
      state.dispatches,
      id
    )

    const safePayload = {
      ...payload,
    }

    delete safePayload.company

    store.dispatch(
      editDispatch({

        id,

        payload:
          safePayload,

      })
    )

    return delay(null)
  },


  deleteDispatch(
    id
  ) {

    const state =
      getState()

    assertCompanyRecord(
      state.dispatches,
      id
    )

    store.dispatch(
      deleteDispatch({
        id,
      })
    )

    return delay(null)
  },


  setDispatchStatus(
    id,
    status
  ) {

    const state =
      getState()

    assertCompanyRecord(
      state.dispatches,
      id
    )

    store.dispatch(
      setDispatchStatusAction({

        id,

        status,

      })
    )

    return delay(null)
  },


  // ==========================================================
  // SALES RETURNS
  // ==========================================================

  getSalesReturns() {

    const state =
      getState()

    const rows =
      filterByCompany(
        state.salesReturns
      ).map(
        (row) => {

          const company =
            findCompany(
              row.company,
              state
            )

          const customer =
            state.customers.find(
              (customer) =>
                Number(
                  customer.id
                ) ===
                Number(
                  row.customer
                )
            )

          return {

            ...row,

            company_name:
              company?.name || '',

            customer_name:
              customer?.name || '',

          }
        }
      )

    return delay(
      rows.reverse()
    )
  },


  createSalesReturn(
    payload
  ) {

    const scoped =
      scopedPayload(
        payload
      )

    store.dispatch(
      addSalesReturn({

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

        invoice:
          scoped.invoice
            ? Number(
                scoped.invoice
              )
            : null,

      })
    )

    return delay(null)
  },


  deleteSalesReturn(
    id
  ) {

    const state =
      getState()

    assertCompanyRecord(
      state.salesReturns,
      id
    )

    store.dispatch(
      deleteSalesReturn({
        id,
      })
    )

    return delay(null)
  },


  decideSalesReturn(
    id,
    status,
    reason = ''
  ) {

    const state =
      getState()

    assertCompanyRecord(
      state.salesReturns,
      id
    )

    store.dispatch(
      decideSalesReturnAction({

        id,

        status,

        reason,

      })
    )

    return delay(null)
  },


  // ==========================================================
  // RECALL
  // ==========================================================

  getRecalls() {

    const state =
      getState()

    const rows =
      filterByCompany(
        state.recalls
      ).map(
        (row) => {

          const company =
            findCompany(
              row.company,
              state
            )

          const batch =
            state.batches.find(
              (batch) =>
                Number(
                  batch.id
                ) ===
                Number(
                  row.batch
                )
            )

          return {

            ...row,

            company_name:
              company?.name || '',

            batch_number:
              batch?.number || '',

          }
        }
      )

    return delay(
      rows.reverse()
    )
  },


  createRecall(
    payload
  ) {

    const scoped =
      scopedPayload(
        payload
      )

    store.dispatch(
      addRecall({

        ...scoped,

        company:
          Number(
            scoped.company
          ),

        batch:
          scoped.batch
            ? Number(
                scoped.batch
              )
            : null,

      })
    )

    return delay(null)
  },


  deleteRecall(
    id
  ) {

    const state =
      getState()

    assertCompanyRecord(
      state.recalls,
      id
    )

    store.dispatch(
      deleteRecall({
        id,
      })
    )

    return delay(null)
  },


  logRecallReturn(
    id,
    quantity
  ) {

    const state =
      getState()

    assertCompanyRecord(
      state.recalls,
      id
    )

    store.dispatch(
      logRecallReturnAction({

        id,

        quantity:
          Number(
            quantity
          ),

      })
    )

    return delay(null)
  },


  closeRecall(
    id
  ) {

    const state =
      getState()

    assertCompanyRecord(
      state.recalls,
      id
    )

    store.dispatch(
      closeRecallAction({
        id,
      })
    )

    return delay(null)
  },

}