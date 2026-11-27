import { fireEvent, render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { listCompletedProductionOrders } from '../operations/salesOrdersService'
import QcList from './QcList'

vi.mock('react-redux', () => ({
  useSelector: (selector) => selector({
    erp: { activeCompanyId: 2, orders: [{ id: 'demo', number: 'DEMO-001', bmr_status: 'YES' }] },
  }),
}))
vi.mock('../operations/salesOrdersService', () => ({ listCompletedProductionOrders: vi.fn() }))

afterEach(cleanup)

it('shows the real completed order and passes it to the CoA editor', async () => {
  listCompletedProductionOrders.mockResolvedValueOnce([{
    id: 41,
    company_id: 2,
    reference: 'SO-41',
    customer_name: 'Test customer',
    production_batch_no: 'BATCH-41',
    production: { production_status: 'Completed', bmr_status: 'NO', dispatch_status: 'YES' },
    lines: [{ product_id: 10, product_name: 'Test drops', product_type_snapshot: 'Drops' }],
  }])
  const onSelectOrder = vi.fn()

  render(<MemoryRouter><QcList companyId={2} onSelectOrder={onSelectOrder} /></MemoryRouter>)

  expect(await screen.findByText('BATCH-41')).toBeTruthy()
  expect(screen.queryByText(/DEMO-001|ORD-2026-0004/)).toBeNull()
  expect(screen.getByText('Dispatched')).toBeTruthy()
  expect(screen.getByDisplayValue('Pending').disabled).toBe(true)
  expect(listCompletedProductionOrders).toHaveBeenCalledWith(2)
  fireEvent.click(screen.getByRole('button', { name: /View CoA/ }))
  expect(onSelectOrder).toHaveBeenCalledWith(expect.objectContaining({
    id: 41, number: 'SO-41', batch_no: 'BATCH-41', bmr_status: 'NO',
  }))
})

it('shows a retryable error instead of an empty register when loading fails', async () => {
  listCompletedProductionOrders
    .mockRejectedValueOnce(new Error('Unable to reach the server'))
    .mockResolvedValueOnce([])

  render(<MemoryRouter><QcList companyId={2} onSelectOrder={vi.fn()} /></MemoryRouter>)

  expect(await screen.findByText('Unable to load CoA orders')).toBeTruthy()
  expect(screen.queryByText('No QC Orders Found')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(await screen.findByText('No QC Orders Found')).toBeTruthy()
})
