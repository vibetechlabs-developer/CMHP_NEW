import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const navigateSpy = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => navigateSpy }
})

vi.mock('../../../hooks/useAuth', () => ({
  default: () => ({
    user: {
      id: 1,
      username: 'store_operator',
      is_superuser: false,
      capabilities: { can_manage_material_catalog: true },
      profile: { role: 'STORES_MANAGER' },
    },
  }),
}))

vi.mock('../../../hooks/useWorkspace', () => ({
  default: () => ({ activeWorkspace: 'common_inventory' }),
}))

const addNotificationSpy = vi.fn()
vi.mock('../../../utils/notifications', () => ({
  addNotification: (...args) => addNotificationSpy(...args),
}))

vi.mock('../../store/storeService', () => ({
  getMyStores: vi.fn(),
  getStoreSummary: vi.fn(),
  listUnits: vi.fn(async () => []),
  listContainerTypes: vi.fn(async () => []),
  listMaterialCategories: vi.fn(async () => []),
}))

import OverviewTab from './OverviewTab'
import { getMyStores, getStoreSummary } from '../../store/storeService'

const mockStores = [
  { id: 1, code: 'MAIN_WH', name: 'Main Warehouse' },
  { id: 2, code: 'SEC_WH', name: 'Secondary Store' },
]

const mockSummaryData = {
  store: { id: 1, code: 'MAIN_WH', name: 'Main Warehouse' },
  business_time_zone: 'Asia/Kolkata',
  business_date: '2026-10-13',
  filter_period: { date_from: null, date_to: null },
  materials: { total_active: 42, raw_materials: 30, packaging_materials: 12 },
  receipts: { posted: 8, all_time_posted: 8, period_posted: 8, draft: 3 },
  issues: { posted: 5, all_time_posted: 5, period_posted: 5, draft: 2 },
  requisitions: { submitted: 4, approved: 3, draft: 1, pending_fulfillment: 3, total_pending: 7 },
  ledger: {
    active_stock_lines: 10,
    materials_with_stock: 6,
    balances: [
      {
        material_id: 101,
        material_code: 'RAW-01',
        material_name: 'Paracetamol Powder',
        unit_id: 1,
        unit_code: 'KG',
        unit_name: 'Kilogram',
        source_company_id: 1,
        source_company_code: 'CMP',
        recorded_receipt_quantity: '500.000',
        recorded_issued_quantity: '100.000',
        closing_book_quantity: '400.000',
      },
    ],
    total_balances_count: 1,
  },
  pending_work: {
    items: [
      {
        id: 1,
        document_type: 'Goods Receipt',
        type_code: 'RECEIPT',
        reference: 'GR-2026-001',
        company_id: 1,
        company_code: 'CMP',
        line_count: 2,
        date: '2026-10-12',
        created_at: '2026-10-12T10:00:00Z',
        status: 'DRAFT',
        action: 'Review & Post',
      },
      {
        id: 2,
        document_type: 'Material Issue',
        type_code: 'ISSUE',
        reference: 'MI-2026-002',
        company_id: 1,
        company_code: 'CMP',
        line_count: 1,
        date: '2026-10-12',
        created_at: '2026-10-12T11:00:00Z',
        status: 'DRAFT',
        action: 'Review & Post',
      },
      {
        id: 3,
        document_type: 'Material Requisition',
        type_code: 'REQUISITION',
        reference: 'MR-3 (BATCH-100)',
        company_id: 1,
        company_code: 'CMP',
        line_count: 3,
        date: '2026-10-13',
        created_at: '2026-10-13T09:00:00Z',
        status: 'SUBMITTED',
        action: 'Approve / Review',
      },
    ],
    total_count: 3,
  },
  recent_activity: {
    items: [
      {
        id: 'sm-1',
        movement_id: 1,
        source_id: 10,
        source_type: 'RECEIPT',
        movement_type: 'RECEIPT_IN',
        movement_label: 'Receipt Inward',
        posted_at: '2026-10-13T08:30:00Z',
        material_id: 101,
        material_code: 'RAW-01',
        material_name: 'Paracetamol Powder',
        quantity: '50.000',
        unit_code: 'KG',
        source_company_id: 1,
        source_company_code: 'CMP',
        batch_lot: 'LOT-9988',
        reference: 'GR-REC-001',
      },
    ],
    total_count: 1,
  },
  alerts: {
    items: [
      {
        id: 'draft-receipts',
        type: 'PENDING_RECEIPTS',
        severity: 'info',
        message: '3 goods receipt draft(s) awaiting review and posting.',
      },
    ],
  },
  features: {
    low_stock: {
      configured: false,
      status: 'NOT_CONFIGURED',
      reason: 'No reorder levels or minimum stock thresholds are captured on the material catalog in this version.',
    },
    quality_disposition: {
      configured: false,
      status: 'UNAVAILABLE',
      reason: 'Authoritative quality disposition (release/reject/hold) is not supported in the current incoming QC lifecycle.',
    },
    expiry_tracking: {
      configured: false,
      status: 'NOT_CONFIGURED',
      reason: 'Retest dates and expiry alerting thresholds are not configured for common store stock.',
    },
  },
  coverage: {
    accessible_companies: [{ id: 1, code: 'CMP', name: 'CMHP Pharma' }],
  },
  user_permissions: ['shared_store.view', 'receiving.create', 'material_issues.create', 'stock.view'],
}

