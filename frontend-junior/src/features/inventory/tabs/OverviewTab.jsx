import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Spinner, { LoadingState } from '../../../components/Spinner'
import Alert from '../../../components/Alert'
import Button from '../../../components/Button'
import Modal from '../components/Modal'
import MaterialModal from '../components/MaterialModal'
import InwardStockModal from '../../store/InwardStockModal'
import IssueOutwardModal from '../../store/IssueOutwardModal'
import { getErrorMessage } from '../../../utils/errors'
import { getMyStores, getStoreSummary } from '../../store/storeService'
import useAuth from '../../../hooks/useAuth'
import useWorkspace from '../../../hooks/useWorkspace'
import { addNotification } from '../../../utils/notifications'
import './CommonInventory.css'

function getBusinessDateRange(preset, customFrom = '', customTo = '') {
  // Asia/Kolkata timezone standard
  const now = new Date()
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now)

  if (preset === 'today') {
    return { dateFrom: todayStr, dateTo: todayStr }
  }
  if (preset === 'this-week') {
    const today = new Date(todayStr + 'T00:00:00')
    const day = today.getDay()
    const diffToMonday = day === 0 ? -6 : 1 - day
    const monday = new Date(today)
    monday.setDate(today.getDate() + diffToMonday)
    const mondayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(monday)
    return { dateFrom: mondayStr, dateTo: todayStr }
  }
  if (preset === 'this-month') {
    const [year, month] = todayStr.split('-')
    return { dateFrom: `${year}-${month}-01`, dateTo: todayStr }
  }
  if (preset === 'custom') {
    return { dateFrom: customFrom, dateTo: customTo }
  }
  return { dateFrom: '', dateTo: '' }
}

