/**
 * QA Pipeline — company-scoped stage tracker backed by real backend APIs:
 * /api/v1/companies/<company_id>/batch-quality/
 *
 * Tracks:
 * 1. Formula revision
 * 2. Material requisition QA approval (from store requisitions API)
 * 3. Bulk release (after QC decide — approve OR reject both visible to QA)
 * 4. COA (waiting document / reference decision)
 * 5. Packaging QA (after packaging complete)
 */
import api from '../../api/axios'
import { recordAudit } from '../../utils/audit'
import { getScopedCompanyId } from '../../utils/companyScope'

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
const PLACEHOLDER = 'PLACEHOLDER'

const basePath = (companyId) => `/v1/companies/${companyId || getScopedCompanyId() || 1}/batch-quality`

export async function listCases(companyId, params = {}) {
  const cid = companyId || getScopedCompanyId() || 1
  try {
    const res = await api.get(`${basePath(cid)}/`, { params })
    return Array.isArray(res.data) ? res.data : res.data?.results || []
  } catch (err) {
    console.warn('[qaPipelineService] listCases failed:', err?.message || err)
    return []
  }
}

export async function getCase(companyId, caseId) {
  const cid = companyId || getScopedCompanyId() || 1
  const res = await api.get(`${basePath(cid)}/${caseId}/`)
  return res.data
}

export async function openCase(companyId, batchPlanId) {
  const cid = companyId || getScopedCompanyId() || 1
  const res = await api.post(`${basePath(cid)}/`, { batch_plan_id: batchPlanId })
  return res.data
}

export async function recordQcDecision(companyId, caseId, { expected_version, outcome, remarks = '' }) {
  const cid = companyId || getScopedCompanyId() || 1
  const res = await api.post(`${basePath(cid)}/${caseId}/qc-decisions/`, {
    expected_version,
    outcome,
    remarks,
  })
  return res.data
}

export async function recordQaRelease(companyId, caseId, { expected_version, outcome, remarks = '' }) {
  const cid = companyId || getScopedCompanyId() || 1
  const res = await api.post(`${basePath(cid)}/${caseId}/qa-release/`, {
    expected_version,
    outcome,
    remarks,
  })
  return res.data
}

export async function openCoa(companyId, caseId, { expected_version, remarks = '' }) {
  const cid = companyId || getScopedCompanyId() || 1
  const res = await api.post(`${basePath(cid)}/${caseId}/coa/`, {
    expected_version,
    remarks,
  })
  return res.data
}

export async function recordCoaDecision(
  companyId,
  caseId,
  { expected_version, outcome, document_reference, remarks = '' }
) {
  const cid = companyId || getScopedCompanyId() || 1
  const res = await api.post(`${basePath(cid)}/${caseId}/coa-decisions/`, {
    expected_version,
    outcome,
    document_reference,
    remarks,
  })
  return res.data
}

export async function markPackagingComplete(companyId, caseId, { expected_version, remarks = '' }) {
  const cid = companyId || getScopedCompanyId() || 1
  const res = await api.post(`${basePath(cid)}/${caseId}/packaging-complete/`, {
    expected_version,
    remarks,
  })
  return res.data
}

export async function recordPackagingDecision(companyId, caseId, { expected_version, outcome, remarks = '' }) {
  const cid = companyId || getScopedCompanyId() || 1
  const res = await api.post(`${basePath(cid)}/${caseId}/packaging-decisions/`, {
    expected_version,
    outcome,
    remarks,
  })
  return res.data
}

