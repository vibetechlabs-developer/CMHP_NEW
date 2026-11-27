import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { listBatchPlans } from '../manufacturing/batchPlansService'
import { productionService } from './productionService'
import BmrForm from './BmrForm'

vi.mock('react-redux', () => ({ useSelector: () => 'cmhp' }))
vi.mock('../manufacturing/batchPlansService', () => ({ listBatchPlans: vi.fn() }))
vi.mock('./productionService', () => ({
  productionService: { getOrderById: vi.fn(), getBmr: vi.fn(), getOrders: vi.fn() },
}))

afterEach(cleanup)

it('uses the official number for the order line even if the saved BMR header is stale', async () => {
  productionService.getOrderById.mockResolvedValue({
    id: 41, company_id: 2, number: 'SO-41', product_id: 32, product_name: 'Test01', dosage_form: 'Drops',
  })
  listBatchPlans.mockResolvedValue({ results: [{ id: 9, official_batch_number: 'TEST-009' }] })
  productionService.getBmr.mockResolvedValue({ header: { batch_no: 'OLD-REF' } })

  render(
    <MemoryRouter initialEntries={['/production/bmr?orderId=41&orderLineId=17&productId=32&productType=Drops']}>
      <BmrForm />
    </MemoryRouter>
  )

  const fields = await screen.findAllByDisplayValue('TEST-009')
  expect(fields.filter((field) => field.classList.contains('bmr-grid-input')).every((field) => field.readOnly)).toBe(true)
  expect(screen.getByText(/Batch: TEST-009/)).toBeTruthy()
  expect(listBatchPlans).toHaveBeenCalledWith(2, { order: '41', order_line: '17', product: 32, page_size: 2 })
  expect(productionService.getBmr).toHaveBeenCalledWith(41, 'TEST-009', 'drops')
})
