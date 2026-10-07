// The accessible-store call must read the server's real response shape
// ({ stores: [...] }), not only a bare array. Synthetic data only.
import { describe, expect, it, vi } from 'vitest'

import api from '../../api/axios'
import { getMyStores } from './storeService'

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn(async () => ({ data: { stores: [{ id: 5, code: 'SYNWH1', name: 'Synthetic store' }] } })) },
}))

describe('getMyStores', () => {
  it('returns the stores from the server wrapper', async () => {
    const stores = await getMyStores()
    expect(api.get).toHaveBeenCalledWith('/v1/stores/mine/')
    expect(stores).toEqual([{ id: 5, code: 'SYNWH1', name: 'Synthetic store' }])
  })
})
