/**
 * Attachment-3: BULK RELEASE SLIP Editor
 * Product-type aware: Tablet uses new Tablet layout; Oil uses generic/oil layout; other types show placeholder.
 */
import { useState, useEffect, useRef, useMemo } from 'react'
import cmhpLogo from '../../assets/cmhp_invoice_logo.png'
import { getCompanyBranding } from '../../utils/companyBranding.js'
import Button from '../../components/Button'
import { resolveQcSlip } from '../formulas/slips/slipRegistry'
import TabletBulkReleaseSlip, { getInitialTabletBulkReleaseData } from './slips/TabletBulkReleaseSlip'
import MotherTinctureBulkReleaseSlip, { getInitialMotherTinctureBulkReleaseData } from './slips/MotherTinctureBulkReleaseSlip'
import SyrupBulkReleaseSlip, { getInitialSyrupBulkReleaseData } from './slips/SyrupBulkReleaseSlip'
import OilBulkReleaseSlip, { getInitialOilBulkReleaseData } from './slips/OilBulkReleaseSlip'
import QcPlaceholderSlip from './slips/QcPlaceholderSlip'
import { triggerSlipPrint, downloadSlipPdf } from '../../utils/slipPrintService'
import './BulkReleaseSlip.css'
import './slips/TabletQcSlip.css'

const LEGACY_STORAGE_KEY = 'cmhp_bulk_release_slips_saved_v1'

