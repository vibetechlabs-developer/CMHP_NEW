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
import './QcTabletView.css'

const DEFAULT_TABLET_TEST_PARAMETERS = [
  { sr: '1.', param: 'Description', result: '', limit: '' },
  { sr: '2.', param: 'Weight Of 20 Tablets', result: '', limit: '' },
  { sr: '3.', param: 'Average Weight of 1 Tablet', result: '', limit: '' },
  { sr: '4.', param: 'Diameter', result: '', limit: '' },
  { sr: '5.', param: 'Thickness', result: '', limit: '' },
  { sr: '6.', param: 'Loss On Drying', result: '', limit: '' },
  { sr: '7.', param: 'Total Ash', result: '', limit: '' },
]

const DEFAULT_TABLET_LABEL_CLAIM_ROWS = Array.from({ length: 7 }, (_, i) => ({
  sr: String(i + 1),
  content: '',
  potency: '',
  result: 'Complies',
}))

export default function QcTabletView({
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
      reduxBmrs[`tablet_${orderId}`] ||
      (currentOrder?.batch_no ? reduxBmrs[`tablet_${currentOrder.batch_no}`] : null) ||
      {}
    )
  }, [propBmr, reduxBmrs, orderId, currentOrder])

  const dosageForm = propDosageForm || 'Tablet'

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
    const mfgLicNo = currentOrder?.mfg_lic_no || currentProduct?.mfg_lic_no || currentBmr?.header?.mfg_lic_no || 'GH-7'
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
    setPrintCurrentOnly(false)
    setTimeout(() => {
      window.print()
    }, 150)
  }, [dispatch, storageKey, orderId, data])

  const handlePrintCurrent = useCallback(() => {
    if (orderId) {
      dispatch(saveOrderQc({ orderId: storageKey, qcData: data }))
    }
    setPrintCurrentOnly(true)
    setTimeout(() => {
      window.print()
      setPrintCurrentOnly(false)
    }, 150)
  }, [dispatch, storageKey, orderId, data])

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

  // 1. Header Box
  const renderHeaderBox = () => (
    <div className="qc-tablet-header-box">
      <div className="qc-tablet-header-content">
        <div className={`qc-tablet-logo-wrap ${branding.isTej ? 'qc-tablet-logo-wrap-tej' : ''}`}>
          {branding.isTej ? (
            <img src={branding.logoSrc} alt={branding.headerName} className="qc-tablet-logo-img qc-tablet-logo-img-tej" loading="eager" />
          ) : (
            <img src={cmhpLogo} alt="CMHP Logo" className="qc-tablet-logo-img" />
          )}
        </div>
        <div className="qc-tablet-company-title">
          {branding.isTej ? branding.headerName : 'CMHP PRIVATE LIMITED'}
        </div>
      </div>
      <div className="qc-tablet-blank-space" />
    </div>
  )

  // 2. Title Section
  const renderTitleRows = () => (
    <div className="qc-tablet-title-section">
      <div className="qc-tablet-title-bar qc-bar-quality-control">Quality Control</div>
      <div className="qc-tablet-title-bar qc-bar-coa-title">CERTIFICATE OF ANALYSIS (FINISHED PRODUCT)</div>
    </div>
  )

  // 3. Info Grid Table (Shared between Page 1 and Page 2)
  const renderInfoGrid = () => (
    <div className="qc-tablet-info-wrap">
      <table className="qc-tablet-info-table">
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
              <QcAutoCell
                value={data.product}
                onChange={(e) => updateField('product', e.target.value)}
              />
            </td>
            <td className="qc-label-cell">Product Code</td>
            <td className="qc-value-cell">
              <QcAutoCell
                value={data.product_code}
                onChange={(e) => updateField('product_code', e.target.value)}
              />
            </td>
          </tr>

          {/* Row 2 */}
          <tr className="qc-tablet-info-row-2">
            <td colSpan={2} className="qc-label-cell">SPC No.</td>
            <td colSpan={2} className="qc-value-cell">
              <QcAutoCell
                value={data.spc_no}
                onChange={(e) => updateField('spc_no', e.target.value)}
              />
            </td>
            <td className="qc-label-cell">Reference STP No.</td>
            <td className="qc-value-cell">
              <QcAutoCell
                value={data.reference_stp_no}
                onChange={(e) => updateField('reference_stp_no', e.target.value)}
              />
            </td>
          </tr>

          {/* Row 3 */}
          <tr className="qc-tablet-info-row-3">
            <td colSpan={2} className="qc-label-cell">Reference</td>
            <td colSpan={2} className="qc-value-cell">
              <div className="qc-tablet-static-text">Homeopathic Pharmacopoeia of India</div>
            </td>
            <td className="qc-label-cell">Quantity Sample</td>
            <td className="qc-value-cell">
              <QcAutoCell
                value={data.quantity_sample}
                onChange={(e) => updateField('quantity_sample', e.target.value)}
              />
            </td>
          </tr>

          {/* Row 4 */}
          <tr className="qc-tablet-info-row-4">
            <td colSpan={2} className="qc-label-cell">SPC as per</td>
            <td colSpan={2} className="qc-value-cell">
              <div className="qc-tablet-static-text">In house</div>
            </td>
            <td className="qc-label-cell">Batch Quantity</td>
            <td className="qc-value-cell">
              <QcAutoCell
                value={data.batch_quantity}
                onChange={(e) => updateField('batch_quantity', e.target.value)}
              />
            </td>
          </tr>

          {/* Row 5 - 6 columns */}
          <tr className="qc-tablet-info-row-5">
            <td className="qc-label-cell" style={{ width: '63.0pt' }}>Batch No.</td>
            <td className="qc-value-cell" style={{ width: '63.0pt' }}>
              <QcAutoCell
                value={data.batch_no}
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
              <QcAutoCell
                value={data.ar_no}
                onChange={(e) => updateField('ar_no', e.target.value)}
              />
            </td>
            <td className="qc-label-cell">Mfg. Lic. No.</td>
            <td className="qc-value-cell">
              <QcAutoCell
                value={data.mfg_lic_no}
                onChange={(e) => updateField('mfg_lic_no', e.target.value)}
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )

  // 4. Sign-off Table (2 columns: Analysed by (QC) | Approved By (QA))
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
            <th className="qc-tablet-signoff-th">Analysed by (QC)</th>
            <th className="qc-tablet-signoff-th">Approved By (QA)</th>
          </tr>
        </thead>
        <tbody>
          <tr className="qc-tablet-signoff-name-row">
            <td className="qc-tablet-signoff-label">Name</td>
            <td className="qc-tablet-signoff-input-cell">
              <QcAutoCell
                value={data.analysed_name}
                onChange={(e) => updateField('analysed_name', e.target.value)}
              />
            </td>
            <td className="qc-tablet-signoff-input-cell">
              <QcAutoCell
                value={data.approved_name}
                onChange={(e) => updateField('approved_name', e.target.value)}
              />
            </td>
          </tr>
          <tr className="qc-tablet-signoff-sig-row">
            <td className="qc-tablet-signoff-label">Signature</td>
            <td className="qc-tablet-signoff-input-cell">
              <QcAutoCell
                value={data.analysed_signature}
                onChange={(e) => updateField('analysed_signature', e.target.value)}
              />
            </td>
            <td className="qc-tablet-signoff-input-cell">
              <QcAutoCell
                value={data.approved_signature}
                onChange={(e) => updateField('approved_signature', e.target.value)}
              />
            </td>
          </tr>
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

  // Page 1 Renderer
  const renderPage1 = () => (
    <div className="qc-sheet" id="qc-tablet-page-1" key="qc-tablet-page-1">
      {renderHeaderBox()}
      {renderTitleRows()}
      {renderInfoGrid()}

      <div className="qc-tablet-gap-header-body" style={{ height: '8pt' }} />

      {/* Test Parameters Table (7 rows verbatim from master) */}
      <table className="qc-tablet-test-table">
        <colgroup>
          <col style={{ width: '47.0pt' }} />
          <col style={{ width: '141.0pt' }} />
          <col style={{ width: '152.0pt' }} />
          <col style={{ width: '184.0pt' }} />
        </colgroup>
        <thead>
          <tr className="qc-tablet-test-header-row">
            <th className="qc-tablet-test-th" style={{ textAlign: 'center' }}>Sr.No.</th>
            <th className="qc-tablet-test-th" style={{ textAlign: 'center' }}>Test Parameters</th>
            <th className="qc-tablet-test-th" style={{ textAlign: 'center' }}>Result</th>
            <th className="qc-tablet-test-th" style={{ textAlign: 'center' }}>Limits</th>
          </tr>
        </thead>
        <tbody>
          {data.test_rows.map((row, idx) => (
            <tr key={row.sr || idx} className="qc-tablet-test-row">
              <td className="qc-tablet-test-td-sr" style={{ textAlign: 'center' }}>{row.sr}</td>
              <td className="qc-tablet-test-td-param">{row.param}</td>
              <td className="qc-tablet-test-td-input">
                <QcAutoCell
                  value={row.result}
                  align="center"
                  onChange={(e) => updateTestRow(idx, 'result', e.target.value)}
                />
              </td>
              <td className="qc-tablet-test-td-input">
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

      <div className="qc-tablet-gap-test-lc" style={{ height: '8pt' }} />

      <div className="qc-tablet-lc-caption">
        Label Claim: [Each gm contains]
      </div>

      {/* Label Claim Table (7 rows) */}
      <table className="qc-tablet-lc-table">
        <colgroup>
          <col style={{ width: '47.0pt' }} />
          <col style={{ width: '204.0pt' }} />
          <col style={{ width: '100.0pt' }} />
          <col style={{ width: '173.0pt' }} />
        </colgroup>
        <thead>
          <tr className="qc-tablet-lc-header-row">
            <th className="qc-tablet-lc-th" style={{ textAlign: 'center' }}>Sr No.</th>
            <th className="qc-tablet-lc-th" style={{ textAlign: 'center' }}>Content</th>
            <th className="qc-tablet-lc-th" style={{ textAlign: 'center' }}>Potency</th>
            <th className="qc-tablet-lc-th" style={{ textAlign: 'center' }}>Results</th>
          </tr>
        </thead>
        <tbody>
          {data.label_claim_rows.map((row, idx) => (
            <tr key={row.sr || idx} className="qc-tablet-lc-row">
              <td className="qc-tablet-lc-td-sr" style={{ textAlign: 'center' }}>{row.sr}</td>
              <td className="qc-lc-td-input">
                <QcAutoCell
                  value={row.content}
                  onChange={(e) => updateLabelClaimRow(idx, 'content', e.target.value)}
                />
              </td>
              <td className="qc-lc-td-input">
                <QcAutoCell
                  value={row.potency}
                  align="center"
                  onChange={(e) => updateLabelClaimRow(idx, 'potency', e.target.value)}
                />
              </td>
              <td className="qc-lc-td-input">
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

      <div className="qc-tablet-lc-note" style={{ fontSize: '9pt', marginTop: '4pt' }}>
        *Results are taken from Bulk Release Slip report.
      </div>

      <div className="qc-tablet-p1-textblock" style={{ fontSize: '9pt', lineHeight: '1.25', margin: '4pt 0' }}>
        <p style={{ margin: '0 0 3pt 0' }}>
          <strong>Analysis of Finished Product Contents:</strong> All triturations, mentioned above, were tested and approved individually as per H.P.I. and these approved triturations were prepared from high quality IP approved Lactose and H.P.I approved herbs in presence of Production personnel and QA personnel. The triturations were qualitatively analyzed and approved as per H.P.I. by the QC. For finished product, the quantitative analysis of each trituration mentioned above, is not performed as the method of analysis for each trituration is not available. Hence the results are on the basis of the addition of each approved trituration and the whole addition activity of approved trituration is carried out in the presence of Production and the QA authorities.
        </p>
        <p style={{ margin: '0' }}>
          <strong>Remarks:</strong> The above product complies / does not comply as per in house specification
        </p>
      </div>

      <div className="qc-spacer-flex" />

      {renderSignOffTable()}

      <div className="qc-page-footer">
        <span className="qc-footer-sop">SOP/QC/11/F-05/00</span>
        <span className="qc-footer-page">
          Page <strong>1</strong> of 2
        </span>
      </div>
    </div>
  )

  // Page 2 Renderer
  const renderPage2 = () => (
    <div className="qc-sheet" id="qc-tablet-page-2" key="qc-tablet-page-2">
      {renderHeaderBox()}
      {renderTitleRows()}
      {renderInfoGrid()}

      <div className="qc-tablet-gap-page2" style={{ height: '14pt' }} />

      {/* Large empty area */}
      <div className="qc-tablet-page2-blank-area" style={{ flex: 1, minHeight: '180pt', position: 'relative' }}>
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

      <div className="qc-spacer-flex" />

      {renderSignOffTable()}

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
            {dosageForm} (2 Pages CoA)
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
            title="Prints all 2 pages formatted as in the original master"
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
        </div>
      </div>

      {/* Screen Layout with Left Navigator */}
      <div className="qc-layout no-print">
        <aside className="qc-sidebar-nav">
          <div className="qc-nav-header">
            <span>QC Pages ({completedCount}/2)</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#0284c7' }}>
              {Math.round((completedCount / 2) * 100)}%
            </span>
          </div>

          <div className="qc-nav-list">
            {[
              { id: 1, title: 'Page 1 of 2 (Parameters & Content)' },
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

        <main className="qc-main-content">
          <div className="qc-interactive-screen-sheet">
            {activePage === 1 ? renderPage1() : renderPage2()}
          </div>

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
              Page {activePage} of 2 — {activePage === 1 ? 'Parameters & Content' : 'Remarks & Sign-off'}
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

      {/* Print Container: exactly 2 pages */}
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
