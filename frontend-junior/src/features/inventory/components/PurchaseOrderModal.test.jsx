import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PurchaseOrderModal from './PurchaseOrderModal'
import {
  createPurchaseOrder,
  getPurchaseOrder,
  updatePurchaseOrder,
  getStorePurchaseOrder,
  listPurchasingSuppliers,
  listActiveMaterials,
} from '../purchasingService'

vi.mock('../purchasingService', () => ({
  createPurchaseOrder: vi.fn(),
  getPurchaseOrder: vi.fn(),
  updatePurchaseOrder: vi.fn(),
  getStorePurchaseOrder: vi.fn(),
  listPurchasingSuppliers: vi.fn(),
  listActiveMaterials: vi.fn(),
}))

vi.mock('../../store/storeService', () => ({
  listUnits: vi.fn().mockResolvedValue([]),
}))

const MOCK_SUPPLIERS = [
  { id: 10, code: 'SUP001', name: 'Acme Chemical Co' },
  { id: 20, code: 'SUP002', name: 'Beta Solvents Ltd' },
]

const MOCK_MATERIALS = [
  { id: 101, code: 'RM001', name: 'Paracetamol IP', base_unit: { code: 'KG' } },
  { id: 102, code: 'RM002', name: 'Microcrystalline Cellulose', base_unit: { code: 'KG' } },
]

const MOCK_COMPANIES = [
  { id: 1, code: 'CMHP', name: 'CMHP Lifesciences' },
]

describe('PurchaseOrderModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listPurchasingSuppliers.mockResolvedValue(MOCK_SUPPLIERS)
    listActiveMaterials.mockResolvedValue(MOCK_MATERIALS)
  })

  afterEach(() => {
    cleanup()
  })

  it('renders create modal and loads suppliers and materials', async () => {
    await act(async () => {
      render(
        <PurchaseOrderModal
          isOpen={true}
          mode="create"
          companyId={1}
          companies={MOCK_COMPANIES}
          onClose={vi.fn()}
        />
      )
    })

    expect(screen.getAllByText('Create Purchase Order').length).toBe(2)
    expect(screen.getByText(/Acme Chemical Co/)).toBeTruthy()
    expect(screen.getByText(/Paracetamol IP/)).toBeTruthy()
  })

  it('validates required fields before submitting create', async () => {
    await act(async () => {
      render(
        <PurchaseOrderModal
          isOpen={true}
          mode="create"
          companyId={1}
          companies={MOCK_COMPANIES}
          onClose={vi.fn()}
        />
      )
    })

    const submitBtn = screen.getByRole('button', { name: 'Create Purchase Order' })
    await act(async () => {
      fireEvent.click(submitBtn)
    })

    expect(createPurchaseOrder).not.toHaveBeenCalled()
    expect(screen.getByText('Please select a supplier.')).toBeTruthy()
  })

  it('submits direct purchase order payload successfully', async () => {
    createPurchaseOrder.mockResolvedValueOnce({
      id: 99,
      reference: 'PO-2026-0099',
      status: 'DRAFT',
    })

    const onSaved = vi.fn()
    const onClose = vi.fn()

    await act(async () => {
      render(
        <PurchaseOrderModal
          isOpen={true}
          mode="create"
          companyId={1}
          companies={MOCK_COMPANIES}
          onClose={onClose}
          onSaved={onSaved}
        />
      )
    })

    const selects = screen.getAllByRole('combobox')
    // selects: [supplierSelect, currencySelect, materialSelect]
    const supplierSelect = selects[0]
    fireEvent.change(supplierSelect, { target: { value: '10' } })

    const materialSelect = selects[2]
    fireEvent.change(materialSelect, { target: { value: '101' } })

    const submitBtn = screen.getByRole('button', { name: 'Create Purchase Order' })
    await act(async () => {
      fireEvent.click(submitBtn)
    })

    await waitFor(() => {
      expect(createPurchaseOrder).toHaveBeenCalledWith(1, {
        supplier_id: 10,
        currency_code: 'INR',
        expected_delivery_date: null,
        notes: '',
        lines: [
          {
            material_id: 101,
            quantity: 1,
            unit_price: 0,
          },
        ],
      })
      expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 99 }))
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('renders edit mode with order data and submits update', async () => {
    updatePurchaseOrder.mockResolvedValueOnce({
      id: 10,
      reference: 'PO-10',
      version: 1,
    })

    const onSaved = vi.fn()
    const onClose = vi.fn()
    const existingOrder = {
      id: 10,
      reference: 'PO-10',
      version: 1,
      supplier_id: 10,
      currency_code: 'INR',
      expected_delivery_date: '2026-06-15',
      notes: 'Urgent procurement',
      lines: [
        {
          id: 55,
          material_id: 101,
          material_code: 'RM001',
          material_name: 'Paracetamol IP',
          quantity: '50.000',
          unit_price: '450.0000',
        },
      ],
    }

    await act(async () => {
      render(
        <PurchaseOrderModal
          isOpen={true}
          mode="edit"
          companyId={1}
          companies={MOCK_COMPANIES}
          order={existingOrder}
          onClose={onClose}
          onSaved={onSaved}
        />
      )
    })

    expect(screen.getByText(/Edit Purchase Order/i)).toBeTruthy()
    expect(screen.getByDisplayValue('Urgent procurement')).toBeTruthy()

    const submitBtn = screen.getByRole('button', { name: 'Update Purchase Order' })
    await act(async () => {
      fireEvent.click(submitBtn)
    })

    await waitFor(() => {
      expect(updatePurchaseOrder).toHaveBeenCalledWith(1, 10, {
        expected_version: 1,
        supplier_id: 10,
        expected_delivery_date: '2026-06-15',
        notes: 'Urgent procurement',
        lines: [
          {
            id: 55,
            unit_price: 450,
          },
        ],
      })
      expect(onSaved).toHaveBeenCalled()
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('allows user to select an alternative unit of measure and submits unit_id', async () => {
    const mockUnits = [
      { id: 6, code: 'GM', name: 'Gram' },
      { id: 7, code: 'KG', name: 'Kilogram' },
    ]
    const { listUnits } = await import('../../store/storeService')
    listUnits.mockResolvedValueOnce(mockUnits)

    createPurchaseOrder.mockResolvedValueOnce({
      id: 100,
      reference: 'PO-2026-0100',
      status: 'DRAFT',
    })

    await act(async () => {
      render(
        <PurchaseOrderModal
          isOpen={true}
          mode="create"
          companyId={1}
          companies={MOCK_COMPANIES}
          onClose={vi.fn()}
        />
      )
    })

    const selects = screen.getAllByRole('combobox')
    // selects: [supplierSelect, currencySelect, materialSelect, unitSelect]
    expect(selects.length).toBe(4)
    fireEvent.change(selects[0], { target: { value: '10' } })
    fireEvent.change(selects[2], { target: { value: '101' } })
    fireEvent.change(selects[3], { target: { value: '6' } })

    const submitBtn = screen.getByRole('button', { name: 'Create Purchase Order' })
    await act(async () => {
      fireEvent.click(submitBtn)
    })

    await waitFor(() => {
      expect(createPurchaseOrder).toHaveBeenCalledWith(1, expect.objectContaining({
        lines: [
          expect.objectContaining({
            material_id: 101,
            unit_id: 6,
          }),
        ],
      }))
    })
  })
})