export const INITIAL_SLIP_DATA = {
  to_department: '',
  product: '',
  tr_no: '',
  batch_no: '',
  mfg_date: '',
  exp_years: '',
  batch_size: '',
  no_of_bottles: '',

  // Test Results (Oil / Generic)
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

export default function BulkReleaseSlipEditor({
  initialData = null,
  productType = 'tablet',
  onSaved = null,
  readOnly = false,
}) {
  const branding = getCompanyBranding(initialData)
  const resolved = useMemo(() => resolveQcSlip('bulkRelease', productType), [productType])
  const { typeKey, displayName, isImplemented, isGenericOil } = resolved
  const isPlaceholder = !isImplemented && !isGenericOil

  // Batch / Product key for isolation
  const batchKey = initialData?.batch_no || initialData?.id || 'default'

  // Load saved Tablet slip data
  const loadTabletData = () => {
    try {
      const specificKey = `cmhp_qc_slip_v1_bulk_release_tablet_${batchKey}`
      const saved = localStorage.getItem(specificKey)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed?.data) return parsed.data
      }
      // Check legacy by batch
      if (initialData?.batch_no) {
        const legacy = localStorage.getItem(`${LEGACY_STORAGE_KEY}_${initialData.batch_no}`)
        if (legacy) return getInitialTabletBulkReleaseData(JSON.parse(legacy))
      }
    } catch {}
    return getInitialTabletBulkReleaseData(initialData || {})
  }

  // Load saved Generic/Oil slip data
  const loadGenericData = () => {
    try {
      const specificKey = `cmhp_qc_slip_v1_bulk_release_oil_${batchKey}`
      const saved = localStorage.getItem(specificKey)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed?.data) return getInitialOilBulkReleaseData(parsed.data)
      }
      if (initialData?.batch_no) {
        const legacy = localStorage.getItem(`${LEGACY_STORAGE_KEY}_${initialData.batch_no}`)
        if (legacy) return getInitialOilBulkReleaseData(JSON.parse(legacy))
      }
      const genericSaved = localStorage.getItem(LEGACY_STORAGE_KEY)
      if (genericSaved) return getInitialOilBulkReleaseData(JSON.parse(genericSaved))
    } catch {}
    return getInitialOilBulkReleaseData(initialData || {})
  }

  // Load saved Mother Tincture slip data
  const loadMtData = () => {
    try {
      const specificKey = `cmhp_qc_slip_v1_bulk_release_mother_tincture_${batchKey}`
      const saved = localStorage.getItem(specificKey)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed?.data) return parsed.data
      }
    } catch {}
    return getInitialMotherTinctureBulkReleaseData(initialData || {})
  }

  // Load saved Syrup slip data
  const loadSyrupData = () => {
    try {
      const specificKey = `cmhp_qc_slip_v1_bulk_release_syrup_${batchKey}`
      const saved = localStorage.getItem(specificKey)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed?.data) return parsed.data
      }
    } catch {}
    return getInitialSyrupBulkReleaseData(initialData || {})
  }

  const [tabletData, setTabletData] = useState(loadTabletData)
  const [mtData, setMtData] = useState(loadMtData)
  const [syrupData, setSyrupData] = useState(loadSyrupData)
  const [genericData, setGenericData] = useState(loadGenericData)

  const [saving, setSaving] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [feedback, setFeedback] = useState('')
  const sheetRef = useRef(null)

  // Re-sync when initialData or productType or batch changes
  useEffect(() => {
    setTabletData(loadTabletData())
    setMtData(loadMtData())
    setSyrupData(loadSyrupData())
    setGenericData(loadGenericData())
  }, [batchKey, productType, initialData])

  const updateGeneric = (field, val) => {
    setGenericData((prev) => ({ ...prev, [field]: val }))
  }

  const activeBatchNo =
    typeKey === 'syrup'
      ? syrupData.batch_no
      : typeKey === 'tablet'
      ? tabletData.batch_no
      : typeKey === 'mother-tincture'
      ? mtData.batch_no
      : genericData.batch_no

  const handleSave = () => {
    if (isPlaceholder) return
    setSaving(true)
    try {
      if (typeKey === 'syrup') {
        const envelope = {
          version: 1,
          layoutId: 'syrup-att3-v1',
          productType: 'syrup',
          slipType: 'bulk_release',
          batchNo: syrupData.batch_no || '',
          product: syrupData.product || '',
          savedAt: new Date().toISOString(),
          data: syrupData,
        }
        const storeKey = `cmhp_qc_slip_v1_bulk_release_syrup_${syrupData.batch_no || batchKey}`
        localStorage.setItem(storeKey, JSON.stringify(envelope))
        setFeedback('✅ Syrup Bulk Release Slip saved!')
        if (onSaved) onSaved(envelope)
      } else if (typeKey === 'mother-tincture') {
        const envelope = {
          version: 1,
          layoutId: 'mt-att3-v1',
          productType: 'mother-tincture',
          slipType: 'bulk_release',
          batchNo: mtData.batch_no || '',
          product: mtData.product || '',
          savedAt: new Date().toISOString(),
          data: mtData,
        }
        const storeKey = `cmhp_qc_slip_v1_bulk_release_mother_tincture_${mtData.batch_no || batchKey}`
        localStorage.setItem(storeKey, JSON.stringify(envelope))
        setFeedback('✅ Mother Tincture Bulk Release Slip saved!')
        if (onSaved) onSaved(envelope)
      } else if (typeKey === 'tablet') {
        const envelope = {
          version: 1,
          layoutId: 'tablet-att3-v1',
          productType: 'tablet',
          slipType: 'bulk_release',
          batchNo: tabletData.batch_no || '',
          product: tabletData.product || '',
          savedAt: new Date().toISOString(),
          data: tabletData,
        }
        const storeKey = `cmhp_qc_slip_v1_bulk_release_tablet_${tabletData.batch_no || batchKey}`
        localStorage.setItem(storeKey, JSON.stringify(envelope))
        if (tabletData.batch_no) {
          localStorage.setItem(`${LEGACY_STORAGE_KEY}_${tabletData.batch_no}`, JSON.stringify(tabletData))
        }
        setFeedback('✅ Tablet Bulk Release Slip saved!')
        if (onSaved) onSaved(envelope)
      } else {
        const envelope = {
          version: 1,
          layoutId: 'oil-att3-v1',
          productType: 'oil',
          slipType: 'bulk_release',
          batchNo: genericData.batch_no || '',
          product: genericData.product || '',
          savedAt: new Date().toISOString(),
          data: genericData,
        }
        const storeKey = `cmhp_qc_slip_v1_bulk_release_oil_${genericData.batch_no || batchKey}`
        localStorage.setItem(storeKey, JSON.stringify(envelope))
        localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(genericData))
        if (genericData.batch_no) {
          localStorage.setItem(`${LEGACY_STORAGE_KEY}_${genericData.batch_no}`, JSON.stringify(genericData))
        }
        setFeedback('✅ Slip saved successfully!')
        if (onSaved) onSaved(envelope)
      }
    } catch (e) {
      setFeedback('⚠️ Could not save slip locally.')
    } finally {
      setTimeout(() => setSaving(false), 300)
      setTimeout(() => setFeedback(''), 4000)
    }
  }

  const handleReset = () => {
    if (isPlaceholder) return
    if (window.confirm('Reset all fields to default blank slip?')) {
      if (typeKey === 'syrup') {
        setSyrupData(getInitialSyrupBulkReleaseData({}))
      } else if (typeKey === 'mother-tincture') {
        setMtData(getInitialMotherTinctureBulkReleaseData({}))
      } else if (typeKey === 'tablet') {
        setTabletData(getInitialTabletBulkReleaseData({}))
      } else if (typeKey === 'oil') {
        setGenericData(getInitialOilBulkReleaseData({}))
      } else {
        setGenericData(INITIAL_SLIP_DATA)
      }
      setFeedback('Slip reset to blank.')
      setTimeout(() => setFeedback(''), 3000)
    }
  }

  const handlePrint = async () => {
    if (isPlaceholder) return
    await triggerSlipPrint()
  }

  const handleDownloadPdf = async () => {
    if (!sheetRef.current || isPlaceholder || downloading) return
    setDownloading(true)
    try {
      const fileName = `Attachment3_BulkRelease_${(activeBatchNo || 'slip').replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`
      await downloadSlipPdf(sheetRef.current, fileName)
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
          <span style={{ background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
            {displayName}
          </span>
          {activeBatchNo && (
            <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: 4, fontSize: 11.5, fontWeight: 700 }}>
              Batch: {activeBatchNo}
            </span>
          )}
          {readOnly && (
            <span style={{ background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
              🔒 Completed (View Only)
            </span>
          )}
          {feedback && (
            <span style={{ fontSize: 12.5, fontWeight: 600, color: feedback.startsWith('✅') || feedback.startsWith('⬇️') ? '#16a34a' : '#dc2626' }}>
              {feedback}
            </span>
          )}
        </div>

        <div className="bulk-slip-toolbar-right">
          <Button variant="secondary" size="sm" onClick={handleReset} disabled={isPlaceholder || readOnly}>
            🔄 Blank
          </Button>
          <Button variant="secondary" size="sm" onClick={handlePrint} disabled={isPlaceholder}>
            🖨️ Print
          </Button>
          <Button variant="secondary" size="sm" onClick={handleDownloadPdf} disabled={isPlaceholder || downloading}>
            {downloading ? 'Generating PDF…' : '⬇️ Download PDF'}
          </Button>
          <Button variant="primary" size="sm" onClick={handleSave} disabled={isPlaceholder || saving || readOnly}>
            {saving ? 'Saving…' : '💾 Save Slip'}
          </Button>
        </div>
      </div>

      {/* ── SLIP CONTENT AREA ── */}
      {isPlaceholder ? (
        <QcPlaceholderSlip productType={displayName} slipType="attachment_3" />
      ) : typeKey === 'syrup' ? (
        <div ref={sheetRef} style={{ width: '100%' }}>
          <SyrupBulkReleaseSlip
            data={syrupData}
            onChange={setSyrupData}
            branding={branding}
          />
        </div>
      ) : typeKey === 'mother-tincture' ? (
        <div ref={sheetRef} style={{ width: '100%' }}>
          <MotherTinctureBulkReleaseSlip
            data={mtData}
            onChange={setMtData}
            branding={branding}
          />
        </div>
      ) : typeKey === 'tablet' ? (
        <div ref={sheetRef} style={{ width: '100%' }}>
          <TabletBulkReleaseSlip
            data={tabletData}
            onChange={setTabletData}
            branding={branding}
          />
        </div>
      ) : (
        /* Legacy / Generic Fallback Slip */
        <div className="att3-sheet cmhp-printable-slip" ref={sheetRef}>
          {/* 1. Header Box: Logo at top left, Company centered */}
          <div className="att3-top-box">
            <div className="att3-header-row">
              <div className={`att3-logo-wrap ${branding.isTej ? 'att3-logo-wrap-tej' : ''}`}>
                <img src={branding.isTej ? branding.logoSrc : cmhpLogo} alt="CMHP Logo" className="att3-logo-img" />
              </div>
              <div className="att3-company-title">
                {branding.isTej ? branding.headerName : 'CMHP PRIVATE LIMITED'}
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

          {/* 4. TO DEPARTMENT : | FORM NO.: SOP/QC/03/F-02/00 */}
          <div className="att3-todep-row">
            <div className="att3-todep-left">
              <span className="att3-label" style={{ minWidth: 165 }}>TO DEPARTMENT</span>
              <span style={{ margin: '0 4px', fontWeight: 700 }}>:</span>
              <input
                className="att3-input att3-input-line"
                style={{ flex: 1 }}
                value={genericData.to_department}
                placeholder=""
                onChange={(e) => updateGeneric('to_department', e.target.value)}
              />
            </div>
            <div className="att3-todep-right">
              <span>FORM NO.: SOP/QC/03/F-02/00</span>
            </div>
          </div>

          {/* 5. PRODUCT : | T.R. No.: */}
          <div className="att3-open-row">
            <span className="att3-label" style={{ minWidth: 165 }}>PRODUCT</span>
            <span style={{ margin: '0 4px', fontWeight: 700 }}>:</span>
            <input
              className="att3-input att3-input-line"
              style={{ flex: 1, marginRight: 20 }}
              value={genericData.product}
              placeholder=""
              onChange={(e) => updateGeneric('product', e.target.value)}
            />
            <span className="att3-label">T.R. No.:</span>
            <input
              className="att3-input att3-input-line"
              style={{ width: 140 }}
              value={genericData.tr_no}
              placeholder=""
              onChange={(e) => updateGeneric('tr_no', e.target.value)}
            />
          </div>

          {/* 6. BATCH NO. : */}
          <div className="att3-open-row">
            <span className="att3-label" style={{ minWidth: 165 }}>BATCH NO.</span>
            <span style={{ margin: '0 4px', fontWeight: 700 }}>:</span>
            <input
              className="att3-input att3-input-line"
              style={{ flex: 1 }}
              value={genericData.batch_no}
              placeholder=""
              onChange={(e) => updateGeneric('batch_no', e.target.value)}
            />
          </div>

          {/* 7. MFG. DATE : | EXP. DATE/BEST BEFORE : ___ Years */}
          <div className="att3-open-row">
            <span className="att3-label" style={{ minWidth: 165 }}>MFG. DATE</span>
            <span style={{ margin: '0 4px', fontWeight: 700 }}>:</span>
            <input
              className="att3-input att3-input-line"
              style={{ flex: 1, marginRight: 20 }}
              value={genericData.mfg_date}
              placeholder=""
              onChange={(e) => updateGeneric('mfg_date', e.target.value)}
            />
            <span className="att3-label">EXP. DATE/BEST BEFORE :</span>
            <input
              className="att3-input att3-input-line"
              style={{ width: 55, textAlign: 'center', marginLeft: 4 }}
              value={genericData.exp_years}
              placeholder=""
              onChange={(e) => updateGeneric('exp_years', e.target.value)}
            />
            <span style={{ marginLeft: 6, fontWeight: 700 }}>Years</span>
          </div>

          {/* 8. BATCH SIZE : | NO. OF BOTTLES : */}
          <div className="att3-open-row">
            <span className="att3-label" style={{ minWidth: 165 }}>BATCH SIZE</span>
            <span style={{ margin: '0 4px', fontWeight: 700 }}>:</span>
            <input
              className="att3-input att3-input-line"
              style={{ flex: 1, marginRight: 20 }}
              value={genericData.batch_size}
              placeholder=""
              onChange={(e) => updateGeneric('batch_size', e.target.value)}
            />
            <span className="att3-label">NO. OF BOTTLES &nbsp;:</span>
            <input
              className="att3-input att3-input-line"
              style={{ width: 140, marginLeft: 4 }}
              value={genericData.no_of_bottles}
              placeholder=""
              onChange={(e) => updateGeneric('no_of_bottles', e.target.value)}
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
                  value={genericData.appearance_obs}
                  placeholder=""
                  onChange={(e) => updateGeneric('appearance_obs', e.target.value)}
                />
              </div>
              <div className="att3-test-limit-wrap">
                <span className="att3-limit-label">(Limit:</span>
                <input
                  className="att3-input att3-input-line"
                  style={{ width: 220, textAlign: 'center' }}
                  value={genericData.appearance_limit}
                  placeholder=""
                  onChange={(e) => updateGeneric('appearance_limit', e.target.value)}
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
                  value={genericData.odor_obs}
                  placeholder=""
                  onChange={(e) => updateGeneric('odor_obs', e.target.value)}
                />
              </div>
              <div className="att3-test-limit-wrap">
                <span className="att3-limit-label">(Limit:</span>
                <input
                  className="att3-input att3-input-line"
                  style={{ width: 220, textAlign: 'center' }}
                  value={genericData.odor_limit}
                  placeholder=""
                  onChange={(e) => updateGeneric('odor_limit', e.target.value)}
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
                  value={genericData.wt_ml_obs}
                  placeholder=""
                  onChange={(e) => updateGeneric('wt_ml_obs', e.target.value)}
                />
              </div>
              <div className="att3-test-limit-wrap">
                <span className="att3-limit-label">(Limit:</span>
                <input
                  className="att3-input att3-input-line"
                  style={{ width: 75, textAlign: 'center' }}
                  value={genericData.wt_ml_low}
                  placeholder=""
                  onChange={(e) => updateGeneric('wt_ml_low', e.target.value)}
                />
                <span style={{ margin: '0 8px', fontWeight: 700 }}>to</span>
                <input
                  className="att3-input att3-input-line"
                  style={{ width: 75, textAlign: 'center' }}
                  value={genericData.wt_ml_high}
                  placeholder=""
                  onChange={(e) => updateGeneric('wt_ml_high', e.target.value)}
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
                  value={genericData.viscosity_obs}
                  placeholder=""
                  onChange={(e) => updateGeneric('viscosity_obs', e.target.value)}
                />
              </div>
              <div className="att3-test-limit-wrap">
                <span className="att3-limit-label">(Limit:</span>
                <input
                  className="att3-input att3-input-line"
                  style={{ width: 75, textAlign: 'center' }}
                  value={genericData.viscosity_low}
                  placeholder=""
                  onChange={(e) => updateGeneric('viscosity_low', e.target.value)}
                />
                <span style={{ margin: '0 8px', fontWeight: 700 }}>to</span>
                <input
                  className="att3-input att3-input-line"
                  style={{ width: 75, textAlign: 'center' }}
                  value={genericData.viscosity_high}
                  placeholder=""
                  onChange={(e) => updateGeneric('viscosity_high', e.target.value)}
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
                  value={genericData.acid_value_obs}
                  placeholder=""
                  onChange={(e) => updateGeneric('acid_value_obs', e.target.value)}
                />
              </div>
              <div className="att3-test-limit-wrap">
                <span className="att3-limit-label">(Limit:</span>
                <input
                  className="att3-input att3-input-line"
                  style={{ width: 75, textAlign: 'center' }}
                  value={genericData.acid_value_low}
                  placeholder=""
                  onChange={(e) => updateGeneric('acid_value_low', e.target.value)}
                />
                <span style={{ margin: '0 8px', fontWeight: 700 }}>to</span>
                <input
                  className="att3-input att3-input-line"
                  style={{ width: 75, textAlign: 'center' }}
                  value={genericData.acid_value_high}
                  placeholder=""
                  onChange={(e) => updateGeneric('acid_value_high', e.target.value)}
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
                  value={genericData.peroxide_value_obs}
                  placeholder=""
                  onChange={(e) => updateGeneric('peroxide_value_obs', e.target.value)}
                />
              </div>
              <div className="att3-test-limit-wrap">
                <span className="att3-limit-label">(Limit:</span>
                <input
                  className="att3-input att3-input-line"
                  style={{ width: 75, textAlign: 'center' }}
                  value={genericData.peroxide_value_low}
                  placeholder=""
                  onChange={(e) => updateGeneric('peroxide_value_low', e.target.value)}
                />
                <span style={{ margin: '0 8px', fontWeight: 700 }}>to</span>
                <input
                  className="att3-input att3-input-line"
                  style={{ width: 75, textAlign: 'center' }}
                  value={genericData.peroxide_value_high}
                  placeholder=""
                  onChange={(e) => updateGeneric('peroxide_value_high', e.target.value)}
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
                  value={genericData.iodine_value_obs}
                  placeholder=""
                  onChange={(e) => updateGeneric('iodine_value_obs', e.target.value)}
                />
              </div>
              <div className="att3-test-limit-wrap">
                <span className="att3-limit-label">(Limit:</span>
                <input
                  className="att3-input att3-input-line"
                  style={{ width: 75, textAlign: 'center' }}
                  value={genericData.iodine_value_low}
                  placeholder=""
                  onChange={(e) => updateGeneric('iodine_value_low', e.target.value)}
                />
                <span style={{ margin: '0 8px', fontWeight: 700 }}>to</span>
                <input
                  className="att3-input att3-input-line"
                  style={{ width: 75, textAlign: 'center' }}
                  value={genericData.iodine_value_high}
                  placeholder=""
                  onChange={(e) => updateGeneric('iodine_value_high', e.target.value)}
                />
                <span style={{ marginLeft: 8 }}>)</span>
              </div>
            </div>

            {/* 8. Saponification Value */}
            <div className="att3-test-item">
              <span className="att3-test-name">• Saponification Value:</span>
              <div className="att3-test-obs-wrap">
                <input
                  className="att3-input att3-input-line"
                  style={{ width: '90%' }}
                  value={genericData.saponification_obs}
                  placeholder=""
                  onChange={(e) => updateGeneric('saponification_obs', e.target.value)}
                />
              </div>
              <div className="att3-test-limit-wrap">
                <span className="att3-limit-label">(Limit:</span>
                <input
                  className="att3-input att3-input-line"
                  style={{ width: 75, textAlign: 'center' }}
                  value={genericData.saponification_low}
                  placeholder=""
                  onChange={(e) => updateGeneric('saponification_low', e.target.value)}
                />
                <span style={{ margin: '0 8px', fontWeight: 700 }}>to</span>
                <input
                  className="att3-input att3-input-line"
                  style={{ width: 75, textAlign: 'center' }}
                  value={genericData.saponification_high}
                  placeholder=""
                  onChange={(e) => updateGeneric('saponification_high', e.target.value)}
                />
                <span style={{ marginLeft: 8 }}>)</span>
              </div>
            </div>
          </div>

          {/* 10. SIGN QC / RECEIVED QA */}
          <div className="att3-sign-row-1">
            <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
              <span className="att3-label" style={{ minWidth: 165 }}>Sign By / Date (QC) &nbsp; :</span>
              <input
                className="att3-input att3-input-line"
                style={{ flex: 1, marginRight: 20 }}
                value={genericData.sign_qc}
                placeholder=""
                onChange={(e) => updateGeneric('sign_qc', e.target.value)}
              />
            </div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
              <span className="att3-label">Recieved By / Date (QA) &nbsp; &nbsp; &nbsp; &nbsp; :</span>
              <input
                className="att3-input att3-input-line"
                style={{ flex: 1, marginLeft: 4 }}
                value={genericData.received_qa}
                placeholder=""
                onChange={(e) => updateGeneric('received_qa', e.target.value)}
              />
            </div>
          </div>

          {/* 11. STATUS DECLARATION ROW */}
          <div className="att3-status-row">
            <span>Status : The above batch of Bulk sample is released for filling / compression.</span>
          </div>

          {/* 12. SIGN QA / RECEIVED PRODUCTION */}
          <div className="att3-sign-row-2">
            <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
              <span className="att3-label" style={{ minWidth: 165 }}>Sign By./ Date (QA) :</span>
              <input
                className="att3-input att3-input-line"
                style={{ flex: 1, marginRight: 20 }}
                value={genericData.sign_qa}
                placeholder=""
                onChange={(e) => updateGeneric('sign_qa', e.target.value)}
              />
            </div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
              <span className="att3-label">Received By / Date ( Production)</span>
              <input
                className="att3-input att3-input-line"
                style={{ flex: 1, marginLeft: 4 }}
                value={genericData.received_production}
                placeholder=""
                onChange={(e) => updateGeneric('received_production', e.target.value)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
