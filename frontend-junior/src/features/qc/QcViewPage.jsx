import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { saveOrderQc } from '../../store/erpSlice'
import { selectActiveCompanyKey } from '../../utils/companySelectors'
import { resolveOrderDosageForm } from '../production/productionService'
import { getQcTemplate, VERIFIED_QC_ORDERS } from './qcTemplates'
import { formatDateDDMMYYYY, toIsoDate } from '../production/bmrDateUtils'
import cmhpLogo from '../../assets/cmhp_bmr_logo.png'
import { getCompanyBranding, isTejBiocare } from '../../utils/companyBranding.js'
import QcTabletView from './QcTabletView'
import QcMotherTinctureView from './QcMotherTinctureView'
import QcDropsView from './QcDropsView'
import QcSyrupView from './QcSyrupView'
import './QcViewPage.css'

const DEFAULT_TEST_PARAMETERS = [
  { sr: '1', param: 'Appearance', result: '', limit: '' },
  { sr: '2', param: 'Odor', result: '', limit: '' },
  { sr: '3', param: '% Moisture', result: '', limit: '' },
  { sr: '4', param: 'Weight per ml (gm/ml)', result: '', limit: '' },
  { sr: '5', param: 'Viscosity (mPa.S)', result: '', limit: '' },
  { sr: '6', param: 'Saponification Value (mg KOH/gm)', result: '', limit: '' },
  { sr: '7', param: 'Iodine Value (gm/I )', result: '', limit: '' },
  { sr: '8', param: 'Acid Value (mg KOH/gm)', result: '', limit: '' },
  { sr: '9', param: 'Peroxide Value (meq/ml)', result: '', limit: '' },
  { sr: '10', param: 'Total Volume', result: '', limit: '' },
]

