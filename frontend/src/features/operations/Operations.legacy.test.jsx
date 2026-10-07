// Legacy /operations page: the Quotations and Batches tabs are not connected to
// the server, so their add actions must be disabled or redirected and must
// never report a created record. Synthetic data only.
import { MemoryRouter } from 'react-router-dom'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import Operations from './Operations'

vi.mock('../../hooks/usePermissions', () => ({
  default: () => ({
    loading: false,
    error: null,
    realCompanyId: 2,
    hasPermission: () => true,
  }),
}))
vi.mock('./productsService', () => ({
  listProducts: vi.fn(async () => ({ count: 0, results: [] })),
  deleteProduct: vi.fn(),
  getProduct: vi.fn(),
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  activateProduct: vi.fn(),
  deactivateProduct: vi.fn(),
}))
vi.mock('./customersService', () => ({
  listCustomers: vi.fn(async () => ({ count: 0, results: [] })),
  getCustomer: vi.fn(),
  createCustomer: vi.fn(),
  updateCustomer: vi.fn(),
  deleteCustomer: vi.fn(),
}))
vi.mock('./salesOrdersService', () => ({
  listSalesOrders: vi.fn(async () => ({ count: 0, results: [] })),
}))
vi.mock('./ImportProductsModal', () => ({ default: () => null }))
vi.mock('./operationsService', () => {
  const empty = async () => ({ data: [] })
  return {
    operationsService: {
      getProducts: empty,
      getCustomers: empty,
      getQuotations: empty,
      getOrders: empty,
      getBatches: empty,
      getFormulas: empty,
      createQuotation: vi.fn(),
      createBatch: vi.fn(),
    },
  }
})
vi.mock('../inventory/inventoryService', () => {
  const empty = async () => ({ data: [] })
  return { inventoryService: { getCompanies: empty, getLots: empty } }
})

async function renderPage() {
  const view = render(
    <MemoryRouter>
      <Operations />
    </MemoryRouter>
  )
  // Let the page's initial loads settle inside the test.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  return view
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

describe('legacy /operations: Quotations tab', () => {
  it('disables the add action with a Not connected label and lists no quotation rows', async () => {
    const { container } = await renderPage()
    expect((await screen.findAllByText('Not connected yet')).length).toBeGreaterThan(0)
    const add = screen.getByRole('button', { name: '+ Add quotation' })
    expect(add.disabled).toBe(true)
    expect(screen.getByText(/Quotations are not saved to the server yet/)).toBeTruthy()
    const rows = container.querySelectorAll('tbody tr')
    expect(rows.length).toBe(0)
  })

  it('never shows a created-success message on this tab', async () => {
    await renderPage()
    await screen.findByRole('button', { name: '+ Add quotation' })
    expect(screen.queryByText(/created successfully/i)).toBeNull()
  })
})

describe('legacy /operations: Batches tab', () => {
  it('links to the order-based batch planning and disables the common-stock action', async () => {
    await renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /Batches/i }))
    const link = await screen.findByRole('link', { name: 'Plan batch from an order' })
    expect(link.getAttribute('href')).toBe('/orders')
    expect(screen.getByRole('button', { name: 'Consume common stock' }).disabled).toBe(true)
    expect(screen.queryByRole('button', { name: '+ Add batch' })).toBeNull()
  })

  it('never shows a created-success message on this tab', async () => {
    await renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /Batches/i }))
    await screen.findByRole('link', { name: 'Plan batch from an order' })
    expect(screen.queryByText(/production batch created successfully/i)).toBeNull()
  })
})
