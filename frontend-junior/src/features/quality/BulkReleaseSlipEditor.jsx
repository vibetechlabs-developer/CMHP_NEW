/**
 * Attachment-3: BULK RELEASE SLIP Editor
 * Exact 1-to-1 Replica of Quality Control SOP/QC/03/F-02/00 Document
 */
import { useState, useEffect, useRef } from 'react'
import cmhpLogo from '../../assets/cmhp_invoice_logo.png'
import Button from '../../components/Button'
import './BulkReleaseSlip.css'

const STORAGE_KEY = 'cmhp_bulk_release_slips_saved_v1'

export const INITIAL_SLIP_DATA = {
  to_department: '',
  product: '',
  tr_no: '',
  batch_no: '',
  mfg_date: '',
  exp_years: '',
  batch_size: '',
  no_of_bottles: '',

  // Test Results
  appearance_limit: '',
  appearance_obs: '',

  odor_limit: '',
  odor_obs: '',

  wt_ml_low: '',
  wt_ml_high: '',
  wt_ml_obs: '',

  viscosity_low: '',
  viscosity_high: '',
  viscosity_obs: '',

  acid_value_low: '',
  acid_value_high: '',
  acid_value_obs: '',

  peroxide_value_low: '',
  peroxide_value_high: '',
  peroxide_value_obs: '',

  iodine_value_low: '',
  iodine_value_high: '',
  iodine_value_obs: '',

  saponification_low: '',
  saponification_high: '',
  saponification_obs: '',

  // Signatures
  sign_qc: '',
  received_qa: '',
  sign_qa: '',
  received_production: '',
}

