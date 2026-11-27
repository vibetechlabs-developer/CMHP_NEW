import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { productionService, resolveOrderDosageForm } from './productionService'
import { isQaDemoRecord } from '../quality/qaDemoRecords'
import { productionApiService } from './productionApiService'
import Button from '../../components/Button'
import StatusPill from '../../components/StatusPill'
import { getErrorMessage } from '../../utils/errors'
import { DOSAGE_FORMS } from '../../constants/dosageForms'
import { selectDosageForms, addInvoice, saveOrderInvoice, editOrder } from '../../store/erpSlice'
import { selectActiveCompanyKey, selectActiveCompanyId } from '../../utils/companySelectors'
import api from '../../api/axios'
import { generateInvoiceNumber } from '../invoice/invoiceService'
import './Production.css'
import { getCompanyBranding } from '../../utils/companyBranding.js'

function money(value) {
  const n = Number(value) || 0
  return n.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function statusTone(status) {
  if (status === 'COMPLETED' || status === 'PAID' || status === 'DISPATCHED') return 'success'
  if (status === 'IN_PRODUCTION' || status === 'In Process' || status === 'PACKAGING') return 'info'
  if (status === 'In Planning' || status === 'Pending') return 'warning'
  return 'neutral'
}

export default function Production() {
  const navigate = useNavigate()
  const reduxDosageForms = useSelector(selectDosageForms)
  const dosageForms = reduxDosageForms && reduxDosageForms.length ? reduxDosageForms : DOSAGE_FORMS
  const compKey = useSelector(selectActiveCompanyKey)
  const reduxOrders = useSelector((state) => state.erp.byCompany?.[compKey]?.orders || state.erp.orders || [])
  const dispatch = useDispatch()
  const reduxCustomers = useSelector((state) => state.erp.customers || [])
  const reduxInvoices = useSelector((state) => state.erp.byCompany?.[compKey]?.invoices || state.erp.invoices || [])
  const reduxProducts = useSelector((state) => [
    ...(state.erp.products || []),
    ...(state.erp.commonProducts || []),
    ...(state.erp.byCompany?.[compKey]?.products || []),
  ])

  const activeCompId = useSelector(selectActiveCompanyId)
  const [verifiedOrders, setVerifiedOrders] = useState(null)
  const syncRequest = useRef(0)
  const [loadError, setLoadError] = useState('')
  const verified = verifiedOrders?.companyId === activeCompId ? verifiedOrders : null
  const loading = !verified && !loadError
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [lastSynced, setLastSynced] = useState(null)
  const [syncing, setSyncing] = useState(false)

  // Dispatch modal state
  const [dispatchModalOrder, setDispatchModalOrder] = useState(null)
  const [dispatchReason, setDispatchReason] = useState('')
  const [dispatching, setDispatching] = useState(false)
  const [dispatchError, setDispatchError] = useState('')

  const handleOpenDispatchModal = (order) => {
    setDispatchModalOrder(order)
    setDispatchReason('')
    setDispatchError('')
  }

  const handleConfirmDispatch = async () => {
    if (!dispatchModalOrder) return
    setDispatching(true)
    setDispatchError('')
    try {
      const cid = dispatchModalOrder.company_id || dispatchModalOrder.company || activeCompId || (compKey === 'tej' ? 3 : 2)
      const orderId = dispatchModalOrder.id
      const res = await api.post(`/v1/companies/${cid}/orders/${orderId}/send-to-records/`, {
        reason: dispatchReason.trim() || 'Sent to Records',
      })
      dispatch(
        editOrder({
          id: orderId,
          payload: {
            in_records: true,
            status: 'IN_RECORDS',
            dispatch_status: 'YES',
            is_dispatched: true,
            sent_to_records_at: new Date().toISOString(),
          },
        })
      )
      setSuccess(res.data?.message || `Order #${dispatchModalOrder.number || dispatchModalOrder.id} sent successfully to Records!`)
      setDispatchModalOrder(null)
      await syncFromApi(true)
      setTimeout(() => setSuccess(''), 4000)
    } catch (err) {
      const respData = err.response?.data
      let msg = ''
      if (respData?.pending && Array.isArray(respData.pending)) {
        msg = `Cannot move order to Records. Pending: ${respData.pending.join(', ')}.`
      } else if (respData?.error) {
        msg = respData.error
      } else if (respData?.detail) {
        msg = respData.detail
      } else {
        msg = err.message || 'Handoff to Records failed'
      }
      setDispatchError(msg)
    } finally {
      setDispatching(false)
    }
  }

  // Live API fetch — runs on mount and refreshes every 30s
  const syncFromApi = useCallback(async (showSpinner = false) => {
    const request = ++syncRequest.current
    if (showSpinner) {
      setSyncing(true)
      setLoadError('')
    }
    try {
      const live = await productionApiService.fetchAndSyncOrders({ companyId: activeCompId, throwOnError: true })
      if (request !== syncRequest.current) return
      const identities = new Map(live.filter((order) =>
        order.number && !isQaDemoRecord({ orderReference: order.number }) &&
        !(order.lines || []).some((line) => isQaDemoRecord({
          productName: line.product_name,
          productCode: line.product_code,
        }))
      ).map((order) => [String(order.id), order.number]))
      setVerifiedOrders({ companyId: activeCompId, identities })
      setLoadError('')
      setLastSynced(new Date())
    } catch (err) {
      if (request === syncRequest.current) setLoadError(getErrorMessage(err))
    } finally {
      if (request === syncRequest.current) setSyncing(false)
    }
  }, [activeCompId])

  useEffect(() => {
    syncFromApi(true)
    const interval = setInterval(() => syncFromApi(false), 30000)
    return () => {
      syncRequest.current += 1
      clearInterval(interval)
    }
  }, [syncFromApi])

  // Derive live orders directly from Redux so QA and Production changes reflect immediately
  const orders = useMemo(() => {
    return reduxOrders.filter((order) => order.number && verified?.identities.get(String(order.id)) === order.number).map((order) => {
      const dosage_form = resolveOrderDosageForm(order)
      const cust = reduxCustomers.find((c) => String(c.id) === String(order.customer))
      return {
        ...order,
        customer_name: order.customer_name || cust?.name || 'Direct Customer',
        dosage_form,
        dosageForm: dosage_form,
        bmr_status: order.bmr_status || 'NO',
        production_status: order.production_status || 'In Planning',
        production_remark: order.production_remark || '',
        packaging_status: order.packaging_status || 'Pending',
        dispatch_status: order.dispatch_status || 'NO',
        qa_status: order.qa_status || 'Pending',
        qa_remark: order.qa_remark || '',
        supply_by_date: order.supply_by_date || order.planned_mfg_date || order.delivery_deadline || '—',
      }
    })
  }, [reduxOrders, reduxCustomers, verified])

  // Search & Filters in a single row
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [prodStatusFilter, setProdStatusFilter] = useState('ALL')
  const [pkgStatusFilter, setPkgStatusFilter] = useState('ALL')
  const [dispatchFilter, setDispatchFilter] = useState('ALL')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 10

  // Update order production status in Redux
  const handleUpdate = async (orderId, updates) => {
    try {
      await productionService.updateProduction({
        id: orderId,
        ...updates,
      })
      setSuccess('Production status updated successfully')
      setTimeout(() => setSuccess(''), 2500)
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }



  // Silent invoice creation and redirection to /invoices (CHANGE 1)
  const handleInvoiceClick = (order) => {
    // Check if invoice already exists for this order
    const existingInv = reduxInvoices.find(
      (inv) =>
        (inv.order && String(inv.order) === String(order.id)) ||
        (inv.order_number && String(inv.order_number) === String(order.number)) ||
        (order.batch_no && (inv.batch === order.batch_no || inv.batch_no === order.batch_no))
    )

    let targetId = existingInv?.id

    if (!existingInv) {
      const newId = Date.now()
      const invoiceNumber = generateInvoiceNumber(reduxInvoices)
      const cust = reduxCustomers.find((c) => String(c.id) === String(order.customer) || c.name === order.customer_name)

      let completedItems = []
      if (Array.isArray(order?.lines) && order.lines.length > 0) {
        completedItems = order.lines.filter((line) => {
          if (line.production_status) return line.production_status.toLowerCase() === 'completed'
          if (line.status) return line.status.toLowerCase() === 'completed'
          return (order.production_status || '').toLowerCase() === 'completed'
        })
      }
      if (completedItems.length === 0) {
        completedItems = [
          {
            product_name: order.product_name || '—',
            pack_size: order.pack_size || order.packing_size || '—',
            quantity: order.completed_qty || order.batch_size || order.quantity || 0,
            rate: order.rate || order.unit_price || 0,
            batch_no: order.batch_no || '',
          },
        ]
      }

      const formattedLines = completedItems.map((item, idx) => {
        const prod = reduxProducts.find(
          (p) =>
            String(p.id) === String(item.product_id || order?.product_id) ||
            p.name === item.product_name ||
            p.code === order?.product_code
        )
        const qty = Number(String(item.quantity || '0').replace(/[^0-9.]/g, '')) || 0
        const rate = Number(String(item.rate || item.unit_price || prod?.selling_price || '0').replace(/[^0-9.]/g, '')) || 0
        const hsn = String(prod?.hsn_code || item.hsn_code || '30049099')
        const pkg = item.pack_size || item.pkg || prod?.pack_size || '—'
        const batchNo = item.batch_no || order?.batch_no || ''
        const cgstRate = Number(item.cgst_rate || prod?.cgst_rate || 3)
        const sgstRate = Number(item.sgst_rate || prod?.sgst_rate || 3)
        const taxable = qty * rate
        const cgstAmount = (taxable * cgstRate) / 100
        const sgstAmount = (taxable * sgstRate) / 100

        return {
          id: 'item-' + Date.now() + '-' + idx,
          sr_no: idx + 1,
          description: item.product_name || prod?.name || order.product_name || '—',
          pkg,
          hsn,
          batch_no: batchNo,
          qty,
          rate,
          cgst_rate: cgstRate,
          sgst_rate: sgstRate,
          amount: taxable,
          taxable,
          cgstAmount,
          sgstAmount,
          lineTotal: taxable + cgstAmount + sgstAmount,
        }
      })

      const totalTaxable = formattedLines.reduce((s, l) => s + (l.taxable || 0), 0)
      const totalCgst = formattedLines.reduce((s, l) => s + (l.cgstAmount || 0), 0)
      const totalSgst = formattedLines.reduce((s, l) => s + (l.sgstAmount || 0), 0)
      const totalTax = totalCgst + totalSgst
      const grandTotal = Math.round(totalTaxable + totalTax)

      const branding = getCompanyBranding(order || compKey)
      const initialSheet = {
        top_title_left: 'TAX INVOICE',
        top_title_right: 'ORIGINAL FOR RECEPIENT',
        company_name: branding.headerName,
        company_factory: branding.factoryAddress,
        company_contacts: branding.companyContacts,
        company_gstin: branding.gstin,
        company_dl: branding.dl,
        company_pan: branding.pan,
        invoice_no: invoiceNumber,
        purchase_no: order.po_number || order.purchase_no || '',
        invoice_date: new Date().toLocaleDateString('en-GB').replace(/\//g, '.'),
        order_date: order.order_date ? new Date(order.order_date).toLocaleDateString('en-GB').replace(/\//g, '.') : new Date().toLocaleDateString('en-GB').replace(/\//g, '.'),
        no_of_cartons: '01',
        reverse_charge: 'N',
        date_of_supply: new Date().toLocaleDateString('en-GB').replace(/\//g, '.'),
        state: (cust?.state || 'GUJARAT').toUpperCase(),
        state_code: cust?.state_code || '24',
        place_of_supply: cust?.city || 'Ahmedabad',
        freight_type: 'To Pay',
        freight_amount: '',
        consignee_name: cust?.name || order.customer_name || '—',
        consignee_address: cust?.address || '—',
        consignee_gstin: cust?.gstin || '—',
        consignee_state: (cust?.state || 'GUJARAT').toUpperCase(),
        consignee_code: cust?.state_code || '24',
        buyer_name: cust?.name || order.customer_name || '—',
        buyer_address: cust?.address || '—',
        buyer_gstin: cust?.gstin || '—',
        buyer_state: (cust?.state || 'GUJARAT').toUpperCase(),
        buyer_code: cust?.state_code || '24',
        lines: formattedLines,
        postage_packing: '',
        rounding_off_override: null,
        bank_name: 'HDFC BANK LTD.',
        bank_ac: '50200052209722',
        bank_ifsc: 'HDFC0000048',
        term_1: 'No Claim is entertained in transit',
        term_2: 'Interest @ 24% p.a. will be charged,',
        term_3: 'If this invoice not paid by due date.',
        term_4: 'Subject to Ahmedabad Jurisdiction only.',
        jurisdiction: 'Ahmedabad',
      }

      const newInvoice = {
        id: newId,
        number: invoiceNumber,
        company: order.company || (compKey === 'tej' ? 2 : 1),
        companyId: compKey || 'cmhp',
        customer: cust?.id || order.customer || null,
        customer_name: cust?.name || order.customer_name || '—',
        order: order.id,
        order_number: order.number || ('ORD-' + order.id),
        batch: order.batch_no || '',
        batch_no: order.batch_no || '',
        invoice_date: new Date().toISOString().slice(0, 10),
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        status: 'ISSUED',
        total: grandTotal,
        balance_due: grandTotal,
        tax_amount: totalTax,
        lines: formattedLines,
        sheetData: initialSheet,
      }

      dispatch(addInvoice(newInvoice))
      dispatch(saveOrderInvoice({ orderId: order.id, invoiceData: initialSheet }))
      try {
        const cid = order.company_id || order.company || activeCompId || (compKey === 'tej' ? 3 : 2)
        api
          .post(`/v1/companies/${cid}/orders/${order.id}/documents/`, {
            doc_type: 'INVOICE',
            data: {
              invoice_no: invoiceNumber,
              total: grandTotal,
              sheetData: initialSheet,
            },
          })
          .catch(() => {})
      } catch {}
      targetId = newId
    }

    navigate('/invoices', { state: { highlightInvoiceId: targetId } })
  }

  // Filtering
  const filteredOrders = useMemo(() => {
    const term = search.trim().toLowerCase()
    return orders.filter((order) => {
      // Exclude dispatched or records orders from active Production list
      const isDispatched =
        (order.dispatch_status || '').toUpperCase() === 'YES' ||
        order.is_dispatched === true ||
        order.status === 'DISPATCHED' ||
        order.in_records === true ||
        order.in_records === 'true' ||
        order.status === 'IN_RECORDS'
      if (isDispatched) {
        return false
      }

      const matchesSearch =
        !term ||
        String(order.number || '').toLowerCase().includes(term) ||
        String(order.product_name || '').toLowerCase().includes(term) ||
        String(order.batch_no || '').toLowerCase().includes(term) ||
        order.official_batch_numbers?.some((number) => number.toLowerCase().includes(term)) ||
        String(order.customer_name || '').toLowerCase().includes(term)

      const orderType = String(order.dosage_form || order.dosageForm || order.product_type || order.type || 'Liquid').toLowerCase()
      const matchesType =
        typeFilter === 'ALL' || orderType === typeFilter.toLowerCase()

      const matchesProd =
        prodStatusFilter === 'ALL' ||
        (order.production_status || 'In Planning') === prodStatusFilter

      const matchesPkg =
        pkgStatusFilter === 'ALL' ||
        (order.packaging_status || 'Pending') === pkgStatusFilter

      const matchesDispatch =
        dispatchFilter === 'ALL' ||
        (order.dispatch_status || 'NO') === dispatchFilter

      const orderDate = order.order_date || ''
      const matchesFrom = !fromDate || (orderDate && orderDate >= fromDate)
      const matchesTo = !toDate || (orderDate && orderDate <= toDate)

      return matchesSearch && matchesType && matchesProd && matchesPkg && matchesDispatch && matchesFrom && matchesTo
    })
  }, [orders, search, typeFilter, prodStatusFilter, pkgStatusFilter, dispatchFilter, fromDate, toDate])

  // Pagination slice
  const totalPages = Math.ceil(filteredOrders.length / pageSize) || 1
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredOrders.slice(start, start + pageSize)
  }, [filteredOrders, currentPage, pageSize])

  return (
    <div className="prod-page">
      {/* HEADER */}
      <div className="prod-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1>Production Management</h1>
            <p>
              Order-wise manufacturing tracking, digital 19-page BMR management, packaging status, dispatch, and invoicing.
            </p>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
            {lastSynced && (
              <span style={{ fontSize: 11, color: '#64748b' }}>
                🔄 Live · {lastSynced.toLocaleTimeString()}
              </span>
            )}
            <button
              type="button"
              onClick={() => syncFromApi(true)}
              disabled={syncing}
              style={{
                background: syncing ? '#e2e8f0' : '#0284c7',
                color: syncing ? '#64748b' : '#fff',
                border: 'none',
                borderRadius: 6,
                padding: '5px 12px',
                fontSize: 12,
                fontWeight: 600,
                cursor: syncing ? 'default' : 'pointer',
              }}
            >
              {syncing ? '⏳ Syncing…' : '↻ Refresh'}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', background: '#fee2e2', color: '#991b1b', borderRadius: 8, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{ padding: '10px 14px', background: '#dcfce7', color: '#166534', borderRadius: 8, marginBottom: 16 }}>
          {success}
        </div>
      )}

      {/* STATS STRIP */}
      <div className="prod-stats-strip">
        <div className="prod-stat-card">
          <span className="prod-stat-label">Total Orders</span>
          <span className="prod-stat-value">{orders.length}</span>
        </div>
        <div className="prod-stat-card">
          <span className="prod-stat-label">In Planning</span>
          <span className="prod-stat-value" style={{ color: '#d97706' }}>
            {orders.filter((o) => (o.production_status || 'In Planning') === 'In Planning').length}
          </span>
        </div>
        <div className="prod-stat-card">
          <span className="prod-stat-label">In Process</span>
          <span className="prod-stat-value" style={{ color: '#0284c7' }}>
            {orders.filter((o) => o.production_status === 'In Process').length}
          </span>
        </div>
        <div className="prod-stat-card">
          <span className="prod-stat-label">Completed</span>
          <span className="prod-stat-value" style={{ color: '#16a34a' }}>
            {orders.filter((o) => o.production_status === 'Completed').length}
          </span>
        </div>
        <div className="prod-stat-card">
          <span className="prod-stat-label">Dispatched</span>
          <span className="prod-stat-value" style={{ color: '#7c3aed' }}>
            {orders.filter((o) => o.dispatch_status === 'YES').length}
          </span>
        </div>
      </div>

      {/* FILTER BAR (Small rounded boxes in a single row) */}
      <div className="prod-filter-bar">
        <input
          type="text"
          className="prod-filter-input prod-filter-search"
          placeholder="Search by Order #, Product, Batch, Customer..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setCurrentPage(1)
          }}
        />

        <select
          className="prod-filter-select"
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value)
            setCurrentPage(1)
          }}
          title="Filter by Dosage Form / Type"
        >
          <option value="ALL">All Types</option>
          {dosageForms.map((df) => (
            <option key={df} value={df}>
              {df}
            </option>
          ))}
        </select>

        <select
          className="prod-filter-select"
          value={prodStatusFilter}
          onChange={(e) => {
            setProdStatusFilter(e.target.value)
            setCurrentPage(1)
          }}
        >
          <option value="ALL">Production: All</option>
          <option value="In Planning">In Planning</option>
          <option value="In Process">In Process</option>
          <option value="Completed">Completed</option>
        </select>

        <select
          className="prod-filter-select"
          value={pkgStatusFilter}
          onChange={(e) => {
            setPkgStatusFilter(e.target.value)
            setCurrentPage(1)
          }}
        >
          <option value="ALL">Packaging: All</option>
          <option value="Pending">Pending</option>
          <option value="In Process">In Process</option>
          <option value="Completed">Completed</option>
        </select>

        <select
          className="prod-filter-select"
          value={dispatchFilter}
          onChange={(e) => {
            setDispatchFilter(e.target.value)
            setCurrentPage(1)
          }}
        >
          <option value="ALL">Dispatch: All</option>
          <option value="YES">Dispatch: Yes</option>
          <option value="NO">Dispatch: No</option>
        </select>

        <div className="prod-filter-date-group">
          <span className="prod-filter-date-label">From:</span>
          <input
            type="date"
            className="prod-filter-input prod-filter-date-input"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value)
              setCurrentPage(1)
            }}
          />
        </div>

        <div className="prod-filter-date-group">
          <span className="prod-filter-date-label">To:</span>
          <input
            type="date"
            className="prod-filter-input prod-filter-date-input"
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value)
              setCurrentPage(1)
            }}
          />
        </div>

        {(search || typeFilter !== 'ALL' || prodStatusFilter !== 'ALL' || pkgStatusFilter !== 'ALL' || dispatchFilter !== 'ALL' || fromDate || toDate) && (
          <button
            type="button"
            className="prod-filter-reset"
            onClick={() => {
              setSearch('')
              setTypeFilter('ALL')
              setProdStatusFilter('ALL')
              setPkgStatusFilter('ALL')
              setDispatchFilter('ALL')
              setFromDate('')
              setToDate('')
              setCurrentPage(1)
            }}
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* ORDERS TABLE */}
      <div className="prod-table-container">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 50, color: '#64748b' }}>
            Loading production orders...
          </div>
        ) : loadError && !verified ? (
          <div className="prod-empty-state" role="alert">{loadError}</div>
        ) : filteredOrders.length === 0 ? (
          <div className="prod-empty-state">
            <h3>No production orders found</h3>
            <p>
              {orders.length === 0
                ? 'No sales orders exist for this company yet. Orders created in the Orders module will automatically appear here.'
                : 'No orders match your filter criteria.'}
            </p>
          </div>
        ) : (
          <>
            <table className="prod-table">
              <thead>
                <tr>
                  <th>Order No.</th>
                  <th>Product</th>
                  <th>Batch No.</th>
                  <th>Customer</th>
                  <th>Quantity</th>
                  <th>Order Date</th>
                  <th>Supply-By Date</th>
                  <th>BMR Status</th>
                  <th>Production Status</th>
                  <th>Remark</th>
                  <th>QA STATUS</th>
                  <th>QC Check</th>
                  <th>Packaging Status</th>
                  <th>Dispatch</th>
                  <th>Invoice</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedOrders.map((order) => {
                  const bmrStatus = order.bmr_status || 'NO'
                  const prodStatus = order.production_status || 'In Planning'
                  const pkgStatus = order.packaging_status || 'Pending'
                  const dispatchStatus = order.dispatch_status || 'NO'
                  const dosageForm = order.dosage_form || order.dosageForm || order.product_type || order.type || 'Liquid'

                  return (
                    <tr key={order.id}>
                      {/* 1. Order No */}
                      <td>
                        <strong style={{ color: '#0284c7' }}>
                          #{order.number || order.id}
                        </strong>
                      </td>

                      {/* 2. Product */}
                      <td>
                        <div style={{ fontWeight: 700, color: '#0f172a' }}>
                          {order.product_name || '—'}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11, color: '#64748b' }}>
                            {order.product_code || '—'}
                          </span>
                          <span className={`dosage-badge dosage-${dosageForm.toLowerCase()}`}>
                            {dosageForm}
                          </span>
                        </div>
                      </td>

                      {/* 3. Batch No */}
                      <td>
                        <span style={{ fontWeight: 700, background: '#f1f5f9', padding: '3px 8px', borderRadius: 4 }}>
                          {order.official_batch_numbers?.length
                            ? order.official_batch_numbers.join(', ')
                            : order.batch_no || (order.has_batch_plan ? 'Not allocated' : 'No batch plan')}
                        </span>
                      </td>

                      {/* 4. Customer */}
                      <td>
                        <div style={{ fontWeight: 600 }}>
                          {order.customer_name || '—'}
                        </div>
                      </td>

                      {/* 5. Quantity */}
                      <td>
                        <strong>{order.batch_size || (order.quantity != null ? String(order.quantity) : '—')}</strong>
                      </td>

                      {/* 6. Order Date */}
                      <td>{order.order_date || '—'}</td>

                      {/* 7. Supply-By Date */}
                      <td>{order.supply_by_date || order.planned_mfg_date || order.delivery_deadline || '—'}</td>

                      {/* 8. BMR Status (Yes / No toggle) */}
                      <td>
                        <div className="prod-row-yn">
                          <button
                            type="button"
                            className={`prod-row-yn-btn ${bmrStatus === 'YES' ? 'active-yes' : ''}`}
                            onClick={() => handleUpdate(order.id, { bmr_status: 'YES' })}
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            className={`prod-row-yn-btn ${bmrStatus === 'NO' ? 'active-no' : ''}`}
                            onClick={() => handleUpdate(order.id, { bmr_status: 'NO' })}
                          >
                            No
                          </button>
                        </div>
                      </td>

                      {/* 9. Production Status (In Process / Completed / In Planning) */}
                      <td>
                        <select
                          className="prod-table-select"
                          value={prodStatus}
                          onChange={(e) => handleUpdate(order.id, { production_status: e.target.value })}
                        >
                          <option value="In Planning">In Planning</option>
                          <option value="In Process">In Process</option>
                          <option value="Completed">Completed</option>
                        </select>
                      </td>

                      {/* 10. Remark (text input per order) */}
                      <td>
                        <input
                          type="text"
                          className="prod-table-input"
                          placeholder="Type remark..."
                          defaultValue={order.production_remark || ''}
                          onBlur={(e) => {
                            if (e.target.value !== (order.production_remark || '')) {
                              handleUpdate(order.id, { remark: e.target.value })
                            }
                          }}
                        />
                      </td>

                      {/* QA STATUS (Interactive selector for QA status) */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
                          <select
                            className="prod-table-select"
                            value={order.qa_status || 'Pending'}
                            onChange={(e) => handleUpdate(order.id, { qa_status: e.target.value })}
                            style={{
                              fontWeight: 700,
                              fontSize: 12,
                              color: order.qa_status === 'Approved' ? '#15803d' : order.qa_status === 'Rejected' ? '#b91c1c' : '#b45309',
                              background: order.qa_status === 'Approved' ? '#dcfce7' : order.qa_status === 'Rejected' ? '#fee2e2' : '#fef3c7',
                              borderColor: order.qa_status === 'Approved' ? '#86efac' : order.qa_status === 'Rejected' ? '#fca5a5' : '#fde68a',
                            }}
                          >
                            <option value="Pending">Pending</option>
                            <option value="Under Review">Under Review</option>
                            <option value="Approved">Approved</option>
                            <option value="Rejected">Rejected</option>
                          </select>
                          {order.qa_status === 'Rejected' && order.qa_remark && (
                            <div
                              className="prod-qa-issue-cell"
                              title={order.qa_remark}
                            >
                              ⚠️ <span className="prod-qa-issue-text">{order.qa_remark}</span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* QC Check Column */}
                      <td>
                        <button
                          type="button"
                          onClick={() => navigate('/material-qc')}
                          style={{
                            background: '#eff6ff',
                            border: '1px solid #bfdbfe',
                            color: '#1d4ed8',
                            fontSize: '11.5px',
                            fontWeight: 700,
                            padding: '5px 10px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                          }}
                          title="Navigate to Quality Control & Release"
                        >
                          🔬 QC Check
                        </button>
                      </td>

                      {/* 11. Packaging Status (Pending / In Process / Completed) */}
                      <td>
                        <select
                          className="prod-table-select"
                          value={pkgStatus}
                          onChange={(e) => handleUpdate(order.id, { packaging_status: e.target.value })}
                        >
                          <option value="Pending">Pending</option>
                          <option value="In Process">In Process</option>
                          <option value="Completed">Completed</option>
                        </select>
                      </td>

                      {/* 12. Dispatch (Yes / No buttons) */}
                      <td>
                        <div className="prod-row-yn">
                          <button
                            type="button"
                            className={`prod-row-yn-btn ${dispatchStatus === 'YES' ? 'active-yes' : ''}`}
                            onClick={() => handleOpenDispatchModal(order)}
                            title="Click to dispatch order"
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            className={`prod-row-yn-btn ${dispatchStatus === 'NO' ? 'active-no' : ''}`}
                            onClick={() => handleUpdate(order.id, { dispatch: 'NO' })}
                          >
                            No
                          </button>
                        </div>
                      </td>

                      {/* 13. Invoice (Enabled only when Prod=Completed, Pkg=Completed, BMR=Yes) */}
                      <td>
                        {(() => {
                          const isProdDone = (prodStatus || '').toLowerCase() === 'completed'
                          const isPkgDone = (pkgStatus || '').toLowerCase() === 'completed'
                          const isBmrDone = (bmrStatus || '').toUpperCase() === 'YES'
                          const isInvoiceActive = isProdDone && isPkgDone && isBmrDone

                          const pending = []
                          if (!isProdDone) pending.push('Production')
                          if (!isPkgDone) pending.push('Packaging')
                          if (!isBmrDone) pending.push('BMR')
                          const tooltip = isInvoiceActive
                            ? 'Generate / View Tax Invoice'
                            : `Complete ${pending.join(', ')} to generate the invoice`

                          return (
                            <button
                              type="button"
                              className={`prod-action-btn-inv ${!isInvoiceActive ? 'disabled' : ''}`}
                              disabled={!isInvoiceActive}
                              title={tooltip}
                              onClick={() => {
                                if (isInvoiceActive) {
                                  handleInvoiceClick(order)
                                }
                              }}
                            >
                              🧾 Invoice
                            </button>
                          )
                        })()}
                      </td>

                      {/* 14. Actions: BMR + Brown Dispatch Button */}
                      <td>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <button
                            type="button"
                            className="prod-action-btn-bmr"
                            onClick={() => navigate(`/production/bmr/${order.id}`)}
                          >
                            📄 BMR
                          </button>
                          <button
                            type="button"
                            className="prod-action-btn-records"
                            style={{
                              backgroundColor: '#78350f',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '6px',
                              padding: '5px 12px',
                              fontWeight: 700,
                              fontSize: '12px',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                              transition: 'all 0.15s ease',
                              whiteSpace: 'nowrap',
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#92400e')}
                            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#78350f')}
                            onClick={() => handleOpenDispatchModal(order)}
                            title="Send this order to Records"
                          >
                            📋 Records
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* PAGINATION */}
            <div className="prod-pagination">
              <div>
                Showing {(currentPage - 1) * pageSize + 1} to{' '}
                {Math.min(currentPage * pageSize, filteredOrders.length)} of {filteredOrders.length} orders
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button
                  type="button"
                  className="prod-page-btn"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <span style={{ fontWeight: 700, margin: '0 6px' }}>
                  {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  className="prod-page-btn"
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

      {/* DISPATCH CONFIRMATION MODAL */}
      {dispatchModalOrder && (
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
          onClick={() => !dispatching && setDispatchModalOrder(null)}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              maxWidth: '520px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
              overflow: 'hidden',
              border: '1px solid #e2e8f0',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                backgroundColor: '#78350f',
                color: '#ffffff',
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px' }}>📋</span>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#ffffff' }}>
                  Send Order to Records
                </h3>
              </div>
              <button
                type="button"
                onClick={() => !dispatching && setDispatchModalOrder(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#fde68a',
                  fontSize: '20px',
                  cursor: 'pointer',
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px' }}>
              <p style={{ margin: '0 0 14px 0', fontSize: '14px', color: '#334155', lineHeight: 1.5 }}>
                Are you sure you want to send this order to <strong>Records</strong>?
              </p>

              {/* Order Info Card */}
              <div
                style={{
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '12px 14px',
                  marginBottom: '16px',
                  fontSize: '13px',
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '8px',
                }}
              >
                <div>
                  <span style={{ color: '#64748b' }}>Order: </span>
                  <strong style={{ color: '#0f172a' }}>#{dispatchModalOrder.number || dispatchModalOrder.id}</strong>
                </div>
                <div>
                  <span style={{ color: '#64748b' }}>Batch No: </span>
                  <strong style={{ color: '#0f172a' }}>{dispatchModalOrder.batch_no || '—'}</strong>
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <span style={{ color: '#64748b' }}>Product: </span>
                  <strong style={{ color: '#0f172a' }}>{dispatchModalOrder.product_name || '—'}</strong>
                </div>
                <div>
                  <span style={{ color: '#64748b' }}>Dosage Form: </span>
                  <span style={{ color: '#0f172a', fontWeight: 600 }}>{dispatchModalOrder.dosage_form || '—'}</span>
                </div>
                <div>
                  <span style={{ color: '#64748b' }}>Batch Size: </span>
                  <span style={{ color: '#0f172a', fontWeight: 600 }}>{dispatchModalOrder.batch_size || '—'}</span>
                </div>
              </div>

              {/* Error Notice */}
              {dispatchError && (
                <div
                  style={{
                    backgroundColor: '#fef2f2',
                    border: '1px solid #f87171',
                    borderRadius: '8px',
                    padding: '12px',
                    marginBottom: '16px',
                    color: '#991b1b',
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                  }}
                >
                  <span style={{ fontSize: '16px' }}>⚠️</span>
                  <div>
                    <strong>Action Blocked:</strong>
                    <div style={{ marginTop: '2px' }}>{dispatchError}</div>
                  </div>
                </div>
              )}

              {/* Dispatch Reason */}
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                Handoff Note / Remarks (Optional)
              </label>
              <textarea
                rows={2}
                value={dispatchReason}
                onChange={(e) => setDispatchReason(e.target.value)}
                placeholder="Enter handoff notes or comments..."
                disabled={dispatching}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                }}
              />

              <div style={{ marginTop: '12px', fontSize: '11.5px', color: '#64748b', lineHeight: 1.4 }}>
                ℹ️ This will lock Attachments 1–6, BMR, and COA for this order and move it to Records. It will remain in Live Tracking until final dispatch confirmation.
              </div>
            </div>

            {/* Modal Footer */}
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
                disabled={dispatching}
                onClick={() => setDispatchModalOrder(null)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#ffffff',
                  color: '#475569',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: dispatching ? 'not-allowed' : 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={dispatching}
                onClick={handleConfirmDispatch}
                style={{
                  padding: '8px 18px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: '#78350f',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: dispatching ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                }}
              >
                {dispatching ? '⏳ Sending to Records…' : '📋 Send to Records'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
