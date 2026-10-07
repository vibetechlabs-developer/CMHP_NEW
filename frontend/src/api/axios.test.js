// Session behaviour of the shared HTTP client. A fake transport answers every
// request, so these tests make no network calls and use no real credentials.
import { AxiosError } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import api, { plainApi, restoreSession } from './axios'
import { storage } from '../utils/storage'

const FRESH = 'fresh-access-value'
const STALE = 'stale-access-value'

// Builds a transport that behaves like the backend: protected routes accept
// only the fresh token; refresh succeeds unless `refreshOk` is false.
function fakeTransport({ refreshOk = true } = {}) {
  const log = { refresh: 0, protected: 0, login: 0 }
  const respond = (config, status, data) => {
    const response = { data, status, statusText: String(status), headers: {}, config }
    if (status >= 400) {
      return Promise.reject(new AxiosError(`HTTP ${status}`, 'ERR_BAD_REQUEST', config, null, response))
    }
    return Promise.resolve(response)
  }
  const adapter = (config) => {
    const url = config.url || ''
    const auth = config.headers?.Authorization || ''
    if (url.includes('/v1/auth/refresh/')) {
      log.refresh += 1
      return refreshOk ? respond(config, 200, { access: FRESH }) : respond(config, 401, { detail: 'invalid' })
    }
    if (url.includes('/v1/auth/login/')) {
      log.login += 1
      return respond(config, 401, { detail: 'bad credentials' })
    }
    log.protected += 1
    return auth === `Bearer ${FRESH}` ? respond(config, 200, { ok: true }) : respond(config, 401, { detail: 'expired' })
  }
  api.defaults.adapter = adapter
  plainApi.defaults.adapter = adapter
  return log
}

function signIn() {
  storage.setUser({ username: 'tester' })
  storage.setToken(STALE)
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  storage.clear()
  vi.restoreAllMocks()
})

describe('token storage', () => {
  it('keeps the access token in memory, never in localStorage', () => {
    storage.setToken('secret-value')
    expect(storage.getToken()).toBe('secret-value')
    expect(JSON.stringify({ ...localStorage })).not.toContain('secret-value')
  })
})

describe('401 recovery', () => {
  it('shares one refresh across concurrent 401s and retries each request once', async () => {
    const log = fakeTransport()
    signIn()
    const results = await Promise.all([api.get('/v1/a/'), api.get('/v1/b/'), api.get('/v1/c/')])
    expect(results.map((r) => r.data.ok)).toEqual([true, true, true])
    expect(log.refresh).toBe(1)
    expect(storage.getToken()).toBe(FRESH)
  })

  it('never refreshes for a login 401', async () => {
    const log = fakeTransport()
    await expect(api.post('/v1/auth/login/', { username: 'x', password: 'y' })).rejects.toBeTruthy()
    expect(log.refresh).toBe(0)
    expect(log.login).toBe(1)
  })

  it('ends the session once with a message when refresh fails', async () => {
    const log = fakeTransport({ refreshOk: false })
    signIn()
    const requests = [api.get('/v1/a/'), api.get('/v1/b/')]
    await Promise.allSettled(requests)
    expect(log.refresh).toBe(1)
    expect(storage.getUser()).toBeNull()
    expect(storage.getToken()).toBeNull()
    expect(storage.consumeSessionExpired()).toBe(true)
    expect(storage.consumeSessionExpired()).toBe(false)
  })
})

describe('restoreSession on page load', () => {
  it('returns a fresh access token from the refresh cookie and stores it in memory', async () => {
    const log = fakeTransport()
    const access = await restoreSession()
    expect(access).toBe(FRESH)
    expect(storage.getToken()).toBe(FRESH)
    expect(log.refresh).toBe(1)
  })

  it('rejects when there is no valid refresh cookie', async () => {
    fakeTransport({ refreshOk: false })
    await expect(restoreSession()).rejects.toBeTruthy()
    expect(storage.getToken()).toBeNull()
  })

  it('does not start a second refresh while one is already in flight', async () => {
    const log = fakeTransport()
    await Promise.all([restoreSession(), restoreSession(), restoreSession()])
    expect(log.refresh).toBe(1)
  })
})

describe('late refresh after logout', () => {
  it('discards a refresh response that arrives after logout', async () => {
    const pendingRefresh = deferredResponse()
    plainApi.defaults.adapter = () => pendingRefresh.promise
    api.defaults.adapter = (config) => {
      const url = config.url || ''
      if (url.includes('/v1/auth/refresh/')) {
        return pendingRefresh.promise
      }
      // Every protected request is answered 401 so the refresh path runs.
      const response = { data: {}, status: 401, statusText: '401', headers: {}, config }
      return Promise.reject(new AxiosError('HTTP 401', 'ERR_BAD_REQUEST', config, null, response))
    }
    signIn()

    const request = api.get('/v1/protected/').catch(() => 'failed')
    // Wait until the refresh call is in flight.
    await new Promise((resolve) => setTimeout(resolve, 0))

    // The user signs out while the refresh is still pending.
    storage.clear()

    pendingRefresh.resolve({ data: { access: FRESH }, status: 200, statusText: 'OK', headers: {}, config: {} })
    await request

    expect(storage.getToken()).toBeNull()
  })
})

function deferredResponse() {
  let resolve
  const promise = new Promise((res) => {
    resolve = res
  })
  return { promise, resolve }
}