/**
 * Standardized Date Field matching BmrDateField:
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

export default function QcViewPage({ orderId: orderIdProp, onBack }) {
  const params = useParams()
  const orderId = orderIdProp || params.orderId
  const navigate = useNavigate()
  const dispatch = useDispatch()

  const compKey = useSelector(selectActiveCompanyKey)
  const reduxOrders = useSelector((state) => [
    ...(state.erp.byCompany?.[compKey]?.orders || []),
    ...(state.erp.orders || []),
    ...(state.erp.byCompany?.cmhp?.orders || []),
    ...(state.erp.byCompany?.tej?.orders || []),
  ])
  const reduxProducts = useSelector((state) => [
    ...(state.erp.products || []),
    ...(state.erp.commonProducts || []),
    ...(state.erp.byCompany?.[compKey]?.products || []),
    ...(state.erp.byCompany?.cmhp?.products || []),
    ...(state.erp.byCompany?.tej?.products || []),
  ])
  const reduxBmrs = useSelector((state) => state.erp.bmrs || {})
  const reduxOrderQc = useSelector((state) => state.erp.orderQc || {})

  // Navigation states (matching BMR view)
  const [activePage, setActivePage] = useState(1)
  const [printCurrentOnly, setPrintCurrentOnly] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveFeedback, setSaveFeedback] = useState('')

  // Find order
  const currentOrder = useMemo(() => {
    return (
      reduxOrders.find(
        (o) => String(o.id) === String(orderId) || String(o.number) === String(orderId)
      ) ||
      VERIFIED_QC_ORDERS.find(
        (o) => String(o.id) === String(orderId) || String(o.number) === String(orderId)
      )
    )
  }, [reduxOrders, orderId])

  const isTejActive = isTejBiocare(currentOrder) || isTejBiocare(compKey) || isTejBiocare()
  const branding = getCompanyBranding(isTejActive ? 'tej' : 'cmhp')

  // Find corresponding product
  const currentProduct = useMemo(() => {
    if (!currentOrder) return null
    return reduxProducts.find(
      (p) =>
        (currentOrder.product_id && String(p.id) === String(currentOrder.product_id)) ||
        (currentOrder.product_code && p.code === currentOrder.product_code) ||
        (currentOrder.product_name && (p.name === currentOrder.product_name || p.product_name === currentOrder.product_name))
    )
  }, [reduxProducts, currentOrder])

  // Corresponding BMR record if available
  const currentBmr = useMemo(() => {
    if (!orderId) return null
    return (
      reduxBmrs[String(orderId)] ||
      reduxBmrs[`oil_${orderId}`] ||
      (currentOrder?.batch_no ? reduxBmrs[`oil_${currentOrder.batch_no}`] : null) ||
      {}
    )
  }, [reduxBmrs, orderId, currentOrder])

  // Resolve dosage form and QC template
  const dosageForm = currentOrder ? resolveOrderDosageForm(currentOrder) : ''
  const template = getQcTemplate(dosageForm)

  // Build initial QC state with auto-fetched fields
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

    // Auto-fill from order fields (populated in VERIFIED_QC_ORDERS)
    const arNo = currentOrder?.ar_no || ''
    const spcNo = currentOrder?.spc_no || currentProduct?.spc_no || ''
    const refStpNo = currentOrder?.reference_stp_no || currentProduct?.reference_stp_no || ''
    const qtySample = currentOrder?.quantity_sample || '05 Nos.'
    // Auto-compute sample received date = mfg date + 1 day
    const sampleRecDate = mfgDate
      ? formatDateDDMMYYYY(
          (() => {
            try {
              const d = new Date(currentOrder?.planned_mfg_date || currentOrder?.mfg_date || '')
              if (!isNaN(d)) { d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10) }
            } catch { /* ignore */ }
            return ''
          })()
        )
      : ''

    return {
      product: productTitle,
      product_code: productCode,
      spc_no: spcNo,
      reference_stp_no: refStpNo,
      reference: 'Homeopathic Pharmacopoeia of India, Indian Pharmacopoeia',
      quantity_sample: qtySample,
      spc_as_per: 'Homeopathic Pharmacopoeia of India, In House',
      batch_quantity: batchQty,
      batch_no: batchNumber,
      mfg_date: mfgDate,
      best_before: bestBefore,
      sample_received_date: sampleRecDate,
      date_of_analysis: sampleRecDate,
      ar_no: arNo,
      mfg_lic_no: mfgLicNo,

      test_rows: DEFAULT_TEST_PARAMETERS.map((row) => ({ ...row })),

      label_claim_rows: Array.from({ length: 8 }, (_, i) => ({
        sr: String(i + 1),
        ingredient: '',
        content: '',
        result: '',
      })),

      prepared_name: '',
      prepared_signature: '',
      prepared_date: '',
      reviewed_name: '',
      reviewed_signature: '',
      reviewed_date: '',
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

  // Field update handler (keeps Page 1 & Page 2 strictly synchronized)
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

  // Print Handlers (matching BMR view)
    const handleDownloadPdf = useCallback(() => {
    if (orderId) {
      dispatch(saveOrderQc({ orderId: String(orderId), qcData: data }))
    }
    const element = document.querySelector('.qc-sheet') || document.querySelector('.qc-print-only-container')
    if (!element || typeof window === 'undefined') {
      window.print()
      return
    }
    import('html2pdf.js').then((module) => {
      const html2pdf = module.default || module
      const opt = {
        margin: [4, 4, 4, 4],
        filename: `COA_${data.batch_no || 'Document'}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      }
      html2pdf().set(opt).from(element).save()
    }).catch((err) => {
      console.warn('html2pdf fallback to print:', err)
      window.print()
    })
  }, [dispatch, orderId, data])

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
    const p1Status = p1Filled >= 6 ? 'done' : p1Filled > 0 ? 'in_progress' : 'pending'

    const p2Filled = !!(data.prepared_name || data.reviewed_name || data.approved_name || data.remarks_notes)
    const p2Complete = !!(data.prepared_name && data.reviewed_name && data.approved_name)
    const p2Status = p2Complete ? 'done' : p2Filled ? 'in_progress' : 'pending'

    return { 1: p1Status, 2: p2Status }
  }, [data])

  const completedCount = useMemo(() => {
    return Object.values(pageStatuses).filter((s) => s === 'done').length
  }, [pageStatuses])

  const normDosage = String(dosageForm || currentOrder?.dosage_form || currentOrder?.dosageForm || '').toLowerCase().trim()

  // TABLET / SOLID ORAL DOSAGE FORM COA (Tablet, Tablets, Tab, Tabs, Capsule, Pills)
  if (
    template?.qcType === 'tablet' ||
    normDosage.includes('tablet') ||
    normDosage.includes('tab') ||
    normDosage.includes('capsule') ||
    normDosage.includes('pill')
  ) {
    return (
      <QcTabletView
        orderId={orderId}
        currentOrder={currentOrder}
        currentProduct={currentProduct}
        currentBmr={currentBmr}
        dosageForm={dosageForm || 'Tablet'}
        template={template}
        onBack={onBack || (() => navigate('/qc'))}
      />
    )
  }

  // MOTHER TINCTURE DOSAGE FORM COA
  if (
    template?.qcType === 'mother-tincture' ||
    normDosage.includes('mother') ||
    normDosage.includes('tincture') ||
    normDosage === 'mt'
  ) {
    return (
      <QcMotherTinctureView
        orderId={orderId}
        currentOrder={currentOrder}
        currentProduct={currentProduct}
        currentBmr={currentBmr}
        dosageForm={dosageForm || 'Mother Tincture'}
        template={template}
        onBack={onBack || (() => navigate('/qc'))}
      />
    )
  }

  // DROPS DOSAGE FORM COA
  if (
    template?.qcType === 'drops' ||
    normDosage.includes('drop')
  ) {
    return (
      <QcDropsView
        orderId={orderId}
        currentOrder={currentOrder}
        currentProduct={currentProduct}
        currentBmr={currentBmr}
        dosageForm={dosageForm || 'Drops'}
        template={template}
        onBack={onBack || (() => navigate('/qc'))}
      />
    )
  }

  // SYRUP DOSAGE FORM COA
  if (
    template?.qcType === 'syrup' ||
    normDosage.includes('syrup') ||
    normDosage.includes('syp')
  ) {
    return (
      <QcSyrupView
        orderId={orderId}
        currentOrder={currentOrder}
        currentProduct={currentProduct}
        currentBmr={currentBmr}
        dosageForm={dosageForm || 'Syrup'}
        template={template}
        onBack={onBack || (() => navigate('/qc'))}
      />
    )
  }

  // -----------------------------------------------------------------
  // REUSABLE SUB-COMPONENTS (Exact 1:1 Vector Geometry from Master PDF)
  // -----------------------------------------------------------------

  // 1. Header Box (y: 36.5 -> 147.5, Height: 111.0pt / ~13.2% page height)
  const renderHeaderBox = () => (
    <div className="qc-header-box">
      <div className="qc-header-content">
        <div className={`qc-logo-wrap ${branding.isTej ? 'qc-logo-wrap-tej' : ''}`}>
          {branding.isTej ? (
            <img src={branding.logoSrc} alt={branding.headerName} className="qc-logo-img qc-logo-img-tej" loading="eager" />
          ) : (
            <img src={cmhpLogo} alt="CMHP Logo" className="qc-logo-img" />
          )}
        </div>
        <div className="qc-company-title">
          {branding.isTej ? branding.headerName : 'CMHP PRIVATE LIMITED'}
        </div>
      </div>
      {/* Blank space below inside the same box down to y = 147.5 */}
      <div className="qc-header-blank-space" />
    </div>
  )

  // 2. Title Rows ("Quality Control" y: 147.5 -> 170.5, "CERTIFICATE..." y: 170.5 -> 188.5)
  const renderTitleRows = () => (
    <div className="qc-title-section">
      <div className="qc-title-bar qc-bar-quality-control">
        Quality Control
      </div>
      <div className="qc-title-bar qc-bar-coa-title">
        CERTIFICATE OF ANALYSIS (FINISHED PRODUCT – OIL)
      </div>
    </div>
  )

  // 3. Info Grid (y: 188.5 -> 331.5, Height: 143.0pt, exact column dividers)
  const renderInfoGrid = () => (
    <div className="qc-info-grid-wrap">
      <table className="qc-info-grid-table">
        <colgroup>
          <col style={{ width: '63.5pt' }} />
          <col style={{ width: '63.0pt' }} />
          <col style={{ width: '94.0pt' }} />
          <col style={{ width: '99.0pt' }} />
          <col style={{ width: '112.0pt' }} />
          <col style={{ width: '92.5pt' }} />
        </colgroup>
        <tbody>
          {/* Row 1 (Height: 16pt) */}
          <tr className="qc-info-row qc-info-row-1">
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

          {/* Row 2 (Height: 14pt) */}
          <tr className="qc-info-row qc-info-row-2">
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

          {/* Row 3 (Height: 26pt) */}
          <tr className="qc-info-row qc-info-row-3">
            <td colSpan={2} className="qc-label-cell">Reference</td>
            <td colSpan={2} className="qc-value-cell qc-ref-cell">
              <div className="qc-static-text">
                Homeopathic Pharmacopoeia of India,<br />
                Indian Pharmacopoeia
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

          {/* Row 4 (Height: 26pt) */}
          <tr className="qc-info-row qc-info-row-4">
            <td colSpan={2} className="qc-label-cell">SPC as per</td>
            <td colSpan={2} className="qc-value-cell qc-ref-cell">
              <div className="qc-static-text">
                Homeopathic Pharmacopoeia of India,<br />
                In House
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

          {/* Row 5 (Height: 20pt) - 6 Dedicated Columns */}
          <tr className="qc-info-row qc-info-row-5">
            <td className="qc-label-cell" style={{ width: '63.5pt' }}>Batch No.</td>
            <td className="qc-value-cell" style={{ width: '63.0pt' }}>
              <input
                type="text"
                className="qc-cell-input"
                value={data.batch_no || ''}
                onChange={(e) => updateField('batch_no', e.target.value)}
              />
            </td>
            <td className="qc-label-cell" style={{ width: '94.0pt' }}>Mfg. Date</td>
            <td className="qc-value-cell" style={{ width: '99.0pt' }}>
              <QcDateField
                value={data.mfg_date}
                onChange={(e) => updateField('mfg_date', e.target.value)}
              />
            </td>
            <td className="qc-label-cell" style={{ width: '112.0pt' }}>BEST BEFORE</td>
            <td className="qc-value-cell" style={{ width: '92.5pt' }}>
              <QcDateField
                value={data.best_before}
                onChange={(e) => updateField('best_before', e.target.value)}
              />
            </td>
          </tr>

          {/* Row 6 (Height: 20pt) */}
          <tr className="qc-info-row qc-info-row-6">
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

          {/* Row 7 (Height: 21pt) */}
          <tr className="qc-info-row qc-info-row-7">
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

  // 4. Sign-off Table (y: 686.5 -> 781.5, Height: 95.0pt, exact widths & grey cell)
  const renderSignOffTable = () => (
    <div className="qc-signoff-wrap">
      <table className="qc-signoff-table">
        <colgroup>
          <col style={{ width: '81.0pt' }} />
          <col style={{ width: '144.0pt' }} />
          <col style={{ width: '153.0pt' }} />
          <col style={{ width: '140.0pt' }} />
        </colgroup>
        <thead>
          <tr className="qc-signoff-header-row">
            <th className="qc-signoff-grey-cell" />
            <th className="qc-signoff-th">
              Prepared By<br />(QC Chemist)
            </th>
            <th className="qc-signoff-th">
              Reviewed By<br />(Sr.QC Chemist)
            </th>
            <th className="qc-signoff-th">
              Approved By<br />(QA Manager)
            </th>
          </tr>
        </thead>
        <tbody>
          {/* Name Row (Height: 14pt) */}
          <tr className="qc-signoff-row qc-signoff-name-row">
            <td className="qc-signoff-label-cell">Name</td>
            <td className="qc-signoff-input-cell">
              <input
                type="text"
                className="qc-cell-input"
                value={data.prepared_name || ''}
                onChange={(e) => updateField('prepared_name', e.target.value)}
              />
            </td>
            <td className="qc-signoff-input-cell">
              <input
                type="text"
                className="qc-cell-input"
                value={data.reviewed_name || ''}
                onChange={(e) => updateField('reviewed_name', e.target.value)}
              />
            </td>
            <td className="qc-signoff-input-cell">
              <input
                type="text"
                className="qc-cell-input"
                value={data.approved_name || ''}
                onChange={(e) => updateField('approved_name', e.target.value)}
              />
            </td>
          </tr>

          {/* Signature Row (Height: 26pt) */}
          <tr className="qc-signoff-row qc-signoff-sig-row">
            <td className="qc-signoff-label-cell">Signature</td>
            <td className="qc-signoff-input-cell">
              <input
                type="text"
                className="qc-cell-input"
                value={data.prepared_signature || ''}
                onChange={(e) => updateField('prepared_signature', e.target.value)}
              />
            </td>
            <td className="qc-signoff-input-cell">
              <input
                type="text"
                className="qc-cell-input"
                value={data.reviewed_signature || ''}
                onChange={(e) => updateField('reviewed_signature', e.target.value)}
              />
            </td>
            <td className="qc-signoff-input-cell">
              <input
                type="text"
                className="qc-cell-input"
                value={data.approved_signature || ''}
                onChange={(e) => updateField('approved_signature', e.target.value)}
              />
            </td>
          </tr>

          {/* Date Row (Height: 14pt) */}
          <tr className="qc-signoff-row qc-signoff-date-row">
            <td className="qc-signoff-label-cell">Date</td>
            <td className="qc-signoff-input-cell">
              <QcDateField
                value={data.prepared_date}
                onChange={(e) => updateField('prepared_date', e.target.value)}
              />
            </td>
            <td className="qc-signoff-input-cell">
              <QcDateField
                value={data.reviewed_date}
                onChange={(e) => updateField('reviewed_date', e.target.value)}
              />
            </td>
            <td className="qc-signoff-input-cell">
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
    <div className="qc-sheet" id="qc-sheet-page-1" key="qc-page-1">
      {/* 1. Header Box */}
      {renderHeaderBox()}

      {/* 2. Title Rows */}
      {renderTitleRows()}

      {/* 3. Info Grid */}
      {renderInfoGrid()}

      {/* 4. Gap to Test Table (18pt) */}
      <div className="qc-gap-18pt" />

      {/* 5. Test Table (Height: 154pt, Header + 10 rows) */}
      <table className="qc-test-table">
        <colgroup>
          <col style={{ width: '45.0pt' }} />
          <col style={{ width: '173.0pt' }} />
          <col style={{ width: '148.0pt' }} />
          <col style={{ width: '157.0pt' }} />
        </colgroup>
        <thead>
          <tr className="qc-test-header-row">
            <th className="qc-test-th" style={{ textAlign: 'center' }}>Sr. No.</th>
            <th className="qc-test-th" style={{ textAlign: 'center' }}>Test Parameters</th>
            <th className="qc-test-th" style={{ textAlign: 'center' }}>Result</th>
            <th className="qc-test-th" style={{ textAlign: 'center' }}>Limit</th>
          </tr>
        </thead>
        <tbody>
          {data.test_rows.map((row, idx) => (
            <tr key={row.sr || idx} className={`qc-test-row qc-test-row-${row.sr}`}>
              <td className="qc-test-td-sr">{row.sr}</td>
              <td className="qc-test-td-param">{row.param}</td>
              <td className="qc-test-td-input">
                <input
                  type="text"
                  className="qc-cell-input qc-text-center"
                  value={row.result || ''}
                  onChange={(e) => updateTestRow(idx, 'result', e.target.value)}
                />
              </td>
              <td className="qc-test-td-input">
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

      {/* 6. Gap to Label Claim Caption (13.6pt) */}
      <div className="qc-gap-13pt" />

      {/* 7. Label Claim Caption (Height: 12.4pt) */}
      <div className="qc-label-claim-caption">
        Label Claim: [Each 05 ml Contains]
      </div>

      {/* 8. Label Claim Table (Height: 120pt, Header + 8 rows) */}
      <table className="qc-label-claim-table">
        <colgroup>
          <col style={{ width: '45.0pt' }} />
          <col style={{ width: '173.0pt' }} />
          <col style={{ width: '148.0pt' }} />
          <col style={{ width: '157.0pt' }} />
        </colgroup>
        <thead>
          <tr className="qc-lc-header-row">
            <th className="qc-lc-th" style={{ textAlign: 'center' }}>Sr No</th>
            <th className="qc-lc-th" style={{ textAlign: 'center' }}>Ingredients</th>
            <th className="qc-lc-th" style={{ textAlign: 'center' }}>Content</th>
            <th className="qc-lc-th" style={{ textAlign: 'center' }}>Result</th>
          </tr>
        </thead>
        <tbody>
          {data.label_claim_rows.map((row, idx) => (
            <tr key={row.sr || idx} className="qc-lc-row">
              <td className="qc-lc-td-sr">{row.sr}</td>
              <td className="qc-lc-td-input">
                <input
                  type="text"
                  className="qc-cell-input"
                  value={row.ingredient || ''}
                  onChange={(e) => updateLabelClaimRow(idx, 'ingredient', e.target.value)}
                />
              </td>
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
                  className="qc-cell-input"
                  value={row.result || ''}
                  onChange={(e) => updateLabelClaimRow(idx, 'result', e.target.value)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* 9. Gap to Sign-off Table (37pt) */}
      <div className="qc-gap-37pt" />

      {/* 10. Sign-off Table */}
      {renderSignOffTable()}

      {/* 11. Page 1 Footer */}
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
    <div className="qc-sheet" id="qc-sheet-page-2" key="qc-page-2">
      {/* 1. Header Box */}
      {renderHeaderBox()}

      {/* 2. Title Rows */}
      {renderTitleRows()}

      {/* 3. Info Grid (Synced with Page 1) */}
      {renderInfoGrid()}

      {/* 4. Gap to Remarks (5.7pt) */}
      <div className="qc-gap-6pt" />

      {/* 5. Remarks Line (Height: 12.2pt) */}
      <div className="qc-remarks-row">
        <strong>Remarks:</strong> The above finished product complies / does not comply as per IP/HPI specification.
      </div>

      {/* 6. Large Blank Area (Height: ~336pt exactly as in PDF) */}
      <div className="qc-page2-blank-area">
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

      {/* 7. Sign-off Table (Synced with Page 1) */}
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
          STICKY TOP TOOLBAR (Matching BMR View Style)
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
            onClick={handleDownloadPdf} title="Download PDF Certificate of Analysis"
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
