import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Modal from '../inventory/components/Modal'
import Spinner, { LoadingState } from '../../components/Spinner'
import useCompanyPermissions from '../../hooks/useCompanyPermissions'
import useSelectedCompany from '../../hooks/useSelectedCompany'
import { confirmAction } from '../../utils/confirmAction'
import { getErrorMessage } from '../../utils/errors'
import { listPlanningUnits } from '../manufacturing/batchPlansService'
import RequirementCalculator from './RequirementCalculator'
import ProductionRawMaterialCalculator from './ProductionRawMaterialCalculator'
import BmrRequisitionSlipModal from './BmrRequisitionSlipModal'
import {
  approvalActionState,
  approveRevision,
  buildRevisionLinesPayload,
  createFormula,
  createRevision,
  getApprovalPreview,
  getFormula,
  getRevision,
  listFormulas,
  listRevisions,
  rejectRevision,
  searchMaterials,
  submitActionState,
  submitRevision,
  updateRevision,
} from './formulasService'

import './FormulasPage.css'

const OUTPUT_UNIT_CODES = ['GM', 'KG', 'ML', 'L', 'BTL']
function filterToOutputUnitChoices(units) {
  const filtered = units.filter((u) => OUTPUT_UNIT_CODES.includes((u.code || '').toUpperCase()))
  return filtered.length ? filtered : units
}

const RAW = 'RAW_MATERIAL'
const PACKAGING = 'PACKAGING_MATERIAL'
const WORKFLOW_STEPS = ['Choose a formula', 'Choose a revision', 'Add materials and save', 'Review and approve']

function RevisionBadge({ status }) {
  const normalized = (status || 'DRAFT').toUpperCase()
  return (
    <span className={`fm-status-badge fm-status-${normalized}`}>
      <span className="fm-status-dot" />
      {normalized}
    </span>
  )
}

