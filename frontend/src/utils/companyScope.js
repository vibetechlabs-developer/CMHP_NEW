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
 * The real backend company id for the current workspace, for a real API
 * call to use.
 *
 * Historical note: this used to translate a MOCK scoped id (1 or 2) back
 * to a real id by position in `user.profile.real_companies`. That
 * translation now happens one layer down, inside `getActiveCompanyId`
 * itself (src/utils/workspace.js) - it already returns the real backend
 * id directly. Doing the position lookup again here, on a value that is
 * now already a real id, was a real bug: it indexed `real_companies` by
 * the real id's own numeric value instead of its position, so any
 * account whose real company id didn't happen to equal its array index
 * (e.g. exactly one real company, real id 2, for "Company A") got `null`
 * back - "No real company is linked to the current workspace" - even
 * though `getScopedCompanyId` had already resolved it correctly. Kept as
 * its own named export (rather than inlined at call sites) only because
 * `getScopedCompanyId`'s own name still suggests "the mock id" to a
 * reader even though it no longer is one.
 */
export function getRealScopedCompanyId(
  user = getCurrentUser()
) {
  return getScopedCompanyId(user)
}