// /inventory/ledger no longer keeps its own mock ledger - it must open
// the same real register with a material selector. This proves it
// searches the real material catalog and navigates to the real register
// route, never writing to or reading from the removed mock
// stockLedgerEntries array. Synthetic data only.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const navigateSpy = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => navigateSpy }
})
vi.mock('../../store/storeService', () => ({
  listMaterials: vi.fn(),
}))

import StockLedgerTab from './StockLedgerTab'
import { listMaterials } from '../../store/storeService'

beforeEach(() => {
  vi.clearAllMocks()
  listMaterials.mockResolvedValue({ count: 1, results: [{ id: 9, code: 'SYNTH-9', name: 'Synthetic Material', base_unit_code: 'KG' }] })
})

afterEach(() => {
  cleanup()
})

describe('real material search, never the mock catalog', () => {
  it('searches the real materials endpoint as the user types', async () => {
    render(<MemoryRouter><StockLedgerTab /></MemoryRouter>)
    fireEvent.click(screen.getByText(/Search a material to open its register/))
    const input = await screen.findByPlaceholderText('Search material code or name…')
    fireEvent.change(input, { target: { value: 'SYNTH' } })
    await waitFor(() => expect(listMaterials).toHaveBeenCalledWith(expect.objectContaining({ search: 'SYNTH', isActive: 'true' })))
  })

  it('navigates to the real register route for the selected material', async () => {
    render(<MemoryRouter><StockLedgerTab /></MemoryRouter>)
    fireEvent.click(screen.getByText(/Search a material to open its register/))
    await waitFor(() => expect(screen.getByText('SYNTH-9')).toBeTruthy())

    await act(async () => {
      fireEvent.click(screen.getByText('SYNTH-9'))
    })

    expect(navigateSpy).toHaveBeenCalledWith('/inventory/materials/9')
  })
})
