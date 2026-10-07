// The /products route renders Operations in standalone products mode. Render that
// exact entry point (real components, network services mocked) to find the fault.
import { MemoryRouter } from 'react-router-dom'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import Operations from './Operations'
import { listProducts } from './productsService'

vi.mock('../../hooks/usePermissions', () => ({
  default: () => ({
    loading: false,
    error: null,
    realCompanyId: 2,
    hasPermission: () => true,
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
vi.mock('./ImportProductsModal', () => ({ default: () => null }))

beforeEach(() => {
  listProducts.mockResolvedValue({
    count: 1,
    results: [{ id: 7, code: 'P-7', name: 'Demo Product', product_type: 'Liquid', sales_uom_code: 'BTL', is_active: true, version: 1 }],
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('/products route (Operations, standalone products)', () => {
  it('renders the products list without failing', async () => {
    render(
      <MemoryRouter initialEntries={['/products']}>
        <Operations standaloneProducts />
      </MemoryRouter>
    )
    expect(await screen.findByText('Demo Product')).toBeTruthy()
  })
})
