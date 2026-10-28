// Issue & Return - connects to:
// 1. apps.stock_movements (Material Issues & Outward Movements)
// 2. Persistent Production Floor Custody (apps.stock_movements.ProductionCustody)
// 3. Returns (apps.stock_movements.MaterialReturn)
// 4. Consumption & Disposition History (apps.stock_movements.ProductionFloorEvent)
//
// Traces each action to the original issue reference, batch, company, and material.
// Invariants enforced server-side (see apps/stock_movements/services.py):
// - Issue posted: store ledger decreases, production custody increases.
// - Consumption: production custody decreases; store ledger unchanged (not a second deduction).
// - Return: production custody decreases, store book quantity increases (held/unassessed -
//   never automatically issue-eligible again; see net_quantity vs book_quantity).
// - Defect classification: condition changes (damaged subset of custody); quantities unchanged.
// - Disposal: quantity decreases in custody under an explicit policy reference.
import { useEffect, useMemo, useState } from 'react'
import Button from '../../../components/Button'
import Alert from '../../../components/Alert'
import { LoadingState } from '../../../components/Spinner'
import Modal from '../components/Modal'
import { useConfirmDialog } from '../components/ConfirmDialog'
import { getErrorMessage } from '../../../utils/errors'
import { getMyStores, listMyCompanies } from '../../store/storeService'
import { listActiveMaterials } from '../purchasingService'
import { getStorePermissionCodes } from '../../operations/storePreparationService'
import {
  listMaterialIssues,
  postMaterialIssue,
  cancelMaterialIssue,
  listProductionCustodies,
  listMaterialReturns,
  recordProductionConsumption,
  recordDefectClassification,
  recordCustodyReturn,
  recordCustodyDisposal,
} from '../../store/materialIssueService'
import IssueOutwardModal from '../../store/IssueOutwardModal'
import './IssueReturn.css'
import './CommonInventory.css'

const RETURN_REASONS = [
  'Unused Excess from Production Batch',
  'Assay Deviation / Quality Deviation',
  'Damaged Container / Physical Compromise',
  'Contamination / Particulate Observed',
  'Production Batch Cancelled / Rescheduled',
]

const DISPOSAL_POLICIES = [
  'POLICY-PRODUCTION-SCRAP-AUTH',
  'POLICY-HAZARDOUS-WASTE-DISPOSAL',
  'POLICY-DEFECT-REJECTION-DISPOSAL',
]

const EVENT_TYPE_LABELS = {
  CONSUMPTION: 'Actual Consumption',
  RETURN_UNUSED: 'Return (Unused)',
  RETURN_DEFECTIVE: 'Return (Defective)',
  DEFECT_CLASSIFIED: 'Defect Classification',
  DISPOSAL: 'Disposal',
}

const PAGE_SIZE = 20

