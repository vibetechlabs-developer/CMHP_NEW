import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import {
  saveOrderInvoice,
  resetOrderInvoice,
} from '../../store/erpSlice'
import {
  selectActiveCompanyKey,
  selectActiveCompanyId,
} from '../../utils/companySelectors'
import { resolveOrderDosageForm } from './productionService'
import './ProductionInvoice.css'

// Format YYYY-MM-DD or ISO date string to DD.MM.YYYY
function formatInvoiceDate(d) {
  if (!d) return ''
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(d)) return d
  const parsed = new Date(d)
  if (isNaN(parsed.getTime())) return String(d)
  const day = String(parsed.getDate()).padStart(2, '0')
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const year = parsed.getFullYear()
  return `${day}.${month}.${year}`
}

// Convert amount to Indian Rupee Words matching format screenshot:
// e.g. 2205 -> "Two Thousand Two Hundred Five Only."
export function amountInWordsINR(amount) {
  const num = Math.round(Number(amount) || 0)
  if (num === 0) return 'Zero Only.'
  if (num < 0) return 'Minus ' + amountInWordsINR(Math.abs(num))

  const ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen'
  ]
  const tens = [
    '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'
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

  let remaining = num
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

  return `${words.trim()} Only.`
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

export default function ProductionInvoice() {
  const { orderId } = useParams()
  const navigate = useNavigate()
  const dispatch = useDispatch()

  // Select Redux State
  const compKey = useSelector(selectActiveCompanyKey)
  const compId = useSelector(selectActiveCompanyId)
  const reduxOrders = useSelector((state) => state.erp.byCompany?.[compKey]?.orders || state.erp.orders || [])
  const customers = useSelector((state) => state.erp.customers || [])
  const products = useSelector((state) => [
    ...(state.erp.products || []),
    ...(state.erp.commonProducts || []),
    ...(state.erp.byCompany?.[compKey]?.products || []),
  ])
  const savedOrderInvoices = useSelector((state) => state.erp.orderInvoices || {})
  const allInvoices = useSelector((state) => state.erp.invoices || [])

  // Find target order
  const order = useMemo(() => {
    return (reduxOrders || []).find((o) => String(o.id) === String(orderId))
  }, [reduxOrders, orderId])

  // Find customer linked to order
  const customer = useMemo(() => {
    if (!order) return null
    return (customers || []).find(
      (c) => String(c.id) === String(order.customer) || c.name === order.customer_name
    )
  }, [order, customers])

  // Notification / message states
  const [successMsg, setSuccessMsg] = useState('')
  const [isSaved, setIsSaved] = useState(false)

  // Build default auto-filled invoice data
  const buildInitialData = () => {
    const todayFormatted = formatInvoiceDate(new Date())
    const existingNum = generateInvoiceNumber(allInvoices)

    // Customer / Consignee details
    const consigneeName = order?.customer_name || customer?.name || '—'
    let consigneeAddress1 = '—'
    let consigneeAddress2 = ''
    if (customer?.address) {
      const parts = customer.address.split('\n')
      consigneeAddress1 = parts[0] || customer.address
      consigneeAddress2 = parts[1] || `${customer.city || ''} ${customer.pincode || ''}`.trim()
    }

    const consigneeGstin = customer?.gstin || '—'
    const consigneeState = (customer?.state || 'GUJARAT').toUpperCase()
    const consigneeCode = customer?.state_code || '24'
    const placeOfSupply = customer?.city || 'Ahmedabad'

    // Order dates
    const orderDateFormatted = order?.order_date ? formatInvoiceDate(order.order_date) : todayFormatted

    // Determine line items: ONLY completed line items of the order
    let completedItems = []
    if (Array.isArray(order?.lines) && order.lines.length > 0) {
      completedItems = order.lines.filter((line) => {
        if (line.production_status) return line.production_status.toLowerCase() === 'completed'
        if (line.status) return line.status.toLowerCase() === 'completed'
        return (order.production_status || '').toLowerCase() === 'completed'
      })
    }

    if (completedItems.length === 0 && (order?.production_status || '').toLowerCase() === 'completed') {
      completedItems = [
        {
          product_name: order.product_name,
          pack_size: order.pack_size || order.packing_size,
          quantity: order.completed_qty || order.batch_size || order.quantity,
          rate: order.rate || order.unit_price || order.mrp_for_printing,
          batch_no: order.batch_no,
        },
      ]
    }

    // Default to at least 1 item matching order format if no completed lines found
    if (completedItems.length === 0) {
      completedItems = [
        {
          product_name: order?.product_name || '—',
          pack_size: order?.pack_size || '—',
          quantity: order?.quantity || 0,
          rate: order?.unit_price || 0,
          batch_no: order?.batch_no || '',
        },
      ]
    }

    const formattedLines = completedItems.map((item, idx) => {
      // Find matching product in catalog
      const prod = products.find(
        (p) =>
          String(p.id) === String(item.product_id || order?.product_id) ||
          p.name === item.product_name ||
          p.code === order?.product_code
      )

      const qty = Number(String(item.quantity || '0').replace(/[^0-9.]/g, '')) || 0
      const rate = Number(String(item.rate || item.unit_price || prod?.selling_price || '0').replace(/[^0-9.]/g, '')) || 0
      const hsn = String(prod?.hsn_code || item.hsn_code || '30049099') // ALWAYS treated as text!
      const pkg = item.pack_size || item.pkg || prod?.pack_size || '—'
      const batchNo = item.batch_no || order?.batch_no || ''
      const cgstRate = Number(item.cgst_rate || prod?.cgst_rate || 3)
      const sgstRate = Number(item.sgst_rate || prod?.sgst_rate || 3)

      return {
        id: `item-${Date.now()}-${idx}`,
        sr_no: idx + 1,
        description: item.product_name || prod?.name || order?.product_name || '—',
        pkg,
        hsn,
        batch_no: batchNo,
        qty,
        rate,
        cgst_rate: cgstRate,
        sgst_rate: sgstRate,
      }
    })

    return {
      top_title_left: 'TAX INVOICE',
      top_title_right: 'ORIGINAL FOR RECEPIENT',

      // Company Header (static text from screenshot 2, editable)
      company_name: 'CMHP PRIVATE LIMITED',
      company_factory: 'Factory : 18, Shubh Laxmi, Viramgam Road,Sanand,Ahmedabad-382110. Regd.Off.: 701, Safal Prelude, Corporate Road, Ahmedabad-380015',
      company_contacts: 'Tel: +917947977198          Mob: +919327252466',
      company_gstin: '24AAICC9380N1Z2',
      company_dl: 'GH-7',
      company_pan: 'AAICC9380N',

      // Invoice info block (Rows 6-10)
      invoice_no: existingNum,
      purchase_no: order?.po_number || order?.purchase_no || '',
      invoice_date: todayFormatted,
      order_date: orderDateFormatted,
      no_of_cartons: '01',
      reverse_charge: 'N',
      date_of_supply: todayFormatted,
      state: consigneeState,
      state_code: consigneeCode,
      place_of_supply: placeOfSupply,
      freight_type: 'To Pay',
      freight_amount: '',

      // Consignee Block
      consignee_name: consigneeName,
      consignee_address_1: consigneeAddress1,
      consignee_address_2: consigneeAddress2,
      consignee_gstin: consigneeGstin,
      consignee_state: consigneeState,
      consignee_code: consigneeCode,

      // Buyer Block (defaults to Consignee)
      buyer_name: consigneeName,
      buyer_address_1: 'Same as Billed Address',
      buyer_address_2: '',
      buyer_gstin: consigneeGstin,
      buyer_state: consigneeState,
      buyer_code: consigneeCode,

      // Items
      lines: formattedLines,

      // Extra charges
      postage_packing: '',
      rounding_off_override: null, // null means auto-calculate

      // Bank Details (Rows 37-39)
      bank_name: 'HDFC BANK LTD.',
      bank_ac: '50200052209722',
      bank_ifsc: 'HDFC0000048',

      // Terms & Conditions
      term_1: 'No Claim is entertained in transit',
      term_2: 'Interest @ 24% p.a. will be charged,',
      term_3: 'If this invoice not paid by due date.',
      term_4: 'Subject to Ahmedabad Jurisdiction only.',
      jurisdiction: 'Ahmedabad',
    }
  }

  // Invoice state initialized from saved Redux invoice or initial auto-fill
  const [invoice, setInvoice] = useState(() => {
    if (orderId && savedOrderInvoices[String(orderId)]) {
      return savedOrderInvoices[String(orderId)]
    }
    return buildInitialData()
  })

  // Synchronize if saved invoice loads after mount
  useEffect(() => {
    if (orderId && savedOrderInvoices[String(orderId)]) {
      setInvoice(savedOrderInvoices[String(orderId)])
    }
  }, [orderId, savedOrderInvoices])

  // Handle scalar field changes
  const handleFieldChange = (field, value) => {
    setInvoice((prev) => {
      const updated = { ...prev, [field]: value }
      return updated
    })
  }

  // Handle line item changes
  const handleLineChange = (id, field, value) => {
    setInvoice((prev) => {
      const updatedLines = prev.lines.map((l) => {
        if (l.id !== id) return l
        return { ...l, [field]: value }
      })
      return { ...prev, lines: updatedLines }
    })
  }

  // Add line item
  const handleAddLine = () => {
    setInvoice((prev) => {
      const nextSr = prev.lines.length + 1
      const newLine = {
        id: `item-${Date.now()}-${nextSr}`,
        sr_no: nextSr,
        description: 'Pharmaceutical Formulation',
        pkg: '30 ml.',
        hsn: '30049099',
        batch_no: order?.batch_no || '',
        qty: 1,
        rate: 35,
        cgst_rate: 3,
        sgst_rate: 3,
      }
      return { ...prev, lines: [...prev.lines, newLine] }
    })
  }

  // Remove line item
  const handleRemoveLine = (id) => {
    setInvoice((prev) => {
      if (prev.lines.length <= 1) return prev
      const updatedLines = prev.lines
        .filter((l) => l.id !== id)
        .map((l, idx) => ({ ...l, sr_no: idx + 1 }))
      return { ...prev, lines: updatedLines }
    })
  }

  // Debounced / blur sync to Redux whenever invoice changes
  useEffect(() => {
    if (orderId && invoice) {
      saveToRedux(invoice)
    }
  }, [invoice, orderId])

  // Save to Redux helper
  const saveToRedux = (data) => {
    if (!orderId) return
    dispatch(saveOrderInvoice({ orderId, invoiceData: data }))
    setIsSaved(true)
  }

  // Explicit Save button
  const handleExplicitSave = () => {
    saveToRedux(invoice)
    setSuccessMsg('Invoice saved to Redux successfully!')
    setTimeout(() => setSuccessMsg(''), 2500)
  }

  // Reset to original order data
  const handleReset = () => {
    if (window.confirm('Reset this invoice to original order data? Any custom edits will be reverted.')) {
      dispatch(resetOrderInvoice({ orderId }))
      const fresh = buildInitialData()
      setInvoice(fresh)
      setSuccessMsg('Invoice reset to original order data.')
      setTimeout(() => setSuccessMsg(''), 2500)
    }
  }

  // Print Invoice
  const handlePrint = () => {
    window.print()
  }

  // ==========================================================================
  // LIVE CALCULATIONS
  // ==========================================================================
  const computed = useMemo(() => {
    let totalQty = 0
    let totalTaxable = 0
    let totalCgst = 0
    let totalSgst = 0
    let totalRowSums = 0

    const processedLines = invoice.lines.map((l) => {
      const qty = Number(l.qty) || 0
      const rate = Number(l.rate) || 0
      const amount = qty * rate
      const taxable = amount

      const cgstRate = Number(l.cgst_rate) || 0
      const cgstAmount = (taxable * cgstRate) / 100

      const sgstRate = Number(l.sgst_rate) || 0
      const sgstAmount = (taxable * sgstRate) / 100

      const lineTotal = taxable + cgstAmount + sgstAmount

      totalQty += qty
      totalTaxable += taxable
      totalCgst += cgstAmount
      totalSgst += sgstAmount
      totalRowSums += lineTotal

      return {
        ...l,
        amount,
        taxable,
        cgstAmount,
        sgstAmount,
        lineTotal,
      }
    })

    const postagePacking = Number(invoice.postage_packing) || 0
    const totalTax = totalCgst + totalSgst
    const rawTotalAfterTax = totalTaxable + postagePacking + totalTax

    let roundOff = 0
    if (invoice.rounding_off_override !== null && invoice.rounding_off_override !== undefined && invoice.rounding_off_override !== '') {
      roundOff = Number(invoice.rounding_off_override) || 0
    } else {
      // Auto nearest rupee:
      const rounded = Math.round(rawTotalAfterTax)
      roundOff = rounded - rawTotalAfterTax
    }

    const finalTotalAfterTax = rawTotalAfterTax + roundOff
    const words = amountInWordsINR(finalTotalAfterTax)

    // Calculate fixed empty rows to maintain exactly 15 rows in the items table
    const emptyRowCount = Math.max(0, 15 - processedLines.length)
    const emptyRows = Array.from({ length: emptyRowCount }, (_, idx) => idx)

    return {
      processedLines,
      emptyRows,
      totalQty,
      totalTaxable,
      totalCgst,
      totalSgst,
      totalTax,
      totalRowSums,
      postagePacking,
      roundOff,
      finalTotalAfterTax,
      words,
    }
  }, [invoice])

  // Check if order meets invoice criteria
  const isProdCompleted = (order?.production_status || '').toLowerCase() === 'completed'
  const isPkgCompleted = (order?.packaging_status || '').toLowerCase() === 'completed'
  const isBmrCompleted = (order?.bmr_status || '').toUpperCase() === 'YES'
  const isFullyEligible = isProdCompleted && isPkgCompleted && isBmrCompleted

  return (
    <div className="prod-inv-container">
      {/* SCREEN TOOLBAR */}
      <div className="prod-inv-toolbar no-print">
        <div className="prod-inv-toolbar-left">
          <button
            type="button"
            className="prod-inv-btn-back"
            onClick={() => navigate('/production')}
          >
            ← Back to Production
          </button>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, color: '#0f172a' }}>
              Tax Invoice — Order #{order?.number || orderId}
            </h2>
            <span style={{ fontSize: 12, color: '#64748b' }}>
              Batch: <strong>{order?.batch_no || invoice.lines[0]?.batch_no || 'N/A'}</strong> | All fields directly editable on the sheet below
            </span>
          </div>
        </div>

        <div className="prod-inv-toolbar-right">
          <button
            type="button"
            className="prod-inv-btn-secondary"
            onClick={handleAddLine}
            title="Add a new line item to the invoice table"
          >
            + Add Line Item
          </button>
          <button
            type="button"
            className="prod-inv-btn-reset"
            onClick={handleReset}
            title="Re-fetch original order and customer values"
          >
            🔄 Reset to order data
          </button>
          <button
            type="button"
            className="prod-inv-btn-primary"
            onClick={handleExplicitSave}
          >
            💾 Save Invoice
          </button>
          <button
            type="button"
            className="prod-inv-btn-primary"
            onClick={handlePrint}
            style={{ background: '#059669' }}
          >
            🖨️ Print
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="prod-inv-alert-banner prod-inv-alert-success no-print">
          <span>✓ {successMsg}</span>
        </div>
      )}

      {!isFullyEligible && (
        <div className="prod-inv-alert-banner prod-inv-alert-warning no-print">
          <span>
            ⚠️ <strong>Notice:</strong> This order has pending production items (Production: {order?.production_status || 'In Planning'}, Packaging: {order?.packaging_status || 'Pending'}, BMR: {order?.bmr_status || 'No'}).
          </span>
        </div>
      )}

      {/* PRINTABLE A4 INVOICE SHEET (EXACT REPLICA OF USER FORMAT) */}
      <div className="invoice-sheet-wrapper">
        <div className="invoice-printable-sheet" id="invoice-sheet">
          {/* TOP STRIP (Row 1) */}
          <div className="inv-top-strip">
            <span className="inv-top-strip-left">{invoice.top_title_left}</span>
            <span className="inv-top-strip-right">{invoice.top_title_right}</span>
          </div>

          {/* COMPANY HEADER BLOCK (Rows 2-4) */}
          <div className="inv-company-header-block">
            <div className="inv-company-logo-area">
              <img
                src="/logo.jpg"
                alt="CMHP Logo"
                className="inv-company-logo-img"
                onError={(e) => {
                  e.target.style.display = 'none'
                }}
              />
            </div>
            <div className="inv-company-details">
              <div className="inv-company-name-title">
                {invoice.company_name}
              </div>
              <div className="inv-company-address">
                {invoice.company_factory}
              </div>
              <div className="inv-company-contacts">
                {invoice.company_contacts}
              </div>
            </div>
          </div>

          {/* STATUTORY ROW (Row 5) */}
          <div className="inv-statutory-row">
            <div className="inv-statutory-cell">
              <span>GSTIN:</span>
              <input
                className="inv-edit-field"
                value={invoice.company_gstin}
                onChange={(e) => handleFieldChange('company_gstin', e.target.value)}
              />
            </div>
            <div className="inv-statutory-cell">
              <span>D.L.</span>
              <input
                className="inv-edit-field"
                value={invoice.company_dl}
                onChange={(e) => handleFieldChange('company_dl', e.target.value)}
              />
            </div>
            <div className="inv-statutory-cell">
              <span>Company Pan No:</span>
              <input
                className="inv-edit-field"
                value={invoice.company_pan}
                onChange={(e) => handleFieldChange('company_pan', e.target.value)}
              />
            </div>
          </div>

          {/* INVOICE META GRID (Rows 6-10) */}
          <div className="inv-meta-grid">
            {/* Left Side */}
            <div className="inv-meta-grid-left">
              {/* Row 6: Invoice No */}
              <div className="inv-meta-row">
                <div className="inv-meta-col">
                  <span className="inv-meta-label">Invoice No:</span>
                  <input
                    className="inv-edit-field"
                    value={invoice.invoice_no}
                    onChange={(e) => handleFieldChange('invoice_no', e.target.value)}
                  />
                </div>
              </div>

              {/* Row 7: Invoice Date */}
              <div className="inv-meta-row">
                <div className="inv-meta-col">
                  <span className="inv-meta-label">Invoice Date:</span>
                  <input
                    className="inv-edit-field"
                    value={invoice.invoice_date}
                    onChange={(e) => handleFieldChange('invoice_date', e.target.value)}
                  />
                </div>
              </div>

              {/* Row 8: Reverse Charge */}
              <div className="inv-meta-row">
                <div className="inv-meta-col" style={{ flex: 3 }}>
                  <span className="inv-meta-label">Reverse Charge (Y/N):</span>
                </div>
                <div className="inv-meta-col" style={{ flex: 1, justifyContent: 'center' }}>
                  <input
                    className="inv-edit-field text-center"
                    value={invoice.reverse_charge}
                    onChange={(e) => handleFieldChange('reverse_charge', e.target.value.toUpperCase())}
                  />
                </div>
              </div>

              {/* Row 9: State & Code */}
              <div className="inv-meta-row">
                <div className="inv-meta-col" style={{ flex: 3 }}>
                  <span className="inv-meta-label">State:</span>
                  <input
                    className="inv-edit-field"
                    value={invoice.state}
                    onChange={(e) => handleFieldChange('state', e.target.value)}
                  />
                </div>
                <div className="inv-meta-col" style={{ flex: 1.5 }}>
                  <span className="inv-meta-label">Cod</span>
                  <input
                    className="inv-edit-field text-center"
                    value={invoice.state_code}
                    onChange={(e) => handleFieldChange('state_code', e.target.value)}
                  />
                </div>
              </div>

              {/* Row 10: Freight */}
              <div className="inv-meta-row">
                <div className="inv-meta-col">
                  <span className="inv-meta-label">Freight :</span>
                  <input
                    className="inv-edit-field"
                    style={{ width: 80 }}
                    value={invoice.freight_type}
                    onChange={(e) => handleFieldChange('freight_type', e.target.value)}
                  />
                  <span className="inv-meta-label" style={{ marginLeft: 6 }}>Amount :</span>
                  <input
                    className="inv-edit-field text-right"
                    value={invoice.freight_amount}
                    placeholder=""
                    onChange={(e) => handleFieldChange('freight_amount', e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Right Side */}
            <div className="inv-meta-grid-right">
              {/* Row 6: Purchase No */}
              <div className="inv-meta-row">
                <div className="inv-meta-col">
                  <span className="inv-meta-label">Purchase No :</span>
                  <input
                    className="inv-edit-field"
                    value={invoice.purchase_no}
                    placeholder=""
                    onChange={(e) => handleFieldChange('purchase_no', e.target.value)}
                  />
                </div>
              </div>

              {/* Row 7: Order Date & No Of Cartons */}
              <div className="inv-meta-row">
                <div className="inv-meta-col" style={{ flex: 2 }}>
                  <span className="inv-meta-label">Order Date :</span>
                  <input
                    className="inv-edit-field"
                    value={invoice.order_date}
                    onChange={(e) => handleFieldChange('order_date', e.target.value)}
                  />
                </div>
                <div className="inv-meta-col" style={{ flex: 2 }}>
                  <span className="inv-meta-label">No Of Cartons:</span>
                  <input
                    className="inv-edit-field text-center"
                    value={invoice.no_of_cartons}
                    onChange={(e) => handleFieldChange('no_of_cartons', e.target.value)}
                  />
                </div>
              </div>

              {/* Row 8: Date of Supply */}
              <div className="inv-meta-row">
                <div className="inv-meta-col">
                  <span className="inv-meta-label">Date of Supply:</span>
                  <input
                    className="inv-edit-field"
                    value={invoice.date_of_supply}
                    onChange={(e) => handleFieldChange('date_of_supply', e.target.value)}
                  />
                </div>
              </div>

              {/* Row 9: Place of Supply */}
              <div className="inv-meta-row">
                <div className="inv-meta-col">
                  <span className="inv-meta-label">Place of Supply:</span>
                  <input
                    className="inv-edit-field"
                    value={invoice.place_of_supply}
                    onChange={(e) => handleFieldChange('place_of_supply', e.target.value)}
                  />
                </div>
              </div>

              {/* Row 10: Empty spacer cell to balance Left */}
              <div className="inv-meta-row">
                <div className="inv-meta-col">&nbsp;</div>
              </div>
            </div>
          </div>

          {/* CONSIGNEE & BUYER SECTION (Rows 11-16) */}
          <div className="inv-party-grid">
            {/* Consignee */}
            <div className="inv-party-col">
              <div className="inv-party-header">Consignee</div>
              <div className="inv-party-body">
                <div className="inv-party-row">
                  <span className="inv-meta-label">Name:</span>
                  <input
                    className="inv-edit-field"
                    value={invoice.consignee_name}
                    onChange={(e) => handleFieldChange('consignee_name', e.target.value)}
                  />
                </div>
                <div className="inv-party-row">
                  <span className="inv-meta-label">Address:</span>
                  <input
                    className="inv-edit-field"
                    value={invoice.consignee_address_1}
                    onChange={(e) => handleFieldChange('consignee_address_1', e.target.value)}
                  />
                </div>
                <div className="inv-party-row">
                  <input
                    className="inv-edit-field"
                    style={{ paddingLeft: 60 }}
                    value={invoice.consignee_address_2}
                    onChange={(e) => handleFieldChange('consignee_address_2', e.target.value)}
                  />
                </div>
                <div className="inv-party-row">
                  <span className="inv-meta-label">GSTIN:</span>
                  <input
                    className="inv-edit-field"
                    value={invoice.consignee_gstin}
                    onChange={(e) => handleFieldChange('consignee_gstin', e.target.value)}
                  />
                </div>
                <div className="inv-party-row">
                  <div style={{ display: 'flex', flex: 3, alignItems: 'center', gap: 4 }}>
                    <span className="inv-meta-label">State:</span>
                    <input
                      className="inv-edit-field"
                      value={invoice.consignee_state}
                      onChange={(e) => handleFieldChange('consignee_state', e.target.value)}
                    />
                  </div>
                  <div style={{ display: 'flex', flex: 1.5, alignItems: 'center', gap: 4, borderLeft: '1px solid #000', paddingLeft: 4 }}>
                    <span className="inv-meta-label">Cod</span>
                    <input
                      className="inv-edit-field text-center"
                      value={invoice.consignee_code}
                      onChange={(e) => handleFieldChange('consignee_code', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Buyer (if other than consignee) */}
            <div className="inv-party-col">
              <div className="inv-party-header">Buyer ( if other than consignee)</div>
              <div className="inv-party-body">
                <div className="inv-party-row">
                  <span className="inv-meta-label">Name:</span>
                  <input
                    className="inv-edit-field"
                    value={invoice.buyer_name}
                    onChange={(e) => handleFieldChange('buyer_name', e.target.value)}
                  />
                </div>
                <div className="inv-party-row">
                  <span className="inv-meta-label">Address:</span>
                  <input
                    className="inv-edit-field"
                    value={invoice.buyer_address_1}
                    onChange={(e) => handleFieldChange('buyer_address_1', e.target.value)}
                  />
                </div>
                <div className="inv-party-row">
                  <input
                    className="inv-edit-field"
                    style={{ paddingLeft: 60 }}
                    value={invoice.buyer_address_2}
                    onChange={(e) => handleFieldChange('buyer_address_2', e.target.value)}
                  />
                </div>
                <div className="inv-party-row">
                  <span className="inv-meta-label">GSTIN:</span>
                  <input
                    className="inv-edit-field"
                    value={invoice.buyer_gstin}
                    onChange={(e) => handleFieldChange('buyer_gstin', e.target.value)}
                  />
                </div>
                <div className="inv-party-row">
                  <div style={{ display: 'flex', flex: 3, alignItems: 'center', gap: 4 }}>
                    <span className="inv-meta-label">State:</span>
                    <input
                      className="inv-edit-field"
                      value={invoice.buyer_state}
                      onChange={(e) => handleFieldChange('buyer_state', e.target.value)}
                    />
                  </div>
                  <div style={{ display: 'flex', flex: 1.5, alignItems: 'center', gap: 4, borderLeft: '1px solid #000', paddingLeft: 4 }}>
                    <span className="inv-meta-label">Code</span>
                    <input
                      className="inv-edit-field text-center"
                      value={invoice.buyer_code}
                      onChange={(e) => handleFieldChange('buyer_code', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ITEMS TABLE (Rows 17-34) */}
          <div className="inv-items-table-container">
            <table className="inv-table-custom">
              <thead>
                <tr>
                  <th rowSpan={2} className="col-sr">
                    Sr<br />.<br />N
                  </th>
                  <th rowSpan={2} className="col-desc">Product Description</th>
                  <th rowSpan={2} className="col-pkg">Pkg.</th>
                  <th rowSpan={2} className="col-hsn">HSN<br />code</th>
                  <th rowSpan={2} className="col-batch">Batch<br />No.</th>
                  <th rowSpan={2} className="col-qty">Qty</th>
                  <th rowSpan={2} className="col-rate">Rat<br />e</th>
                  <th rowSpan={2} className="col-amt">Amou<br />nt</th>
                  <th rowSpan={2} className="col-taxable">Taxabl<br />e Value</th>
                  <th colSpan={2}>CGST</th>
                  <th colSpan={2}>SGST</th>
                  <th rowSpan={2} className="col-total">Total</th>
                </tr>
                <tr>
                  <th className="col-cgst-r">Rat</th>
                  <th className="col-cgst-a">Amount</th>
                  <th className="col-sgst-r">Rat</th>
                  <th className="col-sgst-a">Amoun</th>
                </tr>
              </thead>
              <tbody>
                {computed.processedLines.map((line) => (
                  <tr key={line.id}>
                    {/* Sr. No */}
                    <td className="col-sr">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span>{line.sr_no}</span>
                        {computed.processedLines.length > 1 && (
                          <button
                            type="button"
                            className="inv-row-del-btn no-print"
                            title="Remove row"
                            onClick={() => handleRemoveLine(line.id)}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Product Description */}
                    <td className="col-desc">
                      <input
                        className="inv-edit-field"
                        value={line.description}
                        onChange={(e) => handleLineChange(line.id, 'description', e.target.value)}
                      />
                    </td>

                    {/* Pkg */}
                    <td className="col-pkg">
                      <input
                        className="inv-edit-field text-center"
                        value={line.pkg}
                        onChange={(e) => handleLineChange(line.id, 'pkg', e.target.value)}
                      />
                    </td>

                    {/* HSN code (text) */}
                    <td className="col-hsn">
                      <input
                        className="inv-edit-field text-center"
                        value={line.hsn}
                        onChange={(e) => handleLineChange(line.id, 'hsn', e.target.value)}
                      />
                    </td>

                    {/* Batch No */}
                    <td className="col-batch">
                      <input
                        className="inv-edit-field text-center"
                        value={line.batch_no}
                        onChange={(e) => handleLineChange(line.id, 'batch_no', e.target.value)}
                      />
                    </td>

                    {/* Qty */}
                    <td className="col-qty">
                      <input
                        type="number"
                        className="inv-edit-field text-right"
                        value={line.qty}
                        onChange={(e) => handleLineChange(line.id, 'qty', e.target.value)}
                      />
                    </td>

                    {/* Rate */}
                    <td className="col-rate">
                      <input
                        type="number"
                        step="any"
                        className="inv-edit-field text-right"
                        value={line.rate}
                        onChange={(e) => handleLineChange(line.id, 'rate', e.target.value)}
                      />
                    </td>

                    {/* Amount */}
                    <td className="col-amt" style={{ textAlign: 'right' }}>
                      {line.amount}
                    </td>

                    {/* Taxable Value */}
                    <td className="col-taxable" style={{ textAlign: 'right' }}>
                      {line.taxable}
                    </td>

                    {/* CGST Rate */}
                    <td className="col-cgst-r">
                      <input
                        type="number"
                        step="any"
                        className="inv-edit-field text-center"
                        value={line.cgst_rate}
                        onChange={(e) => handleLineChange(line.id, 'cgst_rate', e.target.value)}
                      />
                    </td>

                    {/* CGST Amount */}
                    <td className="col-cgst-a" style={{ textAlign: 'right' }}>
                      {line.cgstAmount.toFixed(1)}
                    </td>

                    {/* SGST Rate */}
                    <td className="col-sgst-r">
                      <input
                        type="number"
                        step="any"
                        className="inv-edit-field text-center"
                        value={line.sgst_rate}
                        onChange={(e) => handleLineChange(line.id, 'sgst_rate', e.target.value)}
                      />
                    </td>

                    {/* SGST Amount */}
                    <td className="col-sgst-a" style={{ textAlign: 'right' }}>
                      {line.sgstAmount.toFixed(1)}
                    </td>

                    {/* Total */}
                    <td className="col-total" style={{ textAlign: 'right' }}>
                      {line.lineTotal}
                    </td>
                  </tr>
                ))}

                {/* Fixed Empty Rows (Rows 20 to 33 in format screenshot) */}
                {computed.emptyRows.map((idx) => (
                  <tr key={`empty-${idx}`}>
                    <td className="col-sr">&nbsp;</td>
                    <td className="col-desc">&nbsp;</td>
                    <td className="col-pkg">&nbsp;</td>
                    <td className="col-hsn">&nbsp;</td>
                    <td className="col-batch">&nbsp;</td>
                    <td className="col-qty">&nbsp;</td>
                    <td className="col-rate">&nbsp;</td>
                    <td className="col-amt">&nbsp;</td>
                    <td className="col-taxable">&nbsp;</td>
                    <td className="col-cgst-r">&nbsp;</td>
                    <td className="col-cgst-a">&nbsp;</td>
                    <td className="col-sgst-r">&nbsp;</td>
                    <td className="col-sgst-a">&nbsp;</td>
                    <td className="col-total">&nbsp;</td>
                  </tr>
                ))}

                {/* Total Row (Row 34 in format screenshot) */}
                <tr className="inv-total-row">
                  <td colSpan={5} className="inv-total-title">
                    Total
                  </td>
                  <td className="col-qty" style={{ textAlign: 'right', fontWeight: 'bold' }}>
                    {computed.totalQty}
                  </td>
                  <td className="col-rate">&nbsp;</td>
                  <td className="col-amt" style={{ textAlign: 'right', fontWeight: 'bold' }}>
                    {computed.totalTaxable}
                  </td>
                  <td className="col-taxable" style={{ textAlign: 'right', fontWeight: 'bold' }}>
                    {computed.totalTaxable}
                  </td>
                  <td className="col-cgst-r">&nbsp;</td>
                  <td className="col-cgst-a" style={{ textAlign: 'right', fontWeight: 'bold' }}>
                    {computed.totalCgst > 0 ? computed.totalCgst.toFixed(1) : ''}
                  </td>
                  <td className="col-sgst-r">&nbsp;</td>
                  <td className="col-sgst-a" style={{ textAlign: 'right', fontWeight: 'bold' }}>
                    {computed.totalSgst > 0 ? computed.totalSgst.toFixed(1) : ''}
                  </td>
                  <td className="col-total" style={{ textAlign: 'right', fontWeight: 'bold' }}>
                    {computed.totalRowSums > 0 ? computed.totalRowSums.toFixed(1) : ''}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* BOTTOM SECTION (Rows 35-47) */}
          <div className="inv-bottom-section">
            {/* Left Column: Words, Bank Details, Terms & Conditions */}
            <div className="inv-bottom-left">
              {/* Row 35: Total Invoice Amount in words header */}
              <div className="inv-words-block">
                <div className="inv-words-label">Total Invoice Amount in words</div>
              </div>

              {/* Row 36: Amount in words */}
              <div className="inv-words-block" style={{ minHeight: 22 }}>
                <div className="inv-words-value">{computed.words}</div>
              </div>

              {/* Rows 37-39: Bank Details */}
              <div className="inv-bank-block">
                <div className="inv-bank-row">
                  <span>Bank Details:</span>
                  <input
                    className="inv-edit-field"
                    value={invoice.bank_name}
                    onChange={(e) => handleFieldChange('bank_name', e.target.value)}
                  />
                </div>
                <div className="inv-bank-row">
                  <span>Bank A/C:</span>
                  <input
                    className="inv-edit-field"
                    value={invoice.bank_ac}
                    onChange={(e) => handleFieldChange('bank_ac', e.target.value)}
                  />
                </div>
                <div className="inv-bank-row">
                  <span>Bank IFSC:</span>
                  <input
                    className="inv-edit-field"
                    value={invoice.bank_ifsc}
                    onChange={(e) => handleFieldChange('bank_ifsc', e.target.value)}
                  />
                </div>
              </div>

              {/* Spacers to align rows with right-side */}
              <div style={{ height: 26, borderBottom: '1px solid #000' }}>&nbsp;</div>

              {/* Terms & Conditions & Company Seal (Rows 43-47) */}
              <div className="inv-terms-and-seal">
                <div className="inv-terms-block">
                  <div className="inv-terms-title">Terms &amp; Conditions :</div>
                  <div>
                    <input
                      className="inv-edit-field"
                      value={invoice.term_1}
                      onChange={(e) => handleFieldChange('term_1', e.target.value)}
                    />
                  </div>
                  <div>
                    <input
                      className="inv-edit-field"
                      value={invoice.term_2}
                      onChange={(e) => handleFieldChange('term_2', e.target.value)}
                    />
                  </div>
                  <div>
                    <input
                      className="inv-edit-field"
                      value={invoice.term_3}
                      onChange={(e) => handleFieldChange('term_3', e.target.value)}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span>Subject to&nbsp;</span>
                    <input
                      className="inv-edit-field"
                      style={{ width: 90 }}
                      value={invoice.jurisdiction}
                      onChange={(e) => handleFieldChange('jurisdiction', e.target.value)}
                    />
                    <span>&nbsp;Jurisdiction only.</span>
                  </div>
                </div>

                <div className="inv-seal-box">
                  Company Seal
                </div>
              </div>
            </div>

            {/* Right Column: Tax Breakdown, Rounding, Certified, Signatory */}
            <div className="inv-bottom-right">
              {/* Row 35: Total Amount before Tax */}
              <div className="inv-summary-row">
                <span className="inv-summary-label">Total Amount before Tax</span>
                <span className="inv-summary-val">{computed.totalTaxable}</span>
              </div>

              {/* Row 36: Postage & Packing */}
              <div className="inv-summary-row">
                <span className="inv-summary-label">Postage &amp; Packing</span>
                <input
                  type="number"
                  step="any"
                  className="inv-edit-field text-right"
                  style={{ width: 90 }}
                  value={invoice.postage_packing}
                  placeholder=""
                  onChange={(e) => handleFieldChange('postage_packing', e.target.value)}
                />
              </div>

              {/* Row 37: Add: CGST */}
              <div className="inv-summary-row">
                <span className="inv-summary-label">Add: CGST</span>
                <span className="inv-summary-val">{computed.totalCgst > 0 ? computed.totalCgst.toFixed(1) : '0'}</span>
              </div>

              {/* Row 38: Add: SGST */}
              <div className="inv-summary-row">
                <span className="inv-summary-label">Add: SGST</span>
                <span className="inv-summary-val">{computed.totalSgst > 0 ? computed.totalSgst.toFixed(1) : '0'}</span>
              </div>

              {/* Row 39: Total Tax Amount */}
              <div className="inv-summary-row">
                <span className="inv-summary-label">Total Tax Amount</span>
                <span className="inv-summary-val">{computed.totalTax > 0 ? computed.totalTax.toFixed(0) : '0'}</span>
              </div>

              {/* Row 40: Rounding Off */}
              <div className="inv-summary-row">
                <span className="inv-summary-label">Rounding Off</span>
                <input
                  type="number"
                  step="any"
                  className="inv-edit-field text-right"
                  style={{ width: 90 }}
                  value={invoice.rounding_off_override !== null ? invoice.rounding_off_override : (computed.roundOff !== 0 ? computed.roundOff.toFixed(2) : '')}
                  placeholder={computed.roundOff !== 0 ? computed.roundOff.toFixed(2) : ''}
                  onChange={(e) => handleFieldChange('rounding_off_override', e.target.value)}
                />
              </div>

              {/* Row 41: Total Amount after Tax */}
              <div className="inv-summary-row" style={{ background: '#f8fafc' }}>
                <span className="inv-summary-label">Total Amount after Tax</span>
                <span className="inv-summary-val" style={{ fontSize: '9.5pt' }}>
                  {computed.finalTotalAfterTax.toFixed(2)}
                </span>
              </div>

              {/* Row 42: Certified that particulars... */}
              <div className="inv-certified-row">
                Certified that the particulars given above are true and correct
              </div>

              {/* Rows 43-47: Authorised Signatory */}
              <div className="inv-signatory-block">
                <div className="inv-signatory-header">
                  For CMHP Private Limited
                </div>
                <div className="inv-signature-area">
                  <img
                    src="/signature.png"
                    alt="Authorised Signatory"
                    className="inv-signature-img"
                    onError={(e) => {
                      e.target.style.display = 'none'
                    }}
                  />
                </div>
                <div className="inv-signatory-footer">
                  Authorised signatory
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
