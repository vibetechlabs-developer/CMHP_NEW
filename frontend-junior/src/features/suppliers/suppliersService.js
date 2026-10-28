// Real apps.suppliers integration.
// Endpoint: /api/v1/suppliers/  (IsActiveSuperuser required for all ops)
// Supplier is a shared directory — no owning company.
import api from '../../api/axios'

const BASE = '/v1/suppliers'

export async function listSuppliers({ page, pageSize, search, isActive } = {}) {
  const params = {}
  if (page) params.page = page
  if (pageSize) params.page_size = pageSize
  if (search) params.search = search
  if (isActive !== undefined && isActive !== null && isActive !== '') params.is_active = isActive
  const response = await api.get(`${BASE}/`, { params })
  return response.data
}

export async function getSupplier(supplierId) {
  const response = await api.get(`${BASE}/${supplierId}/`)
  return response.data
}

export async function createSupplier(payload) {
  const response = await api.post(`${BASE}/`, payload)
  return response.data
}

export async function updateSupplier(supplierId, payload) {
  const response = await api.patch(`${BASE}/${supplierId}/`, payload)
  return response.data
}

export async function activateSupplier(supplierId) {
  const response = await api.post(`${BASE}/${supplierId}/activate/`)
  return response.data
}

export async function deactivateSupplier(supplierId) {
  const response = await api.post(`${BASE}/${supplierId}/deactivate/`)
  return response.data
}

export async function deleteSupplier(supplierId) {
  const response = await api.delete(`${BASE}/${supplierId}/`)
  return response.data
}

