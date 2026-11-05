/**
 * productionApiService.js
 *
 * Bridges the Production page with real backend data:
 *  - Fetches live SalesOrders from /v1/companies/<id>/sales-orders/
 *  - Fetches + upserts ProductionOrderStatus from /v1/companies/<id>/production-statuses/
 *  - Returns merged order objects compatible with the existing Production UI
 */

import api from '../../api/axios'
import { store } from '../../store/store'
import { getScopedCompanyId, isSuperAdmin, getLockedCompanyIds } from '../../utils/companyScope'
import { storage } from '../../utils/storage'
import { mergeApiOrders } from '../../store/erpSlice'

/* ---------- helpers ---------- */

function getCompanyId() {
  const user = storage.getUser()
  if (isSuperAdmin(user)) return getScopedCompanyId(user)
  const locked = getLockedCompanyIds(user)
  const primary = Number(locked?.[0])
  if (Number.isFinite(primary) && primary > 0) return primary
  return getScopedCompanyId(user)
}

const ordersBase = (cid) => `/v1/companies/${cid}/sales-orders`
const statusBase = (cid) => `/v1/companies/${cid}/production-statuses`

/** Map a backend SalesOrder to the shape the Production UI expects */
function normalizeOrder(apiOrder, statusMap = {}) {
  const id = String(apiOrder.id)
  const ps = statusMap[id] || {}

  // Resolve dosage form from product_type_snapshot on first line
  const firstLine = apiOrder.lines?.[0]
  const dosage_form =
    firstLine?.product_type_snapshot ||
    apiOrder.product_type_snapshot ||
    ''

  const customerId = apiOrder.customer_id ?? apiOrder.customer?.id ?? apiOrder.customer ?? null
  const customerName = apiOrder.customer_name ?? apiOrder.customer?.name ?? ''
  const companyId = apiOrder.company_id ?? apiOrder.company?.id ?? apiOrder.company ?? null

  const rawQty = firstLine?.quantity
  const uom = firstLine?.sales_uom_code || firstLine?.sales_uom_name || ''
  const batchSizeStr = rawQty != null ? (uom ? `${rawQty} ${uom}` : String(rawQty)) : ''

  return {
    // --- core identity ---
    id: apiOrder.id,
    number: apiOrder.reference,
    order_date: apiOrder.order_date,
    status: apiOrder.status,
    version: apiOrder.version,
    currency: apiOrder.currency,
    notes: apiOrder.notes,
    customer_order_reference: apiOrder.customer_order_reference,

    // --- customer ---
    customer: customerId,
    customer_id: customerId,
    customer_name: customerName,

    // --- product (from first line) ---
    product_id: firstLine?.product_id,
    product_name: firstLine?.product_name || '',
    product_code: firstLine?.product_code || '',
    dosage_form,
    dosageForm: dosage_form,

    // --- batch / quantity ---
    batch_no: ps.batch_no || apiOrder.customer_order_reference || '',
    batch_size: batchSizeStr,
    quantity: rawQty,
    unit_price: firstLine?.unit_price,

    // --- dates ---
    supply_by_date:
      apiOrder.requested_delivery_date ||
      apiOrder.planned_manufacturing_date ||
      '—',
    planned_mfg_date: apiOrder.planned_manufacturing_date,
    delivery_deadline: apiOrder.requested_delivery_date,

    // --- company ---
    company: companyId,
    company_id: companyId,
    company_name: apiOrder.company?.name || (companyId === 2 ? 'Tej Biocare' : 'CMHP Pharma'),

    // --- production status (from ProductionOrderStatus table) ---
    bmr_status: ps.bmr_status || 'NO',
    production_status: ps.production_status || 'In Planning',
    production_remark: ps.production_remark || '',
    packaging_status: ps.packaging_status || 'Pending',
    dispatch_status: ps.dispatch_status || 'NO',
    qa_status: ps.qa_status || 'Pending',
    qa_remark: ps.qa_remark || '',

    // --- raw lines ---
    lines: apiOrder.lines || [],
  }
}

/* ---------- exported service ---------- */

export const productionApiService = {
  /**
   * Fetch ALL pages of sales orders + production statuses for the active company,
   * merge them, dispatch `mergeApiOrders` to Redux so the rest of the UI sees them,
   * and return the merged list.
   */
  fetchAndSyncOrders: async () => {
    const companyId = getCompanyId()
    if (!companyId) return []

    try {
      // 1. Fetch all sales orders (handle pagination)
      let allOrders = []
      let page = 1
      const pageSize = 100
      while (true) {
        const res = await api.get(`${ordersBase(companyId)}/`, {
          params: { page, page_size: pageSize },
        })
        const data = res.data
        const results = Array.isArray(data.results) ? data.results : (Array.isArray(data) ? data : [])
        allOrders = allOrders.concat(results)
        if (!data.next || results.length < pageSize) break
        page += 1
      }

      // 2. Fetch all production statuses for this company
      let statusMap = {}
      try {
        const sRes = await api.get(`${statusBase(companyId)}/`)
        const statuses = Array.isArray(sRes.data) ? sRes.data : []
        statuses.forEach((s) => {
          statusMap[String(s.order_id)] = s
        })
      } catch {
        // production statuses table may be empty; not fatal
      }

      // 3. Merge
      const merged = allOrders.map((o) => normalizeOrder(o, statusMap))

      // 4. Push into Redux so existing selectors / components all pick them up
      store.dispatch(mergeApiOrders({ companyId, orders: merged }))

      return merged
    } catch (err) {
      console.warn('[productionApiService] fetchAndSyncOrders error:', err?.message || err)
      return []
    }
  },

  /**
   * Persist a production status update to the backend, then also update Redux.
   * `payload` shape: { id, bmr_status?, production_status?, remark?, packaging_status?, dispatch?, qa_status?, qa_remark?, batch_no? }
   */
  updateProductionStatus: async (payload) => {
    const { id, ...rest } = payload || {}
    if (!id) return

    const companyId = getCompanyId()
    if (!companyId) return

    try {
      await api.patch(`${statusBase(companyId)}/${id}/`, rest)
    } catch (err) {
      // If the record doesn't exist yet (404), create it with POST
      if (err?.response?.status === 404) {
        try {
          await api.post(`${statusBase(companyId)}/`, { order_id: String(id), ...rest })
        } catch (postErr) {
          console.warn('[productionApiService] updateProductionStatus POST fallback error:', postErr?.message)
        }
      } else {
        console.warn('[productionApiService] updateProductionStatus PATCH error:', err?.message)
      }
    }
  },
}
