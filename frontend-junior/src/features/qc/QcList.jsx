import { useEffect, useMemo, useState } from 'react'
import { useSelector } from 'react-redux'
import { useLocation, useNavigate } from 'react-router-dom'
import PageHeader from '../../components/PageHeader'
import StatusPill from '../../components/StatusPill'
import Button from '../../components/Button'
import { selectActiveCompanyKey } from '../../utils/companySelectors'
import { resolveOrderDosageForm } from '../production/productionService'
import { DOSAGE_FORMS } from '../../constants/dosageForms'
import { getQcTemplate, VERIFIED_QC_ORDERS } from './qcTemplates'
import './QcList.css'

export default function QcList({ onSelectOrder, companyId }) {
  const navigate = useNavigate()
  const location = useLocation()

  const activeCompKey = useSelector(selectActiveCompanyKey)
  const compKey = companyId === 2 || companyId === '2' ? 'cmhp' : (companyId === 3 || companyId === '3' ? 'tej' : activeCompKey)
  const rawReduxOrders = useSelector((state) => state.erp.byCompany?.[compKey]?.orders || state.erp.orders || [])
  // Merge VERIFIED_QC_ORDERS as guaranteed fallback so COA tab always shows orders
  const verifiedForComp = VERIFIED_QC_ORDERS.filter((o) => o.companyId === compKey)
  const reduxOrders = [
    ...rawReduxOrders,
    ...verifiedForComp.filter((v) => !rawReduxOrders.some((r) => String(r.id) === String(v.id))),
  ]
  const reduxDosageForms = useSelector((state) => state.erp.dosageForms || [])
  const dosageForms = reduxDosageForms.length ? reduxDosageForms : DOSAGE_FORMS

  // State
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [highlightedId, setHighlightedId] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 10

  // Filter only orders whose BMR is complete ("BMR complete" condition: bmr_status === 'YES')
  const bmrCompleteOrders = useMemo(() => {
    return reduxOrders
      .map((order) => {
        const dosage_form = resolveOrderDosageForm(order)
        return {
          ...order,
          dosage_form,
          dosageForm: dosage_form,
          bmr_status: order.bmr_status || 'NO',
        }
      })
      .filter((order) => (order.bmr_status || '').toUpperCase() === 'YES')
  }, [reduxOrders])

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

  // Filters (search + Type)
  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase()
    return bmrCompleteOrders.filter((order) => {
      // Type filter
      if (typeFilter !== 'ALL') {
        const orderType = (order.dosage_form || order.dosageForm || order.product_type || order.type || '').toLowerCase()
        if (orderType !== typeFilter.toLowerCase()) return false
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
  }, [bmrCompleteOrders, search, typeFilter])

  // Pagination
  const totalPages = Math.ceil(filteredOrders.length / pageSize) || 1
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredOrders.slice(start, start + pageSize)
  }, [filteredOrders, currentPage, pageSize])

  // Summary Metrics
  const oilCount = useMemo(() => {
    return bmrCompleteOrders.filter((o) => (o.dosage_form || '').toLowerCase() === 'oil').length
  }, [bmrCompleteOrders])

  const otherCount = bmrCompleteOrders.length - oilCount
  const isFiltered = Boolean(search || typeFilter !== 'ALL')

  const resetFilters = () => {
    setSearch('')
    setTypeFilter('ALL')
    setCurrentPage(1)
  }

  const handleOpenView = (orderId) => {
    if (onSelectOrder) {
      onSelectOrder(orderId)
    } else {
      navigate(`/qc/view/${orderId}`)
    }
  }

  return (
    <div className="qc-page-container">
      {!onSelectOrder && (
        <PageHeader
          title="Quality Control (QC)"
          subtitle="Finished product testing, analytical specifications, and Certificate of Analysis (CoA) management."
        />
      )}

      {/* KPI METRICS CARDS */}
      <div className="qc-kpi-grid">
        <div className="qc-kpi-card">
          <div className="qc-kpi-icon" style={{ background: '#f0fdf4', color: '#16a34a' }}>
            🔬
          </div>
          <div className="qc-kpi-info">
            <span className="qc-kpi-label">BMR Completed Orders</span>
            <span className="qc-kpi-value">{bmrCompleteOrders.length}</span>
            <span className="qc-kpi-subtext">Eligible for Certificate of Analysis</span>
          </div>
        </div>

        <div className="qc-kpi-card">
          <div className="qc-kpi-icon" style={{ background: '#ecfdf5', color: '#0d9488' }}>
            📜
          </div>
          <div className="qc-kpi-info">
            <span className="qc-kpi-label">Finished Product Oil (CoA Ready)</span>
            <span className="qc-kpi-value" style={{ color: '#0d9488' }}>{oilCount}</span>
            <span className="qc-kpi-subtext">SOP/QC/11/F-05/00 format</span>
          </div>
        </div>

        <div className="qc-kpi-card">
          <div className="qc-kpi-icon" style={{ background: '#eff6ff', color: '#2563eb' }}>
            📋
          </div>
          <div className="qc-kpi-info">
            <span className="qc-kpi-label">Other Dosage Forms</span>
            <span className="qc-kpi-value" style={{ color: '#2563eb' }}>{otherCount}</span>
            <span className="qc-kpi-subtext">Standardized testing pipeline</span>
          </div>
        </div>
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
          {filteredOrders.length === 0 ? (
            <div className="qc-empty-state">
              <h3>No QC Orders Found</h3>
              <p>
                {bmrCompleteOrders.length === 0
                  ? 'No orders with completed BMRs found for this company. Once a manufacturing BMR is completed in Production, the order will appear here for Quality Control (CoA) release.'
                  : 'No orders match your current search and type filters.'}
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
                      onClick={() => handleOpenView(order.id)}
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
                        <StatusPill tone="success">
                          Completed
                        </StatusPill>
                      </td>

                      <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="qc-view-btn"
                          onClick={() => handleOpenView(order.id)}
                          title="Open Certificate of Analysis (CoA)"
                        >
                          👁️ View
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
