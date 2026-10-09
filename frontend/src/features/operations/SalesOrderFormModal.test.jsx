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
import { confirmAction } from '../../components/ConfirmProvider'
import { fireEvent } from '@testing-library/react'
import useAuth from '../../hooks/useAuth'

vi.mock('./salesOrdersService', () => ({
  createSalesOrder: vi.fn(),
  getSalesOrder: vi.fn(),
  updateSalesOrder: vi.fn(),
  getConfirmationPreview: vi.fn(),
  confirmSalesOrder: vi.fn(),
}))
vi.mock('../../components/ConfirmProvider', () => ({ confirmAction: vi.fn(async () => true) }))
// Not under test here (see OrganizationSetupPage's own tests for the real
// capability) - this modal only reads `user.capabilities.can_manage_
// organization_setup` to decide whether to show a settings link.
vi.mock('../../hooks/useAuth', () => ({ default: vi.fn(() => ({ user: { capabilities: {} } })) }))
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
      canConfirmOrder: true,
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
      canConfirmOrder: false,
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
      canConfirmOrder: false,
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

/* =========================================================
   ORDER REVIEW AND CONFIRMATION
   ========================================================= */

const VIEWER_PERSONA = {
  permissions: {
    ...LOADED,
    canCreateOrder: false,
    canEditOrder: false,
    canConfirmOrder: false,
    canAddCustomer: false,
    canEditProduct: false,
    canViewBatch: false,
    canCreateBatch: false,
    canEditBatch: false,
    canEditPrinting: false,
    canAllocateBatch: false,
  },
  storeCodes: [],
}

function makePreview({ version = 1, readyToAttempt = true, blockingReasons = [], policyStatus = 'CONFIGURED', status = 'DRAFT', confirmedById = null, confirmedAt = null } = {}) {
  return {
    preview: { informational: true, generated_at: '2026-10-09T00:00:00Z', business_date: '2026-10-09', notice: 'Informational only. This review can be stale immediately.' },
    order: {
      id: ORDER.id,
      company_id: 2,
      reference: ORDER.reference,
      status,
      version,
      order_date: ORDER.order_date,
      requested_delivery_date: null,
      customer_order_reference: '',
      notes: '',
      currency: 'INR',
      confirmed_by_id: confirmedById,
      confirmed_at: confirmedAt,
    },
    customer: { id: 1, code: 'SYNCUST', name: 'Synthetic Customer', is_active: true },
    lines: [
      {
        id: 3, line_number: 1, product_id: 1, product_code: 'DEMOPROD1', product_name: 'Synthetic Product',
        sales_uom_code: 'BTL', sales_uom_name: 'Bottle', quantity: '10.000', unit_price: '20.00', line_amount: '200.00', description: '',
        current: { product_code: 'DEMOPROD1', product_name: 'Synthetic Product', product_is_active: true, sales_uom_code: 'BTL', sales_uom_name: 'Bottle', sales_uom_is_active: true },
      },
    ],
    subtotal: '200.00',
    confirmation: {
      workflow_implemented: true,
      policy: {
        status: policyStatus,
        version: policyStatus === 'CONFIGURED' ? 1 : null,
        allow_self_confirmation: true,
        allow_zero_price_lines: false,
        allow_past_requested_delivery_dates: false,
      },
      policy_message: policyStatus !== 'CONFIGURED' ? 'Confirmation rules are not configured. Contact your administrator.' : null,
      blocking_reasons: blockingReasons,
      informational_observations: [],
      actor_has_confirm_permission: true,
      ready_to_attempt: readyToAttempt,
    },
  }
}

async function openOrderAndReview(persona, previewResponse) {
  storePrep.getStorePermissionCodes.mockResolvedValue(persona.storeCodes)
  salesOrders.getConfirmationPreview.mockResolvedValue(previewResponse)
  renderModal({ permissions: persona.permissions, orderId: ORDER.id })
  await waitFor(() => expect(screen.getAllByText('Order details').length).toBeGreaterThan(0))
  fireEvent.click(await screen.findByText('Review order'))
  await waitFor(() => expect(screen.getByText(/Subtotal:/)).toBeTruthy())
}

