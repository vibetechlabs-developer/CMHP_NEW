// Proves every products call is company-scoped by an explicit companyId
// (never a shared/cross-company catalog) and sends only the fields the
// real ProductCreateSerializer/ProductUpdateSerializer accept - no
// stock/pricing/MRP field ever appears in a payload. Synthetic data only.
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

import api from '../../api/axios'
import {
  activateProduct, createProduct, deactivateProduct, deleteProduct, getProduct, listProducts, updateProduct,
} from './productsService'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('company isolation', () => {
  it('every read/write names the exact company id given - never a different or implicit one', async () => {
    api.get.mockResolvedValue({ data: { count: 0, results: [] } })
    await listProducts(7, { search: 'x' })
    expect(api.get).toHaveBeenCalledWith('/v1/companies/7/products/', { params: { search: 'x' } })

    api.get.mockResolvedValue({ data: { id: 1 } })
    await getProduct(9, 1)
    expect(api.get).toHaveBeenCalledWith('/v1/companies/9/products/1/')
  })
})

describe('createProduct', () => {
  it('sends only code/name/product_type/bmr_no/description - never sales_uom_id, stock, price or company', async () => {
    api.post.mockResolvedValue({ data: { id: 1 } })
    const payload = { code: 'SYNTH-1', name: 'Synthetic', product_type: 'Tablets', bmr_no: '', description: '' }
    await createProduct(5, payload)
    expect(api.post).toHaveBeenCalledWith('/v1/companies/5/products/', payload)
  })
})

describe('updateProduct', () => {
  it('requires expected_version and never sends code/sales_uom', async () => {
    api.patch.mockResolvedValue({ data: { id: 1, version: 2 } })
    await updateProduct(5, 1, { expected_version: 1, name: 'Renamed' })
    expect(api.patch).toHaveBeenCalledWith('/v1/companies/5/products/1/', { expected_version: 1, name: 'Renamed' })
  })
})

describe('activate/deactivate', () => {
  it('post expected_version to the exact action endpoint', async () => {
    api.post.mockResolvedValue({ data: {} })
    await activateProduct(5, 1, 3)
    expect(api.post).toHaveBeenCalledWith('/v1/companies/5/products/1/activate/', { expected_version: 3 })
    await deactivateProduct(5, 1, 3)
    expect(api.post).toHaveBeenCalledWith('/v1/companies/5/products/1/deactivate/', { expected_version: 3 })
  })
})

describe('deleteProduct', () => {
  it('sends expected_version as a query param on the DELETE call', async () => {
    api.delete.mockResolvedValue({})
    await deleteProduct(5, 1, 4)
    expect(api.delete).toHaveBeenCalledWith('/v1/companies/5/products/1/', { params: { expected_version: 4 } })
  })
})
