import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import React from 'react'
import QcOrderSlipList from './QcOrderSlipList'

describe('Task 2 & 3: QC Order-wise Slips and Navigation Cards', () => {
  beforeEach(() => {
    cleanup()
  })

  const mockOrders = [
    {
      id: 1,
      orderNumber: 'ORD-001',
      productName: 'Arnica Montana MT',
      productType: 'mother-tincture',
      productTypeDisplay: 'Mother Tincture',
      batchNo: 'MT-1001',
      batchSize: '500 L',
      orderDate: '2026-11-20',
      qcStatus: 'PENDING',
    },
    {
      id: 2,
      orderNumber: 'ORD-002',
      productName: 'Calcium D3 Tablet',
      productType: 'tablet',
      productTypeDisplay: 'Tablet',
      batchNo: 'TAB-2002',
      batchSize: '100000 Tabs',
      orderDate: '2026-11-22',
      qcStatus: 'SAVED',
    },
    {
      id: 3,
      orderNumber: 'ORD-003',
      productName: 'Cough Syrup',
      productType: 'syrup',
      productTypeDisplay: 'Syrup',
      batchNo: 'SYR-3003',
      batchSize: '2000 Bottles',
      orderDate: '2026-11-24',
      qcStatus: 'COMPLETED',
    },
  ]

  it('renders pending orders table with correct columns and status pills', () => {
    const onOpenSlip = vi.fn()
    const onMarkComplete = vi.fn()

    render(
      <QcOrderSlipList
        slipKind="bulk_release"
        orders={mockOrders}
        loading={false}
        filters={{ search: '', productType: 'ALL', dateFrom: '', dateTo: '', datePreset: '' }}
        onFilterChange={() => {}}
        onResetFilters={() => {}}
        onOpenSlip={onOpenSlip}
        onMarkComplete={onMarkComplete}
        onReturnToPending={() => {}}
      />
    )

    // Should show pending and saved orders (ORD-001, ORD-002) in Pending view
    expect(screen.getByText('ORD-001')).toBeTruthy()
    expect(screen.getByText('Arnica Montana MT')).toBeTruthy()
    expect(screen.getByText('MT-1001')).toBeTruthy()

    expect(screen.getByText('ORD-002')).toBeTruthy()
    expect(screen.getByText('Calcium D3 Tablet')).toBeTruthy()
    expect(screen.getByText('TAB-2002')).toBeTruthy()

    // ORD-003 is COMPLETED, so it should not appear in pending view
    expect(screen.queryByText('ORD-003')).toBeNull()

    // Sub-nav count badges
    expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('1')).toBeTruthy() // 1 completed
  })

  it('switches between Pending and Completed views', () => {
    const onReturnToPending = vi.fn()

    render(
      <QcOrderSlipList
        slipKind="test_request"
        orders={mockOrders}
        loading={false}
        filters={{ search: '', productType: 'ALL', dateFrom: '', dateTo: '', datePreset: '' }}
        onFilterChange={() => {}}
        onResetFilters={() => {}}
        onOpenSlip={() => {}}
        onMarkComplete={() => {}}
        onReturnToPending={onReturnToPending}
      />
    )

    // Click Completed Slips button
    const completedTabBtn = screen.getByRole('button', { name: /Completed Slips/i })
    fireEvent.click(completedTabBtn)

    // Now ORD-003 should be visible and ORD-001/ORD-002 should not
    expect(screen.getByText('ORD-003')).toBeTruthy()
    expect(screen.getByText('Cough Syrup')).toBeTruthy()
    expect(screen.queryByText('ORD-001')).toBeNull()
    expect(screen.queryByText('ORD-002')).toBeNull()

    // Completed view has View Slip and Return buttons
    const returnBtn = screen.getByRole('button', { name: /Return/i })
    fireEvent.click(returnBtn)
    expect(onReturnToPending).toHaveBeenCalledWith(mockOrders[2])
  })

  it('filters by search keyword (order number, product name, batch no)', () => {
    const onFilterChange = vi.fn()

    render(
      <QcOrderSlipList
        slipKind="bulk_release"
        orders={mockOrders}
        loading={false}
        filters={{ search: 'Arnica', productType: 'ALL', dateFrom: '', dateTo: '', datePreset: '' }}
        onFilterChange={onFilterChange}
        onResetFilters={() => {}}
        onOpenSlip={() => {}}
        onMarkComplete={() => {}}
        onReturnToPending={() => {}}
      />
    )

    // Only Arnica Montana MT should match
    expect(screen.getByText('ORD-001')).toBeTruthy()
    expect(screen.queryByText('ORD-002')).toBeNull()
  })

  it('filters by product type dropdown', () => {
    render(
      <QcOrderSlipList
        slipKind="bulk_release"
        orders={mockOrders}
        loading={false}
        filters={{ search: '', productType: 'tablet', dateFrom: '', dateTo: '', datePreset: '' }}
        onFilterChange={() => {}}
        onResetFilters={() => {}}
        onOpenSlip={() => {}}
        onMarkComplete={() => {}}
        onReturnToPending={() => {}}
      />
    )

    // Only Tablet should match
    expect(screen.getByText('ORD-002')).toBeTruthy()
    expect(screen.queryByText('ORD-001')).toBeNull()
  })

  it('filters by date range', () => {
    render(
      <QcOrderSlipList
        slipKind="bulk_release"
        orders={mockOrders}
        loading={false}
        filters={{ search: '', productType: 'ALL', dateFrom: '2026-11-21', dateTo: '2026-11-23', datePreset: '' }}
        onFilterChange={() => {}}
        onResetFilters={() => {}}
        onOpenSlip={() => {}}
        onMarkComplete={() => {}}
        onReturnToPending={() => {}}
      />
    )

    // ORD-002 is 2026-11-22 (within range), ORD-001 is 2026-11-20 (outside range)
    expect(screen.getByText('ORD-002')).toBeTruthy()
    expect(screen.queryByText('ORD-001')).toBeNull()
  })

  it('combines filters (AND logic) and shows empty state when nothing matches', () => {
    render(
      <QcOrderSlipList
        slipKind="bulk_release"
        orders={mockOrders}
        loading={false}
        filters={{ search: 'Nonexistent', productType: 'tablet', dateFrom: '', dateTo: '', datePreset: '' }}
        onFilterChange={() => {}}
        onResetFilters={() => {}}
        onOpenSlip={() => {}}
        onMarkComplete={() => {}}
        onReturnToPending={() => {}}
      />
    )

    expect(screen.getByText('No orders found.')).toBeTruthy()
  })

  it('calls onOpenSlip and onMarkComplete when action buttons are clicked', () => {
    const onOpenSlip = vi.fn()
    const onMarkComplete = vi.fn()

    render(
      <QcOrderSlipList
        slipKind="bulk_release"
        orders={mockOrders}
        loading={false}
        filters={{ search: '', productType: 'ALL', dateFrom: '', dateTo: '', datePreset: '' }}
        onFilterChange={() => {}}
        onResetFilters={() => {}}
        onOpenSlip={onOpenSlip}
        onMarkComplete={onMarkComplete}
        onReturnToPending={() => {}}
      />
    )

    // Find Open Slip buttons
    const openBtns = screen.getAllByRole('button', { name: /Open Slip/i })
    expect(openBtns.length).toBe(2)
    fireEvent.click(openBtns[0])
    expect(onOpenSlip).toHaveBeenCalledWith(mockOrders[0], false)

    // Find Mark Complete buttons (in table rows)
    const completeBtns = screen.getAllByRole('button', { name: /✓ Complete/i })
    fireEvent.click(completeBtns[0])
    expect(onMarkComplete).toHaveBeenCalledWith(mockOrders[0])
  })
})
