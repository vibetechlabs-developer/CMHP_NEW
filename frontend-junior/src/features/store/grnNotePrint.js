import cmhpLogoUrl from '../../assets/cmhp_invoice_logo.png'
import { formatDateIN } from '../../utils/formatters'

export const GRN_KIND_RAW = 'RAW_MATERIAL'
export const GRN_KIND_PACKING = 'PACKAGING_MATERIAL'

const NA = 'NA'
const FORM_NO = 'SOP/WH/01/F-01'
const DEFAULT_COMPANY = 'CMHP PRIVATE LIMITED'

let cachedLogoDataUrl = null

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatQty(value) {
  if (value === null || value === undefined || value === '') return NA
  const n = Number(value)
  if (Number.isNaN(n)) return String(value)
  return n % 1 === 0 ? String(n) : parseFloat(n.toFixed(3)).toString()
}

export function lineMaterialKind(line) {
  const kind = String(line?.material_kind || '').toUpperCase()
  if (kind === GRN_KIND_PACKING || kind === GRN_KIND_RAW || kind === 'MOTHER_TINCTURE') {
    return kind === GRN_KIND_PACKING ? GRN_KIND_PACKING : GRN_KIND_RAW
  }
  const hay = `${line?.material_name || ''} ${line?.material_name_snapshot || ''} ${line?.material_code || ''}`.toUpperCase()
  if (/\b(BOTTLE|CAP|LABEL|CARTON|BOX|PLUG|DROPPER|INNER|OUTER|PACK)\b/.test(hay)) {
    return GRN_KIND_PACKING
  }
  return GRN_KIND_RAW
}

export function filterReceiptLinesByKind(receipt, kind) {
  const lines = Array.isArray(receipt?.lines) ? receipt.lines : []
  return lines.filter((line) => lineMaterialKind(line) === kind)
}

export function receiptGrnKinds(receipt) {
  const lines = Array.isArray(receipt?.lines) ? receipt.lines : []
  const kinds = new Set(lines.map(lineMaterialKind))
  return {
    hasRaw: kinds.has(GRN_KIND_RAW) || lines.length === 0,
    hasPacking: kinds.has(GRN_KIND_PACKING),
  }
}

function kindBanner(kind) {
  // Word master form uses the combined label; keep kind-specific only as a suffix cue.
  if (kind === GRN_KIND_PACKING) return 'PACKING MATERIAL'
  if (kind === GRN_KIND_RAW) return 'RAW MATERIAL'
  return 'RAW MATERIAL / PACKING MATERIAL'
}

export function companyTitle(receipt) {
  const legal = String(receipt?.company_legal_name || '').trim()
  const display = String(receipt?.company_display_name || '').trim()
  const code = String(receipt?.company_code || '').trim()
  const raw = legal || display || code || DEFAULT_COMPANY
  const upper = raw.toUpperCase()
  if (!upper || upper === 'CMHP' || upper === 'CENTRAL' || upper.includes('CENTRAL MANUFACTURING')) {
    return DEFAULT_COMPANY
  }
  return upper
}

function supplierName(receipt) {
  return receipt?.supplier_display || receipt?.supplier_name || NA
}

function containerCell(line) {
  const qty = Number(line?.received_quantity)
  const unit = String(line?.unit_code_snapshot || line?.unit_code || '').replace(/\s+/g, '')
  const containers = Number(line?.container_quantity)
  if (!Number.isFinite(qty) || qty <= 0) return NA
  if (Number.isFinite(containers) && containers > 0) {
    const per = qty / containers
    return `${containers}*${formatQty(per)}${unit}`
  }
  return `1*${formatQty(qty)}${unit}`
}

function quantityCell(line) {
  const unit = String(line?.unit_code_snapshot || line?.unit_code || '').replace(/\s+/g, '')
  return `${formatQty(line?.received_quantity)}${unit}`
}

function buildRowsHtml(lines, supplier) {
  const minRows = Math.max(10, lines.length)
  const rows = []
  for (let i = 0; i < minRows; i += 1) {
    const line = lines[i]
    if (!line) {
      rows.push(`
        <tr>
          <td class="c">${i + 1}</td>
          <td></td><td class="c"></td><td class="c"></td><td class="c"></td><td class="c"></td><td class="c"></td><td class="c"></td><td class="c"></td><td></td>
        </tr>`)
      continue
    }
    const name = line.material_name_snapshot || line.material_name || ''
    const code = line.material_code_snapshot || line.material_code || ''
    rows.push(`
      <tr>
        <td class="c">${i + 1}</td>
        <td class="mat-name">${escapeHtml(name)}</td>
        <td class="c">${escapeHtml(code)}</td>
        <td class="c">${escapeHtml(supplier)}</td>
        <td class="c">${NA}</td>
        <td class="c">${NA}</td>
        <td class="qty">${escapeHtml(quantityCell(line))}</td>
        <td class="c">${escapeHtml(containerCell(line))}</td>
        <td class="c">${escapeHtml(line.lot_reference || NA)}</td>
        <td></td>
      </tr>`)
  }
  return rows.join('')
}

