import { describe, it, expect, vi, beforeEach } from 'vitest'
import api from '../../api/axios'
import {
  listPurchaseOrders,
  getPurchaseOrder,
  createPurchaseOrder,
  issuePurchaseOrder,
  cancelPurchaseOrder,
  listPurchaseRequests,
  submitPurchaseRequest,
  approvePurchaseRequest,
  listPurchasingSuppliers,
  listActiveMaterials,
} from './purchasingService'

vi.mock('../../api/axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}))

describe('purchasingService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lists purchase orders for a company', async () => {
    api.get.mockResolvedValueOnce({
      data: { count: 1, results: [{ id: 10, reference: 'PO-2026-001' }] },
    })
    const res = await listPurchaseOrders(2, { status: 'ISSUED', page: 1 })
    expect(api.get).toHaveBeenCalledWith('/v1/companies/2/purchase-orders/', {
      params: { page: 1, page_size: 20, status: 'ISSUED' },
    })
    expect(res.count).toBe(1)
    expect(res.results[0].reference).toBe('PO-2026-001')
  })

  it('gets a single purchase order', async () => {
    api.get.mockResolvedValueOnce({
      data: { id: 10, reference: 'PO-2026-001' },
    })
    const res = await getPurchaseOrder(2, 10)
    expect(api.get).toHaveBeenCalledWith('/v1/companies/2/purchase-orders/10/')
    expect(res.id).toBe(10)
  })

  it('issues a purchase order', async () => {
    api.post.mockResolvedValueOnce({
      data: { id: 10, status: 'ISSUED' },
    })
    const res = await issuePurchaseOrder(2, 10, 1)
    expect(api.post).toHaveBeenCalledWith('/v1/companies/2/purchase-orders/10/issue/', {
      expected_version: 1,
    })
    expect(res.status).toBe('ISSUED')
  })

  it('submits a purchase request', async () => {
    api.post.mockResolvedValueOnce({
      data: { id: 5, status: 'SUBMITTED' },
    })
    const res = await submitPurchaseRequest(2, 5, 1)
    expect(api.post).toHaveBeenCalledWith('/v1/companies/2/purchase-requests/5/submit/', {
      expected_version: 1,
    })
    expect(res.status).toBe('SUBMITTED')
  })

  it('approves a purchase request', async () => {
    api.post.mockResolvedValueOnce({
      data: { id: 5, status: 'APPROVED' },
    })
    const res = await approvePurchaseRequest(2, 5, 1, { notes: 'Approved' })
    expect(api.post).toHaveBeenCalledWith('/v1/companies/2/purchase-requests/5/approve/', {
      expected_version: 1,
      notes: 'Approved',
    })
    expect(res.status).toBe('APPROVED')
  })

  it('lists active suppliers for purchasing', async () => {
    api.get.mockResolvedValueOnce({
      data: [{ id: 1, code: 'SUP001', name: 'Acme Chemical' }],
    })
    const res = await listPurchasingSuppliers(2)
    expect(api.get).toHaveBeenCalledWith('/v1/companies/2/suppliers/')
    expect(res).toHaveLength(1)
    expect(res[0].code).toBe('SUP001')
  })

  it('lists active materials from catalog', async () => {
    api.get.mockResolvedValueOnce({
      data: { results: [{ id: 101, code: 'RM001', name: 'Paracetamol IP' }] },
    })
    const res = await listActiveMaterials()
    expect(api.get).toHaveBeenCalledWith('/v1/materials/?is_active=true&page_size=200')
    expect(res).toHaveLength(1)
    expect(res[0].code).toBe('RM001')
  })
})
