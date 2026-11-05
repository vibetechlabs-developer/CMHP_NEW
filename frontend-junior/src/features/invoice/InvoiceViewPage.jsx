import { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import {
  addInvoice,
  saveOrderInvoice,
  resetOrderInvoice,
  editInvoice,
  setInvoiceStatus,
  addPaymentRecord,
} from '../../store/erpSlice'
import {
  selectActiveCompanyKey,
  selectActiveCompanyId,
} from '../../utils/companySelectors'
import {
  generateInvoiceNumber,
  amountInWordsINR,
} from './invoiceService'
import './InvoiceViewPage.css'


export function convertToIsoDate(d) {
  if (!d) return new Date().toISOString().slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(d))) return String(d)
  const parts = String(d).split('.')
  if (parts.length === 3) {
    const [day, month, year] = parts
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }
  const parsed = new Date(d)
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10)
  return new Date().toISOString().slice(0, 10)
}

// Format date to DD.MM.YYYY
export function formatInvoiceDate(d) {
  if (!d) return ''
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(String(d))) return String(d)
  const parsed = new Date(d)
  if (isNaN(parsed.getTime())) return String(d)
  const day = String(parsed.getDate()).padStart(2, '0')
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const year = parsed.getFullYear()
  return `${day}.${month}.${year}`
}

// Decimal formatting: safe float rounding to 2 decimal places
export function round2(num) {
  const n = Number(num)
  if (isNaN(n)) return 0
  return Math.round((n + Number.EPSILON) * 100) / 100
}

// Format number to 2 decimal places string
export function formatCurrency2(num, blankIfZero = false) {
  if (num === null || num === undefined || num === '') return ''
  const n = Number(num)
  if (isNaN(n)) return ''
  if (blankIfZero && n === 0) return ''
  return n.toFixed(2)
}

// Format quantity (integers without decimal, decimals with up to 2 decimal places)
export function formatQty(num) {
  if (num === null || num === undefined || num === '') return ''
  const n = Number(num)
  if (isNaN(n)) return ''
  if (Number.isInteger(n)) return String(n)
  return String(Math.round((n + Number.EPSILON) * 100) / 100)
}

// Filter numeric input while typing
export function filterNumericInput(val, allowNegative = false) {
  if (val === '') return ''
  if (allowNegative && val === '-') return '-'
  const regex = allowNegative ? /^-?\d*\.?\d{0,4}$/ : /^\d*\.?\d{0,4}$/
  return regex.test(val) ? val : null
}

// Official GST state mapping: Telangana is 36, Gujarat is 24, Maharashtra is 27, etc.
export const GST_STATE_MAP = {
  'JAMMU AND KASHMIR': '01',
  'HIMACHAL PRADESH': '02',
  'PUNJAB': '03',
  'CHANDIGARH': '04',
  'UTTARAKHAND': '05',
  'HARYANA': '06',
  'DELHI': '07',
  'RAJASTHAN': '08',
  'UTTAR PRADESH': '09',
  'BIHAR': '10',
  'SIKKIM': '11',
  'ARUNACHAL PRADESH': '12',
  'NAGALAND': '13',
  'MANIPUR': '14',
  'MIZORAM': '15',
  'TRIPURA': '16',
  'MEGHALAYA': '17',
  'ASSAM': '18',
  'WEST BENGAL': '19',
  'JHARKHAND': '20',
  'ODISHA': '21',
  'CHHATTISGARH': '22',
  'MADHYA PRADESH': '23',
  'GUJARAT': '24',
  'DAMAN AND DIU': '25',
  'DADRA AND NAGAR HAVELI': '26',
  'MAHARASHTRA': '27',
  'ANDHRA PRADESH': '37',
  'KARNATAKA': '29',
  'GOA': '30',
  'LAKSHADWEEP': '31',
  'KERALA': '32',
  'TAMIL NADU': '33',
  'PUDUCHERRY': '34',
  'ANDAMAN AND NICOBAR ISLANDS': '35',
  'TELANGANA': '36',
  'LADAKH': '38',
}

export function deriveStateCode(gstin, state) {
  if (gstin && typeof gstin === 'string') {
    const cleaned = gstin.trim()
    const prefix = cleaned.substring(0, 2)
    if (/^\d{2}$/.test(prefix)) {
      return prefix
    }
  }
  if (state && typeof state === 'string') {
    const cleaned = state.trim().toUpperCase()
    if (GST_STATE_MAP[cleaned]) {
      return GST_STATE_MAP[cleaned]
    }
    for (const [name, code] of Object.entries(GST_STATE_MAP)) {
      if (cleaned.includes(name) || name.includes(cleaned)) {
        return code
      }
    }
  }
  return ''
}

/* ==========================================================================
   EDITABLE FIELD COMPONENT
   Single source of truth:
   - On screen: subtle interactive input with focus highlight
   - In print: pure static text span (no input borders/artifacts/spinners)
   ========================================================================== */
function EditableField({
  label = '',
  value = '',
  onChange,
  bold = false,
  align = 'left',
  placeholder = '',
  className = '',
  style = {},
  inputStyle = {},
  readOnly = false,
  tabIndex,
}) {
  const displayVal = value !== '' && value !== undefined && value !== null ? String(value) : ''

  return (
    <span
      className={`inv-field-wrap text-${align} ${bold ? 'font-bold' : ''} ${className}`}
      style={style}
    >
      {label && <strong className="inv-field-label">{label}</strong>}
      {/* Print representation: pure text */}
      <span className="inv-print-val">{displayVal || '\u00A0'}</span>
      {/* Screen representation: interactive input */}
      <span className="inv-screen-val">
        <input
          type="text"
          readOnly={readOnly}
          tabIndex={tabIndex}
          className={`inv-sheet-input text-${align} ${bold ? 'font-bold' : ''}`}
          style={inputStyle}
          value={displayVal}
          placeholder={placeholder}
          onChange={(e) => onChange && onChange(e.target.value)}
        />
      </span>
    </span>
  )
}

/* ==========================================================================
   EDITABLE TEXTAREA COMPONENT
   For multi-line text (address, product names) that wraps without ellipsis
   ========================================================================== */
function EditableTextarea({
  label = '',
  value = '',
  onChange,
  rows = 2,
  bold = false,
  placeholder = '',
  className = '',
  tabIndex,
}) {
  const displayVal = value !== '' && value !== undefined && value !== null ? String(value) : ''

  return (
    <div className={`inv-textarea-wrap ${bold ? 'font-bold' : ''} ${className}`}>
      {label && <strong className="inv-field-label">{label}</strong>}
      {/* Print representation: text wrapped naturally */}
      <div className="inv-print-val inv-print-val-block">{displayVal || '\u00A0'}</div>
      {/* Screen representation: textarea */}
      <div className="inv-screen-val">
        <textarea
          rows={rows}
          tabIndex={tabIndex}
          className={`inv-sheet-textarea ${bold ? 'font-bold' : ''}`}
          value={displayVal}
          placeholder={placeholder}
          onChange={(e) => onChange && onChange(e.target.value)}
        />
      </div>
    </div>
  )
}

/* ==========================================================================
   UNIFIED MASTER INVOICE SHEET (ONE COMPONENT FOR BOTH SCREEN AND PRINT)
   Exact 1-to-1 Pixel-Accurate Replica of Master PDF (CMHP G/26-27/024)
   ========================================================================== */
