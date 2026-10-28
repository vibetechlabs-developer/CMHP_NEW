// Real backend integration for Organization Setup: companies, shared
// stores, company/store roles and their permission sets, company/store
// memberships and role assignments, units of measure, and the
// sales-order confirmation policy. Every endpoint below already exists
// and is already covered by backend tests - this file only wires the
// frontend to it. All of it is IsActiveSuperuser on the server; nothing
// here grants anything by itself.
//
// Company membership/role-assignment calls reuse the SAME functions
// already used (and tested in production use) by the existing User
// Management screen (`features/companies/usersApiService.js`) rather than
// duplicating that logic - see the re-exports at the bottom of this file.
import api from '../../api/axios'
import { clearPermissionsCache } from '../../utils/permissionsService'

// ---------------------------------------------------------------------------
// Companies
// ---------------------------------------------------------------------------

export async function listCompaniesAdmin({ search = '', isActive, page = 1, pageSize = 20 } = {}) {
  const params = { page, page_size: pageSize }
  if (search) params.search = search
  if (isActive !== undefined) params.is_active = isActive
  const response = await api.get('/v1/companies/', { params })
  return response.data // {count, next, previous, results}
}

export async function createCompany(payload) {
  const response = await api.post('/v1/companies/', payload)
  return response.data
}

export async function updateCompany(companyId, payload) {
  const response = await api.patch(`/v1/companies/${companyId}/`, payload)
  return response.data
}

export async function activateCompany(companyId) {
  const response = await api.post(`/v1/companies/${companyId}/activate/`)
  return response.data
}

export async function deactivateCompany(companyId) {
  const response = await api.post(`/v1/companies/${companyId}/deactivate/`)
  return response.data
}

// ---------------------------------------------------------------------------
// Shared stores (no owning-company concept)
// ---------------------------------------------------------------------------

export async function listStoresAdmin({ search = '', isActive, page = 1, pageSize = 20 } = {}) {
  const params = { page, page_size: pageSize }
  if (search) params.search = search
  if (isActive !== undefined) params.is_active = isActive
  const response = await api.get('/v1/stores/', { params })
  return response.data
}

export async function createStore(payload) {
  const response = await api.post('/v1/stores/', payload)
  return response.data
}

export async function updateStore(storeId, payload) {
  const response = await api.patch(`/v1/stores/${storeId}/`, payload)
  return response.data
}

export async function activateStore(storeId) {
  const response = await api.post(`/v1/stores/${storeId}/activate/`)
  return response.data
}

export async function deactivateStore(storeId) {
  const response = await api.post(`/v1/stores/${storeId}/deactivate/`)
  return response.data
}

// ---------------------------------------------------------------------------
// Permission catalog - COMPANY and STORE are separate scopes. The catalog is
// paginated server-side (up to 100/page); every caller here walks every
// page so a permission on page 2+ is never silently missing from a role's
// editable set.
// ---------------------------------------------------------------------------

export async function listAllPermissions(scope) {
  const all = []
  let page = 1
  // Bounded by the server's own max_page_size (100) per request; this loop
  // ends when a page comes back with fewer than a full page (or empty).
  for (;;) {
    const response = await api.get('/v1/permissions/', {
      params: { scope, is_active: true, page, page_size: 100 },
    })
    const results = response.data.results || []
    all.push(...results)
    if (!response.data.next || results.length === 0) break
    page += 1
  }
  return all
}

// ---------------------------------------------------------------------------
// Company roles
// ---------------------------------------------------------------------------

export async function listCompanyRolesAdmin(companyId) {
  const response = await api.get(`/v1/companies/${companyId}/roles/`, { params: { page_size: 100 } })
  return response.data.results || []
}

export async function createCompanyRole(companyId, payload) {
  const response = await api.post(`/v1/companies/${companyId}/roles/`, payload)
  return response.data
}

export async function updateCompanyRole(companyId, roleId, payload) {
  const response = await api.patch(`/v1/companies/${companyId}/roles/${roleId}/`, payload)
  return response.data
}

export async function activateCompanyRole(companyId, roleId) {
  const response = await api.post(`/v1/companies/${companyId}/roles/${roleId}/activate/`)
  return response.data
}

export async function deactivateCompanyRole(companyId, roleId) {
  const response = await api.post(`/v1/companies/${companyId}/roles/${roleId}/deactivate/`)
  return response.data
}

// Full replace - `permissionCodes` must be the COMPLETE desired set, not a
// delta. The caller is responsible for preselecting the role's current
// codes (role.permissions) before letting the user change anything, so
// nothing the user did not intentionally touch is dropped.
export async function replaceCompanyRolePermissions(companyId, roleId, permissionCodes) {
  const response = await api.put(`/v1/companies/${companyId}/roles/${roleId}/permissions/`, {
    permission_codes: permissionCodes,
  })
  clearPermissionsCache()
  return response.data
}

// ---------------------------------------------------------------------------
// Store roles
// ---------------------------------------------------------------------------

export async function listStoreRolesAdmin(storeId) {
  const response = await api.get(`/v1/stores/${storeId}/roles/`, { params: { page_size: 100 } })
  return response.data.results || []
}

export async function createStoreRole(storeId, payload) {
  const response = await api.post(`/v1/stores/${storeId}/roles/`, payload)
  return response.data
}

export async function updateStoreRole(storeId, roleId, payload) {
  const response = await api.patch(`/v1/stores/${storeId}/roles/${roleId}/`, payload)
  return response.data
}

