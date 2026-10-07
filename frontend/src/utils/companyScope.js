import { storage } from './storage'

import {
  getActiveCompanyId,
  getUserCompanyIds,
  WORKSPACES,
  getCurrentWorkspace,
} from './workspace'


export function getCurrentUser() {
  return storage.getUser()
}


/*
 * Only Super Admin can work with multiple companies.
 *
 * Every other user is locked to the active/primary company.
 */
export function isSuperAdmin(user = getCurrentUser()) {
  return Boolean(
    user?.is_superuser ||
    user?.profile?.role === 'SUPER_ADMIN'
  )
}


/*
 * Returns the company of the current business workspace.
 *
 * IMPORTANT:
 * Even Super Admin is scoped to the currently selected company.
 *
 * Example:
 *
 * Super Admin
 *   ↓
 * Company A
 *   ↓
 * Company A data only
 *
 * Switch to Company B
 *   ↓
 * Company B data only
 */
export function getScopedCompanyId(
  user = getCurrentUser()
) {
  return getActiveCompanyId(user)
}


export function getScopedCompanyIds(
  user = getCurrentUser()
) {
  const companyId =
    getScopedCompanyId(user)

  return companyId
    ? [Number(companyId)]
    : []
}


export function isCommonInventoryContext(
  user = getCurrentUser()
) {
  return (
    getCurrentWorkspace(user) ===
    WORKSPACES.COMMON
  )
}


export function isCompanyScopedContext(
  user = getCurrentUser()
) {
  return Boolean(
    getScopedCompanyId(user)
  )
}


/*
 * Check whether a business record belongs
 * to the active company.
 */
export function companyMatches(
  record,
  companyId
) {
  if (!companyId) {
    return false
  }

  return (
    Number(record?.company) ===
    Number(companyId)
  )
}


/*
 * Filter company-specific records.
 */
export function scopeCompanyRows(
  rows,
  user = getCurrentUser()
) {
  const companyId =
    getScopedCompanyId(user)

  if (!companyId) {
    return []
  }

  return (
    Array.isArray(rows)
      ? rows
      : []
  ).filter(
    (row) =>
      companyMatches(
        row,
        companyId
      )
  )
}


/*
 * Company must NEVER come from a normal
 * user's submitted form.
 *
 * The active workspace decides it.
 */
export function enforceCompanyPayload(
  payload = {},
  user = getCurrentUser()
) {
  const companyId =
    getScopedCompanyId(user)

  if (!companyId) {
    throw new Error(
      'Select a company workspace before creating company-specific data.'
    )
  }

  return {
    ...payload,

    company:
      Number(companyId),
  }
}


/*
 * Prevent editing/deleting a record from
 * another company.
 */
export function assertCompanyRecord(
  id,
  collection,
  user = getCurrentUser()
) {
  const companyId =
    getScopedCompanyId(user)

  if (!companyId) {
    throw new Error(
      'No company workspace is active.'
    )
  }

  const record =
    (
      Array.isArray(collection)
        ? collection
        : []
    ).find(
      (row) =>
        Number(row?.id) ===
        Number(id)
    )

  if (
    !record ||
    !companyMatches(
      record,
      companyId
    )
  ) {
    throw new Error(
      'This record does not belong to the active company.'
    )
  }

  return record
}


/*
 * Utility for normal users.
 *
 * Even if an old user record accidentally
 * contains companies: [1, 2], normal users
 * are still restricted to primary_company.
 */
export function getLockedCompanyIds(
  user = getCurrentUser()
) {
  if (
    isSuperAdmin(user)
  ) {
    return getUserCompanyIds(user)
  }

  const primary =
    Number(
      user?.profile?.primary_company
    )

  if (
    Number.isFinite(primary) &&
    primary > 0
  ) {
    return [primary]
  }

  const assigned =
    getUserCompanyIds(user)

  return assigned.length
    ? [assigned[0]]
    : []
}


/*
 * Maps the current MOCK scoped company id (1 or 2 - see
 * src/features/auth/authService.js's own MOCK_COMPANY_SLOTS bridge) back
 * to the REAL backend company id a real API call actually needs. `user.
 * profile.real_companies` is the real, ordered {id, code, legal_name,
 * display_name} list that bridge produced at login - slot 1 is
 * real_companies[0], slot 2 is real_companies[1]. Returns null when the
 * current user/workspace has no real company behind it at all (a mock-
 * only test persona, or a mock company id outside 1/2), so a caller can
 * tell "nothing to fetch" apart from "fetch company 0".
 */
export function getRealScopedCompanyId(
  user = getCurrentUser()
) {
  const mockCompanyId =
    getScopedCompanyId(user)

  if (!mockCompanyId) {
    return null
  }

  const realCompanies =
    user?.profile?.real_companies

  if (!Array.isArray(realCompanies)) {
    return null
  }

  // [1, 2] - must match src/features/auth/authService.js's own
  // MOCK_COMPANY_SLOTS constant exactly; duplicated as a literal here
  // (rather than imported) only to avoid a cross-module import between
  // the auth and workspace layers for one shared array.
  const slotIndex =
    [1, 2].indexOf(
      Number(mockCompanyId)
    )

  if (slotIndex === -1) {
    return null
  }

  return realCompanies[slotIndex]?.id || null
}