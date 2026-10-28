// Real shared-catalog/materials API calls - every function here hits an
// EXISTING backend endpoint. Writes are enforced by the server
// (CanReadSharedCatalog / can_manage_material_catalog); this module never
// decides authorization itself.
//
// Ported from frontend/src/features/store/storeService.js (the tested,
// working implementation) - only the subset frontend-junior needs for its
// Materials catalog and material register. Locations/recorded-receipts
// endpoints (STK-01) are not included - not used by any screen in this app.
import api from '../../api/axios'

const rows = (data) => (Array.isArray(data) ? data : data?.results || [])

// Stores the signed-in user can reach (active membership, active store).
export async function getMyStores() {
  const response = await api.get('/v1/stores/mine/')
  return rows(response.data?.stores ?? response.data)
}

// Store-scoped summary for Common Inventory dashboard (materials, receipts, issues, requisitions, ledger, pending work, recent activity)
export async function getStoreSummary(storeId, { dateFrom = '', dateTo = '' } = {}) {
  const params = {}
  if (dateFrom) params.date_from = dateFrom
  if (dateTo) params.date_to = dateTo
  const response = await api.get(`/v1/stores/${storeId}/summary/`, { params })
  return response.data
}

// Companies the signed-in user actually has an active membership in - real
// identities only (never a hardcoded company name/pair), used to scope the
// company-owned screens (Products/Formulas/Batch Planning) to a real
// company id, never the fixed Company A/B workspace-bridge slots.
export async function listMyCompanies() {
  const response = await api.get('/v1/companies/mine/')
  return rows(response.data?.companies ?? response.data)
}

// Shared material master. Server-side search, filters and pagination
// only. `receiptFrom`/`receiptTo` filter by the material's own recorded
// receipt-posting history (apps.stock_movements), never a stock-status
// computation - a material with no receipt in this window is NOT the
// same as "zero stock", and this filter never implies that it is.
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

// Shared material categories (Herbs, Excipients, Mother Tincture, ...).
export async function listMaterialCategories({ isActive = true, pageSize = 100 } = {}) {
  const params = { page_size: pageSize }
  if (isActive !== '') params.is_active = isActive
  const response = await api.get('/v1/material-categories/', { params })
  return rows(response.data)
}

// Superuser-only (same gate as material/unit creation) - lets an admin add
// a new grouping (e.g. "Mother Tincture") inline while adding a material,
// instead of requiring a separate category-management screen.
export async function createMaterialCategory({ code, name, description = '' }) {
  const response = await api.post('/v1/material-categories/', { code, name, description })
  return response.data
}

// Active suppliers for the Materials list filter, Material register, and inward stock suggestions.
export async function listMaterialSuppliers() {
  try {
    const response = await api.get('/v1/materials/suppliers/')
    const items = rows(response.data)
    if (items.length > 0) {
      return items.map((s) => ({
        ...s,
        name: s.name || s.display_name || s.legal_name || s.code || '',
      }))
    }
  } catch {}

  try {
    const fallback = await api.get('/v1/suppliers/?is_active=true')
    return rows(fallback.data).map((s) => ({
      ...s,
      name: s.name || s.display_name || s.legal_name || s.code || '',
    }))
  } catch {
    return []
  }
}

// Shared units of measure (KG, GM, LTR, ...) - rendered as a plain
// dropdown here rather than a live-search typeahead, matching this
// screen's existing plain-<select> form style.
export async function listUnits({ isActive = true, pageSize = 100 } = {}) {
  const params = { page_size: pageSize }
  if (isActive !== '') params.is_active = isActive
  const response = await api.get('/v1/units/', { params })
  return rows(response.data)
}

// One material's own identity (code/name/type/base unit/status) - used by
// the material register placeholder so a direct link or a page refresh
// always shows the real material, not just whatever was passed through
// route state.
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

export async function deleteMaterial(materialId) {
  await api.delete(`/v1/materials/${materialId}/`)
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

// Dedicated store/material register: opening (recorded receipts strictly
// before postedFrom - empty when postedFrom is omitted, never defaulted
// to an all-time total), period_received (the exact postedFrom/postedTo
// window), closing (recorded receipts up to and including postedTo,
// computed independently of opening+period by the server, not derived
// client-side), plus the same paginated movement history, narrowed to
// this one material. Never mix opening/period/closing into one number -
// the server keeps them as three separate lists for exactly that reason.
// Endpoint contract verified against the current apps/stock_movements/
// views.py (MaterialRegisterView) and serializers.py.
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
    periodIssued: data.period_issued || [],
    closingNetOfIssues: data.closing_net_of_issues || [],
    movements: rows(data),
    count: data.count || 0,
    coverage: data.coverage || null,
    period: data.period || null,
  }
}

// Real stock movements list - paginated receipt movements across all materials in this store
export async function listStockMovements(storeId, { materialId = '', postedFrom = '', postedTo = '', page = 1, pageSize = 20 } = {}) {
  const params = { page, page_size: pageSize }
  if (materialId) params.material = materialId
  if (postedFrom) params.posted_from = postedFrom
  if (postedTo) params.posted_to = postedTo
  const response = await api.get(`/v1/stores/${storeId}/stock-movements/`, { params })
  return {
    results: rows(response.data),
    count: response.data?.count || 0,
    coverage: response.data?.coverage || null,
  }
}

// Current recorded balances grouped by (material, unit, source_company)
export async function listStockBalances(storeId, { materialId = '' } = {}) {
  const params = {}
  if (materialId) params.material = materialId
  const response = await api.get(`/v1/stores/${storeId}/stock-balances/`, { params })
  return rows(response.data)
}

// Store-scoped reorder threshold for one material (apps.catalog.
// MaterialReorderSetting) - NOT a field on the shared Material master;
// see that model's own docstring for why. Returns `{reorder_level: null}`
// (never a 404) when nothing is configured yet for this store - absence
// is a normal, expected state. GET needs only stock.view in the store;
// setting it needs the separate materials.manage_reorder_level
// permission, checked server-side regardless of what the UI shows.
export async function getMaterialReorderSetting(storeId, materialId) {
  const response = await api.get(`/v1/stores/${storeId}/materials/${materialId}/reorder-setting/`)
  return response.data
}

export async function setMaterialReorderLevel(storeId, materialId, reorderLevel) {
  const response = await api.put(`/v1/stores/${storeId}/materials/${materialId}/reorder-setting/`, {
    reorder_level: reorderLevel,
  })
  return response.data
}
