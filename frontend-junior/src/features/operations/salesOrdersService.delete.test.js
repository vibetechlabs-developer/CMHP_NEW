// The DELETE request the Orders screen sends must match the backend contract:
// DELETE /v1/companies/<company>/sales-orders/<order>/ with expected_version as a
// query parameter and no body. Synthetic ids only.
import { beforeEach, describe, expect, it, vi } from 'vitest'

import api from '../../api/axios'
import { deleteSalesOrder } from './salesOrdersService'

vi.mock('../../api/axios', () => ({ default: { delete: vi.fn(async () => ({ status: 204 })) } }))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('deleteSalesOrder request contract', () => {
  it('sends DELETE to the order URL with expected_version as a query parameter and no body', async () => {
    await deleteSalesOrder(2, 7, 3)
    expect(api.delete).toHaveBeenCalledTimes(1)
    const [url, config] = api.delete.mock.calls[0]
    expect(url).toBe('/v1/companies/2/sales-orders/7/')
    expect(config).toEqual({ params: { expected_version: 3 } })
    expect(config.data).toBeUndefined()
  })
})
