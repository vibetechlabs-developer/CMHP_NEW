// Proves the Materials integration calls the real backend endpoints with
// the right params - never a mock/local data source. Synthetic data only.
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn() },
}))

import api from '../../api/axios'
import {
  activateMaterial,
  createMaterial,
  deactivateMaterial,
  getMaterial,
  getMaterialReorderSetting,
  setMaterialReorderLevel,
  listContainerTypes,
  listMaterialCategories,
  listMaterials,
  listMaterialSuppliers,
  listUnits,
  updateMaterial,
} from './storeService'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listMaterials', () => {
  it('sends only the filters actually set, with page/page_size always present', async () => {
    api.get.mockResolvedValue({ data: { count: 2, results: [{ id: 1 }, { id: 2 }] } })

    const result = await listMaterials({ search: 'Paracetamol', kind: 'RAW_MATERIAL', page: 2, pageSize: 25 })

    expect(api.get).toHaveBeenCalledWith('/v1/materials/', {
      params: { page: 2, page_size: 25, search: 'Paracetamol', kind: 'RAW_MATERIAL' },
    })
    expect(result).toEqual({ count: 2, results: [{ id: 1 }, { id: 2 }] })
  })

  it('sends is_active only when explicitly set (never defaults to filtering active-only)', async () => {
    api.get.mockResolvedValue({ data: { count: 0, results: [] } })
    await listMaterials({ isActive: 'false' })
    expect(api.get).toHaveBeenCalledWith('/v1/materials/', { params: { page: 1, page_size: 20, is_active: 'false' } })
  })

  it('sends receipt_from/receipt_to as the real backend filter names, never a stock-status concept', async () => {
    api.get.mockResolvedValue({ data: { count: 0, results: [] } })
    await listMaterials({ receiptFrom: '2026-04-01', receiptTo: '2026-04-30' })
    expect(api.get).toHaveBeenCalledWith('/v1/materials/', {
      params: { page: 1, page_size: 20, receipt_from: '2026-04-01', receipt_to: '2026-04-30' },
    })
  })
})

describe('material reorder setting (store-scoped, never a Material field)', () => {
  it('getMaterialReorderSetting requests the store+material-scoped endpoint', async () => {
    api.get.mockResolvedValue({ data: { store_id: 3, material_id: 9, reorder_level: null } })
    const result = await getMaterialReorderSetting(3, 9)
    expect(api.get).toHaveBeenCalledWith('/v1/stores/3/materials/9/reorder-setting/')
    expect(result.reorder_level).toBeNull()
  })

  it('setMaterialReorderLevel PUTs only reorder_level to the same endpoint', async () => {
    api.put.mockResolvedValue({ data: { store_id: 3, material_id: 9, reorder_level: '25.500' } })
    const result = await setMaterialReorderLevel(3, 9, '25.5')
    expect(api.put).toHaveBeenCalledWith('/v1/stores/3/materials/9/reorder-setting/', { reorder_level: '25.5' })
    expect(result.reorder_level).toBe('25.500')
  })
})

describe('material catalog reference lookups', () => {
  it('listMaterialCategories hits /v1/material-categories/', async () => {
    api.get.mockResolvedValue({ data: { results: [] } })
    await listMaterialCategories()
    expect(api.get).toHaveBeenCalledWith('/v1/material-categories/', { params: { page_size: 100, is_active: true } })
  })

  it('listMaterialSuppliers hits /v1/materials/suppliers/', async () => {
    api.get.mockResolvedValue({ data: { results: [] } })
    await listMaterialSuppliers()
    expect(api.get).toHaveBeenCalledWith('/v1/materials/suppliers/')
  })

  it('listContainerTypes hits /v1/container-types/', async () => {
    api.get.mockResolvedValue({ data: { results: [] } })
    await listContainerTypes()
    expect(api.get).toHaveBeenCalledWith('/v1/container-types/', { params: { page_size: 100, is_active: true } })
  })

  it('listUnits hits /v1/units/, not a hardcoded KG/GM/LTR list', async () => {
    api.get.mockResolvedValue({ data: { results: [{ id: 1, code: 'KG', name: 'Kilogram' }] } })
    const units = await listUnits()
    expect(api.get).toHaveBeenCalledWith('/v1/units/', { params: { page_size: 100, is_active: true } })
    expect(units).toEqual([{ id: 1, code: 'KG', name: 'Kilogram' }])
  })

  it('getMaterial hits /v1/materials/<id>/', async () => {
    api.get.mockResolvedValue({ data: { id: 9, code: 'SYNTH-9' } })
    const material = await getMaterial(9)
    expect(api.get).toHaveBeenCalledWith('/v1/materials/9/')
    expect(material).toEqual({ id: 9, code: 'SYNTH-9' })
  })
})

describe('material writes', () => {
  it('createMaterial posts the exact payload to /v1/materials/', async () => {
    api.post.mockResolvedValue({ data: { id: 10 } })
    const payload = { code: 'SYNTH-10', name: 'Synthetic', kind: 'RAW_MATERIAL', base_unit_id: 3 }
    await createMaterial(payload)
    expect(api.post).toHaveBeenCalledWith('/v1/materials/', payload)
  })

  it('updateMaterial patches only the given fields, never resending code/kind/base_unit', async () => {
    api.patch.mockResolvedValue({ data: { id: 10 } })
    await updateMaterial(10, { name: 'Renamed', description: 'Updated' })
    expect(api.patch).toHaveBeenCalledWith('/v1/materials/10/', { name: 'Renamed', description: 'Updated' })
  })

  it('activateMaterial posts to the activate action endpoint', async () => {
    api.post.mockResolvedValue({ data: { id: 10, is_active: true } })
    await activateMaterial(10)
    expect(api.post).toHaveBeenCalledWith('/v1/materials/10/activate/')
  })

  it('deactivateMaterial posts to the deactivate action endpoint', async () => {
    api.post.mockResolvedValue({ data: { id: 10, is_active: false } })
    await deactivateMaterial(10)
    expect(api.post).toHaveBeenCalledWith('/v1/materials/10/deactivate/')
  })
})
