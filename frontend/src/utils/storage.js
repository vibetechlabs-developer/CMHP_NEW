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

const USER_KEY = 'user'
const SESSION_EXPIRED_KEY = 'erp.sessionExpired'

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
