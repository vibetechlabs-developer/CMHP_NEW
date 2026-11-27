import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Button from '../../components/Button'
import { exportFormulaExcel } from '../../utils/formulaExport'
import { getCompanyBranding, isTejBiocare } from '../../utils/companyBranding.js'
import { resolveSlipConfig } from './slips/slipRegistry'
import { exportTabletRmExcel, exportTabletPmExcel, exportOilRmExcel, exportOilPmExcel, exportMotherTinctureRmExcel, exportSyrupRmExcel, exportSyrupPmExcel, exportDropsRmExcel, exportDropsPmExcel } from './slips/tabletExcelExport'
import { getFormulaSlip, saveFormulaSlip } from './formulasService'
import { triggerSlipPrint } from '../../utils/slipPrintService'
import './BmrRequisitionSlipModal.css'
import './slips/TabletSlip.css'
import './slips/MotherTinctureSlip.css'
import './slips/SyrupSlip.css'
import './slips/DropsSlip.css'

export default function BmrRequisitionSlipModal({
  isOpen,
  onClose,
  product = {},
  formula = {},
  revision = {},
  activeLines = null,
  company = {},
  initialTab = 'RM',
  batchAllocation = null,
  readOnly = false,
}) {
  const [activeTab, setActiveTab] = useState(initialTab || 'RM')

  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab)
    }
  }, [isOpen, initialTab])
  const [saving, setSaving] = useState(false)
  const [saveFeedback, setSaveFeedback] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [slipData, setSlipData] = useState(null)
  const [loadingSlip, setLoadingSlip] = useState(false)

  // Drops backward-compatibility state
  const [dropsBatchNo, setDropsBatchNo] = useState(() => (product?.bmr_no ? `${product.code}-01` : 'AH2602'))
  const [dropsEffectiveDate, setDropsEffectiveDate] = useState(() => '12-04-2024')
  const [dropsSupersedesNo] = useState('00')
  const [dropsMfgFor, setDropsMfgFor] = useState(() => 'APEX ANIMAL HEALTH PRODUCTS')

  const slipRef = useRef(null)

  // Resolve product type using the exact same logic as BMR and COA screens
  const resolved = useMemo(() => resolveSlipConfig(product), [product])
  const { typeKey, displayName, isImplemented, config } = resolved
  const activeSlipConfig = activeTab === 'RM' ? config.rm : config.pm
  const isPlaceholder = Boolean(activeSlipConfig.isPlaceholder)

  const isTejActive = isTejBiocare(company) || isTejBiocare()
  const branding = getCompanyBranding(isTejActive ? 'tej' : 'cmhp')
  const rawCompanyName = company?.display_name || company?.name || ''
  const companyTitle = branding.isTej
    ? branding.headerName
    : (!rawCompanyName || rawCompanyName.toUpperCase() === 'CMHP' || rawCompanyName.toUpperCase().includes('CENTRAL')
        ? 'CENTRAL MANUFACTURING HOMEOPATHIC PHARMACY'
        : rawCompanyName.toUpperCase())

  const productId = product?.id
  const revisionId = revision?.id || null

  // Load saved slip data from PostgreSQL DB per product + revision + slip_type
  // When switching products, state is immediately cleared and Product 2's own slip is loaded.
  useEffect(() => {
    if (!isOpen || !productId) return

    let cancelled = false
    setLoadingSlip(true)
    setIsDirty(false)
    setSaveFeedback('')

    // Reset drops local state per product
    setDropsBatchNo(product?.bmr_no ? `${product.code}-01` : 'AH2602')
    setDropsEffectiveDate('12-04-2024')
    setDropsMfgFor('APEX ANIMAL HEALTH PRODUCTS')

    if (isPlaceholder) {
      setSlipData({})
      setLoadingSlip(false)
      return
    }

    getFormulaSlip(company?.id || 2, {
      productId,
      revisionId,
      slipType: activeTab,
    })
      .then((res) => {
        if (cancelled) return
        if (res && res.found && res.data) {
          // Loaded permanently saved edits from database
          setSlipData(res.data)
          setIsSaved(true)
          setIsDirty(false)
        } else {
          // First open (nothing saved yet): auto-fill from this product's own formula
          const initial = activeSlipConfig.getInitialData(product, formula, revision, activeLines, company)
          setSlipData(initial)
          setIsSaved(false)
          setIsDirty(false)
        }
        setLoadingSlip(false)
      })
      .catch((err) => {
        if (cancelled) return
        console.warn('Could not load saved slip from backend, using auto-filled defaults:', err)
        const initial = activeSlipConfig.getInitialData(product, formula, revision, activeLines, company)
        setSlipData(initial)
        setIsSaved(false)
        setLoadingSlip(false)
      })

    return () => {
      cancelled = true
    }
  }, [isOpen, productId, revisionId, activeTab, isPlaceholder, activeSlipConfig, product, formula, revision, activeLines, company])

  // Save current slip edits to PostgreSQL backend database
  const handleSaveSlip = useCallback(async (dataToSave = slipData) => {
    if (!productId || saving || isPlaceholder || !dataToSave) return
    setSaving(true)
    setSaveFeedback('')

    try {
      await saveFormulaSlip(company?.id || 2, {
        productId,
        revisionId,
        slipType: activeTab,
        data: dataToSave,
      })
      setIsDirty(false)
      setIsSaved(true)
      setSaveFeedback('✓ Saved')
      setTimeout(() => setSaveFeedback(''), 2500)
    } catch (err) {
      console.error('Failed to save slip to DB:', err)
      setSaveFeedback('❌ Failed to save')
    } finally {
      setSaving(false)
    }
  }, [productId, revisionId, activeTab, company?.id, isPlaceholder, saving, slipData])

  // Handle edits made by the user on the slip
  const handleSlipDataChange = useCallback((newData) => {
    setSlipData(newData)
    setIsDirty(true)
  }, [])

  if (!isOpen) return null

  const handlePrint = async () => {
    if (isPlaceholder) return
    await triggerSlipPrint()
  }

  const handleExcel = () => {
    if (isPlaceholder) return

    if (typeKey === 'tablet') {
      if (activeTab === 'RM') {
        exportTabletRmExcel({
          slipData: slipData || {},
          product,
          formula,
          revision,
          company,
        })
      } else {
        exportTabletPmExcel({
          slipData: slipData || {},
          product,
          formula,
          revision,
          company,
        })
      }
      return
    }

    if (typeKey === 'oil') {
      if (activeTab === 'RM') {
        exportOilRmExcel({
          slipData: slipData || {},
          product,
          formula,
          revision,
          company,
        })
      } else {
        exportOilPmExcel({
          slipData: slipData || {},
          product,
          formula,
          revision,
          company,
        })
      }
      return
    }

    if (typeKey === 'mother-tincture') {
      if (activeTab === 'RM') {
        exportMotherTinctureRmExcel({
          slipData: slipData || {},
          product,
          formula,
          revision,
          company,
        })
      }
      return
    }

    if (typeKey === 'syrup') {
      if (activeTab === 'RM') {
        exportSyrupRmExcel({
          slipData: slipData || {},
          product,
          formula,
          revision,
          company,
        })
      } else {
        exportSyrupPmExcel({
          slipData: slipData || {},
          product,
          formula,
          revision,
          company,
        })
      }
      return
    }

    if (typeKey === 'drops') {
      if (activeTab === 'RM') {
        exportDropsRmExcel({
          slipData: slipData || {},
          product,
          formula,
          revision,
          company,
        })
      } else {
        exportDropsPmExcel({
          slipData: slipData || {},
          product,
          formula,
          revision,
          company,
        })
      }
      return
    }

    // Drops existing excel export
    const lines = (activeLines && activeLines.length > 0) ? activeLines : (revision?.lines || [])
    if (activeTab === 'RM') {
      exportFormulaExcel({
        product,
        formula,
        revision: { name: `Rev. ${revision?.revision_number || '01'}` },
        materials: lines.filter((l) => l.material_type === 'RAW_MATERIAL').map((l) => ({
          rmCode: l.material?.code || l.material_code || '',
          name: l.material?.name || l.material_name || '',
          labelClaim:
            l.calculation_mode === 'AS_PER_FORMULA'
              ? '—'
              : (l.label_claim ||
                (l.calculation_mode === 'AS_PER_LABEL_CLAIM'
                  ? `${l.label_claim_quantity || ''} ${l.label_claim_uom?.code || ''}`
                  : l.special_value || '—')),
          base_quantity: l.quantity,
          unit: l.unit || l.unit_code || 'ML',
          arNo: l.ar_no || '—',
        })),
        batchQty: revision?.base_output_quantity || 100,
        batchUnit: revision?.output_uom_code || 'ML',
        approval: {
          status: revision?.status,
          submittedBy: 'Production Chemist',
          decidedBy: revision?.status === 'APPROVED' ? 'QA / QC Manager' : 'Pending Review',
        },
        companyName: companyTitle,
      })
    } else {
      const packagingMaterials = lines.filter(
        (l) => l.material_type === 'PACKAGING_MATERIAL' || l.material_type === 'PACKAGING'
      )
      exportFormulaExcel({
        product,
        formula,
        revision: { name: `Rev. ${revision?.revision_number || '01'}` },
        materials: packagingMaterials.map((l) => ({
          rmCode: l.material?.code || l.material_code || '',
          name: l.material?.name || l.material_name || '',
          labelClaim: '—',
          base_quantity: l.quantity || '',
          unit: 'NOS',
          arNo: l.ar_no || '—',
        })),
        batchQty: revision?.base_output_quantity || 100,
        batchUnit: 'NOS',
        approval: {
          status: revision?.status,
          submittedBy: 'Warehouse Chemist',
          decidedBy: revision?.status === 'APPROVED' ? 'QA / QC Manager' : 'Pending Review',
        },
        companyName: companyTitle,
      })
    }
  }

  // Common Header Component for Drops matching exact PDF
  const renderDropsHeader = () => (
    <div className="bmr-exact-header-box">
      <div className="bmr-exact-top-banner">
        <div className={`bmr-exact-logo-wrap ${branding.isTej ? 'bmr-exact-logo-wrap-tej' : ''}`}>
          <img
            src={branding.isTej ? branding.logoSrc : '/cmhp_logo.png'}
            alt={branding.headerName}
            className={`bmr-exact-logo-img ${branding.isTej ? 'bmr-exact-logo-img-tej' : ''}`}
            crossOrigin="anonymous"
          />
        </div>
        <div className="bmr-exact-company-title">
          {companyTitle}
        </div>
      </div>

      <div className="bmr-exact-dept-bar">
        PRODUCTION ( ORAL LIQUID DEPARTMENT)
      </div>

      <div className="bmr-exact-bmr-bar">
        BATCH MANUFACTURING RECORD (BMR)
      </div>

      <table className="bmr-exact-meta-grid">
        <tbody>
          <tr>
            <td style={{ width: '50%' }}>
              <span className="bmr-field-lbl">PRODUCT : </span>
              <span className="bmr-field-val">{product?.name || ''}</span>
            </td>
            <td style={{ width: '50%' }}>
              <span className="bmr-field-lbl">BMR NO. : </span>
              <span className="bmr-field-val">{product?.bmr_no || ''}</span>
            </td>
          </tr>
          <tr>
            <td>
              <span className="bmr-field-lbl">PRODUCT CODE : </span>
              <span className="bmr-field-val">{product?.code || ''}</span>
            </td>
            <td>
              <span className="bmr-field-lbl">EFFECTIVE DATE : </span>
              <input
                className="bmr-exact-input no-print"
                value={dropsEffectiveDate}
                onChange={(e) => setDropsEffectiveDate(e.target.value)}
                style={{ width: '85px' }}
              />
              <span className="print-only">{dropsEffectiveDate}</span>
            </td>
          </tr>
          <tr>
            <td>
              <span className="bmr-field-lbl">COMPANY CODE : </span>
              <span className="bmr-field-val">{branding.isTej ? branding.code : (company?.code || 'CMHP')}</span>
            </td>
            <td>
              <span className="bmr-field-lbl">SUPERSEDES NO : </span>
              <span className="bmr-field-val">{dropsSupersedesNo}</span>
            </td>
          </tr>
          <tr>
            <td>
              <span className="bmr-field-lbl">BATCH NO. : </span>
              <input
                className="bmr-exact-input no-print"
                value={dropsBatchNo}
                onChange={(e) => setDropsBatchNo(e.target.value)}
                style={{ width: '100px' }}
              />
              <span className="print-only">{dropsBatchNo}</span>
            </td>
            <td>
              <span className="bmr-field-lbl">VERSION NO : </span>
              <span className="bmr-field-val">{String(revision?.revision_number || 1).padStart(2, '0')}</span>
            </td>
          </tr>
          <tr>
            <td>
              <span className="bmr-field-lbl">MFG. FOR : </span>
              <input
                className="bmr-exact-input no-print"
                value={dropsMfgFor}
                onChange={(e) => setDropsMfgFor(e.target.value)}
                style={{ width: '180px' }}
              />
              <span className="print-only">{dropsMfgFor}</span>
            </td>
            <td>
              <span className="bmr-field-lbl">MASTER FORMULA NO. : </span>
              <span className="bmr-field-val">{formula?.code || ''}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )

  // Common Signature Table for Drops
  const renderDropsSignatures = () => (
    <table className="bmr-exact-sign-table">
      <thead>
        <tr>
          <th className="bmr-exact-sign-corner-th" style={{ width: '16%' }}></th>
          <th style={{ width: '28%' }}>
            Prepared By<br />
            <span style={{ fontWeight: 'normal', fontSize: '10.5px' }}>Production Chemist</span>
          </th>
          <th style={{ width: '28%' }}>
            Reviewed By<br />
            <span style={{ fontWeight: 'normal', fontSize: '10.5px' }}>Production In-Charge</span>
          </th>
          <th style={{ width: '28%' }}>
            Approved By<br />
            <span style={{ fontWeight: 'normal', fontSize: '10.5px' }}>QA Manager</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td className="bmr-exact-sign-side-lbl">Name</td>
          <td></td>
          <td></td>
          <td></td>
        </tr>
        <tr>
          <td className="bmr-exact-sign-side-lbl">Signature</td>
          <td></td>
          <td></td>
          <td></td>
        </tr>
        <tr>
          <td className="bmr-exact-sign-side-lbl">Date</td>
          <td></td>
          <td></td>
          <td></td>
        </tr>
      </tbody>
    </table>
  )

  // Batch Output Reconciliation Table for Drops
  const renderDropsBatchAllocation = () => {
    if (!batchAllocation) return null
    const {
      totalBottles = 0,
      qcSamples = 0,
      retentionSamples = 0,
      totalSamples = 0,
      netCommercialBottles = 0,
      linkedSalesOrder = '',
      orderAllocatedQty = 0,
      bufferStockQty = 0,
      batchVolumeLtr = 0,
      packSizeMl = 0,
    } = batchAllocation

    return (
      <div className="bmr-exact-allocation-section" style={{ marginTop: 6, marginBottom: 6 }}>
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 'bold',
            textAlign: 'left',
            padding: '2px 6px',
            background: '#f1f5f9',
            border: '1px solid #000',
            borderBottom: 'none',
            letterSpacing: '0.5px',
          }}
        >
          BATCH YIELD RECONCILIATION, QUALITY SAMPLES &amp; ORDER ALLOCATION:
        </div>
        <table className="bmr-exact-table" style={{ margin: 0 }}>
          <tbody>
            <tr>
              <td style={{ width: '25%', fontWeight: 'bold', textAlign: 'left', background: '#f8fafc' }}>
                Gross Batch Yield
              </td>
              <td style={{ width: '25%', textAlign: 'right', fontWeight: 'bold' }}>
                {Number(totalBottles).toLocaleString()} Bottles ({batchVolumeLtr} Ltr @ {packSizeMl}ml)
              </td>
              <td style={{ width: '25%', fontWeight: 'bold', textAlign: 'left', background: '#f8fafc' }}>
                QC Lab Samples (Consumed)
              </td>
              <td style={{ width: '25%', textAlign: 'right', color: '#b91c1c', fontWeight: 'bold' }}>
                - {Number(qcSamples).toLocaleString()} Bottles
              </td>
            </tr>
            <tr>
              <td style={{ fontWeight: 'bold', textAlign: 'left', background: '#f8fafc' }}>
                Control / Retention Samples
              </td>
              <td style={{ textAlign: 'right', color: '#b45309', fontWeight: 'bold' }}>
                - {Number(retentionSamples).toLocaleString()} Bottles (Room Store)
              </td>
              <td style={{ fontWeight: 'bold', textAlign: 'left', background: '#f8fafc' }}>
                Total Samples Withdrawn
              </td>
              <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#6d28d9' }}>
                {Number(totalSamples).toLocaleString()} Bottles
              </td>
            </tr>
            <tr style={{ background: '#f0fdf4' }}>
              <td style={{ fontWeight: 'bold', textAlign: 'left', fontSize: 10.5 }}>
                Net Commercial Output
              </td>
              <td style={{ textAlign: 'right', fontWeight: 'bold', fontSize: 11, color: '#15803d' }}>
                {Number(netCommercialBottles).toLocaleString()} Bottles
              </td>
              <td style={{ fontWeight: 'bold', textAlign: 'left' }}>
                Linked Sales Order
              </td>
              <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                {orderAllocatedQty > 0 ? (
                  <span>
                    {Number(orderAllocatedQty).toLocaleString()} BTL {linkedSalesOrder ? `(${linkedSalesOrder})` : ''}
                  </span>
                ) : (
                  <span style={{ color: '#64748b', fontStyle: 'italic' }}>Unallocated / To Store</span>
                )}
              </td>
            </tr>
            {bufferStockQty > 0 && (
              <tr style={{ background: '#f8fafc' }}>
                <td style={{ fontWeight: 'bold', textAlign: 'left' }}>
                  Warehouse Buffer Stock
                </td>
                <td
                  colSpan={3}
                  style={{ textAlign: 'left', paddingLeft: 8, color: '#166534', fontWeight: 'bold' }}
                >
                  + {Number(bufferStockQty).toLocaleString()} Bottles retained in FG Warehouse for subsequent customer orders
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    )
  }

  const ActiveComponent = activeSlipConfig.Component

  return (
    <div className="bmr-modal-overlay">
      <div className="bmr-modal-container">
        {/* TOP TOOLBAR (NO-PRINT) */}
        <div className="bmr-modal-toolbar no-print">
          <div className="bmr-toolbar-left">
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#f8fafc' }}>
              {activeSlipConfig.title}
            </h3>
            <span style={{ fontSize: 11.5, color: '#94a3b8' }}>
              {activeSlipConfig.subtitle}
            </span>
          </div>

          {/* TAB SWITCHER */}
          <div className="bmr-toolbar-tabs">
            <button
              type="button"
              className={`bmr-tab-btn ${activeTab === 'RM' ? 'active' : ''}`}
              onClick={() => setActiveTab('RM')}
            >
              📄 Attachment - 1 (RM Requisition)
            </button>
            <button
              type="button"
              className={`bmr-tab-btn ${activeTab === 'PM' ? 'active' : ''}`}
              onClick={() => setActiveTab('PM')}
            >
              📦 Attachment - 4 (PM Requirement)
            </button>
          </div>

          <div className="bmr-toolbar-right">
            {/* Status Indicator */}
            {saveFeedback ? (
              <span className="bmr-save-feedback">{saveFeedback}</span>
            ) : isDirty ? (
              <span className="bmr-unsaved-badge">● Unsaved edits</span>
            ) : isSaved ? (
              <span className="bmr-saved-badge">✓ Saved</span>
            ) : null}

            {/* Save Button for editable slips */}
            {!readOnly && (typeKey === 'tablet' || typeKey === 'oil' || typeKey === 'mother-tincture' || typeKey === 'syrup') && (
              <Button
                type="button"
                variant="primary"
                onClick={() => handleSaveSlip()}
                disabled={saving || !isDirty}
              >
                {saving ? '⏳ Saving...' : '💾 Save Slip'}
              </Button>
            )}
            {readOnly && (
              <span style={{ fontSize: '12px', background: '#f1f5f9', color: '#475569', padding: '6px 12px', borderRadius: '4px', fontWeight: 600 }}>
                🔒 Read-Only
              </span>
            )}

            <Button
              type="button"
              variant="secondary"
              onClick={handlePrint}
              disabled={isPlaceholder}
              title={isPlaceholder ? 'Slip not available yet for this product type' : 'Print / Save as PDF'}
            >
              🖨️ Print / Save as PDF
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={handleExcel}
              disabled={isPlaceholder}
              title={isPlaceholder ? 'Slip not available yet for this product type' : 'Export Excel'}
            >
              📥 Export Excel
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              ✕ Close
            </Button>
          </div>
        </div>

        {/* PRINTABLE SLIP CONTAINER */}
        <div className="bmr-slip-wrapper">
          <div className="bmr-exact-document-sheet" ref={slipRef} style={readOnly ? { pointerEvents: 'none', userSelect: 'text' } : {}}>
            {loadingSlip ? (
              <div style={{ padding: '60px 20px', textAlign: 'center', color: '#64748b' }}>
                <span style={{ fontSize: 24 }}>⏳</span>
                <p style={{ marginTop: 8, fontWeight: 600 }}>Loading requisition slip data…</p>
              </div>
            ) : isPlaceholder ? (
              <ActiveComponent
                productType={displayName}
                tabType={activeTab}
                customMessage={activeSlipConfig.customMessage}
              />
            ) : (typeKey === 'tablet' || typeKey === 'oil' || typeKey === 'mother-tincture' || typeKey === 'syrup' || typeKey === 'drops') ? (
              <ActiveComponent
                data={slipData || {}}
                onChange={handleSlipDataChange}
                company={company}
                product={product}
                formula={formula}
                revision={revision}
              />
            ) : (
              /* Drops Slip */
              <ActiveComponent
                product={product}
                formula={formula}
                revision={revision}
                activeLines={activeLines}
                company={company}
                batchAllocation={batchAllocation}
                renderHeader={renderDropsHeader}
                renderSignatures={renderDropsSignatures}
                renderBatchAllocation={renderDropsBatchAllocation}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
