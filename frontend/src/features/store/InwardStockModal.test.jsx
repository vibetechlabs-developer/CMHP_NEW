// Focused tests for the shared draft-creation modal used by both the
// Receiving tab's "+ New receipt" and the Material Register's
// "+ Inward Stock" - this file covers the material-filtering behaviour
// specific to the register entry point (ReceivingTab.test.jsx already
// covers the plain, unfiltered creation flow it shares).
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import InwardStockModal from './InwardStockModal'
import * as receiving from './receivingService'
import * as storeService from './storeService'
import { getStorePermissionCodes } from '../operations/storePreparationService'

vi.mock('./receivingService', () => ({
  createGoodsReceipt: vi.fn(),
  updateGoodsReceipt: vi.fn(),
  postGoodsReceipt: vi.fn(),
  listEligiblePurchaseOrders: vi.fn(),
}))
vi.mock('./storeService', () => ({
  listContainerTypes: vi.fn(async () => []),
  listMyCompanies: vi.fn(async () => []),
  listMaterials: vi.fn(async () => ({ count: 0, results: [] })),
}))
vi.mock('../operations/storePreparationService', () => ({
  getStorePermissionCodes: vi.fn(),
}))
vi.mock('../../components/ConfirmProvider', () => ({ confirmAction: vi.fn(async () => true) }))

const PO_WITH_MATERIAL = {
  id: 1,
  reference: 'PO-0001',
  company_code: 'CO1',
  supplier_code: 'SUP1',
  expected_delivery_date: '2026-11-01',
  delivery_progress: [
    {
      source_po_line_id: 11,
      line_number: 1,
      material_code_snapshot: 'SYN-RAW-1',
      material_name_snapshot: 'Synthetic raw A',
      unit_code_snapshot: 'KG',
      unit_name_snapshot: 'Kilogram',
      ordered_quantity: '100.000',
      received_quantity: '0.000',
      remaining_quantity: '100.000',
      delivery_status: 'NOT_RECEIVED',
      unit_price: '12.5000',
      pricing_unit_code: 'KG',
      currency_code: 'INR',
    },
  ],
}

const PO_WITH_MATERIAL_2 = {
  id: 3,
  reference: 'PO-0003',
  company_code: 'CO1',
  supplier_code: 'SUP3',
  expected_delivery_date: '2026-11-10',
  delivery_progress: [
    {
      source_po_line_id: 31,
      line_number: 1,
      material_code_snapshot: 'SYN-RAW-1',
      material_name_snapshot: 'Synthetic raw A',
      unit_code_snapshot: 'KG',
      unit_name_snapshot: 'Kilogram',
      ordered_quantity: '40.000',
      received_quantity: '0.000',
      remaining_quantity: '40.000',
      delivery_status: 'NOT_RECEIVED',
      unit_price: '13.0000',
      pricing_unit_code: 'KG',
      currency_code: 'INR',
    },
  ],
}

const PO_WITHOUT_MATERIAL = {
  id: 2,
  reference: 'PO-0002',
  company_code: 'CO1',
  supplier_code: 'SUP2',
  expected_delivery_date: '2026-11-05',
  delivery_progress: [
    {
      source_po_line_id: 21,
      line_number: 1,
      material_code_snapshot: 'SYN-OTHER',
      material_name_snapshot: 'Some other material',
      unit_code_snapshot: 'KG',
      unit_name_snapshot: 'Kilogram',
      ordered_quantity: '50.000',
      received_quantity: '0.000',
      remaining_quantity: '50.000',
      delivery_status: 'NOT_RECEIVED',
      unit_price: '5.0000',
      pricing_unit_code: 'KG',
      currency_code: 'INR',
    },
  ],
}

afterEach(cleanup)

beforeEach(() => {
  vi.clearAllMocks()
  getStorePermissionCodes.mockResolvedValue(['receiving.post'])
})

