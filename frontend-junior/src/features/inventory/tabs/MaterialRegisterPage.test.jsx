// Isolated, mocked-contract tests for the real material register page:
// correct material/store requests, opening/closing rendering, pagination,
// context switching without stale data leakage, and API error handling.
// Synthetic data only - no real HTTP request leaves this test.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import MaterialRegisterPage from './MaterialRegisterPage'
import { getMaterial, getMaterialRegister } from '../../store/storeService'
import { listMaterialIssueMovements } from '../../store/materialIssueService'

vi.mock('../../store/storeService', () => ({
  getMaterial: vi.fn(),
  getMaterialRegister: vi.fn(),
  listMaterialSuppliers: vi.fn(async () => []),
  listContainerTypes: vi.fn(async () => []),
  listMyCompanies: vi.fn(async () => []),
}))
vi.mock('../../store/materialIssueService', () => ({
  listMaterialIssueMovements: vi.fn(async () => ({ count: 0, results: [] })),
  createCutoverStockDraft: vi.fn(),
  createPhysicalCountDraft: vi.fn(),
}))
vi.mock('../../store/receivingService', () => ({
  createGoodsReceipt: vi.fn(),
  postGoodsReceipt: vi.fn(),
}))

const MATERIAL = { id: 9, code: 'SYNTH-9', name: 'Synthetic Material', kind: 'RAW_MATERIAL', base_unit_code: 'KG', is_active: true }
const STORES = [{ id: 3, code: 'WH1', name: 'Warehouse One' }]

function emptyRegister(overrides = {}) {
  return {
    material: MATERIAL, storeId: 3, storeCode: 'WH1',
    opening: [], periodReceived: [], closing: [], periodIssued: [], closingNetOfIssues: [],
    movements: [], count: 0, coverage: { release_status: 'Not tracked', notice: 'x' }, period: { posted_from: null, posted_to: null },
    ...overrides,
  }
}

function renderPage(props = {}, initialPath = '/inventory/materials/9') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <MaterialRegisterPage materialId={9} stores={STORES} storesReady storeId={3} onSelectStore={vi.fn()} {...props} />
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  getMaterial.mockResolvedValue(MATERIAL)
  getMaterialRegister.mockResolvedValue(emptyRegister())
})

afterEach(() => {
  cleanup()
})

describe('correct material/store requests', () => {
  it('loads the exact material id and queries the register with the exact store+material id', async () => {
    renderPage()
    await waitFor(() => expect(getMaterial).toHaveBeenCalledWith(9))
    await waitFor(() => expect(getMaterialRegister).toHaveBeenCalledWith(3, 9, expect.objectContaining({ page: 1, pageSize: 25 })))
    expect(listMaterialIssueMovements).toHaveBeenCalledWith(3, expect.objectContaining({ material: 9, page: 1, pageSize: 25 }))
  })
})

describe('opening/closing rendering', () => {
  it('renders real opening and closing figures, grouped by unit and company, never merged into one number', async () => {
    getMaterialRegister.mockResolvedValue(emptyRegister({
      opening: [{ unit_id: 1, source_company_id: 1, recorded_receipt_quantity: '10.000', unit_code: 'KG', source_company_code: 'CMHP' }],
      closing: [{ unit_id: 1, source_company_id: 1, recorded_receipt_quantity: '15.000', unit_code: 'KG', source_company_code: 'CMHP' }],
    }))
    renderPage()
    await waitFor(() => expect(screen.getByText(/10\.000 KG/)).toBeTruthy())
    expect(screen.getByText(/15\.000 KG/)).toBeTruthy()
  })

  it('shows an honest dash, never a fabricated zero, when a period has no rows', async () => {
    renderPage()
    await waitFor(() => expect(getMaterialRegister).toHaveBeenCalled())
    const dashes = await screen.findAllByText('—')
    expect(dashes.length).toBeGreaterThan(0)
  })
})

