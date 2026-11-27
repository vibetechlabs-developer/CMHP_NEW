import { store } from '../../store/store'
import { delay } from '../../store/mockApi'
import {
  setBatchQc,
  setBatchQa,
  addQcRecord,
  editQcRecord,
  addQaRecord,
  editQaRecord,
  approveQaRelease,
  setOrderStatus,
} from '../../store/erpSlice'
import { commitDocumentNumber } from '../../utils/documentNumbers'
import { recordAudit } from '../../utils/audit'
import { getScopedCompanyId } from '../../utils/companyScope'
import { qaPipelineService } from './qaPipelineService'

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

function hydrateQcRecord(qc, state) {
  const order = state.orders.find((o) => Number(o.id) === Number(qc.order_id || qc.order))
  const customer = order ? state.customers.find((c) => Number(c.id) === Number(order.customer)) : null
  const company = state.companies.find((c) => Number(c.id) === Number(qc.company || order?.company))
  return {
    ...qc,
    order_number: qc.order_number || order?.number || '—',
    customer_name: customer?.name || '—',
    company_name: company?.name || '—',
    order,
  }
}

function hydrateQaRecord(qa, state) {
  const qc = state.qcRecords.find((q) => Number(q.id) === Number(qa.qc_id))
  const order = state.orders.find((o) => Number(o.id) === Number(qa.order_id || qc?.order_id))
  const customer = order ? state.customers.find((c) => Number(c.id) === Number(order.customer)) : null
  const company = state.companies.find((c) => Number(c.id) === Number(qa.company || order?.company))
  return {
    ...qa,
    qc_number: qc?.number || qa.qc_number || '—',
    order_number: qa.order_number || qc?.order_number || order?.number || '—',
    customer_name: customer?.name || '—',
    company_name: company?.name || '—',
    order,
    qc,
  }
}

