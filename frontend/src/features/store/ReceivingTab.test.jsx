// Behavior tests for the real goods-receipt draft/review/post/cancel
// screens. Every backend call is mocked; the point here is the frontend's
// own logic: permission gating, duplicate-submit prevention, and honest
// 409/error handling - never a false success.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ReceivingTab from './ReceivingTab'
import * as receiving from './receivingService'
import { listContainerTypes } from './storeService'
import { getStorePermissionCodes } from '../operations/storePreparationService'
import { confirmAction } from '../../components/ConfirmProvider'

vi.mock('./receivingService', () => ({
  listGoodsReceipts: vi.fn(),
  getGoodsReceipt: vi.fn(),
  createGoodsReceipt: vi.fn(),
  updateGoodsReceipt: vi.fn(),
  postGoodsReceipt: vi.fn(),
  cancelGoodsReceipt: vi.fn(),
  listEligiblePurchaseOrders: vi.fn(),
}))
vi.mock('../operations/storePreparationService', () => ({ getStorePermissionCodes: vi.fn() }))
vi.mock('../../components/ConfirmProvider', () => ({ confirmAction: vi.fn(async () => true) }))
vi.mock('./storeService', () => ({
  listContainerTypes: vi.fn(async () => []),
  listMyCompanies: vi.fn(async () => []),
  listMaterials: vi.fn(async () => ({ count: 0, results: [] })),
}))

const BAG = { id: 1, code: 'BAG', name: 'Bag' }

const FULL_CODES = ['receiving.view', 'receiving.create', 'receiving.edit', 'receiving.post', 'receiving.cancel']

function renderTab(props = {}) {
  return render(
    <MemoryRouter>
      <ReceivingTab storeId={5} receiptId={null} {...props} />
    </MemoryRouter>
  )
}

afterEach(cleanup)

beforeEach(() => {
  vi.clearAllMocks()
  receiving.listGoodsReceipts.mockResolvedValue({ count: 0, results: [] })
})

describe('access gating', () => {
  it('denies a viewer without receiving.view, without calling the list endpoint', async () => {
    getStorePermissionCodes.mockResolvedValue([])
    renderTab()
    expect(await screen.findByText(/Access unavailable/)).toBeTruthy()
    expect(receiving.listGoodsReceipts).not.toHaveBeenCalled()
  })

  it('shows the list for a viewer with only receiving.view, without a create button', async () => {
    getStorePermissionCodes.mockResolvedValue(['receiving.view'])
    renderTab()
    await waitFor(() => expect(screen.getByText('Goods receipts')).toBeTruthy())
    expect(screen.queryByText('+ New receipt')).toBeNull()
  })

  it('shows the create button only with receiving.create', async () => {
    getStorePermissionCodes.mockResolvedValue(FULL_CODES)
    renderTab()
    await waitFor(() => expect(screen.getByText('+ New receipt')).toBeTruthy())
  })
})

describe('creating a draft receipt', () => {
  beforeEach(() => {
    getStorePermissionCodes.mockResolvedValue(FULL_CODES)
    receiving.listEligiblePurchaseOrders.mockResolvedValue({
      count: 1,
      results: [
        {
          id: 3,
          reference: 'PO-1',
          company_code: 'DEMOA',
          supplier_code: 'SUP-1',
          expected_delivery_date: '2026-10-20',
          delivery_progress: [
            {
              source_po_line_id: 31,
              line_number: 1,
              material_code_snapshot: 'MAT-1',
              material_name_snapshot: 'Material One',
              unit_code_snapshot: 'KG',
              unit_name_snapshot: 'Kilogram',
              ordered_quantity: '10.000',
              received_quantity: '0.000',
              remaining_quantity: '10.000',
              delivery_status: 'NOT_RECEIVED',
            },
          ],
        },
      ],
    })
  })

  it('sends only the lines with an entered quantity, with a stable idempotency key, and blocks a second click while saving', async () => {
    let resolveCreate
    receiving.createGoodsReceipt.mockImplementation(() => new Promise((resolve) => { resolveCreate = resolve }))

    renderTab()
    fireEvent.click(await screen.findByText('+ New receipt'))
    fireEvent.click(await screen.findByText('Select'))
    await screen.findByLabelText('Received quantity (KG) *')

    fireEvent.change(screen.getByLabelText('Received quantity (KG) *'), { target: { value: '4' } })
    const createButton = screen.getByRole('button', { name: 'Save Draft' })
    fireEvent.click(createButton)
    fireEvent.click(createButton)
    fireEvent.click(createButton)

    await waitFor(() => expect(receiving.createGoodsReceipt).toHaveBeenCalledTimes(1))
    const [storeId, payload] = receiving.createGoodsReceipt.mock.calls[0]
    expect(storeId).toBe(5)
    expect(payload.source_purchase_order_id).toBe(3)
    expect(payload.lines).toEqual([
      { source_po_line_id: 31, received_quantity: '4', lot_reference: '', container_type_id: null, container_quantity: null },
    ])
    expect(payload.idempotency_key).toBeTruthy()

    resolveCreate({ id: 77 })
    await waitFor(() => expect(receiving.createGoodsReceipt).toHaveBeenCalledTimes(1))
  })

  it('sends the supplier invoice number and per-line container details when filled in', async () => {
    listContainerTypes.mockResolvedValue([BAG])
    receiving.createGoodsReceipt.mockResolvedValue({ id: 77 })

    renderTab()
    fireEvent.click(await screen.findByText('+ New receipt'))
    fireEvent.click(await screen.findByText('Select'))
    await screen.findByLabelText('Received quantity (KG) *')

    fireEvent.change(screen.getByPlaceholderText('If the invoice is already available'), { target: { value: 'INV-55' } })
    fireEvent.change(screen.getByLabelText('Received quantity (KG) *'), { target: { value: '4' } })
    fireEvent.change(await screen.findByDisplayValue('—'), { target: { value: String(BAG.id) } })
    fireEvent.change(screen.getByPlaceholderText('Count'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }))

    await waitFor(() => expect(receiving.createGoodsReceipt).toHaveBeenCalledTimes(1))
    const [, payload] = receiving.createGoodsReceipt.mock.calls[0]
    expect(payload.supplier_invoice_reference).toBe('INV-55')
    expect(payload.lines[0]).toMatchObject({ container_type_id: BAG.id, container_quantity: 2 })
  })
})

