import axios from 'axios'
import { storage } from '../utils/storage'
import { getCsrfTokenFromCookie } from './csrf'

// Ported from frontend/src/api/axios.js as part of replacing
// frontend-junior's mock auth (the previous version here used a fake
// `Token ${token}` scheme and was never actually imported by any other
// file in the app - login went straight to the mock Redux `erp.users`
// slice instead). This is the same tested client the real frontend uses
// against the same backend.

const BASE_URL = import.meta.env.VITE_API_URL || '/api'

// A separate, interceptor-free instance for the refresh call itself -
// using the main `api` instance here would recurse back into the
// response interceptor below on a failed refresh.
export const plainApi = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
})

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  // Required so the backend's HttpOnly refresh cookie (scoped to
  // /api/v1/auth/) is actually sent on refresh/logout, and so the
  // csrftoken cookie set by GET /api/v1/auth/csrf/ round-trips at all.
  withCredentials: true,
})

// Attach the real access token (JWT Bearer, not the mock "Token" scheme)
// and, when a CSRF cookie already exists, the matching header. Sending
// the header on every request is harmless - only the three cookie-based
// auth endpoints (login/refresh/logout) ever check it; every Bearer-
// authenticated endpoint ignores it entirely (see backend/apps/
// authentication/csrf.py - enforce_csrf() is called only from those
// three views).
function attachAuthHeaders(config) {
  const token = storage.getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  const csrfToken = getCsrfTokenFromCookie()
  if (csrfToken) {
    config.headers['X-CSRFToken'] = csrfToken
  }
  return config
}

api.interceptors.request.use(attachAuthHeaders)
plainApi.interceptors.request.use(attachAuthHeaders)

let refreshPromise = null
let sessionEnding = false

// One refresh call in flight at a time. Page-load restore and concurrent 401
// recovery both share it, so the refresh token is rotated exactly once.
function refreshAccessToken() {
  if (!refreshPromise) {
    const generation = storage.getGeneration()
    refreshPromise = plainApi
      .post('/v1/auth/refresh/')
      .then((res) => {
        // A logout (or a new sign-in) happened while this refresh was in flight.
        // Its token belongs to the old session and must not be stored.
        if (storage.getGeneration() !== generation) {
          throw new Error('Session changed during refresh.')
        }
        storage.setToken(res.data.access)
        return res.data.access
      })
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

// Used by AuthProvider on page load, before any protected request is made.
export function restoreSession() {
  return refreshAccessToken()
}

// The session has really ended. Runs once per page, and only when a user was
// signed in: late 401s from requests started before a logout must not show the
// expiry message or redirect again.
function endSession() {
  if (sessionEnding || !storage.getUser()) return
  sessionEnding = true
  storage.clear()
  storage.markSessionExpired()
  window.location.href = '/login'
}

// On a 401 from a Bearer endpoint, retry ONCE after a shared refresh. Login and
// refresh failures never refresh again. If the refresh fails, or the retried
// request is still 401, the session ends.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error
    const isAuthEndpoint = config?.url?.includes('/v1/auth/login/') || config?.url?.includes('/v1/auth/refresh/')

    if (response?.status !== 401 || isAuthEndpoint) {
      return Promise.reject(error)
    }

    if (config?._retriedAfterRefresh) {
      endSession()
      return Promise.reject(error)
    }

    config._retriedAfterRefresh = true
    try {
      const newAccess = await refreshAccessToken()
      config.headers.Authorization = `Bearer ${newAccess}`
      return api(config)
    } catch (refreshError) {
      endSession()
      return Promise.reject(refreshError)
    }
  }
)

export default api
