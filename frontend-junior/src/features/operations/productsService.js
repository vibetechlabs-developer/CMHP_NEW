// Real apps.products integration - replaces the mock Add/Edit/Delete
// behaviour for the Products tab. No pricing/MRP/formula/stock/packing
// field is ever sent here - the real Product model has none of those;
// this service only ever sends the fields apps.products.serializers.
// ProductCreateSerializer/ProductUpdateSerializer actually accept.
import api from '../../api/axios'

const basePath = (companyId) => `/v1/companies/${companyId}/products`

export async function listProducts(companyId, { page, pageSize, search, isActive } = {}) {
  const params = {}
  if (page) params.page = page
  if (pageSize) params.page_size = pageSize
  if (search) params.search = search
  if (isActive !== undefined && isActive !== null) params.is_active = isActive
  const response = await api.get(`${basePath(companyId)}/`, { params })
  return response.data
}

export async function getProduct(companyId, productId) {
  const response = await api.get(`${basePath(companyId)}/${productId}/`)
  return response.data
}

// payload: code (required, create-only), name (required), product_type/
// description (optional free text), sales_uom_id (required, create-
// only - resolved via the unit lookup, never a hardcoded id).
export async function createProduct(companyId, payload) {
  const response = await api.post(`${basePath(companyId)}/`, payload)
  return response.data
}

// payload: expected_version (required) + any subset of name/
// product_type/description. `code`/`sales_uom`/`sales_uom_id`/`company`
// are immutable after creation (ProductUpdateSerializer rejects them
// outright, 400, if sent) - this function never includes them.
export async function updateProduct(companyId, productId, payload) {
  const response = await api.patch(`${basePath(companyId)}/${productId}/`, payload)
  return response.data
}

export async function activateProduct(companyId, productId, expectedVersion) {
  const response = await api.post(`${basePath(companyId)}/${productId}/activate/`, { expected_version: expectedVersion })
  return response.data
}

// No DELETE endpoint exists - deactivation only, never described as
// deletion.
export async function deactivateProduct(companyId, productId, expectedVersion) {
  const response = await api.post(`${basePath(companyId)}/${productId}/deactivate/`, { expected_version: expectedVersion })
  return response.data
}

// Deletes a product that nothing references (no sales order lines, quotation
// lines or formulas). Requires products.delete and the current expected_version.
export async function deleteProduct(companyId, productId, expectedVersion) {
  await api.delete(`${basePath(companyId)}/${productId}/`, {
    params: { expected_version: expectedVersion },
  })
}
