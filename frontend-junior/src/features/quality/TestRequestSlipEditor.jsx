/**
 * Attachment-2: TEST REQUEST (BULK) Editor
 * Exact 1-to-1 Replica of SOP/QA/04/F-03/00
 * Renders 2 copies on one page (same as original paper form)
 */
import { useState, useEffect, useRef } from 'react'
import cmhpLogo from '../../assets/cmhp_invoice_logo.png'
import Button from '../../components/Button'
import './TestRequestSlip.css'

const STORAGE_KEY = 'cmhp_test_request_slips_v1'

export const INITIAL_TR_DATA = {
  tr_no: '',
  date: '',
  department: '',
  product: '',
  product_code: '',
  batch_no: '',
  batch_size: '',
  sampled_qty: '',
  mfg_date: '',
  exp_best_before: '',
  sign_production: '',
  received_qa: '',
  sampled_qa: '',
  received_qc: '',
}

/* ── Single copy of the form sheet ── */
function SheetTable({ data, update, copyIndex }) {
  /* Inline editable field — only first copy is editable, second is read-only mirror */
  const F = ({ field, style = {} }) =>
    copyIndex === 0 ? (
      <input
        className="trs-cell-input"
        style={style}
        value={data[field]}
        onChange={(e) => update(field, e.target.value)}
      />
    ) : (
      <span className="trs-cell-mirror" style={style}>
        {data[field]}
      </span>
    )

  return (
    <table className="trs-table">
      <colgroup>
        <col style={{ width: '27%' }} />
        <col style={{ width: '31%' }} />
        <col style={{ width: '25%' }} />
        <col style={{ width: '17%' }} />
      </colgroup>
      <tbody>

        {/* ROW 1: Header Logo + Company */}
        <tr>
          <td colSpan={4} className="trs-header-cell">
            <div className="trs-header-inner">
              <div className="trs-logo-wrap">
                <img src={cmhpLogo} alt="CMHP" className="trs-logo-img" />
              </div>
              <div className="trs-company-title">CMHP PRIVATE LIMITED</div>
            </div>
          </td>
        </tr>

        {/* ROW 2: PRODUCTION */}
        <tr>
          <td colSpan={4} className="trs-center-cell trs-bold" style={{ padding: '5px 10px', fontSize: '12pt' }}>
            PRODUCTION
          </td>
        </tr>

        {/* ROW 3: TEST REQUEST (BULK) | TR NO / DATE */}
        <tr>
          <td colSpan={2} className="trs-center-cell trs-bold" style={{ fontSize: '11.5pt', borderRight: '1px solid #000' }}>
            TEST REQUEST (BULK&nbsp;&nbsp;)
          </td>
          <td colSpan={2} style={{ padding: 0 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', height: '100%' }}>
              <tbody>
                <tr>
                  <td style={{ padding: '3px 8px', borderBottom: '1px solid #000', fontWeight: 700, fontSize: '11pt' }}>
                    <span className="trs-lbl">TR NO&nbsp;:&nbsp;</span>
                    <F field="tr_no" style={{ width: '65%' }} />
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '3px 8px', fontWeight: 700, fontSize: '11pt' }}>
                    <span className="trs-lbl">DATE:&nbsp;</span>
                    <F field="date" style={{ width: '65%' }} />
                  </td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>

        {/* ROW 4: DEPARTMENT | FORM NO */}
        <tr>
          <td className="trs-lbl-cell" style={{ borderRight: 'none' }}>DEPARTMENT :</td>
          <td className="trs-val-cell" style={{ borderRight: '1px solid #000' }}>
            <F field="department" style={{ width: '100%' }} />
          </td>
          <td colSpan={2} className="trs-lbl-cell" style={{ fontSize: '10.5pt' }}>
            FORM NO.: SOP/QA/04/F-03/00
          </td>
        </tr>

        {/* ROW 5: PRODUCT full width */}
        <tr>
          <td className="trs-lbl-cell" style={{ borderRight: 'none' }}>PRODUCT :</td>
          <td colSpan={3} className="trs-val-cell">
            <F field="product" style={{ width: '100%' }} />
          </td>
        </tr>

        {/* ROW 6: PRODUCT CODE | BATCH NO */}
        <tr>
          <td className="trs-lbl-cell" style={{ borderRight: 'none' }}>PRODUCT CODE :</td>
          <td className="trs-val-cell" style={{ borderRight: '1px solid #000' }}>
            <F field="product_code" style={{ width: '100%' }} />
          </td>
          <td className="trs-lbl-cell" style={{ borderRight: 'none' }}>BATCH NO. :</td>
          <td className="trs-val-cell">
            <F field="batch_no" style={{ width: '100%' }} />
          </td>
        </tr>

        {/* ROW 7: BATCH SIZE | SAMPLED QTY */}
        <tr>
          <td className="trs-lbl-cell" style={{ borderRight: 'none' }}>BATCH SIZE :</td>
          <td className="trs-val-cell" style={{ borderRight: '1px solid #000' }}>
            <F field="batch_size" style={{ width: '100%' }} />
          </td>
          <td className="trs-lbl-cell" style={{ borderRight: 'none' }}>SAMPLED QTY. :</td>
          <td className="trs-val-cell">
            <F field="sampled_qty" style={{ width: '100%' }} />
          </td>
        </tr>

        {/* ROW 8: MFG DATE | EXP DATE */}
        <tr>
          <td className="trs-lbl-cell" style={{ borderRight: 'none' }}>MFG. DATE :</td>
          <td className="trs-val-cell" style={{ borderRight: '1px solid #000' }}>
            <F field="mfg_date" style={{ width: '100%' }} />
          </td>
          <td colSpan={2} className="trs-lbl-cell" style={{ display: 'flex', alignItems: 'center', flexWrap: 'nowrap' }}>
            <span style={{ whiteSpace: 'nowrap', fontWeight: 700 }}>EXP. DATE/BEST BEFORE :&nbsp;</span>
            <F field="exp_best_before" style={{ flex: 1, minWidth: 40 }} />
          </td>
        </tr>

        {/* ROW 9: TEST TO BE PERFORMED */}
        <tr>
          <td colSpan={4} className="trs-center-cell trs-bold" style={{ padding: '5px 10px', fontSize: '11pt' }}>
            TEST TO BE PERFORMED :
          </td>
        </tr>

        {/* ROW 10: Tests text */}
        <tr>
          <td colSpan={4} className="trs-tests-text-cell">
            1) BULK : Appearance / Odor / Wt.per ml / % Moisture/ Viscosity / Acid Value / Peroxide Value / Saponification Value / Iodine Value
          </td>
        </tr>

        {/* ROW 11: Sign Production | Received QA */}
        <tr>
          <td colSpan={2} className="trs-sign-cell" style={{ borderRight: '1px solid #000' }}>
            <span className="trs-sign-lbl">Sign By / Date (Production) :&nbsp;</span>
            <F field="sign_production" style={{ flex: 1 }} />
          </td>
          <td colSpan={2} className="trs-sign-cell">
            <span className="trs-sign-lbl">Received By / Date (QA)&nbsp;</span>
            <F field="received_qa" style={{ flex: 1 }} />
          </td>
        </tr>

        {/* ROW 12: Sampled QA | Received QC */}
        <tr>
          <td colSpan={2} className="trs-sign-cell" style={{ borderRight: '1px solid #000' }}>
            <span className="trs-sign-lbl">Sampled By / Date (QA) :&nbsp;</span>
            <F field="sampled_qa" style={{ flex: 1 }} />
          </td>
          <td colSpan={2} className="trs-sign-cell">
            <span className="trs-sign-lbl">Received By / Date (QC)&nbsp;</span>
            <F field="received_qc" style={{ flex: 1 }} />
          </td>
        </tr>

        {/* ROW 13: BULK bottom */}
        <tr>
          <td colSpan={4} className="trs-center-cell trs-bold"
            style={{ padding: '6px 10px', fontSize: '12pt', letterSpacing: '1px', borderBottom: 'none' }}>
            BULK
          </td>
        </tr>

      </tbody>
    </table>
  )
}

