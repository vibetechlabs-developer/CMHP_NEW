// Session storage for the browser app.
//
// The ACCESS token lives only in memory: it is never written to localStorage,
// so it cannot leak into another tab's or another user's session on this
// computer. After a page reload the app restores the session with the
// HttpOnly refresh cookie (see AuthProvider and api/axios.js restoreSession).
//
// The signed-in user's display details (name, username) are kept in
// localStorage so the screen can show who is signed in while the session is
// being restored. They contain no secret.
//
// Ported from frontend/src/utils/storage.js as part of replacing
// frontend-junior's mock auth (which stored a fake token in localStorage
// under this same `user`/`token` key pair - see git history). Any token
// a browser still has under the old `token` key from that mock app is
// now simply never read (getToken() is in-memory only); any stale `user`
// value is only ever used for display before a page reload, and can
// never grant access on its own - AuthProvider's session-restore effect
// (api/axios.js's restoreSession) always re-validates against the real
// HttpOnly refresh cookie and clears everything (see `clear()` below) on
// failure, so leftover mock session data can never establish real
// authentication, permissions, or workspace membership.

const USER_KEY = 'user'
const SESSION_EXPIRED_KEY = 'erp.sessionExpired'
const LEGACY_MOCK_TOKEN_KEY = 'token'

// One-time cleanup: the old mock auth stored a fabricated token string
// under this key. It is never read by anything in this module anymore,
// but removing it (rather than leaving it to linger) makes it obvious on
// inspection that no code path depends on it.
try {
  localStorage.removeItem(LEGACY_MOCK_TOKEN_KEY)
} catch {
  // Storage can be unavailable (private mode) - nothing to clean up then.
}

let accessToken = null
// Bumped on every clear. A refresh that started under an earlier session compares
// its generation and discards its token instead of restoring a logged-out session.
let sessionGeneration = 0

export const storage = {
  getGeneration() {
    return sessionGeneration
  },

  getToken() {
    return accessToken
  },

  setToken(token) {
    accessToken = token || null
  },

  getUser() {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY))
    } catch {
      return null
    }
  },

  setUser(user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user))
  },

  clear() {
    sessionGeneration += 1
    accessToken = null
    localStorage.removeItem(USER_KEY)
  },

  // Set once when the session ends unexpectedly. The login page reads and
  // clears it to show a single message.
  markSessionExpired() {
    try {
      sessionStorage.setItem(SESSION_EXPIRED_KEY, '1')
    } catch {
      // Storage can be unavailable (private mode). The login page still works.
    }
  },

  consumeSessionExpired() {
    try {
      const flagged = sessionStorage.getItem(SESSION_EXPIRED_KEY) === '1'
      sessionStorage.removeItem(SESSION_EXPIRED_KEY)
      return flagged
    } catch {
      return false
    }
  },
}
