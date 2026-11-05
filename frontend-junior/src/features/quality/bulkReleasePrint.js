/**
 * Attachment 3 — BULK RELEASE SLIP
 * Exact 1-to-1 Replica of SOP/QC/03/F-02/00 Document
 * Generates spacious, balanced A4 portrait document with perfect line alignment.
 */
import cmhpLogoUrl from '../../assets/cmhp_invoice_logo.png'

const FORM_NO = 'SOP/QC/03/F-02/00'

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function field(val, width = 110) {
  return `<span style="display:inline-flex;align-items:center;min-width:${width}px;padding:0 4px;font-family:'Times New Roman',Times,Georgia,serif;font-size:11pt;line-height:normal;vertical-align:middle;">${esc(val)}</span>`
}

function styles() {
  return `
    @page { size: A4 portrait; margin: 15mm 12mm; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0;
      background: #fff; color: #000;
      font-family: 'Times New Roman', Times, Georgia, serif;
      font-size: 11pt;
      line-height: 1.3;
    }

    .att3-doc {
      width: 185mm;
      margin: 0 auto;
      border: 1.5px solid #000000;
      background: #ffffff;
      color: #000000;
    }

    /* 1. Header Box */
    .att3-top-box {
      border-bottom: 1.5px solid #000000;
      padding: 16px 20px 0;
      min-height: 140px;
      display: flex;
      flex-direction: column;
    }
    .att3-header-row {
      display: flex;
      align-items: center;
      width: 100%;
    }
    .att3-logo-wrap {
      width: 80px;
      flex-shrink: 0;
    }
    .att3-logo-wrap img {
      height: 40px;
      width: auto;
      display: block;
    }
    .att3-company-title {
      flex: 1;
      text-align: center;
      font-size: 18pt;
      font-weight: 700;
      letter-spacing: 0.6px;
      margin-left: -80px;
    }

    /* 2. QUALITY CONTROL */
    .att3-qc-row {
      text-align: center;
      font-size: 12pt;
      font-weight: 700;
      padding: 7px 10px;
      border-bottom: 1.5px solid #000000;
      letter-spacing: 0.6px;
    }

    /* 3. Title row */
    .att3-title-row {
      display: flex;
      align-items: center;
      padding: 6px 16px;
      border-bottom: 1.5px solid #000000;
      font-size: 11pt;
      font-weight: 700;
    }
    .att3-title-center {
      flex: 1;
      text-align: center;
      letter-spacing: 0.8px;
    }
    .att3-title-right {
      flex-shrink: 0;
    }

    /* 4. TO DEPARTMENT | FORM NO. */
    .att3-todep-row {
      display: flex;
      border-bottom: 1.5px solid #000000;
      min-height: 38px;
      align-items: stretch;
    }
    .att3-todep-left {
      width: 63%;
      border-right: 1.5px solid #000000;
      display: flex;
      align-items: center;
      padding: 4px 16px;
      font-weight: 700;
      font-size: 11pt;
    }
    .att3-todep-right {
      width: 37%;
      display: flex;
      align-items: center;
      padding: 4px 16px;
      font-weight: 700;
      font-size: 11pt;
      white-space: nowrap;
    }

    /* 5. Open rows */
    .att3-open-row {
      display: flex;
      align-items: center;
      border-bottom: 1.5px solid #000000;
      min-height: 38px;
      padding: 4px 16px;
      font-size: 11pt;
    }
    .att3-label {
      font-weight: 700;
      white-space: nowrap;
      margin-right: 4px;
      display: inline-flex;
      align-items: center;
    }

    /* 6. Test results */
    .att3-tests-box {
      border-bottom: 1.5px solid #000000;
      padding: 12px 16px 18px;
    }
    .att3-tests-head {
      font-weight: 700;
      font-size: 11pt;
      margin-bottom: 10px;
    }
    .att3-test-item {
      display: flex;
      align-items: center;
      min-height: 32px;
      margin-bottom: 6px;
      font-size: 11pt;
      line-height: 1.4;
    }
    .att3-test-name {
      width: 195px;
      min-width: 195px;
      font-weight: 700;
      white-space: nowrap;
    }
    .att3-test-obs-wrap {
      width: 140px;
      min-width: 140px;
      display: flex;
      align-items: center;
    }
    .att3-test-limit-wrap {
      display: flex;
      align-items: center;
      flex: 1;
    }

    /* 7. Sign 1 */
    .att3-sign-row-1 {
      display: flex;
      align-items: center;
      border-bottom: 1.5px solid #000000;
      min-height: 44px;
      padding: 6px 16px;
      font-size: 11pt;
      font-weight: 700;
    }

    /* 8. Status */
    .att3-status-row {
      border-bottom: 1.5px solid #000000;
      min-height: 38px;
      padding: 10px 16px;
      font-weight: 700;
      font-size: 11pt;
      display: flex;
      align-items: center;
    }

    /* 9. Sign 2 */
    .att3-sign-row-2 {
      display: flex;
      align-items: center;
      min-height: 44px;
      padding: 6px 16px;
      font-size: 11pt;
      font-weight: 700;
    }
  `
}

