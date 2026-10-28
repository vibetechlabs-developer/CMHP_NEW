// Real apps.purchasing integration - Purchase Orders and Purchase Requests.
// Reuses backend contracts from apps/purchasing/urls.py, views.py, and serializers.py.
// Company-scoped: every call names the company the order/request belongs to.
// Does NOT create stock movements - stock effect only happens upon Goods Receipt.
import api from '../../api/axios'

const rows = (data) => (Array.isArray(data) ? data : data?.results || [])

// -------------------------------------------------------------
// PURCHASE ORDERS (Procurement)
// -------------------------------------------------------------

// Normalize supplier objects so every item always has a `name` field,
// regardless of which endpoint the data came from. The main supplier
// directory (/v1/suppliers/) returns `legal_name`/`display_name` but
// no `name`; the purchasing-supplier endpoints include `name`.
function _normalizeSuppliers(list) {
  return (list || []).map((s) => ({
    ...s,
    name: s.name || s.display_name || s.legal_name || s.code || '',
  }))
}

export async function listPurchasingSuppliers(companyId) {
  if (companyId) {
    try {
      const res = await api.get(`/v1/companies/${companyId}/suppliers/`)
      if (Array.isArray(res.data) && res.data.length > 0) return _normalizeSuppliers(res.data)
    } catch {}
  }
  try {
    const res = await api.get('/v1/suppliers/?is_active=true')
    return _normalizeSuppliers(rows(res.data))
  } catch {
    try {
      const res = await api.get('/v1/materials/suppliers/')
      return _normalizeSuppliers(rows(res.data))
    } catch {
      return []
    }
  }
}

export async function listActiveMaterials() {
  try {
    const res = await api.get('/v1/materials/?is_active=true&page_size=200')
    return rows(res.data)
  } catch {
    return []
  }
}

export async function listPurchaseOrders(companyId, { page = 1, pageSize = 20, status = '', search = '' } = {}) {
  const params = { page, page_size: pageSize }
  if (status) params.status = status
  if (search) params.search = search
  const response = await api.get(`/v1/companies/${companyId}/purchase-orders/`, { params })
  return {
    count: response.data?.count || 0,
    results: rows(response.data),
  }
}

export async function getPurchaseOrder(companyId, orderId) {
  const response = await api.get(`/v1/companies/${companyId}/purchase-orders/${orderId}/`)
  return response.data
}

export async function createPurchaseOrder(companyId, payload) {
  const response = await api.post(`/v1/companies/${companyId}/purchase-orders/`, payload)
  return response.data
}

export async function updatePurchaseOrder(companyId, orderId, payload) {
  const response = await api.patch(`/v1/companies/${companyId}/purchase-orders/${orderId}/`, payload)
  return response.data
}

export async function issuePurchaseOrder(companyId, orderId, expectedVersion) {
  const response = await api.post(`/v1/companies/${companyId}/purchase-orders/${orderId}/issue/`, {
    expected_version: expectedVersion,
  })
  return response.data
}

export async function cancelPurchaseOrder(companyId, orderId, expectedVersion, cancellationReason) {
  const response = await api.post(`/v1/companies/${companyId}/purchase-orders/${orderId}/cancel/`, {
    expected_version: expectedVersion,
    cancellation_reason: cancellationReason,
  })
  return response.data
}

export async function listStorePurchaseOrders(
  storeId,
  { page = 1, pageSize = 20, status = '', search = '', supplierId = '', dateFrom = '', dateTo = '' } = {}
) {
  const params = { page, page_size: pageSize }
  if (status) params.status = status
  if (search) params.search = search
  if (supplierId) params.supplier_id = supplierId
  if (dateFrom) params.date_from = dateFrom
  if (dateTo) params.date_to = dateTo
  const response = await api.get(`/v1/stores/${storeId}/purchase-orders/`, { params })
  return {
    count: response.data?.count || 0,
    results: rows(response.data),
  }
}

export async function createStorePurchaseOrder(storeId, payload) {
  const response = await api.post(`/v1/stores/${storeId}/purchase-orders/`, payload)
  return response.data
}

export async function getStorePurchaseOrder(storeId, orderId) {
  const response = await api.get(`/v1/stores/${storeId}/purchase-orders/${orderId}/`)
  return response.data
}

export async function updateStorePurchaseOrder(storeId, orderId, payload) {
  const response = await api.patch(`/v1/stores/${storeId}/purchase-orders/${orderId}/`, payload)
  return response.data
}

export async function issueStorePurchaseOrder(storeId, orderId, expectedVersion) {
  const response = await api.post(`/v1/stores/${storeId}/purchase-orders/${orderId}/issue/`, {
    expected_version: expectedVersion,
  })
  return response.data
}

export async function cancelStorePurchaseOrder(storeId, orderId, expectedVersion, cancellationReason) {
  const response = await api.post(`/v1/stores/${storeId}/purchase-orders/${orderId}/cancel/`, {
    expected_version: expectedVersion,
    cancellation_reason: cancellationReason,
  })
  return response.data
}

export async function listStorePurchasingSuppliers(storeId) {
  if (storeId) {
    try {
      const res = await api.get(`/v1/stores/${storeId}/purchasing-suppliers/`)
      if (Array.isArray(res.data) && res.data.length > 0) return _normalizeSuppliers(res.data)
    } catch {}
  }
  return listPurchasingSuppliers()
}
// PURCHASE REQUESTS (Material Procurement Requisitions)
// -------------------------------------------------------------

export async function listPurchaseRequests(companyId, { page = 1, pageSize = 20, status = '', search = '' } = {}) {
  const params = { page, page_size: pageSize }
  if (status) params.status = status
  if (search) params.search = search
  const response = await api.get(`/v1/companies/${companyId}/purchase-requests/`, { params })
  return {
    count: response.data?.count || 0,
    results: rows(response.data),
  }
}

export async function getPurchaseRequest(companyId, requestId) {
  const response = await api.get(`/v1/companies/${companyId}/purchase-requests/${requestId}/`)
  return response.data
}

export async function createPurchaseRequest(companyId, payload) {
  const response = await api.post(`/v1/companies/${companyId}/purchase-requests/`, payload)
  return response.data
}

export async function updatePurchaseRequest(companyId, requestId, payload) {
  const response = await api.patch(`/v1/companies/${companyId}/purchase-requests/${requestId}/`, payload)
  return response.data
}

export async function submitPurchaseRequest(companyId, requestId, expectedVersion) {
  const response = await api.post(`/v1/companies/${companyId}/purchase-requests/${requestId}/submit/`, {
    expected_version: expectedVersion,
  })
  return response.data
}

export async function approvePurchaseRequest(companyId, requestId, expectedVersion, { notes = '' } = {}) {
  const response = await api.post(`/v1/companies/${companyId}/purchase-requests/${requestId}/approve/`, {
    expected_version: expectedVersion,
    notes,
  })
  return response.data
}

export async function rejectPurchaseRequest(companyId, requestId, expectedVersion, rejectionReason) {
  const response = await api.post(`/v1/companies/${companyId}/purchase-requests/${requestId}/reject/`, {
    expected_version: expectedVersion,
    rejection_reason: rejectionReason,
  })
  return response.data
}

export async function cancelPurchaseRequest(companyId, requestId, expectedVersion, cancellationReason) {
  const response = await api.post(`/v1/companies/${companyId}/purchase-requests/${requestId}/cancel/`, {
    expected_version: expectedVersion,
    cancellation_reason: cancellationReason,
  })
  return response.data
}
