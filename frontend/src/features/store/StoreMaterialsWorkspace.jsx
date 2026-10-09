import { useEffect, useRef, useState } from 'react'
import { NavLink, Navigate, useLocation } from 'react-router-dom'

import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Spinner, { LoadingState } from '../../components/Spinner'
import useAuth from '../../hooks/useAuth'
import { getErrorMessage } from '../../utils/errors'
import MaterialRegisterPage from './MaterialRegisterPage'
import MaterialsTab from './MaterialsTab'
import ReceivingTab from './ReceivingTab'
import { getMyStores, listLocations, listRecordedReceiptBalances, listRecordedReceipts } from './storeService'

// /inventory/materials/<numeric id> and /inventory/receiving/<numeric id> -
// the only detail routes in this workspace today. Matched by hand (this
// component has no nested <Route>/<Outlet> of its own - see
// AppRoutes.jsx's single /inventory/* catch-all), same manual-pathname-
// matching style TABS already uses.
const MATERIAL_DETAIL_PATTERN = /^\/inventory\/materials\/(\d+)\/?$/
const RECEIVING_DETAIL_PATTERN = /^\/inventory\/receiving\/(\d+)\/?$/

const TABS = [
  { to: '/inventory/materials', label: 'Materials', key: 'materials' },
  { to: '/inventory/receiving', label: 'Receiving', key: 'receiving' },
  { to: '/inventory/locations', label: 'Locations', key: 'locations' },
  { to: '/inventory/receipts', label: 'Recorded Receipts', key: 'receipts' },
]

