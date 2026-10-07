// The embedded formula editor (Products > Formulas) opens a draft revision with
// raw and packaging lines. Synthetic ids and labels only.
import { MemoryRouter } from 'react-router-dom'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import FormulasPage from './FormulasPage'
import { getRevision, getFormula, listFormulas, listRevisions, searchMaterials, updateRevision } from './formulasService'

vi.mock('../../hooks/usePermissions', () => ({
  default: () => ({
    loading: false,
    error: null,
    realCompanyId: 2,
    hasPermission: () => true,
  }),
}))
vi.mock('./formulasService', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    listFormulas: vi.fn(),
    getFormula: vi.fn(),
    listRevisions: vi.fn(),
    getRevision: vi.fn(),
    searchMaterials: vi.fn(),
    updateRevision: vi.fn(),
    getRequirementPreview: vi.fn(async () => ({ lines: [], warnings: [], calculation_issues: [] })),
  }
})
vi.mock('../operations/unitsLookupService', () => ({ listPlanningUnits: vi.fn(async () => []) }))
vi.mock('../operations/catalogLookupService', () => ({ searchProducts: vi.fn(async () => []) }))

const REVISION = {
  id: 3,
  revision_number: 1,
  status: 'DRAFT',
  version: 1,
  base_output_quantity: '100.000',
  output_uom_code: 'DEMOKG',
  approved_at: null,
  lines: [
    {
      id: 11, material_id: 100, material_type: 'RAW_MATERIAL', material_code: 'RAW1', material_name: 'Synthetic raw A',
      unit_code: 'KG', quantity: '10.000', notes: '', label_claim: '0.25 mL', special_value: 'Q.S.', ar_no: 'AR-1',
    },
    {
      id: 12, material_id: 200, material_type: 'PACKAGING_MATERIAL', material_code: 'PKG1', material_name: 'Synthetic packing B',
      unit_code: 'PCS', quantity: '25.000', notes: '', label_claim: '', special_value: '', ar_no: '',
    },
  ],
}

