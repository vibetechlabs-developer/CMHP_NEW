import { getCompanyBranding, isTejBiocare } from '../../../utils/companyBranding.js'

function triggerDownload(content, filename) {
  const blob = new Blob([content], { type: 'application/vnd.ms-excel;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function exportTabletRmExcel({ slipData = {}, product = {}, formula = {}, revision = {}, company = {} }) {
  const isTej = isTejBiocare(company) || isTejBiocare()
  const branding = getCompanyBranding(isTej ? 'tej' : 'cmhp')
  const companyTitle = branding.isTej ? branding.headerName : 'CENTRAL MANUFACTURING HOMEOPATHIC PHARMACY'

  const header = slipData.header || {}
  const mainRows = slipData.main_rows || []
  const excipientRows = slipData.excipient_rows || []
  const footer = slipData.footer || {}

  const filename = `Tablet_RM_Attachment_1_${(product.code || 'PRD').replace(/\s+/g, '_')}_Rev${revision.revision_number || '01'}.xls`

  const mainRowsHtml = mainRows
    .map(
      (r, idx) => `
    <tr>
      <td style="border: 1px solid #000; text-align: center;">${r.sr_no || idx + 1}</td>
      <td style="border: 1px solid #000; text-align: center;">${r.rm_code || ''}</td>
      <td style="border: 1px solid #000; text-align: left; text-transform: uppercase;">${r.name || ''}</td>
      <td style="border: 1px solid #000; text-align: center;">${r.label_claim || ''}</td>
      <td style="border: 1px solid #000; text-align: center;">${r.qty_req || ''}</td>
      <td style="border: 1px solid #000; text-align: center;">${r.unit || ''}</td>
      <td style="border: 1px solid #000; text-align: center;">${r.ar_no || ''}</td>
    </tr>`
    )
    .join('')

  const excipientRowsHtml = excipientRows
    .map(
      (r, idx) => `
    <tr>
      <td style="border: 1px solid #000; text-align: center;">${r.sr_no || idx + 1}</td>
      <td style="border: 1px solid #000; text-align: center;">${r.rm_code || ''}</td>
      <td style="border: 1px solid #000; text-align: left; text-transform: uppercase;">${r.name || ''}</td>
      <td style="border: 1px solid #000; text-align: center;">${r.label_claim || ''}</td>
      <td style="border: 1px solid #000; text-align: center;">${r.qty_req || ''}</td>
      <td style="border: 1px solid #000; text-align: center;">${r.unit || ''}</td>
      <td style="border: 1px solid #000; text-align: center;">${r.ar_no || ''}</td>
    </tr>`
    )
    .join('')

  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta charset="utf-8">
      <!--[if gte mso 9]>
      <xml>
        <x:ExcelWorkbook>
          <x:ExcelWorksheets>
            <x:ExcelWorksheet>
              <x:Name>Tablet RM Slip</x:Name>
              <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
            </x:ExcelWorksheet>
          </x:ExcelWorksheets>
        </x:ExcelWorkbook>
      </xml>
      <![endif]-->
      <style>
        body { font-family: 'Times New Roman', Times, serif; font-size: 11pt; }
        table { border-collapse: collapse; width: 100%; }
        th { border: 1px solid #000; background-color: #f1f5f9; font-weight: bold; text-align: center; }
        td { border: 1px solid #000; }
        .hdr { font-size: 14pt; font-weight: bold; text-align: center; }
        .dept { font-size: 11pt; font-weight: bold; text-align: center; }
        .bmr { font-size: 12pt; font-weight: bold; text-align: center; }
        .bold-u { font-weight: bold; text-decoration: underline; text-align: center; }
      </style>
    </head>
    <body>
      <table>
        <tr><td colspan="7" class="hdr">${companyTitle}</td></tr>
        <tr><td colspan="7" class="dept">PRODUCTION ( TABLET DEPARTMENT)</td></tr>
        <tr><td colspan="7" class="bmr">BATCH MANUFACTURING RECORD (BMR)</td></tr>
        <tr>
          <td colspan="4"><strong>PRODUCT :</strong> ${header.product || product?.name || ''}</td>
          <td colspan="3"><strong>BMR NO. :</strong> ${header.bmr_no || product?.bmr_no || ''}</td>
        </tr>
        <tr>
          <td colspan="4"><strong>PRODUCT CODE :</strong> ${header.product_code || product?.code || ''}</td>
          <td colspan="3"><strong>EFFECTIVE DATE :</strong> ${header.effective_date || ''}</td>
        </tr>
        <tr>
          <td colspan="4"><strong>COMPANY CODE :</strong> ${header.company_code || (isTej ? 'TEJ' : 'CMHP')}</td>
          <td colspan="3"><strong>SUPERSEDES NO :</strong> ${header.supersedes_no || '00'}</td>
        </tr>
        <tr>
          <td colspan="4"><strong>BATCH NO. :</strong> ${header.batch_no || ''}</td>
          <td colspan="3"><strong>VERSION NO :</strong> ${header.version_no || '01'}</td>
        </tr>
        <tr>
          <td colspan="4"><strong>MFG. FOR :</strong> ${header.mfg_for || ''}</td>
          <td colspan="3"><strong>MASTER FORMULA NO. :</strong> ${header.master_formula_no || formula?.code || ''}</td>
        </tr>
        <tr><td colspan="7"></td></tr>
        <tr><td colspan="7" class="bold-u">ATTACHMENT - 1</td></tr>
        <tr><td colspan="7" class="bold-u">RAW MATERIAL REQUISITION SLIP</td></tr>
        <tr><td colspan="7" style="font-weight: bold; text-decoration: underline;">BATCH FORMULA:</td></tr>
        <tr>
          <th style="width: 45px;">Sr. No.</th>
          <th style="width: 80px;">RM Code</th>
          <th>RAW MATERIAL NAME</th>
          <th style="width: 95px;">Label Claim</th>
          <th style="width: 75px;">Qty. Req</th>
          <th style="width: 55px;">Unit</th>
          <th style="width: 90px;">AR. No.</th>
        </tr>
        ${mainRowsHtml}
        <tr>
          <th style="width: 45px;">Sr. No.</th>
          <th style="width: 80px;">RM Code</th>
          <th>RAW MATERIAL NAME</th>
          <th style="width: 95px;">Label Claim</th>
          <th style="width: 75px;">Qty. Req</th>
          <th style="width: 55px;">Unit</th>
          <th style="width: 90px;">AR. No.</th>
        </tr>
        <tr>
          <td colspan="7" style="font-weight: bold; text-align: left; background: #ffffff;">EXCIPIENTS</td>
        </tr>
        ${excipientRowsHtml}
        <tr><td colspan="7"></td></tr>
        <tr>
          <td colspan="4"><strong>Weight by/Date (Warehouse) :</strong> ${footer.weight_by_warehouse || ''}</td>
          <td colspan="3"><strong>Weight check by/Date (Warehouse) :</strong> ${footer.weight_check_by_warehouse || ''}</td>
        </tr>
        <tr>
          <td colspan="4"><strong>Checked by / Date (Production) :</strong> ${footer.checked_by_production || ''}</td>
          <td colspan="3"><strong>Checked by / Date (QA) :</strong> ${footer.checked_by_qa || ''}</td>
        </tr>
      </table>
    </body>
    </html>
  `

  triggerDownload(html, filename)
}

export function exportTabletPmExcel({ slipData = {}, product = {}, formula = {}, revision = {}, company = {} }) {
  const isTej = isTejBiocare(company) || isTejBiocare()
  const branding = getCompanyBranding(isTej ? 'tej' : 'cmhp')
  const companyTitle = branding.isTej ? branding.headerName : 'CENTRAL MANUFACTURING HOMEOPATHIC PHARMACY'

  const header = slipData.header || {}
  const rows = slipData.rows || []
  const footer = slipData.footer || {}

  const filename = `Tablet_PM_Attachment_4_${(product.code || 'PRD').replace(/\s+/g, '_')}_Rev${revision.revision_number || '01'}.xls`

  const rowsHtml = rows
    .map(
      (r, idx) => `
    <tr>
      <td style="border: 1px solid #000; text-align: center;">${r.sr_no || idx + 1}</td>
      <td style="border: 1px solid #000; text-align: center;">${r.material_code || ''}</td>
      <td style="border: 1px solid #000; text-align: left; font-weight: bold;">${r.material || ''}</td>
      <td style="border: 1px solid #000; text-align: center;">${r.quantity_required || ''}</td>
      <td style="border: 1px solid #000; text-align: center;">${r.quantity_received || ''}</td>
      <td style="border: 1px solid #000; text-align: center;">${r.ar_no || ''}</td>
    </tr>`
    )
    .join('')

  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta charset="utf-8">
      <!--[if gte mso 9]>
      <xml>
        <x:ExcelWorkbook>
          <x:ExcelWorksheets>
            <x:ExcelWorksheet>
              <x:Name>Tablet PM Slip</x:Name>
              <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
            </x:ExcelWorksheet>
          </x:ExcelWorksheets>
        </x:ExcelWorkbook>
      </xml>
      <![endif]-->
      <style>
        body { font-family: 'Times New Roman', Times, serif; font-size: 11pt; }
        table { border-collapse: collapse; width: 100%; }
        th { border: 1px solid #000; background-color: #f1f5f9; font-weight: bold; text-align: center; }
        td { border: 1px solid #000; }
        .hdr { font-size: 14pt; font-weight: bold; text-align: center; }
        .dept { font-size: 11pt; font-weight: bold; text-align: center; }
        .bmr { font-size: 12pt; font-weight: bold; text-align: center; }
        .bold-u { font-weight: bold; text-decoration: underline; text-align: center; }
      </style>
    </head>
    <body>
      <table>
        <tr><td colspan="6" class="hdr">${companyTitle}</td></tr>
        <tr><td colspan="6" class="dept">PRODUCTION ( TABLET DEPARTMENT)</td></tr>
        <tr><td colspan="6" class="bmr">BATCH MANUFACTURING RECORD (BMR)</td></tr>
        <tr>
          <td colspan="3"><strong>PRODUCT :</strong> ${header.product || product?.name || ''}</td>
          <td colspan="3"><strong>BMR NO. :</strong> ${header.bmr_no || product?.bmr_no || ''}</td>
        </tr>
        <tr>
          <td colspan="3"><strong>PRODUCT CODE :</strong> ${header.product_code || product?.code || ''}</td>
          <td colspan="3"><strong>EFFECTIVE DATE :</strong> ${header.effective_date || ''}</td>
        </tr>
        <tr>
          <td colspan="3"><strong>COMPANY CODE :</strong> ${header.company_code || (isTej ? 'TEJ' : 'CMHP')}</td>
          <td colspan="3"><strong>SUPERSEDES NO :</strong> ${header.supersedes_no || '00'}</td>
        </tr>
        <tr>
          <td colspan="3"><strong>BATCH NO. :</strong> ${header.batch_no || ''}</td>
          <td colspan="3"><strong>VERSION NO :</strong> ${header.version_no || '01'}</td>
        </tr>
        <tr>
          <td colspan="3"><strong>MFG. FOR :</strong> ${header.mfg_for || ''}</td>
          <td colspan="3"><strong>MASTER FORMULA NO. :</strong> ${header.master_formula_no || formula?.code || ''}</td>
        </tr>
        <tr><td colspan="6"></td></tr>
        <tr><td colspan="6" class="bold-u">ATTACHMENT - 4</td></tr>
        <tr><td colspan="6" style="font-weight: bold; text-decoration: underline;">PACKING MATERIAL REQUIREMENT:</td></tr>
        <tr>
          <th style="width: 45px;">Sr. No.</th>
          <th style="width: 100px;">Material Code</th>
          <th>Material</th>
          <th style="width: 130px;">Quantity Required Nos.</th>
          <th style="width: 130px;">Quantity Received  Nos.</th>
          <th style="width: 90px;">AR No.</th>
        </tr>
        ${rowsHtml}
        <tr><td colspan="6"></td></tr>
        <tr>
          <td colspan="2"><strong>Checked By (Warehouse):</strong><br/>${footer.checked_by_warehouse || ''}</td>
          <td colspan="2"><strong>Received By (Production):</strong><br/>${footer.received_by_production || ''}</td>
          <td colspan="2"><strong>Verified by ( QA):</strong><br/>${footer.verified_by_qa || ''}</td>
        </tr>
      </table>
    </body>
    </html>
  `

  triggerDownload(html, filename)
}

export function exportOilRmExcel({ slipData = {}, product = {}, formula = {}, revision = {}, company = {} }) {
  const isTej = isTejBiocare(company) || isTejBiocare()
  const branding = getCompanyBranding(isTej ? 'tej' : 'cmhp')
  const companyTitle = branding.isTej ? branding.headerName : 'CENTRAL MANUFACTURING HOMEOPATHIC PHARMACY'

  const header = slipData.header || {}
  const rows = slipData.rows || []
  const signoff = slipData.signoff || {}
  const approval = slipData.approval || {}

  const filename = `Oil_RM_Attachment_1_${(product.code || 'PRD').replace(/\s+/g, '_')}_Rev${revision.revision_number || '01'}.xls`

  const rowsHtml = rows
    .map(
      (r, idx) => `
    <tr>
      <td style="border: 1px solid #000; text-align: center;">${r.sr_no || idx + 1}</td>
      <td style="border: 1px solid #000; text-align: center;">${r.rm_code || ''}</td>
      <td style="border: 1px solid #000; text-align: left; text-transform: uppercase;">${r.name || ''}</td>
      <td style="border: 1px solid #000; text-align: center;">${r.label_claim || ''}</td>
      <td style="border: 1px solid #000; text-align: center;">${r.qty_req || ''}</td>
      <td style="border: 1px solid #000; text-align: center;">${r.unit || ''}</td>
      <td style="border: 1px solid #000; text-align: center;">${r.ar_no || ''}</td>
    </tr>`
    )
    .join('')

  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta charset="utf-8">
      <!--[if gte mso 9]>
      <xml>
        <x:ExcelWorkbook>
          <x:ExcelWorksheets>
            <x:ExcelWorksheet>
              <x:Name>Oil RM Slip</x:Name>
              <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
            </x:ExcelWorksheet>
          </x:ExcelWorksheets>
        </x:ExcelWorkbook>
      </xml>
      <![endif]-->
      <style>
        body { font-family: 'Times New Roman', Times, serif; font-size: 11pt; }
        table { border-collapse: collapse; width: 100%; }
        th { border: 1px solid #000; background-color: #f1f5f9; font-weight: bold; text-align: center; }
        td { border: 1px solid #000; }
        .hdr { font-size: 14pt; font-weight: bold; text-align: center; }
        .dept { font-size: 11pt; font-weight: bold; text-align: center; }
        .bmr { font-size: 12pt; font-weight: bold; text-align: center; }
        .bold-u { font-weight: bold; text-decoration: underline; text-align: center; }
      </style>
    </head>
    <body>
      <table>
        <tr><td colspan="7" class="hdr">${companyTitle}</td></tr>
        <tr><td colspan="7" class="dept">PRODUCTION ( EXTERNAL PREPERATION DEPARTMENT)</td></tr>
        <tr><td colspan="7" class="bmr">BATCH MANUFACTURING RECORD (BMR)</td></tr>
        <tr>
          <td colspan="4"><strong>PRODUCT :</strong> ${header.product || product?.name || ''}</td>
          <td colspan="3"><strong>BMR NO. :</strong> ${header.bmr_no || product?.bmr_no || ''}</td>
        </tr>
        <tr>
          <td colspan="4"><strong>PRODUCT CODE :</strong> ${header.product_code || product?.code || ''}</td>
          <td colspan="3"><strong>EFFECTIVE DATE :</strong> ${header.effective_date || ''}</td>
        </tr>
        <tr>
          <td colspan="4"><strong>COMPANY CODE :</strong> ${header.company_code || (isTej ? 'TEJ' : 'CMHP')}</td>
          <td colspan="3"><strong>SUPERSEDES NO :</strong> ${header.supersedes_no || '00'}</td>
        </tr>
        <tr>
          <td colspan="4"><strong>BATCH NO. :</strong> ${header.batch_no || ''}</td>
          <td colspan="3"><strong>VERSION NO :</strong> ${header.version_no || '01'}</td>
        </tr>
        <tr>
          <td colspan="4"><strong>MFG. FOR :</strong> ${header.mfg_for || ''}</td>
          <td colspan="3"><strong>MASTER FORMULA NO. :</strong> ${header.master_formula_no || formula?.code || ''}</td>
        </tr>
        <tr><td colspan="7"></td></tr>
        <tr><td colspan="7" class="bold-u">ATTACHMENT - 1</td></tr>
        <tr><td colspan="7" class="bold-u">RAW MATERIAL REQUISITION SLIP</td></tr>
        <tr><td colspan="7" style="font-weight: bold; text-decoration: underline;">BATCH FORMULA:</td></tr>
        <tr>
          <th style="width: 45px;">Sr. No.</th>
          <th style="width: 80px;">RM Code</th>
          <th>RAW MATERIAL NAME</th>
          <th style="width: 95px;">Label Claim</th>
          <th style="width: 75px;">Qty. Req</th>
          <th style="width: 55px;">Unit</th>
          <th style="width: 90px;">AR.No.</th>
        </tr>
        ${rowsHtml}
        <tr><td colspan="7"></td></tr>
        <tr>
          <td colspan="4"><strong>Weight by/Date (Warehouse):</strong> ${signoff.weight_by_warehouse || ''}</td>
          <td colspan="3"><strong>Weight check by/Date (Warehouse) :</strong> ${signoff.weight_check_by_warehouse || ''}</td>
        </tr>
        <tr>
          <td colspan="4"><strong>Checked by / Date (Production) :</strong> ${signoff.checked_by_production || ''}</td>
          <td colspan="3"><strong>Checked by / Date (QA) :</strong> ${signoff.checked_by_qa || ''}</td>
        </tr>
        <tr><td colspan="7"></td></tr>
        <tr>
          <td style="font-weight: bold;"></td>
          <td colspan="2" style="font-weight: bold; text-align: center;">Prepared By<br/>Production Chemist</td>
          <td colspan="2" style="font-weight: bold; text-align: center;">Reviewed By<br/>Production In-Charge</td>
          <td colspan="2" style="font-weight: bold; text-align: center;">Approved By<br/>QA Manager</td>
        </tr>
        <tr>
          <td style="font-weight: bold;">Name</td>
          <td colspan="2" style="text-align: center;">${approval.prep_name || ''}</td>
          <td colspan="2" style="text-align: center;">${approval.rev_name || ''}</td>
          <td colspan="2" style="text-align: center;">${approval.app_name || ''}</td>
        </tr>
        <tr>
          <td style="font-weight: bold;">Signature</td>
          <td colspan="2" style="text-align: center;">${approval.prep_sign || ''}</td>
          <td colspan="2" style="text-align: center;">${approval.rev_sign || ''}</td>
          <td colspan="2" style="text-align: center;">${approval.app_sign || ''}</td>
        </tr>
        <tr>
          <td style="font-weight: bold;">Date</td>
          <td colspan="2" style="text-align: center;">${approval.prep_date || ''}</td>
          <td colspan="2" style="text-align: center;">${approval.rev_date || ''}</td>
          <td colspan="2" style="text-align: center;">${approval.app_date || ''}</td>
        </tr>
        <tr>
          <td colspan="4" style="font-size: 9pt; font-weight: bold;">FORM NO. SOP/QA/04/F-04/00</td>
          <td colspan="3" style="font-size: 9pt; font-weight: bold; text-align: right;">Page 1 of 1</td>
        </tr>
      </table>
    </body>
    </html>
  `

  triggerDownload(html, filename)
}

export function exportOilPmExcel({ slipData = {}, product = {}, formula = {}, revision = {}, company = {} }) {
  const isTej = isTejBiocare(company) || isTejBiocare()
  const branding = getCompanyBranding(isTej ? 'tej' : 'cmhp')
  const companyTitle = branding.isTej ? branding.headerName : 'CENTRAL MANUFACTURING HOMEOPATHIC PHARMACY'

  const header = slipData.header || {}
  const meta = slipData.meta || {}
  const rows = slipData.rows || []
  const signoff = slipData.signoff || {}
  const approval = slipData.approval || {}

  const filename = `Oil_PM_Attachment_4_${(product.code || 'PRD').replace(/\s+/g, '_')}_Rev${revision.revision_number || '01'}.xls`

  const rowsHtml = rows
    .map(
      (r, idx) => `
    <tr>
      <td style="border: 1px solid #000; text-align: center;">${r.sr_no || idx + 1}</td>
      <td style="border: 1px solid #000; text-align: center;">${r.material_code || ''}</td>
      <td style="border: 1px solid #000; text-align: left; font-weight: bold;">${r.material || ''}</td>
      <td style="border: 1px solid #000; text-align: center;">${r.quantity_required || ''}</td>
      <td style="border: 1px solid #000; text-align: center;">${r.quantity_received || ''}</td>
      <td style="border: 1px solid #000; text-align: center;">${r.ar_no || ''}</td>
    </tr>`
    )
    .join('')

  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta charset="utf-8">
      <!--[if gte mso 9]>
      <xml>
        <x:ExcelWorkbook>
          <x:ExcelWorksheets>
            <x:ExcelWorksheet>
              <x:Name>Oil PM Slip</x:Name>
              <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
            </x:ExcelWorksheet>
          </x:ExcelWorksheets>
        </x:ExcelWorkbook>
      </xml>
      <![endif]-->
      <style>
        body { font-family: 'Times New Roman', Times, serif; font-size: 11pt; }
        table { border-collapse: collapse; width: 100%; }
        th { border: 1px solid #000; background-color: #f1f5f9; font-weight: bold; text-align: center; }
        td { border: 1px solid #000; }
        .hdr { font-size: 14pt; font-weight: bold; text-align: center; }
        .dept { font-size: 11pt; font-weight: bold; text-align: center; }
        .bmr { font-size: 12pt; font-weight: bold; text-align: center; }
        .bold-u { font-weight: bold; text-decoration: underline; text-align: center; }
      </style>
    </head>
    <body>
      <table>
        <tr><td colspan="6" class="hdr">${companyTitle}</td></tr>
        <tr><td colspan="6" class="dept">PRODUCTION ( ORAL LIQUID DEPARTMENT)</td></tr>
        <tr><td colspan="6" class="bmr">BATCH MANUFACTURING RECORD (BMR)</td></tr>
        <tr>
          <td colspan="3"><strong>PRODUCT :</strong> ${header.product || product?.name || ''}</td>
          <td colspan="3"><strong>BMR NO. :</strong> ${header.bmr_no || product?.bmr_no || ''}</td>
        </tr>
        <tr>
          <td colspan="3"><strong>PRODUCT CODE :</strong> ${header.product_code || product?.code || ''}</td>
          <td colspan="3"><strong>EFFECTIVE DATE :</strong> ${header.effective_date || ''}</td>
        </tr>
        <tr>
          <td colspan="3"><strong>COMPANY CODE :</strong> ${header.company_code || (isTej ? 'TEJ' : 'CMHP')}</td>
          <td colspan="3"><strong>SUPERSEDES NO :</strong> ${header.supersedes_no || '00'}</td>
        </tr>
        <tr>
          <td colspan="3"><strong>BATCH NO. :</strong> ${header.batch_no || ''}</td>
          <td colspan="3"><strong>VERSION NO :</strong> ${header.version_no || '01'}</td>
        </tr>
        <tr>
          <td colspan="3"><strong>MFG. FOR :</strong> ${header.mfg_for || ''}</td>
          <td colspan="3"><strong>MASTER FORMULA NO. :</strong> ${header.master_formula_no || formula?.code || ''}</td>
        </tr>
        <tr><td colspan="6"></td></tr>
        <tr><td colspan="6" class="bold-u">ATTACHMENT - 4</td></tr>
        <tr><td colspan="6" style="font-weight: bold; text-decoration: underline;">PACKING MATERIAL REQUIREMENT:</td></tr>
        <tr>
          <td colspan="3"><strong>PM Requisition Slip No. :</strong> ${meta.pm_requisition_slip_no || ''}</td>
          <td colspan="3"><strong>Date :</strong> ${meta.date || ''}</td>
        </tr>
        <tr>
          <th style="width: 45px;">Sr. No.</th>
          <th style="width: 100px;">Material Code</th>
          <th>Material</th>
          <th style="width: 130px;">Quantity Required Nos.</th>
          <th style="width: 130px;">Quantity Received  Nos.</th>
          <th style="width: 90px;">AR No.</th>
        </tr>
        ${rowsHtml}
        <tr><td colspan="6"></td></tr>
        <tr>
          <td colspan="6"><strong>Checked By (Warehouse):</strong> ${signoff.checked_by_warehouse || ''}</td>
        </tr>
        <tr>
          <td colspan="6"><strong>Received By (Production):</strong> ${signoff.received_by_production || ''}</td>
        </tr>
        <tr>
          <td colspan="6"><strong>Verified by ( QA):</strong> ${signoff.verified_by_qa || ''}</td>
        </tr>
        <tr><td colspan="6"></td></tr>
        <tr>
          <td style="font-weight: bold;"></td>
          <td colspan="2" style="font-weight: bold; text-align: center;">Prepared By<br/>Production Chemist</td>
          <td colspan="2" style="font-weight: bold; text-align: center;">Reviewed By<br/>Production In-Charge</td>
          <td style="font-weight: bold; text-align: center;">Approved By<br/>QA Manager</td>
        </tr>
        <tr>
          <td style="font-weight: bold;">Name</td>
          <td colspan="2" style="text-align: center;">${approval.prep_name || ''}</td>
          <td colspan="2" style="text-align: center;">${approval.rev_name || ''}</td>
          <td style="text-align: center;">${approval.app_name || ''}</td>
        </tr>
        <tr>
          <td style="font-weight: bold;">Signature</td>
          <td colspan="2" style="text-align: center;">${approval.prep_sign || ''}</td>
          <td colspan="2" style="text-align: center;">${approval.rev_sign || ''}</td>
          <td style="text-align: center;">${approval.app_sign || ''}</td>
        </tr>
        <tr>
          <td style="font-weight: bold;">Date</td>
          <td colspan="2" style="text-align: center;">${approval.prep_date || ''}</td>
          <td colspan="2" style="text-align: center;">${approval.rev_date || ''}</td>
          <td style="text-align: center;">${approval.app_date || ''}</td>
        </tr>
        <tr>
          <td colspan="3" style="font-size: 9pt; font-weight: bold;">FORM NO. SOP/QA/04/F-04/00</td>
          <td colspan="3" style="font-size: 9pt; font-weight: bold; text-align: right;">Page 1 of 1</td>
        </tr>
      </table>
    </body>
    </html>
  `

  triggerDownload(html, filename)
}

export function exportMotherTinctureRmExcel({ slipData = {}, product = {}, formula = {}, revision = {}, company = {} }) {
  const isTej = isTejBiocare(company) || isTejBiocare()
  const branding = getCompanyBranding(isTej ? 'tej' : 'cmhp')
  const companyTitle = branding.isTej ? branding.headerName : (slipData.header_title || 'CMHP PRIVATE LIMITED')
  const filename = `Mother_Tincture_RM_Attachment_1_${(product.code || product.name || 'MT').replace(/\s+/g, '_')}_Rev${revision?.revision_number || '01'}.xls`

  const table2Rows = slipData.table2_rows || [
    { label: 'DATE & FOR', value: '' },
    { label: 'NAME', value: '' },
    { label: 'DRUG QTY', value: '' },
    { label: 'ALC Qty', value: '' },
    { label: 'WATER QTY', value: '' },
    { label: 'MAKE UP', value: '' },
  ]

  const t2Html = table2Rows.map(r => `
    <tr>
      <td style="border: 1px solid #000; text-align: center; font-weight: bold; width: 140px; padding: 4px;">${r.label}</td>
      <td style="border: 1px solid #000; width: 380px; padding: 4px;">${r.value || ''}</td>
    </tr>
  `).join('')

  const singleFormHtml = `
    <table style="width: 520px; border-collapse: collapse; font-family: 'Times New Roman', serif; font-size: 11pt; margin-bottom: 12px;">
      <tr>
        <td colspan="2" style="border: 1px solid #000; text-align: center; font-size: 16pt; font-weight: bold; padding: 6px;">
          ${companyTitle}
        </td>
      </tr>
      <tr>
        <td colspan="2" style="border: 1px solid #000; text-align: center; font-size: 12pt; font-weight: bold; padding: 4px;">
          ${slipData.prod_attachment_label || 'PRODUCTION  (ATTACHMENT 1)'}
        </td>
      </tr>
      <tr>
        <td style="border: 1px solid #000; text-align: center; font-weight: bold; width: 55%; padding: 4px;">
          ${slipData.slip_title || 'RM REQUEST FOR  MOTHER  TINCTURE'}
        </td>
        <td style="border: 1px solid #000; width: 45%; padding: 4px;">
          <b>${slipData.date_tr_no_label || 'DATE/ TR NO :'}</b> ${slipData.date_tr_no || ''}
        </td>
      </tr>
      <tr>
        <td style="border: 1px solid #000; font-weight: bold; padding: 4px;">
          ${slipData.department_label || 'DEPARTMENT :  MOTHER TINCTURE'}
        </td>
        <td style="border: 1px solid #000; font-weight: bold; padding: 4px;">
          ${slipData.form_no_label || 'FORME NO. SOP/MT/01/F01-00'}
        </td>
      </tr>
      <tr>
        <td colspan="2" style="border: 1px solid #000; padding: 4px;">
          <b>${slipData.herb_label || 'HERB :'}</b> ${slipData.herb || ''}
        </td>
      </tr>
      <tr>
        <td colspan="2" style="border: 1px solid #000; padding: 4px;">
          <b>${slipData.batch_no_label || 'BATCH NO. :'}</b> ${slipData.batch_no || ''} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <b>${slipData.mfg_date_label || 'MFG DATE :'}</b> ${slipData.mfg_date || ''}
        </td>
      </tr>
      <tr>
        <td colspan="2" style="border: 1px solid #000; padding: 4px;">
          <b>${slipData.qty_herb_label || 'QUANTITY OF HERB :'}</b> ${slipData.qty_herb || ''}
        </td>
      </tr>
      <tr>
        <td colspan="2" style="border: 1px solid #000; padding: 6px;">
          <b>${slipData.requested_by_label || 'REQUESTED BY /DATE(PROD.) :'}</b> ${slipData.requested_by || ''} &nbsp;&nbsp;&nbsp;&nbsp; <b>${slipData.issued_by_label || 'ISSUED BY/DATE(WH) :'}</b> ${slipData.issued_by || ''}
          <div style="text-align: center; margin-top: 6px;">
            <b>${slipData.checked_by_label || 'CHEKED BY/DATE (QA):'}</b> ${slipData.checked_by || ''}
          </div>
        </td>
      </tr>
    </table>
  `

  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta charset="utf-8">
    </head>
    <body>
      ${singleFormHtml}
      <br/>
      ${singleFormHtml}
      <br/>
      <table style="width: 520px; border-collapse: collapse; font-family: 'Times New Roman', serif; font-size: 11pt;">
        ${t2Html}
      </table>
    </body>
    </html>
  `

  triggerDownload(html, filename)
}

export function exportSyrupRmExcel({ slipData = {}, product = {}, formula = {}, revision = {}, company = {} }) {
  const isTej = isTejBiocare(company) || isTejBiocare()
  const branding = getCompanyBranding(isTej ? 'tej' : 'cmhp')
  const companyTitle = branding.isTej ? branding.headerName : 'CMHP PRIVATE LIMITED'

  const header = slipData.header || {}
  const mainRows = slipData.main_rows || []
  const excipientRows = slipData.excipient_rows || []
  const footer = slipData.footer || {}

  const filename = `Syrup_RM_Attachment_1_${(product.code || 'PRD').replace(/\s+/g, '_')}_Rev${revision.revision_number || '01'}.xls`

  const mainRowsHtml = mainRows
    .map(
      (r, idx) => `
    <tr>
      <td style="border: 1px solid #000; text-align: center;">${r.sr_no || idx + 1}</td>
      <td style="border: 1px solid #000; text-align: center;">${r.rm_code || ''}</td>
      <td style="border: 1px solid #000; text-align: left; text-transform: uppercase;">${r.name || ''}</td>
      <td style="border: 1px solid #000; text-align: center;">${r.label_claim || ''}</td>
      <td style="border: 1px solid #000; text-align: center;">${r.qty_req || ''}</td>
      <td style="border: 1px solid #000; text-align: center;">${r.unit || ''}</td>
      <td style="border: 1px solid #000; text-align: center;">${r.ar_no || ''}</td>
    </tr>`
    )
    .join('')

  const excipientRowsHtml = excipientRows
    .map(
      (r, idx) => `
    <tr>
      <td style="border: 1px solid #000; text-align: center;">${r.sr_no || idx + 1}</td>
      <td style="border: 1px solid #000; text-align: center;">${r.rm_code || ''}</td>
      <td style="border: 1px solid #000; text-align: left; text-transform: uppercase;">${r.name || ''}</td>
      <td style="border: 1px solid #000; text-align: center; background-color: #a6a6a6;">${r.label_claim || ''}</td>
      <td style="border: 1px solid #000; text-align: center;">${r.qty_req || ''}</td>
      <td style="border: 1px solid #000; text-align: center;">${r.unit || ''}</td>
      <td style="border: 1px solid #000; text-align: center;">${r.ar_no || ''}</td>
    </tr>`
    )
    .join('')

  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta charset="utf-8">
      <!--[if gte mso 9]>
      <xml>
        <x:ExcelWorkbook>
          <x:ExcelWorksheets>
            <x:ExcelWorksheet>
              <x:Name>Syrup RM Slip</x:Name>
              <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
            </x:ExcelWorksheet>
          </x:ExcelWorksheets>
        </x:ExcelWorkbook>
      </xml>
      <![endif]-->
      <style>
        body { font-family: 'Times New Roman', Times, serif; font-size: 11pt; }
        table { border-collapse: collapse; width: 100%; }
        th { border: 1px solid #000; background-color: #ffffff; font-weight: bold; text-align: center; }
        td { border: 1px solid #000; }
        .hdr { font-size: 14pt; font-weight: bold; text-align: center; }
        .dept { font-size: 11pt; font-weight: bold; text-align: center; }
        .bmr { font-size: 12pt; font-weight: bold; text-align: center; }
        .bold-u { font-weight: bold; text-decoration: underline; text-align: center; }
      </style>
    </head>
    <body>
      <table>
        <tr><td colspan="7" class="hdr">${companyTitle}</td></tr>
        <tr><td colspan="7" class="dept">PRODUCTION ( ORAL LIQUID DEPARTMENT)</td></tr>
        <tr><td colspan="7" class="bmr">BATCH MANUFACTURING RECORD (BMR)</td></tr>
        <tr>
          <td colspan="4"><strong>PRODUCT :</strong> ${header.product || product?.name || ''}</td>
          <td colspan="3"><strong>BMR NO. :</strong> ${header.bmr_no || product?.bmr_no || ''}</td>
        </tr>
        <tr>
          <td colspan="4"><strong>PRODUCT CODE :</strong> ${header.product_code || product?.code || ''}</td>
          <td colspan="3"><strong>EFFECTIVE DATE :</strong> ${header.effective_date || ''}</td>
        </tr>
        <tr>
          <td colspan="4"><strong>COMPANY CODE :</strong> ${header.company_code || (isTej ? 'TEJ' : 'CMHP')}</td>
          <td colspan="3"><strong>SUPERSEDES NO :</strong> ${header.supersedes_no || '00'}</td>
        </tr>
        <tr>
          <td colspan="4"><strong>BATCH NO. :</strong> ${header.batch_no || ''}</td>
          <td colspan="3"><strong>VERSION NO :</strong> ${header.version_no || '01'}</td>
        </tr>
        <tr>
          <td colspan="4"><strong>MFG. FOR :</strong> ${header.mfg_for || 'APEX ANIMAL HEALTH PRODUCTS'}</td>
          <td colspan="3"><strong>MASTER FOMULA NO. :</strong> ${header.master_formula_no || formula?.code || ''}</td>
        </tr>
      </table>
      <br/>
      <div class="bold-u">ATTACHMENT - 1</div>
      <div class="bold-u">RAW MATERIAL REQUISITION SLIP</div>
      <div style="font-weight: bold; text-decoration: underline; text-align: left;">BATCH FORMULA:</div>
      <table>
        <thead>
          <tr>
            <th>Sr. No.</th>
            <th>RM Code</th>
            <th>RAW MATERIAL NAME</th>
            <th>Label Claim</th>
            <th>Qty. Req</th>
            <th>Unit</th>
            <th>AR. No.</th>
          </tr>
        </thead>
        <tbody>
          ${mainRowsHtml}
          <tr>
            <th>Sr. No.</th>
            <th>RM Code</th>
            <th>RAW MATERIAL NAME</th>
            <th>Label Claim</th>
            <th>Qty. Req</th>
            <th>Unit</th>
            <th>AR. No.</th>
          </tr>
          <tr>
            <td colspan="7" style="text-align: center; font-weight: bold;">EXCIPIENTS</td>
          </tr>
          ${excipientRowsHtml}
        </tbody>
      </table>
      <br/>
      <table>
        <tr>
          <td colspan="4">Weight by/Date (Warehouse) : ${footer.weight_by_warehouse || ''}</td>
          <td colspan="3">Weight check by/Date (Warehouse) : ${footer.weight_check_by_warehouse || ''}</td>
        </tr>
        <tr>
          <td colspan="4">Checked by / Date (Production) : ${footer.checked_by_production || ''}</td>
          <td colspan="3">Checked by / Date (QA) : ${footer.checked_by_qa || ''}</td>
        </tr>
      </table>
      <br/>
      <table>
        <tr>
          <th style="background-color: #d9d9d9;"></th>
          <th>Prepared By<br/>Production Chemist</th>
          <th>Reviewed By<br/>Production In-Charge</th>
          <th>Approved By<br/>QA Manager</th>
        </tr>
        <tr>
          <td><strong>Name</strong></td>
          <td>${footer.name_prepared || ''}</td>
          <td>${footer.name_reviewed || ''}</td>
          <td>${footer.name_approved || ''}</td>
        </tr>
        <tr>
          <td><strong>Signature</strong></td>
          <td>${footer.sign_prepared || ''}</td>
          <td>${footer.sign_reviewed || ''}</td>
          <td>${footer.sign_approved || ''}</td>
        </tr>
        <tr>
          <td><strong>Date</strong></td>
          <td>${footer.date_prepared || ''}</td>
          <td>${footer.date_reviewed || ''}</td>
          <td>${footer.date_approved || ''}</td>
        </tr>
      </table>
      <table>
        <tr>
          <td colspan="4" style="border: none;">FORM NO.  SOP/QA/04/F-03/00</td>
          <td colspan="3" style="border: none; text-align: right;">Page 1 of 1</td>
        </tr>
      </table>
    </body>
    </html>
  `

  triggerDownload(html, filename)
}

export function exportSyrupPmExcel({ slipData = {}, product = {}, formula = {}, revision = {}, company = {} }) {
  const isTej = isTejBiocare(company) || isTejBiocare()
  const branding = getCompanyBranding(isTej ? 'tej' : 'cmhp')
  const companyTitle = branding.isTej ? branding.headerName : 'CMHP PRIVATE LIMITED'

  const header = slipData.header || {}
  const rows = slipData.rows || []
  const footer = slipData.footer || {}

  const filename = `Syrup_PM_Attachment_4_${(product.code || 'PRD').replace(/\s+/g, '_')}_Rev${revision.revision_number || '01'}.xls`

  const rowsHtml = rows
    .map(
      (r, idx) => `
    <tr>
      <td style="border: 1px solid #000; text-align: center;">${r.sr_no || idx + 1}</td>
      <td style="border: 1px solid #000; text-align: center;">${r.material_code || ''}</td>
      <td style="border: 1px solid #000; text-align: left; font-weight: bold;">${r.material || ''}</td>
      <td style="border: 1px solid #000; text-align: center;">${r.quantity_required || ''}</td>
      <td style="border: 1px solid #000; text-align: center;">${r.quantity_received || ''}</td>
      <td style="border: 1px solid #000; text-align: center;">${r.ar_no || ''}</td>
    </tr>`
    )
    .join('')

  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta charset="utf-8">
      <!--[if gte mso 9]>
      <xml>
        <x:ExcelWorkbook>
          <x:ExcelWorksheets>
            <x:ExcelWorksheet>
              <x:Name>Syrup PM Slip</x:Name>
              <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
            </x:ExcelWorksheet>
          </x:ExcelWorksheets>
        </x:ExcelWorkbook>
      </xml>
      <![endif]-->
      <style>
        body { font-family: 'Times New Roman', Times, serif; font-size: 11pt; }
        table { border-collapse: collapse; width: 100%; }
        th { border: 1px solid #000; background-color: #ffffff; font-weight: bold; text-align: center; }
        td { border: 1px solid #000; }
        .hdr { font-size: 14pt; font-weight: bold; text-align: center; }
        .dept { font-size: 11pt; font-weight: bold; text-align: center; }
        .bmr { font-size: 12pt; font-weight: bold; text-align: center; }
        .bold-u { font-weight: bold; text-decoration: underline; text-align: center; }
      </style>
    </head>
    <body>
      <table>
        <tr><td colspan="6" class="hdr">${companyTitle}</td></tr>
        <tr><td colspan="6" class="dept">PRODUCTION ( ORAL LIQUID DEPARTMENT)</td></tr>
        <tr><td colspan="6" class="bmr">BATCH MANUFACTURING RECORD (BMR)</td></tr>
        <tr>
          <td colspan="3"><strong>PRODUCT :</strong> ${header.product || product?.name || ''}</td>
          <td colspan="3"><strong>BMR NO. :</strong> ${header.bmr_no || product?.bmr_no || ''}</td>
        </tr>
        <tr>
          <td colspan="3"><strong>PRODUCT CODE :</strong> ${header.product_code || product?.code || ''}</td>
          <td colspan="3"><strong>EFFECTIVE DATE :</strong> ${header.effective_date || ''}</td>
        </tr>
        <tr>
          <td colspan="3"><strong>COMPANY CODE :</strong> ${header.company_code || (isTej ? 'TEJ' : 'CMHP')}</td>
          <td colspan="3"><strong>SUPERSEDES NO :</strong> ${header.supersedes_no || '00'}</td>
        </tr>
        <tr>
          <td colspan="3"><strong>BATCH NO. :</strong> ${header.batch_no || ''}</td>
          <td colspan="3"><strong>VERSION NO :</strong> ${header.version_no || '01'}</td>
        </tr>
        <tr>
          <td colspan="3"><strong>MFG. FOR :</strong> ${header.mfg_for || 'APEX ANIMAL HEALTH PRODUCTS'}</td>
          <td colspan="3"><strong>MASTER FOMULA NO. :</strong> ${header.master_formula_no || formula?.code || ''}</td>
        </tr>
      </table>
      <br/>
      <div class="bold-u">ATTACHMENT - 4</div>
      <div style="font-weight: bold; text-decoration: underline; text-align: left;">PACKING MATERIAL REQUIREMENT:</div>
      <table>
        <thead>
          <tr>
            <th>Sr. No.</th>
            <th>Material Code</th>
            <th>Material</th>
            <th>Quantity Required Nos.</th>
            <th>Quantity Received  Nos.</th>
            <th>AR No.</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
      <br/>
      <table>
        <tr><td colspan="6" style="border: none;">Checked By (Warehouse) : ${footer.checked_by_warehouse || ''}</td></tr>
        <tr><td colspan="6" style="border: none;">Received By (Production) : ${footer.received_by_production || ''}</td></tr>
        <tr><td colspan="6" style="border: none;">Verified by ( QA) : ${footer.verified_by_qa || ''}</td></tr>
      </table>
      <br/>
      <table>
        <tr>
          <th style="background-color: #d9d9d9;"></th>
          <th>Prepared By<br/>Production Chemist</th>
          <th>Reviewed By<br/>Production In-Charge</th>
          <th>Approved By<br/>QA Manager</th>
        </tr>
        <tr>
          <td><strong>Name</strong></td>
          <td>${footer.name_prepared || ''}</td>
          <td>${footer.name_reviewed || ''}</td>
          <td>${footer.name_approved || ''}</td>
        </tr>
        <tr>
          <td><strong>Signature</strong></td>
          <td>${footer.sign_prepared || ''}</td>
          <td>${footer.sign_reviewed || ''}</td>
          <td>${footer.sign_approved || ''}</td>
        </tr>
        <tr>
          <td><strong>Date</strong></td>
          <td>${footer.date_prepared || ''}</td>
          <td>${footer.date_reviewed || ''}</td>
          <td>${footer.date_approved || ''}</td>
        </tr>
      </table>
      <table>
        <tr>
          <td colspan="3" style="border: none;">FORM NO.  SOP/QA/04/F-03/00</td>
          <td colspan="3" style="border: none; text-align: right;">Page 1 of 1</td>
        </tr>
      </table>
    </body>
    </html>
  `

  triggerDownload(html, filename)
}

export function exportDropsRmExcel({ slipData = {}, product = {}, formula = {}, revision = {}, company = {} }) {
  const isTej = isTejBiocare(company) || isTejBiocare()
  const branding = getCompanyBranding(isTej ? 'tej' : 'cmhp')
  const companyTitle = branding.isTej ? branding.headerName : 'CMHP PRIVATE LIMITED'

  const header = slipData.header || {}
  const mainRows = slipData.main_rows || []
  const excipientRows = slipData.excipient_rows || []
  const verifications = slipData.verifications || {}
  const signatures = slipData.signatures || {}

  const filename = `Drops_RM_Attachment_1_${(product.code || 'PRD').replace(/\s+/g, '_')}_Rev${revision.revision_number || '01'}.xls`

  const mainRowsHtml = mainRows
    .map(
      (r, idx) => `
    <tr>
      <td style="border: 1px solid #000; text-align: center;">${r.sr_no || idx + 1}</td>
      <td style="border: 1px solid #000; text-align: center;">${r.rm_code || ''}</td>
      <td style="border: 1px solid #000; text-align: left; text-transform: uppercase;">${r.name || ''}</td>
      <td style="border: 1px solid #000; text-align: center;">${r.label_claim || ''}</td>
      <td style="border: 1px solid #000; text-align: center;">${r.qty_req || ''}</td>
      <td style="border: 1px solid #000; text-align: center;">${r.unit || ''}</td>
      <td style="border: 1px solid #000; text-align: center;">${r.ar_no || ''}</td>
    </tr>`
    )
    .join('')

  const excipientRowsHtml = excipientRows
    .map(
      (r, idx) => `
    <tr>
      <td style="border: 1px solid #000; text-align: center;">${r.sr_no || idx + 1}</td>
      <td style="border: 1px solid #000; text-align: center;">${r.rm_code || ''}</td>
      <td style="border: 1px solid #000; text-align: left; text-transform: uppercase;">${r.name || ''}</td>
      <td style="border: 1px solid #000; text-align: center;">${r.label_claim || ''}</td>
      <td style="border: 1px solid #000; text-align: center;">${r.qty_req || ''}</td>
      <td style="border: 1px solid #000; text-align: center;">${r.unit || ''}</td>
      <td style="border: 1px solid #000; text-align: center;">${r.ar_no || ''}</td>
    </tr>`
    )
    .join('')

  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Times New Roman', serif; font-size: 10pt; }
        table { border-collapse: collapse; width: 100%; margin-bottom: 8px; }
        th, td { border: 1px solid #000; padding: 3px 5px; }
        .text-center { text-align: center; }
        .text-bold { font-weight: bold; }
        .u-bold { font-weight: bold; text-decoration: underline; }
      </style>
    </head>
    <body>
      <table>
        <tr>
          <th colspan="7" class="text-center text-bold" style="font-size: 14pt; height: 35px;">${companyTitle}</th>
        </tr>
        <tr>
          <th colspan="7" class="text-center text-bold">PRODUCTION ( ORAL LIQUID DEPARTMENT)</th>
        </tr>
        <tr>
          <th colspan="7" class="text-center text-bold">BATCH MANUFACTURING RECORD (BMR)</th>
        </tr>
        <tr>
          <td colspan="4"><strong>PRODUCT : </strong>${header.product || product.name || ''}</td>
          <td colspan="3"><strong>BMR NO. : </strong>${header.bmr_no || product.bmr_no || ''}</td>
        </tr>
        <tr>
          <td colspan="4"><strong>PRODUCT CODE : </strong>${header.product_code || product.code || ''}</td>
          <td colspan="3"><strong>EFFECTIVE DATE : </strong>${header.effective_date || '12-04-2024'}</td>
        </tr>
        <tr>
          <td colspan="4"><strong>COMPANY CODE : </strong>${header.company_code || 'AAHP'}</td>
          <td colspan="3"><strong>SUPERSEDES NO : </strong>${header.supersedes_no || '00'}</td>
        </tr>
        <tr>
          <td colspan="4"><strong>BATCH NO. : </strong>${header.batch_no || ''}</td>
          <td colspan="3"><strong>VERSION NO  : </strong>${header.version_no || '01'}</td>
        </tr>
        <tr>
          <td colspan="4"><strong>MFG. FOR : </strong>${header.mfg_for || 'APEX ANIMAL HEALTH PRODUCTS'}</td>
          <td colspan="3"><strong>MASTER FORMULA NO. : </strong>${header.master_formula_no || formula.code || ''}</td>
        </tr>
      </table>

      <div class="text-center" style="margin: 8px 0;">
        <div class="u-bold">ATTACHMENT - 1</div>
        <div class="u-bold">RAW MATERIAL REQUISITION SLIP</div>
        <div class="u-bold" style="text-align: left; margin-top: 5px;">BATCH FORMULA:</div>
      </div>

      <table>
        <tr style="background: #f1f5f9;">
          <th style="width: 45px;">Sr. No.</th>
          <th style="width: 80px;">RM Code</th>
          <th>RAW MATERIAL NAME</th>
          <th style="width: 90px;">Label Claim</th>
          <th style="width: 75px;">Qty. Req</th>
          <th style="width: 55px;">Unit</th>
          <th style="width: 90px;">AR.No.</th>
        </tr>
        ${mainRowsHtml}
        <tr style="background: #f1f5f9;">
          <th style="width: 45px;">Sr. No.</th>
          <th style="width: 80px;">RM Code</th>
          <th>RAW MATERIAL NAME</th>
          <th style="width: 90px;">Label Claim</th>
          <th style="width: 75px;">Qty. Req</th>
          <th style="width: 55px;">Unit</th>
          <th style="width: 90px;">AR.No.</th>
        </tr>
        <tr>
          <td colspan="7" class="text-center text-bold">EXCIPIENTS</td>
        </tr>
        ${excipientRowsHtml}
      </table>

      <div style="margin: 6px 0;">
        <div><strong>Weight by/Date (Warehouse) : </strong>${verifications.weight_by_warehouse || ''}</div>
        <div><strong>Checked by / Date (Production) : </strong>${verifications.checked_by_production || ''}</div>
        <div><strong>Checked by / Date (QA) : </strong>${verifications.checked_by_qa || ''}</div>
      </div>

      <table>
        <tr style="background: #f1f5f9;">
          <th style="width: 15%;"></th>
          <th>Prepared By<br/>Production Chemist</th>
          <th>Reviewed By<br/>Production In-Charge</th>
          <th>Approved By<br/>QA Manager</th>
        </tr>
        <tr>
          <td><strong>Name</strong></td>
          <td>${signatures.name_prepared || ''}</td>
          <td>${signatures.name_reviewed || ''}</td>
          <td>${signatures.name_approved || ''}</td>
        </tr>
        <tr>
          <td><strong>Signature</strong></td>
          <td>${signatures.sign_prepared || ''}</td>
          <td>${signatures.sign_reviewed || ''}</td>
          <td>${signatures.sign_approved || ''}</td>
        </tr>
        <tr>
          <td><strong>Date</strong></td>
          <td>${signatures.date_prepared || ''}</td>
          <td>${signatures.date_reviewed || ''}</td>
          <td>${signatures.date_approved || ''}</td>
        </tr>
      </table>
      <table>
        <tr>
          <td colspan="4" style="border: none;">FORM NO. SOP/QA/04/F-02/00</td>
          <td colspan="3" style="border: none; text-align: right;">Page 1 of 1</td>
        </tr>
      </table>
    </body>
    </html>
  `

  triggerDownload(html, filename)
}

export function exportDropsPmExcel({ slipData = {}, product = {}, formula = {}, revision = {}, company = {} }) {
  const isTej = isTejBiocare(company) || isTejBiocare()
  const branding = getCompanyBranding(isTej ? 'tej' : 'cmhp')
  const companyTitle = branding.isTej ? branding.headerName : 'CMHP PRIVATE LIMITED'

  const header = slipData.header || {}
  const rows = slipData.rows || []
  const verifications = slipData.verifications || {}
  const signatures = slipData.signatures || {}

  const filename = `Drops_PM_Attachment_4_${(product.code || 'PRD').replace(/\s+/g, '_')}_Rev${revision.revision_number || '01'}.xls`

  const rowsHtml = rows
    .map(
      (r, idx) => `
    <tr>
      <td style="border: 1px solid #000; text-align: center;">${r.sr_no || idx + 1}</td>
      <td style="border: 1px solid #000; text-align: center;">${r.material_code || ''}</td>
      <td style="border: 1px solid #000; text-align: left; font-weight: bold;">${r.material || ''}</td>
      <td style="border: 1px solid #000; text-align: center;">${r.qty_required || ''}</td>
      <td style="border: 1px solid #000; text-align: center;">${r.qty_received || ''}</td>
      <td style="border: 1px solid #000; text-align: center;">${r.ar_no || ''}</td>
    </tr>`
    )
    .join('')

  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Times New Roman', serif; font-size: 10pt; }
        table { border-collapse: collapse; width: 100%; margin-bottom: 8px; }
        th, td { border: 1px solid #000; padding: 3px 5px; }
        .text-center { text-align: center; }
        .text-bold { font-weight: bold; }
        .u-bold { font-weight: bold; text-decoration: underline; }
      </style>
    </head>
    <body>
      <table>
        <tr>
          <th colspan="6" class="text-center text-bold" style="font-size: 14pt; height: 35px;">${companyTitle}</th>
        </tr>
        <tr>
          <th colspan="6" class="text-center text-bold">PRODUCTION ( ORAL LIQUID DEPARTMENT)</th>
        </tr>
        <tr>
          <th colspan="6" class="text-center text-bold">BATCH MANUFACTURING RECORD (BMR)</th>
        </tr>
        <tr>
          <td colspan="3"><strong>PRODUCT : </strong>${header.product || product.name || ''}</td>
          <td colspan="3"><strong>BMR NO. : </strong>${header.bmr_no || product.bmr_no || ''}</td>
        </tr>
        <tr>
          <td colspan="3"><strong>PRODUCT CODE : </strong>${header.product_code || product.code || ''}</td>
          <td colspan="3"><strong>EFFECTIVE DATE : </strong>${header.effective_date || '12-04-2024'}</td>
        </tr>
        <tr>
          <td colspan="3"><strong>COMPANY CODE : </strong>${header.company_code || 'AAHP'}</td>
          <td colspan="3"><strong>SUPERSEDES NO : </strong>${header.supersedes_no || '00'}</td>
        </tr>
        <tr>
          <td colspan="3"><strong>BATCH NO. : </strong>${header.batch_no || ''}</td>
          <td colspan="3"><strong>VERSION NO  : </strong>${header.version_no || '01'}</td>
        </tr>
        <tr>
          <td colspan="3"><strong>MFG. FOR : </strong>${header.mfg_for || 'APEX ANIMAL HEALTH PRODUCTS'}</td>
          <td colspan="3"><strong>MASTER FORMULA NO. : </strong>${header.master_formula_no || formula.code || ''}</td>
        </tr>
      </table>

      <div class="text-center" style="margin: 8px 0;">
        <div class="u-bold">ATTACHMENT - 4</div>
        <div class="u-bold">PACKING MATERIAL REQUIREMENT:</div>
      </div>

      <table>
        <tr style="background: #f1f5f9;">
          <th style="width: 50px;">Sr. No.</th>
          <th style="width: 90px;">Material Code</th>
          <th>Material</th>
          <th style="width: 110px;">Quantity Required Nos.</th>
          <th style="width: 110px;">Quantity Received  Nos.</th>
          <th style="width: 90px;">AR No.</th>
        </tr>
        ${rowsHtml}
      </table>

      <div style="margin: 6px 0;">
        <div><strong>Checked By (Warehouse) : </strong>${verifications.checked_by_warehouse || ''}</div>
        <div><strong>Received By (Production) : </strong>${verifications.received_by_production || ''}</div>
        <div><strong>Verified by ( QA) : </strong>${verifications.verified_by_qa || ''}</div>
      </div>

      <table>
        <tr style="background: #f1f5f9;">
          <th style="width: 15%;"></th>
          <th>Prepared By<br/>Production Chemist</th>
          <th>Reviewed By<br/>Production In-Charge</th>
          <th>Approved By<br/>QA Manager</th>
        </tr>
        <tr>
          <td><strong>Name</strong></td>
          <td>${signatures.name_prepared || ''}</td>
          <td>${signatures.name_reviewed || ''}</td>
          <td>${signatures.name_approved || ''}</td>
        </tr>
        <tr>
          <td><strong>Signature</strong></td>
          <td>${signatures.sign_prepared || ''}</td>
          <td>${signatures.sign_reviewed || ''}</td>
          <td>${signatures.sign_approved || ''}</td>
        </tr>
        <tr>
          <td><strong>Date</strong></td>
          <td>${signatures.date_prepared || ''}</td>
          <td>${signatures.date_reviewed || ''}</td>
          <td>${signatures.date_approved || ''}</td>
        </tr>
      </table>
      <table>
        <tr>
          <td colspan="3" style="border: none;">FORM NO. SOP/QA/04/F-02/00</td>
          <td colspan="3" style="border: none; text-align: right;">Page 1 of 1</td>
        </tr>
      </table>
    </body>
    </html>
  `

  triggerDownload(html, filename)
}
