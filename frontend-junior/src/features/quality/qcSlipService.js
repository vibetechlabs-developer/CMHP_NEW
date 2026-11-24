import api from '../../api/axios'
import { productionService } from '../production/productionService'
import { normalizeProductTypeKey, getProductTypeDisplayName } from '../production/bmrTemplates/index.js'

const QC_SLIP_STORAGE_PREFIX = 'cmhp_qc_slip_v1_'

export const qcSlipService = {
  /**
   * Fetch QC slip records from backend Django API (with localStorage cache fallback)
   */
  fetchQcSlips: async (companyId, params = {}) => {
    try {
      const url = companyId
        ? `/v1/companies/${companyId}/qc-slips/`
        : `/v1/qc/slips/`
      const res = await api.get(url, { params })
      return res?.data?.results || (Array.isArray(res?.data) ? res.data : [])
    } catch (err) {
      console.warn('[qcSlipService] backend fetch failed, using local records:', err?.message)
      return []
    }
  },

  /**
   * Fetch all production orders (from the exact same source as BMR)
   * merged with their QC status for the given slipKind ('bulk_release' | 'test_request').
   */
  getOrdersForQc: async (companyId, slipKind) => {
    // 1. Get orders from productionService (exact same orders as BMR)
    const ords = await productionService.getOrders()
    const orderList = Array.isArray(ords?.data) ? ords.data : (Array.isArray(ords) ? ords : [])

    // 2. Fetch backend QC slip records for this slipKind
    let slipRecords = []
    try {
      slipRecords = await qcSlipService.fetchQcSlips(companyId, { slip_kind: slipKind })
    } catch {
      slipRecords = []
    }

    // Build lookup map by order_id
    const slipMap = {}
    slipRecords.forEach((rec) => {
      if (rec.order_id) {
        slipMap[String(rec.order_id)] = rec
      }
    })

    // 3. Merge each order with its QC slip status
    return orderList.map((order) => {
      const orderIdStr = String(order.id)
      const rawForm = order.dosage_form || order.dosageForm || order.product_type || order.category || 'Tablet'
      const normType = normalizeProductTypeKey(rawForm)
      const displayType = getProductTypeDisplayName(normType || rawForm)

      // Check backend record first
      const backendRec = slipMap[orderIdStr]

      // Also check localStorage for local drafts or fallback
      let localRec = null
      try {
        const localKey = `${QC_SLIP_STORAGE_PREFIX}${slipKind}_${normType}_${order.batch_no || order.id}`
        const rawLocal = localStorage.getItem(localKey)
        if (rawLocal) localRec = JSON.parse(rawLocal)
      } catch {}

      // Check status marker in localStorage
      let localStatus = null
      try {
        const statusKey = `cmhp_qc_status_${slipKind}_${orderIdStr}`
        localStatus = localStorage.getItem(statusKey)
      } catch {}

      let qcStatus = 'PENDING'
      if (backendRec?.status) {
        qcStatus = backendRec.status
      } else if (localStatus) {
        qcStatus = localStatus
      } else if (localRec) {
        qcStatus = 'SAVED'
      }

      const orderDate = order.order_date || order.date || (order.created_at ? order.created_at.slice(0, 10) : '') || '—'

      return {
        ...order,
        orderId: order.id,
        orderNumber: order.number || order.order_number || `ORD-${order.id}`,
        productName: order.product_name || order.name || order.product || '—',
        productType: normType,
        productTypeDisplay: displayType,
        batchNo: order.batch_no || order.batch || '—',
        batchSize: order.batch_size || (order.quantity != null ? `${order.quantity} Units` : '—'),
        orderDate,
        qcStatus, // 'PENDING' | 'SAVED' | 'COMPLETED'
        qcRecord: backendRec || localRec || null,
        qcCompletedAt: backendRec?.completed_at || null,
      }
    })
  },

  /**
   * Save QC slip data to backend PostgreSQL and localStorage
   */
  saveQcSlip: async (companyId, payload) => {
    const { order_id, batch_no, product_type, slip_kind, sub_kind = '', data, status = 'SAVED' } = payload

    // 1. Mirror to localStorage immediately for instant offline durability
    try {
      const storeKey = `${QC_SLIP_STORAGE_PREFIX}${slip_kind}_${product_type}_${batch_no || order_id}`
      localStorage.setItem(storeKey, JSON.stringify({
        version: 1,
        order_id,
        batch_no,
        product_type,
        slip_kind,
        sub_kind,
        status,
        data,
        savedAt: new Date().toISOString(),
      }))
    } catch {}

    // 2. Persist to Backend Django API
    try {
      const url = companyId
        ? `/v1/companies/${companyId}/qc-slips/`
        : `/v1/qc/slips/`
      const res = await api.post(url, {
        order_id: String(order_id),
        batch_no: String(batch_no || ''),
        product_type: String(product_type || ''),
        slip_kind: String(slip_kind || ''),
        sub_kind: String(sub_kind || ''),
        status,
        data,
      })
      return res?.data
    } catch (err) {
      console.warn('[qcSlipService] backend save failed, saved locally:', err?.message)
      return { success: true, localOnly: true }
    }
  },

  /**
   * Update slip status (COMPLETED / PENDING)
   */
  updateSlipStatus: async (companyId, orderId, slipKind, status, extra = {}) => {
    const orderIdStr = String(orderId)

    // 1. Mirror to localStorage
    try {
      const statusKey = `cmhp_qc_status_${slipKind}_${orderIdStr}`
      localStorage.setItem(statusKey, status)
    } catch {}

    // 2. Persist to Backend Django API
    try {
      const url = companyId
        ? `/v1/companies/${companyId}/qc-slips/${orderIdStr}/status/`
        : `/v1/qc/slips/${orderIdStr}/status/`
      const res = await api.post(url, {
        order_id: orderIdStr,
        slip_kind: slipKind,
        product_type: extra.product_type || '',
        sub_kind: extra.sub_kind || '',
        batch_no: extra.batch_no || '',
        status,
      })
      return res?.data
    } catch (err) {
      console.warn('[qcSlipService] backend status update failed, updated locally:', err?.message)
      return { success: true, status, localOnly: true }
    }
  },
}
