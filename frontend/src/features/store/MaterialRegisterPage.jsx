import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

import Alert from '../../components/Alert'
import Button from '../../components/Button'
import { LoadingState } from '../../components/Spinner'
import { CalendarIcon, ClipboardIcon, InventoryIcon, ReceiptIcon } from '../../components/icons'
import { getErrorMessage } from '../../utils/errors'
import { getMaterial, listRecordedReceiptBalances, listRecordedReceipts } from './storeService'
import './MaterialRegisterPage.css'

const PAGE_SIZE = 25
const KIND_LABEL = { RAW_MATERIAL: 'Raw material', PACKAGING_MATERIAL: 'Packaging' }

// Material details (shared catalog) load independently of any store - a
// material can be visible here while its register below is not
// authorized at all (separate permissions: shared_catalog.view vs a
// store's stock.view). The register itself only ever shows RECEIPT_IN
// movements recorded through this system - see the coverage notice
// rendered with every total below. Nothing here writes anything; this
// is a read-only register, exactly like /inventory/receipts (STK-01).
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
      <Link className="reg-back" to={backTo}>
        ← Back to materials
      </Link>

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
        <>
          <MaterialHeader material={material.data} storeId={storeId} storesReady={storesReady} />
          <RegisterSection materialId={materialId} storeId={storeId} storesReady={storesReady} />
        </>
      )}
    </div>
  )
}

function MaterialHeader({ material, storeId, storesReady }) {
  return (
    <header className="reg-header-card">
      <div className="reg-header-icon">
        <InventoryIcon size={24} />
      </div>
      <div className="reg-header-main">
        <span className="reg-header-code">{material.code}</span>
        <h1 className="reg-header-name">{material.name}</h1>
      </div>
      <div className="reg-header-meta">
        <span className={`reg-badge ${material.kind === 'RAW_MATERIAL' ? 'accent' : 'muted'}`}>
          {KIND_LABEL[material.kind] || material.kind}
        </span>
        <span className={`reg-badge ${material.is_active ? 'ok' : 'muted'}`}>
          <span className="dot" />
          {material.is_active ? 'Active' : 'Inactive'}
        </span>
        <div className="reg-meta-item">
          <span className="reg-meta-label">Base unit</span>
          <span className="reg-meta-value">{material.base_unit_code}</span>
        </div>
        <div className="reg-meta-item">
          <span className="reg-meta-label">Store</span>
          <span className="reg-meta-value">
            {!storesReady ? 'Loading…' : storeId ? 'Selected above' : 'None selected'}
          </span>
        </div>
      </div>
    </header>
  )
}

function RegisterSection({ materialId, storeId, storesReady }) {
  if (!storesReady) return <LoadingState label="Loading your stores…" compact />
  if (!storeId) {
    return (
      <div className="reg-empty">
        <strong>Choose a store</strong>
        <span>Select a store above to see this material's register.</span>
      </div>
    )
  }
  return <Register materialId={materialId} storeId={storeId} />
}

function emptyRegisterState() {
  return {
    status: 'loading', // loading | ready | access-denied | not-found | error
    balances: [], allHistoryBalances: null, movements: [], count: 0, coverage: null, period: null, error: '',
  }
}