describe('material-filtered purchase order list', () => {
  it('shows only purchase orders with a line for the given material, with an explicit way to see the rest', async () => {
    // Two matching orders - the "pick one" screen must stay visible (no
    // auto-select) so the filtered-list/show-all UI is actually testable.
    receiving.listEligiblePurchaseOrders.mockResolvedValue({ results: [PO_WITH_MATERIAL, PO_WITH_MATERIAL_2, PO_WITHOUT_MATERIAL] })
    render(<InwardStockModal storeId={5} materialCode="SYN-RAW-1" materialName="Synthetic raw A" onClose={() => {}} onCreated={() => {}} />)

    expect(await screen.findByText('PO-0001')).toBeTruthy()
    expect(screen.getByText('PO-0003')).toBeTruthy()
    expect(screen.queryByText('PO-0002')).toBeNull()
    expect(screen.getByText(/Show all 3 eligible orders/)).toBeTruthy()

    fireEvent.click(screen.getByText(/Show all 3 eligible orders/))
    expect(await screen.findByText('PO-0002')).toBeTruthy()
  })

  it('offers "show all" instead of a dead end when no eligible order has the material', async () => {
    receiving.listEligiblePurchaseOrders.mockResolvedValue({ results: [PO_WITHOUT_MATERIAL] })
    render(<InwardStockModal storeId={5} materialCode="SYN-RAW-1" onClose={() => {}} onCreated={() => {}} />)

    expect(await screen.findByText(/No eligible purchase order currently has a line for SYN-RAW-1/)).toBeTruthy()
    fireEvent.click(screen.getByText('Show all eligible purchase orders'))
    expect(await screen.findByText('PO-0002')).toBeTruthy()
  })

  it('auto-selects the only matching order and skips straight to the simple single-line layout, showing the read-only price', async () => {
    receiving.listEligiblePurchaseOrders.mockResolvedValue({ results: [PO_WITH_MATERIAL] })
    render(<InwardStockModal storeId={5} materialCode="SYN-RAW-1" onClose={() => {}} onCreated={() => {}} />)

    // No "Select" step - exactly one eligible order for this material, so
    // the picker screen is skipped entirely, straight to the simple
    // Received Quantity | Price layout (not the multi-line table).
    expect(screen.queryByText('Select')).toBeNull()
    expect(await screen.findByLabelText('Received quantity (KG) *')).toBeTruthy()
    expect(screen.getByDisplayValue('INR 12.5000')).toBeTruthy()
  })

  it('creates a draft with only the entered line and reports the real server reference back, then posts it as a separate action', async () => {
    receiving.listEligiblePurchaseOrders.mockResolvedValue({ results: [PO_WITH_MATERIAL] })
    receiving.createGoodsReceipt.mockResolvedValue({ id: 42, reference: 'GR-0042', version: 1, status: 'DRAFT' })
    receiving.postGoodsReceipt.mockResolvedValue({ id: 42, reference: 'GR-0042', version: 2, status: 'POSTED' })
    const onCreated = vi.fn()
    const onPosted = vi.fn()
    render(<InwardStockModal storeId={5} materialCode="SYN-RAW-1" onClose={() => {}} onCreated={onCreated} onPosted={onPosted} />)

    fireEvent.change(await screen.findByLabelText('Received quantity (KG) *'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }))

    await screen.findByText(/Draft GR-0042 saved/)
    expect(receiving.createGoodsReceipt).toHaveBeenCalledWith(5, expect.objectContaining({
      source_purchase_order_id: 1,
      lines: [expect.objectContaining({ source_po_line_id: 11, received_quantity: '10' })],
    }))
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ status: 'DRAFT' }))
    expect(receiving.postGoodsReceipt).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Post Receipt' }))
    await screen.findByText(/Receipt GR-0042 posted/)
    expect(receiving.postGoodsReceipt).toHaveBeenCalledWith(5, 42, 1)
    expect(onPosted).toHaveBeenCalledWith(expect.objectContaining({ status: 'POSTED' }))
  })

  it('disables Post Receipt when the caller does not hold receiving.post in this store', async () => {
    getStorePermissionCodes.mockResolvedValue([])
    receiving.listEligiblePurchaseOrders.mockResolvedValue({ results: [PO_WITH_MATERIAL] })
    receiving.createGoodsReceipt.mockResolvedValue({ id: 42, reference: 'GR-0042', version: 1, status: 'DRAFT' })
    render(<InwardStockModal storeId={5} materialCode="SYN-RAW-1" onClose={() => {}} onCreated={() => {}} onPosted={() => {}} />)

    fireEvent.change(await screen.findByLabelText('Received quantity (KG) *'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }))

    const postButton = await screen.findByRole('button', { name: 'Post Receipt' })
    expect(postButton.disabled).toBe(true)
    expect(receiving.postGoodsReceipt).not.toHaveBeenCalled()
  })
})

