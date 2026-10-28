// Real apps.batch_plans integration. Ported from frontend/src/features/
// operations/batchPlansService.js; endpoint paths verified against the
// current apps/batch_plans/urls.py and views.py.
//
// `target_output_quantity` on getBatchPlanRequirementPreview is kept out
// entirely (unlike the reference, which sends it as a query param) -
// confirmed by direct backend read that BatchPlanRequirementPreviewView
// never reads any query param and always recomputes from the plan's own
// saved target_output_quantity; sending it would be dead, misleading
// code implying a "preview a hypothetical quantity" capability that does
// not exist server-side.
import api from '../../api/axios'

const base = (companyId) => `/v1/companies/${companyId}/batch-plans`

// Real units restricted to mass/volume (GM/KG/ML/L) - gated by
// batch_plans.view, scoped to the company. Shared by the formula output-
// unit picker and the batch plan's own packing-content-unit picker.
export async function listPlanningUnits(companyId, term = '') {
  const response = await api.get(`${base(companyId)}/planning-units/`)
  const needle = (term || '').trim().toLowerCase()
  return (response.data.results || [])
    .filter((unit) => !needle || unit.code.toLowerCase().includes(needle) || unit.name.toLowerCase().includes(needle))
    .map((unit) => ({ id: unit.id, code: unit.code, name: unit.name, label: `${unit.name} (${unit.code})` }))
}

// Only APPROVED revisions of this product in this company - never a
// draft/submitted one, and never the revision's own material lines.
export async function listEligibleRevisionsForProduct(companyId, productId) {
  const response = await api.get(`${base(companyId)}/eligible-revisions/`, { params: { product: productId } })
  return response.data.results || []
}

export async function listBatchPlans(companyId, params = {}) {
  const response = await api.get(`${base(companyId)}/`, { params: { page_size: 100, ...params } })
  return response.data
}

export async function listBatchPlansForOrder(companyId, orderId) {
  const response = await api.get(`${base(companyId)}/`, { params: { order: orderId, page_size: 100 } })
  return response.data
}

export async function getBatchPlan(companyId, planId) {
  const response = await api.get(`${base(companyId)}/${planId}/`)
  return response.data
}

// payload: sales_order_line_id, formula_revision_id, target_output_quantity
// (all required), plus optional planned_manufacturing_date/
// packing_size_note/notes/planned_pack_quantity/packing_content_quantity/
// packing_content_uom_id/mrp_for_printing/printing_status_note.
export async function createBatchPlan(companyId, payload) {
  const response = await api.post(`${base(companyId)}/`, payload)
  return response.data
}

export async function updateBatchPlan(companyId, planId, payload) {
  const response = await api.patch(`${base(companyId)}/${planId}/`, payload)
  return response.data
}

export async function getBatchPlanRequirementPreview(companyId, planId) {
  const response = await api.get(`${base(companyId)}/${planId}/requirement-preview/`)
  return response.data
}

// The ONLY path that ever creates a BatchNumberAllocation - a separate,
// explicit action on an already-existing plan. Never a side effect of
// plan creation/edit. Idempotent at the same expected_version.
export async function allocateBatchNumber(companyId, planId, expectedVersion) {
  const response = await api.post(`${base(companyId)}/${planId}/allocate-number/`, { expected_version: expectedVersion })
  return response.data
}
