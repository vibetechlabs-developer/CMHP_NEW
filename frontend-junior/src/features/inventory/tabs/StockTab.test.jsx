import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import StockTab from './StockTab'
import {
  getMyStores,
  listStockBalances,
  listStockMovements,
  listMaterials,
  listMaterialSuppliers,
} from '../../store/storeService'
import { getAvailableToIssue } from '../../store/materialIssueService'

vi.mock('../../store/storeService', () => ({
  getMyStores: vi.fn(),
  listStockBalances: vi.fn(),
  listStockMovements: vi.fn(),
  listMaterials: vi.fn(),
  listMaterialSuppliers: vi.fn(),
}))

vi.mock('../../store/materialIssueService', () => ({
  getAvailableToIssue: vi.fn(),
  createMaterialIssue: vi.fn(),
  postMaterialIssue: vi.fn(),
}))

vi.mock('../../operations/storePreparationService', () => ({
  getStorePermissionCodes: vi.fn(async () => ['stock.view', 'stock_issue.view', 'stock_issue.create']),
}))

vi.mock('../purchasingService', () => ({
  listActiveMaterials: vi.fn(async () => []),
}))

vi.mock('../../manufacturing/batchPlansService', () => ({
  listBatchPlans: vi.fn(async () => []),
}))

const MOCK_STORES = [
  { id: 10, code: 'MAIN_STORE', name: 'Main Central Store' },
]

const MOCK_MATERIALS = [
  { id: 101, code: 'RM-PAR-01', name: 'Paracetamol Powder IP', kind: 'RAW_MATERIAL', base_unit_code: 'KG' },
  { id: 102, code: 'PM-BOT-01', name: 'Amber Glass Bottle 100ml', kind: 'PACKAGING_MATERIAL', base_unit_code: 'PCS' },
]

const MOCK_BALANCES = [
  {
    material_id: 101,
    material_code: 'RM-PAR-01',
    material_name: 'Paracetamol Powder IP',
    unit_id: 1,
    unit_code: 'KG',
    unit_name: 'Kilogram',
    source_company_id: 1,
    source_company_code: 'CO-A',
    recorded_receipt_quantity: '150.000',
    release_status: 'Not tracked',
  },
  {
    material_id: 102,
    material_code: 'PM-BOT-01',
    material_name: 'Amber Glass Bottle 100ml',
    unit_id: 2,
    unit_code: 'PCS',
    unit_name: 'Pieces',
    source_company_id: 2,
    source_company_code: 'CO-B',
    recorded_receipt_quantity: '5000.000',
    release_status: 'Not tracked',
  },
]

const MOCK_MOVEMENTS = [
  {
    id: 501,
    movement_type: 'RECEIPT_IN',
    source_goods_receipt_id: 42,
    source_goods_receipt_reference: 'GR-20261014-001',
    source_goods_receipt_arrived_at: '2026-10-14T09:30:00Z',
    source_invoice_reference: 'INV-9988',
    source_delivery_note_reference: 'DN-1122',
    source_receipt_line_id: 901,
    store_id: 10,
    source_company_id: 1,
    source_company_code: 'CO-A',
    supplier_id: 301,
    supplier_code: 'SUP-ACME',
    supplier_name: 'Acme Chemicals Ltd',
    material_id: 101,
    material_code_snapshot: 'RM-PAR-01',
    material_name_snapshot: 'Paracetamol Powder IP',
    unit_id: 1,
    unit_code_snapshot: 'KG',
    unit_name_snapshot: 'Kilogram',
    quantity: '100.000',
    lot_reference: 'LOT-PARA-2026-A',
    container_type_code: 'DRUM',
    container_quantity: 4,
    unit_price: '450.00',
    pricing_unit_code: 'KG',
    currency_code: 'INR',
    release_status: 'Not tracked',
    posted_by_id: 1,
    posted_at: '2026-10-14T10:00:00Z',
    created_at: '2026-10-14T10:00:00Z',
  },
  {
    id: 502,
    movement_type: 'RECEIPT_IN',
    source_goods_receipt_id: 43,
    source_goods_receipt_reference: 'GR-20261014-002',
    source_goods_receipt_arrived_at: '2026-10-14T11:00:00Z',
    source_invoice_reference: '',
    source_delivery_note_reference: '',
    source_receipt_line_id: 902,
    store_id: 10,
    source_company_id: 1,
    source_company_code: 'CO-A',
    supplier_id: 301,
    supplier_code: 'SUP-ACME',
    supplier_name: 'Acme Chemicals Ltd',
    material_id: 101,
    material_code_snapshot: 'RM-PAR-01',
    material_name_snapshot: 'Paracetamol Powder IP',
    unit_id: 1,
    unit_code_snapshot: 'KG',
    unit_name_snapshot: 'Kilogram',
    quantity: '50.000',
    lot_reference: '',
    container_type_code: 'BAG',
    container_quantity: 2,
    unit_price: '450.00',
    pricing_unit_code: 'KG',
    currency_code: 'INR',
    release_status: 'Not tracked',
    posted_by_id: 1,
    posted_at: '2026-10-14T11:30:00Z',
    created_at: '2026-10-14T11:30:00Z',
  },
]

