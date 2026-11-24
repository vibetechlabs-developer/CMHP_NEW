import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import React from 'react'
import { resolveSlipConfig, resolveQcSlip } from './slipRegistry'
import SyrupRmSlip, { getInitialSyrupRmData } from './SyrupRmSlip'
import SyrupPmSlip, { getInitialSyrupPmData } from './SyrupPmSlip'
import SyrupBulkReleaseSlip, { getInitialSyrupBulkReleaseData } from '../../quality/slips/SyrupBulkReleaseSlip'
import SyrupTestRequestBulkSlip, { getInitialSyrupTestRequestBulkData } from '../../quality/slips/SyrupTestRequestBulkSlip'
import BulkReleaseSlipEditor from '../../quality/BulkReleaseSlipEditor'
import TestRequestSlipEditor from '../../quality/TestRequestSlipEditor'

describe('Syrup Slips Suite', () => {
  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  describe('Registry & Product Type Detection', () => {
    it('detects Syrup from various dosage form casing and synonyms without hardcoding product id', () => {
      const p1 = { id: 101, name: 'Adel 1', dosage_form: 'Syrup' }
      const p2 = { id: 102, name: 'Adel 2', dosageForm: 'syrup' }
      const p3 = { id: 103, name: 'Cough Care', product_type: 'SYRUP' }

      const res1 = resolveSlipConfig(p1)
      const res2 = resolveSlipConfig(p2)
      const res3 = resolveSlipConfig(p3)

      expect(res1.typeKey).toBe('syrup')
      expect(res1.displayName).toBe('Syrup')
      expect(res1.isImplemented).toBe(true)
      expect(res1.config.rm.Component).toBe(SyrupRmSlip)
      expect(res1.config.pm.Component).toBe(SyrupPmSlip)

      expect(res2.typeKey).toBe('syrup')
      expect(res3.typeKey).toBe('syrup')
    })

    it('resolves QC slips for Syrup correctly', () => {
      const br = resolveQcSlip('bulkRelease', 'syrup')
      expect(br.isImplemented).toBe(true)
      expect(br.config.Component).toBe(SyrupBulkReleaseSlip)

      const trBulk = resolveQcSlip('testRequestBulk', 'syrup')
      expect(trBulk.isImplemented).toBe(true)
      expect(trBulk.config.Component).toBe(SyrupTestRequestBulkSlip)

      const trFp = resolveQcSlip('testRequestFp', 'syrup')
      expect(trFp.isImplemented).toBe(false)
      expect(trFp.config.customMessage).toBe('Attachment-5 (Test Request MT/FP) for Syrup will be attached soon.')
    })
  })

  describe('Syrup RM Requisition Slip (Attachment - 1)', () => {
    it('renders exact header, 10 RM rows, repeated header, EXCIPIENTS row, 5 excipients rows with shaded claim, checks, and approval footer', () => {
      const mockProduct = { name: 'Alfalfa Syrup', bmr_no: 'BMR-SYR-001', code: 'SYR-ALF' }
      const mockFormula = { code: 'MF-SYR-01' }
      const mockRevision = { revision_number: 1, effective_date: '12-04-2024' }
      const initial = getInitialSyrupRmData(mockProduct, mockFormula, mockRevision, [], { code: 'CMHP' })

      const { container } = render(
        <SyrupRmSlip
          data={initial}
          onChange={() => {}}
          product={mockProduct}
          formula={mockFormula}
          revision={mockRevision}
        />
      )

      // Header Department & BMR
      expect(screen.getByText('PRODUCTION ( ORAL LIQUID DEPARTMENT)')).toBeTruthy()
      expect(screen.getByText('BATCH MANUFACTURING RECORD (BMR)')).toBeTruthy()

      // Exact typo from docx: MASTER FOMULA NO. :
      expect(screen.getByText(/MASTER FOMULA NO\.\s*:/)).toBeTruthy()

      // Attachment 1 title
      expect(screen.getByText('ATTACHMENT - 1')).toBeTruthy()
      expect(screen.getByText('RAW MATERIAL REQUISITION SLIP')).toBeTruthy()
      expect(screen.getByText('BATCH FORMULA:')).toBeTruthy()

      // EXCIPIENTS header
      expect(screen.getByText('EXCIPIENTS')).toBeTruthy()

      // Check rows count: 10 main rows + 5 excipient rows
      expect(initial.main_rows.length).toBe(10)
      expect(initial.excipient_rows.length).toBe(5)

      // Excipient shaded cells (5 rows have shaded claim cell)
      const shadedCells = container.querySelectorAll('.syrup-shaded-claim-cell')
      expect(shadedCells.length).toBe(5)

      // Warehouse checks & Production / QA checks
      expect(screen.getByText(/Weight by\/Date \(Warehouse\)/)).toBeTruthy()
      expect(screen.getByText(/Weight check by\/Date \(Warehouse\)\s*:/)).toBeTruthy()
      expect(screen.getByText(/Checked by \/ Date \(Production\)\s*:/)).toBeTruthy()
      expect(screen.getByText(/Checked by \/ Date \(QA\)\s*:/)).toBeTruthy()

      // Approval table & bottom line
      expect(screen.getByText(/Production Chemist/)).toBeTruthy()
      expect(screen.getByText(/Production In-Charge/)).toBeTruthy()
      expect(screen.getByText(/QA Manager/)).toBeTruthy()
      expect(screen.getByText(/FORM NO\.\s+SOP\/QA\/04\/F-03\/00/)).toBeTruthy()
      expect(screen.getByText('Page 1 of 1')).toBeTruthy()
    })
  })

  describe('Syrup PM Requirement Slip (Attachment - 4)', () => {
    it('renders exact 11 fixed rows with bold names, 3 stacked checks, and approval footer', () => {
      const mockProduct = { name: 'Alfalfa Syrup', bmr_no: 'BMR-SYR-001', code: 'SYR-ALF' }
      const mockFormula = { code: 'MF-SYR-01' }
      const mockRevision = { revision_number: 1, effective_date: '12-04-2024' }
      const initial = getInitialSyrupPmData(mockProduct, mockFormula, mockRevision, [], { code: 'CMHP' })

      render(
        <SyrupPmSlip
          data={initial}
          onChange={() => {}}
          product={mockProduct}
          formula={mockFormula}
          revision={mockRevision}
        />
      )

      expect(screen.getByText('ATTACHMENT - 4')).toBeTruthy()
      expect(screen.getByText('PACKING MATERIAL REQUIREMENT:')).toBeTruthy()

      // Check all 11 fixed items
      const expectedItems = [
        'Label',
        'Mono Box',
        'Insert',
        'Hall Mark',
        'Bottle',
        'Plug',
        'Cap',
        'Inner',
        'Outer',
        'Measuring Cap',
        'Dropper',
      ]

      expectedItems.forEach((name) => {
        expect(screen.getByDisplayValue(name)).toBeTruthy()
      })

      // 3 stacked checks
      expect(screen.getByText('Checked By (Warehouse)')).toBeTruthy()
      expect(screen.getByText('Received By (Production)')).toBeTruthy()
      expect(screen.getByText('Verified by ( QA)')).toBeTruthy()

      // Approval table
      expect(screen.getByText(/FORM NO\.\s+SOP\/QA\/04\/F-03\/00/)).toBeTruthy()
      expect(screen.getByText('Page 1 of 1')).toBeTruthy()
    })
  })

  describe('Syrup Bulk Release Slip (Attachment-3)', () => {
    it('renders exact docx layout, 4 tests with limits, and exact signature labels', () => {
      const initial = getInitialSyrupBulkReleaseData({
        product: 'Kof-Aid Syrup',
        batch_no: 'SYR-555',
        tr_no: 'TR-1234',
        mfg_date: '10-2024',
        batch_size: '500',
        batch_qty: '500',
      })

      render(<SyrupBulkReleaseSlip data={initial} onChange={() => {}} />)

      expect(screen.getByDisplayValue('CMHP PRIVATE LIMITED')).toBeTruthy()
      expect(screen.getByDisplayValue('QUALITY CONTROL')).toBeTruthy()
      expect(screen.getByDisplayValue(/BULK\s+RELEASE SLIP/)).toBeTruthy()
      expect(screen.getByDisplayValue('Attachment-3')).toBeTruthy()
      expect(screen.getByDisplayValue('FORM NO.: SOP/QC/03/F-02/00')).toBeTruthy()
      expect(screen.getByDisplayValue('Kof-Aid Syrup')).toBeTruthy()
      expect(screen.getByDisplayValue('SYR-555')).toBeTruthy()
      expect(screen.getByDisplayValue('05')).toBeTruthy()
      expect(screen.getByDisplayValue('Years')).toBeTruthy()
      expect(screen.getByDisplayValue('LTR')).toBeTruthy()

      // 4 tests
      expect(screen.getByDisplayValue(/•\s+Description:/)).toBeTruthy()
      expect(screen.getByDisplayValue(/•\s+pH:/)).toBeTruthy()
      expect(screen.getByDisplayValue(/•\s*Wt\/ml\s*:/)).toBeTruthy()
      expect(screen.getByDisplayValue(/•\s*Alcohol\s*:/)).toBeTruthy()

      // Exact signature labels with odd spellings preserved
      expect(screen.getByDisplayValue(/Sign By \/ Date \(QC\)\s*:/)).toBeTruthy()
      expect(screen.getByDisplayValue(/Recieved By \/ Date \(QA\)\s*:/)).toBeTruthy()
      expect(screen.getByDisplayValue('Status : The above batch of Bulk sample is released for filling / compression.')).toBeTruthy()
      expect(screen.getByDisplayValue('Sign By./ Date (QA) :')).toBeTruthy()
      expect(screen.getByDisplayValue('Received By / Date ( Production)')).toBeTruthy()
    })
  })

  describe('Syrup Test Request (Bulk) - Attachment-2', () => {
    it('renders 2 copies in DOM, exact PDF text, and grey input areas', () => {
      const initial = getInitialSyrupTestRequestBulkData({
        product: 'Kof-Aid Syrup',
        product_code: 'SYR-KOF',
        batch_no: 'SYR-555',
        batch_size: '500 L',
      })

      const { container } = render(<SyrupTestRequestBulkSlip data={initial} onChange={() => {}} />)

      const sheets = container.querySelectorAll('.tablet-tr-sheet')
      expect(sheets.length).toBe(2)
      expect(sheets[1].classList.contains('print-only-copy')).toBe(true)

      // Test to be performed line
      expect(screen.getAllByDisplayValue('1) BULK / MT : Description / pH / Wt.per ml / Alcohol Content/ Viscosity / Total Solids / Lamda Max').length).toBe(2)

      // Bottom label
      expect(screen.getAllByDisplayValue('FP – Finish Product samples').length).toBe(2)
    })
  })

  describe('Material QC Page Integration & Persistence', () => {
    it('saves Syrup Bulk Release slip and reloads saved edits', async () => {
      const { unmount } = render(
        <BulkReleaseSlipEditor productType="syrup" initialData={{ batch_no: 'SYP-999', product: 'Syrup A', tr_no: 'TR-100' }} />
      )

      expect(screen.getByDisplayValue('Syrup A')).toBeTruthy()

      // Edit product name
      const prodInput = screen.getByDisplayValue('Syrup A')
      fireEvent.change(prodInput, { target: { value: 'Syrup A Special Edition' } })

      // Click save
      const saveBtn = screen.getByRole('button', { name: /save slip/i })
      fireEvent.click(saveBtn)

      await waitFor(() => {
        expect(screen.getByText(/Syrup Bulk Release Slip saved/i)).toBeTruthy()
      })

      unmount()

      // Re-render same batch: saved value must be loaded
      render(
        <BulkReleaseSlipEditor productType="syrup" initialData={{ batch_no: 'SYP-999', product: 'Syrup A', tr_no: 'TR-100' }} />
      )
      expect(screen.getByDisplayValue('Syrup A Special Edition')).toBeTruthy()
    })

    it('isolates saved slips between different batches', async () => {
      // Save batch 1
      const { unmount: unmount1 } = render(
        <BulkReleaseSlipEditor productType="syrup" initialData={{ batch_no: 'BATCH-001', product: 'Syrup 1' }} />
      )
      fireEvent.change(screen.getByDisplayValue('Syrup 1'), { target: { value: 'Syrup 1 Custom' } })
      fireEvent.click(screen.getByRole('button', { name: /save slip/i }))
      await waitFor(() => expect(screen.getByText(/Syrup Bulk Release Slip saved/i)).toBeTruthy())
      unmount1()

      // Open batch 2: must have its own data and not inherit Batch 1 custom edits
      render(
        <BulkReleaseSlipEditor productType="syrup" initialData={{ batch_no: 'BATCH-002', product: 'Syrup 2' }} />
      )
      expect(screen.getByDisplayValue('Syrup 2')).toBeTruthy()
      expect(screen.queryByDisplayValue('Syrup 1 Custom')).toBeNull()
    })
  })
})
