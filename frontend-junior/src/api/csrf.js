// The real backend protects its three cookie/credential-based auth
// endpoints (login/refresh/logout) with Django's standard CSRF check
// (see backend/apps/authentication/csrf.py) - every other endpoint
// authenticates via a Bearer access token instead and never checks CSRF.
// Django's own `csrftoken` cookie is readable from JS by default
// (CSRF_COOKIE_HTTPONLY is not set), so no extra backend endpoint is
// strictly required to read it - but the bootstrap call below is still
// the simplest way to make sure the cookie actually EXISTS before the
// first login attempt (a client with no prior cookie has nothing to read).
//
// Ported verbatim from frontend/src/api/csrf.js (the real, tested
// frontend) as part of replacing frontend-junior's mock auth.

const CSRF_COOKIE_NAME = 'csrftoken'

export function getCsrfTokenFromCookie() {
  const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE_NAME}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

let csrfBootstrapPromise = null

// Memoized per page load - once the cookie exists, every later call is a
// no-op. Takes a plain axios instance (not the shared `api` client) so
// this never recurses through the request/response interceptors below.
export function ensureCsrfCookie(plainAxios) {
  if (getCsrfTokenFromCookie()) {
    return Promise.resolve()
  }
  if (!csrfBootstrapPromise) {
    csrfBootstrapPromise = plainAxios
      .get('/v1/auth/csrf/')
      .catch(() => {
        // A failed bootstrap just means the next CSRF-protected call will
        // be rejected by the server with its own clear error - retry on
        // the next attempt rather than caching a permanent failure.
        csrfBootstrapPromise = null
      })
  }
  return csrfBootstrapPromise
}
