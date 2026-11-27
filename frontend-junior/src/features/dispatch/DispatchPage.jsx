import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useSelector } from 'react-redux'
import api from '../../api/axios'
import { selectActiveCompanyKey, selectActiveCompanyId } from '../../utils/companySelectors'
import PharmaHeroBanner from '../../components/PharmaHeroBanner'
import SharedFilterBar from '../../components/SharedFilterBar'
import './DispatchPage.css'

function formatDateDDMMYYYY(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return String(dateStr)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `${day}-${month}-${year}`
}

export default function DispatchPage() {
  const compKey = useSelector(selectActiveCompanyKey)
  const activeCompId = useSelector(selectActiveCompanyId)
  const companyId = activeCompId || (compKey === 'tej' ? 3 : 2)

  // Active Tab: 'live' | 'records'
  const [activeTab, setActiveTab] = useState('live')

  // Live Tracking state
  const [trackingOrders, setTrackingOrders] = useState([])
  const [trackingLoading, setTrackingLoading] = useState(true)
  const [trackingError, setTrackingError] = useState('')
  const [lastRefreshed, setLastRefreshed] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  // Dispatch Records state
  const [dispatchRecords, setDispatchRecords] = useState([])
  const [recordsLoading, setRecordsLoading] = useState(false)
  const [recordsError, setRecordsError] = useState('')

  // Shared Filter states
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [companyFilter, setCompanyFilter] = useState('ALL')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 10

  // Confirm Dispatch Dialog state
  const [confirmModalOrder, setConfirmModalOrder] = useState(null)
  const [dispatchNotes, setDispatchNotes] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState('')
  const [feedbackMsg, setFeedbackMsg] = useState({ text: '', type: 'success' })

  // 1. Fetch Live Tracking Data from backend GET /api/dispatch/tracking/
  const fetchTracking = useCallback(
    async (showSpinner = false) => {
      if (showSpinner) setRefreshing(true)
      try {
        const params = {}
        if (companyFilter !== 'ALL') {
          params.company_id = companyFilter === 'cmhp' ? 2 : companyFilter === 'tej' ? 3 : companyFilter
        } else if (companyId) {
          // If company is selected, filter by it, or leave ALL
          // params.company_id = companyId
        }
        if (search.trim()) params.search = search.trim()
        if (typeFilter !== 'ALL') params.product_type = typeFilter
        if (fromDate) {
          params.from_date = fromDate
          params.date_from = fromDate
        }
        if (toDate) {
          params.to_date = toDate
          params.date_to = toDate
        }

        const res = await api.get('/dispatch/tracking/', { params })
        const payload = res.data
        const items = Array.isArray(payload) ? payload : payload?.results || []
        setTrackingOrders(items)
        setLastRefreshed(new Date())
        setTrackingError('')
      } catch (err) {
        setTrackingError(err.response?.data?.detail || err.message || 'Failed to load live tracking')
      } finally {
        setTrackingLoading(false)
        if (showSpinner) setRefreshing(false)
      }
    },
    [companyFilter, companyId, search, typeFilter, fromDate, toDate]
  )

  // 2. Fetch Dispatch Records from backend GET /api/dispatch/records/
  const fetchDispatchRecords = useCallback(async () => {
    setRecordsLoading(true)
    setRecordsError('')
    try {
      const params = {}
      if (companyFilter !== 'ALL') {
        params.company_id = companyFilter === 'cmhp' ? 2 : companyFilter === 'tej' ? 3 : companyFilter
      }
      if (search.trim()) params.search = search.trim()
      if (typeFilter !== 'ALL') params.product_type = typeFilter
      if (fromDate) {
        params.from_date = fromDate
        params.date_from = fromDate
      }
      if (toDate) {
        params.to_date = toDate
        params.date_to = toDate
      }

      const res = await api.get('/dispatch/records/', { params })
      const payload = res.data
      const items = Array.isArray(payload) ? payload : payload?.results || []
      setDispatchRecords(items)
    } catch (err) {
      setRecordsError(err.response?.data?.detail || err.message || 'Failed to load dispatch records')
    } finally {
      setRecordsLoading(false)
    }
  }, [companyFilter, search, typeFilter, fromDate, toDate])

  // Initial load and periodic auto-refresh (every 12 seconds)
  useEffect(() => {
    fetchTracking(true)
    const interval = setInterval(() => {
      fetchTracking(false)
    }, 12000)

    const handleFocus = () => {
      fetchTracking(false)
    }
    window.addEventListener('focus', handleFocus)

    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', handleFocus)
    }
  }, [fetchTracking])

  // When switching to records tab, fetch dispatch records
  useEffect(() => {
    if (activeTab === 'records') {
      fetchDispatchRecords()
    }
  }, [activeTab, fetchDispatchRecords])

  // Reset pagination when filters change
  const handleFilterReset = () => {
    setSearch('')
    setTypeFilter('ALL')
    setCompanyFilter('ALL')
    setFromDate('')
    setToDate('')
    setCurrentPage(1)
  }

  // Filtered live tracking list (client-side safety check)
  const filteredLiveOrders = useMemo(() => {
    return trackingOrders.filter((order) => {
      if (companyFilter !== 'ALL') {
        const targetCid = companyFilter === 'cmhp' ? 2 : companyFilter === 'tej' ? 3 : Number(companyFilter)
        if (Number(order.company_id) !== targetCid) return false
      }
      if (typeFilter !== 'ALL') {
        const t = (order.product_type || '').toLowerCase()
        if (t !== typeFilter.toLowerCase()) return false
      }
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        const orderNum = String(order.order_number || '').toLowerCase()
        const prod = String(order.product_name || '').toLowerCase()
        const batch = String(order.batch_no || '').toLowerCase()
        const comp = String(order.company_name || '').toLowerCase()
        if (!orderNum.includes(q) && !prod.includes(q) && !batch.includes(q) && !comp.includes(q)) {
          return false
        }
      }
      if (fromDate || toDate) {
        const oDate = String(order.raw_order_date || order.order_date || '').slice(0, 10)
        if (fromDate && oDate && oDate < fromDate) return false
        if (toDate && oDate && oDate > toDate) return false
      }
      return true
    })
  }, [trackingOrders, companyFilter, typeFilter, search, fromDate, toDate])

  // Filtered dispatch records
  const filteredRecords = useMemo(() => {
    return dispatchRecords.filter((rec) => {
      if (companyFilter !== 'ALL') {
        const targetCid = companyFilter === 'cmhp' ? 2 : companyFilter === 'tej' ? 3 : Number(companyFilter)
        if (rec.company_id && Number(rec.company_id) !== targetCid) return false
      }
      if (typeFilter !== 'ALL') {
        const t = (rec.product_type || '').toLowerCase()
        if (t !== typeFilter.toLowerCase()) return false
      }
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        const orderNum = String(rec.order_reference || '').toLowerCase()
        const prod = String(rec.product_name || '').toLowerCase()
        const batch = String(rec.batch_no || '').toLowerCase()
        if (!orderNum.includes(q) && !prod.includes(q) && !batch.includes(q)) {
          return false
        }
      }
      if (fromDate || toDate) {
        const rDate = String(rec.order_date || rec.dispatched_at || '').slice(0, 10)
        if (fromDate && rDate && rDate < fromDate) return false
        if (toDate && rDate && rDate > toDate) return false
      }
      return true
    })
  }, [dispatchRecords, companyFilter, typeFilter, search, fromDate, toDate])

  // Active paginated data
  const activeDataset = activeTab === 'live' ? filteredLiveOrders : filteredRecords
  const totalPages = Math.ceil(activeDataset.length / pageSize) || 1
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return activeDataset.slice(start, start + pageSize)
  }, [activeDataset, currentPage, pageSize])

  // Handle Dispatch Confirm Action
  const handleOpenConfirmModal = (order) => {
    setConfirmModalOrder(order)
    setDispatchNotes('')
    setConfirmError('')
  }

  const handleConfirmDispatchSubmit = async () => {
    if (!confirmModalOrder) return
    setConfirming(true)
    setConfirmError('')
    try {
      const cid = confirmModalOrder.company_id || companyId
      const orderId = confirmModalOrder.order_id
      const res = await api.post(`/v1/companies/${cid}/orders/${orderId}/dispatch-confirm/`, {
        notes: dispatchNotes.trim() || 'Dispatched and physically verified',
      })

      // Remove immediately from Live Tracking list
      setTrackingOrders((prev) => prev.filter((o) => o.order_id !== orderId))
      setFeedbackMsg({
        text: res.data?.message || `Order #${confirmModalOrder.order_number} confirmed for dispatch successfully!`,
        type: 'success',
      })
      setConfirmModalOrder(null)

      // Refresh records and tracking in background
      fetchDispatchRecords()
      fetchTracking(false)
      setTimeout(() => setFeedbackMsg({ text: '', type: 'success' }), 4000)
    } catch (err) {
      const respData = err.response?.data
      let msg = ''
      if (respData?.pending && Array.isArray(respData.pending)) {
        msg = `Cannot confirm dispatch. Pending stages: ${respData.pending.join(', ')}.`
      } else if (respData?.error) {
        msg = respData.error
      } else if (respData?.detail) {
        msg = respData.detail
      } else {
        msg = err.message || 'Dispatch confirmation failed'
      }
      setConfirmError(msg)
    } finally {
      setConfirming(false)
    }
  }

  return (
    <div className="disp-page">
      {/* 1. TOP PHARMA HERO BANNER */}
      <PharmaHeroBanner
        title="📦 Dispatch & Live Order Tracking"
        subtitle="Real-time multi-stage manufacturing progress, live dispatch monitoring, and historical dispatch records."
        badgeText="PHARMA ERP · DISPATCH"
      />

      {/* FEEDBACK TOAST */}
      {feedbackMsg.text && (
        <div className={`disp-toast ${feedbackMsg.type}`}>
          <span>{feedbackMsg.type === 'success' ? '✓' : '⚠️'}</span>
          <span>{feedbackMsg.text}</span>
        </div>
      )}

      {/* 2. TABS: LIVE TRACKING & DISPATCH RECORDS */}
      <div className="disp-tab-bar">
        <div className="disp-tabs-left">
          <button
            type="button"
            className={`disp-tab-btn ${activeTab === 'live' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('live')
              setCurrentPage(1)
            }}
          >
            <span className="disp-tab-icon">📡</span>
            <span>Live Tracking</span>
            <span className="disp-tab-count">{filteredLiveOrders.length}</span>
          </button>
          <button
            type="button"
            className={`disp-tab-btn ${activeTab === 'records' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('records')
              setCurrentPage(1)
            }}
          >
            <span className="disp-tab-icon">📦</span>
            <span>Dispatch Records</span>
            <span className="disp-tab-count">{filteredRecords.length}</span>
          </button>
        </div>

        {/* Live sync pill & manual refresh */}
        {activeTab === 'live' && (
          <div className="disp-sync-wrapper">
            {lastRefreshed && (
              <span className="disp-sync-text">
                🟢 Live · Updated {lastRefreshed.toLocaleTimeString()}
              </span>
            )}
            <button
              type="button"
              className="disp-refresh-btn"
              onClick={() => fetchTracking(true)}
              disabled={refreshing}
            >
              {refreshing ? '⏳ Syncing…' : '↻ Refresh'}
            </button>
          </div>
        )}
      </div>

      {/* 3. SHARED ONE-ROW FILTER BAR */}
      <SharedFilterBar
        search={search}
        onSearchChange={(val) => {
          setSearch(val)
          setCurrentPage(1)
        }}
        typeFilter={typeFilter}
        onTypeChange={(val) => {
          setTypeFilter(val)
          setCurrentPage(1)
        }}
        companyFilter={companyFilter}
        onCompanyChange={(val) => {
          setCompanyFilter(val)
          setCurrentPage(1)
        }}
        fromDate={fromDate}
        onFromDateChange={(val) => {
          setFromDate(val)
          setCurrentPage(1)
        }}
        toDate={toDate}
        onToDateChange={(val) => {
          setToDate(val)
          setCurrentPage(1)
        }}
        onReset={handleFilterReset}
        placeholder={
          activeTab === 'live'
            ? 'Search by Order #, Product, Batch, Company...'
            : 'Search by Order #, Product, Batch...'
        }
      />

      {/* 4. TAB CONTENT: LIVE TRACKING */}
      {activeTab === 'live' && (
        <div className="disp-card">
          {/* Tracker Legend Strip */}
          <div className="disp-legend-bar">
            <div className="disp-legend-item">
              <span className="disp-legend-dot dot-green" />
              <span className="disp-legend-label">Green: Stage Completed</span>
            </div>
            <div className="disp-legend-item">
              <span className="disp-legend-dot dot-yellow" />
              <span className="disp-legend-label">Yellow: Stage In Progress</span>
            </div>
            <div className="disp-legend-item">
              <span className="disp-legend-dot dot-white" />
              <span className="disp-legend-label">White: Pending / Not Started</span>
            </div>
            <div className="disp-legend-note">
              ℹ️ Stages precede in order: <strong>Order Created → QA → Production (BMR) → QC → Invoice</strong>.
            </div>
          </div>

          {trackingError && (
            <div className="disp-error-banner">
              ⚠️ {trackingError}
            </div>
          )}

          {trackingLoading ? (
            <div className="disp-loading-state">
              <span className="disp-spinner">⏳</span>
              <p>Fetching live order progress from all modules…</p>
            </div>
          ) : filteredLiveOrders.length === 0 ? (
            <div className="disp-empty-state">
              <span className="disp-empty-icon">📡</span>
              <h3>No Active Orders in Live Tracking</h3>
              <p>Every newly created sales order appears here immediately until final Dispatch Confirmation.</p>
            </div>
          ) : (
            <>
              <div className="disp-table-scroll">
                <table className="disp-table">
                  <thead>
                    <tr>
                      <th style={{ minWidth: 130 }}>Order No</th>
                      <th style={{ minWidth: 120 }}>Company</th>
                      <th style={{ minWidth: 180 }}>Product</th>
                      <th style={{ minWidth: 100 }}>Type</th>
                      <th style={{ minWidth: 110 }}>Order Date</th>
                      <th style={{ minWidth: 420 }}>Progress Tracker (Stages 1–5)</th>
                      <th style={{ minWidth: 150, textAlign: 'center' }}>Dispatch Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedData.map((item) => {
                      const stages = item.stages || []
                      const doneCount = item.done_count ?? 0
                      const totalStages = item.total_stages || 5
                      const canConfirm = Boolean(item.can_confirm_dispatch)
                      const blockingReason = item.blocking_stage || 'Complete all stages to confirm dispatch'

                      return (
                        <tr key={item.order_id}>
                          {/* 1. Order No */}
                          <td>
                            <div className="disp-cell-order">
                              <span className="disp-order-number">#{item.order_number}</span>
                              {item.batch_no && (
                                <span className="disp-order-batch">Batch: {item.batch_no}</span>
                              )}
                              {item.in_records && (
                                <span className="disp-badge-records" title="This order has been sent to Records dossier">
                                  📋 In Records
                                </span>
                              )}
                            </div>
                          </td>

                          {/* 2. Company */}
                          <td>
                            <span className="disp-company-pill">{item.company_name || 'CMHP Pharma'}</span>
                          </td>

                          {/* 3. Product */}
                          <td>
                            <strong className="disp-product-title">{item.product_name}</strong>
                          </td>

                          {/* 4. Type */}
                          <td>
                            <span className="disp-type-pill">
                              {item.product_type_display || item.product_type || 'Liquid'}
                            </span>
                          </td>

                          {/* 5. Order Date */}
                          <td>
                            <span className="disp-date-cell">{formatDateDDMMYYYY(item.order_date || item.raw_order_date)}</span>
                          </td>

                          {/* 6. Multi-Stage Progress Tracker */}
                          <td>
                            <div className="disp-tracker-container">
                              <div className="disp-stages-row">
                                {stages.map((stage, idx) => {
                                  const colorClass = `stage-${stage.status || 'white'}`
                                  return (
                                    <React.Fragment key={stage.key || idx}>
                                      <div
                                        className={`disp-stage-pill ${colorClass}`}
                                        title={`${stage.label}: ${stage.status.toUpperCase()}`}
                                      >
                                        <span className="stage-indicator-dot" />
                                        <span className="stage-name">{stage.label}</span>
                                      </div>
                                      {idx < stages.length - 1 && (
                                        <span className="stage-connector">→</span>
                                      )}
                                    </React.Fragment>
                                  )
                                })}
                              </div>

                              <div className="disp-tracker-footer">
                                <span className={`disp-progress-badge ${doneCount === 5 ? 'all-done' : ''}`}>
                                  {doneCount}/{totalStages} Done
                                </span>
                                {!canConfirm && item.blocking_stage && (
                                  <span className="disp-blocking-hint" title={item.blocking_stage}>
                                    ⚠️ {item.blocking_stage}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* 7. Action: Dispatch Confirm Button */}
                          <td style={{ textAlign: 'center' }}>
                            <button
                              type="button"
                              className={`disp-confirm-btn ${canConfirm ? 'enabled' : 'disabled'}`}
                              disabled={!canConfirm}
                              title={canConfirm ? 'Confirm physical dispatch and complete order' : blockingReason}
                              onClick={() => canConfirm && handleOpenConfirmModal(item)}
                            >
                              🚚 Dispatch Confirm
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* PAGINATION */}
              <div className="disp-pagination">
                <div>
                  Showing {(currentPage - 1) * pageSize + 1} to{' '}
                  {Math.min(currentPage * pageSize, filteredLiveOrders.length)} of {filteredLiveOrders.length} orders
                </div>
                <div className="disp-page-controls">
                  <button
                    type="button"
                    className="disp-page-btn"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </button>
                  <span className="disp-page-indicator">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    className="disp-page-btn"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* 5. TAB CONTENT: DISPATCH RECORDS */}
      {activeTab === 'records' && (
        <div className="disp-card">
          {recordsError && (
            <div className="disp-error-banner">
              ⚠️ {recordsError}
            </div>
          )}

          {recordsLoading ? (
            <div className="disp-loading-state">
              <span className="disp-spinner">⏳</span>
              <p>Loading historical dispatch records…</p>
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="disp-empty-state">
              <span className="disp-empty-icon">📦</span>
              <h3>No Dispatched Records Found</h3>
              <p>When an order completes all 5 stages and you click "Dispatch Confirm", it will be archived here.</p>
            </div>
          ) : (
            <>
              <div className="disp-table-scroll">
                <table className="disp-table">
                  <thead>
                    <tr>
                      <th style={{ minWidth: 150 }}>Order No</th>
                      <th style={{ minWidth: 240 }}>Product</th>
                      <th style={{ minWidth: 140 }}>Order Date</th>
                      <th style={{ minWidth: 160 }}>Dispatch Date (dd-mm-yyyy)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedData.map((rec) => (
                      <tr key={rec.id}>
                        {/* 1. Order No */}
                        <td>
                          <div className="disp-cell-order">
                            <strong className="disp-order-number">
                              #{rec.order_reference || rec.order_id}
                            </strong>
                            {rec.batch_no && (
                              <span className="disp-order-batch">Batch: {rec.batch_no}</span>
                            )}
                          </div>
                        </td>

                        {/* 2. Product */}
                        <td>
                          <span className="disp-product-title">{rec.product_name}</span>
                        </td>

                        {/* 3. Order Date */}
                        <td>
                          <span className="disp-date-cell">{formatDateDDMMYYYY(rec.order_date)}</span>
                        </td>

                        {/* 4. Dispatch Date (dd-mm-yyyy) */}
                        <td>
                          <span className="disp-dispatched-date-pill">
                            🚚 {formatDateDDMMYYYY(rec.dispatched_at)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* PAGINATION */}
              <div className="disp-pagination">
                <div>
                  Showing {(currentPage - 1) * pageSize + 1} to{' '}
                  {Math.min(currentPage * pageSize, filteredRecords.length)} of {filteredRecords.length} records
                </div>
                <div className="disp-page-controls">
                  <button
                    type="button"
                    className="disp-page-btn"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </button>
                  <span className="disp-page-indicator">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    className="disp-page-btn"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* 6. DISPATCH CONFIRM "ARE YOU SURE?" DIALOG */}
      {confirmModalOrder && (
        <div className="disp-modal-backdrop" onClick={() => !confirming && setConfirmModalOrder(null)}>
          <div className="disp-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="disp-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 20 }}>🚚</span>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#ffffff' }}>
                  Confirm Physical Dispatch
                </h3>
              </div>
              <button
                type="button"
                className="disp-modal-close"
                onClick={() => !confirming && setConfirmModalOrder(null)}
              >
                ✕
              </button>
            </div>

            <div className="disp-modal-body">
              <p className="disp-modal-question">
                Are you sure you want to confirm dispatch for Order <strong>#{confirmModalOrder.order_number}</strong>?
              </p>

              <div className="disp-modal-summary">
                <div>
                  <span className="summary-label">Order: </span>
                  <strong className="summary-val">#{confirmModalOrder.order_number}</strong>
                </div>
                <div>
                  <span className="summary-label">Batch: </span>
                  <strong className="summary-val">{confirmModalOrder.batch_no || '—'}</strong>
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <span className="summary-label">Product: </span>
                  <strong className="summary-val">{confirmModalOrder.product_name}</strong>
                </div>
                <div>
                  <span className="summary-label">Company: </span>
                  <span className="summary-val">{confirmModalOrder.company_name}</span>
                </div>
                <div>
                  <span className="summary-label">Stages Status: </span>
                  <span className="summary-val" style={{ color: '#16a34a', fontWeight: 700 }}>
                    ✓ 5/5 Completed (All Green)
                  </span>
                </div>
              </div>

              {confirmError && (
                <div className="disp-modal-error">
                  <span>⚠️</span>
                  <div>{confirmError}</div>
                </div>
              )}

              <label className="disp-modal-input-lbl">
                Dispatch Remarks / Tracking Details (Optional)
              </label>
              <textarea
                rows={2}
                value={dispatchNotes}
                onChange={(e) => setDispatchNotes(e.target.value)}
                placeholder="Enter carrier, vehicle number, delivery notes..."
                disabled={confirming}
                className="disp-modal-textarea"
              />

              <div className="disp-modal-warning">
                ℹ️ <strong>Final Action:</strong> Once confirmed, this order is recorded in <em>Dispatch Records</em> and leaves <em>Live Tracking</em>. All compliance records remain permanently in <em>Records</em>.
              </div>
            </div>

            <div className="disp-modal-footer">
              <button
                type="button"
                className="disp-modal-cancel-btn"
                disabled={confirming}
                onClick={() => setConfirmModalOrder(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="disp-modal-confirm-btn"
                disabled={confirming}
                onClick={handleConfirmDispatchSubmit}
              >
                {confirming ? '⏳ Confirming…' : '✓ Are you sure? Confirm Dispatch'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
