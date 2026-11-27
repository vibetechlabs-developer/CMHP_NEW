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
import './QcDropsView.css'

const DEFAULT_DROPS_TEST_PARAMETERS = [
  { sr: '1.', param: 'Appearance', result: '', limit: '' },
  { sr: '2.', param: 'pH *', result: '', limit: '' },
  { sr: '3.', param: 'Weight/ml (gm/ml) *', result: '', limit: '' },
  { sr: '4.', param: 'Alcohol (% v/v) *', result: '', limit: '' },
  { sr: '5.', param: 'Volume (ml)', result: '', limit: '' },
]

const DEFAULT_DROPS_LABEL_CLAIM_ROWS = Array.from({ length: 7 }, (_, i) => ({
  sr: String(i + 1),
  content: '',
  potency: '',
  result: 'Complies',
}))

export default function QcDropsView({
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
      reduxBmrs[`drops_${orderId}`] ||
      (currentOrder?.batch_no ? reduxBmrs[`drops_${currentOrder.batch_no}`] : null) ||
      {}
    )
  }, [propBmr, reduxBmrs, orderId, currentOrder])

  const dosageForm = propDosageForm || 'Drops'

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
    const bestBefore = formatDateDDMMYYYY(
      currentOrder?.best_before || currentOrder?.expiry_date || currentOrder?.exp_date || currentBmr?.page1?.exp_date || ''
    )
    const mfgLicNo = currentOrder?.mfg_lic_no || currentProduct?.mfg_lic_no || currentBmr?.header?.mfg_lic_no || ''
    const qtySample = currentOrder?.quantity_sample || ''

    return {
      product: productTitle,
      product_code: productCode,
      spc_no: '',
      reference_stp_no: '',
      reference: 'Homeopathic Pharmacopoeia of India',
      quantity_sample: qtySample,
      spc_as_per: 'In house',
      batch_quantity: batchQty,
      batch_no: batchNumber,
      mfg_date: mfgDate,
      best_before: bestBefore,
      sample_received_date: '',
      date_of_analysis: '',
      ar_no: '',
      mfg_lic_no: mfgLicNo,

      test_rows: DEFAULT_DROPS_TEST_PARAMETERS.map((row) => ({ ...row })),
      label_claim_rows: DEFAULT_DROPS_LABEL_CLAIM_ROWS.map((row) => ({ ...row })),

      analysed_name: '',
      analysed_signature: '',
      analysed_date: '',
      approved_name: '',
      approved_signature: '',
      approved_date: '',
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

  const updateLabelClaimRow = (index, field, val) => {
    setData((prev) => {
      const nextRows = [...prev.label_claim_rows]
      nextRows[index] = { ...nextRows[index], [field]: val }
      return { ...prev, label_claim_rows: nextRows }
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

  // 1. Header Box
  const renderHeaderBox = () => (
    <div className="qc-drops-header-box">
      <div className="qc-drops-header-content">
        <div className={`qc-drops-logo-wrap ${branding.isTej ? 'qc-drops-logo-wrap-tej' : ''}`}>
          {branding.isTej ? (
            <img src={branding.logoSrc} alt={branding.headerName} className="qc-drops-logo-img qc-drops-logo-img-tej" loading="eager" />
          ) : (
            <img src={cmhpLogo} alt="CMHP Logo" className="qc-drops-logo-img" />
          )}
        </div>
        <div className="qc-drops-company-title">
          {branding.isTej ? branding.headerName : 'CMHP PRIVATE LIMITED'}
        </div>
      </div>
    </div>
  )

  // 2. Title Section
  const renderTitleSection = () => (
    <div className="qc-drops-title-section">
      <div className="qc-drops-title-bar qc-drops-bar-qc">Quality Control</div>
      <div className="qc-drops-title-bar qc-drops-bar-coa">CERTIFICATE OF ANALYSIS (FINISHED PRODUCT)</div>
    </div>
  )

  // 3. Header Grid Table
  const renderHeaderTable = () => (
    <table className="qc-drops-header-table">
      <colgroup>
        <col style={{ width: '13.33%' }} />
        <col style={{ width: '36.67%' }} />
        <col style={{ width: '17.33%' }} />
        <col style={{ width: '32.67%' }} />
      </colgroup>
      <tbody>
        <tr>
          <td className="qc-drops-label-cell">Product</td>
          <td className="qc-drops-value-cell">
            <QcAutoCell
              value={data.product}
              onChange={(e) => updateField('product', e.target.value)}
            />
          </td>
          <td className="qc-drops-label-cell">Product Code</td>
          <td className="qc-drops-value-cell">
            <QcAutoCell
              value={data.product_code}
              onChange={(e) => updateField('product_code', e.target.value)}
            />
          </td>
        </tr>
        <tr>
          <td className="qc-drops-label-cell">SPC No.</td>
          <td className="qc-drops-value-cell">
            <QcAutoCell
              value={data.spc_no}
              onChange={(e) => updateField('spc_no', e.target.value)}
            />
          </td>
          <td className="qc-drops-label-cell">Reference STP No.</td>
          <td className="qc-drops-value-cell">
            <QcAutoCell
              value={data.reference_stp_no}
              onChange={(e) => updateField('reference_stp_no', e.target.value)}
            />
          </td>
        </tr>
        <tr>
          <td className="qc-drops-label-cell">Reference</td>
          <td className="qc-drops-value-cell">
            <div className="qc-static-text">Homeopathic Pharmacopoeia of India</div>
          </td>
          <td className="qc-drops-label-cell">Quantity Sample</td>
          <td className="qc-drops-value-cell">
            <QcAutoCell
              value={data.quantity_sample}
              onChange={(e) => updateField('quantity_sample', e.target.value)}
            />
          </td>
        </tr>
        <tr>
          <td className="qc-drops-label-cell">SPC as per</td>
          <td className="qc-drops-value-cell">
            <div className="qc-static-text">In house</div>
          </td>
          <td className="qc-drops-label-cell">Batch Quantity</td>
          <td className="qc-drops-value-cell">
            <QcAutoCell
              value={data.batch_quantity}
              onChange={(e) => updateField('batch_quantity', e.target.value)}
            />
          </td>
        </tr>
        {/* Row 5: 6 columns */}
        <tr>
          <td colSpan={4} style={{ padding: 0, border: 'none' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', border: 'none' }}>
              <colgroup>
                <col style={{ width: '13.33%' }} />
                <col style={{ width: '15.00%' }} />
                <col style={{ width: '13.00%' }} />
                <col style={{ width: '15.00%' }} />
                <col style={{ width: '17.33%' }} />
                <col style={{ width: '26.34%' }} />
              </colgroup>
              <tbody>
                <tr>
                  <td className="qc-drops-label-cell" style={{ borderLeft: 'none', borderTop: 'none', borderBottom: 'none' }}>Batch No.</td>
                  <td className="qc-drops-value-cell" style={{ borderTop: 'none', borderBottom: 'none' }}>
                    <QcAutoCell
                      value={data.batch_no}
                      onChange={(e) => updateField('batch_no', e.target.value)}
                    />
                  </td>
                  <td className="qc-drops-label-cell" style={{ borderTop: 'none', borderBottom: 'none' }}>Mfg. Date</td>
                  <td className="qc-drops-value-cell" style={{ borderTop: 'none', borderBottom: 'none' }}>
                    <QcDateField
                      value={data.mfg_date}
                      onChange={(e) => updateField('mfg_date', e.target.value)}
                    />
                  </td>
                  <td className="qc-drops-label-cell" style={{ borderTop: 'none', borderBottom: 'none' }}>BEST BEFORE</td>
                  <td className="qc-drops-value-cell" style={{ borderRight: 'none', borderTop: 'none', borderBottom: 'none' }}>
                    <QcDateField
                      value={data.best_before}
                      onChange={(e) => updateField('best_before', e.target.value)}
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>
        <tr>
          <td className="qc-drops-label-cell">Sample Received Date</td>
          <td className="qc-drops-value-cell">
            <QcDateField
              value={data.sample_received_date}
              onChange={(e) => updateField('sample_received_date', e.target.value)}
            />
          </td>
          <td className="qc-drops-label-cell">Date of Analysis</td>
          <td className="qc-drops-value-cell">
            <QcDateField
              value={data.date_of_analysis}
              onChange={(e) => updateField('date_of_analysis', e.target.value)}
            />
          </td>
        </tr>
        <tr>
          <td className="qc-drops-label-cell">AR. No.</td>
          <td className="qc-drops-value-cell">
            <QcAutoCell
              value={data.ar_no}
              onChange={(e) => updateField('ar_no', e.target.value)}
            />
          </td>
          <td className="qc-drops-label-cell">Mfg. Lic. No.</td>
          <td className="qc-drops-value-cell">
            <QcAutoCell
              value={data.mfg_lic_no}
              onChange={(e) => updateField('mfg_lic_no', e.target.value)}
            />
          </td>
        </tr>
      </tbody>
    </table>
  )

  // 4. Test Parameters Table
  const renderTestTable = () => (
    <table className="qc-drops-test-table">
      <colgroup>
        <col style={{ width: '8.58%' }} />
        <col style={{ width: '27.53%' }} />
        <col style={{ width: '28.70%' }} />
        <col style={{ width: '35.19%' }} />
      </colgroup>
      <thead>
        <tr>
          <th className="qc-drops-test-th" style={{ textAlign: 'center' }}>Sr.No.</th>
          <th className="qc-drops-test-th" style={{ textAlign: 'center' }}>Test Parameters</th>
          <th className="qc-drops-test-th" style={{ textAlign: 'center' }}>Result</th>
          <th className="qc-drops-test-th" style={{ textAlign: 'center' }}>Limits</th>
        </tr>
      </thead>
      <tbody>
        {data.test_rows.map((row, idx) => (
          <tr key={row.sr || idx}>
            <td className="qc-drops-test-td-sr" style={{ textAlign: 'center' }}>{row.sr}</td>
            <td className="qc-drops-test-td-param">{row.param}</td>
            <td className="qc-drops-test-td-input">
              <QcAutoCell
                value={row.result}
                align="center"
                onChange={(e) => updateTestRow(idx, 'result', e.target.value)}
              />
            </td>
            <td className="qc-drops-test-td-input">
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

  // 5. Label Claim Table
  const renderLabelClaimSection = () => (
    <div style={{ flexShrink: 0 }}>
      <div className="qc-drops-lc-caption">
        Label Claim: [Each ml contains&#125;
      </div>
      <table className="qc-drops-lc-table">
        <colgroup>
          <col style={{ width: '8.87%' }} />
          <col style={{ width: '39.28%' }} />
          <col style={{ width: '18.52%' }} />
          <col style={{ width: '33.33%' }} />
        </colgroup>
        <thead>
          <tr>
            <th className="qc-drops-lc-th" style={{ textAlign: 'center' }}>Sr No.</th>
            <th className="qc-drops-lc-th" style={{ textAlign: 'center' }}>Content</th>
            <th className="qc-drops-lc-th" style={{ textAlign: 'center' }}>Potency</th>
            <th className="qc-drops-lc-th" style={{ textAlign: 'center' }}>Results</th>
          </tr>
        </thead>
        <tbody>
          {data.label_claim_rows.map((row, idx) => (
            <tr key={row.sr || idx}>
              <td className="qc-drops-lc-td-sr" style={{ textAlign: 'center' }}>{row.sr}</td>
              <td className="qc-drops-lc-td-content">
                <QcAutoCell
                  value={row.content}
                  onChange={(e) => updateLabelClaimRow(idx, 'content', e.target.value)}
                />
              </td>
              <td className="qc-drops-lc-td-center">
                <QcAutoCell
                  value={row.potency}
                  align="center"
                  onChange={(e) => updateLabelClaimRow(idx, 'potency', e.target.value)}
                />
              </td>
              <td className="qc-drops-lc-td-center">
                <QcAutoCell
                  value={row.result}
                  align="center"
                  onChange={(e) => updateLabelClaimRow(idx, 'result', e.target.value)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="qc-drops-footnote">
        *Results are taken from Bulk Release Slip report.
      </div>
    </div>
  )

  // 6. Text and Remarks
  const renderTextAndRemarks = () => (
    <div style={{ flexShrink: 0 }}>
      <div className="qc-drops-text-block">
        <p>
          Analysis of Finished Product Contents: All herbs, mentioned above, were tested and approved individually as per H.P.I. and these approved herbs were used for the preparation of respective mother tinctures in presence of Production personnel and QA personnel.
        </p>
        <p>
          The mother tinctures were qualitatively analyzed and approved as per H.P.I. by the QC.
        </p>
        <p>
          For finished product, the quantitative analysis of each mother tincture mentioned above, is not performed as the method of analysis for each mother tincture is not available. Hence the results are on the basis of the addition of the each approved mother tincture and the whole addition activity of approved mother tincture addition is carried out in the presence of Production and the QA authorities.
        </p>
      </div>
      <div className="qc-drops-remarks-block">
        Remarks: The above product complies / does not comply as per in house specification
      </div>
    </div>
  )

  // 7. Sign-off Table & Footer
  const renderSignOffSection = () => (
    <div className="qc-drops-footer-section">
      <table className="qc-drops-signoff-table">
        <colgroup>
          <col style={{ width: '15.15%' }} />
          <col style={{ width: '37.62%' }} />
          <col style={{ width: '47.22%' }} />
        </colgroup>
        <thead>
          <tr>
            <th className="qc-drops-signoff-grey-cell" />
            <th className="qc-drops-signoff-th">Analysed by (QC)</th>
            <th className="qc-drops-signoff-th">Approved By (QA)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="qc-drops-signoff-label">Name</td>
            <td className="qc-drops-signoff-cell">
              <QcAutoCell
                value={data.analysed_name}
                onChange={(e) => updateField('analysed_name', e.target.value)}
              />
            </td>
            <td className="qc-drops-signoff-cell">
              <QcAutoCell
                value={data.approved_name}
                onChange={(e) => updateField('approved_name', e.target.value)}
              />
            </td>
          </tr>
          <tr className="qc-drops-signoff-row-sig">
            <td className="qc-drops-signoff-label">Signature</td>
            <td className="qc-drops-signoff-cell">
              <QcAutoCell
                value={data.analysed_signature}
                onChange={(e) => updateField('analysed_signature', e.target.value)}
              />
            </td>
            <td className="qc-drops-signoff-cell">
              <QcAutoCell
                value={data.approved_signature}
                onChange={(e) => updateField('approved_signature', e.target.value)}
              />
            </td>
          </tr>
          <tr>
            <td className="qc-drops-signoff-label">Date</td>
            <td className="qc-drops-signoff-cell">
              <QcDateField
                value={data.analysed_date}
                onChange={(e) => updateField('analysed_date', e.target.value)}
              />
            </td>
            <td className="qc-drops-signoff-cell">
              <QcDateField
                value={data.approved_date}
                onChange={(e) => updateField('approved_date', e.target.value)}
              />
            </td>
          </tr>
        </tbody>
      </table>

      <div className="qc-drops-page-footer">
        <span className="qc-drops-footer-sop">SOP/QC/11/F-05/00</span>
        <span className="qc-drops-footer-page">
          Page <strong>1</strong> of 1
        </span>
      </div>
    </div>
  )

  const renderSheet = () => (
    <div className="qc-drops-sheet" id="qc-drops-sheet">
      {renderHeaderBox()}
      {renderTitleSection()}
      {renderHeaderTable()}
      <div className="qc-drops-gap-8" />
      {renderTestTable()}
      <div className="qc-drops-gap-8" />
      {renderLabelClaimSection()}
      <div className="qc-drops-gap-6" />
      {renderTextAndRemarks()}
      <div className="qc-drops-spacer" />
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
