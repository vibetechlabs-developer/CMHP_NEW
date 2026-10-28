import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import StoreDashboard from './StoreDashboard'
import { listGoodsReceipts } from './receivingService'
import { listMaterials, listRecordedReceiptBalances } from './storeService'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock('./receivingService', () => ({ listGoodsReceipts: vi.fn() }))
vi.mock('./storeService', () => ({
  listMaterials: vi.fn(),
  listRecordedReceiptBalances: vi.fn(),
}))

function renderDashboard(props = {}) {
  return render(
    <MemoryRouter>
      <StoreDashboard storeId={5} storeLabel="Synthetic Warehouse" storesReady {...props} />
    </MemoryRouter>
  )
}

afterEach(cleanup)

beforeEach(() => {
  vi.clearAllMocks()
  listMaterials.mockResolvedValue({
    count: 0,
    results: [],
  })
  listGoodsReceipts.mockResolvedValue({ count: 0, results: [] })
  listRecordedReceiptBalances.mockResolvedValue({ count: 0, results: [] })
})

describe('Store / Inventory Dashboard UI & functionality', () => {
  it('renders the header with title, subtitle, and action buttons', async () => {
    renderDashboard()
    expect(await screen.findByText('Inventory Overview & Analytics')).toBeTruthy()
    expect(
      screen.getByText(/Real-time pharmaceutical inventory metrics, stock valuation, and quality control/i)
    ).toBeTruthy()

    expect(screen.getByRole('button', { name: /Products Catalog/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Raw Materials Store/i })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /View Orders/i }).length).toBe(2)
  })

  it('renders the 5 KPI metric cards from the reference design', async () => {
    renderDashboard()
    expect(await screen.findByText('Finished Products')).toBeTruthy()
    expect(screen.getByText('Raw Materials & APIs')).toBeTruthy()
    expect(screen.getByText('Total Inventory Value')).toBeTruthy()
    expect(screen.getByText('Stock Reorder Alerts')).toBeTruthy()
    expect(screen.getByText('Lots Pending QC')).toBeTruthy()

    // Combined stock valuation label
    expect(screen.getByText('Combined stock valuation')).toBeTruthy()
  })

  it('renders Stock Health & Availability breakdown card and legend', async () => {
    renderDashboard()
    expect(await screen.findByText('Stock Health & Availability')).toBeTruthy()
    expect(screen.getByText('Breakdown across Products and Raw Materials')).toBeTruthy()
    expect(screen.getByText(/0 of 1 In Stock/i)).toBeTruthy()
    expect(screen.getByText(/In Stock \(/i)).toBeTruthy()
    expect(screen.getByText(/Low Stock \(/i)).toBeTruthy()
    expect(screen.getByText(/Out of Stock \(/i)).toBeTruthy()
  })

  it('renders Valuation Breakdown card with individual figures', async () => {
    renderDashboard()
    expect(await screen.findByText('Valuation Breakdown')).toBeTruthy()
    expect(screen.getByText('Capital deployed in warehouse storage')).toBeTruthy()
    expect(screen.getByText('Finished Products Valuation')).toBeTruthy()
    expect(screen.getByText('Raw Materials Valuation')).toBeTruthy()
    expect(screen.getByText('Total Registered SKUs')).toBeTruthy()
    expect(screen.getByText('Lots Pending Quality Approval')).toBeTruthy()
  })

  it('renders Inventory Alerts & Reorders list with Dolo item', async () => {
    renderDashboard()
    expect(await screen.findByText('Inventory Alerts & Reorders')).toBeTruthy()
    expect(screen.getByText(/001 · Dolo/i)).toBeTruthy()
    expect(screen.getByText(/Stock: 100 \(Reorder: 250\)/i)).toBeTruthy()
    expect(screen.getByText('Low Stock')).toBeTruthy()
  })

  it('renders Common Inventory Modules shortcuts and allows navigation', async () => {
    renderDashboard()
    expect(await screen.findByText('Common Inventory Modules')).toBeTruthy()

    const rawModule = screen.getByRole('button', { name: /APIs & Excipients/i })
    expect(rawModule).toBeTruthy()
    fireEvent.click(rawModule)
    expect(mockNavigate).toHaveBeenCalledWith('/inventory/materials')
  })

  it('navigates to orders when View Orders button is clicked', async () => {
    renderDashboard()
    const viewOrdersBtns = await screen.findAllByRole('button', { name: /View Orders/i })
    fireEvent.click(viewOrdersBtns[0])
    expect(mockNavigate).toHaveBeenCalledWith('/orders')
  })
})
