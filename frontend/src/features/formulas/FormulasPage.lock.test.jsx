// A formula created from a product's Formulas tab uses that product and nothing
// else. Synthetic ids and labels only.
import { MemoryRouter } from 'react-router-dom'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import FormulasPage from './FormulasPage'
import { createFormula, listFormulas } from './formulasService'

let granted = new Set()

vi.mock('../../hooks/usePermissions', () => ({
  default: () => ({
    loading: false,
    error: null,
    realCompanyId: 2,
    hasPermission: (code) => granted.has(code),
  }),
}))
vi.mock('./formulasService', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, listFormulas: vi.fn(), createFormula: vi.fn(), getFormula: vi.fn(), listRevisions: vi.fn() }
})
vi.mock('../operations/unitsLookupService', () => ({
  listPlanningUnits: vi.fn(async () => [{ id: 5, label: 'Bottle (BTL)' }]),
}))
vi.mock('../operations/catalogLookupService', () => ({
  searchProducts: vi.fn(async () => []),
}))

beforeEach(() => {
  granted = new Set(['formulas.view', 'formulas.create'])
  listFormulas.mockResolvedValue({ count: 0, results: [] })
  createFormula.mockResolvedValue({ id: 99, code: 'F-T', name: 'Test formula' })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('formula created from the product workspace', () => {
  it('posts the locked product id and the chosen output unit', async () => {
    render(
      <MemoryRouter>
        <FormulasPage embedded productId={7} lockedProduct={{ id: 7, label: 'P-7 · Demo Product' }} />
      </MemoryRouter>
    )

    fireEvent.click(await screen.findByText('+ New Formula'))
    expect(await screen.findByText('P-7 · Demo Product')).toBeTruthy()

    // No code/name inputs anymore - the server generates both from the
    // product (see apps.formulas.services.create_formula).
    fireEvent.change(document.getElementById('fm-qty'), { target: { value: '100' } })
    await waitFor(() => expect(screen.getByText('Bottle (BTL)')).toBeTruthy())
    fireEvent.change(document.getElementById('fm-unit'), { target: { value: '5' } })

    fireEvent.click(screen.getByText('Create formula'))

    await waitFor(() => expect(createFormula).toHaveBeenCalledTimes(1))
    expect(createFormula).toHaveBeenCalledWith(2, {
      product_id: 7,
      base_output_quantity: '100',
      output_uom_id: 5,
    })
  })

  it('lists only the product passed in (the product filter is fixed)', async () => {
    render(
      <MemoryRouter>
        <FormulasPage embedded productId={7} lockedProduct={{ id: 7, label: 'P-7 · Demo Product' }} />
      </MemoryRouter>
    )
    await waitFor(() => expect(listFormulas).toHaveBeenCalled())
    expect(listFormulas.mock.calls[0][1]).toMatchObject({ productId: '7' })
  })
})
