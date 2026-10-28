import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../suppliers/suppliersService', () => ({
  listSuppliers: vi.fn(),
  getSupplier: vi.fn(),
  createSupplier: vi.fn(),
  updateSupplier: vi.fn(),
  activateSupplier: vi.fn(),
  deactivateSupplier: vi.fn(),
  deleteSupplier: vi.fn(),
}))

import SuppliersPage from './SuppliersPage'
import {
  listSuppliers,
  createSupplier,
  updateSupplier,
  activateSupplier,
  deactivateSupplier,
  deleteSupplier,
} from '../../suppliers/suppliersService'

const mockSuppliers = [
  {
    id: 1,
    code: 'SUP-001',
    legal_name: 'Alpha Chem Labs',
    trade_name: 'Alpha Chem',
    contact_name: 'John Doe',
    email: 'alpha@example.com',
    phone: '1234567890',
    gstin: '24AAAAA0000A1Z5',
    pan: 'AAAAA0000A',
    is_active: true,
  },
  {
    id: 2,
    code: 'SUP-002',
    legal_name: 'Beta Pharma Supply',
    trade_name: 'Beta Pharma',
    contact_name: 'Jane Smith',
    email: 'beta@example.com',
    phone: '0987654321',
    gstin: '24BBBBB0000B1Z5',
    pan: 'BBBBB0000B',
    is_active: false,
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  listSuppliers.mockResolvedValue({ count: 2, results: mockSuppliers })
  deleteSupplier.mockResolvedValue({})
})

afterEach(() => {
  cleanup()
})

describe('SuppliersPage', () => {
  it('renders supplier list with data from backend', async () => {
    render(
      <MemoryRouter>
        <SuppliersPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Alpha Chem Labs')).toBeTruthy()
      expect(screen.getByText('SUP-001')).toBeTruthy()
      expect(screen.getByText('Beta Pharma Supply')).toBeTruthy()
      expect(screen.getByText('SUP-002')).toBeTruthy()
    })
  })

  it('searches suppliers as query changes', async () => {
    render(
      <MemoryRouter>
        <SuppliersPage />
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByText('Alpha Chem Labs')).toBeTruthy())

    const searchInput = screen.getByPlaceholderText('Search by code, name or contact…')
    fireEvent.change(searchInput, { target: { value: 'Alpha' } })

    await waitFor(() => {
      expect(listSuppliers).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'Alpha' })
      )
    })
  })

  it('opens create modal when clicking + Add Supplier', async () => {
    render(
      <MemoryRouter>
        <SuppliersPage />
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByText('Alpha Chem Labs')).toBeTruthy())

    const addBtn = screen.getByRole('button', { name: /\+ Add Supplier/i })
    fireEvent.click(addBtn)

    expect(screen.getByText('New supplier')).toBeTruthy()
    expect(screen.getByPlaceholderText('e.g. SUP-001')).toBeTruthy()
  })

  it('deletes a supplier after theme confirmation dialog is accepted', async () => {
    render(
      <MemoryRouter>
        <SuppliersPage />
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByText('Alpha Chem Labs')).toBeTruthy())

    const deleteButtons = screen.getAllByRole('button', { name: /^Delete$/i })
    expect(deleteButtons.length).toBe(2)

    fireEvent.click(deleteButtons[0])

    // Designer confirm modal should appear
    expect(await screen.findByText('Delete supplier?')).toBeTruthy()
    expect(
      screen.getByText(
        /"SUP-001 — Alpha Chem Labs" will be permanently deleted. This cannot be undone. Suppliers linked to purchase orders cannot be deleted./
      )
    ).toBeTruthy()

    // Click confirm button
    const confirmBtn = screen.getByRole('button', { name: /Yes, delete/i })
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(deleteSupplier).toHaveBeenCalledWith(1)
    })
  })
})
