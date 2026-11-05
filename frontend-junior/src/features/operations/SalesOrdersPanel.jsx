import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import Button from '../../components/Button'
import Alert from '../../components/Alert'
import Spinner, { LoadingState } from '../../components/Spinner'
import usePermissions from '../../hooks/usePermissions'
import useAuth from '../../hooks/useAuth'
import { deleteOrderErrorMessage, deleteSalesOrder, listSalesOrders, updateOrderStatus } from './salesOrdersService'
import { getErrorMessage } from '../../utils/errors'
import SalesOrderFormModal from './SalesOrderFormModal'
import ConfirmDialog from './ConfirmDialog'
import ImportSalesOrdersModal from './ImportSalesOrdersModal'

export default function SalesOrdersPanel() {
  const { loading: permissionsLoading, error: permissionsError, realCompanyId, hasPermission } = usePermissions()
  const { user } = useAuth()
  const operatingCompany = user?.profile?.real_companies?.find((company) => company.id === realCompanyId)
  const companyCode = operatingCompany?.code || ''
  const companyName = operatingCompany?.legal_name || 'CMHP Pharma'

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [data, setData] = useState({ count: 0, results: [] })
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState('')
  const [formState, setFormState] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState({}) // { [orderId]: true }
  const deletingRef = useRef(false)

  // Filters from SS 3
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [deadlineFilter, setDeadlineFilter] = useState('ALL')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const requestIdRef = useRef(0)

  const canView = hasPermission('sales_orders.view')
  const canCreate = hasPermission('sales_orders.create')
  const canDelete = hasPermission('sales_orders.delete')

  useEffect(() => {
    setPage(1)
  }, [search, realCompanyId, typeFilter, statusFilter, deadlineFilter, startDate, endDate, pageSize])

  useEffect(() => {
    if (permissionsLoading) return
    if (!realCompanyId || !canView) {
      setData({ count: 0, results: [] })
      return
    }
    const thisRequestId = ++requestIdRef.current
    setListLoading(true)
    setListError('')
    listSalesOrders(realCompanyId, { page, pageSize, search, orderDateFrom: startDate || undefined, orderDateTo: endDate || undefined })
      .then((result) => {
        if (requestIdRef.current !== thisRequestId) return
        setData(result)
        setListLoading(false)
      })
      .catch((error) => {
        if (requestIdRef.current !== thisRequestId) return
        setListError(getErrorMessage(error))
        setListLoading(false)
      })
  }, [permissionsLoading, realCompanyId, canView, page, pageSize, search, startDate, endDate])

  const confirmDelete = async () => {
    const order = pendingDelete
    if (!order || deletingRef.current) return
    deletingRef.current = true
    setDeleting(true)
    try {
      await deleteSalesOrder(realCompanyId, order.id, order.version)
      setPendingDelete(null)
      refreshList()
    } catch (error) {
      setPendingDelete(null)
      setListError(deleteOrderErrorMessage(error))
      if (error?.response?.status === 409 || error?.response?.status === 404) refreshList()
    } finally {
      deletingRef.current = false
      setDeleting(false)
    }
  }

  const refreshList = () => {
    if (!realCompanyId) return
    setListLoading(true)
    listSalesOrders(realCompanyId, { page, pageSize, search, orderDateFrom: startDate || undefined, orderDateTo: endDate || undefined })
      .then((result) => {
        setData(result)
        setListLoading(false)
      })
      .catch((error) => {
        setListError(getErrorMessage(error))
        setListLoading(false)
      })
  }

  // Inline lifecycle stage change handler
  const handleStatusChange = async (order, newStatus) => {
    if (!newStatus || newStatus === order.status) return
    setUpdatingStatus((prev) => ({ ...prev, [order.id]: true }))
    try {
      await updateOrderStatus(realCompanyId, order.id, newStatus, order.version)
      // Optimistically update local state so the badge changes immediately
      setData((prev) => ({
        ...prev,
        results: prev.results.map((o) =>
          o.id === order.id ? { ...o, status: newStatus, version: (o.version || 0) + 1 } : o
        ),
      }))
    } catch (error) {
      setListError(`Could not update status: ${getErrorMessage(error)}`)
      refreshList() // reload fresh data on conflict
    } finally {
      setUpdatingStatus((prev) => ({ ...prev, [order.id]: false }))
    }
  }

  // 1. Clean order number helper (Replaces ugly reference UUID like SO-20261027-B097546E20)
  const getCleanOrderNumber = (order, index) => {
    const ref = (order.customer_order_reference || '').trim()
    if (ref && !ref.startsWith('SO-')) {
      return ref
    }
    return `ORD-2026-${String(order.id || index + 1).padStart(4, '0')}`
  }

  // 2. Section Badges helper (Admin, Mgr, Store)
  // Admin (A) = ALWAYS completed once the order exists/has been saved — creating the order IS the admin action.
  // Mgr (B)   = Completed when order is CONFIRMED or any production stage.
  // Store (C) = Completed when PACKED, DISPATCHED, or COMPLETED.
  const getSectionBadges = (order) => {
    const s = String(order?.status || '').toUpperCase()

    // Admin is done as long as the order has been saved (has an id or any data).
    // Creating / saving the order is the Admin's job, so it's always completed.
    const adminDone = !!(order?.id || order?.order_date || order?.customer_name || order?.customer_id)

    // Mgr done: order is confirmed or in any production/packaging/QC stage
    const mgrDone =
      ['CONFIRMED', 'STORE_PREP', 'PRODUCTION', 'QC_PENDING', 'QC PENDING', 'PACKAGING',
       'READY_TO_INVOICE', 'READY TO INVOICE', 'PACKED', 'DISPATCHED', 'COMPLETED',
       'IN_PROGRESS'].includes(s)

    // Store done: packed and beyond
    const storeDone = ['PACKED', 'DISPATCHED', 'COMPLETED'].includes(s)

    return [
      { key: 'A (Admin):', state: adminDone ? '✓ Completed' : '• Pending', isDone: adminDone },
      { key: 'B (Mgr):', state: mgrDone ? '✓ Completed' : '• Pending', isDone: mgrDone },
      { key: 'C (Store):', state: storeDone ? '✓ Completed' : '• Pending', isDone: storeDone },
    ]
  }

  // 3. Status Badge Class Helper
  const getStatusBadgeClass = (status) => {
    const s = String(status || 'draft').toLowerCase().replace(/[^a-z_]/g, '')
    if (s.includes('storeprep') || s.includes('store_prep')) return 'so-sb-storeprep'
    if (s.includes('production')) return 'so-sb-production'
    if (s.includes('packag')) return 'so-sb-packaging'
    if (s.includes('ready')) return 'so-sb-readytoinvoice'
    if (s.includes('packed')) return 'so-sb-packed'
    if (s.includes('dispatch')) return 'so-sb-dispatched'
    if (s.includes('qc') || s.includes('qcpend')) return 'so-sb-qcpending'
    if (s.includes('confirm')) return 'so-sb-confirmed'
    if (s.includes('complete')) return 'so-sb-completed'
    return 'so-sb-draft'
  }

  // 4. Batch Number Helper — Format: COMPANYCODE-YYYY-0001
  const getBatchNumber = (order, index) => {
    if (order.batch_no) return order.batch_no
    if (order.notes && order.notes.includes('BAT-')) {
      const match = order.notes.match(/BAT-[\w-]+/)
      if (match) return match[0]
    }
    if (order.notes && order.notes.includes('QA-')) {
      const match = order.notes.match(/QA-[\w-]+/)
      if (match) return match[0]
    }
    // Use customer code for batch number: CUSTOMERCODE-YYYY-0001
    const year = new Date().getFullYear()
    const code = (order.customer_code || companyCode || 'CMHP').toUpperCase()
    const seq = String(order.id || index + 1).padStart(4, '0')
    return `${code}-${year}-${seq}`
  }

  // 5. 6 KPI Summary Cards Calculation
  const stats = useMemo(() => {
    const list = data.results || []
    const now = new Date()
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

    let pending = 0
    let inProgress = 0
    let completed = 0
    let dueSoon = 0
    let overdue = 0

    list.forEach((o) => {
      const s = String(o.status || 'DRAFT').toUpperCase()
      if (s === 'DRAFT' || s === 'PENDING') pending++
      else if (['COMPLETED', 'PACKED', 'DISPATCHED'].includes(s)) completed++
      else inProgress++

      const dateStr = o.requested_delivery_date || o.planned_manufacturing_date || o.order_date
      if (dateStr) {
        const d = new Date(dateStr)
        if (!isNaN(d.getTime())) {
          if (d < now && s !== 'COMPLETED' && s !== 'PACKED' && s !== 'DISPATCHED') overdue++
          else if (d <= in7Days && d >= now) dueSoon++
        }
      }
    })

    return {
      total: data.count || list.length,
      pending,
      inProgress,
      completed,
      dueSoon,
      overdue,
    }
  }, [data])

  // Filtered rows for client-side filter options
  const displayRows = useMemo(() => {
    let rows = data.results || []

    if (typeFilter !== 'ALL') {
      rows = rows.filter((order) => {
        const typeStr = (order.lines || [])
          .map((l) => `${l.product_type_snapshot || ''} ${l.product_name || ''}`)
          .join(' ')
          .toLowerCase()
        return typeStr.includes(typeFilter.toLowerCase())
      })
    }

    if (statusFilter !== 'ALL') {
      rows = rows.filter((order) => {
        const s = String(order.status || '').toUpperCase()
        return s === statusFilter.toUpperCase()
      })
    }

    if (deadlineFilter !== 'ALL') {
      const now = new Date()
      const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

      rows = rows.filter((order) => {
        const dateStr = order.requested_delivery_date || order.planned_manufacturing_date || order.order_date
        if (!dateStr) return true
        const d = new Date(dateStr)
        if (isNaN(d.getTime())) return true

        if (deadlineFilter === 'DUE_SOON') {
          return d <= in7Days && d >= now
        }
        if (deadlineFilter === 'OVERDUE') {
          return d < now && order.status !== 'COMPLETED'
        }
        if (deadlineFilter === 'ON_TIME') {
          return d > in7Days
        }
        return true
      })
    }

    return rows
  }, [data.results, typeFilter, statusFilter, deadlineFilter])

  if (permissionsLoading) {
    return (
      <div className="inv-panel">
        <LoadingState label="Checking your access…" />
      </div>
    )
  }

  if (permissionsError) {
    return (
      <div className="inv-panel">
        <Alert type="error">Could not load your permissions for this company: {getErrorMessage(permissionsError)}</Alert>
      </div>
    )
  }

  if (!realCompanyId) {
    return (
      <div className="inv-panel">
        <Alert type="error">
          No real company is linked to the current workspace. Sales orders cannot be shown for a mock-only workspace.
        </Alert>
      </div>
    )
  }

  if (!canView) {
    return (
      <div className="inv-panel">
        <Alert type="error">
          Access unavailable. You cannot see sales orders for this company. Ask an administrator for access.
        </Alert>
      </div>
    )
  }

  const totalPages = Math.max(1, Math.ceil((data.count || displayRows.length) / pageSize))

  return (
    <div className="inv-panel">
      {/* 1. TOP HEADER MATCHING SS 3 */}
      <div className="so-dashboard-header">
        <div className="so-header-left">
          <h3>Sales Orders</h3>
          <p>Company sales orders, formula BOM production execution, delivery tracking and quality control.</p>
        </div>
        <div className="so-header-actions">
          {canCreate && (
            <button
              type="button"
              className="so-btn-import-csv"
              onClick={() => setImportModalOpen(true)}
              title="Import sales orders from CSV"
            >
              📥 Import CSV
            </button>
          )}
          {canCreate && (
            <button
              type="button"
              className="so-btn-create-order"
              onClick={() => setFormState({ mode: 'create' })}
            >
              + Create Order
            </button>
          )}
        </div>
      </div>

      {/* 2. 6 KPI SUMMARY STAT CARDS MATCHING SS 3 */}
      <div className="so-stat-cards-grid">
        <div className="so-stat-card so-sc-total">
          <span className="so-sc-title">Total Orders</span>
          <span className="so-sc-val">{stats.total}</span>
        </div>
        <div className="so-stat-card so-sc-pending">
          <span className="so-sc-title">Pending</span>
          <span className="so-sc-val">{stats.pending}</span>
        </div>
        <div className="so-stat-card so-sc-inprogress">
          <span className="so-sc-title">In Progress</span>
          <span className="so-sc-val">{stats.inProgress}</span>
        </div>
        <div className="so-stat-card so-sc-completed">
          <span className="so-sc-title">Completed</span>
          <span className="so-sc-val">{stats.completed}</span>
        </div>
        <div className="so-stat-card so-sc-duesoon">
          <span className="so-sc-title">Due Soon (&lt;7d)</span>
          <span className="so-sc-val">{stats.dueSoon}</span>
        </div>
        <div className="so-stat-card so-sc-overdue">
          <span className="so-sc-title">Overdue</span>
          <span className="so-sc-val">{stats.overdue}</span>
        </div>
      </div>

      {/* 3. SEARCH & FILTER BAR MATCHING SS 3 */}
      <div className="so-filter-bar">
        <input
          className="so-filter-search"
          type="text"
          placeholder="Search by order # or customer..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select
          className="so-filter-select"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="ALL">All Types</option>
          <option value="Tablet">Tablet</option>
          <option value="Capsule">Capsule</option>
          <option value="Drops">Drops</option>
          <option value="Syrup">Syrup</option>
          <option value="Liquid">Liquid</option>
        </select>

        <select
          className="so-filter-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="ALL">All Statuses</option>
          <option value="DRAFT">DRAFT</option>
          <option value="CONFIRMED">CONFIRMED</option>
          <option value="PACKAGING">PACKAGING</option>
          <option value="Ready to Invoice">Ready to Invoice</option>
          <option value="PACKED">PACKED</option>
          <option value="Dispatched">Dispatched</option>
          <option value="QC Pending">QC Pending</option>
          <option value="COMPLETED">COMPLETED</option>
        </select>

        <select
          className="so-filter-select"
          value={deadlineFilter}
          onChange={(e) => setDeadlineFilter(e.target.value)}
        >
          <option value="ALL">All Deadlines</option>
          <option value="DUE_SOON">Due Soon (&lt;7d)</option>
          <option value="OVERDUE">Overdue</option>
          <option value="ON_TIME">On Time</option>
        </select>

        <input
          type="date"
          className="so-filter-date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          placeholder="dd-mm-yyyy"
          title="Filter from order date"
        />

        <input
          type="date"
          className="so-filter-date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          placeholder="dd-mm-yyyy"
          title="Filter to order date"
        />

        <select
          className="so-filter-pagesize"
          value={pageSize}
          onChange={(e) => setPageSize(Number(e.target.value))}
        >
          <option value={10}>10 / page</option>
          <option value={20}>20 / page</option>
          <option value={50}>50 / page</option>
        </select>
      </div>

      {listError && <Alert type="error">{listError}</Alert>}

      {/* 4. ORDERS DATA TABLE MATCHING SS 3 COLUMNS */}
      <div className="inv-table-scroll">
        <table className="so-rich-table">
          <thead>
            <tr>
              <th style={{ minWidth: 120 }}>Order #</th>
              <th style={{ minWidth: 180 }}>Product</th>
              <th style={{ minWidth: 90 }}>BMR</th>
              <th style={{ minWidth: 120 }}>Company</th>
              <th style={{ minWidth: 110 }}>Date of Order</th>
              <th style={{ minWidth: 120 }}>Planned Mfg Date</th>
              <th style={{ minWidth: 110 }}>Batch No.</th>
              <th style={{ minWidth: 130 }}>Section Badges</th>
              <th style={{ minWidth: 160 }}>Customer</th>
              <th style={{ minWidth: 110 }}>Total Amount</th>
              <th style={{ minWidth: 110 }}>Status</th>
              <th style={{ minWidth: 90 }}>Sample Qty</th>
              <th style={{ minWidth: 110 }}>Packaging Qty</th>
              <th style={{ minWidth: 140 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {listLoading ? (
              <tr>
                <td colSpan={14} style={{ textAlign: 'center', padding: 36 }}>
                  <Spinner tone="brand" label="Loading sales orders…" />
                </td>
              </tr>
            ) : displayRows.length === 0 ? (
              <tr>
                <td colSpan={14} style={{ textAlign: 'center', padding: 36, color: '#64748b' }}>
                  No sales orders found matching your filters.
                </td>
              </tr>
            ) : (
              displayRows.map((order, idx) => {
                const orderNum = getCleanOrderNumber(order, idx)
                const firstLine = order.lines?.[0]
                const totalUnits = (order.lines || []).reduce((acc, l) => acc + (Number(l.quantity) || 0), 0)
                const sectionBadges = getSectionBadges(order)
                const statusBadgeClass = getStatusBadgeClass(order.status)
                const isUpdating = !!updatingStatus[order.id]
                const batchNumber = getBatchNumber(order, idx)
                const productName = firstLine?.product_name || firstLine?.product_code || 'Pharmaceutical Medicine'
                const bmrUrl = firstLine?.product_id
                  ? `/production/bmr?productId=${firstLine.product_id}&productCode=${encodeURIComponent(firstLine.product_code || '')}&productName=${encodeURIComponent(productName)}&bmrNo=${encodeURIComponent(firstLine.bmr_no || '')}&productType=${encodeURIComponent(firstLine.product_type_snapshot || '')}&packSize=${encodeURIComponent(firstLine.pack_size || '')}&orderId=${encodeURIComponent(order.id || '')}&returnTo=/orders`
                  : null

                // Format sample & packaging quantities
                const sampleQtyText = order.sample_qty
                  ? `${Number(order.sample_qty).toLocaleString(undefined, { maximumFractionDigits: 3 })} ${order.sample_unit || 'Bottles'}`
                  : '—'
                const packQtyText =
                  totalUnits > 0
                    ? `${totalUnits.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${firstLine?.sales_uom_code || 'BOX'}`
                    : '—'

                return (
                  <tr key={order.id || idx}>
                    {/* 1. ORDER # (Replaces ugly reference UUID) */}
                    <td>
                      <span className="so-order-num">{orderNum}</span>
                    </td>

                    {/* 2. PRODUCT */}
                    <td>
                      <div className="so-product-info">
                        <span className="so-product-name">
                          {productName}
                        </span>
                        <span className="so-product-sub">
                          {firstLine?.product_code ? `Code: ${firstLine.product_code}` : ''}
                          {firstLine?.product_type_snapshot
                            ? ` · Type: ${firstLine.product_type_snapshot}`
                            : ' · Type: Drops'}
                        </span>
                      </div>
                    </td>

                    {/* 3. BMR — same document link as Products */}
                    <td>
                      {bmrUrl ? (
                        <Link
                          className="so-row-btn-bmr"
                          to={bmrUrl}
                          title={`Open BMR for ${productName}${firstLine?.bmr_no ? ` (${firstLine.bmr_no})` : ''}`}
                        >
                          📄 BMR
                        </Link>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>—</span>
                      )}
                    </td>

                    {/* 4. COMPANY */}
                    <td>
                      <span className="so-company-pill">{companyName || 'CMHP Pharma'}</span>
                    </td>

                    {/* 4. DATE OF ORDER */}
                    <td style={{ color: '#475569', fontSize: 12.5, whiteSpace: 'nowrap' }}>
                      {order.order_date || '—'}
                    </td>

                    {/* 5. PLANNED MFG DATE */}
                    <td style={{ color: '#475569', fontSize: 12.5, whiteSpace: 'nowrap' }}>
                      {order.planned_manufacturing_date || order.requested_delivery_date || order.order_date || '—'}
                    </td>

                    {/* 6. BATCH NO. */}
                    <td>
                      <span className="so-batch-pill">{batchNumber}</span>
                    </td>

                    {/* 7. SECTION BADGES (A Admin, B Mgr, C Store) */}
                    <td>
                      <div className="so-section-badges-stack">
                        {sectionBadges.map((badge, bIdx) => (
                          <span
                            key={bIdx}
                            className={`so-sec-badge ${badge.isDone ? 'so-sec-completed' : 'so-sec-pending'}`}
                          >
                            <span>{badge.key}</span>
                            <span>{badge.state}</span>
                          </span>
                        ))}
                      </div>
                    </td>

                    {/* 8. CUSTOMER */}
                    <td>
                      <span style={{ fontWeight: 600, color: '#1e293b', fontSize: 13 }}>
                        {order.customer_name || 'Valued Customer'}
                      </span>
                    </td>

                    {/* 9. TOTAL AMOUNT */}
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <span style={{ fontWeight: 700, color: '#0f172a', fontSize: 13 }}>
                        ₹{Number(order.subtotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </td>

                    {/* 10. STATUS - Interactive inline lifecycle stage changer */}
                    <td>
                      <div className="so-status-select-wrap">
                        <select
                          className={`so-status-select ${statusBadgeClass}`}
                          value={order.status || 'DRAFT'}
                          disabled={isUpdating}
                          onChange={(e) => handleStatusChange(order, e.target.value)}
                          title="Change production lifecycle stage"
                        >
                          <option value="DRAFT">DRAFT</option>
                          <option value="CONFIRMED">CONFIRMED</option>
                          <option value="STORE_PREP">STORE PREP</option>
                          <option value="PRODUCTION">PRODUCTION</option>
                          <option value="QC_PENDING">QC PENDING</option>
                          <option value="PACKAGING">PACKAGING</option>
                          <option value="READY_TO_INVOICE">READY TO INVOICE</option>
                          <option value="PACKED">PACKED</option>
                          <option value="DISPATCHED">DISPATCHED</option>
                          <option value="COMPLETED">COMPLETED</option>
                        </select>
                        <span className="so-status-select-arrow">{isUpdating ? '⏳' : '▾'}</span>
                      </div>
                    </td>

                    {/* 11. SAMPLE QTY */}
                    <td>
                      {sampleQtyText !== '—' ? (
                        <span className="so-qty-pill-sample">{sampleQtyText}</span>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>—</span>
                      )}
                    </td>

                    {/* 12. PACKAGING QTY */}
                    <td>
                      {packQtyText !== '—' ? (
                        <span className="so-qty-pill-packaging">{packQtyText}</span>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>—</span>
                      )}
                    </td>

                    {/* 13. ACTIONS */}
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          className="so-action-tag-btn"
                          onClick={() => setFormState({ mode: 'edit', orderId: order.id })}
                          title="Sample / Packaging execution"
                        >
                          Sample / Packaging
                        </button>
                        <button
                          type="button"
                          className="so-btn-edit"
                          onClick={() => setFormState({ mode: 'edit', orderId: order.id })}
                        >
                          {order.status === 'DRAFT' ? 'Edit' : 'View'}
                        </button>
                        {canDelete && order.status === 'DRAFT' && (
                          <button
                            type="button"
                            className="so-btn-delete"
                            onClick={() => setPendingDelete(order)}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Bar */}
      {totalPages > 1 && (
        <div className="inv-toolbar" style={{ marginTop: 16 }}>
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ← Previous
          </Button>
          <span style={{ fontSize: 13, color: '#64748b' }}>
            Page {page} of {totalPages}
          </span>
          <Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next →
          </Button>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {pendingDelete && (
        <ConfirmDialog
          title="Delete draft order?"
          message={
            <>
              <strong>{getCleanOrderNumber(pendingDelete, 0)}</strong>
              <br />
              This permanently removes the draft order. It cannot be undone. Orders that already have batch plans or store preparation cannot be deleted.
            </>
          }
          confirmLabel="Delete order"
          danger
          busy={deleting}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {/* Create / Edit Form Modal */}
      {formState && (
        <SalesOrderFormModal
          key={`${realCompanyId}-${user?.id ?? user?.username ?? ''}-${formState.mode}-${formState.orderId ?? ''}`}
          realCompanyId={realCompanyId}
          companyCode={companyCode}
          companyName={companyName}
          orderId={formState.mode === 'edit' ? formState.orderId : null}
          permissions={{
            loading: permissionsLoading,
            canCreateOrder: hasPermission('sales_orders.create'),
            canEditOrder: hasPermission('sales_orders.edit'),
            canConfirmOrder: hasPermission('sales_orders.confirm'),
            canAddCustomer: hasPermission('customers.create'),
            canEditProduct: hasPermission('products.edit'),
            canViewFormulas: hasPermission('formulas.view'),
            canViewBmr: hasPermission('bmr.view'),
            canCreateBmr: hasPermission('bmr.create'),
            canEditBmr: hasPermission('bmr.edit'),
            canViewBatch: hasPermission('batch_plans.view'),
            canCreateBatch: hasPermission('batch_plans.create'),
            canEditBatch: hasPermission('batch_plans.edit'),
            canAllocateBatch: hasPermission('batch_plans.allocate_number'),
            canEditPrinting: hasPermission('batch_plans.printing_edit'),
            canDeleteOrder: canDelete,
          }}
          onClose={() => setFormState(null)}
          onSaved={() => refreshList()}
        />
      )}

      {/* Import CSV Modal */}
      {importModalOpen && (
        <ImportSalesOrdersModal
          realCompanyId={realCompanyId}
          onClose={() => setImportModalOpen(false)}
          onImported={() => refreshList()}
        />
      )}
    </div>
  )
}
