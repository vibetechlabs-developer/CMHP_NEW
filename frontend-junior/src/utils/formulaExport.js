/**
 * Formula Export Utilities
 * Provides Print / PDF, Excel (.xls / XML Spreadsheet), and CSV generation
 * formatted per pharmaceutical BMR standards.
 */

export function exportFormulaPrint() {
  window.print()
}

export function exportFormulaExcel({
  product = {},
  formula = {},
  revision = {},
  materials = [],
  batchQty = 1,
  batchUnit = 'L',
  scaleFactor = 1,
  approval = null,
  companyName = 'CMHP PRIVATE LIMITED',
}) {
  const status = approval?.status || 'NOT_SUBMITTED'
  const dateStr = new Date().toISOString().split('T')[0]
  const filename = `BMR_Requisition_${(product.code || 'PRD').replace(/\s+/g, '_')}_${dateStr}.xls`

  const rowsHtml = materials
    .map(
      (m, idx) => `
    <tr>
      <td style="border: 1px solid #000; text-align: center;">${idx + 1}</td>
      <td style="border: 1px solid #000; text-align: center; font-weight: bold;">${m.rmCode || m.rm_code || `RM-${String(idx + 1).padStart(3, '0')}`}</td>
      <td style="border: 1px solid #000; font-weight: bold;">${m.name}</td>
      <td style="border: 1px solid #000;">${m.labelClaim || m.label_claim || '—'}</td>
      <td style="border: 1px solid #000; text-align: right; font-weight: bold;">${m.scaledQuantity || m.requiredQuantity || m.base_quantity}</td>
      <td style="border: 1px solid #000; text-align: center;">${m.scaledUnit || m.unit || 'kg'}</td>
      <td style="border: 1px solid #000; text-align: center;">${m.arNo || m.ar_no || '—'}</td>
    </tr>`
    )
    .join('')

  const excelContent = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <!--[if gte mso 9]>
      <xml>
        <x:ExcelWorkbook>
          <x:ExcelWorksheets>
            <x:ExcelWorksheet>
              <x:Name>BMR Requisition Slip</x:Name>
              <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
            </x:ExcelWorksheet>
          </x:ExcelWorksheets>
        </x:ExcelWorkbook>
      </xml>
      <![endif]-->
      <meta http-equiv="content-type" content="application/vnd.ms-excel; charset=UTF-8">
      <style>
        body { font-family: Calibri, Arial, sans-serif; }
        .hdr { background-color: #123f61; color: #ffffff; font-weight: bold; font-size: 14pt; text-align: center; }
        .subhdr { background-color: #f1f5f9; font-weight: bold; text-align: center; font-size: 11pt; }
        .meta-lbl { font-weight: bold; background-color: #f8fafc; border: 1px solid #000; }
        .meta-val { border: 1px solid #000; }
        .th-cell { background-color: #e2e8f0; font-weight: bold; border: 1px solid #000; text-align: center; }
      </style>
    </head>
    <body>
      <table style="border-collapse: collapse; width: 100%;">
        <tr>
          <td colspan="7" class="hdr" style="padding: 10px; font-size: 16pt;">${companyName}</td>
        </tr>
        <tr>
          <td colspan="7" class="subhdr" style="padding: 6px;">PRODUCTION ( ORAL LIQUID DEPARTMENT )</td>
        </tr>
        <tr>
          <td colspan="7" class="subhdr" style="padding: 6px; font-size: 12pt;">BATCH MANUFACTURING RECORD (BMR) - RAW MATERIAL REQUISITION SLIP</td>
        </tr>
        <tr><td colspan="7">&nbsp;</td></tr>
        <tr>
          <td class="meta-lbl">PRODUCT :</td>
          <td colspan="3" class="meta-val" style="font-weight: bold;">${product.name || ''}</td>
          <td class="meta-lbl">BMR NO. :</td>
          <td colspan="2" class="meta-val">BMR/CMHP/PRD/04</td>
        </tr>
        <tr>
          <td class="meta-lbl">PRODUCT CODE :</td>
          <td colspan="3" class="meta-val">${product.code || ''}</td>
          <td class="meta-lbl">EFFECTIVE DATE :</td>
          <td colspan="2" class="meta-val">${dateStr}</td>
        </tr>
        <tr>
          <td class="meta-lbl">BATCH QTY :</td>
          <td colspan="3" class="meta-val" style="font-weight: bold;">${batchQty} ${batchUnit}</td>
          <td class="meta-lbl">VERSION NO. :</td>
          <td colspan="2" class="meta-val">${revision.name || 'Rev 00'}</td>
        </tr>
        <tr>
          <td class="meta-lbl">FORMULA :</td>
          <td colspan="3" class="meta-val">${formula.name || ''} (Base: ${formula.base_quantity || 100} ${formula.base_unit || 'L'})</td>
          <td class="meta-lbl">APPROVAL STATUS :</td>
          <td colspan="2" class="meta-val" style="font-weight: bold;">${status}</td>
        </tr>
        <tr><td colspan="7">&nbsp;</td></tr>
        <tr style="background-color: #f1f5f9;">
          <th class="th-cell" style="width: 50px;">Sr. No.</th>
          <th class="th-cell" style="width: 100px;">RM Code</th>
          <th class="th-cell" style="width: 250px;">RAW MATERIAL NAME</th>
          <th class="th-cell" style="width: 120px;">Label Claim</th>
          <th class="th-cell" style="width: 100px;">Qty. Req</th>
          <th class="th-cell" style="width: 60px;">Unit</th>
          <th class="th-cell" style="width: 120px;">AR.No.</th>
        </tr>
        ${rowsHtml}
        <tr><td colspan="7">&nbsp;</td></tr>
        <tr>
          <td colspan="2" style="border: 1px solid #000; font-weight: bold; background: #f8fafc;">Prepared By:<br/><small>Production Chemist</small><br/>Name: ${approval?.submittedBy || 'Production Chemist'}</td>
          <td colspan="3" style="border: 1px solid #000; font-weight: bold; background: #f8fafc;">Reviewed By:<br/><small>Production In-Charge</small><br/>Name: S. K. Joshi</td>
          <td colspan="2" style="border: 1px solid #000; font-weight: bold; background: #f8fafc;">Approved By:<br/><small>QA / QC Manager</small><br/>Name: ${approval?.decidedBy || (status === 'APPROVED' ? 'Dr. R. K. Mehta' : 'Pending Review')}</td>
        </tr>
        <tr>
          <td colspan="4" style="font-size: 9pt; color: #64748b; padding-top: 8px;">FORM NO. SOP/QA/04/F-02/00</td>
          <td colspan="3" style="font-size: 9pt; color: #64748b; text-align: right; padding-top: 8px;">Page 1 of 1</td>
        </tr>
      </table>
    </body>
    </html>
  `

  const blob = new Blob([excelContent], { type: 'application/vnd.ms-excel;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function exportFormulaCsv({
  product = {},
  formula = {},
  revision = {},
  materials = [],
  batchQty = 1,
  batchUnit = 'L',
  approval = null,
}) {
  const dateStr = new Date().toISOString().split('T')[0]
  const filename = `BMR_Requisition_${(product.code || 'PRD').replace(/\s+/g, '_')}_${dateStr}.csv`

  const headerLines = [
    `CMHP PRIVATE LIMITED - BATCH MANUFACTURING RECORD (BMR)`,
    `ATTACHMENT - 1: RAW MATERIAL REQUISITION SLIP`,
    `PRODUCT,${product.name || ''}`,
    `PRODUCT CODE,${product.code || ''}`,
    `BATCH SIZE,${batchQty} ${batchUnit}`,
    `FORMULA,${formula.name || ''}`,
    `REVISION,${revision.name || 'Rev 00'}`,
    `STATUS,${approval?.status || 'NOT_SUBMITTED'}`,
    ``,
    `Sr. No.,RM Code,Raw Material Name,Label Claim,Qty Required,Unit,AR No`,
  ]

  const itemLines = materials.map((m, idx) => {
    const cleanName = `"${(m.name || '').replace(/"/g, '""')}"`
    const claim = `"${(m.labelClaim || m.label_claim || '').replace(/"/g, '""')}"`
    const qty = m.scaledQuantity || m.requiredQuantity || m.base_quantity || 0
    return `${idx + 1},${m.rmCode || m.rm_code || ''},${cleanName},${claim},${qty},${m.scaledUnit || m.unit || 'kg'},${m.arNo || m.ar_no || ''}`
  })

  const footerLines = [
    ``,
    `FORM NO. SOP/QA/04/F-02/00`,
    `Prepared By: ${approval?.submittedBy || 'Production Chemist'}`,
    `Approved By: ${approval?.decidedBy || 'QA Manager'}`,
  ]

  const csvContent = '\uFEFF' + [...headerLines, ...itemLines, ...footerLines].join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