export default function IssueReturnTab({ storeId: propStoreId }) {
  const [storeId, setStoreId] = useState(propStoreId || null)
  // 'ISSUES' | 'CUSTODY' | 'RETURNS' | 'HISTORY'
  const [activeTab, setActiveTab] = useState('ISSUES')
  const { confirm, prompt, ConfirmNode } = useConfirmDialog()

  const [codes, setCodes] = useState([])
  const [materials, setMaterials] = useState([])
  const [companies, setCompanies] = useState([])

  // Issues state + filters
  const [issues, setIssues] = useState({ loading: true, results: [], count: 0, error: '' })
  const [issueSearch, setIssueSearch] = useState('')
  const [issueMaterial, setIssueMaterial] = useState('')
  const [issueCompany, setIssueCompany] = useState('')
  const [issueKind, setIssueKind] = useState('')
  const [issueStatus, setIssueStatus] = useState('')
  const [issueBatch, setIssueBatch] = useState('')
  const [issueProduct, setIssueProduct] = useState('')
  const [issueDateFrom, setIssueDateFrom] = useState('')
  const [issueDateTo, setIssueDateTo] = useState('')
  const [issuePage, setIssuePage] = useState(1)

  // Custody state (backend-persisted; no server pagination on this endpoint)
  const [custodies, setCustodies] = useState({ loading: false, results: [], error: '' })
  const [custodySearch, setCustodySearch] = useState('')

  // Returns state + filters
  const [returns, setReturns] = useState({ loading: false, results: [], count: 0, error: '' })
  const [returnMaterial, setReturnMaterial] = useState('')
  const [returnType, setReturnType] = useState('')
  const [returnDisposition, setReturnDisposition] = useState('')
  const [returnPage, setReturnPage] = useState(1)

  // History filters (derived client-side from custodies' own floor_events - no extra API call)
  const [historyEventType, setHistoryEventType] = useState('')
  const [historySearch, setHistorySearch] = useState('')

  // Modals & Notices
  const [newIssueOpen, setNewIssueOpen] = useState(false)
  const [editIssueId, setEditIssueId] = useState(null)
  const [selectedIssue, setSelectedIssue] = useState(null)
  const [issueDetailOpen, setIssueDetailOpen] = useState(false)
  const [custodyDetail, setCustodyDetail] = useState(null)
  const [actionSuccess, setActionSuccess] = useState('')
  const [actionError, setActionError] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  // Custody action dialog
  const [custodyModal, setCustodyModal] = useState({ open: false, custody: null, mode: 'CONSUME' })
  const [custodyQty, setCustodyQty] = useState('')
  const [custodyReason, setCustodyReason] = useState(RETURN_REASONS[0])
  const [custodyNotes, setCustodyNotes] = useState('')
  const [custodyReturnType, setCustodyReturnType] = useState('UNUSED')
  const [disposalPolicy, setDisposalPolicy] = useState(DISPOSAL_POLICIES[0])

  const canPost = codes.includes('stock_issue.post')

  useEffect(() => {
    if (!propStoreId) {
      getMyStores()
        .then((list) => {
          if (list.length > 0) setStoreId(list[0].id)
        })
        .catch(() => {})
    } else {
      setStoreId(propStoreId)
    }
  }, [propStoreId])

  useEffect(() => {
    if (!storeId) return
    getStorePermissionCodes(storeId).then(setCodes).catch(() => setCodes([]))
  }, [storeId])

  useEffect(() => {
    listActiveMaterials().then(setMaterials).catch(() => setMaterials([]))
    listMyCompanies().then(setCompanies).catch(() => setCompanies([]))
  }, [])

  const loadIssues = () => {
    if (!storeId) return
    setIssues((prev) => ({ ...prev, loading: true, error: '' }))
    listMaterialIssues(storeId, {
      status: issueStatus,
      material: issueMaterial,
      search: issueSearch,
      sourceCompanyId: issueCompany,
      materialKind: issueKind,
      batchReference: issueBatch,
      productReference: issueProduct,
      dateFrom: issueDateFrom,
      dateTo: issueDateTo,
      page: issuePage,
      pageSize: PAGE_SIZE,
    })
      .then((data) => {
        setIssues({
          loading: false,
          results: Array.isArray(data) ? data : data.results || [],
          count: data.count || (Array.isArray(data) ? data.length : 0),
          error: '',
        })
      })
      .catch((err) => {
        setIssues({ loading: false, results: [], count: 0, error: getErrorMessage(err) })
      })
  }

  const loadCustodies = () => {
    if (!storeId) return
    setCustodies((prev) => ({ ...prev, loading: true, error: '' }))
    listProductionCustodies(storeId)
      .then((data) => {
        setCustodies({
          loading: false,
          results: Array.isArray(data) ? data : [],
          error: '',
        })
      })
      .catch((err) => {
        setCustodies({ loading: false, results: [], error: getErrorMessage(err) })
      })
  }

  const loadReturns = () => {
    if (!storeId) return
    setReturns((prev) => ({ ...prev, loading: true, error: '' }))
    listMaterialReturns(storeId, {
      material: returnMaterial,
      returnType,
      disposition: returnDisposition,
      page: returnPage,
      pageSize: PAGE_SIZE,
    })
      .then((data) => {
        setReturns({
          loading: false,
          results: Array.isArray(data) ? data : data.results || [],
          count: data.count || (Array.isArray(data) ? data.length : 0),
          error: '',
        })
      })
      .catch((err) => {
        setReturns({ loading: false, results: [], count: 0, error: getErrorMessage(err) })
      })
  }

  useEffect(() => {
    if (activeTab === 'ISSUES') loadIssues()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    storeId, activeTab, issuePage, issueStatus, issueMaterial, issueCompany, issueKind,
  ])

  // Custody is loaded whenever Custody OR History tab is active - History is
  // derived from the SAME already-fetched custody payload (its floor_events
  // are already nested in the response), never a second endpoint.
  useEffect(() => {
    if (activeTab === 'CUSTODY' || activeTab === 'HISTORY') loadCustodies()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, activeTab])

  useEffect(() => {
    if (activeTab === 'RETURNS') loadReturns()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, activeTab, returnPage, returnMaterial, returnType, returnDisposition])

  // Clear notice after 5 seconds
  useEffect(() => {
    if (actionSuccess || actionError) {
      const timer = setTimeout(() => {
        setActionSuccess('')
        setActionError('')
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [actionSuccess, actionError])

  const handleClearIssueFilters = () => {
    setIssueSearch('')
    setIssueMaterial('')
    setIssueCompany('')
    setIssueKind('')
    setIssueStatus('')
    setIssueBatch('')
    setIssueProduct('')
    setIssueDateFrom('')
    setIssueDateTo('')
    setIssuePage(1)
  }

  const handlePostIssue = async (issue) => {
    const ok = await confirm({
      title: 'Post Material Issue',
      message: `Post issue ${issue.reference || `#${issue.id}`} to stock ledger?\n\nThis permanently deducts store balance and transfers stock to production custody. Cannot be undone.`,
      confirmLabel: '📤 Post to Ledger',
      cancelLabel: 'Go Back',
      variant: 'danger',
      icon: '📤',
    })
    if (!ok) return
    setActionLoading(true)
    setActionError('')
    try {
      await postMaterialIssue(storeId, issue.id, issue.version)
      setActionSuccess(`Issue ${issue.reference || issue.id} posted — stock deducted, production custody updated.`)
      loadIssues()
      setIssueDetailOpen(false)
    } catch (err) {
      setActionError(getErrorMessage(err))
    } finally {
      setActionLoading(false)
    }
  }

  const handleCancelIssue = async (issue) => {
    const reason = await prompt({
      title: 'Cancel Material Issue',
      message: `Enter reason for cancelling issue ${issue.reference || `#${issue.id}`}.`,
      placeholder: 'e.g. Issued to wrong batch, entered incorrectly...',
      confirmLabel: 'Cancel Issue',
      cancelLabel: 'Go Back',
      variant: 'danger',
    })
    if (!reason) return
    setActionLoading(true)
    setActionError('')
    try {
      await cancelMaterialIssue(storeId, issue.id, issue.version, reason)
      setActionSuccess(`Issue ${issue.reference || issue.id} cancelled.`)
      loadIssues()
      setIssueDetailOpen(false)
    } catch (err) {
      setActionError(getErrorMessage(err))
    } finally {
      setActionLoading(false)
    }
  }

  const handleSaveCustodyAction = async (e) => {
    e.preventDefault()
    const custody = custodyModal.custody
    if (!custody) return
    const qty = Number(custodyQty)
    if (!qty || qty <= 0) {
      setActionError('Quantity must be greater than zero.')
      return
    }

    setActionLoading(true)
    setActionError('')
    try {
      if (custodyModal.mode === 'CONSUME') {
        await recordProductionConsumption(storeId, custody.id, {
          quantity: qty,
          notes: custodyNotes,
          expected_version: custody.version,
        })
        setActionSuccess(`Logged ${qty} ${custody.unit_code} consumed in production for ${custody.source_issue_reference}.`)
      } else if (custodyModal.mode === 'RETURN') {
        await recordCustodyReturn(storeId, custody.id, {
          quantity: qty,
          return_type: custodyReturnType,
          reason: custodyReason,
          expected_version: custody.version,
        })
        setActionSuccess(`Logged ${qty} ${custody.unit_code} returned (${custodyReturnType}) to store under held disposition for ${custody.source_issue_reference}.`)
      } else if (custodyModal.mode === 'DEFECT') {
        await recordDefectClassification(storeId, custody.id, {
          quantity: qty,
          reason: custodyReason,
          notes: custodyNotes,
          expected_version: custody.version,
        })
        setActionSuccess(`Classified ${qty} ${custody.unit_code} damaged in floor custody for ${custody.source_issue_reference}.`)
      } else if (custodyModal.mode === 'DISPOSE') {
        await recordCustodyDisposal(storeId, custody.id, {
          quantity: qty,
          disposal_policy: disposalPolicy,
          reason: custodyReason,
          notes: custodyNotes,
          expected_version: custody.version,
        })
        setActionSuccess(`Disposed ${qty} ${custody.unit_code} under policy ${disposalPolicy} for ${custody.source_issue_reference}.`)
      }
      setCustodyModal({ open: false, custody: null, mode: 'CONSUME' })
      setCustodyQty('')
      setCustodyNotes('')
      loadCustodies()
      loadIssues()
      if (activeTab === 'RETURNS') loadReturns()
    } catch (err) {
      setActionError(getErrorMessage(err))
    } finally {
      setActionLoading(false)
    }
  }

  // ---------------------------------------------------------------------
  // Derived: Consumption & Disposition History - flattened from the
  // custodies already loaded for the Custody tab (each custody carries
  // its own full floor_events list already - see ProductionCustodySerializer).
  // Never a second backend call; never re-summed into a competing ledger.
  // ---------------------------------------------------------------------
  const historyRows = useMemo(() => {
    const rows = []
    for (const c of custodies.results) {
      for (const ev of c.floor_events || []) {
        rows.push({
          ...ev,
          custody_id: c.id,
          source_issue_reference: c.source_issue_reference,
          material_code: c.material_code,
          material_name: c.material_name,
          source_company_code: c.source_company_code,
          batch_reference: c.batch_reference,
          product_reference: c.product_reference,
          unit_code: c.unit_code,
        })
      }
    }
    rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    return rows
  }, [custodies.results])

  const filteredHistoryRows = useMemo(() => {
    let rows = historyRows
    if (historyEventType) rows = rows.filter((r) => r.event_type === historyEventType)
    if (historySearch) {
      const s = historySearch.toLowerCase()
      rows = rows.filter((r) =>
        [r.material_code, r.material_name, r.source_issue_reference, r.batch_reference, r.reason, r.notes]
          .filter(Boolean)
          .some((f) => String(f).toLowerCase().includes(s))
      )
    }
    return rows
  }, [historyRows, historyEventType, historySearch])

  const filteredCustodies = useMemo(() => {
    if (!custodySearch) return custodies.results
    const s = custodySearch.toLowerCase()
    return custodies.results.filter((c) =>
      [c.material_code, c.material_name, c.source_issue_reference, c.source_company_code, c.batch_reference]
        .filter(Boolean)
        .some((f) => String(f).toLowerCase().includes(s))
    )
  }, [custodies.results, custodySearch])

  const storeDisplayName = storeId ? `Shared Store #${storeId}` : 'Shared Warehouse'

  return (
    <div className="ci-container">
      {/* Header */}
      <div className="ci-header">
        <div className="ci-header-titles">
          <h2>Issue &amp; Return</h2>
          <p>
            Issue raw and packaging materials from the shared store to production, track persistent floor
            custody, record returns/defects/disposals, and review the full history — all traceable to the
            original issue and recorded actor.
          </p>
        </div>
        <div className="ci-header-actions">
          <Button
            variant="primary"
            onClick={() => {
              setEditIssueId(null)
              setNewIssueOpen(true)
            }}
            title="Create a new draft material issue to transfer stock out of store."
          >
            + New Issue Outward
          </Button>
        </div>
      </div>

      {actionSuccess && (
        <div style={{ marginBottom: 4 }}>
          <Alert type="success">{actionSuccess}</Alert>
        </div>
      )}
      {actionError && (
        <div style={{ marginBottom: 4 }}>
          <Alert type="danger">{actionError}</Alert>
        </div>
      )}

      {/* Subtab Navigation */}
      <div className="ci-nav-bar">
        <div className="ci-subtabs">
          <button
            type="button"
            className={`ci-subtab-btn ${activeTab === 'ISSUES' ? 'active' : ''}`}
            onClick={() => setActiveTab('ISSUES')}
          >
            📤 Material Issues
            {issues.count > 0 && <span className="ci-subtab-count">{issues.count}</span>}
          </button>
          <button
            type="button"
            className={`ci-subtab-btn ${activeTab === 'CUSTODY' ? 'active' : ''}`}
            onClick={() => setActiveTab('CUSTODY')}
          >
            🏭 Production Custody
            {custodies.results.length > 0 && <span className="ci-subtab-count">{custodies.results.length}</span>}
          </button>
          <button
            type="button"
            className={`ci-subtab-btn ${activeTab === 'RETURNS' ? 'active' : ''}`}
            onClick={() => setActiveTab('RETURNS')}
          >
            ↩️ Returns
            {returns.count > 0 && <span className="ci-subtab-count">{returns.count}</span>}
          </button>
          <button
            type="button"
            className={`ci-subtab-btn ${activeTab === 'HISTORY' ? 'active' : ''}`}
            onClick={() => setActiveTab('HISTORY')}
          >
            🕘 Consumption &amp; Disposition History
            {historyRows.length > 0 && <span className="ci-subtab-count">{historyRows.length}</span>}
          </button>
        </div>
        <div className="ci-store-pill">
          <span className="ci-store-dot"></span>
          <span>Store: <strong>{storeDisplayName}</strong></span>
        </div>
      </div>

      {/* ================================================================= */}
      {/* TAB 1: MATERIAL ISSUES                                            */}
      {/* ================================================================= */}
      {activeTab === 'ISSUES' && (
        <div>
          <div
            className="ci-filters"
            style={{
              marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
              background: '#f8fafc', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0',
            }}
          >
            <input
              type="text"
              className="ci-input"
              placeholder="Search reference / material / batch / product..."
              value={issueSearch}
              onChange={(e) => setIssueSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setIssuePage(1)
                  loadIssues()
                }
              }}
              style={{ minWidth: 240, padding: '5px 8px', fontSize: 13 }}
            />
            <select
              className="ci-select"
              value={issueKind}
              onChange={(e) => { setIssueKind(e.target.value); setIssuePage(1) }}
              style={{ minWidth: 110, fontSize: 13, padding: '5px 8px' }}
            >
              <option value="">Raw / Packaging / All</option>
              <option value="RAW_MATERIAL">Raw only</option>
              <option value="PACKAGING_MATERIAL">Packaging only</option>
            </select>
            <select
              className="ci-select"
              value={issueMaterial}
              onChange={(e) => { setIssueMaterial(e.target.value); setIssuePage(1) }}
              style={{ minWidth: 150, fontSize: 13, padding: '5px 8px' }}
            >
              <option value="">All Materials</option>
              {materials.map((m) => (
                <option key={m.id} value={m.id}>{m.code} — {m.name}</option>
              ))}
            </select>
            <select
              className="ci-select"
              value={issueCompany}
              onChange={(e) => { setIssueCompany(e.target.value); setIssuePage(1) }}
              style={{ minWidth: 150, fontSize: 13, padding: '5px 8px' }}
            >
              <option value="">All Companies</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.code} — {c.name || c.display_name}</option>
              ))}
            </select>
            <select
              className="ci-select"
              value={issueStatus}
              onChange={(e) => { setIssueStatus(e.target.value); setIssuePage(1) }}
              style={{ minWidth: 120, fontSize: 13, padding: '5px 8px' }}
            >
              <option value="">All Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="POSTED">Posted</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
            <input
              type="text"
              className="ci-input"
              placeholder="Product..."
              value={issueProduct}
              onChange={(e) => setIssueProduct(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { setIssuePage(1); loadIssues() } }}
              style={{ minWidth: 130, padding: '5px 8px', fontSize: 13 }}
            />
            <input
              type="text"
              className="ci-input"
              placeholder="Batch..."
              value={issueBatch}
              onChange={(e) => setIssueBatch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { setIssuePage(1); loadIssues() } }}
              style={{ minWidth: 110, padding: '5px 8px', fontSize: 13 }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#475569' }}>
              <span>From:</span>
              <input
                type="date" className="ci-input" value={issueDateFrom}
                onChange={(e) => { setIssueDateFrom(e.target.value); setIssuePage(1) }}
                style={{ fontSize: 12, padding: '4px 6px' }}
              />
              <span>To:</span>
              <input
                type="date" className="ci-input" value={issueDateTo}
                onChange={(e) => { setIssueDateTo(e.target.value); setIssuePage(1) }}
                style={{ fontSize: 12, padding: '4px 6px' }}
              />
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              {(issueSearch || issueMaterial || issueCompany || issueKind || issueStatus || issueBatch || issueProduct || issueDateFrom || issueDateTo) && (
                <Button size="sm" variant="secondary" onClick={handleClearIssueFilters}>Clear</Button>
              )}
              <Button size="sm" variant="secondary" onClick={loadIssues} disabled={issues.loading}>
                {issues.loading ? 'Refreshing...' : '🔄 Refresh'}
              </Button>
            </div>
          </div>

          {issues.loading ? (
            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
              <LoadingState label="Loading material issues..." />
            </div>
          ) : issues.error ? (
            <Alert type="danger">Failed to load material issues: {issues.error}</Alert>
          ) : issues.results.length === 0 ? (
            <div className="ci-empty" style={{ padding: '40px 20px', textAlign: 'center', background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
              <h3>No Material Issues Found</h3>
              <p style={{ color: '#64748b', fontSize: 13 }}>
                Click &ldquo;+ New Issue Outward&rdquo; above to issue stock to production floor.
              </p>
            </div>
          ) : (
            <>
              <div className="ci-table-wrap">
                <table className="ci-table">
                  <thead>
                    <tr>
                      <th>Issue Number</th>
                      <th>Issue Date</th>
                      <th>Consuming Company</th>
                      <th>Product / Batch</th>
                      <th>Material Summary</th>
                      <th>Status</th>
                      <th>Issued By</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {issues.results.map((iss) => {
                      const st = iss.status
                      const badgeClass =
                        st === 'POSTED' ? 'ci-badge ci-badge-success'
                        : st === 'DRAFT' ? 'ci-badge ci-badge-warning'
                        : 'ci-badge ci-badge-danger'
                      const isPackaging = iss.material_kind === 'PACKAGING_MATERIAL'

                      return (
                        <tr key={iss.id}>
                          <td><strong>{iss.reference}</strong></td>
                          <td style={{ fontSize: 12 }}>{(iss.issued_at || '').slice(0, 10)}</td>
                          <td>{iss.source_company_code || `#${iss.source_company_id}`}</td>
                          <td>
                            <div>{iss.product_reference || '-'}</div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>{iss.batch_reference || 'No batch recorded'}</div>
                          </td>
                          <td>
                            <div>
                              <strong>{iss.material_code_snapshot}</strong> — {iss.issued_quantity} {iss.unit_code_snapshot}
                            </div>
                            <span
                              className="stock-badge"
                              style={{
                                background: isPackaging ? '#ede9fe' : '#e0f2fe',
                                color: isPackaging ? '#6d28d9' : '#0369a1',
                                fontSize: 10, padding: '1px 5px', fontWeight: 600,
                              }}
                            >
                              {isPackaging ? 'PACKAGING' : 'RAW'}
                            </span>
                          </td>
                          <td><span className={badgeClass}>{st}</span></td>
                          <td style={{ fontSize: 12 }}>User #{iss.created_by_id}</td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: 6 }}>
                              <Button
                                size="sm" variant="secondary"
                                onClick={() => { setSelectedIssue(iss); setIssueDetailOpen(true) }}
                              >
                                View
                              </Button>
                              {st === 'DRAFT' && (
                                <>
                                  <Button
                                    size="sm" variant="secondary"
                                    onClick={() => { setEditIssueId(iss.id); setNewIssueOpen(true) }}
                                    disabled={actionLoading}
                                  >
                                    ✏️ Edit
                                  </Button>
                                  <Button
                                    size="sm" variant="primary"
                                    onClick={() => handlePostIssue(iss)}
                                    disabled={actionLoading || !canPost}
                                    title={!canPost ? 'You need stock_issue.post in this store to post an issue.' : undefined}
                                  >
                                    Post Issue
                                  </Button>
                                  <Button
                                    size="sm" variant="danger"
                                    onClick={() => handleCancelIssue(iss)}
                                    disabled={actionLoading}
                                  >
                                    Cancel
                                  </Button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {issues.count > 0 && (
                <div
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14,
                    padding: '8px 12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13,
                  }}
                >
                  <span style={{ color: '#64748b' }}>
                    Showing {(issuePage - 1) * PAGE_SIZE + 1} &ndash; {Math.min(issuePage * PAGE_SIZE, issues.count)} of {issues.count} issues
                  </span>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <Button size="sm" variant="secondary" disabled={issuePage <= 1 || issues.loading} onClick={() => setIssuePage((p) => Math.max(1, p - 1))}>
                      &larr; Previous
                    </Button>
                    <span style={{ padding: '0 8px', fontWeight: 600 }}>
                      Page {issuePage} of {Math.ceil(issues.count / PAGE_SIZE) || 1}
                    </span>
                    <Button size="sm" variant="secondary" disabled={issuePage * PAGE_SIZE >= issues.count || issues.loading} onClick={() => setIssuePage((p) => p + 1)}>
                      Next &rarr;
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 2: PRODUCTION CUSTODY                                          */}
      {/* ================================================================= */}
      {activeTab === 'CUSTODY' && (
        <div>
          <div style={{ padding: '12px 16px', background: '#eff6ff', borderRadius: 8, border: '1px solid #bfdbfe', fontSize: 13, color: '#1e40af', marginBottom: 16 }}>
            <strong>Persistent Production Floor Custody (Backend Verified):</strong> Each record below represents real database-backed production custody initialized from a posted warehouse issue.
            <div style={{ marginTop: 4, fontSize: 12 }}>
              <code>Issued = Consumed + Returned (Held) + Disposed + Remaining; Damaged is a condition subset of Remaining, not a separate outflow.</code>
            </div>
          </div>

          <div className="ci-filters" style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
            <input
              type="text"
              className="ci-input"
              placeholder="Search material / issue ref / company / batch..."
              value={custodySearch}
              onChange={(e) => setCustodySearch(e.target.value)}
              style={{ minWidth: 280, padding: '5px 8px', fontSize: 13 }}
            />
            <Button size="sm" variant="secondary" onClick={loadCustodies} disabled={custodies.loading}>
              {custodies.loading ? 'Refreshing...' : '🔄 Refresh'}
            </Button>
          </div>

          {custodies.loading && (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <LoadingState label="Loading production floor custody records..." />
            </div>
          )}

          {!custodies.loading && custodies.error && (
            <Alert type="danger">Failed to load custody records: {custodies.error}</Alert>
          )}

          {!custodies.loading && !custodies.error && filteredCustodies.length === 0 ? (
            <div className="ci-empty" style={{ padding: '40px 20px', textAlign: 'center', background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🏭</div>
              <h3>No Active Production Floor Custody</h3>
              <p style={{ color: '#64748b', fontSize: 13 }}>Post a warehouse issue to establish production floor custody.</p>
            </div>
          ) : !custodies.loading && !custodies.error && (
            <div className="ci-table-wrap">
              <table className="ci-table">
                <thead>
                  <tr>
                    <th>Source Issue &amp; Material</th>
                    <th>Batch / Company</th>
                    <th>Issued</th>
                    <th>Consumed</th>
                    <th>Returned (Held)</th>
                    <th>Damaged</th>
                    <th>Disposed</th>
                    <th>Remaining Custody</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCustodies.map((c) => {
                    const remaining = Number(c.remaining_quantity || 0)
                    const sound = Number(c.sound_quantity || 0)
                    const damaged = Number(c.damaged_quantity || 0)

                    return (
                      <tr key={c.id}>
                        <td>
                          <strong>{c.source_issue_reference}</strong>
                          <div style={{ fontSize: 12, color: '#475569' }}>{c.material_code} &middot; {c.material_name}</div>
                        </td>
                        <td>
                          <div>{c.batch_reference || 'General Batch'}</div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>{c.source_company_code}</div>
                        </td>
                        <td><strong>{c.issued_quantity}</strong> {c.unit_code}</td>
                        <td style={{ color: '#16a34a' }}>{c.consumed_quantity} {c.unit_code}</td>
                        <td style={{ color: '#2563eb' }}>{c.returned_quantity} {c.unit_code}</td>
                        <td style={{ color: '#dc2626' }}>{c.damaged_quantity} {c.unit_code}</td>
                        <td style={{ color: '#6b7280' }}>{c.disposed_quantity} {c.unit_code}</td>
                        <td>
                          <strong style={{ color: remaining > 0 ? '#0f172a' : '#94a3b8' }}>{remaining.toFixed(3)}</strong> {c.unit_code}
                          {damaged > 0 && (
                            <div style={{ fontSize: 10, color: '#dc2626' }}>({sound.toFixed(3)} sound, {damaged.toFixed(3)} damaged)</div>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            <Button size="sm" variant="secondary" onClick={() => setCustodyDetail(c)}>
                              Details
                            </Button>
                            <Button
                              size="sm" variant="secondary" disabled={sound <= 0 || actionLoading || !canPost}
                              title={!canPost ? 'You need stock_issue.post in this store.' : undefined}
                              onClick={() => { setCustodyModal({ open: true, custody: c, mode: 'CONSUME' }); setCustodyQty(sound.toString()) }}
                            >
                              Log Consumed
                            </Button>
                            <Button
                              size="sm" variant="secondary" disabled={remaining <= 0 || actionLoading || !canPost}
                              title={!canPost ? 'You need stock_issue.post in this store.' : undefined}
                              style={{ background: '#f0fdf4', borderColor: '#bbf7d0', color: '#15803d' }}
                              onClick={() => {
                                setCustodyModal({ open: true, custody: c, mode: 'RETURN' })
                                setCustodyReturnType('UNUSED')
                                setCustodyQty(sound > 0 ? sound.toString() : remaining.toString())
                              }}
                            >
                              Return to Store
                            </Button>
                            <Button
                              size="sm" variant="secondary" disabled={sound <= 0 || actionLoading || !canPost}
                              title={!canPost ? 'You need stock_issue.post in this store.' : undefined}
                              style={{ background: '#fef2f2', borderColor: '#fecaca', color: '#b91c1c' }}
                              onClick={() => { setCustodyModal({ open: true, custody: c, mode: 'DEFECT' }); setCustodyQty('1') }}
                            >
                              Classify Defect
                            </Button>
                            <Button
                              size="sm" variant="secondary" disabled={remaining <= 0 || actionLoading || !canPost}
                              title={!canPost ? 'You need stock_issue.post in this store.' : undefined}
                              style={{ background: '#f5f3ff', borderColor: '#ddd6fe', color: '#6d28d9' }}
                              onClick={() => { setCustodyModal({ open: true, custody: c, mode: 'DISPOSE' }); setCustodyQty(damaged > 0 ? damaged.toString() : '1') }}
                            >
                              Dispose
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 3: RETURNS                                                     */}
      {/* ================================================================= */}
      {activeTab === 'RETURNS' && (
        <div>
          <div className="ci-filters" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: '#f8fafc', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <select
              className="ci-select" value={returnMaterial}
              onChange={(e) => { setReturnMaterial(e.target.value); setReturnPage(1) }}
              style={{ minWidth: 160, fontSize: 13, padding: '5px 8px' }}
            >
              <option value="">All Materials</option>
              {materials.map((m) => (<option key={m.id} value={m.id}>{m.code} — {m.name}</option>))}
            </select>
            <select
              className="ci-select" value={returnType}
              onChange={(e) => { setReturnType(e.target.value); setReturnPage(1) }}
              style={{ minWidth: 140, fontSize: 13, padding: '5px 8px' }}
            >
              <option value="">All Conditions</option>
              <option value="UNUSED">Unused</option>
              <option value="DEFECTIVE">Defective</option>
            </select>
            <select
              className="ci-select" value={returnDisposition}
              onChange={(e) => { setReturnDisposition(e.target.value); setReturnPage(1) }}
              style={{ minWidth: 170, fontSize: 13, padding: '5px 8px' }}
            >
              <option value="">All Dispositions</option>
              <option value="HELD_UNASSESSED">Held / Unassessed</option>
              <option value="RELEASED_USABLE">Released to Usable</option>
              <option value="QUARANTINE_REJECTED">Quarantine / Rejected</option>
            </select>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              {(returnMaterial || returnType || returnDisposition) && (
                <Button size="sm" variant="secondary" onClick={() => { setReturnMaterial(''); setReturnType(''); setReturnDisposition(''); setReturnPage(1) }}>
                  Clear
                </Button>
              )}
              <Button size="sm" variant="secondary" onClick={loadReturns} disabled={returns.loading}>
                {returns.loading ? 'Refreshing...' : '🔄 Refresh'}
              </Button>
            </div>
          </div>

          {returns.loading ? (
            <div style={{ padding: '40px 20px', textAlign: 'center' }}><LoadingState label="Loading returns..." /></div>
          ) : returns.error ? (
            <Alert type="danger">Failed to load returns: {returns.error}</Alert>
          ) : returns.results.length === 0 ? (
            <div className="ci-empty" style={{ padding: '40px 20px', textAlign: 'center', background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>↩️</div>
              <h3>No Returns Recorded</h3>
              <p style={{ color: '#64748b', fontSize: 13 }}>
                Returns are recorded from the Production Custody tab using &ldquo;Return to Store&rdquo;.
              </p>
            </div>
          ) : (
            <>
              <div className="ci-table-wrap">
                <table className="ci-table">
                  <thead>
                    <tr>
                      <th>Return Reference</th>
                      <th>Return Date</th>
                      <th>Original Issue</th>
                      <th>Company / Batch</th>
                      <th>Material</th>
                      <th>Quantity</th>
                      <th>Condition</th>
                      <th>Disposition</th>
                      <th>Received By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {returns.results.map((r) => (
                      <tr key={r.id}>
                        <td><strong>RET-{r.id}</strong></td>
                        <td style={{ fontSize: 12 }}>{(r.created_at || '').slice(0, 10)}</td>
                        <td>{r.source_issue_reference}</td>
                        <td>
                          <div>{r.source_company_code}</div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>{r.batch_reference || '-'}</div>
                        </td>
                        <td>{r.material_code} &middot; {r.material_name}</td>
                        <td><strong>{r.quantity}</strong> {r.unit_code}</td>
                        <td>
                          <span className="stock-badge" style={{ background: r.return_type === 'DEFECTIVE' ? '#fee2e2' : '#dcfce7', color: r.return_type === 'DEFECTIVE' ? '#b91c1c' : '#15803d' }}>
                            {r.return_type}
                          </span>
                        </td>
                        <td>
                          <span className="stock-badge" style={{ background: '#fef3c7', color: '#b45309' }}>
                            {r.disposition.replaceAll('_', ' ')}
                          </span>
                        </td>
                        <td style={{ fontSize: 12 }}>{r.recorded_by_username || `User #${r.recorded_by_id}`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {returns.count > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, padding: '8px 12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}>
                  <span style={{ color: '#64748b' }}>
                    Showing {(returnPage - 1) * PAGE_SIZE + 1} &ndash; {Math.min(returnPage * PAGE_SIZE, returns.count)} of {returns.count} returns
                  </span>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <Button size="sm" variant="secondary" disabled={returnPage <= 1 || returns.loading} onClick={() => setReturnPage((p) => Math.max(1, p - 1))}>&larr; Previous</Button>
                    <span style={{ padding: '0 8px', fontWeight: 600 }}>Page {returnPage} of {Math.ceil(returns.count / PAGE_SIZE) || 1}</span>
                    <Button size="sm" variant="secondary" disabled={returnPage * PAGE_SIZE >= returns.count || returns.loading} onClick={() => setReturnPage((p) => p + 1)}>Next &rarr;</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 4: CONSUMPTION & DISPOSITION HISTORY                           */}
      {/* ================================================================= */}
      {activeTab === 'HISTORY' && (
        <div>
          <div className="ci-filters" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: '#f8fafc', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <input
              type="text" className="ci-input" placeholder="Search material / issue ref / reason..."
              value={historySearch} onChange={(e) => setHistorySearch(e.target.value)}
              style={{ minWidth: 260, padding: '5px 8px', fontSize: 13 }}
            />
            <select
              className="ci-select" value={historyEventType}
              onChange={(e) => setHistoryEventType(e.target.value)}
              style={{ minWidth: 180, fontSize: 13, padding: '5px 8px' }}
            >
              <option value="">All Event Types</option>
              {Object.entries(EVENT_TYPE_LABELS).map(([k, label]) => (<option key={k} value={k}>{label}</option>))}
            </select>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <Button size="sm" variant="secondary" onClick={loadCustodies} disabled={custodies.loading}>
                {custodies.loading ? 'Refreshing...' : '🔄 Refresh'}
              </Button>
            </div>
          </div>

          {custodies.loading ? (
            <div style={{ padding: '40px 20px', textAlign: 'center' }}><LoadingState label="Loading history..." /></div>
          ) : filteredHistoryRows.length === 0 ? (
            <div className="ci-empty" style={{ padding: '40px 20px', textAlign: 'center', background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🕘</div>
              <h3>No Recorded Events</h3>
              <p style={{ color: '#64748b', fontSize: 13 }}>
                Consumption, returns, defect classifications and disposals recorded from the Production Custody tab will appear here.
              </p>
            </div>
          ) : (
            <div className="ci-table-wrap">
              <table className="ci-table">
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Material</th>
                    <th>Source Issue / Batch</th>
                    <th>Quantity</th>
                    <th>Reason / Policy</th>
                    <th>Recorded By</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistoryRows.map((ev) => (
                    <tr key={ev.id}>
                      <td>
                        <span className="stock-badge" style={{ background: '#eef2ff', color: '#4338ca' }}>
                          {EVENT_TYPE_LABELS[ev.event_type] || ev.event_type}
                        </span>
                      </td>
                      <td>{ev.material_code} &middot; {ev.material_name}</td>
                      <td>
                        <div>{ev.source_issue_reference}</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>{ev.batch_reference || '-'}</div>
                      </td>
                      <td><strong>{ev.quantity}</strong> {ev.unit_code}</td>
                      <td style={{ fontSize: 12 }}>{ev.disposal_policy || ev.reason || '-'}</td>
                      <td style={{ fontSize: 12 }}>{ev.recorded_by_username || `User #${ev.recorded_by_id}`}</td>
                      <td style={{ fontSize: 12 }}>{(ev.created_at || '').slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Custody Action Dialog Modal */}
      {custodyModal.open && custodyModal.custody && (
        <Modal
          isOpen={true}
          onClose={() => setCustodyModal({ open: false, custody: null, mode: 'CONSUME' })}
          title={
            custodyModal.mode === 'CONSUME' ? `Log Production Consumption: ${custodyModal.custody.source_issue_reference}`
            : custodyModal.mode === 'RETURN' ? `Return Material to Store: ${custodyModal.custody.source_issue_reference}`
            : custodyModal.mode === 'DEFECT' ? `Classify Production Defect: ${custodyModal.custody.source_issue_reference}`
            : `Authorize Disposal: ${custodyModal.custody.source_issue_reference}`
          }
        >
          <form onSubmit={handleSaveCustodyAction} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ padding: 10, background: '#f8fafc', borderRadius: 8, fontSize: 13 }}>
              <div><strong>Material:</strong> {custodyModal.custody.material_code} &mdash; {custodyModal.custody.material_name}</div>
              <div><strong>Custody Balance:</strong> {custodyModal.custody.remaining_quantity} {custodyModal.custody.unit_code} (Sound: {custodyModal.custody.sound_quantity}, Damaged: {custodyModal.custody.damaged_quantity})</div>
            </div>

            {custodyModal.mode === 'RETURN' && (
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Return Condition:</label>
                <select className="ci-select" value={custodyReturnType} onChange={(e) => setCustodyReturnType(e.target.value)} style={{ width: '100%' }}>
                  <option value="UNUSED">UNUSED &mdash; Return surplus usable material</option>
                  <option value="DEFECTIVE">DEFECTIVE &mdash; Return damaged / compromised material</option>
                </select>
              </div>
            )}

            {custodyModal.mode === 'DISPOSE' && (
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Disposal Authorization Policy:</label>
                <select className="ci-select" value={disposalPolicy} onChange={(e) => setDisposalPolicy(e.target.value)} style={{ width: '100%' }}>
                  {DISPOSAL_POLICIES.map((p) => (<option key={p} value={p}>{p}</option>))}
                </select>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                  Disposal is authorized by holding stock_issue.post in this store plus this explicit policy reference —
                  there is no separate multi-step disposal-approval workflow in this system yet.
                </div>
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                Quantity ({custodyModal.custody.unit_code}):
              </label>
              <input
                type="number" step="0.001" min="0.001" max={custodyModal.custody.remaining_quantity}
                className="ci-input" value={custodyQty} onChange={(e) => setCustodyQty(e.target.value)} required
              />
            </div>

            {(custodyModal.mode === 'RETURN' || custodyModal.mode === 'DEFECT' || custodyModal.mode === 'DISPOSE') && (
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Reason / Justification:</label>
                <input type="text" className="ci-input" value={custodyReason} onChange={(e) => setCustodyReason(e.target.value)} placeholder="Enter reason..." required />
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Notes / Reference:</label>
              <input type="text" className="ci-input" value={custodyNotes} onChange={(e) => setCustodyNotes(e.target.value)} placeholder="Optional notes or batch observation..." />
            </div>

            {custodyModal.mode === 'RETURN' && (
              <div style={{ padding: '8px 12px', background: '#fefce8', borderRadius: 6, fontSize: 11, color: '#854d0e', border: '1px solid #fef08a' }}>
                <strong>Return Policy:</strong> Returned physical stock is restored to warehouse physical custody under explicit <code>HELD_UNASSESSED</code> disposition. It does not automatically become usable/issue-eligible stock until an authorized release exists.
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <Button type="button" variant="secondary" onClick={() => setCustodyModal({ open: false, custody: null, mode: 'CONSUME' })}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={actionLoading}>{actionLoading ? 'Recording...' : 'Confirm & Record'}</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Custody Detail Drawer (view-only) */}
      {custodyDetail && (
        <Modal isOpen={true} onClose={() => setCustodyDetail(null)} title={`Production Custody: ${custodyDetail.source_issue_reference}`} maxWidth="760px">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13, background: '#f8fafc', padding: 12, borderRadius: 8 }}>
              <div><strong>Source Issue:</strong> {custodyDetail.source_issue_reference}</div>
              <div><strong>Material:</strong> {custodyDetail.material_code} &middot; {custodyDetail.material_name}</div>
              <div><strong>Company:</strong> {custodyDetail.source_company_code}</div>
              <div><strong>Batch / Product:</strong> {custodyDetail.batch_reference || '-'} / {custodyDetail.product_reference || '-'}</div>
              <div><strong>Issued:</strong> {custodyDetail.issued_quantity} {custodyDetail.unit_code}</div>
              <div><strong>Remaining:</strong> {custodyDetail.remaining_quantity} {custodyDetail.unit_code} (Sound {custodyDetail.sound_quantity}, Damaged {custodyDetail.damaged_quantity})</div>
            </div>
            <div>
              <h4 style={{ margin: '4px 0 6px', fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Consumption / Return / Defect / Disposal History</h4>
              {(custodyDetail.floor_events || []).length === 0 ? (
                <div style={{ color: '#64748b', fontSize: 12 }}>No floor events recorded yet.</div>
              ) : (
                <table className="ci-table" style={{ fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th>Event</th>
                      <th>Quantity</th>
                      <th>Reason / Policy</th>
                      <th>Recorded By</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {custodyDetail.floor_events.map((ev) => (
                      <tr key={ev.id}>
                        <td>{EVENT_TYPE_LABELS[ev.event_type] || ev.event_type}</td>
                        <td>{ev.quantity} {custodyDetail.unit_code}</td>
                        <td>{ev.disposal_policy || ev.reason || '-'}</td>
                        <td>{ev.recorded_by_username || `User #${ev.recorded_by_id}`}</td>
                        <td>{(ev.created_at || '').slice(0, 10)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <Button variant="secondary" onClick={() => setCustodyDetail(null)}>Close</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Issue Details Modal */}
      {issueDetailOpen && selectedIssue && (
        <Modal isOpen={true} onClose={() => setIssueDetailOpen(false)} title={`Material Issue: ${selectedIssue.reference}`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13 }}>
              <div><strong>Status:</strong> {selectedIssue.status}</div>
              <div><strong>Material:</strong> {selectedIssue.material_code_snapshot} &middot; {selectedIssue.material_name_snapshot}</div>
              <div><strong>Quantity:</strong> {selectedIssue.issued_quantity} {selectedIssue.unit_code_snapshot}</div>
              <div><strong>Batch Reference:</strong> {selectedIssue.batch_reference || '-'}</div>
              <div><strong>Product:</strong> {selectedIssue.product_reference || '-'}</div>
              <div><strong>Consuming Company:</strong> {selectedIssue.source_company_code || `#${selectedIssue.source_company_id}`}</div>
              <div><strong>Issued Date:</strong> {(selectedIssue.issued_at || '').slice(0, 10)}</div>
              <div><strong>Created By:</strong> User #{selectedIssue.created_by_id}</div>
            </div>
            {selectedIssue.remarks && (
              <div style={{ padding: 10, background: '#f8fafc', borderRadius: 6, fontSize: 12 }}>
                <strong>Remarks:</strong> {selectedIssue.remarks}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <Button variant="secondary" onClick={() => setIssueDetailOpen(false)}>Close</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* New / Edit Issue Outward Modal */}
      {newIssueOpen && (
        <IssueOutwardModal
          storeId={storeId}
          editIssueId={editIssueId}
          onClose={() => { setNewIssueOpen(false); setEditIssueId(null) }}
          onIssued={() => {
            setNewIssueOpen(false)
            setEditIssueId(null)
            setActionSuccess(editIssueId ? 'Material issue draft updated.' : 'Material issue draft saved.')
            loadIssues()
          }}
          onPosted={() => {
            setNewIssueOpen(false)
            setEditIssueId(null)
            setActionSuccess('Material issue posted to stock ledger and production custody initialized!')
            loadIssues()
            if (activeTab === 'CUSTODY' || activeTab === 'HISTORY') loadCustodies()
          }}
        />
      )}
      {ConfirmNode}
    </div>
  )
}
