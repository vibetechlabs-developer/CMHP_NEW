// Products page with the REAL formula editor (no stubs): the list renders, the
// product opens, and its Formulas tab opens a formula and a draft revision.
// Synthetic data only.
import { MemoryRouter } from 'react-router-dom'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ProductsPanel from './ProductsPanel'
import { listProducts } from './productsService'
import { getFormula, getRevision, listFormulas, listRevisions } from '../formulas/formulasService'

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
vi.mock('../formulas/formulasService', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    listFormulas: vi.fn(),
    getFormula: vi.fn(),
    listRevisions: vi.fn(),
    getRevision: vi.fn(),
    getRequirementPreview: vi.fn(),
  }
})
vi.mock('../operations/unitsLookupService', () => ({ listPlanningUnits: vi.fn(async () => []) }))
vi.mock('./catalogLookupService', () => ({ searchProducts: vi.fn(async () => []) }))
vi.mock('./ImportProductsModal', () => ({ default: () => null }))

const PRODUCT = { id: 7, code: 'P-7', name: 'Demo Product', product_type: 'Liquid', sales_uom_code: 'BTL', is_active: true, version: 1 }

beforeEach(() => {
  listProducts.mockResolvedValue({ count: 1, results: [PRODUCT] })
  listFormulas.mockResolvedValue({ count: 1, results: [{ id: 1, code: 'F-1', name: 'Synthetic formula', product_code: 'P-7', product_name: 'Demo Product' }] })
  getFormula.mockResolvedValue({ id: 1, code: 'F-1', name: 'Synthetic formula', product_code: 'P-7', product_name: 'Demo Product' })
  listRevisions.mockResolvedValue([{ id: 3, revision_number: 1, status: 'DRAFT', base_output_quantity: '100.000', output_uom_code: 'DEMOKG' }])
  getRevision.mockResolvedValue({
    id: 3, revision_number: 1, status: 'DRAFT', version: 1, base_output_quantity: '100.000', output_uom_code: 'DEMOKG', approved_at: null,
    lines: [{ id: 11, material_id: 100, material_type: 'RAW_MATERIAL', material_code: 'RAW1', material_name: 'Synthetic raw A', unit_code: 'KG', quantity: '10.000', notes: '', label_claim: '', special_value: '', ar_no: '' }],
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Products page with the real formula editor', () => {
  it('shows the product list', async () => {
    render(<MemoryRouter><ProductsPanel /></MemoryRouter>)
    expect(await screen.findByText('Demo Product')).toBeTruthy()
  })

  it('opens the Formulas tab, a formula and a draft revision', async () => {
    render(<MemoryRouter><ProductsPanel /></MemoryRouter>)
    fireEvent.click(await screen.findByText('Formulas'))
    expect(await screen.findByText('F-1 — Synthetic formula')).toBeTruthy()
    fireEvent.change(document.getElementById('fm-formula-select'), { target: { value: '1' } })
    await screen.findByText('Revision 1 — Draft — 100.000 DEMOKG')
    fireEvent.change(document.getElementById('fm-revision-select'), { target: { value: '3' } })
    expect(await screen.findByText('Synthetic raw A')).toBeTruthy()
  })
})
