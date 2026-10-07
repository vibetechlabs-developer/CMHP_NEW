import { useEffect, useMemo, useState } from 'react'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Input from '../../components/Input'
import StatusPill from '../../components/StatusPill'
import Modal from '../inventory/components/Modal'
import { getErrorMessage } from '../../utils/errors'
import { inventoryService } from '../inventory/inventoryService'
import { operationsService } from '../operations/operationsService'
import { invoiceService } from './invoiceService'
import './Invoice.css'

const STATUS_FILTERS = [
  'ALL',
  'DRAFT',
  'SENT',
  'PAID',
  'OVERDUE',
  'CANCELLED',
]

const listData = (response) =>
  Array.isArray(response.data)
    ? response.data
    : response.data?.results || []

const emptyLine = () => ({
  id: crypto.randomUUID
    ? crypto.randomUUID()
    : `line-${Date.now()}-${Math.random()}`,
  product: '',
  description: '',
  quantity: '1',
  rate: '0',
})

const emptyForm = {
  company: '',
  customer: '',
  order: '',
  batch: '',
  number: '',
  invoice_date: new Date().toISOString().slice(0, 10),
  due_date: '',
  tax_percent: '18',
  notes: '',
}

function statusTone(status) {
  if (status === 'PAID') return 'success'
  if (status === 'OVERDUE') return 'danger'
  if (status === 'CANCELLED') return 'neutral'
  if (status === 'SENT') return 'info'
  return 'neutral'
}

