import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { BrowserRouter } from 'react-router-dom'
import RecordsPage from './RecordsPage'

// Mock axios API
vi.mock('../../api/axios', () => ({
  default: {
    get: vi.fn().mockResolvedValue({
      data: [
        {
          id: '101',
          order_id: '101',
          order_number: 'ORD-2026-0101',
          company_id: 2,
          company_name: 'CMHP',
          product_name: 'Arnica Montana MT',
          product_type: 'mother-tincture',
          product_type_display: 'Mother Tincture',
          batch_no: 'MT-001',
          batch_size: '500 L',
          dispatched_at: '2026-11-20T10:00:00Z',
          dispatched_by: 'Chemist_A',
          physically_dispatched: false,
          coa_returned: false,
          production_returned: false,
          documents: {
            attachment_1: { exists: true },
            attachment_2: { exists: true },
            attachment_3: { exists: true },
            attachment_4: { exists: true },
            attachment_5: { exists: true },
            attachment_6: { exists: true },
            bmr: { exists: true, has_bmr: true },
            coa: { exists: true },
            invoice: { exists: true },
          },
        },
      ],
    }),
    post: vi.fn().mockResolvedValue({ data: { message: 'Success' } }),
  },
}))

function renderWithStore(ui) {
  const store = configureStore({
    reducer: {
      erp: (state = { activeCompanyKey: 'cmhp', activeCompanyId: 2 }) => state,
    },
  })
  return render(
    <Provider store={store}>
      <BrowserRouter>{ui}</BrowserRouter>
    </Provider>
  )
}

describe('Dispatch Page & Records Page Mode Verification', () => {
  it('in dispatch mode, removes all attachments/BMR/COA viewing columns and displays lifecycle stage', async () => {
    renderWithStore(<RecordsPage mode="dispatch" />)

    // Verify Dispatch title and header
    expect(await screen.findByText('📦 Dispatch Management')).toBeTruthy()

    // Verify attachment and document viewing buttons/columns are NOT in the document
    expect(screen.queryByText('RM Requisition Slip')).toBeNull()
    expect(screen.queryByText('Bulk Release Slip')).toBeNull()
    expect(screen.queryByText('PM Requisition Slip')).toBeNull()
    expect(screen.queryByText('After Test')).toBeNull()
    expect(screen.queryByText('19-Pg BMR')).toBeNull()
    expect(screen.queryByText('CoA Sheet')).toBeNull()

    // Verify Dispatch-specific status and stage columns ARE present
    expect(screen.getByText('Current Stage & Lifecycle Status')).toBeTruthy()
    expect(screen.getByText('Dispatch Details')).toBeTruthy()
    expect(screen.getByText('📦 Packed & Ready for Dispatch')).toBeTruthy()
    expect(screen.getByText('BMR')).toBeTruthy() // Stepper
    expect(screen.getByText('QC Testing')).toBeTruthy() // Stepper
    expect(screen.getByText('Packaging')).toBeTruthy() // Stepper
  })

  it('in records mode, preserves compliance attachments 1-6, BMR and COA columns', async () => {
    renderWithStore(<RecordsPage mode="records" />)

    // Verify Records title
    expect(await screen.findByText('📋 Records')).toBeTruthy()

    // Verify attachment columns exist for compliance dossiers
    expect(screen.getByText('RM Requisition Slip')).toBeTruthy()
    expect(screen.getByText('Bulk Release Slip')).toBeTruthy()
    expect(screen.getByText('PM Requisition Slip')).toBeTruthy()
    expect(screen.getAllByText('Transfer Slip').length).toBeGreaterThan(0)
    expect(screen.getByText('19-Pg BMR')).toBeTruthy()
    expect(screen.getByText('CoA Sheet')).toBeTruthy()
  })
})
