import { store } from '../../store/store'
import { delay } from '../../store/mockApi'
import {
  addInvoice,
  editInvoice,
  setInvoiceStatus,
  addPaymentRecord,
  setOrderStatus,
} from '../../store/erpSlice'
import {
  getScopedCompanyId,
  enforceCompanyPayload,
} from '../../utils/companyScope'
import { commitDocumentNumber } from '../../utils/documentNumbers'
import { recordAudit } from '../../utils/audit'
import { numberToWordsINR } from '../../utils/formatters'
import { deriveStateCode } from './InvoiceViewPage'

export function computeSheetGrandTotal(sheet) {
  if (!sheet) return 0
  if (sheet.finalTotalAfterTax !== undefined && sheet.finalTotalAfterTax !== null && !isNaN(Number(sheet.finalTotalAfterTax))) {
    return Math.round(Number(sheet.finalTotalAfterTax))
  }
  let totalTaxable = 0
  let totalCgst = 0
  let totalSgst = 0
  const lines = sheet.lines || []
  lines.forEach((l) => {
    const qty = l.qty === '' || l.qty === undefined ? (l.quantity !== undefined ? parseFloat(l.quantity) || 0 : 0) : parseFloat(l.qty) || 0
    const rate = l.rate === '' || l.rate === undefined ? 0 : parseFloat(l.rate) || 0
    const taxable = Math.round((qty * rate + Number.EPSILON) * 10000) / 10000
    const cgstRate = l.cgst_rate === '' || l.cgst_rate === undefined ? 0 : parseFloat(l.cgst_rate) || 0
    const sgstRate = l.sgst_rate === '' || l.sgst_rate === undefined ? 0 : parseFloat(l.sgst_rate) || 0
    const cgst = Math.round(((taxable * cgstRate) / 100 + Number.EPSILON) * 10000) / 10000
    const sgst = Math.round(((taxable * sgstRate) / 100 + Number.EPSILON) * 10000) / 10000
    totalTaxable += taxable
    totalCgst += cgst
    totalSgst += sgst
  })
  const postage = sheet.postage_packing === '' || sheet.postage_packing === undefined ? 0 : parseFloat(sheet.postage_packing) || 0
  const totalTax = Math.round((totalCgst + totalSgst + Number.EPSILON) * 10000) / 10000
  const rawTotal = Math.round((totalTaxable + postage + totalTax + Number.EPSILON) * 10000) / 10000
  let roundOff = 0
  if (sheet.rounding_off_override !== null && sheet.rounding_off_override !== undefined && sheet.rounding_off_override !== '') {
    roundOff = parseFloat(sheet.rounding_off_override) || 0
  } else {
    roundOff = Math.round((Math.round(rawTotal) - rawTotal + Number.EPSILON) * 10000) / 10000
  }
  return Math.round(rawTotal + roundOff)
}

export function resolveDueDate(inv, order, customer) {
  if (inv?.due_date && String(inv.due_date).trim() && inv.due_date !== '—') {
    return inv.due_date
  }
  const terms =
    inv?.payment_terms ||
    order?.payment_terms ||
    order?.credit_days ||
    customer?.payment_terms ||
    customer?.credit_days

  if (terms) {
    const match = String(terms).match(/\d+/)
    if (match) {
      const days = parseInt(match[0], 10)
      if (!isNaN(days) && days > 0) {
        const invDateStr = inv?.invoice_date || order?.order_date || new Date().toISOString()
        const baseDate = new Date(invDateStr)
        if (!isNaN(baseDate.getTime())) {
          const due = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000)
          return due.toISOString().slice(0, 10)
        }
      }
    }
  }
  return null
}

