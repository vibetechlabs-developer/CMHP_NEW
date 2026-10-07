// Real apps.users API. Superuser-only on the backend (IsActiveSuperuser).
// Company memberships and company roles use the same superuser endpoints.
import api from '../../api/axios'

const BASE = '/v1/users/'

export async function listUsers({ search = '', isActive } = {}) {
  const params = {}
  if (search) params.search = search
  if (isActive !== undefined) params.is_active = isActive
  params.page_size = 100
  const response = await api.get(BASE, { params })
  return response.data.results || []
}

export async function createUser(payload) {
  const response = await api.post(BASE, payload)
  return response.data
}

export async function updateUser(userId, payload) {
  const response = await api.patch(`${BASE}${userId}/`, payload)
  return response.data
}

export async function activateUser(userId) {
  const response = await api.post(`${BASE}${userId}/activate/`)
  return response.data
}

export async function deactivateUser(userId) {
  const response = await api.post(`${BASE}${userId}/deactivate/`)
  return response.data
}

export async function listUserMemberships(userId) {
  const response = await api.get(`${BASE}${userId}/memberships/`)
  return response.data
}

export async function assignUserMembership(userId, companyId) {
  const response = await api.post(`${BASE}${userId}/memberships/`, { company_id: companyId })
  return response.data
}

export async function deactivateUserMembership(userId, membershipId) {
  const response = await api.post(`${BASE}${userId}/memberships/${membershipId}/deactivate/`)
  return response.data
}

export async function listUserRoleAssignments(userId, membershipId) {
  const response = await api.get(`${BASE}${userId}/memberships/${membershipId}/roles/`)
  return response.data
}

export async function assignUserRole(userId, membershipId, roleId) {
  const response = await api.post(`${BASE}${userId}/memberships/${membershipId}/roles/`, { role_id: roleId })
  return response.data
}

export async function deactivateUserRole(userId, membershipId, assignmentId) {
  const response = await api.post(`${BASE}${userId}/memberships/${membershipId}/roles/${assignmentId}/deactivate/`)
  return response.data
}

export async function listCompanies() {
  const response = await api.get('/v1/companies/', { params: { is_active: true, page_size: 100 } })
  return response.data.results || []
}

export async function listCompanyRoles(companyId) {
  const response = await api.get(`/v1/companies/${companyId}/roles/`, { params: { is_active: true, page_size: 100 } })
  return response.data.results || response.data || []
}
