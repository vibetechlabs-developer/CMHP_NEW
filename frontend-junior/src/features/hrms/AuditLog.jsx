import { useEffect, useMemo, useState } from 'react'
import { useSelector } from 'react-redux'
import { getAuditRows } from '../../utils/audit'
import { selectActiveCompanyId } from '../../utils/companySelectors'
import useAuth from '../../hooks/useAuth'
import Button from '../../components/Button'
import PageHeader from '../../components/PageHeader'
import Modal from '../inventory/components/Modal'
import { downloadCsv } from './hrUtils'
import { formatDateTimeIN } from '../../utils/formatters'
import './Hrms.css'

const MODULE_OPTIONS = [
  'ALL',
  'HRMS',
  'CUSTOMERS',
  'PRODUCTS',
  'ORDERS',
  'QC',
  'QA',
  'INVOICE',
  'PAYMENTS',
  'SETTINGS',
  'SYSTEM',
]

const ACTION_OPTIONS = [
  'ALL',
  'CREATE',
  'UPDATE',
  'DELETE',
  'APPROVE',
  'REJECT',
  'STATUS_CHANGE',
  'PAYMENT',
  'PRINT',
  'EXPORT',
]

export default function AuditLog() {
  const { user } = useAuth()
  const activeCompanyId = useSelector(selectActiveCompanyId)
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [userFilter, setUserFilter] = useState('ALL')
  const [moduleFilter, setModuleFilter] = useState('ALL')
  const [actionFilter, setActionFilter] = useState('ALL')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selectedLog, setSelectedLog] = useState(null)
  const [page, setPage] = useState(1)
  const pageSize = 15

  const load = () => {
    setLoading(true)
    try {
      const rows = getAuditRows(activeCompanyId)
      setLogs(Array.isArray(rows) ? rows : [])
    } finally {
      setTimeout(() => setLoading(false), 200)
    }
  }

  useEffect(() => {
    load()
  }, [activeCompanyId])

  // Extract unique users for user filter
  const userOptions = useMemo(() => {
    const set = new Set()
    logs.forEach((l) => {
      const name = l.user?.username || l.user?.name || l.user
      if (name) set.add(String(name).trim())
    })
    return Array.from(set).sort()
  }, [logs])

  // Filtered & Sorted logs
  const filteredLogs = useMemo(() => {
    return logs
      .filter((log) => {
        if (moduleFilter !== 'ALL' && String(log.module || '').toUpperCase() !== moduleFilter) {
          return false
        }
        if (actionFilter !== 'ALL' && String(log.action || '').toUpperCase() !== actionFilter) {
          return false
        }
        if (userFilter !== 'ALL') {
          const userName = String(log.user?.username || log.user?.name || log.user || '').trim()
          if (userName !== userFilter) return false
        }
        if (dateFrom && (log.timestamp || log.created_at || '').slice(0, 10) < dateFrom) {
          return false
        }
        if (dateTo && (log.timestamp || log.created_at || '').slice(0, 10) > dateTo) {
          return false
        }
        if (search.trim()) {
          const q = search.toLowerCase()
          const text = [
            log.id,
            log.entity_id,
            log.entity_type,
            log.action,
            log.description,
            log.remarks,
            log.user?.username || log.user?.name || log.user,
            log.ip,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
          if (!text.includes(q)) return false
        }
        return true
      })
      .sort((a, b) => {
        const timeA = new Date(a.timestamp || a.created_at || 0).getTime()
        const timeB = new Date(b.timestamp || b.created_at || 0).getTime()
        return timeB - timeA
      })
  }, [logs, moduleFilter, actionFilter, userFilter, dateFrom, dateTo, search])

  const totalPages = Math.max(Math.ceil(filteredLogs.length / pageSize), 1)
  const paginatedLogs = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredLogs.slice(start, start + pageSize)
  }, [filteredLogs, page, pageSize])

  // KPI Metrics
  const kpiStats = useMemo(() => {
    const total = logs.length
    const createsAndApprovals = logs.filter((l) => {
      const act = String(l.action || '').toUpperCase()
      return act.includes('CREATE') || act.includes('APPROVE')
    }).length
    const updates = logs.filter((l) => {
      const act = String(l.action || '').toUpperCase()
      return act.includes('UPDATE') || act.includes('STATUS') || act.includes('PAYMENT')
    }).length
    const criticalDeletes = logs.filter((l) => {
      const act = String(l.action || '').toUpperCase()
      return act.includes('DELETE') || act.includes('REJECT')
    }).length
    return { total, createsAndApprovals, updates, criticalDeletes }
  }, [logs])

  const hasActiveFilters = Boolean(
    search ||
    userFilter !== 'ALL' ||
    moduleFilter !== 'ALL' ||
    actionFilter !== 'ALL' ||
    dateFrom ||
    dateTo
  )

  const resetFilters = () => {
    setSearch('')
    setUserFilter('ALL')
    setModuleFilter('ALL')
    setActionFilter('ALL')
    setDateFrom('')
    setDateTo('')
    setPage(1)
  }

  const exportAuditCsv = () => {
    downloadCsv(
      `central-audit-log-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        { key: 'id', label: 'Audit ID' },
        {
          key: 'timestamp',
          label: 'Date & Time (IST)',
          csv: (l) => formatDateTimeIN(l.timestamp || l.created_at),
        },
        { key: 'module', label: 'Module' },
        { key: 'entity_type', label: 'Entity Type' },
        { key: 'entity_id', label: 'Reference / ID' },
        { key: 'action', label: 'Action' },
        {
          key: 'user',
          label: 'User',
          csv: (l) => l.user?.username || l.user?.name || l.user || 'System',
        },
        {
          key: 'role',
          label: 'Role',
          csv: (l) => l.user?.role || l.actor_role || 'Staff',
        },
        { key: 'description', label: 'Description' },
        { key: 'remarks', label: 'Remarks / Reason' },
        { key: 'result', label: 'Result', csv: (l) => l.result || 'SUCCESS' },
        { key: 'ip', label: 'IP Address' },
        { key: 'browser', label: 'Browser / Device' },
      ],
      filteredLogs
    )
  }

  const getActionBadgeClass = (action) => {
    const act = String(action || '').toUpperCase()
    if (act.includes('DELETE') || act.includes('REJECT')) return 'hr-badge inactive'
    if (act.includes('CREATE') || act.includes('APPROVE')) return 'hr-badge active'
    if (act.includes('UPDATE') || act.includes('STATUS')) return 'hr-badge pending'
    return 'hr-badge neutral'
  }

  return (
    <div className="hr-page">
      <PageHeader
        breadcrumbs={[
          { label: 'HRMS', to: '/hrms' },
          { label: 'Audit Logs' },
        ]}
        title="Central Audit Log"
        subtitle="Immutable, append-only traceability log recording every creation, update, approval, status transition, payment, and deletion across all ERP modules."
        secondaryAction={{
          label: '↻ Refresh',
          onClick: load,
        }}
        primaryAction={{
          label: 'Export CSV',
          onClick: exportAuditCsv,
          disabled: filteredLogs.length === 0,
        }}
      />

      {/* KPI METRIC CARDS */}
      <div className="hr-kpis-grid" style={{ marginBottom: 20 }}>
        <div className="hr-kpi-link">
          <div className="hr-kpi-head">
            <span className="hr-kpi-title">Total Audit Events</span>
            <span style={{ fontSize: 18 }}>📋</span>
          </div>
          <div className="hr-kpi-val">{kpiStats.total}</div>
          <div className="hr-kpi-sub">Traceable ledger records</div>
        </div>

        <div className="hr-kpi-link">
          <div className="hr-kpi-head">
            <span className="hr-kpi-title">Creates &amp; Approvals</span>
            <span style={{ fontSize: 18 }}>✅</span>
          </div>
          <div className="hr-kpi-val" style={{ color: '#16a34a' }}>
            {kpiStats.createsAndApprovals}
          </div>
          <div className="hr-kpi-sub">System records initialized</div>
        </div>

        <div className="hr-kpi-link">
          <div className="hr-kpi-head">
            <span className="hr-kpi-title">Modifications &amp; Updates</span>
            <span style={{ fontSize: 18 }}>🔄</span>
          </div>
          <div className="hr-kpi-val" style={{ color: '#d97706' }}>
            {kpiStats.updates}
          </div>
          <div className="hr-kpi-sub">Entity state changes</div>
        </div>

        <div className="hr-kpi-link">
          <div className="hr-kpi-head">
            <span className="hr-kpi-title">Critical &amp; Deletions</span>
            <span style={{ fontSize: 18 }}>🛡️</span>
          </div>
          <div className="hr-kpi-val" style={{ color: kpiStats.criticalDeletes > 0 ? '#dc2626' : '#64748b' }}>
            {kpiStats.criticalDeletes}
          </div>
          <div className="hr-kpi-sub">Deletions &amp; rejections logged</div>
        </div>
      </div>

      {/* TOOLBAR & FILTERS */}
      <div className="hr-toolbar">
        <div className="hr-search-box">
          <input
            type="text"
            placeholder="Search by ID, User, Entity, or Action..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
          {search && (
            <button
              type="button"
              className="hr-clear-search"
              onClick={() => {
                setSearch('')
                setPage(1)
              }}
              title="Clear search"
            >
              ×
            </button>
          )}
        </div>

        <div className="hr-filter-item">
          <select
            value={userFilter}
            onChange={(e) => {
              setUserFilter(e.target.value)
              setPage(1)
            }}
          >
            <option value="ALL">All Users</option>
            {userOptions.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>

        <div className="hr-filter-item">
          <select
            value={moduleFilter}
            onChange={(e) => {
              setModuleFilter(e.target.value)
              setPage(1)
            }}
          >
            {MODULE_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m === 'ALL' ? 'All Modules' : m}
              </option>
            ))}
          </select>
        </div>

        <div className="hr-filter-item">
          <select
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value)
              setPage(1)
            }}
          >
            {ACTION_OPTIONS.map((a) => (
              <option key={a} value={a}>
                {a === 'ALL' ? 'All Actions' : a}
              </option>
            ))}
          </select>
        </div>

        <div className="hr-filter-item" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>From:</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value)
              setPage(1)
            }}
          />
        </div>

        <div className="hr-filter-item" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>To:</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value)
              setPage(1)
            }}
          />
        </div>

        {hasActiveFilters && (
          <div className="hr-toolbar-actions">
            <button
              type="button"
              className="hr-clear-filters-btn"
              onClick={resetFilters}
            >
              Clear filters
            </button>
          </div>
        )}
      </div>

      {/* TABLE CARD */}
      <div className="hr-table-card">
        <div className="hr-card-header" style={{ padding: '16px 20px', margin: 0 }}>
          <div>
            <h3 className="hr-card-title">Audit Trail Records</h3>
            <p className="hr-card-sub">
              Showing {filteredLogs.length} audit event{filteredLogs.length === 1 ? '' : 's'} &middot; Append-only compliance guarantee
            </p>
          </div>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: '3px 8px',
              borderRadius: 6,
              background: '#f1f5f9',
              color: '#475569',
            }}
          >
            🔒 Tamper-Proof
          </span>
        </div>

        <div className="hr-table-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th style={{ minWidth: 170 }}>Date &amp; Time (IST)</th>
                <th style={{ minWidth: 160 }}>User / Role</th>
                <th style={{ minWidth: 110 }}>Module</th>
                <th style={{ minWidth: 130 }}>Action</th>
                <th style={{ minWidth: 160 }}>Entity / Ref</th>
                <th style={{ minWidth: 260 }}>Description</th>
                <th style={{ minWidth: 150 }}>IP / Device</th>
                <th style={{ minWidth: 110, textAlign: 'right' }}>Details</th>
              </tr>
            </thead>

            <tbody>
              {loading && (
                <tr>
                  <td colSpan="8" style={{ padding: 0 }}>
                    <div className="hr-skeleton-loader">
                      <div className="hr-skeleton-row" style={{ width: '100%' }} />
                      <div className="hr-skeleton-row" style={{ width: '92%' }} />
                      <div className="hr-skeleton-row" style={{ width: '96%' }} />
                    </div>
                  </td>
                </tr>
              )}

              {!loading && paginatedLogs.length === 0 && (
                <tr>
                  <td colSpan="8">
                    <div className="hr-empty-state">
                      <div className="hr-empty-icon">📋</div>
                      <div className="hr-empty-title">No Audit Records Found</div>
                      <p className="hr-empty-desc">
                        {hasActiveFilters
                          ? 'No audit entries match the current filter criteria. Try clearing or expanding your search filters.'
                          : 'No audit records have been generated yet in the current company workspace.'}
                      </p>
                      {hasActiveFilters && (
                        <Button
                          variant="secondary"
                          style={{ marginTop: 14 }}
                          onClick={resetFilters}
                        >
                          Clear all filters
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              )}

              {!loading &&
                paginatedLogs.map((log) => {
                  const userName = log.user?.username || log.user?.name || log.user || 'System'
                  const userRole = log.user?.role || log.actor_role || 'Staff'
                  const actionUpper = String(log.action || '').toUpperCase()

                  return (
                    <tr key={log.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 13 }}>
                          {formatDateTimeIN(log.timestamp || log.created_at)}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                          ID: {log.id}
                        </div>
                      </td>

                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: '50%',
                              background: '#eff6ff',
                              color: '#1d4ed8',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 700,
                              fontSize: 12,
                              flexShrink: 0,
                            }}
                          >
                            {(userName?.[0] || 'U').toUpperCase()}
                          </div>
                          <div>
                            <strong style={{ color: '#0f172a', fontSize: 13 }}>
                              {userName}
                            </strong>
                            <div style={{ fontSize: 11, color: '#64748b' }}>
                              {userRole}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '3px 8px',
                            borderRadius: 6,
                            background: '#e0f2fe',
                            color: '#0369a1',
                            fontSize: 11,
                            fontWeight: 700,
                            border: '1px solid #bae6fd',
                          }}
                        >
                          {log.module || 'SYSTEM'}
                        </span>
                      </td>

                      <td>
                        <span className={getActionBadgeClass(actionUpper)}>
                          {log.action}
                        </span>
                      </td>

                      <td>
                        <strong style={{ color: '#0f172a', fontSize: 13 }}>
                          {log.entity_type}
                        </strong>
                        {log.entity_id && log.entity_id !== '—' && (
                          <div style={{ fontSize: 11, color: '#0284c7', marginTop: 2 }}>
                            Ref: {log.entity_id}
                          </div>
                        )}
                      </td>

                      <td style={{ maxWidth: 300, fontSize: 12.5 }}>
                        <div style={{ color: '#334155', lineHeight: 1.4 }}>
                          {log.description || '—'}
                        </div>
                        {log.remarks && (
                          <div
                            style={{
                              fontStyle: 'italic',
                              color: '#64748b',
                              marginTop: 3,
                              fontSize: 11.5,
                            }}
                          >
                            &ldquo;{log.remarks}&rdquo;
                          </div>
                        )}
                      </td>

                      <td style={{ fontSize: 11.5, color: '#64748b' }}>
                        <div style={{ fontFamily: 'monospace', color: '#334155' }}>
                          {log.ip || '127.0.0.1'}
                        </div>
                        <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 2 }}>
                          {log.browser || 'Web Client'}
                        </div>
                      </td>

                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          className="company-link"
                          onClick={() => setSelectedLog(log)}
                          style={{ padding: '4px 10px', fontSize: 12 }}
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>

        {/* PAGINATION */}
        <div className="hr-pagination">
          <div>
            Showing{' '}
            <strong>
              {filteredLogs.length === 0 ? 0 : (page - 1) * pageSize + 1}
            </strong>{' '}
            to{' '}
            <strong>
              {Math.min(page * pageSize, filteredLogs.length)}
            </strong>{' '}
            of <strong>{filteredLogs.length}</strong> record{filteredLogs.length === 1 ? '' : 's'}
          </div>

          {totalPages > 1 && (
            <div className="hr-pagination-btns">
              <button
                type="button"
                className="hr-page-btn"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
              >
                &larr; Prev
              </button>

              <span
                style={{
                  padding: '0 8px',
                  fontWeight: 600,
                  color: '#1e293b',
                  fontSize: 12,
                }}
              >
                Page {page} of {totalPages}
              </span>

              <button
                type="button"
                className="hr-page-btn"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
              >
                Next &rarr;
              </button>
            </div>
          )}
        </div>
      </div>

      {/* DETAIL DRAWER / MODAL */}
      {selectedLog && (
        <Modal
          isOpen={Boolean(selectedLog)}
          maxWidth={760}
          title={`Audit Record Details — ${selectedLog.id}`}
          onClose={() => setSelectedLog(null)}
          footer={
            <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
              <Button onClick={() => setSelectedLog(null)}>
                Close Record
              </Button>
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Header meta summary card */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: 14,
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 12,
                padding: '16px 18px',
              }}
            >
              <div>
                <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>
                  Timestamp (IST)
                </span>
                <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 13.5, marginTop: 3 }}>
                  {formatDateTimeIN(selectedLog.timestamp || selectedLog.created_at)}
                </div>
              </div>

              <div>
                <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>
                  Module &amp; Action
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <span
                    style={{
                      background: '#e0f2fe',
                      color: '#0369a1',
                      padding: '2px 7px',
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    {selectedLog.module}
                  </span>
                  <span className={getActionBadgeClass(selectedLog.action)}>
                    {selectedLog.action}
                  </span>
                </div>
              </div>

              <div>
                <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>
                  Target Entity
                </span>
                <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 13.5, marginTop: 3 }}>
                  {selectedLog.entity_type}{' '}
                  {selectedLog.entity_id && (
                    <span style={{ color: '#0284c7', fontSize: 12 }}>
                      ({selectedLog.entity_id})
                    </span>
                  )}
                </div>
              </div>

              <div>
                <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>
                  User &amp; Role
                </span>
                <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 13, marginTop: 3 }}>
                  {selectedLog.user?.username || selectedLog.user?.name || selectedLog.user || 'System'}{' '}
                  <span style={{ color: '#64748b', fontSize: 11.5 }}>
                    ({selectedLog.user?.role || selectedLog.actor_role || 'Staff'})
                  </span>
                </div>
              </div>

              <div>
                <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>
                  IP Address
                </span>
                <div style={{ fontFamily: 'monospace', color: '#334155', fontSize: 12.5, marginTop: 3 }}>
                  {selectedLog.ip || '127.0.0.1'}
                </div>
              </div>

              <div>
                <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>
                  Client Telemetry
                </span>
                <div style={{ color: '#475569', fontSize: 12, marginTop: 3 }}>
                  {selectedLog.browser || 'Web Client'}
                </div>
              </div>
            </div>

            {/* Description & remarks card */}
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 12,
                padding: '16px 18px',
              }}
            >
              <h4 style={{ margin: '0 0 8px 0', fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                Action Description &amp; Audit Notes
              </h4>
              <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.5 }}>
                {selectedLog.description || 'No descriptive statement provided.'}
              </div>
              {selectedLog.remarks && (
                <div
                  style={{
                    marginTop: 10,
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: '#f0f9ff',
                    border: '1px solid #bae6fd',
                    color: '#0369a1',
                    fontSize: 12.5,
                  }}
                >
                  <strong>Justification / Remarks:</strong> {selectedLog.remarks}
                </div>
              )}
            </div>

            {/* Field changes or raw payload */}
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 12,
                padding: '16px 18px',
              }}
            >
              <h4 style={{ margin: '0 0 10px 0', fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                State Snapshot &amp; Changes
              </h4>

              {selectedLog.changes && selectedLog.changes.length > 0 ? (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                  <table className="hr-table">
                    <thead>
                      <tr>
                        <th>Field Name</th>
                        <th>Previous Value</th>
                        <th>Updated Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedLog.changes.map((ch, idx) => (
                        <tr key={idx}>
                          <td><strong>{ch.field}</strong></td>
                          <td style={{ color: '#b91c1c', background: '#fef2f2' }}>
                            {String(ch.old_value !== undefined ? ch.old_value : '—')}
                          </td>
                          <td style={{ color: '#15803d', background: '#f0fdf4' }}>
                            {String(ch.new_value !== undefined ? ch.new_value : '—')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : selectedLog.before || selectedLog.after ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 12 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: '#991b1b', marginBottom: 6 }}>
                      Previous State (Before)
                    </div>
                    <pre style={{ margin: 0, fontSize: 11.5, fontFamily: 'monospace', maxHeight: 180, overflowY: 'auto' }}>
                      {JSON.stringify(selectedLog.before || 'None', null, 2)}
                    </pre>
                  </div>
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: 12 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: '#166534', marginBottom: 6 }}>
                      New State (After)
                    </div>
                    <pre style={{ margin: 0, fontSize: 11.5, fontFamily: 'monospace', maxHeight: 180, overflowY: 'auto' }}>
                      {JSON.stringify(selectedLog.after || 'None', null, 2)}
                    </pre>
                  </div>
                </div>
              ) : selectedLog.payload ? (
                <div
                  style={{
                    background: '#f8fafc',
                    padding: 12,
                    borderRadius: 8,
                    border: '1px solid #e2e8f0',
                    fontSize: 12,
                    fontFamily: 'monospace',
                    maxHeight: 180,
                    overflowY: 'auto',
                  }}
                >
                  <pre style={{ margin: 0 }}>{JSON.stringify(selectedLog.payload, null, 2)}</pre>
                </div>
              ) : (
                <p style={{ color: '#64748b', fontSize: 12.5, fontStyle: 'italic', margin: 0 }}>
                  Standard event record &mdash; no field diff captured for this operation.
                </p>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}