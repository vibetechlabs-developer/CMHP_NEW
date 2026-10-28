// Real apps.products integration - ported from frontend/src/features/
// operations/productsService.js. No pricing/MRP/formula/stock/packing
// field is ever sent here - the real Product model has none of those;
// this service only ever sends the fields apps.products.serializers.
// ProductCreateSerializer/ProductUpdateSerializer actually accept.
// Endpoint paths verified against the current apps/products/urls.py.
import api from '../../api/axios'

const basePath = (companyId) => `/v1/companies/${companyId}/products`

export async function listProducts(companyId, { page, pageSize, search, isActive } = {}) {
  const params = {}
  if (page) params.page = page
  if (pageSize) params.page_size = pageSize
  if (search) params.search = search
  if (isActive !== undefined && isActive !== null && isActive !== '') params.is_active = isActive
  const response = await api.get(`${basePath(companyId)}/`, { params })
  return response.data
}

export async function getProduct(companyId, productId) {
  const response = await api.get(`${basePath(companyId)}/${productId}/`)
  return response.data
}

// payload: code (required, create-only), name (required), product_type/
// description/bmr_no (optional free text). sales_uom_id is never sent -
// the server picks one automatically (resolve_default_sales_uom).
export async function createProduct(companyId, payload) {
  const response = await api.post(`${basePath(companyId)}/`, payload)
  return response.data
}

// payload: expected_version (required) + any subset of name/
// product_type/bmr_no/description. code/sales_uom/company are immutable
// after creation (ProductUpdateSerializer rejects them outright) - this
// function never includes them.
export async function updateProduct(companyId, productId, payload) {
  const response = await api.patch(`${basePath(companyId)}/${productId}/`, payload)
  return response.data
}

export async function activateProduct(companyId, productId, expectedVersion) {
  const response = await api.post(`${basePath(companyId)}/${productId}/activate/`, { expected_version: expectedVersion })
  return response.data
}

export async function deactivateProduct(companyId, productId, expectedVersion) {
  const response = await api.post(`${basePath(companyId)}/${productId}/deactivate/`, { expected_version: expectedVersion })
  return response.data
}

// Deletes a product that nothing references (no sales order lines,
// quotation lines or formulas) - the server rejects with a 400 naming
// what still references it otherwise. Requires products.delete and the
// current expected_version.
export async function deleteProduct(companyId, productId, expectedVersion) {
  await api.delete(`${basePath(companyId)}/${productId}/`, {
    params: { expected_version: expectedVersion },
  })
}

export async function previewProductImport(companyId, file) {
  const form = new FormData()
  form.append('file', file)
  const response = await api.post(`${basePath(companyId)}/import-preview/`, form)
  return response.data
}

export async function getProductImportPreview(companyId, previewId, { page = 1, pageSize = 50 } = {}) {
  const response = await api.get(`${basePath(companyId)}/import-preview/${previewId}/`, { params: { page, page_size: pageSize } })
  return response.data
}

export async function commitProductImport(companyId, previewId, expectedVersion) {
  const response = await api.post(`${basePath(companyId)}/import-commit/`, {
    preview_id: previewId,
    expected_version: expectedVersion,
  })
  return response.data
}
