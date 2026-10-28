// Isolated, mocked-contract tests for the real Materials catalog screen's
// newest pieces: filtered/all-pages CSV export, the store-scoped reorder
// level section (load + save), and permission-gated actions. Synthetic
// data only - no real HTTP request leaves this test.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import CommonMaterialsTab from './CommonMaterialsTab'
import {
  createMaterial,
  getMaterialReorderSetting,
  getMyStores,
  listMaterialCategories,
  listMaterials,
  listUnits,
  setMaterialReorderLevel,
} from '../../store/storeService'

vi.mock('../../store/storeService', () => ({
  listMaterials: vi.fn(),
  listMaterialCategories: vi.fn(async () => []),
  listMaterialSuppliers: vi.fn(async () => []),
  listUnits: vi.fn(async () => []),
  listContainerTypes: vi.fn(async () => []),
  createMaterial: vi.fn(),
  updateMaterial: vi.fn(),
  activateMaterial: vi.fn(),
  deactivateMaterial: vi.fn(),
  getMyStores: vi.fn(),
  getMaterialReorderSetting: vi.fn(),
  setMaterialReorderLevel: vi.fn(),
}))
vi.mock('../../../hooks/useAuth', () => ({
  default: () => ({ user: { capabilities: { can_manage_material_catalog: true } } }),
}))

const MATERIAL = {
  id: 9, code: 'SYNTH-9', name: 'Synthetic Material', kind: 'RAW_MATERIAL',
  base_unit_code: 'KG', is_active: true, default_container_type_code: null,
}

function renderTab() {
  return render(
    <MemoryRouter>
      <CommonMaterialsTab />
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  listMaterials.mockResolvedValue({ count: 1, results: [MATERIAL] })
})

afterEach(() => {
  cleanup()
})

describe('receipt-activity date range filter', () => {
  it('sends receiptFrom/receiptTo to listMaterials once set', async () => {
    renderTab()
    await waitFor(() => expect(listMaterials).toHaveBeenCalledTimes(1))

    fireEvent.change(screen.getByLabelText('Receipt activity from'), { target: { value: '2026-04-01' } })
    await waitFor(() => expect(listMaterials).toHaveBeenLastCalledWith(expect.objectContaining({ receiptFrom: '2026-04-01' })))
  })
})

describe('stock status is honestly unavailable, never fabricated', () => {
  it('renders the stock-status control disabled with an explanatory title', async () => {
    renderTab()
    await waitFor(() => expect(listMaterials).toHaveBeenCalled())
    const control = screen.getByLabelText('Stock status (not available)')
    expect(control.disabled).toBe(true)
    expect(control.title).toMatch(/Not available/)
  })
})

describe('export CSV', () => {
  it('fetches every page under the current filters, not just the loaded page', async () => {
    listMaterials
      .mockResolvedValueOnce({ count: 1, results: [MATERIAL] }) // initial list load
      .mockResolvedValueOnce({ count: 250, results: Array.from({ length: 200 }, (_, i) => ({ ...MATERIAL, id: i, code: `M${i}` })) })
      .mockResolvedValueOnce({ count: 250, results: Array.from({ length: 50 }, (_, i) => ({ ...MATERIAL, id: 200 + i, code: `M${200 + i}` })) })

    renderTab()
    await waitFor(() => expect(listMaterials).toHaveBeenCalledTimes(1))

    const originalCreateObjectURL = URL.createObjectURL
    const originalRevokeObjectURL = URL.revokeObjectURL
    URL.createObjectURL = vi.fn(() => 'blob:fake')
    URL.revokeObjectURL = vi.fn()
    try {
      await act(async () => {
        fireEvent.click(screen.getByText(/Export CSV/))
      })
      await waitFor(() => expect(listMaterials).toHaveBeenCalledTimes(3))
      expect(listMaterials).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, pageSize: 200 }))
    } finally {
      URL.createObjectURL = originalCreateObjectURL
      URL.revokeObjectURL = originalRevokeObjectURL
    }
  })
})