export default function OverviewTab({
  storeId: propStoreId,
  onSelectStore: propOnSelectStore,
  stores: propStores = [],
  storesReady = false,
  storesLoading = false,
  storesError = '',
}) {
  const { user } = useAuth()
  const { activeWorkspace } = useWorkspace()
  const navigate = useNavigate()

  // Local fallback if stores not passed from parent
  const [internalStores, setInternalStores] = useState([])
  const [internalStoreId, setInternalStoreId] = useState(null)
  const stores = propStores.length > 0 ? propStores : internalStores
  const storeId = propStoreId || internalStoreId

  const handleSelectStore = (id) => {
    if (propOnSelectStore) {
      propOnSelectStore(id)
    } else {
      setInternalStoreId(id)
    }
  }

  // Date filter state
  const [datePreset, setDatePreset] = useState('all') // 'all' | 'today' | 'this-week' | 'this-month' | 'custom'
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [appliedDates, setAppliedDates] = useState({ dateFrom: '', dateTo: '' })

  // Dashboard data & state
  const [summary, setSummary] = useState({ loading: true, data: null, error: '' })

  // Action Modals state
  const [showAddMaterial, setShowAddMaterial] = useState(false)
  const [showInwardModal, setShowInwardModal] = useState(false)
  const [showIssueModal, setShowIssueModal] = useState(false)
  const [unsupportedModal, setUnsupportedModal] = useState(null) // null | { title, message }
  const [actionSuccessNotice, setActionSuccessNotice] = useState('')

  // Sequence ref for stale request protection
  const requestSeqRef = useRef(0)

  // Load stores list if not provided by prop
  useEffect(() => {
    if (propStores.length > 0) return
    getMyStores()
      .then((list) => {
        setInternalStores(list)
        if (list.length > 0 && !storeId) {
          handleSelectStore(list[0].id)
        }
      })
      .catch((err) => {
        setSummary((prev) => ({ ...prev, loading: false, error: getErrorMessage(err) }))
      })
  }, [propStores.length])

  // Ensure first store is selected if available and not yet set
  useEffect(() => {
    if (!storeId && stores.length > 0) {
      handleSelectStore(stores[0].id)
    }
  }, [storeId, stores])

  // Synchronize date preset changes
  const applyPreset = (preset) => {
    setDatePreset(preset)
    if (preset !== 'custom') {
      const dates = getBusinessDateRange(preset)
      setAppliedDates(dates)
    }
  }

  const applyCustomDates = (e) => {
    e?.preventDefault()
    if (customFrom && customTo && customFrom > customTo) {
      setSummary((prev) => ({ ...prev, error: 'Start date must not be after end date.' }))
      return
    }
    setAppliedDates({ dateFrom: customFrom, dateTo: customTo })
  }

  // Load dashboard summary data
  const fetchData = () => {
    if (!storeId) return
    const currentSeq = ++requestSeqRef.current

    setSummary((prev) => ({ ...prev, loading: true, error: '' }))

    getStoreSummary(storeId, appliedDates)
      .then((data) => {
        // Discard stale in-flight response if store or date changed
        if (requestSeqRef.current !== currentSeq) return
        setSummary({ loading: false, data, error: '' })
        // Bridge real, backend-computed low-stock alerts (an admin-set
        // MaterialReorderSetting compared against the authoritative
        // receipt/issue balance - see apps.stores.StoreSummaryView) into
        // the real notification bell. Safe to call on every refresh:
        // addNotification replaces the row by its stable id, but "read"
        // status is tracked separately by id in NotificationCenter, so
        // this never un-reads an alert the user already dismissed.
        for (const alert of data.alerts?.items || []) {
          if (alert.type !== 'LOW_STOCK') continue
          addNotification({
            id: alert.id,
            type: 'inventory',
            title: alert.severity === 'critical' ? 'Stock shortage' : 'Low stock alert',
            message: alert.message,
            path: '/inventory/materials',
            userId: user?.id,
            workspace: activeWorkspace,
          })
        }
      })
      .catch((err) => {
        if (requestSeqRef.current !== currentSeq) return
        setSummary({ loading: false, data: null, error: getErrorMessage(err) })
      })
  }

  useEffect(() => {
    fetchData()
  }, [storeId, appliedDates.dateFrom, appliedDates.dateTo])

  // Permissions check
  const userPermissions = summary.data?.user_permissions || []
  const isSuperuser = user?.is_superuser === true || user?.profile?.role === 'SUPER_ADMIN'

  const canAddMaterial = isSuperuser || user?.capabilities?.can_manage_material_catalog === true
  const canReceiveInward = isSuperuser || userPermissions.includes('receiving.create')
  const canIssueMaterial = isSuperuser || userPermissions.includes('material_issues.create')
  const canViewLedger = isSuperuser || userPermissions.includes('stock.view')

  if (summary.loading && !summary.data) {
    return (
      <div className="ci-container" style={{ padding: '60px 20px', textAlign: 'center' }}>
        <LoadingState label="Loading Common Inventory Dashboard..." />
      </div>
    )
  }

  if (summary.error && !summary.data) {
    return (
      <div className="ci-container" style={{ padding: '24px' }}>
        <Alert type="error">{summary.error}</Alert>
        <div style={{ marginTop: 16 }}>
          <Button variant="secondary" onClick={fetchData}>
            Retry Request
          </Button>
        </div>
      </div>
    )
  }

  const data = summary.data || {}
  const materials = data.materials || {}
  const receipts = data.receipts || {}
  const issues = data.issues || {}
  const requisitions = data.requisitions || {}
  const ledger = data.ledger || {}
  const balances = ledger.balances || []
  const pendingWork = data.pending_work?.items || []
  const recentActivity = data.recent_activity?.items || []
  const alerts = data.alerts?.items || []
  const accessibleCompanies = data.coverage?.accessible_companies || []
  const businessTz = data.business_time_zone || 'Asia/Kolkata'

  return (
    <div className="ci-container">
      {actionSuccessNotice && (
        <Alert type="success" onClose={() => setActionSuccessNotice('')}>
          {actionSuccessNotice}
        </Alert>
      )}

      {summary.error && <Alert type="error">{summary.error}</Alert>}

      {/* 2. FILTER TOOLBAR: DATE PRESETS & TIMEZONE */}
      <div
        className="inv-filters-bar"
        style={{
          background: '#ffffff',
          padding: '14px 18px',
          borderRadius: 12,
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
            Period:
          </span>
          <button
            type="button"
            className={`ci-row-btn ${datePreset === 'all' ? 'active' : ''}`}
            style={{ background: datePreset === 'all' ? '#2563eb' : '#fff', color: datePreset === 'all' ? '#fff' : '#475569' }}
            onClick={() => applyPreset('all')}
          >
            All Time
          </button>
          <button
            type="button"
            className={`ci-row-btn ${datePreset === 'today' ? 'active' : ''}`}
            style={{ background: datePreset === 'today' ? '#2563eb' : '#fff', color: datePreset === 'today' ? '#fff' : '#475569' }}
            onClick={() => applyPreset('today')}
          >
            Today
          </button>
          <button
            type="button"
            className={`ci-row-btn ${datePreset === 'this-week' ? 'active' : ''}`}
            style={{ background: datePreset === 'this-week' ? '#2563eb' : '#fff', color: datePreset === 'this-week' ? '#fff' : '#475569' }}
            onClick={() => applyPreset('this-week')}
          >
            This Week
          </button>
          <button
            type="button"
            className={`ci-row-btn ${datePreset === 'this-month' ? 'active' : ''}`}
            style={{ background: datePreset === 'this-month' ? '#2563eb' : '#fff', color: datePreset === 'this-month' ? '#fff' : '#475569' }}
            onClick={() => applyPreset('this-month')}
          >
            This Month
          </button>
          <button
            type="button"
            className={`ci-row-btn ${datePreset === 'custom' ? 'active' : ''}`}
            style={{ background: datePreset === 'custom' ? '#2563eb' : '#fff', color: datePreset === 'custom' ? '#fff' : '#475569' }}
            onClick={() => applyPreset('custom')}
          >
            Custom Range
          </button>

          {datePreset === 'custom' && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
              <input
                type="date"
                className="company-input"
                style={{ height: 32, minHeight: 32, padding: '0 8px', fontSize: 12 }}
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                placeholder="From"
              />
              <span style={{ fontSize: 12, color: '#64748b' }}>to</span>
              <input
                type="date"
                className="company-input"
                style={{ height: 32, minHeight: 32, padding: '0 8px', fontSize: 12 }}
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                placeholder="To"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={applyCustomDates}
                style={{ padding: '4px 10px', fontSize: 11, height: 32 }}
              >
                Apply
              </Button>
            </div>
          )}
        </div>

        <div style={{ fontSize: 11, color: '#64748b' }}>
          <span>Business Timezone: <strong>{businessTz}</strong> &bull; Cutoff Balances Active</span>
        </div>
      </div>

      {/* 3. SUMMARY CARDS (6 CARDS) */}
      <div className="ci-summary-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        {/* Card A: Active Materials */}
        <Link
          to="/inventory/materials"
          className="ci-card"
          style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}
          title="Open Materials Catalog"
        >
          <div className="ci-card-icon" style={{ background: '#f0fdf4', color: '#16a34a' }}>
            🧪
          </div>
          <div className="ci-card-info">
            <span className="ci-card-label">Active Materials</span>
            <span className="ci-card-value">{materials.total_active ?? 0}</span>
            <span className="ci-card-subtext">
              {materials.raw_materials ?? 0} Raw &middot; {materials.packaging_materials ?? 0} Packaging{materials.mother_tinctures ? ` \u00b7 ${materials.mother_tinctures} Mother Tincture` : ''}
            </span>
            <span style={{ fontSize: 10, color: '#16a34a', marginTop: 3 }}>Global Catalog &rarr;</span>
          </div>
        </Link>

        {/* Card B: Receipt Drafts */}
        <Link
          to="/inventory/stock"
          className="ci-card"
          style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}
          title="Open Goods Receipts in Stock tab"
        >
          <div className="ci-card-icon" style={{ background: '#eff6ff', color: '#2563eb' }}>
            📥
          </div>
          <div className="ci-card-info">
            <span className="ci-card-label">Receipt Drafts</span>
            <span className="ci-card-value">{receipts.draft ?? 0}</span>
            <span className="ci-card-subtext">
              {receipts.posted ?? 0} Posted to store
            </span>
            <span style={{ fontSize: 10, color: '#2563eb', marginTop: 3 }}>Unposted Inwards &rarr;</span>
          </div>
        </Link>

        {/* Card C: Pending Material Requests */}
        <Link
          to="/inventory/orders"
          className="ci-card"
          style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}
          title="Open Material Requisitions in Orders tab"
        >
          <div className="ci-card-icon" style={{ background: '#fefce8', color: '#ca8a04' }}>
            📋
          </div>
          <div className="ci-card-info">
            <span className="ci-card-label">Pending Requests</span>
            <span className="ci-card-value">
              {requisitions.total_pending ?? ((requisitions.submitted || 0) + (requisitions.approved || 0))}
            </span>
            <span className="ci-card-subtext">
              {requisitions.submitted ?? 0} Submitted &middot; {requisitions.approved ?? 0} Approved
            </span>
            <span style={{ fontSize: 10, color: '#ca8a04', marginTop: 3 }}>Awaiting Action &rarr;</span>
          </div>
        </Link>

        {/* Card D: Issue Drafts */}
        <Link
          to="/inventory/issue-return"
          className="ci-card"
          style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}
          title="Open Material Issues in Issue / Return tab"
        >
          <div className="ci-card-icon" style={{ background: '#faf5ff', color: '#9333ea' }}>
            📤
          </div>
          <div className="ci-card-info">
            <span className="ci-card-label">Issue Drafts</span>
            <span className="ci-card-value">{issues.draft ?? 0}</span>
            <span className="ci-card-subtext">
              {issues.posted ?? 0} Posted issues
            </span>
            <span style={{ fontSize: 10, color: '#9333ea', marginTop: 3 }}>Unposted Issues &rarr;</span>
          </div>
        </Link>

        {/* Card E: Low Stock Materials (Unavailable / Not Configured) */}
        <div
          className="ci-card"
          style={{ cursor: 'pointer', background: '#fafaf9', borderStyle: 'dashed' }}
          onClick={() =>
            setUnsupportedModal({
              title: 'Low Stock Tracking Not Configured',
              message:
                'The shared chemical catalog does not define synthetic unit costs, purchase prices, or reorder levels. Reorder thresholds must be explicitly configured in the catalog before low stock warnings can be calculated honestly.',
            })
          }
          title="Click for configuration details"
        >
          <div className="ci-card-icon" style={{ background: '#f5f5f4', color: '#78716c' }}>
            ⚠️
          </div>
          <div className="ci-card-info">
            <span className="ci-card-label">Low Stock</span>
            <span className="ci-card-value" style={{ fontSize: 14, color: '#78716c', marginTop: 6 }}>
              Not configured
            </span>
            <span className="ci-card-subtext">No reorder thresholds</span>
            <span style={{ fontSize: 10, color: '#78716c', marginTop: 3 }}>View details &rarr;</span>
          </div>
        </div>

        {/* Card F: Held / Rejected Lots (Unavailable) */}
        <div
          className="ci-card"
          style={{ cursor: 'pointer', background: '#fafaf9', borderStyle: 'dashed' }}
          onClick={() =>
            setUnsupportedModal({
              title: 'Quality Disposition Not Supported',
              message:
                'Authoritative quality disposition (pass, reject, release, or quarantine holds) is not supported in the current incoming QC lifecycle. Inward inspection records observations only and does not establish physical lot release.',
            })
          }
          title="Click for quality disposition status"
        >
          <div className="ci-card-icon" style={{ background: '#f5f5f4', color: '#78716c' }}>
            🛡️
          </div>
          <div className="ci-card-info">
            <span className="ci-card-label">Held / Rejected</span>
            <span className="ci-card-value" style={{ fontSize: 14, color: '#78716c', marginTop: 6 }}>
              Unavailable
            </span>
            <span className="ci-card-subtext">QC disposition inactive</span>
            <span style={{ fontSize: 10, color: '#78716c', marginTop: 3 }}>View details &rarr;</span>
          </div>
        </div>
      </div>

      {/* 4. QUICK ACTIONS HUB */}
      <div className="ci-dash-card" style={{ padding: '18px 22px' }}>
        <div className="ci-dash-card-header" style={{ paddingBottom: 10, borderBottom: '1px solid #f1f5f9' }}>
          <div>
            <h3 style={{ fontSize: 15 }}>Operational Quick Actions</h3>
            <p>Direct shortcuts with store pre-fill and live permission gating</p>
          </div>
          <span style={{ fontSize: 11, color: '#64748b' }}>Authorized Operations Only</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          {/* Add Material */}
          <button
            type="button"
            className="ci-quick-link"
            style={{
              textAlign: 'left',
              cursor: canAddMaterial ? 'pointer' : 'not-allowed',
              opacity: canAddMaterial ? 1 : 0.6,
              background: canAddMaterial ? '#f8fafc' : '#f1f5f9',
            }}
            disabled={!canAddMaterial}
            onClick={() => setShowAddMaterial(true)}
            title={canAddMaterial ? 'Add Material to catalog' : 'Requires can_manage_material_catalog capability'}
          >
            <div>
              <div style={{ fontWeight: 700 }}>🧪 Add Material</div>
              <span style={{ fontSize: 11, color: '#64748b' }}>
                {canAddMaterial ? 'Create catalog entry' : 'Permission required'}
              </span>
            </div>
            <span>&rarr;</span>
          </button>

          {/* Receive Inward */}
          <button
            type="button"
            className="ci-quick-link"
            style={{
              textAlign: 'left',
              cursor: canReceiveInward ? 'pointer' : 'not-allowed',
              opacity: canReceiveInward ? 1 : 0.6,
              background: canReceiveInward ? '#f8fafc' : '#f1f5f9',
            }}
            disabled={!canReceiveInward}
            onClick={() => setShowInwardModal(true)}
            title={canReceiveInward ? 'Record PO Goods Receipt' : 'Requires receiving.create permission in this store'}
          >
            <div>
              <div style={{ fontWeight: 700 }}>📥 Receive Inward</div>
              <span style={{ fontSize: 11, color: '#64748b' }}>
                {canReceiveInward ? 'PO Goods Receipt' : 'Permission required'}
              </span>
            </div>
            <span>&rarr;</span>
          </button>

          {/* Issue Material */}
          <button
            type="button"
            className="ci-quick-link"
            style={{
              textAlign: 'left',
              cursor: canIssueMaterial ? 'pointer' : 'not-allowed',
              opacity: canIssueMaterial ? 1 : 0.6,
              background: canIssueMaterial ? '#f8fafc' : '#f1f5f9',
            }}
            disabled={!canIssueMaterial}
            onClick={() => setShowIssueModal(true)}
            title={canIssueMaterial ? 'Issue stock outward' : 'Requires material_issues.create permission in this store'}
          >
            <div>
              <div style={{ fontWeight: 700 }}>📤 Issue Material</div>
              <span style={{ fontSize: 11, color: '#64748b' }}>
                {canIssueMaterial ? 'Outward to batch' : 'Permission required'}
              </span>
            </div>
            <span>&rarr;</span>
          </button>

          {/* Open Material Register */}
          <button
            type="button"
            className="ci-quick-link"
            style={{
              textAlign: 'left',
              cursor: canViewLedger ? 'pointer' : 'not-allowed',
              opacity: canViewLedger ? 1 : 0.6,
              background: canViewLedger ? '#f8fafc' : '#f1f5f9',
            }}
            disabled={!canViewLedger}
            onClick={() => navigate('/inventory/materials')}
            title={canViewLedger ? 'View Material Master & Registers' : 'Requires stock.view permission in this store'}
          >
            <div>
              <div style={{ fontWeight: 700 }}>📑 Material Register</div>
              <span style={{ fontSize: 11, color: '#64748b' }}>
                {canViewLedger ? 'Material catalog & registers' : 'Permission required'}
              </span>
            </div>
            <span>&rarr;</span>
          </button>
        </div>
      </div>

      {/* 5. PENDING WORK TABLE */}
      <div className="ci-dash-card">
        <div className="ci-dash-card-header">
          <div>
            <h3>Pending Work ({pendingWork.length})</h3>
            <p>Action-pending drafts and requests requiring review, approval, or posting</p>
          </div>
          <span style={{ fontSize: 11, color: '#64748b' }}>
            Scope: All active unposted documents
          </span>
        </div>

        {pendingWork.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: 13 }}>
            No pending draft receipts, issue drafts, or unfulfilled requests for this store.
          </div>
        ) : (
          <div className="ci-table-wrapper" style={{ maxHeight: '360px', minHeight: 'auto' }}>
            <table className="ci-table">
              <thead>
                <tr>
                  <th>Document Type</th>
                  <th>Reference</th>
                  <th>Company</th>
                  <th>Line Count</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {pendingWork.map((item, idx) => (
                  <tr key={`${item.type_code}-${item.id}-${idx}`}>
                    <td>
                      <span
                        className="ci-badge"
                        style={{
                          background:
                            item.type_code === 'RECEIPT'
                              ? '#eff6ff'
                              : item.type_code === 'ISSUE'
                              ? '#faf5ff'
                              : '#fefce8',
                          color:
                            item.type_code === 'RECEIPT'
                              ? '#1d4ed8'
                              : item.type_code === 'ISSUE'
                              ? '#7e22ce'
                              : '#854d0e',
                        }}
                      >
                        {item.document_type}
                      </span>
                    </td>
                    <td>
                      <span className="ci-code">{item.reference}</span>
                    </td>
                    <td>
                      <span style={{ fontWeight: 600 }}>{item.company_code}</span>
                    </td>
                    <td>{item.line_count} line{item.line_count === 1 ? '' : 's'}</td>
                    <td>{item.date}</td>
                    <td>
                      <span
                        className="ci-badge"
                        style={{
                          background: item.status === 'DRAFT' ? '#f1f5f9' : item.status === 'SUBMITTED' ? '#dbeafe' : '#dcfce7',
                          color: item.status === 'DRAFT' ? '#475569' : item.status === 'SUBMITTED' ? '#1e40af' : '#15803d',
                        }}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {item.type_code === 'RECEIPT' && (
                        <Link to="/inventory/stock" className="ci-row-link">
                          Review &amp; Post &rarr;
                        </Link>
                      )}
                      {item.type_code === 'ISSUE' && (
                        <Link to="/inventory/issue-return" className="ci-row-link">
                          Review &amp; Post &rarr;
                        </Link>
                      )}
                      {item.type_code === 'REQUISITION' && (
                        <Link to="/inventory/orders" className="ci-row-link">
                          {item.action} &rarr;
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 6. RECENT STOCK ACTIVITY (LAST 10 MOVEMENTS) */}
      <div className="ci-dash-card">
        <div className="ci-dash-card-header">
          <div>
            <h3>Recent Stock Activity (Posted Movements)</h3>
            <p>Merged chronological audit log of inward receipts and outward issues</p>
          </div>
          <Link to="/inventory/stock" className="ci-row-link" style={{ padding: '6px 12px' }}>
            View All in Stock &amp; Lots &rarr;
          </Link>
        </div>

        {recentActivity.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: 13 }}>
            No posted stock movements recorded for the selected store/period.
          </div>
        ) : (
          <div className="ci-table-wrapper" style={{ maxHeight: '380px', minHeight: 'auto' }}>
            <table className="ci-table">
              <thead>
                <tr>
                  <th>Date &amp; Time</th>
                  <th>Material Code &amp; Name</th>
                  <th>Movement</th>
                  <th>Quantity &amp; Unit</th>
                  <th>Company / Batch</th>
                  <th>Reference</th>
                  <th style={{ textAlign: 'right' }}>View</th>
                </tr>
              </thead>
              <tbody>
                {recentActivity.map((m) => (
                  <tr key={m.id}>
                    <td style={{ fontSize: 12, color: '#64748b' }}>
                      {new Date(m.posted_at).toLocaleString()}
                    </td>
                    <td>
                      <div>
                        <span className="ci-code">{m.material_code}</span>
                        <div style={{ fontSize: 11, color: '#64748b' }}>{m.material_name}</div>
                      </div>
                    </td>
                    <td>
                      <span
                        className="ci-badge"
                        style={{
                          background: m.movement_type === 'RECEIPT_IN' ? '#dcfce7' : '#ffedd5',
                          color: m.movement_type === 'RECEIPT_IN' ? '#15803d' : '#c2410c',
                        }}
                      >
                        {m.movement_type === 'RECEIPT_IN' ? '+ Inward Receipt' : '- Outward Issue'}
                      </span>
                    </td>
                    <td style={{ fontWeight: 700 }}>
                      {m.quantity} {m.unit_code}
                    </td>
                    <td>
                      <span>{m.source_company_code}</span>
                      {m.batch_lot && (
                        <div style={{ fontSize: 11, color: '#64748b' }}>Batch: {m.batch_lot}</div>
                      )}
                    </td>
                    <td>
                      <span className="ci-code">{m.reference}</span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Link
                        to={`/inventory/materials/${m.material_id}`}
                        className="ci-row-link"
                        title="Open material register"
                      >
                        Register &rarr;
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 7. OPERATIONAL ALERTS & COVERAGE */}
      <div className="ci-dash-grid">
        {/* Alerts panel */}
        <div className="ci-dash-card">
          <div className="ci-dash-card-header">
            <div>
              <h3>Operational Alerts</h3>
              <p>Supported system alerts and active operational notices</p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {alerts.length > 0 ? (
              alerts.map((alert) => (
                <div
                  key={alert.id}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 8,
                    fontSize: 12,
                    background: alert.severity === 'warning' ? '#fefce8' : '#eff6ff',
                    border: `1px solid ${alert.severity === 'warning' ? '#fef08a' : '#bfdbfe'}`,
                    color: alert.severity === 'warning' ? '#854d0e' : '#1e40af',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <span>{alert.severity === 'warning' ? '⚠️' : 'ℹ️'}</span>
                  <div>{alert.message}</div>
                </div>
              ))
            ) : (
              <div style={{ fontSize: 12, color: '#15803d', padding: '10px 12px', background: '#f0fdf4', borderRadius: 8 }}>
                ✓ All pending drafts and requisitions are clear.
              </div>
            )}

            {/* Clearly disclose unconfigured alerts */}
            <div
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                fontSize: 11,
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                color: '#64748b',
                lineHeight: 1.5,
              }}
            >
              <strong>Disclosed Alert Scope:</strong>
              <div style={{ marginTop: 4 }}>
                &bull; Low/reorder stock: <em>Not configured (no reorder thresholds configured on catalog).</em>
              </div>
              <div>
                &bull; Approaching expiry: <em>Not configured (no expiry thresholds configured).</em>
              </div>
              <div>
                &bull; Held/rejected lots: <em>Unavailable (authoritative QC disposition not supported).</em>
              </div>
            </div>
          </div>
        </div>

        {/* Operating Company Scope */}
        <div className="ci-dash-card">
          <div className="ci-dash-card-header">
            <div>
              <h3>Authorized Operating Scope</h3>
              <p>Company PO &amp; Receipt access permissions assigned to caller</p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 12, color: '#334155', lineHeight: 1.6 }}>
              Dashboard summaries and stock balances strictly reflect the operating companies where your user account holds active view permissions:
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {accessibleCompanies.length > 0 ? (
                accessibleCompanies.map((c) => (
                  <span
                    key={c.id}
                    className="stock-badge stock-badge-available"
                    style={{ fontSize: 12, padding: '4px 10px' }}
                  >
                    {c.code} &mdash; {c.name}
                  </span>
                ))
              ) : (
                <div style={{ fontSize: 12, color: '#b91c1c' }}>
                  No company purchase order view permissions assigned.
                </div>
              )}
            </div>

            <div style={{ padding: '10px', background: '#f8fafc', borderRadius: 8, fontSize: 11, color: '#64748b' }}>
              * Shared store space is joint, but company ownership is never merged. Quantities are grouped strictly by source company.
            </div>
          </div>
        </div>
      </div>

      {/* 8. STOCK OVERVIEW TABLE (COMPACT TABLE OF CLOSING BALANCES) */}
      <div className="ci-dash-card">
        <div className="ci-dash-card-header">
          <div>
            <h3>Current Stock Overview (Closing Book Balances)</h3>
            <p>Authoritative ledger balances as of the selected end-date cutoff</p>
          </div>
          <Link to="/inventory/stock" className="ci-row-link" style={{ padding: '6px 12px' }}>
            View All in Stock &amp; Lots &rarr;
          </Link>
        </div>

        {balances.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: 13 }}>
            No recorded stock balances found for this store.
          </div>
        ) : (
          <div className="ci-table-wrapper" style={{ maxHeight: '360px', minHeight: 'auto' }}>
            <table className="ci-table">
              <thead>
                <tr>
                  <th>Material Code</th>
                  <th>Material Name</th>
                  <th>Base Unit</th>
                  <th>Closing Book Quantity</th>
                  <th>Company</th>
                  <th style={{ textAlign: 'right' }}>View Register</th>
                </tr>
              </thead>
              <tbody>
                {balances.map((b, idx) => (
                  <tr key={`${b.material_id}-${b.unit_id}-${b.source_company_id}-${idx}`}>
                    <td>
                      <span className="ci-code">{b.material_code}</span>
                    </td>
                    <td>{b.material_name}</td>
                    <td>{b.unit_code}</td>
                    <td>
                      <span style={{ fontWeight: 700, color: Number(b.closing_book_quantity) > 0 ? '#15803d' : '#475569' }}>
                        {b.closing_book_quantity} {b.unit_code}
                      </span>
                    </td>
                    <td>
                      <span className="ci-badge" style={{ background: '#f1f5f9', color: '#334155' }}>
                        {b.source_company_code}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Link
                        to={`/inventory/materials/${b.material_id}`}
                        className="ci-row-link"
                        title="Open full register"
                      >
                        Register &rarr;
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Filter Semantics UI Note */}
      <div style={{ padding: '12px 16px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 11, color: '#64748b' }}>
        <strong>Filter Semantics:</strong> Date range filters activity and movements consistently. Stock balances reflect the closing book quantity as of the selected end-date cutoff, including prior history. Pending work cards reflect all currently active open documents requiring operational action.
      </div>

      {/* MODAL 1: Add Material Modal */}
      {showAddMaterial && (
        <MaterialModal
          mode="create"
          onClose={() => setShowAddMaterial(false)}
          onSaved={(msg) => {
            setShowAddMaterial(false)
            setActionSuccessNotice(msg)
            fetchData()
          }}
        />
      )}

      {/* MODAL 2: Receive Inward Modal */}
      {showInwardModal && (
        <InwardStockModal
          storeId={storeId}
          onClose={() => setShowInwardModal(false)}
          onCreated={(gr) => {
            setShowInwardModal(false)
            setActionSuccessNotice(`Goods receipt draft ${gr.reference} created.`)
            fetchData()
          }}
          onPosted={(gr) => {
            setShowInwardModal(false)
            setActionSuccessNotice(`Goods receipt ${gr.reference} posted successfully.`)
            fetchData()
          }}
        />
      )}

      {/* MODAL 3: Issue Outward Modal */}
      {showIssueModal && (
        <IssueOutwardModal
          storeId={storeId}
          onClose={() => setShowIssueModal(false)}
          onIssued={(issue) => {
            setShowIssueModal(false)
            setActionSuccessNotice(`Material issue draft ${issue.reference} created.`)
            fetchData()
          }}
          onPosted={(issue) => {
            setShowIssueModal(false)
            setActionSuccessNotice(`Material issue ${issue.reference} posted successfully.`)
            fetchData()
          }}
        />
      )}

      {/* MODAL 4: Unsupported Feature Notice */}
      {unsupportedModal && (
        <Modal
          title={unsupportedModal.title}
          onClose={() => setUnsupportedModal(null)}
          maxWidth="500px"
          footer={
            <Button variant="secondary" onClick={() => setUnsupportedModal(null)}>
              Close
            </Button>
          }
        >
          <div style={{ fontSize: 13, lineHeight: 1.6, color: '#334155' }}>
            <p style={{ marginTop: 0 }}>{unsupportedModal.message}</p>
          </div>
        </Modal>
      )}
    </div>
  )
}