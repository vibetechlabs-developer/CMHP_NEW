// Task: wire real authentication to the Django backend. Login/logout/
// token-refresh now hit the real API (see src/api/axios.js, src/api/
// csrf.js) instead of checking the mock `erp.users` slice - credentials
// are verified by the real backend, and the access token returned here
// is a real JWT, not a fake `mock-token-...` string.
//
// DELIBERATE, TEMPORARY SCOPE LIMIT: every OTHER feature in this app
// (companies, roles, stores, permissions, orders, inventory, ...) still
// reads the mock `erp` Redux slice, which has its own invented company/
// role model that does not exist in the real backend's data at all (the
// real backend has no `user.profile.role`/`user.is_superuser` on the
// user object - company/store access is company- and store-scoped
// permission codes, looked up separately). To avoid breaking every
// still-mocked screen that reads `user.profile.role`/`user.profile.
// companies`, this still blends in role/company fields from a MATCHING
// mock user (by username) when one exists, and falls back to safe,
// access-nothing defaults when it doesn't. That blending step - and the
// mock-lookup import below - should be deleted once company/role/
// permission data is itself wired to the real backend; nothing else in
// this file needs to change at that point.
import { store } from '../../store/store'
import api, { plainApi } from '../../api/axios'
import { ensureCsrfCookie } from '../../api/csrf'

const ROLE_LABELS = {
  SUPER_ADMIN: 'Super Admin',
  MANAGEMENT: 'Management',
  HR_ADMINISTRATOR: 'HR Administrator',
  HR_MANAGER: 'HR Manager',
  DEPARTMENT_MANAGER: 'Department Manager',
  STORES_MANAGER: 'Stores Manager',
  STORES_USER: 'Stores User',
  EMPLOYEE: 'Employee',
  VIEWER: 'Viewer',
}

// Workspace selection (src/utils/workspace.js) is hardcoded to exactly
// two companies, Company A = mock id 1 and Company B = mock id 2 - that
// assumption is baked into WORKSPACE_OPTIONS and every hasCompanyAAccess/
// hasCompanyBAccess call, and every mock ERP record in erpSlice.js is
// tagged with company id 1 or 2. The real backend's companies have their
// own real ids (e.g. the demo seed's DEMOA/DEMOB are ids 2/3, not 1/2)
// and there is no fixed "exactly two, named A and B" rule on the backend
// at all - a real company list is open-ended. Until workspace selection
// itself is rebuilt to show a real, open-ended company list, this maps
// the first two REAL companies the logged-in user actually has active
// membership in (apps.companies.services.active_companies_for_user,
// which never grants access merely from is_superuser - same rule here)
// onto those two fixed mock slots, in ascending real id order. A user
// with a third+ real company, or none at all, is a known limitation of
// this bridge, not a silent bug - the real company list is also kept,
// unmapped, as `profile.real_companies` for later use.
const MOCK_COMPANY_SLOTS = [1, 2]

function findMockCounterpart(username) {
  const { users } = store.getState().erp
  return users.find((u) => u.username.toLowerCase() === username.trim().toLowerCase())
}