describe('Order review and confirmation', () => {
  it('a viewer can review the order but sees no Confirm action', async () => {
    await openOrderAndReview(VIEWER_PERSONA, makePreview({ readyToAttempt: false }))
    expect(screen.getByText(/200.00 INR/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Confirm order' })).toBeNull()
    expect(screen.getByText(/requires additional permission/)).toBeTruthy()
    expect(salesOrders.confirmSalesOrder).not.toHaveBeenCalled()
  })

  it('an authorized user sees the Confirm action when the backend says ready_to_attempt', async () => {
    await openOrderAndReview(PERSONAS.admin, makePreview({ readyToAttempt: true }))
    const button = screen.getByRole('button', { name: 'Confirm order' })
    expect(button.disabled).toBe(false)
  })

  it('disables Confirm and shows the server blocking reasons when policy is missing', async () => {
    await openOrderAndReview(
      PERSONAS.admin,
      makePreview({
        readyToAttempt: false,
        policyStatus: 'NOT_CONFIGURED',
        blockingReasons: [{ code: 'CONFIRMATION_POLICY_NOT_CONFIGURED', category: 'POLICY_NOT_CONFIGURED', message: 'Confirmation rules are not configured. Contact your administrator.' }],
      })
    )
    // The same message appears twice by design - once in the policy
    // notice, once in the structured blocking-reasons list - so this uses
    // getAllByText rather than the single-match getByText.
    expect(screen.getAllByText(/Confirmation rules are not configured/).length).toBeGreaterThan(0)
    // The mocked useAuth() user has no can_manage_organization_setup
    // capability (see the module-level vi.mock above), so this viewer sees
    // the neutral pointer, not the settings link - the link-vs-text branch
    // itself is covered in OrganizationSetupPage's own test suite.
    expect(screen.getByText(/Ask an administrator to configure it in Organization Setup/)).toBeTruthy()
    const button = screen.getByRole('button', { name: 'Confirm order' })
    expect(button.disabled).toBe(true)
  })

  it('shows a direct settings link for a reviewer who can manage Organization Setup', async () => {
    // mockReturnValueOnce would only survive the FIRST of this component's
    // several re-renders before the review loads, so this uses a
    // persistent override, restored in `finally` so it never leaks into a
    // later test.
    useAuth.mockReturnValue({ user: { capabilities: { can_manage_organization_setup: true } } })
    try {
      await openOrderAndReview(
        PERSONAS.admin,
        makePreview({
          readyToAttempt: false,
          policyStatus: 'NOT_CONFIGURED',
          blockingReasons: [{ code: 'CONFIRMATION_POLICY_NOT_CONFIGURED', category: 'POLICY_NOT_CONFIGURED', message: 'Confirmation rules are not configured. Contact your administrator.' }],
        })
      )
      expect(screen.getByRole('link', { name: 'Configure the confirmation policy' })).toBeTruthy()
    } finally {
      useAuth.mockReturnValue({ user: { capabilities: {} } })
    }
  })

  it('disables Confirm and lists an eligibility blocking reason', async () => {
    await openOrderAndReview(
      PERSONAS.admin,
      makePreview({
        readyToAttempt: false,
        blockingReasons: [{ code: 'INACTIVE_CUSTOMER', category: 'ELIGIBILITY', message: "Customer 'SYNCUST' is inactive." }],
      })
    )
    expect(screen.getByText(/Customer 'SYNCUST' is inactive\./)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Confirm order' }).disabled).toBe(true)
  })

  it('requires unsaved order edits to be resolved before Review order can run', async () => {
    storePrep.getStorePermissionCodes.mockResolvedValue(PERSONAS.admin.storeCodes)
    renderModal({ permissions: PERSONAS.admin.permissions, orderId: ORDER.id })
    await waitFor(() => expect(screen.getAllByText('Order details').length).toBeGreaterThan(0))
    // The confirm/review section only renders once the order itself has
    // loaded (it is gated on `order`, not just the static modal chrome) -
    // wait for the Review order button before touching the form.
    await screen.findByText('Review order')

    fireEvent.change(document.getElementById('sof-notes'), { target: { value: 'an unsaved edit' } })
    expect(screen.getByText(/unsaved changes/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Review order' }).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Review order' }))
    expect(salesOrders.getConfirmationPreview).not.toHaveBeenCalled()
  })

  it('confirms using the reviewed preview\'s own order.version, not any other locally-held version', async () => {
    await openOrderAndReview(PERSONAS.admin, makePreview({ version: 7, readyToAttempt: true }))
    salesOrders.confirmSalesOrder.mockResolvedValue({ ...ORDER, status: 'CONFIRMED', version: 8, confirmed_by_id: 9, confirmed_at: '2026-10-09T12:00:00Z' })

    fireEvent.click(screen.getByRole('button', { name: 'Confirm order' }))
    await waitFor(() => expect(salesOrders.confirmSalesOrder).toHaveBeenCalledWith(2, ORDER.id, 7))
  })

  it('a successful confirmation shows CONFIRMED, confirmed-by, and makes order fields read-only', async () => {
    const onSaved = vi.fn()
    storePrep.getStorePermissionCodes.mockResolvedValue(PERSONAS.admin.storeCodes)
    salesOrders.getConfirmationPreview.mockResolvedValue(makePreview({ version: 1, readyToAttempt: true }))
    salesOrders.confirmSalesOrder.mockResolvedValue({ ...ORDER, status: 'CONFIRMED', version: 2, confirmed_by_id: 9, confirmed_at: '2026-10-09T12:00:00Z' })
    render(
      <SalesOrderFormModal
        realCompanyId={2} companyCode="DEMOA" companyName="Demo Company A" orderId={ORDER.id}
        permissions={PERSONAS.admin.permissions} onClose={() => {}} onSaved={onSaved}
      />
    )
    await waitFor(() => expect(screen.getAllByText('Order details').length).toBeGreaterThan(0))
    fireEvent.click(await screen.findByText('Review order'))
    await waitFor(() => expect(screen.getByText(/Subtotal:/)).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Confirm order' }))

    expect(await screen.findByText('Order confirmed.')).toBeTruthy()
    expect(await screen.findByText(/Confirmed by user #9/)).toBeTruthy()
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ status: 'CONFIRMED' }))
    // Order fields become read-only purely because order.status is now
    // CONFIRMED (the same canEditOrder rule every DRAFT-only edit already
    // uses) - no separate "lock" logic was added.
    expect(screen.queryByText('Save order details')).toBeNull()
  })

  it('a 403 on confirm is shown as a permission denial, not a generic error', async () => {
    await openOrderAndReview(PERSONAS.admin, makePreview({ readyToAttempt: true }))
    salesOrders.confirmSalesOrder.mockRejectedValue({ response: { status: 403, data: { detail: "The following permission(s) are required: sales_orders.confirm." } } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm order' }))
    expect(await screen.findByText(/don't have permission to confirm/)).toBeTruthy()
  })

  it('a 400 blocked response shows the fresh structured blocking reasons and requires a new review', async () => {
    await openOrderAndReview(PERSONAS.admin, makePreview({ readyToAttempt: true }))
    salesOrders.confirmSalesOrder.mockRejectedValue({
      response: { status: 400, data: { detail: 'The order cannot be confirmed.', blocking_reasons: [{ code: 'EMPTY_ORDER', category: 'ELIGIBILITY', message: 'The order has no lines.' }] } },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm order' }))
    expect(await screen.findByText('The order has no lines.')).toBeTruthy()
    // The stale preview (and its now-superseded Confirm button) is cleared.
    expect(screen.queryByRole('button', { name: 'Confirm order' })).toBeNull()
  })

  it('a 409 on confirm explains the order changed and offers a fresh review, never retries by itself', async () => {
    await openOrderAndReview(PERSONAS.admin, makePreview({ version: 1, readyToAttempt: true }))
    salesOrders.confirmSalesOrder.mockRejectedValue({ response: { status: 409, data: { detail: 'This sales order has changed since it was last read. Refetch and retry.' } } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm order' }))

    expect(await screen.findByText(/changed since you reviewed it/)).toBeTruthy()
    expect(salesOrders.confirmSalesOrder).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Confirm order' })).toBeNull()

    // Explicit re-review required - never silently retried.
    salesOrders.getConfirmationPreview.mockResolvedValue(makePreview({ version: 2, readyToAttempt: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Review again' }))
    await waitFor(() => expect(salesOrders.getConfirmationPreview).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('button', { name: 'Confirm order' })).toBeTruthy()
  })

  it('prevents a duplicate Confirm submission while one is already in flight', async () => {
    await openOrderAndReview(PERSONAS.admin, makePreview({ readyToAttempt: true }))
    let resolveConfirm
    salesOrders.confirmSalesOrder.mockImplementation(() => new Promise((resolve) => { resolveConfirm = resolve }))

    const button = screen.getByRole('button', { name: 'Confirm order' })
    fireEvent.click(button)
    fireEvent.click(button)
    fireEvent.click(button)
    await waitFor(() => expect(salesOrders.confirmSalesOrder).toHaveBeenCalledTimes(1))

    resolveConfirm({ ...ORDER, status: 'CONFIRMED', version: 2, confirmed_by_id: 9, confirmed_at: '2026-10-09T12:00:00Z' })
    await screen.findByText('Order confirmed.')
  })

  it('ignores a stale confirmation-preview response after the order is switched away from', async () => {
    // Real usage never changes the `orderId` prop on a live instance - a
    // different order gets a fresh mount via a changed React `key` in
    // SalesOrdersPanel (the modal's `currentOrderId` state only reads the
    // `orderId` prop once, on mount). This mirrors that: the first window
    // is unmounted while its preview request is still in flight, then a
    // second, independent window opens a different order.
    let resolveFirst
    storePrep.getStorePermissionCodes.mockResolvedValue(PERSONAS.admin.storeCodes)
    salesOrders.getConfirmationPreview.mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve }))
    const first = renderModal({ permissions: PERSONAS.admin.permissions, orderId: ORDER.id })
    await waitFor(() => expect(screen.getAllByText('Order details').length).toBeGreaterThan(0))
    fireEvent.click(screen.getByText('Review order'))
    first.unmount()
    cleanup()

    // A different order opens in a fresh window.
    const OTHER_ORDER = { ...ORDER, id: 99, reference: 'SO-TEST-0099' }
    salesOrders.getSalesOrder.mockResolvedValue(OTHER_ORDER)
    renderModal({ permissions: PERSONAS.admin.permissions, orderId: 99 })
    await waitFor(() => expect(screen.getAllByText(/SO-TEST-0099/).length).toBeGreaterThan(0))

    resolveFirst(makePreview({ version: 1, readyToAttempt: true }))
    // The late response for the order the user left must never populate the screen now showing a different order.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.queryByText(/Subtotal:/)).toBeNull()
  })

  it('does not call confirmAction, and does not post, when ready_to_attempt is false even if clicked', async () => {
    await openOrderAndReview(PERSONAS.admin, makePreview({ readyToAttempt: false, blockingReasons: [{ code: 'EMPTY_ORDER', category: 'ELIGIBILITY', message: 'The order has no lines.' }] }))
    const button = screen.getByRole('button', { name: 'Confirm order' })
    expect(button.disabled).toBe(true)
    fireEvent.click(button)
    expect(confirmAction).not.toHaveBeenCalled()
    expect(salesOrders.confirmSalesOrder).not.toHaveBeenCalled()
  })
})
