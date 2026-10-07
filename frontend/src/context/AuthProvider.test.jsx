// Session lifecycle in AuthProvider. The HTTP layer and the auth service are
// mocked, so no request leaves the test and no credential is involved.
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthProvider } from './AuthProvider'
import useAuth from '../hooks/useAuth'
import { restoreSession } from '../api/axios'
import { clearPermissionsCache } from '../utils/permissionsService'
import { logoutRequest } from '../features/auth/authService'
import { storage } from '../utils/storage'

vi.mock('../api/axios', () => ({
  restoreSession: vi.fn(),
  default: {},
  plainApi: {},
}))
vi.mock('../utils/permissionsService', () => ({
  clearPermissionsCache: vi.fn(),
  fetchMyPermissions: vi.fn(),
}))
vi.mock('../features/auth/authService', () => ({
  loginRequest: vi.fn(),
  logoutRequest: vi.fn(async () => true),
}))

// A child that behaves like a protected screen: it makes a request as soon as
// it is rendered with an authenticated user.
function ProtectedProbe({ onProtectedFetch }) {
  const { isAuthenticated, logout } = useAuth()
  if (isAuthenticated) {
    // Rendering this child implies the session has been restored.
    onProtectedFetch()
  }
  return (
    <div>
      <p>{isAuthenticated ? 'signed-in' : 'signed-out'}</p>
      <button type="button" onClick={() => logout()}>
        Sign out
      </button>
    </div>
  )
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  storage.clear()
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

describe('session restoration on page load', () => {
  it('does not render protected content until the session is restored', async () => {
    storage.setUser({ username: 'tester' })
    const restore = deferred()
    restoreSession.mockReturnValue(restore.promise)
    const onProtectedFetch = vi.fn()

    render(
      <AuthProvider>
        <ProtectedProbe onProtectedFetch={onProtectedFetch} />
      </AuthProvider>
    )

    expect(screen.getByText('Restoring your session…')).toBeTruthy()
    expect(onProtectedFetch).not.toHaveBeenCalled()

    await act(async () => {
      restore.resolve('restored-access')
    })

    await waitFor(() => expect(screen.getByText('signed-in')).toBeTruthy())
    expect(onProtectedFetch).toHaveBeenCalled()
    expect(restoreSession).toHaveBeenCalledTimes(1)
  })

  it('returns to login once when restoration fails, without retrying', async () => {
    storage.setUser({ username: 'tester' })
    restoreSession.mockRejectedValue(new Error('no refresh cookie'))
    const onProtectedFetch = vi.fn()

    render(
      <AuthProvider>
        <ProtectedProbe onProtectedFetch={onProtectedFetch} />
      </AuthProvider>
    )

    await waitFor(() => expect(screen.getByText('signed-out')).toBeTruthy())
    // Give any accidental retry loop time to show up.
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(restoreSession).toHaveBeenCalledTimes(1)
    expect(onProtectedFetch).not.toHaveBeenCalled()
    expect(storage.getUser()).toBeNull()
    expect(storage.consumeSessionExpired()).toBe(true)
  })

  it('renders signed-out immediately when no session was remembered', async () => {
    render(
      <AuthProvider>
        <ProtectedProbe onProtectedFetch={vi.fn()} />
      </AuthProvider>
    )
    expect(screen.getByText('signed-out')).toBeTruthy()
    expect(restoreSession).not.toHaveBeenCalled()
  })
})

describe('logout', () => {
  it('clears user data and the permission cache', async () => {
    storage.setUser({ username: 'tester' })
    restoreSession.mockResolvedValue('restored-access')

    render(
      <AuthProvider>
        <ProtectedProbe onProtectedFetch={vi.fn()} />
      </AuthProvider>
    )
    await waitFor(() => expect(screen.getByText('signed-in')).toBeTruthy())

    await act(async () => {
      screen.getByText('Sign out').click()
    })

    await waitFor(() => expect(screen.getByText('signed-out')).toBeTruthy())
    expect(logoutRequest).toHaveBeenCalledTimes(1)
    expect(storage.getUser()).toBeNull()
    expect(storage.getToken()).toBeNull()
    expect(clearPermissionsCache).toHaveBeenCalled()
  })
})