// Both of these take `accessToken` explicitly and set the header
// themselves, rather than relying on src/api/axios.js's request
// interceptor (which reads the token from `storage`) - at the exact
// moment loginRequest() below calls them, the just-issued token has NOT
// been written to storage yet (AuthProvider only calls storage.setToken
// AFTER loginRequest() resolves), so the interceptor would send these
// two calls unauthenticated. This was a real bug here, not a hypothetical
// one: both calls silently 401'd and fell back to their empty/false
// defaults, which is exactly why the workspace switcher and Common
// Inventory access did not appear even for a real superuser with real
// company membership.
async function fetchRealCompanyBridge(accessToken) {
  try {
    const response = await api.get('/v1/companies/mine/', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const companies = response.data.companies || []
    const sorted = [...companies].sort((a, b) => a.id - b.id)
    const mappedIds = sorted.slice(0, MOCK_COMPANY_SLOTS.length).map((_, i) => MOCK_COMPANY_SLOTS[i])
    return { companies: mappedIds, realCompanies: sorted }
  } catch {
    // A real lookup failure must never block login - fall back to
    // whatever the mock blend below provides instead.
    return null
  }
}

// `apps.authentication.serializers.CurrentUserSerializer` deliberately
// never exposes `is_superuser` (the backend's own stated rule: it must
// never be treated as an operational permission - see apps.companies.
// services.active_companies_for_user's identical comment). This does
// NOT work around that - it asks a real, already-enforced permission
// boundary a question it was already answering for a different reason:
// `GET /api/v1/companies/` (the full, unfiltered company list) requires
// `IsActiveSuperuser` specifically (apps/companies/views.py,
// CompanyListCreateView) for its own administrative purpose. A 200 here
// is real evidence of real superuser status, not an inference; a 403 is
// real evidence of its absence. The result is used ONLY to pick this
// bridge's mock `role` label below (which still-mocked screens read for
// their OWN, separate, non-authoritative display/gating) - it grants no
// actual data access by itself, and every real endpoint this app calls
// still re-checks its own real permissions server-side regardless of
// what this label says.
async function probeIsRealSuperuser(accessToken) {
  try {
    await api.get('/v1/companies/', {
      params: { page_size: 1 },
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    return true
  } catch {
    return false
  }
}

export async function loginRequest(username, password) {
  await ensureCsrfCookie(plainApi)

  // Not wrapped - `src/utils/errors.js`'s `getErrorMessage` already
  // knows how to read a real DRF error response (`detail`, field
  // errors, a 429 throttle message), so the raw axios error is more
  // informative than a hand-written replacement would be.
  const response = await api.post('/v1/auth/login/', { username, password })
  const data = response.data

  const mockMatch = findMockCounterpart(username)
  const companyBridge = await fetchRealCompanyBridge(data.access)
  // Only probed when there is no explicit mock persona - an existing
  // mock match's own role is a deliberate test-persona choice and keeps
  // taking priority, exactly like its companies do above.
  const isRealSuperuser = mockMatch ? false : await probeIsRealSuperuser(data.access)
  const sessionUser = createSessionUser(data.user, mockMatch, companyBridge, isRealSuperuser)

  return {
    token: data.access,
    user: sessionUser,
  }
}

/* =========================================================
   SESSION USER

   `identity` is the REAL authenticated user (id/username/email/
   first_name/last_name only - see backend CurrentUserSerializer).
   `mockMatch`, when present, supplies the role fields nothing real has
   been wired up for yet. `companyBridge`, when it has at least one real
   company, takes PRIORITY over the mock match's own companies/primary_
   company - real membership is ground truth whenever it exists; the
   mock match's companies are only a fallback for a test persona with no
   real backend membership at all. `isRealSuperuser` - real evidence from
   `probeIsRealSuperuser`, never a guess - fills in the mock SUPER_ADMIN
   role (unlocking the workspace switcher and Common Inventory in the
   still-mocked UI) for a real admin account with no mock persona of its
   own. See the module docstring above.
   ========================================================= */
export function createSessionUser(identity, mockMatch = null, companyBridge = null, isRealSuperuser = false) {
  const hasRealCompanies = Boolean(companyBridge?.companies?.length)
  const companies = hasRealCompanies
    ? companyBridge.companies
    : Array.isArray(mockMatch?.companies)
      ? mockMatch.companies.map(Number)
      : []
  const role = mockMatch?.role || (isRealSuperuser ? 'SUPER_ADMIN' : 'VIEWER')

  return {
    id: identity.id,
    username: identity.username,
    first_name: identity.first_name,
    last_name: identity.last_name,
    email: identity.email,

    // Server-derived, read-only UI hints (never grants). Empty until the server says otherwise.
    capabilities: identity.capabilities || {},

    // Mirrors `role` below, not a second, independent guess - kept as
    // its own field only because the still-mocked UI already reads
    // `user.is_superuser` in a few places (see src/utils/workspace.js/
    // companyScope.js's own `isSuperAdmin`, which checks both).
    is_superuser: role === 'SUPER_ADMIN',

    profile: {
      role,
      role_label: ROLE_LABELS[role] || ROLE_LABELS.VIEWER,
      can_access_common_inventory: Boolean(mockMatch?.can_access_common_inventory),
      full_name: `${identity.first_name || ''} ${identity.last_name || ''}`.trim() || identity.username,
      companies,
      primary_company: hasRealCompanies
        ? companies[0]
        : mockMatch?.primary_company
          ? Number(mockMatch.primary_company)
          : null,
      // Unmapped, real {id, code, legal_name, display_name} rows from
      // GET /api/v1/companies/mine/ - not read by any still-mocked
      // screen yet, kept here so later integration work doesn't need a
      // second round trip to find out what this user actually has.
      real_companies: companyBridge?.realCompanies || [],
      employee_id: mockMatch?.employee_id || '',
      department: mockMatch?.department ? Number(mockMatch.department) : null,
      designation: mockMatch?.designation || '',
      phone: mockMatch?.phone || '',
      joining_date: mockMatch?.joining_date || '',
      employment_status: mockMatch?.employment_status || 'ACTIVE',
    },
  }
}

export async function logoutRequest() {
  await ensureCsrfCookie(plainApi)
  try {
    await api.post('/v1/auth/logout/')
  } catch {
    // Logout is idempotent on the backend and the caller (AuthProvider)
    // already clears local session state regardless - a network error
    // here must never block the user from leaving.
  }
  return true
}

// Fresh capability hints for the current session (GET /v1/auth/me/). Used after a
// session restore, so a remembered user never keeps stale write hints.
export async function fetchCurrentCapabilities() {
  const response = await api.get('/v1/auth/me/')
  return response.data.capabilities || {}
}

// Re-runs the real-company bridge for the CURRENT session's own token,
// without a full re-login. Used by Organization Setup after the acting
// administrator changes their OWN company membership, so the mock-slot
// workspace mapping and `profile.real_companies` reflect it immediately
// instead of only after the next sign-in. Returns null on failure, same
// as the bridge itself - a failed refresh must never block the screen
// that triggered it.
export async function refreshRealCompanyBridge(accessToken) {
  return fetchRealCompanyBridge(accessToken)
}
