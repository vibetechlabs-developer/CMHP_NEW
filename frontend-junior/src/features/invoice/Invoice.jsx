import { useEffect, useMemo, useState } from 'react'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Input from '../../components/Input'
import StatusPill from '../../components/StatusPill'
import Modal from '../inventory/components/Modal'
import { getErrorMessage } from '../../utils/errors'
import { inventoryService } from '../inventory/inventoryService'
import { operationsService } from '../operations/operationsService'
import { qualityService } from '../quality/qualityService'
import { invoiceService } from './invoiceService'
import { previewDocumentNumber } from '../../utils/documentNumbers'
import { formatINR, numberToWordsINR, formatDateIN, formatDateTimeIN } from '../../utils/formatters'
import { getEntityAuditLogs, recordAudit } from '../../utils/audit'
import {
  ReceiptIcon,
  WalletIcon,
  ClockIcon,
  AlertIcon,
} from '../../components/icons'
import useAuth from '../../hooks/useAuth'
import './Invoice.css'

const STATUS_FILTERS = [
  'ALL',
  'DRAFT',
  'ISSUED',
  'PARTIALLY_PAID',
  'PAID',
  'CANCELLED',
]

const PAYMENT_MODES = [
  'NEFT/RTGS',
  'UPI',
  'Cheque',
  'Net Banking',
  'Cash',
]

const listData = (response) =>
  Array.isArray(response?.data)
    ? response.data
    : response?.data?.results || []

const emptyLine = () => ({
  id: crypto.randomUUID ? crypto.randomUUID() : `line-${Date.now()}-${Math.random()}`,
  product: '',
  product_name: '',
  hsn_code: '30049099',
  quantity: '100',
  unit: 'Box',
  rate: '0',
  discount: '0',
  gst_percent: '18',
})

const emptyForm = {
  company: '',
  customer: '',
  order: '',
  batch: '',
  number: '',
  invoice_date: new Date().toISOString().slice(0, 10),
  due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  payment_terms: 'Net 30',
  tax_percent: '18',
  tax_exempt: false,
  notes: 'Payment to be made via NEFT/RTGS to company bank account. Goods once sold will not be taken back.',
}

function statusTone(status) {
  if (status === 'PAID') return 'success'
  if (status === 'PARTIALLY_PAID') return 'warning'
  if (status === 'ISSUED') return 'info'
  if (status === 'OVERDUE') return 'danger'
  if (status === 'CANCELLED') return 'neutral'
  return 'neutral'
}

