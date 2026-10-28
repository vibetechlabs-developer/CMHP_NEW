// import { createSlice } from '@reduxjs/toolkit'

// let idCounter = 5000

// const nextId = () => ++idCounter

// const nowIso = () => new Date().toISOString()

// const initialState = {
//   suppliers: [
//     {
//       id: 1,
//       code: 'SUP-001',
//       name: 'Gujarat API Pvt Ltd',
//       contact_person: 'Purchase Desk',
//       phone: '9876543210',
//       email: 'purchase@gujaratapi.example',
//       gst_number: '24SUP001GST',
//       is_active: true,
//     },
//     {
//       id: 2,
//       code: 'SUP-002',
//       name: 'Ambica Chemicals',
//       contact_person: 'Sales Desk',
//       phone: '9865432100',
//       email: 'sales@ambicachem.example',
//       gst_number: '24SUP002GST',
//       is_active: true,
//     },
//   ],

//   purchaseOrders: [],

//   goodsReceipts: [],

//   purchaseBills: [],

//   internalAllocations: [],

//   dispatches: [],

//   salesReturns: [],

//   recalls: [],

//   creditNotes: [],

//   debitNotes: [],
// }

// const patchById = (list, id, payload) => {
//   const item = list.find((x) => x.id === Number(id))

//   if (item) {
//     Object.assign(item, payload)
//   }
// }

// const supplyChainSlice = createSlice({
//   name: 'supplyChain',

//   initialState,

//   reducers: {
//     // =========================================================
//     // SUPPLIERS
//     // =========================================================

//     addSupplier: (state, action) => {
//       state.suppliers.push({
//         id: nextId(),
//         is_active: true,
//         ...action.payload,
//       })
//     },

//     updateSupplier: (state, action) => {
//       patchById(
//         state.suppliers,
//         action.payload.id,
//         action.payload.payload
//       )
//     },

//     setSupplierStatus: (state, action) => {
//       const supplier = state.suppliers.find(
//         (x) => x.id === Number(action.payload.id)
//       )

//       if (supplier) {
//         supplier.is_active = action.payload.is_active
//       }
//     },

//     // =========================================================
//     // PURCHASE ORDER
//     // =========================================================

//     addPurchaseOrder: (state, action) => {
//       state.purchaseOrders.unshift({
//         id: nextId(),
//         po_number: `PO-${new Date().getFullYear()}-${nextId()}`,
//         status: 'DRAFT',
//         approval_status: 'PENDING',
//         created_at: nowIso(),
//         lines: [],
//         ...action.payload,
//       })
//     },

//     approvePurchaseOrder: (state, action) => {
//       const po = state.purchaseOrders.find(
//         (x) => x.id === Number(action.payload.id)
//       )

//       if (po) {
//         po.status = 'APPROVED'
//         po.approval_status = 'APPROVED'
//         po.approved_at = nowIso()
//         po.approved_by = action.payload.actor_name || 'System'
//       }
//     },

//     cancelPurchaseOrder: (state, action) => {
//       const po = state.purchaseOrders.find(
//         (x) => x.id === Number(action.payload.id)
//       )

//       if (po) {
//         po.status = 'CANCELLED'
//         po.cancelled_at = nowIso()
//         po.cancelled_by = action.payload.actor_name || 'System'
//       }
//     },

//     // =========================================================
//     // GOODS RECEIPT
//     // =========================================================

//     addGoodsReceipt: (state, action) => {
//       state.goodsReceipts.unshift({
//         id: nextId(),
//         grn_number: `GRN-${new Date().getFullYear()}-${nextId()}`,
//         status: 'RECEIVED',
//         qc_status: 'PENDING',
//         received_at: nowIso(),
//         lines: [],
//         ...action.payload,
//       })
//     },

//     setGoodsReceiptQc: (state, action) => {
//       const grn = state.goodsReceipts.find(
//         (x) => x.id === Number(action.payload.id)
//       )

//       if (grn) {
//         grn.qc_status = action.payload.qc_status
//         grn.qc_remarks = action.payload.remarks || ''
//         grn.qc_checked_at = nowIso()
//         grn.qc_checked_by =
//           action.payload.actor_name || 'System'
//       }
//     },

//     // =========================================================
//     // PURCHASE BILL
//     // =========================================================

//     addPurchaseBill: (state, action) => {
//       state.purchaseBills.unshift({
//         id: nextId(),
//         bill_number:
//           action.payload.bill_number ||
//           `PB-${new Date().getFullYear()}-${nextId()}`,
//         status: 'POSTED',
//         paid_amount: 0,
//         created_at: nowIso(),
//         ...action.payload,
//       })
//     },

//     updatePurchaseBillPayment: (state, action) => {
//       const bill = state.purchaseBills.find(
//         (x) => x.id === Number(action.payload.id)
//       )

//       if (!bill) return

//       bill.paid_amount =
//         Number(bill.paid_amount || 0) +
//         Number(action.payload.amount || 0)

//       if (bill.paid_amount >= Number(bill.total_amount || 0)) {
//         bill.status = 'PAID'
//       } else if (bill.paid_amount > 0) {
//         bill.status = 'PARTIAL'
//       }
//     },

//     // =========================================================
//     // INTERNAL COMPANY ALLOCATION
//     // =========================================================

//     addInternalAllocation: (state, action) => {
//       state.internalAllocations.unshift({
//         id: nextId(),
//         allocation_number:
//           action.payload.allocation_number ||
//           `ALLOC-${new Date().getFullYear()}-${nextId()}`,
//         status: 'ISSUED',
//         created_at: nowIso(),
//         ...action.payload,
//       })
//     },