beforeEach(() => {
  vi.clearAllMocks()
  getMyStores.mockResolvedValue(mockStores)
  getStoreSummary.mockResolvedValue(mockSummaryData)
})

describe('real low-stock alerts bridged to the notification bell', () => {
  it('pushes a real backend LOW_STOCK alert into addNotification, never the old fake seed-data one', async () => {
    getStoreSummary.mockResolvedValue({
      ...mockSummaryData,
      alerts: {
        items: [
          ...mockSummaryData.alerts.items,
          {
            id: 'low-stock-101', type: 'LOW_STOCK', severity: 'critical', material_id: 101,
            message: 'RAW-01 (Paracetamol Powder) is out of stock: 0.000 KG on hand, reorder level is 50.000 KG.',
          },
        ],
      },
      features: {
        ...mockSummaryData.features,
        low_stock: { configured: true, status: 'OK', reason: '1 of 1 material(s)...', low_stock_count: 1 },
      },
    })

    render(
      <MemoryRouter>
        <OverviewTab storeId={1} stores={mockStores} storesReady={true} />
      </MemoryRouter>
    )

    await waitFor(() => expect(addNotificationSpy).toHaveBeenCalledWith(expect.objectContaining({
      id: 'low-stock-101',
      type: 'inventory',
      title: 'Stock shortage',
      message: expect.stringContaining('RAW-01'),
      userId: 1,
      workspace: 'common_inventory',
    })))
  })

  it('does not push anything when there is no LOW_STOCK alert', async () => {
    render(
      <MemoryRouter>
        <OverviewTab storeId={1} stores={mockStores} storesReady={true} />
      </MemoryRouter>
    )

    await waitFor(() => expect(getStoreSummary).toHaveBeenCalled())
    expect(addNotificationSpy).not.toHaveBeenCalled()
  })
})

afterEach(() => {
  cleanup()
})

