import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import Alert from '../../components/Alert'
import Button from '../../components/Button'
import PageHero from '../../components/PageHero'
import { LoadingState } from '../../components/Spinner'
import { getErrorMessage } from '../../utils/errors'
import InwardStockModal from './InwardStockModal'
import IssueOutwardModal from './IssueOutwardModal'
import { listMaterialIssueMovements } from './materialIssueService'
import { getMaterial, getMaterialRegister, listMaterialSuppliers } from './storeService'
import './MaterialRegisterPage.css'

const PAGE_SIZE = 25
const KIND_LABEL = { RAW_MATERIAL: 'Raw material', PACKAGING_MATERIAL: 'Packaging' }

// Financial-year quick-select (April 1 -> March 31) - a pure UI
// convenience that only fills the SAME "From"/"To" date inputs the
// register already filters on; it is never sent to the server as its
// own concept and never changes what the server computes.
function financialYearOptions(count = 4) {
  const now = new Date()
  const currentStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1
  return Array.from({ length: count }, (_, i) => {
    const startYear = currentStartYear - i
    const endYear = startYear + 1
    return {
      label: `FY ${startYear}-${String(endYear).slice(-2)}`,
      from: `${startYear}-04-01`,
      to: `${endYear}-03-31`,
    }
  })
}