// One physical store, shared catalog. Store selection uses the real accessible-store
// list; nothing is hardcoded. Company workspace context is shown separately.
export default function StoreMaterialsWorkspace() {
  const { user } = useAuth()
  const location = useLocation()
  const [stores, setStores] = useState({ state: 'loading', list: [], error: '' })
  const [storeId, setStoreId] = useState(null)
  const requestRef = useRef(0)

  const load = () => {
    const requestId = ++requestRef.current
    setStores({ state: 'loading', list: [], error: '' })
    getMyStores()
      .then((list) => {
        if (requestRef.current !== requestId) return
        setStores({ state: 'ready', list, error: '' })
        setStoreId((current) => (list.some((s) => s.id === current) ? current : list.length === 1 ? list[0].id : null))
      })
      .catch((err) => {
        if (requestRef.current !== requestId) return
        setStores({ state: 'error', list: [], error: getErrorMessage(err) })
      })
  }

  // A different signed-in user gets a fresh store list and selection.
  useEffect(() => {
    setStoreId(null)
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.username])

  const active = TABS.find((tab) => location.pathname.startsWith(tab.to)) || TABS[0]
  if (!location.pathname.startsWith('/inventory/')) return <Navigate to="/inventory/materials" replace />
  const materialDetailMatch = location.pathname.match(MATERIAL_DETAIL_PATTERN)
  const receivingDetailMatch = location.pathname.match(RECEIVING_DETAIL_PATTERN)

  return (
    <section className="inv-page" aria-label="Store and materials">
      <header className="inv-header" style={{ minHeight: 0, padding: '18px 22px' }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Store &amp; Materials</h1>
        <p style={{ fontSize: 14, margin: '6px 0 0' }}>
          One physical store and one shared material catalog. Recorded receipts are kept per source company, and they are not stock balances.
        </p>
      </header>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', margin: '12px 0' }}>
        <label className="field-label" htmlFor="store-select" style={{ margin: 0 }}>Store</label>
        {stores.state === 'loading' && <Spinner size="sm" tone="muted" label="Loading your stores…" />}
        {stores.state === 'error' && (
          <>
            <Alert type="error">{stores.error}</Alert>
            <Button variant="secondary" onClick={load}>Retry</Button>
          </>
        )}
        {stores.state === 'ready' && stores.list.length === 0 && (
          <Alert type="error">No store is available to your account. Ask an administrator for store access.</Alert>
        )}
        {stores.state === 'ready' && stores.list.length === 1 && <span style={{ fontSize: 14 }}>{stores.list[0].name} ({stores.list[0].code})</span>}
        {stores.state === 'ready' && stores.list.length > 1 && (
          <select id="store-select" className="field-input" value={storeId ?? ''} onChange={(e) => setStoreId(e.target.value ? Number(e.target.value) : null)} style={{ minWidth: 260 }}>
            <option value="">Choose a store</option>
            {stores.list.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name} ({store.code})
              </option>
            ))}
          </select>
        )}
      </div>

      <nav className="inv-tabs" aria-label="Store and materials sections" style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {TABS.map((tab) => (
          <NavLink
            key={tab.key}
            to={tab.to}
            className={({ isActive }) => (isActive ? 'inv-tab active' : 'inv-tab')}
            style={{ padding: '8px 14px', borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: 'none' }}
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      {active.key === 'materials' && materialDetailMatch && (
        <MaterialRegisterPage
          materialId={Number(materialDetailMatch[1])}
          storeId={storeId}
          storesReady={stores.state === 'ready'}
        />
      )}
      {active.key === 'materials' && !materialDetailMatch && (
        <MaterialsTab canManage={user?.capabilities?.can_manage_material_catalog === true} />
      )}
      {active.key === 'receiving' && (
        <StoreScopedTab
          storeId={storeId}
          storesReady={stores.state === 'ready'}
          render={(id) => <ReceivingTab storeId={id} receiptId={receivingDetailMatch ? Number(receivingDetailMatch[1]) : null} />}
        />
      )}
      {active.key === 'locations' && <StoreScopedTab storeId={storeId} storesReady={stores.state === 'ready'} render={(id) => <LocationsTab storeId={id} />} />}
      {active.key === 'receipts' && <StoreScopedTab storeId={storeId} storesReady={stores.state === 'ready'} render={(id) => <ReceiptsTab storeId={id} />} />}
    </section>
  )
}

function StoreScopedTab({ storeId, storesReady, render }) {
  if (!storesReady) return <LoadingState label="Loading…" compact />
  if (!storeId) return <p className="field-muted">Choose a store to see its records.</p>
  return render(storeId)
}

// Locations of the selected store. Listing only: placing a material in a location is not recorded yet.
function LocationsTab({ storeId }) {
  const [state, setState] = useState({ loading: true, rows: [], error: '' })
  const requestRef = useRef(0)

  useEffect(() => {
    const requestId = ++requestRef.current
    setState({ loading: true, rows: [], error: '' })
    listLocations(storeId)
      .then((data) => {
        if (requestRef.current !== requestId) return
        setState({ loading: false, rows: data.results, error: '' })
      })
      .catch((err) => {
        if (requestRef.current !== requestId) return
        setState({ loading: false, rows: [], error: getErrorMessage(err) })
      })
  }, [storeId])

  return (
    <div className="inv-panel">
      <h3 style={{ margin: '0 0 6px' }}>Locations</h3>
      <p className="field-muted" style={{ margin: '0 0 10px' }}>
        Storage locations of the selected store. Material placement in a location is not recorded in this version.
      </p>
      {state.error && <Alert type="error">{state.error}</Alert>}
      {state.loading && <LoadingState label="Loading locations…" compact />}
      {!state.loading && !state.error && (
        <div className="inv-table-scroll">
          <table className="inv-table" style={{ fontSize: 14 }}>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Description</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {state.rows.map((row) => (
                <tr key={row.id}>
                  <td className="cell-strong">{row.code}</td>
                  <td>{row.name}</td>
                  <td>{row.description || '—'}</td>
                  <td>{row.is_active ? 'Active' : 'Inactive'}</td>
                </tr>
              ))}
              {state.rows.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', color: '#6b7f95' }}>No locations for this store.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// Recorded receipts only: never a stock balance. Grouped by material, unit and source company.
function ReceiptsTab({ storeId }) {
  const [state, setState] = useState({ loading: true, balances: [], movements: [], coverage: null, error: '' })
  const requestRef = useRef(0)

  useEffect(() => {
    const requestId = ++requestRef.current
    setState({ loading: true, balances: [], movements: [], coverage: null, error: '' })
    Promise.all([listRecordedReceiptBalances(storeId), listRecordedReceipts(storeId)])
      .then(([balances, movements]) => {
        if (requestRef.current !== requestId) return
        setState({ loading: false, balances: balances.results, movements: movements.results, coverage: movements.coverage || balances.coverage, error: '' })
      })
      .catch((err) => {
        if (requestRef.current !== requestId) return
        setState({ loading: false, balances: [], movements: [], coverage: null, error: getErrorMessage(err) })
      })
  }, [storeId])

  return (
    <div className="inv-panel">
      <h3 style={{ margin: '0 0 6px' }}>Recorded Receipts</h3>
      <p style={{ margin: "0 0 8px", padding: "8px 12px", borderRadius: 8, background: "#eaf5fc", color: "#163b59", fontSize: 14 }}>Recorded receipts only. Opening stock, issues, returns and QC release are not included.</p>
      {state.coverage && (
        <p className="field-muted" style={{ margin: '8px 0' }}>
          Release status: {state.coverage.release_status}. Historical receipts backfilled: {state.coverage.historical_receipts_backfilled ? 'yes' : 'no'}.
        </p>
      )}
      {state.error && <Alert type="error">{state.error}</Alert>}
      {state.loading && <LoadingState label="Loading recorded receipts…" compact />}

      {!state.loading && !state.error && (
        <>
          <h4 style={{ margin: '12px 0 6px', fontSize: 14 }}>Recorded receipt quantity, by material, unit and source company</h4>
          <div className="inv-table-scroll">
            <table className="inv-table" style={{ fontSize: 14 }}>
              <thead>
                <tr>
                  <th>Material</th>
                  <th>Unit</th>
                  <th>Source company</th>
                  <th style={{ textAlign: 'right' }}>Recorded receipt quantity</th>
                </tr>
              </thead>
              <tbody>
                {state.balances.map((row) => (
                  <tr key={`${row.material_id}-${row.unit_id}-${row.source_company_id}`}>
                    <td>{row.material_code} · {row.material_name}</td>
                    <td>{row.unit_code}</td>
                    <td>{row.source_company_code}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{row.recorded_receipt_quantity}</td>
                  </tr>
                ))}
                {state.balances.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', color: '#6b7f95' }}>No recorded receipts in this store.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <h4 style={{ margin: '16px 0 6px', fontSize: 14 }}>Receipt lines</h4>
          <div className="inv-table-scroll">
            <table className="inv-table" style={{ fontSize: 14 }}>
              <thead>
                <tr>
                  <th>Receipt</th>
                  <th>Date</th>
                  <th>Material</th>
                  <th>Unit</th>
                  <th style={{ textAlign: 'right' }}>Recorded receipt quantity</th>
                  <th>Source company (receiving context, not legal ownership)</th>
                </tr>
              </thead>
              <tbody>
                {state.movements.map((row) => (
                  <tr key={row.id}>
                    <td>{row.source_goods_receipt_reference || '—'}</td>
                    <td>{(row.posted_at || row.created_at || '').slice(0, 10) || '—'}</td>
                    <td>{row.material_code_snapshot} · {row.material_name_snapshot}</td>
                    <td>{row.unit_code_snapshot}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{row.quantity}</td>
                    <td>{row.source_company_code}</td>
                  </tr>
                ))}
                {state.movements.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', color: '#6b7f95' }}>No receipt lines to show.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
