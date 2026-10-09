// Real apps.sales_orders integration - replaces the mock Save/Add
// behaviour for the Orders screen. Every function here hits the real
// backend; nothing falls back to mock/local data on failure - a failed
// request surfaces as a real error for the caller to display, never a
// silently-substituted fake result.
import api from '../../api/axios'

const basePath = (companyId) => `/v1/companies/${companyId}/sales-orders`

export async function listSalesOrders(companyId, { page, pageSize, search, customerId, orderDateFrom, orderDateTo } = {}) {
  const params = {}
  if (page) params.page = page
  if (pageSize) params.page_size = pageSize
  if (search) params.search = search
  if (customerId) params.customer = customerId
  if (orderDateFrom) params.order_date_from = orderDateFrom
  if (orderDateTo) params.order_date_to = orderDateTo
  const response = await api.get(`${basePath(companyId)}/`, { params })
  return response.data // {count, next, previous, results}
}

export async function getSalesOrder(companyId, orderId) {
  const response = await api.get(`${basePath(companyId)}/${orderId}/`)
  return response.data
}

// `payload` fields: customer_id (required), order_date (required,
// YYYY-MM-DD), requested_delivery_date (optional), customer_order_
// reference (optional), currency (required, 3 letters), notes
// (optional), lines (optional array of {product_id, quantity, unit_
// price, description}) - exactly apps.sales_orders.serializers.
// SalesOrderCreateSerializer's own allow-list, nothing more. The caller
// must never send unit_price derived from a product's MRP or any other
// substituted value - this function does not validate that; it is the
// form's own responsibility to only ever send a price the user actually
// entered.
export async function createSalesOrder(companyId, payload) {
  const response = await api.post(`${basePath(companyId)}/`, payload)
  return response.data
}

// `payload` may include `expected_version` (required) plus any subset
// of customer_id/order_date/requested_delivery_date/customer_order_
// reference/notes/lines. When `lines` is present it is the COMPLETE
// final list (full-replace semantics, not a partial-by-id patch) -
// existing line ids are kept/updated, omitted ids are removed, entries
// with no `id` are created. See apps.sales_orders.services.
// update_sales_order's own docstring - this function sends the payload
// through unchanged, the caller (the form) is responsible for building
// the complete list correctly.
export async function updateSalesOrder(companyId, orderId, payload) {
  const response = await api.patch(`${basePath(companyId)}/${orderId}/`, payload)
  return response.data
}

// Read-only confirmation-preview - apps.sales_orders.views.
// SalesOrderConfirmationPreviewView. Calls the SAME assess_confirmation
// the real confirm command uses, so this screen never computes
// eligibility itself; it only ever displays what the server returns.
// Requires sales_orders.view only (not .confirm) - a viewer can review
// without being able to confirm.
export async function getConfirmationPreview(companyId, orderId) {
  const response = await api.get(`${basePath(companyId)}/${orderId}/confirmation-preview/`)
  return response.data
}

// DRAFT -> CONFIRMED. `expectedVersion` must be the `order.version` the
// caller actually reviewed (from the confirmation-preview response),
// never a locally-held, possibly-stale value - see apps.sales_orders.
// services.confirm_sales_order. A stale version is a real 409 from the
// server, never silently retried here.
export async function confirmSalesOrder(companyId, orderId, expectedVersion) {
  const response = await api.post(`${basePath(companyId)}/${orderId}/confirm/`, { expected_version: expectedVersion })
  return response.data
}

// Deletes a DRAFT sales order that has no batch plans. The backend requires
// sales_orders.delete and a current expected_version; a conflict or refusal is
// returned to the caller as an error, never retried silently.
export async function deleteSalesOrder(companyId, orderId, expectedVersion) {
  await api.delete(`/v1/companies/${companyId}/sales-orders/${orderId}/`, {
    params: { expected_version: expectedVersion },
  })
}

// Safe text for a failed delete. Only a JSON business message from the server is
// shown; HTML, 5xx, network and permission responses use neutral wording (no
// permission codes, no debug output). A 409 has its own explanation.
export function deleteOrderErrorMessage(error) {
  const status = error?.response?.status
  if (status === 409) {
    return 'This order changed since it was loaded, so it was not deleted. The latest data has been loaded. Review the order and confirm again to delete it.'
  }
  if (status === 403) {
    return "You don't have permission to delete this order."
  }
  if (status === 404) {
    return 'This order was not found. It may already have been deleted.'
  }
  const contentType = String(error?.response?.headers?.['content-type'] || '')
  // The server wraps a business refusal as {"detail": ["message"]} (DRF list form);
  // a plain {"detail": "message"} is accepted too.
  const rawDetail = error?.response?.data?.detail
  const detail = Array.isArray(rawDetail) ? rawDetail[0] : rawDetail
  if (status && status < 500 && contentType.includes('application/json') && typeof detail === 'string' && detail.length <= 300) {
    return detail
  }
  return "We couldn't delete this order. Please try again. If the problem continues, contact your administrator."
}