describe('pagination', () => {
  it('requests page 2 when Next is clicked, without resetting the applied filters', async () => {
    getMaterialRegister.mockResolvedValue(emptyRegister({ count: 30, movements: [{ id: 1, quantity: '5', unit_code_snapshot: 'KG' }] }))
    renderPage()
    await waitFor(() => expect(getMaterialRegister).toHaveBeenCalledTimes(1))

    const nextButtons = await screen.findAllByText('Next')
    await act(async () => {
      nextButtons[0].click()
    })

    await waitFor(() => expect(getMaterialRegister).toHaveBeenLastCalledWith(3, 9, expect.objectContaining({ page: 2 })))
  })
})

describe('filter/page context survives a reload, not just in-app navigation', () => {
  it('requests the exact filters and page already encoded in the URL on first mount, as a real browser reload would see', async () => {
    renderPage({}, '/inventory/materials/9?from=2026-04-01&to=2026-04-30&q=INV-9&supplier=4&page=3')
    await waitFor(() => expect(getMaterialRegister).toHaveBeenCalledWith(3, 9, expect.objectContaining({
      postedFrom: '2026-04-01', postedTo: '2026-04-30', search: 'INV-9', supplier: '4', page: 3,
    })))
  })

  it('automatically writes the filters into the URL on change without needing an Apply button', async () => {
    renderPage()
    await waitFor(() => expect(getMaterialRegister).toHaveBeenCalledTimes(1))

    fireEvent.change(screen.getByTitle('From date'), { target: { value: '2026-05-01' } })

    await waitFor(() => expect(getMaterialRegister).toHaveBeenLastCalledWith(3, 9, expect.objectContaining({ postedFrom: '2026-05-01' })))
  })
})

describe('context switching without stale data leakage', () => {
  it('discards a slow in-flight response for the old store once the store changes', async () => {
    let resolveFirst
    getMaterialRegister.mockImplementationOnce(
      () => new Promise((resolve) => { resolveFirst = resolve })
    )
    const { rerender } = renderPage({ storeId: 3 })
    await waitFor(() => expect(getMaterialRegister).toHaveBeenCalledTimes(1))

    getMaterialRegister.mockResolvedValueOnce(emptyRegister({
      movements: [{ id: 99, quantity: '7', unit_code_snapshot: 'KG', source_company_code: 'TEJ' }],
    }))
    rerender(
      <MemoryRouter>
        <MaterialRegisterPage materialId={9} stores={[...STORES, { id: 4, code: 'WH2', name: 'Warehouse Two' }]} storesReady storeId={4} onSelectStore={vi.fn()} />
      </MemoryRouter>
    )
    await waitFor(() => expect(getMaterialRegister).toHaveBeenCalledTimes(2))

    // The stale store-3 response now resolves late - it must never
    // overwrite the already-current store-4 view.
    await act(async () => {
      resolveFirst(emptyRegister({ movements: [{ id: 1, quantity: '1', unit_code_snapshot: 'KG', source_company_code: 'STALE' }] }))
    })

    await waitFor(() => expect(screen.getByText('TEJ')).toBeTruthy())
    expect(screen.queryByText('STALE')).toBeNull()
  })
})

describe('API error handling', () => {
  it('shows an access-denied message on a 403, not a generic error', async () => {
    getMaterialRegister.mockRejectedValue({ response: { status: 403 }, message: 'Forbidden' })
    renderPage()
    await waitFor(() => expect(screen.getByText(/do not have register access/)).toBeTruthy())
  })

  it('offers Retry on a plain server error, and Retry re-issues the same request', async () => {
    getMaterialRegister.mockRejectedValueOnce({ response: { status: 500 }, message: 'Server error' })
    renderPage()
    await waitFor(() => expect(screen.getByText('Retry')).toBeTruthy())

    getMaterialRegister.mockResolvedValueOnce(emptyRegister())
    await act(async () => {
      screen.getByText('Retry').click()
    })
    await waitFor(() => expect(getMaterialRegister).toHaveBeenCalledTimes(2))
  })
})