export const qualityService = {
  // Existing Batch Methods (Backed by real PostgreSQL BatchQualityCase)
  getBatches: async (companyId) => {
    const cid = companyId || getScopedCompanyId()
    const state = store.getState().erp
    const rows = (state.batches || []).filter((b) => !cid || Number(b.company) === Number(cid))
    let mapped = rows.map((b) => hydrateBatch(b, state))

    try {
      const cases = await qaPipelineService.listCases(cid)
      if (Array.isArray(cases)) {
        const matchedCaseIds = new Set()
        mapped = mapped.map((batch) => {
          const matchingCase = cases.find(
            (c) =>
              (batch.batch_plan_id && Number(c.batch_plan_id) === Number(batch.batch_plan_id)) ||
              (batch.number && c.batch_number_snapshot === batch.number)
          )
          if (matchingCase) {
            matchedCaseIds.add(matchingCase.id)
            return {
              ...batch,
              product_name: matchingCase.product_name_snapshot || batch.product_name,
              product_code: matchingCase.product_code_snapshot || batch.product_code,
              qc_status: matchingCase.qc_status,
              qa_status: matchingCase.qa_release_status,
              stage_status: matchingCase.stage_status,
              coa_status: matchingCase.coa_status,
              packaging_qa_status: matchingCase.packaging_qa_status,
              packaging_complete: matchingCase.packaging_complete,
              quality_case_id: matchingCase.id,
              quality_case_version: matchingCase.version,
              version: matchingCase.version,
            }
          }
          return batch
        })

        // Also expose backend quality cases created in Batch Planning that are not in local state
        cases.forEach((c) => {
          if (!matchedCaseIds.has(c.id)) {
            mapped.push({
              id: c.batch_plan_id || c.id,
              batch_plan_id: c.batch_plan_id,
              quality_case_id: c.id,
              quality_case_version: c.version,
              version: c.version,
              number: c.batch_number_snapshot,
              company: c.company_id,
              company_name: c.company_id === 2 ? 'CMHP Pharma' : 'Tej Biocare',
              product_name: c.product_name_snapshot,
              product_code: c.product_code_snapshot,
              formula_name: 'Master Formula',
              planned_quantity: '—',
              produced_quantity: '—',
              qc_status: c.qc_status,
              qa_status: c.qa_release_status,
              stage_status: c.stage_status,
              coa_status: c.coa_status,
              packaging_qa_status: c.packaging_qa_status,
              packaging_complete: c.packaging_complete,
              production_status: 'COMPLETED',
              is_backend: true,
            })
          }
        })
      }
    } catch (e) {
      console.warn('[qualityService] getBatches backend sync failed:', e?.message || e)
    }

    return mapped
  },

  qcDecision: async (batchId, payload, companyId) => {
    const cid = companyId || getScopedCompanyId()
    const qcDecision = payload.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED'

    // 1. Submit to PostgreSQL backend FIRST — throws on failure
    const backendResult = await qaPipelineService.enqueueBulkReleaseFromQc({
      batchId,
      companyId: cid,
      qcDecision,
      qcRemarks: payload.remarks || '',
      batchNumber: payload.batchNumber,
    })

    // 2. Only on backend confirmation, update Redux cache
    store.dispatch(setBatchQc({ batchId, decision: payload.decision, remarks: payload.remarks }))
    recordAudit({
      action: 'qc/batchDecision',
      entityType: 'Batch',
      entityId: batchId,
      payload: { ...payload, backend_case_id: backendResult?.id },
    })

    return backendResult
  },

  qaDecision: async (batchId, payload, companyId) => {
    const cid = companyId || getScopedCompanyId()
    const outcome = payload.decision === 'RELEASE' ? 'APPROVE' : payload.decision === 'HOLD' ? 'HOLD' : 'REJECT'

    // 1. Submit to PostgreSQL backend FIRST — throws on failure
    const backendResult = await qaPipelineService.decide('BULK_RELEASE', batchId, {
      decision: outcome,
      remarks: payload.remarks || '',
      companyId: cid,
      batchNumber: payload.batchNumber,
    })

    // 2. Only on backend confirmation, update Redux cache
    store.dispatch(setBatchQa({ batchId, decision: payload.decision, remarks: payload.remarks }))
    recordAudit({
      action: 'qa/batchDecision',
      entityType: 'Batch',
      entityId: batchId,
      payload: { ...payload, backend_case_id: backendResult?.id },
    })

    return backendResult
  },

  getBatchTraceability: async (batchId, companyId) => {
    const cid = companyId || getScopedCompanyId()
    const state = store.getState().erp
    const batch = (state.batches || []).find((b) => Number(b.id) === Number(batchId))

    let material_consumption = []
    let order = null
    let invoice = null
    let qc_history = batch?.qc_history || []
    let qa_history = batch?.qa_history || []

    if (batch) {
      material_consumption = (batch.material_consumption || []).map((mc) => {
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
      order = state.orders.find((o) => o.id === Number(batch.order)) || null
      invoice = state.invoices.find((i) => Number(i.batch) === batch.id) || null
    }

    try {
      const allCases = await qaPipelineService.listCases(cid)
      const matchingCase = allCases.find(
        (c) =>
          Number(c.batch_plan_id) === Number(batchId) ||
          Number(c.id) === Number(batchId) ||
          (batch?.number && c.batch_number_snapshot === batch.number)
      )
      if (matchingCase) {
        const caseDetail = await qaPipelineService.getCase(cid, matchingCase.id)
        if (Array.isArray(caseDetail.decisions) && caseDetail.decisions.length > 0) {
          const backendQc = caseDetail.decisions
            .filter((d) => d.decision_type === 'BATCH_QC')
            .map((d) => ({
              decision: d.outcome,
              remarks: d.remarks || 'No remarks',
              by: d.decided_by_name || 'QC Analyst',
              at: d.decided_at,
            }))
          const backendQa = caseDetail.decisions
            .filter((d) => d.decision_type !== 'BATCH_QC')
            .map((d) => ({
              decision: `${d.decision_type}: ${d.outcome}`,
              remarks: d.remarks || d.document_reference || 'No remarks',
              by: d.decided_by_name || 'QA Officer',
              at: d.decided_at,
            }))
          if (backendQc.length > 0) qc_history = backendQc
          if (backendQa.length > 0) qa_history = backendQa
        }
      }
    } catch (e) {
      console.warn('[qualityService] getBatchTraceability backend history sync:', e?.message || e)
    }

    return {
      material_consumption,
      qc_history,
      qa_history,
      order,
      invoice,
    }
  },

  // Order QC Methods
  getQcRecords: () => {
    const state = store.getState().erp
    const companyId = getScopedCompanyId()
    const rows = (state.qcRecords || []).filter((qc) => !companyId || Number(qc.company) === Number(companyId))
    return delay(rows.map((qc) => hydrateQcRecord(qc, state)))
  },

  createQcForOrder: (order, user = null) => {
    const state = store.getState().erp
    const existing = state.qcRecords.find((q) => Number(q.order_id) === Number(order.id))
    if (existing) {
      return delay(hydrateQcRecord(existing, state))
    }

    const companyId = order.company || getScopedCompanyId() || 2
    const companyKey = Number(companyId) === 3 ? 'tej' : 'cmhp'
    const number = commitDocumentNumber('QC', companyId)
    const totalQty = (order.lines || []).reduce((sum, line) => sum + (Number(line.quantity) || 0), 0)

    const newRecord = {
      number,
      order_id: order.id,
      order_number: order.number,
      company: companyId,
      companyId: companyKey,
      ordered_qty: totalQty,
      inspected_qty: totalQty,
      accepted_qty: totalQty,
      rejected_qty: 0,
      status: 'PENDING',
      inspector: user?.first_name || user?.username || 'QC Inspector',
      inspection_date: new Date().toISOString().slice(0, 10),
      remarks: '',
      parameters: {
        appearance: 'PASS',
        packaging: 'PASS',
        labeling: 'PASS',
        specs: 'PASS',
      },
    }

    store.dispatch(addQcRecord(newRecord))
    recordAudit({
      action: 'qc/createdForOrder',
      entityType: 'QC',
      entityId: number,
      payload: { orderId: order.id, orderNumber: order.number, totalQty },
    })

    const updatedState = store.getState().erp
    const created = updatedState.qcRecords[updatedState.qcRecords.length - 1]
    return delay(hydrateQcRecord(created, updatedState))
  },

  submitQcInspection: (qcId, { outcome, inspectedQty, acceptedQty, rejectedQty, remarks, parameters, user }) => {
    const state = store.getState().erp
    const qc = state.qcRecords.find((q) => Number(q.id) === Number(qcId))
    if (!qc) throw new Error('QC record not found')

    const statusVal = outcome === 'PASS' ? 'PASSED' : outcome === 'FAIL' ? 'FAILED' : 'PARTIAL'

    store.dispatch(
      editQcRecord({
        id: qcId,
        payload: {
          status: statusVal,
          inspected_qty: Number(inspectedQty) || 0,
          accepted_qty: Number(acceptedQty) || 0,
          rejected_qty: Number(rejectedQty) || 0,
          remarks: remarks || '',
          parameters: parameters || {},
          inspected_at: new Date().toISOString(),
          inspector: user?.first_name || user?.username || 'QC Officer',
        },
      })
    )

    if (outcome === 'PASS' || outcome === 'PARTIAL') {
      store.dispatch(
        setOrderStatus({
          id: qc.order_id,
          status: 'QA_PENDING',
          qc_status: statusVal,
        })
      )

      // Auto-create QA record if not exists
      const qaExists = state.qaRecords.some((q) => Number(q.order_id) === Number(qc.order_id))
      if (!qaExists) {
        const qaCompanyId = qc.company || 2
        const qaCompanyKey = Number(qaCompanyId) === 3 ? 'tej' : 'cmhp'
        const qaNumber = commitDocumentNumber('QA', qaCompanyId)
        store.dispatch(
          addQaRecord({
            number: qaNumber,
            qc_id: qcId,
            order_id: qc.order_id,
            company: qaCompanyId,
            companyId: qaCompanyKey,
            ordered_qty: qc.ordered_qty,
            qc_accepted_qty: Number(acceptedQty) || 0,
            qa_approved_qty: Number(acceptedQty) || 0,
            status: 'PENDING',
            release_officer: '',
            remarks: '',
            parameters: {
              bmr_review: 'PASS',
              coa_verification: 'PASS',
              compliance_signoff: 'PASS',
            },
          })
        )
      }
    } else {
      store.dispatch(
        setOrderStatus({
          id: qc.order_id,
          status: 'QC_FAILED',
          qc_status: 'FAILED',
        })
      )
    }

    recordAudit({
      action: 'qc/inspectionCompleted',
      entityType: 'QC',
      entityId: qc.number,
      payload: { outcome: statusVal, acceptedQty, rejectedQty, orderId: qc.order_id, remarks },
    })

    return delay(null)
  },

  // Order QA Methods
  getQaRecords: () => {
    const state = store.getState().erp
    const companyId = getScopedCompanyId()
    const rows = (state.qaRecords || []).filter((qa) => !companyId || Number(qa.company) === Number(companyId))
    return delay(rows.map((qa) => hydrateQaRecord(qa, state)))
  },

  submitQaRelease: (qaId, { decision, approvedQty, remarks, parameters, user }) => {
    const state = store.getState().erp
    const qa = state.qaRecords.find((q) => Number(q.id) === Number(qaId))
    if (!qa) throw new Error('QA record not found')

    const statusVal = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED'

    store.dispatch(
      editQaRecord({
        id: qaId,
        payload: {
          status: statusVal,
          qa_approved_qty: Number(approvedQty) || 0,
          remarks: remarks || '',
          parameters: parameters || {},
          released_at: new Date().toISOString(),
          release_officer: user?.first_name || user?.username || 'QA Officer',
        },
      })
    )

    if (decision === 'APPROVE') {
      const order = state.orders?.find((o) => Number(o.id) === Number(qa.order_id))
      const batch = state.batches?.find(
        (b) => Number(b.order) === Number(qa.order_id) || Number(b.id) === Number(qa.batch_id)
      )

      store.dispatch(
        approveQaRelease({
          qaId,
          orderId: qa.order_id,
          batchNumber: batch?.number || order?.batch_no || qa.number,
          productName: order?.product_name || batch?.product_name || 'Pharmaceutical Formulation',
          productCode: order?.product_code || batch?.product_code || '',
          productId: order?.product_id || batch?.product || '',
          approvedQty: Number(approvedQty) || Number(qa.ordered_qty) || 0,
          remarks: remarks || '',
          officer: user?.first_name || user?.username || 'QA Officer',
        })
      )
    } else {
      store.dispatch(
        setOrderStatus({
          id: qa.order_id,
          status: 'QA_REJECTED',
          qa_status: 'REJECTED',
        })
      )
    }

    recordAudit({
      action: 'qa/releaseDecision',
      entityType: 'QA',
      entityId: qa.number,
      payload: { decision: statusVal, approvedQty, orderId: qa.order_id, remarks },
    })

    return delay(null)
  },
}