// Real apps.store_preparation and apps.material_requisitions reads/writes for
// the Store Preparation tab. Store-scoped: every call names the store, and
// the backend checks store membership plus store-level permissions.
import api from '../../api/axios'

export async function listMyStores() {
  const response = await api.get('/v1/stores/mine/')
  return response.data.stores || []
}

// Store-level permission codes for the current user in one store.
export async function getStorePermissionCodes(storeId) {
  const response = await api.get(`/v1/stores/${storeId}/my-permissions/`)
  return response.data.permissions || []
}

// Returns the preparations in one store that belong to the given batch plan.
// The list is requested with a generous page size; a store with more rows
// than that should be narrowed in a later backend change.
export async function listPreparationsForPlan(storeId, batchPlanId) {
  const response = await api.get(`/v1/stores/${storeId}/preparations/`, {
    params: { page_size: 100 },
  })
  const rows = response.data.results || []
  return rows.filter((row) => row.batch_plan_id === batchPlanId)
}

// Store preparation for one saved ORDER LINE at one store. This is the
// confirmed workflow record: it exists before any batch plan.
export async function listPreparationsForLine(storeId, salesOrderLineId) {
  const response = await api.get(`/v1/stores/${storeId}/preparations/`, {
    params: { sales_order_line: salesOrderLineId, page_size: 100 },
  })
  return response.data.results || []
}

// payload: sales_order_line_id (or legacy batch_plan_id), packing_type, insert_required (true | false | null).
export async function createPreparation(storeId, payload) {
  const response = await api.post(`/v1/stores/${storeId}/preparations/`, payload)
  return response.data
}

// payload: expected_version plus packing_type and/or insert_required.
export async function updatePreparation(storeId, preparationId, payload) {
  const response = await api.patch(`/v1/stores/${storeId}/preparations/${preparationId}/`, payload)
  return response.data
}

// Status only, read from the real requisition workflow and never edited here.
// Returns { batch_plan_id, state: 'present' | 'unavailable', status?, status_label? }. 'unavailable' covers absent, other-store and deactivated-store records alike.
// The server returns no lines, quantities or formula data for this call.
export async function getRequisitionStatus(storeId, batchPlanId) {
  const response = await api.get(`/v1/stores/${storeId}/batch-plans/${batchPlanId}/requisition-status/`)
  return response.data
}

// Display text for the order's requisition field. Read-only. Absent, hidden in
// another store and hidden in a deactivated store all look the same to the
// caller, so they share one neutral label. Never "No requisition created".
export function requisitionStatusText(requisition) {
  if (!requisition) return 'Requisition status unavailable'
  if (requisition.state === 'present') return requisition.row?.status_label || 'Requisition status unavailable'
  if (requisition.state === 'error') return 'Could not load'
  if (requisition.state === 'unavailable' || requisition.state === 'none') return 'Requisition status unavailable'
  return '—'
}