export default function BulkReleaseSlipEditor({ initialData = null, onSaved = null }) {
  const [data, setData] = useState(() => {
    if (initialData) return { ...INITIAL_SLIP_DATA, ...initialData }
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) return JSON.parse(saved)
    } catch {}
    return INITIAL_SLIP_DATA
  })

  const [saving, setSaving] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [feedback, setFeedback] = useState('')
  const sheetRef = useRef(null)

  useEffect(() => {
    if (initialData) {
      setData((prev) => ({ ...prev, ...initialData }))
    }
  }, [initialData])

  const update = (field, val) => {
    setData((prev) => ({ ...prev, [field]: val }))
  }

  const handleSave = () => {
    setSaving(true)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
      if (data.batch_no) {
        localStorage.setItem(`${STORAGE_KEY}_${data.batch_no}`, JSON.stringify(data))
      }
      setFeedback('✅ Slip saved successfully!')
      if (onSaved) onSaved(data)
    } catch (e) {
      setFeedback('⚠️ Could not save slip locally.')
    } finally {
      setTimeout(() => setSaving(false), 300)
      setTimeout(() => setFeedback(''), 4000)
    }
  }

  const handleReset = () => {
    if (window.confirm('Reset all fields to default blank slip?')) {
      setData(INITIAL_SLIP_DATA)
      setFeedback('Slip reset to blank.')
      setTimeout(() => setFeedback(''), 3000)
    }
  }

  const handlePrint = () => {
    window.print()
  }

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
          // Replace all input elements with clean text spans so html2canvas renders exact text aligned on the baseline
          const inputs = clonedDoc.querySelectorAll('input')
          inputs.forEach((inp) => {
            const span = clonedDoc.createElement('span')
            span.textContent = inp.value || ''
            span.style.fontFamily = "'Times New Roman', Times, Georgia, serif"
            span.style.fontSize = '11pt'
            span.style.color = '#000000'
            span.style.display = 'inline-flex'
            span.style.alignItems = 'center'
            span.style.height = '26px'
            span.style.lineHeight = '26px'
            span.style.padding = '0 4px'
            span.style.margin = '0'
            span.style.border = 'none'
            span.style.outline = 'none'
            span.style.verticalAlign = 'middle'
            if (inp.style.width) span.style.width = inp.style.width
            if (inp.style.flex) span.style.flex = inp.style.flex
            if (inp.style.textAlign) {
              span.style.textAlign = inp.style.textAlign
              span.style.justifyContent = inp.style.textAlign === 'center' ? 'center' : 'flex-start'
            }
            inp.parentNode.replaceChild(span, inp)
          })
        },
      })

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true,
      })

      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      const margin = 12
      const maxW = pageW - margin * 2
      const maxH = pageH - margin * 2
      const ratio = Math.min(maxW / canvas.width, maxH / canvas.height)
      const imgW = canvas.width * ratio
      const imgH = canvas.height * ratio
      const x = (pageW - imgW) / 2
      const y = Math.max(margin, (pageH - imgH) / 2)

      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', x, y, imgW, imgH, undefined, 'FAST')
      const fileName = `Attachment3_BulkRelease_${(data.batch_no || 'slip').replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`
      pdf.save(fileName)
      setFeedback(`⬇️ PDF downloaded: ${fileName}`)
      setTimeout(() => setFeedback(''), 4000)
    } catch (err) {
      console.error('PDF generation error:', err)
      alert('Could not generate PDF. Please try Print -> Save as PDF.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="bulk-slip-wrapper">
      {/* ── TOOLBAR (Screen Only) ── */}
      <div className="bulk-slip-toolbar no-print">
        <div className="bulk-slip-toolbar-left">
          <span style={{ fontWeight: 700, color: '#0f172a', fontSize: 13.5 }}>
            Attachment-3: BULK RELEASE SLIP
          </span>
          {data.batch_no && (
            <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: 4, fontSize: 11.5, fontWeight: 700 }}>
              Batch: {data.batch_no}
            </span>
          )}
          {feedback && (
            <span style={{ fontSize: 12.5, fontWeight: 600, color: '#16a34a' }}>
              {feedback}
            </span>
          )}
        </div>

        <div className="bulk-slip-toolbar-right">
          <Button variant="secondary" size="sm" onClick={handleReset}>
            🔄 Blank
          </Button>
          <Button variant="secondary" size="sm" onClick={handlePrint}>
            🖨️ Print
          </Button>
          <Button variant="secondary" size="sm" onClick={handleDownloadPdf} disabled={downloading}>
            {downloading ? 'Generating PDF…' : '⬇️ Download PDF'}
          </Button>
          <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
            💾 Save Slip
          </Button>
        </div>
      </div>

      {/* ── EXACT REPLICA DOCUMENT SHEET ── */}
      <div className="att3-sheet" ref={sheetRef}>

        {/* 1. Header Box: Logo at top left, CMHP PRIVATE LIMITED centered, empty space below */}
        <div className="att3-top-box">
          <div className="att3-header-row">
            <div className="att3-logo-wrap">
              <img src={cmhpLogo} alt="CMHP Logo" className="att3-logo-img" />
            </div>
            <div className="att3-company-title">
              CMHP PRIVATE LIMITED
            </div>
          </div>
        </div>

        {/* 2. QUALITY CONTROL centered */}
        <div className="att3-qc-row">
          QUALITY CONTROL
        </div>

        {/* 3. BULK  RELEASE SLIP | Attachment-3 */}
        <div className="att3-title-row">
          <div className="att3-title-center">
            BULK &nbsp; RELEASE SLIP
          </div>
          <div className="att3-title-right">
            Attachment-3
          </div>
        </div>

        {/* 4. TO DEPARTMENT : | FORM NO.: SOP/QC/03/F-02/00 (Divided by vertical line) */}
        <div className="att3-todep-row">
          <div className="att3-todep-left">
            <span className="att3-label" style={{ minWidth: 165 }}>TO DEPARTMENT</span>
            <span style={{ margin: '0 4px', fontWeight: 700 }}>:</span>
            <input
              className="att3-input att3-input-line"
              style={{ flex: 1 }}
              value={data.to_department}
              placeholder=""
              onChange={(e) => update('to_department', e.target.value)}
            />
          </div>
          <div className="att3-todep-right">
            <span>FORM NO.: SOP/QC/03/F-02/00</span>
          </div>
        </div>

        {/* 5. PRODUCT : | T.R. No.: (Single open row, no vertical divider) */}
        <div className="att3-open-row">
          <span className="att3-label" style={{ minWidth: 165 }}>PRODUCT</span>
          <span style={{ margin: '0 4px', fontWeight: 700 }}>:</span>
          <input
            className="att3-input att3-input-line"
            style={{ flex: 1, marginRight: 20 }}
            value={data.product}
            placeholder=""
            onChange={(e) => update('product', e.target.value)}
          />
          <span className="att3-label">T.R. No.:</span>
          <input
            className="att3-input att3-input-line"
            style={{ width: 140 }}
            value={data.tr_no}
            placeholder=""
            onChange={(e) => update('tr_no', e.target.value)}
          />
        </div>

        {/* 6. BATCH NO. : (Full width open row) */}
        <div className="att3-open-row">
          <span className="att3-label" style={{ minWidth: 165 }}>BATCH NO.</span>
          <span style={{ margin: '0 4px', fontWeight: 700 }}>:</span>
          <input
            className="att3-input att3-input-line"
            style={{ flex: 1 }}
            value={data.batch_no}
            placeholder=""
            onChange={(e) => update('batch_no', e.target.value)}
          />
        </div>

        {/* 7. MFG. DATE : | EXP. DATE/BEST BEFORE : ___ Years (No vertical divider) */}
        <div className="att3-open-row">
          <span className="att3-label" style={{ minWidth: 165 }}>MFG. DATE</span>
          <span style={{ margin: '0 4px', fontWeight: 700 }}>:</span>
          <input
            className="att3-input att3-input-line"
            style={{ flex: 1, marginRight: 20 }}
            value={data.mfg_date}
            placeholder=""
            onChange={(e) => update('mfg_date', e.target.value)}
          />
          <span className="att3-label">EXP. DATE/BEST BEFORE :</span>
          <input
            className="att3-input att3-input-line"
            style={{ width: 55, textAlign: 'center', marginLeft: 4 }}
            value={data.exp_years}
            placeholder=""
            onChange={(e) => update('exp_years', e.target.value)}
          />
          <span style={{ marginLeft: 6, fontWeight: 700 }}>Years</span>
        </div>

        {/* 8. BATCH SIZE : | NO. OF BOTTLES : (No vertical divider) */}
        <div className="att3-open-row">
          <span className="att3-label" style={{ minWidth: 165 }}>BATCH SIZE</span>
          <span style={{ margin: '0 4px', fontWeight: 700 }}>:</span>
          <input
            className="att3-input att3-input-line"
            style={{ flex: 1, marginRight: 20 }}
            value={data.batch_size}
            placeholder=""
            onChange={(e) => update('batch_size', e.target.value)}
          />
          <span className="att3-label">NO. OF BOTTLES &nbsp;:</span>
          <input
            className="att3-input att3-input-line"
            style={{ width: 140, marginLeft: 4 }}
            value={data.no_of_bottles}
            placeholder=""
            onChange={(e) => update('no_of_bottles', e.target.value)}
          />
        </div>

        {/* 9. TEST RESULTS Box */}
        <div className="att3-tests-box">
          <div className="att3-tests-head">TEST RESULTS</div>

          {/* 1. Appearance */}
          <div className="att3-test-item">
            <span className="att3-test-name">• Appearance:</span>
            <div className="att3-test-obs-wrap">
              <input
                className="att3-input att3-input-line"
                style={{ width: '90%' }}
                value={data.appearance_obs}
                placeholder=""
                onChange={(e) => update('appearance_obs', e.target.value)}
              />
            </div>
            <div className="att3-test-limit-wrap">
              <span className="att3-limit-label">(Limit:</span>
              <input
                className="att3-input att3-input-line"
                style={{ width: 220, textAlign: 'center' }}
                value={data.appearance_limit}
                placeholder=""
                onChange={(e) => update('appearance_limit', e.target.value)}
              />
              <span>)</span>
            </div>
          </div>

          {/* 2. Odor */}
          <div className="att3-test-item">
            <span className="att3-test-name">• Odor</span>
            <div className="att3-test-obs-wrap">
              <input
                className="att3-input att3-input-line"
                style={{ width: '90%' }}
                value={data.odor_obs}
                placeholder=""
                onChange={(e) => update('odor_obs', e.target.value)}
              />
            </div>
            <div className="att3-test-limit-wrap">
              <span className="att3-limit-label">(Limit:</span>
              <input
                className="att3-input att3-input-line"
                style={{ width: 220, textAlign: 'center' }}
                value={data.odor_limit}
                placeholder=""
                onChange={(e) => update('odor_limit', e.target.value)}
              />
              <span>)</span>
            </div>
          </div>

          {/* 3. Wt/ml */}
          <div className="att3-test-item">
            <span className="att3-test-name">• Wt/ml :</span>
            <div className="att3-test-obs-wrap">
              <input
                className="att3-input att3-input-line"
                style={{ width: '90%' }}
                value={data.wt_ml_obs}
                placeholder=""
                onChange={(e) => update('wt_ml_obs', e.target.value)}
              />
            </div>
            <div className="att3-test-limit-wrap">
              <span className="att3-limit-label">(Limit:</span>
              <input
                className="att3-input att3-input-line"
                style={{ width: 75, textAlign: 'center' }}
                value={data.wt_ml_low}
                placeholder=""
                onChange={(e) => update('wt_ml_low', e.target.value)}
              />
              <span style={{ margin: '0 8px', fontWeight: 700 }}>to</span>
              <input
                className="att3-input att3-input-line"
                style={{ width: 75, textAlign: 'center' }}
                value={data.wt_ml_high}
                placeholder=""
                onChange={(e) => update('wt_ml_high', e.target.value)}
              />
              <span style={{ marginLeft: 8, fontWeight: 700 }}>gm/ml)</span>
            </div>
          </div>

          {/* 4. Viscosity */}
          <div className="att3-test-item">
            <span className="att3-test-name">• Viscosity :</span>
            <div className="att3-test-obs-wrap">
              <input
                className="att3-input att3-input-line"
                style={{ width: '90%' }}
                value={data.viscosity_obs}
                placeholder=""
                onChange={(e) => update('viscosity_obs', e.target.value)}
              />
            </div>
            <div className="att3-test-limit-wrap">
              <span className="att3-limit-label">(Limit:</span>
              <input
                className="att3-input att3-input-line"
                style={{ width: 75, textAlign: 'center' }}
                value={data.viscosity_low}
                placeholder=""
                onChange={(e) => update('viscosity_low', e.target.value)}
              />
              <span style={{ margin: '0 8px', fontWeight: 700 }}>to</span>
              <input
                className="att3-input att3-input-line"
                style={{ width: 75, textAlign: 'center' }}
                value={data.viscosity_high}
                placeholder=""
                onChange={(e) => update('viscosity_high', e.target.value)}
              />
              <span style={{ marginLeft: 8, fontWeight: 700 }}>mPa.S)</span>
            </div>
          </div>

          {/* 5. Acid Value */}
          <div className="att3-test-item">
            <span className="att3-test-name">• Acid Value :</span>
            <div className="att3-test-obs-wrap">
              <input
                className="att3-input att3-input-line"
                style={{ width: '90%' }}
                value={data.acid_value_obs}
                placeholder=""
                onChange={(e) => update('acid_value_obs', e.target.value)}
              />
            </div>
            <div className="att3-test-limit-wrap">
              <span className="att3-limit-label">(Limit:</span>
              <input
                className="att3-input att3-input-line"
                style={{ width: 75, textAlign: 'center' }}
                value={data.acid_value_low}
                placeholder=""
                onChange={(e) => update('acid_value_low', e.target.value)}
              />
              <span style={{ margin: '0 8px', fontWeight: 700 }}>to</span>
              <input
                className="att3-input att3-input-line"
                style={{ width: 75, textAlign: 'center' }}
                value={data.acid_value_high}
                placeholder=""
                onChange={(e) => update('acid_value_high', e.target.value)}
              />
              <span style={{ marginLeft: 8 }}>)</span>
            </div>
          </div>

          {/* 6. Peroxide Value */}
          <div className="att3-test-item">
            <span className="att3-test-name">• Peroxide Value :</span>
            <div className="att3-test-obs-wrap">
              <input
                className="att3-input att3-input-line"
                style={{ width: '90%' }}
                value={data.peroxide_value_obs}
                placeholder=""
                onChange={(e) => update('peroxide_value_obs', e.target.value)}
              />
            </div>
            <div className="att3-test-limit-wrap">
              <span className="att3-limit-label">(Limit:</span>
              <input
                className="att3-input att3-input-line"
                style={{ width: 75, textAlign: 'center' }}
                value={data.peroxide_value_low}
                placeholder=""
                onChange={(e) => update('peroxide_value_low', e.target.value)}
              />
              <span style={{ margin: '0 8px', fontWeight: 700 }}>to</span>
              <input
                className="att3-input att3-input-line"
                style={{ width: 75, textAlign: 'center' }}
                value={data.peroxide_value_high}
                placeholder=""
                onChange={(e) => update('peroxide_value_high', e.target.value)}
              />
              <span style={{ marginLeft: 8 }}>)</span>
            </div>
          </div>

          {/* 7. Iodine Value */}
          <div className="att3-test-item">
            <span className="att3-test-name">• Iodine Value :</span>
            <div className="att3-test-obs-wrap">
              <input
                className="att3-input att3-input-line"
                style={{ width: '90%' }}
                value={data.iodine_value_obs}
                placeholder=""
                onChange={(e) => update('iodine_value_obs', e.target.value)}
              />
            </div>
            <div className="att3-test-limit-wrap">
              <span className="att3-limit-label">(Limit:</span>
              <input
                className="att3-input att3-input-line"
                style={{ width: 75, textAlign: 'center' }}
                value={data.iodine_value_low}
                placeholder=""
                onChange={(e) => update('iodine_value_low', e.target.value)}
              />
              <span style={{ margin: '0 8px', fontWeight: 700 }}>to</span>
              <input
                className="att3-input att3-input-line"
                style={{ width: 75, textAlign: 'center' }}
                value={data.iodine_value_high}
                placeholder=""
                onChange={(e) => update('iodine_value_high', e.target.value)}
              />
              <span style={{ marginLeft: 8 }}>)</span>
            </div>
          </div>

          {/* 8. Saponification Value */}
          <div className="att3-test-item">
            <span className="att3-test-name">• Saponification Value :</span>
            <div className="att3-test-obs-wrap">
              <input
                className="att3-input att3-input-line"
                style={{ width: '90%' }}
                value={data.saponification_obs}
                placeholder=""
                onChange={(e) => update('saponification_obs', e.target.value)}
              />
            </div>
            <div className="att3-test-limit-wrap">
              <span className="att3-limit-label">(Limit:</span>
              <input
                className="att3-input att3-input-line"
                style={{ width: 75, textAlign: 'center' }}
                value={data.saponification_low}
                placeholder=""
                onChange={(e) => update('saponification_low', e.target.value)}
              />
              <span style={{ margin: '0 8px', fontWeight: 700 }}>to</span>
              <input
                className="att3-input att3-input-line"
                style={{ width: 75, textAlign: 'center' }}
                value={data.saponification_high}
                placeholder=""
                onChange={(e) => update('saponification_high', e.target.value)}
              />
              <span style={{ marginLeft: 8 }}>)</span>
            </div>
          </div>
        </div>

        {/* 10. Sign By / Date (QC) : | Recieved By / Date (QA) : (No vertical divider) */}
        <div className="att3-sign-row-1">
          <span className="att3-label">Sign By / Date (QC) &nbsp;:</span>
          <input
            className="att3-input att3-input-line"
            style={{ flex: 1, marginRight: 24 }}
            value={data.sign_qc}
            placeholder=""
            onChange={(e) => update('sign_qc', e.target.value)}
          />
          <span className="att3-label">Recieved By / Date (QA) &nbsp;&nbsp;&nbsp;&nbsp;:</span>
          <input
            className="att3-input att3-input-line"
            style={{ width: 180, marginLeft: 6 }}
            value={data.received_qa}
            placeholder=""
            onChange={(e) => update('received_qa', e.target.value)}
          />
        </div>

        {/* 11. Status declaration */}
        <div className="att3-status-row">
          Status : The above batch of Bulk sample is released for filling / compression.
        </div>

        {/* 12. Sign By./ Date (QA) : | Received By / Date ( Production) (No vertical divider) */}
        <div className="att3-sign-row-2">
          <span className="att3-label">Sign By./ Date (QA) :</span>
          <input
            className="att3-input att3-input-line"
            style={{ flex: 1, marginRight: 24 }}
            value={data.sign_qa}
            placeholder=""
            onChange={(e) => update('sign_qa', e.target.value)}
          />
          <span className="att3-label">Received By / Date ( Production)</span>
          <input
            className="att3-input att3-input-line"
            style={{ width: 170, marginLeft: 6 }}
            value={data.received_production}
            placeholder=""
            onChange={(e) => update('received_production', e.target.value)}
          />
        </div>

      </div>
    </div>
  )
}
