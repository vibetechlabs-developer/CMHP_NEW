import { clearPermissionsCache } from '../utils/permissionsService'
import {
  useEffect,
  useState,
  useCallback,
  useMemo,
} from 'react'

import { restoreSession } from '../api/axios'
import { fetchCurrentCapabilities } from '../features/auth/authService'

import {
  AuthContext,
} from './AuthContext'

import {
  loginRequest,
  logoutRequest,
} from '../features/auth/authService'

import {
  storage,
} from '../utils/storage'

import {
  clearSelectedWorkspace,
} from '../utils/workspace'

// Ported from frontend/src/context/AuthProvider.jsx as part of replacing
// frontend-junior's mock auth. Same public interface frontend-junior's
// own AuthContext consumers already expect (user/token/isAuthenticated/
// login/logout/updateCurrentUser) - the only behavioural addition is the
// `ready` gate below, which restores a real session from the HttpOnly
// refresh cookie on page reload instead of trusting a remembered token
// (the real access token is never persisted at all - see utils/storage.js).

export function AuthProvider({
  children,
}) {

  const [
    token,
    setToken,
  ] = useState(
    () =>
      storage.getToken()
  )


  const [
    user,
    setUser,
  ] = useState(
    () =>
      storage.getUser()
  )

  // A remembered user with no in-memory token means the page was reloaded.
  // Restore the session from the refresh cookie before rendering anything
  // that makes protected requests.
  const [ready, setReady] = useState(
    () => !(storage.getUser() && !storage.getToken())
  )

  useEffect(() => {
    if (ready) return
    let cancelled = false
    restoreSession()
      .then(async (access) => {
        if (cancelled) return
        setToken(access)
        // Refresh the capability hints from the server; a stale stored value is never kept.
        try {
          const capabilities = await fetchCurrentCapabilities()
          const stored = storage.getUser()
          if (!cancelled && stored) {
            const next = { ...stored, capabilities }
            storage.setUser(next)
            setUser(next)
          }
        } catch {
          // Without fresh hints the UI stays read-only; the server still decides every write.
        }
        if (!cancelled) setReady(true)
      })
      .catch(() => {
        if (cancelled) return
        storage.clear()
        storage.markSessionExpired()
        clearPermissionsCache()
        setToken(null)
        setUser(null)
        setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [ready])


  /* =======================================================
     LOGIN
     ======================================================= */

  const login =
    useCallback(
      async (
        username,
        password
      ) => {

        clearSelectedWorkspace()


        const data =
          await loginRequest(
            username,
            password
          )


        storage.setToken(
          data.token
        )


        storage.setUser(
          data.user
        )


        setToken(
          data.token
        )


        setUser(
          data.user
        )

      },
      []
    )


  /* =======================================================
     UPDATE CURRENT USER
     ======================================================= */

  const updateCurrentUser =
    useCallback(
      (updatedUser) => {

        storage.setUser(
          updatedUser
        )

        setUser(
          updatedUser
        )

      },
      []
    )


  /* =======================================================
     LOGOUT
     ======================================================= */

  const logout =
    useCallback(
      async () => {

        try {

          await logoutRequest()

        } catch {
          // Continue local logout.
        }


        clearSelectedWorkspace()

        // Drop cached company permissions so the next sign-in never inherits them.
        clearPermissionsCache()

        storage.clear()

        setToken(null)

        setUser(null)

      },
      []
    )


  const value =
    useMemo(
      () => ({

        user,

        token,

        isAuthenticated:
          Boolean(token),

        login,

        logout,

        updateCurrentUser,

      }),
      [
        user,
        token,
        login,
        logout,
        updateCurrentUser,
      ]
    )


  return (

    <AuthContext.Provider
      value={value}
    >

      {ready ? children : <p className="session-restoring">Restoring your session…</p>}

    </AuthContext.Provider>

  )

}
