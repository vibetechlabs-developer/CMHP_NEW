// Real apps.material_requisitions integration. No reference frontend
// implementation exists to port from (confirmed: the reference app only
// ever reads a read-only requisition STATUS label, never requisition
// lines or the create/submit/approve/reject/revise lifecycle) - every
// call here was written directly from the current backend contract
// (apps/material_requisitions/urls.py, serializers.py, views.py).
//
// Store-scoped (base path is /v1/stores/<store_id>/..., matching this
// app's existing storeService.js convention), even though a requisition
// is created FROM a company-scoped BatchPlan - the requisition itself
// always belongs to one store (where the materials would be issued from).
import api from '../../api/axios'

const base = (storeId) => `/v1/stores/${storeId}/material-requisitions`

export async function listMaterialRequisitions(storeId, { batchPlanId, page, pageSize } = {}) {
  const params = {}
  if (batchPlanId) params.batch_plan = batchPlanId
  if (page) params.page = page
  if (pageSize) params.page_size = pageSize
  const response = await api.get(`${base(storeId)}/`, { params })
  return response.data
}

export async function getMaterialRequisition(storeId, requisitionId) {
  const response = await api.get(`${base(storeId)}/${requisitionId}/`)
  return response.data
}

// payload: {batch_plan_id, expected_batch_plan_version, notes}. Lines are
// auto-fetched server-side from the plan's own formula revision - never
// client-added/removed.
export async function createMaterialRequisition(storeId, payload) {
  const response = await api.post(`${base(storeId)}/`, payload)
  return response.data
}

// DRAFT only. payload: {expected_version, notes, lines: [{id,
// requested_quantity, quantity_remark}]} - partial per-line edits, never
// adding/removing a line.
export async function updateMaterialRequisition(storeId, requisitionId, payload) {
  const response = await api.patch(`${base(storeId)}/${requisitionId}/`, payload)
  return response.data
}

export async function submitMaterialRequisition(storeId, requisitionId, expectedVersion) {
  const response = await api.post(`${base(storeId)}/${requisitionId}/submit/`, { expected_version: expectedVersion })
  return response.data
}

export async function approveMaterialRequisition(storeId, requisitionId, expectedVersion) {
  const response = await api.post(`${base(storeId)}/${requisitionId}/approve/`, { expected_version: expectedVersion })
  return response.data
}

export async function rejectMaterialRequisition(storeId, requisitionId, expectedVersion, rejectionReason) {
  const response = await api.post(`${base(storeId)}/${requisitionId}/reject/`, {
    expected_version: expectedVersion,
    rejection_reason: rejectionReason,
  })
  return response.data
}

// SUBMITTED/REJECTED -> DRAFT (or re-opens for edits), optionally
// refreshing snapshot fields from the plan's current state.
export async function reviseMaterialRequisition(storeId, requisitionId, expectedVersion, { refreshFromSource, expectedBatchPlanVersion } = {}) {
  const payload = { expected_version: expectedVersion }
  if (refreshFromSource !== undefined) payload.refresh_from_source = refreshFromSource
  if (expectedBatchPlanVersion !== undefined) payload.expected_batch_plan_version = expectedBatchPlanVersion
  const response = await api.post(`${base(storeId)}/${requisitionId}/revise/`, payload)
  return response.data
}

// Status-only read for a batch plan's requisition - narrower permission
// than the full requisition read (store_preparation.view + batch_plans.view,
// no formulas.view needed). Always {"state": "unavailable"} rather than a
// distinguishable 404 when none exists or access is denied - never treat
// that as "doesn't exist" vs "hidden".
export async function getRequisitionStatus(storeId, batchPlanId) {
  const response = await api.get(`/v1/stores/${storeId}/batch-plans/${batchPlanId}/requisition-status/`)
  return response.data
}