async function resolveLogoDataUrl() {
  if (cachedLogoDataUrl) return cachedLogoDataUrl
  try {
    const res = await fetch(cmhpLogoUrl)
    const blob = await res.blob()
    cachedLogoDataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
    return cachedLogoDataUrl
  } catch {
    return cmhpLogoUrl
  }
}

/**
 * Exact Word GRN layout:
 * - Black borders only (no blue fills)
 * - Nested header: logo | company+store | WAREHOUSE COPY box
 * - Banner: GOODS RECEIPT NOTE (GRN) | RAW / PACKING
 * - Meta: Invoice/Date/GRN/Date/Form
 * - 10-col material grid + NA note + signatures
 */
function printStyles() {
  return `
    @page { size: A4 landscape; margin: 6mm; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #000000;
      font-family: Arial, Helvetica, sans-serif;
    }
    .grn-sheet {
      width: 282mm;
      margin: 0 auto;
      background: #ffffff;
      color: #000000;
      border: 2px solid #000000;
    }
    .grn-sheet table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    .grn-sheet td, .grn-sheet th {
      border: 1px solid #000000;
      vertical-align: middle;
      color: #000000;
      background: #ffffff;
    }

    /* ── Row 1: Header ── */
    .grn-top .logo-cell {
      width: 24mm;
      text-align: center;
      padding: 4px 3px;
      border-right: 1.5px solid #000;
    }
    .grn-top .logo {
      display: block;
      margin: 0 auto;
      height: 46px;
      width: auto;
      max-width: 68px;
    }
    .grn-top .title-cell {
      text-align: center;
      padding: 5px 8px;
    }
    .grn-top .co-name {
      font-size: 18px;
      font-weight: 700;
      letter-spacing: 0.5px;
      line-height: 1.2;
      text-transform: uppercase;
    }
    .grn-top .store-name {
      font-size: 10.5px;
      font-weight: 600;
      margin-top: 3px;
      letter-spacing: 0.3px;
      color: #000;
    }
    .grn-top .copy-cell {
      width: 26mm;
      text-align: center;
      padding: 4px;
      border-left: 1.5px solid #000;
    }
    .grn-top .copy-box {
      display: inline-block;
      border: 1.5px solid #000000;
      padding: 6px 8px;
      font-size: 10px;
      font-weight: 700;
      line-height: 1.4;
      letter-spacing: 0.5px;
    }

    /* ── Row 2: Banner ── */
    .grn-banner td {
      text-align: center;
      font-size: 12px;
      font-weight: 700;
      padding: 4px 8px;
      letter-spacing: 0.3px;
      background: #f0f0f0 !important;
    }
    .grn-banner .left { width: 50%; }
    .grn-banner .right { width: 50%; }

    /* ── Row 3: Meta ── */
    .grn-meta td {
      font-size: 10px;
      padding: 3px 5px;
      height: 22px;
    }
    .grn-meta .lbl {
      font-weight: 700;
      white-space: nowrap;
      width: 20mm;
      background: #f8f8f8 !important;
    }
    .grn-meta .val {
      text-align: center;
      font-weight: 600;
      font-size: 10.5px;
    }

    /* ── Material grid ── */
    .grn-lines th {
      font-size: 9.5px;
      font-weight: 700;
      text-align: center;
      padding: 4px 2px;
      line-height: 1.25;
      background: #ececec !important;
    }
    .grn-lines td {
      font-size: 10px;
      height: 18px;
      padding: 1px 3px;
    }
    .grn-lines .c { text-align: center; }
    .grn-lines .qty { font-weight: 700; text-align: center; }
    .grn-lines .mat-name { text-align: left; padding-left: 4px; }

    /* ── NA Note ── */
    .grn-note td {
      border: none !important;
      text-align: left;
      padding: 5px 8px 2px;
      font-size: 9.5px;
      font-weight: 700;
      font-style: italic;
    }

    /* ── Signature row ── */
    .grn-sign td {
      border-top: 1px solid #000 !important;
      border-left: none !important;
      border-right: none !important;
      border-bottom: none !important;
      padding: 18px 12px 8px;
      font-size: 11px;
      font-weight: 700;
    }
  `
}

