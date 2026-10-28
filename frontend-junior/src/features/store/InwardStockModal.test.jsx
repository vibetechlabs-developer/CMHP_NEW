// Isolated, mocked-contract tests for the PO-based Inward Stock modal:
// eligible-PO loading, draft create, draft edit/update, explicit post,
// permission-gated posting, and error handling. Synthetic data only.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import InwardStockModal from './InwardStockModal'
import { createGoodsReceipt, listEligiblePurchaseOrders, postGoodsReceipt, updateGoodsReceipt } from './receivingService'
import { getStorePermissionCodes } from '../operations/storePreparationService'

vi.mock('./receivingService', () => ({
  listEligiblePurchaseOrders: vi.fn(),
  createGoodsReceipt: vi.fn(),
  updateGoodsReceipt: vi.fn(),
  postGoodsReceipt: vi.fn(),
}))
vi.mock('./storeService', () => ({
  listContainerTypes: vi.fn(async () => []),
  listMyCompanies: vi.fn(async () => []),
  listMaterialSuppliers: vi.fn(async () => []),
}))
vi.mock('../operations/storePreparationService', () => ({
  getStorePermissionCodes: vi.fn(async () => []),
}))

const SINGLE_LINE_PO = {
  id: 7, reference: 'PO-0007', company_code: 'CMHP', supplier_code: 'SUP-1', expected_delivery_date: '2026-05-01',
  delivery_progress: [
    {
      source_po_line_id: 11, line_number: 1, material_code_snapshot: 'SYNTH-9', material_name_snapshot: 'Synthetic',
      unit_code_snapshot: 'KG', ordered_quantity: '100.000', received_quantity: '0.000', remaining_quantity: '100.000',
      delivery_status: 'PENDING', unit_price: '270.0000', pricing_unit_code: 'KG', currency_code: 'INR',
    },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  listEligiblePurchaseOrders.mockResolvedValue({ results: [SINGLE_LINE_PO] })
})

afterEach(() => {
  cleanup()
})

describe('eligible PO loading and auto-select', () => {
  it('auto-selects the single eligible PO that has a line for this material', async () => {
    render(<InwardStockModal storeId={3} materialCode="SYNTH-9" materialName="Synthetic" onClose={vi.fn()} onCreated={vi.fn()} />)
    await waitFor(() => expect(listEligiblePurchaseOrders).toHaveBeenCalledWith(3, { pageSize: 50 }))
    await waitFor(() => expect(screen.getByText(/PO-0007/)).toBeTruthy())
  })
})

