// Permissions are cached per user and company. A different user on the same
// company must make a fresh request and must not see the previous user's codes.
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { clearPermissionsCache, fetchMyPermissions } from './permissionsService'
import api from '../api/axios'

vi.mock('../api/axios', () => ({ default: { get: vi.fn() } }))
vi.mock('./companyScope', () => ({
  getRealScopedCompanyId: () => 2,
}))

beforeEach(() => {
  clearPermissionsCache()
  vi.clearAllMocks()
})

describe('permission cache', () => {
  it('does not reuse one user\'s permissions for another user on the same company', async () => {
    api.get
      .mockResolvedValueOnce({ data: { permissions: ['sales_orders.edit'] } })
      .mockResolvedValueOnce({ data: { permissions: ['batch_plans.view'] } })

    const adminView = await fetchMyPermissions({ id: 1, username: 'admin' })
    const managerView = await fetchMyPermissions({ id: 2, username: 'manager' })

    expect(api.get).toHaveBeenCalledTimes(2)
    expect([...adminView.permissions]).toEqual(['sales_orders.edit'])
    expect([...managerView.permissions]).toEqual(['batch_plans.view'])
  })

  it('reuses the cache for the same user and company', async () => {
    api.get.mockResolvedValueOnce({ data: { permissions: ['products.view'] } })

    await fetchMyPermissions({ id: 1, username: 'admin' })
    const again = await fetchMyPermissions({ id: 1, username: 'admin' })

    expect(api.get).toHaveBeenCalledTimes(1)
    expect([...again.permissions]).toEqual(['products.view'])
  })

  it('makes a fresh request after the cache is cleared on logout', async () => {
    api.get.mockResolvedValue({ data: { permissions: ['products.view'] } })
    await fetchMyPermissions({ id: 1, username: 'admin' })
    clearPermissionsCache()
    await fetchMyPermissions({ id: 1, username: 'admin' })
    expect(api.get).toHaveBeenCalledTimes(2)
  })
})
