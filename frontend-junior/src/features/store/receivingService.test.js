// Proves the Inward workflow calls the real goods-receipt endpoints with
// correct payloads - draft create, draft update (full-replace lines,
// expected_version), and explicit post. Synthetic data only.
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}))

import api from '../../api/axios'
import { createGoodsReceipt, listEligiblePurchaseOrders, postGoodsReceipt, updateGoodsReceipt } from './receivingService'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listEligiblePurchaseOrders', () => {
  it('hits the store-scoped eligible-purchase-orders endpoint', async () => {
    api.get.mockResolvedValue({ data: { results: [] } })
    await listEligiblePurchaseOrders(3, { pageSize: 50 })
    expect(api.get).toHaveBeenCalledWith('/v1/stores/3/goods-receipts/eligible-purchase-orders/', { params: { page_size: 50 } })
  })
})

describe('createGoodsReceipt (PO-based draft)', () => {
  it('posts source_purchase_order_id and lines, with an idempotency key', async () => {
    api.post.mockResolvedValue({ data: { id: 1, status: 'DRAFT', version: 1 } })
    const payload = {
      arrived_at: '2026-04-01T10:00:00.000Z',
      supplier_invoice_reference: 'INV-1',
      delivery_note_reference: '',
      notes: '',
      source_purchase_order_id: 7,
      idempotency_key: 'k-1',
      lines: [{ source_po_line_id: 11, received_quantity: '5', lot_reference: '', container_type_id: null, container_quantity: null }],
    }
    const result = await createGoodsReceipt(3, payload)
    expect(api.post).toHaveBeenCalledWith('/v1/stores/3/goods-receipts/', payload)
    expect(result).toEqual({ id: 1, status: 'DRAFT', version: 1 })
  })
})

describe('updateGoodsReceipt', () => {
  it('patches with expected_version and the full-replace lines list', async () => {
    api.patch.mockResolvedValue({ data: { id: 1, status: 'DRAFT', version: 2 } })
    const payload = { arrived_at: '2026-04-01T10:00:00.000Z', lines: [], expected_version: 1 }
    await updateGoodsReceipt(3, 1, payload)
    expect(api.patch).toHaveBeenCalledWith('/v1/stores/3/goods-receipts/1/', payload)
  })
})

describe('postGoodsReceipt', () => {
  it('posts expected_version to the post action endpoint - never a different payload shape', async () => {
    api.post.mockResolvedValue({ data: { id: 1, status: 'POSTED', version: 2 } })
    await postGoodsReceipt(3, 1, 1)
    expect(api.post).toHaveBeenCalledWith('/v1/stores/3/goods-receipts/1/post/', { expected_version: 1 })
  })
})
