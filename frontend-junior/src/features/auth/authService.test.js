// Proves loginRequest() is real: it posts the given credentials to the
// real backend endpoint and returns the server's own access token -
// never a lookup against the mock `erp.users` Redux array (no
// plaintext-password check, no fabricated `mock-token-...` string).
// Synthetic data only; no live credential involved.
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn() },
  plainApi: { get: vi.fn() },
}))
vi.mock('../../api/csrf', () => ({
  ensureCsrfCookie: vi.fn(async () => {}),
  getCsrfTokenFromCookie: vi.fn(() => null),
}))
vi.mock('../../store/store', () => ({
  store: { getState: () => ({ erp: { users: [] } }) },
}))

import api from '../../api/axios'
import { ensureCsrfCookie } from '../../api/csrf'
import { loginRequest } from './authService'

beforeEach(() => {
  vi.clearAllMocks()
  // No real company/superuser bridge calls needed for this assertion -
  // let them fail harmlessly, same as a real 401/403 would.
  api.get.mockRejectedValue(new Error('not relevant to this test'))
})

describe('loginRequest - no mock credential/token path', () => {
  it('posts the given username/password to the real login endpoint, never checking a local array', async () => {
    api.post.mockResolvedValue({
      data: {
        access: 'eyJhbGciOiJIUzI1NiJ9.synthetic-real-jwt-shape',
        user: { id: 42, username: 'synthetic_user', first_name: 'Syn', last_name: 'Thetic', email: 'synthetic@example.test' },
      },
    })

    const result = await loginRequest('synthetic_user', 's3cret-not-real')

    expect(ensureCsrfCookie).toHaveBeenCalled()
    expect(api.post).toHaveBeenCalledWith('/v1/auth/login/', {
      username: 'synthetic_user',
      password: 's3cret-not-real',
    })
    // The returned token is EXACTLY the server's own access token - never
    // a client-fabricated `mock-token-${id}-${Date.now()}` string.
    expect(result.token).toBe('eyJhbGciOiJIUzI1NiJ9.synthetic-real-jwt-shape')
    expect(result.token).not.toMatch(/^mock-token-/)
    expect(result.user.id).toBe(42)
    expect(result.user.username).toBe('synthetic_user')
  })

  it('propagates a real credential rejection from the server instead of checking anything locally', async () => {
    const serverError = { response: { status: 401, data: { detail: 'No active account found with the given credentials' } } }
    api.post.mockRejectedValue(serverError)

    await expect(loginRequest('synthetic_user', 'wrong-password')).rejects.toBe(serverError)
    expect(api.post).toHaveBeenCalledWith('/v1/auth/login/', {
      username: 'synthetic_user',
      password: 'wrong-password',
    })
  })

  it('grants can_access_common_inventory from a real GET /v1/stores/mine/ membership, not a mock label', async () => {
    api.post.mockResolvedValue({
      data: {
        access: 'eyJhbGciOiJIUzI1NiJ9.synthetic-real-jwt-shape',
        user: { id: 43, username: 'synthetic_store_user', first_name: 'Syn', last_name: 'Thetic', email: 'synthetic@example.test' },
      },
    })
    api.get.mockImplementation((url) => {
      if (url === '/v1/stores/mine/') {
        return Promise.resolve({ data: { stores: [{ id: 5, code: 'DEMOWH', name: 'Demo Shared Warehouse' }] } })
      }
      return Promise.reject(new Error('not relevant to this test'))
    })

    const result = await loginRequest('synthetic_store_user', 's3cret-not-real')

    expect(api.get).toHaveBeenCalledWith('/v1/stores/mine/', expect.objectContaining({
      headers: { Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.synthetic-real-jwt-shape' },
    }))
    expect(result.user.profile.can_access_common_inventory).toBe(true)
  })

  it('does not grant can_access_common_inventory when GET /v1/stores/mine/ returns no stores', async () => {
    api.post.mockResolvedValue({
      data: {
        access: 'eyJhbGciOiJIUzI1NiJ9.synthetic-real-jwt-shape',
        user: { id: 44, username: 'synthetic_no_store_user', first_name: 'Syn', last_name: 'Thetic', email: 'synthetic@example.test' },
      },
    })
    api.get.mockImplementation((url) => {
      if (url === '/v1/stores/mine/') {
        return Promise.resolve({ data: { stores: [] } })
      }
      return Promise.reject(new Error('not relevant to this test'))
    })

    const result = await loginRequest('synthetic_no_store_user', 's3cret-not-real')

    expect(result.user.profile.can_access_common_inventory).toBe(false)
  })
})
