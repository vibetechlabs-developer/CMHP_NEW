import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { saveOrderQc } from '../../store/erpSlice'
import { selectActiveCompanyKey } from '../../utils/companySelectors'
import { formatDateDDMMYYYY, toIsoDate } from '../production/bmrDateUtils'
import cmhpLogo from '../../assets/cmhp_bmr_logo.png'
import { getCompanyBranding, isTejBiocare } from '../../utils/companyBranding.js'
import './QcViewPage.css'
import './QcMotherTinctureView.css'

const DEFAULT_MT_TEST_PARAMETERS = [
  { sr: '1.', param: 'Description', result: '', limit: '' },
  { sr: '2.', param: 'Alcohol Content', result: '', limit: '' },
  { sr: '3.', param: 'pH', result: '', limit: '' },
  { sr: '4.', param: 'Weight/ml', result: '', limit: '' },
  { sr: '5.', param: 'Total Solids', result: '', limit: '' },
  { sr: '6.', param: 'λ max', result: '', limit: '' },
]

/**
 * Standardized Date Field matching BmrDateField and Oil/Tablet CoA:
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

export default function QcMotherTinctureView({ 
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

  // Navigation / action states
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
      reduxBmrs[`mother_tincture_${orderId}`] ||
      reduxBmrs[`mt_${orderId}`] ||
      (currentOrder?.batch_no ? reduxBmrs[`mother_tincture_${currentOrder.batch_no}`] : null) ||
      (currentOrder?.batch_no ? reduxBmrs[`mt_${currentOrder.batch_no}`] : null) ||
      {}
    )
  }, [propBmr, reduxBmrs, orderId, currentOrder])

  const dosageForm = propDosageForm || 'Mother Tincture'

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
    const bestBefore = '05 Years'
    const mfgLicNo = currentOrder?.mfg_lic_no || currentProduct?.mfg_lic_no || currentBmr?.header?.mfg_lic_no || ''

    // Auto-fill from order fields
    const arNo = currentOrder?.ar_no || ''
    const spcNo = currentOrder?.spc_no || currentProduct?.spc_no || ''
    const refStpNo = currentOrder?.reference_stp_no || currentProduct?.reference_stp_no || ''
    const qtySample = currentOrder?.quantity_sample || '05 Nos.'
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
      spc_as_per: 'Homeopathic Pharmacopoeia of India',
      batch_quantity: batchQty,
      batch_no: batchNumber,
      mfg_date: mfgDate,
      best_before: bestBefore,
      sample_received_date: sampleRecDate,
      date_of_analysis: sampleRecDate,
      ar_no: arNo,
      mfg_lic_no: mfgLicNo,

      test_rows: DEFAULT_MT_TEST_PARAMETERS.map((row) => ({ ...row })),

      analysed_name: '',
      analysed_signature: '',
      analysed_date: '',
      approved_name: '',
      approved_signature: '',
      approved_date: '',
    }
  }, [reduxOrderQc, orderId, currentOrder, currentProduct, currentBmr])

  const [data, setData] = useState(initialData)

  // Sync state if Redux loads fresh data for this order
  useEffect(() => {
    if (reduxOrderQc[String(orderId)]) {
      setData(reduxOrderQc[String(orderId)])
    }
  }, [reduxOrderQc, orderId])

  // Field update handler
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
    const handleDownloadPdf = useCallback(() => {
    if (orderId) {
      dispatch(saveOrderQc({ orderId: String(orderId), qcData: data }))
    }
    const element = document.getElementById('qc-mother-tincture-page-1') || document.querySelector('.qc-sheet')
    if (!element || typeof window === 'undefined') {
      window.print()
      return
    }
    import('html2pdf.js').then((module) => {
      const html2pdf = module.default || module
      const opt = {
        margin: [4, 4, 4, 4],
        filename: `COA_${data.batch_no || 'Mother_Tincture'}.pdf`,
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

  const handlePrint = useCallback(() => {
    if (orderId) {
      dispatch(
        saveOrderQc({
          orderId: String(orderId),
          qcData: data,
        })
      )
    }
    setTimeout(() => {
      window.print()
    }, 150)
  }, [dispatch, orderId, data])

  // Completion status
  const pageStatus = useMemo(() => {
    const filledTests = (data.test_rows || []).filter((r) => r.result || r.limit).length
    const hasApprovals = !!(data.analysed_name && data.approved_name)
    if (filledTests >= 6 && hasApprovals) return 'done'
    if (filledTests > 0 || data.analysed_name || data.approved_name) return 'in_progress'
    return 'pending'
  }, [data])

  // =================================================================
  // REUSABLE MOTHER TINCTURE SUB-COMPONENTS
  // =================================================================

  // 1. Header Block Table (6 grid columns: 12.1% / 12.2% / 18.8% / 20.4% / 21.7% / 14.8%)
  const renderHeaderBlock = () => (
    <table className="qc-mt-header-table">
      <colgroup>
        <col style={{ width: '12.1%' }} />
        <col style={{ width: '12.2%' }} />
        <col style={{ width: '18.8%' }} />
        <col style={{ width: '20.4%' }} />
        <col style={{ width: '21.7%' }} />
        <col style={{ width: '14.8%' }} />
      </colgroup>
      <tbody>
        {/* Row 1: Logo & Company Title (about 38 px tall) */}
        <tr className="qc-mt-header-row-1">
          <td colSpan={6} className="qc-mt-header-row-1-cell">
            <div className="qc-mt-header-row-1-content">
              <div className={`qc-mt-logo-wrap ${branding.isTej ? 'qc-mt-logo-wrap-tej' : ''}`}>
                {branding.isTej ? (
                  <img
                    src={branding.logoSrc}
                    alt={branding.headerName}
                    className="qc-mt-logo-img qc-mt-logo-img-tej"
                    loading="eager"
                  />
                ) : (
                  <img src={cmhpLogo} alt="CMHP Logo" className="qc-mt-logo-img" />
                )}
              </div>
              <div className="qc-mt-company-title">
                {branding.isTej ? branding.headerName : 'CMHP PRIVATE LIMITED'}
              </div>
            </div>
          </td>
        </tr>

        {/* Row 2: Quality Control (about 29 px tall, 12pt bold centered) */}
        <tr className="qc-mt-header-row-qc">
          <td colSpan={6} className="qc-mt-title-cell">
            Quality Control
          </td>
        </tr>

        {/* Row 3: CERTIFICATE OF ANALYSIS (MOTHER TINCTURE) (about 23 px tall, 12pt bold centered) */}
        <tr className="qc-mt-header-row-coa">
          <td colSpan={6} className="qc-mt-title-cell">
            CERTIFICATE OF ANALYSIS (MOTHER TINCTURE)
          </td>
        </tr>

        {/* Row 4: Product | [editable] | Product Code | [editable] (about 21 px tall) */}
        <tr className="qc-mt-info-row qc-mt-info-row-product">
          <td colSpan={2} className="qc-mt-label-cell">Product</td>
          <td colSpan={2} className="qc-mt-value-cell">
            <input
              type="text"
              className="qc-cell-input"
              value={data.product || ''}
              onChange={(e) => updateField('product', e.target.value)}
            />
          </td>
          <td className="qc-mt-label-cell">Product Code</td>
          <td className="qc-mt-value-cell">
            <input
              type="text"
              className="qc-cell-input"
              value={data.product_code || ''}
              onChange={(e) => updateField('product_code', e.target.value)}
            />
          </td>
        </tr>

        {/* Row 5: SPC No. | [editable] | Reference STP No. | [editable] (about 34 px tall) */}
        <tr className="qc-mt-info-row qc-mt-info-row-spc">
          <td colSpan={2} className="qc-mt-label-cell">SPC No.</td>
          <td colSpan={2} className="qc-mt-value-cell">
            <input
              type="text"
              className="qc-cell-input"
              value={data.spc_no || ''}
              onChange={(e) => updateField('spc_no', e.target.value)}
            />
          </td>
          <td className="qc-mt-label-cell">
            Reference<br />STP No.
          </td>
          <td className="qc-mt-value-cell">
            <input
              type="text"
              className="qc-cell-input"
              value={data.reference_stp_no || ''}
              onChange={(e) => updateField('reference_stp_no', e.target.value)}
            />
          </td>
        </tr>

        {/* Row 6: Reference | Homeopathic Pharmacopoeia of India | Quantity Sample | [editable] (about 35 px tall) */}
        <tr className="qc-mt-info-row qc-mt-info-row-reference">
          <td colSpan={2} className="qc-mt-label-cell">Reference</td>
          <td colSpan={2} className="qc-mt-value-cell">
            <div className="qc-mt-static-text">
              Homeopathic Pharmacopoeia of<br />India
            </div>
          </td>
          <td className="qc-mt-label-cell">Quantity Sample</td>
          <td className="qc-mt-value-cell">
            <input
              type="text"
              className="qc-cell-input"
              value={data.quantity_sample || ''}
              onChange={(e) => updateField('quantity_sample', e.target.value)}
            />
          </td>
        </tr>

        {/* Row 7: SPC as per | Homeopathic Pharmacopoeia of India | Batch Quantity | [editable] (about 34 px tall) */}
        <tr className="qc-mt-info-row qc-mt-info-row-spc-asper">
          <td colSpan={2} className="qc-mt-label-cell">SPC as per</td>
          <td colSpan={2} className="qc-mt-value-cell">
            <div className="qc-mt-static-text">
              Homeopathic Pharmacopoeia of<br />India
            </div>
          </td>
          <td className="qc-mt-label-cell">Batch Quantity</td>
          <td className="qc-mt-value-cell">
            <input
              type="text"
              className="qc-cell-input"
              value={data.batch_quantity || ''}
              onChange={(e) => updateField('batch_quantity', e.target.value)}
            />
          </td>
        </tr>

        {/* Row 8: Batch No. | [editable small] | Mfg. Date | [editable] | Best before use | 05 Years (about 35 px tall) */}
        <tr className="qc-mt-info-row qc-mt-info-row-batch">
          <td className="qc-mt-label-cell">
            Batch<br />No.
          </td>
          <td className="qc-mt-value-cell">
            <input
              type="text"
              className="qc-cell-input"
              value={data.batch_no || ''}
              onChange={(e) => updateField('batch_no', e.target.value)}
            />
          </td>
          <td className="qc-mt-label-cell">Mfg. Date</td>
          <td className="qc-mt-value-cell">
            <QcDateField
              value={data.mfg_date}
              onChange={(e) => updateField('mfg_date', e.target.value)}
            />
          </td>
          <td className="qc-mt-label-cell">Best before use</td>
          <td className="qc-mt-value-cell">
            <div className="qc-mt-static-text">
              05 Years
            </div>
          </td>
        </tr>

        {/* Row 9: Sample Received Date | [editable] | Date of Analysis | [editable] (about 34 px tall) */}
        <tr className="qc-mt-info-row qc-mt-info-row-sample-date">
          <td colSpan={2} className="qc-mt-label-cell">
            Sample Received<br />Date
          </td>
          <td colSpan={2} className="qc-mt-value-cell">
            <QcDateField
              value={data.sample_received_date}
              onChange={(e) => updateField('sample_received_date', e.target.value)}
            />
          </td>
          <td className="qc-mt-label-cell">Date of Analysis</td>
          <td className="qc-mt-value-cell">
            <QcDateField
              value={data.date_of_analysis}
              onChange={(e) => updateField('date_of_analysis', e.target.value)}
            />
          </td>
        </tr>

        {/* Row 10: AR. No. | [editable] | Mfg. Lic. No. | [editable] (about 26 px tall) */}
        <tr className="qc-mt-info-row qc-mt-info-row-ar">
          <td colSpan={2} className="qc-mt-label-cell">AR. No.</td>
          <td colSpan={2} className="qc-mt-value-cell">
            <input
              type="text"
              className="qc-cell-input"
              value={data.ar_no || ''}
              onChange={(e) => updateField('ar_no', e.target.value)}
            />
          </td>
          <td className="qc-mt-label-cell">Mfg. Lic. No.</td>
          <td className="qc-mt-value-cell">
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
  )

  // 2. Test Parameters Table (4 columns: 8.6% | 24.9% | 26.7% | 39.8%, 11pt font)
  const renderTestTable = () => (
    <table className="qc-mt-test-table">
      <colgroup>
        <col style={{ width: '8.6%' }} />
        <col style={{ width: '24.9%' }} />
        <col style={{ width: '26.7%' }} />
        <col style={{ width: '39.8%' }} />
      </colgroup>
      <thead>
        <tr className="qc-mt-test-header-row">
          <th className="qc-mt-test-th qc-text-center">Sr.No.</th>
          <th className="qc-mt-test-th qc-text-center">Test Parameters</th>
          <th className="qc-mt-test-th qc-text-center">Result</th>
          <th className="qc-mt-test-th qc-text-center">Limits</th>
        </tr>
      </thead>
      <tbody>
        {data.test_rows.map((row, idx) => (
          <tr key={row.sr || idx} className="qc-mt-test-row">
            <td className="qc-mt-test-td-sr qc-text-center">{row.sr}</td>
            <td className="qc-mt-test-td-param">{row.param}</td>
            <td className="qc-mt-test-td-input">
              <input
                type="text"
                className="qc-cell-input qc-text-center"
                value={row.result || ''}
                onChange={(e) => updateTestRow(idx, 'result', e.target.value)}
              />
            </td>
            <td className="qc-mt-test-td-input">
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
  )

  // 3. Sign-off Table (3 columns: 15.2% | 37.6% | 47.2%, height ~125 px) & Footer (12pt)
  const renderSignOffSection = () => (
    <div className="qc-mt-signoff-section">
      <table className="qc-mt-signoff-table">
        <colgroup>
          <col style={{ width: '15.2%' }} />
          <col style={{ width: '37.6%' }} />
          <col style={{ width: '47.2%' }} />
        </colgroup>
        <thead>
          <tr className="qc-mt-signoff-header-row">
            <th className="qc-mt-signoff-grey-cell" />
            <th className="qc-mt-signoff-th">
              Analysed by<br />(QC)
            </th>
            <th className="qc-mt-signoff-th">
              Approved By<br />(QA)
            </th>
          </tr>
        </thead>
        <tbody>
          {/* Name Row */}
          <tr className="qc-mt-signoff-name-row">
            <td className="qc-mt-signoff-label">Name</td>
            <td className="qc-mt-signoff-input-cell">
              <input
                type="text"
                className="qc-cell-input"
                value={data.analysed_name || ''}
                onChange={(e) => updateField('analysed_name', e.target.value)}
              />
            </td>
            <td className="qc-mt-signoff-input-cell">
              <input
                type="text"
                className="qc-cell-input"
                value={data.approved_name || ''}
                onChange={(e) => updateField('approved_name', e.target.value)}
              />
            </td>
          </tr>

          {/* Signature Row */}
          <tr className="qc-mt-signoff-sig-row">
            <td className="qc-mt-signoff-label">Signature</td>
            <td className="qc-mt-signoff-input-cell">
              <input
                type="text"
                className="qc-cell-input"
                value={data.analysed_signature || ''}
                onChange={(e) => updateField('analysed_signature', e.target.value)}
              />
            </td>
            <td className="qc-mt-signoff-input-cell">
              <input
                type="text"
                className="qc-cell-input"
                value={data.approved_signature || ''}
                onChange={(e) => updateField('approved_signature', e.target.value)}
              />
            </td>
          </tr>

          {/* Date Row */}
          <tr className="qc-mt-signoff-date-row">
            <td className="qc-mt-signoff-label">Date</td>
            <td className="qc-mt-signoff-input-cell">
              <QcDateField
                value={data.analysed_date}
                onChange={(e) => updateField('analysed_date', e.target.value)}
              />
            </td>
            <td className="qc-mt-signoff-input-cell">
              <QcDateField
                value={data.approved_date}
                onChange={(e) => updateField('approved_date', e.target.value)}
              />
            </td>
          </tr>
        </tbody>
      </table>

      {/* Footer outside table, 12pt font */}
      <div className="qc-mt-page-footer">
        <span className="qc-mt-footer-sop">SOP/QC/11/F-04/00</span>
        <span className="qc-mt-footer-page">
          Page <strong>1</strong> of <strong>1</strong>
        </span>
      </div>
    </div>
  )

  // -----------------------------------------------------------------
  // MOTHER TINCTURE PAGE 1 RENDERER (Exactly 1 Page)
  // -----------------------------------------------------------------
  const renderPage1 = () => (
    <div className="qc-mt-sheet" id="qc-mother-tincture-page-1" key="qc-mother-tincture-page-1">
      {/* 1. Header Block Table */}
      {renderHeaderBlock()}

      {/* 2. Gap below Header (~18 px) */}
      <div className="qc-mt-header-gap" />

      {/* 3. Test Parameters Table */}
      {renderTestTable()}

      {/* 4. Remarks Text Block */}
      <div className="qc-mt-remarks-wrap">
        <p className="qc-mt-remarks-text">
          <strong>Remarks:</strong> The above product complies / does not comply as per Homeopathic Pharmacopoeia of India.
        </p>
      </div>

      {/* 5. Blank Area down to Sign-off table */}
      <div className="qc-mt-blank-area" />

      {/* 6. Sign-off Table & Footer (Anchored at y = 874 px) */}
      {renderSignOffSection()}
    </div>
  )

  return (
    <div className="qc-view-wrapper">
      {/* ========================================================
          STICKY TOP TOOLBAR (Matching Oil and Tablet CoA Style)
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
              {dosageForm} (1 Page CoA)
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
            onClick={handlePrint}
            title="Print Mother Tincture Certificate of Analysis (1 Page)"
          >
            🖨️ Print CoA
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
            <span>QC Pages ({pageStatus === 'done' ? 1 : 0}/1)</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#0284c7' }}>
              {pageStatus === 'done' ? '100%' : pageStatus === 'in_progress' ? '50%' : '0%'}
            </span>
          </div>

          <div className="qc-nav-list">
            <button
              type="button"
              className="qc-nav-item active"
              onClick={handleSaveDraft}
            >
              <div className="qc-nav-item-title">
                <span className="qc-nav-num">1</span>
                <span>Page 1 of 1 (Certificate of Analysis)</span>
              </div>

              <span className={`qc-status-badge ${pageStatus}`}>
                {pageStatus === 'done' ? '✓ Done' : pageStatus === 'in_progress' ? '● In Prog' : '○ Pending'}
              </span>
            </button>
          </div>
        </aside>

        {/* ACTIVE PAGE CONTENT */}
        <main className="qc-main-content">
          <div className="qc-interactive-screen-sheet">
            {renderPage1()}
          </div>

          {/* BOTTOM NAVIGATION */}
          <div className="qc-bottom-nav">
            <span style={{ fontSize: 13, fontWeight: 700, color: '#475569' }}>
              Page 1 of 1 — Certificate of Analysis (Mother Tincture)
            </span>

            <button
              type="button"
              className="qc-nav-btn qc-nav-btn-next"
              onClick={handleSaveDraft}
            >
              Save Draft ✓
            </button>
          </div>
        </main>
      </div>

      {/* ========================================================
          PRINT CONTAINER (Hidden on screen, rendered in print preview)
          ======================================================== */}
      <div className="qc-print-only-container">
        {renderPage1()}
      </div>
    </div>
  )
}
