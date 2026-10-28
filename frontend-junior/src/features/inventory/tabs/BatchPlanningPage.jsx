// Batch Planning + Material Requisitions - built fresh against the real
// backend contract (apps.batch_plans, apps.material_requisitions,
// apps.bmr). No reference UI exists to port: the reference frontend
// embeds batch-plan creation inside its Sales Order edit modal and never
// builds a Material Requisition UI at all (confirmed - it only reads a
// read-only requisition status label). This screen instead walks the
// real flow end to end: company -> sales order -> order line (fixes the
// real product) -> eligible APPROVED formula revision for that product
// -> planned quantity -> create batch plan -> allocate its official
// batch number (a separate, explicit action, never a side effect) ->
// material requisition (create/submit/approve/reject/revise, with real
// per-line requested-quantity editing) -> BMR.
//
// This app has no Sales Order creation/management UI (out of this step's
// scope) - the sales-order/line picker here is READ ONLY, existing
// orders only, solely to supply the real sales_order_line_id
// apps.batch_plans.BatchPlanCreateSerializer requires and never makes
// optional.
import { useEffect, useRef, useState } from 'react'

import Alert from '../../../components/Alert'
import Button from '../../../components/Button'
import Spinner, { LoadingState } from '../../../components/Spinner'
import useSelectedCompany from '../../../hooks/useSelectedCompany'
import useCompanyPermissions from '../../../hooks/useCompanyPermissions'
import { confirmAction } from '../../../components/ConfirmProvider'
import { getErrorMessage } from '../../../utils/errors'
import BmrPanel from '../../bmr/BmrPanel'
import RequirementCalculator from '../../formulas/RequirementCalculator'
import IssueOutwardModal from '../../store/IssueOutwardModal'
import { getMyStores } from '../../store/storeService'
import {
  allocateBatchNumber,
  createBatchPlan,
  getBatchPlan,
  listBatchPlansForOrder,
  listEligibleRevisionsForProduct,
} from '../../manufacturing/batchPlansService'
import { listSalesOrders, getSalesOrder } from '../../manufacturing/salesOrdersService'
import {
  approveMaterialRequisition,
  createMaterialRequisition,
  listMaterialRequisitions,
  rejectMaterialRequisition,
  reviseMaterialRequisition,
  submitMaterialRequisition,
  updateMaterialRequisition,
} from '../../manufacturing/materialRequisitionsService'
import { getAvailableToIssue } from '../../store/materialIssueService'
import './CommonInventory.css'

