// Real per-company permission lookup. Calls the real, already-tested
// `GET /api/v1/companies/<id>/my-permissions/` endpoint
// (apps.permissions.views.MyCompanyPermissionsView) and returns exactly
// the permission codes this account actually holds in that company - no
// assumption that any role name implies "all permissions", because the
// real backend has no such role concept at all (see apps/permissions/
// views.py's own docstring: never consults is_staff/is_superuser).
//
// Ported from frontend/src/utils/permissionsService.js as part of
// replacing frontend-junior's mock auth.
import api from '../api/axios'

// Maps a mock workspace company id (1/2) to the real backend company id
// it was bridged from at login - see src/features/auth/authService.js's
// own MOCK_COMPANY_SLOTS constant, which this must stay in sync with.
import { getRealScopedCompanyId } from './companyScope'

// Keyed by user AND company, so a different sign-in on the same company can
// never reuse the previous user's permissions.
const cache = new Map() // `${userKey}:${realCompanyId}` -> Set<string>

function userKey(user) {
  return String(user?.id ?? user?.username ?? 'anonymous')
}

export async function fetchMyPermissions(user) {
  const realCompanyId = getRealScopedCompanyId(user)
  if (!realCompanyId) {
    return { realCompanyId: null, permissions: new Set() }
  }
  const key = `${userKey(user)}:${realCompanyId}`
  if (cache.has(key)) {
    return { realCompanyId, permissions: cache.get(key) }
  }
  const response = await api.get(`/v1/companies/${realCompanyId}/my-permissions/`)
  const permissions = new Set(response.data.permissions || [])
  cache.set(key, permissions)
  return { realCompanyId, permissions }
}

// Call when logging out or when a user's role could plausibly have
// changed server-side mid-session - cheap enough to call liberally since
// a stale cache entry is a UI-permission-display bug at worst, never a
// real authorization bypass (the real API re-checks every permission on
// every request regardless of what this cache says).
export function clearPermissionsCache() {
  cache.clear()
}

// Same real endpoint as fetchMyPermissions, but for an EXPLICIT, caller-
// chosen real company id - never routed through getRealScopedCompanyId's
// fixed Company A/B workspace-bridge slots. Used by the company-owned
// screens added for Products/Formulas/Batch Planning, which let the user
// pick from their own full, real GET /v1/companies/mine/ list (see
// hooks/useSelectedCompany.js) rather than being limited to whichever two
// companies happened to get bridged into the mock workspace at login.
export async function fetchCompanyPermissions(companyId, user) {
  if (!companyId) return new Set()
  const key = `${userKey(user)}:${companyId}`
  if (cache.has(key)) {
    return cache.get(key)
  }
  const response = await api.get(`/v1/companies/${companyId}/my-permissions/`)
  const permissions = new Set(response.data.permissions || [])
  cache.set(key, permissions)
  return permissions
}
