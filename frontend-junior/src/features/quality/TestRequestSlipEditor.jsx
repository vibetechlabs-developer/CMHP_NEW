/**
 * Attachment-2 / Attachment-5: TEST REQUEST SLIP Editor
 * Product-type aware: Tablet uses new Tablet layout (Attachment-2 Bulk or Attachment-5 FP).
 * Switch between "Bulk (Attachment-2) | FP / MT (Attachment-5)" inside this tab.
 * Two identical copies stacked on one A4 page in Print and PDF.
 */
import { useState, useEffect, useRef, useMemo } from 'react'
import cmhpLogo from '../../assets/cmhp_invoice_logo.png'
import { getCompanyBranding } from '../../utils/companyBranding.js'
import Button from '../../components/Button'
import { resolveQcSlip } from '../formulas/slips/slipRegistry'
import TabletTestRequestBulkSlip, { getInitialTabletTestRequestBulkData } from './slips/TabletTestRequestBulkSlip'
import TabletTestRequestFpSlip, { getInitialTabletTestRequestFpData } from './slips/TabletTestRequestFpSlip'
import SyrupTestRequestBulkSlip, { getInitialSyrupTestRequestBulkData } from './slips/SyrupTestRequestBulkSlip'
import OilTestRequestBulkSlip, { getInitialOilTestRequestBulkData } from './slips/OilTestRequestBulkSlip'
import MotherTinctureTestRequestBeforeFilterSlip, { getInitialMotherTinctureTrBeforeFilterData } from './slips/MotherTinctureTestRequestBeforeFilterSlip'
import MotherTinctureTestRequestAfterFilterSlip, { getInitialMotherTinctureTrAfterFilterData } from './slips/MotherTinctureTestRequestAfterFilterSlip'
import QcPlaceholderSlip from './slips/QcPlaceholderSlip'
import { triggerSlipPrint, downloadSlipPdf } from '../../utils/slipPrintService'
import './TestRequestSlip.css'
import './slips/TabletQcSlip.css'

const LEGACY_STORAGE_KEY = 'cmhp_test_request_slips_v1'

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

/* ── Generic / Oil Single Copy Table ── */
function GenericSheetTable({ data, update, copyIndex, branding }) {
  const F = ({ field, style = {} }) =>
    copyIndex === 0 ? (
      <input
        className="trs-cell-input"
        style={style}
        value={data[field] || ''}
        onChange={(e) => update(field, e.target.value)}
      />
    ) : (
      <span className="trs-cell-mirror" style={style}>
        {data[field] || ''}
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
              <div className={`trs-logo-wrap ${branding?.isTej ? 'trs-logo-wrap-tej' : ''}`}>
                <img src={branding?.isTej ? branding.logoSrc : cmhpLogo} alt="Logo" className="trs-logo-img" />
              </div>
              <div className="trs-company-title">{branding?.isTej ? branding.headerName : 'CMHP PRIVATE LIMITED'}</div>
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
          <td colSpan={4} className="trs-center-cell trs-bold" style={{ padding: '6px 10px', fontSize: '12pt', letterSpacing: '1px', borderBottom: 'none' }}>
            BULK
          </td>
        </tr>

      </tbody>
    </table>
  )
}