describe('material type and category', () => {
  it('allows selecting Mother Tincture as Material Type and sends MOTHER_TINCTURE kind on create', async () => {
    listMaterialCategories.mockResolvedValue([])
    listUnits.mockResolvedValue([{ id: 5, code: 'ML', name: 'Millilitre' }])
    createMaterial.mockResolvedValue({ id: 99, code: 'MT-001' })

    renderTab()
    await waitFor(() => expect(listMaterials).toHaveBeenCalled())

    await act(async () => {
      fireEvent.click(screen.getByText('+ Add Material'))
    })

    const typeSelect = screen.getByDisplayValue('Raw material')
    expect(screen.getAllByText('Mother Tincture').length).toBeGreaterThanOrEqual(1)
    fireEvent.change(typeSelect, { target: { value: 'MOTHER_TINCTURE' } })

    fireEvent.change(screen.getByPlaceholderText('e.g. RM-001'), { target: { value: 'MT-001' } })
    fireEvent.change(screen.getByPlaceholderText('Full descriptive name'), { target: { value: 'Arnica Mother Tincture' } })
    const unitOption = await screen.findByText('Millilitre (ML)')
    fireEvent.change(unitOption.closest('select'), { target: { value: '5' } })

    await act(async () => {
      fireEvent.click(screen.getByText('Create material'))
    })

    await waitFor(() => expect(createMaterial).toHaveBeenCalled())
    expect(createMaterial.mock.calls[0][0]).toEqual(expect.objectContaining({ kind: 'MOTHER_TINCTURE' }))
  })

  it('lists existing categories in the Add Material form when categories exist', async () => {
    listMaterialCategories.mockResolvedValue([
      { id: 1, code: 'HERBS', name: 'Herbs' },
    ])
    listUnits.mockResolvedValue([{ id: 5, code: 'ML', name: 'Millilitre' }])
    createMaterial.mockResolvedValue({ id: 99, code: 'MT-001' })

    renderTab()
    await waitFor(() => expect(listMaterials).toHaveBeenCalled())

    await act(async () => {
      fireEvent.click(screen.getByText('+ Add Material'))
    })

    await waitFor(() => expect(listMaterialCategories).toHaveBeenCalled())
    const herbsOption = await screen.findByText('Herbs (HERBS)')
    expect(herbsOption).toBeTruthy()

    const categorySelect = herbsOption.closest('select')
    fireEvent.change(categorySelect, { target: { value: '1' } })
    fireEvent.change(screen.getByPlaceholderText('e.g. RM-001'), { target: { value: 'RM-HERB-01' } })
    fireEvent.change(screen.getByPlaceholderText('Full descriptive name'), { target: { value: 'Arnica Herb' } })
    const unitOption = await screen.findByText('Millilitre (ML)')
    fireEvent.change(unitOption.closest('select'), { target: { value: '5' } })

    await act(async () => {
      fireEvent.click(screen.getByText('Create material'))
    })

    await waitFor(() => expect(createMaterial).toHaveBeenCalled())
    expect(createMaterial.mock.calls[0][0]).toEqual(expect.objectContaining({ category_id: 1 }))
  })
})

describe('store-scoped reorder level', () => {
  it('loads the existing setting for the single store and saves a new value scoped to that store+material', async () => {
    getMyStores.mockResolvedValue([{ id: 3, code: 'WH1', name: 'Warehouse One' }])
    getMaterialReorderSetting.mockResolvedValue({ store_id: 3, material_id: 9, reorder_level: '10.000' })
    setMaterialReorderLevel.mockResolvedValue({ store_id: 3, material_id: 9, reorder_level: '20.000' })

    renderTab()
    await waitFor(() => expect(listMaterials).toHaveBeenCalled())

    await act(async () => {
      fireEvent.click(screen.getByText('Edit'))
    })

    await waitFor(() => expect(getMaterialReorderSetting).toHaveBeenCalledWith(3, 9))
    const input = await screen.findByPlaceholderText('Not configured')
    expect(input.value).toBe('10.000')

    fireEvent.change(input, { target: { value: '20' } })
    await act(async () => {
      fireEvent.click(screen.getByText('Save reorder level'))
    })

    await waitFor(() => expect(setMaterialReorderLevel).toHaveBeenCalledWith(3, 9, '20'))
    await waitFor(() => expect(screen.getByText(/saved for this store/)).toBeTruthy())
  })

  it('shows a clear permission-denied message on a 403 from the server, not a generic error', async () => {
    getMyStores.mockResolvedValue([{ id: 3, code: 'WH1', name: 'Warehouse One' }])
    getMaterialReorderSetting.mockResolvedValue({ store_id: 3, material_id: 9, reorder_level: null })
    setMaterialReorderLevel.mockRejectedValue({ response: { status: 403 } })

    renderTab()
    await waitFor(() => expect(listMaterials).toHaveBeenCalled())
    await act(async () => { fireEvent.click(screen.getByText('Edit')) })
    const input = await screen.findByPlaceholderText('Not configured')

    fireEvent.change(input, { target: { value: '5' } })
    await act(async () => { fireEvent.click(screen.getByText('Save reorder level')) })

    await waitFor(() => expect(screen.getByText(/do not have permission/)).toBeTruthy())
  })
})
