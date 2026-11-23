import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import PageHeader from '../../components/PageHeader'
import HeroBanner from '../../components/HeroBanner'
import Button from '../../components/Button'
import Modal from '../inventory/components/Modal'
import StatusPill from '../../components/StatusPill'
import Alert from '../../components/Alert'
import { selectActiveCompanyKey } from '../../utils/companySelectors'
import { getCompanyBranding } from '../../utils/companyBranding.js'
import { productionApiService } from '../production/productionApiService'
import './DispatchPage.css'

const STORAGE_KEY = 'cmhp_dispatch_registry_v1'

function getStoredDispatches() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveStoredDispatches(map) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {}
}

const STATUS_OPTIONS = [
  { value: 'PENDING', label: 'Pending Dispatch', color: '#f59e0b', bg: '#fef3c7' },
  { value: 'PACKED', label: 'Packed & Ready', color: '#0284c7', bg: '#e0f2fe' },
  { value: 'IN_TRANSIT', label: 'In Transit', color: '#7c3aed', bg: '#ede9fe' },
  { value: 'DISPATCHED', label: 'Dispatched', color: '#059669', bg: '#d1fae5' },
  { value: 'DELIVERED', label: 'Delivered', color: '#16a34a', bg: '#dcfce7' },
]

export default function DispatchPage() {
  const compKey = useSelector(selectActiveCompanyKey)
  const reduxOrders = useSelector((state) => state.erp?.byCompany?.[compKey]?.orders || state.erp?.orders || [])
  const reduxCustomers = useSelector((state) => state.erp?.customers || [])

  const [dispatchMap, setDispatchMap] = useState(getStoredDispatches)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [syncing, setSyncing] = useState(false)
  const [notice, setNotice] = useState('')

  // Modal for editing dispatch tracking details
  const [editTarget, setEditTarget] = useState(null)
  const [trackingForm, setTrackingForm] = useState({
    transporter: '',
    tracking_no: '',
    vehicle_no: '',
    dispatch_date: '',
    driver_name: '',
    driver_phone: '',
    notes: '',
    status: 'PENDING',
  })

  // Sync latest orders on mount
  useEffect(() => {
    let cancelled = false
    setSyncing(true)
    productionApiService
      .fetchAndSyncOrders()
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setSyncing(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Merge orders into dispatch rows
  const dispatches = useMemo(() => {
    return (reduxOrders || []).map((order) => {
      const cust = reduxCustomers.find((c) => String(c.id) === String(order.customer))
      const extra = dispatchMap[order.id] || {}
      const fallbackDate = order.delivery_deadline || order.planned_mfg_date || order.date || new Date().toISOString().slice(0, 10)

      return {
        orderId: order.id,
        orderNumber: order.number || order.id,
        customerName: order.customer_name || cust?.name || 'Direct Customer',
        productName: order.product_name || order.product?.name || 'Commercial Medicine',
        packSize: order.pack_size || order.packing_size || '30 ml',
        batchNo: order.batch_no || extra.batchNo || 'PENDING',
        quantity: order.quantity || order.order_quantity || order.batch_size || 100,
        unit: order.unit || 'Bottles',
        orderDate: order.date || order.created_at?.slice(0, 10) || '—',
        dispatchDate: extra.dispatch_date || fallbackDate,
        transporter: extra.transporter || 'Self Logistics / Local Transport',
        trackingNo: extra.tracking_no || '—',
        vehicleNo: extra.vehicle_no || '—',
        driverName: extra.driver_name || '',
        driverPhone: extra.driver_phone || '',
        notes: extra.notes || '',
        status: extra.status || (order.dispatch_status === 'YES' ? 'DISPATCHED' : order.packaging_status === 'Completed' ? 'PACKED' : 'PENDING'),
      }
    })
  }, [reduxOrders, reduxCustomers, dispatchMap])

  // Filters
  const filteredDispatches = useMemo(() => {
    return dispatches.filter((d) => {
      if (statusFilter !== 'ALL' && d.status !== statusFilter) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        return (
          String(d.orderNumber).toLowerCase().includes(q) ||
          d.customerName.toLowerCase().includes(q) ||
          d.productName.toLowerCase().includes(q) ||
          d.batchNo.toLowerCase().includes(q) ||
          d.transporter.toLowerCase().includes(q) ||
          d.trackingNo.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [dispatches, statusFilter, search])

  // KPI Metrics
  const kpis = useMemo(() => {
    const total = dispatches.length
    const pending = dispatches.filter((d) => d.status === 'PENDING').length
    const ready = dispatches.filter((d) => d.status === 'PACKED').length
    const inTransit = dispatches.filter((d) => d.status === 'IN_TRANSIT').length
    const completed = dispatches.filter((d) => d.status === 'DISPATCHED' || d.status === 'DELIVERED').length
    return { total, pending, ready, inTransit, completed }
  }, [dispatches])

  // Open modal to update tracking details
  const handleOpenEdit = (item) => {
    setEditTarget(item)
    setTrackingForm({
      transporter: item.transporter !== 'Self Logistics / Local Transport' ? item.transporter : '',
      tracking_no: item.trackingNo !== '—' ? item.trackingNo : '',
      vehicle_no: item.vehicleNo !== '—' ? item.vehicleNo : '',
      dispatch_date: item.dispatchDate || new Date().toISOString().slice(0, 10),
      driver_name: item.driverName || '',
      driver_phone: item.driverPhone || '',
      notes: item.notes || '',
      status: item.status || 'PENDING',
    })
  }

  // Save tracking details
  const handleSaveTracking = (e) => {
    e.preventDefault()
    if (!editTarget) return

    const updated = {
      ...dispatchMap,
      [editTarget.orderId]: {
        ...trackingForm,
        transporter: trackingForm.transporter || 'Self Logistics / Local Transport',
        tracking_no: trackingForm.tracking_no || '—',
        vehicle_no: trackingForm.vehicle_no || '—',
        updatedAt: new Date().toISOString(),
      },
    }
    setDispatchMap(updated)
    saveStoredDispatches(updated)
    setEditTarget(null)
    setNotice(`Dispatch details for Order #${editTarget.orderNumber} successfully updated!`)
    setTimeout(() => setNotice(''), 5000)
  }

  // Quick status changer
  const handleQuickStatus = (item, newStatus) => {
    const prev = dispatchMap[item.orderId] || {}
    const updated = {
      ...dispatchMap,
      [item.orderId]: {
        ...prev,
        status: newStatus,
        updatedAt: new Date().toISOString(),
      },
    }
    setDispatchMap(updated)
    saveStoredDispatches(updated)
  }

  // Print Delivery Challan / Dispatch Note
  const handlePrintChallan = (item) => {
    const branding = getCompanyBranding()
    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      alert('Pop-up blocked. Please allow pop-ups to print the delivery challan.')
      return
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Delivery Challan - #${item.orderNumber}</title>
        <style>
          body { font-family: 'Arial', sans-serif; padding: 30px; color: #1e293b; font-size: 13px; line-height: 1.5; }
          .header { display: flex; justify-content: space-between; border-bottom: 2px solid #0284c7; padding-bottom: 15px; margin-bottom: 20px; }
          .title { font-size: 20px; font-weight: bold; color: #0f172a; }
          .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px; background: #f8fafc; padding: 15px; border-radius: 6px; }
          .table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          .table th, .table td { border: 1px solid #cbd5e1; padding: 10px; text-align: left; }
          .table th { background: #f1f5f9; font-weight: bold; }
          .footer { margin-top: 50px; display: flex; justify-content: space-between; text-align: center; }
          .sign-box { width: 180px; border-top: 1px solid #475569; padding-top: 5px; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title">${branding.headerName || 'CENTRAL MANUFACTURING HOMEOPATHIC PHARMACY'}</div>
            <div style="font-size: 12px; color: #64748b;">GMP Certified Pharmaceutical Manufacturing Unit</div>
            <div style="font-size: 14px; font-weight: bold; color: #0284c7; margin-top: 6px;">OUTWARD DELIVERY CHALLAN / DISPATCH SLIP</div>
          </div>
          <div style="text-align: right;">
            <div><strong>Challan No:</strong> DC-${item.orderNumber}-${new Date().getFullYear()}</div>
            <div><strong>Date:</strong> ${item.dispatchDate || new Date().toISOString().slice(0, 10)}</div>
            <div><strong>Status:</strong> ${item.status}</div>
          </div>
        </div>

        <div class="meta-grid">
          <div>
            <div><strong>Consignee / Customer:</strong> ${item.customerName}</div>
            <div><strong>Order Reference:</strong> #${item.orderNumber}</div>
            <div><strong>Order Date:</strong> ${item.orderDate}</div>
          </div>
          <div>
            <div><strong>Transporter / Courier:</strong> ${item.transporter}</div>
            <div><strong>Tracking / LR No:</strong> ${item.trackingNo}</div>
            <div><strong>Vehicle No:</strong> ${item.vehicleNo}</div>
            ${item.driverName ? `<div><strong>Driver:</strong> ${item.driverName} (${item.driverPhone || '—'})</div>` : ''}
          </div>
        </div>

        <table class="table">
          <thead>
            <tr>
              <th style="width: 40px;">Sr.</th>
              <th>Product Description</th>
              <th>Batch No.</th>
              <th>Pack Size</th>
              <th style="text-align: right;">Quantity</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>1</td>
              <td><strong>${item.productName}</strong></td>
              <td><span style="font-family: monospace; font-weight: bold;">${item.batchNo}</span></td>
              <td>${item.packSize}</td>
              <td style="text-align: right; font-weight: bold;">${Number(item.quantity).toLocaleString()} ${item.unit}</td>
            </tr>
          </tbody>
        </table>

        ${item.notes ? `<div style="margin-top: 15px; font-size: 12px; color: #475569;"><strong>Notes / Instructions:</strong> ${item.notes}</div>` : ''}

        <div class="footer">
          <div class="sign-box">Prepared / Packed By<br/><span style="font-size: 10px; font-weight: normal;">Warehouse Supervisor</span></div>
          <div class="sign-box">Verified By<br/><span style="font-size: 10px; font-weight: normal;">QA / Stores Manager</span></div>
          <div class="sign-box">Received By<br/><span style="font-size: 10px; font-weight: normal;">Transporter / Consignee</span></div>
        </div>
      </body>
      </html>
    `
    printWindow.document.write(html)
    printWindow.document.close()
    setTimeout(() => {
      printWindow.focus()
      printWindow.print()
    }, 250)
  }

  return (
    <div className="disp-container">
      <PageHeader
        breadcrumbs={[
          { label: 'Workspace', to: '/dashboard' },
          { label: 'Supply Chain', to: '/supply-chain' },
          { label: 'Dispatch Management' },
        ]}
        title="🚚 Outward Dispatch & Courier Tracking"
        subtitle="End-to-end commercial dispatch tracking directly connected with sales orders, batch numbers, and warehouse logistics."
        primaryAction={null}
        secondaryActions={[
          {
            label: syncing ? 'Syncing…' : '🔄 Refresh Orders',
            onClick: () => {
              setSyncing(true)
              productionApiService.fetchAndSyncOrders().finally(() => setSyncing(false))
            },
          },
        ]}
      />

      <HeroBanner
        title="Active Dispatch Operations"
        subtitle="Track every pharmaceutical batch shipment from warehouse packing through final customer delivery."
      />

      {notice && <Alert type="success">{notice}</Alert>}

      {/* KPI GRID */}
      <div className="disp-kpi-grid">
        <div className="disp-kpi-card">
          <div className="disp-kpi-lbl">Total Orders in Pipeline</div>
          <div className="disp-kpi-val">{kpis.total}</div>
          <div className="disp-kpi-sub">Commercial orders tracking</div>
        </div>
        <div className="disp-kpi-card" style={{ borderLeft: '4px solid #f59e0b' }}>
          <div className="disp-kpi-lbl">Pending Dispatch</div>
          <div className="disp-kpi-val" style={{ color: '#b45309' }}>{kpis.pending}</div>
          <div className="disp-kpi-sub">Awaiting packaging completion</div>
        </div>
        <div className="disp-kpi-card" style={{ borderLeft: '4px solid #0284c7' }}>
          <div className="disp-kpi-lbl">Packed &amp; Ready</div>
          <div className="disp-kpi-val" style={{ color: '#0369a1' }}>{kpis.ready}</div>
          <div className="disp-kpi-sub">Awaiting carrier pickup</div>
        </div>
        <div className="disp-kpi-card" style={{ borderLeft: '4px solid #7c3aed' }}>
          <div className="disp-kpi-lbl">In Transit</div>
          <div className="disp-kpi-val" style={{ color: '#6d28d9' }}>{kpis.inTransit}</div>
          <div className="disp-kpi-sub">Dispatched on road / courier</div>
        </div>
        <div className="disp-kpi-card" style={{ borderLeft: '4px solid #16a34a' }}>
          <div className="disp-kpi-lbl">Delivered / Dispatched</div>
          <div className="disp-kpi-val" style={{ color: '#15803d' }}>{kpis.completed}</div>
          <div className="disp-kpi-sub">Successfully fulfilled</div>
        </div>
      </div>

      {/* FILTER TOOLBAR */}
      <div className="disp-toolbar">
        <div style={{ flex: '1 1 280px', maxWidth: 360 }}>
          <input
            type="text"
            className="company-input"
            placeholder="Search by Order #, Customer, Batch, Tracking…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="disp-status-pills">
          <button
            type="button"
            className={`disp-status-pill ${statusFilter === 'ALL' ? 'active' : ''}`}
            onClick={() => setStatusFilter('ALL')}
          >
            All ({dispatches.length})
          </button>
          {STATUS_OPTIONS.map((opt) => {
            const count = dispatches.filter((d) => d.status === opt.value).length
            return (
              <button
                key={opt.value}
                type="button"
                className={`disp-status-pill ${statusFilter === opt.value ? 'active' : ''}`}
                onClick={() => setStatusFilter(opt.value)}
              >
                {opt.label} ({count})
              </button>
            )
          })}
        </div>
      </div>

      {/* DISPATCH TABLE */}
      <div className="disp-table-card">
        <table className="disp-table">
          <thead>
            <tr>
              <th style={{ width: 100 }}>Order #</th>
              <th>Customer</th>
              <th>Product Details</th>
              <th style={{ width: 110 }}>Batch No.</th>
              <th style={{ textAlign: 'right', width: 100 }}>Quantity</th>
              <th style={{ width: 160 }}>Logistics / Transporter</th>
              <th style={{ width: 130 }}>Tracking / LR No.</th>
              <th style={{ width: 110 }}>Dispatch Date</th>
              <th style={{ width: 140, textAlign: 'center' }}>Dispatch Status</th>
              <th style={{ width: 160, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredDispatches.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
                  No orders found matching the filter criteria.
                </td>
              </tr>
            ) : (
              filteredDispatches.map((item) => {
                const opt = STATUS_OPTIONS.find((s) => s.value === item.status) || STATUS_OPTIONS[0]
                return (
                  <tr key={item.orderId}>
                    <td>
                      <span className="disp-order-ref">#{item.orderNumber}</span>
                    </td>
                    <td>
                      <strong style={{ color: '#0f172a' }}>{item.customerName}</strong>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: '#1e293b' }}>{item.productName}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>Pack: {item.packSize}</div>
                    </td>
                    <td>
                      <span className="disp-batch-badge">{item.batchNo}</span>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                      {Number(item.quantity).toLocaleString()} <span style={{ fontSize: 11, color: '#64748b' }}>{item.unit}</span>
                    </td>
                    <td>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: '#334155' }}>{item.transporter}</div>
                      {item.vehicleNo !== '—' && (
                        <div style={{ fontSize: 11, color: '#0284c7' }}>🚛 {item.vehicleNo}</div>
                      )}
                    </td>
                    <td>
                      <span className="disp-tracking-badge">{item.trackingNo}</span>
                    </td>
                    <td style={{ fontSize: 12, color: '#475569' }}>
                      {item.dispatchDate}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <select
                        className="disp-status-select"
                        value={item.status}
                        onChange={(e) => handleQuickStatus(item, e.target.value)}
                        style={{ color: opt.color, background: opt.bg, borderColor: opt.color }}
                      >
                        {STATUS_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        <button
                          type="button"
                          className="disp-btn-edit"
                          onClick={() => handleOpenEdit(item)}
                          title="Update courier tracking and logistics information"
                        >
                          ✏️ Edit
                        </button>
                        <button
                          type="button"
                          className="disp-btn-print"
                          onClick={() => handlePrintChallan(item)}
                          title="Print Outward Delivery Challan / Dispatch Slip"
                        >
                          🖨️ Challan
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* EDIT TRACKING MODAL */}
      {editTarget && (
        <Modal
          isOpen={true}
          onClose={() => setEditTarget(null)}
          title={`Update Dispatch Logistics — Order #${editTarget.orderNumber}`}
          maxWidth="640px"
        >
          <form onSubmit={handleSaveTracking} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13 }}>
              <div><strong>Customer:</strong> {editTarget.customerName}</div>
              <div><strong>Product:</strong> {editTarget.productName} ({editTarget.packSize}) — Batch: <strong>{editTarget.batchNo}</strong></div>
              <div><strong>Quantity:</strong> {Number(editTarget.quantity).toLocaleString()} {editTarget.unit}</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label className="field-label">Transporter / Courier Name</label>
                <input
                  type="text"
                  className="company-input"
                  placeholder="e.g. V-Trans, Blue Dart, DTDC, Company Vehicle"
                  value={trackingForm.transporter}
                  onChange={(e) => setTrackingForm({ ...trackingForm, transporter: e.target.value })}
                />
              </div>

              <div>
                <label className="field-label">LR / Docket / Tracking No.</label>
                <input
                  type="text"
                  className="company-input"
                  placeholder="e.g. LR-2026-98124"
                  value={trackingForm.tracking_no}
                  onChange={(e) => setTrackingForm({ ...trackingForm, tracking_no: e.target.value })}
                />
              </div>

              <div>
                <label className="field-label">Vehicle Registration No.</label>
                <input
                  type="text"
                  className="company-input"
                  placeholder="e.g. GJ-01-AB-1234"
                  value={trackingForm.vehicle_no}
                  onChange={(e) => setTrackingForm({ ...trackingForm, vehicle_no: e.target.value })}
                />
              </div>

              <div>
                <label className="field-label">Target / Actual Dispatch Date</label>
                <input
                  type="date"
                  className="company-input"
                  value={trackingForm.dispatch_date}
                  onChange={(e) => setTrackingForm({ ...trackingForm, dispatch_date: e.target.value })}
                />
              </div>

              <div>
                <label className="field-label">Driver / Contact Person</label>
                <input
                  type="text"
                  className="company-input"
                  placeholder="Driver name"
                  value={trackingForm.driver_name}
                  onChange={(e) => setTrackingForm({ ...trackingForm, driver_name: e.target.value })}
                />
              </div>

              <div>
                <label className="field-label">Driver Phone No.</label>
                <input
                  type="text"
                  className="company-input"
                  placeholder="e.g. 9876543210"
                  value={trackingForm.driver_phone}
                  onChange={(e) => setTrackingForm({ ...trackingForm, driver_phone: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="field-label">Dispatch Status</label>
              <select
                className="company-input"
                value={trackingForm.status}
                onChange={(e) => setTrackingForm({ ...trackingForm, status: e.target.value })}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="field-label">Special Dispatch Notes / Delivery Remarks</label>
              <textarea
                className="company-input"
                rows={2}
                placeholder="Fragile, cold-chain ambient, handle with care…"
                value={trackingForm.notes}
                onChange={(e) => setTrackingForm({ ...trackingForm, notes: e.target.value })}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
              <Button type="button" variant="secondary" onClick={() => setEditTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                💾 Save Tracking Details
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
