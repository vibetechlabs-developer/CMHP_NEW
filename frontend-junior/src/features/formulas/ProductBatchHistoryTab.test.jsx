import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { confirmAction } from '../../components/ConfirmProvider'
import { allocateBatchNumber, listBatchPlans } from '../manufacturing/batchPlansService'
import ProductBatchHistoryTab from './ProductBatchHistoryTab'

vi.mock('../../components/ConfirmProvider', () => ({ confirmAction: vi.fn() }))
vi.mock('../manufacturing/batchPlansService', () => ({ allocateBatchNumber: vi.fn(), listBatchPlans: vi.fn() }))
vi.mock('../operations/operationsService', () => ({
  operationsService: { getOrders: vi.fn(async () => []) },
}))
vi.mock('../production/bmrDbService', () => ({
  bmrDbService: { getAllSavedBmrRecords: vi.fn(async () => []) },
}))

afterEach(() => { cleanup(); vi.resetAllMocks() })

it('shows both product batches when they arrive on different API pages', async () => {
  listBatchPlans
    .mockResolvedValueOnce({
      next: '?page=2',
      results: [{ id: 8, source_order_reference: 'ORDER-8', formula_revision_number: 1 }],
    })
    .mockResolvedValueOnce({
      next: null,
      results: [{ id: 12, official_batch_number: 'BATCH-12', formula_revision_number: 2 }],
    })

  render(
    <MemoryRouter>
      <ProductBatchHistoryTab companyId={2} productId="32" product={{ code: 'T01', name: 'Test01' }} />
    </MemoryRouter>
  )

  expect(await screen.findByText(/BATCH-12/, { selector: 'tbody span' })).toBeTruthy()
  expect(screen.getByText('Not allocated')).toBeTruthy()
  expect(screen.getByText('ORDER-8')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Allocate Number' })).toBeNull()
  expect(screen.getAllByRole('row')).toHaveLength(3)
  expect(listBatchPlans.mock.calls).toEqual([
    [2, { product: 32, page: 1, page_size: 100 }],
    [2, { product: 32, page: 2, page_size: 100 }],
  ])

  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'ORDER-8' } })
  expect(screen.getAllByRole('row')).toHaveLength(2)
  expect(screen.getByText('Not allocated')).toBeTruthy()
})

it('allocates an official number through the existing action and refreshes the row', async () => {
  const plan = { id: 9, version: 2, source_order_reference: 'ORDER-9' }
  listBatchPlans
    .mockResolvedValueOnce({ results: [plan] })
    .mockResolvedValueOnce({ results: [{ ...plan, official_batch_number: 'TEST-009' }] })
  confirmAction.mockResolvedValueOnce(true)
  allocateBatchNumber.mockResolvedValueOnce({ official_batch_number: 'TEST-009' })

  render(
    <MemoryRouter>
      <ProductBatchHistoryTab companyId={2} productId={32} canAllocateNumber />
    </MemoryRouter>
  )

  fireEvent.click(await screen.findByRole('button', { name: 'Allocate Number' }))
  expect(await screen.findByText('TEST-009', { selector: 'tbody span' })).toBeTruthy()
  expect(allocateBatchNumber).toHaveBeenCalledWith(2, 9, 2)
  expect(screen.queryByText('Not allocated')).toBeNull()
})
