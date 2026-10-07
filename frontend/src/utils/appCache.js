// One-time reset of this application's own cached browser state after the backend
// database was replaced. Removes ONLY the keys this app writes; other storage is left
// alone. Bumping CACHE_VERSION forces the reset on the next load.
const CACHE_VERSION = 'fresh-database-2026-10-07'
const VERSION_KEY = 'cmhp.cacheVersion'
const APP_KEYS = [
  'user', // signed-in user identity (access token is memory-only and is never stored)
  'erp.sessionExpired',
  'cmhp_selected_workspace',
  'cmhp_erp_state_v2', // in-memory demo store that was persisted to localStorage
  'cmhp_payroll_adjustments_v1',
]

export function resetAppCacheIfStale() {
  try {
    if (localStorage.getItem(VERSION_KEY) === CACHE_VERSION) return false
    APP_KEYS.forEach((key) => localStorage.removeItem(key))
    localStorage.setItem(VERSION_KEY, CACHE_VERSION)
    return true
  } catch {
    // Storage can be unavailable (private mode). Nothing is shown from it then.
    return false
  }
}
