/**
 * QA Pipeline — company-scoped stage tracker for:
 * 1. Formula revision (handled by formulas API; mirrored here for overview)
 * 2. Material requisition QA approval
 * 3. Bulk release (after QC decide — approve OR reject both visible to QA)
 * 4. COA (placeholder until document arrives)
 * 5. Packaging QA (after packaging complete)
 */
import { delay } from '../../store/mockApi'
import { recordAudit } from '../../utils/audit'
import { getScopedCompanyId } from '../../utils/companyScope'

const STORAGE_KEY = 'cmhp_qa_pipeline_v1'

export const QA_STAGES = {
  FORMULA: 'FORMULA',
  REQUISITION: 'REQUISITION',
  BULK_RELEASE: 'BULK_RELEASE',
  COA: 'COA',
  PACKAGING: 'PACKAGING',
}

export const STAGE_LABELS = {
  FORMULA: '1. Formula Revision',
  REQUISITION: '2. Material Requisition',
  BULK_RELEASE: '3. Bulk Release',
  COA: '4. COA',
  PACKAGING: '5. Packaging',
}

const PENDING = 'PENDING'
const APPROVED = 'APPROVED'
const REJECTED = 'REJECTED'
const WAITING_QC = 'WAITING_QC'
const PLACEHOLDER = 'PLACEHOLDER'

function loadAll() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}
  } catch {
    return {}
  }
}

function saveAll(map) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch (e) {
    console.warn('[qaPipelineService] persist failed', e)
  }
}

function companyKey(companyId = getScopedCompanyId()) {
  return String(companyId || 'default')
}

function listForCompany(companyId) {
  const all = loadAll()
  const key = companyKey(companyId)
  if (!Array.isArray(all[key])) all[key] = []
  return { all, key, rows: all[key] }
}

function upsert(companyId, item) {
  const { all, key, rows } = listForCompany(companyId)
  const idx = rows.findIndex(
    (r) => r.stage === item.stage && String(r.ref_id) === String(item.ref_id)
  )
  const next = {
    ...item,
    company_id: Number(companyId) || null,
    updated_at: new Date().toISOString(),
  }
  if (idx >= 0) rows[idx] = { ...rows[idx], ...next }
  else rows.unshift({ ...next, created_at: new Date().toISOString() })
  all[key] = rows
  saveAll(all)
  return next
}

