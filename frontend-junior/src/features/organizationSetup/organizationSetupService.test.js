// Request-contract tests for the Organization Setup API layer. Every
// function here is a thin wrapper over a real, already-tested backend
// endpoint - these tests only verify the frontend sends the exact shape
// the backend expects (paginated catalog walking, COMPANY/STORE scope
// separation, full-replace permission payloads, and cache invalidation).
// Synthetic ids only, no network.
import { beforeEach, describe, expect, it, vi } from 'vitest'

import api from '../../api/axios'
import { clearPermissionsCache } from '../../utils/permissionsService'

vi.mock('../../api/axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
  },
}))
vi.mock('../../utils/permissionsService', () => ({ clearPermissionsCache: vi.fn() }))
vi.mock('../companies/usersApiService', () => ({
  listUsers: vi.fn(),
  listUserMemberships: vi.fn(),
  assignUserMembership: vi.fn(async () => ({ id: 1 })),
  deactivateUserMembership: vi.fn(async () => ({ id: 1 })),
  listUserRoleAssignments: vi.fn(),
  assignUserRole: vi.fn(async () => ({ id: 1 })),
  deactivateUserRole: vi.fn(async () => ({ id: 1 })),
}))

import {
  assignUserMembership,
  assignUserRole,
  deactivateUserMembership,
  deactivateUserRole,
  getConfirmationPolicy,
  listAllPermissions,
  replaceCompanyRolePermissions,
  replaceStoreRolePermissions,
  updateConfirmationPolicy,
} from './organizationSetupService'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listAllPermissions', () => {
  it('walks every page until next is null, never stopping at page 1', async () => {
    api.get
      .mockResolvedValueOnce({ data: { results: [{ code: 'A' }, { code: 'B' }], next: 'page2' } })
      .mockResolvedValueOnce({ data: { results: [{ code: 'C' }], next: null } })

    const all = await listAllPermissions('COMPANY')

    expect(all.map((p) => p.code)).toEqual(['A', 'B', 'C'])
    expect(api.get).toHaveBeenCalledTimes(2)
    expect(api.get.mock.calls[0][1].params).toMatchObject({ scope: 'COMPANY', page: 1, page_size: 100 })
    expect(api.get.mock.calls[1][1].params).toMatchObject({ scope: 'COMPANY', page: 2, page_size: 100 })
  })

  it('stops immediately on an empty first page rather than looping forever', async () => {
    api.get.mockResolvedValueOnce({ data: { results: [], next: null } })
    const all = await listAllPermissions('STORE')
    expect(all).toEqual([])
    expect(api.get).toHaveBeenCalledTimes(1)
  })

  it('keeps COMPANY and STORE scope requests completely separate', async () => {
    api.get.mockResolvedValue({ data: { results: [], next: null } })
    await listAllPermissions('COMPANY')
    await listAllPermissions('STORE')
    expect(api.get.mock.calls[0][1].params.scope).toBe('COMPANY')
    expect(api.get.mock.calls[1][1].params.scope).toBe('STORE')
  })
})

describe('full-replace permission payloads', () => {
  it('sends the complete permission_codes array for a company role, and invalidates the permission cache', async () => {
    api.put.mockResolvedValueOnce({ data: { role: {}, permission_codes: ['a.view', 'a.edit'] } })
    await replaceCompanyRolePermissions(5, 9, ['a.view', 'a.edit'])
    expect(api.put).toHaveBeenCalledWith('/v1/companies/5/roles/9/permissions/', { permission_codes: ['a.view', 'a.edit'] })
    expect(clearPermissionsCache).toHaveBeenCalledTimes(1)
  })

  it('sends the complete permission_codes array for a store role, on the store-scoped path', async () => {
    api.put.mockResolvedValueOnce({ data: { role: {}, permission_codes: [] } })
    await replaceStoreRolePermissions(5, 9, [])
    expect(api.put).toHaveBeenCalledWith('/v1/stores/5/roles/9/permissions/', { permission_codes: [] })
    expect(clearPermissionsCache).toHaveBeenCalledTimes(1)
  })
})

describe('confirmation policy updates', () => {
  it('sends expected_version plus only the fields actually provided, never every field', async () => {
    api.patch.mockResolvedValueOnce({ data: {} })
    await updateConfirmationPolicy(5, 0, { allow_self_confirmation: true })
    expect(api.patch).toHaveBeenCalledWith('/v1/companies/5/sales-order-confirmation-policy/', {
      expected_version: 0,
      allow_self_confirmation: true,
    })
  })

  it('reads the policy from the exact company-scoped path', async () => {
    api.get.mockResolvedValueOnce({ data: { status: 'NOT_CONFIGURED', version: 0 } })
    const result = await getConfirmationPolicy(5)
    expect(api.get).toHaveBeenCalledWith('/v1/companies/5/sales-order-confirmation-policy/')
    expect(result.status).toBe('NOT_CONFIGURED')
  })
})

describe('reused company membership/role-assignment mutations also clear the permission cache', () => {
  it('after assigning a company membership', async () => {
    await assignUserMembership(1, 2)
    expect(clearPermissionsCache).toHaveBeenCalledTimes(1)
  })

  it('after deactivating a company membership', async () => {
    await deactivateUserMembership(1, 2)
    expect(clearPermissionsCache).toHaveBeenCalledTimes(1)
  })

  it('after assigning a company role', async () => {
    await assignUserRole(1, 2, 3)
    expect(clearPermissionsCache).toHaveBeenCalledTimes(1)
  })

  it('after deactivating a company role assignment', async () => {
    await deactivateUserRole(1, 2, 3)
    expect(clearPermissionsCache).toHaveBeenCalledTimes(1)
  })
})
