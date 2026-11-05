import { describe, expect, it, vi } from 'vitest'

vi.mock('../../assets/cmhp_invoice_logo.png', () => ({ default: '/cmhp_invoice_logo.png' }))

import {
  GRN_KIND_PACKING,
  GRN_KIND_RAW,
  buildGoodsReceiptNoteHtml,
  companyTitle,
  filterReceiptLinesByKind,
  grnDownloadFilename,
  receiptGrnKinds,
} from './grnNotePrint'

const receipt = {
  reference: 'RM26091',
  company_legal_name: 'CMHP PRIVATE LIMITED',
  supplier_display: 'APS MARKETING',
  supplier_invoice_reference: '114',
  arrived_at: '2026-10-05T00:00:00Z',
  posted_at: '2026-10-11T00:00:00Z',
  lines: [
    {
      material_name_snapshot: 'WHITE MUSHLI',
      material_code_snapshot: '1211',
      material_kind: 'RAW_MATERIAL',
      received_quantity: '2',
      unit_code: 'KG',
      container_quantity: 1,
      lot_reference: 'RM26216',
    },
    {
      material_name_snapshot: 'Bottle 30ml',
      material_code_snapshot: 'BTL30',
      material_kind: 'PACKAGING_MATERIAL',
      received_quantity: '500',
      unit_code: 'NOS',
      container_quantity: 5,
    },
  ],
}

describe('grnNotePrint', () => {
  it('splits raw and packing lines for separate GRN copies', () => {
    expect(receiptGrnKinds(receipt)).toEqual({ hasRaw: true, hasPacking: true })
    expect(filterReceiptLinesByKind(receipt, GRN_KIND_RAW)).toHaveLength(1)
    expect(filterReceiptLinesByKind(receipt, GRN_KIND_PACKING)).toHaveLength(1)
  })

  it('matches the Word warehouse GRN layout structure', () => {
    const html = buildGoodsReceiptNoteHtml(receipt, GRN_KIND_RAW)
    expect(html).toContain('CMHP PRIVATE LIMITED')
    expect(html).toContain('RAW MATERIAL / PACKING MATERIAL STORE')
    expect(html).toContain('WAREHOUSE')
    expect(html).toContain('COPY')
    expect(html).toContain('GOODS RECEIPT NOTE (GRN)')
    expect(html).toContain('RAW MATERIAL')
    expect(html).toContain('INVOICE NO.')
    expect(html).toContain('114')
    expect(html).toContain('RM26091')
    expect(html).toContain('SOP/WH/01/F-01')
    expect(html).toContain('WHITE MUSHLI')
    expect(html).toContain('1*2KG')
    expect(html).toContain('# NA :- NOT APPLICABLE')
    expect(html).toContain('Prepared By/ Date: ( RM / PM Store )')
    expect(html).toContain('Approved / Rejected by/ Date: ( QC )')
    expect(html).not.toContain('Bottle 30ml')
    // Word master is black/white — no blue fills
    expect(html).not.toContain('#dbeafe')
    expect(html).not.toContain('#e8f1fb')
  })

  it('renders packing banner for packaging GRN', () => {
    const html = buildGoodsReceiptNoteHtml(receipt, GRN_KIND_PACKING)
    expect(html).toContain('PACKING MATERIAL')
    expect(html).toContain('Bottle 30ml')
    expect(html).not.toContain('WHITE MUSHLI')
  })

  it('builds download filenames for RM and PM copies', () => {
    expect(grnDownloadFilename(receipt, GRN_KIND_RAW)).toBe('GRN_RM_RM26091.pdf')
    expect(grnDownloadFilename(receipt, GRN_KIND_PACKING)).toBe('GRN_PM_RM26091.pdf')
  })

  it('expands short CMHP company names to the legal print title', () => {
    expect(companyTitle({ company_code: 'CMHP' })).toBe('CMHP PRIVATE LIMITED')
    expect(companyTitle({ company_legal_name: 'CMHP' })).toBe('CMHP PRIVATE LIMITED')
    expect(companyTitle({ company_legal_name: 'CMHP PRIVATE LIMITED' })).toBe('CMHP PRIVATE LIMITED')
  })
})
