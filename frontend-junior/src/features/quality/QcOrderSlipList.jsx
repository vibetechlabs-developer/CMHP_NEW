import React, { useState, useMemo } from 'react'
import Button from '../../components/Button'
import StatusPill from '../../components/StatusPill'
import '../inventory/tabs/CommonInventory.css'

export const PRODUCT_TYPES_LIST = [
  { value: 'ALL', label: 'All Product Types' },
  { value: 'tablet', label: 'Tablet' },
  { value: 'oil', label: 'Oil' },
  { value: 'syrup', label: 'Syrup' },
  { value: 'drops', label: 'Drops' },
  { value: 'mother-tincture', label: 'Mother Tincture' },
  { value: 'capsule', label: 'Capsule' },
  { value: 'liquid', label: 'Liquid' },
  { value: 'pills', label: 'Pills' },
  { value: 'kits', label: 'Kits' },
]

export default function QcOrderSlipList({
  slipKind = 'bulk_release', // 'bulk_release' | 'test_request'
  orders = [],
  loading = false,
  filters = {},
  onFilterChange,
  onResetFilters,
  onOpenSlip,
  onMarkComplete,
  onReturnToPending,
}) {
  const [viewMode, setViewMode] = useState('pending') // 'pending' | 'completed'
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 10

  const { search = '', productType = 'ALL', dateFrom = '', dateTo = '', datePreset = '' } = filters

  // Apply filters
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      // 1. Completion view filter
      const isCompleted = order.qcStatus === 'COMPLETED'
      if (viewMode === 'completed' && !isCompleted) return false
      if (viewMode === 'pending' && isCompleted) return false

      // 2. Search filter (Order No., Product, Batch No.)
      if (search.trim()) {
        const q = search.toLowerCase()
        const orderNo = String(order.orderNumber || order.id || '').toLowerCase()
        const prod = String(order.productName || '').toLowerCase()
        const batch = String(order.batchNo || '').toLowerCase()
        if (!orderNo.includes(q) && !prod.includes(q) && !batch.includes(q)) {
          return false
        }
      }

      // 3. Product type filter
      if (productType !== 'ALL') {
        const pType = String(order.productType || '').toLowerCase()
        if (pType !== productType.toLowerCase()) return false
      }

      // 4. Date filter (from / to)
      if (dateFrom || dateTo) {
        const oDate = String(order.orderDate || '').slice(0, 10)
        if (dateFrom && oDate && oDate < dateFrom) return false
        if (dateTo && oDate && oDate > dateTo) return false
      }

      return true
    })
  }, [orders, viewMode, search, productType, dateFrom, dateTo])

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / pageSize))
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredOrders.slice(start, start + pageSize)
  }, [filteredOrders, currentPage, pageSize])

  // Counts for tabs
  const pendingCount = useMemo(() => orders.filter((o) => o.qcStatus !== 'COMPLETED').length, [orders])
  const completedCount = useMemo(() => orders.filter((o) => o.qcStatus === 'COMPLETED').length, [orders])

  const handleDatePreset = (preset) => {
    const today = new Date().toISOString().slice(0, 10)
    let from = ''
    if (preset === 'today') {
      from = today
    } else if (preset === 'week') {
      const d = new Date()
      d.setDate(d.getDate() - 7)
      from = d.toISOString().slice(0, 10)
    } else if (preset === 'month') {
      const d = new Date()
      d.setDate(1)
      from = d.toISOString().slice(0, 10)
    }
    onFilterChange({
      ...filters,
      datePreset: preset,
      dateFrom: from,
      dateTo: today,
    })
    setCurrentPage(1)
  }

  const handleClearPresetOrDates = () => {
    onFilterChange({
      ...filters,
      datePreset: '',
      dateFrom: '',
      dateTo: '',
    })
    setCurrentPage(1)
  }

  const isFiltered = Boolean(search || productType !== 'ALL' || dateFrom || dateTo)

  const slipKindTitle =
    slipKind === 'test_request'
      ? 'Test Request Slips (Attachment-2)'
      : 'Bulk Release Slips (Attachment-3)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ── Sub-nav: Pending vs Completed ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: 10, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className={`btn ${viewMode === 'pending' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: 13, padding: '7px 16px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            onClick={() => { setViewMode('pending'); setCurrentPage(1); }}
          >
            <span>⏳ Pending &amp; In-Progress</span>
            <span style={{
              background: viewMode === 'pending' ? 'rgba(255,255,255,0.25)' : '#e2e8f0',
              color: viewMode === 'pending' ? '#ffffff' : '#334155',
              padding: '1px 7px',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 700,
            }}>
              {pendingCount}
            </span>
          </button>
          <button
            type="button"
            className={`btn ${viewMode === 'completed' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: 13, padding: '7px 16px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            onClick={() => { setViewMode('completed'); setCurrentPage(1); }}
          >
            <span>✅ Completed Slips</span>
            <span style={{
              background: viewMode === 'completed' ? 'rgba(255,255,255,0.25)' : '#dcfce7',
              color: viewMode === 'completed' ? '#ffffff' : '#166534',
              padding: '1px 7px',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 700,
            }}>
              {completedCount}
            </span>
          </button>
        </div>

        <div style={{ fontSize: 12.5, color: '#64748b' }}>
          Showing orders from Production BMR • {slipKindTitle}
        </div>
      </div>

      {/* ── Filters Bar ── */}
      <div style={{
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        borderRadius: 10,
        padding: '12px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Search by Order No / Product / Batch */}
          <div style={{ flex: '1 1 240px', minWidth: 200 }}>
            <input
              type="text"
              className="company-input"
              style={{ width: '100%', fontSize: 12.5 }}
              placeholder="🔍 Search Order No, Product, Batch…"
              value={search}
              onChange={(e) => {
                onFilterChange({ ...filters, search: e.target.value })
                setCurrentPage(1)
              }}
            />
          </div>

          {/* Product Type dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>
              🏷️ Product Type:
            </label>
            <select
              className="company-input"
              style={{ fontSize: 12, minWidth: 160 }}
              value={productType}
              onChange={(e) => {
                onFilterChange({ ...filters, productType: e.target.value })
                setCurrentPage(1)
              }}
            >
              {PRODUCT_TYPES_LIST.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Date range inputs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>📅 Date:</span>
            <input
              type="date"
              className="company-input"
              style={{ fontSize: 11.5, padding: '4px 6px', width: 130 }}
              value={dateFrom}
              onChange={(e) => {
                onFilterChange({ ...filters, dateFrom: e.target.value, datePreset: '' })
                setCurrentPage(1)
              }}
              title="From date"
            />
            <span style={{ fontSize: 12, color: '#94a3b8' }}>to</span>
            <input
              type="date"
              className="company-input"
              style={{ fontSize: 11.5, padding: '4px 6px', width: 130 }}
              value={dateTo}
              onChange={(e) => {
                onFilterChange({ ...filters, dateTo: e.target.value, datePreset: '' })
                setCurrentPage(1)
              }}
              title="To date"
            />
          </div>
        </div>

        {/* Date presets & Clear filters row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, paddingTop: 6, borderTop: '1px solid #f1f5f9' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: '#64748b' }}>Quick Presets:</span>
            {[
              { id: 'today', label: 'Today' },
              { id: 'week', label: 'This Week' },
              { id: 'month', label: 'This Month' },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                style={{
                  fontSize: 11.5,
                  padding: '3px 9px',
                  borderRadius: 6,
                  border: '1px solid',
                  borderColor: datePreset === p.id ? '#2563eb' : '#cbd5e1',
                  background: datePreset === p.id ? '#eff6ff' : '#ffffff',
                  color: datePreset === p.id ? '#1d4ed8' : '#475569',
                  fontWeight: datePreset === p.id ? 700 : 500,
                  cursor: 'pointer',
                }}
                onClick={() => handleDatePreset(p.id)}
              >
                {p.label}
              </button>
            ))}
            {(dateFrom || dateTo) && (
              <button
                type="button"
                style={{ fontSize: 11, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', marginLeft: 4 }}
                onClick={handleClearPresetOrDates}
              >
                Clear date
              </button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, color: '#64748b' }}>
              Showing <strong>{filteredOrders.length}</strong> {filteredOrders.length === 1 ? 'order' : 'orders'}
            </span>
            {isFiltered && (
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: 11.5, padding: '3px 10px' }}
                onClick={onResetFilters}
              >
                ✕ Clear filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Orders Table ── */}
      <div className="ci-table-wrap">
        <table className="ci-table">
          <thead>
            <tr>
              <th style={{ width: 120 }}>Order No.</th>
              <th>Product</th>
              <th style={{ width: 140 }}>Product Type</th>
              <th style={{ width: 130 }}>Batch No.</th>
              <th style={{ width: 120 }}>Batch Qty</th>
              <th style={{ width: 110 }}>Order Date</th>
              <th style={{ width: 120 }}>QC Status</th>
              <th style={{ width: 170, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', color: '#64748b', padding: 36 }}>
                  ⏳ Loading production orders…
                </td>
              </tr>
            ) : filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', color: '#94a3b8', padding: 36 }}>
                  <div style={{ fontSize: 24, marginBottom: 6 }}>📭</div>
                  <strong>No orders found.</strong>
                  <div style={{ fontSize: 12, marginTop: 4, color: '#64748b' }}>
                    {viewMode === 'completed'
                      ? 'No completed slips yet. Mark a pending order as complete to see it here.'
                      : 'No pending orders match your filters. Try clearing your filters.'}
                  </div>
                </td>
              </tr>
            ) : (
              paginatedOrders.map((order) => {
                const isCompleted = order.qcStatus === 'COMPLETED'
                const statusTone =
                  order.qcStatus === 'COMPLETED'
                    ? 'success'
                    : order.qcStatus === 'SAVED'
                    ? 'info'
                    : 'warning'
                const statusLabel =
                  order.qcStatus === 'COMPLETED'
                    ? '✓ Completed'
                    : order.qcStatus === 'SAVED'
                    ? '💾 Saved Draft'
                    : '⏳ Pending'

                return (
                  <tr key={order.id}>
                    <td style={{ fontWeight: 700, fontSize: 12.5, color: '#0f172a' }}>
                      {order.orderNumber}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{order.productName}</div>
                      {order.customer_name && (
                        <div style={{ fontSize: 11, color: '#64748b' }}>Cust: {order.customer_name}</div>
                      )}
                    </td>
                    <td>
                      <StatusPill tone="info">{order.productTypeDisplay}</StatusPill>
                    </td>
                    <td>
                      <span style={{ background: '#f1f5f9', color: '#334155', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 700 }}>
                        {order.batchNo}
                      </span>
                    </td>
                    <td style={{ fontSize: 12 }}>{order.batchSize}</td>
                    <td style={{ fontSize: 12, color: '#475569' }}>{order.orderDate}</td>
                    <td>
                      <StatusPill tone={statusTone}>{statusLabel}</StatusPill>
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        <Button
                          size="xs"
                          variant={isCompleted ? 'secondary' : 'primary'}
                          onClick={() => onOpenSlip(order, isCompleted)}
                        >
                          {isCompleted ? '👁️ View Slip' : '📝 Open Slip'}
                        </Button>
                        {!isCompleted ? (
                          <Button
                            size="xs"
                            variant="secondary"
                            onClick={() => onMarkComplete(order)}
                            title="Mark this QC slip as complete"
                          >
                            ✓ Complete
                          </Button>
                        ) : (
                          <Button
                            size="xs"
                            variant="secondary"
                            onClick={() => onReturnToPending(order)}
                            title="Return this order back to Pending status"
                          >
                            ↩ Return
                          </Button>
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

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 4px', fontSize: 12 }}>
          <span style={{ color: '#64748b' }}>
            Page {currentPage} of {totalPages} ({filteredOrders.length} total orders)
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <Button
              size="xs"
              variant="secondary"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              ← Prev
            </Button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
              .map((page, idx, arr) => (
                <React.Fragment key={page}>
                  {idx > 0 && page - arr[idx - 1] > 1 && (
                    <span style={{ padding: '0 4px', color: '#94a3b8' }}>…</span>
                  )}
                  <button
                    type="button"
                    style={{
                      padding: '2px 8px',
                      fontSize: 11.5,
                      fontWeight: page === currentPage ? 700 : 500,
                      borderRadius: 4,
                      border: '1px solid',
                      borderColor: page === currentPage ? '#2563eb' : '#cbd5e1',
                      background: page === currentPage ? '#2563eb' : '#ffffff',
                      color: page === currentPage ? '#ffffff' : '#334155',
                      cursor: 'pointer',
                    }}
                    onClick={() => setCurrentPage(page)}
                  >
                    {page}
                  </button>
                </React.Fragment>
              ))}
            <Button
              size="xs"
              variant="secondary"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            >
              Next →
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
