import { storage } from './storage'
import {
  getActiveCompanyId,
  getUserCompanyIds,
  WORKSPACES,
  getCurrentWorkspace,
  isManagementRole,
} from './workspace'

export function getCurrentUser() {
  return storage.getUser()
}

export function isSuperAdmin(user = getCurrentUser()) {
  return Boolean(
    user?.is_superuser ||
    user?.profile?.role === 'SUPER_ADMIN'
  )
}

export function isManagerOrAdmin(user = getCurrentUser()) {
  return isManagementRole(user)
}

/*
 * Returns the company ID of the current business workspace.
 */
export function getScopedCompanyId(user = getCurrentUser()) {
  return getActiveCompanyId(user)
}

export function getScopedCompanyIds(user = getCurrentUser()) {
  const companyId = getScopedCompanyId(user)
  return companyId ? [Number(companyId)] : []
}

export function isCommonInventoryContext(user = getCurrentUser()) {
  return getCurrentWorkspace(user) === WORKSPACES.COMMON
}

export function isAllCompaniesContext() {
  return false
}

export function isCompanyScopedContext(user = getCurrentUser()) {
  const current = getCurrentWorkspace(user)
  return (
    current === WORKSPACES.COMPANY_A ||
    current === WORKSPACES.COMPANY_B
  )
}

export function companyMatches(record, companyId) {
  if (!companyId) {
    return false
  }
  return Number(record?.company) === Number(companyId)
}

/*
 * Filter company-specific records.
 */
export function scopeCompanyRows(rows, user = getCurrentUser()) {
  const list = Array.isArray(rows) ? rows : []
  const companyId = getScopedCompanyId(user)
  if (!companyId) {
    return []
  }

  return list.filter((row) => companyMatches(row, companyId))
}

/*
 * Enforce company ID into newly created records.
 */
export function enforceCompanyPayload(payload = {}, user = getCurrentUser()) {
  const companyId = getScopedCompanyId(user)

  if (!companyId) {
    throw new Error('Select a company workspace before creating company-specific data.')
  }

  return {
    ...payload,
    company: Number(companyId),
  }
}

export function assertCompanyRecord(id, collection, user = getCurrentUser()) {
  const list = Array.isArray(collection) ? collection : []
  const companyId = getScopedCompanyId(user)
  if (!companyId) {
    throw new Error('No company workspace is active.')
  }

  const record = list.find((row) => Number(row?.id) === Number(id))
  if (!record || !companyMatches(record, companyId)) {
    throw new Error('This record does not belong to the active company.')
  }

  return record
}

export function getLockedCompanyIds(user = getCurrentUser()) {
  if (isManagementRole(user)) {
    return getUserCompanyIds(user)
  }

  const primary = Number(user?.profile?.primary_company)
  if (Number.isFinite(primary) && primary > 0) {
    return [primary]
  }

  const assigned = getUserCompanyIds(user)
  return assigned.length ? [assigned[0]] : []
}

/*
 * The real backend company id for the current workspace, for a real API
 * call to use. Added alongside the ported real-auth/workspace bridge
 * (see src/utils/workspace.js's own getActiveCompanyId, which already
 * returns the real backend id directly, not a mock slot number) - kept
 * as its own named export, mirroring frontend/src/utils/companyScope.js,
 * because src/utils/permissionsService.js (new) needs this exact name.
 */
export function getRealScopedCompanyId(user = getCurrentUser()) {
  return getScopedCompanyId(user)
}