// Inward register + movement history for ONE material at ONE store.
// Server-side pagination, server-side date filtering, server-computed
// aggregation (never a client-side sum of only the loaded page).
function Register({ materialId, storeId }) {
  const [postedFrom, setPostedFrom] = useState('')
  const [postedTo, setPostedTo] = useState('')
  const [appliedFrom, setAppliedFrom] = useState('')
  const [appliedTo, setAppliedTo] = useState('')
  const [page, setPage] = useState(1)
  const [state, setState] = useState(emptyRegisterState())
  const requestRef = useRef(0)

  const load = () => {
    const requestId = ++requestRef.current
    setState({ ...emptyRegisterState(), status: 'loading' })
    const filtered = Boolean(appliedFrom || appliedTo)
    Promise.all([
      listRecordedReceiptBalances(storeId, { material: materialId, postedFrom: appliedFrom, postedTo: appliedTo }),
      listRecordedReceipts(storeId, { material: materialId, postedFrom: appliedFrom, postedTo: appliedTo, page, pageSize: PAGE_SIZE }),
      // A period filter needs a second, unfiltered call so the screen can
      // show the all-history total alongside the period total - never
      // just one number that silently means two different things.
      filtered ? listRecordedReceiptBalances(storeId, { material: materialId }) : Promise.resolve(null),
    ])
      .then(([balances, movements, allHistory]) => {
        if (requestRef.current !== requestId) return
        setState({
          status: 'ready',
          balances: balances.results,
          // Kept as the SAME grouped (unit, source company) rows as the
          // period table above - never collapsed into one cross-unit sum
          // (two rows in different units are never combined into a single
          // number anywhere on this screen).
          allHistoryBalances: allHistory ? allHistory.results : null,
          movements: movements.results,
          count: movements.count,
          coverage: movements.coverage || balances.coverage,
          period: movements.period,
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
  useEffect(load, [materialId, storeId, appliedFrom, appliedTo, page])

  const applyDateFilter = () => {
    setPage(1)
    setAppliedFrom(postedFrom)
    setAppliedTo(postedTo)
  }
  const clearDateFilter = () => {
    setPostedFrom('')
    setPostedTo('')
    setPage(1)
    setAppliedFrom('')
    setAppliedTo('')
  }

  const totalPages = Math.max(1, Math.ceil(state.count / PAGE_SIZE))
  const periodLabel = state.period?.posted_from || state.period?.posted_to
    ? `${state.period.posted_from || 'the start'} → ${state.period.posted_to || 'now'}`
    : 'all recorded history'

  return (
    <div className="reg-card">
      <div className="reg-card-title">
        <CalendarIcon size={18} />
        Inward register
      </div>

      <div className="reg-filter-bar">
        <div className="reg-filter-field">
          <label htmlFor="reg-posted-from">Posted from</label>
          <input id="reg-posted-from" type="date" value={postedFrom} onChange={(e) => setPostedFrom(e.target.value)} />
        </div>
        <div className="reg-filter-field">
          <label htmlFor="reg-posted-to">Posted to</label>
          <input id="reg-posted-to" type="date" value={postedTo} onChange={(e) => setPostedTo(e.target.value)} />
        </div>
        <div className="reg-filter-actions">
          <Button variant="secondary" onClick={applyDateFilter}>Apply</Button>
          {(appliedFrom || appliedTo) && <Button variant="secondary" onClick={clearDateFilter}>Clear</Button>}
        </div>
      </div>
      <p className="reg-hint">
        "Posted" is when the receipt was posted into this system, not necessarily the day the material physically
        arrived (shown separately below as "Arrived"). The filter is inclusive of both dates entered.
      </p>

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

      {state.status === 'ready' && (
        <>
          <div className="reg-notice info">
            <ClipboardIcon size={16} />
            <span>This includes recorded receipts only. Opening stock, issues, returns, adjustments and quality release may not be included.</span>
          </div>
          {state.coverage && (
            <p className="reg-notice coverage">
              Release status: <strong>{state.coverage.release_status}</strong> · Historical receipts backfilled:{' '}
              <strong>{state.coverage.historical_receipts_backfilled ? 'yes' : 'no'}</strong> · Opening stock included:{' '}
              <strong>{state.coverage.opening_stock_included ? 'yes' : 'no'}</strong>
            </p>
          )}

          <div>
            <div className="reg-section-head">
              <span className="reg-section-title">Recorded receipt quantity</span>
              <span className="reg-section-sub">{periodLabel}</span>
            </div>
            {state.balances.length === 0 && (
              <div className="reg-empty" style={{ marginTop: 10 }}>
                <strong>No recorded receipts</strong>
                <span>No recorded receipts found for this selection.</span>
              </div>
            )}
            {state.balances.length > 0 && (
              <div className="reg-table-wrap" style={{ marginTop: 10 }}>
                <table className="reg-table">
                  <thead>
                    <tr>
                      <th>Unit</th>
                      <th>Source company</th>
                      <th style={{ textAlign: 'right' }}>Recorded receipt quantity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.balances.map((row) => (
                      <tr key={`${row.unit_id}-${row.source_company_id}`}>
                        <td>{row.unit_code}</td>
                        <td>{row.source_company_code}</td>
                        <td className="num">{row.recorded_receipt_quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {state.allHistoryBalances !== null && (
            <div>
              <div className="reg-section-head">
                <span className="reg-section-title">All-time, for comparison</span>
                <span className="reg-section-sub">no date filter</span>
              </div>
              <div className="reg-table-wrap" style={{ marginTop: 10 }}>
                <table className="reg-table reg-table-compact">
                  <thead>
                    <tr>
                      <th>Unit</th>
                      <th>Source company</th>
                      <th style={{ textAlign: 'right' }}>Recorded receipt quantity (all history)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.allHistoryBalances.map((row) => (
                      <tr key={`all-${row.unit_id}-${row.source_company_id}`}>
                        <td>{row.unit_code}</td>
                        <td>{row.source_company_code}</td>
                        <td className="num">{row.recorded_receipt_quantity}</td>
                      </tr>
                    ))}
                    {state.allHistoryBalances.length === 0 && (
                      <tr>
                        <td colSpan={3} className="reg-muted-cell" style={{ textAlign: 'center' }}>No recorded receipts found for this selection.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div>
            <div className="reg-section-head">
              <span className="reg-card-title" style={{ fontSize: 13.5 }}>
                <ReceiptIcon size={16} />
                Movement history
              </span>
            </div>
            {state.movements.length === 0 && (
              <div className="reg-empty" style={{ marginTop: 10 }}>
                <strong>No movements</strong>
                <span>No recorded receipts found for this selection.</span>
              </div>
            )}
            {state.movements.length > 0 && (
              <>
                <div className="reg-table-wrap" style={{ marginTop: 10 }}>
                  <table className="reg-table">
                    <thead>
                      <tr>
                        <th>Posted</th>
                        <th>Arrived</th>
                        <th>Goods receipt</th>
                        <th>Supplier</th>
                        <th>Source company</th>
                        <th style={{ textAlign: 'right' }}>Quantity</th>
                        <th>Unit</th>
                        <th>Release</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.movements.map((row) => (
                        <tr key={row.id}>
                          <td>{(row.posted_at || '').slice(0, 10) || '—'}</td>
                          <td className="reg-muted-cell">{(row.source_goods_receipt_arrived_at || '').slice(0, 10) || '—'}</td>
                          <td>{row.source_goods_receipt_reference || '—'}</td>
                          <td>{row.supplier_code ? `${row.supplier_code} · ${row.supplier_name}` : '—'}</td>
                          <td>{row.source_company_code}</td>
                          <td className="num">{row.quantity}</td>
                          <td>{row.unit_code_snapshot}</td>
                          <td><span className="reg-badge muted">{row.release_status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {state.count > PAGE_SIZE && (
                  <div className="reg-pagination">
                    <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                      Previous
                    </Button>
                    <span className="reg-page-count">Page {page} of {totalPages}</span>
                    <Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                      Next
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>

          <p className="reg-footnote">
            Material issues and returns are not recorded in this version.
          </p>
        </>
      )}
    </div>
  )
}