function hydrateInvoice(inv, state) {
  const compKey = state?.activeCompanyKey || (Number(inv.company) === 2 ? 'tej' : 'cmhp')
  const compOrders = state?.byCompany?.[compKey]?.orders || state?.orders || []
  const orderId = inv.order || inv.order_id
  const order = compOrders.find((o) =>
    (orderId && (String(o.id) === String(orderId) || String(o.number) === String(orderId))) ||
    (inv.order_number && (String(o.number) === String(inv.order_number) || String(o.id) === String(inv.order_number)))
  )
  const custId = inv.customer || order?.customer
  const custName = inv.customer_name || order?.customer_name
  const customer = (state.customers || []).find((c) =>
    (custId && String(c.id) === String(custId)) || (custName && c.name === custName)
  )
  const company = (state.companies || []).find((c) => Number(c.id) === Number(inv.company))
  const qc = order ? (state.qcRecords || []).find((q) => Number(q.order_id) === Number(order.id)) : null
  const qa = order ? (state.qaRecords || []).find((q) => Number(q.order_id) === Number(order.id)) : null

  // Sheet data from savedOrderInvoices or inv.sheetData
  const savedSheet =
    (order?.id && state.orderInvoices?.[String(order.id)]) ||
    (inv.order && state.orderInvoices?.[String(inv.order)]) ||
    (inv.id && state.orderInvoices?.[String(inv.id)]) ||
    inv.sheetData

  // Company details
  const companyProfile = {
    name: company?.name || (Number(inv.company) === 1 ? 'CMHP Pharma' : 'Tej Biocare'),
    gstin: company?.gst_number || company?.gstin || (Number(inv.company) === 1 ? '24AAACC1234P1Z5' : '24BBBCC5678Q1Z2'),
    pan: company?.pan || (Number(inv.company) === 1 ? 'AAACC1234P' : 'BBBCC5678Q'),
    state: company?.state || 'Gujarat',
    state_code: company?.state_code || '24',
    address: company?.address || 'Plot No. 42, GIDC Industrial Estate, Vatva, Ahmedabad - 382445, Gujarat, India',
    bank_name: company?.bank_name || 'HDFC Bank Ltd',
    bank_account_no: company?.bank_account_no || '50200088991122',
    bank_ifsc: company?.bank_ifsc || 'HDFC0001234',
    bank_branch: company?.bank_branch || 'Vatva Industrial Area, Ahmedabad',
  }

  // Customer details: strictly linked to order/customer
  const customerName = order?.customer_name || savedSheet?.consignee_name || customer?.name || inv.customer_name || '—'
  const customerProfile = {
    name: customerName,
    code: customer?.code || '—',
    gstin: customer?.gstin || savedSheet?.consignee_gstin || '—',
    state: customer?.state || savedSheet?.consignee_state || 'Gujarat',
    state_code:
      customer?.state_code ||
      deriveStateCode(
        customer?.gstin || savedSheet?.consignee_gstin,
        customer?.state || savedSheet?.consignee_state
      ) ||
      savedSheet?.consignee_code ||
      '24',
    billing_address: customer?.address || customer?.billing_address || savedSheet?.consignee_address || '—',
    shipping_address: customer?.shipping_address || customer?.address || savedSheet?.buyer_address || '—',
    payment_terms: customer?.payment_terms || 'Net 30',
  }

  // Calculate grand total: Single source of truth from sheet or invoice/order
  let finalTotal = 0
  if (savedSheet) {
    finalTotal = computeSheetGrandTotal(savedSheet)
  } else if (inv.total !== undefined && inv.total !== null && Number(inv.total) > 0) {
    finalTotal = Math.round(Number(inv.total))
  } else if (inv.total_amount !== undefined && inv.total_amount !== null && Number(inv.total_amount) > 0) {
    finalTotal = Math.round(Number(inv.total_amount))
  } else if (order?.total_amount !== undefined && order?.total_amount !== null && Number(order.total_amount) > 0) {
    finalTotal = Math.round(Number(order.total_amount))
  }

  // Invoice Number
  const number = inv.number || inv.invoice_no || savedSheet?.invoice_no || generateInvoiceNumber(state.invoices || [], inv.invoice_date || new Date())

  // Payments linked to this invoice
  const compPayments = state?.byCompany?.[compKey]?.payments || state?.payments || []
  const invoicePayments = compPayments.filter(
    (p) =>
      (p.invoice_id && String(p.invoice_id) === String(inv.id)) ||
      (p.invoice_number && (String(p.invoice_number) === String(number) || String(p.invoice_number) === String(inv.number)))
  )
  const totalPaid = invoicePayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0) + (inv.status === 'PAID' && invoicePayments.length === 0 ? finalTotal : 0)
  const balanceDue = Math.max(finalTotal - totalPaid, 0)

  // Due Date
  const dueDate = resolveDueDate(inv, order, customer)

  // Status Logic
  const today = new Date().toISOString().slice(0, 10)
  let status = 'ISSUED'
  if (balanceDue === 0 && (finalTotal > 0 || totalPaid > 0 || inv.status === 'PAID')) {
    status = 'PAID'
  } else if (dueDate && dueDate < today && balanceDue > 0) {
    status = 'OVERDUE'
  } else if (inv.status === 'CANCELLED') {
    status = 'CANCELLED'
  } else {
    status = 'ISSUED'
  }

  return {
    ...inv,
    number,
    invoice_no: number,
    company_name: companyProfile.name,
    company_profile: companyProfile,
    customer_name: customerName,
    customer_profile: customerProfile,
    order_number: order?.number || inv.order_number || (order?.id ? `ORD-${order.id}` : '—'),
    qc_number: qc?.number || '—',
    qa_number: qa?.number || '—',
    total: finalTotal,
    total_amount: finalTotal,
    total_in_words: numberToWordsINR(finalTotal),
    payments: invoicePayments,
    total_paid: totalPaid,
    balance_due: balanceDue,
    due_date: dueDate,
    status,
    sheetData: savedSheet || inv.sheetData,
  }
}