function money(value) {
  const n = Number(value) || 0

  return n.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function computeTotals(lines, taxPercent) {
  const subtotal = lines.reduce(
    (sum, line) =>
      sum +
      (Number(line.quantity) || 0) *
        (Number(line.rate) || 0),
    0
  )

  const taxAmount =
    subtotal *
    ((Number(taxPercent) || 0) / 100)

  return {
    subtotal,
    taxAmount,
    total: subtotal + taxAmount,
  }
}

export default function Invoice() {
  const [invoices, setInvoices] = useState([])
  const [companies, setCompanies] = useState([])
  const [customers, setCustomers] = useState([])
  const [orders, setOrders] = useState([])
  const [batches, setBatches] = useState([])
  const [products, setProducts] = useState([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')

  const [modal, setModal] = useState('')
  const [saving, setSaving] = useState(false)
  const [viewing, setViewing] = useState(null)

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
        batchRes,
        productRes,
      ] = await Promise.all([
        invoiceService.getInvoices(),
        inventoryService.getCompanies(),
        operationsService.getCustomers(),
        operationsService.getOrders(),
        operationsService.getBatches(),
        operationsService.getProducts(),
      ])

      setInvoices(listData(invRes))
      setCompanies(listData(companyRes))
      setCustomers(listData(customerRes))
      setOrders(listData(orderRes))
      setBatches(listData(batchRes))
      setProducts(listData(productRes))
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
        inv.customer_name
          ?.toLowerCase()
          .includes(term) ||
        inv.company_name
          ?.toLowerCase()
          .includes(term)

      return matchesStatus && matchesTerm
    })
  }, [invoices, search, statusFilter])

  const kpis = useMemo(() => {
    const totalInvoiced = invoices.reduce(
      (sum, i) =>
        sum + (Number(i.total) || 0),
      0
    )

    const paid = invoices
      .filter(
        (i) => i.status === 'PAID'
      )
      .reduce(
        (sum, i) =>
          sum + (Number(i.total) || 0),
        0
      )

    const outstanding = invoices
      .filter(
        (i) =>
          i.status !== 'PAID' &&
          i.status !== 'CANCELLED'
      )
      .reduce(
        (sum, i) =>
          sum + (Number(i.total) || 0),
        0
      )

    const overdueCount =
      invoices.filter(
        (i) => i.status === 'OVERDUE'
      ).length

    return {
      totalInvoiced,
      paid,
      outstanding,
      overdueCount,
    }
  }, [invoices])

  const openCreate = () => {
    setError('')
    setSuccess('')
    setForm(emptyForm)
    setLines([emptyLine()])
    setModal('create')
  }

  const openView = (invoice) => {
    setViewing(invoice)
    setModal('view')
  }

  const close = () => {
    if (!saving) {
      setModal('')
      setViewing(null)
    }
  }

  const setField = (field, value) =>
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }))

  const setLineField = (
    id,
    field,
    value
  ) =>
    setLines((prev) =>
      prev.map((line) =>
        line.id === id
          ? {
              ...line,
              [field]: value,
            }
          : line
      )
    )

  const addLine = () =>
    setLines((prev) => [
      ...prev,
      emptyLine(),
    ])

  const removeLine = (id) =>
    setLines((prev) =>
      prev.length > 1
        ? prev.filter(
            (line) => line.id !== id
          )
        : prev
    )

  const totals = computeTotals(
    lines,
    form.tax_percent
  )

  const companyOrders = orders.filter(
    (o) =>
      !form.company ||
      String(o.company) ===
        String(form.company)
  )

  const companyBatches = batches.filter(
    (b) =>
      !form.company ||
      String(b.company) ===
        String(form.company)
  )

  const submitInvoice = async (
    event
  ) => {
    event.preventDefault()

    setSaving(true)
    setError('')

    try {
      const payload = {
        ...form,

        order:
          form.order || null,

        batch:
          form.batch || null,

        tax_percent:
          Number(form.tax_percent) || 0,

        subtotal:
          totals.subtotal,

        tax_amount:
          totals.taxAmount,

        total:
          totals.total,

        lines: lines.map(
          (line) => ({
            product:
              line.product || null,

            description:
              line.description,

            quantity:
              Number(line.quantity) || 0,

            rate:
              Number(line.rate) || 0,

            amount:
              (Number(line.quantity) || 0) *
              (Number(line.rate) || 0),
          })
        ),
      }

      await invoiceService.createInvoice(
        payload
      )

      setSuccess(
        'Invoice created in demo data only (not saved to the server).'
      )

      setModal('')

      await load()
    } catch (err) {
      setError(
        getErrorMessage(err)
      )
    } finally {
      setSaving(false)
    }
  }

  const markPaid = async (
    invoice
  ) => {
    setSaving(true)
    setError('')

    try {
      await invoiceService.markPaid(
        invoice.id,
        {
          paid_on:
            new Date()
              .toISOString()
              .slice(0, 10),
        }
      )

      setSuccess(
        `Invoice ${invoice.number} marked as paid (demo data only, not saved to the server).`
      )

      setViewing((prev) =>
        prev
          ? {
              ...prev,
              status: 'PAID',
            }
          : prev
      )

      await load()
    } catch (err) {
      setError(
        getErrorMessage(err)
      )
    } finally {
      setSaving(false)
    }
  }

  const viewingCompany =
    companies.find(
      (c) =>
        String(c.id) ===
        String(viewing?.company)
    )

  return (
    <div className="inv">

      <div className="inv-header">

        <div>

          <h1>
            Invoicing
          </h1>

          <p>
            Company-wise customer invoices,
            generated after QA release.
          </p>

        </div>

      </div>


      {error && !modal && (
        <Alert type="error">
          {error}
        </Alert>
      )}

      {success && (
        <Alert type="success">
          {success}
        </Alert>
      )}


      <div className="inv-kpis">

        <div className="inv-kpi">

          <span className="inv-kpi-label">
            Total invoiced
          </span>

          <span className="inv-kpi-value">
            ₹{money(kpis.totalInvoiced)}
          </span>

        </div>


        <div className="inv-kpi">

          <span className="inv-kpi-label">
            Paid
          </span>

          <span className="inv-kpi-value">
            ₹{money(kpis.paid)}
          </span>

        </div>


        <div className="inv-kpi">

          <span className="inv-kpi-label">
            Outstanding
          </span>

          <span className="inv-kpi-value">
            ₹{money(kpis.outstanding)}
          </span>

        </div>


        <div className="inv-kpi">

          <span className="inv-kpi-label">
            Overdue invoices
          </span>

          <span className="inv-kpi-value">
            {kpis.overdueCount}
          </span>

        </div>

      </div>


      <div className="inv-panel">

        <div className="inv-toolbar">

          <h3>
            All invoices
          </h3>


          <div className="invoice-toolbar-controls">

            <input
              className="field-input invoice-search-input"
              placeholder="Search number, customer, company…"
              value={search}
              onChange={(e) =>
                setSearch(
                  e.target.value
                )
              }
            />


            <select
              className="field-input invoice-status-filter"
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(
                  e.target.value
                )
              }
            >

              {STATUS_FILTERS.map(
                (s) => (
                  <option
                    key={s}
                    value={s}
                  >
                    {s === 'ALL'
                      ? 'All statuses'
                      : s.charAt(0) +
                        s
                          .slice(1)
                          .toLowerCase()}
                  </option>
                )
              )}

            </select>


            <Button
              onClick={openCreate}
            >
              + Create invoice
            </Button>

          </div>

        </div>


        <div className="inv-table-scroll">

          <table className="inv-table">

            <thead>

              <tr>

                <th>
                  Invoice #
                </th>

                <th>
                  Company
                </th>

                <th>
                  Customer
                </th>

                <th>
                  Date
                </th>

                <th>
                  Due
                </th>

                <th>
                  Total
                </th>

                <th>
                  Status
                </th>

                <th>
                  Action
                </th>

              </tr>

            </thead>


            <tbody>

              {filteredInvoices.map(
                (inv) => (

                  <tr key={inv.id}>

                    <td className="cell-strong">
                      {inv.number}
                    </td>

                    <td>
                      {inv.company_name}
                    </td>

                    <td>
                      {inv.customer_name}
                    </td>

                    <td>
                      {inv.invoice_date}
                    </td>

                    <td>
                      {inv.due_date || '—'}
                    </td>

                    <td>
                      ₹{money(inv.total)}
                    </td>

                    <td>

                      <StatusPill
                        tone={statusTone(
                          inv.status
                        )}
                      >
                        {inv.status ||
                          'DRAFT'}
                      </StatusPill>

                    </td>

                    <td>

                      <Button
                        variant="secondary"
                        onClick={() =>
                          openView(inv)
                        }
                      >
                        View
                      </Button>

                    </td>

                  </tr>

                )
              )}

            </tbody>

          </table>


          {!loading &&
            filteredInvoices.length ===
              0 && (

              <p className="inv-empty">
                No invoices match this
                filter.
              </p>

            )}

        </div>

      </div>


      {modal === 'create' && (

        <Modal
          title="Create invoice"
          onClose={close}
          footer={
            <>
              <Button
                variant="secondary"
                onClick={close}
                disabled={saving}
              >
                Cancel
              </Button>

              <Button
                loading={saving}
                onClick={submitInvoice}
              >
                Save invoice
              </Button>
            </>
          }
        >

          {error && (
            <Alert type="error">
              {error}
            </Alert>
          )}


          <form
            onSubmit={submitInvoice}
          >

            <div className="inv-form-grid">

              <div className="field">

                <label className="field-label">
                  Company
                </label>

                <select
                  className="field-input"
                  value={form.company}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      company:
                        e.target.value,
                      order: '',
                      batch: '',
                    })
                  }
                  required
                >

                  <option value="">
                    Select company
                  </option>

                  {companies.map(
                    (c) => (
                      <option
                        key={c.id}
                        value={c.id}
                      >
                        {c.name}
                      </option>
                    )
                  )}

                </select>

              </div>


              <div className="field">

                <label className="field-label">
                  Customer
                </label>

                <select
                  className="field-input"
                  value={form.customer}
                  onChange={(e) =>
                    setField(
                      'customer',
                      e.target.value
                    )
                  }
                  required
                >

                  <option value="">
                    Select customer
                  </option>

                  {customers.map(
                    (c) => (
                      <option
                        key={c.id}
                        value={c.id}
                      >
                        {c.name}
                      </option>
                    )
                  )}

                </select>

              </div>


              <div className="field">

                <label className="field-label">
                  Linked order
                  (optional)
                </label>

                <select
                  className="field-input"
                  value={form.order}
                  onChange={(e) =>
                    setField(
                      'order',
                      e.target.value
                    )
                  }
                >

                  <option value="">
                    No order linked
                  </option>

                  {companyOrders.map(
                    (o) => (
                      <option
                        key={o.id}
                        value={o.id}
                      >
                        {o.number}
                      </option>
                    )
                  )}

                </select>

              </div>


              <div className="field">

                <label className="field-label">
                  Linked batch
                  (optional)
                </label>

                <select
                  className="field-input"
                  value={form.batch}
                  onChange={(e) =>
                    setField(
                      'batch',
                      e.target.value
                    )
                  }
                >

                  <option value="">
                    No batch linked
                  </option>

                  {companyBatches.map(
                    (b) => (
                      <option
                        key={b.id}
                        value={b.id}
                      >
                        {b.number} (
                        {b.qa_status ||
                          'QA pending'}
                        )
                      </option>
                    )
                  )}

                </select>

              </div>


              <Input
                label="Invoice number"
                value={form.number}
                onChange={(e) =>
                  setField(
                    'number',
                    e.target.value
                  )
                }
                required
              />


              <Input
                label="Invoice date"
                type="date"
                value={form.invoice_date}
                onChange={(e) =>
                  setField(
                    'invoice_date',
                    e.target.value
                  )
                }
                required
              />


              <Input
                label="Due date"
                type="date"
                value={form.due_date}
                onChange={(e) =>
                  setField(
                    'due_date',
                    e.target.value
                  )
                }
              />


              <Input
                label="Tax %"
                type="number"
                min="0"
                step="0.01"
                value={form.tax_percent}
                onChange={(e) =>
                  setField(
                    'tax_percent',
                    e.target.value
                  )
                }
              />

            </div>


            <h4 className="invoice-lines-title">
              Line items
            </h4>


            <div className="inv-table-scroll">

              <table className="inv-table">

                <thead>

                  <tr>

                    <th>
                      Product
                    </th>

                    <th>
                      Description
                    </th>

                    <th>
                      Qty
                    </th>

                    <th>
                      Rate
                    </th>

                    <th>
                      Amount
                    </th>

                    <th>
                    </th>

                  </tr>

                </thead>


                <tbody>

                  {lines.map(
                    (line) => (

                      <tr key={line.id}>

                        <td>

                          <select
                            className="field-input"
                            value={
                              line.product
                            }
                            onChange={(e) =>
                              setLineField(
                                line.id,
                                'product',
                                e.target.value
                              )
                            }
                          >

                            <option value="">
                              —
                            </option>

                            {products.map(
                              (p) => (
                                <option
                                  key={p.id}
                                  value={p.id}
                                >
                                  {p.code}
                                </option>
                              )
                            )}

                          </select>

                        </td>


                        <td>

                          <input
                            className="field-input"
                            value={
                              line.description
                            }
                            onChange={(e) =>
                              setLineField(
                                line.id,
                                'description',
                                e.target.value
                              )
                            }
                            placeholder="Description"
                          />

                        </td>


                        <td>

                          <input
                            className="field-input invoice-qty-input"
                            type="number"
                            min="0"
                            step="0.001"
                            value={
                              line.quantity
                            }
                            onChange={(e) =>
                              setLineField(
                                line.id,
                                'quantity',
                                e.target.value
                              )
                            }
                          />

                        </td>


                        <td>

                          <input
                            className="field-input invoice-qty-input"
                            type="number"
                            min="0"
                            step="0.01"
                            value={
                              line.rate
                            }
                            onChange={(e) =>
                              setLineField(
                                line.id,
                                'rate',
                                e.target.value
                              )
                            }
                          />

                        </td>


                        <td className="cell-strong">

                          ₹
                          {money(
                            (Number(
                              line.quantity
                            ) || 0) *
                              (Number(
                                line.rate
                              ) || 0)
                          )}

                        </td>


                        <td>

                          <button
                            type="button"
                            className="invoice-remove-line"
                            onClick={() =>
                              removeLine(
                                line.id
                              )
                            }
                            aria-label="Remove line"
                          >
                            ×
                          </button>

                        </td>

                      </tr>

                    )
                  )}

                </tbody>

              </table>

            </div>


            <Button
              type="button"
              variant="secondary"
              onClick={addLine}
            >
              + Add line
            </Button>


            <div
              className="field field-full"
              style={{
                marginTop: 16,
              }}
            >

              <label className="field-label">
                Notes
              </label>

              <textarea
                className="field-input"
                rows={2}
                value={form.notes}
                onChange={(e) =>
                  setField(
                    'notes',
                    e.target.value
                  )
                }
              />

            </div>


            <div className="invoice-totals">

              <div>

                <span>
                  Subtotal
                </span>

                <strong>
                  ₹{money(
                    totals.subtotal
                  )}
                </strong>

              </div>


              <div>

                <span>
                  Tax (
                  {form.tax_percent ||
                    0}
                  %)
                </span>

                <strong>
                  ₹{money(
                    totals.taxAmount
                  )}
                </strong>

              </div>


              <div className="invoice-grand-total">

                <span>
                  Total
                </span>

                <strong>
                  ₹{money(
                    totals.total
                  )}
                </strong>

              </div>

            </div>

          </form>

        </Modal>

      )}


      {modal === 'view' &&
        viewing && (

        <Modal
          title={`Invoice ${viewing.number}`}
          onClose={close}
          footer={
            <>
              <Button
                variant="secondary"
                onClick={close}
              >
                Close
              </Button>

              {viewing.status !==
                'PAID' &&
                viewing.status !==
                  'CANCELLED' && (

                <Button
                  loading={saving}
                  onClick={() =>
                    markPaid(
                      viewing
                    )
                  }
                >
                  Mark as paid
                </Button>

              )}

            </>
          }
        >

          <div className="invoice-doc">

            <div className="invoice-doc-header">

              <div>

                <h3>
                  {viewingCompany?.name ||
                    viewing.company_name}
                </h3>

                {viewingCompany?.gst_number && (
                  <p>
                    GSTIN:
                    {' '}
                    {viewingCompany.gst_number}
                  </p>
                )}

                {viewingCompany?.address && (
                  <p>
                    {viewingCompany.address}
                  </p>
                )}

              </div>


              <StatusPill
                tone={statusTone(
                  viewing.status
                )}
              >
                {viewing.status ||
                  'DRAFT'}
              </StatusPill>

            </div>


            <div className="invoice-doc-meta">

              <div>

                <span>
                  Bill to
                </span>

                <strong>
                  {viewing.customer_name}
                </strong>

              </div>


              <div>

                <span>
                  Invoice date
                </span>

                <strong>
                  {viewing.invoice_date}
                </strong>

              </div>


              <div>

                <span>
                  Due date
                </span>

                <strong>
                  {viewing.due_date ||
                    '—'}
                </strong>

              </div>

            </div>


            <table className="inv-table">

              <thead>

                <tr>

                  <th>
                    Description
                  </th>

                  <th>
                    Qty
                  </th>

                  <th>
                    Rate
                  </th>

                  <th>
                    Amount
                  </th>

                </tr>

              </thead>


              <tbody>

                {(viewing.lines ||
                  []).map(
                  (line, idx) => (

                    <tr key={idx}>

                      <td>
                        {line.description ||
                          line.product_name ||
                          '—'}
                      </td>

                      <td>
                        {line.quantity}
                      </td>

                      <td>
                        ₹
                        {money(
                          line.rate
                        )}
                      </td>

                      <td>
                        ₹
                        {money(
                          line.amount
                        )}
                      </td>

                    </tr>

                  )
                )}


                {(!viewing.lines ||
                  viewing.lines.length ===
                    0) && (

                  <tr>

                    <td
                      colSpan={4}
                      className="inv-empty"
                    >
                      No line items
                      returned.
                    </td>

                  </tr>

                )}

              </tbody>

            </table>


            <div className="invoice-totals">

              <div>

                <span>
                  Subtotal
                </span>

                <strong>
                  ₹
                  {money(
                    viewing.subtotal
                  )}
                </strong>

              </div>


              <div>

                <span>
                  Tax
                </span>

                <strong>
                  ₹
                  {money(
                    viewing.tax_amount
                  )}
                </strong>

              </div>


              <div className="invoice-grand-total">

                <span>
                  Total
                </span>

                <strong>
                  ₹
                  {money(
                    viewing.total
                  )}
                </strong>

              </div>

            </div>


            {viewing.notes && (

              <div className="invoice-doc-notes">

                <span>
                  Notes
                </span>

                <p>
                  {viewing.notes}
                </p>

              </div>

            )}

          </div>

        </Modal>

      )}

    </div>
  )
}