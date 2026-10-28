import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CommonOrdersTab from './CommonOrdersTab'
import {
  listMaterialRequisitions,
  submitMaterialRequisition,
  approveMaterialRequisition,
} from '../../manufacturing/materialRequisitionsService'
import {
  listPurchaseOrders,
  listStorePurchaseOrders,
  listStorePurchasingSuppliers,
  issuePurchaseOrder,
} from '../purchasingService'
import {
  listGoodsReceipts,
  postGoodsReceipt,
} from '../../store/receivingService'
import { getMyStores, listMyCompanies } from '../../store/storeService'

vi.mock('../../store/storeService', () => ({
  getMyStores: vi.fn(),
  listMyCompanies: vi.fn(),
  listContainerTypes: vi.fn(async () => []),
  listMaterialSuppliers: vi.fn(async () => []),
}))

vi.mock('../../operations/storePreparationService', () => ({
  getStorePermissionCodes: vi.fn(async () => ['receiving.create', 'receiving.view', 'receiving.post']),
}))

vi.mock('../../manufacturing/materialRequisitionsService', () => ({
  listMaterialRequisitions: vi.fn(),
  getMaterialRequisition: vi.fn(),
  submitMaterialRequisition: vi.fn(),
  approveMaterialRequisition: vi.fn(),
  rejectMaterialRequisition: vi.fn(),
  reviseMaterialRequisition: vi.fn(),
}))

vi.mock('../purchasingService', () => ({
  listPurchaseOrders: vi.fn(),
  listStorePurchaseOrders: vi.fn(),
  getPurchaseOrder: vi.fn(),
  createPurchaseOrder: vi.fn(),
  updatePurchaseOrder: vi.fn(),
  issuePurchaseOrder: vi.fn(),
  cancelPurchaseOrder: vi.fn(),
  issueStorePurchaseOrder: vi.fn(),
  cancelStorePurchaseOrder: vi.fn(),
  listPurchasingSuppliers: vi.fn(async () => []),
  listStorePurchasingSuppliers: vi.fn(async () => []),
  listActiveMaterials: vi.fn(async () => []),
}))

vi.mock('../../store/receivingService', () => ({
  listGoodsReceipts: vi.fn(),
  getGoodsReceipt: vi.fn(),
  postGoodsReceipt: vi.fn(),
  cancelGoodsReceipt: vi.fn(),
  listEligiblePurchaseOrders: vi.fn(async () => ({ results: [] })),
}))

vi.mock('../../store/materialIssueService', () => ({
  getAvailableToIssue: vi.fn(async () => [
    { source_company_id: 1, net_quantity: '100.000', unit_code: 'KG' },
  ]),
}))

vi.mock('../../../hooks/useAuth', () => ({
  default: () => ({ user: { username: 'testuser' } }),
}))

vi.mock('../../../hooks/useWorkspace', () => ({
  default: () => ({ activeWorkspace: { companyId: 1 } }),
}))

const MOCK_REQS = [
  {
    id: 1,
    reference: 'REQ-2026-001',
    status: 'SUBMITTED',
    batch_plan: 5,
    batch_plan_number: 'BP-005',
    product_name_snapshot: 'Paracetamol 500mg Tablet',
    target_output_quantity_snapshot: '100000',
    output_uom_code_snapshot: 'TAB',
    current_round: 1,
    version: 1,
    lines: [
      {
        id: 10,
        material_id: 101,
        material_code_snapshot: 'RM-PARA',
        material_name_snapshot: 'Paracetamol Powder',
        calculated_quantity: '50.000',
        requested_quantity: '50.000',
        unit_code_snapshot: 'KG',
      },
    ],
  },
  {
    id: 2,
    reference: 'REQ-2026-002',
    status: 'APPROVED',
    batch_plan: 6,
    batch_plan_number: 'BP-006',
    product_name_snapshot: 'Amoxicillin 250mg Capsule',
    current_round: 1,
    version: 2,
    lines: [
      {
        id: 11,
        material_code_snapshot: 'RM-AMOX',
        requested_quantity: '25.000',
        unit_code_snapshot: 'KG',
      },
    ],
  },
]

const MOCK_POS = [
  {
    id: 201,
    reference: 'PO-2026-0201',
    status: 'ISSUED',
    supplier_name: 'Alpha Solvents Inc',
    currency_code: 'INR',
    expected_delivery_date: '2026-05-15',
    subtotal: '12500.00',
    lines: [{ id: 1, material_code: 'RM-SOLV', quantity: '500', unit_price: '25' }],
    delivery_progress: [
      {
        source_po_line_id: 1,
        line_number: 1,
        material_code: 'RM-SOLV',
        ordered_quantity: '500.000',
        received_quantity: '200.000',
        pending_draft_quantity: '0.000',
        remaining_quantity: '300.000',
        delivery_status: 'PARTIAL',
        unit_code: 'L',
      },
    ],
  },
]

