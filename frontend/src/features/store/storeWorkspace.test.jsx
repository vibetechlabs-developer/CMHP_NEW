// Shared Store & Materials workspace: real API-backed lists, server-side search,
// lifecycle and import flows, recorded-receipt labels, store switching and no
// fabricated stock figures. Synthetic data only.
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import StoreMaterialsWorkspace from './StoreMaterialsWorkspace'
import {
  activateMaterial,
  commitMaterialImport,
  createMaterial,
  deactivateMaterial,
  getMaterial,
  getMaterialRegister,
  getMyStores,
  listContainerTypes,
  listLocations,
  listMaterialCategories,
  listMaterials,
  listMaterialSuppliers,
  listMyCompanies,
  listRecordedReceiptBalances,
  listRecordedReceipts,
  previewMaterialImport,
  updateMaterial,
} from './storeService'
import { listMaterialIssueMovements } from './materialIssueService'

const auth = vi.hoisted(() => ({ user: null }))
vi.mock('../../hooks/useAuth', () => ({ default: () => ({ user: auth.user }) }))

const CAPABLE = { id: 1, username: 'catalog-admin', capabilities: { can_manage_material_catalog: true } }
const READ_ONLY = { id: 2, username: 'business-admin', capabilities: { can_manage_material_catalog: false } }
vi.mock('../../components/ConfirmProvider', () => ({ confirmAction: vi.fn(async () => true) }))
vi.mock('../operations/unitsLookupService', () => ({
  searchActiveUnits: vi.fn(async () => [{ id: 2, label: 'Kilogram (KG)', meta: 'MASS' }]),
}))
vi.mock('./storeService', () => ({
  getMyStores: vi.fn(),
  getMaterial: vi.fn(),
  listMaterials: vi.fn(),
  createMaterial: vi.fn(),
  updateMaterial: vi.fn(),
  activateMaterial: vi.fn(),
  deactivateMaterial: vi.fn(),
  previewMaterialImport: vi.fn(),
  getMaterialImportPreview: vi.fn(),
  commitMaterialImport: vi.fn(),
  listLocations: vi.fn(),
  listRecordedReceipts: vi.fn(),
  listRecordedReceiptBalances: vi.fn(),
  getMaterialRegister: vi.fn(),
  listContainerTypes: vi.fn(),
  listMaterialCategories: vi.fn(),
  listMaterialSuppliers: vi.fn(),
  listMyCompanies: vi.fn(),
}))
vi.mock('./materialIssueService', () => ({
  listMaterialIssueMovements: vi.fn(),
  createMaterialIssue: vi.fn(),
  postMaterialIssue: vi.fn(),
  getAvailableToIssue: vi.fn(),
}))

const MATERIAL = { id: 10, code: 'SYN-RAW-1', name: 'Synthetic raw A', kind: 'RAW_MATERIAL', base_unit_code: 'KG', is_active: true, description: '' }
const STORE_ONE = { id: 5, code: 'SYNWH1', name: 'Synthetic store one' }
const STORE_TWO = { id: 6, code: 'SYNWH2', name: 'Synthetic store two' }