//     completeInternalAllocation: (state, action) => {
//       const allocation = state.internalAllocations.find(
//         (x) => x.id === Number(action.payload.id)
//       )

//       if (allocation) {
//         allocation.status = 'CONSUMED'
//         allocation.consumed_quantity =
//           Number(action.payload.consumed_quantity || 0)

//         allocation.completed_at = nowIso()
//       }
//     },

//     returnInternalAllocation: (state, action) => {
//       const allocation = state.internalAllocations.find(
//         (x) => x.id === Number(action.payload.id)
//       )

//       if (!allocation) return

//       const returnQty = Number(action.payload.quantity || 0)

//       allocation.returned_quantity =
//         Number(allocation.returned_quantity || 0) +
//         returnQty

//       allocation.return_reference =
//         action.payload.reference_note || ''

//       allocation.last_return_at = nowIso()

//       if (
//         Number(allocation.returned_quantity || 0) +
//           Number(allocation.consumed_quantity || 0) >=
//         Number(allocation.issued_quantity || 0)
//       ) {
//         allocation.status = 'COMPLETED'
//       }
//     },

//     // =========================================================
//     // DISPATCH
//     // =========================================================

//     addDispatch: (state, action) => {
//       state.dispatches.unshift({
//         id: nextId(),
//         dispatch_number:
//           action.payload.dispatch_number ||
//           `DIS-${new Date().getFullYear()}-${nextId()}`,
//         status: 'DRAFT',
//         dispatched_quantity: 0,
//         created_at: nowIso(),
//         ...action.payload,
//       })
//     },

//     setDispatchStatus: (state, action) => {
//       const dispatch = state.dispatches.find(
//         (x) => x.id === Number(action.payload.id)
//       )

//       if (!dispatch) return

//       dispatch.status = action.payload.status

//       if (action.payload.status === 'DISPATCHED') {
//         dispatch.dispatched_at = nowIso()
//       }
//     },

//     // =========================================================
//     // SALES RETURN
//     // =========================================================

//     addSalesReturn: (state, action) => {
//       state.salesReturns.unshift({
//         id: nextId(),
//         return_number:
//           action.payload.return_number ||
//           `SR-${new Date().getFullYear()}-${nextId()}`,
//         status: 'PENDING',
//         created_at: nowIso(),
//         ...action.payload,
//       })
//     },

//     decideSalesReturn: (state, action) => {
//       const returnEntry = state.salesReturns.find(
//         (x) => x.id === Number(action.payload.id)
//       )

//       if (!returnEntry) return

//       returnEntry.status = action.payload.decision
//       returnEntry.remarks = action.payload.remarks || ''
//       returnEntry.decided_at = nowIso()
//       returnEntry.decided_by =
//         action.payload.actor_name || 'System'

//       if (action.payload.credit_note_number) {
//         state.creditNotes.unshift({
//           id: nextId(),
//           note_number: action.payload.credit_note_number,
//           company: returnEntry.company,
//           customer: returnEntry.customer,
//           sales_return: returnEntry.id,
//           amount: Number(action.payload.credit_note_amount || 0),
//           status: 'POSTED',
//           created_at: nowIso(),
//         })
//       }
//     },

//     // =========================================================
//     // RECALL
//     // =========================================================

//     addRecall: (state, action) => {
//       state.recalls.unshift({
//         id: nextId(),
//         recall_number:
//           action.payload.recall_number ||
//           `REC-${new Date().getFullYear()}-${nextId()}`,
//         status: 'OPEN',
//         returned_quantity: 0,
//         created_at: nowIso(),
//         ...action.payload,
//       })
//     },

//     logRecallReturn: (state, action) => {
//       const recall = state.recalls.find(
//         (x) => x.id === Number(action.payload.id)
//       )

//       if (!recall) return

//       recall.returned_quantity =
//         Number(recall.returned_quantity || 0) +
//         Number(action.payload.quantity || 0)

//       recall.last_return_at = nowIso()

//       if (
//         Number(recall.returned_quantity) >=
//         Number(recall.recall_quantity)
//       ) {
//         recall.status = 'RETURNED'
//       }
//     },

//     closeRecall: (state, action) => {
//       const recall = state.recalls.find(
//         (x) => x.id === Number(action.payload.id)
//       )

//       if (!recall) return

//       recall.status = 'CLOSED'
//       recall.closed_at = nowIso()
//       recall.closed_by =
//         action.payload.actor_name || 'System'
//       recall.close_remarks =
//         action.payload.remarks || ''
//     },

//     // =========================================================
//     // DEBIT NOTE
//     // =========================================================

//     addDebitNote: (state, action) => {
//       state.debitNotes.unshift({
//         id: nextId(),
//         note_number:
//           action.payload.note_number ||
//           `DN-${new Date().getFullYear()}-${nextId()}`,
//         status: 'POSTED',
//         created_at: nowIso(),
//         ...action.payload,
//       })
//     },
//   },
// })

// export const {
//   addSupplier,
//   updateSupplier,
//   setSupplierStatus,

//   addPurchaseOrder,
//   approvePurchaseOrder,
//   cancelPurchaseOrder,

//   addGoodsReceipt,
//   setGoodsReceiptQc,

//   addPurchaseBill,
//   updatePurchaseBillPayment,

//   addInternalAllocation,
//   completeInternalAllocation,
//   returnInternalAllocation,

//   addDispatch,
//   setDispatchStatus,

//   addSalesReturn,
//   decideSalesReturn,

//   addRecall,
//   logRecallReturn,
//   closeRecall,

//   addDebitNote,
// } = supplyChainSlice.actions

// export default supplyChainSlice.reducer