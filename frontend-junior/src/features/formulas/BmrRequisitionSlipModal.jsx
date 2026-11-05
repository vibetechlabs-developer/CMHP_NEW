import { useRef, useState } from 'react'
import Button from '../../components/Button'
import { exportFormulaExcel } from '../../utils/formulaExport'
import './BmrRequisitionSlipModal.css'

const DEFAULT_PACKING_ITEMS = [
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
  'Droper',
]

// Helper to format pharmaceutical quantities cleanly without trailing zeroes
function formatQty(q) {
  if (q === null || q === undefined || q === '') return ''
  const n = Number(q)
  if (isNaN(n)) return q
  return n % 1 === 0 ? n.toString() : parseFloat(n.toFixed(3)).toString()
}

export default function BmrRequisitionSlipModal({
  isOpen,
  onClose,
  product = {},
  formula = {},
  revision = {},
  activeLines = null,
  company = {},
  initialTab = 'RM',
  batchAllocation = null,
}) {
  const [activeTab, setActiveTab] = useState(initialTab || 'RM')
  const [batchNo, setBatchNo] = useState(() => (product?.bmr_no ? `${product.code}-01` : 'AH2602'))
  const [effectiveDate, setEffectiveDate] = useState(() => '12-04-2024')
  const [supersedesNo] = useState('00')
  const [mfgFor, setMfgFor] = useState(() => 'APEX ANIMAL HEALTH PRODUCTS')
  const [downloading, setDownloading] = useState(false)

  // Authentic pharmaceutical title matching BMR master format
  const rawCompanyName = company?.display_name || company?.name || ''
  const companyTitle =
    !rawCompanyName || rawCompanyName.toUpperCase() === 'CMHP' || rawCompanyName.toUpperCase().includes('CENTRAL')
      ? 'CENTRAL MANUFACTURING HOMEOPATHIC PHARMACY'
      : rawCompanyName.toUpperCase()

  const slipRef = useRef(null)

  if (!isOpen) return null

  const lines = (activeLines && activeLines.length > 0) ? activeLines : (revision?.lines || [])
  const getLinePart = (l) => {
    if (!l) return 1
    if (l.part) return Number(l.part)
    if (l.notes) {
      const match = l.notes.match(/PART:(\d+)/)
      if (match) return Number(match[1])
    }
    return 1
  }

  const isTwoPart = Boolean(
    (revision?.notes && (revision.notes.includes('FORMULA_PARTS:2') || revision.notes.includes('TWO_PART:true'))) ||
    lines.some((l) => getLinePart(l) === 2)
  )
  const part2UsesPart1 = isTwoPart && Boolean(
    revision?.notes && revision.notes.includes('PART2_USES_PART1:true')
  )

  const rawMaterials = lines.filter((l) => l.material_type === 'RAW_MATERIAL')
  const rawPart1 = rawMaterials.filter((l) => getLinePart(l) === 1)
  const rawPart2 = rawMaterials.filter((l) => getLinePart(l) === 2)
  const excipients = lines.filter(
    (l) =>
      l.material_type === 'EXCIPIENT' ||
      (l.notes && l.notes.toLowerCase().includes('excipient')) ||
      (l.special_value && l.special_value.toUpperCase().includes('Q.S.'))
  )
  const packagingMaterials = lines.filter(
    (l) => l.material_type === 'PACKAGING_MATERIAL' || l.material_type === 'PACKAGING'
  )

  // Standard template has 9 rows on Page 1 for RM
  const displayRaw = [...rawMaterials]
  while (displayRaw.length < 9) {
    displayRaw.push(null)
  }

  const renderRmRow = (line, idx, offset = 0) => {
    if (!line) {
      return (
        <tr key={`empty-raw-${offset}-${idx}`} className="bmr-exact-row-empty">
          <td>{offset + idx + 1}</td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
        </tr>
      )
    }

    const matCode = line.material?.code || line.material_code || ''
    const baseName = line.material?.name || line.material_name || ''
    const fullMatName = line.potency && !baseName.includes(line.potency)
      ? `${baseName} ${line.potency}`
      : baseName

    const isFormula = line.calculation_mode === 'AS_PER_FORMULA'
    let labelClaim = isFormula
      ? '—'
      : (line.label_claim ||
        (line.calculation_mode === 'AS_PER_LABEL_CLAIM'
          ? `${line.label_claim_quantity || ''} ${line.label_claim_uom?.code || ''}`
          : line.special_value || '—'))

    if (labelClaim === '0.00' || labelClaim === '0' || labelClaim === '0 ML' || !labelClaim) {
      labelClaim = '—'
    }

    return (
      <tr key={line.id ?? `rm-${offset}-${idx}`}>
        <td>{offset + idx + 1}</td>
        <td>{matCode}</td>
        <td style={{ textAlign: 'left', paddingLeft: '8px', fontWeight: 'normal', textTransform: 'uppercase' }}>
          {fullMatName}
        </td>
        <td>{labelClaim}</td>
        <td>{formatQty(line.quantity)}</td>
        <td>{line.unit || line.unit_code || '—'}</td>
        <td>{line.ar_no || ''}</td>
      </tr>
    )
  }

  // Page 1 excipients (rows 1 & 2)
  const displayExcP1 = excipients.slice(0, 2)
  while (displayExcP1.length < 2) {
    displayExcP1.push(null)
  }

  // Page 2 excipients (rows 3 & 4)
  const displayExcP2 = excipients.slice(2, 4)
  while (displayExcP2.length < 2) {
    displayExcP2.push(null)
  }

  // Packaging materials for Attachment 4 (11 standard rows matching ATTACHMENT 4.docx)
  const displayPkg = [...packagingMaterials]
  if (displayPkg.length === 0) {
    DEFAULT_PACKING_ITEMS.forEach((name, idx) => {
      displayPkg.push({
        id: `def-pm-${idx}`,
        material_name: name,
        material_code: '',
        quantity: '',
        quantity_received: '',
        ar_no: '',
      })
    })
  } else {
    while (displayPkg.length < 11) {
      displayPkg.push(null)
    }
  }

  const handlePrint = () => {
    window.print()
  }

  const handleDownloadPdf = async () => {
    if (downloading) return
    const container = slipRef.current
    if (!container) return

    const page1El = container.querySelector('.bmr-exact-page-1')
    const page2El = container.querySelector('.bmr-exact-page-2')
    if (!page1El) return

    setDownloading(true)

    try {
      const html2canvas = (await import('html2canvas')).default
      const { jsPDF } = await import('jspdf')

      const sanitizedProdName = (product?.name || 'FIBROGONE').replace(/[^a-zA-Z0-9]/g, '_')
      const revNo = String(revision?.revision_number || '01').padStart(2, '0')
      const filename = activeTab === 'RM'
        ? `BMR_RM_Attachment_1_${sanitizedProdName}_Rev${revNo}.pdf`
        : `BMR_PM_Attachment_4_${sanitizedProdName}_Rev${revNo}.pdf`

      // Mark container in export mode so print-only values show and inputs hide
      container.classList.add('bmr-pdf-export-mode')

      const captureOptions = {
        scale: 2.5,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
      }

      // 1. Capture Page 1 at high resolution
      const canvas1 = await html2canvas(page1El, captureOptions)
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true,
      })

      // Lossless PNG format for crisp, vector-grade sharp text and borders
      const imgData1 = canvas1.toDataURL('image/png')
      const imgWidth = 210
      const imgHeight1 = Math.min((canvas1.height * imgWidth) / canvas1.width, 297)
      pdf.addImage(imgData1, 'PNG', 0, 0, imgWidth, imgHeight1, undefined, 'FAST')

      // 2. Capture Page 2 if exists
      if (page2El) {
        const canvas2 = await html2canvas(page2El, captureOptions)
        const imgData2 = canvas2.toDataURL('image/png')
        const imgHeight2 = Math.min((canvas2.height * imgWidth) / canvas2.width, 297)
        pdf.addPage('a4', 'portrait')
        pdf.addImage(imgData2, 'PNG', 0, 0, imgWidth, imgHeight2, undefined, 'FAST')
      }

      pdf.save(filename)
    } catch (err) {
      console.error('Failed to generate PDF:', err)
      window.print()
    } finally {
      container.classList.remove('bmr-pdf-export-mode')
      setDownloading(false)
    }
  }

  const handleExcel = () => {
    if (activeTab === 'RM') {
      exportFormulaExcel({
        product,
        formula,
        revision: { name: `Rev. ${revision.revision_number || '01'}` },
        materials: lines.filter((l) => l.material_type === 'RAW_MATERIAL').map((l) => ({
          rmCode: l.material?.code || l.material_code || '',
          name: l.material?.name || l.material_name || '',
          labelClaim:
            l.calculation_mode === 'AS_PER_FORMULA'
              ? '—'
              : (l.label_claim ||
                (l.calculation_mode === 'AS_PER_LABEL_CLAIM'
                  ? `${l.label_claim_quantity || ''} ${l.label_claim_uom?.code || ''}`
                  : l.special_value || '—')),
          base_quantity: l.quantity,
          unit: l.unit || l.unit_code || 'ML',
          arNo: l.ar_no || '—',
        })),
        batchQty: revision.base_output_quantity || 100,
        batchUnit: revision.output_uom_code || 'ML',
        approval: {
          status: revision.status,
          submittedBy: 'Production Chemist',
          decidedBy: revision.status === 'APPROVED' ? 'QA / QC Manager' : 'Pending Review',
        },
        companyName: companyTitle,
      })
    } else {
      exportFormulaExcel({
        product,
        formula,
        revision: { name: `Rev. ${revision.revision_number || '01'}` },
        materials: displayPkg.filter(Boolean).map((l) => ({
          rmCode: l.material?.code || l.material_code || '',
          name: l.material?.name || l.material_name || '',
          labelClaim: '—',
          base_quantity: l.quantity || '',
          unit: 'NOS',
          arNo: l.ar_no || '—',
        })),
        batchQty: revision.base_output_quantity || 100,
        batchUnit: 'NOS',
        approval: {
          status: revision.status,
          submittedBy: 'Warehouse Chemist',
          decidedBy: revision.status === 'APPROVED' ? 'QA / QC Manager' : 'Pending Review',
        },
        companyName: companyTitle,
      })
    }
  }

  // Common Header Component matching exact PDF
  const renderHeader = () => (
    <div className="bmr-exact-header-box">
      <div className="bmr-exact-top-banner">
        <div className="bmr-exact-logo-wrap">
          <img src="/cmhp_logo.png" alt="CMHP Logo" className="bmr-exact-logo-img" crossOrigin="anonymous" />
        </div>
        <div className="bmr-exact-company-title">
          {companyTitle}
        </div>
      </div>

      <div className="bmr-exact-dept-bar">
        PRODUCTION ( ORAL LIQUID DEPARTMENT)
      </div>

      <div className="bmr-exact-bmr-bar">
        BATCH MANUFACTURING RECORD (BMR)
      </div>

      <table className="bmr-exact-meta-grid">
        <tbody>
          <tr>
            <td style={{ width: '50%' }}>
              <span className="bmr-field-lbl">PRODUCT : </span>
              <span className="bmr-field-val">{product?.name || 'FIBROGONE'}</span>
            </td>
            <td style={{ width: '50%' }}>
              <span className="bmr-field-lbl">BMR NO. : </span>
              <span className="bmr-field-val">{product?.bmr_no || 'BMR/AA/25/06'}</span>
            </td>
          </tr>
          <tr>
            <td>
              <span className="bmr-field-lbl">PRODUCT CODE : </span>
              <span className="bmr-field-val">{product?.code || 'AHP/06'}</span>
            </td>
            <td>
              <span className="bmr-field-lbl">EFFECTIVE DATE : </span>
              <input
                className="bmr-exact-input no-print"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                style={{ width: '85px' }}
              />
              <span className="print-only">{effectiveDate}</span>
            </td>
          </tr>
          <tr>
            <td>
              <span className="bmr-field-lbl">COMPANY CODE : </span>
              <span className="bmr-field-val">{company?.code || 'AAHP'}</span>
            </td>
            <td>
              <span className="bmr-field-lbl">SUPERSEDES NO : </span>
              <span className="bmr-field-val">{supersedesNo}</span>
            </td>
          </tr>
          <tr>
            <td>
              <span className="bmr-field-lbl">BATCH NO. : </span>
              <input
                className="bmr-exact-input no-print"
                value={batchNo}
                onChange={(e) => setBatchNo(e.target.value)}
                style={{ width: '100px' }}
              />
              <span className="print-only">{batchNo}</span>
            </td>
            <td>
              <span className="bmr-field-lbl">VERSION NO : </span>
              <span className="bmr-field-val">{String(revision?.revision_number || 1).padStart(2, '0')}</span>
            </td>
          </tr>
          <tr>
            <td>
              <span className="bmr-field-lbl">MFG. FOR : </span>
              <input
                className="bmr-exact-input no-print"
                value={mfgFor}
                onChange={(e) => setMfgFor(e.target.value)}
                style={{ width: '180px' }}
              />
              <span className="print-only">{mfgFor}</span>
            </td>
            <td>
              <span className="bmr-field-lbl">MASTER FORMULA NO. : </span>
              <span className="bmr-field-val">{formula?.code || ''}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )

  // Common Signature Table matching exact 4-column PDF structure
  const renderSignatures = () => (
    <table className="bmr-exact-sign-table">
      <thead>
        <tr>
          <th className="bmr-exact-sign-corner-th" style={{ width: '16%' }}></th>
          <th style={{ width: '28%' }}>
            Prepared By<br />
            <span style={{ fontWeight: 'normal', fontSize: '10.5px' }}>Production Chemist</span>
          </th>
          <th style={{ width: '28%' }}>
            Reviewed By<br />
            <span style={{ fontWeight: 'normal', fontSize: '10.5px' }}>Production In-Charge</span>
          </th>
          <th style={{ width: '28%' }}>
            Approved By<br />
            <span style={{ fontWeight: 'normal', fontSize: '10.5px' }}>QA Manager</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td className="bmr-exact-sign-side-lbl">Name</td>
          <td></td>
          <td></td>
          <td></td>
        </tr>
        <tr>
          <td className="bmr-exact-sign-side-lbl">Signature</td>
          <td></td>
          <td></td>
          <td></td>
        </tr>
        <tr>
          <td className="bmr-exact-sign-side-lbl">Date</td>
          <td></td>
          <td></td>
          <td></td>
        </tr>
      </tbody>
    </table>
  )

  // Batch Output Reconciliation & Sample Allocation Table (GMP / BMR Compliant)
  const renderBatchAllocation = () => {
    if (!batchAllocation) return null
    const {
      totalBottles = 0,
      qcSamples = 0,
      retentionSamples = 0,
      totalSamples = 0,
      netCommercialBottles = 0,
      linkedSalesOrder = '',
      orderAllocatedQty = 0,
      bufferStockQty = 0,
      batchVolumeLtr = 0,
      packSizeMl = 0,
    } = batchAllocation

    return (
      <div className="bmr-exact-allocation-section" style={{ marginTop: 6, marginBottom: 6 }}>
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 'bold',
            textAlign: 'left',
            padding: '2px 6px',
            background: '#f1f5f9',
            border: '1px solid #000',
            borderBottom: 'none',
            letterSpacing: '0.5px',
          }}
        >
          BATCH YIELD RECONCILIATION, QUALITY SAMPLES &amp; ORDER ALLOCATION:
        </div>
        <table className="bmr-exact-table" style={{ margin: 0 }}>
          <tbody>
            <tr>
              <td style={{ width: '25%', fontWeight: 'bold', textAlign: 'left', background: '#f8fafc' }}>
                Gross Batch Yield
              </td>
              <td style={{ width: '25%', textAlign: 'right', fontWeight: 'bold' }}>
                {Number(totalBottles).toLocaleString()} Bottles ({batchVolumeLtr} Ltr @ {packSizeMl}ml)
              </td>
              <td style={{ width: '25%', fontWeight: 'bold', textAlign: 'left', background: '#f8fafc' }}>
                QC Lab Samples (Consumed)
              </td>
              <td style={{ width: '25%', textAlign: 'right', color: '#b91c1c', fontWeight: 'bold' }}>
                - {Number(qcSamples).toLocaleString()} Bottles
              </td>
            </tr>
            <tr>
              <td style={{ fontWeight: 'bold', textAlign: 'left', background: '#f8fafc' }}>
                Control / Retention Samples
              </td>
              <td style={{ textAlign: 'right', color: '#b45309', fontWeight: 'bold' }}>
                - {Number(retentionSamples).toLocaleString()} Bottles (Room Store)
              </td>
              <td style={{ fontWeight: 'bold', textAlign: 'left', background: '#f8fafc' }}>
                Total Samples Withdrawn
              </td>
              <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#6d28d9' }}>
                {Number(totalSamples).toLocaleString()} Bottles
              </td>
            </tr>
            <tr style={{ background: '#f0fdf4' }}>
              <td style={{ fontWeight: 'bold', textAlign: 'left', fontSize: 10.5 }}>
                Net Commercial Output
              </td>
              <td style={{ textAlign: 'right', fontWeight: 'bold', fontSize: 11, color: '#15803d' }}>
                {Number(netCommercialBottles).toLocaleString()} Bottles
              </td>
              <td style={{ fontWeight: 'bold', textAlign: 'left' }}>
                Linked Sales Order
              </td>
              <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                {orderAllocatedQty > 0 ? (
                  <span>
                    {Number(orderAllocatedQty).toLocaleString()} BTL {linkedSalesOrder ? `(${linkedSalesOrder})` : ''}
                  </span>
                ) : (
                  <span style={{ color: '#64748b', fontStyle: 'italic' }}>Unallocated / To Store</span>
                )}
              </td>
            </tr>
            {bufferStockQty > 0 && (
              <tr style={{ background: '#f8fafc' }}>
                <td style={{ fontWeight: 'bold', textAlign: 'left' }}>
                  Warehouse Buffer Stock
                </td>
                <td
                  colSpan={3}
                  style={{ textAlign: 'left', paddingLeft: 8, color: '#166534', fontWeight: 'bold' }}
                >
                  + {Number(bufferStockQty).toLocaleString()} Bottles retained in FG Warehouse for subsequent customer orders
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="bmr-modal-overlay">
      <div className="bmr-modal-container">
        {/* TOP TOOLBAR (NO-PRINT) */}
        <div className="bmr-modal-toolbar no-print">
          <div className="bmr-toolbar-left">
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#f8fafc' }}>
              {activeTab === 'RM'
                ? '📄 Drops RM Requisition Slip (Attachment - 1 Master Format)'
                : '📦 Packing Material Requirement Slip (Attachment - 4 Master Format)'}
            </h3>
            <span style={{ fontSize: 11.5, color: '#94a3b8' }}>
              {activeTab === 'RM'
                ? 'Exact replica of Drops RM Requistion ATTACHMENT 1 MASTER FORMAT.docx.pdf'
                : 'Exact replica of ATTACHMENT 4.docx (1).pdf'}
            </span>
          </div>

          {/* TAB SWITCHER */}
          <div className="bmr-toolbar-tabs">
            <button
              type="button"
              className={`bmr-tab-btn ${activeTab === 'RM' ? 'active' : ''}`}
              onClick={() => setActiveTab('RM')}
            >
              📄 Attachment - 1 (RM Requisition)
            </button>
            <button
              type="button"
              className={`bmr-tab-btn ${activeTab === 'PM' ? 'active' : ''}`}
              onClick={() => setActiveTab('PM')}
            >
              📦 Attachment - 4 (PM Requirement)
            </button>
          </div>

          <div className="bmr-toolbar-right">
            <Button type="button" onClick={handleDownloadPdf} disabled={downloading}>
              {downloading ? '⏳ Generating PDF...' : '⬇️ Download PDF'}
            </Button>
            <Button type="button" variant="secondary" onClick={handlePrint}>
              🖨️ Print / Save as PDF
            </Button>
            <Button type="button" variant="secondary" onClick={handleExcel}>
              📥 Export Excel
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              ✕ Close
            </Button>
          </div>
        </div>

        {/* PRINTABLE SLIP CONTAINER */}
        <div className="bmr-slip-wrapper">
          <div className="bmr-exact-document-sheet" ref={slipRef}>

            {/* =========================================================
                ATTACHMENT - 1: RAW MATERIAL REQUISITION SLIP
                ========================================================= */}
            {activeTab === 'RM' && (
              <>
                {/* PAGE 1 (EXACT MATCH TO PDF PAGE 1) */}
                <div className="bmr-exact-page bmr-exact-page-1">
                  <div className="bmr-exact-page-top">
                    {renderHeader()}

                    {/* ATTACHMENT TITLES */}
                    <div className="bmr-exact-attachment-block">
                      <div className="bmr-exact-att-num">ATTACHMENT - 1</div>
                      <div className="bmr-exact-att-title">RAW MATERIAL REQUISITION SLIP</div>
                      <div className="bmr-exact-batch-title">BATCH FORMULA:</div>
                    </div>

                    {/* RAW MATERIAL REQUISITION TABLE (EXACT 7 COLUMNS) */}
                    <table className="bmr-exact-table">
                      <thead>
                        <tr>
                          <th style={{ width: '40px' }}>Sr.<br />No.</th>
                          <th style={{ width: '70px' }}>RM<br />Code</th>
                          <th>RAW MATERIAL NAME</th>
                          <th style={{ width: '90px' }}>Label<br />Claim</th>
                          <th style={{ width: '70px' }}>Qty. Req</th>
                          <th style={{ width: '45px' }}>Unit</th>
                          <th style={{ width: '80px' }}>AR.No.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {isTwoPart ? (
                          <>
                            <tr className="bmr-exact-part-span-row">
                              <td colSpan={7} style={{ fontWeight: 800, textAlign: 'left', background: '#eff6ff', color: '#1d4ed8', padding: '5px 8px', fontSize: '11px', borderBottom: '1px solid #bfdbfe' }}>
                                🔹 PART - I (ACTIVE INGREDIENTS / PREPARATION - 1)
                              </td>
                            </tr>
                            {rawPart1.length === 0 ? (
                              <tr className="bmr-exact-row-empty">
                                <td>1</td>
                                <td colSpan={6} style={{ color: '#94a3b8', fontStyle: 'italic', textAlign: 'left', paddingLeft: 10 }}>No ingredients in Part-1</td>
                              </tr>
                            ) : (
                              rawPart1.map((line, idx) => renderRmRow(line, idx, 0))
                            )}
                            <tr className="bmr-exact-part-span-row">
                              <td colSpan={7} style={{ fontWeight: 800, textAlign: 'left', background: '#faf5ff', color: '#7e22ce', padding: '5px 8px', fontSize: '11px', borderBottom: '1px solid #e9d5ff' }}>
                                🔹 PART - II (SECONDARY MIX / PREPARATION - 2)
                              </td>
                            </tr>
                            {part2UsesPart1 && (
                              <tr style={{ background: '#f0fdf4', borderBottom: '1px dashed #86efac' }}>
                                <td style={{ fontWeight: 700, color: '#166534', textAlign: 'center' }}>{rawPart1.length + 1}</td>
                                <td style={{ fontWeight: 700, color: '#166534', textAlign: 'center' }}>P-I</td>
                                <td style={{ fontWeight: 700, color: '#166534', fontStyle: 'italic', textAlign: 'left', paddingLeft: 8 }}>
                                  Part-I Preparation (Intermediate) — As prepared in Part-I
                                </td>
                                <td style={{ color: '#166534', textAlign: 'center' }}>—</td>
                                <td style={{ fontWeight: 700, color: '#166534', textAlign: 'center' }}>Q.S.</td>
                                <td style={{ color: '#166534', textAlign: 'center' }}>—</td>
                                <td style={{ color: '#166534', textAlign: 'center' }}>—</td>
                              </tr>
                            )}
                            {rawPart2.length === 0 ? (
                              <tr className="bmr-exact-row-empty">
                                <td>{rawPart1.length + (part2UsesPart1 ? 2 : 1)}</td>
                                <td colSpan={6} style={{ color: '#94a3b8', fontStyle: 'italic', textAlign: 'left', paddingLeft: 10 }}>No ingredients in Part-2</td>
                              </tr>
                            ) : (
                              rawPart2.map((line, idx) => renderRmRow(line, idx, 0))
                            )}
                          </>
                        ) : (
                          displayRaw.map((line, idx) => renderRmRow(line, idx, 0))
                        )}

                        {/* REPEATED HEADER FOR EXCIPIENTS (7 COLUMNS) */}
                        <tr className="bmr-exact-repeat-header">
                          <th style={{ width: '40px' }}>Sr.<br />No.</th>
                          <th style={{ width: '70px' }}>RM<br />Code</th>
                          <th>RAW MATERIAL NAME</th>
                          <th style={{ width: '90px' }}>Label<br />Claim</th>
                          <th style={{ width: '70px' }}>Qty. Req</th>
                          <th style={{ width: '45px' }}>Unit</th>
                          <th style={{ width: '80px' }}>AR.No.</th>
                        </tr>

                        {/* EXCIPIENTS ROW SPANNING ALL COLUMNS */}
                        <tr className="bmr-exact-excipients-span-row">
                          <td colSpan={7}>EXCIPIENTS</td>
                        </tr>

                        {/* EXCIPIENTS ROWS 1 & 2 */}
                        {displayExcP1.map((line, idx) => {
                          const srNo = idx + 1
                          if (!line) {
                            return (
                              <tr key={`empty-exc-p1-${idx}`} className="bmr-exact-row-empty">
                                <td>{srNo}</td>
                                <td></td>
                                <td></td>
                                <td></td>
                                <td></td>
                                <td></td>
                                <td></td>
                              </tr>
                            )
                          }

                          return (
                            <tr key={`exc-p1-${line.id ?? idx}`}>
                              <td>{srNo}</td>
                              <td>{line.material?.code || line.material_code || ''}</td>
                              <td style={{ textAlign: 'left', paddingLeft: '8px', fontWeight: 'normal', textTransform: 'uppercase' }}>
                                {line.material?.name || line.material_name || ''}
                              </td>
                              <td>{line.label_claim || line.special_value || 'Q.S.'}</td>
                              <td>{formatQty(line.quantity)}</td>
                              <td>{line.unit || line.unit_code || ''}</td>
                              <td>{line.ar_no || ''}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="bmr-exact-page-bottom">
                    {/* SIGNATURE BLOCK PAGE 1 */}
                    {renderSignatures()}

                    {/* PAGE 1 FOOTER */}
                    <div className="bmr-exact-footer-row">
                      <span className="bmr-exact-form-no">FORM NO. SOP/QA/04/F-02/00</span>
                      <span className="bmr-exact-page-no">Page 1 of 2</span>
                    </div>
                  </div>
                </div>

                {/* SCREEN PAGE SEPARATOR */}
                <div className="bmr-screen-page-divider no-print">
                  <span>PAGE 2 (ATTACHMENT - 1 CONTINUATION)</span>
                </div>

                {/* PAGE 2 (EXACT MATCH TO PDF PAGE 2) */}
                <div className="bmr-exact-page bmr-exact-page-2">
                  <div className="bmr-exact-page-top">
                    {renderHeader()}

                    {/* EXCIPIENTS CONTINUATION TABLE (ROWS 3 & 4) */}
                    <table className="bmr-exact-table bmr-exact-table-p2">
                      <tbody>
                        {displayExcP2.map((line, idx) => {
                          const srNo = idx + 3
                          if (!line) {
                            return (
                              <tr key={`empty-exc-p2-${idx}`} className="bmr-exact-row-empty">
                                <td style={{ width: '40px' }}>{srNo}</td>
                                <td style={{ width: '70px' }}></td>
                                <td></td>
                                <td style={{ width: '90px' }}></td>
                                <td style={{ width: '70px' }}></td>
                                <td style={{ width: '45px' }}></td>
                                <td style={{ width: '80px' }}></td>
                              </tr>
                            )
                          }
                          return (
                            <tr key={`exc-p2-${line.id ?? idx}`}>
                              <td style={{ width: '40px' }}>{srNo}</td>
                              <td style={{ width: '70px' }}>{line.material?.code || line.material_code || ''}</td>
                              <td style={{ textAlign: 'left', paddingLeft: '8px', fontWeight: 'normal', textTransform: 'uppercase' }}>
                                {line.material?.name || line.material_name || ''}
                              </td>
                              <td>{line.label_claim || line.special_value || 'Q.S.'}</td>
                              <td style={{ width: '70px' }}>{formatQty(line.quantity)}</td>
                              <td style={{ width: '45px' }}>{line.unit || line.unit_code || ''}</td>
                              <td style={{ width: '80px' }}>{line.ar_no || ''}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>

                    {/* BATCH YIELD RECONCILIATION & SAMPLE SPLIT (IF ALLOCATED) */}
                    {renderBatchAllocation()}

                    {/* WEIGHT BY / CHECKED BY VERIFICATION LINES */}
                    <div className="bmr-exact-verifications">
                      <div>Weight by/Date (Warehouse) :</div>
                      <div>Checked by / Date (Production) :</div>
                      <div>Checked by / Date (QA) :</div>
                    </div>
                  </div>

                  <div className="bmr-exact-page-bottom">
                    {/* SIGNATURE BLOCK PAGE 2 */}
                    {renderSignatures()}

                    {/* PAGE 2 FOOTER */}
                    <div className="bmr-exact-footer-row">
                      <span className="bmr-exact-form-no">FORM NO. SOP/QA/04/F-02/00</span>
                      <span className="bmr-exact-page-no">Page 2 of 2</span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* =========================================================
                ATTACHMENT - 4: PACKING MATERIAL REQUIREMENT
                ========================================================= */}
            {activeTab === 'PM' && (
              <>
                {/* PAGE 1 (EXACT MATCH TO ATTACHMENT 4 PDF PAGE 1) */}
                <div className="bmr-exact-page bmr-exact-page-1">
                  <div className="bmr-exact-page-top">
                    {renderHeader()}

                    {/* ATTACHMENT TITLES */}
                    <div className="bmr-exact-attachment-block">
                      <div className="bmr-exact-att-num">ATTACHMENT - 4</div>
                      <div className="bmr-exact-att-title" style={{ marginTop: '8px' }}>
                        PACKING MATERIAL REQUIREMENT:
                      </div>
                    </div>

                    {/* PACKING MATERIAL TABLE (EXACT 6 COLUMNS MATCHING ATTACHMENT 4) */}
                    <table className="bmr-exact-table bmr-exact-pm-table">
                      <thead>
                        <tr>
                          <th style={{ width: '42px' }}>Sr.<br />No.</th>
                          <th style={{ width: '90px' }}>Material<br />Code</th>
                          <th>Material</th>
                          <th style={{ width: '120px' }}>Quantity<br />Required<br />Nos.</th>
                          <th style={{ width: '120px' }}>Quantity<br />Received<br />Nos.</th>
                          <th style={{ width: '80px' }}>AR No.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayPkg.map((line, idx) => {
                          if (!line) {
                            return (
                              <tr key={`empty-pm-${idx}`} className="bmr-exact-row-empty">
                                <td>{idx + 1}</td>
                                <td></td>
                                <td></td>
                                <td></td>
                                <td></td>
                                <td></td>
                              </tr>
                            )
                          }

                          const matCode = line.material?.code || line.material_code || ''
                          const matName = line.material?.name || line.material_name || ''
                          let qtyTextFromNotes = ''
                          let recvFromNotes = ''
                          if (line.notes) {
                            const parts = line.notes.split('|').map((s) => s.trim())
                            for (const p of parts) {
                              if (p.startsWith('QTY_TEXT:')) qtyTextFromNotes = p.replace('QTY_TEXT:', '').trim()
                              if (p.startsWith('RECV:')) recvFromNotes = p.replace('RECV:', '').trim()
                            }
                          }
                          const qtyReq = qtyTextFromNotes || formatQty(line.quantity) || ''
                          const qtyRecv = line.quantity_received || recvFromNotes || ''
                          const arNo = line.ar_no || ''

                          return (
                            <tr key={line.id ?? `pm-${idx}`}>
                              <td>{idx + 1}</td>
                              <td>{matCode}</td>
                              <td style={{ textAlign: 'left', paddingLeft: '8px', fontWeight: 'normal' }}>
                                {matName}
                              </td>
                              <td>{qtyReq}</td>
                              <td>{qtyRecv}</td>
                              <td>{arNo}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>

                    {/* CHECKED BY (WAREHOUSE) */}
                    <div className="bmr-exact-pm-checked">
                      Checked By (Warehouse)
                    </div>
                  </div>

                  <div className="bmr-exact-page-bottom">
                    {/* SIGNATURE BLOCK PAGE 1 */}
                    {renderSignatures()}

                    {/* PAGE 1 FOOTER */}
                    <div className="bmr-exact-footer-row">
                      <span className="bmr-exact-form-no">FORM NO. SOP/QA/04/F-02/00</span>
                      <span className="bmr-exact-page-no">Page 1 of 2</span>
                    </div>
                  </div>
                </div>

                {/* SCREEN PAGE SEPARATOR */}
                <div className="bmr-screen-page-divider no-print">
                  <span>PAGE 2 (ATTACHMENT - 4 CONTINUATION)</span>
                </div>

                {/* PAGE 2 (EXACT MATCH TO ATTACHMENT 4 PDF PAGE 2) */}
                <div className="bmr-exact-page bmr-exact-page-2">
                  <div className="bmr-exact-page-top">
                    {renderHeader()}

                    {/* BATCH YIELD RECONCILIATION & SAMPLE SPLIT (IF ALLOCATED) */}
                    {renderBatchAllocation()}

                    {/* RECEIVED BY / VERIFIED BY LINES */}
                    <div className="bmr-exact-pm-p2-verifications">
                      <div>Received By (Production)</div>
                      <div>Verified by ( QA)</div>
                    </div>
                  </div>

                  <div className="bmr-exact-page-bottom">
                    {/* SIGNATURE BLOCK PAGE 2 */}
                    {renderSignatures()}

                    {/* PAGE 2 FOOTER */}
                    <div className="bmr-exact-footer-row">
                      <span className="bmr-exact-form-no">FORM NO. SOP/QA/04/F-02/00</span>
                      <span className="bmr-exact-page-no">Page 2 of 2</span>
                    </div>
                  </div>
                </div>
              </>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}