describe('draft create/edit/post', () => {
  it('creates a draft with the real PO id and the entered quantity, and calls onCreated with the server response', async () => {
    createGoodsReceipt.mockResolvedValue({ id: 1, reference: 'GR-0001', status: 'DRAFT', version: 1 })
    const onCreated = vi.fn()
    render(<InwardStockModal storeId={3} materialCode="SYNTH-9" materialName="Synthetic" onClose={vi.fn()} onCreated={onCreated} />)
    await waitFor(() => expect(screen.getByLabelText(/Received quantity/)).toBeTruthy())

    fireEvent.change(screen.getByLabelText(/Received quantity/), { target: { value: '25' } })
    await act(async () => {
      screen.getByText('Save Draft').click()
    })

    await waitFor(() => expect(createGoodsReceipt).toHaveBeenCalledTimes(1))
    const [storeId, payload] = createGoodsReceipt.mock.calls[0]
    expect(storeId).toBe(3)
    expect(payload.source_purchase_order_id).toBe(7)
    expect(payload.lines).toEqual([{ source_po_line_id: 11, received_quantity: '25', lot_reference: '', container_type_id: null, container_quantity: null }])
    expect(onCreated).toHaveBeenCalledWith({ id: 1, reference: 'GR-0001', status: 'DRAFT', version: 1 })
    expect(screen.getByText(/Draft GR-0001 saved/)).toBeTruthy()
  })

  it('updates the SAME draft (never a second receipt) on a second Save Draft click', async () => {
    createGoodsReceipt.mockResolvedValue({ id: 1, reference: 'GR-0001', status: 'DRAFT', version: 1 })
    updateGoodsReceipt.mockResolvedValue({ id: 1, reference: 'GR-0001', status: 'DRAFT', version: 2 })
    render(<InwardStockModal storeId={3} materialCode="SYNTH-9" materialName="Synthetic" onClose={vi.fn()} onCreated={vi.fn()} />)
    await waitFor(() => expect(screen.getByLabelText(/Received quantity/)).toBeTruthy())

    fireEvent.change(screen.getByLabelText(/Received quantity/), { target: { value: '25' } })
    await act(async () => { screen.getByText('Save Draft').click() })
    await waitFor(() => expect(createGoodsReceipt).toHaveBeenCalledTimes(1))

    fireEvent.change(screen.getByLabelText(/Received quantity/), { target: { value: '30' } })
    await act(async () => { screen.getByText('Update Draft').click() })

    await waitFor(() => expect(updateGoodsReceipt).toHaveBeenCalledTimes(1))
    expect(createGoodsReceipt).toHaveBeenCalledTimes(1)
    const [storeId, receiptId, payload] = updateGoodsReceipt.mock.calls[0]
    expect(storeId).toBe(3)
    expect(receiptId).toBe(1)
    expect(payload.expected_version).toBe(1)
    expect(payload.lines).toEqual([{ source_po_line_id: 11, received_quantity: '30', lot_reference: '', container_type_id: null, container_quantity: null }])
  })

  it('does not show Post Receipt until a draft exists, and disables it for a caller without receiving.post', async () => {
    createGoodsReceipt.mockResolvedValue({ id: 1, reference: 'GR-0001', status: 'DRAFT', version: 1 })
    getStorePermissionCodes.mockResolvedValue([]) // no receiving.post
    render(<InwardStockModal storeId={3} materialCode="SYNTH-9" materialName="Synthetic" onClose={vi.fn()} onCreated={vi.fn()} />)
    await waitFor(() => expect(screen.getByLabelText(/Received quantity/)).toBeTruthy())
    expect(screen.queryByText('Post Receipt')).toBeNull()

    fireEvent.change(screen.getByLabelText(/Received quantity/), { target: { value: '25' } })
    await act(async () => { screen.getByText('Save Draft').click() })
    await waitFor(() => expect(screen.getByText('Post Receipt')).toBeTruthy())
    expect(screen.getByText('Post Receipt').disabled).toBe(true)
  })

  it('posts the draft with its id and version, and surfaces onPosted', async () => {
    createGoodsReceipt.mockResolvedValue({ id: 1, reference: 'GR-0001', status: 'DRAFT', version: 1 })
    postGoodsReceipt.mockResolvedValue({ id: 1, reference: 'GR-0001', status: 'POSTED', version: 2 })
    getStorePermissionCodes.mockResolvedValue(['receiving.post'])
    const onPosted = vi.fn()
    render(<InwardStockModal storeId={3} materialCode="SYNTH-9" materialName="Synthetic" onClose={vi.fn()} onCreated={vi.fn()} onPosted={onPosted} />)
    await waitFor(() => expect(screen.getByLabelText(/Received quantity/)).toBeTruthy())

    fireEvent.change(screen.getByLabelText(/Received quantity/), { target: { value: '25' } })
    await act(async () => { screen.getByText('Save Draft').click() })
    await waitFor(() => expect(screen.getByText('Post Receipt')).toBeTruthy())
    expect(screen.getByText('Post Receipt').disabled).toBe(false)

    await act(async () => { screen.getByText('Post Receipt').click() })

    await waitFor(() => expect(postGoodsReceipt).toHaveBeenCalledWith(3, 1, 1))
    expect(onPosted).toHaveBeenCalledWith({ id: 1, reference: 'GR-0001', status: 'POSTED', version: 2 })
  })
})

describe('error handling', () => {
  it('shows the server error and allows a retry that succeeds', async () => {
    createGoodsReceipt.mockRejectedValueOnce({ response: { status: 400, data: { detail: 'Over-receipt rejected' } }, message: 'Over-receipt rejected' })
    render(<InwardStockModal storeId={3} materialCode="SYNTH-9" materialName="Synthetic" onClose={vi.fn()} onCreated={vi.fn()} />)
    await waitFor(() => expect(screen.getByLabelText(/Received quantity/)).toBeTruthy())

    fireEvent.change(screen.getByLabelText(/Received quantity/), { target: { value: '999' } })
    await act(async () => { screen.getByText('Save Draft').click() })

    await waitFor(() => expect(screen.getByText(/Over-receipt rejected/)).toBeTruthy())

    createGoodsReceipt.mockResolvedValueOnce({ id: 1, reference: 'GR-0001', status: 'DRAFT', version: 1 })
    await act(async () => { screen.getByText('Save Draft').click() })
    await waitFor(() => expect(createGoodsReceipt).toHaveBeenCalledTimes(2))
  })
})
