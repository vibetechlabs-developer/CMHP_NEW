// Render regression for the Order workspace. Build and lint do not catch
// runtime errors such as reading a variable before its declaration, so the
// modal is rendered here for each business role and for both an existing and
// a new order. Every service call is mocked: no network, no tokens.
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest'

import SalesOrderFormModal from './SalesOrderFormModal'
import * as salesOrders from './salesOrdersService'
import * as storePrep from './storePreparationService'
import * as batchPlans from './batchPlansService'
import { fireEvent } from '@testing-library/react'

vi.mock('./salesOrdersService', () => ({
  createSalesOrder: vi.fn(),
  getSalesOrder: vi.fn(),
  updateSalesOrder: vi.fn(),
}))
vi.mock('./catalogLookupService', () => ({
  searchCustomers: vi.fn(async () => []),
  searchProducts: vi.fn(async () => []),
}))
vi.mock('./productTypesService', () => ({
  listProductTypes: vi.fn(async () => []),
}))
vi.mock('./batchPlansService', () => ({
  allocateBatchNumber: vi.fn(),
  createBatchPlan: vi.fn(),
  getBatchPlan: vi.fn(),
  listApprovedRevisionsForProduct: vi.fn(async () => []),
  listBatchPlansForOrder: vi.fn(async () => []),
  updateBatchPlan: vi.fn(),
}))
vi.mock('./storePreparationService', () => ({
  createPreparation: vi.fn(),
  getRequisitionStatus: vi.fn(async () => ({ state: 'none' })),
  getStorePermissionCodes: vi.fn(),
  listMyStores: vi.fn(async () => [{ id: 5, code: 'DEMOWH', name: 'Demo Shared Warehouse' }]),
  listPreparationsForLine: vi.fn(async () => []),
  listPreparationsForPlan: vi.fn(async () => []),
  updatePreparation: vi.fn(),
}))
vi.mock('../formulas/FormulasPage', () => ({
  default: ({ productId }) => <div>formulas-stub product {String(productId)}</div>,
}))
vi.mock('./unitsLookupService', () => ({
  listPlanningUnits: vi.fn(async () => []),
}))

const ORDER = {
  id: 3,
  reference: 'SO-TEST-0001',
  status: 'DRAFT',
  version: 1,
  customer_id: 1,
  customer_name: 'Synthetic Customer',
  customer_code: 'SYNCUST',
  order_date: '2026-10-01',
  requested_delivery_date: null,
  planned_manufacturing_date: null,
  customer_order_reference: '',
  currency: 'INR',
  notes: '',
  lines: [
    {
      id: 3,
      line_number: 1,
      product_id: 1,
      product_name: 'Synthetic Product',
      product_code: 'DEMOPROD1',
      sales_uom_code: 'BTL',
      quantity: '10.000',
      unit_price: '20.00',
      description: '',
      product_type_snapshot: '',
    },
  ],
}

const LOADED = { loading: false }

const PERSONAS = {
  admin: {
    permissions: {
      ...LOADED,
      canViewFormulas: true,
      canCreateOrder: true,
      canEditOrder: true,
      canAddCustomer: true,
      canEditProduct: true,
      canViewBatch: true,
      canCreateBatch: true,
      canEditBatch: true,
      canEditPrinting: true,
      canAllocateBatch: true,
    },
    storeCodes: ['store_preparation.view', 'store_preparation.create', 'store_preparation.edit'],
  },
  storeManager: {
    permissions: {
      ...LOADED,
      canCreateOrder: false,
      canEditOrder: false,
      canAddCustomer: false,
      canEditProduct: false,
      canViewBatch: true,
      canCreateBatch: false,
      canEditBatch: false,
      canEditPrinting: false,
      canAllocateBatch: false,
    },
    storeCodes: ['store_preparation.view', 'store_preparation.create', 'store_preparation.edit'],
  },
  manager: {
    permissions: {
      ...LOADED,
      canCreateOrder: false,
      canEditOrder: false,
      canAddCustomer: false,
      canEditProduct: false,
      canViewBatch: true,
      canCreateBatch: true,
      canEditBatch: true,
      canEditPrinting: true,
      canAllocateBatch: true,
    },
    storeCodes: ['store_preparation.view'],
  },
}

function renderModal({ permissions, orderId = null }) {
  return render(
    <SalesOrderFormModal
      realCompanyId={2}
      companyCode="DEMOA"
      companyName="Demo Company A"
      orderId={orderId}
      permissions={permissions}
      onClose={() => {}}
      onSaved={() => {}}
    />
  )
}

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
  salesOrders.getSalesOrder.mockResolvedValue(ORDER)
})

