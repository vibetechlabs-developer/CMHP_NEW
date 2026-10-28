// Isolated, mocked-contract tests for the real Products page: correct
// company-scoped requests, filter/page reload persistence (URL-encoded),
// and context switching (company change) without stale data leakage.
// Synthetic data only - no real HTTP request leaves this test.
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ProductsPage from './ProductsPage'
import { listProducts } from '../../products/productsService'

vi.mock('../../products/productsService', () => ({
  listProducts: vi.fn(),
  deleteProduct: vi.fn(),
}))
vi.mock('../../../hooks/useCompanyPermissions', () => ({
  default: () => ({ loading: false, hasPermission: () => true }),
}))

const selectedCompanyMock = vi.fn()
vi.mock('../../../hooks/useSelectedCompany', () => ({
  default: () => selectedCompanyMock(),
}))

function mockCompanyState(companyId, companies = [{ id: 3, code: 'CMHP', display_name: 'CMHP Pharma' }]) {
  selectedCompanyMock.mockReturnValue({
    companies, companiesReady: true, companiesError: '', companyId, setCompanyId: vi.fn(),
  })
}

function renderPage(initialPath = '/inventory/products') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <ProductsPage />
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockCompanyState(3)
  listProducts.mockResolvedValue({ count: 0, results: [] })
})

afterEach(() => {
  cleanup()
})

describe('company-scoped requests', () => {
  it('requests the exact selected company id', async () => {
    renderPage()
    await waitFor(() => expect(listProducts).toHaveBeenCalledWith(3, expect.objectContaining({ page: 1, pageSize: 10 })))
  })
})

describe('reload persistence via the URL', () => {
  it('requests the exact filters and page already encoded in the URL on first mount', async () => {
    renderPage('/inventory/products?search=para&status=true&page=2')
    await waitFor(() => expect(listProducts).toHaveBeenCalledWith(3, expect.objectContaining({ search: 'para', isActive: 'true', page: 2 })))
  })
})

describe('context switching without stale data leakage', () => {
  it('discards a slow in-flight response for the old company once the company changes', async () => {
    let resolveFirst
    listProducts.mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve }))
    const { rerender } = renderPage()
    await waitFor(() => expect(listProducts).toHaveBeenCalledTimes(1))

    mockCompanyState(4, [{ id: 3, code: 'CMHP' }, { id: 4, code: 'TEJ' }])
    listProducts.mockResolvedValueOnce({ count: 1, results: [{ id: 1, code: 'TEJ-1', name: 'Tej Product', is_active: true, sales_uom_code: 'KG' }] })
    rerender(
      <MemoryRouter initialEntries={['/inventory/products']}>
        <ProductsPage />
      </MemoryRouter>
    )
    await waitFor(() => expect(listProducts).toHaveBeenCalledTimes(2))

    await act(async () => {
      resolveFirst({ count: 1, results: [{ id: 2, code: 'STALE', name: 'Stale Product', is_active: true, sales_uom_code: 'KG' }] })
    })

    await waitFor(() => expect(screen.getByText('TEJ-1')).toBeTruthy())
    expect(screen.queryByText('STALE')).toBeNull()
  })
})

describe('QA Approval column rendering', () => {
  it('renders the QA Approval column header and status badges', async () => {
    listProducts.mockResolvedValueOnce({
      count: 2,
      results: [
        { id: 10, code: 'PRD-1', name: 'Product Approved', is_active: true, qa_approval_status: 'APPROVED' },
        { id: 11, code: 'PRD-2', name: 'Product Submitted', is_active: true, qa_approval_status: 'SUBMITTED' },
      ],
    })
    renderPage()
    await waitFor(() => expect(screen.getByText('PRD-1')).toBeTruthy())
    expect(screen.getByText('QA Approval')).toBeTruthy()
    expect(screen.getByText('✓ Approved')).toBeTruthy()
    expect(screen.getByText('⏳ Submitted')).toBeTruthy()
  })
})
