// Real apps.batch_plans and apps.formulas calls used by the Batch & Printing
// tab. Nothing here generates a batch number, selects a formula or revision
// on the caller's behalf, or falls back to local data on failure.
import api from '../../api/axios'

const plansPath = (companyId) => `/v1/companies/${companyId}/batch-plans`

export async function listBatchPlansForOrder(companyId, orderId) {
  const response = await api.get(`${plansPath(companyId)}/`, {
    params: { order: orderId, page_size: 100 },
  })
  return response.data.results || []
}

export async function getBatchPlan(companyId, planId) {
  const response = await api.get(`${plansPath(companyId)}/${planId}/`)
  return response.data
}

// payload: sales_order_line_id, formula_revision_id (both explicit), target_output_quantity,
// and optionally planned_manufacturing_date, packing_size_note, notes,
// planned_pack_quantity, packing_content_quantity, packing_content_uom_id.
export async function createBatchPlan(companyId, payload) {
  const response = await api.post(`${plansPath(companyId)}/`, payload)
  return response.data
}

// payload must include expected_version; only editable planning fields.
export async function updateBatchPlan(companyId, planId, payload) {
  const response = await api.patch(`${plansPath(companyId)}/${planId}/`, payload)
  return response.data
}

// Explicit, separately confirmed action. Requires expected_version.
export async function allocateBatchNumber(companyId, planId, expectedVersion) {
  const response = await api.post(`${plansPath(companyId)}/${planId}/allocate-number/`, {
    expected_version: expectedVersion,
  })
  return response.data
}

// Lists APPROVED revisions for a product in this company. Uses the narrow
// planning endpoint (batch_plans.view), which returns identity and quantities
// only - never recipe lines or draft revisions. Nothing is pre-selected.
export async function listApprovedRevisionsForProduct(companyId, productId) {
  const response = await api.get(`/v1/companies/${companyId}/batch-plans/eligible-revisions/`, {
    params: { product: productId },
  })
  return (response.data.results || []).map((revision) => ({
    id: revision.id,
    formulaId: revision.formula_id,
    formulaCode: revision.formula_code,
    formulaName: revision.formula_name,
    revisionNumber: revision.revision_number,
    baseOutputQuantity: revision.base_output_quantity,
    outputUomCode: revision.output_uom_code,
  }))
}

// Requirement preview for a SAVED batch plan (existing backend calculator).
// Read only: nothing is reserved, issued or authorised by this call.
export async function getBatchPlanRequirementPreview(companyId, planId, targetOutputQuantity) {
  const response = await api.get(`/v1/companies/${companyId}/batch-plans/${planId}/requirement-preview/`, {
    params: { target_output_quantity: targetOutputQuantity },
  })
  return response.data
}