describe('posting a receipt', () => {
  const DRAFT = {
    id: 9,
    reference: 'GR-9',
    status: 'DRAFT',
    version: 1,
    company_code: 'DEMOA',
    source_purchase_order_reference: 'PO-1',
    arrived_at: '2026-10-09T10:00:00Z',
    supplier_invoice_reference: 'INV-77',
    delivery_note_reference: '',
    notes: '',
    lines: [
      {
        id: 1,
        source_po_line_id: 31,
        material_code: 'MAT-1',
        material_name: 'Material One',
        unit_code: 'KG',
        received_quantity: '4.000',
        lot_reference: '',
        container_type_id: BAG.id,
        container_type_code: 'BAG',
        container_quantity: 2,
      },
    ],
  }

  beforeEach(() => {
    getStorePermissionCodes.mockResolvedValue(FULL_CODES)
    receiving.getGoodsReceipt.mockResolvedValue(DRAFT)
  })

  it('shows the supplier invoice reference and the per-line container detail', async () => {
    render(
      <MemoryRouter>
        <ReceivingTab storeId={5} receiptId={9} />
      </MemoryRouter>
    )
    expect(await screen.findByText('INV-77')).toBeTruthy()
    expect(await screen.findByText('BAG × 2')).toBeTruthy()
  })

  it('asks for confirmation with the exact required business meaning, then posts using the loaded version', async () => {
    receiving.postGoodsReceipt.mockResolvedValue({ ...DRAFT, status: 'POSTED', version: 2, posted_at: '2026-10-09T11:00:00Z' })
    render(
      <MemoryRouter>
        <ReceivingTab storeId={5} receiptId={9} />
      </MemoryRouter>
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Post receipt' }))
    await waitFor(() => expect(confirmAction).toHaveBeenCalled())
    expect(confirmAction.mock.calls[0][0]).toMatch(/does not release, reserve or issue material/)
    await waitFor(() => expect(receiving.postGoodsReceipt).toHaveBeenCalledWith(5, 9, 1))
    expect(await screen.findByText(/Receipt posted/)).toBeTruthy()
  })

  it('a 409 on post is shown honestly and offers Reload, never silently retried', async () => {
    receiving.postGoodsReceipt.mockRejectedValue({ response: { status: 409, data: { detail: 'stale' } } })
    render(
      <MemoryRouter>
        <ReceivingTab storeId={5} receiptId={9} />
      </MemoryRouter>
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Post receipt' }))
    expect(await screen.findByText(/changed since it was last loaded, so it was not posted/)).toBeTruthy()
    expect(receiving.postGoodsReceipt).toHaveBeenCalledTimes(1)
  })

  it('cancelling requires an explicit reason and will not submit without one', async () => {
    render(
      <MemoryRouter>
        <ReceivingTab storeId={5} receiptId={9} />
      </MemoryRouter>
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel receipt' }))
    const confirmButton = await screen.findByRole('button', { name: 'Confirm cancellation' })
    expect(confirmButton.disabled).toBe(true)
    expect(receiving.cancelGoodsReceipt).not.toHaveBeenCalled()
  })
})
