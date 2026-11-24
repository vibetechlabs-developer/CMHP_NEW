import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import React from 'react'
import { resolveQcSlip, resolveSlipConfig } from '../formulas/slips/slipRegistry'
import TabletTestRequestBulkSlip, { getInitialTabletTestRequestBulkData } from './slips/TabletTestRequestBulkSlip'
import TabletTestRequestFpSlip, { getInitialTabletTestRequestFpData } from './slips/TabletTestRequestFpSlip'
import TabletBulkReleaseSlip, { getInitialTabletBulkReleaseData } from './slips/TabletBulkReleaseSlip'
import OilRmSlip, { getInitialOilRmData } from '../formulas/slips/OilRmSlip'
import OilPmSlip, { getInitialOilPmData } from '../formulas/slips/OilPmSlip'
import MotherTinctureRmSlip, { getInitialMotherTinctureRmData } from '../formulas/slips/MotherTinctureRmSlip'
import MotherTinctureBulkReleaseSlip, { getInitialMotherTinctureBulkReleaseData } from './slips/MotherTinctureBulkReleaseSlip'
import BulkReleaseSlipEditor from './BulkReleaseSlipEditor'
import TestRequestSlipEditor from './TestRequestSlipEditor'

describe('Material QC Slips & Registry', () => {
  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  it('resolves tablet QC slips correctly from registry', () => {
    const bulkTr = resolveQcSlip('testRequestBulk', 'tablet')
    expect(bulkTr.isImplemented).toBe(true)
    expect(bulkTr.typeKey).toBe('tablet')
    expect(bulkTr.config.Component).toBe(TabletTestRequestBulkSlip)

    const fpTr = resolveQcSlip('testRequestFp', 'tablet')
    expect(fpTr.isImplemented).toBe(true)
    expect(fpTr.config.Component).toBe(TabletTestRequestFpSlip)

    const br = resolveQcSlip('bulkRelease', 'tablet')
    expect(br.isImplemented).toBe(true)
    expect(br.config.Component).toBe(TabletBulkReleaseSlip)
  })

  it('resolves oil as generic oil for bulk release and test request bulk', () => {
    const brOil = resolveQcSlip('bulkRelease', 'oil')
    expect(brOil.isGenericOil).toBe(true)

    const trOil = resolveQcSlip('testRequestBulk', 'oil')
    expect(trOil.isGenericOil).toBe(true)

    const fpOil = resolveQcSlip('testRequestFp', 'oil')
    expect(fpOil.isImplemented).toBe(false)
  })

  it('resolves syrup QC slips correctly from registry', () => {
    const sypBr = resolveQcSlip('bulkRelease', 'syrup')
    expect(sypBr.isImplemented).toBe(true)

    const sypTr = resolveQcSlip('testRequestBulk', 'syrup')
    expect(sypTr.isImplemented).toBe(true)

    const sypFp = resolveQcSlip('testRequestFp', 'syrup')
    expect(sypFp.isImplemented).toBe(false)
  })

  it('resolves other types (e.g. Drops, Capsule) as placeholders', () => {
    const dropsBr = resolveQcSlip('bulkRelease', 'drops')
    expect(dropsBr.isImplemented).toBe(false)

    const dropsTr = resolveQcSlip('testRequestBulk', 'drops')
    expect(dropsTr.isImplemented).toBe(false)

    const capBr = resolveQcSlip('bulkRelease', 'capsule')
    expect(capBr.isImplemented).toBe(false)
  })

  it('renders Tablet Bulk Release Slip with all required docx text and editable values', () => {
    const initial = getInitialTabletBulkReleaseData({
      product: 'Calcium D3 Tablet',
      batch_no: 'TAB-101',
      tr_no: 'TR-999',
    })
    render(
      <TabletBulkReleaseSlip data={initial} onChange={() => {}} />
    )

    // Check headings and exact spellings from docx
    expect(screen.getByDisplayValue(/BULK\s+RELEASE SLIP/)).toBeTruthy()
    expect(screen.getByDisplayValue(/ATTACHMENT\s*-\s*3/)).toBeTruthy()
    expect(screen.getByDisplayValue('FORM NO.: SOP/QC/03/F-02/00')).toBeTruthy()
    expect(screen.getByDisplayValue('Calcium D3 Tablet')).toBeTruthy()
    expect(screen.getByDisplayValue('TAB-101')).toBeTruthy()
    expect(screen.getByDisplayValue('• Description:')).toBeTruthy()
    expect(screen.getByDisplayValue('• Avg. weight of Tablet:')).toBeTruthy()
    expect(screen.getByDisplayValue('• Weight of 20 Tablets:')).toBeTruthy()
    expect(screen.getByDisplayValue('• Diameter:')).toBeTruthy()
    expect(screen.getByDisplayValue('• Thickness:')).toBeTruthy()
    expect(screen.getByDisplayValue('• Loss on Drying:')).toBeTruthy()
    expect(screen.getByDisplayValue('• Total Ash:')).toBeTruthy()
    expect(screen.getByDisplayValue(/Recieved By \/ Date \(QA\)/)).toBeTruthy()
    expect(screen.getByDisplayValue(/Status : The above batch of Bulk sample is released for filling \/ compression\./)).toBeTruthy()
  })

  it('renders Tablet Attachment-2 Test Request (Bulk) with 2 copies (1 on screen, 1 print-only-copy)', () => {
    const initial = getInitialTabletTestRequestBulkData({
      product: 'Paracetamol Tablet',
      batch_no: 'B-202',
    })
    const { container } = render(
      <TabletTestRequestBulkSlip data={initial} onChange={() => {}} />
    )

    const subtitleEls = screen.getAllByDisplayValue(/PRODUCTION\s+\(ATTACHMENT\s*-\s*2\)/)
    expect(subtitleEls.length).toBe(2)

    const slipEls = screen.getAllByDisplayValue(/TEST REQUEST \(BULK\s*\)/)
    expect(slipEls.length).toBe(2)

    // 2 copies in DOM (screen copy + print-only-copy)
    const sheets = container.querySelectorAll('.tablet-tr-sheet')
    expect(sheets.length).toBe(2)
    expect(sheets[1].classList.contains('print-only-copy')).toBe(true)
  })

  it('renders Tablet Attachment-5 Test Request (MT/FP) with exact FP text', () => {
    const initial = getInitialTabletTestRequestFpData({
      product: 'Paracetamol Tablet',
      batch_no: 'B-202',
    })
    const { container } = render(
      <TabletTestRequestFpSlip data={initial} onChange={() => {}} />
    )

    // Exact sheet differences: PRODUCTION  (ATTACHMENT 5) [no dash], TEST REQUEST (MT/FP )
    const subtitleEls = screen.getAllByDisplayValue(/PRODUCTION\s+\(ATTACHMENT 5\)/)
    expect(subtitleEls.length).toBe(2)

    const slipEls = screen.getAllByDisplayValue(/TEST REQUEST \(MT\/FP\s*\)/)
    expect(slipEls.length).toBe(2)

    expect(screen.getAllByDisplayValue('1) FP').length).toBe(2)
    expect(screen.getAllByDisplayValue('Complete Analysis').length).toBe(2)
    expect(screen.getAllByDisplayValue(/FP – Finish Product samples/).length).toBe(2)
  })

  it('shows placeholder and disables buttons when product type has no implemented slip', () => {
    render(
      <BulkReleaseSlipEditor productType="drops" initialData={{ batch_no: 'DRP-01' }} />
    )
    expect(screen.getByText('Attachment-3 (Bulk Release Slip) for Drops will be attached soon.')).toBeTruthy()

    const saveBtn = screen.getByRole('button', { name: /save slip/i })
    expect(saveBtn.disabled).toBe(true)

    const blankBtn = screen.getByRole('button', { name: /blank/i })
    expect(blankBtn.disabled).toBe(true)
  })

  it('shows placeholder for Syrup Attachment-5 (Test Request MT/FP)', () => {
    render(
      <TestRequestSlipEditor productType="syrup" initialData={{ batch_no: 'SYP-01' }} />
    )
    // Starts in Bulk: Syrup Attachment-2 is rendered
    expect(screen.getAllByDisplayValue(/TEST REQUEST \(BULK\s*\)/).length).toBe(2)

    // Switch to FP: Attachment-5 placeholder must show with disabled buttons
    const fpBtn = screen.getByRole('button', { name: /FP \/ MT \(Attachment-5\)/i })
    fireEvent.click(fpBtn)

    expect(screen.getByText('Attachment-5 (Test Request MT/FP) for Syrup will be attached soon.')).toBeTruthy()
    expect(screen.getByRole('button', { name: /save slip/i }).disabled).toBe(true)
    expect(screen.getByRole('button', { name: /blank/i }).disabled).toBe(true)
  })

  it('allows switching between Bulk (Attachment-2) and FP / MT (Attachment-5) inside TestRequestSlipEditor', () => {
    render(
      <TestRequestSlipEditor productType="tablet" initialData={{ batch_no: 'TAB-300' }} />
    )

    // Starts in Bulk
    expect(screen.getAllByDisplayValue(/PRODUCTION\s+\(ATTACHMENT\s*-\s*2\)/).length).toBe(2)

    // Click FP / MT switch
    const fpBtn = screen.getByRole('button', { name: /FP \/ MT \(Attachment-5\)/i })
    fireEvent.click(fpBtn)

    expect(screen.getAllByDisplayValue(/PRODUCTION\s+\(ATTACHMENT 5\)/).length).toBe(2)
    expect(screen.getAllByDisplayValue(/FP – Finish Product samples/).length).toBe(2)
  })

  it('saves Tablet Bulk Release Slip and isolates data by batch', () => {
    // 1. Render for Batch 1 and save
    const { unmount } = render(
      <BulkReleaseSlipEditor productType="tablet" initialData={{ batch_no: 'TAB-B1', product: 'Product 1' }} />
    )
    const saveBtn = screen.getByRole('button', { name: /save slip/i })
    fireEvent.click(saveBtn)
    unmount()

    // Verify storage has saved envelope with layoutId and productType
    const savedRaw = localStorage.getItem('cmhp_qc_slip_v1_bulk_release_tablet_TAB-B1')
    expect(savedRaw).toBeTruthy()
    const saved = JSON.parse(savedRaw)
    expect(saved.productType).toBe('tablet')
    expect(saved.layoutId).toBe('tablet-att3-v1')
    expect(saved.batchNo).toBe('TAB-B1')
    expect(saved.data.product).toBe('Product 1')

    // 2. Render for Batch 2: must show Batch 2's own data, not Batch 1's
    render(
      <BulkReleaseSlipEditor productType="tablet" initialData={{ batch_no: 'TAB-B2', product: 'Product 2' }} />
    )
    expect(screen.getByDisplayValue('Product 2')).toBeTruthy()
    expect(screen.queryByDisplayValue('Product 1')).toBeNull()
  })

  it('saves Tablet Test Request and isolates data between Bulk and FP', () => {
    // 1. Render Test Request Bulk for TAB-X1 and save
    const { unmount } = render(
      <TestRequestSlipEditor productType="tablet" initialData={{ batch_no: 'TAB-X1', product: 'Product X' }} />
    )
    const saveBtn = screen.getByRole('button', { name: /save slip/i })
    fireEvent.click(saveBtn)
    unmount()

    const savedBulk = localStorage.getItem('cmhp_qc_slip_v1_test_request_bulk_tablet_TAB-X1')
    expect(savedBulk).toBeTruthy()
    const parsedBulk = JSON.parse(savedBulk)
    expect(parsedBulk.layoutId).toBe('tablet-att2-v1')
    expect(parsedBulk.data.slip_name).toBe('TEST REQUEST (BULK )')

    // 2. Render Test Request FP for TAB-X1 and save
    render(
      <TestRequestSlipEditor productType="tablet" initialData={{ batch_no: 'TAB-X1', product: 'Product X' }} />
    )
    const fpBtn = screen.getByRole('button', { name: /FP \/ MT \(Attachment-5\)/i })
    fireEvent.click(fpBtn)
    const saveBtnFp = screen.getByRole('button', { name: /save slip/i })
    fireEvent.click(saveBtnFp)

    const savedFp = localStorage.getItem('cmhp_qc_slip_v1_test_request_fp_tablet_TAB-X1')
    expect(savedFp).toBeTruthy()
    const parsedFp = JSON.parse(savedFp)
    expect(parsedFp.layoutId).toBe('tablet-att5-v1')
    expect(parsedFp.data.slip_name).toBe('TEST REQUEST (MT/FP )')
  })

  it('resolves Oil RM and PM slips correctly in Formulas slip registry', () => {
    const oilProduct = { dosage_form: 'Oil', name: 'Arnica Hair Oil' }
    const slipConfig = resolveSlipConfig(oilProduct)
    expect(slipConfig.typeKey).toBe('oil')
    expect(slipConfig.isImplemented).toBe(true)
    expect(slipConfig.config.rm.Component).toBe(OilRmSlip)
    expect(slipConfig.config.rm.isPlaceholder).toBe(false)
    expect(slipConfig.config.pm.Component).toBe(OilPmSlip)
    expect(slipConfig.config.pm.isPlaceholder).toBe(false)
  })

  it('renders Oil RM Requisition Slip with exact 10 rows, department and approval footer', () => {
    const initial = getInitialOilRmData(
      { name: 'Cantharis Hair Oil', code: 'CHO-01', bmr_no: 'BMR-OIL-01' },
      { code: 'MF-CHO' },
      { revision_number: 1 },
      [{ material: { code: 'RM001', name: 'Cantharis Q' }, quantity: 5, unit: 'L' }]
    )
    const { container } = render(<OilRmSlip data={initial} onChange={() => {}} />)

    expect(screen.getByText('PRODUCTION ( EXTERNAL PREPERATION DEPARTMENT)')).toBeTruthy()
    expect(screen.getByText('RAW MATERIAL REQUISITION SLIP')).toBeTruthy()
    expect(screen.getByText('BATCH FORMULA:')).toBeTruthy()
    expect(screen.getByText('Weight by/Date (Warehouse)')).toBeTruthy()
    expect(screen.getByText('Weight check by/Date (Warehouse) :')).toBeTruthy()
    expect(screen.getByText('Checked by / Date (Production) :')).toBeTruthy()
    expect(screen.getByText('Checked by / Date (QA) :')).toBeTruthy()

    // Exactly 10 rows in master table
    const tbody = container.querySelector('.tablet-slip-table tbody')
    expect(tbody.querySelectorAll('tr').length).toBe(10)

    // Approval footer
    expect(screen.getByText(/Prepared By/)).toBeTruthy()
    expect(screen.getByText(/Production Chemist/)).toBeTruthy()
    expect(screen.getByText('FORM NO. SOP/QA/04/F-04/00')).toBeTruthy()
  })

  it('renders Oil PM Requirement Slip with exact 11 fixed items (Label to Droper)', () => {
    const initial = getInitialOilPmData(
      { name: 'Arnica Hair Oil', code: 'AHO-01' },
      { code: 'MF-AHO' },
      { revision_number: 1 }
    )
    const { container } = render(<OilPmSlip data={initial} onChange={() => {}} />)

    expect(screen.getByText('PRODUCTION ( ORAL LIQUID DEPARTMENT)')).toBeTruthy()
    expect(screen.getByText('PACKING MATERIAL REQUIREMENT:')).toBeTruthy()
    expect(screen.getByText('PM Requisition Slip No.')).toBeTruthy()

    // Check fixed items
    expect(screen.getByDisplayValue('Label')).toBeTruthy()
    expect(screen.getByDisplayValue('Mono Box')).toBeTruthy()
    expect(screen.getByDisplayValue('Insert')).toBeTruthy()
    expect(screen.getByDisplayValue('Hall Mark')).toBeTruthy()
    expect(screen.getByDisplayValue('Bottle')).toBeTruthy()
    expect(screen.getByDisplayValue('Plug')).toBeTruthy()
    expect(screen.getByDisplayValue('Cap')).toBeTruthy()
    expect(screen.getByDisplayValue('Inner')).toBeTruthy()
    expect(screen.getByDisplayValue('Outer')).toBeTruthy()
    expect(screen.getByDisplayValue('Measuring Cap')).toBeTruthy()
    expect(screen.getByDisplayValue('Droper')).toBeTruthy()

    // Exactly 11 rows in master table
    const tbody = container.querySelector('.tablet-slip-table tbody')
    expect(tbody.querySelectorAll('tr').length).toBe(11)

    expect(screen.getByText('Checked By (Warehouse)')).toBeTruthy()
    expect(screen.getByText('Received By (Production)')).toBeTruthy()
    expect(screen.getByText('Verified by ( QA)')).toBeTruthy()
    expect(screen.getByText('FORM NO. SOP/QA/04/F-04/00')).toBeTruthy()
  })

  it('renders Oil Bulk Release Slip with all 8 oil tests and exact docx sign-offs', () => {
    render(
      <BulkReleaseSlipEditor productType="oil" initialData={{ batch_no: 'OIL-B10', product: 'Mahabhringraj Oil' }} />
    )

    expect(screen.getAllByText(/BULK\s+RELEASE SLIP/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Attachment-3')).toBeTruthy()
    expect(screen.getByText('FORM NO.: SOP/QC/03/F-02/00')).toBeTruthy()
    expect(screen.getByText(/• Appearance:/)).toBeTruthy()
    expect(screen.getByText(/• Odor/)).toBeTruthy()
    expect(screen.getByText(/• Wt\/ml :/)).toBeTruthy()
    expect(screen.getByText(/• Viscosity :/)).toBeTruthy()
    expect(screen.getByText(/• Acid Value :/)).toBeTruthy()
    expect(screen.getByText(/• Peroxide Value :/)).toBeTruthy()
    expect(screen.getByText(/• Iodine Value :/)).toBeTruthy()
    expect(screen.getByText(/• Saponification Value:/)).toBeTruthy()

    expect(screen.getByText(/Recieved By \/ Date \(QA\)/)).toBeTruthy()
    expect(screen.getByText(/Status : The above batch of Bulk sample is released for filling \/ compression\./)).toBeTruthy()
    expect(screen.getByText(/Received By \/ Date \( Production\)/)).toBeTruthy()
  })

  it('renders Oil Test Request Slip with 2 copies for Bulk, and placeholder for FP', () => {
    render(
      <TestRequestSlipEditor productType="oil" initialData={{ batch_no: 'OIL-B20', product: 'Castor Oil' }} />
    )

    // Starts in Bulk: shows two stacked copies on page (plus toolbar)
    expect(screen.getAllByText('PRODUCTION').length).toBe(2)
    expect(screen.getAllByText(/TEST REQUEST \(BULK\s*\)/).length).toBe(3)
    expect(screen.getAllByText(/1\) BULK : Appearance \/ Odor \/ Wt\.per ml \/ % Moisture\/ Viscosity \/ Acid Value \/ Peroxide Value \/ Saponification Value \/ Iodine Value/).length).toBe(2)

    // Switch to FP / MT: shows Attachment-5 placeholder for Oil
    const fpBtn = screen.getByRole('button', { name: /FP \/ MT \(Attachment-5\)/i })
    fireEvent.click(fpBtn)

    expect(screen.getByText('Attachment-5 (Test Request MT/FP) for Oil will be attached soon.')).toBeTruthy()
    const saveBtn = screen.getByRole('button', { name: /save slip/i })
    expect(saveBtn.disabled).toBe(true)
  })

  it('resolves Mother Tincture slips correctly from registry', () => {
    // RM Slip is implemented
    const mtRm = resolveSlipConfig({ dosage_form: 'Mother Tincture' })
    expect(mtRm.isImplemented).toBe(true)
    expect(mtRm.typeKey).toBe('mother-tincture')
    expect(mtRm.displayName).toBe('Mother Tincture')
    expect(mtRm.config.rm.Component).toBe(MotherTinctureRmSlip)
    expect(mtRm.config.rm.isPlaceholder).toBe(false)
    expect(mtRm.config.rm.title).toBe('RM Request for Mother Tincture (Attachment 1 Master Format)')
    expect(mtRm.config.rm.subtitle).toBe('Exact replica of ATTACHMENT_1.docx')

    // PM Slip is placeholder
    expect(mtRm.config.pm.isPlaceholder).toBe(true)

    // QC Slips: Bulk Release is implemented
    const mtBr = resolveQcSlip('bulkRelease', 'mother-tincture')
    expect(mtBr.isImplemented).toBe(true)
    expect(mtBr.typeKey).toBe('mother-tincture')
    expect(mtBr.displayName).toBe('Mother Tincture')
    expect(mtBr.config.Component).toBe(MotherTinctureBulkReleaseSlip)
    expect(mtBr.config.code).toBe('SOP/QC/04/F-01')

    // Test Requests: Before Filter (Att-2) and After Filter (Att-4) are now implemented
    const mtTrBulk = resolveQcSlip('testRequestBulk', 'mother-tincture')
    expect(mtTrBulk.isImplemented).toBe(true)
    expect(mtTrBulk.config.code).toBe('SOP/MT/01/F01-00')

    const mtTrFp = resolveQcSlip('testRequestFp', 'mother-tincture')
    expect(mtTrFp.isImplemented).toBe(true)
    expect(mtTrFp.config.code).toBe('SOP/MT/01/F01-00')

    // Also normalizes "MT" or "mother tincture"
    const mtFromCode = resolveSlipConfig({ product_type: 'MT' })
    expect(mtFromCode.typeKey).toBe('mother-tincture')
    expect(mtFromCode.isImplemented).toBe(true)
  })

  it('renders Mother Tincture RM Request Slip (Attachment 1) with exact wording and small table', () => {
    const initial = getInitialMotherTinctureRmData(
      { name: 'Arnica Montana Q', code: 'MT-001' },
      { code: 'F-ARN-01', herb_quantity: '50 KG' },
      { revision_number: 1, base_output_quantity: 100, output_uom_code: 'LTR' }
    )
    const { container } = render(
      <MotherTinctureRmSlip data={initial} onChange={() => {}} />
    )

    // Check exact text & casing from ATTACHMENT_1.docx (2 stacked copies of form in DOM)
    const prodHeadings = screen.getAllByDisplayValue(/PRODUCTION\s+\(ATTACHMENT 1\)/)
    expect(prodHeadings.length).toBe(2)

    const titleHeadings = screen.getAllByDisplayValue(/RM REQUEST FOR\s+MOTHER\s+TINCTURE/)
    expect(titleHeadings.length).toBe(2)

    const deptHeadings = screen.getAllByDisplayValue(/DEPARTMENT\s+:\s+MOTHER TINCTURE/)
    expect(deptHeadings.length).toBe(2)

    const formeHeadings = screen.getAllByDisplayValue('FORME NO. SOP/MT/01/F01-00')
    expect(formeHeadings.length).toBe(2)

    // Check odd casing & spelling: "CHEKED BY/DATE (QA):"
    const chekedLabels = screen.getAllByDisplayValue('CHEKED BY/DATE (QA):')
    expect(chekedLabels.length).toBe(2)

    // Check autofilled fields
    const herbInputs = screen.getAllByDisplayValue('Arnica Montana Q')
    expect(herbInputs.length).toBe(2)

    const qtyInputs = screen.getAllByDisplayValue('50 KG')
    expect(qtyInputs.length).toBe(2)

    // Check small 2-column table below the forms
    expect(screen.getByDisplayValue('DATE & FOR')).toBeTruthy()
    expect(screen.getByDisplayValue('NAME')).toBeTruthy()
    expect(screen.getByDisplayValue('DRUG QTY')).toBeTruthy()
    expect(screen.getByDisplayValue('ALC Qty')).toBeTruthy()
    expect(screen.getByDisplayValue('WATER QTY')).toBeTruthy()
    expect(screen.getByDisplayValue('MAKE UP')).toBeTruthy()

    // 2 copies in DOM (screen copy + print-only-copy)
    const sheets = container.querySelectorAll('.mt-rm-sheet')
    expect(sheets.length).toBe(2)
  })

  it('renders Mother Tincture Bulk Release Slip (Attachment 3) with exact docx wording, 2 copies and pre-filled fields', () => {
    const initial = getInitialMotherTinctureBulkReleaseData({
      product: 'Calendula Officinalis Q',
      batch_no: 'MT-B101',
      mfg_date: '10/2026',
      batch_size: '500 LTR',
      batch_qty: '495 LTR',
    })
    const { container } = render(
      <MotherTinctureBulkReleaseSlip data={initial} onChange={() => {}} />
    )

    // Check exact text & casing from ATTACHMENT_3__2_.docx
    const qcHeadings = screen.getAllByDisplayValue('QUALITY CONTROL(ATTACHMENT 3)')
    expect(qcHeadings.length).toBe(2)

    const slipNames = screen.getAllByDisplayValue('BULK RELEASE SLIP (MT)')
    expect(slipNames.length).toBe(2)

    const deptLabels = screen.getAllByDisplayValue(/DEPARTMENT\s+:\s+MOTHER TINCTURE/)
    expect(deptLabels.length).toBe(2)

    const formNoLabels = screen.getAllByDisplayValue('FORM NO.: SOP/QC/04/F-01')
    expect(formNoLabels.length).toBe(2)

    // Pre-filled 5YEAR and 10ML
    const bestBeforeInputs = screen.getAllByDisplayValue('5YEAR')
    expect(bestBeforeInputs.length).toBe(2)

    const sampleQtyInputs = screen.getAllByDisplayValue('10ML')
    expect(sampleQtyInputs.length).toBe(2)

    // Odd spelling: "Recieved By / Date (QA)    :"
    const recievedLabels = screen.getAllByDisplayValue(/Recieved By \/ Date \(QA\)/)
    expect(recievedLabels.length).toBe(2)

    // Status line: "released for filter"
    const statusLabels = screen.getAllByDisplayValue(/released for filter/)
    expect(statusLabels.length).toBe(2)

    // Caption
    expect(screen.getByDisplayValue(/MT\s+–\s+Mother Tincture samples/)).toBeTruthy()

    // 2 stacked copies in DOM
    const sheets = container.querySelectorAll('.mt-br-sheet')
    expect(sheets.length).toBe(2)
  })

  it('handles Mother Tincture in BulkReleaseSlipEditor and saves with correct layoutId', () => {
    render(
      <BulkReleaseSlipEditor
        productType="mother-tincture"
        initialData={{ batch_no: 'MT-LOT-55', product: 'Thuja Occidentalis' }}
      />
    )

    // Shows MT Bulk Release Slip
    expect(screen.getAllByDisplayValue('BULK RELEASE SLIP (MT)').length).toBe(2)
    expect(screen.getAllByDisplayValue('Thuja Occidentalis').length).toBe(2)

    // Save Slip
    const saveBtn = screen.getByRole('button', { name: /save slip/i })
    fireEvent.click(saveBtn)

    // Check localStorage
    const saved = localStorage.getItem('cmhp_qc_slip_v1_bulk_release_mother_tincture_MT-LOT-55')
    expect(saved).toBeTruthy()
    const parsed = JSON.parse(saved)
    expect(parsed.productType).toBe('mother-tincture')
    expect(parsed.layoutId).toBe('mt-att3-v1')
    expect(parsed.data.product).toBe('Thuja Occidentalis')
  })

  it('renders Mother Tincture Test Request slips in TestRequestSlipEditor with Before Filter and After Filter sub-tabs', async () => {
    render(
      <TestRequestSlipEditor
        productType="mother-tincture"
        initialData={{ batch_no: 'MT-LOT-55', product: 'Thuja Occidentalis' }}
      />
    )

    // Starts in Before Filter (Attachment-2)
    expect(screen.getByText('Before Filter (Attachment-2)')).toBeTruthy()
    expect(screen.getByText('After Filter (Attachment-4)')).toBeTruthy()
    expect(screen.getAllByDisplayValue(/PRODUCTION\s+\(ATTACHMENT 2\)/).length).toBe(2)
    expect(screen.getAllByDisplayValue(/TEST REQUEST FOR\s+BULK\s+BEFORE FILTER/).length).toBe(2)
    expect(screen.getAllByDisplayValue(/DEPARTMEN\s+:\s+MOTHER TINCTURE/).length).toBe(2)
    expect(screen.getAllByDisplayValue(/FORM NO\s+:\s+SOP\/MT\/01\/F01-00/).length).toBe(2)
    expect(screen.getAllByDisplayValue(/TEST TO BE PERFORMED\s+:\s+LAMDBA MAX/).length).toBe(2)

    // Save Before Filter
    const saveBtn = screen.getByRole('button', { name: /save slip/i })
    expect(saveBtn.disabled).toBe(false)
    fireEvent.click(saveBtn)

    const savedBefore = localStorage.getItem('cmhp_qc_slip_v1_test_request_mt_before_filter_MT-LOT-55')
    expect(savedBefore).toBeTruthy()
    const parsedBefore = JSON.parse(savedBefore)
    expect(parsedBefore.productType).toBe('mother-tincture')
    expect(parsedBefore.subKind).toBe('before_filter')

    // Switch to After Filter (Attachment-4)
    const afterBtn = screen.getByRole('button', { name: /after filter \(attachment-4\)/i })
    fireEvent.click(afterBtn)

    expect(screen.getAllByDisplayValue(/PRODUCTION\s+\(ATTACHMENT 4\)/).length).toBe(2)
    expect(screen.getAllByDisplayValue(/TEST REQUEST FOR\s+BULK\s+AFTER FILTER/).length).toBe(2)
    expect(screen.getAllByDisplayValue(/1\)\s*TEST TO BE PERFORMED\s*:/).length).toBe(2)
    expect(screen.getAllByDisplayValue(/2\)\s*BULK \/ MT\s*:\s*Description/).length).toBe(2)

    // Save After Filter
    await waitFor(() => expect(screen.getByRole('button', { name: /save slip/i }).disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: /save slip/i }))
    const savedAfter = localStorage.getItem('cmhp_qc_slip_v1_test_request_mt_after_filter_MT-LOT-55')
    expect(savedAfter).toBeTruthy()
    const parsedAfter = JSON.parse(savedAfter)
    expect(parsedAfter.productType).toBe('mother-tincture')
    expect(parsedAfter.subKind).toBe('after_filter')
  })
})