export const qaPipelineService = {
  list(stage = null, companyId = getScopedCompanyId()) {
    const { rows } = listForCompany(companyId)
    const filtered = stage ? rows.filter((r) => r.stage === stage) : rows
    return delay([...filtered])
  },

  counts(companyId = getScopedCompanyId()) {
    const { rows } = listForCompany(companyId)
    const byStage = {}
    Object.keys(QA_STAGES).forEach((s) => {
      byStage[s] = rows.filter((r) => r.stage === s && r.status === PENDING).length
    })
    return delay({
      pendingTotal: rows.filter((r) => r.status === PENDING).length,
      byStage,
    })
  },

  /** QC finished bulk release (approve OR reject) → always enqueue for QA. */
  enqueueBulkReleaseFromQc({
    batchId,
    batchNumber,
    productName,
    companyId,
    qcDecision,
    qcRemarks = '',
  }) {
    const cid = companyId || getScopedCompanyId()
    const item = upsert(cid, {
      stage: QA_STAGES.BULK_RELEASE,
      ref_id: batchId,
      ref_type: 'batch',
      title: batchNumber || `Batch #${batchId}`,
      subtitle: productName || '',
      status: PENDING,
      qc_decision: qcDecision, // APPROVED | REJECTED
      qc_remarks: qcRemarks,
      qa_remarks: '',
      source: 'batch_qc',
    })
    // Also open COA placeholder once bulk has a QC outcome
    upsert(cid, {
      stage: QA_STAGES.COA,
      ref_id: batchId,
      ref_type: 'batch',
      title: batchNumber || `Batch #${batchId}`,
      subtitle: productName || 'COA pending — document not uploaded yet',
      status: PLACEHOLDER,
      qc_decision: null,
      qa_remarks: '',
      source: 'coa_placeholder',
      blocked_reason: 'COA document not yet available. Same QC → QA process will apply when uploaded.',
    })
    recordAudit({
      action: 'qa/pipeline.bulkFromQc',
      entityType: 'Batch',
      entityId: batchId,
      payload: { qcDecision },
    })
    return delay(item)
  },

  enqueueRequisition({
    requisitionId,
    reference,
    productName,
    batchNumber,
    companyId,
    storeId,
    version,
  }) {
    const item = upsert(companyId || getScopedCompanyId(), {
      stage: QA_STAGES.REQUISITION,
      ref_id: requisitionId,
      ref_type: 'material_requisition',
      title: reference || `REQ #${requisitionId}`,
      subtitle: [productName, batchNumber].filter(Boolean).join(' · '),
      status: PENDING,
      store_id: storeId,
      version,
      source: 'requisition_submit',
    })
    recordAudit({
      action: 'qa/pipeline.requisition',
      entityType: 'MaterialRequisition',
      entityId: requisitionId,
    })
    return delay(item)
  },

  enqueuePackaging({
    batchId,
    batchNumber,
    productName,
    companyId,
  }) {
    const item = upsert(companyId || getScopedCompanyId(), {
      stage: QA_STAGES.PACKAGING,
      ref_id: batchId,
      ref_type: 'batch',
      title: batchNumber || `Batch #${batchId}`,
      subtitle: productName || '',
      status: PENDING,
      source: 'packaging_complete',
    })
    recordAudit({
      action: 'qa/pipeline.packaging',
      entityType: 'Batch',
      entityId: batchId,
    })
    return delay(item)
  },

  async decide(stage, refId, { decision, remarks = '', companyId } = {}) {
    const cid = companyId || getScopedCompanyId()
    const { all, key, rows } = listForCompany(cid)
    const idx = rows.findIndex(
      (r) => r.stage === stage && String(r.ref_id) === String(refId)
    )
    if (idx < 0) {
      throw new Error('QA pipeline item not found.')
    }
    if (rows[idx].status === PLACEHOLDER) {
      throw new Error('This stage is waiting for the document (e.g. COA). Cannot decide yet.')
    }
    const status = decision === 'APPROVE' || decision === 'RELEASE' ? APPROVED : REJECTED
    rows[idx] = {
      ...rows[idx],
      status,
      qa_remarks: remarks || '',
      decided_at: new Date().toISOString(),
    }
    all[key] = rows
    saveAll(all)
    recordAudit({
      action: 'qa/pipeline.decide',
      entityType: rows[idx].ref_type,
      entityId: refId,
      payload: { stage, status, remarks },
    })
    return delay(rows[idx])
  },

  /** When COA document becomes available later — promote placeholder → PENDING. */
  activateCoa({ batchId, batchNumber, productName, companyId }) {
    const item = upsert(companyId || getScopedCompanyId(), {
      stage: QA_STAGES.COA,
      ref_id: batchId,
      ref_type: 'batch',
      title: batchNumber || `Batch #${batchId}`,
      subtitle: productName || '',
      status: WAITING_QC,
      blocked_reason: '',
      source: 'coa_ready',
    })
    return delay(item)
  },

  recordCoaQc({ batchId, batchNumber, productName, companyId, qcDecision, qcRemarks = '' }) {
    const item = upsert(companyId || getScopedCompanyId(), {
      stage: QA_STAGES.COA,
      ref_id: batchId,
      ref_type: 'batch',
      title: batchNumber || `Batch #${batchId}`,
      subtitle: productName || '',
      status: PENDING,
      qc_decision: qcDecision,
      qc_remarks: qcRemarks,
      source: 'coa_qc',
      blocked_reason: '',
    })
    return delay(item)
  },
}

export default qaPipelineService