export const qaPipelineService = {
  listCases,
  getCase,
  openCase,
  recordQcDecision,
  recordQaRelease,
  openCoa,
  recordCoaDecision,
  markPackagingComplete,
  recordPackagingDecision,

  async list(stage = null, companyId = getScopedCompanyId()) {
    const cid = companyId || getScopedCompanyId() || 1
    const cases = await listCases(cid)

    let items = []
    if (stage === QA_STAGES.COA) {
      items = cases
        .filter((c) => c.coa_status !== 'PENDING' || c.qc_status === 'APPROVED')
        .map((c) => {
          let st = PENDING
          if (c.coa_status === 'WAITING_DOCUMENT') st = PLACEHOLDER
          else if (c.coa_status === 'APPROVED') st = APPROVED
          else if (c.coa_status === 'REJECTED') st = REJECTED
          else if (c.coa_status === 'HOLD') st = 'HOLD'
          else if (c.qc_status === 'APPROVED') st = PLACEHOLDER

          return {
            id: c.id,
            case_id: c.id,
            ref_id: c.id,
            ref_type: 'batch',
            title: c.batch_number_snapshot || `Batch Case #${c.id}`,
            subtitle: c.product_name_snapshot || '',
            status: st,
            version: c.version,
            document_reference: c.coa_document_reference,
            blocked_reason:
              st === PLACEHOLDER
                ? 'COA document waiting for arrival / document reference.'
                : '',
            source: 'backend_api',
          }
        })
    } else if (stage === QA_STAGES.PACKAGING) {
      items = cases
        .filter((c) => c.packaging_complete || c.packaging_qa_status !== 'PENDING')
        .map((c) => {
          let st = PENDING
          if (c.packaging_qa_status === 'APPROVED') st = APPROVED
          else if (c.packaging_qa_status === 'REJECTED') st = REJECTED
          else if (c.packaging_qa_status === 'HOLD') st = 'HOLD'

          return {
            id: c.id,
            case_id: c.id,
            ref_id: c.id,
            ref_type: 'batch',
            title: c.batch_number_snapshot || `Batch Case #${c.id}`,
            subtitle: c.product_name_snapshot || '',
            status: st,
            version: c.version,
            packaging_complete: c.packaging_complete,
            source: 'backend_api',
          }
        })
    } else if (stage === QA_STAGES.BULK_RELEASE) {
      items = cases
        .filter((c) => c.qc_status !== 'PENDING')
        .map((c) => {
          let st = PENDING
          if (c.qa_release_status === 'APPROVED') st = APPROVED
          else if (c.qa_release_status === 'REJECTED') st = REJECTED
          else if (c.qa_release_status === 'HOLD') st = 'HOLD'

          return {
            id: c.id,
            case_id: c.id,
            ref_id: c.id,
            ref_type: 'batch',
            title: c.batch_number_snapshot || `Batch Case #${c.id}`,
            subtitle: c.product_name_snapshot || '',
            status: st,
            version: c.version,
            qc_decision: c.qc_status,
            source: 'backend_api',
          }
        })
    }
    return items
  },

  async counts(companyId = getScopedCompanyId()) {
    const cid = companyId || getScopedCompanyId() || 1
    const cases = await listCases(cid)
    const bulkPending = cases.filter((c) => c.qc_status === 'APPROVED' && c.qa_release_status === 'PENDING').length
    const coaPending = cases.filter(
      (c) => c.coa_status === 'WAITING_DOCUMENT' || (c.qc_status === 'APPROVED' && c.coa_status === 'PENDING')
    ).length
    const packagingPending = cases.filter((c) => c.packaging_complete && c.packaging_qa_status === 'PENDING').length

    return {
      pendingTotal: bulkPending + coaPending + packagingPending,
      byStage: {
        [QA_STAGES.BULK_RELEASE]: bulkPending,
        [QA_STAGES.COA]: coaPending,
        [QA_STAGES.PACKAGING]: packagingPending,
        [QA_STAGES.REQUISITION]: 0,
        [QA_STAGES.FORMULA]: 0,
      },
    }
  },

  async decide(stage, refId, { decision, remarks = '', companyId, expected_version, document_reference, batchNumber } = {}) {
    const cid = companyId || getScopedCompanyId() || 1
    const caseId = Number(refId)

    let currentCase = null
    try {
      currentCase = await getCase(cid, caseId)
    } catch {
      // If refId was a batch plan id instead of case id, look up case by batch_plan_id or batchNumber
      const allCases = await listCases(cid)
      currentCase = allCases.find(
        (c) =>
          Number(c.batch_plan_id) === caseId ||
          Number(c.id) === caseId ||
          (batchNumber && c.batch_number_snapshot === batchNumber)
      )
    }

    if (!currentCase) {
      throw new Error(`Batch quality case for ID ${refId} not found in this company.`)
    }

    const version = expected_version || currentCase.version
    const outcome = decision === 'APPROVE' || decision === 'RELEASE' ? 'APPROVED' : decision === 'HOLD' ? 'HOLD' : 'REJECTED'

    if (stage === QA_STAGES.BULK_RELEASE) {
      return await recordQaRelease(cid, currentCase.id, {
        expected_version: version,
        outcome,
        remarks,
      })
    }

    if (stage === QA_STAGES.COA) {
      const docRef = document_reference || currentCase.coa_document_reference || `COA-${currentCase.batch_number_snapshot || currentCase.id}`
      return await recordCoaDecision(cid, currentCase.id, {
        expected_version: version,
        outcome,
        document_reference: docRef,
        remarks,
      })
    }

    if (stage === QA_STAGES.PACKAGING) {
      return await recordPackagingDecision(cid, currentCase.id, {
        expected_version: version,
        outcome,
        remarks,
      })
    }

    return currentCase
  },

  async activateCoa({ batchId, companyId, caseId, expected_version, batchNumber }) {
    const cid = companyId || getScopedCompanyId() || 1
    let targetCaseId = caseId
    let version = expected_version
    if (!targetCaseId) {
      const allCases = await listCases(cid)
      const found = allCases.find(
        (c) =>
          Number(c.batch_plan_id) === Number(batchId) ||
          Number(c.id) === Number(batchId) ||
          (batchNumber && c.batch_number_snapshot === batchNumber)
      )
      if (found) {
        targetCaseId = found.id
        version = version || found.version
      }
    }
    if (!targetCaseId) return null
    return await openCoa(cid, targetCaseId, { expected_version: version || 1 })
  },

  async recordCoaQc({ batchId, companyId, caseId, expected_version, qcDecision, qcRemarks = '', document_reference, batchNumber }) {
    const cid = companyId || getScopedCompanyId() || 1
    let targetCaseId = caseId
    let version = expected_version
    let docRef = document_reference
    if (!targetCaseId) {
      const allCases = await listCases(cid)
      const found = allCases.find(
        (c) =>
          Number(c.batch_plan_id) === Number(batchId) ||
          Number(c.id) === Number(batchId) ||
          (batchNumber && c.batch_number_snapshot === batchNumber)
      )
      if (found) {
        targetCaseId = found.id
        version = version || found.version
        docRef = docRef || `COA-${found.batch_number_snapshot || found.id}`
      }
    }
    if (!targetCaseId) return null
    return await recordCoaDecision(cid, targetCaseId, {
      expected_version: version || 1,
      outcome: qcDecision || 'APPROVED',
      document_reference: docRef || `COA-${targetCaseId}`,
      remarks: qcRemarks,
    })
  },

  async enqueueBulkReleaseFromQc({ batchId, companyId, qcDecision, qcRemarks = '', batchNumber }) {
    const cid = companyId || getScopedCompanyId() || 1
    const allCases = await listCases(cid)
    let c = allCases.find(
      (x) =>
        Number(x.batch_plan_id) === Number(batchId) ||
        Number(x.id) === Number(batchId) ||
        (batchNumber && x.batch_number_snapshot === batchNumber)
    )
    if (!c) {
      // Try to open a case for this batch plan
      c = await openCase(cid, batchId)
    }
    if (c) {
      return await recordQcDecision(cid, c.id, {
        expected_version: c.version,
        outcome: qcDecision === 'APPROVE' || qcDecision === 'APPROVED' ? 'APPROVED' : qcDecision === 'HOLD' ? 'HOLD' : 'REJECTED',
        remarks: qcRemarks,
      })
    }
    throw new Error(`Could not find or open batch quality case for batch ID ${batchId}.`)
  },

  async enqueuePackaging({ batchId, companyId }) {
    const cid = companyId || getScopedCompanyId() || 1
    const allCases = await listCases(cid)
    const c = allCases.find((x) => Number(x.batch_plan_id) === Number(batchId) || Number(x.id) === Number(batchId))
    if (c && !c.packaging_complete) {
      return await markPackagingComplete(cid, c.id, {
        expected_version: c.version,
        remarks: 'Packaging marked complete from production',
      })
    }
    return null
  },
}

export default qaPipelineService
