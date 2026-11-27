import { useEffect, useMemo, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { saveOrderQc } from '../../store/erpSlice'
import { selectActiveCompanyKey } from '../../utils/companySelectors'
import { formatDateDDMMYYYY } from '../production/bmrDateUtils'
import cmhpLogo from '../../assets/cmhp_bmr_logo.png'
import { getCompanyBranding, isTejBiocare } from '../../utils/companyBranding.js'
import { QcAutoCell, QcDateField } from './qcSharedComponents'
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

export default function QcMotherTinctureView({
  orderId: propOrderId,
  currentOrder: propOrder,
  currentProduct: propProduct,
  currentBmr: propBmr,
  dosageForm: propDosageForm,
  storageKey: propStorageKey,
  onBack,
}) {
  const params = useParams()
  const orderId = propOrderId || params.orderId
  const storageKey = propStorageKey || String(orderId)
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

  // Corresponding BMR
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

  // Build initial QC state: Auto-fill from order/product only where stored; leave rest blank
  const initialData = useMemo(() => {
    const saved = reduxOrderQc[storageKey] || reduxOrderQc[String(orderId)]
    if (saved) return saved

    const productTitle = currentOrder?.product_name || currentOrder?.product || currentProduct?.name || ''
    const productCode = currentOrder?.product_code || currentOrder?.code || currentProduct?.code || ''
    const batchNumber = currentOrder?.batch_no || currentOrder?.batch || currentBmr?.header?.batch_no || ''
    const batchQty = currentOrder?.batch_size || currentOrder?.batch_quantity || currentOrder?.quantity || currentBmr?.page1?.batch_size || ''
    const mfgDate = formatDateDDMMYYYY(
      currentOrder?.planned_mfg_date || currentOrder?.mfg_date || currentBmr?.page1?.mfg_date || currentBmr?.header?.effective_date || ''
    )
    const bestBefore = currentOrder?.best_before ? formatDateDDMMYYYY(currentOrder.best_before) : '05 Years'
    const mfgLicNo = currentOrder?.mfg_lic_no || currentProduct?.mfg_lic_no || currentBmr?.header?.mfg_lic_no || ''
    const qtySample = currentOrder?.quantity_sample || ''

    return {
      product: productTitle,
      product_code: productCode,
      spc_no: '',
      reference_stp_no: '',
      reference: 'Homeopathic Pharmacopoeia of India',
      quantity_sample: qtySample,
      spc_as_per: 'Homeopathic Pharmacopoeia of India',
      batch_quantity: batchQty,
      batch_no: batchNumber,
      mfg_date: mfgDate,
      best_before: bestBefore,
      sample_received_date: '',
      date_of_analysis: '',
      ar_no: '',
      mfg_lic_no: mfgLicNo,

      test_rows: DEFAULT_MT_TEST_PARAMETERS.map((row) => ({ ...row })),

      analysed_name: '',
      analysed_signature: '',
      analysed_date: '',
      approved_name: '',
      approved_signature: '',
      approved_date: '',

      remarks_notes: '',
    }
  }, [reduxOrderQc, storageKey, orderId, currentOrder, currentProduct, currentBmr])

  const [data, setData] = useState(initialData)

  useEffect(() => {
    const saved = reduxOrderQc[storageKey] || reduxOrderQc[String(orderId)]
    if (saved) {
      setData(saved)
    }
  }, [reduxOrderQc, storageKey, orderId])

  const updateField = (field, val) => {
    setData((prev) => ({
      ...prev,
      [field]: val,
    }))
  }

  const updateTestRow = (index, field, val) => {
    setData((prev) => {
      const nextRows = [...prev.test_rows]
      nextRows[index] = { ...nextRows[index], [field]: val }
      return { ...prev, test_rows: nextRows }
    })
  }

  const handleSaveDraft = useCallback(() => {
    if (!orderId) return
    setSaving(true)
    dispatch(
      saveOrderQc({
        orderId: storageKey,
        qcData: data,
      })
    )
    setSaving(false)
    setSaveFeedback('✓ Draft Saved')
    setTimeout(() => setSaveFeedback(''), 2200)
  }, [dispatch, storageKey, orderId, data])

  const handlePrintFull = useCallback(() => {
    if (orderId) {
      dispatch(saveOrderQc({ orderId: storageKey, qcData: data }))
    }
    setTimeout(() => {
      window.print()
    }, 150)
  }, [dispatch, storageKey, orderId, data])

  // 1. Header Block Table
  const renderHeaderBlock = () => (
    <table className="qc-mt-header-table">
      <colgroup>
        <col style={{ width: '13.3%' }} />
        <col style={{ width: '36.7%' }} />
        <col style={{ width: '17.3%' }} />
        <col style={{ width: '32.7%' }} />
      </colgroup>
      <tbody>
        {/* Row 1: Logo & Company Name */}
        <tr className="qc-mt-info-row qc-mt-info-row-logo">
          <td colSpan={4} className="qc-mt-header-cell">
            <div className="qc-mt-header-box">
              <div className={`qc-mt-logo-wrap ${branding.isTej ? 'qc-mt-logo-wrap-tej' : ''}`}>
                {branding.isTej ? (
                  <img src={branding.logoSrc} alt={branding.headerName} className="qc-mt-logo-img qc-mt-logo-img-tej" loading="eager" />
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

        {/* Row 2: Quality Control */}
        <tr className="qc-mt-info-row qc-mt-info-row-qc">
          <td colSpan={4} className="qc-mt-title-bar qc-mt-bar-qc">
            Quality Control
          </td>
        </tr>

        {/* Row 3: CERTIFICATE OF ANALYSIS (MOTHER TINCTURE) */}
        <tr className="qc-mt-info-row qc-mt-info-row-coa">
          <td colSpan={4} className="qc-mt-title-bar qc-mt-bar-coa">
            CERTIFICATE OF ANALYSIS (MOTHER TINCTURE)
          </td>
        </tr>

        {/* Row 4: Product | [editable] | Product Code | [editable] */}
        <tr className="qc-mt-info-row">
          <td className="qc-mt-label-cell">Product</td>
          <td className="qc-mt-value-cell">
            <QcAutoCell
              value={data.product}
              onChange={(e) => updateField('product', e.target.value)}
            />
          </td>
          <td className="qc-mt-label-cell">Product Code</td>
          <td className="qc-mt-value-cell">
            <QcAutoCell
              value={data.product_code}
              onChange={(e) => updateField('product_code', e.target.value)}
            />
          </td>
        </tr>

        {/* Row 5: SPC No. | [editable] | Reference STP No. | [editable] */}
        <tr className="qc-mt-info-row">
          <td className="qc-mt-label-cell">SPC No.</td>
          <td className="qc-mt-value-cell">
            <QcAutoCell
              value={data.spc_no}
              onChange={(e) => updateField('spc_no', e.target.value)}
            />
          </td>
          <td className="qc-mt-label-cell">Reference STP No.</td>
          <td className="qc-mt-value-cell">
            <QcAutoCell
              value={data.reference_stp_no}
              onChange={(e) => updateField('reference_stp_no', e.target.value)}
            />
          </td>
        </tr>

        {/* Row 6: Reference | Homeopathic Pharmacopoeia of India | Quantity Sample | [editable] */}
        <tr className="qc-mt-info-row">
          <td className="qc-mt-label-cell">Reference</td>
          <td className="qc-mt-value-cell">
            <div className="qc-static-text">Homeopathic Pharmacopoeia of India</div>
          </td>
          <td className="qc-mt-label-cell">Quantity Sample</td>
          <td className="qc-mt-value-cell">
            <QcAutoCell
              value={data.quantity_sample}
              onChange={(e) => updateField('quantity_sample', e.target.value)}
            />
          </td>
        </tr>

        {/* Row 7: SPC as per | Homeopathic Pharmacopoeia of India | Batch Quantity | [editable] */}
        <tr className="qc-mt-info-row">
          <td className="qc-mt-label-cell">SPC as per</td>
          <td className="qc-mt-value-cell">
            <div className="qc-static-text">Homeopathic Pharmacopoeia of India</div>
          </td>
          <td className="qc-mt-label-cell">Batch Quantity</td>
          <td className="qc-mt-value-cell">
            <QcAutoCell
              value={data.batch_quantity}
              onChange={(e) => updateField('batch_quantity', e.target.value)}
            />
          </td>
        </tr>

        {/* Row 8: 6 dedicated columns (Batch No. | [editable] | Mfg. Date | [editable] | Best before use | [editable]) */}
        <tr className="qc-mt-info-row">
          <td colSpan={4} style={{ padding: 0, border: 'none' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', border: 'none' }}>
              <colgroup>
                <col style={{ width: '13.3%' }} />
                <col style={{ width: '15.0%' }} />
                <col style={{ width: '13.0%' }} />
                <col style={{ width: '15.0%' }} />
                <col style={{ width: '17.3%' }} />
                <col style={{ width: '26.4%' }} />
              </colgroup>
              <tbody>
                <tr>
                  <td className="qc-mt-label-cell" style={{ borderLeft: 'none', borderTop: 'none', borderBottom: 'none' }}>Batch No.</td>
                  <td className="qc-mt-value-cell" style={{ borderTop: 'none', borderBottom: 'none' }}>
                    <QcAutoCell
                      value={data.batch_no}
                      onChange={(e) => updateField('batch_no', e.target.value)}
                    />
                  </td>
                  <td className="qc-mt-label-cell" style={{ borderTop: 'none', borderBottom: 'none' }}>Mfg. Date</td>
                  <td className="qc-mt-value-cell" style={{ borderTop: 'none', borderBottom: 'none' }}>
                    <QcDateField
                      value={data.mfg_date}
                      onChange={(e) => updateField('mfg_date', e.target.value)}
                    />
                  </td>
                  <td className="qc-mt-label-cell" style={{ borderTop: 'none', borderBottom: 'none' }}>Best before use</td>
                  <td className="qc-mt-value-cell" style={{ borderRight: 'none', borderTop: 'none', borderBottom: 'none' }}>
                    <QcAutoCell
                      value={data.best_before}
                      align="center"
                      onChange={(e) => updateField('best_before', e.target.value)}
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>

        {/* Row 9: Sample Received Date | Date of Analysis */}
        <tr className="qc-mt-info-row">
          <td className="qc-mt-label-cell">Sample Received Date</td>
          <td className="qc-mt-value-cell">
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

        {/* Row 10: AR. No. | Mfg. Lic. No. */}
        <tr className="qc-mt-info-row">
          <td className="qc-mt-label-cell">AR. No.</td>
          <td className="qc-mt-value-cell">
            <QcAutoCell
              value={data.ar_no}
              onChange={(e) => updateField('ar_no', e.target.value)}
            />
          </td>
          <td className="qc-mt-label-cell">Mfg. Lic. No.</td>
          <td className="qc-mt-value-cell">
            <QcAutoCell
              value={data.mfg_lic_no}
              onChange={(e) => updateField('mfg_lic_no', e.target.value)}
            />
          </td>
        </tr>
      </tbody>
    </table>
  )

  // 2. Test Parameters Table (6 rows)
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
          <th className="qc-mt-test-th" style={{ textAlign: 'center' }}>Sr.No.</th>
          <th className="qc-mt-test-th" style={{ textAlign: 'center' }}>Test Parameters</th>
          <th className="qc-mt-test-th" style={{ textAlign: 'center' }}>Result</th>
          <th className="qc-mt-test-th" style={{ textAlign: 'center' }}>Limits</th>
        </tr>
      </thead>
      <tbody>
        {data.test_rows.map((row, idx) => (
          <tr key={row.sr || idx} className="qc-mt-test-row">
            <td className="qc-mt-test-td-sr" style={{ textAlign: 'center' }}>{row.sr}</td>
            <td className="qc-mt-test-td-param">{row.param}</td>
            <td className="qc-mt-test-td-input">
              <QcAutoCell
                value={row.result}
                align="center"
                onChange={(e) => updateTestRow(idx, 'result', e.target.value)}
              />
            </td>
            <td className="qc-mt-test-td-input">
              <QcAutoCell
                value={row.limit}
                align="center"
                onChange={(e) => updateTestRow(idx, 'limit', e.target.value)}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )

  // 3. Sign-off Table & Footer
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
            <th className="qc-mt-signoff-th">Analysed by (QC)</th>
            <th className="qc-mt-signoff-th">Approved By (QA)</th>
          </tr>
        </thead>
        <tbody>
          <tr className="qc-mt-signoff-name-row">
            <td className="qc-mt-signoff-label">Name</td>
            <td className="qc-mt-signoff-input-cell">
              <QcAutoCell
                value={data.analysed_name}
                onChange={(e) => updateField('analysed_name', e.target.value)}
              />
            </td>
            <td className="qc-mt-signoff-input-cell">
              <QcAutoCell
                value={data.approved_name}
                onChange={(e) => updateField('approved_name', e.target.value)}
              />
            </td>
          </tr>
          <tr className="qc-mt-signoff-sig-row">
            <td className="qc-mt-signoff-label">Signature</td>
            <td className="qc-mt-signoff-input-cell">
              <QcAutoCell
                value={data.analysed_signature}
                onChange={(e) => updateField('analysed_signature', e.target.value)}
              />
            </td>
            <td className="qc-mt-signoff-input-cell">
              <QcAutoCell
                value={data.approved_signature}
                onChange={(e) => updateField('approved_signature', e.target.value)}
              />
            </td>
          </tr>
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

      <div className="qc-mt-page-footer">
        <span className="qc-mt-footer-sop">SOP/QC/11/F-04/00</span>
        <span className="qc-mt-footer-page">
          Page <strong>1</strong> of <strong>1</strong>
        </span>
      </div>
    </div>
  )

  const renderSheet = () => (
    <div className="qc-mt-sheet" id="qc-mother-tincture-page-1" key="qc-mother-tincture-page-1">
      {renderHeaderBlock()}
      <div className="qc-mt-header-gap" />
      {renderTestTable()}
      <div className="qc-mt-remarks-wrap">
        <p className="qc-mt-remarks-text">
          <strong>Remarks:</strong> The above product complies / does not comply as per Homeopathic Pharmacopoeia of India.
        </p>
      </div>

      {/* Large empty area with optional notes */}
      <div className="qc-mt-blank-area" style={{ flex: 1, minHeight: '180pt', position: 'relative' }}>
        <textarea
          className="qc-blank-area-notes no-print"
          placeholder=""
          value={data.remarks_notes || ''}
          onChange={(e) => updateField('remarks_notes', e.target.value)}
          style={{
            width: '100%',
            height: '100%',
            minHeight: '180pt',
            border: 'none',
            background: 'transparent',
            resize: 'none',
            outline: 'none',
            fontFamily: 'inherit',
            fontSize: '11pt',
          }}
        />
        {data.remarks_notes ? (
          <div className="qc-blank-area-print print-only" style={{ whiteSpace: 'pre-wrap' }}>
            {data.remarks_notes}
          </div>
        ) : null}
      </div>

      {renderSignOffSection()}
    </div>
  )

  return (
    <div className="qc-view-wrapper">
      {/* Top Bar */}
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

          <span className="qc-dosage-pill">
            {dosageForm} (1 Page CoA)
          </span>

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
            title="Print 1 Page Certificate of Analysis"
          >
            🖨️ Print CoA
          </button>
        </div>
      </div>

      {/* Screen Sheet Display */}
      <div className="qc-layout no-print" style={{ justifyContent: 'center', padding: '24px 0' }}>
        <div className="qc-interactive-screen-sheet">
          {renderSheet()}
        </div>
      </div>

      {/* Print-Only Container */}
      <div className="qc-print-only-container">
        {renderSheet()}
      </div>
    </div>
  )
}
