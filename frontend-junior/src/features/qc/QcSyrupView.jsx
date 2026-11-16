import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { saveOrderQc } from '../../store/erpSlice'
import { selectActiveCompanyKey } from '../../utils/companySelectors'
import { formatDateDDMMYYYY, toIsoDate } from '../production/bmrDateUtils'
import cmhpLogo from '../../assets/cmhp_bmr_logo.png'
import { getCompanyBranding, isTejBiocare } from '../../utils/companyBranding.js'
import './QcViewPage.css'
import './QcSyrupView.css'

const DEFAULT_SYRUP_TEST_PARAMETERS = [
  { sr: '1.', param: 'Appearance', result: 'Brown viscous liquid', limit: 'Clear brown viscous liquid' },
  { sr: '2.', param: 'pH *', result: '5.2', limit: '4.0 - 6.5' },
  { sr: '3.', param: 'Weight/ml (gm/ml) *', result: '1.215', limit: '1.150 - 1.300' },
  { sr: '4.', param: 'Volume (ml)', result: '100.8', limit: 'NLT 100 ml' },
  { sr: '5.', param: 'Viscosity (mPa.s)', result: '145', limit: '100 - 200' },
  { sr: '6.', param: 'Alcohol % *', result: '2.1', limit: 'NMT 5.0' },
]

const DEFAULT_SYRUP_LABEL_CLAIM_ROWS = [
  { sr: '1', content: 'Adhatoda vasica', potency: 'Q', result: 'Complies' },
  { sr: '2', content: 'Ocimum sanctum', potency: 'Q', result: 'Complies' },
  { sr: '3', content: 'Glycyrrhiza glabra', potency: 'Q', result: 'Complies' },
  { sr: '4', content: 'Tylophora indica', potency: 'Q', result: 'Complies' },
  { sr: '5', content: 'Bryonia alba', potency: '3X', result: 'Complies' },
  { sr: '6', content: 'Drosera rotundifolia', potency: '3X', result: 'Complies' },
  { sr: '7', content: 'Ipecacuanha', potency: '3X', result: 'Complies' },
  { sr: '8', content: 'Hyoscyamus niger', potency: '3X', result: 'Complies' },
]

function computeOffsetDate(dateStr, daysToAdd) {
  if (!dateStr) return ''
  let d = null
  if (typeof dateStr === 'string' && dateStr.includes('/')) {
    const parts = dateStr.split('/')
    if (parts.length === 3) {
      d = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]))
    }
  } else if (dateStr) {
    d = new Date(dateStr)
  }
  if (!d || isNaN(d.getTime())) return ''
  d.setDate(d.getDate() + daysToAdd)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

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