export function buildGoodsReceiptNoteHtml(receipt, kind, { logoSrc } = {}) {
  const lines = filterReceiptLinesByKind(receipt, kind)
  const supplier = supplierName(receipt)
  const invoiceNo = receipt?.supplier_invoice_reference || NA
  const invoiceDate = receipt?.arrived_at ? formatDateIN(receipt.arrived_at) : NA
  const grnNo = receipt?.reference || NA
  const grnDate = receipt?.posted_at || receipt?.created_at || receipt?.arrived_at
  const banner = kindBanner(kind)
  const logo = logoSrc || cmhpLogoUrl

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>GRN ${escapeHtml(grnNo)} — ${escapeHtml(banner)}</title>
  <style>${printStyles()}</style>
</head>
<body>
  <div class="grn-sheet">

    <!-- ── Header Row ── -->
    <table class="grn-top">
      <tr>
        <td class="logo-cell">
          <img class="logo" src="${escapeHtml(logo)}" alt="CMHP" />
        </td>
        <td class="title-cell">
          <div class="co-name">${escapeHtml(companyTitle(receipt))}</div>
          <div class="store-name">RAW MATERIAL / PACKING MATERIAL STORE</div>
        </td>
        <td class="copy-cell">
          <div class="copy-box">WAREHOUSE<br/>COPY</div>
        </td>
      </tr>
    </table>

    <!-- ── Banner Row ── -->
    <table class="grn-banner">
      <tr>
        <td class="left">GOODS RECEIPT NOTE (GRN)</td>
        <td class="right">${escapeHtml(banner)}</td>
      </tr>
    </table>

    <!-- ── Meta Row: Invoice / GRN / Form ── -->
    <table class="grn-meta">
      <colgroup>
        <col style="width:14%"/>
        <col style="width:14%"/>
        <col style="width:7%"/>
        <col style="width:12%"/>
        <col style="width:9%"/>
        <col style="width:16%"/>
        <col style="width:7%"/>
        <col style="width:12%"/>
        <col style="width:9%"/>
      </colgroup>
      <tr>
        <td class="lbl">INVOICE NO.</td>
        <td class="val">${escapeHtml(invoiceNo)}</td>
        <td class="lbl">DATE</td>
        <td class="val">${escapeHtml(invoiceDate)}</td>
        <td class="lbl">GRN NO.</td>
        <td class="val">${escapeHtml(grnNo)}</td>
        <td class="lbl">DATE</td>
        <td class="val">${escapeHtml(grnDate ? formatDateIN(grnDate) : NA)}</td>
        <td class="val" style="font-weight:700; font-size:9px; text-align:center;">${escapeHtml(FORM_NO)}</td>
      </tr>
    </table>

    <!-- ── Material Lines Table ── -->
    <table class="grn-lines">
      <thead>
        <tr>
          <th style="width:4%">Sr.<br/>No.</th>
          <th style="width:18%">Material</th>
          <th style="width:7%">Code</th>
          <th style="width:14%">Mfg / Supply By</th>
          <th style="width:9%">Mfg.<br/>Date</th>
          <th style="width:10%">Expiry /<br/>Retest Date</th>
          <th style="width:9%">Quantity<br/>Received</th>
          <th style="width:11%">No. Of<br/>Containers</th>
          <th style="width:9%">AR No.</th>
          <th style="width:9%">Remarks</th>
        </tr>
      </thead>
      <tbody>
        ${buildRowsHtml(lines, supplier)}
      </tbody>
    </table>

    <!-- ── NA Note ── -->
    <table class="grn-note">
      <tr><td># NA :- NOT APPLICABLE</td></tr>
    </table>

    <!-- ── Signature Row ── -->
    <table class="grn-sign">
      <tr>
        <td style="width:50%; text-align:left;">Prepared By/ Date: &nbsp;&nbsp;( RM / PM Store )</td>
        <td style="width:50%; text-align:right;">Approved / Rejected by/ Date: &nbsp;&nbsp;( QC )</td>
      </tr>
    </table>

  </div>
</body>
</html>`
}

export function grnDownloadFilename(receipt, kind) {
  const ref = String(receipt?.reference || 'GRN').replace(/[^a-zA-Z0-9_-]+/g, '_')
  const tag = kind === GRN_KIND_PACKING ? 'PM' : 'RM'
  return `GRN_${tag}_${ref}.pdf`
}

function waitForImages(root) {
  const images = Array.from(root.querySelectorAll?.('img') || [])
  return Promise.all(
    images.map(
      (img) =>
        new Promise((resolve) => {
          if (img.complete && img.naturalWidth > 0) {
            resolve()
            return
          }
          img.onload = () => resolve()
          img.onerror = () => resolve()
          setTimeout(resolve, 1500)
        }),
    ),
  )
}

function openPrintFrame(html) {
  const frame = document.createElement('iframe')
  frame.setAttribute('title', 'GRN print')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;'
  document.body.appendChild(frame)
  const doc = frame.contentDocument
  doc.open()
  doc.write(html)
  doc.close()
  return frame
}

export async function printGoodsReceiptNote(receipt, kind) {
  const logoSrc = await resolveLogoDataUrl()
  const html = buildGoodsReceiptNoteHtml(receipt, kind, { logoSrc })
  const frame = openPrintFrame(html)
  const doc = frame.contentDocument

  const cleanup = () => {
    setTimeout(() => {
      if (frame.parentNode) frame.parentNode.removeChild(frame)
    }, 1000)
  }

  const run = async () => {
    try {
      await waitForImages(doc)
      frame.contentWindow.focus()
      frame.contentWindow.print()
    } finally {
      cleanup()
    }
  }

  if (doc.readyState === 'complete') setTimeout(run, 80)
  else frame.onload = () => setTimeout(run, 80)
}

/**
 * High-quality PDF: render exact Word layout in a same-origin iframe,
 * capture as PNG @3x, place on a single landscape A4 page.
 * Black/white form (no blue fills) — matches the warehouse Word master.
 */
export async function downloadGoodsReceiptNotePdf(receipt, kind) {
  const logoSrc = await resolveLogoDataUrl()
  const html = buildGoodsReceiptNoteHtml(receipt, kind, { logoSrc })
  const filename = grnDownloadFilename(receipt, kind)

  const host = document.createElement('div')
  host.setAttribute('data-grn-capture-host', '1')
  host.style.cssText = 'position:fixed;left:0;top:0;width:277mm;opacity:0.01;pointer-events:none;z-index:2147483646;background:#fff;'
  const frame = document.createElement('iframe')
  frame.setAttribute('title', 'GRN capture')
  frame.style.cssText = 'width:277mm;height:210mm;border:0;background:#fff;'
  host.appendChild(frame)
  document.body.appendChild(host)

  const doc = frame.contentDocument
  doc.open()
  doc.write(html)
  doc.close()

  try {
    await new Promise((resolve) => {
      if (doc.readyState === 'complete') setTimeout(resolve, 100)
      else frame.onload = () => setTimeout(resolve, 100)
    })
    await waitForImages(doc)
    await new Promise((r) => setTimeout(r, 100))

    const sheet = doc.querySelector('.grn-sheet')
    if (!sheet) throw new Error('GRN sheet failed to render.')

    // Prefer capturing from the iframe window's html2canvas context for correct fonts/layout.
    const html2canvas = (await import('html2canvas')).default
    const { jsPDF } = await import('jspdf')

    const canvas = await html2canvas(sheet, {
      scale: 3,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      imageTimeout: 3000,
      foreignObjectRendering: false,
      removeContainer: true,
      onclone: (clonedDoc) => {
        // Force pure black/white in the clone so capture never picks washed colors.
        const style = clonedDoc.createElement('style')
        style.textContent = `
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .grn-sheet, .grn-sheet td, .grn-sheet th { background: #ffffff !important; color: #000000 !important; }
        `
        clonedDoc.head.appendChild(style)
      },
    })

    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
      compress: true,
    })
    const pageW = pdf.internal.pageSize.getWidth()
    const pageH = pdf.internal.pageSize.getHeight()
    const margin = 6
    const maxW = pageW - margin * 2
    const maxH = pageH - margin * 2
    const ratio = Math.min(maxW / canvas.width, maxH / canvas.height)
    const imgW = canvas.width * ratio
    const imgH = canvas.height * ratio
    const x = (pageW - imgW) / 2
    const y = Math.max(margin, (pageH - imgH) / 2)

    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', x, y, imgW, imgH, undefined, 'FAST')
    pdf.save(filename)
    return filename
  } finally {
    if (host.parentNode) host.parentNode.removeChild(host)
  }
}
