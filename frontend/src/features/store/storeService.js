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

// Companies the signed-in user actually has an active membership in -
// real identities only (never a hardcoded company name). Used to build
// the Materials page hero's "shared across ..." line from whichever
// companies this user's account actually spans, not a fixed pair.
export async function listMyCompanies() {
  const response = await api.get('/v1/companies/mine/')
  return rows(response.data?.companies ?? response.data)
}

// Shared material master. Server-side search, filters and pagination only.
// `category`/`supplier`/`receiptFrom`/`receiptTo` are all optional and map
// straight onto the matching backend query params - see
// apps.catalog.views.MaterialListCreateView.get_queryset. The supplier and
// receipt-date filters derive from the material's own recorded receipt
// history (apps.stock_movements), never from a single "owning supplier" -
// a material has none.
export async function listMaterials({
  search = '', kind = '', isActive = '', category = '', supplier = '',
  receiptFrom = '', receiptTo = '', page = 1, pageSize = 20,
} = {}) {
  const params = { page, page_size: pageSize }
  if (search.trim()) params.search = search.trim()
  if (kind) params.kind = kind
  if (isActive !== '') params.is_active = isActive
  if (category) params.category = category
  if (supplier) params.supplier = supplier
  if (receiptFrom) params.receipt_from = receiptFrom
  if (receiptTo) params.receipt_to = receiptTo
  const response = await api.get('/v1/materials/', { params })
  return { count: response.data.count || 0, results: rows(response.data) }
}

// Shared material categories (Herbs, Excipients, ...) - same read access
// as materials/units (CanReadSharedCatalog). Used to populate the
// Materials list's "All Categories" filter and the Add/Edit form.
export async function listMaterialCategories({ isActive = true, pageSize = 100 } = {}) {
  const params = { page_size: pageSize }
  if (isActive !== '') params.is_active = isActive
  const response = await api.get('/v1/material-categories/', { params })
  return rows(response.data)
}

// Suppliers that have at least one recorded receipt, scoped to companies
// the signed-in user holds purchase_orders.view in - NOT the full
// supplier directory (that management screen is active-superuser-only).
// Populates the Materials list's "All Suppliers" filter only.
export async function listMaterialSuppliers() {
  const response = await api.get('/v1/materials/suppliers/')
  return rows(response.data)
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

// Shared packaging reference data (Bag, Drum, Tin, Bottle, Box, Other...).
// Used to populate a material's optional default container type, and the
// per-line container on a goods receipt. Read access is the same
// shared-catalog rule as units/materials; writing one is a separate,
// active-superuser-only action (not exposed from this screen).
export async function listContainerTypes({ isActive = true, pageSize = 100 } = {}) {
  const params = { page_size: pageSize }
  if (isActive !== '') params.is_active = isActive
  const response = await api.get('/v1/container-types/', { params })
  return rows(response.data)
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

// Dedicated store/material register: opening (recorded receipts strictly
// before postedFrom - empty when postedFrom is omitted, never defaulted
// to an all-time total), period_received (the exact postedFrom/postedTo
// window), closing (recorded receipts up to and including postedTo,
// computed independently of opening+period by the server, not derived
// client-side), plus the same paginated movement history as the other
// endpoints, narrowed to this one material. Never mix opening/period/
// closing into one number - the server keeps them as three separate
// lists for exactly that reason.
export async function getMaterialRegister(storeId, materialId, { postedFrom = '', postedTo = '', search = '', supplier = '', page = 1, pageSize = 25 } = {}) {
  const params = { page, page_size: pageSize }
  if (postedFrom) params.posted_from = postedFrom
  if (postedTo) params.posted_to = postedTo
  if (search) params.search = search
  if (supplier) params.supplier = supplier
  const response = await api.get(`/v1/stores/${storeId}/materials/${materialId}/register/`, { params })
  const data = response.data
  return {
    material: data.material || null,
    storeId: data.store_id,
    storeCode: data.store_code,
    opening: data.opening || [],
    periodReceived: data.period_received || [],
    closing: data.closing || [],
    // Additive - real since the Issue Outward feature, never merged
    // into opening/periodReceived/closing above.
    periodIssued: data.period_issued || [],
    closingNetOfIssues: data.closing_net_of_issues || [],
    movements: rows(data),
    count: data.count || 0,
    coverage: data.coverage || null,
    period: data.period || null,
  }
}
