import React, { useEffect, useState, useMemo, useRef } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { formatDateDDMMYYYY, toIsoDate } from './bmrDateUtils'
import { productionService } from './productionService'
import { listBatchPlans } from '../manufacturing/batchPlansService'
import {
  getBmrTemplate,
  normalizeProductTypeKey,
  getProductTypeDisplayName,
  BMR_REGISTRY,
} from './bmrTemplates'
import NoBmrScreen from './NoBmrScreen'
import { getCompanyBranding, isTejBiocare } from '../../utils/companyBranding.js'
import { selectActiveCompanyKey } from '../../utils/companySelectors'
import cmhpLogo from '../../assets/cmhp_bmr_logo.png'
import masterCopyImg from '../../assets/cmhp_master_copy.png'
import masterOilImg from '../../assets/cmhp_master_oil.png'
import './BmrForm.css'

export default function BmrForm({ readOnly = false, initialOrderId = null, onBack = null } = {}) {
  const navigate = useNavigate()
  const { orderId: paramOrderId } = useParams()
  const [searchParams] = useSearchParams()

  const queryOrderId = searchParams.get('orderId') || ''
  const orderLineId = searchParams.get('orderLineId') || ''
  const queryType = searchParams.get('productType') || searchParams.get('dosageForm') || searchParams.get('type') || ''
  const productId = searchParams.get('productId') || ''
  const productCode = searchParams.get('productCode') || ''
  const productName = searchParams.get('productName') || ''
  const bmrNo = searchParams.get('bmrNo') || ''
  const packSize = searchParams.get('packSize') || ''
  const returnTo = searchParams.get('returnTo') || ''

  // Detect if paramOrderId is a dosage-form slug (e.g. /production/bmr/syrup, /production/bmr/capsule)
  const isSlug = useMemo(() => {
    if (!paramOrderId) return false
    const lower = paramOrderId.toLowerCase().replace(/_/g, '-')
    return Boolean(
      lower in BMR_REGISTRY ||
      ['syrup', 'syrups', 'drops', 'drop', 'mother-tincture', 'mothertincture', 'mt',
       'tablet', 'tablets', 'tab', 'oil', 'oils', 'kits', 'kit', 'pills', 'pill',
       'liquid', 'liquids', 'capsule', 'capsules'].includes(lower)
    )
  }, [paramOrderId])

  const orderId = initialOrderId || (isSlug ? '' : (paramOrderId || queryOrderId))
  const slugType = isSlug ? paramOrderId : ''

  const [currentOrder, setCurrentOrder] = useState(null)
  const [activeSection, setActiveSection] = useState(1)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveFeedback, setSaveFeedback] = useState('')
  const [printCurrentOnly, setPrintCurrentOnly] = useState(false)
  const [loadError, setLoadError] = useState(null)

  // Resolve raw type string from available indicators
  const rawTypeString = useMemo(() => {
    if (slugType) return slugType
    if (queryType) return queryType
    if (currentOrder) {
      return (
        currentOrder.dosage_form ||
        currentOrder.dosageForm ||
        currentOrder.product_type ||
        currentOrder.type ||
        ''
      )
    }
    return ''
  }, [slugType, queryType, currentOrder])

  // Resolve template from registry (null for No-BMR types or unknown types)
  const template = useMemo(() => {
    if (!rawTypeString) return null
    return getBmrTemplate(rawTypeString)
  }, [rawTypeString])

  // Company branding
  const compKey = useSelector(selectActiveCompanyKey)
  const isTejActive = isTejBiocare(currentOrder) || isTejBiocare(compKey) || isTejBiocare()
  const branding = getCompanyBranding(isTejActive ? 'tej' : 'cmhp')

  const sections = useMemo(() => template?.sections || [], [template])
  const totalPages = template?.pagesCount || 19

  // Normalization
  const normalizeData = useMemo(() => {
    if (template?.normalizeData) {
      return (raw, ord) => {
        const normalized = template.normalizeData(raw, ord)
        return ord?.official_batch_number
          ? { ...normalized, header: { ...normalized.header, batch_no: ord.official_batch_number } }
          : normalized
      }
    }
    return (raw) => raw || {}
  }, [template])

  const [rawState, setRawState] = useState(() => (template?.getEmptyData ? template.getEmptyData() : {}))

  const data = useMemo(() => {
    return normalizeData(rawState, currentOrder)
  }, [normalizeData, rawState, currentOrder])

  const setData = (updater) => {
    setRawState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      const normalized = normalizeData(next, currentOrder)
      persistToRedux(normalized, true)
      return normalized
    })
  }

  // Persistent save
  const persistToRedux = async (updatedData, isDraft = true) => {
    if (readOnly || !currentOrder?.id) return
    try {
      const normalized = normalizeData(updatedData, currentOrder)
      await productionService.saveBmr({
        orderId: currentOrder.id,
        batchNo: currentOrder.batch_no || normalized.header?.batch_no,
        bmrType: template?.bmrType || 'drops',
        data: normalized,
        isDraft,
      })
      setSaveFeedback(`Saved at ${new Date().toLocaleTimeString()} ✓`)
      setTimeout(() => setSaveFeedback(''), 3000)
    } catch (err) {
      console.error('Failed saving BMR:', err)
    }
  }

  // Update Field Helpers
  const updateHeader = (field, val) => {
    setData((prev) => {
      const next = {
        ...(prev || {}),
        header: { ...(prev?.header || {}), [field]: val },
      }
      persistToRedux(next, true)
      return next
    })
  }

  const updateFooter = (pageIdx, field, val) => {
    setData((prev) => {
      const footers = [...(prev?.footers || [])]
      footers[pageIdx] = { ...(footers[pageIdx] || {}), [field]: val }
      const next = { ...(prev || {}), footers }
      persistToRedux(next, true)
      return next
    })
  }

  const updatePage = (pageKey, field, val) => {
    setData((prev) => {
      const next = {
        ...(prev || {}),
        [pageKey]: { ...(prev?.[pageKey] || {}), [field]: val },
      }
      persistToRedux(next, true)
      return next
    })
  }

  // Load Order & Existing BMR Data
  useEffect(() => {
    let isMounted = true
    async function loadData() {
      setLoading(true)
      setLoadError(null)
      try {
        let order = null

        // 1. If explicit orderId is given
        if (orderId) {
          order = await productionService.getOrderById(orderId)
        }

        // 2. If productId / productCode / bmrNo specified
        if (!order && (productId || productCode || bmrNo)) {
          const allOrders = await productionService.getOrders()
          order = allOrders?.find((o) =>
            isTejBiocare(o) === isTejActive && (
              (productId && String(o.product_id) === String(productId)) ||
              (productCode && (o.product_code === productCode || o.code === productCode)) ||
              (bmrNo && o.bmr_no === bmrNo)
            )
          ) || null

          if (!order) {
            const formName = queryType || slugType || 'Drops'
            order = {
              id: `prod-${productId || productCode}`,
              number: bmrNo || `BMR/${productCode || productId}`,
              product_id: productId,
              product_code: productCode,
              product_name: productName || productCode || `${formName} Master Formulation`,
              dosage_form: formName,
              dosageForm: formName,
              product_type: formName,
              type: formName,
              company: isTejActive ? 3 : 2,
              company_code: isTejActive ? 'TEJ' : 'CMHP',
              company_name: isTejActive ? 'Tej Biocare' : 'CMHP PRIVATE LIMITED',
              bmr_no: bmrNo || `BMR/${isTejActive ? 'TEJ' : 'CMHP'}/${productCode || productId}`,
              batch_no: bmrNo || `${productCode || 'BATCH'}-01`,
              batch_size: packSize || '100 L',
              is_product_bmr: true,
            }
          }
        }

        // 3. If direct slug access (e.g. /production/bmr/syrup, /production/bmr/capsule) or query param dosageForm
        if (!order && (slugType || queryType)) {
          const formName = getProductTypeDisplayName(slugType || queryType)
          order = {
            id: `demo-${normalizeProductTypeKey(formName)}`,
            number: `DEMO-${normalizeProductTypeKey(formName).toUpperCase()}-01`,
            product_name: `${formName} Master Formulation`,
            dosage_form: formName,
            dosageForm: formName,
            product_type: formName,
            type: formName,
            company: isTejActive ? 3 : 2,
            company_code: isTejActive ? 'TEJ' : 'CMHP',
            company_name: isTejActive ? 'Tej Biocare' : 'CMHP PRIVATE LIMITED',
            bmr_no: `BMR/CMHP/${normalizeProductTypeKey(formName).toUpperCase()}-001`,
            batch_no: `BATCH-${normalizeProductTypeKey(formName).toUpperCase()}-01`,
            batch_size: formName === 'Tablet' ? '100 Kg' : '100 L',
            is_product_bmr: true,
          }
        }

        // 4. Fallback if no order found and no type specified
        if (!order && !orderId) {
          const allOrders = await productionService.getOrders()
          order = allOrders?.[0] || null
        }

        const companyId = Number(order?.company_id || order?.company?.id || order?.company)
        const salesOrderId = String(order?.id || '')
        const targetProductId = Number(productId || order?.product_id)
        if (companyId && /^[1-9][0-9]*$/.test(salesOrderId) &&
            (!orderId || salesOrderId === String(orderId)) && (targetProductId || orderLineId)) {
          try {
            const plans = await listBatchPlans(companyId, {
              order: salesOrderId,
              ...(targetProductId ? { product: targetProductId } : {}),
              ...(orderLineId ? { order_line: orderLineId } : {}),
              page_size: 2,
            })
            const matches = plans.results || []
            const plan = matches.length === 1
              ? matches[0]
              : matches.find((entry) => entry.official_batch_number && entry.official_batch_number === order.batch_no)
            if (plan?.official_batch_number) {
              order = { ...order, batch_no: plan.official_batch_number, official_batch_number: plan.official_batch_number }
            }
          } catch (err) {
            console.warn('Could not load the official batch number:', err?.message)
          }
        }

        if (!isMounted) return
        setCurrentOrder(order)

        if (order) {
          const dForm = order.dosage_form || order.dosageForm || order.product_type || order.type || ''
          const tmpl = getBmrTemplate(dForm)
          if (tmpl) {
            const bmrType = tmpl.bmrType
            const bmrRes = await productionService.getBmr(order.id, order.batch_no, bmrType)
            if (!isMounted) return
            const existing = (bmrRes && bmrRes.data !== undefined) ? bmrRes.data : bmrRes
            const normalizer = tmpl.normalizeData
            const normalized = normalizer(existing, order)
            setRawState(normalized)
            if (existing) {
              setSaveFeedback('Database record loaded ✓')
              setTimeout(() => setSaveFeedback(''), 2500)
            }
          }
        }
      } catch (err) {
        console.error('Error loading BMR:', err)
        if (isMounted) setLoadError(err.message || 'Failed to load BMR')
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    loadData()
    return () => {
      isMounted = false
    }
  }, [orderId, orderLineId, productId, productCode, bmrNo, queryType, slugType, isTejActive])

  // Explicit Save & Complete Actions
  const handleSaveDraft = async () => {
    setSaving(true)
    await persistToRedux(data, true)
    setSaving(false)
  }

  const handleMarkComplete = async () => {
    setSaving(true)
    if (currentOrder?.id) {
      await productionService.updateProduction({
        id: currentOrder.id,
        bmr_status: 'YES',
      })
    }
    await persistToRedux(data, false)
    setSaving(false)
    setSaveFeedback('✓ BMR Completed and Status set to YES!')
    setTimeout(() => setSaveFeedback(''), 4000)
  }

  // Next / Save & Next
  const handleSaveAndNext = () => {
    persistToRedux(data, true)
    if (activeSection < totalPages) {
      setActiveSection((prev) => prev + 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const handlePrev = () => {
    if (activeSection > 1) {
      setActiveSection((prev) => prev - 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  // Print Handlers
  const handlePrintFull = () => {
    setPrintCurrentOnly(false)
    setTimeout(() => window.print(), 150)
  }

  const handlePrintCurrent = () => {
    setPrintCurrentOnly(true)
    setTimeout(() => {
      window.print()
      setPrintCurrentOnly(false)
    }, 150)
  }

  // Section completion statuses
  const sectionStatuses = useMemo(() => {
    const map = {}
    const getStatus = template?.getSectionStatus
    if (getStatus) {
      sections.forEach((sec) => {
        map[sec.id] = getStatus(data, sec.id)
      })
    }
    return map
  }, [data, sections, template])

  const completedCount = useMemo(() => {
    return Object.values(sectionStatuses).filter((s) => s === 'done').length
  }, [sectionStatuses])

  // Helpers passed into page renderers
  function BmrDateField({
    value,
    onChange,
    className = 'bmr-line-input',
    style,
    placeholder = 'dd/mm/yyyy',
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
        onChange(e)
      }
    }

    const openCalendar = () => {
      if (readOnly || disabled) return
      if (hiddenInputRef.current) {
        if (typeof hiddenInputRef.current.showPicker === 'function') {
          hiddenInputRef.current.showPicker()
        } else {
          hiddenInputRef.current.focus()
        }
      }
    }

    return (
      <div
        className={`bmr-date-field-wrap ${className}-wrap`}
        style={{
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          width: style?.width || '100%',
          boxSizing: 'border-box',
          verticalAlign: 'middle',
        }}
      >
        <input
          type="text"
          className={`${className} bmr-date-display`}
          value={displayVal}
          placeholder={placeholder}
          onChange={handleDisplayChange}
          onClick={openCalendar}
          readOnly={readOnly}
          disabled={disabled}
          style={{
            ...style,
            width: '100%',
            paddingRight: '16px',
            boxSizing: 'border-box',
          }}
          {...props}
        />
        <span
          className="bmr-date-picker-icon no-print"
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
      </div>
    )
  }

  const renderYesNo = (val, onToggle) => (
    <div className="bmr-yes-no-group">
      <button
        type="button"
        className={`bmr-yn-btn ${val === 'Yes' ? 'active-yes' : ''}`}
        onClick={() => onToggle('Yes')}
      >
        Yes
      </button>
      <button
        type="button"
        className={`bmr-yn-btn ${val === 'No' ? 'active-no' : ''}`}
        onClick={() => onToggle('No')}
      >
        No
      </button>
    </div>
  )

  // Dynamic Header Box (Adapts to department, master stamp, and form differences)
  const renderHeader = (pageNumber) => {
    const isMT = template?.key === 'mother-tincture'
    const showMaster = template?.showMasterTag
    const isOil = template?.masterTagType === 'master_oil'

    return (
      <div className="bmr-header-box">
        <div className="bmr-header-top-row">
          <div className={`bmr-logo-wrap${branding.isTej ? ' bmr-logo-wrap-tej' : ''}`}>
            {branding.isTej ? (
              <img src={branding.logoSrc} alt={branding.headerName} className="bmr-logo-img bmr-logo-tej" loading="eager" />
            ) : (
              <img src={cmhpLogo} alt="CMHP Logo" className="bmr-logo-img" />
            )}
          </div>
          <div className="bmr-company-title">
            {branding.isTej ? branding.headerName : 'CMHP PRIVATE LIMITED'}
          </div>
          <div className="bmr-master-copy">
            {showMaster && (
              isOil ? (
                <img src={masterOilImg} alt="MASTER" className="bmr-master-copy-img bmr-master-oil-img" />
              ) : (
                <img src={masterCopyImg} alt="MASTER COPY" className="bmr-master-copy-img" />
              )
            )}
          </div>
        </div>

        <div className="bmr-dept-title">{template?.department}</div>
        <div className="bmr-doc-title">BATCH MANUFACTURING RECORD (BMR)</div>

        {isMT ? (
          // Mother Tincture 4-row header grid
          <div className="bmr-header-grid bmr-header-grid-mt">
            {/* Row 1 */}
            <div className="bmr-grid-cell">
              <span className="bmr-grid-label">PRODUCT CODE :</span>
              <input
                className="bmr-grid-input"
                value={data.header?.product_code || ''}
                onChange={(e) => updateHeader('product_code', e.target.value)}
              />
            </div>
            <div className="bmr-grid-cell">
              <span className="bmr-grid-label">EFFECTIVE DATE :</span>
              <input
                className="bmr-grid-input"
                value={data.header?.effective_date !== undefined ? data.header.effective_date : '05/01/2025'}
                onChange={(e) => updateHeader('effective_date', e.target.value)}
              />
            </div>
            {/* Row 2 */}
            <div className="bmr-grid-cell">
              <span className="bmr-grid-label">BMR NO. :</span>
              <input
                className="bmr-grid-input"
                value={data.header?.bmr_no || ''}
                onChange={(e) => updateHeader('bmr_no', e.target.value)}
              />
            </div>
            <div className="bmr-grid-cell">
              <span className="bmr-grid-label">VERSION NO :</span>
              <input
                className="bmr-grid-input"
                value={data.header?.version_no !== undefined ? data.header.version_no : '01'}
                onChange={(e) => updateHeader('version_no', e.target.value)}
              />
            </div>
            {/* Row 3 */}
            <div className="bmr-grid-cell">
              <span className="bmr-grid-label">PRODUCT :</span>
              <input
                className="bmr-grid-input"
                value={data.header?.product || ''}
                onChange={(e) => updateHeader('product', e.target.value)}
              />
            </div>
            <div className="bmr-grid-cell">
              <span className="bmr-grid-label">SUPERSEDES NO :</span>
              <input
                className="bmr-grid-input"
                value={data.header?.supersedes_no !== undefined ? data.header.supersedes_no : '00'}
                onChange={(e) => updateHeader('supersedes_no', e.target.value)}
              />
            </div>
            {/* Row 4 */}
            <div className="bmr-grid-cell">
              <span className="bmr-grid-label">BATCH NO :</span>
              <input
                className="bmr-grid-input"
                value={data.header?.batch_no || ''}
                readOnly={readOnly || Boolean(currentOrder?.official_batch_number)}
                onChange={(e) => updateHeader('batch_no', e.target.value)}
              />
            </div>
            <div className="bmr-grid-cell">
              <span className="bmr-grid-label">MFG. FOR :</span>
              <input
                className="bmr-grid-input"
                value={data.header?.mfg_for !== undefined ? data.header.mfg_for : 'CMHP'}
                onChange={(e) => updateHeader('mfg_for', e.target.value)}
              />
            </div>
          </div>
        ) : (
          // Standard 5-row header grid (Syrup, Drops, Tablet, Oil)
          <div className="bmr-header-grid">
            {/* Row 1 */}
            <div className="bmr-grid-cell">
              <span className="bmr-grid-label">PRODUCT :</span>
              <input
                className="bmr-grid-input"
                value={data.header?.product || ''}
                onChange={(e) => updateHeader('product', e.target.value)}
              />
            </div>
            <div className="bmr-grid-cell">
              <span className="bmr-grid-label">BMR NO. :</span>
              <input
                className="bmr-grid-input"
                value={data.header?.bmr_no || ''}
                onChange={(e) => updateHeader('bmr_no', e.target.value)}
              />
            </div>
            {/* Row 2 */}
            <div className="bmr-grid-cell">
              <span className="bmr-grid-label">PRODUCT CODE :</span>
              <input
                className="bmr-grid-input"
                value={data.header?.product_code || ''}
                onChange={(e) => updateHeader('product_code', e.target.value)}
              />
            </div>
            <div className="bmr-grid-cell">
              <span className="bmr-grid-label">EFFECTIVE DATE :</span>
              <input
                className="bmr-grid-input"
                value={data.header?.effective_date || ''}
                onChange={(e) => updateHeader('effective_date', e.target.value)}
              />
            </div>
            {/* Row 3 */}
            <div className="bmr-grid-cell">
              <span className="bmr-grid-label">COMPANY CODE :</span>
              <input
                className="bmr-grid-input"
                value={data.header?.company_code || ''}
                onChange={(e) => updateHeader('company_code', e.target.value)}
              />
            </div>
            <div className="bmr-grid-cell">
              <span className="bmr-grid-label">SUPERSEDES NO :</span>
              <input
                className="bmr-grid-input"
                value={data.header?.supersedes_no !== undefined ? data.header.supersedes_no : (template?.supersedesPrefill || '')}
                onChange={(e) => updateHeader('supersedes_no', e.target.value)}
              />
            </div>
            {/* Row 4 */}
            <div className="bmr-grid-cell">
              <span className="bmr-grid-label">BATCH NO. :</span>
              <input
                className="bmr-grid-input"
                value={data.header?.batch_no || ''}
                readOnly={readOnly || Boolean(currentOrder?.official_batch_number)}
                onChange={(e) => updateHeader('batch_no', e.target.value)}
              />
            </div>
            <div className="bmr-grid-cell">
              <span className="bmr-grid-label">VERSION NO :</span>
              <input
                className="bmr-grid-input"
                value={data.header?.version_no !== undefined ? data.header.version_no : (template?.versionPrefill || '')}
                onChange={(e) => updateHeader('version_no', e.target.value)}
              />
            </div>
            {/* Row 5 */}
            <div className="bmr-grid-cell">
              <span className="bmr-grid-label">MFG. FOR :</span>
              <input
                className="bmr-grid-input"
                value={data.header?.mfg_for || ''}
                onChange={(e) => updateHeader('mfg_for', e.target.value)}
              />
            </div>
            <div className="bmr-grid-cell">
              <span className="bmr-grid-label">{template?.formulaLabel || 'MASTER FORMULA NO.'} :</span>
              <input
                className="bmr-grid-input"
                value={data.header?.master_formula_no || ''}
                onChange={(e) => updateHeader('master_formula_no', e.target.value)}
              />
            </div>
          </div>
        )}
      </div>
    )
  }

  // Dynamic Footer Box (Adapts to signature table, exact form number, and total page count)
  const renderFooter = (pageNumber) => {
    const pageIdx = pageNumber - 1
    const footer = data.footers?.[pageIdx] || {}
    const isMT = template?.key === 'mother-tincture'
    const pagesCount = template?.pagesCount || 19

    return (
      <div className="bmr-footer-box">
        <table className="bmr-signoff-table">
          <colgroup>
            <col style={{ width: '15.7%' }} />
            <col style={{ width: '28.0%' }} />
            <col style={{ width: '29.5%' }} />
            <col style={{ width: '26.8%' }} />
          </colgroup>
          <thead>
            <tr>
              <th className="bmr-footer-corner-cell"></th>
              <th>
                Prepared By<br />Production Chemist
              </th>
              <th>
                Reviewed By<br />Production In-Charge
              </th>
              <th>
                Approved By<br />QA Manager
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="bmr-footer-row-name">
              <td className="bmr-footer-label-cell">Name</td>
              <td>
                <input
                  className="bmr-cell-input"
                  value={footer.prepared_name || ''}
                  onChange={(e) => updateFooter(pageIdx, 'prepared_name', e.target.value)}
                />
              </td>
              <td>
                <input
                  className="bmr-cell-input"
                  value={footer.reviewed_name || ''}
                  onChange={(e) => updateFooter(pageIdx, 'reviewed_name', e.target.value)}
                />
              </td>
              <td>
                <input
                  className="bmr-cell-input"
                  value={footer.approved_name || ''}
                  onChange={(e) => updateFooter(pageIdx, 'approved_name', e.target.value)}
                />
              </td>
            </tr>
            <tr className="bmr-footer-row-sig">
              <td className="bmr-footer-label-cell">Signature</td>
              <td>
                <input
                  className="bmr-cell-input"
                  value={footer.prepared_signature || ''}
                  onChange={(e) => updateFooter(pageIdx, 'prepared_signature', e.target.value)}
                />
              </td>
              <td>
                <input
                  className="bmr-cell-input"
                  value={footer.reviewed_signature || ''}
                  onChange={(e) => updateFooter(pageIdx, 'reviewed_signature', e.target.value)}
                />
              </td>
              <td>
                <input
                  className="bmr-cell-input"
                  value={footer.approved_signature || ''}
                  onChange={(e) => updateFooter(pageIdx, 'approved_signature', e.target.value)}
                />
              </td>
            </tr>
            <tr className="bmr-footer-row-date">
              <td className="bmr-footer-label-cell">Date</td>
              <td>
                <BmrDateField
                  className="bmr-cell-input"
                  value={footer.prepared_date || ''}
                  onChange={(e) => updateFooter(pageIdx, 'prepared_date', e.target.value)}
                />
              </td>
              <td>
                <BmrDateField
                  className="bmr-cell-input"
                  value={footer.reviewed_date || ''}
                  onChange={(e) => updateFooter(pageIdx, 'reviewed_date', e.target.value)}
                />
              </td>
              <td>
                <BmrDateField
                  className="bmr-cell-input"
                  value={footer.approved_date || ''}
                  onChange={(e) => updateFooter(pageIdx, 'approved_date', e.target.value)}
                />
              </td>
            </tr>
          </tbody>
        </table>
        <div className="bmr-footer-bottom">
          <span className="bmr-form-no">{template?.formNo}</span>
          <span className="bmr-page-no">Page {pageNumber} of {pagesCount}</span>
        </div>
      </div>
    )
  }

  // Obtain page renderers directly from the template
  const pageRenderers = useMemo(() => {
    if (!template?.getPageRenderers) return null
    return template.getPageRenderers({
      data,
      setData,
      updateHeader,
      updateFooter,
      updatePage,
      renderHeader,
      renderFooter,
      renderYesNo,
      BmrDateField,
    })
  }, [template, data])

  // 1. Loading state
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 80, color: '#64748b' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
        <h3 style={{ fontWeight: 700, color: '#0f172a' }}>Loading digital BMR...</h3>
      </div>
    )
  }

  // 2. No-BMR product type (kits, pills, liquid, capsule, or any unconfigured type/slug)
  if (!template) {
    const displayType = getProductTypeDisplayName(rawTypeString || paramOrderId || 'this Product Type')
    return <NoBmrScreen productType={displayType} />
  }

  // 3. Fallback if pageRenderers could not be initialized
  if (!pageRenderers || !pageRenderers.length) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: '#ef4444' }}>
        <h3>Error initializing BMR template pages</h3>
        <p>Please contact System Administrator.</p>
        <button
          type="button"
          className="bmr-back-btn"
          style={{ marginTop: 16 }}
          onClick={() => navigate('/production')}
        >
          Back to Production
        </button>
      </div>
    )
  }

  // 4. Main BMR Editor UI
  return (
    <div className="bmr-wrapper">
      {/* TOP BAR */}
      <div className="bmr-topbar no-print">
        <div className="bmr-topbar-left">
          <button
            type="button"
            className="bmr-back-btn"
            onClick={() => (onBack ? onBack() : navigate('/production'))}
          >
            ← Back
          </button>

          {currentOrder && (
            <div className="bmr-order-pill">
              Order #{currentOrder.number || currentOrder.id} • {currentOrder.product_name} (Batch: {data.header?.batch_no || currentOrder.batch_no || 'N/A'})
            </div>
          )}

          {saveFeedback && (
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                padding: '3px 10px',
                borderRadius: 12,
                background: saveFeedback.includes('✓') ? '#dcfce7' : '#fef9c3',
                color: saveFeedback.includes('✓') ? '#15803d' : '#854d0e',
              }}
            >
              {saveFeedback}
            </span>
          )}
        </div>

        <div className="bmr-topbar-right">
          {readOnly ? (
            <span style={{ fontSize: 13, background: '#f8fafc', color: '#334155', border: '1px solid #cbd5e1', padding: '6px 14px', borderRadius: 6, fontWeight: 700 }}>
              🔒 View & Print Only (Locked)
            </span>
          ) : (
            <>
              <button
                type="button"
                className="bmr-back-btn"
                disabled={saving}
                onClick={handleSaveDraft}
              >
                {saving ? 'Saving...' : '💾 Save Draft'}
              </button>

              <button
                type="button"
                className="bmr-back-btn"
                style={{ background: '#0284c7', color: '#ffffff', borderColor: '#0284c7' }}
                disabled={saving}
                onClick={handleMarkComplete}
                title="Mark BMR as complete and set Order BMR Status to YES"
              >
                ✓ Mark Complete (BMR: Yes)
              </button>
            </>
          )}

          <button
            type="button"
            className="bmr-back-btn"
            style={{ background: '#10b981', color: '#ffffff', borderColor: '#10b981' }}
            onClick={handlePrintFull}
            title={`Prints all ${totalPages} pages formatted as in the original PDF`}
          >
            🖨️ Print Full {totalPages} Pages
          </button>

          <button
            type="button"
            className="bmr-back-btn"
            style={{ background: '#f8fafc', color: '#475569' }}
            onClick={handlePrintCurrent}
            title="Print only the active section"
          >
            🖨️ Print Section {activeSection}
          </button>
        </div>
      </div>

      {/* SECTION-WISE WORKSPACE LAYOUT (Left Step Navigator + Active Form Page) */}
      <div className="bmr-layout no-print">
        {/* LEFT STEP NAVIGATOR */}
        <aside className="bmr-sidebar-nav">
          <div className="bmr-nav-header">
            <span>BMR Sections ({completedCount}/{totalPages})</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#0284c7' }}>
              {Math.round((completedCount / totalPages) * 100)}%
            </span>
          </div>

          <div className="bmr-nav-list">
            {sections.map((sec) => {
              const status = sectionStatuses[sec.id] || 'not_started'
              const isActive = activeSection === sec.id

              return (
                <button
                  key={sec.id}
                  type="button"
                  className={`bmr-nav-item ${isActive ? 'active' : ''}`}
                  onClick={() => {
                    persistToRedux(data, true)
                    setActiveSection(sec.id)
                  }}
                >
                  <div className="bmr-nav-item-title">
                    <span className="bmr-nav-num">{sec.id}</span>
                    <span>{sec.title}</span>
                  </div>

                  <span className={`bmr-status-badge ${status}`}>
                    {status === 'done' ? '✓ Done' : status === 'in_progress' ? '● In Prog' : '○ Pending'}
                  </span>
                </button>
              )
            })}
          </div>
        </aside>

        {/* ACTIVE SECTION CONTENT */}
        <main className="bmr-main-content">
          <div className="bmr-interactive-screen-sheet" style={readOnly ? { pointerEvents: 'none', userSelect: 'text' } : {}}>
            {pageRenderers[activeSection - 1] && pageRenderers[activeSection - 1]()}
          </div>

          {/* BOTTOM SECTION NAVIGATION */}
          <div className="bmr-bottom-nav">
            <button
              type="button"
              className="bmr-nav-btn bmr-nav-btn-prev"
              disabled={activeSection === 1}
              onClick={handlePrev}
            >
              ← Previous Section
            </button>

            <span style={{ fontSize: 13, fontWeight: 700, color: '#475569' }}>
              Section {activeSection} of {totalPages} — {sections[activeSection - 1]?.title}
            </span>

            <button
              type="button"
              className="bmr-nav-btn bmr-nav-btn-next"
              onClick={readOnly ? () => {
                if (activeSection < totalPages) {
                  setActiveSection((prev) => prev + 1)
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }
              } : handleSaveAndNext}
            >
              {readOnly ? 'Next Section →' : (activeSection === totalPages ? 'Save & Finish ✓' : 'Save & Next Section →')}
            </button>
          </div>
        </main>
      </div>

      {/* FULL PRINT CONTAINER (Rendered during print preview) */}
      <div className="bmr-print-only-container">
        {printCurrentOnly ? (
          pageRenderers[activeSection - 1] && pageRenderers[activeSection - 1]()
        ) : (
          pageRenderers.map((renderer, idx) => (
            <React.Fragment key={idx}>{renderer()}</React.Fragment>
          ))
        )}
      </div>
    </div>
  )
}
