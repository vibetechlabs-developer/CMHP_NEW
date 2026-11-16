import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { saveOrderQc } from '../../store/erpSlice'
import { selectActiveCompanyKey } from '../../utils/companySelectors'
import { formatDateDDMMYYYY, toIsoDate } from '../production/bmrDateUtils'
import cmhpLogo from '../../assets/cmhp_bmr_logo.png'
import { getCompanyBranding, isTejBiocare } from '../../utils/companyBranding.js'
import './QcViewPage.css'
import './QcTabletView.css'

const DEFAULT_TABLET_TEST_PARAMETERS = [
  { sr: '1.', param: 'Description', result: '', limit: '' },
  { sr: '2.', param: 'Average Weight of Tablet', result: '', limit: '' },
  { sr: '3.', param: 'Weight of 20 Tablets', result: '', limit: '' },
  { sr: '4.', param: 'Diameter', result: '', limit: '' },
  { sr: '5.', param: 'Thickness', result: '', limit: '' },
  { sr: '6.', param: 'Loss on Drying', result: '', limit: '' },
  { sr: '7.', param: 'Total Ash', result: '', limit: '' },
  { sr: '8.', param: 'Total Weight / Number of Tablets in Finished Product', result: '', limit: '' },
]

const DEFAULT_TABLET_LABEL_CLAIM_ROWS = Array.from({ length: 7 }, (_, i) => ({
  sr: String(i + 1),
  content: '',
  potency: '',
  result: '',
}))

/**
 * Standardized Date Field matching BmrDateField and Oil CoA:
 * Display DD/MM/YYYY text + calendar picker icon on screen;
 * Clean unbordered text in print preview / PDF.
 */
