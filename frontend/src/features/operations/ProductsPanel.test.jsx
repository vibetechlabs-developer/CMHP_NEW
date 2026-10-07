// Product-first formula navigation: the row action opens the right product,
// Back keeps the list state, and the action appears only with formulas.view.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ProductsPanel from './ProductsPanel'
import usePermissions from '../../hooks/usePermissions'
import { listProducts } from './productsService'

let granted = new Set()

vi.mock('../../hooks/usePermissions', () => ({
  default: () => ({
    loading: false,
    error: null,
    realCompanyId: 2,
    hasPermission: (code) => granted.has(code),
  }),
}))
vi.mock('./productsService', () => ({
  listProducts: vi.fn(),
  deleteProduct: vi.fn(),
  getProduct: vi.fn(),
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  activateProduct: vi.fn(),
  deactivateProduct: vi.fn(),
}))
vi.mock('../formulas/FormulasPage', () => ({
  default: ({ productId, lockedProduct }) => (
    <div>formulas-stub product {String(productId)} locked {lockedProduct?.label}</div>
  ),
}))
vi.mock('./ImportProductsModal', () => ({ default: () => null }))

const PRODUCT = {
  id: 7,
  code: 'P-7',
  name: 'Demo Product',
  product_type: 'Liquid',
  sales_uom_code: 'BTL',
  sales_uom_is_active: true,
  is_active: true,
  version: 1,
}

beforeEach(() => {
  granted = new Set(['products.view', 'formulas.view'])
  listProducts.mockResolvedValue({ count: 1, results: [PRODUCT] })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('product row Formulas action', () => {
  it('opens the formulas tab for the clicked product', async () => {
    render(<ProductsPanel />)
    const action = await screen.findByText('Formulas')
    fireEvent.click(action)
    expect(await screen.findByText(/formulas-stub product 7/)).toBeTruthy()
    expect(screen.getByText(/locked P-7 · Demo Product/)).toBeTruthy()
  })

  it('is hidden without formulas.view', async () => {
    granted = new Set(['products.view'])
    render(<ProductsPanel />)
    await screen.findByText('Demo Product')
    expect(screen.queryByText('Formulas')).toBeNull()
  })

  it('Back returns to the list and keeps the search text', async () => {
    render(<ProductsPanel />)
    const search = await screen.findByPlaceholderText('Search by code or name…')
    fireEvent.change(search, { target: { value: 'demo' } })

    fireEvent.click(await screen.findByText('Formulas'))
    fireEvent.click(await screen.findByText('← Back to products'))

    await waitFor(() => expect(screen.getByPlaceholderText('Search by code or name…')).toBeTruthy())
    expect(screen.getByPlaceholderText('Search by code or name…').value).toBe('demo')
    expect(screen.getByText('Demo Product')).toBeTruthy()
  })
})
