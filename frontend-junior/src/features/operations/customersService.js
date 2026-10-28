// Real apps.customers integration - replaces the mock Add/Edit/Delete
// behaviour for the Customers tab. Nothing here falls back to mock/
// local data on failure; a failed request is a real error for the
// caller to display.
import api from '../../api/axios'

const basePath = (companyId) => `/v1/companies/${companyId}/customers`

export async function listCustomers(companyId, { page, pageSize, search, isActive } = {}) {
  const params = {}
  if (page) params.page = page
  if (pageSize) params.page_size = pageSize
  if (search) params.search = search
  if (isActive !== undefined && isActive !== null) params.is_active = isActive
  const response = await api.get(`${basePath(companyId)}/`, { params })
  return response.data
}

export async function getCustomer(companyId, customerId) {
  const response = await api.get(`${basePath(companyId)}/${customerId}/`)
  return response.data
}

// payload: code (required, create-only), name (required), contact_person/
// email/phone/billing_address/shipping_address/notes (all optional) -
// exactly apps.customers.serializers.CustomerCreateSerializer's own
// allow-list. billing_address and shipping_address are two independent
// fields - this function never copies one into the other; if a caller
// wants that behaviour it must be an explicit, visible form action, not
// something this service does silently.
export async function createCustomer(companyId, payload) {
  const response = await api.post(`${basePath(companyId)}/`, payload)
  return response.data
}

// payload: expected_version (required) + any subset of name/
// contact_person/email/phone/billing_address/shipping_address/notes.
// `code` is immutable after creation (apps.customers.serializers.
// CustomerUpdateSerializer rejects it outright, 400, if sent) - this
// function never includes it, and the form must never offer to edit it.
export async function updateCustomer(companyId, customerId, payload) {
  const response = await api.patch(`${basePath(companyId)}/${customerId}/`, payload)
  return response.data
}

export async function activateCustomer(companyId, customerId, expectedVersion) {
  const response = await api.post(`${basePath(companyId)}/${customerId}/activate/`, { expected_version: expectedVersion })
  return response.data
}

// There is no DELETE endpoint for this resource - deactivation is the
// only supported "remove from active use" action, and it is never
// described as deletion anywhere in the UI that calls this.
export async function deactivateCustomer(companyId, customerId, expectedVersion) {
  const response = await api.post(`${basePath(companyId)}/${customerId}/deactivate/`, { expected_version: expectedVersion })
  return response.data
}

// Deletes a customer that nothing references (no sales orders or quotations).
// Requires customers.delete and the current expected_version. Customers that are
// referenced are refused by the backend; deactivate them instead.
export async function deleteCustomer(companyId, customerId, expectedVersion) {
  await api.delete(`${basePath(companyId)}/${customerId}/`, {
    params: { expected_version: expectedVersion },
  })
}

// CSV-style customer import. Preview writes nothing; commit is all-or-nothing.
export async function previewCustomerImport(companyId, rows) {
  const response = await api.post(`/v1/companies/${companyId}/customers/import-preview/`, { rows })
  return response.data
}

export async function commitCustomerImport(companyId, rows) {
  const response = await api.post(`/v1/companies/${companyId}/customers/import-commit/`, { rows })
  return response.data
}