export default function Invoice() {
  const { user } = useAuth()
  const [invoices, setInvoices] = useState([])
  const [companies, setCompanies] = useState([])
  const [customers, setCustomers] = useState([])
  const [orders, setOrders] = useState([])
  const [products, setProducts] = useState([])
  const [qaRecords, setQaRecords] = useState([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')

  const [modal, setModal] = useState('')
  const [createMode, setCreateMode] = useState('ORDER') // 'ORDER' | 'DIRECT'
  const [saving, setSaving] = useState(false)
  const [viewing, setViewing] = useState(null)
  const [activeViewTab, setActiveViewTab] = useState('invoice') // 'invoice' | 'payments' | 'activity'

  // Payment Recording State
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [paymentTargetInvoice, setPaymentTargetInvoice] = useState(null)
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    mode: 'NEFT/RTGS',
    reference: '',
    payment_date: new Date().toISOString().slice(0, 10),
    notes: '',
  })

  // Cancellation State
  const [cancelModalOpen, setCancelModalOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')

  const [form, setForm] = useState(emptyForm)
  const [lines, setLines] = useState([emptyLine()])

  const load = async () => {
    setLoading(true)
    setError('')

    try {
      const [
        invRes,
        companyRes,
        customerRes,
        orderRes,
        productRes,
        qaRes,
      ] = await Promise.all([
        invoiceService.getInvoices(),
        inventoryService.getCompanies(),
        operationsService.getCustomers(),
        operationsService.getOrders(),
        operationsService.getProducts(),
        qualityService.getQaRecords(),
      ])

      setInvoices(listData(invRes))
      setCompanies(listData(companyRes))
      setCustomers(listData(customerRes))
      setOrders(listData(orderRes))
      setProducts(listData(productRes))
      setQaRecords(listData(qaRes))
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filteredInvoices = useMemo(() => {
    const term = search.trim().toLowerCase()

    return invoices.filter((inv) => {
      const matchesStatus =
        statusFilter === 'ALL' ||
        inv.status === statusFilter

      const matchesTerm =
        !term ||
        inv.number?.toLowerCase().includes(term) ||
        inv.customer_name?.toLowerCase().includes(term) ||
        inv.company_name?.toLowerCase().includes(term) ||
        inv.order_number?.toLowerCase().includes(term)

      return matchesStatus && matchesTerm
    })
  }, [invoices, search, statusFilter])

  const kpis = useMemo(() => {
    const totalInvoiced = invoices.reduce(
      (sum, i) => sum + (Number(i.total) || 0),
      0
    )

    const paid = invoices.reduce(
      (sum, i) => sum + (Number(i.total_paid) || (i.status === 'PAID' ? Number(i.total) || 0 : 0)),
      0
    )

    const outstanding = invoices
      .filter((i) => i.status !== 'PAID' && i.status !== 'CANCELLED')
      .reduce((sum, i) => sum + (Number(i.balance_due !== undefined ? i.balance_due : i.total) || 0), 0)

    const today = new Date().toISOString().slice(0, 10)
    const overdueInvoices = invoices.filter((i) => {
      if (i.status === 'PAID' || i.status === 'CANCELLED') return false
      if (i.status === 'OVERDUE') return true
      return Boolean(i.due_date && i.due_date < today)
    })

    const overdueAmount = overdueInvoices.reduce(
      (sum, i) => sum + (Number(i.balance_due !== undefined ? i.balance_due : i.total) || 0),
      0
    )

    const activeCount = invoices.filter(
      (i) => i.status !== 'CANCELLED'
    ).length

    const paidCount = invoices.filter((i) => i.status === 'PAID').length
    const overdueCount = overdueInvoices.length
    const pendingCount = invoices.filter(
      (i) => i.status !== 'PAID' && i.status !== 'CANCELLED' && !overdueInvoices.includes(i)
    ).length

    return {
      totalInvoiced,
      paid,
      outstanding,
      overdueAmount,
      activeCount,
      paidCount,
      pendingCount,
      overdueCount,
    }
  }, [invoices])

  // Orders available for invoice generation (QA approved or ready to invoice)
  const qaApprovedOrders = useMemo(() => {
    return orders.filter((o) => {
      const isReady = o.status === 'READY_TO_INVOICE' || o.qa_status === 'APPROVED' || o.status === 'QC_PASSED'
      const notFullyInvoiced = Number(o.invoiced_qty || 0) < Number(o.qa_approved_qty || o.batch_size || 1)
      return isReady && notFullyInvoiced
    })
  }, [orders])

  const openCreate = () => {
    setError('')
    setSuccess('')
    const defaultCompany = companies[0]?.id || '1'
    const previewNum = defaultCompany ? previewDocumentNumber('INVOICE', defaultCompany) : ''

    const initialMode = qaApprovedOrders.length > 0 ? 'ORDER' : 'DIRECT'
    setCreateMode(initialMode)

    setForm({
      ...emptyForm,
      company: defaultCompany,
      number: previewNum,
    })

    if (initialMode === 'ORDER' && qaApprovedOrders.length > 0) {
      applyOrderToForm(qaApprovedOrders[0], defaultCompany)
    } else {
      setLines([emptyLine()])
    }

    setModal('create')
  }

  const applyOrderToForm = (order, compId) => {
    if (!order) return

    const companyId = order.company || compId || '1'
    const previewNum = previewDocumentNumber('INVOICE', companyId)
    const cust = customers.find((c) => Number(c.id) === Number(order.customer))

    // Determine billable quantity from QA record or order
    const qaRecord = qaRecords.find((q) => Number(q.order_id) === Number(order.id))
    const approvedQty = qaRecord?.qa_approved_qty || order.qa_approved_qty || order.batch_size || 1000
    const alreadyInvoiced = Number(order.invoiced_qty) || 0
    const billableQty = Math.max(approvedQty - alreadyInvoiced, 0)

    // Find product from product catalog
    const prod = products.find(
      (p) =>
        Number(p.id) === Number(order.product_id) ||
        p.code === order.product_code ||
        p.name === order.product_name
    )

    const lineRate = prod?.selling_price || prod?.mrp || order.mrp_for_printing || '250'

    const orderLines = (order.lines && order.lines.length > 0)
      ? order.lines.map((l) => ({
          id: crypto.randomUUID ? crypto.randomUUID() : `line-${Math.random()}`,
          product: l.product || '',
          product_name: l.product_name || order.product_name || 'Pharmaceutical Product',
          hsn_code: l.hsn_code || '30049099',
          quantity: String(l.quantity || billableQty),
          unit: l.unit || order.packing_size || 'Box',
          rate: String(l.rate || lineRate),
          discount: '0',
          gst_percent: '18',
        }))
      : [
          {
            id: crypto.randomUUID ? crypto.randomUUID() : `line-${Math.random()}`,
            product: prod?.id || '',
            product_name: order.product_name || prod?.name || 'Pharmaceutical Formulation',
            hsn_code: prod?.hsn_code || '30049099',
            quantity: String(billableQty),
            unit: order.packing_size || prod?.unit || 'Box',
            rate: String(lineRate),
            discount: '0',
            gst_percent: '18',
          },
        ]

    setForm((prev) => ({
      ...prev,
      company: companyId,
      customer: String(order.customer || ''),
      order: String(order.id),
      batch: String(order.batch_id || ''),
      number: previewNum,
      payment_terms: cust?.payment_terms || 'Net 30',
    }))

    setLines(orderLines)
  }

  const openView = (invoice) => {
    setViewing(invoice)
    setActiveViewTab('invoice')
    setModal('view')
  }

  const close = () => {
    if (!saving) {
      setModal('')
      setViewing(null)
      setPaymentModalOpen(false)
      setCancelModalOpen(false)
    }
  }

  const setField = (field, value) =>
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }))

  const setLineField = (id, field, value) =>
    setLines((prev) =>
      prev.map((line) => {
        if (line.id !== id) return line

        const updated = { ...line, [field]: value }

        if (field === 'product') {
          const prod = products.find((p) => String(p.id) === String(value))
          if (prod) {
            updated.product_name = prod.name || prod.code
            updated.rate = String(prod.selling_price || prod.mrp || 250)
            updated.hsn_code = prod.hsn_code || '30049099'
            updated.unit = prod.unit || 'Box'
          }
        }

        return updated
      })
    )

  const addLine = () =>
    setLines((prev) => [...prev, emptyLine()])

  const removeLine = (id) =>
    setLines((prev) => (prev.length > 1 ? prev.filter((line) => line.id !== id) : prev))

  // Compute live totals for Create modal
  const computedTotals = useMemo(() => {
    const isExempt = form.tax_exempt
    const taxPercent = isExempt ? 0 : Number(form.tax_percent) || 18

    const subtotal = lines.reduce((sum, line) => {
      const q = Number(line.quantity) || 0
      const r = Number(line.rate) || 0
      const d = Number(line.discount) || 0
      return sum + Math.max(q * r - d, 0)
    }, 0)

    const taxAmount = isExempt ? 0 : subtotal * (taxPercent / 100)
    const rawTotal = subtotal + taxAmount
    const roundOff = Math.round(rawTotal) - rawTotal
    const grandTotal = Math.round(rawTotal)

    return {
      subtotal,
      taxAmount,
      roundOff,
      total: grandTotal,
    }
  }, [lines, form.tax_percent, form.tax_exempt])

  const submitInvoice = async (event) => {
    event.preventDefault()
    if (!form.customer) {
      setError('Please select a customer for this invoice.')
      return
    }

    if (lines.length === 0 || lines.some((l) => (Number(l.quantity) || 0) <= 0)) {
      setError('Please enter valid quantities for all line items.')
      return
    }

    setSaving(true)
    setError('')

    try {
      const payload = {
        ...form,
        order: form.order || null,
        batch: form.batch || null,
        tax_percent: form.tax_exempt ? 0 : Number(form.tax_percent) || 18,
        tax_exempt: form.tax_exempt,
        subtotal: computedTotals.subtotal,
        tax_amount: computedTotals.taxAmount,
        round_off: computedTotals.roundOff,
        total: computedTotals.total,
        lines: lines.map((l) => ({
          product: l.product ? Number(l.product) : null,
          product_name: l.product_name || 'Pharmaceutical Formulation',
          hsn_code: l.hsn_code || '30049099',
          unit: l.unit || 'Box',
          quantity: Number(l.quantity) || 0,
          rate: Number(l.rate) || 0,
          discount: Number(l.discount) || 0,
          gst_percent: form.tax_exempt ? 0 : Number(l.gst_percent || form.tax_percent || 18),
        })),
      }

      await invoiceService.createInvoice(payload, user)

      setSuccess('Invoice created and issued successfully.')
      setModal('')
      await load()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  // Open Payment modal
  const openRecordPayment = (inv) => {
    const target = inv || viewing
    setPaymentTargetInvoice(target)
    const balance = target.balance_due !== undefined ? target.balance_due : target.total
    setPaymentForm({
      amount: String(balance),
      mode: 'NEFT/RTGS',
      reference: '',
      payment_date: new Date().toISOString().slice(0, 10),
      notes: '',
    })
    setPaymentModalOpen(true)
  }

  const handleSavePayment = async (e) => {
    e.preventDefault()
    if (!paymentTargetInvoice) return

    const payAmt = Number(paymentForm.amount) || 0
    if (payAmt <= 0) {
      setError('Payment amount must be greater than zero.')
      return
    }

    setSaving(true)
    setError('')

    try {
      await invoiceService.recordPayment(paymentTargetInvoice.id, paymentForm, user)
      setSuccess(`Payment of ₹${formatINR(payAmt)} recorded successfully.`)
      setPaymentModalOpen(false)

      // Refresh viewing invoice if open
      if (viewing && viewing.id === paymentTargetInvoice.id) {
        const refreshed = await invoiceService.getInvoice(viewing.id)
        setViewing(refreshed)
      }

      await load()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  // Cancel Invoice
  const handleCancelInvoice = async () => {
    if (!viewing) return
    if (!cancelReason.trim()) {
      setError('Please specify a mandatory reason for cancelling this invoice.')
      return
    }

    setSaving(true)
    setError('')

    try {
      await invoiceService.cancelInvoice(viewing.id, cancelReason.trim(), user)
      setSuccess(`Invoice ${viewing.number} cancelled. Linked order reverted to READY_TO_INVOICE.`)
      setCancelModalOpen(false)
      setModal('')
      await load()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  // Print Invoice
  const handlePrint = () => {
    recordAudit({
      action: 'invoice/printed',
      entityType: 'Invoice',
      entityId: viewing?.number,
      payload: { customer: viewing?.customer_name, total: viewing?.total },
    })
    window.print()
  }

  // Download standalone HTML Invoice
  const handleDownloadHtml = () => {
    if (!viewing) return
    recordAudit({
      action: 'invoice/exportedHtml',
      entityType: 'Invoice',
      entityId: viewing.number,
      payload: { total: viewing.total },
    })

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Tax Invoice - ${viewing.number}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 20px; color: #1e293b; }
    .tax-box { border: 1px solid #cbd5e1; padding: 24px; max-width: 800px; margin: 0 auto; }
    .hdr { display: flex; justify-content: space-between; border-bottom: 2px solid #0b73df; padding-bottom: 12px; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; background: #f8fafc; padding: 10px; margin: 12px 0; border: 1px solid #e2e8f0; }
    .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
    .party { border: 1px solid #e2e8f0; padding: 10px; }
    table { width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 12px; }
    th { background: #f1f5f9; border: 1px solid #cbd5e1; padding: 8px; text-align: left; }
    td { border: 1px solid #e2e8f0; padding: 8px; }
    .num { text-align: right; }
    .totals { width: 280px; margin-left: auto; margin-top: 10px; }
    .totals td { padding: 4px; }
    .grand { font-size: 15px; font-weight: bold; color: #0b73df; border-top: 2px solid #0b73df; }
    .words { background: #f8fafc; padding: 8px; border: 1px solid #e2e8f0; margin-top: 10px; font-weight: bold; }
    .bank { margin-top: 16px; border: 1px solid #e2e8f0; padding: 10px; background: #f8fafc; }
    .sign { margin-top: 30px; text-align: right; }
  </style>
</head>
<body>
  <div class="tax-box">
    <div class="hdr">
      <div>
        <h2 style="margin:0">${viewing.company_profile?.name || viewing.company_name}</h2>
        <p style="margin:2px 0;font-size:12px">${viewing.company_profile?.address}</p>
        <p style="margin:2px 0;font-size:12px">GSTIN: <strong>${viewing.company_profile?.gstin}</strong> | PAN: <strong>${viewing.company_profile?.pan}</strong></p>
      </div>
      <div style="text-align:right">
        <h2 style="color:#0b73df;margin:0">TAX INVOICE</h2>
        <span style="font-size:11px;color:#64748b">ORIGINAL FOR RECIPIENT</span>
      </div>
    </div>
    <div class="grid">
      <div><small>INVOICE NO</small><br><strong>${viewing.number}</strong></div>
      <div><small>DATE</small><br><strong>${formatDateIN(viewing.invoice_date)}</strong></div>
      <div><small>DUE DATE</small><br><strong>${formatDateIN(viewing.due_date)}</strong></div>
      <div><small>PLACE OF SUPPLY</small><br><strong>${viewing.customer_profile?.state || 'Gujarat'} (${viewing.customer_profile?.state_code || '24'})</strong></div>
    </div>
    <div class="parties">
      <div class="party">
        <strong style="color:#0b73df">BILLED TO:</strong>
        <p style="margin:4px 0"><strong>${viewing.customer_name}</strong></p>
        <p style="margin:2px 0;font-size:12px">${viewing.customer_profile?.billing_address}</p>
        <p style="margin:2px 0;font-size:12px">GSTIN: <strong>${viewing.customer_profile?.gstin}</strong></p>
      </div>
      <div class="party">
        <strong style="color:#0b73df">SHIPPED TO:</strong>
        <p style="margin:4px 0"><strong>${viewing.customer_name}</strong></p>
        <p style="margin:2px 0;font-size:12px">${viewing.customer_profile?.shipping_address}</p>
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th>Sr</th><th>Product</th><th>HSN</th><th class="num">Qty</th><th>Unit</th><th class="num">Rate (₹)</th><th class="num">Taxable (₹)</th><th class="num">GST %</th><th class="num">Total (₹)</th>
        </tr>
      </thead>
      <tbody>
        ${(viewing.lines || []).map((l, i) => `
          <tr>
            <td>${i + 1}</td>
            <td><strong>${l.product_name}</strong></td>
            <td>${l.hsn_code}</td>
            <td class="num">${l.quantity}</td>
            <td>${l.unit}</td>
            <td class="num">₹${formatINR(l.rate)}</td>
            <td class="num">₹${formatINR(l.taxable_value)}</td>
            <td class="num">${l.gst_percent}%</td>
            <td class="num">₹${formatINR(l.total_amount)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <div class="words">Amount in words: ${viewing.total_in_words}</div>
    <table class="totals">
      <tr><td>Taxable Value:</td><td class="num">₹${formatINR(viewing.subtotal)}</td></tr>
      ${viewing.is_intra_state ? `
        <tr><td>CGST (9%):</td><td class="num">₹${formatINR(viewing.cgst_amount)}</td></tr>
        <tr><td>SGST (9%):</td><td class="num">₹${formatINR(viewing.sgst_amount)}</td></tr>
      ` : `
        <tr><td>IGST (18%):</td><td class="num">₹${formatINR(viewing.igst_amount)}</td></tr>
      `}
      <tr><td>Round Off:</td><td class="num">₹${formatINR(viewing.round_off)}</td></tr>
      <tr class="grand"><td>Grand Total:</td><td class="num">₹${formatINR(viewing.total)}</td></tr>
    </table>
    <div class="bank">
      <strong>Bank Wire Transfer Details:</strong><br>
      Bank: ${viewing.company_profile?.bank_name} | A/C: ${viewing.company_profile?.bank_account_no} | IFSC: ${viewing.company_profile?.bank_ifsc} | Branch: ${viewing.company_profile?.bank_branch}
    </div>
    <div class="sign">
      <p>For <strong>${viewing.company_profile?.name || viewing.company_name}</strong></p>
      <br><br>
      <p>Authorized Signatory</p>
    </div>
  </div>
</body>
</html>
    `

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Invoice_${viewing.number.replace(/\//g, '_')}.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  const viewingAuditLogs = useMemo(() => {
    if (!viewing?.number) return []
    return getEntityAuditLogs('Invoice', viewing.number)
  }, [viewing])

  return (
    <div className="inv">
      <div className="inv-header">
        <div>
          <h1>Invoicing</h1>
          <p>
            Enterprise GST Tax Invoicing connected to Orders, QC & QA with automated payments and A4 printing.
          </p>
        </div>
      </div>

      {error && !modal && <Alert type="error">{error}</Alert>}
      {success && <Alert type="success">{success}</Alert>}

      <div className="inv-kpis">
        <div className="inv-kpi-card kpi-total">
          <div className="inv-kpi-top">
            <div className="inv-kpi-icon blue">
              <ReceiptIcon size={18} />
            </div>
            <span className="inv-kpi-label">Total Invoiced</span>
          </div>
          <div className="inv-kpi-value">{formatINR(kpis.totalInvoiced)}</div>
          <span className="inv-kpi-subtext">{kpis.activeCount} active invoices</span>
        </div>

        <div className="inv-kpi-card kpi-paid">
          <div className="inv-kpi-top">
            <div className="inv-kpi-icon green">
              <WalletIcon size={18} />
            </div>
            <span className="inv-kpi-label">Collected / Paid</span>
          </div>
          <div className="inv-kpi-value text-green">{formatINR(kpis.paid)}</div>
          <span className="inv-kpi-subtext">{kpis.paidCount} fully settled</span>
        </div>

        <div className="inv-kpi-card kpi-pending">
          <div className="inv-kpi-top">
            <div className="inv-kpi-icon orange">
              <ClockIcon size={18} />
            </div>
            <span className="inv-kpi-label">Pending / Outstanding</span>
          </div>
          <div className="inv-kpi-value text-orange">{formatINR(kpis.outstanding)}</div>
          <span className="inv-kpi-subtext">{kpis.pendingCount} pending payment</span>
        </div>

        <div className="inv-kpi-card kpi-overdue">
          <div className="inv-kpi-top">
            <div className="inv-kpi-icon red">
              <AlertIcon size={18} />
            </div>
            <span className="inv-kpi-label">Overdue Amount</span>
          </div>
          <div className="inv-kpi-value text-red">{formatINR(kpis.overdueAmount)}</div>
          <span className="inv-kpi-subtext">{kpis.overdueCount} require follow-up</span>
        </div>
      </div>

      <div className="inv-panel">
        <div className="inv-toolbar">
          <h3>Invoices & Billing Register</h3>

          <div className="invoice-toolbar-controls">
            <input
              className="field-input invoice-search-input"
              placeholder="Search invoice #, customer, order…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <select
              className="field-input invoice-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              {STATUS_FILTERS.map((s) => (
                <option key={s} value={s}>
                  {s === 'ALL' ? 'All statuses' : s.replace('_', ' ')}
                </option>
              ))}
            </select>

            <Button onClick={openCreate}>+ Create Invoice</Button>
          </div>
        </div>

        <div className="inv-table-scroll">
          <table className="inv-table">
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Type</th>
                <th>Company</th>
                <th>Customer</th>
                <th>Date</th>
                <th>Due Date</th>
                <th>Total (₹)</th>
                <th>Balance Due</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredInvoices.map((inv) => (
                <tr key={inv.id}>
                  <td className="cell-strong">
                    <span
                      style={{ cursor: 'pointer', color: '#0b73df', fontWeight: 700 }}
                      onClick={() => openView(inv)}
                    >
                      {inv.number}
                    </span>
                    {inv.order_number && inv.order_number !== '—' && (
                      <span style={{ display: 'block', fontSize: '10px', color: '#64748b' }}>
                        SO: {inv.order_number}
                      </span>
                    )}
                  </td>
                  <td>
                    <span
                      style={{
                        fontSize: '10px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: inv.order ? '#eff6ff' : '#f1f5f9',
                        color: inv.order ? '#1e40af' : '#475569',
                        fontWeight: 700,
                      }}
                    >
                      {inv.order ? 'ORDER' : 'DIRECT'}
                    </span>
                  </td>
                  <td>{inv.company_name}</td>
                  <td>{inv.customer_name}</td>
                  <td>{formatDateIN(inv.invoice_date)}</td>
                  <td>{inv.due_date ? formatDateIN(inv.due_date) : '—'}</td>
                  <td className="cell-strong">₹{formatINR(inv.total)}</td>
                  <td>
                    {inv.status === 'PAID' ? (
                      <span style={{ color: '#059669', fontWeight: 600 }}>₹0.00 (Settled)</span>
                    ) : inv.status === 'CANCELLED' ? (
                      <span style={{ color: '#94a3b8' }}>Cancelled</span>
                    ) : (
                      <span style={{ color: '#dc2626', fontWeight: 700 }}>
                        ₹{formatINR(inv.balance_due !== undefined ? inv.balance_due : inv.total)}
                      </span>
                    )}
                  </td>
                  <td>
                    <StatusPill tone={statusTone(inv.status)}>
                      {inv.status || 'ISSUED'}
                    </StatusPill>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <Button variant="secondary" onClick={() => openView(inv)}>
                        View
                      </Button>
                      {inv.status !== 'PAID' && inv.status !== 'CANCELLED' && (
                        <Button
                          variant="secondary"
                          onClick={() => openRecordPayment(inv)}
                          style={{ color: '#059669', borderColor: '#a7f3d0' }}
                        >
                          Pay
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {!loading && filteredInvoices.length === 0 && (
            <p className="inv-empty">
              No invoices match this filter criteria. Click "+ Create Invoice" to generate one.
            </p>
          )}
        </div>
      </div>

      {/* ========================================================
          CREATE INVOICE MODAL
          ======================================================== */}
      {modal === 'create' && (
        <Modal
          title="Create Commercial Tax Invoice"
          onClose={close}
          footer={
            <>
              <Button variant="secondary" onClick={close} disabled={saving}>
                Cancel
              </Button>
              <Button loading={saving} onClick={submitInvoice}>
                Issue Invoice
              </Button>
            </>
          }
        >
          {error && <Alert type="error">{error}</Alert>}

          {/* Mode Switcher */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <button
              type="button"
              className={`inv-tab-btn ${createMode === 'ORDER' ? 'active' : ''}`}
              onClick={() => {
                setCreateMode('ORDER')
                if (qaApprovedOrders.length > 0) {
                  applyOrderToForm(qaApprovedOrders[0], form.company)
                }
              }}
            >
              From QA-Approved Order ({qaApprovedOrders.length} Available)
            </button>
            <button
              type="button"
              className={`inv-tab-btn ${createMode === 'DIRECT' ? 'active' : ''}`}
              onClick={() => {
                setCreateMode('DIRECT')
                setForm((prev) => ({ ...prev, order: '', batch: '' }))
                setLines([emptyLine()])
              }}
            >
              Direct Commercial Invoice
            </button>
          </div>

          <form onSubmit={submitInvoice}>
            <div className="inv-form-grid">
              <div className="field">
                <label className="field-label">Company</label>
                <select
                  className="field-input"
                  value={form.company}
                  onChange={(e) => {
                    const compId = e.target.value
                    setForm({
                      ...form,
                      company: compId,
                      number: compId ? previewDocumentNumber('INVOICE', compId) : '',
                    })
                  }}
                  required
                >
                  <option value="">Select company</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {createMode === 'ORDER' ? (
                <div className="field">
                  <label className="field-label">QA-Approved Order *</label>
                  <select
                    className="field-input"
                    value={form.order}
                    onChange={(e) => {
                      const selected = orders.find((o) => String(o.id) === String(e.target.value))
                      if (selected) applyOrderToForm(selected, form.company)
                    }}
                    required
                  >
                    <option value="">Select QA-Approved Order</option>
                    {qaApprovedOrders.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.number} — {o.customer_name} ({o.product_name})
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              <div className="field">
                <label className="field-label">Customer *</label>
                <select
                  className="field-input"
                  value={form.customer}
                  onChange={(e) => {
                    const custId = e.target.value
                    const cust = customers.find((c) => String(c.id) === String(custId))
                    setForm({
                      ...form,
                      customer: custId,
                      payment_terms: cust?.payment_terms || 'Net 30',
                    })
                  }}
                  required
                >
                  <option value="">Select customer</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code || 'CUST'}) - GSTIN: {c.gstin || 'Unregistered'}
                    </option>
                  ))}
                </select>
              </div>

              <Input
                label="Invoice Number (Indian FY Sequential)"
                value={form.number}
                disabled
                readOnly
              />

              <Input
                label="Invoice Date"
                type="date"
                value={form.invoice_date}
                onChange={(e) => setField('invoice_date', e.target.value)}
                required
              />

              <Input
                label="Due Date"
                type="date"
                value={form.due_date}
                onChange={(e) => setField('due_date', e.target.value)}
                required
              />

              <div className="field">
                <label className="field-label">Payment Terms</label>
                <input
                  className="field-input"
                  value={form.payment_terms}
                  onChange={(e) => setField('payment_terms', e.target.value)}
                  placeholder="e.g. Net 30, Immediate"
                />
              </div>

              <div className="field" style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '24px' }}>
                <input
                  type="checkbox"
                  id="tax_exempt_chk"
                  checked={form.tax_exempt}
                  onChange={(e) => setField('tax_exempt', e.target.checked)}
                />
                <label htmlFor="tax_exempt_chk" style={{ fontSize: '13px', cursor: 'pointer', fontWeight: 600 }}>
                  Tax Exempt / Tax Off (Zero GST)
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
              <h4 className="invoice-lines-title" style={{ margin: 0 }}>
                Billable Line Items
              </h4>
              <Button type="button" variant="secondary" onClick={addLine}>
                + Add Line
              </Button>
            </div>

            <div className="inv-table-scroll" style={{ marginTop: '8px' }}>
              <table className="inv-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>HSN</th>
                    <th>Qty</th>
                    <th>Unit</th>
                    <th>Rate (₹)</th>
                    <th>Discount (₹)</th>
                    <th>Taxable (₹)</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.id}>
                      <td style={{ minWidth: '180px' }}>
                        <select
                          className="field-input"
                          value={line.product}
                          onChange={(e) => setLineField(line.id, 'product', e.target.value)}
                        >
                          <option value="">Custom Formulation / Item</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name || p.code} ({p.code})
                            </option>
                          ))}
                        </select>
                        <input
                          className="field-input"
                          style={{ marginTop: '4px' }}
                          placeholder="Item Description"
                          value={line.product_name}
                          onChange={(e) => setLineField(line.id, 'product_name', e.target.value)}
                        />
                      </td>
                      <td style={{ width: '100px' }}>
                        <input
                          className="field-input"
                          value={line.hsn_code}
                          onChange={(e) => setLineField(line.id, 'hsn_code', e.target.value)}
                        />
                      </td>
                      <td style={{ width: '90px' }}>
                        <input
                          className="field-input"
                          type="number"
                          min="1"
                          step="1"
                          value={line.quantity}
                          onChange={(e) => setLineField(line.id, 'quantity', e.target.value)}
                          required
                        />
                      </td>
                      <td style={{ width: '80px' }}>
                        <input
                          className="field-input"
                          value={line.unit}
                          onChange={(e) => setLineField(line.id, 'unit', e.target.value)}
                        />
                      </td>
                      <td style={{ width: '105px' }}>
                        <input
                          className="field-input"
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.rate}
                          onChange={(e) => setLineField(line.id, 'rate', e.target.value)}
                          required
                        />
                      </td>
                      <td style={{ width: '90px' }}>
                        <input
                          className="field-input"
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.discount}
                          onChange={(e) => setLineField(line.id, 'discount', e.target.value)}
                        />
                      </td>
                      <td className="cell-strong" style={{ width: '110px' }}>
                        ₹{formatINR(Math.max((Number(line.quantity) || 0) * (Number(line.rate) || 0) - (Number(line.discount) || 0), 0))}
                      </td>
                      <td style={{ width: '40px' }}>
                        <button
                          type="button"
                          className="invoice-remove-line"
                          onClick={() => removeLine(line.id)}
                          aria-label="Remove line"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="field field-full" style={{ marginTop: '16px' }}>
              <label className="field-label">Terms & Notes</label>
              <textarea
                className="field-input"
                rows={2}
                value={form.notes}
                onChange={(e) => setField('notes', e.target.value)}
              />
            </div>

            <div className="invoice-totals">
              <div>
                <span>Taxable Subtotal:</span>
                <strong>₹{formatINR(computedTotals.subtotal)}</strong>
              </div>
              <div>
                <span>GST Tax {!form.tax_exempt ? `(${form.tax_percent}%)` : '(Exempt)'}:</span>
                <strong>₹{formatINR(computedTotals.taxAmount)}</strong>
              </div>
              <div>
                <span>Round Off:</span>
                <strong>₹{formatINR(computedTotals.roundOff)}</strong>
              </div>
              <div className="invoice-grand-total">
                <span>Total Amount:</span>
                <strong>₹{formatINR(computedTotals.total)}</strong>
              </div>
            </div>
          </form>
        </Modal>
      )}

      {/* ========================================================
          VIEW INVOICE MODAL
          ======================================================== */}
      {modal === 'view' && viewing && (
        <Modal
          title={`Invoice ${viewing.number}`}
          onClose={close}
          footer={
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
              <div>
                {viewing.status !== 'CANCELLED' && (
                  <Button
                    variant="secondary"
                    onClick={() => setCancelModalOpen(true)}
                    style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                  >
                    Cancel Invoice
                  </Button>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button variant="secondary" onClick={handleDownloadHtml}>
                  Download HTML
                </Button>
                <Button variant="secondary" onClick={handlePrint}>
                  Print Invoice
                </Button>
                {viewing.status !== 'PAID' && viewing.status !== 'CANCELLED' && (
                  <Button onClick={() => openRecordPayment(viewing)}>
                    Record Payment
                  </Button>
                )}
                <Button variant="secondary" onClick={close}>
                  Close
                </Button>
              </div>
            </div>
          }
        >
          {/* View Tab Nav */}
          <div className="inv-view-tabs no-print">
            <button
              className={`inv-tab-btn ${activeViewTab === 'invoice' ? 'active' : ''}`}
              onClick={() => setActiveViewTab('invoice')}
            >
              Tax Invoice (A4 Layout)
            </button>
            <button
              className={`inv-tab-btn ${activeViewTab === 'payments' ? 'active' : ''}`}
              onClick={() => setActiveViewTab('payments')}
            >
              Payments & Balance ({viewing.payments?.length || 0})
            </button>
            <button
              className={`inv-tab-btn ${activeViewTab === 'activity' ? 'active' : ''}`}
              onClick={() => setActiveViewTab('activity')}
            >
              Activity & Audit History
            </button>
          </div>

          {/* TAB 1: TAX INVOICE */}
          {activeViewTab === 'invoice' && (
            <div className="print-only-invoice tax-inv-box">
              {/* Header */}
              <div className="tax-inv-header">
                <div className="tax-inv-company">
                  <h2>{viewing.company_profile?.name || viewing.company_name}</h2>
                  <p>{viewing.company_profile?.address}</p>
                  <p>
                    GSTIN: <strong>{viewing.company_profile?.gstin}</strong> | PAN: <strong>{viewing.company_profile?.pan}</strong> | State: <strong>{viewing.company_profile?.state} ({viewing.company_profile?.state_code})</strong>
                  </p>
                </div>
                <div className="tax-inv-title-badge">
                  <h1>TAX INVOICE</h1>
                  <div className="tax-inv-subtitle">ORIGINAL FOR RECIPIENT</div>
                  <div style={{ marginTop: '6px' }}>
                    <StatusPill tone={statusTone(viewing.status)}>
                      {viewing.status || 'ISSUED'}
                    </StatusPill>
                  </div>
                </div>
              </div>

              {/* Meta Grid */}
              <div className="tax-inv-meta-grid">
                <div className="tax-inv-meta-col">
                  <span>Invoice Number</span>
                  <strong>{viewing.number}</strong>
                </div>
                <div className="tax-inv-meta-col">
                  <span>Invoice Date</span>
                  <strong>{formatDateIN(viewing.invoice_date)}</strong>
                </div>
                <div className="tax-inv-meta-col">
                  <span>Payment Terms / Due</span>
                  <strong>{viewing.customer_profile?.payment_terms || 'Net 30'} ({viewing.due_date ? formatDateIN(viewing.due_date) : 'Immediate'})</strong>
                </div>
                <div className="tax-inv-meta-col">
                  <span>Place of Supply</span>
                  <strong>{viewing.customer_profile?.state || 'Gujarat'} ({viewing.customer_profile?.state_code || '24'})</strong>
                </div>
              </div>

              {/* Traceability Bar */}
              {(viewing.order_number !== '—' || viewing.qa_number !== '—' || viewing.qc_number !== '—') && (
                <div className="tax-inv-traceability">
                  <div>
                    Sales Order Ref: <strong>{viewing.order_number}</strong>
                  </div>
                  <div>
                    QA Release Cert: <strong>{viewing.qa_number}</strong>
                  </div>
                  <div>
                    QC Inspection: <strong>{viewing.qc_number}</strong>
                  </div>
                  <div>
                    Invoice Type: <strong>{viewing.order ? 'ORDER-BASED' : 'DIRECT COMMERCIAL'}</strong>
                  </div>
                </div>
              )}

              {/* Parties */}
              <div className="tax-inv-parties">
                <div className="tax-inv-party-card">
                  <h4>Billed To (Customer Details)</h4>
                  <p><strong>{viewing.customer_name}</strong></p>
                  <p>{viewing.customer_profile?.billing_address}</p>
                  <p>
                    GSTIN: <strong>{viewing.customer_profile?.gstin || 'Unregistered'}</strong>
                  </p>
                  <p>
                    State: <strong>{viewing.customer_profile?.state || 'Gujarat'} ({viewing.customer_profile?.state_code || '24'})</strong>
                  </p>
                </div>
                <div className="tax-inv-party-card">
                  <h4>Shipped To (Delivery Address)</h4>
                  <p><strong>{viewing.customer_name}</strong></p>
                  <p>{viewing.customer_profile?.shipping_address || viewing.customer_profile?.billing_address}</p>
                  <p>
                    State: <strong>{viewing.customer_profile?.state || 'Gujarat'} ({viewing.customer_profile?.state_code || '24'})</strong>
                  </p>
                </div>
              </div>

              {/* Line Items Table */}
              <table className="tax-inv-table">
                <thead>
                  <tr>
                    <th>Sr</th>
                    <th>Product & Description</th>
                    <th>HSN</th>
                    <th className="num">Qty</th>
                    <th>Unit</th>
                    <th className="num">Rate (₹)</th>
                    <th className="num">Discount (₹)</th>
                    <th className="num">Taxable (₹)</th>
                    <th className="num">GST %</th>
                    <th className="num">Total (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {(viewing.lines || []).map((line, idx) => (
                    <tr key={idx}>
                      <td>{idx + 1}</td>
                      <td>
                        <strong>{line.product_name}</strong>
                        {line.description && <div style={{ fontSize: '10px', color: '#64748b' }}>{line.description}</div>}
                      </td>
                      <td>{line.hsn_code}</td>
                      <td className="num">{line.quantity}</td>
                      <td>{line.unit}</td>
                      <td className="num">₹{formatINR(line.rate)}</td>
                      <td className="num">₹{formatINR(line.discount)}</td>
                      <td className="num">₹{formatINR(line.taxable_value)}</td>
                      <td className="num">{line.gst_percent}%</td>
                      <td className="num">₹{formatINR(line.total_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Amount in words */}
              <div className="tax-inv-words">
                <strong>Amount in Words: </strong>
                {viewing.total_in_words || numberToWordsINR(viewing.total)}
              </div>

              {/* Bottom Section: Bank Details & Totals */}
              <div className="tax-inv-bottom">
                <div>
                  <div className="tax-inv-bank-box">
                    <h4>Bank Details for Wire Transfer (NEFT/RTGS)</h4>
                    <p>Bank Name: <strong>{viewing.company_profile?.bank_name}</strong></p>
                    <p>Account Number: <strong>{viewing.company_profile?.bank_account_no}</strong></p>
                    <p>IFSC Code: <strong>{viewing.company_profile?.bank_ifsc}</strong></p>
                    <p>Branch: <strong>{viewing.company_profile?.bank_branch}</strong></p>
                  </div>

                  {viewing.notes && (
                    <div style={{ marginTop: '12px', fontSize: '11px', color: '#475569' }}>
                      <strong>Terms & Conditions:</strong>
                      <p style={{ margin: '4px 0' }}>{viewing.notes}</p>
                    </div>
                  )}
                </div>

                <div>
                  <table className="tax-inv-summary-table">
                    <tbody>
                      <tr>
                        <td>Taxable Value:</td>
                        <td>₹{formatINR(viewing.subtotal)}</td>
                      </tr>
                      {viewing.is_intra_state ? (
                        <>
                          <tr>
                            <td>CGST (9%):</td>
                            <td>₹{formatINR(viewing.cgst_amount)}</td>
                          </tr>
                          <tr>
                            <td>SGST (9%):</td>
                            <td>₹{formatINR(viewing.sgst_amount)}</td>
                          </tr>
                        </>
                      ) : (
                        <tr>
                          <td>IGST (18%):</td>
                          <td>₹{formatINR(viewing.igst_amount)}</td>
                        </tr>
                      )}
                      <tr>
                        <td>Round Off:</td>
                        <td>₹{formatINR(viewing.round_off)}</td>
                      </tr>
                      <tr className="grand-total">
                        <td>Total Amount:</td>
                        <td>₹{formatINR(viewing.total)}</td>
                      </tr>
                    </tbody>
                  </table>

                  <div className="tax-inv-sign">
                    <p>For <strong>{viewing.company_profile?.name || viewing.company_name}</strong></p>
                    <br />
                    <p>Authorized Signatory</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PAYMENTS & BALANCE */}
          {activeViewTab === 'payments' && (
            <div style={{ padding: '8px 0' }}>
              <div className="inv-modal-kpis" style={{ marginBottom: '16px' }}>
                <div className="inv-modal-kpi-card">
                  <span>Total Billed</span>
                  <strong>{formatINR(viewing.total)}</strong>
                </div>
                <div className="inv-modal-kpi-card">
                  <span>Total Received</span>
                  <strong style={{ color: '#059669' }}>{formatINR(viewing.total_paid || 0)}</strong>
                </div>
                <div className="inv-modal-kpi-card">
                  <span>Balance Due</span>
                  <strong style={{ color: '#dc2626' }}>{formatINR(viewing.balance_due !== undefined ? viewing.balance_due : viewing.total)}</strong>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h4 style={{ margin: 0, color: '#163b59' }}>Payment Transactions</h4>
                {viewing.status !== 'PAID' && viewing.status !== 'CANCELLED' && (
                  <Button onClick={() => openRecordPayment(viewing)}>
                    + Record New Payment
                  </Button>
                )}
              </div>

              <div className="inv-table-scroll">
                <table className="inv-table">
                  <thead>
                    <tr>
                      <th>Payment #</th>
                      <th>Date</th>
                      <th>Mode</th>
                      <th>Reference / UTR</th>
                      <th>Amount (₹)</th>
                      <th>Recorded By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(viewing.payments || []).map((p, idx) => (
                      <tr key={idx}>
                        <td className="cell-strong">{p.number}</td>
                        <td>{formatDateIN(p.payment_date)}</td>
                        <td>
                          <span style={{ fontWeight: 600, color: '#0b73df' }}>{p.mode}</span>
                        </td>
                        <td>{p.reference || '—'}</td>
                        <td className="cell-strong" style={{ color: '#059669' }}>
                          ₹{formatINR(p.amount)}
                        </td>
                        <td>{p.recorded_by}</td>
                      </tr>
                    ))}
                    {(!viewing.payments || viewing.payments.length === 0) && (
                      <tr>
                        <td colSpan={6} className="inv-empty">
                          No payments recorded yet for this invoice.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: ACTIVITY / HISTORY */}
          {activeViewTab === 'activity' && (
            <div style={{ padding: '8px 0' }}>
              <h4 style={{ margin: '0 0 12px', color: '#163b59' }}>
                Append-Only Audit Trail for Invoice {viewing.number}
              </h4>
              <div className="inv-table-scroll">
                <table className="inv-table">
                  <thead>
                    <tr>
                      <th>Timestamp (IST)</th>
                      <th>User</th>
                      <th>Action</th>
                      <th>Description</th>
                      <th>Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewingAuditLogs.map((log) => (
                      <tr key={log.id}>
                        <td>{formatDateTimeIN(log.timestamp)}</td>
                        <td>
                          <strong>{log.user_name || log.user_id}</strong>
                          <span style={{ display: 'block', fontSize: '10px', color: '#64748b' }}>{log.role}</span>
                        </td>
                        <td>
                          <span style={{ fontWeight: 700, color: '#0b73df' }}>{log.action}</span>
                        </td>
                        <td>{log.description}</td>
                        <td>{log.remarks || '—'}</td>
                      </tr>
                    ))}
                    {viewingAuditLogs.length === 0 && (
                      <tr>
                        <td colSpan={5} className="inv-empty">
                          No activity history entries found for this invoice.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* ========================================================
          PAYMENT RECORDING MODAL
          ======================================================== */}
      {paymentModalOpen && paymentTargetInvoice && (
        <Modal
          title={`Record Payment for ${paymentTargetInvoice.number}`}
          onClose={() => setPaymentModalOpen(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setPaymentModalOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button loading={saving} onClick={handleSavePayment}>
                Confirm Payment
              </Button>
            </>
          }
        >
          {error && <Alert type="error">{error}</Alert>}

          <form onSubmit={handleSavePayment}>
            <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', marginBottom: '16px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span>Customer: <strong>{paymentTargetInvoice.customer_name}</strong></span>
                <span>
                  Outstanding Balance: <strong style={{ color: '#dc2626' }}>
                    ₹{formatINR(paymentTargetInvoice.balance_due !== undefined ? paymentTargetInvoice.balance_due : paymentTargetInvoice.total)}
                  </strong>
                </span>
              </div>
            </div>

            <div className="inv-form-grid">
              <Input
                label="Payment Amount (₹) *"
                type="number"
                min="0.01"
                step="0.01"
                value={paymentForm.amount}
                onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                required
              />

              <div className="field">
                <label className="field-label">Payment Mode *</label>
                <select
                  className="field-input"
                  value={paymentForm.mode}
                  onChange={(e) => setPaymentForm({ ...paymentForm, mode: e.target.value })}
                  required
                >
                  {PAYMENT_MODES.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              <Input
                label="Payment Date *"
                type="date"
                value={paymentForm.payment_date}
                onChange={(e) => setPaymentForm({ ...paymentForm, payment_date: e.target.value })}
                required
              />

              <Input
                label="Reference / UTR / Cheque #"
                value={paymentForm.reference}
                onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })}
                placeholder="e.g. UTR12345678, CHQ-998877"
              />
            </div>

            <div className="field field-full" style={{ marginTop: '12px' }}>
              <label className="field-label">Payment Remarks</label>
              <input
                className="field-input"
                value={paymentForm.notes}
                onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                placeholder="Optional payment notes or bank narration"
              />
            </div>
          </form>
        </Modal>
      )}

      {/* ========================================================
          CANCELLATION REASON MODAL
          ======================================================== */}
      {cancelModalOpen && viewing && (
        <Modal
          title={`Cancel Invoice ${viewing.number}`}
          onClose={() => setCancelModalOpen(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setCancelModalOpen(false)} disabled={saving}>
                Back
              </Button>
              <Button
                loading={saving}
                onClick={handleCancelInvoice}
                style={{ background: '#dc2626', borderColor: '#b91c1c' }}
              >
                Confirm Cancellation
              </Button>
            </>
          }
        >
          {error && <Alert type="error">{error}</Alert>}

          <p style={{ color: '#475569', fontSize: '13px' }}>
            Are you sure you want to cancel invoice <strong>{viewing.number}</strong>?
            This action will mark the invoice as <strong>CANCELLED</strong>, revert any linked Sales Order back to <strong>READY_TO_INVOICE</strong>, and create a permanent audit log entry.
          </p>

          <div className="field field-full" style={{ marginTop: '16px' }}>
            <label className="field-label">Mandatory Reason for Cancellation *</label>
            <textarea
              className="field-input"
              rows={3}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. Incorrect tax configuration, client requested revision, order cancelled by buyer..."
              required
            />
          </div>
        </Modal>
      )}
    </div>
  )
}