export function buildBulkReleaseNoteHtml(data = {}, { logoSrc } = {}) {
  const logo = logoSrc || cmhpLogoUrl

  const {
    to_department = '',
    product = data.product_name || '',
    tr_no = data.ar_no || '',
    batch_no = '',
    mfg_date = '',
    exp_years = data.expiry_date || '',
    batch_size = '',
    no_of_bottles = '',

    // Test results
    appearance_obs = data.appearance?.observed || '',
    appearance_limit = data.appearance?.limit_low || '',

    odor_obs = data.odor?.observed || '',
    odor_limit = data.odor?.limit_low || '',

    wt_ml_obs = data.wt_ml?.observed || '',
    wt_ml_low = data.wt_ml?.limit_low || '',
    wt_ml_high = data.wt_ml?.limit_high || '',

    viscosity_obs = data.viscosity?.observed || '',
    viscosity_low = data.viscosity?.limit_low || '',
    viscosity_high = data.viscosity?.limit_high || '',

    acid_value_obs = data.acid_value?.observed || '',
    acid_value_low = data.acid_value?.limit_low || '',
    acid_value_high = data.acid_value?.limit_high || '',

    peroxide_value_obs = data.peroxide?.observed || '',
    peroxide_value_low = data.peroxide?.limit_low || '',
    peroxide_value_high = data.peroxide?.limit_high || '',

    iodine_value_obs = data.iodine?.observed || '',
    iodine_value_low = data.iodine?.limit_low || '',
    iodine_value_high = data.iodine?.limit_high || '',

    saponification_obs = data.saponification?.observed || '',
    saponification_low = data.saponification?.limit_low || '',
    saponification_high = data.saponification?.limit_high || '',

    sign_qc = '',
    received_qa = '',
    sign_qa = '',
    received_production = '',
  } = data

  const renderLimitDual = (low, high, unit = '') => {
    return `(Limit: ${field(low, 55)} <span style="margin:0 6px; font-weight:700;">to</span> ${field(high, 55)} ${unit ? '<span style="margin-left:6px; font-weight:700;">' + esc(unit) + '</span>' : ''})`
  }

  const renderLimitSingle = (lim) => {
    return `(Limit: ${field(lim, 180)} )`
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Attachment-3 Bulk Release Slip</title>
  <style>${styles()}</style>
</head>
<body>
<div class="att3-doc">

  <!-- 1. Header Box -->
  <div class="att3-top-box">
    <div class="att3-header-row">
      <div class="att3-logo-wrap">
        <img src="${esc(logo)}" alt="CMHP Logo"/>
      </div>
      <div class="att3-company-title">
        CMHP PRIVATE LIMITED
      </div>
    </div>
  </div>

  <!-- 2. QUALITY CONTROL -->
  <div class="att3-qc-row">
    QUALITY CONTROL
  </div>

  <!-- 3. BULK RELEASE SLIP | Attachment-3 -->
  <div class="att3-title-row">
    <div class="att3-title-center">BULK &nbsp; RELEASE SLIP</div>
    <div class="att3-title-right">Attachment-3</div>
  </div>

  <!-- 4. TO DEPARTMENT | FORM NO. -->
  <div class="att3-todep-row">
    <div class="att3-todep-left">
      <span class="att3-label" style="min-width:165px;">TO DEPARTMENT</span>
      <span style="margin:0 4px; font-weight:700;">:</span>
      ${field(to_department, 180)}
    </div>
    <div class="att3-todep-right">
      <span>FORM NO.: ${esc(FORM_NO)}</span>
    </div>
  </div>

  <!-- 5. PRODUCT | T.R. No. -->
  <div class="att3-open-row">
    <span class="att3-label" style="min-width:165px;">PRODUCT</span>
    <span style="margin:0 4px; font-weight:700;">:</span>
    <span style="flex:1; margin-right:20px;">${field(product, 200)}</span>
    <span class="att3-label">T.R. No.:</span>
    ${field(tr_no, 110)}
  </div>

  <!-- 6. BATCH NO. -->
  <div class="att3-open-row">
    <span class="att3-label" style="min-width:165px;">BATCH NO.</span>
    <span style="margin:0 4px; font-weight:700;">:</span>
    <span style="flex:1;">${field(batch_no, 260)}</span>
  </div>

  <!-- 7. MFG. DATE | EXP. DATE -->
  <div class="att3-open-row">
    <span class="att3-label" style="min-width:165px;">MFG. DATE</span>
    <span style="margin:0 4px; font-weight:700;">:</span>
    <span style="flex:1; margin-right:20px;">${field(mfg_date, 160)}</span>
    <span class="att3-label">EXP. DATE/BEST BEFORE :</span>
    <span style="margin-left:4px;">${field(exp_years, 45)}</span>
    <span style="margin-left:6px; font-weight:700;">Years</span>
  </div>

  <!-- 8. BATCH SIZE | NO. OF BOTTLES -->
  <div class="att3-open-row">
    <span class="att3-label" style="min-width:165px;">BATCH SIZE</span>
    <span style="margin:0 4px; font-weight:700;">:</span>
    <span style="flex:1; margin-right:20px;">${field(batch_size, 160)}</span>
    <span class="att3-label">NO. OF BOTTLES &nbsp;:</span>
    <span style="margin-left:4px;">${field(no_of_bottles, 110)}</span>
  </div>

  <!-- 9. TEST RESULTS -->
  <div class="att3-tests-box">
    <div class="att3-tests-head">TEST RESULTS</div>

    <!-- Appearance -->
    <div class="att3-test-item">
      <span class="att3-test-name">• Appearance:</span>
      <span class="att3-test-obs-wrap">${field(appearance_obs, 110)}</span>
      <span class="att3-test-limit-wrap">${renderLimitSingle(appearance_limit)}</span>
    </div>

    <!-- Odor -->
    <div class="att3-test-item">
      <span class="att3-test-name">• Odor</span>
      <span class="att3-test-obs-wrap">${field(odor_obs, 110)}</span>
      <span class="att3-test-limit-wrap">${renderLimitSingle(odor_limit)}</span>
    </div>

    <!-- Wt/ml -->
    <div class="att3-test-item">
      <span class="att3-test-name">• Wt/ml :</span>
      <span class="att3-test-obs-wrap">${field(wt_ml_obs, 110)}</span>
      <span class="att3-test-limit-wrap">${renderLimitDual(wt_ml_low, wt_ml_high, 'gm/ml')}</span>
    </div>

    <!-- Viscosity -->
    <div class="att3-test-item">
      <span class="att3-test-name">• Viscosity :</span>
      <span class="att3-test-obs-wrap">${field(viscosity_obs, 110)}</span>
      <span class="att3-test-limit-wrap">${renderLimitDual(viscosity_low, viscosity_high, 'mPa.S')}</span>
    </div>

    <!-- Acid Value -->
    <div class="att3-test-item">
      <span class="att3-test-name">• Acid Value :</span>
      <span class="att3-test-obs-wrap">${field(acid_value_obs, 110)}</span>
      <span class="att3-test-limit-wrap">${renderLimitDual(acid_value_low, acid_value_high)}</span>
    </div>

    <!-- Peroxide Value -->
    <div class="att3-test-item">
      <span class="att3-test-name">• Peroxide Value :</span>
      <span class="att3-test-obs-wrap">${field(peroxide_value_obs, 110)}</span>
      <span class="att3-test-limit-wrap">${renderLimitDual(peroxide_value_low, peroxide_value_high)}</span>
    </div>

    <!-- Iodine Value -->
    <div class="att3-test-item">
      <span class="att3-test-name">• Iodine Value :</span>
      <span class="att3-test-obs-wrap">${field(iodine_value_obs, 110)}</span>
      <span class="att3-test-limit-wrap">${renderLimitDual(iodine_value_low, iodine_value_high)}</span>
    </div>

    <!-- Saponification Value -->
    <div class="att3-test-item">
      <span class="att3-test-name">• Saponification Value :</span>
      <span class="att3-test-obs-wrap">${field(saponification_obs, 110)}</span>
      <span class="att3-test-limit-wrap">${renderLimitDual(saponification_low, saponification_high)}</span>
    </div>
  </div>

  <!-- 10. Sign 1 -->
  <div class="att3-sign-row-1">
    <span class="att3-label">Sign By / Date (QC) &nbsp;:</span>
    <span style="flex:1; margin-right:24px;">${field(sign_qc, 140)}</span>
    <span class="att3-label">Recieved By / Date (QA) &nbsp;&nbsp;&nbsp;&nbsp;:</span>
    <span style="margin-left:6px;">${field(received_qa, 130)}</span>
  </div>

  <!-- 11. Status -->
  <div class="att3-status-row">
    Status : The above batch of Bulk sample is released for filling / compression.
  </div>

  <!-- 12. Sign 2 -->
  <div class="att3-sign-row-2">
    <span class="att3-label">Sign By./ Date (QA) :</span>
    <span style="flex:1; margin-right:24px;">${field(sign_qa, 140)}</span>
    <span class="att3-label">Received By / Date ( Production)</span>
    <span style="margin-left:6px;">${field(received_production, 120)}</span>
  </div>

</div>
</body>
</html>`
}

export function printBulkReleaseNote(data = {}, logoSrc) {
  const html = buildBulkReleaseNoteHtml(data, { logoSrc })
  const frame = document.createElement('iframe')
  frame.setAttribute('title', 'Bulk Release Slip print')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;'
  document.body.appendChild(frame)
  const doc = frame.contentDocument
  doc.open(); doc.write(html); doc.close()
  const cleanup = () => setTimeout(() => { if (frame.parentNode) frame.parentNode.removeChild(frame) }, 1500)
  const run = () => { frame.contentWindow.focus(); frame.contentWindow.print(); cleanup() }
  if (doc.readyState === 'complete') setTimeout(run, 100)
  else frame.onload = () => setTimeout(run, 100)
}

export async function downloadBulkReleaseNotePdf(data = {}) {
  let logoSrc = cmhpLogoUrl
  try {
    const res = await fetch(cmhpLogoUrl)
    const blob = await res.blob()
    logoSrc = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch { /* use url fallback */ }

  const html = buildBulkReleaseNoteHtml(data, { logoSrc })
  const filename = `Attachment3_BulkRelease_${(data.batch_no || 'slip').replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`

  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:0;top:0;width:210mm;opacity:0.01;pointer-events:none;z-index:2147483646;background:#fff;'
  const frame = document.createElement('iframe')
  frame.style.cssText = 'width:210mm;height:297mm;border:0;background:#fff;'
  host.appendChild(frame)
  document.body.appendChild(host)
  const doc = frame.contentDocument
  doc.open(); doc.write(html); doc.close()
  try {
    await new Promise((resolve) => {
      if (doc.readyState === 'complete') setTimeout(resolve, 150)
      else frame.onload = () => setTimeout(resolve, 150)
    })
    await new Promise((r) => setTimeout(r, 150))
    const sheet = doc.querySelector('.att3-doc')
    if (!sheet) throw new Error('Document failed to render.')
    const html2canvas = (await import('html2canvas')).default
    const { jsPDF } = await import('jspdf')
    const canvas = await html2canvas(sheet, {
      scale: 3, useCORS: true, allowTaint: true,
      backgroundColor: '#ffffff', logging: false,
    })
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
    const pageW = pdf.internal.pageSize.getWidth()
    const pageH = pdf.internal.pageSize.getHeight()
    const margin = 10
    const maxW = pageW - margin * 2
    const maxH = pageH - margin * 2
    const ratio = Math.min(maxW / canvas.width, maxH / canvas.height)
    const imgW = canvas.width * ratio
    const imgH = canvas.height * ratio
    const x = (pageW - imgW) / 2
    const y = (pageH - imgH) / 2
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', x, y, imgW, imgH, undefined, 'FAST')
    pdf.save(filename)
    return filename
  } finally {
    if (host.parentNode) host.parentNode.removeChild(host)
  }
}
