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

function hydrateInvoice(inv, state) {
  const company = state.companies.find((c) => Number(c.id) === Number(inv.company))
  const customer = state.customers.find((c) => Number(c.id) === Number(inv.customer))
  const order = inv.order ? state.orders.find((o) => Number(o.id) === Number(inv.order)) : null
  const qc = order ? state.qcRecords.find((q) => Number(q.order_id) === Number(order.id)) : null
  const qa = order ? state.qaRecords.find((q) => Number(q.order_id) === Number(order.id)) : null

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

  // Customer details
  const customerProfile = {
    name: customer?.name || inv.customer_name || '—',
    code: customer?.code || '—',
    gstin: customer?.gstin || '—',
    state: customer?.state || 'Gujarat',
    state_code: customer?.state_code || '24',
    billing_address: customer?.address || customer?.billing_address || '—',
    shipping_address: customer?.shipping_address || customer?.address || '—',
    payment_terms: customer?.payment_terms || 'Net 30',
  }

  // Lines
  const lines = (inv.lines || []).map((line, idx) => {
    const product = state.products.find((p) => Number(p.id) === Number(line.product))
    const qty = Number(line.quantity) || 0
    const rate = Number(line.rate) || 0
    const discount = Number(line.discount) || 0
    const taxableValue = Math.max(qty * rate - discount, 0)
    const gstPercent = Number(line.gst_percent !== undefined ? line.gst_percent : (inv.tax_percent || 18))
    const gstAmount = taxableValue * (gstPercent / 100)

    return {
      sr_no: idx + 1,
      ...line,
      product_code: product?.code || line.product_code || '',
      product_name: product?.name || line.product_name || product?.code || 'Pharmaceutical Formulation',
      hsn_code: line.hsn_code || product?.hsn_code || '30049099',
      unit: line.unit || product?.unit || 'Box',
      quantity: qty,
      rate,
      discount,
      taxable_value: taxableValue,
      gst_percent: gstPercent,
      gst_amount: gstAmount,
      total_amount: taxableValue + gstAmount,
    }
  })

  // Tax breakdown
  const isIntraState = customerProfile.state_code === companyProfile.state_code
  const subtotal = lines.reduce((sum, l) => sum + l.taxable_value, 0)
  const totalTax = lines.reduce((sum, l) => sum + l.gst_amount, 0)
  const cgstAmount = isIntraState ? totalTax / 2 : 0
  const sgstAmount = isIntraState ? totalTax / 2 : 0
  const igstAmount = !isIntraState ? totalTax : 0
  const rawTotal = subtotal + totalTax
  const roundOff = Math.round(rawTotal) - rawTotal
  const finalTotal = Math.round(rawTotal)

  // Payments linked to this invoice
  const invoicePayments = (state.payments || []).filter(
    (p) => Number(p.invoice_id) === Number(inv.id) || p.invoice_number === inv.number
  )
  const totalPaid = invoicePayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
  const balanceDue = Math.max(finalTotal - totalPaid, 0)

  return {
    ...inv,
    company_name: companyProfile.name,
    company_profile: companyProfile,
    customer_name: customerProfile.name,
    customer_profile: customerProfile,
    order_number: order?.number || inv.order_number || '—',
    qc_number: qc?.number || '—',
    qa_number: qa?.number || '—',
    lines,
    subtotal,
    is_intra_state: isIntraState,
    cgst_amount: cgstAmount,
    sgst_amount: sgstAmount,
    igst_amount: igstAmount,
    tax_amount: totalTax,
    round_off: roundOff,
    total: finalTotal,
    total_in_words: numberToWordsINR(finalTotal),
    payments: invoicePayments,
    total_paid: totalPaid,
    balance_due: balanceDue,
  }
}

function assertInvoiceCompany(id) {
  const state = store.getState().erp
  const companyId = getScopedCompanyId()
  const invoice = state.invoices.find((row) => Number(row.id) === Number(id))
  if (!companyId || !invoice || Number(invoice.company) !== Number(companyId)) {
    throw new Error('This invoice does not belong to the active company.')
  }
  return invoice
}

export const invoiceService = {
  getInvoices: () => {
    const state = store.getState().erp
    const companyId = getScopedCompanyId()
    if (!companyId) return delay([])

    return delay(
      state.invoices
        .filter((inv) => Number(inv.company) === Number(companyId))
        .map((inv) => hydrateInvoice(inv, state))
    )
  },

  getInvoice: (id) => {
    const state = store.getState().erp
    const companyId = getScopedCompanyId()
    const invoice = state.invoices.find((row) => Number(row.id) === Number(id))
    if (!invoice || (companyId && Number(invoice.company) !== Number(companyId))) {
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