describe('SalesOrderFormModal render regression', () => {
  it('renders without a runtime error while permissions are still loading', async () => {
    storePrep.getStorePermissionCodes.mockResolvedValue([])
    renderModal({ permissions: { loading: true, canCreateOrder: false, canEditOrder: false, canViewBatch: false } })
    expect((await screen.findAllByText('Order details')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Loading…').length).toBeGreaterThan(0)
  })

  it.each(Object.keys(PERSONAS))('opens an existing order for %s and shows the section states', async (name) => {
    const persona = PERSONAS[name]
    storePrep.getStorePermissionCodes.mockResolvedValue(persona.storeCodes)
    renderModal({ permissions: persona.permissions, orderId: ORDER.id })

    await waitFor(() => expect(screen.getAllByText('Order details').length).toBeGreaterThan(0))
    await waitFor(() => expect(screen.getAllByText(`Order ${ORDER.reference}`, { exact: false }).length).toBeGreaterThan(0))

    // Section labels settle after the store and batch permissions load.
    await waitFor(() => {
      const settled = screen.getAllByText(/You can edit|View only|Access unavailable/)
      expect(settled.length).toBeGreaterThanOrEqual(3)
    })
    const labels = screen.getAllByText(/You can edit|View only|Access unavailable|Loading…/).map((node) => node.textContent)

    if (name === 'admin') {
      expect(labels.filter((text) => text === 'You can edit').length).toBeGreaterThanOrEqual(3)
    }
    if (name === 'storeManager') {
      // Order is read-only, store preparation is editable, batch is read-only.
      expect(labels).toEqual(expect.arrayContaining(['View only', 'You can edit']))
      expect(screen.queryByText('Save order details')).toBeNull()
    }
    if (name === 'manager') {
      // Store preparation is read-only; batch and printing can be edited.
      expect(screen.queryByText('Save store details')).toBeNull()
      expect(labels).toEqual(expect.arrayContaining(['View only', 'You can edit']))
    }
  })

  it('opens a new order without a runtime error for an admin who can create orders', async () => {
    storePrep.getStorePermissionCodes.mockResolvedValue(PERSONAS.admin.storeCodes)
    renderModal({ permissions: PERSONAS.admin.permissions, orderId: null })
    expect((await screen.findAllByText('Order details')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('New order', { exact: false }).length).toBeGreaterThan(0)
  })
})

async function openNewPlanWindow() {
  storePrep.getStorePermissionCodes.mockResolvedValue(PERSONAS.admin.storeCodes)
  const view = renderModal({ permissions: PERSONAS.admin.permissions, orderId: ORDER.id })
  await waitFor(() => expect(screen.getAllByText('Order details').length).toBeGreaterThan(0))
  await waitFor(() => expect(document.getElementById('sof-plan')).toBeTruthy())
  fireEvent.change(document.getElementById('sof-plan'), { target: { value: 'new' } })
  await waitFor(() => expect(screen.getByText('Manage formulas')).toBeTruthy())
  return view
}

describe('Manage formulas drawer keeps the order window state', () => {
  beforeEach(() => {
    batchPlans.listApprovedRevisionsForProduct.mockResolvedValue([])
  })

  it('keeps unsaved batch input and the selected plan when the drawer is opened and closed', async () => {
    await openNewPlanWindow()
    fireEvent.change(document.getElementById('sof-batch-notes'), { target: { value: 'draft note' } })
    const callsBefore = batchPlans.listApprovedRevisionsForProduct.mock.calls.length

    fireEvent.click(screen.getByText('Manage formulas'))
    expect(screen.getByText(/formulas-stub product/)).toBeTruthy()
    fireEvent.click(screen.getByText('Back to batch planning'))
    await waitFor(() => expect(screen.queryByText(/formulas-stub product/)).toBeNull())

    expect(document.getElementById('sof-batch-notes').value).toBe('draft note')
    expect(document.getElementById('sof-plan').value).toBe('new')
    await waitFor(() => expect(batchPlans.listApprovedRevisionsForProduct.mock.calls.length).toBeGreaterThan(callsBefore))
  })

  it('keeps the input and offers Retry when the refresh after closing fails', async () => {
    await openNewPlanWindow()
    fireEvent.change(document.getElementById('sof-batch-notes'), { target: { value: 'kept on failure' } })
    batchPlans.listApprovedRevisionsForProduct.mockRejectedValueOnce(new Error('network down'))

    fireEvent.click(screen.getByText('Manage formulas'))
    fireEvent.click(screen.getByText('Back to batch planning'))

    expect(await screen.findByText(/Unable to load approved revisions/)).toBeTruthy()
    expect(screen.getByText('Retry')).toBeTruthy()
    expect(document.getElementById('sof-batch-notes').value).toBe('kept on failure')
  })

  it('does not carry form state into a fresh window (company or user change remounts it)', async () => {
    const first = await openNewPlanWindow()
    fireEvent.change(document.getElementById('sof-batch-notes'), { target: { value: 'belongs to first window' } })
    first.unmount()
    cleanup()

    storePrep.getStorePermissionCodes.mockResolvedValue(PERSONAS.admin.storeCodes)
    renderModal({ permissions: PERSONAS.admin.permissions, orderId: ORDER.id })
    await waitFor(() => expect(document.getElementById('sof-batch-notes')).toBeTruthy())
    expect(document.getElementById('sof-batch-notes').value).toBe('')
  })
})