/* ── Main Editor Component ── */
export default function TestRequestSlipEditor({
  initialData = null,
  productType = 'tablet',
  onSaved = null,
  readOnly = false,
}) {
  const branding = getCompanyBranding(initialData)

  const [variant, setVariant] = useState('bulk')

  const slipKind = variant === 'fp' ? 'testRequestFp' : 'testRequestBulk'
  const resolved = useMemo(() => resolveQcSlip(slipKind, productType), [slipKind, productType])
  const { typeKey, displayName, isImplemented, isGenericOil } = resolved
  const isPlaceholder = !isImplemented && !isGenericOil

  const batchKey = initialData?.batch_no || initialData?.id || 'default'

  // Load saved Tablet Bulk data
  const loadTabletBulkData = () => {
    try {
      const specificKey = `cmhp_qc_slip_v1_test_request_bulk_tablet_${batchKey}`
      const saved = localStorage.getItem(specificKey)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed?.data) return parsed.data
      }
      if (initialData?.batch_no) {
        const legacy = localStorage.getItem(`${LEGACY_STORAGE_KEY}_${initialData.batch_no}`)
        if (legacy) return getInitialTabletTestRequestBulkData(JSON.parse(legacy))
      }
    } catch {}
    return getInitialTabletTestRequestBulkData(initialData || {})
  }

  // Load saved Tablet FP data
  const loadTabletFpData = () => {
    try {
      const specificKey = `cmhp_qc_slip_v1_test_request_fp_tablet_${batchKey}`
      const saved = localStorage.getItem(specificKey)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed?.data) return parsed.data
      }
    } catch {}
    return getInitialTabletTestRequestFpData(initialData || {})
  }

  // Load saved Syrup Bulk data
  const loadSyrupBulkData = () => {
    try {
      const specificKey = `cmhp_qc_slip_v1_test_request_bulk_syrup_${batchKey}`
      const saved = localStorage.getItem(specificKey)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed?.data) return parsed.data
      }
    } catch {}
    return getInitialSyrupTestRequestBulkData(initialData || {})
  }

  // Load saved Mother Tincture Before Filter data
  const loadMtBeforeData = () => {
    try {
      const specificKey = `cmhp_qc_slip_v1_test_request_mt_before_filter_${batchKey}`
      const saved = localStorage.getItem(specificKey)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed?.data) return parsed.data
      }
    } catch {}
    return getInitialMotherTinctureTrBeforeFilterData(initialData || {})
  }

  // Load saved Mother Tincture After Filter data
  const loadMtAfterData = () => {
    try {
      const specificKey = `cmhp_qc_slip_v1_test_request_mt_after_filter_${batchKey}`
      const saved = localStorage.getItem(specificKey)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed?.data) return parsed.data
      }
    } catch {}
    return getInitialMotherTinctureTrAfterFilterData(initialData || {})
  }

  // Load Oil Bulk data
  const loadOilBulkData = () => {
    try {
      const specificKey = `cmhp_qc_slip_v1_test_request_bulk_oil_${batchKey}`
      const saved = localStorage.getItem(specificKey)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed?.data) return parsed.data
      }
      if (initialData?.batch_no) {
        const legacy = localStorage.getItem(`${LEGACY_STORAGE_KEY}_${initialData.batch_no}`)
        if (legacy) return getInitialOilTestRequestBulkData(JSON.parse(legacy))
      }
      const genericSaved = localStorage.getItem(LEGACY_STORAGE_KEY)
      if (genericSaved) return getInitialOilTestRequestBulkData(JSON.parse(genericSaved))
    } catch {}
    return getInitialOilTestRequestBulkData(initialData || {})
  }

  // Load generic fallback data
  const loadGenericData = () => {
    try {
      if (initialData?.batch_no) {
        const legacy = localStorage.getItem(`${LEGACY_STORAGE_KEY}_${initialData.batch_no}`)
        if (legacy) return JSON.parse(legacy)
      }
      const genericSaved = localStorage.getItem(LEGACY_STORAGE_KEY)
      if (genericSaved) return JSON.parse(genericSaved)
    } catch {}
    return { ...INITIAL_TR_DATA, ...(initialData || {}) }
  }

  const [tabletBulkData, setTabletBulkData] = useState(loadTabletBulkData)
  const [tabletFpData, setTabletFpData] = useState(loadTabletFpData)
  const [syrupBulkData, setSyrupBulkData] = useState(loadSyrupBulkData)
  const [oilBulkData, setOilBulkData] = useState(loadOilBulkData)
  const [mtBeforeData, setMtBeforeData] = useState(loadMtBeforeData)
  const [mtAfterData, setMtAfterData] = useState(loadMtAfterData)
  const [genericData, setGenericData] = useState(loadGenericData)

  const [saving, setSaving] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [feedback, setFeedback] = useState('')
  const sheetRef = useRef(null)

  // Re-sync when batch or productType or initialData changes
  useEffect(() => {
    setTabletBulkData(loadTabletBulkData())
    setTabletFpData(loadTabletFpData())
    setSyrupBulkData(loadSyrupBulkData())
    setOilBulkData(loadOilBulkData())
    setMtBeforeData(loadMtBeforeData())
    setMtAfterData(loadMtAfterData())
    setGenericData(loadGenericData())
  }, [batchKey, productType, initialData])

  const updateGeneric = (field, val) => setGenericData((prev) => ({ ...prev, [field]: val }))

  const activeBatchNo =
    typeKey === 'syrup'
      ? syrupBulkData.batch_no
      : typeKey === 'tablet'
      ? variant === 'bulk'
        ? tabletBulkData.batch_no
        : tabletFpData.batch_no
      : typeKey === 'mother-tincture'
      ? variant === 'bulk'
        ? mtBeforeData.batch_no
        : mtAfterData.batch_no
      : typeKey === 'oil'
      ? oilBulkData.batch_no
      : genericData.batch_no

  const handleSave = () => {
    if (isPlaceholder) return
    setSaving(true)
    try {
      if (typeKey === 'syrup') {
        if (variant === 'bulk') {
          const envelope = {
            version: 1,
            layoutId: 'syrup-att2-v1',
            productType: 'syrup',
            slipType: 'test_request_bulk',
            batchNo: syrupBulkData.batch_no || '',
            product: syrupBulkData.product || '',
            savedAt: new Date().toISOString(),
            data: syrupBulkData,
          }
          const storeKey = `cmhp_qc_slip_v1_test_request_bulk_syrup_${syrupBulkData.batch_no || batchKey}`
          localStorage.setItem(storeKey, JSON.stringify(envelope))
          setFeedback('✅ Syrup Test Request (Bulk) saved!')
          if (onSaved) onSaved(envelope)
        }
      } else if (typeKey === 'mother-tincture') {
        if (variant === 'bulk') {
          const envelope = {
            version: 1,
            layoutId: 'mt-att2-v1',
            productType: 'mother-tincture',
            slipType: 'test_request_mt_before',
            subKind: 'before_filter',
            batchNo: mtBeforeData.batch_no || '',
            product: mtBeforeData.product || '',
            savedAt: new Date().toISOString(),
            data: mtBeforeData,
          }
          const storeKey = `cmhp_qc_slip_v1_test_request_mt_before_filter_${mtBeforeData.batch_no || batchKey}`
          localStorage.setItem(storeKey, JSON.stringify(envelope))
          setFeedback('✅ Mother Tincture Test Request (Before Filter) saved!')
          if (onSaved) onSaved(envelope)
        } else {
          const envelope = {
            version: 1,
            layoutId: 'mt-att4-v1',
            productType: 'mother-tincture',
            slipType: 'test_request_mt_after',
            subKind: 'after_filter',
            batchNo: mtAfterData.batch_no || '',
            product: mtAfterData.product || '',
            savedAt: new Date().toISOString(),
            data: mtAfterData,
          }
          const storeKey = `cmhp_qc_slip_v1_test_request_mt_after_filter_${mtAfterData.batch_no || batchKey}`
          localStorage.setItem(storeKey, JSON.stringify(envelope))
          setFeedback('✅ Mother Tincture Test Request (After Filter) saved!')
          if (onSaved) onSaved(envelope)
        }
      } else if (typeKey === 'tablet') {
        if (variant === 'bulk') {
          const envelope = {
            version: 1,
            layoutId: 'tablet-att2-v1',
            productType: 'tablet',
            slipType: 'test_request_bulk',
            batchNo: tabletBulkData.batch_no || '',
            product: tabletBulkData.product || '',
            savedAt: new Date().toISOString(),
            data: tabletBulkData,
          }
          const storeKey = `cmhp_qc_slip_v1_test_request_bulk_tablet_${tabletBulkData.batch_no || batchKey}`
          localStorage.setItem(storeKey, JSON.stringify(envelope))
          if (tabletBulkData.batch_no) {
            localStorage.setItem(`${LEGACY_STORAGE_KEY}_${tabletBulkData.batch_no}`, JSON.stringify(tabletBulkData))
          }
          setFeedback('✅ Tablet Test Request (Bulk) saved!')
          if (onSaved) onSaved(envelope)
        } else {
          const envelope = {
            version: 1,
            layoutId: 'tablet-att5-v1',
            productType: 'tablet',
            slipType: 'test_request_fp',
            batchNo: tabletFpData.batch_no || '',
            product: tabletFpData.product || '',
            savedAt: new Date().toISOString(),
            data: tabletFpData,
          }
          const storeKey = `cmhp_qc_slip_v1_test_request_fp_tablet_${tabletFpData.batch_no || batchKey}`
          localStorage.setItem(storeKey, JSON.stringify(envelope))
          setFeedback('✅ Tablet Test Request (FP) saved!')
          if (onSaved) onSaved(envelope)
        }
      } else if (typeKey === 'oil') {
        if (variant === 'bulk') {
          const envelope = {
            version: 1,
            layoutId: 'oil-att2-v1',
            productType: 'oil',
            slipType: 'test_request_bulk',
            batchNo: oilBulkData.batch_no || '',
            product: oilBulkData.product || '',
            savedAt: new Date().toISOString(),
            data: oilBulkData,
          }
          const storeKey = `cmhp_qc_slip_v1_test_request_bulk_oil_${oilBulkData.batch_no || batchKey}`
          localStorage.setItem(storeKey, JSON.stringify(envelope))
          localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(oilBulkData))
          if (oilBulkData.batch_no) {
            localStorage.setItem(`${LEGACY_STORAGE_KEY}_${oilBulkData.batch_no}`, JSON.stringify(oilBulkData))
          }
          setFeedback('✅ Oil Test Request (Bulk) saved!')
          if (onSaved) onSaved(envelope)
        }
      } else {
        const envelope = {
          version: 1,
          layoutId: 'generic-att2-v1',
          productType: typeKey,
          slipType: variant === 'fp' ? 'test_request_fp' : 'test_request_bulk',
          batchNo: genericData.batch_no || '',
          product: genericData.product || '',
          savedAt: new Date().toISOString(),
          data: genericData,
        }
        const storeKey = `cmhp_qc_slip_v1_test_request_${variant}_${typeKey}_${genericData.batch_no || batchKey}`
        localStorage.setItem(storeKey, JSON.stringify(envelope))
        setFeedback('✅ Test Request saved!')
        if (onSaved) onSaved(envelope)
      }
    } catch {
      setFeedback('⚠️ Could not save.')
    } finally {
      setTimeout(() => setSaving(false), 300)
      setTimeout(() => setFeedback(''), 4000)
    }
  }

  const handleReset = () => {
    if (isPlaceholder) return
    if (window.confirm('Reset all fields to blank?')) {
      if (typeKey === 'syrup') {
        if (variant === 'bulk') {
          setSyrupBulkData(getInitialSyrupTestRequestBulkData({}))
        }
      } else if (typeKey === 'mother-tincture') {
        if (variant === 'bulk') {
          setMtBeforeData(getInitialMotherTinctureTrBeforeFilterData({}))
        } else {
          setMtAfterData(getInitialMotherTinctureTrAfterFilterData({}))
        }
      } else if (typeKey === 'tablet') {
        if (variant === 'bulk') {
          setTabletBulkData(getInitialTabletTestRequestBulkData({}))
        } else {
          setTabletFpData(getInitialTabletTestRequestFpData({}))
        }
      } else if (typeKey === 'oil') {
        if (variant === 'bulk') {
          setOilBulkData(getInitialOilTestRequestBulkData({}))
        }
      } else {
        setGenericData(INITIAL_TR_DATA)
      }
      setFeedback('Reset to blank.')
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
      const attPrefix =
        typeKey === 'mother-tincture'
          ? variant === 'fp'
            ? 'Attachment4_TestRequest_AfterFilter'
            : 'Attachment2_TestRequest_BeforeFilter'
          : variant === 'fp'
          ? 'Attachment5_TestRequest_FP'
          : 'Attachment2_TestRequest_Bulk'
      const fileName = `${attPrefix}_${(activeBatchNo || 'slip').replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`
      await downloadSlipPdf(sheetRef.current, fileName)
      setFeedback(`⬇️ PDF downloaded: ${fileName}`)
      setTimeout(() => setFeedback(''), 4000)
    } catch (err) {
      console.error(err)
      alert('Could not generate PDF. Please try Print -> Save as PDF.')
    } finally {
      setDownloading(false)
    }
  }

  const slipTitle =
    typeKey === 'mother-tincture'
      ? variant === 'fp'
        ? 'Attachment-4 : TEST REQUEST FOR BULK AFTER FILTER'
        : 'Attachment-2 : TEST REQUEST FOR BULK BEFORE FILTER'
      : variant === 'fp'
      ? 'Attachment-5 : TEST REQUEST (MT/FP)'
      : 'Attachment-2 : TEST REQUEST (BULK)'

  return (
    <div className="test-req-wrapper">
      {/* ── TOOLBAR ── */}
      <div className="test-req-toolbar no-print">
        <div className="test-req-toolbar-left">
          <span style={{ fontWeight: 700, color: '#0f172a', fontSize: 13.5 }}>
            {slipTitle}
          </span>
          <span style={{ background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
            {displayName}
          </span>

          {/* Switch options: For Mother Tincture show Before Filter (Attachment-2) and After Filter (Attachment-4) */}
          <div style={{ display: 'inline-flex', alignItems: 'center', background: '#f1f5f9', padding: '2px', borderRadius: 6, border: '1px solid #cbd5e1', marginLeft: 8 }}>
            <button
              type="button"
              onClick={() => setVariant('bulk')}
              style={{
                fontSize: 12,
                fontWeight: variant === 'bulk' ? 700 : 500,
                padding: '4px 10px',
                border: 'none',
                borderRadius: 4,
                background: variant === 'bulk' ? '#ffffff' : 'transparent',
                color: variant === 'bulk' ? '#0f172a' : '#64748b',
                boxShadow: variant === 'bulk' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                cursor: 'pointer',
              }}
            >
              {typeKey === 'mother-tincture' ? 'Before Filter (Attachment-2)' : 'Bulk (Attachment-2)'}
            </button>
            <button
              type="button"
              onClick={() => setVariant('fp')}
              style={{
                fontSize: 12,
                fontWeight: variant === 'fp' ? 700 : 500,
                padding: '4px 10px',
                border: 'none',
                borderRadius: 4,
                background: variant === 'fp' ? '#ffffff' : 'transparent',
                color: variant === 'fp' ? '#0f172a' : '#64748b',
                boxShadow: variant === 'fp' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                cursor: 'pointer',
              }}
            >
              {typeKey === 'mother-tincture' ? 'After Filter (Attachment-4)' : 'FP / MT (Attachment-5)'}
            </button>
          </div>

          {activeBatchNo && (
            <span style={{ background: '#fef9c3', color: '#854d0e', padding: '2px 8px', borderRadius: 4, fontSize: 11.5, fontWeight: 700 }}>
              Batch: {activeBatchNo}
            </span>
          )}
          {readOnly && (
            <span style={{ background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
              🔒 Completed (View Only)
            </span>
          )}
          {feedback && (
            <span style={{ fontSize: 12, fontWeight: 600, color: feedback.startsWith('✅') || feedback.startsWith('⬇️') ? '#16a34a' : '#dc2626' }}>
              {feedback}
            </span>
          )}
        </div>

        <div className="test-req-toolbar-right">
          <Button size="sm" variant="secondary" onClick={handleReset} disabled={isPlaceholder || readOnly}>
            🔄 Blank
          </Button>
          <Button size="sm" variant="secondary" onClick={handlePrint} disabled={isPlaceholder}>
            🖨️ Print
          </Button>
          <Button size="sm" variant="secondary" onClick={handleDownloadPdf} disabled={isPlaceholder || downloading}>
            {downloading ? '⏳ Generating…' : '⬇️ Download PDF'}
          </Button>
          <Button size="sm" variant="primary" onClick={handleSave} disabled={isPlaceholder || saving || readOnly}>
            {saving ? '⏳ Saving…' : '💾 Save Slip'}
          </Button>
        </div>
      </div>

      {/* ── SLIP CONTENT AREA ── */}
      {isPlaceholder ? (
        <QcPlaceholderSlip
          productType={displayName}
          slipType={variant === 'fp' ? 'attachment_5' : 'attachment_2'}
          customMessage={resolved?.config?.customMessage || ''}
        />
      ) : typeKey === 'mother-tincture' ? (
        <div ref={sheetRef} style={{ width: '100%' }}>
          {variant === 'bulk' ? (
            <MotherTinctureTestRequestBeforeFilterSlip
              data={mtBeforeData}
              onChange={setMtBeforeData}
              branding={branding}
            />
          ) : (
            <MotherTinctureTestRequestAfterFilterSlip
              data={mtAfterData}
              onChange={setMtAfterData}
              branding={branding}
            />
          )}
        </div>
      ) : typeKey === 'syrup' ? (
        <div ref={sheetRef} style={{ width: '100%' }}>
          <SyrupTestRequestBulkSlip
            data={syrupBulkData}
            onChange={setSyrupBulkData}
            branding={branding}
          />
        </div>
      ) : typeKey === 'tablet' ? (
        <div ref={sheetRef} style={{ width: '100%' }}>
          {variant === 'bulk' ? (
            <TabletTestRequestBulkSlip
              data={tabletBulkData}
              onChange={setTabletBulkData}
              branding={branding}
            />
          ) : (
            <TabletTestRequestFpSlip
              data={tabletFpData}
              onChange={setTabletFpData}
              branding={branding}
            />
          )}
        </div>
      ) : (
        /* Legacy / Generic Fallback Slip (Two copies) - used for Oil and generic types */
        <div className="test-req-page cmhp-printable-slip" ref={sheetRef}>
          {/* Copy 1 — Editable */}
          <div className="test-req-sheet">
            <GenericSheetTable
              data={typeKey === 'oil' ? oilBulkData : genericData}
              update={typeKey === 'oil' ? ((f, v) => setOilBulkData((p) => ({ ...p, [f]: v }))) : updateGeneric}
              copyIndex={0}
              branding={branding}
            />
          </div>

          {/* Gap between copies */}
          <div className="trs-copy-gap" />

          {/* Copy 2 — Mirror */}
          <div className="test-req-sheet">
            <GenericSheetTable
              data={typeKey === 'oil' ? oilBulkData : genericData}
              update={typeKey === 'oil' ? ((f, v) => setOilBulkData((p) => ({ ...p, [f]: v }))) : updateGeneric}
              copyIndex={1}
              branding={branding}
            />
          </div>
        </div>
      )}
    </div>
  )
}
