import { printElement } from './printDocument'
import { formatDateIN } from './formatters'
import { getCompanyBranding, isTejBiocare } from './companyBranding.js'

/**
 * Formula Export Utilities
 * Provides Print / PDF, Excel (.xls / XML Spreadsheet), and CSV generation
 * formatted per pharmaceutical BMR standards.
 */

export function exportFormulaPrint(elementId = 'bmr-requisition-print-doc', company = null) {
  const isTej = isTejBiocare(company) || isTejBiocare()
  const branding = getCompanyBranding(isTej ? 'tej' : 'cmhp')
  printElement(elementId, {
    title: `${branding.isTej ? branding.headerName : 'CMHP'} - BMR Raw Material Requisition Slip - SOP/QA/04/F-02/00`,
    pageOrientation: 'portrait',
    margin: '10mm 8mm',
  })
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
  company = null,
  companyName = 'CMHP PHARMACEUTICALS PVT. LTD.',
  companyCode = 'CMHP',
  department = 'PRODUCTION ( ORAL LIQUID DEPARTMENT )',
}) {
  const isTej = isTejBiocare(company) || (companyName && isTejBiocare(companyName)) || (companyCode && isTejBiocare(companyCode)) || isTejBiocare()
  const branding = getCompanyBranding(isTej ? 'tej' : 'cmhp')
  const effectiveCompanyName = branding.isTej ? branding.headerName : (companyName || 'CMHP PHARMACEUTICALS PVT. LTD.')
  const effectiveCompanyCode = branding.isTej ? branding.code : (companyCode || 'CMHP')
  const status = approval?.status || 'NOT_SUBMITTED'
  const isApproved = status === 'APPROVED'
  const isDeclined = status === 'DECLINED'
  const dateFormatted = formatDateIN(approval?.submittedAt || new Date())
  const approvedDateFormatted = approval?.decidedAt ? formatDateIN(approval.decidedAt) : ''
  const filename = `BMR_Requisition_${(product.code || 'PRD').replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xls`

  const formatNum = (val) => {
    if (val === null || val === undefined || isNaN(val)) return '—'
    const num = Number(val)
    if (Number.isInteger(num)) return num.toString()
    return num.toFixed(3).replace(/\.?0+$/, '')
  }

  const rowsHtml = materials
    .map((m, idx) => {
      const rmCode = m.rmCode || m.rm_code || `RM-${String(idx + 1).padStart(3, '0')}`
      const label = m.labelClaim || m.label_claim || (m.baseQuantity ? `${m.baseQuantity} ${m.baseUnit || 'g'}` : '—')
      const scaledVal = m.scaledQuantity ?? m.requiredQuantity ?? (Number(m.baseQuantity || m.base_quantity || 0) * (scaleFactor || 1))
      const unitVal = m.scaledUnit || m.unit || 'kg'
      const arNoVal = m.arNo || m.ar_no || '—'

      return `
    <tr>
      <td style="border: 1px solid #000; text-align: center;">${idx + 1}</td>
      <td style="border: 1px solid #000; text-align: center; font-weight: bold;">${rmCode}</td>
      <td style="border: 1px solid #000; font-weight: bold;">${m.name}</td>
      <td style="border: 1px solid #000;">${label}</td>
      <td style="border: 1px solid #000; text-align: right; font-weight: bold;">${formatNum(scaledVal)}</td>
      <td style="border: 1px solid #000; text-align: center;">${unitVal}</td>
      <td style="border: 1px solid #000; text-align: center;">${arNoVal}</td>
    </tr>`
    })
    .join('')

  const notesHtml = approval?.remarks
    ? `<tr><td colspan="7" style="border: 1px solid #000; background: #fffbeb; padding: 6px; font-size: 10pt;"><strong>Production Notes / Remarks:</strong> ${approval.remarks}</td></tr>`
    : ''

  const endorsementHtml = isApproved && approval?.decisionRemarks
    ? `<tr><td colspan="7" style="border: 1px solid #000; background: #f0fdf4; padding: 6px; font-size: 10pt; color: #15803d;"><strong>QC / QA Release Endorsement:</strong> ${approval.decisionRemarks} (Certified by ${approval.decidedBy || 'QA Manager'} on ${approvedDateFormatted})</td></tr>`
    : isDeclined && approval?.declineReason
    ? `<tr><td colspan="7" style="border: 1px solid #000; background: #fef2f2; padding: 6px; font-size: 10pt; color: #b91c1c;"><strong>QC Formulation Decline Notice [${approval.declineCategory || 'General'}]:</strong> ${approval.declineReason} (Returned by ${approval.decidedBy || 'QC In-Charge'} on ${approvedDateFormatted})</td></tr>`
    : ''

  const approverCell = isApproved
    ? `Approved By:<br/><small>QA / QC Manager</small><br/>Name: ${approval?.decidedBy || 'Dr. R. K. Mehta'}<br/>Signature: /${(approval?.decidedBy || 'RKMehta').replace(/^(Dr\.|Mr\.|Mrs\.|Ms\.)\s*/i, '').trim().split(/\s+/)[0]}/<br/>Date: ${approvedDateFormatted}`
    : isDeclined
    ? `Audit Decision: DECLINED<br/><small>QC Review</small><br/>Declined By: ${approval?.decidedBy || 'QC In-Charge'}<br/>Date: ${approvedDateFormatted}<br/>Finding: ${approval?.declineReason || 'Stoichiometric Discrepancy'}`
    : `Approved By:<br/><small>QA / QC Manager</small><br/>Name: ________________<br/>Signature: ________________<br/>Date: ________________`

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
          <td colspan="7" class="hdr" style="padding: 10px; font-size: 16pt;">${effectiveCompanyName}</td>
        </tr>
        <tr>
          <td colspan="7" class="subhdr" style="padding: 6px;">${department}</td>
        </tr>
        <tr>
          <td colspan="7" class="subhdr" style="padding: 6px; font-size: 12pt;">BATCH MANUFACTURING RECORD (BMR) - RAW MATERIAL REQUISITION SLIP</td>
        </tr>
        <tr><td colspan="7">&nbsp;</td></tr>
        <tr>
          <td class="meta-lbl">PRODUCT :</td>
          <td colspan="3" class="meta-val" style="font-weight: bold;">${product.name || ''}</td>
          <td class="meta-lbl">BMR NO. :</td>
          <td colspan="2" class="meta-val">BMR/${effectiveCompanyCode}/PRD/04</td>
        </tr>
        <tr>
          <td class="meta-lbl">PRODUCT CODE :</td>
          <td colspan="3" class="meta-val">${product.code || ''}</td>
          <td class="meta-lbl">EFFECTIVE DATE :</td>
          <td colspan="2" class="meta-val">${dateFormatted}</td>
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
          <td colspan="2" class="meta-val" style="font-weight: bold; color: ${isApproved ? '#15803d' : isDeclined ? '#b91c1c' : '#b45309'};">${status}</td>
        </tr>
        <tr><td colspan="7">&nbsp;</td></tr>
        <tr style="background-color: #f1f5f9;">
          <th class="th-cell" style="width: 50px;">Sr. No.</th>
          <th class="th-cell" style="width: 100px;">RM Code</th>
          <th class="th-cell" style="width: 250px;">RAW MATERIAL NAME</th>
          <th class="th-cell" style="width: 130px;">Label Claim / Spec</th>
          <th class="th-cell" style="width: 100px;">Qty. Req</th>
          <th class="th-cell" style="width: 60px;">Unit</th>
          <th class="th-cell" style="width: 120px;">AR.No. / Lot</th>
        </tr>
        ${rowsHtml}
        ${notesHtml}
        ${endorsementHtml}
        <tr><td colspan="7">&nbsp;</td></tr>
        <tr>
          <td colspan="2" style="border: 1px solid #000; font-weight: bold; background: #f8fafc; vertical-align: top; padding: 6px;">
            Prepared By:<br/><small>Production Chemist</small><br/>
            Name: ${approval?.submittedBy || 'Production Chemist'}<br/>
            Signature: /${(approval?.submittedBy || 'Chemist').split(' ')[0]}/<br/>
            Date: ${dateFormatted}
          </td>
          <td colspan="3" style="border: 1px solid #000; font-weight: bold; background: #f8fafc; vertical-align: top; padding: 6px;">
            Reviewed By:<br/><small>Production In-Charge</small><br/>
            Name: ${isApproved ? 'S. K. Joshi' : '________________'}<br/>
            Signature: ${isApproved ? '/SKJoshi/' : '________________'}<br/>
            Date: ${isApproved ? dateFormatted : '________________'}
          </td>
          <td colspan="2" style="border: 1px solid #000; font-weight: bold; background: #f8fafc; vertical-align: top; padding: 6px;">
            ${approverCell}
          </td>
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
  company = null,
  companyName = 'CMHP PHARMACEUTICALS PVT. LTD.',
  companyCode = 'CMHP',
}) {
  const isTej = isTejBiocare(company) || (companyName && isTejBiocare(companyName)) || (companyCode && isTejBiocare(companyCode)) || isTejBiocare()
  const branding = getCompanyBranding(isTej ? 'tej' : 'cmhp')
  const effectiveCompanyName = branding.isTej ? branding.headerName : (companyName || 'CMHP PHARMACEUTICALS PVT. LTD.')
  const dateFormatted = formatDateIN(approval?.submittedAt || new Date())
  const approvedDateFormatted = approval?.decidedAt ? formatDateIN(approval.decidedAt) : ''
  const filename = `BMR_Requisition_${(product.code || 'PRD').replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`

  const headerLines = [
    `${effectiveCompanyName} - BATCH MANUFACTURING RECORD (BMR)`,
    `ATTACHMENT - 1: RAW MATERIAL REQUISITION SLIP`,
    `PRODUCT,${product.name || ''}`,
    `PRODUCT CODE,${product.code || ''}`,
    `BATCH SIZE,${batchQty} ${batchUnit}`,
    `FORMULA,${formula.name || ''}`,
    `REVISION,${revision.name || 'Rev 00'}`,
    `STATUS,${approval?.status || 'NOT_SUBMITTED'}`,
    `EFFECTIVE DATE,${dateFormatted}`,
    `APPROVED BY,${approval?.decidedBy || '—'}`,
    `APPROVED DATE,${approvedDateFormatted || '—'}`,
    ``,
    `Sr. No.,RM Code,RAW MATERIAL NAME,Label Claim / Spec,Qty. Req,Unit,AR.No. / Lot`,
  ]

  const dataRows = materials.map((m, idx) => {
    const rmCode = m.rmCode || m.rm_code || `RM-${String(idx + 1).padStart(3, '0')}`
    const label = `"${(m.labelClaim || m.label_claim || '').replace(/"/g, '""')}"`
    const name = `"${(m.name || '').replace(/"/g, '""')}"`
    const scaledVal = m.scaledQuantity ?? m.requiredQuantity ?? m.base_quantity
    const unitVal = m.scaledUnit || m.unit || 'kg'
    const arNo = `"${(m.arNo || m.ar_no || '—').replace(/"/g, '""')}"`

    return `${idx + 1},${rmCode},${name},${label},${scaledVal},${unitVal},${arNo}`
  })

  const csvContent = [...headerLines, ...dataRows].join('\r\n')
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