function QcDateField({
  value,
  onChange,
  className = 'qc-cell-input',
  style,
  placeholder = 'DD/MM/YYYY',
  readOnly = false,
  disabled = false,
  ...props
}) {
  const hiddenInputRef = useRef(null)
  const displayVal = formatDateDDMMYYYY(value)

  const handleDisplayChange = (e) => {
    const raw = e.target.value
    if (!raw.trim()) {
      onChange({ target: { value: '' } })
      return
    }
    const parts = raw.split('/')
    if (parts.length === 3 && parts[2].length === 4) {
      const d = parts[0].padStart(2, '0')
      const m = parts[1].padStart(2, '0')
      const y = parts[2]
      onChange({ target: { value: `${y}-${m}-${d}` } })
    } else {
      onChange({ target: { value: raw } })
    }
  }

  const openCalendar = (e) => {
    e.stopPropagation()
    if (hiddenInputRef.current && !readOnly && !disabled) {
      if (typeof hiddenInputRef.current.showPicker === 'function') {
        hiddenInputRef.current.showPicker()
      } else {
        hiddenInputRef.current.click()
      }
    }
  }

  return (
    <div className="qc-date-wrap">
      <input
        type="text"
        className={`${className} qc-date-display no-print`}
        value={displayVal}
        placeholder={placeholder}
        onChange={handleDisplayChange}
        onClick={openCalendar}
        readOnly={readOnly}
        disabled={disabled}
        style={{
          ...style,
          width: '100%',
          paddingRight: '14px',
          boxSizing: 'border-box',
        }}
        {...props}
      />
      <span
        className="qc-date-picker-icon no-print"
        title="Choose date"
        onClick={openCalendar}
      >
        📅
      </span>
      <input
        ref={hiddenInputRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        className="no-print"
        style={{
          position: 'absolute',
          opacity: 0,
          width: 0,
          height: 0,
          pointerEvents: 'none',
          bottom: 0,
          left: 0,
        }}
        value={toIsoDate(value)}
        onChange={(e) => {
          onChange({ target: { value: e.target.value } })
        }}
      />
      <span className="qc-date-print-value print-only">
        {displayVal || ''}
      </span>
    </div>
  )
}

export default function QcTabletView({ 
  orderId: propOrderId,
  currentOrder: propOrder,
  currentProduct: propProduct,
  currentBmr: propBmr,
  dosageForm: propDosageForm, onBack }) {
  const params = useParams()
  const orderId = propOrderId || params.orderId
  const navigate = useNavigate()
  const dispatch = useDispatch()

  const compKey = useSelector(selectActiveCompanyKey)
  const reduxOrders = useSelector((state) => state.erp.byCompany?.[compKey]?.orders || state.erp.orders || [])
  const reduxProducts = useSelector((state) => [
    ...(state.erp.products || []),
    ...(state.erp.commonProducts || []),
    ...(state.erp.byCompany?.[compKey]?.products || []),
  ])
  const reduxBmrs = useSelector((state) => state.erp.bmrs || {})
  const reduxOrderQc = useSelector((state) => state.erp.orderQc || {})

  // Navigation states
  const [activePage, setActivePage] = useState(1)
  const [printCurrentOnly, setPrintCurrentOnly] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveFeedback, setSaveFeedback] = useState('')

  // Find order
  const currentOrder = useMemo(() => {
    if (propOrder) return propOrder
    return reduxOrders.find(
      (o) => String(o.id) === String(orderId) || String(o.number) === String(orderId)
    )
  }, [propOrder, reduxOrders, orderId])

  const isTejActive = isTejBiocare(currentOrder) || isTejBiocare(compKey) || isTejBiocare()
  const branding = getCompanyBranding(isTejActive ? 'tej' : 'cmhp')

  // Find corresponding product
  const currentProduct = useMemo(() => {
    if (propProduct) return propProduct
    if (!currentOrder) return null
    return reduxProducts.find(
      (p) =>
        (currentOrder.product_id && String(p.id) === String(currentOrder.product_id)) ||
        (currentOrder.product_code && p.code === currentOrder.product_code) ||
        (currentOrder.product_name && (p.name === currentOrder.product_name || p.product_name === currentOrder.product_name))
    )
  }, [propProduct, reduxProducts, currentOrder])

  // Corresponding BMR record if available
  const currentBmr = useMemo(() => {
    if (propBmr) return propBmr
    if (!orderId) return null
    return (
      reduxBmrs[String(orderId)] ||
      reduxBmrs[`tablet_${orderId}`] ||
      (currentOrder?.batch_no ? reduxBmrs[`tablet_${currentOrder.batch_no}`] : null) ||
      {}
    )
  }, [propBmr, reduxBmrs, orderId, currentOrder])

  const dosageForm = propDosageForm || 'Tablet'

  // Build initial QC state with auto-fetched fields from order/bmr
  const initialData = useMemo(() => {
    const saved = reduxOrderQc[String(orderId)]
    if (saved) return saved

    const productTitle = currentOrder?.product_name || currentOrder?.product || currentProduct?.name || ''
    const productCode = currentOrder?.product_code || currentOrder?.code || currentProduct?.code || ''
    const batchNumber = currentOrder?.batch_no || currentOrder?.batch || currentBmr?.header?.batch_no || ''
    const batchQty = currentOrder?.batch_size || currentOrder?.batch_quantity || currentOrder?.quantity || currentBmr?.page1?.batch_size || ''
    const mfgDate = formatDateDDMMYYYY(
      currentOrder?.planned_mfg_date || currentOrder?.mfg_date || currentBmr?.page1?.mfg_date || currentBmr?.header?.effective_date || ''
    )
    const bestBefore = formatDateDDMMYYYY(
      currentOrder?.best_before || currentOrder?.expiry_date || currentOrder?.exp_date || currentBmr?.page1?.exp_date || ''
    )
    const mfgLicNo = currentOrder?.mfg_lic_no || currentProduct?.mfg_lic_no || currentBmr?.header?.mfg_lic_no || ''

    // Auto-fill from order fields
    const arNo = currentOrder?.ar_no || ''
    const spcNo = currentOrder?.spc_no || currentProduct?.spc_no || ''
    const refStpNo = currentOrder?.reference_stp_no || currentProduct?.reference_stp_no || ''
    const qtySample = currentOrder?.quantity_sample || '20 Tabs.'
    const sampleRecDate = formatDateDDMMYYYY(
      (() => {
        try {
          const d = new Date(currentOrder?.planned_mfg_date || currentOrder?.mfg_date || '')
          if (!isNaN(d)) { d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10) }
        } catch { /* ignore */ }
        return ''
      })()
    )

    return {
      product: productTitle,
      product_code: productCode,
      spc_no: spcNo,
      reference_stp_no: refStpNo,
      reference: 'Homeopathic Pharmacopoeia of India',
      quantity_sample: qtySample,
      spc_as_per: 'In house',
      batch_quantity: batchQty,
      batch_no: batchNumber,
      mfg_date: mfgDate,
      best_before: bestBefore,
      sample_received_date: sampleRecDate,
      date_of_analysis: sampleRecDate,
      ar_no: arNo,
      mfg_lic_no: mfgLicNo,

      test_rows: DEFAULT_TABLET_TEST_PARAMETERS.map((row) => ({ ...row })),

      label_claim_rows: DEFAULT_TABLET_LABEL_CLAIM_ROWS.map((row) => ({ ...row })),

      analysed_name: '',
      analysed_signature: '',
      analysed_date: '',
      approved_name: '',
      approved_signature: '',
      approved_date: '',

      remarks_notes: '',
    }
  }, [reduxOrderQc, orderId, currentOrder, currentProduct, currentBmr])

  const [data, setData] = useState(initialData)

  // Sync state if Redux loads fresh data for this order
  useEffect(() => {
    if (reduxOrderQc[String(orderId)]) {
      setData(reduxOrderQc[String(orderId)])
    }
  }, [reduxOrderQc, orderId])

  // Field update handler (strictly synchronized across Page 1 & Page 2)
  const updateField = (field, val) => {
    setData((prev) => ({
      ...prev,
      [field]: val,
    }))
  }

  // Test row update
  const updateTestRow = (index, field, val) => {
    setData((prev) => {
      const nextRows = [...prev.test_rows]
      nextRows[index] = { ...nextRows[index], [field]: val }
      return { ...prev, test_rows: nextRows }
    })
  }

  // Label claim row update
  const updateLabelClaimRow = (index, field, val) => {
    setData((prev) => {
      const nextRows = [...prev.label_claim_rows]
      nextRows[index] = { ...nextRows[index], [field]: val }
      return { ...prev, label_claim_rows: nextRows }
    })
  }

  // Save to Redux store
  const handleSaveDraft = useCallback(() => {
    if (!orderId) return
    setSaving(true)
    dispatch(
      saveOrderQc({
        orderId: String(orderId),
        qcData: data,
      })
    )
    setSaving(false)
    setSaveFeedback('✓ Draft Saved')
    setTimeout(() => setSaveFeedback(''), 2200)
  }, [dispatch, orderId, data])

  // Print Handlers
  const handlePrintFull = useCallback(() => {
    if (orderId) {
      dispatch(
        saveOrderQc({
          orderId: String(orderId),
          qcData: data,
        })
      )
    }
    setPrintCurrentOnly(false)
    setTimeout(() => {
      window.print()
    }, 150)
  }, [dispatch, orderId, data])

  const handlePrintCurrent = useCallback(() => {
    if (orderId) {
      dispatch(
        saveOrderQc({
          orderId: String(orderId),
          qcData: data,
        })
      )
    }
    setPrintCurrentOnly(true)
    setTimeout(() => {
      window.print()
      setPrintCurrentOnly(false)
    }, 150)
  }, [dispatch, orderId, data])

  // Bottom navigation
  const handlePrev = () => {
    if (activePage > 1) {
      setActivePage((prev) => prev - 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const handleSaveAndNext = () => {
    handleSaveDraft()
    if (activePage < 2) {
      setActivePage((prev) => prev + 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  // Page completion statuses for left sidebar
  const pageStatuses = useMemo(() => {
    const p1Filled = (data.test_rows || []).filter((r) => r.result || r.limit).length
    const p1Status = p1Filled >= 4 ? 'done' : p1Filled > 0 ? 'in_progress' : 'pending'

    const p2Filled = !!(data.analysed_name || data.approved_name || data.remarks_notes)
    const p2Complete = !!(data.analysed_name && data.approved_name)
    const p2Status = p2Complete ? 'done' : p2Filled ? 'in_progress' : 'pending'

    return { 1: p1Status, 2: p2Status }
  }, [data])

  const completedCount = useMemo(() => {
    return Object.values(pageStatuses).filter((s) => s === 'done').length
  }, [pageStatuses])

  // =================================================================
  // REUSABLE TABLET SUB-COMPONENTS
  // =================================================================

  // 1. Header Box: Logo top-left, Company title top-right (right-aligned), empty area below
  const renderHeaderBox = () => (
    <div className="qc-tablet-header-box">
      <div className="qc-tablet-header-top">
        <div className={`qc-logo-wrap ${branding.isTej ? 'qc-logo-wrap-tej' : ''}`}>
          {branding.isTej ? (
            <img src={branding.logoSrc} alt={branding.headerName} className="qc-logo-img qc-logo-img-tej" loading="eager" />
          ) : (
            <img src={cmhpLogo} alt="CMHP Logo" className="qc-logo-img" />
          )}
        </div>
        <div className="qc-tablet-company-title">
          {branding.isTej ? branding.headerName : 'CMHP PRIVATE LIMITED'}
        </div>
      </div>
      <div className="qc-tablet-header-blank" />
    </div>
  )

  // 2. Title Rows ("Quality Control", "CERTIFICATE OF ANALYSIS (FINISHED PRODUCT)")
  const renderTitleRows = () => (
    <div className="qc-tablet-title-section">
      <div className="qc-tablet-title-bar qc-tablet-bar-qc">
        Quality Control
      </div>
      <div className="qc-tablet-title-bar qc-tablet-bar-coa">
        CERTIFICATE OF ANALYSIS (FINISHED PRODUCT)
      </div>
    </div>
  )

  // 3. Info Grid: 6 columns (12% / 12% / 18% / 19% / 21% / 18%), 7 rows
  const renderInfoGrid = () => (
    <div className="qc-tablet-info-grid-wrap">
      <table className="qc-tablet-info-grid-table">
        <colgroup>
          <col style={{ width: '63.0pt' }} />
          <col style={{ width: '63.0pt' }} />
          <col style={{ width: '94.0pt' }} />
          <col style={{ width: '100.0pt' }} />
          <col style={{ width: '110.0pt' }} />
          <col style={{ width: '94.0pt' }} />
        </colgroup>
        <tbody>
          {/* Row 1 */}
          <tr className="qc-tablet-info-row-1">
            <td colSpan={2} className="qc-label-cell">Product</td>
            <td colSpan={2} className="qc-value-cell">
              <input
                type="text"
                className="qc-cell-input"
                value={data.product || ''}
                onChange={(e) => updateField('product', e.target.value)}
              />
            </td>
            <td className="qc-label-cell">Product Code</td>
            <td className="qc-value-cell">
              <input
                type="text"
                className="qc-cell-input"
                value={data.product_code || ''}
                onChange={(e) => updateField('product_code', e.target.value)}
              />
            </td>
          </tr>

          {/* Row 2 */}
          <tr className="qc-tablet-info-row-2">
            <td colSpan={2} className="qc-label-cell">SPC No.</td>
            <td colSpan={2} className="qc-value-cell">
              <input
                type="text"
                className="qc-cell-input"
                value={data.spc_no || ''}
                onChange={(e) => updateField('spc_no', e.target.value)}
              />
            </td>
            <td className="qc-label-cell">Reference STP No.</td>
            <td className="qc-value-cell">
              <input
                type="text"
                className="qc-cell-input"
                value={data.reference_stp_no || ''}
                onChange={(e) => updateField('reference_stp_no', e.target.value)}
              />
            </td>
          </tr>

          {/* Row 3 */}
          <tr className="qc-tablet-info-row-3">
            <td colSpan={2} className="qc-label-cell">Reference</td>
            <td colSpan={2} className="qc-value-cell">
              <div className="qc-tablet-static-text">
                Homeopathic Pharmacopoeia of India
              </div>
            </td>
            <td className="qc-label-cell">Quantity Sample</td>
            <td className="qc-value-cell">
              <input
                type="text"
                className="qc-cell-input"
                value={data.quantity_sample || ''}
                onChange={(e) => updateField('quantity_sample', e.target.value)}
              />
            </td>
          </tr>

          {/* Row 4 */}
          <tr className="qc-tablet-info-row-4">
            <td colSpan={2} className="qc-label-cell">SPC as per</td>
            <td colSpan={2} className="qc-value-cell">
              <div className="qc-tablet-static-text">
                In house
              </div>
            </td>
            <td className="qc-label-cell">Batch Quantity</td>
            <td className="qc-value-cell">
              <input
                type="text"
                className="qc-cell-input"
                value={data.batch_quantity || ''}
                onChange={(e) => updateField('batch_quantity', e.target.value)}
              />
            </td>
          </tr>

          {/* Row 5 - 6 Individual Columns */}
          <tr className="qc-tablet-info-row-5">
            <td className="qc-label-cell" style={{ width: '63.0pt' }}>Batch No.</td>
            <td className="qc-value-cell" style={{ width: '63.0pt' }}>
              <input
                type="text"
                className="qc-cell-input"
                value={data.batch_no || ''}
                onChange={(e) => updateField('batch_no', e.target.value)}
              />
            </td>
            <td className="qc-label-cell" style={{ width: '94.0pt' }}>Mfg. Date</td>
            <td className="qc-value-cell" style={{ width: '100.0pt' }}>
              <QcDateField
                value={data.mfg_date}
                onChange={(e) => updateField('mfg_date', e.target.value)}
              />
            </td>
            <td className="qc-label-cell" style={{ width: '110.0pt' }}>BEST BEFORE</td>
            <td className="qc-value-cell" style={{ width: '94.0pt' }}>
              <QcDateField
                value={data.best_before}
                onChange={(e) => updateField('best_before', e.target.value)}
              />
            </td>
          </tr>

          {/* Row 6 */}
          <tr className="qc-tablet-info-row-6">
            <td colSpan={2} className="qc-label-cell">Sample Received Date</td>
            <td colSpan={2} className="qc-value-cell">
              <QcDateField
                value={data.sample_received_date}
                onChange={(e) => updateField('sample_received_date', e.target.value)}
              />
            </td>
            <td className="qc-label-cell">Date of Analysis</td>
            <td className="qc-value-cell">
              <QcDateField
                value={data.date_of_analysis}
                onChange={(e) => updateField('date_of_analysis', e.target.value)}
              />
            </td>
          </tr>

          {/* Row 7 */}
          <tr className="qc-tablet-info-row-7">
            <td colSpan={2} className="qc-label-cell">AR. No.</td>
            <td colSpan={2} className="qc-value-cell">
              <input
                type="text"
                className="qc-cell-input"
                value={data.ar_no || ''}
                onChange={(e) => updateField('ar_no', e.target.value)}
              />
            </td>
            <td className="qc-label-cell">Mfg. Lic. No.</td>
            <td className="qc-value-cell">
              <input
                type="text"
                className="qc-cell-input"
                value={data.mfg_lic_no || ''}
                onChange={(e) => updateField('mfg_lic_no', e.target.value)}
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )

  // 4. Tablet Sign-off Table (3 columns: ~15% / 37% / 48%)
  const renderSignOffTable = () => (
    <div className="qc-tablet-signoff-wrap">
      <table className="qc-tablet-signoff-table">
        <colgroup>
          <col style={{ width: '78.0pt' }} />
          <col style={{ width: '194.0pt' }} />
          <col style={{ width: '252.0pt' }} />
        </colgroup>
        <thead>
          <tr className="qc-tablet-signoff-header-row">
            <th className="qc-tablet-signoff-grey-cell" />
            <th className="qc-tablet-signoff-th">
              Analysed by<br />( QC)
            </th>
            <th className="qc-tablet-signoff-th">
              Approved By<br />(QA)
            </th>
          </tr>
        </thead>
        <tbody>
          {/* Name Row */}
          <tr className="qc-tablet-signoff-name-row">
            <td className="qc-tablet-signoff-label">Name</td>
            <td className="qc-tablet-signoff-input-cell">
              <input
                type="text"
                className="qc-cell-input"
                value={data.analysed_name || ''}
                onChange={(e) => updateField('analysed_name', e.target.value)}
              />
            </td>
            <td className="qc-tablet-signoff-input-cell">
              <input
                type="text"
                className="qc-cell-input"
                value={data.approved_name || ''}
                onChange={(e) => updateField('approved_name', e.target.value)}
              />
            </td>
          </tr>

          {/* Signature Row */}
          <tr className="qc-tablet-signoff-sig-row">
            <td className="qc-tablet-signoff-label">Signature</td>
            <td className="qc-tablet-signoff-input-cell">
              <input
                type="text"
                className="qc-cell-input"
                value={data.analysed_signature || ''}
                onChange={(e) => updateField('analysed_signature', e.target.value)}
              />
            </td>
            <td className="qc-tablet-signoff-input-cell">
              <input
                type="text"
                className="qc-cell-input"
                value={data.approved_signature || ''}
                onChange={(e) => updateField('approved_signature', e.target.value)}
              />
            </td>
          </tr>

          {/* Date Row */}
          <tr className="qc-tablet-signoff-date-row">
            <td className="qc-tablet-signoff-label">Date</td>
            <td className="qc-tablet-signoff-input-cell">
              <QcDateField
                value={data.analysed_date}
                onChange={(e) => updateField('analysed_date', e.target.value)}
              />
            </td>
            <td className="qc-tablet-signoff-input-cell">
              <QcDateField
                value={data.approved_date}
                onChange={(e) => updateField('approved_date', e.target.value)}
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )

  // -----------------------------------------------------------------
  // PAGE 1 RENDERER
  // -----------------------------------------------------------------
  const renderPage1 = () => (
    <div className="qc-sheet" id="qc-tablet-page-1" key="qc-tablet-page-1">
      {/* 1. Header Box */}
      {renderHeaderBox()}

      {/* 2. Title Rows */}
      {renderTitleRows()}

      {/* 3. Info Grid */}
      {renderInfoGrid()}

      {/* 4. Gap to Test Parameters Table (~40px / 24pt) */}
      <div className="qc-tablet-gap-header-body" />

      {/* 5. Test Parameters Table */}
      <table className="qc-tablet-test-table">
        <colgroup>
          <col style={{ width: '47.0pt' }} />
          <col style={{ width: '141.0pt' }} />
          <col style={{ width: '152.0pt' }} />
          <col style={{ width: '184.0pt' }} />
        </colgroup>
        <thead>
          <tr className="qc-tablet-test-header-row">
            <th className="qc-tablet-test-th">Sr.No.</th>
            <th className="qc-tablet-test-th">Test Parameters</th>
            <th className="qc-tablet-test-th">Result</th>
            <th className="qc-tablet-test-th">Limits</th>
          </tr>
        </thead>
        <tbody>
          {data.test_rows.map((row, idx) => (
            <tr
              key={row.sr || idx}
              className={`qc-tablet-test-row ${row.sr === '8.' ? 'qc-tablet-test-row-8' : ''}`}
            >
              <td className="qc-tablet-test-td-sr">{row.sr}</td>
              <td className="qc-tablet-test-td-param">
                {row.sr === '8.' ? (
                  <>
                    Total Weight / Number of<br />
                    Tablets in Finished Product
                  </>
                ) : (
                  row.param
                )}
              </td>
              <td className="qc-tablet-test-td-input">
                <input
                  type="text"
                  className="qc-cell-input qc-text-center"
                  value={row.result || ''}
                  onChange={(e) => updateTestRow(idx, 'result', e.target.value)}
                />
              </td>
              <td className="qc-tablet-test-td-input">
                <input
                  type="text"
                  className="qc-cell-input qc-text-center"
                  value={row.limit || ''}
                  onChange={(e) => updateTestRow(idx, 'limit', e.target.value)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* 6. Gap to Label Claim */}
      <div className="qc-tablet-gap-test-lc" />

      {/* 7. Label Claim Heading */}
      <div className="qc-tablet-lc-caption">
        Label Claim: [Each gm contains]
      </div>

      {/* 8. Label Claim Table */}
      <table className="qc-tablet-lc-table">
        <colgroup>
          <col style={{ width: '47.0pt' }} />
          <col style={{ width: '204.0pt' }} />
          <col style={{ width: '100.0pt' }} />
          <col style={{ width: '173.0pt' }} />
        </colgroup>
        <thead>
          <tr className="qc-tablet-lc-header-row">
            <th className="qc-tablet-lc-th">Sr No.</th>
            <th className="qc-tablet-lc-th">Content</th>
            <th className="qc-tablet-lc-th">Potency</th>
            <th className="qc-tablet-lc-th">Results</th>
          </tr>
        </thead>
        <tbody>
          {data.label_claim_rows.map((row, idx) => (
            <tr key={row.sr || idx} className="qc-tablet-lc-row">
              <td className="qc-tablet-lc-td-sr">{row.sr}</td>
              <td className="qc-lc-td-input">
                <input
                  type="text"
                  className="qc-cell-input"
                  value={row.content || ''}
                  onChange={(e) => updateLabelClaimRow(idx, 'content', e.target.value)}
                />
              </td>
              <td className="qc-lc-td-input">
                <input
                  type="text"
                  className="qc-cell-input qc-text-center"
                  value={row.potency || ''}
                  onChange={(e) => updateLabelClaimRow(idx, 'potency', e.target.value)}
                />
              </td>
              <td className="qc-lc-td-input">
                <input
                  type="text"
                  className="qc-cell-input qc-text-center"
                  value={row.result || ''}
                  onChange={(e) => updateLabelClaimRow(idx, 'result', e.target.value)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* 9. Footnote */}
      <div className="qc-tablet-lc-note">
        *Results are taken from Bulk Release Slip report.
      </div>

      {/* 10. Spacer down to Sign-off table */}
      <div className="qc-tablet-spacer-signoff" />

      {/* 11. Sign-off Table */}
      {renderSignOffTable()}

      {/* 12. Page 1 Footer */}
      <div className="qc-page-footer">
        <span className="qc-footer-sop">SOP/QC/11/F-05/00</span>
        <span className="qc-footer-page">
          Page <strong>1</strong> of 2
        </span>
      </div>
    </div>
  )

  // -----------------------------------------------------------------
  // PAGE 2 RENDERER
  // -----------------------------------------------------------------
  const renderPage2 = () => (
    <div className="qc-sheet" id="qc-tablet-page-2" key="qc-tablet-page-2">
      {/* 1. Header Box (Identical to Page 1) */}
      {renderHeaderBox()}

      {/* 2. Title Rows */}
      {renderTitleRows()}

      {/* 3. Info Grid (Mirrored from Page 1) */}
      {renderInfoGrid()}

      {/* 4. Gap below header (~30px / 22pt) */}
      <div className="qc-tablet-gap-page2" />

      {/* 5. Verbatim Text Block */}
      <div className="qc-tablet-p2-textblock">
        <p className="qc-tablet-p2-para">
          <strong>Analysis of Finished Product Contents:</strong> All herbs, mentioned above, were tested and approved individually as per H.P.I. and these approved herbs were used for the preparation of respective triturations in presence of Production personnel and QA personnel.
        </p>
        <p className="qc-tablet-p2-para">
          The triturations were qualitatively analyzed and approved as per H.P.I. by the QC.
        </p>
        <p className="qc-tablet-p2-para">
          For finished product, the quantitative analysis of each trituration mentioned above, is not performed as the method of analysis for each trituration is not available. Hence the results are on the basis of the addition of the each approved trituration and the whole addition activity of approved trituration{'  '}addition is carried out in the presence of Production and the QA authorities.
        </p>
        <p className="qc-tablet-p2-para">
          <strong>Remarks:</strong> The above product complies / does not comply as per in house specification
        </p>
      </div>

      {/* 6. Large Blank Area */}
      <div className="qc-tablet-page2-blank-area">
        <textarea
          className="qc-blank-area-notes no-print"
          placeholder=""
          value={data.remarks_notes || ''}
          onChange={(e) => updateField('remarks_notes', e.target.value)}
        />
        {data.remarks_notes ? (
          <div className="qc-blank-area-print print-only">
            {data.remarks_notes}
          </div>
        ) : null}
      </div>

      {/* 7. Sign-off Table (Identical to Page 1, synced) */}
      {renderSignOffTable()}

      {/* 8. Page 2 Footer */}
      <div className="qc-page-footer">
        <span className="qc-footer-sop">SOP/QC/11/F-05/00</span>
        <span className="qc-footer-page">
          Page <strong>2</strong> of 2
        </span>
      </div>
    </div>
  )

  return (
    <div className="qc-view-wrapper">
      {/* ========================================================
          STICKY TOP TOOLBAR (Matching BMR View & Oil CoA Style)
          ======================================================== */}
      <div className="qc-topbar no-print">
        <div className="qc-topbar-left">
          <button
            type="button"
            className="qc-back-btn"
            onClick={() => onBack ? onBack() : navigate("/qc")}
          >
            ← Back to QC
          </button>

          {currentOrder && (
            <div className="qc-order-pill">
              Order #{currentOrder.number || currentOrder.id} • {currentOrder.product_name || currentOrder.product}
              {currentOrder.batch_no ? ` (Batch: ${currentOrder.batch_no})` : ''}
            </div>
          )}

          {dosageForm && (
            <span className="qc-dosage-pill">
              {dosageForm} (2 Pages CoA)
            </span>
          )}

          {saveFeedback && (
            <span className="qc-save-feedback">
              {saveFeedback}
            </span>
          )}
        </div>

        <div className="qc-topbar-right">
          <button
            type="button"
            className="qc-btn-secondary"
            disabled={saving}
            onClick={handleSaveDraft}
          >
            {saving ? 'Saving...' : '💾 Save Draft'}
          </button>

          <button
            type="button"
            className="qc-btn-primary"
            onClick={handlePrintFull}
            title="Prints all 2 pages formatted as in the original PDF"
          >
            🖨️ Print Full 2 Pages
          </button>

          <button
            type="button"
            className="qc-btn-secondary"
            onClick={handlePrintCurrent}
            title={`Print only active Page ${activePage}`}
          >
            🖨️ Print Page {activePage}
          </button>

          <button
            type="button"
            className="qc-btn-secondary"
            onClick={handlePrintFull}
            title="Download PDF via browser print"
          >
            📥 Download PDF
          </button>
        </div>
      </div>

      {/* ========================================================
          PAGE-WISE WORKSPACE LAYOUT (Left Navigator + Active Form Page)
          ======================================================== */}
      <div className="qc-layout no-print">
        {/* LEFT PAGE NAVIGATOR */}
        <aside className="qc-sidebar-nav">
          <div className="qc-nav-header">
            <span>QC Pages ({completedCount}/2)</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#0284c7' }}>
              {Math.round((completedCount / 2) * 100)}%
            </span>
          </div>

          <div className="qc-nav-list">
            {[
              { id: 1, title: 'Page 1 of 2 (Parameters & Label Claim)' },
              { id: 2, title: 'Page 2 of 2 (Remarks & Approvals)' },
            ].map((p) => {
              const status = pageStatuses[p.id] || 'pending'
              const isActive = activePage === p.id

              return (
                <button
                  key={p.id}
                  type="button"
                  className={`qc-nav-item ${isActive ? 'active' : ''}`}
                  onClick={() => {
                    handleSaveDraft()
                    setActivePage(p.id)
                  }}
                >
                  <div className="qc-nav-item-title">
                    <span className="qc-nav-num">{p.id}</span>
                    <span>{p.title}</span>
                  </div>

                  <span className={`qc-status-badge ${status}`}>
                    {status === 'done' ? '✓ Done' : status === 'in_progress' ? '● In Prog' : '○ Pending'}
                  </span>
                </button>
              )
            })}
          </div>
        </aside>

        {/* ACTIVE PAGE CONTENT */}
        <main className="qc-main-content">
          <div className="qc-interactive-screen-sheet">
            {activePage === 1 ? renderPage1() : renderPage2()}
          </div>

          {/* BOTTOM NAVIGATION */}
          <div className="qc-bottom-nav">
            <button
              type="button"
              className="qc-nav-btn qc-nav-btn-prev"
              disabled={activePage === 1}
              onClick={handlePrev}
            >
              ← Previous Page
            </button>

            <span style={{ fontSize: 13, fontWeight: 700, color: '#475569' }}>
              Page {activePage} of 2 — {activePage === 1 ? 'Parameters & Label Claim' : 'Remarks & Sign-off'}
            </span>

            <button
              type="button"
              className="qc-nav-btn qc-nav-btn-next"
              onClick={handleSaveAndNext}
            >
              {activePage === 2 ? 'Save & Finish ✓' : 'Save & Next Page →'}
            </button>
          </div>
        </main>
      </div>

      {/* ========================================================
          PRINT CONTAINER (Hidden on screen, rendered in print preview)
          ======================================================== */}
      <div className="qc-print-only-container">
        {printCurrentOnly ? (
          activePage === 1 ? renderPage1() : renderPage2()
        ) : (
          <>
            {renderPage1()}
            {renderPage2()}
          </>
        )}
      </div>
    </div>
  )
}