export async function activateStoreRole(storeId, roleId) {
  const response = await api.post(`/v1/stores/${storeId}/roles/${roleId}/activate/`)
  return response.data
}

export async function deactivateStoreRole(storeId, roleId) {
  const response = await api.post(`/v1/stores/${storeId}/roles/${roleId}/deactivate/`)
  return response.data
}

export async function replaceStoreRolePermissions(storeId, roleId, permissionCodes) {
  const response = await api.put(`/v1/stores/${storeId}/roles/${roleId}/permissions/`, {
    permission_codes: permissionCodes,
  })
  clearPermissionsCache()
  return response.data
}

// ---------------------------------------------------------------------------
// Store memberships and store role assignments - mirrors the existing,
// already-real company membership pattern in usersApiService.js, but keyed
// by store (no equivalent existed anywhere in the frontend before this).
// ---------------------------------------------------------------------------

export async function listStoreMemberships(storeId) {
  const response = await api.get(`/v1/stores/${storeId}/memberships/`)
  return response.data
}

export async function assignStoreMembership(storeId, userId) {
  const response = await api.post(`/v1/stores/${storeId}/memberships/`, { user_id: userId })
  clearPermissionsCache()
  return response.data
}

export async function deactivateStoreMembership(storeId, membershipId) {
  const response = await api.post(`/v1/stores/${storeId}/memberships/${membershipId}/deactivate/`)
  clearPermissionsCache()
  return response.data
}

export async function listStoreRoleAssignments(storeId, membershipId) {
  const response = await api.get(`/v1/stores/${storeId}/memberships/${membershipId}/roles/`)
  return response.data
}

export async function assignStoreRole(storeId, membershipId, roleId) {
  const response = await api.post(`/v1/stores/${storeId}/memberships/${membershipId}/roles/`, { role_id: roleId })
  clearPermissionsCache()
  return response.data
}

export async function deactivateStoreRoleAssignment(storeId, membershipId, assignmentId) {
  const response = await api.post(
    `/v1/stores/${storeId}/memberships/${membershipId}/roles/${assignmentId}/deactivate/`
  )
  clearPermissionsCache()
  return response.data
}

// ---------------------------------------------------------------------------
// Units of measure
// ---------------------------------------------------------------------------

export async function listUnitsAdmin({ search = '', isActive, page = 1, pageSize = 20 } = {}) {
  const params = { page, page_size: pageSize }
  if (search) params.search = search
  if (isActive !== undefined) params.is_active = isActive
  const response = await api.get('/v1/units/', { params })
  return response.data
}

export async function createUnit(payload) {
  const response = await api.post('/v1/units/', payload)
  return response.data
}

export async function updateUnit(unitId, payload) {
  const response = await api.patch(`/v1/units/${unitId}/`, payload)
  return response.data
}

export async function activateUnit(unitId) {
  const response = await api.post(`/v1/units/${unitId}/activate/`)
  return response.data
}

export async function deactivateUnit(unitId) {
  const response = await api.post(`/v1/units/${unitId}/deactivate/`)
  return response.data
}

// ---------------------------------------------------------------------------
// Sales order confirmation policy - per company. `expectedVersion` must be
// exactly the `version` last read for this company (0 when NOT_CONFIGURED -
// the backend's own creation convention), and the body must include only
// the fields actually being answered this save, never every field blindly.
// ---------------------------------------------------------------------------

export async function getConfirmationPolicy(companyId) {
  const response = await api.get(`/v1/companies/${companyId}/sales-order-confirmation-policy/`)
  return response.data
}

export async function updateConfirmationPolicy(companyId, expectedVersion, changedFields) {
  const response = await api.patch(`/v1/companies/${companyId}/sales-order-confirmation-policy/`, {
    expected_version: expectedVersion,
    ...changedFields,
  })
  return response.data
}

// ---------------------------------------------------------------------------
// Re-exports: user lookup and company membership/role assignment reuse the
// existing, already-real, already-tested-in-production functions rather
// than duplicating them. The mutating ones are thin-wrapped only to add the
// same cache invalidation every other mutation above already gets.
// ---------------------------------------------------------------------------
import {
  listUsers as _listUsers,
  listUserMemberships as _listUserMemberships,
  assignUserMembership as _assignUserMembership,
  deactivateUserMembership as _deactivateUserMembership,
  listUserRoleAssignments as _listUserRoleAssignments,
  assignUserRole as _assignUserRole,
  deactivateUserRole as _deactivateUserRole,
} from '../companies/usersApiService'

export const listUsers = _listUsers
export const listUserMemberships = _listUserMemberships
export const listUserRoleAssignments = _listUserRoleAssignments

export async function assignUserMembership(userId, companyId) {
  const result = await _assignUserMembership(userId, companyId)
  clearPermissionsCache()
  return result
}

export async function deactivateUserMembership(userId, membershipId) {
  const result = await _deactivateUserMembership(userId, membershipId)
  clearPermissionsCache()
  return result
}

export async function assignUserRole(userId, membershipId, roleId) {
  const result = await _assignUserRole(userId, membershipId, roleId)
  clearPermissionsCache()
  return result
}

export async function deactivateUserRole(userId, membershipId, assignmentId) {
  const result = await _deactivateUserRole(userId, membershipId, assignmentId)
  clearPermissionsCache()
  return result
}
