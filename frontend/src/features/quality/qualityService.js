import { store } from '../../store/store'
import { delay } from '../../store/mockApi'
import { setBatchQc, setBatchQa } from '../../store/erpSlice'

function hydrateBatch(b, state) {
  const company = state.companies.find((c) => c.id === Number(b.company))
  const product = state.products.find((p) => p.id === Number(b.product))
  const formula = state.formulas.find((f) => f.id === Number(b.formula))
  const order = state.orders.find((o) => o.id === Number(b.order))
  return {
    ...b,
    company_name: company?.name || '',
    product_name: product?.name || '',
    formula_name: formula?.name || '',
    order_number: order?.number || '',
  }
}

export const qualityService = {
  getBatches: () => {
    const state = store.getState().erp
    return delay(state.batches.map((b) => hydrateBatch(b, state)))
  },

  qcDecision: (batchId, payload) => {
    store.dispatch(setBatchQc({ batchId, decision: payload.decision, remarks: payload.remarks }))
    return delay(null)
  },

  qaDecision: (batchId, payload) => {
    store.dispatch(setBatchQa({ batchId, decision: payload.decision, remarks: payload.remarks }))
    return delay(null)
  },

  getBatchTraceability: (batchId) => {
    const state = store.getState().erp
    const batch = state.batches.find((b) => b.id === Number(batchId))

    if (!batch) {
      return delay({ material_consumption: [], qc_history: [], qa_history: [], order: null, invoice: null })
    }

    const material_consumption = (batch.material_consumption || []).map((mc) => {
      const item = state.items.find((i) => i.id === Number(mc.item))
      const uom = item ? state.uoms.find((u) => u.id === Number(item.uom)) : null
      return {
        item_code: item?.code || '',
        item_name: item?.name || '',
        lot_number: mc.lot_number || '',
        quantity: mc.quantity,
        uom: uom?.code || '',
        issued_at: mc.issued_at,
      }
    })

    const order = state.orders.find((o) => o.id === Number(batch.order)) || null
    const invoice = state.invoices.find((i) => Number(i.batch) === batch.id) || null

    return delay({
      material_consumption,
      qc_history: batch.qc_history || [],
      qa_history: batch.qa_history || [],
      order,
      invoice,
    })
  },
}