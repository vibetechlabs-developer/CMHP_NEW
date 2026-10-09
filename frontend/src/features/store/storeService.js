// Shared store materials workspace: every call goes to an EXISTING backend
// endpoint. Writes are enforced by the server (active superuser for the catalog and
// material import); this module never decides authorization.
import api from '../../api/axios'

const rows = (data) => (Array.isArray(data) ? data : data?.results || [])

// Stores the signed-in user can reach (active membership, active store).
export async function getMyStores() {
  const response = await api.get('/v1/stores/mine/')
  // The server wraps the list as { stores: [...] }.
  return rows(response.data?.stores ?? response.data)
}

// Shared material master. Server-side search, filters and pagination only.
export async function listMaterials({ search = '', kind = '', isActive = '', page = 1, pageSize = 20 } = {}) {
  const params = { page, page_size: pageSize }
  if (search.trim()) params.search = search.trim()
  if (kind) params.kind = kind
  if (isActive !== '') params.is_active = isActive
  const response = await api.get('/v1/materials/', { params })
  return { count: response.data.count || 0, results: rows(response.data) }
}

// One material's own identity (code/name/type/base unit/status) - the
// same read the catalog list already shows, just for a single id. Access
// is the shared-catalog read permission, independent of any store's
// stock.view - a material can be visible here while its register (below)
// is not authorized for the signed-in user at all.
export async function getMaterial(materialId) {
  const response = await api.get(`/v1/materials/${materialId}/`)
  return response.data
}

export async function createMaterial(payload) {
  const response = await api.post('/v1/materials/', payload)
  return response.data
}

// Only name, description and category may change. code, kind and base unit are immutable.
export async function updateMaterial(materialId, payload) {
  const response = await api.patch(`/v1/materials/${materialId}/`, payload)
  return response.data
}

export async function activateMaterial(materialId) {
  const response = await api.post(`/v1/materials/${materialId}/activate/`)
  return response.data
}

export async function deactivateMaterial(materialId) {
  const response = await api.post(`/v1/materials/${materialId}/deactivate/`)
  return response.data
}

// Material import: preview is a multipart upload; rows are paginated from the preview.
export async function previewMaterialImport(file) {
  const form = new FormData()
  form.append('file', file)
  const response = await api.post('/v1/materials/import-preview/', form)
  return response.data
}

export async function getMaterialImportPreview(previewId, { page = 1, pageSize = 50 } = {}) {
  const response = await api.get(`/v1/materials/import-preview/${previewId}/`, { params: { page, page_size: pageSize } })
  return response.data
}

// Commit needs the preview id and the preview's own version (stale previews are refused).
export async function commitMaterialImport(previewId, expectedVersion) {
  const response = await api.post('/v1/materials/import-commit/', { preview_id: previewId, expected_version: expectedVersion })
  return response.data
}

// Locations of ONE store (store-scoped; store membership and storage_locations.view required).
export async function listLocations(storeId, { page = 1, pageSize = 50 } = {}) {
  const response = await api.get(`/v1/stores/${storeId}/locations/`, { params: { page, page_size: pageSize } })
  return { count: response.data.count ?? rows(response.data).length, results: rows(response.data) }
}

// Recorded receipts only. Read-only; coverage notice comes from the server.
// `postedFrom`/`postedTo` (YYYY-MM-DD, inclusive) filter by the movement's
// own posting date - the server echoes back exactly which window was
// applied in `period`, so callers never have to guess.
export async function listRecordedReceipts(storeId, { material = '', postedFrom = '', postedTo = '', page = 1, pageSize = 50 } = {}) {
  const params = { page, page_size: pageSize }
  if (material) params.material = material
  if (postedFrom) params.posted_from = postedFrom
  if (postedTo) params.posted_to = postedTo
  const response = await api.get(`/v1/stores/${storeId}/stock-movements/`, { params })
  return {
    count: response.data.count || 0,
    results: rows(response.data),
    coverage: response.data.coverage || null,
    period: response.data.period || null,
  }
}

export async function listRecordedReceiptBalances(storeId, { material = '', postedFrom = '', postedTo = '', page = 1, pageSize = 50 } = {}) {
  const params = { page, page_size: pageSize }
  if (material) params.material = material
  if (postedFrom) params.posted_from = postedFrom
  if (postedTo) params.posted_to = postedTo
  const response = await api.get(`/v1/stores/${storeId}/stock-balances/`, { params })
  return {
    count: response.data.count || 0,
    results: rows(response.data),
    coverage: response.data.coverage || null,
    period: response.data.period || null,
  }
}
