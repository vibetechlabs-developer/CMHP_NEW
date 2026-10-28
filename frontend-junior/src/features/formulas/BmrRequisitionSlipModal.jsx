import { useEffect, useRef, useState } from 'react'
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

export default function BmrRequisitionSlipModal({
  isOpen,
  onClose,
  product = {},
  formula = {},
  revision = {},
  activeLines = null,
  company = {},
  initialTab = 'RM',
}) {
  const [activeTab, setActiveTab] = useState(initialTab || 'RM')
  const [batchNo, setBatchNo] = useState(() => (product?.bmr_no ? `${product.code}-01` : 'AH2602'))
  const [effectiveDate, setEffectiveDate] = useState(() => '12-04-2024')
  const [supersedesNo] = useState('00')
  const [mfgFor, setMfgFor] = useState(() => 'APEX ANIMAL HEALTH PRODUCTS')
  const [companyName, setCompanyName] = useState(() => company?.display_name || company?.name || 'CMHP PRIVATE LIMITED')

  const slipRef = useRef(null)

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab)
    }
  }, [initialTab])

  if (!isOpen) return null

  const lines = (activeLines && activeLines.length > 0) ? activeLines : (revision?.lines || [])
  const rawMaterials = lines.filter((l) => l.material_type === 'RAW_MATERIAL')
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

  // Packaging materials for Attachment 4 (11 standard rows)
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
    const element = slipRef.current
    if (!element) return

    const html2pdf = (await import('html2pdf.js')).default
    const productName = (product?.name || 'FIBROGONE').replace(/[^a-zA-Z0-9]/g, '_')
    const revNo = revision?.revision_number || '01'
    const filename = activeTab === 'RM'
      ? `BMR_RM_Attachment_1_${productName}_Rev${revNo}.pdf`
      : `BMR_PM_Attachment_4_${productName}_Rev${revNo}.pdf`

    // Build a clean clone — strip every no-print element (toolbar, screen divider)
    // so only the two white A4 page divs are captured.
    const clone = element.cloneNode(true)
    clone.querySelectorAll('.no-print, .bmr-screen-page-divider').forEach((el) => el.remove())

    // Give the clone a white background and remove box-shadow for cleaner capture
    clone.style.background = '#ffffff'
    clone.style.boxShadow = 'none'
    clone.style.display = 'flex'
    clone.style.flexDirection = 'column'

    // Temporarily mount clone off-screen so html2pdf can measure it
    clone.style.position = 'fixed'
    clone.style.top = '-9999px'
    clone.style.left = '0'
    clone.style.width = '794px'
    document.body.appendChild(clone)

    try {
      await html2pdf()
        .set({
          margin: 0,
          filename,
          image: { type: 'jpeg', quality: 0.99 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#ffffff',
            logging: false,
            width: 794,
            windowWidth: 794,
          },
          jsPDF: { unit: 'px', format: [794, 1123], orientation: 'portrait', hotfixes: ['px_scaling'] },
          pagebreak: {
            mode: ['css', 'legacy'],
            before: '.bmr-exact-page-2',
            avoid: ['tr', 'td', '.bmr-exact-header-box', '.bmr-exact-sign-table'],
          },
        })
        .from(clone)
        .save()
    } finally {
      document.body.removeChild(clone)
    }
  }


  const handleExcel = () => {
    const productName = product?.name || 'FIBROGONE'
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
        companyName,
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
          submittedBy: 'Production Chemist',
          decidedBy: revision.status === 'APPROVED' ? 'QA / QC Manager' : 'Pending Review',
        },
        companyName,
      })
    }
  }

  // Common Header Component matching exact PDF
  const renderHeader = () => (
    <div className="bmr-exact-header-box">
      <div className="bmr-exact-top-banner">
        <div className="bmr-exact-logo-wrap">
          <img src="/cmhp_logo.png" alt="CMHP Logo" className="bmr-exact-logo-img" />
        </div>
        <div className="bmr-exact-company-title">
          {companyName}
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
                style={{ width: '65%' }}
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
          <th className="bmr-exact-sign-corner-th" style={{ width: '18%' }}></th>
          <th style={{ width: '27.3%' }}>
            Prepared By<br />
            <span style={{ fontWeight: 'normal' }}>Production Chemist</span>
          </th>
          <th style={{ width: '27.3%' }}>
            Reviewed By<br />
            <span style={{ fontWeight: 'normal' }}>Production In-Charge</span>
          </th>
          <th style={{ width: '27.4%' }}>
            Approved By<br />
            <span style={{ fontWeight: 'normal' }}>QA Manager</span>
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

  return (
    <div className="bmr-modal-overlay">
      <div className="bmr-modal-container">
        {/* TOP TOOLBAR (NO-PRINT) */}
        <div className="bmr-modal-toolbar no-print">
          <div className="bmr-toolbar-left">
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>
              {activeTab === 'RM'
                ? '📄 Drops RM Requisition Slip (Attachment - 1 Master Format)'
                : '📦 Packing Material Requirement Slip (Attachment - 4 Master Format)'}
            </h3>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>
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
            <Button type="button" onClick={handleDownloadPdf}>
              ⬇️ Download PDF
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
                  {renderHeader()}

                  {/* ATTACHMENT TITLES */}
                  <div className="bmr-exact-attachment-block">
                    <div className="bmr-exact-att-num">ATTACHMENT - 1</div>
                    <div className="bmr-exact-att-title">RAW MATERIAL REQUISITION SLIP</div>
                    <div className="bmr-exact-batch-title">BATCH FORMULA:</div>
                  </div>

                  {/* RAW MATERIAL REQUISITION TABLE */}
                  <table className="bmr-exact-table">
                    <thead>
                      <tr>
                        <th style={{ width: '42px' }}>Sr.<br />No.</th>
                        <th style={{ width: '70px' }}>RM<br />Code</th>
                        <th>RAW MATERIAL NAME</th>
                        <th style={{ width: '65px' }}>Potency</th>
                        <th style={{ width: '95px' }}>Label<br />Claim</th>
                        <th style={{ width: '70px' }}>Qty. Req</th>
                        <th style={{ width: '50px' }}>Unit</th>
                        <th style={{ width: '85px' }}>AR.No.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayRaw.map((line, idx) => {
                        if (!line) {
                          return (
                            <tr key={`empty-raw-${idx}`} className="bmr-exact-row-empty">
                              <td>{idx + 1}</td>
                              <td></td>
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
                        const matName = line.material?.name || line.material_name || ''
                        const isFormula = line.calculation_mode === 'AS_PER_FORMULA'
                        const labelClaim = isFormula
                          ? '—'
                          : (line.label_claim ||
                            (line.calculation_mode === 'AS_PER_LABEL_CLAIM'
                              ? `${line.label_claim_quantity || ''} ${line.label_claim_uom?.code || ''}`
                              : line.special_value || '—'))

                        return (
                          <tr key={line.id ?? idx}>
                            <td>{idx + 1}</td>
                            <td>{matCode}</td>
                            <td style={{ fontWeight: 'normal' }}>{matName}</td>
                            <td>{line.potency || ''}</td>
                            <td>{labelClaim}</td>
                            <td>{line.quantity}</td>
                            <td>{line.unit || line.unit_code || '—'}</td>
                            <td>{line.ar_no || ''}</td>
                          </tr>
                        )
                      })}

                      {/* REPEATED HEADER FOR EXCIPIENTS */}
                      <tr className="bmr-exact-repeat-header">
                        <th style={{ width: '42px' }}>Sr.<br />No.</th>
                        <th style={{ width: '70px' }}>RM<br />Code</th>
                        <th>RAW MATERIAL NAME</th>
                        <th style={{ width: '65px' }}>Potency</th>
                        <th style={{ width: '95px' }}>Label<br />Claim</th>
                        <th style={{ width: '70px' }}>Qty. Req</th>
                        <th style={{ width: '50px' }}>Unit</th>
                        <th style={{ width: '85px' }}>AR.No.</th>
                      </tr>

                      {/* EXCIPIENTS ROW SPANNING ALL COLUMNS */}
                      <tr className="bmr-exact-excipients-span-row">
                        <td colSpan={8}>EXCIPIENTS</td>
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
                              <td></td>
                            </tr>
                          )
                        }

                        return (
                          <tr key={`exc-p1-${line.id ?? idx}`}>
                            <td>{srNo}</td>
                            <td>{line.material?.code || line.material_code || ''}</td>
                            <td>{line.material?.name || line.material_name || ''}</td>
                            <td>{line.potency || ''}</td>
                            <td>{line.label_claim || line.special_value || 'Q.S.'}</td>
                            <td>{line.quantity || ''}</td>
                            <td>{line.unit || line.unit_code || ''}</td>
                            <td>{line.ar_no || ''}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>

                  {/* SIGNATURE BLOCK PAGE 1 */}
                  {renderSignatures()}

                  {/* PAGE 1 FOOTER */}
                  <div className="bmr-exact-footer-row">
                    <span className="bmr-exact-form-no">FORM NO. SOP/QA/04/F-02/00</span>
                    <span className="bmr-exact-page-no">Page 1 of 2</span>
                  </div>
                </div>

                {/* SCREEN PAGE SEPARATOR */}
                <div className="bmr-screen-page-divider no-print">
                  <span>PAGE 2 (ATTACHMENT - 1 CONTINUATION)</span>
                </div>

                {/* PAGE 2 (EXACT MATCH TO PDF PAGE 2) */}
                <div className="bmr-exact-page bmr-exact-page-2">
                  {renderHeader()}

                  {/* EXCIPIENTS CONTINUATION TABLE (ROWS 3 & 4) */}
                  <table className="bmr-exact-table bmr-exact-table-p2">
                    <tbody>
                      {displayExcP2.map((line, idx) => {
                        const srNo = idx + 3
                        if (!line) {
                          return (
                            <tr key={`empty-exc-p2-${idx}`} className="bmr-exact-row-empty">
                              <td style={{ width: '42px' }}>{srNo}</td>
                              <td style={{ width: '70px' }}></td>
                              <td></td>
                              <td style={{ width: '65px' }}></td>
                              <td style={{ width: '95px' }}></td>
                              <td style={{ width: '70px' }}></td>
                              <td style={{ width: '50px' }}></td>
                              <td style={{ width: '85px' }}></td>
                            </tr>
                          )
                        }
                        return (
                          <tr key={`exc-p2-${line.id ?? idx}`}>
                            <td style={{ width: '42px' }}>{srNo}</td>
                            <td style={{ width: '70px' }}>{line.material?.code || line.material_code || ''}</td>
                            <td>{line.material?.name || line.material_name || ''}</td>
                            <td style={{ width: '65px' }}>{line.potency || ''}</td>
                            <td style={{ width: '95px' }}>{line.label_claim || line.special_value || 'Q.S.'}</td>
                            <td style={{ width: '70px' }}>{line.quantity || ''}</td>
                            <td style={{ width: '50px' }}>{line.unit || line.unit_code || ''}</td>
                            <td style={{ width: '85px' }}>{line.ar_no || ''}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>

                  {/* WEIGHT BY / CHECKED BY VERIFICATION LINES */}
                  <div className="bmr-exact-verifications">
                    <div>Weight by/Date (Warehouse) :</div>
                    <div>Checked by / Date (Production) :</div>
                    <div>Checked by / Date (QA) :</div>
                  </div>

                  {/* SIGNATURE BLOCK PAGE 2 */}
                  <div className="bmr-exact-p2-sign-wrapper">
                    {renderSignatures()}
                  </div>

                  {/* PAGE 2 FOOTER */}
                  <div className="bmr-exact-footer-row">
                    <span className="bmr-exact-form-no">FORM NO. SOP/QA/04/F-02/00</span>
                    <span className="bmr-exact-page-no">Page 2 of 2</span>
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
                  {renderHeader()}

                  {/* ATTACHMENT TITLES */}
                  <div className="bmr-exact-attachment-block">
                    <div className="bmr-exact-att-num">ATTACHMENT - 4</div>
                    <div className="bmr-exact-att-title" style={{ marginTop: '10px' }}>
                      PACKING MATERIAL REQUIREMENT:
                    </div>
                  </div>

                  {/* PACKING MATERIAL TABLE */}
                  <table className="bmr-exact-table bmr-exact-pm-table">
                    <thead>
                      <tr>
                        <th style={{ width: '45px' }}>Sr.<br />No.</th>
                        <th style={{ width: '100px' }}>Material<br />Code</th>
                        <th>Material</th>
                        <th style={{ width: '130px' }}>Quantity<br />Required<br />Nos.</th>
                        <th style={{ width: '130px' }}>Quantity<br />Received<br />Nos.</th>
                        <th style={{ width: '100px' }}>AR No.</th>
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
                        // Parse QTY_TEXT: and RECV: from notes (pipe-separated multi-part)
                        let qtyTextFromNotes = ''
                        let recvFromNotes = ''
                        if (line.notes) {
                          const parts = line.notes.split('|').map((s) => s.trim())
                          for (const p of parts) {
                            if (p.startsWith('QTY_TEXT:')) qtyTextFromNotes = p.replace('QTY_TEXT:', '').trim()
                            if (p.startsWith('RECV:')) recvFromNotes = p.replace('RECV:', '').trim()
                          }
                        }
                        // Display qty: prefer live quantity (N/A from UI), else QTY_TEXT from notes, else stored number
                        const qtyReq = qtyTextFromNotes || line.quantity || ''
                        const qtyRecv = line.quantity_received || recvFromNotes || ''
                        const arNo = line.ar_no || ''

                        return (
                          <tr key={line.id ?? `pm-${idx}`}>
                            <td>{idx + 1}</td>
                            <td>{matCode}</td>
                            <td style={{ textAlign: 'left', paddingLeft: '12px', fontWeight: 'normal' }}>
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

                  {/* SIGNATURE BLOCK PAGE 1 */}
                  {renderSignatures()}

                  {/* PAGE 1 FOOTER */}
                  <div className="bmr-exact-footer-row">
                    <span className="bmr-exact-form-no">FORM NO. SOP/QA/04/F-02/00</span>
                    <span className="bmr-exact-page-no">Page 1 of 2</span>
                  </div>
                </div>

                {/* SCREEN PAGE SEPARATOR */}
                <div className="bmr-screen-page-divider no-print">
                  <span>PAGE 2 (ATTACHMENT - 4 CONTINUATION)</span>
                </div>

                {/* PAGE 2 (EXACT MATCH TO ATTACHMENT 4 PDF PAGE 2) */}
                <div className="bmr-exact-page bmr-exact-page-2">
                  {renderHeader()}

                  {/* RECEIVED BY / VERIFIED BY LINES */}
                  <div className="bmr-exact-pm-p2-verifications">
                    <div>Received By (Production)</div>
                    <div>Verified by ( QA)</div>
                  </div>

                  {/* SIGNATURE BLOCK PAGE 2 */}
                  <div className="bmr-exact-p2-sign-wrapper">
                    {renderSignatures()}
                  </div>

                  {/* PAGE 2 FOOTER */}
                  <div className="bmr-exact-footer-row">
                    <span className="bmr-exact-form-no">FORM NO. SOP/QA/04/F-02/00</span>
                    <span className="bmr-exact-page-no">Page 2 of 2</span>
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