function assertInvoiceCompany(id) {
  const state = store.getState().erp
  const companyId = getScopedCompanyId()
  const compKey = companyId === 2 ? 'tej' : 'cmhp'
  const list = state?.byCompany?.[compKey]?.invoices || state.invoices || []
  const invoice = list.find((row) => Number(row.id) === Number(id))
  if (!companyId || !invoice || (invoice.company && Number(invoice.company) !== Number(companyId))) {
    throw new Error('This invoice does not belong to the active company.')
  }
  return invoice
}

export const invoiceService = {
  getInvoices: () => {
    const state = store.getState().erp
    const companyId = getScopedCompanyId()
    if (!companyId) return delay([])
    const compKey = companyId === 2 ? 'tej' : 'cmhp'
    const list = state?.byCompany?.[compKey]?.invoices || state.invoices || []

    return delay(
      list
        .filter((inv) => !inv.company || Number(inv.company) === Number(companyId))
        .map((inv) => hydrateInvoice(inv, state))
    )
  },

  getInvoice: (id) => {
    const state = store.getState().erp
    const companyId = getScopedCompanyId()
    const compKey = companyId === 2 ? 'tej' : 'cmhp'
    const list = state?.byCompany?.[compKey]?.invoices || state.invoices || []
    const invoice = list.find((row) => Number(row.id) === Number(id))
    if (!invoice || (companyId && invoice.company && Number(invoice.company) !== Number(companyId))) {
      return delay(null)
    }
    return delay(hydrateInvoice(invoice, state))
  },

  createInvoice: (payload, user = null) => {
    const scoped = enforceCompanyPayload(payload)
    const companyId = Number(scoped.company) || 1
    const companyKey = companyId === 2 ? 'tej' : 'cmhp'
    const invoiceNumber = payload.number || commitDocumentNumber('INVOICE', companyId)

    const rawTotal = (payload.lines || []).reduce((sum, l) => {
      const amt = (Number(l.quantity) || 0) * (Number(l.rate) || 0)
      const tax = amt * ((Number(payload.tax_percent || 18)) / 100)
      return sum + amt + tax
    }, 0)

    const newInvoice = {
      ...scoped,
      number: invoiceNumber,
      company: companyId,
      companyId: companyKey,
      customer: Number(scoped.customer),
      order: scoped.order ? Number(scoped.order) : null,
      batch: scoped.batch ? Number(scoped.batch) : null,
      invoice_type: scoped.order ? 'ORDER' : 'DIRECT',
      status: 'ISSUED', // Issued upon creation per specification
      total: Math.round(rawTotal),
      lines: (scoped.lines || []).map((line) => ({
        ...line,
        product: line.product ? Number(line.product) : null,
      })),
      created_at: new Date().toISOString(),
      created_by: user?.first_name || user?.username || 'Billing Staff',
    }

    store.dispatch(addInvoice(newInvoice))

    // If generated from an Order, update order's invoiced quantity and status
    if (scoped.order) {
      const order = store.getState().erp.orders.find((o) => Number(o.id) === Number(scoped.order))
      if (order) {
        const invoicedTotalQty = (scoped.lines || []).reduce((s, l) => s + (Number(l.quantity) || 0), 0)
        const previousInvoiced = Number(order.invoiced_qty) || 0
        const updatedInvoiced = previousInvoiced + invoicedTotalQty
        store.dispatch(
          setOrderStatus({
            id: order.id,
            status: 'INVOICED',
            invoiced_qty: updatedInvoiced,
          })
        )
      }
    }

    recordAudit({
      action: 'invoice/created',
      entityType: 'Invoice',
      entityId: invoiceNumber,
      payload: { customer: scoped.customer, total: Math.round(rawTotal), orderId: scoped.order },
    })

    return delay(newInvoice)
  },

  recordPayment: (invoiceId, { amount, mode, reference, payment_date, notes }, user = null) => {
    assertInvoiceCompany(invoiceId)
    const state = store.getState().erp
    const invoice = state.invoices.find((i) => Number(i.id) === Number(invoiceId))
    if (!invoice) throw new Error('Invoice not found')

    const payAmount = Number(amount) || 0
    if (payAmount <= 0) throw new Error('Payment amount must be greater than zero')

    const paymentNumber = commitDocumentNumber('PAYMENT', invoice.company)
    const paymentRecord = {
      number: paymentNumber,
      invoice_id: invoice.id,
      invoice_number: invoice.number,
      company: invoice.company,
      companyId: Number(invoice.company) === 2 ? 'tej' : 'cmhp',
      customer: invoice.customer,
      amount: payAmount,
      mode: mode || 'NEFT',
      reference: reference || '—',
      payment_date: payment_date || new Date().toISOString().slice(0, 10),
      notes: notes || '',
      recorded_by: user?.first_name || user?.username || 'Finance Officer',
    }

    store.dispatch(addPaymentRecord(paymentRecord))

    // Calculate total paid including this payment
    const existingPayments = (state.payments || []).filter((p) => Number(p.invoice_id) === Number(invoiceId))
    const totalPaidSoFar = existingPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0) + payAmount
    const invoiceTotal = Number(invoice.total) || 0

    const nextStatus = totalPaidSoFar >= invoiceTotal ? 'PAID' : 'PARTIALLY_PAID'

    store.dispatch(
      setInvoiceStatus({
        id: invoice.id,
        status: nextStatus,
        paid_on: paymentRecord.payment_date,
      })
    )

    // If fully paid and linked to Order, sync Order status to PAID
    if (nextStatus === 'PAID' && invoice.order) {
      store.dispatch(
        setOrderStatus({
          id: invoice.order,
          status: 'PAID',
        })
      )
    }

    recordAudit({
      action: 'invoice/paymentRecorded',
      entityType: 'Payment',
      entityId: paymentNumber,
      payload: { invoice: invoice.number, amount: payAmount, mode, reference, newStatus: nextStatus },
    })

    return delay(paymentRecord)
  },

  updateInvoice: (id, payload, user = null) => {
    assertInvoiceCompany(id)
    const state = store.getState().erp
    const existing = state.invoices.find((i) => Number(i.id) === Number(id))
    if (existing && existing.status !== 'DRAFT') {
      throw new Error('Invoice is locked and cannot be edited after issuance. Use credit note or cancellation.')
    }

    const safePayload = { ...payload }
    delete safePayload.company

    store.dispatch(editInvoice({ id, payload: safePayload }))
    recordAudit({
      action: 'invoice/updated',
      entityType: 'Invoice',
      entityId: existing?.number || id,
      payload: safePayload,
    })
    return delay(null)
  },

  cancelInvoice: (id, reason = '', user = null) => {
    assertInvoiceCompany(id)
    const state = store.getState().erp
    const invoice = state.invoices.find((i) => Number(i.id) === Number(id))

    store.dispatch(
      setInvoiceStatus({
        id,
        status: 'CANCELLED',
      })
    )

    // Revert Order status back to READY_TO_INVOICE if it was invoiced
    if (invoice?.order) {
      store.dispatch(
        setOrderStatus({
          id: invoice.order,
          status: 'READY_TO_INVOICE',
        })
      )
    }

    recordAudit({
      action: 'invoice/cancelled',
      entityType: 'Invoice',
      entityId: invoice?.number || id,
      payload: { reason, cancelledBy: user?.username },
    })

    return delay(null)
  },
}

