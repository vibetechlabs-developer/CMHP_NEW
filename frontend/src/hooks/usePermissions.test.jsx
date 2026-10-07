// A slow response for a previous company must never overwrite the current one.
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import usePermissions from './usePermissions'
import { fetchMyPermissions } from '../utils/permissionsService'

let workspace = 'COMPANY_A'
// One stable user object, as the real auth context provides.
const SIGNED_IN_USER = { id: 7, username: 'tester' }

vi.mock('./useAuth', () => ({
  default: () => ({ user: SIGNED_IN_USER }),
}))
vi.mock('./useWorkspace', () => ({
  default: () => ({ activeWorkspace: workspace }),
}))
vi.mock('../utils/permissionsService', () => ({
  fetchMyPermissions: vi.fn(),
  clearPermissionsCache: vi.fn(),
}))

function deferred() {
  let resolve
  const promise = new Promise((res) => {
    resolve = res
  })
  return { promise, resolve }
}

beforeEach(() => {
  workspace = 'COMPANY_A'
  vi.clearAllMocks()
})

describe('company switching', () => {
  it('ignores a late response for the previous company', async () => {
    const companyA = deferred()
    const companyB = deferred()
    fetchMyPermissions.mockImplementationOnce(() => companyA.promise).mockImplementationOnce(() => companyB.promise)

    const { result, rerender } = renderHook(() => usePermissions())

    workspace = 'COMPANY_B'
    rerender()

    await act(async () => {
      companyB.resolve({ realCompanyId: 3, permissions: new Set(['batch_plans.view']) })
    })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.realCompanyId).toBe(3)

    // Company A's answer arrives last and must be discarded.
    await act(async () => {
      companyA.resolve({ realCompanyId: 2, permissions: new Set(['sales_orders.edit']) })
    })

    expect(result.current.realCompanyId).toBe(3)
    expect(result.current.hasPermission('batch_plans.view')).toBe(true)
    expect(result.current.hasPermission('sales_orders.edit')).toBe(false)
  })
})
