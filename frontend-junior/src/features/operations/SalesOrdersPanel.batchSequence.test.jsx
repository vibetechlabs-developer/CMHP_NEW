import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import SalesOrdersPanel from './SalesOrdersPanel'
import { listSalesOrders } from './salesOrdersService'

vi.mock('../../hooks/usePermissions', () => ({
  default: () => ({
    loading: false,
    error: null,
    realCompanyId: 2,
    hasPermission: () => true,
    permissions: [],
  }),
}))

vi.mock('../../hooks/useAuth', () => ({
  default: () => ({
    user: {
      id: 1,
      username: 'admin',
      profile: {
        real_companies: [{ id: 2, code: 'CMHP', legal_name: 'CMHP Pharma' }],
      },
    },
  }),
}))

vi.mock('./SalesOrderFormModal', () => ({ default: () => null }))
vi.mock('./ImportSalesOrdersModal', () => ({ default: () => null }))
vi.mock('./salesOrdersService', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    listSalesOrders: vi.fn(),
    deleteSalesOrder: vi.fn(),
    updateOrderStatus: vi.fn(),
  }
})

describe('SalesOrdersPanel sequential batch numbering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('assigns unique, sequential batch numbers for multiple orders of the same company (e.g. Flexicare / GER)', async () => {
    // 3 orders for German Homeopathic (code: GER)
    const mockOrders = [
      {
        id: 9,
        reference: 'SO-20261115-001',
        customer_name: 'German Homeopathic',
        customer_code: 'GER',
        order_date: '2026-11-15',
        status: 'DRAFT',
        lines: [{ product_name: 'Flexicare', product_code: 'GER/06', product_type_snapshot: 'Tablet', quantity: 100 }],
      },
      {
        id: 8,
        reference: 'SO-20261114-001',
        customer_name: 'German Homeopathic',
        customer_code: 'GER',
        order_date: '2026-11-14',
        status: 'DRAFT',
        lines: [{ product_name: 'Flexicare', product_code: 'GER/06', product_type_snapshot: 'Capsule', quantity: 100 }],
      },
      {
        id: 2,
        reference: 'SO-20261111-001',
        customer_name: 'German Homeopathic',
        customer_code: 'GER',
        order_date: '2026-11-11',
        status: 'DRAFT',
        lines: [{ product_name: 'Flexicare', product_code: 'GER/06', product_type_snapshot: 'Capsule', quantity: 100 }],
      },
    ]

    listSalesOrders.mockResolvedValue({
      count: 3,
      results: mockOrders,
    })

    render(<SalesOrdersPanel />)

    // Wait for rows to render
    expect(await screen.findByText('GER-2026-0001')).toBeTruthy()
    expect(screen.getByText('GER-2026-0002')).toBeTruthy()
    expect(screen.getByText('GER-2026-0003')).toBeTruthy()

    // Ensure all 3 batch pills are present and none are duplicated
    const batchPills = screen.getAllByText(/^GER-2026-000[1-3]$/)
    expect(batchPills).toHaveLength(3)
  })

  it('maintains independent numbering sequences for different customer codes', async () => {
    const mockOrders = [
      {
        id: 1,
        reference: 'SO-20261110-001',
        customer_name: 'German Homeopathic',
        customer_code: 'GER',
        order_date: '2026-11-10',
        status: 'DRAFT',
        lines: [{ product_name: 'Flexicare', product_code: 'GER/06', quantity: 50 }],
      },
      {
        id: 2,
        reference: 'SO-20261111-001',
        customer_name: 'Synthetic Labs',
        customer_code: 'SYN',
        order_date: '2026-11-11',
        status: 'DRAFT',
        lines: [{ product_name: 'Paracetamol', product_code: 'SYN/01', quantity: 50 }],
      },
      {
        id: 3,
        reference: 'SO-20261112-001',
        customer_name: 'German Homeopathic',
        customer_code: 'GER',
        order_date: '2026-11-12',
        status: 'DRAFT',
        lines: [{ product_name: 'Flexicare', product_code: 'GER/06', quantity: 50 }],
      },
    ]

    listSalesOrders.mockResolvedValue({
      count: 3,
      results: mockOrders,
    })

    render(<SalesOrdersPanel />)

    // GER gets sequence 0001 and 0002; SYN gets sequence 0001
    expect(await screen.findByText('GER-2026-0001')).toBeTruthy()
    expect(screen.getByText('GER-2026-0002')).toBeTruthy()
    expect(screen.getByText('SYN-2026-0001')).toBeTruthy()
  })
})