// Convert amount to Indian Rupee Words matching format screenshot:
// e.g. 2205 -> "Two Thousand Two Hundred Five Only."
// 34487 -> "Thirty Four Thousand Four Hundred Eighty Seven Only."
export function amountInWordsINR(amount) {
  if (amount === null || amount === undefined || amount === '') return ''
  const rawNum = typeof amount === 'number' ? amount : parseFloat(String(amount).replace(/,/g, '').trim())
  if (isNaN(rawNum) || rawNum <= 0) return ''

  const roundedVal = Math.round((rawNum + Number.EPSILON) * 100) / 100
  let integerPart = Math.floor(roundedVal)
  let paise = Math.round((roundedVal - integerPart) * 100)
  if (paise >= 100) {
    integerPart += 1
    paise = 0
  }

  if (integerPart === 0 && paise === 0) return ''

  const ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen',
  ]
  const tens = [
    '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety',
  ]

  function convertBelowThousand(n) {
    let str = ''
    if (n >= 100) {
      str += ones[Math.floor(n / 100)] + ' Hundred '
      n %= 100
    }
    if (n >= 20) {
      str += tens[Math.floor(n / 10)] + ' '
      n %= 10
    }
    if (n > 0) {
      str += ones[n] + ' '
    }
    return str.trim()
  }

  let remaining = integerPart
  let words = ''

  const crore = Math.floor(remaining / 10000000)
  remaining %= 10000000

  const lakh = Math.floor(remaining / 100000)
  remaining %= 100000

  const thousand = Math.floor(remaining / 1000)
  remaining %= 1000

  const hundreds = remaining

  if (crore > 0) words += convertBelowThousand(crore) + ' Crore '
  if (lakh > 0) words += convertBelowThousand(lakh) + ' Lakh '
  if (thousand > 0) words += convertBelowThousand(thousand) + ' Thousand '
  if (hundreds > 0) words += convertBelowThousand(hundreds) + ' '

  words = words.trim()

  let paiseWords = ''
  if (paise > 0) {
    paiseWords = convertBelowThousand(paise)
  }

  if (words && paiseWords) {
    return `${words} and ${paiseWords} Paise Only.`
  } else if (words) {
    return `${words} Only.`
  } else if (paiseWords) {
    return `${paiseWords} Paise Only.`
  }
  return ''
}

// Generate serial in format: G/<financial year>/<3-digit serial> e.g. G/26-27/024
export function generateInvoiceNumber(existingInvoices, date = new Date()) {
  const d = new Date(date)
  const month = d.getMonth() + 1
  const fullYear = d.getFullYear()
  const y1 = month >= 4 ? fullYear : fullYear - 1
  const y2 = y1 + 1
  const s1 = String(y1).slice(-2)
  const s2 = String(y2).slice(-2)
  const fy = `${s1}-${s2}` // e.g. "26-27"

  let maxSerial = 23 // Default so first generated serial starts at 024 matching sample
  const pattern = new RegExp(`^G\\/${fy}\\/(\\d+)$`, 'i')

  const list = Array.isArray(existingInvoices)
    ? existingInvoices
    : Object.values(existingInvoices || {})

  list.forEach((inv) => {
    const num = inv?.invoice_no || inv?.number || ''
    const match = String(num).trim().match(pattern)
    if (match) {
      const serial = parseInt(match[1], 10)
      if (!isNaN(serial) && serial > maxSerial) {
        maxSerial = serial
      }
    }
  })

  const nextSerial = maxSerial + 1
  return `G/${fy}/${String(nextSerial).padStart(3, '0')}`
}