export default function QcSyrupView({ 
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
  const reduxFormulas = useSelector((state) => [
    ...(state.erp.byCompany?.[compKey]?.formulas || []),
    ...(state.erp.formulas || []),
    ...(state.erp.byCompany?.cmhp?.formulas || []),
    ...(state.erp.byCompany?.tej?.formulas || []),
  ])
  const reduxBmrs = useSelector((state) => state.erp.bmrs || {})
  const reduxOrderQc = useSelector((state) => state.erp.orderQc || {})

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

  // Find product
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

  // Find formula
  const currentFormula = useMemo(() => {
    if (!currentProduct) return null
    return reduxFormulas.find(
      (f) => String(f.product_id) === String(currentProduct.id) || String(f.id) === String(currentProduct.last_formula_id)
    )
  }, [reduxFormulas, currentProduct])

  // Corresponding BMR record
  const currentBmr = useMemo(() => {
    if (propBmr) return propBmr
    if (!orderId) return null
    return (
      reduxBmrs[String(orderId)] ||
      reduxBmrs[`syrup_${orderId}`] ||
      (currentOrder?.batch_no ? reduxBmrs[`syrup_${currentOrder.batch_no}`] : null) ||
      {}
    )
  }, [propBmr, reduxBmrs, orderId, currentOrder])

  const dosageForm = propDosageForm || 'Syrup'

  // Build initial QC state with auto-fetched fields from order/bmr
  const initialData = useMemo(() => {
    const saved = reduxOrderQc[String(orderId)]
    if (saved) return saved

    const productTitle = currentOrder?.product_name || currentOrder?.product || currentProduct?.name || ''
    const productCode = currentOrder?.product_code || currentOrder?.code || currentProduct?.code || ''
    const batchNumber = currentOrder?.batch_no || currentOrder?.batch || currentBmr?.header?.batch_no || ''
    const batchQty = currentOrder?.batch_size || currentOrder?.batch_quantity || currentOrder?.quantity || currentBmr?.page1?.batch_size || ''
    const mfgDate = formatDateDDMMYYYY(
      currentOrder?.planned_mfg_date || currentOrder?.mfg_date || currentBmr?.page1?.mfg_date || currentBmr?.header?.effective_date || '2026-10-25'
    )
    const bestBefore = formatDateDDMMYYYY(
      currentOrder?.best_before || currentOrder?.expiry_date || currentOrder?.exp_date || currentBmr?.page1?.exp_date || '2028-10-24'
    )
    const mfgLicNo = currentOrder?.mfg_lic_no || currentProduct?.mfg_lic_no || currentBmr?.header?.mfg_lic_no || ''

    const sampleReceivedDate = computeOffsetDate(mfgDate, 1) || '26/10/2026'
    const dateOfAnalysis = computeOffsetDate(mfgDate, 2) || '27/10/2026'

    // Auto-fill from order fields
    const arNo = currentOrder?.ar_no || 'AR/SY/001'
    const spcNo = currentOrder?.spc_no || currentProduct?.spc_no || 'SPC/SY/001'
    const refStpNo = currentOrder?.reference_stp_no || currentProduct?.reference_stp_no || 'STP/SY/001'
    const qtySample = currentOrder?.quantity_sample || '05 Nos.'

    // Determine label claim rows from formula if available with active ingredients, else use sample default
    let labelClaims = DEFAULT_SYRUP_LABEL_CLAIM_ROWS.map((r) => ({ ...r }))
    if (currentFormula?.revisions?.[0]?.materials && currentFormula.revisions[0].materials.length >= 8 && currentFormula.revisions[0].materials.some(m => m.potency)) {
      labelClaims = currentFormula.revisions[0].materials.map((m, idx) => ({
        sr: String(idx + 1),
        content: m.name || m.ingredient || '',
        potency: m.potency || 'Q',
        result: 'Complies',
      }))
    }

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
      sample_received_date: sampleReceivedDate,
      date_of_analysis: dateOfAnalysis,
      ar_no: arNo,
      mfg_lic_no: mfgLicNo,

      test_rows: DEFAULT_SYRUP_TEST_PARAMETERS.map((row) => ({ ...row })),
      label_claim_rows: labelClaims,

      analysed_name: '',
      analysed_signature: '',
      analysed_date: '',
      approved_name: '',
      approved_signature: '',
      approved_date: '',
    }
  }, [reduxOrderQc, orderId, currentOrder, currentProduct, currentBmr, currentFormula])

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

  // Label claim row update
  const updateLabelClaimRow = (index, field, val) => {
    setData((prev) => {
      const nextRows = [...prev.label_claim_rows]
      nextRows[index] = { ...nextRows[index], [field]: val }
      return { ...prev, label_claim_rows: nextRows }
    })
  }

  // Add row if formula has more ingredients
  const handleAddLabelClaimRow = () => {
    setData((prev) => ({
      ...prev,
      label_claim_rows: [
        ...prev.label_claim_rows,
        {
          sr: String(prev.label_claim_rows.length + 1),
          content: '',
          potency: '',
          result: 'Complies',
        },
      ],
    }))
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

  // Print Handler
    const handleDownloadPdf = useCallback(() => {
    if (orderId) {
      dispatch(saveOrderQc({ orderId: String(orderId), qcData: data }))
    }
    const element = document.getElementById('qc-syrup-page-1') || document.querySelector('.qc-sheet')
    if (!element || typeof window === 'undefined') {
      window.print()
      return
    }
    import('html2pdf.js').then((module) => {
      const html2pdf = module.default || module
      const opt = {
        margin: [4, 4, 4, 4],
        filename: `COA_${data.batch_no || 'Syrup'}.pdf`,
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
    const filledTests = (data.test_rows || []).filter((r) => r.result && r.limit).length
    const hasApprovals = !!(data.analysed_name && data.approved_name)
    if (filledTests >= 6 && hasApprovals) return 'done'
    if (filledTests > 0 || data.analysed_name || data.approved_name) return 'in_progress'
    return 'pending'
  }, [data])

  // =================================================================
  // SUB-COMPONENTS
  // =================================================================

  // 1. Header Block Table (6 columns: 12.23% / 11.82% / 18.11% / 18.94% / 21.31% / 17.60%)
  const renderHeaderBlock = () => (
    <table className="qc-syrup-header-table">
      <colgroup>
        <col style={{ width: '12.23%' }} />
        <col style={{ width: '11.82%' }} />
        <col style={{ width: '18.11%' }} />
        <col style={{ width: '18.94%' }} />
        <col style={{ width: '21.31%' }} />
        <col style={{ width: '17.60%' }} />
      </colgroup>
      <tbody>
        {/* Row 1: Logo & Company Name (18 pt regular, centred) */}
        <tr className="qc-syrup-header-row-1">
          <td colSpan={6} className="qc-syrup-header-row-1-cell">
            <div className="qc-syrup-header-row-1-content">
              <div className={`qc-syrup-logo-wrap ${branding.isTej ? 'qc-syrup-logo-wrap-tej' : ''}`}>
                {branding.isTej ? (
                  <img
                    src={branding.logoSrc}
                    alt={branding.headerName}
                    className="qc-syrup-logo-img qc-syrup-logo-img-tej"
                    loading="eager"
                  />
                ) : (
                  <img src={cmhpLogo} alt="CMHP Logo" className="qc-syrup-logo-img" />
                )}
              </div>
              <div className="qc-syrup-company-title">
                {branding.isTej ? branding.headerName : 'CMHP PRIVATE LIMITED'}
              </div>
            </div>
          </td>
        </tr>

        {/* Row 2: Quality Control (bold, centred) */}
        <tr>
          <td colSpan={6} className="qc-syrup-title-cell">
            Quality Control
          </td>
        </tr>

        {/* Row 3: CERTIFICATE OF ANALYSIS (FINISHED PRODUCT) (bold, centred) */}
        <tr>
          <td colSpan={6} className="qc-syrup-title-cell">
            CERTIFICATE OF ANALYSIS (FINISHED PRODUCT)
          </td>
        </tr>

        {/* Row 4: Product | [editable] | Product Code | [editable] */}
        <tr>
          <td colSpan={2} className="qc-syrup-label-cell">Product</td>
          <td colSpan={2} className="qc-syrup-value-cell">
            <input
              type="text"
              className="qc-cell-input"
              value={data.product || ''}
              onChange={(e) => updateField('product', e.target.value)}
            />
          </td>
          <td className="qc-syrup-label-cell">Product Code</td>
          <td className="qc-syrup-value-cell">
            <input
              type="text"
              className="qc-cell-input"
              value={data.product_code || ''}
              onChange={(e) => updateField('product_code', e.target.value)}
            />
          </td>
        </tr>

        {/* Row 5: SPC No. | [editable] | Reference STP No. | [editable] */}
        <tr>
          <td colSpan={2} className="qc-syrup-label-cell">SPC No.</td>
          <td colSpan={2} className="qc-syrup-value-cell">
            <input
              type="text"
              className="qc-cell-input"
              value={data.spc_no || ''}
              onChange={(e) => updateField('spc_no', e.target.value)}
            />
          </td>
          <td className="qc-syrup-label-cell">Reference STP No.</td>
          <td className="qc-syrup-value-cell">
            <input
              type="text"
              className="qc-cell-input"
              value={data.reference_stp_no || ''}
              onChange={(e) => updateField('reference_stp_no', e.target.value)}
            />
          </td>
        </tr>

        {/* Row 6: Reference | Homeopathic Pharmacopoeia of India | Quantity Sample | [editable] */}
        <tr>
          <td colSpan={2} className="qc-syrup-label-cell">Reference</td>
          <td colSpan={2} className="qc-syrup-value-cell">
            <div className="qc-syrup-static-text">
              Homeopathic Pharmacopoeia of India
            </div>
          </td>
          <td className="qc-syrup-label-cell">Quantity Sample</td>
          <td className="qc-syrup-value-cell">
            <input
              type="text"
              className="qc-cell-input"
              value={data.quantity_sample || ''}
              onChange={(e) => updateField('quantity_sample', e.target.value)}
            />
          </td>
        </tr>

        {/* Row 7: SPC as per | In house | Batch Quantity | [editable] */}
        <tr>
          <td colSpan={2} className="qc-syrup-label-cell">SPC as per</td>
          <td colSpan={2} className="qc-syrup-value-cell">
            <div className="qc-syrup-static-text">
              In house
            </div>
          </td>
          <td className="qc-syrup-label-cell">Batch Quantity</td>
          <td className="qc-syrup-value-cell">
            <input
              type="text"
              className="qc-cell-input"
              value={data.batch_quantity || ''}
              onChange={(e) => updateField('batch_quantity', e.target.value)}
            />
          </td>
        </tr>

        {/* Row 8: Batch No. | [editable] | Mfg. Date | [editable] | BEST BEFORE | [editable] */}
        <tr>
          <td className="qc-syrup-label-cell">Batch No.</td>
          <td className="qc-syrup-value-cell">
            <input
              type="text"
              className="qc-cell-input"
              value={data.batch_no || ''}
              onChange={(e) => updateField('batch_no', e.target.value)}
            />
          </td>
          <td className="qc-syrup-label-cell">Mfg. Date</td>
          <td className="qc-syrup-value-cell">
            <QcDateField
              value={data.mfg_date}
              onChange={(e) => updateField('mfg_date', e.target.value)}
            />
          </td>
          <td className="qc-syrup-label-cell">BEST BEFORE</td>
          <td className="qc-syrup-value-cell">
            <QcDateField
              value={data.best_before}
              onChange={(e) => updateField('best_before', e.target.value)}
            />
          </td>
        </tr>

        {/* Row 9: Sample Received Date | [editable] | Date of Analysis | [editable] */}
        <tr>
          <td colSpan={2} className="qc-syrup-label-cell">Sample Received Date</td>
          <td colSpan={2} className="qc-syrup-value-cell">
            <QcDateField
              value={data.sample_received_date}
              onChange={(e) => updateField('sample_received_date', e.target.value)}
            />
          </td>
          <td className="qc-syrup-label-cell">Date of Analysis</td>
          <td className="qc-syrup-value-cell">
            <QcDateField
              value={data.date_of_analysis}
              onChange={(e) => updateField('date_of_analysis', e.target.value)}
            />
          </td>
        </tr>

        {/* Row 10: AR. No. | [editable] | Mfg. Lic. No. | [editable] */}
        <tr>
          <td colSpan={2} className="qc-syrup-label-cell">AR. No.</td>
          <td colSpan={2} className="qc-syrup-value-cell">
            <input
              type="text"
              className="qc-cell-input"
              value={data.ar_no || ''}
              onChange={(e) => updateField('ar_no', e.target.value)}
            />
          </td>
          <td className="qc-syrup-label-cell">Mfg. Lic. No.</td>
          <td className="qc-syrup-value-cell">
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

  // 2. Test Parameters Table (Sr 834 / Param 2676 / Result 2610 / Limit 3600 twips)
  // Header row is taller than Drops: "Sr.No." sits on the lower line of its cell (bottom-left)
  // Parameter names CENTRED (unlike Drops).
  const renderTestTable = () => (
    <table className="qc-syrup-test-table">
      <colgroup>
        <col style={{ width: '8.58%' }} />
        <col style={{ width: '27.53%' }} />
        <col style={{ width: '26.85%' }} />
        <col style={{ width: '37.04%' }} />
      </colgroup>
      <thead>
        <tr className="qc-syrup-test-header-row">
          <th className="qc-syrup-test-th-sr">
            <div style={{ minHeight: '1.2em' }} />
            <div>Sr.No.</div>
          </th>
          <th className="qc-syrup-test-th-top">Test Parameters</th>
          <th className="qc-syrup-test-th-top">Result</th>
          <th className="qc-syrup-test-th-top">Limits</th>
        </tr>
      </thead>
      <tbody>
        {data.test_rows.map((row, idx) => (
          <tr key={row.sr || idx}>
            <td className="qc-syrup-test-td-sr">{row.sr}</td>
            <td className="qc-syrup-test-td-param">{row.param}</td>
            <td className="qc-syrup-test-td-input">
              <input
                type="text"
                className="qc-cell-input qc-text-center"
                value={row.result || ''}
                onChange={(e) => updateTestRow(idx, 'result', e.target.value)}
              />
            </td>
            <td className="qc-syrup-test-td-input">
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

  // 3. Label Claim Table (Two blank lines before caption)
  // Same columns as Drops: 862 / 3818 / 1800 / 3240 twips.
  // 8 rows numbered 1 to 8. Content text CENTRED. Results default "Complies".
  const renderLabelClaimSection = () => (
    <div style={{ flexShrink: 0 }}>
      <div className="qc-syrup-lc-caption">
        Label Claim: [Each 05 ml contains]
      </div>
      <table className="qc-syrup-lc-table">
        <colgroup>
          <col style={{ width: '8.87%' }} />
          <col style={{ width: '39.28%' }} />
          <col style={{ width: '18.52%' }} />
          <col style={{ width: '33.33%' }} />
        </colgroup>
        <thead>
          <tr>
            <th className="qc-syrup-lc-th">Sr No.</th>
            <th className="qc-syrup-lc-th">Content</th>
            <th className="qc-syrup-lc-th">Potency</th>
            <th className="qc-syrup-lc-th">Results</th>
          </tr>
        </thead>
        <tbody>
          {data.label_claim_rows.map((row, idx) => (
            <tr key={row.sr || idx}>
              <td className="qc-syrup-lc-td-sr">{row.sr}</td>
              <td className="qc-syrup-lc-td-content">
                <input
                  type="text"
                  className="qc-cell-input qc-text-center"
                  value={row.content || ''}
                  onChange={(e) => updateLabelClaimRow(idx, 'content', e.target.value)}
                />
              </td>
              <td className="qc-syrup-lc-td-center">
                <input
                  type="text"
                  className="qc-cell-input qc-text-center"
                  value={row.potency || ''}
                  onChange={(e) => updateLabelClaimRow(idx, 'potency', e.target.value)}
                />
              </td>
              <td className="qc-syrup-lc-td-center">
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
      <div className="qc-syrup-footnote">
        *Results are taken from Bulk Release Slip report.
      </div>
    </div>
  )

  // 4. Finished Product Contents & Remarks
  // ONE single paragraph: begins with ". ", then bold "Analysis of Finished Product Contents: "
  // One blank line, then bold "Remarks:" + " The above product complies / does not comply as per in house specification"
  const renderTextAndRemarks = () => (
    <div style={{ flexShrink: 0 }}>
      <div className="qc-syrup-text-block">
        <p>
          .{' '}<strong>Analysis of Finished Product Contents:</strong> All herbs, mentioned above, were tested and approved individually as per H.P.I. and these approved herbs were used for the preparation of respective mother tinctures in presence of Production personnel and QA personnel. The mother tinctures were qualitatively analyzed and approved as per H.P.I. by the QC. For finished product, the quantitative analysis of each mother tincture mentioned above, is not performed as the method of analysis for each mother tincture is not available. Hence the results are on the basis of the addition of the each approved mother tincture and the whole addition activity of approved mother tincture addition is carried out in the presence of Production and the QA authorities.
        </p>
      </div>
      <div className="qc-syrup-remarks-block">
        <strong>Remarks:</strong> The above product complies / does not comply as per in house specification
      </div>
    </div>
  )

  // 5. Sign-off Table (3 columns: 1473 / 3657 / 4590 twips) & Footer
  const renderSignOffSection = () => (
    <div className="qc-syrup-footer-section">
      <table className="qc-syrup-signoff-table">
        <colgroup>
          <col style={{ width: '15.15%' }} />
          <col style={{ width: '37.62%' }} />
          <col style={{ width: '47.22%' }} />
        </colgroup>
        <thead>
          <tr>
            <th className="qc-syrup-signoff-grey-cell" />
            <th className="qc-syrup-signoff-th">
              Analysed by<br />( QC)
            </th>
            <th className="qc-syrup-signoff-th">
              Approved By<br />(QA)
            </th>
          </tr>
        </thead>
        <tbody>
          {/* Name Row */}
          <tr>
            <td className="qc-syrup-signoff-label">Name</td>
            <td className="qc-syrup-value-cell">
              <input
                type="text"
                className="qc-cell-input qc-text-center"
                value={data.analysed_name || ''}
                onChange={(e) => updateField('analysed_name', e.target.value)}
              />
            </td>
            <td className="qc-syrup-value-cell">
              <input
                type="text"
                className="qc-cell-input qc-text-center"
                value={data.approved_name || ''}
                onChange={(e) => updateField('approved_name', e.target.value)}
              />
            </td>
          </tr>

          {/* Signature Row (Taller) */}
          <tr>
            <td className="qc-syrup-signoff-label">Signature</td>
            <td className="qc-syrup-signoff-sig-cell">
              <input
                type="text"
                className="qc-cell-input qc-text-center"
                value={data.analysed_signature || ''}
                onChange={(e) => updateField('analysed_signature', e.target.value)}
              />
            </td>
            <td className="qc-syrup-signoff-sig-cell">
              <input
                type="text"
                className="qc-cell-input qc-text-center"
                value={data.approved_signature || ''}
                onChange={(e) => updateField('approved_signature', e.target.value)}
              />
            </td>
          </tr>

          {/* Date Row */}
          <tr>
            <td className="qc-syrup-signoff-label">Date</td>
            <td className="qc-syrup-value-cell">
              <QcDateField
                value={data.analysed_date}
                onChange={(e) => updateField('analysed_date', e.target.value)}
              />
            </td>
            <td className="qc-syrup-value-cell">
              <QcDateField
                value={data.approved_date}
                onChange={(e) => updateField('approved_date', e.target.value)}
              />
            </td>
          </tr>
        </tbody>
      </table>

      {/* Page Footer */}
      <div className="qc-syrup-page-footer">
        <span className="qc-syrup-footer-sop">SOP/QC/11/F-05/00</span>
        <span className="qc-syrup-footer-page">Page 1 of 1</span>
      </div>
    </div>
  )

  // Full Page 1 Document Sheet
  const renderDocumentSheet = () => (
    <div className="qc-syrup-sheet" id="qc-syrup-page-1" key="qc-syrup-page-1">
      {renderHeaderBlock()}
      {renderTestTable()}
      {renderLabelClaimSection()}
      {renderTextAndRemarks()}
      {renderSignOffSection()}
    </div>
  )

  return (
    <div className="qc-view-wrapper">
      {/* ========================================================
          STICKY TOP TOOLBAR
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
            onClick={handleAddLabelClaimRow}
            title="Add another herb/ingredient to Label Claim"
          >
            + Add Ingredient
          </button>

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
            title="Print Syrup Certificate of Analysis (1 Page)"
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
          PAGE-WISE WORKSPACE LAYOUT
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

          <div className="qc-nav-info-box" style={{ marginTop: 20 }}>
            <div className="qc-nav-info-title">Dosage Form: Syrup</div>
            <div className="qc-nav-info-desc">
              Finished Product Testing (SOP/QC/11/F-05/00). Meets pharmacopoeial specifications as per H.P.I.
            </div>
          </div>
        </aside>

        {/* ACTIVE PAGE CONTENT */}
        <main className="qc-main-content">
          <div className="qc-interactive-screen-sheet">
            {renderDocumentSheet()}
          </div>

          {/* BOTTOM NAVIGATION */}
          <div className="qc-bottom-nav">
            <span style={{ fontSize: 13, fontWeight: 700, color: '#475569' }}>
              Page 1 of 1 — Certificate of Analysis (Syrup)
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
          PRINT CONTAINER
          ======================================================== */}
      <div className="qc-print-only-container">
        {renderDocumentSheet()}
      </div>
    </div>
  )
}