export default function FormulasPage({ companyId, productId, product, backTo = '/products' }) {
  const { companies } = useSelectedCompany()
  const company = companies.find((c) => c.id === companyId) || { code: 'CMHP', name: 'CMHP PHARMACEUTICALS', display_name: 'CMHP Pharma' }

  const { loading: permissionsLoading, hasPermission } = useCompanyPermissions(companyId)
  const canView = hasPermission('formulas.view')
  const canCreate = hasPermission('formulas.create')
  const canEdit = hasPermission('formulas.edit')
  const canSubmit = hasPermission('formulas.submit')
  const canApprove = hasPermission('formulas.approve')

  const [searchParams, setSearchParams] = useSearchParams()
  const initialTab = searchParams.get('tab')
  const [activeTab, setActiveTabState] = useState(
    initialTab && ['bom', 'calculator', 'revisions'].includes(initialTab) ? initialTab : 'bom'
  )

  const setActiveTab = (tab) => {
    setActiveTabState(tab)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('tab', tab)
      return next
    }, { replace: true })
  }

  useEffect(() => {
    const tabParam = searchParams.get('tab')
    if (tabParam && ['bom', 'calculator', 'revisions'].includes(tabParam) && tabParam !== activeTab) {
      setActiveTabState(tabParam)
    }
  }, [searchParams, activeTab])
  const [formulas, setFormulas] = useState([])
  const [listError, setListError] = useState('')
  const [listLoading, setListLoading] = useState(true)
  const [selectedFormulaId, setSelectedFormulaId] = useState(null)
  const [formula, setFormula] = useState(null)
  const [revisions, setRevisions] = useState([])
  const [selectedRevisionId, setSelectedRevisionId] = useState(null)
  const [revision, setRevision] = useState(null)
  const [detailError, setDetailError] = useState('')
  const [notice, setNotice] = useState('')
  const [creating, setCreating] = useState(false)
  const [newRevisionOpen, setNewRevisionOpen] = useState(false)
  const [bmrSlipOpen, setBmrSlipOpen] = useState(false)
  const [bmrSlipLines, setBmrSlipLines] = useState(null)
  const [bmrSlipInitialTab, setBmrSlipInitialTab] = useState('RM')
  const [dirtyKinds, setDirtyKinds] = useState({})
  const hasUnsaved = Object.values(dirtyKinds).some(Boolean)

  const guardUnsaved = () => !hasUnsaved || confirmAction('Discard the unsaved changes to this revision?')

  useEffect(() => {
    if (!hasUnsaved) return undefined
    const warn = (event) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [hasUnsaved])

  // Load formulas and auto-select the first formula if none is chosen
  useEffect(() => {
    if (permissionsLoading || !companyId || !canView) return
    let cancelled = false
    setListLoading(true)
    setListError('')
    listFormulas(companyId, { productId, pageSize: 100 })
      .then((data) => {
        if (cancelled) return
        const list = data.results || []
        setFormulas(list)
        if (list.length > 0) {
          setSelectedFormulaId((prev) => (prev && list.some((f) => f.id === prev) ? prev : list[0].id))
        }
      })
      .catch((error) => !cancelled && setListError(getErrorMessage(error)))
      .finally(() => !cancelled && setListLoading(false))
    return () => { cancelled = true }
  }, [permissionsLoading, companyId, productId, canView])

  // Load formula details and revisions, auto-select approved or first revision
  useEffect(() => {
    if (!companyId || !selectedFormulaId) {
      setFormula(null)
      setRevisions([])
      setSelectedRevisionId(null)
      return
    }
    let cancelled = false
    setDetailError('')
    Promise.all([getFormula(companyId, selectedFormulaId), listRevisions(companyId, selectedFormulaId)])
      .then(([detail, list]) => {
        if (cancelled) return
        setFormula(detail)
        setRevisions(list)
        if (list.length > 0) {
          setSelectedRevisionId((prev) => {
            if (prev && list.some((r) => r.id === prev)) return prev
            const approved = list.find((r) => r.status === 'APPROVED')
            return approved ? approved.id : list[0].id
          })
        }
      })
      .catch((error) => !cancelled && setDetailError(getErrorMessage(error)))
    return () => { cancelled = true }
  }, [companyId, selectedFormulaId])

  // Load selected revision
  useEffect(() => {
    if (!companyId || !selectedFormulaId || !selectedRevisionId) {
      setRevision(null)
      return
    }
    let cancelled = false
    getRevision(companyId, selectedFormulaId, selectedRevisionId)
      .then((data) => !cancelled && setRevision(data))
      .catch((error) => !cancelled && setDetailError(getErrorMessage(error)))
    return () => { cancelled = true }
  }, [companyId, selectedFormulaId, selectedRevisionId])

  const refreshRevisions = async () => {
    if (!companyId || !selectedFormulaId) return
    const list = await listRevisions(companyId, selectedFormulaId)
    setRevisions(list)
    if (selectedRevisionId) setRevision(await getRevision(companyId, selectedFormulaId, selectedRevisionId))
  }

  const chooseFormula = (id) => {
    if (id === selectedFormulaId) return
    if (!guardUnsaved()) return
    setDirtyKinds({})
    setSelectedFormulaId(id)
    setSelectedRevisionId(null)
    setNotice('')
  }

  const chooseRevision = (id) => {
    if (id === selectedRevisionId) return
    if (!guardUnsaved()) return
    setDirtyKinds({})
    setSelectedRevisionId(id || null)
  }

  if (permissionsLoading) return <LoadingState label="Checking your access…" compact />
  if (!companyId) return <Alert type="error">No company is selected.</Alert>
  if (!canView) {
    return <Alert type="error">Access unavailable. Ask an administrator for formula read access in this company.</Alert>
  }

  const currentStep = !selectedFormulaId ? 0 : !revision ? 1 : revision.status === 'DRAFT' ? 2 : 3
  const rawCount = revision?.lines?.filter((l) => l.material_type === RAW).length || 0
  const pkgCount = revision?.lines?.filter((l) => l.material_type === PACKAGING).length || 0
  const totalBOMCount = rawCount + pkgCount

  return (
    <div className="fm-workspace">
      {/* --------------------------------------------------
          1. PRODUCT HEADER CARD
          -------------------------------------------------- */}
      {/* --------------------------------------------------
          1. PRODUCT HEADER CARD (3 Clear Areas)
          -------------------------------------------------- */}
      <div className="fm-product-card">
        {/* TOP ROW: Area A (Product Identity) + Area C (Primary Actions) */}
        <div className="fm-product-header-top">
          <div className="fm-product-left">
            <Link to={backTo} className="fm-back-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
              <span>Back to Products</span>
            </Link>
            <div className="fm-product-title-row">
              <h1 className="fm-product-title">{product?.name || 'Product Formulas'}</h1>
              {product?.code && <span className="fm-badge fm-badge-code">{product.code}</span>}
              <span className={`fm-badge ${product?.is_active ? 'fm-badge-active' : 'fm-badge-inactive'}`}>
                <span className="fm-badge-dot" />
                {product?.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
            <div className="fm-product-meta-row">
              {product?.product_type && (
                <span className="fm-product-meta-item">
                  Type: <strong>{product.product_type}</strong>
                </span>
              )}
              {product?.product_type && product?.bmr_no && (
                <span className="fm-meta-divider">·</span>
              )}
              {product?.bmr_no && (
                <span className="fm-product-meta-item">
                  BMR No.: <strong>{product.bmr_no}</strong>
                </span>
              )}
              {product?.bmr_no && product?.sales_uom_code && (
                <span className="fm-meta-divider">·</span>
              )}
              {product?.sales_uom_code && (
                <span className="fm-product-meta-item">
                  Sales UOM: <strong>{product.sales_uom_code}</strong>
                </span>
              )}
              {product?.pack_size && (
                <>
                  <span className="fm-meta-divider">·</span>
                  <span className="fm-product-meta-item">
                    Pack Size: <strong>{product.pack_size}</strong>
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Area C: Primary Actions */}
          <div className="fm-product-actions">
            {revision && (
              <>
                <button
                  type="button"
                  className="fm-btn-slip fm-btn-rm-slip"
                  onClick={() => {
                    setBmrSlipInitialTab('RM')
                    setBmrSlipLines(null)
                    setBmrSlipOpen(true)
                  }}
                  title="Generate and print BMR RM Requisition Slip (Attachment 1)"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                  <span>RM Slip (Att. 1)</span>
                </button>
                <button
                  type="button"
                  className="fm-btn-slip fm-btn-pm-slip"
                  onClick={() => {
                    setBmrSlipInitialTab('PM')
                    setBmrSlipLines(null)
                    setBmrSlipOpen(true)
                  }}
                  title="Generate and print BMR PM Requirement Slip (Attachment 4)"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                    <line x1="12" y1="22.08" x2="12" y2="12" />
                  </svg>
                  <span>PM Slip (Att. 4)</span>
                </button>
              </>
            )}
            {canCreate && (
              <Button type="button" onClick={() => guardUnsaved() && setCreating(true)}>
                + New Formula
              </Button>
            )}
          </div>
        </div>

        {/* BOTTOM ROW: Area B (Product Statistics) */}
        <div className="fm-product-header-bottom">
          <div className="fm-stats-group">
            <div className="fm-stat-box">
              <span className="fm-stat-label">Total Formulas</span>
              <span className="fm-stat-value">{formulas.length}</span>
            </div>
            {revision && (
              <div className="fm-stat-box">
                <span className="fm-stat-label">Batch Size</span>
                <span className="fm-stat-value">
                  {revision.base_output_quantity} {revision.output_uom_code}
                </span>
              </div>
            )}
            {revision && (
              <div className="fm-stat-box">
                <span className="fm-stat-label">Current Revision</span>
                <span className="fm-stat-value">
                  Rev. {revision.revision_number}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* --------------------------------------------------
          2. COHERENT FORMULA NAVIGATION TABS
          -------------------------------------------------- */}
      <div className="fm-tabs-container">
        <div className="fm-tabs-nav" role="tablist" aria-label="Formula Views">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'bom'}
            className={`fm-tab-item ${activeTab === 'bom' ? 'active' : ''}`}
            onClick={() => setActiveTab('bom')}
          >
            <span>Bill of Materials</span>
            {revision && <span className="fm-tab-pill">{totalBOMCount}</span>}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'calculator'}
            className={`fm-tab-item ${activeTab === 'calculator' ? 'active' : ''}`}
            onClick={() => setActiveTab('calculator')}
          >
            <span>Production Calculator</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'revisions'}
            className={`fm-tab-item ${activeTab === 'revisions' ? 'active' : ''}`}
            onClick={() => setActiveTab('revisions')}
          >
            <span>Revisions</span>
            <span className="fm-tab-pill">{revisions.length}</span>
          </button>
        </div>
      </div>

      {/* --------------------------------------------------
          3. GROUPED FORMULA & REVISION CONTROLS AREA
          -------------------------------------------------- */}
      {formula && (
        <div className="fm-control-card">
          <div className="fm-control-grid">
            <div className="fm-control-item fm-control-formula">
              <label htmlFor="fm-formula-select" className="fm-control-label">
                Formula
              </label>
              <select
                id="fm-formula-select"
                className="fm-control-select"
                value={selectedFormulaId || ''}
                onChange={(e) => chooseFormula(e.target.value ? Number(e.target.value) : null)}
              >
                {formulas.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.code} — {item.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="fm-control-item fm-control-revision">
              <label htmlFor="fm-revision-select" className="fm-control-label">
                Revision
              </label>
              <select
                id="fm-revision-select"
                className="fm-control-select"
                value={selectedRevisionId || ''}
                onChange={(e) => chooseRevision(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Choose revision</option>
                {revisions.map((item) => (
                  <option key={item.id} value={item.id}>
                    Rev {item.revision_number} ({item.base_output_quantity} {item.output_uom_code})
                  </option>
                ))}
              </select>
            </div>

            <div className="fm-control-item fm-control-status">
              <span className="fm-control-label">Status</span>
              <div className="fm-status-slot">
                {revision ? (
                  <RevisionBadge status={revision.status} />
                ) : (
                  <span className="fm-status-placeholder">—</span>
                )}
              </div>
            </div>

            {canEdit && (
              <div className="fm-control-item fm-control-action">
                <span className="fm-control-label" style={{ visibility: 'hidden' }}>Action</span>
                <button
                  type="button"
                  className="fm-btn-new-rev"
                  onClick={() => guardUnsaved() && setNewRevisionOpen(true)}
                >
                  + New Rev
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {notice && <Alert type="success">{notice}</Alert>}
      {detailError && <Alert type="error">{detailError}</Alert>}
      {listError && <Alert type="error">{listError}</Alert>}

      {/* CREATE FORMULA MODAL */}
      {creating && (
        <FormulaCreateForm
          companyId={companyId}
          product={product}
          onCancel={() => setCreating(false)}
          onCreated={(created) => {
            setCreating(false)
            setNotice(`Formula ${created.code} created as a draft. It is not approved.`)
            setFormulas((prev) => [...prev, created])
            setSelectedFormulaId(created.id)
          }}
        />
      )}

      {/* NEW REVISION MODAL */}
      {newRevisionOpen && formula && (
        <NewRevisionDialog
          companyId={companyId}
          formulaId={formula.id}
          onCancel={() => setNewRevisionOpen(false)}
          onCreated={async (created) => {
            setNewRevisionOpen(false)
            setNotice(`Revision ${created.revision_number} created as a draft. It starts with an empty material list.`)
            setSelectedRevisionId(created.id)
            setDirtyKinds({})
            await refreshRevisions()
          }}
        />
      )}

      {/* BMR REQUISITION SLIP MODAL (OFFICIAL PDF / PRINT ATTACHMENT 1 & ATTACHMENT 4) */}
      {bmrSlipOpen && (
        <BmrRequisitionSlipModal
          isOpen={bmrSlipOpen}
          onClose={() => {
            setBmrSlipOpen(false)
            setBmrSlipLines(null)
          }}
          product={product}
          formula={formula}
          revision={revision}
          activeLines={bmrSlipLines}
          company={company}
          initialTab={bmrSlipInitialTab}
        />
      )}

      {/* NO FORMULAS STATE */}
      {!listLoading && !listError && formulas.length === 0 && !creating && (
        <div className="fm-control-card" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <p style={{ fontSize: 16, fontWeight: 600, color: '#334155', margin: '0 0 8px' }}>
            No formulas created yet for this product.
          </p>
          <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 16px' }}>
            Create the master formula and BOM to specify raw ingredients, packaging, and batch requirements.
          </p>
          {canCreate && (
            <Button type="button" onClick={() => setCreating(true)}>
              + Create First Formula
            </Button>
          )}
        </div>
      )}

      {/* COMPACT DRAFT WORKFLOW RIBBON - ONLY WHEN IN DRAFT STATUS */}
      {revision?.status === 'DRAFT' && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          padding: '8px 14px',
          fontSize: 12,
          flexWrap: 'wrap',
          gap: 8
        }}>
          <span style={{ color: '#475569', fontWeight: 600 }}>
            📝 Draft Revision in progress — complete material lines and submit for QA review.
          </span>
          <ul className="fm-workflow-steps" style={{ margin: 0, padding: 0 }}>
            {WORKFLOW_STEPS.map((label, index) => {
              const isCompleted = index < currentStep
              const isActive = index === currentStep
              return (
                <li
                  key={label}
                  className={`fm-workflow-step ${isCompleted ? 'completed' : ''} ${isActive ? 'active' : ''}`}
                >
                  <span className="fm-step-circle">
                    {isCompleted ? '✓' : index + 1}
                  </span>
                  <span>{label}</span>
                  {index < WORKFLOW_STEPS.length - 1 && <span className="fm-step-divider">›</span>}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* --------------------------------------------------
          TAB 1: BILL OF MATERIALS (BOM & MATERIALS)
          -------------------------------------------------- */}
      {activeTab === 'bom' && revision && (
        <RevisionView
          key={revision.id}
          companyId={companyId}
          formulaId={selectedFormulaId}
          revision={revision}
          product={product}
          formula={formula}
          canEdit={canEdit}
          canSubmit={canSubmit}
          canApprove={canApprove}
          onDirtyChange={(kind, isDirty) => setDirtyKinds((prev) => ({ ...prev, [kind]: isDirty }))}
          onChanged={(msg) => {
            setNotice(msg)
            refreshRevisions()
          }}
          onRefresh={refreshRevisions}
          onOpenBmrSlip={(customLines, type = 'RM') => {
            setBmrSlipLines(customLines || null)
            setBmrSlipInitialTab(type)
            setBmrSlipOpen(true)
          }}
        />
      )}

      {/* --------------------------------------------------
          TAB 2: PRODUCTION RAW MATERIAL & CALCULATOR
          -------------------------------------------------- */}
      {activeTab === 'calculator' && (
        <div>
          {/* QA STATUS & APPROVAL BANNER — only shown when pending review or draft */}
          {revision && revision.status !== 'APPROVED' && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
              background: revision.status === 'SUBMITTED'
                ? 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)'
                : 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
              border: revision.status === 'SUBMITTED'
                ? '1.5px solid #fcd34d'
                : '1.5px solid #cbd5e1',
              borderRadius: 12,
              padding: '10px 18px',
              marginBottom: 10,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 18 }}>
                  {revision.status === 'SUBMITTED' ? '⏳' : '📝'}
                </span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>
                    Revision {revision.revision_number} &nbsp;
                    <span style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 20,
                      background: revision.status === 'SUBMITTED' ? '#d97706' : '#64748b',
                      color: '#fff',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}>
                      {revision.status}
                    </span>
                  </div>
                  <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 1 }}>
                    {revision.status === 'DRAFT' && 'Save the formula below, then submit for QA review.'}
                    {revision.status === 'SUBMITTED' && 'Pending QA review — QA can approve or reject from here.'}
                  </div>
                </div>
              </div>
              <ApprovalPanel
                companyId={companyId}
                formulaId={selectedFormulaId}
                revision={revision}
                product={product}
                formula={formula}
                canSubmit={canSubmit}
                canApprove={canApprove}
                onChanged={(msg) => {
                  setNotice(msg)
                  refreshRevisions()
                }}
              />
            </div>
          )}

          <ProductionRawMaterialCalculator
            companyId={companyId}
            formula={formula}
            revision={revision}
            product={product}
            onOpenBmrSlip={(customLines, type) => {
              setBmrSlipLines(customLines || null)
              setBmrSlipInitialTab(type)
              setBmrSlipOpen(true)
            }}
          />
        </div>
      )}


      {/* --------------------------------------------------
          TAB 3: REVISION HISTORY
          -------------------------------------------------- */}
      {activeTab === 'revisions' && (
        <div className="fm-table-section">
          <div className="fm-table-header">
            <div>
              <h4>Revision History</h4>
              <p>{revisions.length} revision{revisions.length === 1 ? '' : 's'} recorded for this formula</p>
            </div>
            {canEdit && formula && (
              <button
                type="button"
                className="fm-btn-new-rev"
                onClick={() => guardUnsaved() && setNewRevisionOpen(true)}
              >
                + New Revision
              </button>
            )}
          </div>

          <div className="fm-table-scroll">
            <table className="fm-history-table">
              <thead>
                <tr>
                  <th>Revision</th>
                  <th>Status</th>
                  <th>Base Batch Quantity</th>
                  <th>Output Unit</th>
                  <th>Approved Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {revisions.map((rev) => {
                  const isCurrent = rev.id === selectedRevisionId
                  return (
                    <tr key={rev.id} className={isCurrent ? 'current-rev' : ''}>
                      <td>
                        <strong>Revision {rev.revision_number}</strong>
                        {isCurrent && (
                          <span style={{ marginLeft: 8, fontSize: 11, color: '#16a34a', fontWeight: 700 }}>
                            (Viewing)
                          </span>
                        )}
                      </td>
                      <td>
                        <RevisionBadge status={rev.status} />
                      </td>
                      <td><strong>{rev.base_output_quantity}</strong></td>
                      <td>{rev.output_uom_code}</td>
                      <td>
                        {rev.approved_at ? new Date(rev.approved_at).toLocaleString() : '—'}
                      </td>
                      <td>
                        <button
                          type="button"
                          className={isCurrent ? 'fm-btn-table-active' : 'fm-btn-table-action'}
                          onClick={() => {
                            chooseRevision(rev.id)
                            setActiveTab('bom')
                          }}
                        >
                          {isCurrent ? '👁 View BOM' : 'Switch to this'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

/* =========================================================
   REVISION VIEW (TABLES & EDITING)
   ========================================================= */
function RevisionView({
  companyId,
  formulaId,
  revision,
  product,
  formula,
  canEdit,
  canSubmit,
  canApprove,
  onDirtyChange,
  onChanged,
  onRefresh,
  onOpenBmrSlip,
}) {
  const isDraft = revision.status === 'DRAFT'
  const editable = isDraft && canEdit
  const unit = revision.output_uom_code

  const initialRows = (kind) =>
    (revision.lines || [])
      .filter((line) => line.material_type === kind)
      .map((line) => {
        let qtyReceived = ''
        let qtyText = ''
        if (line.notes) {
          const parts = line.notes.split('|').map((s) => s.trim())
          for (const p of parts) {
            if (p.startsWith('RECV:')) qtyReceived = p.replace('RECV:', '').trim()
            if (p.startsWith('QTY_TEXT:')) qtyText = p.replace('QTY_TEXT:', '').trim()
          }
        }
        const calcMode = line.calculation_mode === 'AS_PER_LABEL_CLAIM'
          ? 'AS_PER_LABEL_CLAIM'
          : line.special_value && line.special_value.toUpperCase().includes('Q.S.')
          ? 'EXCIPIENT_QS'
          : line.label_claim && !line.label_claim_quantity
          ? 'AS_PER_LABEL_CLAIM'
          : line.calculation_mode || 'AS_PER_FORMULA'

        const displayQty = qtyText
          || (line.special_value && ['N/A', 'NA', 'N.A.', '-', '0'].includes(line.special_value.toUpperCase()) ? line.special_value : '')
          || (line.quantity && (Number(line.quantity) === 0.001 || (Number(line.quantity) === 1 && line.notes && line.notes.includes('QTY_TEXT:'))) ? (qtyText || '') : line.quantity)

        return {
          id: line.id,
          material: { id: line.material_id, code: line.material_code, name: line.material_name },
          unit: line.unit_code,
          quantity: displayQty,
          quantity_received: qtyReceived,
          notes: line.notes || '',
          potency: line.potency || '',
          label_claim: line.label_claim || '',
          special_value: line.special_value || '',
          ar_no: line.ar_no || '',
          calculation_mode: calcMode,
          label_claim_quantity: line.label_claim_quantity || '',
          label_claim_uom: line.label_claim_uom_id
            ? { id: line.label_claim_uom_id, code: line.label_claim_uom_code, label: `${line.label_claim_uom_name} (${line.label_claim_uom_code})` }
            : null,
        }
      })

  const initialSnapshot = JSON.stringify({ [RAW]: initialRows(RAW), [PACKAGING]: initialRows(PACKAGING) })
  const [rowsByKind, setRowsByKind] = useState(() => ({ [RAW]: initialRows(RAW), [PACKAGING]: initialRows(PACKAGING) }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [savedNote, setSavedNote] = useState('')
  const dirty = JSON.stringify(rowsByKind) !== initialSnapshot

  useEffect(() => {
    onDirtyChange(RAW, dirty)
    onDirtyChange(PACKAGING, dirty)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty])

  const save = async () => {
    setSaving(true)
    setError('')
    setSavedNote('')
    try {
      const lines = [
        ...buildRevisionLinesPayload({ allLines: [], kind: RAW, rows: rowsByKind[RAW] }),
        ...buildRevisionLinesPayload({ allLines: [], kind: PACKAGING, rows: rowsByKind[PACKAGING] }),
      ]
      await updateRevision(companyId, formulaId, revision.id, { expected_version: revision.version, lines })
      setSavedNote('Draft saved successfully.')
      onChanged('Draft saved.')
    } catch (err) {
      if (err?.response?.status === 409) {
        setError('This revision was changed elsewhere. The latest version is loaded and your rows are kept. Check them and save again.')
        await onRefresh()
      } else {
        setError(getErrorMessage(err))
      }
    } finally {
      setSaving(false)
    }
  }

  const getLiveLines = () => [
    ...rowsByKind[RAW].map((r, idx) => ({
      id: r.id ?? `raw-${idx}`,
      line_number: idx + 1,
      material_type: RAW,
      material: r.material,
      material_code: r.material?.code,
      material_name: r.material?.name,
      quantity: r.quantity,
      unit: r.unit,
      unit_code: r.unit,
      potency: r.potency,
      label_claim: r.calculation_mode === 'AS_PER_FORMULA' ? '—' : (r.label_claim || r.special_value),
      special_value: r.special_value,
      ar_no: r.ar_no,
      calculation_mode: r.calculation_mode,
      label_claim_quantity: r.label_claim_quantity,
      label_claim_uom: r.label_claim_uom,
    })),
    ...rowsByKind[PACKAGING].map((r, idx) => ({
      id: r.id ?? `pkg-${idx}`,
      line_number: rowsByKind[RAW].length + idx + 1,
      material_type: PACKAGING,
      material: r.material,
      material_code: r.material?.code,
      material_name: r.material?.name,
      quantity: r.quantity,
      quantity_received: r.quantity_received,
      unit: r.unit || 'NOS',
      unit_code: r.unit || 'NOS',
      potency: r.potency,
      label_claim: r.label_claim || r.special_value,
      special_value: r.special_value,
      ar_no: r.ar_no,
      calculation_mode: r.calculation_mode,
      label_claim_quantity: r.label_claim_quantity,
      label_claim_uom: r.label_claim_uom,
    })),
  ]

  return (
    <div className="fm-bom-content">
      {/* FORMULATION BASIS INFO */}
      <div className="fm-basis-strip">
        <div className="fm-basis-strip-content">
          <span className="fm-basis-strip-badge">
            📋 Formulation Basis: BMR Master Format
          </span>
          <span className="fm-basis-strip-text">
            Aligned with <strong>Drops RM Requisition (Attachment - 1)</strong> & <strong>Packing Material Requirement (Attachment - 4)</strong>.
          </span>
        </div>
      </div>

      {/* RAW MATERIALS (MATCHING PHARMA BMR SLIP ATTACHMENT 1) */}
      <MaterialTable
        title="Raw Materials & Ingredients"
        kind={RAW}
        rows={rowsByKind[RAW]}
        setRows={(next) => setRowsByKind((prev) => ({ ...prev, [RAW]: next }))}
        editable={editable}
        companyId={companyId}
      />

      {/* PACKAGING MATERIALS (ATTACHMENT 4 FORMAT) */}
      <PackagingMaterialTable
        title="Packaging Materials"
        rows={rowsByKind[PACKAGING]}
        setRows={(next) => setRowsByKind((prev) => ({ ...prev, [PACKAGING]: next }))}
        editable={editable}
        companyId={companyId}
      />

      {/* FOOTER ACTIONS BAR */}
      <div className="fm-footer-bar">
        <div className="fm-footer-left">
          <span
            className={`fm-pulse-dot ${
              saving ? 'fm-pulse-blue' : dirty ? 'fm-pulse-amber' : 'fm-pulse-green'
            }`}
          />
          <span
            style={{
              color: saving ? '#2563eb' : dirty ? '#b45309' : '#15803d',
            }}
          >
            {saving ? 'Saving draft…' : dirty ? 'Unsaved changes' : 'All changes saved'}
          </span>
          {savedNote && !dirty && !saving && (
            <span style={{ color: '#64748b', fontWeight: 500 }}>· {savedNote}</span>
          )}
          {error && <span style={{ color: '#b91c1c' }}>· {error}</span>}
        </div>

        <div className="fm-footer-right">
          <button
            type="button"
            className="fm-btn-slip fm-btn-rm-slip"
            onClick={() => onOpenBmrSlip(getLiveLines(), 'RM')}
            title="Generate and print BMR RM Requisition Slip (Attachment 1)"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            <span>RM Slip (Att. 1)</span>
          </button>

          <button
            type="button"
            className="fm-btn-slip fm-btn-pm-slip"
            onClick={() => onOpenBmrSlip(getLiveLines(), 'PM')}
            title="Generate and print BMR PM Requirement Slip (Attachment 4)"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
            <span>PM Slip (Att. 4)</span>
          </button>

          {editable && (
            <Button
              type="button"
              onClick={save}
              loading={saving}
              disabled={saving || !dirty}
            >
              Save Draft
            </Button>
          )}

          <ApprovalPanel
            companyId={companyId}
            formulaId={formulaId}
            revision={revision}
            product={product}
            formula={formula}
            canSubmit={canSubmit}
            canApprove={canApprove}
            onChanged={onChanged}
          />
        </div>
      </div>
    </div>
  )
}

/* =========================================================
   MATERIAL TABLE (RAW OR PACKAGING) WITH GUIDED BASIS
   ========================================================= */
function MaterialTable({ title, kind, rows, setRows, editable, companyId }) {
  const [modalOpen, setModalOpen] = useState(false)
  const [claimUnits, setClaimUnits] = useState([])

  useEffect(() => {
    listPlanningUnits(companyId)
      .then((rows2) => setClaimUnits(filterToOutputUnitChoices(rows2)))
      .catch(() => setClaimUnits([]))
  }, [companyId])

  const handleAddLine = (lineData) => {
    setRows([
      ...rows,
      lineData,
    ])
    setModalOpen(false)
  }

  const removeRow = (index, row) => {
    if (row.id != null && !confirmAction(`Remove ${row.material.name} from this revision? It is removed from the draft when you save.`)) return
    setRows(rows.filter((_, i) => i !== index))
  }

  return (
    <section className="fm-table-section" aria-label={title}>
      <div className="fm-table-header">
        <div>
          <h4>{title}</h4>
          <p>{rows.length === 1 ? '1 line' : `${rows.length} lines`} · Format aligned with BMR Raw Material Requisition Slip</p>
        </div>
        {editable && (
          <button type="button" className="fm-btn-add-mat" onClick={() => setModalOpen(true)}>
            + Add Material
          </button>
        )}
      </div>

      {modalOpen && (
        <GuidedAddMaterialModal
          kind={kind}
          exclude={rows.map((row) => row.material.id)}
          claimUnits={claimUnits}
          onAdd={handleAddLine}
          onClose={() => setModalOpen(false)}
        />
      )}

      {rows.length === 0 ? (
        <div className="fm-empty-table">
          {editable
            ? `No ${title.toLowerCase()} yet. Click "+ Add Material" above to choose calculation basis and add an ingredient.`
            : `No ${title.toLowerCase()} in this revision.`}
        </div>
      ) : (
        <div className="fm-table-scroll">
          <table className="fm-materials-table">
            <thead>
              <tr>
                <th className="fm-col-sr">Sr.</th>
                <th className="fm-col-rmcode">RM Code</th>
                <th className="fm-col-material">RAW MATERIAL NAME</th>
                <th className="fm-col-potency">Potency</th>
                <th className="fm-col-mode">Calculation Basis</th>
                <th className="fm-col-claim">Label Claim</th>
                <th className="fm-col-qty">Qty. Req</th>
                <th className="fm-col-unit">Unit</th>
                <th className="fm-col-ar">AR. No.</th>
                {editable && <th className="fm-col-action">Action</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const isFormula = row.calculation_mode === 'AS_PER_FORMULA'
                const isClaim = row.calculation_mode === 'AS_PER_LABEL_CLAIM'
                const isExcipient = row.calculation_mode === 'EXCIPIENT_QS' || (row.special_value && row.special_value.toUpperCase().includes('Q.S.'))

                return (
                  <tr key={row.id ?? `new-${index}`}>
                    <td className="fm-col-sr">{index + 1}</td>
                    <td className="fm-col-rmcode">
                      <span className="fm-badge fm-badge-code">
                        {row.material.code || `RM-${String(index + 1).padStart(3, '0')}`}
                      </span>
                    </td>
                    <td className="fm-col-material">
                      <span className="fm-material-name">{row.material.name}</span>
                    </td>
                    <td className="fm-col-potency">
                      <FieldText
                        value={row.potency}
                        label={`Potency for ${row.material.name}`}
                        editable={editable}
                        placeholder="e.g. 30C"
                        onChange={(v) =>
                          setRows(rows.map((r, i) => (i === index ? { ...r, potency: v } : r)))
                        }
                      />
                    </td>
                    <td className="fm-col-mode">
                      {editable ? (
                        <select
                          className="fm-cell-select"
                          value={row.calculation_mode || 'AS_PER_FORMULA'}
                          onChange={(e) =>
                            setRows(
                              rows.map((r, i) =>
                                i === index
                                  ? {
                                      ...r,
                                      calculation_mode: e.target.value,
                                      ...(e.target.value === 'AS_PER_FORMULA'
                                        ? { label_claim_quantity: '', label_claim_uom: null }
                                        : {}),
                                    }
                                  : r
                              )
                            )
                          }
                        >
                          <option value="AS_PER_FORMULA">🧪 As Per Formula</option>
                          <option value="AS_PER_LABEL_CLAIM">🏷️ As Per Label Claim</option>
                          <option value="EXCIPIENT_QS">💧 Excipient / Q.S.</option>
                        </select>
                      ) : (
                        <span
                          className={`fm-basis-badge ${
                            isClaim ? 'fm-basis-claim' : isExcipient ? 'fm-basis-excipient' : 'fm-basis-formula'
                          }`}
                        >
                          {isClaim ? 'Label Claim' : isExcipient ? 'Excipient Q.S.' : 'Formula Based'}
                        </span>
                      )}
                    </td>
                    <td className="fm-col-claim">
                      {isFormula ? (
                        <span style={{ color: '#94a3b8' }}>—</span>
                      ) : (
                        <FieldText
                          value={row.label_claim || (isClaim && row.label_claim_quantity ? `${row.label_claim_quantity} ${row.label_claim_uom?.code || ''}` : row.special_value)}
                          label={`Label claim for ${row.material.name}`}
                          editable={editable}
                          placeholder={isExcipient ? 'Q.S.' : 'e.g. 0.25 ML'}
                          onChange={(v) =>
                            setRows(rows.map((r, i) => (i === index ? { ...r, label_claim: v, special_value: v } : r)))
                          }
                        />
                      )}
                    </td>
                    <td className="fm-col-qty">
                      {editable ? (
                        <input
                          className="fm-cell-input fm-cell-input-num"
                          inputMode="decimal"
                          aria-label={`Quantity required for ${row.material.name}`}
                          value={row.quantity}
                          onChange={(e) =>
                            setRows(rows.map((r, i) => (i === index ? { ...r, quantity: e.target.value } : r)))
                          }
                          placeholder="e.g. 22.5"
                        />
                      ) : (
                        <strong>{row.quantity || '—'}</strong>
                      )}
                    </td>
                    <td className="fm-col-unit">
                      {editable ? (
                        <select
                          className="fm-cell-select"
                          value={row.unit || ''}
                          onChange={(e) =>
                            setRows(rows.map((r, i) => (i === index ? { ...r, unit: e.target.value } : r)))
                          }
                          style={{
                            padding: '4px 6px',
                            borderRadius: '4px',
                            border: '1px solid #cbd5e1',
                            fontSize: '12px',
                            fontWeight: 600,
                            background: '#f8fafc',
                            color: '#334155',
                            cursor: 'pointer',
                          }}
                        >
                          <option value="">—</option>
                          <option value="ML">ML</option>
                          <option value="L">L</option>
                          <option value="GM">GM</option>
                          <option value="KG">KG</option>
                          <option value="BTL">BTL</option>
                        </select>
                      ) : (
                        <span className="fm-unit-tag">{row.unit || '—'}</span>
                      )}
                    </td>
                    <td className="fm-col-ar">
                      <FieldText
                        value={row.ar_no}
                        label={`AR No. for ${row.material.name}`}
                        editable={editable}
                        placeholder="e.g. AR-01"
                        onChange={(v) =>
                          setRows(rows.map((r, i) => (i === index ? { ...r, ar_no: v } : r)))
                        }
                      />
                    </td>
                    {editable && (
                      <td className="fm-col-action">
                        <button
                          type="button"
                          className="fm-del-btn"
                          title="Remove line"
                          onClick={() => removeRow(index, row)}
                        >
                          ✕
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function FieldText({ value, label, editable, placeholder, onChange }) {
  if (!editable) return <span>{value || '—'}</span>
  return (
    <input
      className="fm-cell-input"
      aria-label={label}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

/* =========================================================
   PACKAGING MATERIAL TABLE (ALIGNED WITH ATTACHMENT - 4)
   ========================================================= */
function PackagingMaterialTable({ title, rows, setRows, editable, companyId }) {
  const [modalOpen, setModalOpen] = useState(false)

  const handleAddLine = (lineData) => {
    setRows([...rows, lineData])
    setModalOpen(false)
  }

  const removeRow = (index, row) => {
    if (row.id != null && !confirmAction(`Remove ${row.material?.name || 'this material'} from this revision? It is removed from the draft when you save.`)) return
    setRows(rows.filter((_, i) => i !== index))
  }

  return (
    <section className="fm-table-section" aria-label={title}>
      <div className="fm-table-header">
        <div>
          <h4>{title}</h4>
          <p>{rows.length === 1 ? '1 line' : `${rows.length} lines`} · Format aligned with BMR Packing Material Requirement (Attachment - 4)</p>
        </div>
        {editable && (
          <button type="button" className="fm-btn-add-mat" onClick={() => setModalOpen(true)}>
            + Add Packaging Material
          </button>
        )}
      </div>

      {modalOpen && (
        <AddPackagingMaterialModal
          exclude={rows.map((row) => row.material?.id).filter(Boolean)}
          onAdd={handleAddLine}
          onClose={() => setModalOpen(false)}
        />
      )}

      {rows.length === 0 ? (
        <div className="fm-empty-table">
          {editable
            ? 'No packaging materials yet. Click "+ Add Packaging Material" above to add PM code, material name, quantities, and AR No.'
            : 'No packaging materials in this revision.'}
        </div>
      ) : (
        <div className="fm-table-scroll">
          <table className="fm-materials-table">
            <thead>
              <tr>
                <th className="fm-col-sr" style={{ width: 45 }}>Sr.</th>
                <th style={{ width: 110 }}>PM Code</th>
                <th>Material</th>
                <th style={{ width: 140 }}>Quantity Required (Nos.)</th>
                <th style={{ width: 140 }}>Quantity Received (Nos.)</th>
                <th style={{ width: 110 }}>AR No.</th>
                {editable && <th className="fm-col-action" style={{ width: 60 }}>Action</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const pmCode = row.material?.code || `PM-${String(index + 1).padStart(3, '0')}`
                return (
                  <tr key={row.id ?? `new-pm-${index}`}>
                    <td className="fm-col-sr">{index + 1}</td>
                    <td>
                      <span className="fm-badge fm-badge-code" style={{ background: '#f0fdf4', color: '#166534', borderColor: '#bbf7d0' }}>
                        {pmCode}
                      </span>
                    </td>
                    <td>
                      <span className="fm-material-name">{row.material?.name || '—'}</span>
                    </td>
                    <td>
                      {editable ? (
                        <input
                          className="fm-cell-input"
                          aria-label={`Quantity required for ${row.material?.name}`}
                          value={row.quantity || ''}
                          onChange={(e) =>
                            setRows(rows.map((r, i) => (i === index ? { ...r, quantity: e.target.value } : r)))
                          }
                          placeholder="e.g. 1000 or N/A"
                        />
                      ) : (
                        <strong>{row.quantity || '—'}</strong>
                      )}
                    </td>
                    <td>
                      {editable ? (
                        <input
                          className="fm-cell-input"
                          aria-label={`Quantity received for ${row.material?.name}`}
                          value={row.quantity_received || ''}
                          onChange={(e) =>
                            setRows(rows.map((r, i) => (i === index ? { ...r, quantity_received: e.target.value } : r)))
                          }
                          placeholder="e.g. 1000 or N/A"
                        />
                      ) : (
                        <span>{row.quantity_received || '—'}</span>
                      )}
                    </td>
                    <td>
                      {editable ? (
                        <FieldText
                          value={row.ar_no || ''}
                          label={`AR No. for ${row.material?.name}`}
                          editable={editable}
                          placeholder="e.g. AR-PM-01"
                          onChange={(v) =>
                            setRows(rows.map((r, i) => (i === index ? { ...r, ar_no: v } : r)))
                          }
                        />
                      ) : (
                        <span>{row.ar_no || '—'}</span>
                      )}
                    </td>
                    {editable && (
                      <td className="fm-col-action">
                        <button
                          type="button"
                          className="fm-del-btn"
                          title="Remove line"
                          onClick={() => removeRow(index, row)}
                        >
                          ✕
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

/* =========================================================
   ADD PACKAGING MATERIAL MODAL (PM CODE, PM NAME, QTY REQ, QTY RECV, AR NO)
   ========================================================= */
function AddPackagingMaterialModal({ exclude = [], onAdd, onClose }) {
  const [term, setTerm] = useState('')
  const [options, setOptions] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedMaterial, setSelectedMaterial] = useState(null)
  const [pmCode, setPmCode] = useState('')
  const [pmName, setPmName] = useState('')
  const [qtyRequired, setQtyRequired] = useState('')
  const [qtyReceived, setQtyReceived] = useState('')
  const [arNo, setArNo] = useState('')
  const [error, setError] = useState('')
  const excludeSet = new Set(exclude)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    searchMaterials(term, PACKAGING)
      .then((rows) => !cancelled && setOptions(rows.filter((o) => !excludeSet.has(o.id))))
      .catch(() => !cancelled && setOptions([]))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [term])

  const handlePick = (option) => {
    setSelectedMaterial(option)
    setPmCode(option.code || '')
    setPmName(option.name || '')
    setError('')
  }

  const handleSave = () => {
    if (!selectedMaterial && !pmName.trim()) {
      setError('Please choose or enter a packaging material.')
      return
    }

    const materialObj = selectedMaterial || {
      id: null,
      code: pmCode.trim(),
      name: pmName.trim(),
    }

    onAdd({
      id: null,
      material: materialObj,
      unit: 'NOS',
      quantity: qtyRequired.trim(),
      quantity_received: qtyReceived.trim(),
      ar_no: arNo.trim(),
      notes: qtyReceived.trim() ? `RECV:${qtyReceived.trim()}` : '',
      potency: '',
      label_claim: '',
      special_value: '',
      calculation_mode: 'AS_PER_FORMULA',
      label_claim_quantity: '',
      label_claim_uom: null,
    })
  }

  return (
    <Modal
      title="Add Packaging Material"
      onClose={onClose}
      maxWidth="560px"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={!selectedMaterial && !pmName.trim()}>
            Add Packaging Material
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* MATERIAL PICKER */}
        <div>
          <label className="fm-field-label" style={{ fontWeight: 700, marginBottom: 6 }}>
            Select Packaging Material
          </label>
          {!selectedMaterial ? (
            <div>
              <input
                className="fm-cell-input"
                style={{ height: 38 }}
                autoFocus
                placeholder="Search packaging material (e.g. BOTTLE, CAP, MONO BOX, LABEL)..."
                value={term}
                onChange={(e) => setTerm(e.target.value)}
              />
              {loading && (
                <div style={{ padding: '8px 0' }}>
                  <Spinner size="xs" tone="muted" label="Searching packaging materials…" />
                </div>
              )}
              <div style={{ maxHeight: 150, overflowY: 'auto', marginTop: 6, border: '1px solid #e2e8f0', borderRadius: 8 }}>
                {options.length === 0 && !loading && (
                  <p style={{ fontSize: 12, color: '#64748b', padding: 12, margin: 0 }}>
                    No matching packaging materials found. You can fill details manually below.
                  </p>
                )}
                {options.map((opt) => (
                  <div
                    key={opt.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 12px',
                      borderBottom: '1px solid #f1f5f9',
                      cursor: 'pointer',
                      fontSize: 13,
                    }}
                    className="ci-subtab-btn"
                    onClick={() => handlePick(opt)}
                  >
                    <span>
                      <strong>{opt.name}</strong> <span style={{ color: '#0284c7' }}>({opt.code})</span>
                    </span>
                    <span style={{ fontSize: 11, color: '#64748b' }}>{opt.unitCode || 'NOS'}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8 }}>
              <div>
                <strong style={{ color: '#166534' }}>{selectedMaterial.name}</strong>
                <span style={{ marginLeft: 8, color: '#15803d', fontSize: 12 }}>({selectedMaterial.code})</span>
              </div>
              <button
                type="button"
                className="table-edit"
                style={{ color: '#15803d', fontSize: 12, cursor: 'pointer' }}
                onClick={() => setSelectedMaterial(null)}
              >
                Change
              </button>
            </div>
          )}
        </div>

        {/* 5 EXACT FIELDS REQUESTED BY USER */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 4 }}>
          <div>
            <label className="fm-field-label">PM Code</label>
            <input
              className="fm-cell-input"
              value={pmCode}
              onChange={(e) => setPmCode(e.target.value)}
              placeholder="e.g. PM-001"
            />
          </div>

          <div>
            <label className="fm-field-label">PM Name</label>
            <input
              className="fm-cell-input"
              value={pmName}
              onChange={(e) => setPmName(e.target.value)}
              placeholder="e.g. Label / Mono Box / Bottle"
            />
          </div>

          <div>
            <label className="fm-field-label">Quantity Required (Nos.)</label>
            <input
              className="fm-cell-input fm-cell-input-num"
              inputMode="decimal"
              value={qtyRequired}
              onChange={(e) => setQtyRequired(e.target.value)}
              placeholder="e.g. 1000"
            />
          </div>

          <div>
            <label className="fm-field-label">Quantity Received (Nos.)</label>
            <input
              className="fm-cell-input fm-cell-input-num"
              inputMode="decimal"
              value={qtyReceived}
              onChange={(e) => setQtyReceived(e.target.value)}
              placeholder="e.g. 1000"
            />
          </div>

          <div style={{ gridColumn: 'span 2' }}>
            <label className="fm-field-label">AR No.</label>
            <input
              className="fm-cell-input"
              value={arNo}
              onChange={(e) => setArNo(e.target.value)}
              placeholder="e.g. AR-PM-01"
            />
          </div>
        </div>

        {error && <Alert type="error">{error}</Alert>}
      </div>
    </Modal>
  )
}


/* =========================================================
   GUIDED ADD MATERIAL MODAL (STEP 1: MATERIAL -> STEP 2: BASIS -> STEP 3: VALUES)
   ========================================================= */
function GuidedAddMaterialModal({ kind, exclude, claimUnits, onAdd, onClose }) {
  const [term, setTerm] = useState('')
  const [options, setOptions] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedMaterial, setSelectedMaterial] = useState(null)
  const [calcBasis, setCalcBasis] = useState('AS_PER_FORMULA') // 'AS_PER_FORMULA' | 'AS_PER_LABEL_CLAIM' | 'EXCIPIENT_QS'
  const [quantity, setQuantity] = useState('22.5')
  const [unitCode, setUnitCode] = useState('')
  const [labelClaim, setLabelClaim] = useState('0.25 ML')
  const [arNo, setArNo] = useState('')
  const [potency, setPotency] = useState('')
  const [error, setError] = useState('')
  const excludeSet = new Set(exclude)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    searchMaterials(term, kind)
      .then((rows) => !cancelled && setOptions(rows.filter((o) => !excludeSet.has(o.id))))
      .catch(() => !cancelled && setOptions([]))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, kind])

  const handlePick = (option) => {
    setSelectedMaterial(option)
    setUnitCode(option.unitCode || '')
    setError('')
    if (option.name.toUpperCase().includes('ALCOHOL')) {
      setCalcBasis('EXCIPIENT_QS')
      setLabelClaim('45% V/V')
    } else if (option.name.toUpperCase().includes('EXCIPIENT') || option.name.toUpperCase().includes('WATER')) {
      setCalcBasis('EXCIPIENT_QS')
      setLabelClaim('Q.S.')
    }
  }

  const handleSave = () => {
    if (!selectedMaterial) {
      setError('Please choose a material.')
      return
    }

    onAdd({
      id: null,
      material: { id: selectedMaterial.id, code: selectedMaterial.code, name: selectedMaterial.name },
      unit: unitCode,
      quantity: quantity.trim(),
      notes: '',
      potency: potency.trim(),
      label_claim: labelClaim.trim(),
      special_value: calcBasis === 'EXCIPIENT_QS' ? (labelClaim.trim() || 'Q.S.') : '',
      ar_no: arNo.trim(),
      calculation_mode: calcBasis === 'AS_PER_LABEL_CLAIM' ? 'AS_PER_LABEL_CLAIM' : 'AS_PER_FORMULA',
      label_claim_quantity: calcBasis === 'AS_PER_LABEL_CLAIM' ? labelClaim.replace(/[^0-9.]/g, '') || '0.25' : '',
      label_claim_uom: null,
    })
  }

  return (
    <Modal
      title="Add Material to Batch Formula"
      onClose={onClose}
      maxWidth="620px"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={!selectedMaterial}>
            Add Material to List
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* STEP 1: CHOOSE MATERIAL */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span className="fm-guided-step-badge">1</span>
            <strong style={{ fontSize: 13, color: '#0f172a' }}>Select Raw Material / Ingredient</strong>
          </div>

          {!selectedMaterial ? (
            <div>
              <input
                className="fm-cell-input"
                style={{ height: 38 }}
                autoFocus
                placeholder={kind === 'RAW_MATERIAL' ? 'Type ingredient name or code (e.g. AURUM, HYDRASTIS, LACTOSE)...' : 'Search packaging material...'}
                value={term}
                onChange={(e) => setTerm(e.target.value)}
              />
              {loading && <div style={{ padding: '8px 0' }}><Spinner size="xs" tone="muted" label="Searching materials…" /></div>}
              <div style={{ maxHeight: 160, overflowY: 'auto', marginTop: 6, border: '1px solid #e2e8f0', borderRadius: 8 }}>
                {options.length === 0 && !loading && (
                  <p style={{ fontSize: 12, color: '#64748b', padding: 12, margin: 0 }}>No matching materials found.</p>
                )}
                {options.map((opt) => (
                  <div
                    key={opt.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 12px',
                      borderBottom: '1px solid #f1f5f9',
                      cursor: 'pointer',
                      fontSize: 13,
                    }}
                    className="ci-subtab-btn"
                    onClick={() => handlePick(opt)}
                  >
                    <span><strong>{opt.name}</strong> <span style={{ color: '#0284c7' }}>({opt.code})</span></span>
                    <span style={{ fontSize: 11, color: '#64748b' }}>{opt.unitCode}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px 8px 0 0' }}>
                <div>
                  <strong style={{ color: '#0369a1' }}>{selectedMaterial.name}</strong>
                  <span style={{ marginLeft: 8, color: '#0284c7', fontSize: 12 }}>({selectedMaterial.code})</span>
                  <span style={{ marginLeft: 8, fontSize: 12, color: '#64748b' }}>· Unit: {selectedMaterial.unitCode}</span>
                </div>
                <button
                  type="button"
                  className="table-edit"
                  style={{ color: '#0284c7', fontSize: 12, cursor: 'pointer' }}
                  onClick={() => setSelectedMaterial(null)}
                >
                  Change
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: '#f8fafc', border: '1px solid #bae6fd', borderTop: 'none', borderRadius: '0 0 8px 8px' }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', whiteSpace: 'nowrap' }}>Potency:</label>
                <input
                  className="fm-cell-input"
                  style={{ flex: 1, height: 32, fontSize: 13 }}
                  value={potency}
                  onChange={(e) => setPotency(e.target.value)}
                  placeholder="e.g. 30C, 200C, Q, 1M"
                />
              </div>
            </div>
          )}
        </div>

        {/* STEP 2: CHOOSE CALCULATION BASIS (PROMINENT COMPACT SEGMENTED BUTTONS) */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span className="fm-guided-step-badge">2</span>
            <strong style={{ fontSize: 13, color: '#0f172a' }}>Choose Calculation Basis</strong>
          </div>

          <div className="fm-basis-segmented-group">
            <button
              type="button"
              className={`fm-basis-seg-btn ${calcBasis === 'AS_PER_FORMULA' ? 'active' : ''}`}
              onClick={() => setCalcBasis('AS_PER_FORMULA')}
            >
              <span className="fm-seg-icon">🧪</span>
              <span className="fm-seg-title">As Per Formula</span>
              <span className="fm-seg-sub">Fixed Batch Qty</span>
            </button>

            <button
              type="button"
              className={`fm-basis-seg-btn ${calcBasis === 'AS_PER_LABEL_CLAIM' ? 'active' : ''}`}
              onClick={() => setCalcBasis('AS_PER_LABEL_CLAIM')}
            >
              <span className="fm-seg-icon">🏷️</span>
              <span className="fm-seg-title">As Per Label Claim</span>
              <span className="fm-seg-sub">Active API Potency</span>
            </button>

            <button
              type="button"
              className={`fm-basis-seg-btn ${calcBasis === 'EXCIPIENT_QS' ? 'active' : ''}`}
              onClick={() => {
                setCalcBasis('EXCIPIENT_QS')
                if (!labelClaim || labelClaim === '0.25 ML') setLabelClaim('Q.S.')
              }}
            >
              <span className="fm-seg-icon">💧</span>
              <span className="fm-seg-title">Excipient / Q.S.</span>
              <span className="fm-seg-sub">Vehicle / Solvent</span>
            </button>
          </div>
        </div>

        {/* STEP 3: VALUES & VERIFICATION */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span className="fm-guided-step-badge">3</span>
            <strong style={{ fontSize: 13, color: '#0f172a' }}>Quantities & Slip Fields</strong>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="fm-field-label">Quantity Required (Qty. Req)</label>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  className="fm-cell-input fm-cell-input-num"
                  inputMode="decimal"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="e.g. 22.5"
                />
                <select
                  className="fm-cell-select"
                  value={unitCode}
                  onChange={(e) => setUnitCode(e.target.value)}
                  style={{ width: 70, height: 36, fontSize: 13, fontWeight: 600 }}
                >
                  <option value="">—</option>
                  <option value="ML">ML</option>
                  <option value="L">L</option>
                  <option value="GM">GM</option>
                  <option value="KG">KG</option>
                  <option value="BTL">BTL</option>
                </select>
              </div>
            </div>

            {calcBasis !== 'AS_PER_FORMULA' && (
              <div>
                <label className="fm-field-label">Label Claim Text</label>
                <input
                  className="fm-cell-input"
                  value={labelClaim}
                  onChange={(e) => setLabelClaim(e.target.value)}
                  placeholder="e.g. 0.25 ML or Q.S."
                />
              </div>
            )}

            <div>
              <label className="fm-field-label">AR. No. (QC Report Ref)</label>
              <input
                className="fm-cell-input"
                value={arNo}
                onChange={(e) => setArNo(e.target.value)}
                placeholder="e.g. AR-01"
              />
            </div>


            <div>
              <label className="fm-field-label">RM Code</label>
              <input
                className="fm-cell-input"
                value={selectedMaterial?.code || ''}
                readOnly
                style={{ background: '#f8fafc', color: '#64748b' }}
              />
            </div>
          </div>
        </div>

        {error && <Alert type="error">{error}</Alert>}
      </div>
    </Modal>
  )
}

/* =========================================================
   APPROVAL & LIFECYCLE PANEL
   ========================================================= */
function ApprovalPanel({ companyId, formulaId, revision, product, formula, canSubmit, canApprove, onChanged }) {
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showSubmitModal, setShowSubmitModal] = useState(false)
  const [showApproveModal, setShowApproveModal] = useState(false)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectCategory, setRejectCategory] = useState('Stoichiometric Discrepancy')
  const [approvalRemarks, setApprovalRemarks] = useState('')

  const check = useCallback(async () => {
    if (!companyId || !formulaId || !revision?.id) return
    setLoading(true)
    setError('')
    try {
      const data = await getApprovalPreview(companyId, formulaId, revision.id)
      setPreview(data)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [companyId, formulaId, revision?.id])

  // Automatically check approval eligibility whenever the revision is SUBMITTED
  useEffect(() => {
    if (revision?.status === 'SUBMITTED') {
      check()
    } else {
      setPreview(null)
    }
  }, [revision?.status, revision?.id, check])

  const executeSubmit = async () => {
    setLoading(true)
    setError('')
    try {
      await submitRevision(companyId, formulaId, revision.id, revision.version)
      setShowSubmitModal(false)
      onChanged(`Revision ${revision.revision_number} submitted for review.`)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const executeApprove = async () => {
    setLoading(true)
    setError('')
    try {
      await approveRevision(companyId, formulaId, revision.id, revision.version, approvalRemarks.trim() || undefined)
      setShowApproveModal(false)
      setApprovalRemarks('')
      onChanged(`Revision ${revision.revision_number} approved successfully!`)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const executeReject = async () => {
    const trimmed = rejectReason.trim()
    if (!trimmed || trimmed.length < 5) {
      setError('Please enter at least 5 characters explaining why this revision is being declined.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const fullReason = `[${rejectCategory}] ${trimmed}`
      await rejectRevision(companyId, formulaId, revision.id, revision.version, fullReason)
      setShowRejectModal(false)
      setRejectReason('')
      setRejectCategory('Stoichiometric Discrepancy')
      onChanged(`Revision ${revision.revision_number} declined and returned to draft.`)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const submitState = submitActionState(revision, canSubmit)
  const approvalState = approvalActionState(preview, revision, canApprove)
  const eligibility = preview?.eligibility

  // ── APPROVED ──
  if (revision?.status === 'APPROVED') {
    return (
      <div className="fm-approved-status-badge">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
        <span>Approved Formula Revision</span>
      </div>
    )
  }

  // ── DRAFT ──
  if (revision?.status === 'DRAFT') {
    const materialCount = (revision?.lines || []).length
    const baseQty = revision?.base_output_quantity || formula?.base_quantity || '100'
    const baseUnit = revision?.output_uom_code || formula?.base_unit || 'g'

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="fm-btn-submit-review"
            onClick={() => { setError(''); setShowSubmitModal(true) }}
            disabled={!submitState.canSubmit || loading}
            title={submitState.reason || 'Submit this revision for QA review'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
            <span>{loading ? 'Submitting…' : 'Submit for Review'}</span>
          </button>
        </div>
        {submitState.reason && (
          <span style={{ fontSize: 11, color: '#b45309', maxWidth: 280, textAlign: 'right' }}>
            ⚠ {submitState.reason}
          </span>
        )}
        {error && <span style={{ color: '#b91c1c', fontSize: 12 }}>{error}</span>}

        {/* Send to QC for Approval Confirmation Modal (Enhanced to match Screenshot 1) */}
        {showSubmitModal && (
          <Modal
            title="Get Quality Control (QC) Approval"
            onClose={() => { if (!loading) setShowSubmitModal(false) }}
            maxWidth="560px"
            footer={
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <Button type="button" variant="secondary" onClick={() => setShowSubmitModal(false)} disabled={loading}>
                  Cancel
                </Button>
                <Button type="button" onClick={executeSubmit} loading={loading} disabled={loading}>
                  Confirm & Submit
                </Button>
              </div>
            }
          >
            <div className="qc-submit-modal-content">
              <p style={{ margin: '0 0 14px 0', fontSize: '13.5px', color: '#475569', lineHeight: 1.5 }}>
                Review the stoichiometric batch calculation snapshot before forwarding to Quality Control for review:
              </p>

              <div className="qc-summary-read-only-card">
                <div className="qc-summary-row">
                  <span className="lbl">Product:</span>
                  <span className="val bold-val">{product?.name || '—'} {product?.code ? `(${product.code})` : ''}</span>
                </div>
                <div className="qc-summary-row">
                  <span className="lbl">Formula:</span>
                  <span className="val">{formula?.name || formula?.code || `Formula #${formulaId}`}</span>
                </div>
                <div className="qc-summary-row">
                  <span className="lbl">Revision:</span>
                  <span className="val">Rev {revision?.revision_number !== undefined ? String(revision.revision_number).padStart(2, '0') : '00'}</span>
                </div>
                <div className="qc-summary-row">
                  <span className="lbl">Formula Base:</span>
                  <span className="val">{baseQty} {baseUnit}</span>
                </div>
                <div className="qc-summary-row">
                  <span className="lbl">Target Batch Qty:</span>
                  <span className="val bold-val" style={{ color: '#0f766e' }}>
                    {baseQty} {baseUnit} (1× scale)
                  </span>
                </div>
                <div className="qc-summary-row">
                  <span className="lbl">Material Count:</span>
                  <span className="val">{materialCount} Ingredients</span>
                </div>
              </div>

              <div style={{ marginTop: '14px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Remarks for QC (Optional)
                </label>
                <textarea
                  className="fm-cell-input"
                  style={{ width: '100%', minHeight: 70, resize: 'vertical', fontFamily: 'inherit', borderRadius: 8, padding: '8px 10px', fontSize: 13 }}
                  rows="3"
                  placeholder="e.g. Standard production batch calculation for scheduled Q1 commercial run. All excipients stoichiometry verified."
                  value={approvalRemarks}
                  onChange={(e) => setApprovalRemarks(e.target.value)}
                />
              </div>

              <div style={{ marginTop: '12px' }}>
                <p style={{ margin: 0, fontSize: '12px', color: '#64748b', lineHeight: 1.45 }}>
                  Submitting creates an immutable snapshot of this calculation. Formula edits in draft mode will not alter the submitted record until re-submitted.
                </p>
              </div>

              {error && (
                <div style={{ marginTop: '12px' }}>
                  <Alert type="error">{error}</Alert>
                </div>
              )}
            </div>
          </Modal>
        )}
      </div>
    )
  }

  // ── SUBMITTED ──
  if (revision?.status === 'SUBMITTED') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Re-check button */}
          <Button type="button" variant="secondary" onClick={check} loading={loading} disabled={loading} title="Re-evaluate approval checks">
            🔄 Check Status
          </Button>

          {/* Approve button */}
          <button
            type="button"
            className="fm-btn-approve"
            onClick={() => { setError(''); setShowApproveModal(true) }}
            disabled={!approvalState.canApprove || loading}
            title={approvalState.reason || 'Approve this revision'}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>{loading ? 'Approving…' : `Approve Rev. ${revision.revision_number}`}</span>
          </button>

          {/* Reject back to draft */}
          <button
            type="button"
            className="fm-btn-reject"
            onClick={() => { setError(''); setRejectReason(''); setShowRejectModal(true) }}
            disabled={loading}
          >
            ✕ Reject to Draft
          </button>
        </div>

        {/* Status / Blocking reasons */}
        {approvalState.reason && (
          <span style={{ fontSize: 11, color: '#b45309', maxWidth: 320, textAlign: 'right' }}>
            ⚠ {approvalState.reason}
          </span>
        )}
        {eligibility?.blocking_reasons?.map((b) => (
          <span key={b.code} style={{ fontSize: 11, color: '#b91c1c', maxWidth: 340, textAlign: 'right' }}>
            • {b.message}
          </span>
        ))}
        {error && <span style={{ color: '#b91c1c', fontSize: 12 }}>{error}</span>}

        {/* ── APPROVE CONFIRMATION MODAL (Reference UI) ── */}
        {showApproveModal && (
          <Modal
            title={`Approve Master Formulation — Rev ${revision.revision_number}`}
            onClose={() => { if (!loading) setShowApproveModal(false) }}
            footer={
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <Button type="button" variant="secondary" onClick={() => setShowApproveModal(false)} disabled={loading}>
                  Cancel
                </Button>
                <Button type="button" onClick={executeApprove} loading={loading} disabled={loading}>
                  ✓ Confirm &amp; Certify Formula
                </Button>
              </div>
            }
          >
            <div>
              <p style={{ margin: '0 0 14px 0', fontSize: '13.5px', color: '#334155', lineHeight: 1.5 }}>
                You are certifying that the stoichiometric scaling for{' '}
                <strong>{product?.name}</strong>
                {product?.code ? ` (${product.code})` : ''} meets all pharmaceutical quality standards and BMR release criteria.
              </p>

              <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 16 }}>
                <div style={{ fontSize: '13px', display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ color: '#64748b' }}>Product:</span>
                  <span style={{ fontWeight: 600 }}>{product?.name || '—'}</span>
                </div>
                <div style={{ fontSize: '13px', display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ color: '#64748b' }}>Formula:</span>
                  <span style={{ fontWeight: 600 }}>{formula?.name || formula?.code || `Formula #${formulaId}`}</span>
                </div>
                <div style={{ fontSize: '13px', display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ color: '#64748b' }}>Revision:</span>
                  <span style={{ fontWeight: 600 }}>
                    Rev {String(revision.revision_number).padStart(2, '0')}{revision.name ? ` — ${revision.name}` : ''}
                  </span>
                </div>
                <div style={{ fontSize: '13px', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Base Batch:</span>
                  <span style={{ fontWeight: 700, color: '#0f766e' }}>
                    {revision.base_output_quantity} {revision.output_uom_code} (1× Scale)
                  </span>
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                  QC Approval Remarks / BMR Release Endorsement (Optional)
                </label>
                <textarea
                  className="fm-cell-input"
                  rows="3"
                  style={{ width: '100%', minHeight: 72, resize: 'vertical', fontFamily: 'inherit', borderRadius: 8, padding: '8px 10px', fontSize: 13 }}
                  placeholder="e.g. Stoichiometric calculations verified against SOP/QA/04/F-02/00. Formula approved for commercial production."
                  value={approvalRemarks}
                  onChange={(e) => setApprovalRemarks(e.target.value)}
                />
              </div>

              <Alert type="info">
                Approval will unlock official BMR Requisition Slip issuance and reflect live in the Products module.
              </Alert>

              {error && (
                <div style={{ marginTop: 10 }}>
                  <Alert type="error">{error}</Alert>
                </div>
              )}
            </div>
          </Modal>
        )}

        {/* ── REJECT MODAL (Reference UI — Decline Formulation) ── */}
        {showRejectModal && (
          <Modal
            title={`Decline Formulation Calculation — Rev ${revision.revision_number}`}
            onClose={() => { if (!loading) { setShowRejectModal(false); setError('') } }}
            footer={
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <Button type="button" variant="secondary" onClick={() => { setShowRejectModal(false); setError('') }} disabled={loading}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  onClick={executeReject}
                  loading={loading}
                  disabled={loading || !rejectReason.trim() || rejectReason.trim().length < 5}
                >
                  ✕ Confirm Decline &amp; Log Finding
                </Button>
              </div>
            }
          >
            <div>
              {error && (
                <div style={{ marginBottom: 12 }}>
                  <Alert type="error">{error}</Alert>
                </div>
              )}

              <p style={{ margin: '0 0 14px 0', fontSize: '13.5px', color: '#7f1d1d', lineHeight: 1.5 }}>
                Declining will return this formula calculation to Production with documented non-compliance findings.{' '}
                A detailed analytical reason is strictly required.
              </p>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                  Discrepancy Category <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <select
                  className="fm-cell-input"
                  style={{ width: '100%', borderRadius: 8, padding: '8px 10px', fontSize: 13 }}
                  value={rejectCategory}
                  onChange={(e) => setRejectCategory(e.target.value)}
                >
                  {[
                    'Stoichiometric Discrepancy',
                    'Ingredient Out of Spec',
                    'Excipient Ratio Mismatch',
                    'Regulatory Non-Compliance',
                    'Dosage / Potency Issue',
                    'Missing Certificate of Analysis (COA)',
                    'Other Analytical Variance',
                  ].map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                  Analytical Decline Reason <span style={{ color: '#dc2626' }}>* (Mandatory)</span>
                </label>
                <textarea
                  className="fm-cell-input"
                  rows="4"
                  style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', borderRadius: 8, padding: '8px 10px', fontSize: 13 }}
                  placeholder="Describe specific stoichiometric errors, out-of-spec ingredient ratios, pharmacopeial limits exceeded, or required formula adjustments..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  autoFocus
                  required
                />
                <span style={{ fontSize: '11.5px', color: '#64748b', marginTop: 4, display: 'block' }}>
                  Minimum 5 characters. This statement will be permanently recorded in the formula audit log.
                </span>
              </div>

              <Alert type="warning">
                Production will receive this finding and be prompted to adjust base active weights, excipients, or batch parameters before resubmitting.
              </Alert>
            </div>
          </Modal>
        )}
      </div>
    )
  }

  return null
}

/* =========================================================
   CREATE FORMULA MODAL
   ========================================================= */
function FormulaCreateForm({ companyId, product, onCancel, onCreated }) {
  const [basis, setBasis] = useState('HYBRID_BMR') // 'AS_PER_FORMULA' | 'AS_PER_LABEL_CLAIM' | 'HYBRID_BMR'
  const [quantity, setQuantity] = useState('100')
  const [unitId, setUnitId] = useState('')
  const [units, setUnits] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    listPlanningUnits(companyId)
      .then((rows) => {
        const filtered = filterToOutputUnitChoices(rows)
        setUnits(filtered)
        if (filtered.length && !unitId) setUnitId(String(filtered[0].id))
      })
      .catch(() => setUnits([]))
  }, [companyId, unitId])

  const submit = async () => {
    if (saving) return
    if (!quantity.trim() || !unitId) {
      setError('Enter batch quantity and select an output unit.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const created = await createFormula(companyId, {
        product_id: Number(product.id),
        base_output_quantity: quantity.trim(),
        output_uom_id: Number(unitId),
      })
      onCreated(created)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Create New Master Formula"
      onClose={onCancel}
      maxWidth="600px"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={submit} loading={saving} disabled={saving}>Create Formula</Button>
        </>
      }
    >
      <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 16px' }}>
        Create master formulation for <strong>{product?.code} ({product?.name})</strong>.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* STEP: CALCULATION BASIS SELECTION */}
        <div>
          <label className="fm-field-label" style={{ marginBottom: 6 }}>
            Formulation Calculation Basis *
          </label>
          <div className="fm-basis-segmented-group">
            <button
              type="button"
              className={`fm-basis-seg-btn ${basis === 'AS_PER_FORMULA' ? 'active' : ''}`}
              onClick={() => setBasis('AS_PER_FORMULA')}
            >
              <span className="fm-seg-icon">🧪</span>
              <span className="fm-seg-title">As Per Formula</span>
              <span className="fm-seg-sub">Fixed Batch Qty</span>
            </button>
            <button
              type="button"
              className={`fm-basis-seg-btn ${basis === 'AS_PER_LABEL_CLAIM' ? 'active' : ''}`}
              onClick={() => setBasis('AS_PER_LABEL_CLAIM')}
            >
              <span className="fm-seg-icon">🏷️</span>
              <span className="fm-seg-title">As Per Label Claim</span>
              <span className="fm-seg-sub">Active API Strength</span>
            </button>
            <button
              type="button"
              className={`fm-basis-seg-btn ${basis === 'HYBRID_BMR' ? 'active' : ''}`}
              onClick={() => setBasis('HYBRID_BMR')}
            >
              <span className="fm-seg-icon">📋</span>
              <span className="fm-seg-title">Drops BMR Format</span>
              <span className="fm-seg-sub">Active Claim + Q.S.</span>
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label className="fm-field-label">Batch Output Quantity *</label>
            <input
              className="fm-cell-input"
              inputMode="decimal"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="e.g. 100"
            />
          </div>

          <div>
            <label className="fm-field-label">Output Unit *</label>
            <select
              className="fm-cell-select"
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
            >
              <option value="">Select unit</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>{u.label}</option>
              ))}
            </select>
          </div>
        </div>

        {error && <Alert type="error">{error}</Alert>}
      </div>
    </Modal>
  )
}

/* =========================================================
   NEW REVISION DIALOG
   ========================================================= */
function NewRevisionDialog({ companyId, formulaId, onCancel, onCreated }) {
  const [basis, setBasis] = useState('HYBRID_BMR') // 'AS_PER_FORMULA' | 'AS_PER_LABEL_CLAIM' | 'HYBRID_BMR'
  const [quantity, setQuantity] = useState('100')
  const [unitId, setUnitId] = useState('')
  const [units, setUnits] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    listPlanningUnits(companyId)
      .then((rows) => {
        const filtered = filterToOutputUnitChoices(rows)
        setUnits(filtered)
        if (filtered.length && !unitId) setUnitId(String(filtered[0].id))
      })
      .catch(() => setUnits([]))
  }, [companyId, unitId])

  const submit = async () => {
    if (saving) return
    if (!quantity.trim() || !unitId) {
      setError('Enter batch quantity and select an output unit.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const created = await createRevision(companyId, formulaId, {
        base_output_quantity: quantity.trim(),
        output_uom_id: Number(unitId),
      })
      onCreated(created)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Create New Revision"
      onClose={onCancel}
      maxWidth="600px"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={submit} loading={saving} disabled={saving}>Create Revision</Button>
        </>
      }
    >
      <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 16px' }}>
        Create a new revision number. Choose formulation calculation basis before adding materials.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* STEP: CALCULATION BASIS SELECTION */}
        <div>
          <label className="fm-field-label" style={{ marginBottom: 6 }}>
            Formulation Calculation Basis *
          </label>
          <div className="fm-basis-segmented-group">
            <button
              type="button"
              className={`fm-basis-seg-btn ${basis === 'AS_PER_FORMULA' ? 'active' : ''}`}
              onClick={() => setBasis('AS_PER_FORMULA')}
            >
              <span className="fm-seg-icon">🧪</span>
              <span className="fm-seg-title">As Per Formula</span>
              <span className="fm-seg-sub">Fixed Batch Qty</span>
            </button>
            <button
              type="button"
              className={`fm-basis-seg-btn ${basis === 'AS_PER_LABEL_CLAIM' ? 'active' : ''}`}
              onClick={() => setBasis('AS_PER_LABEL_CLAIM')}
            >
              <span className="fm-seg-icon">🏷️</span>
              <span className="fm-seg-title">As Per Label Claim</span>
              <span className="fm-seg-sub">Active API Strength</span>
            </button>
            <button
              type="button"
              className={`fm-basis-seg-btn ${basis === 'HYBRID_BMR' ? 'active' : ''}`}
              onClick={() => setBasis('HYBRID_BMR')}
            >
              <span className="fm-seg-icon">📋</span>
              <span className="fm-seg-title">Drops BMR Format</span>
              <span className="fm-seg-sub">Active Claim + Q.S.</span>
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label className="fm-field-label">Batch Output Quantity *</label>
            <input
              className="fm-cell-input"
              inputMode="decimal"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="e.g. 100"
            />
          </div>

          <div>
            <label className="fm-field-label">Output Unit *</label>
            <select
              className="fm-cell-select"
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
            >
              <option value="">Select unit</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>{u.label}</option>
              ))}
            </select>
          </div>
        </div>

        {error && <Alert type="error">{error}</Alert>}
      </div>
    </Modal>
  )
}
