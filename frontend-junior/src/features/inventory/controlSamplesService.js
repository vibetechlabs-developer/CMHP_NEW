/**
 * Real company-scoped Control / Retention Sample Register
 * (apps.quality.ControlSample via /api/v1/companies/:id/control-samples/).
 */
import api from '../../api/axios'

function mapSample(row) {
  if (!row) return null
  return {
    id: row.id,
    batchNo: row.batch_no,
    productCode: row.product_code || '',
    productName: row.product_name,
    packSize: row.pack_size || '',
    sampleQty: Number(row.sample_qty),
    unit: row.unit || 'Bottles',
    sampleType: row.sample_type || 'RETENTION',
    mfgDate: row.mfg_date || '',
    expDate: row.exp_date || '',
    storageLocation: row.storage_location || '',
    arNo: row.ar_no || '',
    testedBy: row.tested_by || '',
    status: row.status,
    disposalDate: row.disposed_at ? String(row.disposed_at).slice(0, 10) : null,
    notes: row.notes || '',
    loggedAt: row.created_at,
    productId: row.product_id,
    salesOrderId: row.sales_order_id,
    batchPlanId: row.batch_plan_id,
    fgDeducted: Boolean(row.fg_deducted),
    disposedBy: row.disposed_by_id,
    disposalRemarks: row.disposal_remarks || '',
  }
}

const base = (companyId) => `/v1/companies/${companyId}/control-samples`

export const controlSamplesService = {
  listSamples: async ({ companyId, search = '', status = 'ALL', sampleType = 'ALL', salesOrderId } = {}) => {
    if (!companyId) return []
    const params = { page_size: 200 }
    if (search) params.search = search
    if (status && status !== 'ALL') params.status = status
    if (sampleType && sampleType !== 'ALL') params.sample_type = sampleType
    if (salesOrderId) params.sales_order = salesOrderId
    const response = await api.get(`${base(companyId)}/`, { params })
    const rows = Array.isArray(response.data) ? response.data : response.data.results || []
    return rows.map(mapSample)
  },

  logSample: async (sampleData) => {
    const companyId = sampleData.companyId
    if (!companyId) throw new Error('companyId is required to log a control sample.')
    const payload = {
      batch_no: sampleData.batchNo || sampleData.batch_no,
      product_name: sampleData.productName || sampleData.product_name,
      sample_qty: sampleData.sampleQty ?? sampleData.sample_qty,
      product_id: sampleData.productId || sampleData.product_id || null,
      sales_order_id: sampleData.salesOrderId || sampleData.sales_order_id || null,
      batch_plan_id: sampleData.batchPlanId || sampleData.batch_plan_id || null,
      product_code: sampleData.productCode || sampleData.product_code || '',
      pack_size: sampleData.packSize || sampleData.pack_size || '',
      unit: sampleData.unit || 'Bottles',
      sample_type: sampleData.sampleType || sampleData.sample_type || 'RETENTION',
      storage_location: sampleData.storageLocation || sampleData.storage_location || '',
      ar_no: sampleData.arNo || sampleData.ar_no || '',
      mfg_date: typeof sampleData.mfgDate === 'function' ? sampleData.mfgDate() : sampleData.mfgDate || sampleData.mfg_date || null,
      exp_date: typeof sampleData.expDate === 'function' ? sampleData.expDate() : sampleData.expDate || sampleData.exp_date || null,
      tested_by: sampleData.testedBy || sampleData.tested_by || '',
      notes: sampleData.notes || '',
      deduct_fg: Boolean(sampleData.deductFg || sampleData.deduct_fg),
    }
    const response = await api.post(`${base(companyId)}/`, payload)
    return mapSample(response.data)
  },

  updateSample: async (id, patch) => {
    const companyId = patch.companyId
    if (!companyId) throw new Error('companyId is required to update a control sample.')
    const payload = {}
    if (patch.sampleQty != null) payload.sample_qty = patch.sampleQty
    if (patch.packSize != null) payload.pack_size = patch.packSize
    if (patch.unit != null) payload.unit = patch.unit
    if (patch.sampleType != null) payload.sample_type = patch.sampleType
    if (patch.storageLocation != null) payload.storage_location = patch.storageLocation
    if (patch.arNo != null) payload.ar_no = patch.arNo
    if (patch.mfgDate != null) payload.mfg_date = patch.mfgDate
    if (patch.expDate != null) payload.exp_date = patch.expDate
    if (patch.testedBy != null) payload.tested_by = patch.testedBy
    if (patch.notes != null) payload.notes = patch.notes
    const response = await api.patch(`${base(companyId)}/${id}/`, payload)
    return mapSample(response.data)
  },

  disposeSample: async (id, { companyId, disposedBy, remarks } = {}) => {
    if (!companyId) throw new Error('companyId is required to dispose a control sample.')
    const response = await api.post(`${base(companyId)}/${id}/dispose/`, {
      remarks: remarks || `Disposed by ${disposedBy || 'QA Head'}`,
    })
    return mapSample(response.data)
  },

  getMetrics: async ({ companyId } = {}) => {
    const items = await controlSamplesService.listSamples({ companyId })
    return {
      totalSamples: items.length,
      activeRetention: items.filter((s) => s.status === 'ACTIVE').length,
      dueDisposal: items.filter((s) => s.status === 'DUE_DISPOSAL').length,
      disposed: items.filter((s) => s.status === 'DISPOSED').length,
      totalUnitsRetained: items.reduce((acc, s) => acc + (Number(s.sampleQty) || 0), 0),
    }
  },
}
