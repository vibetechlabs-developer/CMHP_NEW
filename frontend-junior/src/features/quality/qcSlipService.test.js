import { expect, it, vi } from 'vitest'
import api from '../../api/axios'
import { qcSlipService } from './qcSlipService'

vi.mock('../../api/axios', () => ({ default: { get: vi.fn() } }))

it('loads only the completed-production order feed and keeps each slip status', async () => {
  api.get
    .mockResolvedValueOnce({ data: {
      results: [{ id: 8, reference: 'SO-8', production: { production_status: 'Completed' }, production_batch_no: 'B-8', lines: [{ product_name: 'Drops A' }] }],
      next: '?page=2',
    } })
    .mockResolvedValueOnce({ data: {
      results: [{ id: 9, reference: 'SO-9', production: { production_status: 'Completed' }, batch_number: 'GENERATED-9', lines: [] }],
      next: null,
    } })
  api.get.mockResolvedValueOnce({ data: [{ order_id: '8', status: 'COMPLETED' }] })

  const orders = await qcSlipService.getOrdersForQc(2, 'bulk_release')

  expect(api.get.mock.calls.slice(0, 2)).toEqual([
    ['/v1/companies/2/sales-orders/', { params: { page: 1, page_size: 50, production_completed: true } }],
    ['/v1/companies/2/sales-orders/', { params: { page: 2, page_size: 50, production_completed: true } }],
  ])
  expect(orders).toEqual([
    expect.objectContaining({ orderNumber: 'SO-8', batchNo: 'B-8', qcStatus: 'COMPLETED' }),
    expect.objectContaining({ orderNumber: 'SO-9', batchNo: '', qcStatus: 'PENDING' }),
  ])
})

it('recovers from HTTP 500 using persisted sales orders and production statuses', async () => {
  api.get
    .mockRejectedValueOnce({ response: { status: 500 } })
    .mockResolvedValueOnce({ data: [
      { order_id: '8', production_status: 'Completed', batch_no: 'B-8' },
      { order_id: '9', production_status: 'In Process' },
      { order_id: 'demo', production_status: 'Completed' },
    ] })
    .mockResolvedValueOnce({ data: { results: [
      { id: 8, reference: 'SO-8' },
      { id: 9, reference: 'SO-9' },
    ] } })
    .mockResolvedValueOnce({ data: [] })

  const orders = await qcSlipService.getOrdersForQc(2, 'test_request')
  expect(orders).toEqual([expect.objectContaining({ id: 8, batchNo: 'B-8' })])
})
