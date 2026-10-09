// Request-contract tests for the Receiving service. Every function here is
// a thin wrapper over the existing, already-tested apps.receiving
// backend - these tests only verify the frontend sends the exact shape
// the backend expects. Synthetic ids only, no network.
import { beforeEach, describe, expect, it, vi } from 'vitest'

import api from '../../api/axios'
import {
  cancelGoodsReceipt,
  createGoodsReceipt,
  getGoodsReceipt,
  listEligiblePurchaseOrders,
  listGoodsReceipts,
  postGoodsReceipt,
  updateGoodsReceipt,
} from './receivingService'

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listGoodsReceipts', () => {
  it('sends the store-scoped path with status/page/page_size params', async () => {
    api.get.mockResolvedValueOnce({ data: { count: 0, results: [] } })
    await listGoodsReceipts(5, { status: 'DRAFT', page: 2, pageSize: 20 })
    expect(api.get).toHaveBeenCalledWith('/v1/stores/5/goods-receipts/', {
      params: { status: 'DRAFT', page: 2, page_size: 20 },
    })
  })

  it('omits status entirely when not provided, never sends an empty string filter', async () => {
    api.get.mockResolvedValueOnce({ data: { count: 0, results: [] } })
    await listGoodsReceipts(5, {})
    expect(api.get).toHaveBeenCalledWith('/v1/stores/5/goods-receipts/', { params: {} })
  })
})

describe('createGoodsReceipt', () => {
  it('posts the exact payload to the store-scoped create endpoint', async () => {
    api.post.mockResolvedValueOnce({ data: { id: 9 } })
    const payload = { source_purchase_order_id: 3, arrived_at: '2026-10-09T10:00:00Z', lines: [] }
    await createGoodsReceipt(5, payload)
    expect(api.post).toHaveBeenCalledWith('/v1/stores/5/goods-receipts/', payload)
  })
})

describe('updateGoodsReceipt', () => {
  it('patches with expected_version and whatever fields are given, on the receipt-scoped path', async () => {
    api.patch.mockResolvedValueOnce({ data: {} })
    await updateGoodsReceipt(5, 9, { expected_version: 1, notes: 'x' })
    expect(api.patch).toHaveBeenCalledWith('/v1/stores/5/goods-receipts/9/', { expected_version: 1, notes: 'x' })
  })
})

describe('postGoodsReceipt', () => {
  it('posts only expected_version to the post action path', async () => {
    api.post.mockResolvedValueOnce({ data: { status: 'POSTED' } })
    await postGoodsReceipt(5, 9, 2)
    expect(api.post).toHaveBeenCalledWith('/v1/stores/5/goods-receipts/9/post/', { expected_version: 2 })
  })
})

describe('cancelGoodsReceipt', () => {
  it('posts expected_version and cancellation_reason to the cancel action path', async () => {
    api.post.mockResolvedValueOnce({ data: { status: 'CANCELLED' } })
    await cancelGoodsReceipt(5, 9, 2, 'Wrong store')
    expect(api.post).toHaveBeenCalledWith('/v1/stores/5/goods-receipts/9/cancel/', {
      expected_version: 2,
      cancellation_reason: 'Wrong store',
    })
  })
})

describe('getGoodsReceipt / listEligiblePurchaseOrders', () => {
  it('reads one receipt from the exact store+receipt path', async () => {
    api.get.mockResolvedValueOnce({ data: { id: 9 } })
    await getGoodsReceipt(5, 9)
    expect(api.get).toHaveBeenCalledWith('/v1/stores/5/goods-receipts/9/')
  })

  it('reads eligible purchase orders from the store-scoped lookup path', async () => {
    api.get.mockResolvedValueOnce({ data: { count: 0, results: [] } })
    await listEligiblePurchaseOrders(5, { pageSize: 50 })
    expect(api.get).toHaveBeenCalledWith('/v1/stores/5/goods-receipts/eligible-purchase-orders/', {
      params: { page_size: 50 },
    })
  })
})