describe('Common Inventory Dashboard (OverviewTab)', () => {
  it('renders the summary metrics, with no redundant header card duplicating the page hero', async () => {
    render(
      <MemoryRouter>
        <OverviewTab storeId={1} stores={mockStores} storesReady={true} />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('42')).toBeTruthy()
    })

    // The page's own hero (rendered by Inventory.jsx, not this component)
    // already shows the dashboard title - this component no longer repeats
    // it, and no longer renders its own store-switcher/refresh card either.
    expect(screen.queryByText('Common Inventory Dashboard')).toBeNull()
    expect(screen.queryByText(/🔄 Refresh/)).toBeNull()

    // Active Materials card
    expect(screen.getByText('42')).toBeTruthy()
    expect(screen.getByText(/30 Raw · 12 Packaging/)).toBeTruthy()

    // Receipt Drafts card
    expect(screen.getByText('3')).toBeTruthy()
    expect(screen.getByText(/8 Posted to store/)).toBeTruthy()

    // Pending Requests card
    expect(screen.getByText('7')).toBeTruthy()

    // Issue Drafts card
    expect(screen.getByText('2')).toBeTruthy()
  })

  it('honestly displays Not configured and Unavailable for unsupported metrics without fake zero values', async () => {
    render(
      <MemoryRouter>
        <OverviewTab storeId={1} stores={mockStores} storesReady={true} />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Not configured')).toBeTruthy()
      expect(screen.getByText('Unavailable')).toBeTruthy()
    })

    // Clicking Low Stock opens explanatory modal
    fireEvent.click(screen.getByText('Not configured'))
    await waitFor(() => {
      expect(screen.getByText('Low Stock Tracking Not Configured')).toBeTruthy()
      expect(screen.getByText(/The shared chemical catalog does not define synthetic unit costs/)).toBeTruthy()
    })
  })

  it('renders quick action buttons with permission gating', async () => {
    render(
      <MemoryRouter>
        <OverviewTab storeId={1} stores={mockStores} storesReady={true} />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('🧪 Add Material')).toBeTruthy()
      expect(screen.getByText('📥 Receive Inward')).toBeTruthy()
      expect(screen.getByText('📤 Issue Material')).toBeTruthy()
      expect(screen.getByText('📑 Material Register')).toBeTruthy()
    })

    // Open Material Register navigates to materials
    fireEvent.click(screen.getByText('📑 Material Register'))
    expect(navigateSpy).toHaveBeenCalledWith('/inventory/materials')
  })

  it('renders the Pending Work table with real documents and actions', async () => {
    render(
      <MemoryRouter>
        <OverviewTab storeId={1} stores={mockStores} storesReady={true} />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Pending Work (3)')).toBeTruthy()
      expect(screen.getByText('GR-2026-001')).toBeTruthy()
      expect(screen.getByText('MI-2026-002')).toBeTruthy()
      expect(screen.getByText('MR-3 (BATCH-100)')).toBeTruthy()
    })
  })

  it('renders Recent Stock Activity and Current Stock Overview tables', async () => {
    render(
      <MemoryRouter>
        <OverviewTab storeId={1} stores={mockStores} storesReady={true} />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Recent Stock Activity (Posted Movements)')).toBeTruthy()
      expect(screen.getByText(/Inward Receipt/)).toBeTruthy()
      expect(screen.getByText(/50\.000/)).toBeTruthy()

      expect(screen.getByText('Current Stock Overview (Closing Book Balances)')).toBeTruthy()
      expect(screen.getAllByText('RAW-01').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('Paracetamol Powder').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText(/400\.000/)).toBeTruthy()
    })
  })

  it('allows switching date presets and updates the query parameters', async () => {
    render(
      <MemoryRouter>
        <OverviewTab storeId={1} stores={mockStores} storesReady={true} />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Today')).toBeTruthy()
    })

    fireEvent.click(screen.getByText('Today'))
    await waitFor(() => {
      expect(getStoreSummary).toHaveBeenCalledWith(1, expect.objectContaining({
        dateFrom: expect.any(String),
        dateTo: expect.any(String),
      }))
    })
  })

  it('displays API errors with a working Retry button', async () => {
    getStoreSummary.mockRejectedValueOnce(new Error('Connection failure'))

    render(
      <MemoryRouter>
        <OverviewTab storeId={1} stores={mockStores} storesReady={true} />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Connection failure')).toBeTruthy()
      expect(screen.getByText('Retry Request')).toBeTruthy()
    })

    getStoreSummary.mockResolvedValueOnce(mockSummaryData)
    fireEvent.click(screen.getByText('Retry Request'))

    await waitFor(() => {
      expect(screen.getByText('42')).toBeTruthy()
    })
  })
})
