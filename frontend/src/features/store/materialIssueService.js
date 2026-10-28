// Real apps.stock_movements Material Issue integration - draft issue
// entry, review and explicit posting. Mirrors receivingService.js
// exactly (same DRAFT/POSTED/CANCELLED lifecycle, same idempotency/
// concurrency conventions), against the separate issue-side endpoints
// (never the goods-receipt ones - an issue has no purchase order).
import api from '../../api/axios'

const basePath = (storeId) => `/v1/stores/${storeId}/material-issues`

export async function listMaterialIssues(storeId, { status, material, page, pageSize } = {}) {
  const params = {}
  if (status) params.status = status
  if (material) params.material = material
  if (page) params.page = page
  if (pageSize) params.page_size = pageSize
  const response = await api.get(`${basePath(storeId)}/`, { params })
  return response.data
}

export async function getMaterialIssue(storeId, issueId) {
  const response = await api.get(`${basePath(storeId)}/${issueId}/`)
  return response.data
}

// `payload`: {source_company_id, material_id, issued_quantity, issued_at,
// batch_reference, product_reference, remarks, idempotency_key}.
export async function createMaterialIssue(storeId, payload) {
  const response = await api.post(`${basePath(storeId)}/`, payload)
  return response.data
}

export async function updateMaterialIssue(storeId, issueId, payload) {
  const response = await api.patch(`${basePath(storeId)}/${issueId}/`, payload)
  return response.data
}

export async function postMaterialIssue(storeId, issueId, expectedVersion) {
  const response = await api.post(`${basePath(storeId)}/${issueId}/post/`, { expected_version: expectedVersion })
  return response.data
}

export async function cancelMaterialIssue(storeId, issueId, expectedVersion, cancellationReason) {
  const response = await api.post(`${basePath(storeId)}/${issueId}/cancel/`, {
    expected_version: expectedVersion,
    cancellation_reason: cancellationReason,
  })
  return response.data
}

// Recorded receipts minus recorded issues, per (unit, source company) -
// a plain ledger number, never a QC-released/usable-stock claim. Used
// by the Issue Outward form to show what is available to issue.
export async function getAvailableToIssue(storeId, materialId) {
  const response = await api.get(`${basePath(storeId)}/available/`, { params: { material: materialId } })
  return response.data
}

// Posted issue movements - the Outward-table counterpart of
// storeService.listRecordedReceipts.
export async function listMaterialIssueMovements(storeId, { material = '', postedFrom = '', postedTo = '', page = 1, pageSize = 25 } = {}) {
  const params = { page, page_size: pageSize }
  if (material) params.material = material
  if (postedFrom) params.posted_from = postedFrom
  if (postedTo) params.posted_to = postedTo
  const response = await api.get(`/v1/stores/${storeId}/material-issue-movements/`, { params })
  const data = response.data
  return {
    count: data.count || 0,
    results: Array.isArray(data) ? data : data.results || [],
    coverage: data.coverage || null,
    period: data.period || null,
  }
}
