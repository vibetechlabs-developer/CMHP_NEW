import { useEffect, useMemo, useState } from 'react'
import { useSelector } from 'react-redux'
import { useLocation, useNavigate } from 'react-router-dom'
import PageHeader from '../../components/PageHeader'
import StatusPill from '../../components/StatusPill'
import Button from '../../components/Button'
import Alert from '../../components/Alert'
import { getErrorMessage } from '../../utils/errors'
import { selectActiveCompanyId } from '../../utils/companySelectors'
import { listCompletedProductionOrders } from '../operations/salesOrdersService'
import { normalizeOrder } from '../production/productionApiService'
import { DOSAGE_FORMS } from '../../constants/dosageForms'
import { getQcTemplate } from './qcTemplates'
import './QcList.css'

export default function QcList({ onSelectOrder, companyId, refreshVersion = 0 }) {
  const navigate = useNavigate()
  const location = useLocation()

  const activeCompanyId = useSelector(selectActiveCompanyId)
  const effectiveCompanyId = companyId || activeCompanyId
  const [loaded, setLoaded] = useState(null)
  const [retry, setRetry] = useState(0)
  const current = loaded?.companyId === effectiveCompanyId ? loaded : null
  const loading = !current
  const orders = current?.orders

  useEffect(() => {
    let cancelled = false
    setLoaded(null)
    listCompletedProductionOrders(effectiveCompanyId)
      .then((rows) => {
        if (cancelled) return
        const orders = rows.map((row) => ({
          ...normalizeOrder(row, { [row.id]: row.production }),
          batch_no: row.production_batch_no || '',
          coa_returned: Boolean(row.production?.coa_returned),
        }))
        setLoaded({ companyId: effectiveCompanyId, orders })
      })
      .catch((err) => {
        if (!cancelled) {
          setLoaded({ companyId: effectiveCompanyId, orders: [], error: getErrorMessage(err), httpStatus: err?.response?.status })
        }
      })
    return () => { cancelled = true }
  }, [effectiveCompanyId, refreshVersion, retry])

  const reduxDosageForms = useSelector((state) => state.erp.dosageForms || [])
  const dosageForms = reduxDosageForms.length ? reduxDosageForms : DOSAGE_FORMS

  // State
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [qaStatusFilter, setQaStatusFilter] = useState('ALL')
  const [qaStatusOverrides, setQaStatusOverrides] = useState({})
  const [highlightedId, setHighlightedId] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 10

  const handleQaStatusChange = (orderId, newStatus) => {
    let remark = ''
    if (newStatus === 'Rejected' || newStatus === 'Under Review') {
      remark = window.prompt(`Enter QA remark for order #${orderId} (${newStatus}):`, '') || ''
    }
    setQaStatusOverrides((prev) => ({ ...prev, [orderId]: newStatus }))
    try {
      localStorage.setItem(`cmhp_order_qa_status_${orderId}`, JSON.stringify({ status: newStatus, remark, updatedAt: new Date().toISOString() }))
    } catch {}
  }

  const eligibleOrders = useMemo(() => {
    return (orders || [])
      .map((order) => {
        const dosage_form = order.dosage_form
        let qa_status = order.qa_status || 'Pending'
        let qa_remark = order.qa_remark || ''
        try {
          const saved = localStorage.getItem(`cmhp_order_qa_status_${order.id}`)
          if (saved) {
            const parsed = JSON.parse(saved)
            if (parsed.status) qa_status = parsed.status
            if (parsed.remark) qa_remark = parsed.remark
          }
        } catch {}
        if (qaStatusOverrides[order.id]) {
          qa_status = qaStatusOverrides[order.id]
        }
        return {
          ...order,
          dosage_form,
          dosageForm: dosage_form,
          bmr_status: order.bmr_status || 'NO',
          qa_status,
          qa_remark,
          inHistory: !order.coa_returned && (
            order.in_records === true || String(order.in_records) === 'true' ||
            order.status === 'IN_RECORDS' ||
            String(order.dispatch_status || '').toUpperCase() === 'YES' ||
            order.is_dispatched === true
          ),
        }
      })
  }, [orders, qaStatusOverrides])

  // Handle highlight on redirect from Production's QC button (2-second clean highlight)
  useEffect(() => {
    const targetId = location.state?.highlightOrderId || location.state?.highlightId
    if (targetId) {
      setSearch('')
      setTypeFilter('ALL')
      setHighlightedId(targetId)
      window.history.replaceState({}, document.title)

      const timerScroll = setTimeout(() => {
        const el = document.getElementById(`qc-row-${targetId}`)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }, 150)

      const timerHighlight = setTimeout(() => {
        setHighlightedId(null)
      }, 2000)

      return () => {
        clearTimeout(timerScroll)
        clearTimeout(timerHighlight)
      }
    }
  }, [location.state])

  // Filters (search + Type + QA Status)
  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase()
    return eligibleOrders.filter((order) => {
      // Type filter
      if (typeFilter !== 'ALL') {
        const orderType = (order.dosage_form || order.dosageForm || order.product_type || order.type || '').toLowerCase()
        if (orderType !== typeFilter.toLowerCase()) return false
      }

      // QA Status filter
      if (qaStatusFilter !== 'ALL') {
        if ((order.qa_status || 'Pending').toLowerCase() !== qaStatusFilter.toLowerCase()) {
          return false
        }
      }

      // Search query
      if (q) {
        const orderNum = String(order.number || order.id || '').toLowerCase()
        const customer = String(order.customer_name || order.customer || '').toLowerCase()
        const product = String(order.product_name || order.product || '').toLowerCase()
        const batch = String(order.batch_no || order.batch || '').toLowerCase()
        const type = String(order.dosage_form || '').toLowerCase()

        const matches =
          orderNum.includes(q) ||
          customer.includes(q) ||
          product.includes(q) ||
          batch.includes(q) ||
          type.includes(q)
        if (!matches) return false
      }

      return true
    })
  }, [eligibleOrders, search, typeFilter, qaStatusFilter])

  // Pagination
  const totalPages = Math.ceil(filteredOrders.length / pageSize) || 1
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredOrders.slice(start, start + pageSize)
  }, [filteredOrders, currentPage, pageSize])

  // Summary Metrics
  const oilCount = useMemo(() => {
    return eligibleOrders.filter((o) => (o.dosage_form || '').toLowerCase() === 'oil').length
  }, [eligibleOrders])

  const otherCount = eligibleOrders.length - oilCount
  const isFiltered = Boolean(search || typeFilter !== 'ALL' || qaStatusFilter !== 'ALL')

  const resetFilters = () => {
    setSearch('')
    setTypeFilter('ALL')
    setQaStatusFilter('ALL')
    setCurrentPage(1)
  }

  const handleOpenView = (order) => {
    if (onSelectOrder) {
      onSelectOrder(order)
    } else {
      navigate(`/qc/view/${order.id}`, { state: { coaOrder: order } })
    }
  }

  return (
    <div className="qc-page-container coa-register">
      {!onSelectOrder && (
        <PageHeader
          title="Quality Control (QC)"
          subtitle="Finished product testing, analytical specifications, and Certificate of Analysis (CoA) management."
        />
      )}

      <div className="qc-kpi-grid">
        {[
          ['Production completed', eligibleOrders.length],
          ['Oil products', oilCount],
          ['Other dosage forms', otherCount],
        ].map(([label, count]) => (
          <div className="qc-kpi-card" key={label}>
            <div className="qc-kpi-info">
              <span className="qc-kpi-label">{label}</span>
              <strong className="qc-kpi-value">{loading || current?.error ? '—' : count}</strong>
            </div>
          </div>
        ))}
      </div>

      {/* MAIN REGISTER PANEL */}
      <div className="qc-panel">
        <div className="qc-toolbar">
          <h3 className="qc-toolbar-title">Certificate of Analysis Register</h3>

          {/* SINGLE-ROW FILTER CONTROLS */}
          <div className="qc-toolbar-controls">
            <div className="qc-search-wrap">
              <svg
                className="qc-search-icon"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input
                type="text"
                className="qc-search-input"
                aria-label="Search CoA orders"
                placeholder="Search order #, customer, product, batch..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setCurrentPage(1)
                }}
              />
              {search && (
                <button
                  type="button"
                  className="qc-search-clear-btn"
                  onClick={() => setSearch('')}
                  title="Clear search"
                >
                  ×
                </button>
              )}
            </div>

            <select
              className="qc-type-filter"
              aria-label="Product type"
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value)
                setCurrentPage(1)
              }}
            >
              <option value="ALL">All Types</option>
              {dosageForms.map((df) => (
                <option key={df} value={df}>
                  {df}
                </option>
              ))}
            </select>

            <select
              className="qc-type-filter"
              aria-label="QA status"
              value={qaStatusFilter}
              onChange={(e) => {
                setQaStatusFilter(e.target.value)
                setCurrentPage(1)
              }}
            >
              <option value="ALL">All QA Statuses</option>
              <option value="Pending">⏳ Pending QA</option>
              <option value="Under Review">🔍 Under Review</option>
              <option value="Approved">✅ Approved (CoA Ready)</option>
              <option value="Rejected">❌ Rejected</option>
            </select>

            {isFiltered && (
              <button
                type="button"
                className="qc-reset-btn"
                onClick={resetFilters}
              >
                Reset filters
              </button>
            )}
          </div>
        </div>

        {/* ORDERS TABLE */}
        <div className="qc-table-scroll">
          {current?.error ? (
            <div className="qc-empty-state">
              <h3>Unable to load CoA orders</h3>
              <Alert type="error">
                {current.error}{current.httpStatus ? ` (HTTP ${current.httpStatus})` : ''}
              </Alert>
              <Button type="button" variant="secondary" onClick={() => {
                setLoaded(null)
                setRetry((attempt) => attempt + 1)
              }}>
                Retry
              </Button>
            </div>
          ) : loading ? (
            <div className="qc-empty-state" role="status">Loading completed production orders…</div>
          ) : filteredOrders.length === 0 ? (
            <div className="qc-empty-state">
              <h3>No QC Orders Found</h3>
              <p>
                {eligibleOrders.length === 0
                  ? 'No production-completed orders are available for CoA.'
                  : 'No orders match your current filters.'}
              </p>
            </div>
          ) : (
            <table className="qc-table">
              <thead>
                <tr>
                  <th>Order No.</th>
                  <th>Customer</th>
                  <th>Product</th>
                  <th>Type</th>
                  <th>Batch No.</th>
                  <th>BMR Status</th>
                  <th>QA Review Status</th>
                  <th style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedOrders.map((order) => {
                  const dosage = order.dosage_form || order.dosageForm || '—'
                  const template = getQcTemplate(dosage)
                  const isAvailable = Boolean(template?.isAvailable)

                  return (
                    <tr
                      key={order.id}
                      id={`qc-row-${order.id}`}
                      className={`qc-row ${String(highlightedId) === String(order.id) ? 'qc-row-highlight' : ''}`}
                      onClick={() => handleOpenView(order)}
                    >
                      <td className="cell-strong">
                        <span className="qc-order-link">
                          #{order.number || order.id}
                        </span>
                      </td>

                      <td className="cell-strong">
                        {order.customer_name || order.customer || '—'}
                      </td>

                      <td>
                        <span style={{ fontWeight: 600, color: '#1e293b' }}>
                          {order.product_name || order.product || '—'}
                        </span>
                        {order.product_code && (
                          <span style={{ display: 'block', fontSize: '11px', color: '#64748b' }}>
                            {order.product_code}
                          </span>
                        )}
                      </td>

                      <td>
                        <span className={`qc-dosage-pill ${isAvailable ? 'qc-dosage-active' : ''}`}>
                          {dosage}
                        </span>
                      </td>

                      <td>
                        <span className="qc-batch-code">
                          {order.batch_no || order.batch || '—'}
                        </span>
                      </td>

                      <td>
                        <StatusPill tone={order.bmr_status === 'YES' ? 'success' : 'warning'}>
                          {order.bmr_status === 'YES' ? 'Completed' : 'Pending'}
                        </StatusPill>
                      </td>

                      <td onClick={(e) => e.stopPropagation()}>
                        <select
                          className="qc-status-select"
                          disabled={order.inHistory}
                          value={order.qa_status || 'Pending'}
                          onChange={(e) => handleQaStatusChange(order.id, e.target.value)}
                          style={{
                            padding: '4px 8px',
                            borderRadius: 6,
                            fontWeight: 700,
                            fontSize: 12,
                            border: '1px solid',
                            color: (order.qa_status === 'Approved' ? '#15803d' : order.qa_status === 'Rejected' ? '#b91c1c' : '#b45309'),
                            background: (order.qa_status === 'Approved' ? '#dcfce7' : order.qa_status === 'Rejected' ? '#fee2e2' : '#fef3c7'),
                            borderColor: (order.qa_status === 'Approved' ? '#86efac' : order.qa_status === 'Rejected' ? '#fca5a5' : '#fde68a'),
                            cursor: 'pointer',
                          }}
                        >
                          <option value="Pending">Pending</option>
                          <option value="Under Review">Under Review</option>
                          <option value="Approved">Approved</option>
                          <option value="Rejected">Rejected</option>
                        </select>
                        {order.inHistory && (
                          <span className="coa-history-label">
                            {order.dispatch_status === 'YES' || order.is_dispatched ? 'Dispatched' : 'In Records'}
                          </span>
                        )}
                        {order.qa_remark && (
                          <div style={{ fontSize: 10.5, color: '#b91c1c', marginTop: 2 }} title={order.qa_remark}>
                            ⚠️ {order.qa_remark}
                          </div>
                        )}
                      </td>

                      <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="qc-view-btn"
                          onClick={() => handleOpenView(order)}
                          title="Open Certificate of Analysis (CoA)"
                        >
                          👁️ View CoA
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* PAGINATION */}
        {filteredOrders.length > 0 && (
          <div className="qc-pagination">
            <div className="qc-pagination-info">
              Showing {(currentPage - 1) * pageSize + 1} to{' '}
              {Math.min(currentPage * pageSize, filteredOrders.length)} of {filteredOrders.length} orders
            </div>
            <div className="qc-pagination-controls">
              <button
                type="button"
                className="qc-page-btn"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <span className="qc-page-number">
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                className="qc-page-btn"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