function InvoiceSheet({
  sheet,
  computed,
  allTableRows,
  densityClass,
  onFieldChange,
  onNumericFieldChange,
  onLineChange,
  onGhostLineChange,
  onRemoveLine,
}) {
  return (
    <div className="invoice-printable-sheet">
      {/* Top Strip (Outside master table border) */}
      <div className="inv-top-strip">
        <span className="inv-top-strip-left font-bold">
          <EditableField
            value={sheet.top_title_left || 'TAX INVOICE'}
            bold
            onChange={(v) => onFieldChange('top_title_left', v)}
            inputStyle={{ width: '130px' }}
          />
        </span>
        <span className="inv-top-strip-right">
          <EditableField
            value={sheet.top_title_right || 'ORIGINAL FOR RECEPIENT'}
            align="right"
            onChange={(v) => onFieldChange('top_title_right', v)}
            inputStyle={{ width: '260px', textAlign: 'right' }}
          />
        </span>
      </div>

      {/* SINGLE 14-COLUMN MASTER TABLE WITH 100% WIDTH AND FIXED LAYOUT */}
      <table className="inv-master-table">
        <colgroup>
          <col style={{ width: '3.2%' }} />   {/* 1. Sr. No. */}
          <col style={{ width: '18.8%' }} />  {/* 2. Product Description */}
          <col style={{ width: '5.0%' }} />   {/* 3. Pkg. */}
          <col style={{ width: '7.0%' }} />   {/* 4. HSN code */}
          <col style={{ width: '8.0%' }} />   {/* 5. Batch No. */}
          <col style={{ width: '4.5%' }} />   {/* 6. Qty */}
          <col style={{ width: '4.5%' }} />   {/* 7. Rate */}
          <col style={{ width: '7.0%' }} />   {/* 8. Amount */}
          <col style={{ width: '7.5%' }} />   {/* 9. Taxable Value */}
          <col style={{ width: '3.5%' }} />   {/* 10. CGST Rate */}
          <col style={{ width: '6.0%' }} />   {/* 11. CGST Amount */}
          <col style={{ width: '3.5%' }} />   {/* 12. SGST Rate */}
          <col style={{ width: '6.0%' }} />   {/* 13. SGST Amount */}
          <col style={{ width: '8.5%' }} />   {/* 14. Total */}
        </colgroup>

        <tbody>
          {/* ====================================================================
              COMPANY HEADER (Rows 1-3)
              ==================================================================== */}
          {/* Row 1: Logo (cols 1-2, spans 2 rows) | Company Name (cols 3-14) */}
          <tr style={{ height: '26pt' }}>
            <td colSpan={2} rowSpan={2} className="inv-logo-cell">
              <img
                src="/cmhp_invoice_logo.png"
                alt="CMHP Logo"
                className="inv-header-logo-img"
                onError={(e) => {
                  e.target.src = '/logo.jpg'
                }}
              />
            </td>
            <td colSpan={12} className="inv-company-name-cell">
              <EditableField
                value={sheet.company_name}
                bold
                align="center"
                onChange={(v) => onFieldChange('company_name', v)}
                className="inv-company-name-title"
              />
            </td>
          </tr>

          {/* Row 2: Factory & Regd Off Address (cols 3-14) */}
          <tr style={{ height: '22pt' }}>
            <td colSpan={12} className="inv-company-addr-cell">
              <EditableTextarea
                value={sheet.company_factory_address}
                rows={2}
                align="center"
                onChange={(v) => onFieldChange('company_factory_address', v)}
              />
            </td>
          </tr>

          {/* Row 3: Contacts (spans all 14 columns) */}
          <tr style={{ height: '17pt' }}>
            <td colSpan={14} className="inv-company-contact-cell">
              <div className="inv-contact-inner">
                <EditableField
                  value={sheet.company_tel}
                  onChange={(v) => onFieldChange('company_tel', v)}
                  className="inv-contact-tel"
                  inputStyle={{ width: '150px' }}
                />
                <EditableField
                  value={sheet.company_mob}
                  onChange={(v) => onFieldChange('company_mob', v)}
                  className="inv-contact-mob"
                  inputStyle={{ width: '150px' }}
                />
              </div>
            </td>
          </tr>

          {/* ====================================================================
              METADATA SECTION (Rows 4-9)
              ==================================================================== */}
          {/* Row 4: GSTIN | D.L. GH-7 | Company Pan No */}
          <tr style={{ height: '14pt' }}>
            <td colSpan={6} className="inv-meta-cell">
              <EditableField
                label="GSTIN: "
                value={sheet.company_gstin}
                bold
                onChange={(v) => onFieldChange('company_gstin', v)}
              />
            </td>
            <td colSpan={2} className="inv-meta-cell text-center">
              <EditableField
                label="D.L. "
                value={sheet.company_dl}
                bold
                align="center"
                onChange={(v) => onFieldChange('company_dl', v)}
              />
            </td>
            <td colSpan={6} className="inv-meta-cell">
              <EditableField
                label="Company Pan No: "
                value={sheet.company_pan}
                bold
                onChange={(v) => onFieldChange('company_pan', v)}
              />
            </td>
          </tr>

          {/* Row 5: Invoice No | Purchase No */}
          <tr style={{ height: '14pt' }}>
            <td colSpan={8} className="inv-meta-cell">
              <EditableField
                label="Invoice No: "
                value={sheet.invoice_no}
                bold
                onChange={(v) => onFieldChange('invoice_no', v)}
              />
            </td>
            <td colSpan={6} className="inv-meta-cell">
              <EditableField
                label="Purchase No : "
                value={sheet.purchase_no}
                onChange={(v) => onFieldChange('purchase_no', v)}
              />
            </td>
          </tr>

          {/* Row 6: Invoice Date | Order Date | No Of Cartons */}
          <tr style={{ height: '14pt' }}>
            <td colSpan={5} className="inv-meta-cell">
              <EditableField
                label="Invoice Date: "
                value={sheet.invoice_date}
                bold
                onChange={(v) => onFieldChange('invoice_date', v)}
              />
            </td>
            <td colSpan={5} className="inv-meta-cell">
              <EditableField
                label="Order Date : "
                value={sheet.order_date}
                onChange={(v) => onFieldChange('order_date', v)}
              />
            </td>
            <td colSpan={4} className="inv-meta-cell">
              <EditableField
                label="No Of Cartons: "
                value={sheet.no_of_cartons}
                onChange={(v) => onFieldChange('no_of_cartons', v)}
              />
            </td>
          </tr>

          {/* Row 7: Reverse Charge (Y/N) | Date of Supply */}
          <tr style={{ height: '14pt' }}>
            <td colSpan={7} className="inv-meta-cell">
              <span>Reverse Charge (Y/N):</span>
            </td>
            <td colSpan={1} className="inv-meta-cell text-center">
              <EditableField
                value={sheet.reverse_charge || 'N'}
                align="center"
                onChange={(v) => onFieldChange('reverse_charge', v)}
                inputStyle={{ width: '20px', textAlign: 'center' }}
              />
            </td>
            <td colSpan={6} className="inv-meta-cell">
              <EditableField
                label="Date of Supply: "
                value={sheet.date_of_supply}
                onChange={(v) => onFieldChange('date_of_supply', v)}
              />
            </td>
          </tr>

          {/* Row 8: Supplier State & Code | Place of Supply */}
          <tr style={{ height: '14pt' }}>
            <td colSpan={6} className="inv-meta-cell">
              <EditableField
                label="State: "
                value={sheet.supplier_state || 'GUJARAT'}
                bold
                onChange={(v) => onFieldChange('supplier_state', v)}
              />
            </td>
            <td colSpan={2} className="inv-meta-cell text-center">
              <EditableField
                label="Code "
                value={sheet.supplier_code || '24'}
                bold
                align="center"
                onChange={(v) => onFieldChange('supplier_code', v)}
              />
            </td>
            <td colSpan={6} className="inv-meta-cell">
              <EditableField
                label="Place of Supply: "
                value={sheet.place_of_supply}
                onChange={(v) => onFieldChange('place_of_supply', v)}
              />
            </td>
          </tr>

          {/* Row 9: Blank | Freight | Amount */}
          <tr style={{ height: '14pt' }}>
            <td colSpan={6} className="inv-meta-cell">
              &nbsp;
            </td>
            <td colSpan={4} className="inv-meta-cell">
              <EditableField
                label="Freight: "
                value={sheet.freight_type || 'To Pay'}
                onChange={(v) => onFieldChange('freight_type', v)}
              />
            </td>
            <td colSpan={4} className="inv-meta-cell">
              <EditableField
                label="Amount : "
                value={sheet.freight_amount}
                onChange={(v) => onFieldChange('freight_amount', v)}
              />
            </td>
          </tr>

          {/* ====================================================================
              PARTY DETAILS: CONSIGNEE & BUYER (Rows 10-14, 50% / 50% split)
              ==================================================================== */}
          {/* Row 10: Headings */}
          <tr style={{ height: '15pt' }}>
            <td colSpan={7} className="inv-party-header-cell">
              <strong>{sheet.consignee_heading || 'Consignee'}</strong>
            </td>
            <td colSpan={7} className="inv-party-header-cell">
              <span>{sheet.buyer_heading || 'Buyer ( if other than consignee)'}</span>
            </td>
          </tr>

          {/* Row 11: Name */}
          <tr style={{ height: '15pt' }}>
            <td colSpan={7} className="inv-party-data-cell">
              <EditableField
                label="Name: "
                value={sheet.consignee_name}
                bold
                onChange={(v) => onFieldChange('consignee_name', v)}
              />
            </td>
            <td colSpan={7} className="inv-party-data-cell">
              <EditableField
                label="Name: "
                value={sheet.buyer_name}
                bold
                onChange={(v) => onFieldChange('buyer_name', v)}
              />
            </td>
          </tr>

          {/* Row 12: Address (wrapped multi-line) */}
          <tr style={{ height: '28pt' }}>
            <td colSpan={7} className="inv-party-data-cell inv-party-address-cell">
              <EditableTextarea
                label="Address: "
                value={sheet.consignee_address}
                rows={2}
                onChange={(v) => onFieldChange('consignee_address', v)}
              />
            </td>
            <td colSpan={7} className="inv-party-data-cell inv-party-address-cell">
              <EditableTextarea
                label="Address: "
                value={sheet.buyer_address}
                rows={2}
                onChange={(v) => onFieldChange('buyer_address', v)}
              />
            </td>
          </tr>

          {/* Row 13: GSTIN */}
          <tr style={{ height: '14.5pt' }}>
            <td colSpan={7} className="inv-party-data-cell">
              <EditableField
                label="GSTIN: "
                value={sheet.consignee_gstin}
                bold
                onChange={(v) => onFieldChange('consignee_gstin', v)}
              />
            </td>
            <td colSpan={7} className="inv-party-data-cell">
              <EditableField
                label="GSTIN: "
                value={sheet.buyer_gstin}
                bold
                onChange={(v) => onFieldChange('buyer_gstin', v)}
              />
            </td>
          </tr>

          {/* Row 14: State & Code */}
          <tr style={{ height: '14.5pt' }}>
            <td colSpan={7} className="inv-party-data-cell">
              <div className="inv-state-code-row">
                <EditableField
                  label="State: "
                  value={sheet.consignee_state}
                  bold
                  onChange={(v) => onFieldChange('consignee_state', v)}
                />
                <EditableField
                  label="Code "
                  value={sheet.consignee_code}
                  bold
                  align="center"
                  onChange={(v) => onFieldChange('consignee_code', v)}
                  inputStyle={{ width: '35px', textAlign: 'center' }}
                />
              </div>
            </td>
            <td colSpan={7} className="inv-party-data-cell">
              <div className="inv-state-code-row">
                <EditableField
                  label="State: "
                  value={sheet.buyer_state}
                  bold
                  onChange={(v) => onFieldChange('buyer_state', v)}
                />
                <EditableField
                  label="Code "
                  value={sheet.buyer_code}
                  bold
                  align="center"
                  onChange={(v) => onFieldChange('buyer_code', v)}
                  inputStyle={{ width: '35px', textAlign: 'center' }}
                />
              </div>
            </td>
          </tr>

          {/* ====================================================================
              ITEM TABLE HEADERS (2-Tier Header)
              ==================================================================== */}
          <tr style={{ height: '12pt' }}>
            <th rowSpan={2} className="inv-th inv-th-sr">Sr.<br />No.</th>
            <th rowSpan={2} className="inv-th inv-th-desc">Product Description</th>
            <th rowSpan={2} className="inv-th inv-th-pkg">Pkg.</th>
            <th rowSpan={2} className="inv-th inv-th-hsn">HSN<br />code</th>
            <th rowSpan={2} className="inv-th inv-th-batch">Batch<br />No.</th>
            <th rowSpan={2} className="inv-th inv-th-qty">Qty</th>
            <th rowSpan={2} className="inv-th inv-th-rate">Rate</th>
            <th rowSpan={2} className="inv-th inv-th-amount">Amount</th>
            <th rowSpan={2} className="inv-th inv-th-taxable">Taxable<br />Value</th>
            <th colSpan={2} className="inv-th inv-th-cgst">CGST</th>
            <th colSpan={2} className="inv-th inv-th-sgst">SGST</th>
            <th rowSpan={2} className="inv-th inv-th-total">Total</th>
          </tr>
          <tr style={{ height: '10pt' }}>
            <th className="inv-th-sub">Rate</th>
            <th className="inv-th-sub">Amount</th>
            <th className="inv-th-sub">Rate</th>
            <th className="inv-th-sub">Amount</th>
          </tr>

          {/* ====================================================================
              ITEM ROWS & GHOST ROWS (Min 14 rows, auto-calculate, manual add)
              ==================================================================== */}
          {allTableRows.map((row) => {
            const isGhost = row.isGhost
            const isFilled = row.isFilled
            const key = row.id

            return (
              <tr key={key} className={`inv-item-row ${densityClass} ${isFilled ? 'is-filled' : 'is-blank'}`}>
                {/* 1. Sr. No. */}
                <td className="text-center inv-cell-sr">
                  <span>{row.displaySrNo || '\u00A0'}</span>
                </td>

                {/* 2. Product Description (wrapped, never truncated) */}
                <td className="text-left font-bold inv-cell-desc">
                  <div className="inv-desc-cell-wrap">
                    <EditableField
                      value={row.description}
                      bold
                      placeholder=""
                      onChange={(v) => {
                        if (isGhost) {
                          onGhostLineChange('description', v)
                        } else {
                          onLineChange(row.id, 'description', v)
                        }
                      }}
                    />
                    {isFilled && (
                      <button
                        type="button"
                        className="inv-row-delete-btn no-print"
                        title="Delete line"
                        onClick={() => onRemoveLine(row.id)}
                      >
                        ×
                      </button>
                    )}
                  </div>
                </td>

                {/* 3. Pkg. */}
                <td className="text-center inv-cell-pkg">
                  <EditableField
                    value={row.pkg}
                    align="center"
                    placeholder=""
                    onChange={(v) => {
                      if (isGhost) onGhostLineChange('pkg', v)
                      else onLineChange(row.id, 'pkg', v)
                    }}
                  />
                </td>

                {/* 4. HSN code */}
                <td className="text-center inv-cell-hsn">
                  <EditableField
                    value={row.hsn}
                    align="center"
                    placeholder=""
                    onChange={(v) => {
                      if (isGhost) onGhostLineChange('hsn', v)
                      else onLineChange(row.id, 'hsn', v)
                    }}
                  />
                </td>

                {/* 5. Batch No. (wrapped) */}
                <td className="text-center inv-cell-batch">
                  <EditableField
                    value={row.batch_no}
                    align="center"
                    placeholder=""
                    onChange={(v) => {
                      if (isGhost) onGhostLineChange('batch_no', v)
                      else onLineChange(row.id, 'batch_no', v)
                    }}
                  />
                </td>

                {/* 6. Qty */}
                <td className="text-right inv-cell-qty">
                  <EditableField
                    value={row.qty}
                    align="right"
                    placeholder=""
                    onChange={(v) => {
                      const filtered = filterNumericInput(v)
                      if (filtered !== null) {
                        if (isGhost) onGhostLineChange('qty', filtered)
                        else onLineChange(row.id, 'qty', filtered)
                      }
                    }}
                  />
                </td>

                {/* 7. Rate */}
                <td className="text-right inv-cell-rate">
                  <EditableField
                    value={row.rate}
                    align="right"
                    placeholder=""
                    onChange={(v) => {
                      const filtered = filterNumericInput(v)
                      if (filtered !== null) {
                        if (isGhost) onGhostLineChange('rate', filtered)
                        else onLineChange(row.id, 'rate', filtered)
                      }
                    }}
                  />
                </td>

                {/* 8. Amount (auto-computed) */}
                <td className="text-right inv-cell-amount">
                  <span>{isFilled && row.amount > 0 ? formatCurrency2(row.amount) : '\u00A0'}</span>
                </td>

                {/* 9. Taxable Value (auto-computed) */}
                <td className="text-right inv-cell-taxable">
                  <span>{isFilled && row.taxable > 0 ? formatCurrency2(row.taxable) : '\u00A0'}</span>
                </td>

                {/* 10. CGST Rate */}
                <td className="text-center inv-cell-cgst-rate">
                  <EditableField
                    value={row.cgst_rate}
                    align="center"
                    placeholder=""
                    onChange={(v) => {
                      const filtered = filterNumericInput(v)
                      if (filtered !== null) {
                        if (isGhost) onGhostLineChange('cgst_rate', filtered)
                        else onLineChange(row.id, 'cgst_rate', filtered)
                      }
                    }}
                  />
                </td>

                {/* 11. CGST Amount (auto-computed) */}
                <td className="text-right inv-cell-cgst-amount">
                  <span>{isFilled && row.cgstAmount > 0 ? formatCurrency2(row.cgstAmount) : '\u00A0'}</span>
                </td>

                {/* 12. SGST Rate */}
                <td className="text-center inv-cell-sgst-rate">
                  <EditableField
                    value={row.sgst_rate}
                    align="center"
                    placeholder=""
                    onChange={(v) => {
                      const filtered = filterNumericInput(v)
                      if (filtered !== null) {
                        if (isGhost) onGhostLineChange('sgst_rate', filtered)
                        else onLineChange(row.id, 'sgst_rate', filtered)
                      }
                    }}
                  />
                </td>

                {/* 13. SGST Amount (auto-computed) */}
                <td className="text-right inv-cell-sgst-amount">
                  <span>{isFilled && row.sgstAmount > 0 ? formatCurrency2(row.sgstAmount) : '\u00A0'}</span>
                </td>

                {/* 14. Total (auto-computed) */}
                <td className="text-right font-bold inv-cell-total">
                  <span>{isFilled && row.lineTotal > 0 ? formatCurrency2(row.lineTotal) : '\u00A0'}</span>
                </td>
              </tr>
            )
          })}

          {/* ====================================================================
              TOTAL ROW (Computed mathematically correct)
              ==================================================================== */}
          <tr className="inv-totals-row" style={{ height: '14pt' }}>
            <td colSpan={5} className="font-bold text-center inv-total-label">
              Total
            </td>
            <td className="font-bold text-right">
              {computed.totalQty > 0 ? formatQty(computed.totalQty) : '\u00A0'}
            </td>
            <td>&nbsp;</td>
            <td className="font-bold text-right">
              {computed.totalAmount > 0 ? formatCurrency2(computed.totalAmount) : '\u00A0'}
            </td>
            <td className="font-bold text-right">
              {computed.totalTaxable > 0 ? formatCurrency2(computed.totalTaxable) : '\u00A0'}
            </td>
            <td>&nbsp;</td>
            <td className="font-bold text-right">
              {computed.totalCgst > 0 ? formatCurrency2(computed.totalCgst) : '\u00A0'}
            </td>
            <td>&nbsp;</td>
            <td className="font-bold text-right">
              {computed.totalSgst > 0 ? formatCurrency2(computed.totalSgst) : '\u00A0'}
            </td>
            <td className="font-bold text-right">
              {computed.totalRowSums > 0 ? formatCurrency2(computed.totalRowSums) : '\u00A0'}
            </td>
          </tr>

          {/* ====================================================================
              BOTTOM SUMMARY & TERMS BLOCK
              ==================================================================== */}
          {/* Row B1: Total Amount before Tax */}
          <tr style={{ height: '14pt' }}>
            <td colSpan={9} rowSpan={2} className="inv-words-cell">
              <div className="font-bold inv-words-title">
                Total Invoice Amount in words
              </div>
              <div className="inv-words-text">{computed.totalInWords || computed.words || ''}</div>
            </td>
            <td colSpan={4} className="font-bold inv-summary-label">
              Total Amount before Tax
            </td>
            <td colSpan={1} className="font-bold text-right inv-summary-val">
              {formatCurrency2(computed.totalAmount)}
            </td>
          </tr>

          {/* Row B2: Postage & Packing */}
          <tr style={{ height: '14pt' }}>
            <td colSpan={4} className="font-bold inv-summary-label">
              Postage &amp; Packing
            </td>
            <td colSpan={1} className="font-bold text-right inv-summary-val">
              <EditableField
                value={sheet.postage_packing}
                align="right"
                placeholder=""
                onChange={(v) => onNumericFieldChange('postage_packing', v)}
              />
            </td>
          </tr>

          {/* Row B3: Bank Details || Add: CGST */}
          <tr style={{ height: '14pt' }}>
            <td colSpan={6} className="font-bold inv-bank-cell">
              <EditableField
                label="Bank Details:  "
                value={sheet.bank_name}
                bold
                onChange={(v) => onFieldChange('bank_name', v)}
              />
            </td>
            <td colSpan={3} rowSpan={3} className="inv-middle-blank">&nbsp;</td>
            <td colSpan={4} className="font-bold inv-summary-label">
              Add: CGST
            </td>
            <td colSpan={1} className="font-bold text-right inv-summary-val">
              {formatCurrency2(computed.totalCgst)}
            </td>
          </tr>

          {/* Row B4: Bank A/C || Add: SGST */}
          <tr style={{ height: '14pt' }}>
            <td colSpan={6} className="font-bold inv-bank-cell">
              <EditableField
                label="Bank A/C:  "
                value={sheet.bank_ac}
                bold
                onChange={(v) => onFieldChange('bank_ac', v)}
              />
            </td>
            <td colSpan={4} className="font-bold inv-summary-label">
              Add: SGST
            </td>
            <td colSpan={1} className="font-bold text-right inv-summary-val">
              {formatCurrency2(computed.totalSgst)}
            </td>
          </tr>

          {/* Row B5: Bank IFSC || Total Tax Amount */}
          <tr style={{ height: '14pt' }}>
            <td colSpan={6} className="font-bold inv-bank-cell">
              <EditableField
                label="Bank IFSC:  "
                value={sheet.bank_ifsc}
                bold
                onChange={(v) => onFieldChange('bank_ifsc', v)}
              />
            </td>
            <td colSpan={4} className="font-bold inv-summary-label">
              Total Tax Amount
            </td>
            <td colSpan={1} className="font-bold text-right inv-summary-val">
              {formatCurrency2(computed.totalTax)}
            </td>
          </tr>

          {/* Row B6: Blank || Rounding Off */}
          <tr style={{ height: '14pt' }}>
            <td colSpan={6} rowSpan={2} className="inv-blank-terms-lead">&nbsp;</td>
            <td colSpan={3} rowSpan={2} className="inv-middle-blank">&nbsp;</td>
            <td colSpan={4} className="font-bold inv-summary-label">
              Rounding Off
            </td>
            <td colSpan={1} className="font-bold text-right inv-summary-val">
              <EditableField
                value={
                  sheet.rounding_off_override !== '' && sheet.rounding_off_override !== undefined
                    ? sheet.rounding_off_override
                    : (computed.roundOff !== 0 ? formatCurrency2(computed.roundOff) : '')
                }
                bold
                align="right"
                placeholder=""
                onChange={(v) => onNumericFieldChange('rounding_off_override', v, true)}
              />
            </td>
          </tr>

          {/* Row B7: Blank || Total Amount after Tax */}
          <tr style={{ height: '14pt' }}>
            <td colSpan={4} className="font-bold inv-summary-label">
              Total Amount after Tax:
            </td>
            <td colSpan={1} className="font-bold text-right inv-summary-val">
              {formatCurrency2(computed.finalTotalAfterTax)}
            </td>
          </tr>

          {/* Row B8: Blank || Certified statement */}
          <tr style={{ height: '14pt' }}>
            <td colSpan={6} className="inv-blank-terms-lead">&nbsp;</td>
            <td colSpan={8} className="inv-cert-cell">
              Ceritified that the particulars given above are true and correct
            </td>
          </tr>

          {/* Row B9: Terms & Conditions || For Company */}
          <tr style={{ height: '48pt' }}>
            <td colSpan={6} className="inv-terms-content-cell">
              <div className="font-bold inv-terms-heading">
                Terms &amp; Conditions :
              </div>
              <div>{sheet.term_1}</div>
              <div>{sheet.term_2}</div>
              <div>{sheet.term_3}</div>
            </td>
            <td colSpan={3} className="inv-seal-middle-block">&nbsp;</td>
            <td colSpan={5} className="inv-sign-block-cell">
              <div className="font-bold text-center inv-for-company">
                {sheet.for_company}
              </div>
              {/* Preserved manual signature space (no image) */}
              <div className="inv-sign-empty-space" style={{ height: '36pt' }}>&nbsp;</div>
            </td>
          </tr>

          {/* Row B10: Bottom aligned labels */}
          <tr style={{ height: '14pt' }}>
            <td colSpan={6} className="inv-terms-bottom-cell">
              {sheet.term_4}
            </td>
            <td colSpan={3} className="inv-seal-bottom-cell text-center font-bold">
              {sheet.company_seal_label}
            </td>
            <td colSpan={5} className="inv-sign-bottom-cell text-center font-bold">
              {sheet.authorised_signatory}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

/* ==========================================================================
   INVOICE VIEW PAGE (MAIN CONTROLLER)
   ========================================================================== */
export default function InvoiceViewPage({ isNew: isNewProp = false }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const dispatch = useDispatch()

  const isNew = Boolean(isNewProp || id === 'new' || !id)
  const [createdId, setCreatedId] = useState(null)

  const compKey = useSelector(selectActiveCompanyKey)
  const compId = useSelector(selectActiveCompanyId)
  const reduxInvoices = useSelector((state) => state.erp.byCompany?.[compKey]?.invoices || state.erp.invoices || [])
  const reduxOrders = useSelector((state) => state.erp.byCompany?.[compKey]?.orders || state.erp.orders || [])
  const reduxBatches = useSelector((state) => state.erp.byCompany?.[compKey]?.batches || state.erp.batches || [])
  const reduxCustomers = useSelector((state) => state.erp.customers || [])
  const reduxProducts = useSelector((state) => [
    ...(state.erp.products || []),
    ...(state.erp.commonProducts || []),
    ...(state.erp.byCompany?.[compKey]?.products || []),
  ])
  const savedOrderInvoices = useSelector((state) => state.erp.orderInvoices || {})

  // Target invoice
  const currentInvoice = useMemo(() => {
    if (isNew && !createdId) return null
    const targetId = createdId || id
    return (reduxInvoices || []).find(
      (inv) =>
        String(inv.id) === String(targetId) ||
        String(inv.order) === String(targetId) ||
        String(inv.number) === String(targetId)
    )
  }, [reduxInvoices, id, isNew, createdId])

  // Target order
  const order = useMemo(() => {
    if (isNew && !createdId) return null
    const orderId = currentInvoice?.order || currentInvoice?.order_id || id
    return (reduxOrders || []).find(
      (o) => String(o.id) === String(orderId) || String(o.number) === String(orderId)
    )
  }, [currentInvoice, reduxOrders, id, isNew, createdId])

  // Target customer
  const customer = useMemo(() => {
    if (isNew && !createdId) return null
    const custId = currentInvoice?.customer || order?.customer
    const custName = currentInvoice?.customer_name || order?.customer_name
    return (reduxCustomers || []).find(
      (c) => (custId && String(c.id) === String(custId)) || (custName && c.name === custName)
    )
  }, [currentInvoice, order, reduxCustomers, isNew, createdId])

  // UI state
  const [saveFeedback, setSaveFeedback] = useState('')
  const [validationError, setValidationError] = useState('')
  const [showPayModal, setShowPayModal] = useState(false)
  const [payAmount, setPayAmount] = useState('')
  const [payMode, setPayMode] = useState('BANK_TRANSFER')
  const [payRef, setPayRef] = useState('')
  const [zoomLevel, setZoomLevel] = useState('100%')

  // Screen-only due date (defaults to today + 30 days)
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 30)
    return d.toISOString().slice(0, 10)
  })

  // Sync due date if viewing an existing invoice that has a due_date
  useEffect(() => {
    if (!isNew && currentInvoice?.due_date) {
      setDueDate(currentInvoice.due_date)
    }
  }, [isNew, currentInvoice?.due_date])

  // Build initial invoice sheet data
  const buildInitialData = useCallback(() => {
    const todayFormatted = formatInvoiceDate(new Date())
    const invNumber = currentInvoice?.number || currentInvoice?.invoice_no || generateInvoiceNumber(reduxInvoices, new Date())

    // If in new invoice mode: everything transactional is blank, Reverse Charge is 'N', system pre-fills invoice_no and date
    if (isNew && !createdId) {
      return {
        top_title_left: 'TAX INVOICE',
        top_title_right: 'ORIGINAL FOR RECEPIENT',

        // Company Header (Master PDF exact)
        company_name: 'CMHP PRIVATE LIMITED',
        company_factory_address:
          'Factory :18, Shubh Laxmi, Viramgam Road,Sanand,Ahmedabad-382110. Regd.Off.: 701, Safal Prelude, Corporate Road, Ahmedabad-380015',
        company_tel: 'Tel: +917947977198',
        company_mob: 'Mob: +919327252466',
        company_gstin: '24AAICC9380N1Z2',
        company_dl: 'GH-7',
        company_pan: 'AAICC9380N',

        // Supplier State is ALWAYS Gujarat, Code 24
        supplier_state: 'GUJARAT',
        supplier_code: '24',

        // Meta Block
        invoice_no: invNumber,
        purchase_no: '',
        invoice_date: todayFormatted,
        order_date: '',
        no_of_cartons: '',
        reverse_charge: 'N',
        date_of_supply: '',
        place_of_supply: '',
        freight_type: '',
        freight_amount: '',

        // Consignee Block
        consignee_heading: 'Consignee',
        consignee_name: '',
        consignee_address: '',
        consignee_gstin: '',
        consignee_state: '',
        consignee_code: '',

        // Buyer Block
        buyer_heading: 'Buyer ( if other than consignee)',
        buyer_name: '',
        buyer_address: '',
        buyer_gstin: '',
        buyer_state: '',
        buyer_code: '',

        // Lines: empty so 14 ghost rows display
        lines: [],

        // Extra charges
        postage_packing: '',
        rounding_off_override: '',

        // Bank Details
        bank_name: 'HDFC BANK LTD.',
        bank_ac: '50200052209722',
        bank_ifsc: 'HDFC0000048',

        // Terms & Conditions (Master PDF exact)
        term_1: 'No Claim is entertained in transit',
        term_2: 'Interest @ 24% p.a. will be charged,',
        term_3: 'If this invoice not paid by due date.',
        term_4: 'Subject to Ahmedabad Jurisdiction only.',

        // Footer labels
        company_seal_label: 'Company Seal',
        for_company: 'For CMHP Private Limited',
        cert_statement: 'Ceritified that the particulars given above are true and correct',
        authorised_signatory: 'Authorised signatory',
      }
    }

    // Existing invoice data derivation
    const consigneeName = customer?.name || order?.customer_name || currentInvoice?.customer_name || ''
    
    // Addresses
    const shippingAddress =
      order?.shipping_address ||
      order?.shippingAddress ||
      order?.delivery_address ||
      customer?.shipping_address ||
      customer?.address ||
      customer?.billing_address ||
      ''
      
    const billingAddress =
      order?.billing_address ||
      order?.billingAddress ||
      customer?.billing_address ||
      customer?.address ||
      ''

    const consigneeAddress = shippingAddress || billingAddress
    const buyerAddress =
      billingAddress && consigneeAddress && billingAddress.trim().toLowerCase() === consigneeAddress.trim().toLowerCase()
        ? 'Same as Billed Address'
        : (billingAddress || 'Same as Billed Address')

    const consigneeGstin = customer?.gstin || ''
    const consigneeState = (customer?.state || '').toUpperCase()
    const consigneeCode = deriveStateCode(consigneeGstin, consigneeState)

    const buyerName = customer?.shipping_name || consigneeName
    const buyerGstin = customer?.shipping_gstin || consigneeGstin
    const buyerState = (customer?.shipping_state || consigneeState).toUpperCase()
    const buyerCode = deriveStateCode(buyerGstin, buyerState)

    const placeOfSupply = customer?.city || order?.place_of_supply || customer?.state || 'Ahmedabad'

    // Determine line items
    let completedItems = []

    if (Array.isArray(order?.lines) && order.lines.length > 0) {
      completedItems = order.lines.filter((line) => {
        const prodStatus = String(line.production_status || line.status || '').toLowerCase()
        if (prodStatus === 'completed' || prodStatus === 'finished') return true
        const matchedBatch = reduxBatches.find(
          (b) =>
            (String(b.orderId || b.order_id || b.order) === String(order.id) ||
              String(b.orderNumber) === String(order.number)) &&
            (String(b.productId || b.product_id) === String(line.product_id) ||
              b.product_name === line.product_name)
        )
        if (matchedBatch) {
          const bStatus = String(matchedBatch.status || '').toLowerCase()
          return bStatus === 'completed' || bStatus === 'released' || bStatus === 'qa_approved'
        }
        return false
      })

      if (
        completedItems.length === 0 &&
        String(order?.production_status || order?.status || '').toLowerCase() === 'completed'
      ) {
        completedItems = order.lines
      }
    }

    if (completedItems.length === 0 && Array.isArray(currentInvoice?.lines) && currentInvoice.lines.length > 0) {
      completedItems = currentInvoice.lines
    } else if (completedItems.length === 0 && Array.isArray(order?.lines) && order.lines.length > 0) {
      completedItems = order.lines
    } else if (completedItems.length === 0 && order?.product_name) {
      completedItems = [
        {
          product_name: order.product_name,
          pack_size: order.pack_size || order.packing_size || '',
          quantity: order.quantity || '',
          rate: order.rate || order.unit_price || '',
          batch_no: order.batch_no || '',
        },
      ]
    } else if (completedItems.length === 0) {
      completedItems = [
        {
          product_name: '',
          pack_size: '',
          quantity: '',
          rate: '',
          batch_no: '',
        },
      ]
    }

    const formattedLines = completedItems.map((item, idx) => {
      const prod = reduxProducts.find(
        (p) =>
          String(p.id) === String(item.product_id || item.product || order?.product_id) ||
          p.name === item.product_name ||
          p.code === order?.product_code
      )

      const matchedBatch = reduxBatches.find(
        (b) =>
          (String(b.orderId || b.order_id || b.order) === String(order?.id) ||
            String(b.orderNumber) === String(order?.number)) &&
          (String(b.productId || b.product_id) === String(item.product_id || prod?.id) ||
            b.product_name === (item.product_name || prod?.name))
      )

      const qty =
        item.qty !== undefined && item.qty !== null && item.qty !== ''
          ? String(item.qty)
          : item.quantity !== undefined && item.quantity !== null && item.quantity !== ''
          ? String(item.quantity)
          : ''

      const rate =
        item.rate !== undefined && item.rate !== null && item.rate !== ''
          ? String(item.rate)
          : item.unit_price !== undefined
          ? String(item.unit_price)
          : prod?.selling_price !== undefined
          ? String(prod.selling_price)
          : ''

      const hsn = String(item.hsn || item.hsn_code || prod?.hsn_code || '30049099')
      const pkg = item.pkg || item.pack_size || prod?.pack_size || '30 ml.'
      const batchNo = matchedBatch?.batch_no || matchedBatch?.batchNumber || item.batch_no || order?.batch_no || ''

      const cgstRate =
        item.cgst_rate !== undefined && item.cgst_rate !== null && item.cgst_rate !== ''
          ? String(item.cgst_rate)
          : prod?.cgst_rate !== undefined
          ? String(prod.cgst_rate)
          : prod?.gst_percent
          ? String(prod.gst_percent / 2)
          : '2.5'

      const sgstRate =
        item.sgst_rate !== undefined && item.sgst_rate !== null && item.sgst_rate !== ''
          ? String(item.sgst_rate)
          : prod?.sgst_rate !== undefined
          ? String(prod.sgst_rate)
          : prod?.gst_percent
          ? String(prod.gst_percent / 2)
          : '2.5'

      return {
        id: item.id || `line-${Date.now()}-${idx}`,
        description: item.description || item.product_name || prod?.name || '',
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

      // Company Header (Master PDF exact)
      company_name: 'CMHP PRIVATE LIMITED',
      company_factory_address:
        'Factory :18, Shubh Laxmi, Viramgam Road,Sanand,Ahmedabad-382110. Regd.Off.: 701, Safal Prelude, Corporate Road, Ahmedabad-380015',
      company_tel: 'Tel: +917947977198',
      company_mob: 'Mob: +919327252466',
      company_gstin: '24AAICC9380N1Z2',
      company_dl: 'GH-7',
      company_pan: 'AAICC9380N',

      // Supplier State is ALWAYS Gujarat, Code 24
      supplier_state: 'GUJARAT',
      supplier_code: '24',

      // Meta Block
      invoice_no: invNumber,
      purchase_no: order?.po_number || order?.purchase_no || order?.purchase_order || '',
      invoice_date: todayFormatted,
      order_date: order?.order_date ? formatInvoiceDate(order.order_date) : '',
      no_of_cartons: order?.no_of_cartons || order?.cartons || '01',
      reverse_charge: order?.reverse_charge || 'N',
      date_of_supply: order?.delivery_deadline ? formatInvoiceDate(order.delivery_deadline) : todayFormatted,
      place_of_supply: placeOfSupply,
      freight_type: order?.freight_type || 'To Pay',
      freight_amount: order?.freight_amount ? String(order.freight_amount) : '',

      // Consignee Block
      consignee_heading: 'Consignee',
      consignee_name: consigneeName,
      consignee_address: consigneeAddress,
      consignee_gstin: consigneeGstin,
      consignee_state: consigneeState,
      consignee_code: consigneeCode,

      // Buyer Block
      buyer_heading: 'Buyer ( if other than consignee)',
      buyer_name: buyerName,
      buyer_address: buyerAddress,
      buyer_gstin: buyerGstin,
      buyer_state: buyerState,
      buyer_code: buyerCode,

      // Lines
      lines: formattedLines,

      // Extra charges
      postage_packing: '',
      rounding_off_override: '',

      // Bank Details
      bank_name: 'HDFC BANK LTD.',
      bank_ac: '50200052209722',
      bank_ifsc: 'HDFC0000048',

      // Terms & Conditions (Master PDF exact)
      term_1: 'No Claim is entertained in transit',
      term_2: 'Interest @ 24% p.a. will be charged,',
      term_3: 'If this invoice not paid by due date.',
      term_4: 'Subject to Ahmedabad Jurisdiction only.',

      // Footer labels
      company_seal_label: 'Company Seal',
      for_company: 'For CMHP Private Limited',
      cert_statement: 'Ceritified that the particulars given above are true and correct',
      authorised_signatory: 'Authorised signatory',
    }
  }, [currentInvoice, order, customer, reduxInvoices, reduxBatches, reduxProducts, isNew, createdId])

  // Sheet State: auto-heal any legacy or incorrect state
  const [sheet, setSheet] = useState(() => {
    if (isNew && !createdId) {
      return buildInitialData()
    }

    const saved =
      (order?.id && savedOrderInvoices[String(order.id)]) ||
      (currentInvoice?.order && savedOrderInvoices[String(currentInvoice.order)]) ||
      (currentInvoice?.id && savedOrderInvoices[String(currentInvoice.id)]) ||
      currentInvoice?.sheetData

    const initial = buildInitialData()

    if (!saved) return initial

    // Heal supplier state to always be Gujarat 24
    const supplierState = 'GUJARAT'
    const supplierCode = '24'

    // Heal consignee code derived from customer gstin/state
    const custGstin = saved.consignee_gstin || initial.consignee_gstin
    const custState = saved.consignee_state || initial.consignee_state
    const derivedCustCode = deriveStateCode(custGstin, custState) || saved.consignee_code || '24'

    // Heal address if empty
    const consigneeAddr = saved.consignee_address || initial.consignee_address
    const buyerAddr = saved.buyer_address || initial.buyer_address

    // Heal factory address line if split in legacy
    const factoryAddr =
      saved.company_factory_address ||
      (saved.company_factory_line1
        ? `${saved.company_factory_line1} ${saved.company_factory_line2 || ''}`.trim()
        : initial.company_factory_address)

    return {
      ...initial,
      ...saved,
      company_factory_address: factoryAddr,
      supplier_state: supplierState,
      supplier_code: supplierCode,
      consignee_code: derivedCustCode,
      buyer_code: derivedCustCode,
      consignee_address: consigneeAddr,
      buyer_address: buyerAddr,
    }
  })

  // Field change handlers with state code auto-derivation
  const handleFieldChange = useCallback((field, value) => {
    setSheet((prev) => {
      const next = { ...prev, [field]: value }
      if (field === 'consignee_gstin') {
        const derived = deriveStateCode(value, prev.consignee_state)
        if (derived) next.consignee_code = derived
      } else if (field === 'consignee_state') {
        const derived = deriveStateCode(prev.consignee_gstin, value)
        if (derived) next.consignee_code = derived
      } else if (field === 'buyer_gstin') {
        const derived = deriveStateCode(value, prev.buyer_state)
        if (derived) next.buyer_code = derived
      } else if (field === 'buyer_state') {
        const derived = deriveStateCode(prev.buyer_gstin, value)
        if (derived) next.buyer_code = derived
      }
      return next
    })
    setValidationError('')
  }, [])

  const handleNumericFieldChange = useCallback((field, value, allowNegative = false) => {
    const filtered = filterNumericInput(value, allowNegative)
    if (filtered !== null) {
      setSheet((prev) => ({ ...prev, [field]: filtered }))
    }
  }, [])

  // Line item change handlers
  const handleLineChange = useCallback((lineId, field, value) => {
    setSheet((prev) => {
      const updatedLines = (prev.lines || []).map((l) => {
        if (l.id === lineId) {
          return { ...l, [field]: value }
        }
        return l
      })
      return { ...prev, lines: updatedLines }
    })
    setValidationError('')
  }, [])

  // Ghost line (typing into a blank row adds it to sheet.lines with blank defaults)
  const handleGhostLineChange = useCallback((field, value) => {
    setSheet((prev) => {
      const newLine = {
        id: `line-${Date.now()}-${(prev.lines || []).length}`,
        description: '',
        pkg: '',
        hsn: '',
        batch_no: '',
        qty: '',
        rate: '',
        cgst_rate: '',
        sgst_rate: '',
        [field]: value,
      }
      return { ...prev, lines: [...(prev.lines || []), newLine] }
    })
    setValidationError('')
  }, [])

  // Remove line item
  const handleRemoveLine = useCallback((lineId) => {
    setSheet((prev) => {
      const updated = (prev.lines || []).filter((l) => l.id !== lineId)
      return { ...prev, lines: updated }
    })
  }, [])

  // Add line item button
  const handleAddLine = useCallback(() => {
    setSheet((prev) => {
      const newLine = {
        id: `line-${Date.now()}-${(prev.lines || []).length}`,
        description: '',
        pkg: '',
        hsn: '',
        batch_no: '',
        qty: '',
        rate: '',
        cgst_rate: '',
        sgst_rate: '',
      }
      return { ...prev, lines: [...(prev.lines || []), newLine] }
    })
  }, [])

  // Real-time calculations with 2-decimal precision
  const computed = useMemo(() => {
    let totalQty = 0
    let totalAmount = 0
    let totalTaxable = 0
    let totalCgst = 0
    let totalSgst = 0
    let totalRowSums = 0

    const processedLines = (sheet.lines || []).map((l, originalIdx) => {
      const isFilled = Boolean(
        (l.description && l.description.trim()) ||
        (l.qty !== '' && l.qty !== null && l.qty !== undefined && Number(l.qty) > 0) ||
        (l.rate !== '' && l.rate !== null && l.rate !== undefined && Number(l.rate) > 0)
      )

      const qtyNum = l.qty === '' || l.qty === undefined || l.qty === null ? 0 : parseFloat(l.qty) || 0
      const rateNum = l.rate === '' || l.rate === undefined || l.rate === null ? 0 : parseFloat(l.rate) || 0

      // Exact 2-decimal calculations
      const amount = isFilled ? round2(qtyNum * rateNum) : 0
      const taxable = amount

      const cgstRateNum = l.cgst_rate === '' || l.cgst_rate === undefined || l.cgst_rate === null ? 0 : parseFloat(l.cgst_rate) || 0
      const cgstAmount = isFilled ? round2((taxable * cgstRateNum) / 100) : 0

      const sgstRateNum = l.sgst_rate === '' || l.sgst_rate === undefined || l.sgst_rate === null ? 0 : parseFloat(l.sgst_rate) || 0
      const sgstAmount = isFilled ? round2((taxable * sgstRateNum) / 100) : 0

      const lineTotal = isFilled ? round2(taxable + cgstAmount + sgstAmount) : 0

      if (isFilled) {
        totalQty += qtyNum
        totalAmount = round2(totalAmount + amount)
        totalTaxable = round2(totalTaxable + taxable)
        totalCgst = round2(totalCgst + cgstAmount)
        totalSgst = round2(totalSgst + sgstAmount)
        totalRowSums = round2(totalRowSums + lineTotal)
      }

      return {
        ...l,
        originalIdx,
        isFilled,
        qtyNum,
        rateNum,
        amount,
        taxable,
        cgstRateNum,
        cgstAmount,
        sgstRateNum,
        sgstAmount,
        lineTotal,
      }
    })

    const postagePackingNum =
      sheet.postage_packing === '' || sheet.postage_packing === undefined ? 0 : parseFloat(sheet.postage_packing) || 0
    const totalTax = round2(totalCgst + totalSgst)
    const exactTotalAfterTax = round2(totalTaxable + postagePackingNum + totalTax)

    let roundOff = 0
    if (
      sheet.rounding_off_override !== null &&
      sheet.rounding_off_override !== undefined &&
      sheet.rounding_off_override !== ''
    ) {
      roundOff = parseFloat(sheet.rounding_off_override) || 0
    } else {
      const integerTarget = Math.round(exactTotalAfterTax)
      roundOff = round2(integerTarget - exactTotalAfterTax)
    }

    const finalTotalAfterTax = round2(exactTotalAfterTax + roundOff)
    const totalInWords = amountInWordsINR(finalTotalAfterTax)

    return {
      processedLines,
      totalQty,
      totalAmount,
      totalTaxable,
      totalCgst,
      totalSgst,
      totalRowSums,
      totalTax,
      exactTotalAfterTax,
      roundOff,
      finalTotalAfterTax,
      totalInWords,
      words: totalInWords,
    }
  }, [sheet.lines, sheet.postage_packing, sheet.rounding_off_override])

  // Single page rows calculation: pads with ghost rows up to MIN_ROWS (14)
  const { allTableRows, densityClass, isOverLimit } = useMemo(() => {
    let filledCounter = 0
    const displayLines = computed.processedLines.map((l) => {
      if (l.isFilled) {
        filledCounter += 1
        return { ...l, displaySrNo: filledCounter }
      }
      return { ...l, displaySrNo: '' }
    })

    const MIN_ROWS = 14
    const filledCount = displayLines.length
    const emptyNeeded = Math.max(0, MIN_ROWS - filledCount)
    const ghostRows = Array.from({ length: emptyNeeded }, (_, i) => ({
      id: `ghost-${filledCount + i}`,
      isGhost: true,
      displaySrNo: '',
      description: '',
      pkg: '',
      hsn: '',
      batch_no: '',
      qty: '',
      rate: '',
      cgst_rate: '',
      sgst_rate: '',
      amount: 0,
      taxable: 0,
      cgstAmount: 0,
      sgstAmount: 0,
      lineTotal: 0,
      isFilled: false,
    }))

    const combined = [...displayLines, ...ghostRows]

    let density = 'inv-density-normal'
    if (combined.length >= 19) {
      density = 'inv-density-tight'
    } else if (combined.length >= 15) {
      density = 'inv-density-compact'
    }

    return {
      allTableRows: combined,
      densityClass: density,
      isOverLimit: filledCount > 20,
    }
  }, [computed.processedLines])

  // Save to Redux store
  const handleSave = useCallback(
    (isManualSave = true) => {
      setValidationError('')

      const custName = (sheet.consignee_name || sheet.buyer_name || '').trim()
      const hasFilledLine = (sheet.lines || []).some(
        (l) => (l.description && l.description.trim()) || (l.qty !== '' && Number(l.qty) > 0)
      )

      // Validation for new invoice
      if (isNew && !createdId) {
        if (!custName) {
          setValidationError('Customer / Consignee name is required.')
          return null
        }
        if (!hasFilledLine) {
          setValidationError('Please enter at least one filled item row (Product Description, Qty and Rate).')
          return null
        }
      }

      const finalTotal = Math.round(computed.finalTotalAfterTax)
      const todayIso = new Date().toISOString().slice(0, 10)

      if (isNew && !createdId) {
        // Create new invoice in Redux
        const newId = Date.now()
        const targetNumber = sheet.invoice_no || generateInvoiceNumber(reduxInvoices, new Date())

        const matchedCustomer = reduxCustomers.find(
          (c) => c.name && c.name.trim().toLowerCase() === custName.toLowerCase()
        )

        const newInvoiceRecord = {
          id: newId,
          number: targetNumber,
          invoice_no: targetNumber,
          company: compId ? Number(compId) : (compKey === 'tej' ? 2 : 1),
          companyId: compKey || 'cmhp',
          customer: matchedCustomer?.id || newId,
          customer_name: custName,
          order: null,
          order_number: '—',
          batch: null,
          batch_no: '',
          invoice_date: sheet.invoice_date ? convertToIsoDate(sheet.invoice_date) : todayIso,
          due_date: dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
          status: 'ISSUED',
          total: finalTotal,
          total_amount: finalTotal,
          balance_due: finalTotal,
          total_in_words: computed.totalInWords,
          tax_amount: computed.totalTax,
          lines: computed.processedLines.filter((l) => l.isFilled),
          sheetData: {
            ...sheet,
            id: newId,
            invoice_no: targetNumber,
            total: finalTotal,
            total_amount: finalTotal,
            balance_due: finalTotal,
            finalTotalAfterTax: computed.finalTotalAfterTax,
            total_in_words: computed.totalInWords,
          },
        }

        dispatch(addInvoice(newInvoiceRecord))
        dispatch(
          saveOrderInvoice({
            orderId: String(newId),
            invoiceData: newInvoiceRecord.sheetData,
          })
        )

        setCreatedId(newId)
        window.history.replaceState(null, '', `/invoices/view/${newId}`)

        if (isManualSave) {
          navigate('/invoices', { state: { highlightInvoiceId: newId } })
        }
        return newId
      } else {
        // Updating existing invoice or newly created invoice
        const targetInvoiceId = createdId || currentInvoice?.id || id
        const targetOrderId = order?.id || currentInvoice?.order || targetInvoiceId

        if (targetOrderId) {
          dispatch(
            saveOrderInvoice({
              orderId: String(targetOrderId),
              invoiceData: {
                ...sheet,
                id: targetInvoiceId,
                total: finalTotal,
                total_amount: finalTotal,
                balance_due: finalTotal,
                finalTotalAfterTax: computed.finalTotalAfterTax,
                total_in_words: computed.totalInWords,
              },
            })
          )
        }

        if (targetInvoiceId) {
          dispatch(
            editInvoice({
              id: targetInvoiceId,
              payload: {
                ...currentInvoice,
                number: sheet.invoice_no,
                total: finalTotal,
                total_amount: finalTotal,
                balance_due: finalTotal,
                total_in_words: computed.totalInWords,
                tax_amount: computed.totalTax,
                due_date: dueDate || currentInvoice?.due_date,
                sheetData: sheet,
              },
            })
          )
        }

        if (isManualSave) {
          if (isNew) {
            navigate('/invoices', { state: { highlightInvoiceId: targetInvoiceId } })
          } else {
            setSaveFeedback('✓ Saved to Redux')
            setTimeout(() => setSaveFeedback(''), 2500)
          }
        }
        return targetInvoiceId
      }
    },
    [
      sheet,
      computed,
      order,
      currentInvoice,
      id,
      dispatch,
      isNew,
      createdId,
      reduxInvoices,
      compId,
      compKey,
      reduxCustomers,
      dueDate,
      navigate,
    ]
  )

  // Debounced auto-save for existing invoices only (never for unsaved new invoice)
  useEffect(() => {
    if (isNew && !createdId) return
    const timer = setTimeout(() => {
      handleSave(false)
    }, 800)
    return () => clearTimeout(timer)
  }, [sheet, handleSave, isNew, createdId])

  // Unsaved changes check
  const isDirty = useMemo(() => {
    if (!isNew || createdId) return false
    return Boolean(
      sheet.consignee_name?.trim() ||
      sheet.purchase_no?.trim() ||
      sheet.place_of_supply?.trim() ||
      (sheet.lines || []).some((l) => (l.description && l.description.trim()) || Number(l.qty) > 0)
    )
  }, [isNew, createdId, sheet])

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (isDirty) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty])

  const handleBack = () => {
    if (isDirty) {
      if (!window.confirm('You have unsaved changes on this invoice. Are you sure you want to leave?')) {
        return
      }
    }
    navigate('/invoices')
  }

  // Robust print runner waiting for images and layout commit
  const prepareAndPrint = useCallback(async () => {
    const sheetEl = document.querySelector('.invoice-printable-sheet')
    if (sheetEl) {
      const images = Array.from(sheetEl.querySelectorAll('img'))
      await Promise.all(
        images.map((img) => {
          if (img.complete) {
            return img.decode ? img.decode().catch(() => {}) : Promise.resolve()
          }
          return new Promise((resolve) => {
            img.onload = () => (img.decode ? img.decode().catch(() => {}).then(resolve) : resolve())
            img.onerror = resolve
          })
        })
      )
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.print()
      })
    })
  }, [])

  // Auto-print support if URL has ?autoPrint=true
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    if (searchParams.get('autoPrint') === 'true') {
      const cleanUrl = window.location.pathname
      window.history.replaceState({}, document.title, cleanUrl)
      prepareAndPrint()
    }
  }, [prepareAndPrint])

  // Reset to original order and production data
  const handleReset = () => {
    if (window.confirm('Reset this invoice to original order and production data? Any custom edits will be reverted.')) {
      const targetOrderId = order?.id || currentInvoice?.order || id
      if (targetOrderId) {
        dispatch(resetOrderInvoice({ orderId: targetOrderId }))
      }
      const fresh = buildInitialData()
      setSheet(fresh)
      setSaveFeedback('✓ Reset to order data')
      setTimeout(() => setSaveFeedback(''), 2500)
    }
  }

  // Print invoice (saves unsaved new invoice first, then prints)
  const handlePrint = async () => {
    if (isNew && !createdId) {
      const savedId = handleSave(false)
      if (!savedId) return
    } else {
      handleSave(false)
    }
    await prepareAndPrint()
  }

  // Payment record submission
  const handleRecordPayment = (e) => {
    e.preventDefault()
    const amt = parseFloat(payAmount)
    if (isNaN(amt) || amt <= 0) {
      alert('Please enter a valid payment amount')
      return
    }

    const targetInvoiceId = createdId || currentInvoice?.id || id
    dispatch(
      addPaymentRecord({
        invoiceId: targetInvoiceId,
        payment: {
          id: Date.now(),
          amount: amt,
          payment_date: new Date().toISOString(),
          payment_method: payMode,
          reference: payRef || `PAY-${Date.now()}`,
          notes: 'Recorded from Invoice View Page',
        },
      })
    )

    if (amt >= computed.finalTotalAfterTax) {
      dispatch(
        setInvoiceStatus({
          id: targetInvoiceId,
          status: 'PAID',
        })
      )
    }

    setShowPayModal(false)
    setSaveFeedback('✓ Payment recorded')
    setTimeout(() => setSaveFeedback(''), 2500)
  }

  // Zoom transform helper
  const zoomStyle = useMemo(() => {
    if (zoomLevel === '100%') return {}
    if (zoomLevel === '90%') return { transform: 'scale(0.9)', transformOrigin: 'top center' }
    if (zoomLevel === '75%') return { transform: 'scale(0.75)', transformOrigin: 'top center' }
    if (zoomLevel === 'Fit') {
      const availableWidth = typeof window !== 'undefined' ? window.innerWidth - 300 : 800
      const scale = Math.min(1, Math.max(0.65, availableWidth / 820))
      return { transform: `scale(${scale})`, transformOrigin: 'top center' }
    }
    return {}
  }, [zoomLevel])

  return (
    <div className="inv-view-wrapper">
      {/* TOP TOOLBAR (Screen only - outside sheet) */}
      <div className="inv-view-topbar no-print">
        <div className="inv-view-topbar-left">
          <button
            type="button"
            className="inv-view-btn-back"
            onClick={handleBack}
          >
            ← Back to Invoices
          </button>

          <span className="inv-view-order-pill">
            Invoice: {sheet.invoice_no || currentInvoice?.number || '—'}
          </span>

          <span className={`inv-view-status-badge ${(currentInvoice?.status || (isNew ? 'PENDING' : 'ISSUED')).toLowerCase()}`}>
            ● {currentInvoice?.status || (isNew ? 'PENDING' : 'ISSUED')}
          </span>

          {/* Small Screen-Only Due Date field */}
          <div className="inv-toolbar-due-date">
            <label className="inv-toolbar-due-label">Due Date:</label>
            <input
              type="date"
              className="inv-toolbar-due-input"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              title="Screen only: sets invoice due date for Invoicing register"
            />
          </div>

          {saveFeedback && <span className="inv-view-save-feedback">{saveFeedback}</span>}
          {validationError && <span className="inv-view-error-feedback">⚠️ {validationError}</span>}
        </div>

        <div className="inv-view-topbar-right">
          {/* Small Zoom Controls */}
          <div className="inv-zoom-group">
            <span className="inv-zoom-label">Zoom:</span>
            {['75%', '90%', '100%', 'Fit'].map((lvl) => (
              <button
                key={lvl}
                type="button"
                className={`inv-zoom-btn ${zoomLevel === lvl ? 'active' : ''}`}
                onClick={() => setZoomLevel(lvl)}
              >
                {lvl}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="inv-view-btn-secondary inv-add-row-btn"
            onClick={handleAddLine}
            title="Add a manual item row"
          >
            + Add Line
          </button>

          {!isNew && (
            <button
              type="button"
              className="inv-view-btn-reset"
              onClick={handleReset}
              title="Reset all fields to original order/production data"
            >
              Reset
            </button>
          )}

          {!isNew && currentInvoice?.status !== 'PAID' && (
            <button
              type="button"
              className="inv-view-btn-pay"
              onClick={() => {
                setPayAmount(String(Math.round(computed.finalTotalAfterTax)))
                setShowPayModal(true)
              }}
            >
              Record Payment
            </button>
          )}

          <button
            type="button"
            className="inv-view-btn-save"
            onClick={() => handleSave(true)}
          >
            {isNew ? 'Save Invoice' : 'Save'}
          </button>

          <button
            type="button"
            className="inv-view-btn-print"
            onClick={handlePrint}
          >
            🖨️ Print
          </button>
        </div>
      </div>

      {/* WARNING BANNER IF ITEMS EXCEED 20 */}
      {isOverLimit && (
        <div className="inv-view-warning no-print">
          ⚠️ <strong>Single Page Limit Warning:</strong> This invoice contains {computed.processedLines.length} items. Invoices with more than 20 items may not fit on a single A4 page.
        </div>
      )}

      {/* SHEET CONTAINER (Centered white A4 sheet) */}
      <div className="inv-view-sheet-outer">
        <div className="inv-sheet-zoom-wrapper" style={zoomStyle}>
          {/* THE SINGLE MASTER INVOICE SHEET */}
          <InvoiceSheet
            sheet={sheet}
            computed={computed}
            allTableRows={allTableRows}
            densityClass={densityClass}
            onFieldChange={handleFieldChange}
            onNumericFieldChange={handleNumericFieldChange}
            onLineChange={handleLineChange}
            onGhostLineChange={handleGhostLineChange}
            onRemoveLine={handleRemoveLine}
          />
        </div>
      </div>

      {/* RECORD PAYMENT MODAL */}
      {showPayModal && (
        <div className="inv-modal-overlay no-print" onClick={() => setShowPayModal(false)}>
          <div className="inv-modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 className="inv-modal-title">Record Payment</h3>
            <div className="inv-modal-group">
              <label>Amount (₹)</label>
              <input
                type="number"
                step="0.01"
                className="inv-modal-input"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
              />
            </div>
            <div className="inv-modal-group">
              <label>Payment Method</label>
              <select
                className="inv-modal-input"
                value={payMode}
                onChange={(e) => setPayMode(e.target.value)}
              >
                <option value="BANK_TRANSFER">Bank Transfer (NEFT/RTGS/IMPS)</option>
                <option value="CHEQUE">Cheque</option>
                <option value="CASH">Cash</option>
                <option value="UPI">UPI</option>
              </select>
            </div>
            <div className="inv-modal-group">
              <label>Reference / Transaction No.</label>
              <input
                type="text"
                className="inv-modal-input"
                placeholder="e.g. UTR12345678"
                value={payRef}
                onChange={(e) => setPayRef(e.target.value)}
              />
            </div>
            <div className="inv-modal-actions">
              <button
                type="button"
                className="inv-view-btn-secondary"
                onClick={() => setShowPayModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inv-view-btn-save"
                onClick={handleRecordPayment}
              >
                Confirm Payment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