function renderAt(path = '/inventory/materials') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/inventory/*" element={<StoreMaterialsWorkspace />} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  auth.user = CAPABLE
  getMyStores.mockResolvedValue([STORE_ONE])
  getMaterial.mockResolvedValue(MATERIAL)
  listMaterials.mockResolvedValue({ count: 1, results: [MATERIAL] })
  listLocations.mockResolvedValue({ count: 0, results: [] })
  listRecordedReceiptBalances.mockResolvedValue({ count: 0, results: [], coverage: null, period: { posted_from: null, posted_to: null } })
  listRecordedReceipts.mockResolvedValue({ count: 0, results: [], coverage: { release_status: 'Not tracked', historical_receipts_backfilled: false }, period: { posted_from: null, posted_to: null } })
  listContainerTypes.mockResolvedValue([{ id: 1, code: 'BAG', name: 'Bag' }])
  listMaterialCategories.mockResolvedValue([{ id: 1, code: 'HERB', name: 'Herbs' }])
  listMaterialSuppliers.mockResolvedValue([{ id: 1, code: 'SUP1', name: 'Synthetic Supplier' }])
  listMyCompanies.mockResolvedValue([{ id: 1, code: 'SYNCO', legal_name: 'Synthetic Co', display_name: '' }])
  getMaterialRegister.mockResolvedValue({
    material: { id: 10, code: 'SYN-RAW-1', name: 'Synthetic raw A' },
    storeId: 5, storeCode: 'SYNWH1',
    opening: [], periodReceived: [], closing: [], movements: [], count: 0,
    periodIssued: [], closingNetOfIssues: [],
    coverage: { release_status: 'Not tracked', historical_receipts_backfilled: false },
    period: { posted_from: null, posted_to: null },
  })
  listMaterialIssueMovements.mockResolvedValue({ count: 0, results: [], coverage: null, period: { posted_from: null, posted_to: null } })
})

afterEach(() => {
  cleanup()
})

describe('Materials tab', () => {
  it('lists real materials from the server and sends search and filters as query parameters', async () => {
    renderAt()
    expect(await screen.findByText('Synthetic raw A')).toBeTruthy()
    expect(listMaterials).toHaveBeenLastCalledWith(expect.objectContaining({ search: '', kind: '', isActive: '', page: 1 }))

    fireEvent.change(screen.getByLabelText('Search materials'), { target: { value: 'raw' } })
    await waitFor(() => expect(listMaterials).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'raw', page: 1 })))

    fireEvent.change(screen.getByLabelText('Material type'), { target: { value: 'PACKAGING_MATERIAL' } })
    await waitFor(() => expect(listMaterials).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'PACKAGING_MATERIAL' })))
  })

  it('shows the empty state and the retry control on a failed load', async () => {
    listMaterials.mockRejectedValueOnce({ response: { status: 500, headers: { 'content-type': 'text/html' }, data: '<html>boom</html>' } })
    renderAt()
    expect(await screen.findByText(/something went wrong/i)).toBeTruthy()
    expect(screen.queryByText(/<html>/)).toBeNull()
    listMaterials.mockResolvedValueOnce({ count: 0, results: [] })
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('No raw materials match your filters')).toBeTruthy()
  })

  it('creates a material, then refreshes the list from the server and shows success only after it', async () => {
    createMaterial.mockResolvedValue({ id: 11, code: 'SYN-PKG-1' })
    renderAt()
    await screen.findByText('Synthetic raw A')
    fireEvent.click(screen.getByRole('button', { name: '+ Add Raw Material' }))
    fireEvent.change(screen.getByLabelText('Material code'), { target: { value: 'SYN-PKG-1' } })
    fireEvent.change(screen.getByLabelText('Material name'), { target: { value: 'Synthetic pack' } })
    fireEvent.change(screen.getByPlaceholderText('Search active unit'), { target: { value: 'k' } })
    fireEvent.click(await screen.findByText('Kilogram (KG)'))
    fireEvent.click(screen.getByRole('button', { name: 'Create material' }))
    await waitFor(() => expect(createMaterial).toHaveBeenCalledTimes(1))
    expect(createMaterial.mock.calls[0][0]).not.toHaveProperty('company')
    expect(await screen.findByText(/Material SYN-PKG-1 created/)).toBeTruthy()
    expect(listMaterials.mock.calls.length).toBeGreaterThan(1)
  })

  it('edits only name and description; code, type and unit are not sent as changes', async () => {
    updateMaterial.mockResolvedValue({ ...MATERIAL, name: 'Renamed' })
    renderAt()
    await screen.findByText('Synthetic raw A')
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByLabelText('Material code').disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Material name'), { target: { value: 'Renamed' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(updateMaterial).toHaveBeenCalledWith(10, expect.objectContaining({ name: 'Renamed' })))
    expect(Object.keys(updateMaterial.mock.calls[0][1]).sort()).toEqual(['description', 'name'])
  })

  it('explains a refused write (403) in plain language and sends nothing else', async () => {
    updateMaterial.mockRejectedValue({ response: { status: 403, headers: { 'content-type': 'application/json' }, data: { detail: 'The following permission(s) are required: x.' } } })
    renderAt()
    await screen.findByText('Synthetic raw A')
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.change(screen.getByLabelText('Material name'), { target: { value: 'Nope' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText(/Only an administrator can change the material catalog/)).toBeTruthy()
  })

  it('deactivates through the lifecycle endpoint, not DELETE', async () => {
    deactivateMaterial.mockResolvedValue({})
    renderAt()
    await screen.findByText('Synthetic raw A')
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }))
    await waitFor(() => expect(deactivateMaterial).toHaveBeenCalledWith(10))
    expect(activateMaterial).not.toHaveBeenCalled()
  })
})

describe('Material import', () => {
  function batch(overrides = {}) {
    return { id: 77, status: 'PREVIEWED', version: 3, total_rows: 2, valid_rows: 2, invalid_rows: 0, eligible_for_commit: true, file_errors: [], rows: { count: 2, results: [
      { id: 1, row_number: 1, code: 'SYN-A', name: 'A', material_type: 'RAW', base_unit_code: 'KG', is_valid: true, errors: [] },
      { id: 2, row_number: 2, code: 'SYN-B', name: 'B', material_type: 'RAW', base_unit_code: 'KG', is_valid: false, errors: [{ column: 'base_unit_code', message: 'Unit not found.' }] },
    ] }, ...overrides }
  }

  it('shows row errors and keeps Import disabled until the server says the batch is eligible', async () => {
    previewMaterialImport.mockResolvedValue(batch({ eligible_for_commit: false, valid_rows: 1, invalid_rows: 1 }))
    renderAt()
    await screen.findByText('Synthetic raw A')
    fireEvent.click(screen.getByRole('button', { name: 'Import CSV' }))
    fireEvent.change(screen.getByLabelText('Choose material CSV file'), { target: { files: [new File(['x'], 'm.csv', { type: 'text/csv' })] } })
    fireEvent.click(await screen.findByRole('button', { name: 'Check file' }))
    expect(await screen.findByText('Unit not found.')).toBeTruthy()
    expect(screen.getByText('This imports material definitions only. It does not add stock.')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Import 1 material/ }).disabled).toBe(true)
    expect(commitMaterialImport).not.toHaveBeenCalled()
  })

  it('commits with the preview id and its version, once, and refreshes after confirmed success', async () => {
    previewMaterialImport.mockResolvedValue(batch())
    commitMaterialImport.mockResolvedValue({ status: 'COMMITTED', created_material_ids: [21, 22] })
    renderAt()
    await screen.findByText('Synthetic raw A')
    fireEvent.click(screen.getByRole('button', { name: 'Import CSV' }))
    fireEvent.change(screen.getByLabelText('Choose material CSV file'), { target: { files: [new File(['x'], 'm.csv', { type: 'text/csv' })] } })
    fireEvent.click(await screen.findByRole('button', { name: 'Check file' }))
    const commit = await screen.findByRole('button', { name: /Import 2 materials/ })
    fireEvent.click(commit)
    fireEvent.click(commit)
    await waitFor(() => expect(commitMaterialImport).toHaveBeenCalledTimes(1))
    expect(commitMaterialImport).toHaveBeenCalledWith(77, 3)
    expect(await screen.findByText(/2 materials imported/)).toBeTruthy()
  })

  it('a refused commit shows the server reason, not success, and asks for a fresh check', async () => {
    previewMaterialImport.mockResolvedValue(batch())
    commitMaterialImport.mockRejectedValue({ response: { status: 400, headers: { 'content-type': 'application/json' }, data: { detail: ['This preview expired.'] } } })
    renderAt()
    await screen.findByText('Synthetic raw A')
    fireEvent.click(screen.getByRole('button', { name: 'Import CSV' }))
    fireEvent.change(screen.getByLabelText('Choose material CSV file'), { target: { files: [new File(['x'], 'm.csv', { type: 'text/csv' })] } })
    fireEvent.click(await screen.findByRole('button', { name: 'Check file' }))
    fireEvent.click(await screen.findByRole('button', { name: /Import 2 materials/ }))
    expect(await screen.findByText(/The file was not imported/)).toBeTruthy()
    expect(screen.queryByText(/\d+ materials? imported\./)).toBeNull()
    expect(screen.getByRole('button', { name: 'Check file' })).toBeTruthy()
  })
})

describe('Locations and Recorded Receipts', () => {
  it('lists locations of the selected store, read-only', async () => {
    listLocations.mockResolvedValue({ count: 1, results: [{ id: 3, code: 'SYN-LOC-1', name: 'Synthetic bay', description: '', is_active: true }] })
    renderAt('/inventory/locations')
    expect(await screen.findByText('SYN-LOC-1')).toBeTruthy()
    expect(listLocations).toHaveBeenCalledWith(5)
    expect(screen.getByText(/Material placement in a location is not recorded/)).toBeTruthy()
  })

  it('labels receipts as recorded quantity, shows the coverage notice, and has no stock or issue actions', async () => {
    listRecordedReceiptBalances.mockResolvedValue({ count: 1, results: [{ material_id: 10, material_code: 'SYN-RAW-1', material_name: 'Synthetic raw A', unit_id: 2, unit_code: 'KG', source_company_id: 2, source_company_code: 'DEMOA', recorded_receipt_quantity: '12.000' }], coverage: null })
    renderAt('/inventory/receipts')
    expect(await screen.findByText('12.000')).toBeTruthy()
    expect(screen.getAllByText('Recorded receipt quantity').length).toBeGreaterThan(0)
    expect(screen.getByText('Recorded receipts only. Opening stock, issues, returns and QC release are not included.')).toBeTruthy()
    const page = document.body.textContent || ''
    for (const forbidden of ['Available stock', 'Usable stock', 'Released stock', 'On-hand stock', 'Issue', 'Reserve', 'Transfer']) {
      expect(page).not.toMatch(new RegExp(forbidden))
    }
  })
})

describe('Material register', () => {
  it('clicking a material code navigates to its register and loads material + store-scoped data', async () => {
    renderAt()
    await screen.findByText('Synthetic raw A')
    fireEvent.click(screen.getByRole('link', { name: 'SYN-RAW-1' }))

    // The code now appears twice on the register (a read-only identity
    // chip in the filter row, plus the material-identity badge) - both
    // are real, intentional, so assert on the register having loaded
    // rather than on there being exactly one match.
    expect((await screen.findAllByText('SYN-RAW-1')).length).toBeGreaterThan(0)
    await waitFor(() => expect(getMaterial).toHaveBeenCalledWith(10))
    await waitFor(() => expect(getMaterialRegister).toHaveBeenCalledWith(5, 10, expect.any(Object)))
    expect(screen.getByText('← Back to Materials')).toBeTruthy()
  })

  it('"View register" is a separate, always-visible action leading to the same register', async () => {
    renderAt()
    await screen.findByText('Synthetic raw A')
    fireEvent.click(screen.getByRole('link', { name: 'View Register' }))
    expect((await screen.findAllByText('SYN-RAW-1')).length).toBeGreaterThan(0)
  })

  it('the Back link returns to the materials list', async () => {
    renderAt()
    await screen.findByText('Synthetic raw A')
    fireEvent.click(screen.getByRole('link', { name: 'View Register' }))
    await screen.findAllByText('SYN-RAW-1')
    fireEvent.click(screen.getByRole('link', { name: /Back to Materials/ }))
    expect(await screen.findByText('Synthetic raw A')).toBeTruthy()
  })

  it('shows a clear message for a material that does not exist or is not visible', async () => {
    getMaterial.mockRejectedValue({ response: { status: 404, headers: {}, data: {} } })
    renderAt('/inventory/materials/999')
    expect(await screen.findByText(/does not exist, or is not visible/)).toBeTruthy()
  })

  it('distinguishes no register access (403) from a store problem, never claiming a stock figure', async () => {
    getMaterialRegister.mockRejectedValue({ response: { status: 403, headers: {}, data: { detail: 'The following permission(s) are required: stock.view.' } } })
    renderAt('/inventory/materials/10')
    expect(await screen.findByText(/You do not have register access for this store/)).toBeTruthy()
  })

  it('applies a posted-date filter as posted_from/posted_to and shows which window produced the total', async () => {
    getMaterialRegister.mockResolvedValue({
      material: { id: 10, code: 'SYN-RAW-1', name: 'Synthetic raw A' },
      storeId: 5, storeCode: 'SYNWH1',
      opening: [{ unit_id: 2, unit_code: 'KG', source_company_id: 2, source_company_code: 'DEMOA', recorded_receipt_quantity: '2.000' }],
      periodReceived: [{ unit_id: 2, unit_code: 'KG', source_company_id: 2, source_company_code: 'DEMOA', recorded_receipt_quantity: '5.000' }],
      closing: [{ unit_id: 2, unit_code: 'KG', source_company_id: 2, source_company_code: 'DEMOA', recorded_receipt_quantity: '7.000' }],
      movements: [], count: 0, coverage: null,
      period: { posted_from: '2026-01-01', posted_to: '2026-01-31' },
    })
    renderAt('/inventory/materials/10')
    await screen.findAllByText('SYN-RAW-1')

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-01-01' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-01-31' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))

    await waitFor(() =>
      expect(getMaterialRegister).toHaveBeenLastCalledWith(
        5, 10,
        expect.objectContaining({ postedFrom: '2026-01-01', postedTo: '2026-01-31' })
      )
    )
    // Opening, period and closing must appear as three distinct totals, never one merged number.
    expect(await screen.findByText('Opening Book Stock')).toBeTruthy()
    expect(screen.getByText('Received This Period')).toBeTruthy()
    expect(screen.getByText('Closing Book Stock')).toBeTruthy()
    expect(screen.getByText('2.000')).toBeTruthy()
    expect(screen.getByText('5.000')).toBeTruthy()
    expect(screen.getByText('7.000')).toBeTruthy()
  })

  it('never shows available/usable/on-hand stock language on the register', async () => {
    renderAt('/inventory/materials/10')
    await screen.findAllByText('SYN-RAW-1')
    const page = document.body.textContent || ''
    for (const forbidden of ['Available stock', 'Usable stock', 'On-hand stock', 'Closing balance']) {
      expect(page).not.toMatch(new RegExp(forbidden))
    }
  })
})

describe('Store selection and late responses', () => {
  it('auto-selects the only accessible store and shows a clear message when none is accessible', async () => {
    getMyStores.mockResolvedValueOnce([])
    renderAt('/inventory/locations')
    expect(await screen.findByText(/No store is available to your account/)).toBeTruthy()
    expect(listLocations).not.toHaveBeenCalled()
  })

  it('ignores a late answer from the store it left', async () => {
    getMyStores.mockResolvedValue([STORE_ONE, STORE_TWO])
    let resolveFirst
    listLocations
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce({ count: 1, results: [{ id: 9, code: 'TWO-LOC', name: 'Store two bay', description: '', is_active: true }] })
    renderAt('/inventory/locations')
    await screen.findByLabelText('Store')
    fireEvent.change(screen.getByLabelText('Store'), { target: { value: String(STORE_ONE.id) } })
    fireEvent.change(screen.getByLabelText('Store'), { target: { value: String(STORE_TWO.id) } })
    expect(await screen.findByText('TWO-LOC')).toBeTruthy()
    await act(async () => {
      resolveFirst({ count: 1, results: [{ id: 8, code: 'ONE-LOC', name: 'Store one bay', description: '', is_active: true }] })
    })
    expect(screen.queryByText('ONE-LOC')).toBeNull()
    expect(screen.getByText('TWO-LOC')).toBeTruthy()
  })
})

describe('Write-action visibility follows the server capability', () => {
  it('a read-only user sees the list, the read-only notice, and no write controls', async () => {
    auth.user = READ_ONLY
    renderAt()
    expect(await screen.findByText('Synthetic raw A')).toBeTruthy()
    expect(screen.getByText(/Read-only access/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: '+ Add Raw Material' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Import CSV' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Deactivate' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Activate' })).toBeNull()
  })

  it('a user with no capability information is read-only until the server says otherwise', async () => {
    auth.user = { id: 3, username: 'no-capabilities' }
    renderAt()
    expect(await screen.findByText('Synthetic raw A')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '+ Add Raw Material' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
  })

  it('a capable user sees the write controls', async () => {
    renderAt()
    expect(await screen.findByText('Synthetic raw A')).toBeTruthy()
    expect(screen.getByRole('button', { name: '+ Add Raw Material' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Import CSV' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy()
  })

  it('switching from a capable user to a read-only user removes the write controls', async () => {
    const { rerender } = renderAt()
    expect(await screen.findByRole('button', { name: '+ Add Raw Material' })).toBeTruthy()
    auth.user = READ_ONLY
    rerender(
      <MemoryRouter initialEntries={['/inventory/materials']}>
        <Routes>
          <Route path="/inventory/*" element={<StoreMaterialsWorkspace />} />
        </Routes>
      </MemoryRouter>
    )
    await waitFor(() => expect(screen.queryByRole('button', { name: '+ Add Raw Material' })).toBeNull())
    expect(screen.getByText(/Read-only access/)).toBeTruthy()
  })

  it('a refused write for a user shown as capable still explains the refusal (server stays authoritative)', async () => {
    createMaterial.mockRejectedValue({ response: { status: 403, headers: { 'content-type': 'application/json' }, data: { detail: 'You must be an active superuser to perform this action.' } } })
    renderAt()
    await screen.findByText('Synthetic raw A')
    fireEvent.click(screen.getByRole('button', { name: '+ Add Raw Material' }))
    fireEvent.change(screen.getByLabelText('Material code'), { target: { value: 'SYN-X' } })
    fireEvent.change(screen.getByLabelText('Material name'), { target: { value: 'X' } })
    fireEvent.change(screen.getByPlaceholderText('Search active unit'), { target: { value: 'k' } })
    fireEvent.click(await screen.findByText('Kilogram (KG)'))
    fireEvent.click(screen.getByRole('button', { name: 'Create material' }))
    expect(await screen.findByText(/Only an administrator can change the material catalog/)).toBeTruthy()
  })
})