// Client-side export of exactly what is already loaded on screen - the
// CURRENT PAGE of movement rows, under the current filters - never a
// server-side report of unauthorized or unfiltered data. Includes the
// same coverage caveat shown on screen so a spreadsheet opened later
// still discloses "receipt-only, not complete physical stock" out of
// context.
function exportMovementsCsv(material, movements, coverage) {
  const headers = [
    'Posted', 'Arrived', 'Goods receipt', 'Invoice/Delivery ref', 'Supplier', 'Source company',
    'Quantity', 'Unit', 'Container', 'Unit price', 'Pricing unit', 'Currency', 'Release status',
  ]
  const rows = movements.map((row) => [
    (row.posted_at || '').slice(0, 10),
    (row.source_goods_receipt_arrived_at || '').slice(0, 10),
    row.source_goods_receipt_reference || '',
    row.source_invoice_reference || row.source_delivery_note_reference || '',
    row.supplier_code ? `${row.supplier_code} - ${row.supplier_name}` : '',
    row.source_company_code || '',
    row.quantity,
    row.unit_code_snapshot || '',
    row.container_type_code ? `${row.container_type_code}${row.container_quantity ? ` x ${row.container_quantity}` : ''}` : '',
    row.unit_price ?? '',
    row.pricing_unit_code || '',
    row.currency_code || '',
    row.release_status || '',
  ])
  const csvEscape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`
  const lines = [
    `Material: ${material.code} - ${material.name}`,
    coverage?.notice ? csvEscape(coverage.notice) : '',
    'Covers: current page only, under the filters applied when exported.',
    '',
    headers.map(csvEscape).join(','),
    ...rows.map((row) => row.map(csvEscape).join(',')),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${material.code}-register.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// Material details (shared catalog) load independently of any store - a
// material can be visible here while its register below is not
// authorized at all (separate permissions: shared_catalog.view vs a
// store's stock.view). The register itself only ever shows RECEIPT_IN
// movements recorded through this system - see the coverage notice in
// the summary card below. Nothing here writes anything; this is a
// read-only register, exactly like /inventory/receipts (STK-01).
export default function MaterialRegisterPage({ materialId, storeId, storesReady }) {
  const location = useLocation()
  const backTo = {
    pathname: '/inventory/materials',
    search: location.state?.returnSearch ? `?${location.state.returnSearch}` : '',
  }

  const [material, setMaterial] = useState({ state: 'loading', data: null, error: '' })
  const materialRequestRef = useRef(0)

  const loadMaterial = () => {
    const requestId = ++materialRequestRef.current
    setMaterial({ state: 'loading', data: null, error: '' })
    getMaterial(materialId)
      .then((data) => {
        if (materialRequestRef.current !== requestId) return
        setMaterial({ state: 'ready', data, error: '' })
      })
      .catch((err) => {
        if (materialRequestRef.current !== requestId) return
        const status = err?.response?.status
        setMaterial({
          state: status === 404 ? 'not-found' : 'error',
          data: null,
          error: status === 404 ? 'This material does not exist, or is not visible to your account.' : getErrorMessage(err),
        })
      })
  }

  useEffect(loadMaterial, [materialId])

  return (
    <div className="reg-page">
      <div className="reg-topline">
        <Link className="reg-back" to={backTo}>
          ← Back to Materials
        </Link>
      </div>

      {/* Reusing the same shared hero every page's PageHero already uses -
          explicitly required on the register by this task, superseding an
          earlier instruction to omit it here. */}
      <PageHero
        eyebrow="Material Inventory Register"
        title="Material Stock Register"
        subtitle="Track material receipts, stock movements and balances for the selected store and reporting period."
      />

      {material.state === 'loading' && <LoadingState label="Loading material…" compact />}
      {(material.state === 'error' || material.state === 'not-found') && (
        <Alert type="error">
          {material.error}{' '}
          {material.state === 'error' && (
            <button type="button" className="table-edit" onClick={loadMaterial}>
              Retry
            </button>
          )}
        </Alert>
      )}

      {material.state === 'ready' && (
        <RegisterSection material={material.data} materialId={materialId} storeId={storeId} storesReady={storesReady} />
      )}
    </div>
  )
}

function RegisterSection({ material, materialId, storeId, storesReady }) {
  if (!storesReady) return <LoadingState label="Loading your stores…" compact />
  if (!storeId) {
    return (
      <div className="reg-empty">
        <strong>Choose a store</strong>
        <span>Select a store above to see this material's register.</span>
      </div>
    )
  }
  return <Register material={material} materialId={materialId} storeId={storeId} />
}

function emptyRegisterState() {
  return {
    status: 'loading', // loading | ready | access-denied | not-found | error
    opening: [], periodReceived: [], closing: [], movements: [], count: 0, coverage: null, period: null, error: '',
    // Additive - real since the Issue Outward feature, see
    // materialIssueService.listMaterialIssueMovements.
    periodIssued: [], closingNetOfIssues: [], issueMovements: [], issueCount: 0,
  }
}

function Register({ material, materialId, storeId }) {
  const navigate = useNavigate()
  const [postedFrom, setPostedFrom] = useState('')
  const [postedTo, setPostedTo] = useState('')
  const [search, setSearch] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [applied, setApplied] = useState({ from: '', to: '', search: '', supplier: '' })
  const [page, setPage] = useState(1)
  const [issuePage, setIssuePage] = useState(1)
  const [state, setState] = useState(emptyRegisterState())
  const [suppliers, setSuppliers] = useState([])
  const [creatingReceipt, setCreatingReceipt] = useState(false)
  const [createdNotice, setCreatedNotice] = useState(null)
  const [issuingStock, setIssuingStock] = useState(false)
  const [issuedNotice, setIssuedNotice] = useState(null)
  const requestRef = useRef(0)
  const fyOptions = financialYearOptions()

  useEffect(() => {
    listMaterialSuppliers().then(setSuppliers).catch(() => setSuppliers([]))
  }, [])

  const load = () => {
    const requestId = ++requestRef.current
    setState({ ...emptyRegisterState(), status: 'loading' })
    Promise.all([
      getMaterialRegister(storeId, materialId, {
        postedFrom: applied.from, postedTo: applied.to, search: applied.search, supplier: applied.supplier,
        page, pageSize: PAGE_SIZE,
      }),
      // A separate endpoint/queryset from the register above (see
      // MaterialIssueMovement's own docstring for why) - its own
      // failure never blocks the Inward side from rendering.
      listMaterialIssueMovements(storeId, {
        material: materialId, postedFrom: applied.from, postedTo: applied.to, page: issuePage, pageSize: PAGE_SIZE,
      }).catch(() => ({ count: 0, results: [] })),
    ])
      .then(([register, issues]) => {
        if (requestRef.current !== requestId) return
        setState({
          status: 'ready',
          opening: register.opening,
          periodReceived: register.periodReceived,
          closing: register.closing,
          movements: register.movements,
          count: register.count,
          coverage: register.coverage,
          period: register.period,
          periodIssued: register.periodIssued || [],
          closingNetOfIssues: register.closingNetOfIssues || [],
          issueMovements: issues.results,
          issueCount: issues.count,
          error: '',
        })
      })
      .catch((err) => {
        if (requestRef.current !== requestId) return
        const status = err?.response?.status
        setState({
          ...emptyRegisterState(),
          status: status === 403 ? 'access-denied' : status === 404 ? 'not-found' : 'error',
          error: getErrorMessage(err),
        })
      })
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [materialId, storeId, applied, page, issuePage])

  const applyFilters = () => {
    setPage(1)
    setApplied({ from: postedFrom, to: postedTo, search, supplier: supplierId })
  }
  const clearFilters = () => {
    setPostedFrom('')
    setPostedTo('')
    setSearch('')
    setSupplierId('')
    setPage(1)
    setApplied({ from: '', to: '', search: '', supplier: '' })
  }
  const hasActiveFilters = Boolean(applied.from || applied.to || applied.search || applied.supplier)

  const totalPages = Math.max(1, Math.ceil(state.count / PAGE_SIZE))
  const periodLabel = state.period?.posted_from || state.period?.posted_to
    ? `${state.period.posted_from || 'the start'} → ${state.period.posted_to || 'now'}`
    : 'all recorded history'

  return (
    <>
      {/* B. Filter / action card */}
      {createdNotice && !createdNotice.posted && (
        <Alert type="success">
          Draft receipt <strong>{createdNotice.reference}</strong> saved. It will not appear in this register's
          Inward table until it is posted.{' '}
          <button type="button" className="table-edit" onClick={() => navigate(`/inventory/receiving/${createdNotice.id}`)}>
            Open draft to review and post →
          </button>
        </Alert>
      )}
      {createdNotice && createdNotice.posted && (
        <Alert type="success">Receipt <strong>{createdNotice.reference}</strong> posted. The register below now reflects this delivery.</Alert>
      )}
      {issuedNotice && (
        <Alert type="success">
          Issue <strong>{issuedNotice.reference}</strong> posted for {issuedNotice.issued_quantity} {issuedNotice.unit_code_snapshot}.
        </Alert>
      )}

      <div className="reg-compact-card">
        <div className="reg-filter-row">
          {/* Read-only identity chip, not a switcher - this register is
              intentionally scoped to one material by its URL (removed the
              earlier material-switcher dropdown since "whichever material's
              register you open is the one that shows"); this just mirrors
              the reference's layout slot with the material already in view,
              never a fabricated pack-size/bag ratio the backend doesn't
              track. */}
          <div className="reg-identity-chip" title={`${material.code} — ${material.name}`}>
            <span className="reg-identity-chip-code">{material.code}</span>
            <span className="reg-identity-chip-name">{material.name}</span>
            <span className="reg-identity-chip-sub">Base unit: {material.base_unit_code}</span>
          </div>
          <div className="reg-filter-field">
            <label htmlFor="reg-fy">Financial year</label>
            <select
              id="reg-fy"
              className="reg-fy-select"
              value=""
              onChange={(e) => {
                const fy = fyOptions.find((opt) => opt.label === e.target.value)
                if (fy) {
                  setPostedFrom(fy.from)
                  setPostedTo(fy.to)
                }
              }}
            >
              <option value="">Choose…</option>
              {fyOptions.map((opt) => (
                <option key={opt.label} value={opt.label}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="reg-filter-field">
            <label htmlFor="reg-posted-from">From</label>
            <input id="reg-posted-from" type="date" value={postedFrom} onChange={(e) => setPostedFrom(e.target.value)} />
          </div>
          <div className="reg-filter-field">
            <label htmlFor="reg-posted-to">To</label>
            <input id="reg-posted-to" type="date" value={postedTo} onChange={(e) => setPostedTo(e.target.value)} />
          </div>
          <div className="reg-filter-actions">
            <Button variant="secondary" onClick={applyFilters}>Apply</Button>
            {hasActiveFilters && <Button variant="secondary" onClick={clearFilters}>Clear</Button>}
          </div>
        </div>

        <div className="reg-filter-row">
          <div className="reg-filter-field reg-filter-field-grow">
            <label htmlFor="reg-search">Invoice / reference</label>
            <input
              id="reg-search"
              type="search"
              placeholder="Search invoice or delivery reference"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
            />
          </div>
          <div className="reg-filter-field">
            <label htmlFor="reg-supplier">Supplier</label>
            <select id="reg-supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">All suppliers</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="reg-filter-field" title="Not available: this register only records inward receipts - no batch or product is assigned to a receipt line.">
            <label htmlFor="reg-batch-product">Batch / Product</label>
            <input id="reg-batch-product" disabled placeholder="Not available" />
          </div>
        </div>

        <div className="reg-action-bar">
          <Button className="reg-btn-inward" onClick={() => setCreatingReceipt(true)}>+ Inward Stock</Button>
          <Button className="reg-btn-outward" variant="secondary" onClick={() => setIssuingStock(true)}>+ Issue Outward</Button>
          <Button variant="secondary" disabled title="Not available in this version: opening-stock import is a separate, unbuilt feature.">
            Opening Stock
          </Button>
          <Button variant="secondary" disabled title="Not available in this version: no dated physical-count feature exists yet.">
            Physical Audit
          </Button>
          <Button
            variant="secondary"
            disabled={state.status !== 'ready' || state.movements.length === 0}
            onClick={() => exportMovementsCsv(material, state.movements, state.coverage)}
            title="Exports the current page of rows under the current filters as CSV - not all filtered records, and not an XLSX export (none exists)."
          >
            Export CSV (this page)
          </Button>
          <Button variant="secondary" onClick={() => navigate('/inventory/materials?new=1')} title="Opens the same Add Material form used from the materials list - never a second master record type.">
            + Register Material
          </Button>
        </div>
      </div>

      {/* C. Material identity + stock summary card - one compact row:
          identity on the left, the yellow summary dock on the right, same
          side-by-side layout the reference uses instead of a full-width
          strip underneath. */}
      <div className="reg-summary-card">
        <div className="reg-summary-head">
          <div className="reg-item-info">
            <span className="reg-code-badge">{material.code}</span>
            <div className="reg-item-details">
              <h1 className="reg-material-name">{material.name}</h1>
              <div className="reg-summary-badges">
                <span className="reg-item-tag">{KIND_LABEL[material.kind] || material.kind}</span>
                <span className={`reg-item-tag ${material.is_active ? '' : 'reg-item-tag-muted'}`}>
                  {material.is_active ? 'Active' : 'Inactive'}
                </span>
                <span className="reg-item-tag">Base unit: {material.base_unit_code}</span>
                {material.default_container_type_code && (
                  <span className="reg-item-tag">Default container: {material.default_container_type_code}</span>
                )}
                {(applied.from || applied.to) && (
                  <span className="reg-item-tag reg-item-tag-accent">{applied.from || 'start'} → {applied.to || 'now'}</span>
                )}
              </div>
            </div>
          </div>

          {state.status === 'ready' && (
            <div className="reg-summary-dock">
              <SummaryStat label="Opening Book Stock" tone="neutral" rows={state.opening} valueField="recorded_receipt_quantity" sub={applied.from ? `before ${applied.from}` : 'no start date'} />
              <span className="reg-summary-divider" />
              <SummaryStat label="Received This Period" tone="green" rows={state.periodReceived} valueField="recorded_receipt_quantity" sub={periodLabel} />
              <span className="reg-summary-divider" />
              <SummaryStat label="Issued This Period" tone="orange" rows={state.periodIssued} valueField="recorded_issued_quantity" sub={periodLabel} />
              <span className="reg-summary-divider" />
              <SummaryStat
                label="Closing Book Stock" tone="brown" rows={state.closing} valueField="recorded_receipt_quantity"
                sub={applied.to ? `up to ${applied.to}` : 'up to now'} netRows={state.closingNetOfIssues}
              />
            </div>
          )}
        </div>

        {state.status === 'ready' && state.coverage && (
          <p className="reg-coverage-line" title={state.coverage.notice}>
            Receipt-only coverage · Release status: {state.coverage.release_status} · hover for details
          </p>
        )}

        {state.status === 'loading' && <LoadingState label="Loading register…" compact />}
        {state.status === 'access-denied' && (
          <Alert type="error">You do not have register access for this store. {state.error}</Alert>
        )}
        {state.status === 'not-found' && <Alert type="error">This store is not available. {state.error}</Alert>}
        {state.status === 'error' && (
          <Alert type="error">
            {state.error}{' '}
            <button type="button" className="table-edit" onClick={load}>
              Retry
            </button>
          </Alert>
        )}
      </div>

      {/* D. Side-by-side Inward / Outward */}
      {state.status === 'ready' && (
        <div className="reg-two-col">
          <InwardCard state={state} page={page} setPage={setPage} totalPages={totalPages} />
          <OutwardCard state={state} issuePage={issuePage} setIssuePage={setIssuePage} />
        </div>
      )}

      {creatingReceipt && (
        <InwardStockModal
          storeId={storeId}
          materialId={materialId}
          materialCode={material.code}
          materialName={material.name}
          materialBaseUnitCode={material.base_unit_code}
          onClose={() => setCreatingReceipt(false)}
          onCreated={(receipt) => {
            // Draft saved (or updated) - stays a draft, no stock effect
            // yet, so the modal stays open in case the user wants to
            // post it right away (its own Post Receipt button) or keep
            // editing lines first.
            setCreatedNotice({ id: receipt.id, reference: receipt.reference, posted: false })
          }}
          onPosted={(receipt) => {
            setCreatingReceipt(false)
            setCreatedNotice({ id: receipt.id, reference: receipt.reference, posted: true })
            load()
          }}
        />
      )}

      {issuingStock && (
        <IssueOutwardModal
          storeId={storeId}
          materialId={materialId}
          materialCode={material.code}
          materialName={material.name}
          onClose={() => setIssuingStock(false)}
          onIssued={() => {
            // Draft saved - stays a draft, modal stays open for Post Issue.
          }}
          onPosted={(issue) => {
            setIssuingStock(false)
            setIssuedNotice(issue)
            load()
          }}
        />
      )}
    </>
  )
}

function InwardCard({ state, page, setPage, totalPages }) {
  return (
    <div className="reg-side-card reg-inward-card">
      <div className="reg-side-card-header">
        <span className="reg-side-card-title">INWARD — Receipts</span>
        <span className="reg-side-card-count">{state.count} entr{state.count === 1 ? 'y' : 'ies'}</span>
      </div>

      <div className="reg-table-wrap">
        <table className="reg-table reg-table-compact">
          <thead>
            <tr>
              <th>Date</th>
              <th>Invoice / reference</th>
              <th>Supplier</th>
              <th style={{ textAlign: 'right' }}>Received qty</th>
              <th>Containers</th>
              <th style={{ textAlign: 'right' }}>Price</th>
            </tr>
          </thead>
          <tbody>
            {state.movements.length === 0 && (
              <tr>
                <td colSpan={6} className="reg-empty-pane">No recorded receipts found for this selection.</td>
              </tr>
            )}
            {state.movements.map((row) => (
              <tr key={row.id}>
                <td className="reg-nowrap">{(row.posted_at || '').slice(0, 10) || '—'}</td>
                <td>
                  {row.source_invoice_reference || row.source_delivery_note_reference || '—'}
                  <span className="reg-muted-cell"> · {row.source_goods_receipt_reference || '—'}</span>
                </td>
                <td>
                  {row.supplier_code ? `${row.supplier_code} · ${row.supplier_name}` : '—'}
                  <span className="reg-muted-cell"> · {row.source_company_code}</span>
                </td>
                <td className="num">{row.quantity} {row.unit_code_snapshot}</td>
                <td>{row.container_type_code ? `${row.container_type_code}${row.container_quantity ? ` × ${row.container_quantity}` : ''}` : '—'}</td>
                <td className="num">
                  {row.unit_price != null
                    ? `${row.currency_code || ''} ${row.unit_price}/${row.pricing_unit_code || row.unit_code_snapshot}`
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="reg-footer-totals">
        {state.periodReceived.length === 0 && <span className="reg-hint">No period total for this selection.</span>}
        {state.periodReceived.map((row) => (
          <span className="reg-footer-total-chip" key={`${row.unit_id}-${row.source_company_id}`}>
            Period total: <strong>{row.recorded_receipt_quantity} {row.unit_code}</strong> ({row.source_company_code})
          </span>
        ))}
      </div>
      {state.count > PAGE_SIZE && (
        <div className="reg-pagination">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="reg-page-count">Page {page} of {totalPages}</span>
          <Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  )
}

function OutwardCard({ state, issuePage, setIssuePage }) {
  const totalIssuePages = Math.max(1, Math.ceil(state.issueCount / PAGE_SIZE))
  return (
    <div className="reg-side-card reg-outward-card">
      <div className="reg-side-card-header">
        <span className="reg-side-card-title">OUTWARD — Issue to Production</span>
        <span className="reg-side-card-count">{state.issueCount} entr{state.issueCount === 1 ? 'y' : 'ies'}</span>
      </div>

      <div className="reg-table-wrap">
        <table className="reg-table reg-table-compact">
          <thead>
            <tr>
              <th>Date</th>
              <th>Company</th>
              <th>Batch No.</th>
              <th>Product</th>
              <th style={{ textAlign: 'right' }}>Issued qty</th>
              <th>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {state.issueMovements.length === 0 && (
              <tr>
                <td colSpan={6} className="reg-empty-pane">No posted issues found for this selection.</td>
              </tr>
            )}
            {state.issueMovements.map((row) => (
              <tr key={row.id}>
                <td className="reg-nowrap">{(row.posted_at || '').slice(0, 10) || '—'}</td>
                <td>{row.source_company_code}</td>
                <td>{row.batch_reference || '—'}</td>
                <td>{row.product_reference || '—'}</td>
                <td className="num">{row.quantity} {row.unit_code_snapshot}</td>
                <td className="reg-muted-cell">{row.remarks || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="reg-footer-totals">
        {state.periodIssued.length === 0 && <span className="reg-hint">No period total for this selection.</span>}
        {state.periodIssued.map((row) => (
          <span className="reg-footer-total-chip" key={`${row.unit_id}-${row.source_company_id}`}>
            Period total: <strong>{row.recorded_issued_quantity} {row.unit_code}</strong> ({row.source_company_code})
          </span>
        ))}
      </div>
      {state.issueCount > PAGE_SIZE && (
        <div className="reg-pagination">
          <Button variant="secondary" disabled={issuePage <= 1} onClick={() => setIssuePage((p) => p - 1)}>Previous</Button>
          <span className="reg-page-count">Page {issuePage} of {totalIssuePages}</span>
          <Button variant="secondary" disabled={issuePage >= totalIssuePages} onClick={() => setIssuePage((p) => p + 1)}>Next</Button>
        </div>
      )}

      <p className="reg-hint" style={{ margin: '6px 16px 0' }}>
        Returns, defects and disposals are not recorded in this version - only material issued to production.
      </p>
    </div>
  )
}

// One stat cell in the compact yellow summary dock - rows are grouped by
// (unit, source company), the same grouping compute_stock_balances
// already uses, so a material with receipts in more than one unit or
// from more than one company shows one line per combination instead of
// a single misleading summed number.
function SummaryStat({ label, tone, rows, valueField, sub, unavailable, reason, netRows }) {
  if (unavailable) {
    return (
      <div className="reg-summary-stat">
        <span className="lbl">{label}</span>
        <span className="val muted">Unavailable</span>
        {reason && <span className="sub">{reason}</span>}
      </div>
    )
  }
  const displayRows = netRows && netRows.length > 0 ? netRows : rows
  const displayField = netRows && netRows.length > 0 ? 'net_quantity' : valueField
  const displayTone = netRows && netRows.length > 0 ? 'green' : tone

  return (
    <div className="reg-summary-stat">
      <span className="lbl">{label}</span>
      {(!displayRows || displayRows.length === 0) && <span className="val muted">—</span>}
      {displayRows && displayRows.length > 0 && (
        <div className="reg-summary-lines">
          {displayRows.map((row) => (
            <div className="reg-summary-line" key={`${row.unit_id}-${row.source_company_id}`}>
              <span className={`val tone-${displayTone}`}>{row[displayField]}</span>
              <span className="unit">{row.unit_code}</span>
              <span className="sub">{row.source_company_code}</span>
            </div>
          ))}
        </div>
      )}
      {sub && <span className="sub">{sub}</span>}
      {netRows && netRows.length > 0 && rows && rows.length > 0 && (
        <span className="sub" title="Recorded receipts minus recorded issues">
          Net stock after issues (from {rows.map((r) => `${r[valueField]} ${r.unit_code}`).join(', ')} received)
        </span>
      )}
    </div>
  )
}