export default function BatchPlanningPage() {
  const { companies, companiesReady, companiesError, companyId, setCompanyId } = useSelectedCompany()
  const { loading: permissionsLoading, hasPermission } = useCompanyPermissions(companyId)

  const canViewPlans = hasPermission('batch_plans.view')
  const canCreatePlans = hasPermission('batch_plans.create')
  const canEditPlans = hasPermission('batch_plans.edit')
  const canAllocateNumber = hasPermission('batch_plans.allocate_number')
  const canPrintingEdit = hasPermission('batch_plans.printing_edit')
  const canViewFormulas = hasPermission('formulas.view')
  const canViewBmr = hasPermission('bmr.view')
  const canCreateBmr = hasPermission('bmr.create')
  const canEditBmr = hasPermission('bmr.edit')

  const [orders, setOrders] = useState({ loading: true, results: [], error: '' })
  const [orderId, setOrderId] = useState(null)
  const [order, setOrder] = useState({ loading: false, data: null, error: '' })
  const [lineId, setLineId] = useState(null)
  const [existingPlans, setExistingPlans] = useState([])

  const [plan, setPlan] = useState(null)
  const [planView, setPlanView] = useState('create') // 'create' | 'detail'
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!companyId || permissionsLoading || !canViewPlans) return
    let cancelled = false
    setOrders({ loading: true, results: [], error: '' })
    listSalesOrders(companyId, { pageSize: 50 })
      .then((data) => !cancelled && setOrders({ loading: false, results: data.results || [], error: '' }))
      .catch((err) => !cancelled && setOrders({ loading: false, results: [], error: getErrorMessage(err) }))
    return () => { cancelled = true }
  }, [companyId, permissionsLoading, canViewPlans])

  useEffect(() => {
    setOrder({ loading: Boolean(orderId), data: null, error: '' })
    setLineId(null)
    setPlan(null)
    setPlanView('create')
    if (!orderId || !companyId) return
    let cancelled = false
    Promise.all([getSalesOrder(companyId, orderId), listBatchPlansForOrder(companyId, orderId)])
      .then(([data, plans]) => {
        if (cancelled) return
        setOrder({ loading: false, data, error: '' })
        setExistingPlans(plans.results || [])
      })
      .catch((err) => !cancelled && setOrder({ loading: false, data: null, error: getErrorMessage(err) }))
    return () => { cancelled = true }
  }, [orderId, companyId])

  const selectedLine = order.data?.lines?.find((l) => l.id === lineId) || null
  const existingPlanForLine = existingPlans.find((p) => p.sales_order_line_id === lineId || p.source_line_number === selectedLine?.line_number)

  const openPlan = async (planId) => {
    const data = await getBatchPlan(companyId, planId)
    setPlan(data)
    setPlanView('detail')
  }

  if (permissionsLoading) return <LoadingState label="Checking your access…" compact />

  return (
    <div className="ci-container">
      <div className="ci-header">
        <div className="ci-header-titles">
          <h2>Batch Planning</h2>
          <p>Company → sales order → product line → approved formula revision → batch plan → material requisition.</p>
        </div>
        <div className="ci-header-actions">
          {companies.length > 1 && (
            <select className="company-input" value={companyId ?? ''} onChange={(e) => setCompanyId(e.target.value ? Number(e.target.value) : null)} style={{ minWidth: 200 }}>
              <option value="">Choose a company</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.display_name || c.legal_name || c.code}</option>)}
            </select>
          )}
        </div>
      </div>

      {notice && <Alert type="success">{notice}</Alert>}
      {companiesError && <Alert type="error">Could not load your companies: {companiesError}</Alert>}
      {!companiesReady && <Spinner size="sm" tone="muted" label="Loading your companies…" />}
      {companiesReady && companies.length === 0 && <Alert type="error">No company is linked to your account.</Alert>}
      {companiesReady && companies.length > 0 && !companyId && (
        <div className="ci-empty-card"><div className="ci-empty-icon">🏢</div><div className="ci-empty-title">Choose a company</div></div>
      )}
      {companyId && !canViewPlans && <Alert type="error">You cannot see batch plans for this company. Ask an administrator for batch_plans.view.</Alert>}

      {companyId && canViewPlans && (
        <>
          {planView !== 'detail' && (
            <>
              <div className="stock-toolbar">
                <div className="stock-toolbar-left">
                  <div className="field" style={{ minWidth: 280, margin: 0 }}>
                    <label className="field-label" htmlFor="bp-order">Sales order</label>
                    <select id="bp-order" className="field-input" value={orderId ?? ''} onChange={(e) => setOrderId(e.target.value ? Number(e.target.value) : null)}>
                      <option value="">Choose a sales order</option>
                      {(orders.results || []).map((o) => (
                        <option key={o.id} value={o.id}>{o.reference} · {o.customer_code} · {o.order_date}</option>
                      ))}
                    </select>
                  </div>
                  {orders.loading && <Spinner size="sm" tone="muted" label="Loading sales orders…" />}
                  {orders.error && <Alert type="error">{orders.error}</Alert>}

                  {order.data && (
                    <div className="field" style={{ minWidth: 280, margin: 0 }}>
                      <label className="field-label" htmlFor="bp-line">Order line</label>
                      <select id="bp-line" className="field-input" value={lineId ?? ''} onChange={(e) => setLineId(e.target.value ? Number(e.target.value) : null)}>
                        <option value="">Choose a line</option>
                        {(order.data.lines || []).map((line) => (
                          <option key={line.id} value={line.id}>
                            #{line.line_number} · {line.product_code} · {line.quantity} {line.sales_uom_code}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>

              {order.loading && <LoadingState label="Loading sales order…" compact />}
              {order.error && <Alert type="error">{order.error}</Alert>}
            </>
          )}

          {selectedLine && !plan && (
            existingPlanForLine ? (
              <div className="ci-empty-card">
                <div className="ci-empty-title">A batch plan already exists for this line</div>
                <p className="ci-empty-desc">{existingPlanForLine.official_batch_number || 'Not yet numbered'} · target {existingPlanForLine.target_output_quantity} {existingPlanForLine.output_uom_code}</p>
                <Button type="button" onClick={() => openPlan(existingPlanForLine.id)}>Open this batch plan</Button>
              </div>
            ) : (
              <BatchPlanCreateForm
                companyId={companyId}
                line={selectedLine}
                canCreate={canCreatePlans}
                canPrintingEdit={canPrintingEdit}
                onCreated={(created) => {
                  setPlan(created)
                  setPlanView('detail')
                  setNotice(`Batch plan created (draft, not numbered yet).`)
                }}
              />
            )
          )}

          {plan && planView === 'detail' && (
            <BatchPlanDetail
              companyId={companyId}
              plan={plan}
              canEdit={canEditPlans}
              canAllocateNumber={canAllocateNumber}
              canViewFormulas={canViewFormulas}
              canViewBmr={canViewBmr}
              canCreateBmr={canCreateBmr}
              canEditBmr={canEditBmr}
              onRefresh={async () => setPlan(await getBatchPlan(companyId, plan.id))}
              onNotice={setNotice}
              onBack={() => {
                setPlan(null)
                setPlanView('create')
              }}
            />
          )}
        </>
      )}
    </div>
  )
}

function BatchPlanCreateForm({ companyId, line, canCreate, canPrintingEdit, onCreated }) {
  const [revisions, setRevisions] = useState({ loading: true, results: [], error: '' })
  const [revisionId, setRevisionId] = useState('')
  const [targetQuantity, setTargetQuantity] = useState('')
  const [plannedDate, setPlannedDate] = useState('')
  const [packingNote, setPackingNote] = useState('')
  const [notes, setNotes] = useState('')
  const [mrpForPrinting, setMrpForPrinting] = useState('')
  const [printingStatusNote, setPrintingStatusNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setRevisions({ loading: true, results: [], error: '' })
    listEligibleRevisionsForProduct(companyId, line.product_id)
      .then((results) => setRevisions({ loading: false, results, error: '' }))
      .catch((err) => setRevisions({ loading: false, results: [], error: getErrorMessage(err) }))
  }, [companyId, line.product_id])

  const submit = async () => {
    if (saving || !canCreate) return
    if (!revisionId || !targetQuantity.trim()) {
      setError('Choose an approved formula revision and enter the planned output quantity.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const payload = {
        sales_order_line_id: line.id,
        formula_revision_id: Number(revisionId),
        target_output_quantity: targetQuantity.trim(),
      }
      if (plannedDate) payload.planned_manufacturing_date = plannedDate
      if (packingNote.trim()) payload.packing_size_note = packingNote.trim()
      if (notes.trim()) payload.notes = notes.trim()
      if (canPrintingEdit && mrpForPrinting.trim()) payload.mrp_for_printing = mrpForPrinting.trim()
      if (canPrintingEdit && printingStatusNote.trim()) payload.printing_status_note = printingStatusNote.trim()
      const created = await createBatchPlan(companyId, payload)
      onCreated(created)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  if (!canCreate) return <Alert type="error">You cannot create a batch plan in this company. Ask an administrator for batch_plans.create.</Alert>

  return (
    <div style={{ background: '#ffffff', border: '1px solid #d6e5ef', borderRadius: 14, padding: '20px 24px', boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)' }}>
      <h3 style={{ margin: '0 0 4px' }}>New batch plan</h3>
      <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 12px' }}>
        Line #{line.line_number} · {line.product_code} · {line.product_name} · ordered {line.quantity} {line.sales_uom_code}
      </p>

      {revisions.loading && <Spinner size="sm" tone="muted" label="Loading eligible formula revisions…" />}
      {revisions.error && <Alert type="error">{revisions.error}</Alert>}
      {!revisions.loading && !revisions.error && revisions.results.length === 0 && (
        <Alert type="error">No APPROVED formula revision exists yet for {line.product_code}. Approve a revision before planning a batch for this product.</Alert>
      )}

      {revisions.results.length > 0 && (
        <>
          <div className="inv-form-grid">
            <div className="field">
              <label className="field-label" htmlFor="bp-revision">Approved formula revision *</label>
              <select id="bp-revision" className="field-input" value={revisionId} onChange={(e) => setRevisionId(e.target.value)}>
                <option value="">Choose a revision</option>
                {revisions.results.map((r) => (
                  <option key={r.id} value={r.id}>{r.formula_code} · Rev {r.revision_number} · {r.base_output_quantity} {r.output_uom_code}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="bp-target">Planned output quantity *</label>
              <input id="bp-target" className="field-input" inputMode="decimal" value={targetQuantity} onChange={(e) => setTargetQuantity(e.target.value)} placeholder="e.g. 500" />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="bp-date">Planned manufacturing date</label>
              <input id="bp-date" className="field-input" type="date" value={plannedDate} onChange={(e) => setPlannedDate(e.target.value)} />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="bp-packing">Packing size note</label>
              <input id="bp-packing" className="field-input" value={packingNote} onChange={(e) => setPackingNote(e.target.value)} placeholder="Descriptive only" />
            </div>
            <div className="field field-full">
              <label className="field-label" htmlFor="bp-notes">Notes</label>
              <input id="bp-notes" className="field-input" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            {canPrintingEdit && (
              <>
                <div className="field">
                  <label className="field-label" htmlFor="bp-mrp">MRP for printing</label>
                  <input id="bp-mrp" className="field-input" inputMode="decimal" value={mrpForPrinting} onChange={(e) => setMrpForPrinting(e.target.value)} />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="bp-print-note">Printing status note</label>
                  <input id="bp-print-note" className="field-input" value={printingStatusNote} onChange={(e) => setPrintingStatusNote(e.target.value)} />
                </div>
              </>
            )}
          </div>
          {error && <p className="field-error">{error}</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <Button type="button" onClick={submit} loading={saving} disabled={saving}>Create batch plan</Button>
          </div>
        </>
      )}
    </div>
  )
}

function BatchPlanDetail({ companyId, plan, canEdit, canAllocateNumber, canViewFormulas, canViewBmr, canCreateBmr, canEditBmr, onRefresh, onNotice, onBack }) {
  const [activeTab, setActiveTab] = useState('requisition') // 'requisition' | 'requirements' | 'bmr'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const productCode = plan.product_code || plan.source_snapshots?.product_code || ''
  const productName = plan.product_name || plan.source_snapshots?.product_name || ''
  const formulaCode = plan.formula_code || plan.source_snapshots?.formula_code || ''
  const formulaRev = plan.formula_revision_number ?? plan.source_snapshots?.formula_revision_number ?? ''
  const outputUom = plan.output_uom_code || plan.source_snapshots?.output_uom_code || ''
  const orderRef = plan.source_order_reference || plan.source_snapshots?.sales_order_reference || ''
  const orderLine = plan.source_line_number || plan.source_snapshots?.sales_order_line_number || ''

  const allocate = async () => {
    if (!(await confirmAction(
      `Allocate the official batch number for this plan? This is a separate, permanent action - it does not authorize production or change stock.`,
      { title: 'Allocate Official Batch Number', confirmLabel: 'Allocate Number' }
    ))) return
    setBusy(true)
    setError('')
    try {
      await allocateBatchNumber(companyId, plan.id, plan.version)
      await onRefresh()
      onNotice('Official batch number allocated.')
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const cardStyle = {
    background: '#ffffff',
    border: '1px solid #d6e5ef',
    borderRadius: 14,
    padding: '16px 20px',
    marginBottom: 16,
    boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
    minHeight: 'auto',
    height: 'auto',
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    boxSizing: 'border-box',
  }

  return (
    <div style={{ width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box' }}>
      {/* Top Header Card */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ flex: '1 1 300px', minWidth: 0, maxWidth: '100%' }}>
            <div style={{ marginBottom: 8 }}>
              {onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  className="ci-row-link"
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#0284c7',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  ← Back to Sales Orders & Planning
                </button>
              )}
            </div>

            <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700, color: '#0f172a', wordBreak: 'break-word' }}>
              {productCode ? `${productCode} · ` : ''}{productName || 'Batch Plan'}
            </h2>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', fontSize: 13, color: '#334155', marginTop: 6 }}>
              {formulaCode && (
                <div>
                  <span style={{ color: '#64748b' }}>Formula: </span>
                  <strong>{formulaCode}</strong> {formulaRev !== '' ? `(Rev ${formulaRev})` : ''}
                </div>
              )}
              <div>
                <span style={{ color: '#64748b' }}>Planned Target: </span>
                <strong style={{ color: '#0369a1' }}>{plan.target_output_quantity} {outputUom}</strong>
              </div>
              {orderRef && (
                <div>
                  <span style={{ color: '#64748b' }}>Sales Order: </span>
                  <strong>{orderRef}</strong> {orderLine ? `· Line #${orderLine}` : ''}
                </div>
              )}
              {plan.planned_manufacturing_date && (
                <div>
                  <span style={{ color: '#64748b' }}>Mfg Date: </span>
                  <strong>{plan.planned_manufacturing_date}</strong>
                </div>
              )}
              {plan.packing_size_note && (
                <div>
                  <span style={{ color: '#64748b' }}>Packing: </span>
                  <span>{plan.packing_size_note}</span>
                </div>
              )}
            </div>

            {plan.notice && (
              <p style={{ fontSize: 12.5, color: '#64748b', margin: '10px 0 0', fontStyle: 'italic' }}>
                ℹ️ {plan.notice}
              </p>
            )}
          </div>

          <div style={{ flexShrink: 0, textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
            <span
              className={`ci-badge ${plan.official_batch_number ? 'ci-badge-active' : 'ci-badge-inactive'}`}
              style={{ fontSize: 13, padding: '4px 12px', borderRadius: 6, fontWeight: 700, whiteSpace: 'nowrap' }}
            >
              {plan.official_batch_number ? `Batch: ${plan.official_batch_number}` : 'Not numbered yet'}
            </span>
            {!plan.official_batch_number && canAllocateNumber && (
              <Button type="button" variant="primary" onClick={allocate} loading={busy} disabled={busy}>
                Allocate batch number
              </Button>
            )}
          </div>
        </div>
        {error && <p className="field-error" style={{ marginTop: 10 }}>{error}</p>}
      </div>

      {/* Sub-tabs Navigation */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, borderBottom: '2px solid #e2e8f0', marginBottom: 16, maxWidth: '100%', overflowX: 'auto' }}>
        <button
          type="button"
          onClick={() => setActiveTab('requisition')}
          style={{
            padding: '10px 20px',
            fontSize: 14,
            fontWeight: activeTab === 'requisition' ? 700 : 500,
            border: 'none',
            borderBottom: activeTab === 'requisition' ? '3px solid #0284c7' : '3px solid transparent',
            background: 'none',
            color: activeTab === 'requisition' ? '#0284c7' : '#64748b',
            cursor: 'pointer',
            marginBottom: -2,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span>📦</span> Material Requisition & Store Stock
        </button>

        {canViewFormulas && (
          <button
            type="button"
            onClick={() => setActiveTab('requirements')}
            style={{
              padding: '10px 20px',
              fontSize: 14,
              fontWeight: activeTab === 'requirements' ? 700 : 500,
              border: 'none',
              borderBottom: activeTab === 'requirements' ? '3px solid #0284c7' : '3px solid transparent',
              background: 'none',
              color: activeTab === 'requirements' ? '#0284c7' : '#64748b',
              cursor: 'pointer',
              marginBottom: -2,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span>📋</span> Formula Scaling & Requirements
          </button>
        )}

        {canViewBmr && (
          <button
            type="button"
            onClick={() => setActiveTab('bmr')}
            style={{
              padding: '10px 20px',
              fontSize: 14,
              fontWeight: activeTab === 'bmr' ? 700 : 500,
              border: 'none',
              borderBottom: activeTab === 'bmr' ? '3px solid #0284c7' : '3px solid transparent',
              background: 'none',
              color: activeTab === 'bmr' ? '#0284c7' : '#64748b',
              cursor: 'pointer',
              marginBottom: -2,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span>🏭</span> BMR Slip (Attachment 1)
          </button>
        )}
      </div>

      {/* Tab Panels */}
      {activeTab === 'requisition' && (
        <div style={cardStyle}>
          <RequisitionSection companyId={companyId} plan={plan} canEditPlan={canEdit} />
        </div>
      )}

      {activeTab === 'requirements' && canViewFormulas && (
        <div style={cardStyle}>
          <RequirementCalculator
            companyId={companyId}
            planId={plan.id}
            initialTarget={plan.target_output_quantity}
            unitCode={outputUom}
          />
        </div>
      )}

      {activeTab === 'bmr' && canViewBmr && (
        <div style={cardStyle}>
          <BmrPanel
            companyId={companyId}
            planId={plan.id}
            plan={plan}
            canView={canViewBmr}
            canCreate={canCreateBmr}
            canEdit={canEditBmr}
          />
        </div>
      )}
    </div>
  )
}

function RequisitionSection({ plan, canEditPlan }) {
  const [stores, setStores] = useState({ loading: true, results: [], error: '' })
  const [storeId, setStoreId] = useState(null)
  const [requisition, setRequisition] = useState({ status: 'idle', data: null, error: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [showReject, setShowReject] = useState(false)
  const [issuingLine, setIssuingLine] = useState(null)

  useEffect(() => {
    getMyStores().then((list) => {
      setStores({ loading: false, results: list, error: '' })
      if (list.length === 1) setStoreId(list[0].id)
    }).catch((err) => setStores({ loading: false, results: [], error: getErrorMessage(err) }))
  }, [])

  const loadRequisition = () => {
    if (!storeId) return
    setRequisition({ status: 'loading', data: null, error: '' })
    listMaterialRequisitions(storeId, { batchPlanId: plan.id, pageSize: 1 })
      .then((data) => {
        const existing = (data.results || [])[0]
        if (existing) {
          setRequisition({ status: 'ready', data: existing, error: '' })
        } else {
          setRequisition({ status: 'none', data: null, error: '' })
        }
      })
      .catch((err) => setRequisition({ status: 'error', data: null, error: getErrorMessage(err) }))
  }

  useEffect(loadRequisition, [storeId, plan.id])

  const create = async () => {
    setBusy(true)
    setError('')
    try {
      const created = await createMaterialRequisition(storeId, { batch_plan_id: plan.id, expected_batch_plan_version: plan.version })
      setRequisition({ status: 'ready', data: created, error: '' })
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const submit = async () => {
    if (!(await confirmAction(
      'Submit this requisition for approval? It will no longer be editable until approved, rejected or revised.',
      { title: 'Submit Requisition', confirmLabel: 'Submit' }
    ))) return
    setBusy(true)
    setError('')
    try {
      const saved = await submitMaterialRequisition(storeId, requisition.data.id, requisition.data.version)
      setRequisition({ status: 'ready', data: saved, error: '' })
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const approve = async () => {
    setBusy(true)
    setError('')
    try {
      const saved = await approveMaterialRequisition(storeId, requisition.data.id, requisition.data.version)
      setRequisition({ status: 'ready', data: saved, error: '' })
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const reject = async () => {
    if (!rejectReason.trim()) {
      setError('Enter a reason for rejecting this requisition.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const saved = await rejectMaterialRequisition(storeId, requisition.data.id, requisition.data.version, rejectReason.trim())
      setRequisition({ status: 'ready', data: saved, error: '' })
      setShowReject(false)
      setRejectReason('')
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const revise = async () => {
    if (!(await confirmAction('Revise this requisition back to draft?', { title: 'Revise Requisition', confirmLabel: 'Revise to Draft', danger: true }))) return
    setBusy(true)
    setError('')
    try {
      const saved = await reviseMaterialRequisition(storeId, requisition.data.id, requisition.data.version)
      setRequisition({ status: 'ready', data: saved, error: '' })
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const saveLineQuantity = async (line, requestedQuantity, quantityRemark) => {
    setError('')
    try {
      const saved = await updateMaterialRequisition(storeId, requisition.data.id, {
        expected_version: requisition.data.version,
        lines: [{ id: line.id, requested_quantity: requestedQuantity, quantity_remark: quantityRemark }],
      })
      setRequisition({ status: 'ready', data: saved, error: '' })
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  return (
    <div style={{ minHeight: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <h3 style={{ margin: 0 }}>Material requisition</h3>
        {stores.results.length > 1 && (
          <select className="company-input" value={storeId ?? ''} onChange={(e) => setStoreId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Choose a store</option>
            {stores.results.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
          </select>
        )}
      </div>

      {stores.loading && <Spinner size="sm" tone="muted" label="Loading your stores…" />}
      {stores.error && <Alert type="error">{stores.error}</Alert>}
      {!stores.loading && stores.results.length === 0 && <Alert type="error">No store is available to your account.</Alert>}
      {!storeId && stores.results.length > 1 && <p style={{ fontSize: 13, color: '#64748b' }}>Choose a store to see or create its requisition for this batch.</p>}

      {storeId && (
        <>
          {requisition.status === 'loading' && <LoadingState label="Loading requisition…" compact />}
          {requisition.status === 'error' && <Alert type="error">{requisition.error}</Alert>}
          {requisition.status === 'none' && (
            <div style={{ marginTop: 10 }}>
              <p style={{ fontSize: 13, color: '#64748b' }}>No material requisition exists yet for this batch plan at this store.</p>
              <Button type="button" onClick={create} loading={busy} disabled={busy}>Create requisition</Button>
            </div>
          )}

          {requisition.status === 'ready' && requisition.data && (
            <div style={{ marginTop: 10 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                <span className={`ci-badge ${requisition.data.status === 'APPROVED' ? 'ci-badge-active' : 'ci-badge-inactive'}`}>{requisition.data.status}</span>
                {requisition.data.status === 'DRAFT' && (
                  <Button type="button" onClick={submit} loading={busy} disabled={busy}>Submit for approval</Button>
                )}
                {requisition.data.status === 'SUBMITTED' && (
                  <>
                    <Button type="button" onClick={approve} loading={busy} disabled={busy}>Approve</Button>
                    {!showReject && <Button type="button" variant="secondary" onClick={() => setShowReject(true)} disabled={busy}>Reject</Button>}
                  </>
                )}
                {requisition.data.status === 'REJECTED' && (
                  <Button type="button" variant="secondary" onClick={revise} loading={busy} disabled={busy}>Revise to draft</Button>
                )}
              </div>

              {showReject && (
                <div className="field" style={{ marginBottom: 10 }}>
                  <label className="field-label" htmlFor="req-reject-reason">Rejection reason *</label>
                  <input id="req-reject-reason" className="field-input" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <Button type="button" variant="secondary" onClick={() => setShowReject(false)} disabled={busy}>Cancel</Button>
                    <Button type="button" onClick={reject} loading={busy} disabled={busy}>Confirm rejection</Button>
                  </div>
                </div>
              )}
              {error && <p className="field-error">{error}</p>}

              <RequisitionLinesTable
                storeId={storeId}
                requisition={requisition.data}
                editable={requisition.data.status === 'DRAFT' && canEditPlan}
                onSaveLine={saveLineQuantity}
                onIssue={(line) => setIssuingLine(line)}
              />
            </div>
          )}
        </>
      )}

      {issuingLine && (
        <IssueOutwardModal
          storeId={storeId}
          materialId={issuingLine.material_id}
          materialCode={issuingLine.material_code_snapshot}
          materialName={issuingLine.material_name_snapshot}
          onClose={() => setIssuingLine(null)}
          onIssued={() => {}}
          onPosted={() => setIssuingLine(null)}
        />
      )}
    </div>
  )
}

function RequisitionLinesTable({ storeId, requisition, editable, onSaveLine, onIssue }) {
  const [balances, setBalances] = useState({})
  const [balancesLoading, setBalancesLoading] = useState(false)
  const requestRef = useRef(0)

  // API returns raw_lines + packaging_lines separately (never a single merged "lines" array)
  const allLines = [
    ...(requisition.raw_lines || []),
    ...(requisition.packaging_lines || []),
    ...(requisition.lines || []),  // legacy fallback if backend ever flattens
  ]

  useEffect(() => {
    if (allLines.length === 0) return
    const requestId = ++requestRef.current
    setBalancesLoading(true)
    Promise.all(
      allLines.map((line) =>
        line?.material_id
          ? getAvailableToIssue(storeId, line.material_id).then((rows) => [line.id, rows]).catch(() => [line.id, []])
          : Promise.resolve([line.id, []])
      )
    ).then((entries) => {
      if (requestRef.current !== requestId) return
      setBalances(Object.fromEntries(entries))
    }).finally(() => {
      if (requestRef.current === requestId) setBalancesLoading(false)
    })
  }, [storeId, requisition.id, requisition.version])

  // Stock summary banner
  let hasShortage = false
  let hasOutOfStock = false
  if (!balancesLoading && allLines.length > 0 && Object.keys(balances).length > 0) {
    for (const line of allLines) {
      const rows = balances[line.id] || []
      const avail = rows.reduce((acc, r) => acc + (Number(r.net_quantity) || 0), 0)
      const reqQty = Number(line.requested_quantity || line.base_line_quantity_snapshot || 0)
      if (avail <= 0) hasOutOfStock = true
      else if (avail < reqQty) hasShortage = true
    }
  }

  return (
    <div>
      {/* Availability summary banner */}
      {!balancesLoading && allLines.length > 0 && Object.keys(balances).length > 0 && (
        (hasOutOfStock || hasShortage) ? (
          <div style={{
            padding: '8px 12px', marginBottom: 10,
            background: '#fef2f2', border: '1px solid #fecaca',
            borderRadius: 8, fontSize: 12.5, color: '#991b1b',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span>⚠️</span>
            <span><strong>Stock Shortage:</strong> One or more materials have insufficient recorded inventory at this store. Review the lines below.</span>
          </div>
        ) : (
          <div style={{
            padding: '8px 12px', marginBottom: 10,
            background: '#f0fdf4', border: '1px solid #bbf7d0',
            borderRadius: 8, fontSize: 12.5, color: '#166534',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span>✅</span>
            <span><strong>All Materials In Stock:</strong> Sufficient recorded balance to fulfill all requested lines.</span>
          </div>
        )
      )}

      <div className="inv-table-scroll" style={{ width: '100%', maxWidth: '100%', minWidth: 0, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table className="inv-table" style={{ fontSize: 13, width: '100%', minWidth: 620 }}>
          <thead>
            <tr>
              <th style={{ width: 45 }}>Line</th>
              <th>Material</th>
              <th style={{ width: 85 }}>Type</th>
              <th style={{ textAlign: 'right', width: 95 }}>Calculated</th>
              <th style={{ textAlign: 'right', width: 90 }}>Requested</th>
              <th style={{ width: 110 }}>Remark</th>
              <th style={{ textAlign: 'right', width: 120 }}>Available in Store</th>
              <th style={{ textAlign: 'center', width: 75 }}>Status</th>
              <th style={{ width: 115 }}></th>
            </tr>
          </thead>
          <tbody>
            {allLines.map((line) => (
              <RequisitionLineRow
                key={line.id}
                line={line}
                editable={editable}
                balanceRows={balances[line.id] || []}
                balancesLoading={balancesLoading}
                onSaveLine={onSaveLine}
                onIssue={onIssue}
              />
            ))}
            {allLines.length === 0 && (
              <tr><td colSpan={9} style={{ textAlign: 'center', color: '#94a3b8' }}>No lines on this requisition.</td></tr>
            )}
          </tbody>
        </table>
        <p style={{ fontSize: 11, color: '#94a3b8', margin: '8px 0 0' }}>
          "Available in Store" is recorded-receipts minus recorded-issues at this store. Not scoped per-requisition.
          {balancesLoading && <span style={{ marginLeft: 8, color: '#0284c7' }}>⏳ Checking stock…</span>}
        </p>
      </div>
    </div>
  )
}

function RequisitionLineRow({ line, editable, balanceRows, balancesLoading, onSaveLine, onIssue }) {
  const [draft, setDraft] = useState(line.requested_quantity ?? '')
  const [remark, setRemark] = useState(line.quantity_remark || '')
  useEffect(() => {
    setDraft(line.requested_quantity ?? '')
    setRemark(line.quantity_remark || '')
  }, [line.requested_quantity, line.quantity_remark])

  const avail = balanceRows.reduce((acc, row) => acc + (Number(row.net_quantity) || 0), 0)
  const unit = line.unit_code_snapshot || ''
  const reqQty = Number(line.requested_quantity || line.base_line_quantity_snapshot || 0)
  const isOut = avail <= 0
  const isShort = !isOut && avail < reqQty
  const isOk = avail >= reqQty && reqQty > 0

  const availColor = isOut ? '#dc2626' : isShort ? '#d97706' : '#16a34a'
  const availText = balancesLoading
    ? '…'
    : balanceRows.length === 0
    ? '—'
    : `${avail.toFixed(3)} ${unit}`

  return (
    <tr>
      <td>{line.line_number}</td>
      <td className="cell-strong" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${line.material_code_snapshot} · ${line.material_name_snapshot}`}>
        {line.material_code_snapshot} <span style={{ color: '#94a3b8' }}>· {line.material_name_snapshot}</span>
      </td>
      <td>
        <span style={{
          fontSize: 11, padding: '2px 6px', borderRadius: 4,
          background: line.material_kind_snapshot === 'PACKAGING_MATERIAL' ? '#f3e8ff' : '#e0f2fe',
          color: line.material_kind_snapshot === 'PACKAGING_MATERIAL' ? '#6b21a8' : '#0369a1',
        }}>
          {line.material_kind_snapshot === 'RAW_MATERIAL' ? 'Raw' : 'Packaging'}
        </span>
      </td>
      <td style={{ textAlign: 'right' }}>{line.base_line_quantity_snapshot} {unit}</td>
      <td style={{ textAlign: 'right' }}>
        {editable ? (
          <input
            className="field-input"
            style={{ width: 75, padding: '4px 6px', textAlign: 'right', fontSize: 12.5 }}
            inputMode="decimal"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => draft !== String(line.requested_quantity ?? '') && onSaveLine(line, draft, remark)}
          />
        ) : (line.requested_quantity ?? '—')}
      </td>
      <td>
        {editable ? (
          <input
            className="field-input"
            style={{ width: 95, padding: '4px 6px', fontSize: 12.5 }}
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            onBlur={() => remark !== (line.quantity_remark || '') && onSaveLine(line, draft, remark)}
            placeholder={line.quantity_decision_issue ? 'Required' : 'optional'}
          />
        ) : (line.quantity_remark || '—')}
      </td>
      <td style={{ textAlign: 'right', fontWeight: 600, color: balancesLoading ? '#94a3b8' : availColor }}>
        {availText}
      </td>
      <td style={{ textAlign: 'center' }}>
        {balancesLoading ? (
          <span style={{ fontSize: 11, color: '#94a3b8' }}>Checking…</span>
        ) : balanceRows.length === 0 ? (
          <span style={{ fontSize: 11, color: '#94a3b8' }}>—</span>
        ) : isOk ? (
          <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: '#dcfce7', color: '#15803d', fontWeight: 600 }}>✅ OK</span>
        ) : isShort ? (
          <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: '#fef3c7', color: '#b45309', fontWeight: 600 }}>⚠️ Short</span>
        ) : (
          <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: '#fee2e2', color: '#b91c1c', fontWeight: 600 }}>❌ Out</span>
        )}
      </td>
      <td>
        <button
          type="button"
          className="ci-row-link"
          style={{ whiteSpace: 'nowrap', fontSize: 12, padding: '4px 8px', background: '#e0f2fe', borderRadius: 6, color: '#0369a1', border: 'none', cursor: 'pointer', fontWeight: 600 }}
          onClick={() => onIssue(line)}
        >
          + Issue Outward
        </button>
      </td>
    </tr>
  )
}
