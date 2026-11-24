import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import { selectActiveCompanyKey, selectActiveCompanyId } from '../../utils/companySelectors'
import { DOSAGE_FORMS } from '../../constants/dosageForms'
import OrderDocumentViewerModal from './OrderDocumentViewerModal'
import './RecordsPage.css'

export default function RecordsPage({ mode = 'records' }) {
  const navigate = useNavigate()
  const compKey = useSelector(selectActiveCompanyKey)
  const activeCompId = useSelector(selectActiveCompanyId)
  const companyId = activeCompId || (compKey === 'tej' ? 3 : 2)

  // State
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Filters
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [companyFilter, setCompanyFilter] = useState('ALL')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [quickFilter, setQuickFilter] = useState('ALL') // 'ALL' | 'COA_RETURNED'

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 10

  // Document Viewer Modal State
  const [viewerState, setViewerState] = useState({
    isOpen: false,
    order: null,
    docType: '',
    subType: '',
    title: '',
  })

  // Return Actions Dialog State
  const [actionDialog, setActionDialog] = useState({
    isOpen: false,
    actionType: '', // 'RETURN_TO_PROD' | 'BACK_TO_COA'
    order: null,
    reason: '',
    loading: false,
    error: '',
  })

  // Fetch dispatched records from API
  const fetchRecords = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const endpoint = mode === 'dispatch'
        ? `/v1/companies/${companyId}/dispatch/`
        : `/v1/companies/${companyId}/records/`

      const params = {
        search: search.trim() || undefined,
        type: typeFilter !== 'ALL' ? typeFilter : undefined,
        date_from: fromDate || undefined,
        date_to: toDate || undefined,
        coa_status: quickFilter === 'COA_RETURNED' ? 'coa_returned' : undefined,
      }

      const res = await api.get(endpoint, { params })
      const data = res.data
      const list = Array.isArray(data.results) ? data.results : (Array.isArray(data) ? data : [])
      setOrders(list)
    } catch (err) {
      console.error('Failed to load records:', err)
      setError(err.response?.data?.error || err.message || 'Failed to fetch records')
    } finally {
      setLoading(false)
    }
  }, [companyId, mode, search, typeFilter, fromDate, toDate, quickFilter])

  useEffect(() => {
    fetchRecords()
  }, [fetchRecords])

  const isDispatchMode = mode === 'dispatch'

  // Client-side filtering by Company dropdown if selected
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (companyFilter === 'ALL') return true
      if (companyFilter === 'CMHP' && (o.company_id === 2 || String(o.company_name).toLowerCase().includes('cmhp'))) return true
      if (companyFilter === 'TEJ' && (o.company_id === 3 || String(o.company_name).toLowerCase().includes('tej'))) return true
      return true
    }).filter((o) => {
      if (!isDispatchMode) return true
      if (quickFilter === 'READY') return !o.physically_dispatched && !o.coa_returned && !o.production_returned
      if (quickFilter === 'SHIPPED') return o.physically_dispatched
      if (quickFilter === 'REQUIRES_ACTION') return o.coa_returned || o.production_returned
      return true
    })
  }, [orders, companyFilter, isDispatchMode, quickFilter])

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / pageSize))
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredOrders.slice(start, start + pageSize)
  }, [filteredOrders, currentPage, pageSize])

  // Open Document Viewer
  const handleOpenDoc = (order, docType, subType = '', title = '') => {
    setViewerState({
      isOpen: true,
      order,
      docType,
      subType,
      title,
    })
  }

  // Handle "Return to Production"
  const handleOpenReturnToProd = (order) => {
    if (order.physically_dispatched) {
      setError(`Order #${order.order_number || order.id} has already been physically dispatched from the facility and cannot be returned to production.`)
      setTimeout(() => setError(''), 5000)
      return
    }
    setActionDialog({
      isOpen: true,
      actionType: 'RETURN_TO_PROD',
      order,
      reason: '',
      loading: false,
      error: '',
    })
  }

  // Handle "Back to COA"
  const handleOpenBackToCoa = (order) => {
    setActionDialog({
      isOpen: true,
      actionType: 'BACK_TO_COA',
      order,
      reason: '',
      loading: false,
      error: '',
    })
  }

  // Execute Atomic Action
  const handleConfirmAction = async () => {
    const { actionType, order, reason } = actionDialog
    if (!order) return

    setActionDialog((prev) => ({ ...prev, loading: true, error: '' }))
    try {
      const cid = order.company_id || companyId
      const orderId = order.id || order.order_id

      if (actionType === 'RETURN_TO_PROD') {
        const res = await api.post(`/v1/companies/${cid}/orders/${orderId}/return-to-production/`, {
          reason: reason.trim() || 'Returned to Production for modifications',
        })
        setSuccess(res.data?.message || `Order #${order.order_number || orderId} returned to Production successfully.`)
      } else if (actionType === 'BACK_TO_COA') {
        const res = await api.post(`/v1/companies/${cid}/orders/${orderId}/back-to-coa/`, {
          reason: reason.trim() || 'Returned to QC for COA revision',
        })
        setSuccess(res.data?.message || `Order #${order.order_number || orderId} COA returned to QC successfully.`)
      }

      setActionDialog({ isOpen: false, actionType: '', order: null, reason: '', loading: false, error: '' })
      await fetchRecords()
      setTimeout(() => setSuccess(''), 4000)
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Action failed'
      setActionDialog((prev) => ({ ...prev, loading: false, error: msg }))
    }
  }

  return (
    <div className="records-container">
      {/* PAGE HEADER */}
      <div className="records-header">
        <h1>
          <span>{isDispatchMode ? '📦 Dispatch Management' : '📋 Records'}</span>
        </h1>
        <p>
          {isDispatchMode
            ? 'Track real-time order lifecycle stage, factory-to-shipment milestones, and dispatch status.'
            : 'Order-wise manufacturing records, digital dossiers (Attachments 1–6, BMR, COA, Invoice), and compliance audit trails.'}
        </p>
      </div>

      {/* TOAST ALERTS */}
      {error && (
        <div style={{ padding: '12px 16px', background: '#fee2e2', border: '1px solid #f87171', color: '#991b1b', borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>
          ⚠️ {error}
        </div>
      )}
      {success && (
        <div style={{ padding: '12px 16px', background: '#dcfce7', border: '1px solid #86efac', color: '#166534', borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>
          ✓ {success}
        </div>
      )}

      {/* QUICK FILTER PILLS */}
      <div className="records-pills-row">
        {isDispatchMode ? (
          <>
            <button
              type="button"
              className={`records-pill ${quickFilter === 'ALL' ? 'active' : ''}`}
              onClick={() => {
                setQuickFilter('ALL')
                setCurrentPage(1)
              }}
            >
              All Orders ({orders.length})
            </button>
            <button
              type="button"
              className={`records-pill ${quickFilter === 'READY' ? 'active' : ''}`}
              onClick={() => {
                setQuickFilter('READY')
                setCurrentPage(1)
              }}
            >
              📦 Ready for Dispatch ({orders.filter(o => !o.physically_dispatched && !o.coa_returned && !o.production_returned).length})
            </button>
            <button
              type="button"
              className={`records-pill ${quickFilter === 'SHIPPED' ? 'active' : ''}`}
              onClick={() => {
                setQuickFilter('SHIPPED')
                setCurrentPage(1)
              }}
            >
              🚚 Shipped / In Transit ({orders.filter(o => o.physically_dispatched).length})
            </button>
            <button
              type="button"
              className={`records-pill ${quickFilter === 'REQUIRES_ACTION' ? 'active' : ''}`}
              onClick={() => {
                setQuickFilter('REQUIRES_ACTION')
                setCurrentPage(1)
              }}
            >
              ⚠️ Requires Action ({orders.filter(o => o.coa_returned || o.production_returned).length})
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className={`records-pill ${quickFilter === 'ALL' ? 'active' : ''}`}
              onClick={() => {
                setQuickFilter('ALL')
                setCurrentPage(1)
              }}
            >
              All Dispatched Orders ({orders.length})
            </button>
            <button
              type="button"
              className={`records-pill ${quickFilter === 'COA_RETURNED' ? 'active' : ''}`}
              onClick={() => {
                setQuickFilter('COA_RETURNED')
                setCurrentPage(1)
              }}
            >
              COA Returned to QC ({orders.filter((o) => o.coa_returned).length})
            </button>
          </>
        )}
      </div>

      {/* FILTER BAR */}
      <div className="records-filter-bar">
        <input
          type="text"
          className="records-search-input"
          placeholder="Search by Order #, Product, Batch No..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setCurrentPage(1)
          }}
        />

        {/* Product Type Filter */}
        <select
          className="records-select"
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value)
            setCurrentPage(1)
          }}
        >
          <option value="ALL">All Types</option>
          {DOSAGE_FORMS.map((df) => (
            <option key={df} value={df}>
              {df}
            </option>
          ))}
        </select>

        {/* Company Filter */}
        <select
          className="records-select"
          value={companyFilter}
          onChange={(e) => {
            setCompanyFilter(e.target.value)
            setCurrentPage(1)
          }}
        >
          <option value="ALL">All Companies</option>
          <option value="CMHP">CMHP Pharma</option>
          <option value="TEJ">Tej Biocare</option>
        </select>

        {/* Date Range: From / To */}
        <div className="records-date-group">
          <span>From:</span>
          <input
            type="date"
            className="records-date-input"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value)
              setCurrentPage(1)
            }}
          />
        </div>

        <div className="records-date-group">
          <span>To:</span>
          <input
            type="date"
            className="records-date-input"
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value)
              setCurrentPage(1)
            }}
          />
        </div>

        {(search || typeFilter !== 'ALL' || companyFilter !== 'ALL' || fromDate || toDate) && (
          <button
            type="button"
            className="records-pill"
            style={{ color: '#ef4444', borderColor: '#fca5a5' }}
            onClick={() => {
              setSearch('')
              setTypeFilter('ALL')
              setCompanyFilter('ALL')
              setFromDate('')
              setToDate('')
              setCurrentPage(1)
            }}
          >
            ✕ Reset Filters
          </button>
        )}
      </div>

      {/* ORDER-WISE RECORDS TABLE */}
      <div className="records-table-card">
        {loading ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: '#64748b' }}>
            <span style={{ fontSize: 24 }}>⏳</span>
            <p style={{ marginTop: 8, fontWeight: 600 }}>Loading records dossier…</p>
          </div>
        ) : paginatedOrders.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: '#64748b' }}>
            <span style={{ fontSize: 28 }}>📦</span>
            <h3 style={{ margin: '8px 0 4px', color: '#1e293b' }}>No dispatched orders found</h3>
            <p style={{ margin: 0, fontSize: 13 }}>
              {isDispatchMode
                ? 'Orders sent for dispatch from the Production screen will appear here.'
                : 'Click the brown "Dispatch" button on a completed production order to move it here.'}
            </p>
          </div>
        ) : (
          <>
            <div className="records-table-scroll">
              <table className="records-table">
                <thead>
                  <tr>
                    {/* Columns 1-4: Order, Company, Product, Type */}
                    <th className="records-sticky-1" style={{ minWidth: 110 }}>Order</th>
                    <th className="records-sticky-2" style={{ minWidth: 100 }}>Company</th>
                    <th className="records-sticky-3" style={{ minWidth: 180 }}>Product</th>
                    <th style={{ minWidth: 110 }}>Type</th>

                    {isDispatchMode ? (
                      <>
                        <th style={{ minWidth: 340 }}>Current Stage &amp; Lifecycle Status</th>
                        <th style={{ minWidth: 180 }}>Dispatch Details</th>
                        <th style={{ minWidth: 220, textAlign: 'center' }}>Actions</th>
                      </>
                    ) : (
                      <>
                        {/* Columns 5-10: Attachments 1 to 6 */}
                        <th style={{ minWidth: 120 }}>
                          Attachment 1
                          <span className="records-th-sub">RM Requisition Slip</span>
                        </th>
                        <th style={{ minWidth: 150 }}>
                          Attachment 2
                          <span className="records-th-sub">Test Request / Receipt</span>
                        </th>
                        <th style={{ minWidth: 120 }}>
                          Attachment 3
                          <span className="records-th-sub">Bulk Release Slip</span>
                        </th>
                        <th style={{ minWidth: 120 }}>
                          Attachment 4
                          <span className="records-th-sub">PM Requisition Slip</span>
                        </th>
                        <th style={{ minWidth: 120 }}>
                          Attachment 5
                          <span className="records-th-sub">After Test</span>
                        </th>
                        <th style={{ minWidth: 120 }}>
                          Attachment 6
                          <span className="records-th-sub">Transfer Slip</span>
                        </th>

                        {/* Columns 11-13: BMR, COA, Invoice */}
                        <th style={{ minWidth: 90 }}>BMR</th>
                        <th style={{ minWidth: 130 }}>COA</th>
                        <th style={{ minWidth: 90 }}>Invoice</th>

                        {/* Column 14: Actions */}
                        <th style={{ minWidth: 250, textAlign: 'center' }}>Actions</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {paginatedOrders.map((order) => {
                    const docs = order.documents || {}
                    const att1 = docs.attachment_1 || {}
                    const att2 = docs.attachment_2 || {}
                    const att3 = docs.attachment_3 || {}
                    const att4 = docs.attachment_4 || {}
                    const att5 = docs.attachment_5 || {}
                    const att6 = docs.attachment_6 || {}
                    const bmr = docs.bmr || {}
                    const coa = docs.coa || {}
                    const invoice = docs.invoice || {}

                    const isCoaReturned = order.coa_returned || coa.coa_returned

                    return (
                      <tr key={order.id || order.order_id}>
                        {/* 1. Order (Sticky) */}
                        <td className="records-sticky-1">
                          <strong style={{ color: '#0284c7' }}>
                            #{order.order_number || order.id}
                          </strong>
                          <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 2 }}>
                            {String(order.dispatched_at || '').slice(0, 10)}
                          </div>
                        </td>

                        {/* 2. Company (Sticky) */}
                        <td className="records-sticky-2">
                          <span style={{ fontWeight: 600, color: order.company_id === 3 ? '#7c3aed' : '#0369a1' }}>
                            {order.company_name || (order.company_id === 3 ? 'Tej Biocare' : 'CMHP')}
                          </span>
                        </td>

                        {/* 3. Product (Sticky) */}
                        <td className="records-sticky-3">
                          <div style={{ fontWeight: 700, color: '#0f172a' }}>
                            {order.product_name || '—'}
                          </div>
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                            Batch: <strong>{order.batch_no || '—'}</strong> • {order.batch_size || ''}
                          </div>
                        </td>

                        {/* 4. Type */}
                        <td>
                          <span className={`dosage-badge dosage-${String(order.product_type || 'tablet').toLowerCase()}`}>
                            {order.product_type_display || order.product_type || 'Tablet'}
                          </span>
                        </td>

                        {isDispatchMode ? (
                          <>
                            {/* 5. Entire Lifecycle Status & Current Stage */}
                            <td>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                  {order.physically_dispatched ? (
                                    <span className="dispatch-stage-badge dispatch-stage-shipped">
                                      🚚 Shipped / In Transit
                                    </span>
                                  ) : order.production_returned ? (
                                    <span className="dispatch-stage-badge dispatch-stage-returned">
                                      ↩️ Returned to Production
                                    </span>
                                  ) : order.coa_returned ? (
                                    <span className="dispatch-stage-badge dispatch-stage-qc">
                                      ⚠️ Returned to QC (COA Revision)
                                    </span>
                                  ) : (
                                    <span className="dispatch-stage-badge dispatch-stage-ready">
                                      📦 Packed &amp; Ready for Dispatch
                                    </span>
                                  )}
                                  <span style={{ fontSize: 11.5, color: '#475569', fontWeight: 600 }}>
                                    {order.physically_dispatched
                                      ? 'Physical dispatch complete • Cargo departed facility'
                                      : order.production_returned
                                      ? 'Order returned to production line for rework'
                                      : order.coa_returned
                                      ? 'Order COA returned to QC for revision'
                                      : 'Goods packed in warehouse • Awaiting carrier pickup'}
                                  </span>
                                </div>

                                {/* Visual Stepper Bar showing which stage the order is at */}
                                <div className="dispatch-stepper-track">
                                  <div className="dispatch-step completed" title="Manufacturing BMR Completed">
                                    <span className="step-dot">✓</span>
                                    <span className="step-label">BMR</span>
                                  </div>
                                  <span className="step-arrow">→</span>
                                  <div className={`dispatch-step ${order.coa_returned ? 'alert' : 'completed'}`} title="QC Testing & Bulk Release">
                                    <span className="step-dot">{order.coa_returned ? '!' : '✓'}</span>
                                    <span className="step-label">QC Testing</span>
                                  </div>
                                  <span className="step-arrow">→</span>
                                  <div className={`dispatch-step ${order.production_returned ? 'alert' : 'completed'}`} title="Packaging & Finished Product">
                                    <span className="step-dot">{order.production_returned ? '!' : '✓'}</span>
                                    <span className="step-label">Packaging</span>
                                  </div>
                                  <span className="step-arrow">→</span>
                                  <div className={`dispatch-step ${order.physically_dispatched ? 'completed' : 'active'}`} title="Dispatch & Delivery">
                                    <span className="step-dot">{order.physically_dispatched ? '✓' : '●'}</span>
                                    <span className="step-label">{order.physically_dispatched ? 'Shipped' : 'Dispatch'}</span>
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* 6. Dispatch Details */}
                            <td>
                              <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>
                                By: {order.dispatched_by || 'System'}
                              </div>
                              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                                {order.dispatched_at ? new Date(order.dispatched_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
                              </div>
                              <div style={{ marginTop: 4 }}>
                                {order.physically_dispatched ? (
                                  <span style={{ fontSize: 10.5, color: '#15803d', fontWeight: 700, background: '#f0fdf4', padding: '1px 6px', borderRadius: 4, border: '1px solid #bbf7d0' }}>
                                    ✓ Departed Facility
                                  </span>
                                ) : (
                                  <span style={{ fontSize: 10.5, color: '#0369a1', fontWeight: 700, background: '#f0f9ff', padding: '1px 6px', borderRadius: 4, border: '1px solid #bae6fd' }}>
                                    In Dispatch Store
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* 7. Actions */}
                            <td>
                              <div className="records-actions-cell" style={{ justifyContent: 'center' }}>
                                <button
                                  type="button"
                                  className="records-btn-return-prod"
                                  onClick={() => handleOpenReturnToProd(order)}
                                  title="Return this order back to Production for modifications"
                                >
                                  ↩ Return to Production
                                </button>
                                <button
                                  type="button"
                                  className="records-btn-back-coa"
                                  onClick={() => handleOpenBackToCoa(order)}
                                  title="Return this order's COA back to QC for revision"
                                >
                                  ⟲ Back to COA
                                </button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            {/* 5. Attachment 1 (RM Requisition Slip) */}
                            <td>
                              {att1.exists ? (
                                <button
                                  type="button"
                                  className="records-view-btn"
                                  onClick={() => handleOpenDoc(order, 'ATTACHMENT_1', '', 'RM Requisition Slip (Attachment 1)')}
                                >
                                  <span>View</span>
                                  <span className="records-view-btn-sub">RM Slip</span>
                                </button>
                              ) : (
                                <span className="records-cell-dash">-</span>
                              )}
                            </td>

                            {/* 6. Attachment 2 (Test Request / Receipt) - Supports Dual Docs e.g. Mother Tincture */}
                            <td>
                              {att2.has_multiple && Array.isArray(att2.items) ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  {att2.items.map((item, idx) => (
                                    <button
                                      key={idx}
                                      type="button"
                                      className="records-view-btn"
                                      style={{ padding: '3px 6px', fontSize: 10 }}
                                      onClick={() => handleOpenDoc(order, item.doc_type || 'ATTACHMENT_2', item.sub_type, item.title)}
                                    >
                                      <span>View</span>
                                      <span className="records-view-btn-sub">{item.title}</span>
                                    </button>
                                  ))}
                                </div>
                              ) : att2.exists ? (
                                <button
                                  type="button"
                                  className="records-view-btn"
                                  onClick={() => handleOpenDoc(order, 'ATTACHMENT_2', 'bulk', 'Test Request Slip (Attachment 2)')}
                                >
                                  <span>View</span>
                                  <span className="records-view-btn-sub">Test Request</span>
                                </button>
                              ) : (
                                <span className="records-cell-dash">-</span>
                              )}
                            </td>

                            {/* 7. Attachment 3 (Bulk Release Slip) */}
                            <td>
                              {att3.exists ? (
                                <button
                                  type="button"
                                  className="records-view-btn"
                                  onClick={() => handleOpenDoc(order, 'ATTACHMENT_3', '', 'Bulk Release Slip (Attachment 3)')}
                                >
                                  <span>View</span>
                                  <span className="records-view-btn-sub">Bulk Release</span>
                                </button>
                              ) : (
                                <span className="records-cell-dash">-</span>
                              )}
                            </td>

                            {/* 8. Attachment 4 (PM Requisition Slip) */}
                            <td>
                              {att4.exists ? (
                                <button
                                  type="button"
                                  className="records-view-btn"
                                  onClick={() => handleOpenDoc(order, 'ATTACHMENT_4', '', 'PM Requisition Slip (Attachment 4)')}
                                >
                                  <span>View</span>
                                  <span className="records-view-btn-sub">PM Slip</span>
                                </button>
                              ) : (
                                <span className="records-cell-dash">-</span>
                              )}
                            </td>

                            {/* 9. Attachment 5 (After Test) */}
                            <td>
                              {att5.exists ? (
                                <button
                                  type="button"
                                  className="records-view-btn"
                                  onClick={() => handleOpenDoc(order, 'ATTACHMENT_5', att5.sub_type || 'fp', 'After Test Slip (Attachment 5)')}
                                >
                                  <span>View</span>
                                  <span className="records-view-btn-sub">After Test</span>
                                </button>
                              ) : (
                                <span className="records-cell-dash">-</span>
                              )}
                            </td>

                            {/* 10. Attachment 6 (Transfer Slip) */}
                            <td>
                              {att6.exists ? (
                                <button
                                  type="button"
                                  className="records-view-btn"
                                  onClick={() => handleOpenDoc(order, 'ATTACHMENT_6', '', 'Finish Product Transfer Slip (Attachment 6)')}
                                >
                                  <span>View</span>
                                  <span className="records-view-btn-sub">Transfer Slip</span>
                                </button>
                              ) : (
                                <span className="records-cell-dash">-</span>
                              )}
                            </td>

                            {/* 11. BMR */}
                            <td>
                              {!bmr.has_bmr ? (
                                <span className="records-cell-dash" title="Not applicable for this product type">-</span>
                              ) : bmr.exists ? (
                                <button
                                  type="button"
                                  className="records-view-btn"
                                  onClick={() => handleOpenDoc(order, 'BMR', '', 'Batch Manufacturing Record (BMR)')}
                                >
                                  <span>View</span>
                                  <span className="records-view-btn-sub">19-Pg BMR</span>
                                </button>
                              ) : (
                                <span className="records-cell-dash">-</span>
                              )}
                            </td>

                            {/* 12. COA */}
                            <td>
                              {isCoaReturned ? (
                                <div>
                                  <span className="records-cell-dash">-</span>
                                  <div className="records-badge-coa-returned">
                                    COA returned to QC
                                  </div>
                                </div>
                              ) : coa.exists ? (
                                <button
                                  type="button"
                                  className="records-view-btn"
                                  onClick={() => handleOpenDoc(order, 'COA', '', 'Certificate of Analysis (COA)')}
                                >
                                  <span>View</span>
                                  <span className="records-view-btn-sub">CoA Sheet</span>
                                </button>
                              ) : (
                                <span className="records-cell-dash">-</span>
                              )}
                            </td>

                            {/* 13. Invoice */}
                            <td>
                              {invoice.exists ? (
                                <button
                                  type="button"
                                  className="records-view-btn"
                                  onClick={() => handleOpenDoc(order, 'INVOICE', '', 'Tax Invoice')}
                                >
                                  <span>View</span>
                                  <span className="records-view-btn-sub">Invoice</span>
                                </button>
                              ) : (
                                <span className="records-cell-dash">-</span>
                              )}
                            </td>

                            {/* 14. Actions (Return to Production | Back to COA) */}
                            <td>
                              <div className="records-actions-cell">
                                <button
                                  type="button"
                                  className="records-btn-return-prod"
                                  onClick={() => handleOpenReturnToProd(order)}
                                  title="Return order back to active Production (unlocks BMR & production attachments)"
                                >
                                  ↩ Return to Production
                                </button>

                                <button
                                  type="button"
                                  className="records-btn-back-coa"
                                  onClick={() => handleOpenBackToCoa(order)}
                                  title="Return COA to QC for revisions"
                                >
                                  ↩ Back to COA
                                </button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* PAGINATION */}
            <div className="records-pagination">
              <div>
                Showing {(currentPage - 1) * pageSize + 1} to{' '}
                {Math.min(currentPage * pageSize, filteredOrders.length)} of {filteredOrders.length} records
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button
                  type="button"
                  className="records-page-btn"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <span style={{ fontWeight: 700, margin: '0 6px', color: '#1e293b' }}>
                  {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  className="records-page-btn"
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

      {/* DOCUMENT READ-ONLY VIEWER MODAL (Records mode only, hidden in dispatch mode) */}
      {!isDispatchMode && (
        <OrderDocumentViewerModal
          isOpen={viewerState.isOpen}
          onClose={() => setViewerState({ isOpen: false, order: null, docType: '', subType: '', title: '' })}
          order={viewerState.order}
          docType={viewerState.docType}
          subType={viewerState.subType}
          title={viewerState.title}
        />
      )}

      {/* RETURN ACTIONS CONFIRMATION DIALOG */}
      {actionDialog.isOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
          }}
          onClick={() => !actionDialog.loading && setActionDialog((p) => ({ ...p, isOpen: false }))}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              maxWidth: '500px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
              overflow: 'hidden',
              border: '1px solid #e2e8f0',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              style={{
                backgroundColor: actionDialog.actionType === 'RETURN_TO_PROD' ? '#ea580c' : '#16a34a',
                color: '#ffffff',
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#ffffff' }}>
                {actionDialog.actionType === 'RETURN_TO_PROD' ? '↩ Return Order to Production' : '↩ Return COA to QC'}
              </h3>
              <button
                type="button"
                onClick={() => !actionDialog.loading && setActionDialog((p) => ({ ...p, isOpen: false }))}
                style={{ background: 'none', border: 'none', color: '#ffffff', fontSize: '20px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px' }}>
              <p style={{ margin: '0 0 12px 0', fontSize: '13.5px', color: '#334155', lineHeight: 1.5 }}>
                {actionDialog.actionType === 'RETURN_TO_PROD' ? (
                  <>
                    Are you sure you want to return Order <strong>#{actionDialog.order?.order_number || actionDialog.order?.id}</strong> to active Production?
                    <br />
                    <span style={{ fontSize: 12, color: '#64748b' }}>
                      This will unlock the BMR and production attachments for editing and remove the order from Records and Dispatch until re-dispatched.
                    </span>
                  </>
                ) : (
                  <>
                    Are you sure you want to return the COA for Order <strong>#{actionDialog.order?.order_number || actionDialog.order?.id}</strong> back to QC?
                    <br />
                    <span style={{ fontSize: 12, color: '#64748b' }}>
                      This will unlock the COA in the QC module. The COA cell will show &quot;COA returned to QC&quot; until marked complete again. Other attachments and BMR remain locked.
                    </span>
                  </>
                )}
              </p>

              {actionDialog.error && (
                <div style={{ backgroundColor: '#fef2f2', border: '1px solid #f87171', borderRadius: '6px', padding: '10px', marginBottom: '12px', color: '#991b1b', fontSize: '12.5px' }}>
                  ⚠️ {actionDialog.error}
                </div>
              )}

              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                Reason for Return (Optional)
              </label>
              <textarea
                rows={2}
                value={actionDialog.reason}
                onChange={(e) => setActionDialog((p) => ({ ...p, reason: e.target.value }))}
                placeholder="Enter modification notes or revision reason..."
                disabled={actionDialog.loading}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                  fontFamily: 'inherit',
                }}
              />
            </div>

            {/* Footer */}
            <div
              style={{
                padding: '14px 20px',
                backgroundColor: '#f8fafc',
                borderTop: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '10px',
              }}
            >
              <button
                type="button"
                disabled={actionDialog.loading}
                onClick={() => setActionDialog((p) => ({ ...p, isOpen: false }))}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#ffffff',
                  color: '#475569',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: actionDialog.loading ? 'not-allowed' : 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionDialog.loading}
                onClick={handleConfirmAction}
                style={{
                  padding: '8px 18px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: actionDialog.actionType === 'RETURN_TO_PROD' ? '#ea580c' : '#16a34a',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: actionDialog.loading ? 'not-allowed' : 'pointer',
                }}
              >
                {actionDialog.loading ? '⏳ Processing…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