const MOCK_RECEIPTS = [
  {
    id: 301,
    reference: 'GR-2026-0301',
    status: 'DRAFT',
    source_purchase_order_id: 201,
    source_purchase_order_reference: 'PO-2026-0201',
    supplier_name: 'Alpha Solvents Inc',
    arrived_at: '2026-05-10T10:00:00Z',
    supplier_invoice_reference: 'INV-9901',
    version: 1,
    lines: [
      {
        id: 50,
        material_code: 'RM-SOLV',
        received_quantity: '200.000',
        unit_code: 'L',
        lot_reference: 'LOT-SOLV-A',
      },
    ],
  },
]

describe('CommonOrdersTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getMyStores.mockResolvedValue([{ id: 1, name: 'Main Warehouse' }])
    listMyCompanies.mockResolvedValue([{ id: 1, code: 'CMHP', name: 'CMHP Lifesciences' }])
    listMaterialRequisitions.mockResolvedValue({ count: 2, results: MOCK_REQS })
    listPurchaseOrders.mockResolvedValue({ count: 1, results: MOCK_POS })
    listStorePurchaseOrders.mockResolvedValue({ count: 1, results: MOCK_POS })
    listStorePurchasingSuppliers.mockResolvedValue([])
    listGoodsReceipts.mockResolvedValue({ count: 1, results: MOCK_RECEIPTS })
  })

  afterEach(() => {
    cleanup()
  })

  it('renders three tabs and loads initial material requisitions', async () => {
    await act(async () => {
      render(<CommonOrdersTab storeId={1} />)
    })

    expect(screen.getByText('📋 Material Requests')).toBeTruthy()
    expect(screen.getByText('🛒 Purchase Orders')).toBeTruthy()
    expect(screen.getByText('📥 Inward Receipts')).toBeTruthy()

    // PO Tab is default
    expect(screen.getByText('PO-2026-0201')).toBeTruthy()
    expect(screen.getByText('Alpha Solvents Inc')).toBeTruthy()
  })

  it('switches to Material Requests tab and displays requisitions', async () => {
    await act(async () => {
      render(<CommonOrdersTab storeId={1} />)
    })

    const reqTabBtn = screen.getByText('📋 Material Requests')
    await act(async () => {
      fireEvent.click(reqTabBtn)
    })

    expect(screen.getByText('REQ-2026-001')).toBeTruthy()
    expect(screen.getByText('Paracetamol 500mg Tablet')).toBeTruthy()
  })

  it('switches to Inward Receipts tab and displays draft receipts with Post action', async () => {
    await act(async () => {
      render(<CommonOrdersTab storeId={1} />)
    })

    const receiptTabBtn = screen.getByText('📥 Inward Receipts')
    await act(async () => {
      fireEvent.click(receiptTabBtn)
    })

    expect(screen.getByText('GR-2026-0301')).toBeTruthy()
    expect(screen.getByText('PO-2026-0201')).toBeTruthy()
    expect(screen.getByText('INV-9901')).toBeTruthy()
  })

  it('opens details modal for a purchase order showing ordered, received, and remaining quantities', async () => {
    await act(async () => {
      render(<CommonOrdersTab storeId={1} />)
    })

    const detailsBtn = screen.getByRole('button', { name: 'Details' })
    await act(async () => {
      fireEvent.click(detailsBtn)
    })

    expect(screen.getByText(/Lines & Receipt Progress/i)).toBeTruthy()
    expect(screen.getByText('500.000 L')).toBeTruthy()
    expect(screen.getByText('200.000 L')).toBeTruthy()
    expect(screen.getByText('300.000 L')).toBeTruthy()
  })

  it('opens the Inward popup in PO-only mode, with no non-PO direct-entry option offered', async () => {
    await act(async () => {
      render(<CommonOrdersTab storeId={1} />)
    })

    const receiptTabBtn = screen.getByText('📥 Inward Receipts')
    await act(async () => {
      fireEvent.click(receiptTabBtn)
    })

    const createBtn = screen.getByText('+ Create Inward Receipt')
    await act(async () => {
      fireEvent.click(createBtn)
    })

    await waitFor(() => {
      expect(screen.getByText('📥 New Inward Receipt')).toBeTruthy()
    })

    expect(screen.queryByText('📝 Direct Inward (Invoice / Sheet)')).toBeNull()
    expect(screen.queryByText('📄 Link to Purchase Order')).toBeNull()
  })

  it('opens details modal for a material request showing available stock and stock status', async () => {
    await act(async () => {
      render(<CommonOrdersTab storeId={1} />)
    })

    const reqTabBtn = screen.getByText('📋 Material Requests')
    await act(async () => {
      fireEvent.click(reqTabBtn)
    })

    const detailsBtns = screen.getAllByRole('button', { name: 'Details' })
    await act(async () => {
      fireEvent.click(detailsBtns[0])
    })

    await waitFor(() => {
      expect(screen.getByText(/Formula Demand Lines & Store Availability/i)).toBeTruthy()
      expect(screen.getByText('Available in Store')).toBeTruthy()
      expect(screen.getByText('✅ Sufficient Stock')).toBeTruthy()
      expect(screen.getByText(/All Materials In Stock/i)).toBeTruthy()
    })
  })
})