beforeEach(() => {
  listFormulas.mockResolvedValue({
    count: 1,
    results: [{ id: 1, code: 'F-1', name: 'Synthetic formula', product_code: 'P-7', product_name: 'Demo Product' }],
  })
  getFormula.mockResolvedValue({ id: 1, code: 'F-1', name: 'Synthetic formula', product_code: 'P-7', product_name: 'Demo Product' })
  listRevisions.mockResolvedValue([{ id: 3, revision_number: 1, status: 'DRAFT', base_output_quantity: '100.000', output_uom_code: 'DEMOKG' }])
  getRevision.mockResolvedValue(REVISION)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('embedded formula editor with a draft revision', () => {
  it('opens the revision with its raw and packaging lines', async () => {
    render(
      <MemoryRouter>
        <FormulasPage embedded productId={7} lockedProduct={{ id: 7, label: 'P-7 · Demo Product' }} />
      </MemoryRouter>
    )
    await screen.findByText('F-1 — Synthetic formula')
    fireEvent.change(document.getElementById('fm-formula-select'), { target: { value: '1' } })
    await screen.findByText('Revision 1 — Draft — 100.000 DEMOKG')
    fireEvent.change(document.getElementById('fm-revision-select'), { target: { value: '3' } })
    expect(await screen.findByText('Synthetic raw A')).toBeTruthy()
    expect(screen.getByText('Synthetic packing B')).toBeTruthy()
  })

  it('on a version conflict, reloads the latest revision and keeps the rows on screen', async () => {
    searchMaterials.mockResolvedValue([
      { id: 300, label: 'Synthetic raw C (RAW3)', meta: 'RAW_MATERIAL', kind: 'RAW_MATERIAL', code: 'RAW3', name: 'Synthetic raw C', unitCode: 'KG' },
    ])
    updateRevision.mockRejectedValue(Object.assign(new Error('Conflict'), { response: { status: 409, data: { detail: 'changed' } } }))
    render(
      <MemoryRouter>
        <FormulasPage embedded productId={7} lockedProduct={{ id: 7, label: 'P-7 · Demo Product' }} />
      </MemoryRouter>
    )
    await screen.findByText('F-1 — Synthetic formula')
    fireEvent.change(document.getElementById('fm-formula-select'), { target: { value: '1' } })
    await screen.findByText('Revision 1 — Draft — 100.000 DEMOKG')
    fireEvent.change(document.getElementById('fm-revision-select'), { target: { value: '3' } })
    await screen.findByText('Synthetic raw A')
    getRevision.mockClear()

    fireEvent.click(screen.getAllByText('+ Add material')[0])
    fireEvent.change(await screen.findByPlaceholderText('Search raw material'), { target: { value: 'raw' } })
    fireEvent.click(await screen.findByText('Synthetic raw C (RAW3)'))
    fireEvent.change(await screen.findByLabelText('Base quantity for Synthetic raw C'), { target: { value: '4' } })
    fireEvent.click(screen.getByText('Save draft'))

    expect(await screen.findByText(/changed elsewhere/)).toBeTruthy()
    expect(getRevision).toHaveBeenCalled()
    expect(screen.getByLabelText('Base quantity for Synthetic raw C').value).toBe('4')
  })

  it('shows the save state honestly: saved on a clean draft, unsaved only after an edit', async () => {
    render(
      <MemoryRouter>
        <FormulasPage embedded productId={7} lockedProduct={{ id: 7, label: 'P-7 · Demo Product' }} />
      </MemoryRouter>
    )
    await screen.findByText('F-1 — Synthetic formula')
    fireEvent.change(document.getElementById('fm-formula-select'), { target: { value: '1' } })
    await screen.findByText('Revision 1 — Draft — 100.000 DEMOKG')
    fireEvent.change(document.getElementById('fm-revision-select'), { target: { value: '3' } })
    await screen.findByText('Synthetic raw A')
    expect(screen.getByText('All changes saved')).toBeTruthy()
    expect(screen.queryByText('Unsaved changes')).toBeNull()
    fireEvent.change(screen.getByLabelText('Base quantity for Synthetic raw A'), { target: { value: '11' } })
    expect(await screen.findByText('Unsaved changes')).toBeTruthy()
  })

  it('does not offer a material that is already in the list, and refuses a zero quantity', async () => {
    searchMaterials.mockResolvedValue([
      { id: 100, label: 'Synthetic raw A (RAW1)', meta: 'Raw material · KG', kind: 'RAW_MATERIAL', code: 'RAW1', name: 'Synthetic raw A', unitCode: 'KG' },
      { id: 300, label: 'Synthetic raw C (RAW3)', meta: 'Raw material · KG', kind: 'RAW_MATERIAL', code: 'RAW3', name: 'Synthetic raw C', unitCode: 'KG' },
    ])
    updateRevision.mockResolvedValue({})
    render(
      <MemoryRouter>
        <FormulasPage embedded productId={7} lockedProduct={{ id: 7, label: 'P-7 · Demo Product' }} />
      </MemoryRouter>
    )
    await screen.findByText('F-1 — Synthetic formula')
    fireEvent.change(document.getElementById('fm-formula-select'), { target: { value: '1' } })
    await screen.findByText('Revision 1 — Draft — 100.000 DEMOKG')
    fireEvent.change(document.getElementById('fm-revision-select'), { target: { value: '3' } })
    await screen.findByText('Synthetic raw A')

    fireEvent.click(screen.getAllByText('+ Add material')[0])
    fireEvent.change(await screen.findByPlaceholderText('Search raw material'), { target: { value: 'raw' } })
    expect(await screen.findByText('Synthetic raw C (RAW3)')).toBeTruthy()
    expect(screen.queryByText('Synthetic raw A (RAW1)')).toBeNull()
    fireEvent.click(screen.getByText('Synthetic raw C (RAW3)'))

    fireEvent.change(await screen.findByLabelText('Base quantity for Synthetic raw C'), { target: { value: '0' } })
    fireEvent.click(screen.getByText('Save draft'))
    expect(await screen.findByText('The base quantity must be more than zero for: Synthetic raw C.')).toBeTruthy()
    expect(updateRevision).not.toHaveBeenCalled()
  })

  it('asks for the base quantity of a new line before saving, and does not send the draft', async () => {
    searchMaterials.mockResolvedValue([
      { id: 300, label: 'Synthetic raw C (RAW3)', meta: 'RAW_MATERIAL', kind: 'RAW_MATERIAL', code: 'RAW3', name: 'Synthetic raw C', unitCode: 'KG' },
    ])
    updateRevision.mockResolvedValue({})
    render(
      <MemoryRouter>
        <FormulasPage embedded productId={7} lockedProduct={{ id: 7, label: 'P-7 · Demo Product' }} />
      </MemoryRouter>
    )
    await screen.findByText('F-1 — Synthetic formula')
    fireEvent.change(document.getElementById('fm-formula-select'), { target: { value: '1' } })
    await screen.findByText('Revision 1 — Draft — 100.000 DEMOKG')
    fireEvent.change(document.getElementById('fm-revision-select'), { target: { value: '3' } })
    await screen.findByText('Synthetic raw A')

    fireEvent.click(screen.getAllByText('+ Add material')[0])
    fireEvent.change(await screen.findByPlaceholderText('Search raw material'), { target: { value: 'raw' } })
    fireEvent.click(await screen.findByText('Synthetic raw C (RAW3)'))
    await screen.findByLabelText('Base quantity for Synthetic raw C')

    fireEvent.click(screen.getByText('Save draft'))
    expect(await screen.findByText('Enter the base quantity for: Synthetic raw C.')).toBeTruthy()
    expect(updateRevision).not.toHaveBeenCalled()
  })

  it('adds a raw material from the picker, edits its quantity and saves the draft', async () => {
    searchMaterials.mockResolvedValue([
      { id: 300, label: 'Synthetic raw C (RAW3)', meta: 'RAW_MATERIAL', kind: 'RAW_MATERIAL', code: 'RAW3', name: 'Synthetic raw C', unitCode: 'KG' },
    ])
    updateRevision.mockResolvedValue({})
    render(
      <MemoryRouter>
        <FormulasPage embedded productId={7} lockedProduct={{ id: 7, label: 'P-7 · Demo Product' }} />
      </MemoryRouter>
    )
    await screen.findByText('F-1 — Synthetic formula')
    fireEvent.change(document.getElementById('fm-formula-select'), { target: { value: '1' } })
    await screen.findByText('Revision 1 — Draft — 100.000 DEMOKG')
    fireEvent.change(document.getElementById('fm-revision-select'), { target: { value: '3' } })
    await screen.findByText('Synthetic raw A')

    fireEvent.click(screen.getAllByText('+ Add material')[0])
    const input = await screen.findByPlaceholderText('Search raw material')
    fireEvent.change(input, { target: { value: 'raw' } })
    fireEvent.click(await screen.findByText('Synthetic raw C (RAW3)'))
    expect(await screen.findByLabelText('Base quantity for Synthetic raw C')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Base quantity for Synthetic raw C'), { target: { value: '4' } })
    fireEvent.click(screen.getByText('Save draft'))
    await waitFor(() => expect(updateRevision).toHaveBeenCalledTimes(1))
  })
})