describe('manual entry mode (no purchase order)', () => {
  beforeEach(() => {
    receiving.listEligiblePurchaseOrders.mockResolvedValue({ results: [] })
  })

  it('switches to the manual form and creates a draft with a directly-entered price, never a source_purchase_order_id', async () => {
    storeService.listMyCompanies.mockResolvedValue([{ id: 9, code: 'CO1', legal_name: 'Company One' }])
    receiving.createGoodsReceipt.mockResolvedValue({ id: 77, reference: 'GR-0077', version: 1, status: 'DRAFT' })
    const onCreated = vi.fn()
    render(
      <InwardStockModal
        storeId={5} materialId={10} materialCode="SYN-RAW-1" materialName="Synthetic raw A" materialBaseUnitCode="KG"
        onClose={() => {}} onCreated={onCreated} onPosted={() => {}}
      />
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Manual Entry (no PO)' }))
    fireEvent.change(screen.getByLabelText('Supplier / Vendor'), { target: { value: 'Nenshi Healthcare' } })
    fireEvent.change(screen.getByLabelText('Received quantity (KG) *'), { target: { value: '225' } })
    fireEvent.change(screen.getByLabelText('Price per KG (optional)'), { target: { value: '270' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }))

    await screen.findByText(/Draft GR-0077 saved/)
    expect(receiving.createGoodsReceipt).toHaveBeenCalledWith(5, expect.objectContaining({
      company_id: 9,
      supplier_name: 'Nenshi Healthcare',
      lines: [expect.objectContaining({ material_id: 10, received_quantity: '225', unit_price: '270', currency_code: 'INR' })],
    }))
    expect(receiving.createGoodsReceipt.mock.calls[0][1].source_purchase_order_id).toBeUndefined()
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ status: 'DRAFT' }))
  })

  it('pre-fills the material from props and never shows a material picker when the modal already knows it', async () => {
    storeService.listMyCompanies.mockResolvedValue([{ id: 9, code: 'CO1', legal_name: 'Company One' }])
    render(
      <InwardStockModal
        storeId={5} materialId={10} materialCode="SYN-RAW-1" materialName="Synthetic raw A" materialBaseUnitCode="KG"
        onClose={() => {}} onCreated={() => {}} onPosted={() => {}}
      />
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Manual Entry (no PO)' }))
    expect(await screen.findByLabelText('Received quantity (KG) *')).toBeTruthy()
    expect(screen.queryByLabelText('Material *')).toBeNull()
  })

  it('shows a material search picker when the modal is not scoped to one material', async () => {
    storeService.listMyCompanies.mockResolvedValue([{ id: 9, code: 'CO1', legal_name: 'Company One' }])
    render(<InwardStockModal storeId={5} onClose={() => {}} onCreated={() => {}} onPosted={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Manual Entry (no PO)' }))
    expect(await screen.findByLabelText('Material *')).toBeTruthy()
  })
})