describe('StockTab (Stock & Lots Module)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getMyStores.mockResolvedValue(MOCK_STORES)
    listMaterials.mockResolvedValue({ results: MOCK_MATERIALS, count: 2 })
    listMaterialSuppliers.mockResolvedValue([
      { id: 301, code: 'SUP-ACME', name: 'Acme Chemicals Ltd' },
    ])
    listStockBalances.mockResolvedValue(MOCK_BALANCES)
    listStockMovements.mockResolvedValue({
      results: MOCK_MOVEMENTS,
      count: 2,
      coverage: { issued_quantity_tracked: true },
    })
    getAvailableToIssue.mockImplementation(async (storeId, matId) => {
      if (Number(matId) === 101) {
        return [
          {
            unit_id: 1,
            unit_code: 'KG',
            source_company_id: 1,
            recorded_receipt_quantity: '150.000',
            recorded_issued_quantity: '30.000',
            net_quantity: '120.000',
          },
        ]
      }
      return [
        {
          unit_id: 2,
          unit_code: 'PCS',
          source_company_id: 2,
          recorded_receipt_quantity: '5000.000',
          recorded_issued_quantity: '0.000',
          net_quantity: '5000.000',
        },
      ]
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('renders page header and Tab 1 (Material Stock Summary) with closing book and available quantities', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <StockTab storeId={10} />
        </MemoryRouter>
      )
    })

    expect(screen.getByText('Stock & Lots')).toBeTruthy()
    expect(screen.getByText('View material stock, receipt sources, and lot traceability.')).toBeTruthy()

    // KPI cards rendered
    expect(screen.getByText('Active Stock Groups')).toBeTruthy()
    expect(screen.getByText('Recorded Receipt Lots')).toBeTruthy()

    // Table rows rendered
    expect(screen.getByText('RM-PAR-01')).toBeTruthy()
    expect(screen.getByText('Paracetamol Powder IP')).toBeTruthy()
    expect(screen.getByText('Raw Material')).toBeTruthy()
    expect(screen.getByText('150.000')).toBeTruthy()
    expect(screen.getByText('120.000')).toBeTruthy()
    expect(screen.getByText('PM-BOT-01')).toBeTruthy()
  })

  it('switches to Tab 2 (Lots & Receipt Sources) and displays provenance details', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <StockTab storeId={10} />
        </MemoryRouter>
      )
    })

    const tab2Btn = screen.getByText(/Tab 2: Lots & Receipt Sources/i)
    await act(async () => {
      fireEvent.click(tab2Btn)
    })

    expect(screen.getByText('SM-#501')).toBeTruthy()
    expect(screen.getByText('LOT-PARA-2026-A')).toBeTruthy()
    expect(screen.getByText('GR-20261014-001')).toBeTruthy()
    expect(screen.getAllByText('Acme Chemicals Ltd').length).toBeGreaterThan(0)
    expect(screen.getByText('100.000')).toBeTruthy()
    expect(screen.getAllByText('Not recorded').length).toBeGreaterThan(0)
  })

  it('filters by Material Type (Packaging Material)', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <StockTab storeId={10} />
        </MemoryRouter>
      )
    })

    expect(screen.getByText('RM-PAR-01')).toBeTruthy()

    // Filter by Packaging Materials
    const typeSelect = screen.getByDisplayValue('All Material Types')
    await act(async () => {
      fireEvent.change(typeSelect, { target: { value: 'PACKAGING_MATERIAL' } })
    })

    expect(screen.queryByText('RM-PAR-01')).toBeNull()
    expect(screen.getByText('PM-BOT-01')).toBeTruthy()
  })

  it('opens Lot/Source details drawer with all 6 provenance sections and honest disclosures', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <StockTab storeId={10} />
        </MemoryRouter>
      )
    })

    // Switch to Tab 2
    const tab2Btn = screen.getByText(/Tab 2: Lots & Receipt Sources/i)
    await act(async () => {
      fireEvent.click(tab2Btn)
    })

    // Click Details on the first row
    const detailsButtons = screen.getAllByText('Details')
    expect(detailsButtons.length).toBeGreaterThan(0)
    await act(async () => {
      fireEvent.click(detailsButtons[0])
    })

    // Verify modal drawer opened
    expect(screen.getByText('Receipt Source Details: SM-#501')).toBeTruthy()

    // 6 Sections present
    expect(screen.getByText(/1\. Material Specification/i)).toBeTruthy()
    expect(screen.getByText(/2\. Source & Provenance/i)).toBeTruthy()
    expect(screen.getByText(/3\. Packaging & Receiving/i)).toBeTruthy()
    expect(screen.getByText(/4\. Storage & Quality/i)).toBeTruthy()
    expect(screen.getByText(/5\. Quantities & Allocation Coverage/i)).toBeTruthy()

    // Honest disclosures
    expect(screen.getByText(/Physical Storage Location:/i)).toBeTruthy()
    expect(screen.getByText(/Quality Release Status:/i)).toBeTruthy()
    expect(screen.getByText(/In accordance with current ledger governance/i)).toBeTruthy()
  })

  it('opens Outward Issue modal when Issue action is clicked', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <StockTab storeId={10} />
        </MemoryRouter>
      )
    })

    const issueButtons = screen.getAllByText('📤 Issue')
    expect(issueButtons.length).toBeGreaterThan(0)

    // Click Issue on first balance row
    await act(async () => {
      fireEvent.click(issueButtons[0])
    })

    expect(screen.getByText(/\+ Issue Material Outward:/i)).toBeTruthy()
  })
})