/* ── Main Editor Component ── */
export default function TestRequestSlipEditor({ initialData = null, onSaved = null }) {
  const [data, setData] = useState(() => {
    if (initialData) return { ...INITIAL_TR_DATA, ...initialData }
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) return JSON.parse(saved)
    } catch {}
    return INITIAL_TR_DATA
  })

  const [saving, setSaving] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [feedback, setFeedback] = useState('')
  const sheetRef = useRef(null)

  useEffect(() => {
    if (initialData) setData((prev) => ({ ...prev, ...initialData }))
  }, [initialData])

  const update = (field, val) => setData((prev) => ({ ...prev, [field]: val }))

  const handleSave = () => {
    setSaving(true)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
      if (data.batch_no) localStorage.setItem(`${STORAGE_KEY}_${data.batch_no}`, JSON.stringify(data))
      setFeedback('✅ Test Request saved!')
      if (onSaved) onSaved(data)
    } catch {
      setFeedback('⚠️ Could not save.')
    } finally {
      setTimeout(() => setSaving(false), 300)
      setTimeout(() => setFeedback(''), 4000)
    }
  }

  const handleReset = () => {
    if (window.confirm('Reset all fields to blank?')) {
      setData(INITIAL_TR_DATA)
      setFeedback('Reset to blank.')
      setTimeout(() => setFeedback(''), 3000)
    }
  }

  const handlePrint = () => window.print()

  const handleDownloadPdf = async () => {
    if (!sheetRef.current) return
    setDownloading(true)
    try {
      const html2canvas = (await import('html2canvas')).default
      const { jsPDF } = await import('jspdf')
      const canvas = await html2canvas(sheetRef.current, {
        scale: 3,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        onclone: (clonedDoc) => {
          // Style inputs in-place (no replace) — keeps cell constraints intact
          clonedDoc.querySelectorAll('input').forEach((inp) => {
            inp.style.border = 'none'
            inp.style.borderBottom = 'none'
            inp.style.outline = 'none'
            inp.style.boxShadow = 'none'
            inp.style.background = 'transparent'
            inp.style.color = '#000000'
            inp.style.fontFamily = "'Times New Roman', Times, Georgia, serif"
            inp.style.fontSize = '11pt'
            inp.style.fontWeight = '400'
            inp.style.padding = '0 2px'
            inp.style.overflow = 'hidden'
            inp.style.textOverflow = 'ellipsis'
            inp.style.whiteSpace = 'nowrap'
          })
          // Remove dotted border from mirror spans
          clonedDoc.querySelectorAll('.trs-cell-mirror').forEach((el) => {
            el.style.borderBottom = 'none'
          })
          // Remove toolbar
          const toolbar = clonedDoc.querySelector('.test-req-toolbar')
          if (toolbar) toolbar.style.display = 'none'
        },
      })
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
      const pageW = pdf.internal.pageSize.getWidth()   // 210mm
      const pageH = pdf.internal.pageSize.getHeight()  // 297mm
      const marginX = 10
      const marginY = 10
      // Fit both copies across full A4 height — no vertical centering gap
      const availW = pageW - marginX * 2
      const availH = pageH - marginY * 2
      const ratio = Math.min(availW / canvas.width, availH / canvas.height)
      const imgW = canvas.width * ratio
      const imgH = canvas.height * ratio
      const x = marginX + (availW - imgW) / 2
      const y = marginY
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', x, y, imgW, imgH, undefined, 'FAST')
      const fileName = `Attachment2_TestRequest_${(data.batch_no || 'slip').replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`
      pdf.save(fileName)
      setFeedback(`⬇️ ${fileName}`)
      setTimeout(() => setFeedback(''), 4000)
    } catch (err) {
      console.error(err)
      alert('PDF failed. Try Print → Save as PDF.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="test-req-wrapper">
      {/* ── TOOLBAR ── */}
      <div className="test-req-toolbar no-print">
        <div className="test-req-toolbar-left">
          <span style={{ fontWeight: 700, color: '#0f172a', fontSize: 13.5 }}>
            Attachment-2 : TEST REQUEST (BULK)
          </span>
          {data.batch_no && (
            <span style={{ background: '#fef9c3', color: '#854d0e', padding: '2px 8px', borderRadius: 4, fontSize: 11.5, fontWeight: 700 }}>
              Batch: {data.batch_no}
            </span>
          )}
          {feedback && (
            <span style={{ fontSize: 12, fontWeight: 600, color: feedback.startsWith('✅') || feedback.startsWith('⬇️') ? '#16a34a' : '#dc2626' }}>
              {feedback}
            </span>
          )}
        </div>
        <div className="test-req-toolbar-right">
          <Button size="sm" variant="secondary" onClick={handleReset}>🔄 Blank</Button>
          <Button size="sm" variant="secondary" onClick={handlePrint}>🖨️ Print</Button>
          <Button size="sm" variant="secondary" onClick={handleDownloadPdf} disabled={downloading}>
            {downloading ? '⏳ Generating…' : '⬇️ Download PDF'}
          </Button>
          <Button size="sm" variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? '⏳ Saving…' : '💾 Save Slip'}
          </Button>
        </div>
      </div>

      {/* ── TWO COPIES ON ONE PAGE (same as original attachment) ── */}
      <div className="test-req-page" ref={sheetRef}>

        {/* Copy 1 — Editable */}
        <div className="test-req-sheet">
          <SheetTable data={data} update={update} copyIndex={0} />
        </div>

        {/* Gap between copies */}
        <div className="trs-copy-gap" />

        {/* Copy 2 — Mirror (read-only, same data) */}
        <div className="test-req-sheet">
          <SheetTable data={data} update={update} copyIndex={1} />
        </div>

      </div>
    </div>
  )
}
